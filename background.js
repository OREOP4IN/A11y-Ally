const BACKEND_URL = 'https://pa11y-backend-tisgwzdora-et.a.run.app';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    
    // 1. ALT LOOKUP (Proxy)
    if (msg.type === 'ALT_LOOKUP') {
        fetch(`${BACKEND_URL}/alt-lookup`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ srcs: msg.srcs })
        })
        .then(r => r.json())
        .then(data => sendResponse({ ok: true, data }))
        .catch(e => sendResponse({ ok: false, error: e.message }));
        return true; 
    }

    // 2. GENERATE ALT (Proxy)
    if (msg.type === 'GEN_ALT') {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), msg.requestTimeoutMs || 15000);
        
        fetch(`${BACKEND_URL}/generate-alt-text`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl: msg.src, prefer: msg.prefer }),
            signal: ctrl.signal
        })
        .then(r => { clearTimeout(to); return r.json(); })
        .then(data => sendResponse({ ok: true, data }))
        .catch(e => sendResponse({ ok: false, error: e.message }));
        return true;
    }

    // 3. SAVE FIXES (Proxy)
    if (msg.type === 'SAVE_FIXES') {
        fetch(`${BACKEND_URL}/save-fixes`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: msg.location, alts: msg.alts, meta: msg.meta })
        })
        .then(r => r.json())
        .then(data => sendResponse({ ok: true, data }))
        .catch(e => sendResponse({ ok: false, error: e.message }));
        return true;
    }

    // 4. RUN PA11Y (Proxy)
    if (msg.type === 'RUN_PA11Y') {
        fetch(`${BACKEND_URL}/run-pa11y`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: msg.url })
        })
        .then(r => r.json())
        .then(data => {
            if (data.total == 1 && data.errors == 0 && data.passes == 0) {
                 sendResponse({ ok: false, error: "Pa11y timed out" });
            } else {
                 sendResponse({ ok: true, data });
            }
        })
        .catch(e => sendResponse({ ok: false, error: e.message }));
        return true;
    }

    // 5. ENV CHECK
    if (msg.type === 'ENV_MODE') {
        // Optional endpoint, if you have it
        sendResponse({ ok: true, data: 'production' });
        return true;
    }
});