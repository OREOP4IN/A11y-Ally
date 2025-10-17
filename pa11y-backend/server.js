// File: server.js

const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

const vision = require('@google-cloud/vision');
const { VertexAI } = require('@google-cloud/vertexai');

// Configure from env or hardcode like your PHP config
const GCP_PROJECT_ID = process.env.GEMINI_PROJECT_ID || 'kemahasiswaan-itb';
const GCP_LOCATION   = process.env.GEMINI_LOCATION   || 'us-central1'; // Gemini supported
const GEMINI_MODEL   = process.env.GEMINI_MODEL      || 'gemini-1.5-flash'; // available & fast

// Vision preferences like your CI3 config
const VISION_MAX_LABELS = Number(process.env.VISION_MAX_LABELS || 5);
const VISION_MIN_SCORE  = Number(process.env.VISION_MIN_SCORE  || 0.66);

// Instantiate clients (uses GOOGLE_APPLICATION_CREDENTIALS if set)
const visionClient = new vision.ImageAnnotatorClient(); // {keyFilename: '...'} if you prefer inline

const vertexAI = new VertexAI({ project: GCP_PROJECT_ID, location: GCP_LOCATION });
const generativeModel = vertexAI.getGenerativeModel({ model: GEMINI_MODEL });

console.log(GCP_PROJECT_ID
    ,GCP_LOCATION
    ,GEMINI_MODEL
    ,VISION_MAX_LABELS
    ,VISION_MIN_SCORE
);

// const { ImageAnnotatorClient } = require('@google-cloud/vision');
// const visionClient = new ImageAnnotatorClient();
// const visionClient = new ImageAnnotatorClient({
//     keyFilename: '../../Cloud Keys/kemahasiswaan-itb-1cc319a505d5.json',  // path to your service account key file
// });
// const { aiplatform } = require('@google-cloud/aiplatform');
// const client = new aiplatform.PredictionServiceClient();

async function generateAltText(imageUrl) {
    console.log("test imageUrl:", imageUrl);
    const [result] = await visionClient.labelDetection(imageUrl);
    console.log("result:", result);
    const labels = result.labelAnnotations;
    const altText = labels.map(label => label.description).join(", ");
    console.log("labels:", labels);
    console.log("altText:", altText);
    return altText;
}

async function generateAltTextWithVision(imageUrl) {
  // Use imageUri so Vision downloads the URL itself
  const [result] = await visionClient.labelDetection({ image: { source: { imageUri: imageUrl } } });
  const labels = (result.labelAnnotations || [])
    .filter(l => (l.score || 0) >= VISION_MIN_SCORE)
    .slice(0, VISION_MAX_LABELS)
    .map(l => l.description);

  // Basic phrasing like your PHP config style
  const alt = labels.join(', ');
  return alt || 'Image';
}

// const modelEndpoint = 'projects/YOUR_PROJECT_ID/locations/YOUR_REGION/publishers/google/models/YOUR_MODEL_NAME/versions/YOUR_VERSION_NAME';
// Gemini multimodal caption (short, a11y-friendly)
async function generateAltTextWithGemini(imageUrl) {
    const resp = await fetch(imageUrl);
    if (!resp.ok) throw new Error(`Fetch image failed: ${resp.status}`);
    const buf = Buffer.from(await resp.arrayBuffer());

    // Guess mime (simple)
    let mimeType = 'image/jpeg';
    const u = imageUrl.toLowerCase();
    if (u.endsWith('.png')) mimeType = 'image/png';
    if (u.endsWith('.webp')) mimeType = 'image/webp';

    const request = {
        contents: [{
        role: 'user',
        parts: [
            { inlineData: { mimeType, data: buf.toString('base64') } },
            { text: 'Write a concise, neutral ALT text (<=120 chars), no branding, no speculation.' }
        ]
        }],
        generationConfig: { maxOutputTokens: 64, temperature: 0.2 }
    };

    const result = await generativeModel.generateContent(request);
    const out = await result.response;
    const text = out.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    // Fallback if empty
    return text || 'Image';
    }

// app.post('/generate-alt-text', async (req, res) => {
//     const { imageUrl } = req.body;
//     console.log('Received image URL:', imageUrl);

//     if (!imageUrl) {
//         return res.status(400).json({ error: 'Image URL is required' });
//     }

//     try {
//         let altText;

//         if (config.gemini_mode === 'vertex') {
//             // altText = await generateAltTextWithGemini(imageUrl);  // Use Gemini (Vertex AI)
//             altText = await generateAltText(imageUrl);  // Use Vision API
//         } else {
//             altText = await generateAltText(imageUrl);  // Use Vision API
//         }

//         res.json({ altText });
//         console.log('Alt text generated:', altText);
//     } catch (error) {
//         console.error('Error generating alt text:', error);
//         res.status(500).json({ error: 'Failed to generate alt text' });
//     }
// });

app.use(cors());
app.use(express.json({ limit: '50mb' })); // payload limit to handle large HTML strings

app.post('/generate-alt-text', async (req, res) => {
    const { imageUrl, prefer = 'gemini' } = req.body || {};
    if (!imageUrl) return res.status(400).json({ error: 'Image URL is required' });

    try {
        let alt = '';
        if (prefer === 'vision') {
        alt = await generateAltTextWithVision(imageUrl);
        } else {
            try {
                alt = await generateAltTextWithGemini(imageUrl);
            } catch (e) {
                console.warn('Gemini failed, falling back to Vision:', e.message);
                alt = await generateAltTextWithVision(imageUrl);
            }
        }
        // Trim to your CI3 config style
        const MAX_LEN = 120;
        if (alt.length > MAX_LEN) alt = alt.slice(0, MAX_LEN - 1) + '…';
        res.json({ altText: alt });
    } catch (err) {
        console.error('Error generating alt:', err);
        res.status(500).json({ error: 'Failed to generate alt text' });
    }
});



app.post('/run-pa11y', (req, res) => {
    // expect 'html' in the body, not 'url' so we can get the newest version after running the fixes
    const { html } = req.body;

    if (!html) {
        return res.status(400).json({ error: 'HTML content is required' });
    }

    console.log(`Received HTML content for scanning.`);

    // Write the HTML to a temporary file
    const tempHtmlPath = path.join(__dirname, 'temp_scan.html');
    console.log(`Writing HTML to ${tempHtmlPath}`);
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

    const command = `npm run -s pa11y:run -- --config "${configPath}" --reporter json`;

    console.log(`Running Pa11y with command: ${command}`);

    const fileContent = fs.readFileSync(configPath, 'utf8');

    // Log the content
    console.log('--- Config File Content (Read from Disk) ---');
    console.log(fileContent);
    console.log('-------------------------------------------');
    console.log(html);
    console.log('-------------------------------------------');

    exec(command, { cwd: __dirname, windowsHide: true, shell: true }, (error, stdout, stderr) => {
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