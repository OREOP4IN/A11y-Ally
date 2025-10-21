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

// Function to generate the CSS based on the contrast failures
function generateCSSForContrastFixes(contrastFailures) {
  let css = '';
  
  contrastFailures.forEach(({ selector, fgColor, bgColor }) => {
    console.log('loop cf');
    // const fixedFgColor = pickColor(bgColor, fgColor);
    const fixedFgColor = fgColor || bgColor;  // Default fallback if foreground isn't provided
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

// Inject CSS into the page
function injectCSS(generatedCSS) {
  const styleTag = document.createElement('style');
  styleTag.type = 'text/css';
  styleTag.innerHTML = generatedCSS;
  document.head.appendChild(styleTag);
  console.log('Injected CSS into the page:', generatedCSS);  // Log to ensure injection happens
}
