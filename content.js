const SETTINGS_KEY = 'autoFixEnabled';

async function isAutoFixEnabled() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ autoFixEnabled: false }, ({ autoFixEnabled }) => {
      resolve(autoFixEnabled);
    });
  });
}


console.log("Content script loadeadadadd.");

// Optional tiny helpers
function isSvgSrc(src){ return /^data:image\/svg\+xml[,;]/i.test(src) || /\.svg(\?|#|$)/i.test(src); }
function filenameAlt(src){
  try{
    if(/^data:/i.test(src)) return 'SVG graphic';
    const u = new URL(src);
    let name = decodeURIComponent(u.pathname.split('/').pop() || '');
    name = name.replace(/\.svg$/i,'').replace(/[_\-.+]+/g,' ').replace(/[^a-zA-Z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
    return name ? name[0].toUpperCase()+name.slice(1) : 'SVG graphic';
  }catch{ return 'SVG graphic'; }
}
function withTimeout(promise, ms, err='timeout'){ 
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(err), ms);
  return promise.finally(()=>clearTimeout(t)), {signal: ctrl.signal};
}

function promisify(type, data = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type, ...data },
      (resp) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (!resp || !resp.ok) {
          return reject(new Error(resp?.error || `${type} failed`));
        }
        resolve(resp);
      }
    );
  });
}

async function runPromisify(title, payload = {}) {
  try {
    const result = await promisify(title, payload);
    return { data: result.data, ok: result.ok };
  } catch (err) {
    console.error(`${title} error:`, err);
    throw err;
  }
}

let __autoFixInitRan = false;

async function initAutoFix() {
  if (__autoFixInitRan) return;       // prevent double-run
  __autoFixInitRan = true;

  try {
    const enabled = await isAutoFixEnabled();
    if (!enabled) return;
    console.log('cek stat', enabled);

    // optional: give the page a microtask/tick to settle
    await new Promise((r) => setTimeout(r, 0));
    console.log('timeout?', enabled);
    await runManualFixes(); // make runManualFixes async if it isn't
  } catch (err) {
    console.error('initAutoFix error:', err);
  }
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initAutoFix();
} else {
  document.addEventListener('DOMContentLoaded', () => {
    initAutoFix();
  }, { once: true }); // also prevents repeat
}

function runManualFixes() {
  let successfulRuns = {
    "runGeneralFixes": false,
    "generateAltImages": false,
    "savePageFixes": false,
    "pa11yResult": false,
    "GENERATE_A11Y_CSS": false,
  };

  // use IIFE async biar bisa pake await
  (async () => {
    try {
      // 1. URL validation
      const url = window.location.href;
      const disallowed = /^(chrome|edge|about|chrome-extension|file):\/\//i;

      if (disallowed.test(url)) {
        console.error('❌ This page type cannot be scanned. Open a normal http(s) page.');
        return; 
      } else {
        console.log('🔍 Scanning URL:', url);
      }

      // 2. JALANIN GENERAL FIXES
      const data = await runGeneralFixes();
      const applied = data?.applied;
      
      if (data && data.ok) {
        successfulRuns.runGeneralFixes = true;
        successfulRuns.generateAltImages = true;
      }

      // 3. SIMPEN FIXES KE SERVER
      if (applied && applied.length > 0) {
        try {
          const resp = await savePageFixes(applied, { source: 'auto', count: applied.length });
          successfulRuns.savePageFixes = resp.ok;
        } catch (e) {
          console.warn('⚠️ auto savePageFixes failed:', e);
        }
      }

      // 4. JALANIN PA11Y
      const pa11yResult = await runPromisify('RUN_PA11Y', { url: url });
      const pa11yReport = pa11yResult.data;
      
      successfulRuns.pa11yResult = pa11yResult.ok;

      if (!pa11yResult.ok) {
        throw new Error(`Server Pa11y Error: ${JSON.stringify(pa11yReport)}`);
      }

      console.log('✅ Pa11y Report Received:', pa11yReport);

      // 5. GENERATE & INJECT CSS (Wrapped in Promise)
      // bungkus sendMessage biar bisa pake await n log terakhir jadi akurat
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'GENERATE_A11Y_CSS',
          report: pa11yReport
        }, (response) => {
          // Cek error runtime chrome
          if (chrome.runtime.lastError) {
             console.warn("CSS Gen Error:", chrome.runtime.lastError);
             successfulRuns.GENERATE_A11Y_CSS = false;
          } else {
             successfulRuns.GENERATE_A11Y_CSS = response && response.ok;
          }
          resolve(); // Lanjut setelah response diterima
        });
      });

    } catch (e) {
      console.error('❌ runManualFixes failed:', e);
    } finally {
      // 6. LOGGING HASIL AKHIR dah pasti dieksekusi terakhir
      console.table(successfulRuns); // console.table biar rapi
    }
  })();

  return true;
}

// --- DYSLEXIA FONT MODULE ---

function toggleDyslexiaFont(enable) {
  const STYLE_ID = 'a11y-dyslexia-style';
  let styleTag = document.getElementById(STYLE_ID);

  if (enable) {
    if (!styleTag) {
      // 1. Dapatkan URL font internal ekstensi
      const fontUrl = chrome.runtime.getURL('fonts/OpenDyslexic-Regular.woff2');
      
      // 2. Buat aturan CSS yang memaksa font
      const css = `
        @font-face {
          font-family: 'OpenDyslexic';
          src: url('${fontUrl}') format('woff2'); /* Sesuaikan format jika pakai .otf */
          font-weight: normal;
          font-style: normal;
        }

        /* Targetkan SEMUA elemen dengan !important */
        :not(.fa):not([class*="icon"]):not(i) {
          font-family: 'OpenDyslexic', sans-serif !important;
          line-height: 1.5 !important;
          letter-spacing: 0.05em !important;
        }
      `;

      styleTag = document.createElement('style');
      styleTag.id = STYLE_ID;
      styleTag.textContent = css;
      document.head.appendChild(styleTag);
    }
  } else {
    // Jika dimatikan, hapus tag style
    if (styleTag) styleTag.remove();
  }
}

// Listener untuk menerima perintah dari Popup/Background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'TOGGLE_DYSLEXIA_FONT') {
    toggleDyslexiaFont(request.enabled);
    sendResponse({ ok: true });
  }
});

// Pengecekan awal saat load (opsional, jika Anda menyimpan state-nya)
chrome.storage.sync.get({ dyslexiaFontEnabled: false }, (data) => {
  if (data.dyslexiaFontEnabled) toggleDyslexiaFont(true);
});

// NOTES: keknya kudu di-optimasi; beda2 metode soalnya
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GET_HTML") {
    // SYNC branch: respond immediately, do NOT return true
    try {
      const currentHtml = document.documentElement.outerHTML;
      sendResponse({ ok: true, html: currentHtml });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
    return; // no async response -> don't return true
  }

  if (request.type === "GENERATE_ALT_TEXT") {
    // NOTES: ASYNC branch: use return true biar gak langsung nutup
    (async () => {
      try {
        const applied = await generateAltForImages(); // return [{src, alt}, ...]
        sendResponse({ ok: true, appliedCount: applied?.length || 0 });
        if (applied?.length) {
          try { await savePageFixes(applied, { source: 'manual', count: applied.length }); }
          catch (e) { console.warn('manual savePageFixes failed (post-reply):', e); }
        }
      } catch (e) {
        console.error('generateAltForImages failed:', e);
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  sendResponse({ ok: false, error: 'Unknown request.type' });
});

// NOTES: ini klo terima request dari popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GENERATE_A11Y_CSS') {
    const pa11yReport = request.report;
    chrome.runtime.sendMessage({
      type: 'GENERATE_A11Y_CSS',
      report: pa11yReport
    }, (response) => {
      console.log(response);
    });
  }
});

async function runGeneralFixes() {
  // === general fixes ===
  document.querySelectorAll('[align]').forEach(el => {
    const alignValue = el.getAttribute('align');
    if (alignValue) el.style.textAlign = alignValue;
    el.removeAttribute('align');
  });

  document.querySelectorAll('a').forEach(anchor => {
    const anchorText = anchor.textContent.trim();
    if (anchorText) {
      anchor.setAttribute('alt', anchorText);
      anchor.setAttribute('title', anchorText);
    }
  });

  const ids = {};
  document.querySelectorAll('[id]').forEach(element => {
    let id = element.id;
    if (ids[id]) element.id = `${id}_${ids[id]++}`;
    else ids[id] = 1;
  });

  document.querySelectorAll('center').forEach(center => {
    const div = document.createElement('div');
    div.innerHTML = center.innerHTML;
    div.style.textAlign = 'center';
    center.parentNode.replaceChild(div, center);
  });

  document.querySelectorAll('button').forEach(button => {
    let name =
      button.getAttribute('aria-label') ||
      button.getAttribute('title') ||
      button.textContent.trim() ||
      button.id.trim() ||
      'Button';
    name = name.replace(/([a-z])([A-Z])/g, '$1 $2');
    button.setAttribute('aria-label', name);
    button.setAttribute('title', name);
  });

  document.querySelectorAll('iframe').forEach(iframe => {
    if (!iframe.hasAttribute('title') || iframe.getAttribute('title').trim() === '') {
      iframe.setAttribute('title', 'Embedded Content');
    }
  });

  document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
    if (!heading.textContent.trim()) heading.remove();
  });

  // === dropdown a11y + dynamic CSS ===
  (function applyDropdownA11yScope() {
    const MARK = 'data-a11y-dropdown-fixed';
    const fixedDropdowns = []; // collect for dynamic CSS

    function idBaseFrom(el, fallback = 'menu') {
      const txt = (el?.textContent || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      return txt || `${fallback}-${Math.random().toString(36).slice(2, 8)}`;
    }

    function ensureId(el, base) {
      if (el.id && el.id.trim()) return el.id.trim();
      let id = base;
      let i = 1;
      while (document.getElementById(id)) id = `${base}-${i++}`;
      el.id = id;
      return id;
    }

    function fixContainer(container) {
      if (container.hasAttribute(MARK)) return;

      const button =
        container.querySelector('.menu-list--btn') ||
        container.querySelector('button');

      const panel =
        container.querySelector('.menu-list--dropdown-content') ||
        container.querySelector('div');

      if (!button || !panel) return;
      if (!panel.querySelector('a[href]')) return; // must have links

      // ensure IDs on container, button, panel
      const base = idBaseFrom(button, 'menu');
      const containerId = ensureId(container, `${base}Wrap`);
      const btnId = ensureId(button, `${base}Btn`);
      const panelId = ensureId(panel, `${base}Dropdown`);

      // ARIA wiring
      if (!button.hasAttribute('aria-haspopup'))
        button.setAttribute('aria-haspopup', 'true');
      if (!button.hasAttribute('aria-expanded'))
        button.setAttribute('aria-expanded', 'false');
      if (!button.hasAttribute('aria-controls'))
        button.setAttribute('aria-controls', panelId);

      if (!panel.hasAttribute('aria-labelledby'))
        panel.setAttribute('aria-labelledby', btnId);
      if (!panel.hasAttribute('role')) panel.setAttribute('role', 'menu');

      panel.querySelectorAll('a[href]').forEach(a => {
        if (!a.hasAttribute('role')) a.setAttribute('role', 'menuitem');
        if (!a.hasAttribute('tabindex')) a.setAttribute('tabindex', '0');
      });

      // Interaction (click/focus/Escape)
      const openDropdown = () => container.setAttribute('aria-expanded', 'true');
      const closeDropdown = () => container.setAttribute('aria-expanded', 'false');

      button.addEventListener('click', () => {
        const expanded = button.getAttribute('aria-expanded') === 'true';
        button.setAttribute('aria-expanded', String(!expanded));
      });
      button.addEventListener('focus', openDropdown);
      container.addEventListener('focusout', e => {
        if (!container.contains(e.relatedTarget)) closeDropdown();
      });
      container.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
          e.preventDefault();
          button.focus();
          closeDropdown();
        }
      });

      // mark + collect for CSS
      container.setAttribute(MARK, '1');
      fixedDropdowns.push({ container, button, panel, containerId, btnId, panelId });
    }

    function applyDropdownA11y(root = document) {
      root.querySelectorAll('.main-nav--menu-list.menu-list--dropdown, .menu-list--dropdown, .menu-list--btn')
        .forEach(fixContainer);

      // Fallback heuristic
      root.querySelectorAll('div').forEach(div => {
        if (div.hasAttribute(MARK)) return;
        const btn = div.querySelector('button');
        const nestedDivWithLinks = div.querySelector('div a[href]');
        if (btn && nestedDivWithLinks) fixContainer(btn);
      });
    }

    function injectDynamicDropdownCSS(list) {
      if (!list.length) return;
      let css = '';

      list.forEach(({ containerId, btnId, panelId }) => {
        const cSel = `#${CSS.escape(containerId)}`;
        const bSel = `#${CSS.escape(btnId)}`;
        const pSel = `#${CSS.escape(panelId)}`;

        css += `
        ${bSel}:focus{
                        outline: none; 
                        border: 2px solid #4A90E2; 
                        border-radius: 4px;
                        background-color:#F2F7FC;}
        ${pSel} a:focus{outline: none; 
                        border: 2px solid #4A90E2; 
                        border-radius: 4px;
                        background-color:#E5EDF5;}
        ${cSel}[aria-expanded="true"] ${pSel}{
          opacity:1;pointer-events:auto;visibility:visible;top:100%;
        }
        ${cSel}:hover ${pSel}{
          opacity:1;pointer-events:auto;visibility:visible;top:100%;
        }
        ${cSel}:hover ${bSel}{background:#F2F7FC !important;}
        btn:focus {
          border: 2px solid #4A90E2; 
          border-radius: 4px;
        }
        div:focus {
          border: 2px solid #4A90E2; 
          border-radius: 4px;
        }
        `;
      });

      let style = document.getElementById('a11y-dropdown-style');
      if (!style) {
        style = document.createElement('style');
        style.id = 'a11y-dropdown-style';
        document.head.appendChild(style);
      }
      style.textContent = css;
    }

    applyDropdownA11y();
    injectDynamicDropdownCSS(fixedDropdowns);
  })();

  // === Inject CSS to ensure all focusable elements show border when navigated via keyboard ===
  (function enforceKeyboardNavBorders() {
    const keyboardNavBorderCSS = `
      /* Default keyboard navigation border */
      :focus-visible {
        outline: none !important;
      }

      /* Apply fallback border only to elements without existing borders */
      button:focus-visible:not([data-has-border]),
      a:focus-visible:not([data-has-border]),
      input:focus-visible:not([data-has-border]),
      select:focus-visible:not([data-has-border]),
      textarea:focus-visible:not([data-has-border]),
      [tabindex]:focus-visible:not([data-has-border]) {
        outline: none !important;
        border: 2px solid #4A90E2 !important; /* bright blue fallback */
        border-radius: 4px;
        box-shadow: 0 0 0 2px rgba(74,144,226,0.25); /* soft glow */
        transition: border-color 0.1s ease, box-shadow 0.1s ease;
      }
    `;

    let style = document.getElementById('a11y-fallback-border-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'a11y-fallback-border-style';
      document.head.appendChild(style);
    }
    style.textContent = keyboardNavBorderCSS;

  console.log('✅ Fallback keyboard navigation borders injected.');
  })();


  // === alt-text generation ===
  const applied = await generateAltForImages(); // returns [{src, alt}]
  return applied;
}

async function generateAltForImages({ prefer = 'gemini', concurrency = 5, requestTimeoutMs = 15000 } = {}) {
  // collect targets (no existing alt)
  const imgs = [...document.querySelectorAll('img')].filter((img) => !img.getAttribute('alt')?.trim());
  if (!imgs.length) return { applied: [], ok: true };

  // de-duplicate srcs to avoid repeated calls
  const uniqueSrcs = [...new Set(imgs.map((i) => i.src).filter(Boolean))];

  // 1) Try global cache first (cross-page reuse)
  let hits = [];
  let misses = uniqueSrcs;

  let ok = true; // <- top-level ok flag
  const applied = []; // <- only {src, alt}

  try {
    const alt_lookup = await runPromisify('ALT_LOOKUP', {srcs: uniqueSrcs});
    hits = alt_lookup?.data?.hits || [];
    misses = alt_lookup?.data?.misses || uniqueSrcs;
  } catch (err) {
    // cache lookup failed, still continue with generation
    ok = false;
    hits = [];
    misses = uniqueSrcs;
  }

  const hitMap = new Map(hits.map((h) => [h.src, h.alt]));

  // Apply cache hits immediately
  for (const img of imgs) {
    const a = hitMap.get(img.src);
    if (a) {
      img.setAttribute('alt', a);
      applied.push({ src: img.src, alt: a });
    }
  }

  // 2) Prepare generation list from remaining images
  const remainingImgs = imgs.filter((i) => !i.getAttribute('alt')?.trim());

  // Split remaining into SVGs (local fallback) vs others (server)
  const svgImgs = remainingImgs.filter((i) => isSvgSrc(i.src));
  const nonSvgImgs = remainingImgs.filter((i) => !isSvgSrc(i.src));

  // SVG filename fallback (fast, no network)
  for (const img of svgImgs) {
    try {
      const alt = filenameAlt(img.src);
      if (!alt?.trim()) {
        ok = false;
        continue;
      }
      img.setAttribute('alt', alt);
      applied.push({ src: img.src, alt });
    } catch (err) {
      ok = false;
    }
  }

  // Generate for non-SVGs with concurrency (await runPromisify)
  let idx = 0;
  async function worker() {
    while (idx < nonSvgImgs.length) {
      const img = nonSvgImgs[idx++];
      const src = img.src;

      try {
        const resp = await runPromisify('GEN_ALT', {
          src,
          requestTimeoutMs,
          prefer
        });

        const altText = resp?.data?.altText;

        if (!altText?.trim()) {
          ok = false;
          continue;
        }

        img.setAttribute('alt', altText);
        applied.push({ src, alt: altText });
      } catch (err) {
        ok = false;
      }
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, nonSvgImgs.length));
  await Promise.all(Array.from({ length: workerCount }, worker));

  return { applied, ok };
}

async function lookupCachedAlts(srcs) {
  try {
    const r = await fetch('https://pa11y-backend-tisgwzdora-et.a.run.app/alt-lookup', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ srcs })
    });
    
    if (!r.ok) return { hits: [], misses: srcs };
    return await r.json(); // { hits:[{src,alt}], misses:[...] }
  } catch (e) {
    console.warn('alt-lookup failed', e);
    return { hits: [], misses: srcs };
  }
}

async function fetchPageFixes() {
    try {
        const url = new URL('https://pa11y-backend-tisgwzdora-et.a.run.app/fixes');
        url.searchParams.set('url', location.href);
        const r = await fetch(url.toString(), { method: 'GET' });
        
        if (!r.ok) return null;
        return await r.json();
    } catch (e) {
        console.warn('fetchPageFixes failed:', e);
        return null;
    }
}

async function savePageFixes(alts, meta = {}) {
  const locationhref = location.href;

  try {
    const resp = await runPromisify('SAVE_FIXES', {
      alts,
      meta,
      location: locationhref
    });

    return { ok: true, data: resp.data };

  } catch (err) {
    console.error('SAVE_FIXES failed:', err.message);
    return { ok: false, error: err.message };
  }
}

// --- FITUR TAMBAHAN: READING MASK, ANIMATION, LINKS ---

// 1. Reading Mask Logic
let maskOverlay = null;
// --- 1. Reading Mask Logic (REVISI: 2-Div System) ---
let maskTop = null;
let maskBottom = null;
const MASK_GAP = 100; // Lebar celah baca (dalam pixel)

function toggleReadingMask(enable) {
  if (enable) {
    if (!maskTop) {
      // Buat Kotak Atas (Gelap)
      maskTop = document.createElement('div');
      maskTop.id = 'a11y-mask-top';
      maskTop.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; 
        background: rgba(0,0,0,0.6); 
        z-index: 2147483647; pointer-events: none;
        transition: height 0.05s linear; /* Sedikit transisi agar halus */
      `;

      // Buat Kotak Bawah (Gelap)
      maskBottom = document.createElement('div');
      maskBottom.id = 'a11y-mask-bottom';
      maskBottom.style.cssText = `
        position: fixed; bottom: 0; left: 0; width: 100%; 
        background: rgba(0,0,0,0.6); 
        z-index: 2147483647; pointer-events: none;
        transition: height 0.05s linear;
      `;
      
      // Buat Garis Fokus (Opsional: Garis merah tipis di tengah)
      // Agar user tau persis tengahnya dimana
      maskTop.style.borderBottom = "2px solid rgba(255, 255, 0, 0.5)"; // Garis kuning transparan
      
      document.body.appendChild(maskTop);
      document.body.appendChild(maskBottom);
      
      document.addEventListener('mousemove', moveMask);
    }
  } else {
    // Hapus elemen jika dimatikan
    if (maskTop) {
      maskTop.remove(); maskTop = null;
    }
    if (maskBottom) {
      maskBottom.remove(); maskBottom = null;
    }
    document.removeEventListener('mousemove', moveMask);
  }
}

function moveMask(e) {
  if (maskTop && maskBottom) {
    const y = e.clientY;
    
    // Logika Matematika Sederhana:
    // Tinggi kotak atas = Posisi Mouse - Setengah Celah
    // Tinggi kotak bawah = Sisa layar di bawah
    
    const topHeight = Math.max(0, y - (MASK_GAP / 2));
    const bottomHeight = Math.max(0, window.innerHeight - (y + (MASK_GAP / 2)));

    maskTop.style.height = `${topHeight}px`;
    maskBottom.style.height = `${bottomHeight}px`;
  }
}

// 2. Stop Animations Logic
function toggleStopAnimations(enable) {
  const ID = 'a11y-stop-anim';
  if (enable) {
    if (!document.getElementById(ID)) {
      const style = document.createElement('style');
      style.id = ID;
      style.textContent = `
        *, *::before, *::after {
          animation: none !important;
          transition: none !important;
          scroll-behavior: auto !important;
        }
      `;
      document.head.appendChild(style);
    }
  } else {
    const style = document.getElementById(ID);
    if (style) style.remove();
  }
}

// 3. Highlight Links Logic
function toggleHighlightLinks(enable) {
  const ID = 'a11y-highlight-links';
  if (enable) {
    if (!document.getElementById(ID)) {
      const style = document.createElement('style');
      style.id = ID;
      style.textContent = `
        a, button, [role="button"], [role="link"] {
          background-color: #ffff00 !important; /* Kuning stabilo */
          color: #000000 !important;
          border: 2px solid #000000 !important;
          text-decoration: underline !important;
          font-weight: bold !important;
        }
      `;
      document.head.appendChild(style);
    }
  } else {
    const style = document.getElementById(ID);
    if (style) style.remove();
  }
}

// --- FITUR TAMBAHAN PART 2: SPACING, CURSOR, TTS ---

// 1. Text Spacing Logic (WCAG 1.4.12)
function toggleTextSpacing(enable) {
  const ID = 'a11y-text-spacing';
  if (enable) {
    if (!document.getElementById(ID)) {
      const style = document.createElement('style');
      style.id = ID;
      // !important untuk menimpa style bawaan
      style.textContent = `
        * {
          line-height: 1.5 !important;
          letter-spacing: 0.12em !important;
          word-spacing: 0.16em !important;
        }
        p, li, h1, h2, h3, h4, h5, h6 {
          margin-bottom: 2em !important;
        }
      `;
      document.head.appendChild(style);
    }
  } else {
    const style = document.getElementById(ID);
    if (style) style.remove();
  }
}

// 2. Big Cursor Logic
function toggleBigCursor(enable) {
  const ID = 'a11y-big-cursor';
  if (enable) {
    if (!document.getElementById(ID)) {
      // SVG Kursor Besar (Encoded Base64 biar rapi)
      // Gambar panah hitam dengan outline putih tebal
      const cursorSVG = `url('data:image/svg+xml;utf8,<svg width="48" height="48" viewBox="0 0 24 24" fill="black" stroke="white" stroke-width="2" xmlns="http://www.w3.org/2000/svg"><path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.8c.45 0 .67-.54.35-.85L6.35 2.85a.5.5 0 0 0-.85.36z"/></svg>') 0 0, auto`;
      
      const style = document.createElement('style');
      style.id = ID;
      style.textContent = `
        html, body, a, button, input, select, textarea, [role="button"] {
          cursor: ${cursorSVG} !important;
        }
      `;
      document.head.appendChild(style);
    }
  } else {
    const style = document.getElementById(ID);
    if (style) style.remove();
  }
}

// 3. Text-to-Speech (TTS) Logic
// Variabel global untuk TTS
let ttsEnabled = false;

// Fungsi pembaca seleksi
function handleMouseUpTTS() {
  if (!ttsEnabled) return;
  
  const selectedText = window.getSelection().toString().trim();
  if (selectedText.length > 0) {
    // Stop suara sebelumnya (biar gak numpuk)
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(selectedText);
    utterance.lang = 'id-ID'; // Bahasa Indonesia
    utterance.rate = 1.0; // Kecepatan normal
    utterance.pitch = 1.0;
    
    window.speechSynthesis.speak(utterance);
  }
}

function toggleTTS(enable) {
  ttsEnabled = enable;
  if (enable) {
    document.addEventListener('mouseup', handleMouseUpTTS);
  } else {
    document.removeEventListener('mouseup', handleMouseUpTTS);
    window.speechSynthesis.cancel(); // Matikan suara saat fitur dimatikan
  }
}

// Update Message Listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'TOGGLE_TEXT_SPACING') toggleTextSpacing(request.enabled);
  if (request.type === 'TOGGLE_BIG_CURSOR') toggleBigCursor(request.enabled);
  if (request.type === 'TOGGLE_TTS') toggleTTS(request.enabled);
});

// Cek State Awal
chrome.storage.sync.get({ 
  textSpacingEnabled: false,
  bigCursorEnabled: false,
  ttsEnabled: false
}, (data) => {
  if (data.textSpacingEnabled) toggleTextSpacing(true);
  if (data.bigCursorEnabled) toggleBigCursor(true);
  if (data.ttsEnabled) toggleTTS(true);
});

// Update Message Listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'TOGGLE_READING_MASK') toggleReadingMask(request.enabled);
  if (request.type === 'TOGGLE_STOP_ANIMATION') toggleStopAnimations(request.enabled);
  if (request.type === 'TOGGLE_HIGHLIGHT_LINKS') toggleHighlightLinks(request.enabled);
});

// Cek State Awal (Load settings)
chrome.storage.sync.get({ 
  readingMaskEnabled: false,
  stopAnimationEnabled: false,
  highlightLinksEnabled: false
}, (data) => {
  if (data.readingMaskEnabled) toggleReadingMask(true);
  if (data.stopAnimationEnabled) toggleStopAnimations(true);
  if (data.highlightLinksEnabled) toggleHighlightLinks(true);
});