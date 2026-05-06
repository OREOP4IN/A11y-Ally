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
        sendResponse({ ok: true, data: 'production' });
        return true;
    }
});

// ============================================================================
// KEYBOARD SHORTCUTS LISTENER
// ============================================================================

chrome.commands.onCommand.addListener((command) => {
    const commandMap = {
        "toggle-auto-fix": { key: "autoFixEnabled", type: "RELOAD_TAB" },
        "toggle-dyslexia": { key: "dyslexiaFontEnabled", type: "TOGGLE_DYSLEXIA_FONT" },
        "toggle-reading-mask": { key: "readingMaskEnabled", type: "TOGGLE_READING_MASK" },
        "toggle-stop-anim": { key: "stopAnimationEnabled", type: "TOGGLE_STOP_ANIMATION" },
        "toggle-links": { key: "highlightLinksEnabled", type: "TOGGLE_HIGHLIGHT_LINKS" },
        "toggle-spacing": { key: "textSpacingEnabled", type: "TOGGLE_TEXT_SPACING" },
        "toggle-cursor": { key: "bigCursorEnabled", type: "TOGGLE_BIG_CURSOR" },
        "toggle-tts": { key: "ttsEnabled", type: "TOGGLE_TTS" }
    };

    if (commandMap[command]) {
        const { key, type } = commandMap[command];
        
        // 1. Ambil status saat ini dari chrome.storage.sync biar sinkron antar device
        chrome.storage.sync.get({ [key]: false }, (res) => {
            const newState = !res[key];
            
            // 2. Simpan status baru
            chrome.storage.sync.set({ [key]: newState }, () => {
                
                // 3. Kirim perintah ke tab yang sedang aktif
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs[0]?.id) {
                        // Khusus Auto Fix, reload tab agar script berjalan ulang dari awal
                        if (type === "RELOAD_TAB") {
                            chrome.tabs.reload(tabs[0].id);
                        } else {
                            // Untuk Visual Aids, kirim pesan langsung agar berubah tanpa reload
                            chrome.tabs.sendMessage(tabs[0].id, { 
                                type: type, 
                                enabled: newState 
                            }).catch(() => console.log("Content script belum siap/berjalan di halaman ini."));
                        }
                    }
                });
            });
        });
    }
});