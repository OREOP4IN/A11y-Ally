const SETTINGS_KEY = 'autoFixEnabled';
const BACKEND_URL = 'https://pa11y-backend-tisgwzdora-et.a.run.app';

// ============================================================================
// 1. HELPERS & UTILITIES
// ============================================================================

async function isAutoFixEnabled() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ autoFixEnabled: false }, ({ autoFixEnabled }) => {
    console.log(` Check AutoFix state:`, autoFixEnabled ? "ACTIVE" : "NONACTIVE");

      resolve(autoFixEnabled);
    });
  });
}

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

// ============================================================================
// 2. INITIALIZATION (AUTO-RUN)
// ============================================================================

let __autoFixInitRan = false;

async function initAutoFix() {
  if (__autoFixInitRan) return;       
  __autoFixInitRan = true;

  try {
    const enabled = await isAutoFixEnabled();
    if (!enabled) return;

    // Optional: give page a moment to settle
    await new Promise((r) => setTimeout(r, 500));
    await runManualFixes(); 
  } catch (err) {
    console.error('initAutoFix error:', err);
  }
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initAutoFix();
} else {
  document.addEventListener('DOMContentLoaded', () => {
    initAutoFix();
  }, { once: true });
}

// ============================================================================
// 3. MAIN LOGIC
// ============================================================================

async function runManualFixes() {
  let successfulRuns = {
    "runGeneralFixes": false,
    // "generateAltForImages": false,
    "savePageFixes": false,
    "cssCacheHit": false,
    // "pa11yResult": false,
    "GENERATE_A11Y_CSS": false,
    "timeTaken": "0 ms" //
  };

  const startTime = performance.now(); // <-- TRACKER LATENCY

  await (async () => {
    try {
      // 1. URL validation
      const url = window.location.href;
      if (/^(chrome|edge|about|chrome-extension|file):\/\//i.test(url)) return;
      console.log('Scanning URL:', url);

      // CHECK CSS CACHE FIRST ---
      const cachedCSS = await checkCssCache(url);
      if (cachedCSS) {
          console.log("FAST LANE: Cache Hit! Skipping Pa11y Scan.");
          injectCSS(cachedCSS);
          successfulRuns.cssCacheHit = true;
          successfulRuns.GENERATE_A11Y_CSS = true;
          
          const checkRGF = await runGeneralFixes();
          // console.log(checkRGF);
          if (checkRGF.ok) successfulRuns.runGeneralFixes = true;
          return; 
      }

      // -----------------------------------------------------

      // 2. RUN GENERAL FIXES (Local)
      const data = await runGeneralFixes(); 
      const applied = data?.applied;
      if (data) successfulRuns.runGeneralFixes = true;

      // 3. SAVE ALT FIXES TO SERVER
      if (applied && applied.length > 0) {
        try {
          const resp = await savePageFixes(applied, { source: 'auto', count: applied.length });
          successfulRuns.savePageFixes = resp.ok;
        } catch (e) {}
      }

      // 4. RUN PA11Y
      console.log("Cache Miss. Running full scan...");
      const pa11yResult = await runPromisify('RUN_PA11Y', { url: url });
      const pa11yReport = pa11yResult.data;
      successfulRuns.pa11yResult = pa11yResult.ok;

      if (!pa11yResult.ok) throw new Error(`Pa11y Failed`);

      // 5. GENERATE & INJECT CSS & CACHE
      const cssInjected = await generateAndInjectCSS(pa11yReport, url);
      successfulRuns.GENERATE_A11Y_CSS = cssInjected;

    } catch (e) {
      console.error('runManualFixes failed:', e);
    } finally {
      const endTime = performance.now();
      const duration = (endTime - startTime).toFixed(2); // buletin doang
      successfulRuns.timeTaken = `${duration} ms`; 
      
      console.table(successfulRuns);
      console.log(`Eksekusi Selesai dalam: ${duration} ms`);
    }
  })();

  return true;
}

// --- HELPER: CHECK CACHE ---
async function checkCssCache(url) {
    try {
        const resp = await fetch(`${BACKEND_URL}/css?url=${encodeURIComponent(url)}`);
        if (!resp.ok) return null;
        const data = await resp.json();
        return data.cached ? data.css : null;
    } catch (e) {
        return null;
    }
}

// --- HELPER: INJECTOR ---
function injectCSS(cssContent) {
    const styleId = 'a11y-auto-generated-fixes';
    let style = document.getElementById(styleId);
    if (!style) {
        style = document.createElement('style');
        style.id = styleId;
        document.head.appendChild(style);
    }
    style.textContent = cssContent;
    console.log('CSS Injected.');
}

// --- UPDATED GENERATOR SEND URL---
async function generateAndInjectCSS(report, url) {
    try {
        const response = await fetch(`${BACKEND_URL}/generate-css`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                report: report,
                url: url // <--- Send URL FOR CACHE
            })
        });

        const data = await response.json();
        if (data.css) {
            injectCSS(data.css);
            return true;
        }
        return false;
    } catch (e) {
        console.error('CSS Gen Failed:', e);
        return false;
    }
}


// ============================================================================
// 5. VISUAL AIDS MODULES
// ============================================================================

// --- Dyslexia Font ---
function toggleDyslexiaFont(enable) {
  const STYLE_ID = 'a11y-dyslexia-style';
  let styleTag = document.getElementById(STYLE_ID);

  if (enable) {
    if (!styleTag) {
      const fontUrl = chrome.runtime.getURL('fonts/OpenDyslexic-Regular.woff2');
      const css = `
        @font-face {
          font-family: 'OpenDyslexic';
          src: url('${fontUrl}') format('woff2');
          font-weight: normal;
          font-style: normal;
        }
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
    if (styleTag) styleTag.remove();
  }
}

// --- Reading Mask ---
let maskTop = null, maskBottom = null;
const MASK_GAP = 100;

function toggleReadingMask(enable) {
  if (enable) {
    if (!maskTop) {
      maskTop = document.createElement('div');
      maskTop.id = 'a11y-mask-top';
      maskTop.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; background: rgba(0,0,0,0.6); z-index: 2147483647; pointer-events: none; transition: height 0.05s linear; border-bottom: 2px solid rgba(255, 255, 0, 0.5);`;

      maskBottom = document.createElement('div');
      maskBottom.id = 'a11y-mask-bottom';
      maskBottom.style.cssText = `position: fixed; bottom: 0; left: 0; width: 100%; background: rgba(0,0,0,0.6); z-index: 2147483647; pointer-events: none; transition: height 0.05s linear;`;
      
      document.body.appendChild(maskTop);
      document.body.appendChild(maskBottom);
      document.addEventListener('mousemove', moveMask);
    }
  } else {
    if (maskTop) { maskTop.remove(); maskTop = null; }
    if (maskBottom) { maskBottom.remove(); maskBottom = null; }
    document.removeEventListener('mousemove', moveMask);
  }
}

function moveMask(e) {
  if (maskTop && maskBottom) {
    const y = e.clientY;
    maskTop.style.height = Math.max(0, y - (MASK_GAP / 2)) + 'px';
    maskBottom.style.height = Math.max(0, window.innerHeight - (y + (MASK_GAP / 2))) + 'px';
  }
}

// --- Stop Animations ---
function toggleStopAnimations(enable) {
  const ID = 'a11y-stop-anim';
  if (enable) {
    if (!document.getElementById(ID)) {
      const style = document.createElement('style');
      style.id = ID;
      style.textContent = `*, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }`;
      document.head.appendChild(style);
    }
  } else {
    const style = document.getElementById(ID);
    if (style) style.remove();
  }
}

// --- Highlight Links ---
function toggleHighlightLinks(enable) {
  const ID = 'a11y-highlight-links';
  if (enable) {
    if (!document.getElementById(ID)) {
      const style = document.createElement('style');
      style.id = ID;
      style.textContent = `a, button, [role="button"], [role="link"] { background-color: #ffff00 !important; color: #000000 !important; border: 2px solid #000000 !important; text-decoration: underline !important; font-weight: bold !important; }`;
      document.head.appendChild(style);
    }
  } else {
    const style = document.getElementById(ID);
    if (style) style.remove();
  }
}

// --- Text Spacing ---
function toggleTextSpacing(enable) {
  const ID = 'a11y-text-spacing';
  if (enable) {
    if (!document.getElementById(ID)) {
      const style = document.createElement('style');
      style.id = ID;
      style.textContent = `* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p, li, h1, h2, h3, h4, h5, h6 { margin-bottom: 2em !important; }`;
      document.head.appendChild(style);
    }
  } else {
    const style = document.getElementById(ID);
    if (style) style.remove();
  }
}

// --- Big Cursor ---
function toggleBigCursor(enable) {
  const ID = 'a11y-big-cursor';
  if (enable) {
    if (!document.getElementById(ID)) {
      const cursorSVG = `url('data:image/svg+xml;utf8,<svg width="48" height="48" viewBox="0 0 24 24" fill="black" stroke="white" stroke-width="2" xmlns="http://www.w3.org/2000/svg"><path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.8c.45 0 .67-.54.35-.85L6.35 2.85a.5.5 0 0 0-.85.36z"/></svg>') 0 0, auto`;
      const style = document.createElement('style');
      style.id = ID;
      style.textContent = `html, body, a, button, input, select, textarea, [role="button"] { cursor: ${cursorSVG} !important; }`;
      document.head.appendChild(style);
    }
  } else {
    const style = document.getElementById(ID);
    if (style) style.remove();
  }
}

// --- Text-to-Speech (TTS) ---
let ttsEnabled = false;

function speak(text) {
    // stop suara sebelumnya biar gak tumpang tindih
    window.speechSynthesis.cancel(); 
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'id-ID'; // setting bahasa
    utterance.rate = 1.0;     // playback speed
    window.speechSynthesis.speak(utterance);
}

// Handle teks pas diseleksi 
function handleMouseUpTTS() {
  if (!ttsEnabled) return;
  
  const selectedText = window.getSelection().toString().trim();
  if (selectedText.length > 0) {
    speak(selectedText);
  }
}

// Handle Gambar
function handleImageHoverTTS(e) {
  if (!ttsEnabled) return;

  // Cek apakah elemen di kursor teh GAMBAR
  if (e.target.tagName === 'IMG') {
    const alt = e.target.getAttribute('alt');
    
    if (alt && alt.trim().length > 0) {
      speak(`Gambar: ${alt}`);
    } else {
      // speak("Gambar tanpa deskripsi"); 
    }
  }
}

function toggleTTS(enable) {
  ttsEnabled = enable;
  
  if (enable) {
    document.addEventListener('mouseup', handleMouseUpTTS);
    document.addEventListener('mouseover', handleImageHoverTTS); 
  } else {
    document.removeEventListener('mouseup', handleMouseUpTTS);
    document.removeEventListener('mouseover', handleImageHoverTTS); 
    window.speechSynthesis.cancel(); 
  }
}

// ============================================================================
// 6. MESSAGE LISTENERS
// ============================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Visual Aids
  if (request.type === 'TOGGLE_DYSLEXIA_FONT') toggleDyslexiaFont(request.enabled);
  if (request.type === 'TOGGLE_READING_MASK') toggleReadingMask(request.enabled);
  if (request.type === 'TOGGLE_STOP_ANIMATION') toggleStopAnimations(request.enabled);
  if (request.type === 'TOGGLE_HIGHLIGHT_LINKS') toggleHighlightLinks(request.enabled);
  if (request.type === 'TOGGLE_TEXT_SPACING') toggleTextSpacing(request.enabled);
  if (request.type === 'TOGGLE_BIG_CURSOR') toggleBigCursor(request.enabled);
  if (request.type === 'TOGGLE_TTS') toggleTTS(request.enabled);

  // HTML Export (Sync)
  if (request.type === "GET_HTML") {
    try {
      const currentHtml = document.documentElement.outerHTML;
      // console.log('currentHTML', currentHtml);
      sendResponse({ ok: true, html: currentHtml });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
    return; 
  }

  // Alt Text Generation (Async)
  if (request.type === "GENERATE_ALT_TEXT") {
    (async () => {
      try {
        const applied = await generateAltForImages(); 
        sendResponse({ ok: true, appliedCount: applied?.applied?.length || 0 });
        if (applied?.applied?.length) {
          try { await savePageFixes(applied.applied, { source: 'manual', count: applied.applied.length }); }
          catch (e) { console.warn('manual savePageFixes failed:', e); }
        }
      } catch (e) {
        console.error('generateAltForImages failed:', e);
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }
});

// Load Saved Settings
chrome.storage.sync.get({ 
  dyslexiaFontEnabled: false,
  readingMaskEnabled: false,
  stopAnimationEnabled: false,
  highlightLinksEnabled: false,
  textSpacingEnabled: false,
  bigCursorEnabled: false,
  ttsEnabled: false
}, (data) => {
  if (data.dyslexiaFontEnabled) toggleDyslexiaFont(true);
  if (data.readingMaskEnabled) toggleReadingMask(true);
  if (data.stopAnimationEnabled) toggleStopAnimations(true);
  if (data.highlightLinksEnabled) toggleHighlightLinks(true);
  if (data.textSpacingEnabled) toggleTextSpacing(true);
  if (data.bigCursorEnabled) toggleBigCursor(true);
  if (data.ttsEnabled) toggleTTS(true);
});


// ============================================================================
// 7. GENERAL FIXES & DOM MANIPULATION
// ============================================================================

async function runGeneralFixes() {
  // Fix align
  document.querySelectorAll('[align]').forEach(el => {
    const alignValue = el.getAttribute('align');
    if (alignValue) el.style.textAlign = alignValue;
    el.removeAttribute('align');
  });

  // Fix empty links
  document.querySelectorAll('a').forEach(anchor => {
    const anchorText = anchor.textContent.trim();
    if (anchorText) {
      anchor.setAttribute('alt', anchorText);
      anchor.setAttribute('title', anchorText);
    }
  });

  // Fix duplicate IDs
  const ids = {};
  document.querySelectorAll('[id]').forEach(element => {
    let id = element.id;
    if (ids[id]) element.id = `${id}_${ids[id]++}`;
    else ids[id] = 1;
  });

  // Fix center tags
  document.querySelectorAll('center').forEach(center => {
    const div = document.createElement('div');
    div.innerHTML = center.innerHTML;
    div.style.textAlign = 'center';
    center.parentNode.replaceChild(div, center);
  });

  // Fix Buttons
  document.querySelectorAll('button').forEach(button => {
    let name = button.getAttribute('aria-label') || button.getAttribute('title') || button.textContent.trim() || button.id.trim() || 'Button';
    name = name.replace(/([a-z])([A-Z])/g, '$1 $2');
    button.setAttribute('aria-label', name);
    button.setAttribute('title', name);
  });

  // Fix Iframes
  document.querySelectorAll('iframe').forEach(iframe => {
    if (!iframe.hasAttribute('title') || iframe.getAttribute('title').trim() === '') {
      iframe.setAttribute('title', 'Embedded Content');
    }
  });

  // Fix Empty Headings
  document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
    if (!heading.textContent.trim()) heading.remove();
  });

  // === Dropdown & Focus Logic ===
  (function applyDropdownA11yScope() {
    const MARK = 'data-a11y-dropdown-fixed';
    const fixedDropdowns = [];

    function idBaseFrom(el, fallback = 'menu') {
      const txt = (el?.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
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
      const button = container.querySelector('.menu-list--btn') || container.querySelector('button');
      const panel = container.querySelector('.menu-list--dropdown-content') || container.querySelector('div');

      if (!button || !panel) return;
      if (!panel.querySelector('a[href]')) return; 

      const base = idBaseFrom(button, 'menu');
      const containerId = ensureId(container, `${base}Wrap`);
      const btnId = ensureId(button, `${base}Btn`);
      const panelId = ensureId(panel, `${base}Dropdown`);

      if (!button.hasAttribute('aria-haspopup')) button.setAttribute('aria-haspopup', 'true');
      if (!button.hasAttribute('aria-expanded')) button.setAttribute('aria-expanded', 'false');
      if (!button.hasAttribute('aria-controls')) button.setAttribute('aria-controls', panelId);

      if (!panel.hasAttribute('aria-labelledby')) panel.setAttribute('aria-labelledby', btnId);
      if (!panel.hasAttribute('role')) panel.setAttribute('role', 'menu');

      panel.querySelectorAll('a[href]').forEach(a => {
        if (!a.hasAttribute('role')) a.setAttribute('role', 'menuitem');
        if (!a.hasAttribute('tabindex')) a.setAttribute('tabindex', '0');
      });

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

      container.setAttribute(MARK, '1');
      fixedDropdowns.push({ container, button, panel, containerId, btnId, panelId });
    }

    function applyDropdownA11y(root = document) {
      root.querySelectorAll('.main-nav--menu-list.menu-list--dropdown, .menu-list--dropdown, .menu-list--btn').forEach(fixContainer);
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
        ${bSel}:focus{ outline: none; border: 2px solid #4A90E2; border-radius: 4px; background-color:#F2F7FC;}
        ${pSel} a:focus{outline: none; border: 2px solid #4A90E2; border-radius: 4px; background-color:#E5EDF5;}
        ${cSel}[aria-expanded="true"] ${pSel}{ opacity:1;pointer-events:auto;visibility:visible;top:100%; }
        ${cSel}:hover ${pSel}{ opacity:1;pointer-events:auto;visibility:visible;top:100%; }
        ${cSel}:hover ${bSel}{background:#F2F7FC !important;}
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

  // Focus Borders Fallback
  (function enforceKeyboardNavBorders() {
    const keyboardNavBorderCSS = `
      :focus-visible { outline: none !important; }
      button:focus-visible:not([data-has-border]),
      a:focus-visible:not([data-has-border]),
      input:focus-visible:not([data-has-border]),
      select:focus-visible:not([data-has-border]),
      textarea:focus-visible:not([data-has-border]),
      [tabindex]:focus-visible:not([data-has-border]) {
        outline: none !important;
        border: 2px solid #4A90E2 !important;
        border-radius: 4px;
        box-shadow: 0 0 0 2px rgba(74,144,226,0.25);
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
  })();

  // Generate Alt
  const applied = await generateAltForImages(); 
  console.log(applied);
  return applied;
}

// ============================================================================
// 8. ALT TEXT GENERATION LOGIC
// ============================================================================

async function generateAltForImages({ prefer = 'gemini', concurrency = 5, requestTimeoutMs = 15000 } = {}) {
  const imgs = [...document.querySelectorAll('img')].filter((img) => !img.getAttribute('alt')?.trim());

  // console.log ('imgs', imgs);
  if (!imgs.length) return { applied: [], ok: true };

  let ok = true;
  let applied = [];

  // Peta-in URL bersih ke elemen gambar asli
  const imgMap = new Map();
  for (const img of imgs) {
    let rawUrl = img.src || '';
    let cleanUrl = rawUrl.trim(); // Hapus spasi nyasar di akhir src="..."
    
    try {
      const u = new URL(cleanUrl);
      // 1. Pecah path URL berdasarkan garis miring '/'
      // 2. Decode semua elemen trus Encode ulang pakai encodeURIComponent
      // Ngubah <br> jadi %3Cbr%3E tanpa menghilangkan eksistensinya
      const pathSegments = decodeURIComponent(u.pathname).split('/');
      u.pathname = pathSegments.map(encodeURIComponent).join('/');
      
      cleanUrl = u.toString();
    } catch (e) {
      // Fallback
      cleanUrl = encodeURI(rawUrl.trim());
    }

    if (!imgMap.has(cleanUrl)) imgMap.set(cleanUrl, []);
    imgMap.get(cleanUrl).push(img);
  }

  // Gunakan URL yang udah clean untuk mencari di Cache
  const uniqueCleanSrcs = Array.from(imgMap.keys()).filter(Boolean);
  let hits = [], misses = uniqueCleanSrcs;

  console.log('uniqueCleanSrcs', uniqueCleanSrcs);
  console.log('imgMap', imgMap);

  // 1. Check Cache (Redis)
  try {
    const alt_lookup = await runPromisify('ALT_LOOKUP', { srcs: uniqueCleanSrcs });
    hits = alt_lookup?.data?.hits || [];
    misses = alt_lookup?.data?.misses || uniqueCleanSrcs;
  } catch (err) {
    ok = false;
  }

  // Terapin Cache Hits ke elemen DOM yang tepat
  const hitMap = new Map(hits.map((h) => [h.src, h.alt]));
  for (const [cleanUrl, imgElements] of imgMap.entries()) {
    const a = hitMap.get(cleanUrl);
    if (a) {
      for (const img of imgElements) {
        img.setAttribute('alt', a);
        img.setAttribute('title', a);
        applied.push({ src: img.src, alt: a });  // Simpan src asli (rawUrl) untuk dibalikin ke server pas save-fixes
      }
    }
  }

  // 2. Generate for remaining (Misses)
  const svgUrls = misses.filter((url) => isSvgSrc(url));
  const nonSvgUrls = misses.filter((url) => !isSvgSrc(url));

  // SVGs 
  for (const url of svgUrls) {
    try {
      const alt = filenameAlt(url);
      if (alt?.trim()) {
        const imgElements = imgMap.get(url) || [];
        for (const img of imgElements) {
          img.setAttribute('alt', alt);
          img.setAttribute('title', alt);
          applied.push({ src: img.src, alt });
        }
      } else { ok = false; }
    } catch (err) { ok = false; }
  }

  // Non-SVGs (Lempar ke Server Cloud Run - Gemini AI)
  let idx = 0;
  async function worker() {
    while (idx < nonSvgUrls.length) {
      const cleanUrl = nonSvgUrls[idx++];
      console.log('clean', cleanUrl);
      try {
        const resp = await runPromisify('GEN_ALT', { src: cleanUrl, requestTimeoutMs, prefer });
        const altText = resp?.data?.altText;
        
        if (altText?.trim()) {
          const imgElements = imgMap.get(cleanUrl) || [];
          for (const img of imgElements) {
            img.setAttribute('alt', altText);
            img.setAttribute('title', altText);
            applied.push({ src: img.src, alt: altText });
          }
        } else { ok = false; }
      } catch (err) { 
        console.warn(`Gen alt terhenti untuk ${cleanUrl}:`, err.message);
        ok = false; 
      }
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, nonSvgUrls.length));
  await Promise.all(Array.from({ length: workerCount }, worker));

  // console.log('applied', applied);

  return { applied, ok };
}

// ============================================================================
// 9. SAVE FIXES
// ============================================================================

async function savePageFixes(alts, meta = {}) {
  const locationhref = location.href;
  try {
    const resp = await runPromisify('SAVE_FIXES', { alts, meta, location: locationhref });
    return { ok: true, data: resp.data };
  } catch (err) {
    console.error('SAVE_FIXES failed:', err.message);
    return { ok: false, error: err.message };
  }
}