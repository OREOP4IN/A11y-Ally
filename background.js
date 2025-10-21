chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GENERATE_A11Y_CSS') {
    console.log('masok bg');
    console.log('req', request.report);
    console.log('req.res',Object.values(request.report.results)[0]);
    const issues = Object.values(request.report.results)[0];
    const contrastFailures = extractContrastFailures(issues);
    console.log('contrastFailures:', contrastFailures);
    const generatedCSS = generateCSSForContrastFixes(contrastFailures);
    console.log('generatedCSS:', generatedCSS);

    // Send CSS to content script for injection into page
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      func: injectCSS,
      args: [generatedCSS]
    });

    sendResponse({ ok: true, message: 'CSS injected for contrast fixes.' });
  }
});

// Function to extract contrast issues from Pa11y report
function extractContrastFailures(issues) {
    console.log('masok contrast');
    const contrastFailures = [];

    issues.forEach((issue) => {
        if (issue.code.includes("1_4_3")) { // Only WCAG 1.4.3 contrast failures
            const selector = issue.selector;
            const message = issue.message || '';
            const fgColor = extractColor(message, 'foreground');
            const bgColor = extractColor(message, 'background');
            // console.log('issue 1_4_3', issue);
            if (selector && (fgColor || bgColor)) {
                contrastFailures.push({
                selector,
                fgColor,
                bgColor,
                });
            }
        }
    });
    return contrastFailures;
}

// Extract color from Pa11y message
function extractColor(message, type) {
    const colorRegex = {
        foreground: /(?:change\s+(?:text|foreground)\s+(?:color|colour)\s+to\s+|set\s+(?:text|foreground)\s+color\s+to\s+)(#[a-f0-9]{6}|#[a-f0-9]{3}|[a-z]+)\b/i,
        background: /(?:change\s+(?:background|bg)\s+to\s+)(#[a-f0-9]{6}|#[a-f0-9]{3}|[a-z]+)\b/i
    };

    const regex = colorRegex[type];
    const match = message.match(regex);

    return match ? match[1] : null;
}

// Function to generate the CSS based on the contrast failures
function generateCSSForContrastFixes(contrastFailures) {
    console.log('masok generate contrast');
    let css = '';
    
    console.log(contrastFailures);
    contrastFailures.forEach(({ selector, fgColor, bgColor }) => {
        console.log('loop cf');
        // const fixedFgColor = pickColor(bgColor, fgColor);
        const fixedFgColor = fgColor?fgColor:bgColor;
        console.log('fixedFgColor:', fixedFgColor);
        
        css += `
        ${selector} {
            color: ${fixedFgColor} !important;
        }
        ${selector}:hover, ${selector}:focus, ${selector}:active {
            color: ${fixedFgColor} !important;
        }
        `;
    });
    return css;
}

// Pick a better color for readability
function pickColor(bgHex, fgHex) {
  const bg = hexToRgb(bgHex);
  console.log('bg:', bg);
  const fg = hexToRgb(fgHex);
  console.log('fg:', fg);


  const contrastRatio = getContrastRatio(fg, bg);
  console.log('contrastRatio:', contrastRatio);

  if (contrastRatio >= 4.5) {
    return fgHex;
  }

  return getContrastRatio({ r: 0, g: 0, b: 0 }, bg) > getContrastRatio({ r: 255, g: 255, b: 255 }, bg)
    ? '#000000' : '#ffffff';
}

// Calculate contrast ratio
function getContrastRatio(fg, bg) {
    console.log('APAKAH KAMU????? GET CONTRAST RATIO???????????????/');
    const fgLuminance = luminance(fg);
    const bgLuminance = luminance(bg);
    return (Math.max(fgLuminance, bgLuminance) + 0.05) / (Math.min(fgLuminance, bgLuminance) + 0.05);
}

// Luminance calculation for contrast ratio
function luminance(color) {
    console.log('ATAU APAKAH KAMU???? LUMINANCE??????????????????');
    console.log('color:', color);
    const { r, g, b } = color;
    console.log('r, g, b:', r, g, b);
    const a = [r, g, b].map(function (v) {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    console.log('a:', a);
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

// Convert hex to RGB
function hexToRgb(hex) {
    console.log('APAKAH KAMU PELAKUNYA HEXTORGB??????');
    const rgb = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    console.log('rgb:', rgb);
    return rgb ? {
        r: parseInt(rgb[1], 16),
        g: parseInt(rgb[2], 16),
        b: parseInt(rgb[3], 16)
    } : null;
}

// Inject CSS into the page
function injectCSS(css) {
  const styleTag = document.createElement('style');
  styleTag.type = 'text/css';
  styleTag.innerHTML = css;
  document.head.appendChild(styleTag);
}
