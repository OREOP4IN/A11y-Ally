const KEY = 'autoFixEnabled';

// --- HELPER FUNCTIONS ---

async function getSetting() {
  const data = await chrome.storage.sync.get({ [KEY]: true });
  return data[KEY];
}

async function setSetting(value) {
  await chrome.storage.sync.set({ [KEY]: value });
}

// Fungsi helper untuk tombol Grid (Visual Aids)
function setupToggleBtn(elementId, storageKey, messageType) {
  const btn = document.getElementById(elementId);
  if (!btn) return; // Guard clause jika elemen tidak ada di HTML

  // 1. Load state awal
  chrome.storage.sync.get({ [storageKey]: false }, (data) => {
    if (data[storageKey]) {
      btn.classList.add('active');
    }
  });

  // 2. Click Listener
  btn.addEventListener('click', () => {
    const isActive = btn.classList.toggle('active');
    
    // Simpan storage
    chrome.storage.sync.set({ [storageKey]: isActive });

    // Kirim pesan ke tab aktif
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: messageType,
          enabled: isActive
        });
      }
    });
  });
}

// --- MAIN EVENT LISTENER ---

document.addEventListener('DOMContentLoaded', async () => {
  // 1. DEFINISI ELEMENT
  const autoFixToggle = document.getElementById('autoFixToggle');
  const dyslexiaToggle = document.getElementById('dyslexiaToggle');
  const scanButton = document.getElementById('scan-button');
  const resultsDiv = document.getElementById('results'); // Utk pesan error kecil
  
  // Element untuk Kotak Audit Baru
  const auditContainer = document.getElementById('audit-container');
  const auditOutput = document.getElementById('audit-output');
  const closeAudit = document.getElementById('close-audit');

  // 2. LOGIKA AUTO FIX TOGGLE
  chrome.storage.sync.get({ autoFixEnabled: false }, ({ autoFixEnabled }) => {
    if (autoFixToggle) autoFixToggle.checked = autoFixEnabled;
  });

  if (autoFixToggle) {
    autoFixToggle.addEventListener('change', () => {
      const enabled = autoFixToggle.checked;
      chrome.storage.sync.set({ autoFixEnabled: enabled }, () => {
        // Reload halaman agar Auto Fix berjalan dari awal
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) chrome.tabs.reload(tabs[0].id);
        });
      });
    });
  }

  // 3. LOGIKA DYSLEXIA FONT TOGGLE
  chrome.storage.sync.get({ dyslexiaFontEnabled: false }, (data) => {
    if (dyslexiaToggle) dyslexiaToggle.checked = data.dyslexiaFontEnabled;
  });

  if (dyslexiaToggle) {
    dyslexiaToggle.addEventListener('change', () => {
      const enabled = dyslexiaToggle.checked;
      chrome.storage.sync.set({ dyslexiaFontEnabled: enabled });
      
      // Kirim pesan langsung tanpa reload
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

  // 4. SETUP TOMBOL GRID (VISUAL AIDS)
  setupToggleBtn('btnReadingMask', 'readingMaskEnabled', 'TOGGLE_READING_MASK');
  setupToggleBtn('btnStopAnim', 'stopAnimationEnabled', 'TOGGLE_STOP_ANIMATION');
  setupToggleBtn('btnLinks', 'highlightLinksEnabled', 'TOGGLE_HIGHLIGHT_LINKS');
  setupToggleBtn('btnSpacing', 'textSpacingEnabled', 'TOGGLE_TEXT_SPACING');
  setupToggleBtn('btnCursor', 'bigCursorEnabled', 'TOGGLE_BIG_CURSOR');
  setupToggleBtn('btnTTS', 'ttsEnabled', 'TOGGLE_TTS');

  // 5. LOGIKA MANUAL AUDIT (PA11Y SCAN)
  if (scanButton) {
    scanButton.addEventListener('click', async () => {
      // A. Siapkan UI: Tampilkan kotak, disable tombol
      if (auditContainer) auditContainer.classList.remove('hidden');
      if (auditOutput) auditOutput.value = 'Preparing URL for Pa11y Scan...\nPlease wait, this may take 10-20 seconds.';
      
      scanButton.disabled = true;
      if (resultsDiv) resultsDiv.textContent = '';

      try {
        // B. Ambil URL Tab Aktif
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url) throw new Error('Active tab URL not available.');

        const disallowed = /^(chrome|edge|about|chrome-extension):\/\//i;
        if (disallowed.test(tab.url)) {
          throw new Error('Cannot scan internal browser pages.');
        }

        if (auditOutput) auditOutput.value += `\n\nTarget URL: ${tab.url}\nSending request to server...`;

        // C. Panggil API Server (Pa11y)
        // Pastikan backend server Anda jalan di port 3000
        const scanResponse = await fetch('https://pa11y-backend-tisgwzdora-et.a.run.app/run-pa11y', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: tab.url })
        });

        if (!scanResponse.ok) {
          const t = await scanResponse.text().catch(() => '');
          throw new Error(`Server Error ${scanResponse.status}: ${t}`);
        }

        const report = await scanResponse.json();
        
        // D. Format Hasil Laporan ke Text Area
        const issues = report.results?.issues || [];
        const issueCount = issues.length;
        
        let formattedLog = `[SCAN COMPLETE]\n`;
        formattedLog += `URL: ${report.results?.documentTitle || tab.url}\n`;
        formattedLog += `Total Issues: ${issueCount}\n`;
        formattedLog += `----------------------------------------\n`;

        if (issueCount === 0) {
          formattedLog += `✅ No accessibility issues found!\n`;
        } else {
          issues.forEach((issue, index) => {
            formattedLog += `[${index + 1}] Code: ${issue.code}\n`;
            formattedLog += `    Msg: ${issue.message}\n`;
            formattedLog += `    Selector: ${issue.selector}\n\n`;
          });
        }

        if (auditOutput) auditOutput.value = formattedLog;

      } catch (error) {
        console.error(error);
        const errorMsg = `[SCAN FAILED]\nError: ${error.message}\n\nEnsure your backend server is running.`;
        if (auditOutput) auditOutput.value = errorMsg;
        if (resultsDiv) resultsDiv.textContent = 'Scan failed. Check details below.';
      } finally {
        scanButton.disabled = false;
      }
    });
  }

  // 6. LOGIKA TOMBOL CLOSE AUDIT
  if (closeAudit && auditContainer) {
    closeAudit.addEventListener('click', () => {
      auditContainer.classList.add('hidden');
    });
  }

});