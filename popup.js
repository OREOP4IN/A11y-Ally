// File: popup.js

const scanButton = document.getElementById('scan-button');
const manualFixButton = document.getElementById('manual-fix-button');
const resultsDiv = document.getElementById('results');
const altTextButton = document.getElementById('alt-text-button'); // Add this button to popup.html

// Event listener for the Manual Fix button (no changes here)
manualFixButton.addEventListener('click', async () => {
    resultsDiv.textContent = 'Applying general fixes...';
    console.log("check manual fix");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log("check tab", tab);
    chrome.tabs.sendMessage(tab.id, { type: "RUN_MANUAL_FIXES" });
    resultsDiv.textContent = 'General fixes command sent!';
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
        console.log("response:", response);
        console.log("response:", response.html);
        
        if (!response || !response.html) {
            throw new Error("Could not get HTML from content script.");
        }
        resultsDiv.textContent = 'HTML received. Sending to Pa11y backend for scanning...';
        console.log("test: ", resultsDiv.textContent);
        
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
        console.log("report: ", report);
        // The report structure from pa11y-ci changes slightly for a single scan
        resultsDiv.textContent = `Scan complete! Found ${report.total} issues on the modified page.`;
        console.log("report results: ", report.results); // Log results for inspection

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