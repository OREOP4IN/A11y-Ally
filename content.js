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
    if (alignValue) { el.style.textAlign = alignValue; }
    el.removeAttribute('align');
  });
    console.log('align')

    // Adds alt and title attributes to anchors
  document.querySelectorAll('a').forEach(anchor => {
    const anchorText = anchor.textContent.trim();
    if (anchorText) {
      anchor.setAttribute('alt', anchorText);
      anchor.setAttribute('title', anchorText);
    }
  });
    console.log('anchor')

    // Fixes duplicate element IDs
  const ids = {};
  document.querySelectorAll('[id]').forEach(element => {
    let id = element.id;
    if (ids[id]) {
      element.id = `${id}_${ids[id]++}`;
    } else {
      ids[id] = 1;
    }
  });
    console.log('duplicate ids')

    // Replaces obsolete <center> tags
  document.querySelectorAll('center').forEach(center => {
    const div = document.createElement('div');
    div.innerHTML = center.innerHTML;
    div.style.textAlign = 'center';
    center.parentNode.replaceChild(div, center);
  });
    console.log('center')

    // Improves accessibility for buttons
  document.querySelectorAll('button').forEach(button => {
    let name = button.getAttribute('aria-label') || button.getAttribute('title') || button.textContent.trim() || button.id.trim() || 'Button';
    name = name.replace(/([a-z])([A-Z])/g, '$1 $2');
    button.setAttribute('aria-label', name);
    button.setAttribute('title', name);
  });
    console.log('button')

    // Improves accessibility for iframes
  document.querySelectorAll('iframe').forEach(iframe => {
    if (!iframe.hasAttribute('title') || iframe.getAttribute('title').trim() === '') {
      iframe.setAttribute('title', 'Embedded Content');
    }
  });
    console.log('iframe')

    // Removes empty headings
  document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
    if (!heading.textContent.trim()) { heading.remove(); }
  });
    console.log('heading')

  // Generate alts for remaining images without alt
  const applied = await generateAltForImages();   // <-- return [{src, alt}]
  console.log('Alt text generation completed.');
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
