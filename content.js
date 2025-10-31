// File: content.js

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


// Listen for messages from the popup
// NOTES: keknya kudu di-optimasi; beda2 metode soalnya
// content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "RUN_MANUAL_FIXES") {
    // ASYNC branch: we will call sendResponse later -> return true
    (async () => {
      try {
        // Run all fixes and alt generation; collect what was applied
        const applied = await runGeneralFixes(); // should return [{src, alt}, ...]

        // Reply ASAP so popup doesn’t time out
        sendResponse({ ok: true, appliedCount: applied?.length || 0 });

        // Persist AFTER replying (fire-and-forget)
        if (applied?.length) {
          try {
            await savePageFixes(applied, { source: 'auto', count: applied.length });
          } catch (e) {
            console.warn('savePageFixes failed (post-reply):', e);
          }
        }
      } catch (e) {
        console.error('runGeneralFixes failed:', e);
        // Reply exactly once on error
        try { sendResponse({ ok: false, error: String(e?.message || e) }); } catch {}
      }
    })();
    return true; // keep port open for async sendResponse
  }

  if (request.type === "GET_HTML") {
    // SYNC branch: respond immediately, do NOT return true
    try {
      const currentHtml = document.documentElement.outerHTML;
      // Tip: logging the whole HTML can freeze DevTools; remove the big console.log
      sendResponse({ ok: true, html: currentHtml });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
    return; // no async response -> don't return true
  }

  if (request.type === "GENERATE_ALT_TEXT") {
    // ASYNC branch: generate then respond
    (async () => {
      try {
        const applied = await generateAltForImages(); // return [{src, alt}, ...]
        sendResponse({ ok: true, appliedCount: applied?.length || 0 });
        // Persist after reply (optional)
        if (applied?.length) {
          try { await savePageFixes(applied, { source: 'manual', count: applied.length }); }
          catch (e) { console.warn('savePageFixes failed (post-reply):', e); }
        }
      } catch (e) {
        console.error('generateAltForImages failed:', e);
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true; // keep port open for async sendResponse
  }

  // Unknown message: answer synchronously
  sendResponse({ ok: false, error: 'Unknown request.type' });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GENERATE_A11Y_CSS') {
    console.log('masok content script')
    const pa11yReport = request.report;  // Get Pa11y report from the background or popup
    console.log('report konten sayang:', pa11yReport);
    chrome.runtime.sendMessage({
      type: 'GENERATE_A11Y_CSS',
      report: pa11yReport
    }, (response) => {
      console.log(response.message);
    });
    chrome.runtime.sendMessage({
      type: 'GENERATE_A11Y_CSS',
      report: pa11yReport
    }, (response) => {
      console.log(response.message);
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
        // container.querySelector('.menu-list--btn') ||
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
      root.querySelectorAll('.main-nav--menu-list.menu-list--dropdown, .menu-list--dropdown')
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

  // === alt-text generation ===
  const applied = await generateAltForImages(); // returns [{src, alt}]
  return applied;
}

async function generateAltForImages({ prefer = 'gemini', concurrency = 5, requestTimeoutMs = 15000 } = {}) {
  console.log('run gen alt');

  // collect targets (no existing alt)
  const imgs = [...document.querySelectorAll('img')].filter(img => !img.getAttribute('alt')?.trim());
  if (!imgs.length) return [];

  // de-duplicate srcs to avoid repeated calls
  const uniqueSrcs = [...new Set(imgs.map(i => i.src).filter(Boolean))];

  // 1) Try global cache first (cross-page reuse)
  let hits = [], misses = uniqueSrcs;
  try {
    const resp = await fetch('http://localhost:3000/alt-lookup', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ srcs: uniqueSrcs })
    });
    if (resp.ok) {
      const data = await resp.json(); // {hits:[{src,alt}], misses:[...]}
      hits = data.hits || [];
      misses = data.misses || uniqueSrcs;
    }
  } catch (e) {
    console.warn('alt-lookup failed; will generate for all:', e);
  }

  const hitMap = new Map(hits.map(h => [h.src, h.alt]));
  const applied = [];

  // Apply cache hits immediately
  for (const img of imgs) {
    const a = hitMap.get(img.src);
    if (a) {
      img.setAttribute('alt', a);
      applied.push({ src: img.src, alt: a });
    }
  }

  // 2) Prepare generation list from remaining images
  const remainingImgs = imgs.filter(i => !i.getAttribute('alt')?.trim());

  // Split remaining into SVGs (local fallback) vs others (server)
  const svgImgs = remainingImgs.filter(i => isSvgSrc(i.src));
  const nonSvgImgs = remainingImgs.filter(i => !isSvgSrc(i.src));

  // SVG filename fallback (fast, no network)
  for (const img of svgImgs) {
    const alt = filenameAlt(img.src);
    img.setAttribute('alt', alt);
    applied.push({ src: img.src, alt });
  }

  // Generate for non-SVGs with concurrency + timeout
  let idx = 0;
  async function worker() {
    while (idx < nonSvgImgs.length) {
      const img = nonSvgImgs[idx++];
      const src = img.src;
      try {
        const ctrl = new AbortController();
        const to = setTimeout(()=>ctrl.abort('timeout'), requestTimeoutMs);
        const r = await fetch('http://localhost:3000/generate-alt-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: src, prefer }),
          signal: ctrl.signal
        });
        clearTimeout(to);
        if (!r.ok) throw new Error('HTTP '+r.status);
        const j = await r.json();
        if (j && j.altText) {
          img.setAttribute('alt', j.altText);
          applied.push({ src, alt: j.altText });
        }
      } catch (e) {
        console.warn('ALT gen failed', src, e);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, nonSvgImgs.length)) }, worker));

  console.log('applied', applied);
  return applied; // <-- important
} 

async function lookupCachedAlts(srcs) {
  try {
    const r = await fetch('http://localhost:3000/alt-lookup', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ srcs })
    });
    // console.log("r:", r);
    // console.log("r.json():", r.json());
    if (!r.ok) return { hits: [], misses: srcs };
    return await r.json(); // { hits:[{src,alt}], misses:[...] }
  } catch (e) {
    console.warn('alt-lookup failed', e);
    return { hits: [], misses: srcs };
  }
}

async function fetchPageFixes() {
    try {
        const url = new URL('http://localhost:3000/fixes');
        url.searchParams.set('url', location.href);
        const r = await fetch(url.toString(), { method: 'GET' });
        
        // console.log("r:", r);
        // console.log("r.json():", r.json());
        if (!r.ok) return null;
        return await r.json();
    } catch (e) {
        console.warn('fetchPageFixes failed:', e);
        return null;
    }
}

async function savePageFixes(alts, meta = {}) {
  console.log("savePageFixes");
    try {
        await fetch('http://localhost:3000/save-fixes', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ url: location.href, alts, meta })
        });
    } catch (e) {
        console.warn('savePageFixes failed:', e);
    }
}
