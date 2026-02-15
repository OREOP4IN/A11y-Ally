if (!process.env.K_SERVICE) {
    require('dotenv').config();
}

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pa11y = require('pa11y');

const vision = require('@google-cloud/vision');
const { VertexAI } = require('@google-cloud/vertexai');

const app = express();

//  Cloud Run: must listen on process.env.PORT
const port = process.env.PORT || 3000;

//  Cloud Run: use temp dir (ephemeral) if you still want file cache
const CACHE_DIR = process.env.CACHE_DIR || path.join('/tmp', 'cache');
const ALT_CACHE_PATH = path.join(CACHE_DIR, 'alt_cache.json');
const FIXES_CACHE_PATH = path.join(CACHE_DIR, 'fixes_cache.json');

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

//  JSON body
app.use(express.json({ limit: '50mb' }));

//  CORS (tighten this later)
app.use(cors({
  origin: true, // (dev-friendly) replace with a whitelist for prod
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-API-Key'],
}));

//  Optional API key guard (recommended once public)
app.use((req, res, next) => {
  const required = process.env.EXT_API_KEY;
  if (!required) return next(); // allow if not configured (dev)
  const provided = req.get('x-api-key');
  if (provided !== required) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

// ---- Your existing env config ----
const GCP_PROJECT_ID = process.env.GEMINI_PROJECT_ID || 'kemahasiswaan-itb';
const GCP_LOCATION   = process.env.GEMINI_LOCATION   || 'us-central1';
const GEMINI_MODEL   = process.env.GEMINI_MODEL      || 'gemini-1.5-flash';

const VISION_MAX_LABELS = Number(process.env.VISION_MAX_LABELS || 5);
const VISION_MIN_SCORE  = Number(process.env.VISION_MIN_SCORE  || 0.66);

// Clients
const visionClient = new vision.ImageAnnotatorClient();
const vertexAI = new VertexAI({ project: GCP_PROJECT_ID, location: GCP_LOCATION });
const generativeModel = vertexAI.getGenerativeModel({ model: GEMINI_MODEL });

// Safe load/save helpers
function loadJson(p) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch { return {}; }
}
function saveJsonAtomic(p, obj) {
    const tmp = p + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
    fs.renameSync(tmp, p);
}

// handles .../icon.svg, .../icon.svg?ver=1#hash, and data URLs
function isSvgUrl(u) {
    return /^data:image\/svg\+xml[,;]/i.test(u) || /\.svg(\?|#|$)/i.test(u);
}

function altFromFilename(url) {
    try {
        // fallback for when URLs don’t have a name — return generic
        if (/^data:/i.test(url)) return 'SVG graphic';

        const u = new URL(url);
        let name = u.pathname.split('/').pop() || '';
        try { name = decodeURIComponent(name); } catch {}
        // strip extension
        name = name.replace(/\.svg$/i, '');
        // replace separators with spaces
        name = name.replace(/[_\-.+]+/g, ' ');
        // remove leftover non-alphanumerics except spaces
        name = name.replace(/[^a-zA-Z0-9 ]+/g, ' ');
        // collapse whitespace & trim
        name = name.replace(/\s+/g, ' ').trim();
        // title-case first letter only (keep acronyms)
        if (name) name = name[0].toUpperCase() + name.slice(1);
        return name || 'SVG graphic';
    } catch {
        return 'SVG graphic';
    }
}

// In-memory copy (loaded once, then persisted on change)
let altCache = loadJson(ALT_CACHE_PATH);     // { [hash]: { altText, imageUrl, ts } }
let fixesCache = loadJson(FIXES_CACHE_PATH); // { [pageUrl]: { ts, alts: [{src, alt}], meta: {...}} }

function sha1(s) { return crypto.createHash('sha1').update(s).digest('hex'); }

// removes unnecessary scripts biar pa11y gak timeout2 lagi
function sanitizeForPa11y(html, opts = {}) {
  const {
    removeScripts,
    stripEventHandlers,
    neutralizeIframes,
    dropExternalStyles,
    addCSP,
    removeComments,       // NEW
    collapseWhitespace    // NEW
  } = opts;

  let out = html;

  // --- Protect preformatted blocks so we don't collapse their whitespace ---
  const protectedMap = new Map(); // key -> original HTML
  let protectId = 0;
  function protect(tag) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
    out = out.replace(re, (m) => {
      const key = `__PA11Y_PROTECT_${tag.toUpperCase()}_${protectId++}__`;
      protectedMap.set(key, m);
      return key;
    });
  }
  protect('pre');
  protect('code');
  protect('textarea');

  // Remove ALL <script>…</script> and self-closing <script …/>
  if (removeScripts) {
    out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
    out = out.replace(/<script\b[^>]*\/\s*>/gi, '');
    out = out.replace(/<meta\b[^>]*http-equiv=["']?refresh["']?[^>]*>/gi, '');
  }

  // Strip inline event handlers (onclick, onload, onerror, etc.)
  if (stripEventHandlers) {
    out = out.replace(/\son[a-z]+\s*=\s*"(?:\\.|[^"]*)"/gi, '');
    out = out.replace(/\son[a-z]+\s*=\s*'(?:\\.|[^']*)'/gi, '');
    out = out.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '');
  }

  // Neutralize iframes (keep layout but stop network)
  if (neutralizeIframes) {
    out = out.replace(
      /<iframe\b([^>]*)>([\s\S]*?)<\/iframe>/gi,
      (_m, attrs) => {
        const titleMatch = /title\s*=\s*(['"])(.*?)\1/i.exec(attrs);
        const title = titleMatch ? titleMatch[2] : 'Embedded content';
        return `<div role="group" aria-label="${escapeHtml(title)}" data-pa11y-ifr-placeholder="1"></div>`;
      }
    );
  }

  // Optionally drop external stylesheets (HTTP/HTTPS). Keeps inline styles.
  if (dropExternalStyles) {
    out = out.replace(
      /<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi,
      (tag) => (/href\s*=\s*["']?(https?:)?\/\//i.test(tag) ? '' : tag)
    );
  }

  // Remove HTML comments (not IE conditional comments)
  if (removeComments) {
    out = out.replace(/<!--(?!\s*\[if).*?-->/gs, '');
  }

  // Collapse “dead space”
  if (collapseWhitespace) {
    out = out.trim();                 // trim doc edges
    out = out.replace(/\n{3,}/g, '\n\n');      // 3+ blank lines -> 1
    out = out.replace(/>\s+</g, '><');        // inter-tag whitespace
    out = out.replace(/(?:&nbsp;|\u00A0){2,}/g, ' '); // many &nbsp; -> 1 space
    // Collapse long runs of spaces/tabs in text (attributes are unaffected)
    out = out.replace(/[ \t\f\v]{2,}/g, ' ');
  }

  // Inject tight CSP (optional)
  if (addCSP) {
    out = out.replace(/<meta\b[^>]*http-equiv=["']?content-security-policy["']?[^>]*>/gi, '');
    const csp =
      "default-src 'self' data: blob:; " +
      "img-src * data: blob:; " +
      "media-src * data: blob:; " +
      "font-src * data:; " +
      "style-src 'self' 'unsafe-inline' data:; " +
      "script-src 'none'; " +
      "connect-src 'none'; " +
      "frame-src 'none'";
    const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
    if (!/<head\b[^>]*>/i.test(out)) {
      out = out.replace(/<html\b[^>]*>/i, '$&<head></head>');
    }
    out = out.replace(/<head\b[^>]*>/i, match => `${match}\n${cspMeta}`);
  }

  // Restore protected blocks
  for (const [key, original] of protectedMap.entries()) {
    out = out.replace(key, original);
  }

  return out;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function validateHttpUrl(url) {
  try {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol)) return { ok: false, error: 'Only http/https URLs are allowed' };
    return { ok: true, url: u.toString() };
  } catch {
    return { ok: false, error: 'Invalid URL' };
  }
}

async function generateAltText(imageUrl) {
    const [result] = await visionClient.labelDetection(imageUrl);
    const labels = result.labelAnnotations;
    const altText = labels.map(label => label.description).join(", ");
    return altText;
}

async function generateAltTextWithVision(imageUrl) {
    // Use imageUri so Vision downloads the URL itself
    const [result] = await visionClient.labelDetection({ image: { source: { imageUri: imageUrl } } });
    const labels = (result.labelAnnotations || [])
        .filter(l => (l.score || 0) >= VISION_MIN_SCORE)
        .slice(0, VISION_MAX_LABELS)
        .map(l => l.description);

    const alt = labels.join(', ');
    return alt || 'Image';
}

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
                { text: 'Write a concise, neutral, indonesian ALT text (<=120 chars), no branding, no speculation' }
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

// POST /alt-lookup  body: { srcs: ["https://...","https://..."] }
app.post('/alt-lookup', (req, res) => {
    const { srcs } = req.body || {};
    if (!Array.isArray(srcs) || !srcs.length) {
        return res.status(400).json({ error: 'srcs (array) is required' });
    }
    const hits = [];
    const misses = [];
    for (const src of srcs) {
        const key = sha1(String(src));
        const hit = altCache[key];
        if (hit?.altText) {
        hits.push({ src, alt: hit.altText });
        } else {
        misses.push(src);
        }
    }
    return res.json({ hits, misses });
});

app.post('/generate-alt-text', async (req, res) => {
    const { imageUrl, prefer = 'gemini' } = req.body || {};
    if (!imageUrl) return res.status(400).json({ error: 'Image URL is required' });

    try {
        // Cache hit first
        const key = sha1(imageUrl);
        const hit = altCache?.[key];
        if (hit?.altText) {
            return res.json({ altText: hit.altText, cached: true });
        }

        // SVG fast path (no network/AI)
        if (isSvgUrl(imageUrl)) {
            let alt = altFromFilename(imageUrl);
            const MAX_LEN = 120;
            if (alt.length > MAX_LEN) alt = alt.slice(0, MAX_LEN - 1) + '…';

            // cache it but don’t fail the request if write has issues
            try {
                altCache[key] = { imageUrl, altText: alt, ts: Date.now() };
                saveJsonAtomic(ALT_CACHE_PATH, altCache);
            } catch (e) { console.warn('ALT cache write failed (SVG):', e); }

            return res.json({ altText: alt, cached: false, source: 'svg-filename' });
        }

        // Non-SVG: AI path (Gemini → Vision fallback)
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

        const MAX_LEN = 120;
        if (alt.length > MAX_LEN) alt = alt.slice(0, MAX_LEN - 1) + '…';

        try {
            altCache[key] = { imageUrl, altText: alt, ts: Date.now() };
            saveJsonAtomic(ALT_CACHE_PATH, altCache);
        } catch (e) { console.warn('ALT cache write failed:', e); }

        return res.json({ altText: alt, cached: false, source: 'ai' });

    } catch (err) {
        console.error('Error generating alt:', err);
        if (!res.headersSent) return res.status(500).json({ error: 'Failed to generate alt text' });
    }
});

// Return previously saved fixes (mainly alts) for a page
// GET /fixes?url=http://kemahasiswaan.itb/somepage
app.get('/fixes', (req, res) => {
    const pageUrl = (req.query.url || '').trim();
    if (!pageUrl) return res.status(400).json({ error: 'url is required' });

    const entry = fixesCache[pageUrl];
    res.json(entry || { ts: 0, alts: [], meta: {} });
});

// Save fixes for a page (idempotent upsert)
// body: { url, alts: [{src, alt}, ...], meta?: {...} }
app.post('/save-fixes', (req, res) => {
    try{
        console.log("test save fixes");
        const { url, alts = [], meta = {} } = req.body || {};
        if (!url) return res.status(400).json({ error: 'url is required' });

        // Merge into page cache
        const prev = fixesCache[url] || { alts: [], meta: {}, ts: 0 };
        const bySrc = new Map(prev.alts.map(a => [a.src, a]));
        const clean = alts
            .filter(a => a && a.src && a.alt)
            .map(a => ({ src: String(a.src), alt: String(a.alt) }));
        clean.forEach(a => bySrc.set(a.src, a));
        fixesCache[url] = { ts: Date.now(), alts: Array.from(bySrc.values()), meta: { ...(prev.meta||{}), ...meta } };
        // promote into the global alt cache so other pages can reuse
        let touched = false;
        for (const a of clean) {
            const key = sha1(a.src);
            const cur = altCache[key]?.altText;
            if (!cur || cur !== a.alt) {
                altCache[key] = { imageUrl: a.src, altText: a.alt, ts: Date.now() };
                touched = true;
            }
        }
        
        // Persist both caches atomically-ish
        try { saveJsonAtomic(FIXES_CACHE_PATH, fixesCache); } catch(e){ console.warn('fixes cache write failed', e); }
        if (touched) { try { saveJsonAtomic(ALT_CACHE_PATH, altCache); } catch(e){ console.warn('alt cache write failed', e); } }
        
        return res.json({ ok: true, count: fixesCache[url].alts.length, ts: fixesCache[url].ts });
    } catch (e) {
        if (!res.headersSent) return res.status(500).json({ error: 'save-fixes failed' });
    }
});

app.post('/run-pa11y', async (req, res) => {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ ok: false, error: 'URL is required' });

    const v = validateHttpUrl(url);
    if (!v.ok) return res.status(400).json({ ok: false, error: v.error });

    console.log(`Received URL for scanning: ${v.url}`);

    const chromeArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--single-process',
        '--headless=new'
    ];

    try {
        const results = await pa11y(v.url, {
        standard: 'WCAG2AA',
        timeout: 30000,
        runners: ['htmlcs'],

        // pa11y will launch Chrome/Puppeteer internally
        chromeLaunchConfig: {
            args: chromeArgs,

            // Some pa11y builds support passing executablePath here.
            // If it ignores it, it's harmless. If it supports it, great.
            executablePath: process.env.CHROME_PATH || '/usr/bin/chromium'
        }
        });

        // Optional: mimic pa11y-ci "level=error" (filter only errors)
        // results.issues = (results.issues || []).filter(i => i.type === 'error');

        return res.json({ ok: true, url: v.url, results });
    } catch (e) {
        console.error('pa11y error:', e);
        return res.status(500).json({
        ok: false,
        error: 'Failed to run pa11y',
        details: e.message
        });
    }
});

// DEBUG TOOLS OPEN TO PUBLIC FOR NOW BIAR TESTING GAMPANG

app.get('/debug/fixes-cache', (req, res) => {
  try {
    if (!fs.existsSync(FIXES_CACHE_PATH)) {
      return res.json({ exists: false });
    }

    const data = fs.readFileSync(FIXES_CACHE_PATH, 'utf8');
    res.json({
      exists: true,
      size: data.length,
      data: JSON.parse(data)
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/debug/', (req, res) => {
  try {
    if (!fs.existsSync(ALT_CACHE_PATH)) {
      return res.json({ exists: false });
    }

    const data = fs.readFileSync(ALT_CACHE_PATH, 'utf8');
    res.json({
      exists: true,
      size: data.length,
      data: JSON.parse(data)
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/debug/ls', (req, res) => {
  try {
    const base = '/usr/src/app';
    const tmp = '/tmp';

    res.json({
      appDir: fs.readdirSync(base),
      tmpDir: fs.existsSync(tmp) ? fs.readdirSync(tmp) : []
    });

    console.log('APP DIR:', fs.readdirSync('/usr/src/app'));
    console.log('TMP DIR:', fs.readdirSync('/tmp'));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(port, () => {
  console.log(`Pa11y backend listening on port ${port}`);
});