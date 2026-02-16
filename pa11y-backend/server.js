if (!process.env.K_SERVICE) {
    require('dotenv').config();
}

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const pa11y = require('pa11y');
const puppeteer = require('puppeteer');
const { createClient } = require('redis'); 

const vision = require('@google-cloud/vision');
const { VertexAI } = require('@google-cloud/vertexai');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(cors({
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-API-Key'],
}));

// API Key Guard
app.use((req, res, next) => {
    const required = process.env.EXT_API_KEY;
    if (!required) return next();
    const provided = req.get('x-api-key');
    if (provided !== required) return res.status(401).json({ error: 'Unauthorized' });
    next();
});

// ==========================================
//  REDIS SETUP
// ==========================================
const redisUrl = process.env.REDIS_URL;
const redisClient = createClient({
    url: redisUrl,
    socket: {
        tls: redisUrl && redisUrl.startsWith('rediss://'),
        rejectUnauthorized: false
    }
});

redisClient.on('error', (err) => console.error('❌ Redis Client Error:', err));

(async () => {
    if (!redisUrl) {
        console.warn('⚠️ REDIS_URL not set. Caching disabled.');
        return;
    }
    try {
        await redisClient.connect();
        console.log(`✅ Connected to Redis Cloud`);
    } catch (e) {
        console.error('❌ Redis Connection Failed:', e.message);
    }
})();

// ---- GCP Config ----
const GCP_PROJECT_ID = process.env.GEMINI_PROJECT_ID || 'kemahasiswaan-itb';
const GCP_LOCATION   = process.env.GEMINI_LOCATION   || 'us-central1';
const GEMINI_MODEL   = process.env.GEMINI_MODEL      || 'gemini-1.5-flash';
const VISION_MAX_LABELS = Number(process.env.VISION_MAX_LABELS || 5);
const VISION_MIN_SCORE  = Number(process.env.VISION_MIN_SCORE  || 0.66);

const visionClient = new vision.ImageAnnotatorClient();
const vertexAI = new VertexAI({ project: GCP_PROJECT_ID, location: GCP_LOCATION });
const generativeModel = vertexAI.getGenerativeModel({ model: GEMINI_MODEL });

// ==========================================
//  SMART COLOR LOGIC
// ==========================================

function hexToRgb(hex) {
    if (!hex || typeof hex !== 'string' || !/^#?[0-9A-Fa-f]{3,6}$/i.test(hex)) return { r: 0, g: 0, b: 0 };
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16)
    };
}

function rgbToHex(rgb) {
    return `#${(1 << 24 | (rgb.r << 16) | (rgb.g << 8) | rgb.b).toString(16).slice(1).toUpperCase()}`;
}

function relLuminance(rgb) {
    const toLin = (c) => {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * toLin(rgb.r) + 0.7152 * toLin(rgb.g) + 0.0722 * toLin(rgb.b);
}

function contrastRatio(fg, bg) {
    const L1 = relLuminance(fg) + 0.05;
    const L2 = relLuminance(bg) + 0.05;
    return (Math.max(L1, L2)) / (Math.min(L1, L2));
}

function mixRgb(a, b, t) {
    return {
        r: Math.round(a.r + (b.r - a.r) * t),
        g: Math.round(a.g + (b.g - a.g) * t),
        b: Math.round(a.b + (b.b - a.b) * t)
    };
}

function nudgeToward(fg, bg, toWhite, target) {
    const goal = toWhite ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
    for (let i = 0; i <= 100; i++) {
        const t = i / 100.0;
        const mix = mixRgb(fg, goal, t);
        if (contrastRatio(mix, bg) >= target) return { rgb: mix, t: t };
    }
    return null;
}

function pickColor(bgHex, fgHex = null) {
    const bg = hexToRgb(bgHex);
    let fg = fgHex ? hexToRgb(fgHex) : null;
    const black = { r: 0, g: 0, b: 0 };
    const white = { r: 255, g: 255, b: 255 };

    if (!fg) {
        const crB = contrastRatio(black, bg);
        const crW = contrastRatio(white, bg);
        return crB >= crW ? '#000000' : '#ffffff';
    }
    
    if (contrastRatio(fg, white) >= 4.5 || contrastRatio(fg, black) >= 4.5) return rgbToHex(fg);

    const towardWhite = nudgeToward(fg, bg, true, 4.5);
    const towardBlack = nudgeToward(fg, bg, false, 4.5);

    if (towardWhite && towardBlack) {
        return towardWhite.t <= towardBlack.t ? rgbToHex(towardWhite.rgb) : rgbToHex(towardBlack.rgb);
    }
    if (towardWhite) return rgbToHex(towardWhite.rgb);
    if (towardBlack) return rgbToHex(towardBlack.rgb);

    return contrastRatio(black, bg) > contrastRatio(white, bg) ? '#000000' : '#ffffff';
}

function extractColor(message, type) {
    const colorRegex = {
        foreground: /(?:change\s+(?:text|foreground)\s+(?:color|colour)\s+to\s+|set\s+(?:text|foreground)\s+color\s+to\s+)(#[a-f0-9]{6}|#[a-f0-9]{3}|[a-z]+)\b/i,
        background: /(?:change\s+(?:background|bg)\s+to\s+)(#[a-f0-9]{6}|#[a-f0-9]{3}|[a-z]+)\b/i
    };
    const regex = colorRegex[type];
    const match = message.match(regex);
    return match ? match[1] : null;
}

// ==========================================
//  CSS GENERATOR
// ==========================================
function generateCSSFromReport(issues) {
    if (!issues || !issues.length) return '';

    let css = `/* Generated A11y Fixes (Server) */\n`;
    const issuesBySelector = {};
    const contrastMap = {}; 

    issues.forEach(issue => {
        if (!issue.selector) return;
        if (!issuesBySelector[issue.selector]) issuesBySelector[issue.selector] = new Set();
        issuesBySelector[issue.selector].add(issue.code);

        if (issue.code.includes("1_4_3")) {
             const fg = extractColor(issue.message, 'foreground');
             const bg = extractColor(issue.message, 'background');
             if (fg || bg) contrastMap[issue.selector] = { fg, bg };
        }
    });

    Object.keys(issuesBySelector).forEach(selector => {
        const codes = issuesBySelector[selector];

        // 1. Fix Contrast (Smart)
        if ([...codes].some(c => c.includes('Contrast') || c.includes('1_4_3'))) {
            const colors = contrastMap[selector];
            if (colors) {
                const finalColor = pickColor(colors.bg || '#ffffff', colors.fg);
                css += `${selector} { color: ${finalColor} !important; }\n`;
                css += `${selector}:hover, ${selector}:focus { color: ${finalColor} !important; }\n`;
            } else {
                css += `${selector} { background-color: #ffffff !important; color: #000000 !important; border: 1px solid #000000 !important; }\n`;
            }
        }

        // 2. Fix Click Targets
        if ([...codes].some(c => c.includes('Principle2.Guideline2_4'))) {
             css += `${selector}:focus { outline: 3px solid #E53935 !important; outline-offset: 2px !important; }\n`;
        }
    });
    return css;
}

// ================= ROUTES =================
function sha1(s) { return crypto.createHash('sha1').update(s).digest('hex'); }
function validateHttpUrl(url) { try { const u = new URL(url); if (!['http:', 'https:'].includes(u.protocol)) return { ok: false, error: 'Bad URL' }; return { ok: true, url: u.toString() }; } catch { return { ok: false, error: 'Invalid URL' }; } }
function isSvgUrl(u) { return /^data:image\/svg\+xml[,;]/i.test(u) || /\.svg(\?|#|$)/i.test(u); }
function altFromFilename(url) { try { if (/^data:/i.test(url)) return 'SVG'; const u = new URL(url); let n = u.pathname.split('/').pop() || ''; n = decodeURIComponent(n).replace(/\.svg$/i,'').replace(/[_\-.+]+/g,' ').trim(); return n || 'SVG'; } catch { return 'SVG'; } }

async function generateAltTextWithVision(imageUrl) {
    const [result] = await visionClient.labelDetection({ image: { source: { imageUri: imageUrl } } });
    const labels = (result.labelAnnotations || []).filter(l => (l.score || 0) >= VISION_MIN_SCORE).slice(0, VISION_MAX_LABELS).map(l => l.description);
    return labels.join(', ') || 'Image';
}
async function generateAltTextWithGemini(imageUrl) {
    const resp = await fetch(imageUrl);
    if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    let mimeType = 'image/jpeg';
    if (imageUrl.toLowerCase().endsWith('.png')) mimeType = 'image/png';
    const request = { contents: [{ role: 'user', parts: [{ inlineData: { mimeType, data: buf.toString('base64') } }, { text: 'Concise indonesian ALT text' }] }] };
    const result = await generativeModel.generateContent(request);
    return result.response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Image';
}

// 1. ALT LOOKUP
app.post('/alt-lookup', async (req, res) => {
    const { srcs } = req.body || {};
    if (!srcs) return res.status(400).json({});
    if (!redisClient.isOpen) return res.json({ hits: [], misses: srcs });
    try {
        const keys = srcs.map(s => `alt:${sha1(String(s))}`);
        const vals = await redisClient.mGet(keys);
        const hits = [], misses = [];
        srcs.forEach((src, i) => { if(vals[i]) hits.push({src, alt: JSON.parse(vals[i]).altText}); else misses.push(src); });
        return res.json({ hits, misses });
    } catch(e) { return res.json({ hits: [], misses: srcs }); }
});

// 2. GENERATE ALT
app.post('/generate-alt-text', async (req, res) => {
    const { imageUrl, prefer = 'gemini' } = req.body || {};
    if (!imageUrl) return res.status(400).json({ error: 'URL required' });
    const key = `alt:${sha1(imageUrl)}`;
    try {
        if (redisClient.isOpen) {
            const c = await redisClient.get(key);
            if (c) return res.json({ altText: JSON.parse(c).altText, cached: true });
        }
        if (isSvgUrl(imageUrl)) {
            const a = altFromFilename(imageUrl);
            if (redisClient.isOpen) await redisClient.set(key, JSON.stringify({imageUrl, altText:a}));
            return res.json({ altText: a, cached: false });
        }
        let alt = prefer === 'vision' ? await generateAltTextWithVision(imageUrl) : await generateAltTextWithGemini(imageUrl);
        if (redisClient.isOpen) await redisClient.set(key, JSON.stringify({imageUrl, altText:alt}));
        return res.json({ altText: alt, cached: false });
    } catch (e) {
        if (!res.headersSent) res.status(500).json({ error: 'Gen failed' });
    }
});

// 3. SAVE FIXES
app.post('/save-fixes', async (req, res) => {
    try {
        const { url, alts=[], meta={} } = req.body || {};
        const key = `fixes:${sha1(url)}`;
        let data = { alts: [], meta: {}, ts: 0 };
        if (redisClient.isOpen) {
            const c = await redisClient.get(key);
            if (c) data = JSON.parse(c);
        }
        const map = new Map(data.alts.map(a=>[a.src,a]));
        alts.forEach(a=>map.set(String(a.src), {src:String(a.src), alt:String(a.alt)}));
        const newData = { ts: Date.now(), alts: Array.from(map.values()), meta: {...data.meta, ...meta} };
        if (redisClient.isOpen) await redisClient.set(key, JSON.stringify(newData));
        return res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Save failed' }); }
});

// 4. GENERATE CSS
app.post('/generate-css', async (req, res) => {
    const { report, url } = req.body || {};
    const issues = report?.results?.issues || [];

    if (!issues.length) return res.json({ css: '', cached: false });

    try {
        // We generate unique hash for the content, but we also map the URL to that content.
        
        console.log('⚙️ Generating new CSS...');
        const css = generateCSSFromReport(issues);

        if (redisClient.isOpen) {
            // 1. Cache by Content Hash (Existing)
            const contentKey = `css:${sha1(JSON.stringify(issues))}`;
            await redisClient.set(contentKey, css, { EX: 604800 }); // 7 Days

            // 2. Cache by URL
            if (url) {
                const urlKey = `css-url:${sha1(url)}`;
                await redisClient.set(urlKey, css, { EX: 604800 });
                console.log(`🔗 Mapped URL to CSS Cache: ${url}`);
            }
        }

        return res.json({ css, cached: false });
    } catch (e) {
        console.error('CSS Gen Error:', e);
        return res.status(500).json({ error: e.message });
    }
});

// 5.5 GET CSS BY URL
app.get('/css', async (req, res) => {
    const { url } = req.query || {};
    if (!url) return res.status(400).json({ error: 'URL required' });

    try {
        if (redisClient.isOpen) {
            const key = `css-url:${sha1(url)}`;
            const cachedCSS = await redisClient.get(key);
            if (cachedCSS) {
                console.log(`⚡ CSS Cache Hit for URL: ${url}`);
                return res.json({ css: cachedCSS, cached: true });
            }
        }
        return res.json({ css: null, cached: false });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 5. RUN PA11Y
app.post('/run-pa11y', async (req, res) => {
    const { url, html } = req.body || {};
    const v = validateHttpUrl(url);
    if (!v.ok) return res.status(400).json({ ok:false, error: v.error });
    console.log(`Scanning: ${v.url} [HTML Mode: ${!!html}]`);
    
    const args = ['--no-sandbox', '--disable-gpu', '--headless=new'];
    let b = null, p = null;
    try {
        if (html) {
            b = await puppeteer.launch({ args, executablePath: process.env.CHROME_PATH });
            p = await b.newPage();
            await p.setRequestInterception(true);
            p.on('request', r => r.url() === v.url ? r.respond({body:html}) : r.continue());
        }
        const results = await pa11y(v.url, { 
            browser: b, page: p, 
            runners:['htmlcs'], 
            chromeLaunchConfig:{ args, executablePath: process.env.CHROME_PATH } 
        });
        if(b) await b.close();
        return res.json({ ok: true, url: v.url, results });
    } catch (e) {
        if(b) await b.close().catch(()=>{});
        return res.status(500).json({ ok:false, error: e.message });
    }
});

app.listen(port, () => console.log(`Listening on ${port}`));