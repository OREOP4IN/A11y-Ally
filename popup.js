const resultsDiv = document.getElementById('results');
const manualFixButton = document.getElementById('manual-fix-button');
const scanButton = document.getElementById('scan-button');
const altTextButton = document.getElementById('alt-text-button');
const a11yCssButton = document.getElementById('generate-a11y-css-button');

function sendMessageAsync(tabId, msg) {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, msg, (resp) => {
            if (chrome.runtime.lastError) {
                return reject(new Error(chrome.runtime.lastError.message));
            }
            if (!resp || resp.ok === false) {
                return reject(new Error(resp?.error || "No response from content script"));
            }
            resolve(resp);
        });
    });
}

// Event listener for the Manual Fix button (no changes here)
manualFixButton.addEventListener('click', async () => {
    resultsDiv.textContent = 'Applying general fixes...';
    scanButton.disabled = true;
    manualFixButton.disabled = true;
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url) throw new Error('Active tab URL not available.');

        // Disallow internal pages Pa11y/Chromium can’t fetch
        const disallowed = /^(chrome|edge|about|chrome-extension):\/\//i;
        if (disallowed.test(tab.url)) {
            throw new Error('This page type cannot be scanned. Open a normal http(s) page.');
        }

        // uncomment to keep the old HTML flow behind a flag:
        // const useHtml = false;
        // if (useHtml) { /* cari di repo lama */ }

        resultsDiv.textContent = `Sending URL to Pa11y: ${tab.url}`;

        const scanResponse = await fetch('http://localhost:3000/run-pa11y', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: tab.url }) // ✅ URL, not HTML
        });

        if (!scanResponse.ok) {
        const t = await scanResponse.text().catch(() => '');
        throw new Error(`Server ${scanResponse.status}. ${t || ''}`.trim());
        }

        const report = await scanResponse.json();
        // `report.results` is an object keyed by URL → array of issues
        const firstKey = Object.keys(report.results || {})[0];
        const issues = firstKey ? report.results[firstKey] : [];
        resultsDiv.textContent = `Scan complete! Found ${issues?.length || 0} issues on ${firstKey || tab.url}.`;
        console.log('Pa11y report:', report);
    } catch (error) {
        resultsDiv.textContent = `An error occurred: ${error.message}`;
        console.error(error);
    } finally {
        scanButton.disabled = false;
        manualFixButton.disabled = false;
    }

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await sendMessageAsync(tab.id, { type: "RUN_MANUAL_FIXES" }); // waits for content reply
        resultsDiv.textContent = 'Fixes applied. You can scan now.';
    } catch (e) {
        resultsDiv.textContent = 'Fixes failed: ' + e.message;
        console.error(e);
    } finally {
        scanButton.disabled = false;
        manualFixButton.disabled = false;
    }

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        console.log("Sending message to content script for generating alt text.");

        // Ask content script to generate alt text for images without alt attributes
        chrome.tabs.sendMessage(tab.id, { type: "GENERATE_ALT_TEXT" });

        resultsDiv.textContent = 'Alt text generation completed!';
    } catch (error) {
        resultsDiv.textContent = `An error occurred: ${error.message}`;
        console.error(error);
    } finally {
        scanButton.disabled = false;
        manualFixButton.disabled = false;
    }

    try {
        console.log('pak eko');
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // Disallow internal pages Pa11y/Chromium can’t fetch
        const disallowed = /^(chrome|edge|about|chrome-extension):\/\//i;
        if (disallowed.test(tab.url)) {
            throw new Error('This page type cannot be scanned. Open a normal http(s) page.');
        }

        // uncomment to keep the old HTML flow behind a flag:
        // const useHtml = false;
        // if (useHtml) { /* cari di repo lama */ }

        resultsDiv.textContent = `Sending URL to Pa11y: ${tab.url}`;

        const scanResponse = await fetch('http://localhost:3000/run-pa11y', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: tab.url }) // ✅ URL, not HTML
        });

        if (!scanResponse.ok) {
        const t = await scanResponse.text().catch(() => '');
        throw new Error(`Server ${scanResponse.status}. ${t || ''}`.trim());
        }

        console.log('alhamdullilah');
        const report = await scanResponse.json();
        console.log('bisa coy', report);
        
        // Send the Pa11y report to the content script for generating A11Y CSS
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, {
                type: 'GENERATE_A11Y_CSS',
                report: report
            });
        });

        resultsDiv.textContent = 'A11Y CSS generated and applied!';
    } catch (error) {
        resultsDiv.textContent = `An error occurred: ${error.message}`;
        console.error(error);
    } finally {
        scanButton.disabled = false;
        manualFixButton.disabled = false;
    }
});

// MODIFIED: Event listener for the Pa11y Scan button
scanButton.addEventListener('click', async () => {
    resultsDiv.textContent = 'Preparing URL for Pa11y…';
    scanButton.disabled = true;
    manualFixButton.disabled = true;

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url) throw new Error('Active tab URL not available.');

        // Disallow internal pages Pa11y/Chromium can’t fetch
        const disallowed = /^(chrome|edge|about|chrome-extension):\/\//i;
        if (disallowed.test(tab.url)) {
            throw new Error('This page type cannot be scanned. Open a normal http(s) page.');
        }

        // uncomment to keep the old HTML flow behind a flag:
        // const useHtml = false;
        // if (useHtml) { /* cari di repo lama */ }

        resultsDiv.textContent = `Sending URL to Pa11y: ${tab.url}`;

        const scanResponse = await fetch('http://localhost:3000/run-pa11y', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: tab.url }) // ✅ URL, not HTML
        });

        if (!scanResponse.ok) {
        const t = await scanResponse.text().catch(() => '');
        throw new Error(`Server ${scanResponse.status}. ${t || ''}`.trim());
        }

        const report = await scanResponse.json();
        // `report.results` is an object keyed by URL → array of issues
        const firstKey = Object.keys(report.results || {})[0];
        const issues = firstKey ? report.results[firstKey] : [];
        resultsDiv.textContent = `Scan complete! Found ${issues?.length || 0} issues on ${firstKey || tab.url}.`;
        console.log('Pa11y report:', report);
    } catch (error) {
        resultsDiv.textContent = `An error occurred: ${error.message}`;
        console.error(error);
    } finally {
        scanButton.disabled = false;
        manualFixButton.disabled = false;
    }
});

altTextButton.addEventListener('click', async () => {
    resultsDiv.textContent = 'Generating alt text for images...';
    scanButton.disabled = true;
    manualFixButton.disabled = true;

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        console.log("Sending message to content script for generating alt text.");

        // Ask content script to generate alt text for images without alt attributes
        chrome.tabs.sendMessage(tab.id, { type: "GENERATE_ALT_TEXT" });

        resultsDiv.textContent = 'Alt text generation completed!';
    } catch (error) {
        resultsDiv.textContent = `An error occurred: ${error.message}`;
        console.error(error);
    } finally {
        scanButton.disabled = false;
        manualFixButton.disabled = false;
    }
});

a11yCssButton.addEventListener('click', async () => {
    console.log('masok');
    resultsDiv.textContent = 'Generating A11Y CSS for contrast issues...';
    scanButton.disabled = true;
    manualFixButton.disabled = true;

    try {
        console.log('pak eko');
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // Disallow internal pages Pa11y/Chromium can’t fetch
        const disallowed = /^(chrome|edge|about|chrome-extension):\/\//i;
        if (disallowed.test(tab.url)) {
            throw new Error('This page type cannot be scanned. Open a normal http(s) page.');
        }

        // uncomment to keep the old HTML flow behind a flag:
        // const useHtml = false;
        // if (useHtml) { /* cari di repo lama */ }

        resultsDiv.textContent = `Sending URL to Pa11y: ${tab.url}`;

        const scanResponse = await fetch('http://localhost:3000/run-pa11y', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: tab.url }) // ✅ URL, not HTML
        });

        if (!scanResponse.ok) {
        const t = await scanResponse.text().catch(() => '');
        throw new Error(`Server ${scanResponse.status}. ${t || ''}`.trim());
        }

        console.log('alhamdullilah');
        const report = await scanResponse.json();
        console.log('bisa coy', report);
        
        // Send the Pa11y report to the content script for generating A11Y CSS
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, {
                type: 'GENERATE_A11Y_CSS',
                report: report
            });
        });

        resultsDiv.textContent = 'A11Y CSS generated and applied!';
    } catch (error) {
        resultsDiv.textContent = `An error occurred: ${error.message}`;
        console.error(error);
    } finally {
        scanButton.disabled = false;
        manualFixButton.disabled = false;
    }
});
