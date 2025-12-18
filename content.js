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
    console.log(`we runnin ${title}`);
    const result = await promisify(title, payload);
    console.log(`${title} result:`, result);
    return { data: result.data, ok: result.ok };
  } catch (err) {
    console.error(`${title} error:`, err);
    throw err;
  }
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  runManualFixes();
} else {
  window.addEventListener('DOMContentLoaded', runManualFixes);
}

function runManualFixes() {
  console.log('masuk async run (content.js)');
  (async () => {
    try {
      const applied = await runGeneralFixes();
      if (applied?.length) {
        try {
          await savePageFixes(applied, { source: 'auto', count: applied.length });
        } catch (e) {
          console.warn('savePageFixes failed (post-reply):', e);
        }
      }

    console.log('pak eko');
    const url = window.location.href;
    const disallowed = /^(chrome|edge|about|chrome-extension):\/\//i;

    if (disallowed.test(url)) {
      console.error('This page type cannot be scanned. Open a normal http(s) page.');
    } else {
      console.log('Scanning URL:', url);
    }

    // uncomment to keep the old HTML flow behind a flag:
    // const useHtml = false;
    // if (useHtml) { /* cari di repo lama */ }

    const pa11yResult = await runPromisify('RUN_PA11Y', { url: url });
    // (async () => {
    //   chrome.runtime.sendMessage(
    //     { type: 'RUN_PA11Y', url: url },
    //     (resp) => {
    //       if (!resp || !resp.ok) {
    //         console.error('RUN_PA11Y failed:', resp?.error);
    //         return;
    //       }
    //       console.log('RUN_PA11Y result:', resp.data);
    //       const pa11yResult = resp.data;

    //     }
    //   );
    // })();
    
    // const scanResponse = await fetch('http://localhost:3000/run-pa11y', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ url: url }) // ✅ URL, not HTML
    // });

    const pa11yReport = pa11yResult.data;
    console.log('pa11yResult:', pa11yReport);
    console.log('pa11yResult:', pa11yReport);
    console.log('pa11yResult:', JSON.stringify(pa11yResult.data));
    if (!pa11yResult.ok) {
      const t = JSON.stringify(pa11yReport);
      throw new Error(`Server ${pa11yResult.status}. ${t || ''}`.trim());
    }

    console.log('alhamdullilah');
    
    // Send the Pa11y report to the content script for generating A11Y CSS
    // chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    //   chrome.tabs.sendMessage(tabs[0].id, {
    //     type: 'GENERATE_A11Y_CSS',
    //     report: report
    //   });
    // });

    console.log('report konten sayang:', pa11yReport);
    chrome.runtime.sendMessage({
      type: 'GENERATE_A11Y_CSS',
      report: pa11yReport
    }, (response) => {
      console.log(response.message);
    });

    } catch (e) {
      console.error('runGeneralFixes failed:', e);
    }
  })();

  return true;
}
// Listen for messages from the popup
// NOTES: keknya kudu di-optimasi; beda2 metode soalnya
// content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // if (request.type === "RUN_MANUAL_FIXES") {
  //   // ASYNC branch: we will call sendResponse later -> return true
  //   (async () => {
  //     try {
  //       // Run all fixes and alt generation; collect what was applied
  //       const applied = await runGeneralFixes(); // should return [{src, alt}, ...]

  //       // Reply ASAP so popup doesn’t time out
  //       sendResponse({ ok: true, appliedCount: applied?.length || 0 });

  //       // Persist AFTER replying (fire-and-forget)
  //       if (applied?.length) {
  //         try {
  //           await savePageFixes(applied, { source: 'auto', count: applied.length });
  //         } catch (e) {
  //           console.warn('savePageFixes failed (post-reply):', e);
  //         }
  //       }
  //     } catch (e) {
  //       console.error('runGeneralFixes failed:', e);
  //       // Reply exactly once on error
  //       try { sendResponse({ ok: false, error: String(e?.message || e) }); } catch {}
  //     }
  //   })();
  //   return true; // keep port open for async sendResponse
  // }

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
    (async () => {
      try {
        const applied = await generateAltForImages(); // return [{src, alt}, ...]
        sendResponse({ ok: true, appliedCount: applied?.length || 0 });
        if (applied?.length) {
          try { await savePageFixes(applied, { source: 'manual', count: applied.length }); }
          catch (e) { console.warn('savePageFixes failed (post-reply):', e); }
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GENERATE_A11Y_CSS') {
    console.log('masok content script')
    const pa11yReport = request.report;
    console.log('report konten sayang:', pa11yReport);
    chrome.runtime.sendMessage({
      type: 'GENERATE_A11Y_CSS',
      report: pa11yReport
    }, (response) => {
      console.log(response.message);
    });
    // chrome.runtime.sendMessage({  // Ran twice incase ada yg kelewatan idk tho
    //   type: 'GENERATE_A11Y_CSS',
    //   report: pa11yReport
    // }, (response) => {
    //   console.log(response.message);
    // });
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
      // console.log('container', container);

      const button =
        container.querySelector('.menu-list--btn') ||
        container.querySelector('button');

      const panel =
        container.querySelector('.menu-list--dropdown-content') ||
        container.querySelector('div');

      // console.log('button n panel', button, panel);
      if (!button || !panel) return;
      // console.log('panel', panel);
      // console.log('panelquery', panel.querySelector('a[href]'));
      if (!panel.querySelector('a[href]')) return; // must have links

      // ensure IDs on container, button, panel
      const base = idBaseFrom(button, 'menu');
      const containerId = ensureId(container, `${base}Wrap`);
      const btnId = ensureId(button, `${base}Btn`);
      const panelId = ensureId(panel, `${base}Dropdown`);
      // console.log("btnid", btnId);

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
      // console.log(root.querySelectorAll('.menu-list--btn'));
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
      // console.log('list', list);
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

    // NOTES: JS safeguard mark elements that already have borders so CSS doesn't override
    /* //NOTES: malah ganggu img jadi gede beut kgk bisa di-overflowin
    const focusableSelectors = [
      'button', 'a[href]', 'input', 'select', 'textarea', '[tabindex]'
    ];
    const focusables = document.querySelectorAll(focusableSelectors.join(','));

    focusables.forEach(el => {
      const cs = window.getComputedStyle(el);
      const borderWidth = parseFloat(cs.borderWidth || 0);
      const outlineWidth = parseFloat(cs.outlineWidth || 0);
      if (borderWidth > 0 || outlineWidth > 0) {
        el.setAttribute('data-has-border', 'true');
      }
    }); */

  console.log('✅ Fallback keyboard navigation borders injected.');
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
  console.log('imgs', imgs);


  // de-duplicate srcs to avoid repeated calls
  const uniqueSrcs = [...new Set(imgs.map(i => i.src).filter(Boolean))];

  // 1) Try global cache first (cross-page reuse)
  let hits = [], misses = uniqueSrcs;
  const alt_lookup = await runPromisify('ALT_LOOKUP', {srcs: uniqueSrcs});
  console.log(alt_lookup.data); 
  console.log(alt_lookup.data.hits); 
  hits = alt_lookup.data.hits || [];
  misses = alt_lookup.data.misses || uniqueSrcs;
  
  console.log('hits', hits);
  console.log('misses', misses);
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

      console.log('genalt src', src);
      console.log('img', img);
      console.log('unique', uniqueSrcs);

      (async () => {
        chrome.runtime.sendMessage(
          { type: 'GEN_ALT', src: src, requestTimeoutMs: requestTimeoutMs, prefer: prefer, img: img},
          (resp) => {
            if (!resp || !resp.ok) {
              console.error('GEN_ALT failed:', resp?.error);
              return;
            }
            console.log('GEN_ALT result:', resp.data);
            const data = resp.data;
            if (data && data.altText) {
                img.setAttribute('alt', data.altText);
                applied.push({ src, alt: data.altText });
            }
          }
        );
      })();
    }

      // try {
      //   const resp = await fetch('http://localhost:3000/alt-lookup', {
      //     method: 'POST',
      //     headers: {'Content-Type':'application/json'},
      //     body: JSON.stringify({ srcs: uniqueSrcs })
      //   });
      //   if (resp.ok) {
      //     const data = await resp.json(); // {hits:[{src,alt}], misses:[...]}
      //     hits = data.hits || [];
      //     misses = data.misses || uniqueSrcs;
      //   }
      // } catch (e) {
      //   console.warn('alt-lookup failed; will generate for all:', e);
      // }
  

      // try {
      //   const ctrl = new AbortController();
      //   const to = setTimeout(()=>ctrl.abort('timeout'), requestTimeoutMs);
      //   const r = await fetch('http://localhost:3000/generate-alt-text', {
      //     method: 'POST',
      //     headers: { 'Content-Type': 'application/json' },
      //     body: JSON.stringify({ imageUrl: src, prefer }),
      //     signal: ctrl.signal
      //   });
      //   clearTimeout(to);
      //   if (!r.ok) throw new Error('HTTP '+r.status);
      //   const j = await r.json();
      //   if (j && j.altText) {
      //     img.setAttribute('alt', j.altText);
      //     applied.push({ src, alt: j.altText });
      //   }
      // } catch (e) {
      //   console.warn('ALT gen failed', src, e);
      // }
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
  console.log('locationhref', location.href);
  const locationhref = location.href;

  (async () => {
    chrome.runtime.sendMessage(
      { type: 'SAVE_FIXES', alts: alts, meta: meta, location: locationhref},
      (resp) => {
        if (!resp || !resp.ok) {
          console.error('SAVE_FIXES failed:', resp?.error);
          return;
        }
        console.log('SAVE_FIXES result:', resp.data);
        // use resp.data here
      }
    );
  })();

    // try {
    //     await fetch('http://localhost:3000/save-fixes', {
    //     method: 'POST',
    //     headers: {'Content-Type': 'application/json'},
    //     body: JSON.stringify({ url: location.href, alts, meta })
    //     });
    // } catch (e) {
    //     console.warn('savePageFixes failed:', e);
    // }
}
