const KEY = 'autoFixEnabled';
const BACKEND_URL = 'https://pa11y-backend-tisgwzdora-et.a.run.app/run-pa11y';
// const BACKEND_URL = 'http://localhost:3000/run-pa11y';

// --- HELPER FUNCTIONS ---

// Helper for Grid Buttons
function setupToggleBtn(elementId, storageKey, messageType) {
  const btn = document.getElementById(elementId);
  if (!btn) return; 

  // 1. Load initial state
  chrome.storage.sync.get({ [storageKey]: false }, (data) => {
    console.log(` Check feature state [${storageKey}]:`, data[storageKey] ? "ACTIVE" : "NONACTIVE", data);
    if (data[storageKey]) {
      btn.classList.add('active');
    }
  });

  // 2. Click Listener
  btn.addEventListener('click', () => {
    const isActive = btn.classList.toggle('active');
    
    // Save to storage
    chrome.storage.sync.set({ [storageKey]: isActive });

    // Send message to active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: messageType,
          enabled: isActive
        });
      }
    });
  });

  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); // Mencegah scrolling halaman pas spasi ditekan
      btn.click();
    }
  });
}

// --- MAIN EVENT LISTENER ---

document.addEventListener('DOMContentLoaded', async () => {
  // 1. DEFINE ELEMENTS
  const autoFixToggle = document.getElementById('autoFixToggle');
  const dyslexiaToggle = document.getElementById('dyslexiaToggle');
  
  // Audit Elements
  const scanButton = document.getElementById('scan-button');
  const auditContainer = document.getElementById('audit-container');
  const auditOutput = document.getElementById('audit-output');
  const closeAudit = document.getElementById('close-audit');
  
  // --- Tombol Download Audit ---
  const downloadAuditBtn = document.getElementById('download-audit-btn');
  let latestAuditReport = null;

  // 2. AUTO FIX TOGGLE LOGIC
  chrome.storage.sync.get({ autoFixEnabled: false }, ({ autoFixEnabled }) => {
    if (autoFixToggle) autoFixToggle.checked = autoFixEnabled;
  });

  if (autoFixToggle) {
    autoFixToggle.addEventListener('change', () => {
      const enabled = autoFixToggle.checked;
      chrome.storage.sync.set({ autoFixEnabled: enabled }, () => {
        // Reload page to apply/remove auto-fixes cleanly
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) chrome.tabs.reload(tabs[0].id);
        });
      });
    });
  }

  // 3. DYSLEXIA FONT TOGGLE LOGIC
  chrome.storage.sync.get({ dyslexiaFontEnabled: false }, (data) => {
    if (dyslexiaToggle) dyslexiaToggle.checked = data.dyslexiaFontEnabled;
  });

  if (dyslexiaToggle) {
    dyslexiaToggle.addEventListener('change', () => {
      const enabled = dyslexiaToggle.checked;
      chrome.storage.sync.set({ dyslexiaFontEnabled: enabled });
      
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'TOGGLE_DYSLEXIA_FONT',
            enabled: enabled
          });
        }
      });
    });
  }

  // 4. SETUP VISUAL AID BUTTONS
  setupToggleBtn('btnReadingMask', 'readingMaskEnabled', 'TOGGLE_READING_MASK');
  setupToggleBtn('btnStopAnim', 'stopAnimationEnabled', 'TOGGLE_STOP_ANIMATION');
  setupToggleBtn('btnLinks', 'highlightLinksEnabled', 'TOGGLE_HIGHLIGHT_LINKS');
  setupToggleBtn('btnSpacing', 'textSpacingEnabled', 'TOGGLE_TEXT_SPACING');
  setupToggleBtn('btnCursor', 'bigCursorEnabled', 'TOGGLE_BIG_CURSOR');
  setupToggleBtn('btnTTS', 'ttsEnabled', 'TOGGLE_TTS');

  // 5. MANUAL AUDIT LOGIC (PA11Y SCAN)
  if (scanButton) {
    scanButton.addEventListener('click', async () => {
      // A. UI Preparation
      if (auditContainer) auditContainer.classList.remove('hidden');
      scanButton.disabled = true;
      
      // Get Scan Mode (URL vs HTML)
      const radioInput = document.querySelector('input[name="scanSource"]:checked');
      const mode = radioInput ? radioInput.value : 'url';
      
      if (auditOutput) {
        auditOutput.value = mode === 'html' 
          ? '⏳ Snapshotting DOM & Scanning Fixed Content...\n(This ensures local fixes are audited)' 
          : '⏳ Connecting to URL & Scanning Original...\n(This audits the public server version)';
      }

      try {
        // B. Get Active Tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url) throw new Error('Active tab URL not available.');

        const disallowed = /^(chrome|edge|about|chrome-extension|file):\/\//i;
        if (disallowed.test(tab.url)) {
          throw new Error('Cannot scan internal browser pages.');
        }

        // C. Prepare Payload based on Mode
        let payload = { url: tab.url };

        if (mode === 'html') {
          // Send message to content.js to get the serialized HTML
          const response = await new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(tab.id, { type: 'GET_HTML' }, (resp) => {
              if (chrome.runtime.lastError) {
                // Usually happens if content script isn't loaded (e.g. restricted page)
                return reject(new Error('Cannot communicate with page. Try refreshing.'));
              }
              if (!resp || !resp.ok) {
                return reject(new Error('Content script failed to return HTML.'));
              }
              resolve(resp);
            });
          });
          console.log('resp', response);
          
          payload.html = response.html; // Attach raw HTML
          console.log('payload: ', payload);
          if (auditOutput) auditOutput.value += `\n\n HTML Size: ${(payload.html.length / 1024).toFixed(2)} KB`;
        }

        // D. Send to Backend
        if (auditOutput) auditOutput.value += `\n Sending to Backend (${mode.toUpperCase()})...`;

        const scanResponse = await fetch(BACKEND_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!scanResponse.ok) {
          const t = await scanResponse.text().catch(() => '');
          throw new Error(`Server Error ${scanResponse.status}: ${t}`);
        }

        const report = await scanResponse.json();
        console.log('report :', report);

        latestAuditReport = report;
        
        // E. Format Report
        const issues = report.results?.issues || [];
        const issueCount = issues.length;
        
        let formattedLog = `[SCAN COMPLETE - ${mode.toUpperCase()}]\n`;
        formattedLog += `Page: ${report.results?.documentTitle || 'Untitled'}\n`;
        formattedLog += `Issues Found: ${issueCount}\n`;
        formattedLog += `----------------------------------------\n`;

        if (issueCount === 0) {
          formattedLog += `✅ No accessibility issues found!\n(Great job!)`;
        } else {
          // Limit display to first 50 issues to prevent lagging the textarea
          console.log((issues));
          issues.slice(0, 50).forEach((issue, index) => {
            formattedLog += `[${index + 1}] Code: ${issue.code}\n`;
            formattedLog += `    Msg: ${issue.message}\n`;
            formattedLog += `    Ctx: ${issue.context}\n`;
            formattedLog += `    Sel: ${issue.selector}\n\n`;
          });
          if (issues.length > 50) formattedLog += `... plus ${issues.length - 50} more issues.`;
        }

        if (auditOutput) auditOutput.value = formattedLog;

      } catch (error) {
        console.error(error);
        const errorMsg = `[SCAN FAILED]\nError: ${error.message}\n\nTips:\n1. Ensure backend is running.\n2. Refresh page if Content Script is stuck.`;
        if (auditOutput) auditOutput.value = errorMsg;
      } finally {
        scanButton.disabled = false;
      }
    });
  }

  // 6. CLOSE AUDIT BUTTON
  if (closeAudit && auditContainer) {
    closeAudit.addEventListener('click', () => {
      auditContainer.classList.add('hidden');
    });
  }
// 7. DOWNLOAD AUDIT REPORT LOGIC (NAMA FILE MASIH HARDCODED BWT KEMAHASISWAAN ITB)
  if (downloadAuditBtn) {
    downloadAuditBtn.addEventListener('click', async () => {
      if (!latestAuditReport) {
        alert("Harap jalankan audit (Run HTML Audit) terlebih dahulu sebelum mengunduh laporan.");
        return;
      }

      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const rawUrl = tab?.url || "unknown-page";
        
        // Pembersihan : Hanya izinkan huruf, angka, dan strip
        let safeName = rawUrl.replace(/^https?:\/\//, '')
                             .replace(/[^a-zA-Z0-9]/g, '-')
                             .replace(/-+/g, '-')
                             .replace(/^-|-$/g, '')
                             .substring(24, 57); // biar skip kemahasiswaan-itb-ac-id
                             
        if (!safeName) safeName = "audit-result";
        
        // --- Ambil metode scan ---
        const radioInput = document.querySelector('input[name="scanSource"]:checked');
        const scanMode = radioInput ? radioInput.value.toUpperCase() : 'URL';
        
        // Gabungkan Mode dan Nama URL ke dalam nama file
        const finalFilename = `audit-${scanMode}-${safeName}.json`;
        
        const jsonString = JSON.stringify(latestAuditReport, null, 2);
        
        // --- TRIK KLASIK TAG <a> (ANTI-GAGAL) ---
        const blob = new Blob([jsonString], { type: "application/json" });
        const blobUrl = URL.createObjectURL(blob);

        // Buat elemen link
        const downloadLink = document.createElement("a");
        downloadLink.href = blobUrl;
        downloadLink.download = finalFilename; // Paksa nama file di sini
        
        // Suntikkan ke HTML, klik secara otomatis, lalu remove
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        
        // Bersihkan memori
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

        console.log("Berhasil diunduh dengan nama:", finalFilename);

      } catch (err) {
        console.error("Error saat menyiapkan unduhan:", err);
      }
    });
  }
  // ============================================================================
  // SYNC UI IF CHANGED VIA KEYBOARD SHORTCUTS
  // ============================================================================
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
      if (changes.readingMaskEnabled) document.getElementById('btnReadingMask')?.classList.toggle('active', changes.readingMaskEnabled.newValue);
      if (changes.stopAnimationEnabled) document.getElementById('btnStopAnim')?.classList.toggle('active', changes.stopAnimationEnabled.newValue);
      if (changes.highlightLinksEnabled) document.getElementById('btnLinks')?.classList.toggle('active', changes.highlightLinksEnabled.newValue);
      if (changes.textSpacingEnabled) document.getElementById('btnSpacing')?.classList.toggle('active', changes.textSpacingEnabled.newValue);
      if (changes.bigCursorEnabled) document.getElementById('btnCursor')?.classList.toggle('active', changes.bigCursorEnabled.newValue);
      if (changes.ttsEnabled) document.getElementById('btnTTS')?.classList.toggle('active', changes.ttsEnabled.newValue);
      
      if (changes.autoFixEnabled && autoFixToggle) autoFixToggle.checked = changes.autoFixEnabled.newValue;
      if (changes.dyslexiaFontEnabled && dyslexiaToggle) dyslexiaToggle.checked = changes.dyslexiaFontEnabled.newValue;
    }
  });

});