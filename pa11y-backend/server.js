// File: server.js

const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' })); // payload limit to handle large HTML strings

app.post('/run-pa11y', (req, res) => {
    // expect 'html' in the body, not 'url' so we can get the newest version after running the fixes
    const { html } = req.body;

    if (!html) {
        return res.status(400).json({ error: 'HTML content is required' });
    }

    console.log(`Received HTML content for scanning.`);

    // Write the HTML to a temporary file
    const tempHtmlPath = path.join(__dirname, 'temp_scan.html');
    fs.writeFileSync(tempHtmlPath, html);

    // Pa11y config to scan the local temp file
    const pa11yConfig = {
        defaults: {
            timeout: 30000,
            standard: "WCAG2AA",
            ignore: [],
            level: "error",
            puppeteerArgs: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-gpu",
                "--headless",
                "--disable-dev-shm-usage",
                "--disable-software-rasterizer"
            ],
            "chromeLaunchConfig": { "args": ["--no-sandbox"] }
        },
        urls: [`file://${tempHtmlPath}`]
    };

    const configPath = path.join(__dirname, 'temp_pa11yci.json');
    fs.writeFileSync(configPath, JSON.stringify(pa11yConfig, null, 2));

    const command = `pa11y-ci --config ${configPath} --reporter json`;

    exec(command, (error, stdout, stderr) => {
        // Clean up the temp files
        fs.unlinkSync(configPath);
        fs.unlinkSync(tempHtmlPath);

        if (error && error.code !== 2) {
            console.error(`Exec error: ${error}`);
            return res.status(500).json({ error: 'Failed to run Pa11y', details: stderr });
        }

        try {
            const report = JSON.parse(stdout);
            console.log('Scan complete. Sending report to extension.');
            res.json(report);
        } catch (parseError) {
            console.error('Failed to parse Pa11y output:', parseError);
            res.status(500).json({ error: 'Failed to parse Pa11y output' });
        }
    });
});

app.listen(port, () => {
    console.log(`Pa11y backend listening at http://localhost:${port}`);
});