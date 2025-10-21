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
        await sendMessageAsync(tab.id, { type: "RUN_MANUAL_FIXES" }); // waits for content reply
        resultsDiv.textContent = 'Fixes applied. You can scan now.';
    } catch (e) {
        resultsDiv.textContent = 'Fixes failed: ' + e.message;
        console.error(e);
    } finally {
        scanButton.disabled = false;
        manualFixButton.disabled = false;
    }
});

// MODIFIED: Event listener for the Pa11y Scan button
scanButton.addEventListener('click', async () => {
    resultsDiv.textContent = 'Getting modified HTML from page...';
    scanButton.disabled = true;
    manualFixButton.disabled = true;

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // 1. Ask content script for the current page's HTML
        const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_HTML" });
        
        if (!response || !response.html) {
            throw new Error("Could not get HTML from content script.");
        }
        resultsDiv.textContent = 'HTML received. Sending to Pa11y backend for scanning...';
        
        // 2. Send the raw HTML to the backend
        const scanResponse = await fetch('http://localhost:3000/run-pa11y', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ html: response.html }), // Send HTML, not URL
        });
        console.log("scanResponse: ", scanResponse);
        
        if (!scanResponse.ok) {
            throw new Error(`Server responded with status: ${scanResponse.status}`);
        }
        
        const report = await scanResponse.json();
        resultsDiv.textContent = `Scan complete! Found ${Object.values(report.results)[0].length} issues on the modified page.`;
        console.log("report: ", report); // Log results for inspection
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
        const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_HTML" });
        
        if (!response || !response.html) {
            throw new Error("Could not get HTML from content script.");
        }
        resultsDiv.textContent = 'HTML received. Sending to Pa11y backend for scanning...';
        
        const scanResponse = await fetch('http://localhost:3000/run-pa11y', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ html: response.html }), // Send HTML, not URL
        });
        console.log("scanResponse: ", scanResponse);
        
        if (!scanResponse.ok) {
            throw new Error(`Server responded with status: ${scanResponse.status}`);
        }
        
        console.log('alhamdullilah');
        const pa11yReport = await scanResponse.json();
        console.log('bisa coy', pa11yReport);
        
        // Send the Pa11y report to the content script for generating A11Y CSS
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, {
                type: 'GENERATE_A11Y_CSS',
                report: pa11yReport
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
