chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GENERATE_A11Y_CSS') {
    console.log('Pa11y A11Y CSS Generation Triggered');
    console.log('Received Pa11y Report:', request.report);
    
    const issues = Object.values(request.report.results)[0];
    console.log('Issues:', issues);

    const contrastFailures = extractContrastFailures(issues);
    console.log('Contrast Failures:', contrastFailures);

    const generatedCSS = generateCSSForContrastFixes(contrastFailures);
    console.log('Generated CSS:', generatedCSS);

    // Send CSS to content script for injection into the page
    chrome.scripting.executeScript({
        target: { tabId: sender.tab.id },
        func: injectCSS,
        args: [generatedCSS]
    }).then(() => {
        console.log('CSS successfully injected into the page.');
    }).catch((error) => {
        console.error('Error injecting CSS:', error);
    });

    sendResponse({ ok: true, message: 'CSS injected for contrast fixes.' });
  }
});

// Function to extract contrast issues from Pa11y report
function extractContrastFailures(issues) {
  const contrastFailures = [];

  issues.forEach((issue) => {
    if (issue.code.includes("1_4_3")) { // Only WCAG 1.4.3 contrast failures
      const selector = issue.selector;
      const message = issue.message || '';
      const fgColor = extractColor(message, 'foreground');
      const bgColor = extractColor(message, 'background');

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

function generateCSSForContrastFixes(contrastFailures) {
    let css = '';
    
    contrastFailures.forEach(({ selector, fgColor, bgColor }) => {
        // If no foreground color is provided, use the background color as fallback
        const fixedFgColor = fgColor ? fgColor : bgColor;
        console.log('masuk gen');

        // Use `pickColor` to find the most readable color
        const finalColor = pickColor(bgColor, fgColor);
        console.log('finalColor', finalColor);


        css += `
            ${selector} {
                color: ${finalColor} !important;
            }
            ${selector}:hover, ${selector}:focus, ${selector}:active {
                color: ${finalColor} !important;
            }
        `;
    });
    return css;
}

// Convert Hex to RGB
function hexToRgb(hex) {
    // Log the received hex value
    console.log('hex:', hex);

    // Return a default color (black) if the hex is invalid
    if (!hex || typeof hex !== 'string' || !/^#?[0-9A-Fa-f]{3,6}$/i.test(hex)) {
        console.warn('Invalid hex color, returning black');
        return { r: 0, g: 0, b: 0 }; // Default to black if the hex is invalid
    }

    // Remove the '#' if it exists
    hex = hex.replace('#', '');

    // If the hex is shorthand (3 characters), expand it to 6
    if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }

    // Parse the red, green, and blue components from the hex string
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);

    // Log the RGB values for debugging
    console.log('r, g, b:', r, g, b);

    return { r, g, b };
}

// Calculate relative luminance for contrast ratio
function relLuminance(rgb) {
    // console.log('relLuminance')
    // console.log('rgb', rgb);
    const toLin = (c) => {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * toLin(rgb.r) + 0.7152 * toLin(rgb.g) + 0.0722 * toLin(rgb.b);
}

// Calculate contrast ratio between two colors
function contrastRatio(fg, bg) {
    // console.log('contrastRatio')
    // console.log('fg', fg);
    // console.log('bg', bg);
    const L1 = relLuminance(fg) + 0.05;
    const L2 = relLuminance(bg) + 0.05;
    return (Math.max(L1, L2)) / (Math.min(L1, L2));
}

// Linearly interpolate between two colors (for nudging)
function mixRgb(a, b, t) {
    return {
        r: Math.round(a.r + (b.r - a.r) * t),
        g: Math.round(a.g + (b.g - a.g) * t),
        b: Math.round(a.b + (b.b - a.b) * t)
    };
}

// Nudge color toward white/black until contrast passes
function nudgeToward(fg, bg, toWhite, target) {
    console.log('masok nufge');
    const goal = toWhite ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
    for (let i = 0; i <= 100; i++) {
        const t = i / 100.0; // 0..1
        const mix = mixRgb(fg, goal, t);
        if (contrastRatio(mix, bg) >= target) {
            return { rgb: mix, t: t };
        }
    }
    return null; // Return null if no satisfactory color was found
}

// Pick the best color from pa11y-report
function pickColor(bgHex, fgHex = null) {
    const bg = hexToRgb(bgHex);
    let fg = fgHex ? hexToRgb(fgHex) : null;
    console.log('bg', bg);
    console.log('fg', fg)
    const black = { r: 0, g: 0, b: 0 };
    const white = { r: 255, g: 255, b: 255 };
    const gray = { r: 122, g: 122, b: 122 };

    if (!fg) {
        // Default to black or white based on background luminance
        const crB = contrastRatio(black, bg);
        const crW = contrastRatio(white, bg);
        return crB >= crW ? '#000000' : '#ffffff';
    }

    // If the foreground already passes the contrast ratio, return it
    if (contrastRatio(fg, white) >= 4.5 || contrastRatio(fg, black) >= 4.5){
        return rgbToHex(fg);
    }

    // Try nudging toward white or black if the contrast ratio dont work
    const towardWhite = nudgeToward(fg, bg, true, 4.5);
    const towardBlack = nudgeToward(fg, bg, false, 4.5);
    console.log('towardWhite', towardWhite);
    console.log('towardBlack', towardBlack);


    if (towardWhite && towardBlack) {
        return towardWhite.t <= towardBlack.t
            ? rgbToHex(towardWhite.rgb)
            : rgbToHex(towardBlack.rgb);
    }

    if (towardWhite) {
        return rgbToHex(towardWhite.rgb);
    }

    if (towardBlack) {
        return rgbToHex(towardBlack.rgb);
    }

    // Fallback to pure black or white
    return contrastRatio({ r: 0, g: 0, b: 0 }, bg) > contrastRatio({ r: 255, g: 255, b: 255 }, bg)
        ? '#000000' : '#ffffff';
}

// Convert RGB to hex
function rgbToHex(rgb) {
    return `#${(1 << 24 | (rgb.r << 16) | (rgb.g << 8) | rgb.b).toString(16).slice(1).toUpperCase()}`;
}

// Function to inject the generated CSS into the page
function injectCSS(generatedCSS) {
  const styleTag = document.createElement('style');
  styleTag.type = 'text/css';
  styleTag.innerHTML = generatedCSS;
  document.head.appendChild(styleTag);
  console.log('Injected CSS into the page');
}
