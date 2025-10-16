// Content script for A11y Ally
// Detects and patches common WCAG violations on web pages

(function() {
  'use strict';
  
  let settings = {};
  let issuesFound = [];
  let patchesApplied = [];
  
  // Initialize the extension
  async function init() {
    try {
      // Get settings from background
      const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
      if (response.success) {
        settings = response.data;
      }
      
      if (settings.enabled) {
        console.log('A11y Ally: Starting accessibility analysis and fixes');
        await analyzeAndPatch();
      }
    } catch (error) {
      console.error('A11y Ally initialization error:', error);
    }
  }
  
  // Main analysis and patching function
  async function analyzeAndPatch() {
    issuesFound = [];
    patchesApplied = [];
    
    // Run all WCAG checks and fixes
    await fixMissingAltText();
    fixEmptyLinks();
    fixEmptyButtons();
    fixMissingFormLabels();
    fixLowContrastText();
    fixMissingLandmarks();
    fixHeadingStructure();
    fixMissingLanguage();
    fixEmptyTableHeaders();
    fixMissingSkipLinks();
    
    console.log(`A11y Ally: Found ${issuesFound.length} issues, applied ${patchesApplied.length} patches`);
    
    // Store results
    chrome.storage.local.set({
      issuesFound: issuesFound,
      patchesApplied: patchesApplied,
      timestamp: Date.now()
    });
  }
  
  // WCAG 1.1.1: Non-text Content - Fix missing alt text on images
  async function fixMissingAltText() {
    const images = document.querySelectorAll('img:not([alt])');
    
    for (const img of images) {
      issuesFound.push({
        type: 'missing-alt-text',
        element: img.tagName,
        wcag: '1.1.1',
        severity: 'error'
      });
      
      if (settings.autoFix) {
        try {
          // Try to generate alt text using Cloud Vision API
          if (settings.cloudVisionApiKey && img.src) {
            const response = await chrome.runtime.sendMessage({
              action: 'generateAltText',
              imageUrl: img.src,
              config: {
                apiKey: settings.cloudVisionApiKey,
                project: settings.vertexAiProject,
                location: settings.vertexAiLocation
              }
            });
            
            if (response.success && response.data.altText) {
              img.setAttribute('alt', response.data.altText);
              img.setAttribute('data-a11y-ally-fixed', 'true');
              patchesApplied.push({
                type: 'added-alt-text',
                element: img,
                value: response.data.altText
              });
            }
          } else {
            // Fallback: use filename or generic text
            const filename = img.src.split('/').pop().split('?')[0];
            const altText = filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
            img.setAttribute('alt', altText || 'Image');
            img.setAttribute('data-a11y-ally-fixed', 'true');
            patchesApplied.push({
              type: 'added-alt-text-fallback',
              element: img,
              value: altText || 'Image'
            });
          }
        } catch (error) {
          console.error('Error generating alt text:', error);
          // Apply basic fix
          img.setAttribute('alt', '');
          img.setAttribute('data-a11y-ally-fixed', 'true');
        }
      }
    }
    
    // Also check for decorative images with non-empty alt text
    const decorativeImages = document.querySelectorAll('img[role="presentation"]:not([alt=""]), img[role="none"]:not([alt=""])');
    decorativeImages.forEach(img => {
      issuesFound.push({
        type: 'decorative-image-with-alt',
        element: img.tagName,
        wcag: '1.1.1',
        severity: 'warning'
      });
      
      if (settings.autoFix) {
        img.setAttribute('alt', '');
        img.setAttribute('data-a11y-ally-fixed', 'true');
        patchesApplied.push({ type: 'cleared-decorative-alt', element: img });
      }
    });
  }
  
  // WCAG 2.4.4: Link Purpose - Fix empty links
  function fixEmptyLinks() {
    const emptyLinks = document.querySelectorAll('a:not([aria-label]):not([aria-labelledby])');
    
    emptyLinks.forEach(link => {
      const text = link.textContent.trim();
      const hasImage = link.querySelector('img');
      
      if (!text && !hasImage) {
        issuesFound.push({
          type: 'empty-link',
          element: link.tagName,
          wcag: '2.4.4',
          severity: 'error'
        });
        
        if (settings.autoFix) {
          const href = link.getAttribute('href') || '';
          const label = `Link to ${href}`;
          link.setAttribute('aria-label', label);
          link.setAttribute('data-a11y-ally-fixed', 'true');
          patchesApplied.push({ type: 'added-link-label', element: link, value: label });
        }
      } else if (!text && hasImage) {
        // Check if image has alt text
        const img = link.querySelector('img');
        if (!img.getAttribute('alt')) {
          issuesFound.push({
            type: 'link-image-no-alt',
            element: link.tagName,
            wcag: '2.4.4',
            severity: 'error'
          });
        }
      }
    });
  }
  
  // WCAG 4.1.2: Name, Role, Value - Fix empty buttons
  function fixEmptyButtons() {
    const buttons = document.querySelectorAll('button:not([aria-label]):not([aria-labelledby])');
    
    buttons.forEach(button => {
      const text = button.textContent.trim();
      const hasImage = button.querySelector('img');
      
      if (!text && !hasImage) {
        issuesFound.push({
          type: 'empty-button',
          element: button.tagName,
          wcag: '4.1.2',
          severity: 'error'
        });
        
        if (settings.autoFix) {
          // Try to infer purpose from classes or id
          const classes = button.className;
          let label = 'Button';
          
          if (classes.includes('close')) label = 'Close';
          else if (classes.includes('menu')) label = 'Menu';
          else if (classes.includes('search')) label = 'Search';
          else if (classes.includes('submit')) label = 'Submit';
          
          button.setAttribute('aria-label', label);
          button.setAttribute('data-a11y-ally-fixed', 'true');
          patchesApplied.push({ type: 'added-button-label', element: button, value: label });
        }
      }
    });
  }
  
  // WCAG 3.3.2: Labels or Instructions - Fix missing form labels
  function fixMissingFormLabels() {
    const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select');
    
    inputs.forEach(input => {
      const id = input.id;
      const hasLabel = id && document.querySelector(`label[for="${id}"]`);
      const hasAriaLabel = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby');
      
      if (!hasLabel && !hasAriaLabel) {
        issuesFound.push({
          type: 'missing-form-label',
          element: input.tagName,
          wcag: '3.3.2',
          severity: 'error'
        });
        
        if (settings.autoFix) {
          // Try to infer label from placeholder, name, or nearby text
          const placeholder = input.getAttribute('placeholder');
          const name = input.getAttribute('name');
          const type = input.getAttribute('type');
          
          let label = placeholder || name || type || 'Input field';
          label = label.charAt(0).toUpperCase() + label.slice(1);
          
          input.setAttribute('aria-label', label);
          input.setAttribute('data-a11y-ally-fixed', 'true');
          patchesApplied.push({ type: 'added-input-label', element: input, value: label });
        }
      }
    });
  }
  
  // WCAG 1.4.3: Contrast (Minimum) - Detect low contrast text
  function fixLowContrastText() {
    // This is a simplified check - full implementation would calculate actual contrast ratios
    const elements = document.querySelectorAll('p, span, div, a, button, h1, h2, h3, h4, h5, h6');
    
    elements.forEach(element => {
      if (element.textContent.trim().length === 0) return;
      
      const style = window.getComputedStyle(element);
      const color = style.color;
      const backgroundColor = style.backgroundColor;
      
      // Simple check for very light gray on white (common issue)
      if (color.includes('rgb(192, 192, 192)') && backgroundColor.includes('rgb(255, 255, 255)')) {
        issuesFound.push({
          type: 'low-contrast',
          element: element.tagName,
          wcag: '1.4.3',
          severity: 'warning'
        });
      }
    });
  }
  
  // WCAG 1.3.1: Info and Relationships - Add missing landmarks
  function fixMissingLandmarks() {
    const body = document.body;
    
    // Check for main landmark
    if (!document.querySelector('main, [role="main"]')) {
      issuesFound.push({
        type: 'missing-main-landmark',
        wcag: '1.3.1',
        severity: 'warning'
      });
      
      if (settings.autoFix) {
        // Try to identify main content area
        const mainContent = document.querySelector('#main, #content, .main, .content');
        if (mainContent && mainContent.tagName !== 'MAIN') {
          mainContent.setAttribute('role', 'main');
          mainContent.setAttribute('data-a11y-ally-fixed', 'true');
          patchesApplied.push({ type: 'added-main-landmark', element: mainContent });
        }
      }
    }
    
    // Check for navigation landmark
    const navElements = document.querySelectorAll('nav:not([role]), [class*="nav"]:not([role]):not(nav)');
    navElements.forEach(nav => {
      if (nav.tagName !== 'NAV' && !nav.getAttribute('role')) {
        if (settings.autoFix) {
          nav.setAttribute('role', 'navigation');
          nav.setAttribute('data-a11y-ally-fixed', 'true');
          patchesApplied.push({ type: 'added-nav-landmark', element: nav });
        }
      }
    });
  }
  
  // WCAG 1.3.1: Heading structure
  function fixHeadingStructure() {
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    let previousLevel = 0;
    
    headings.forEach(heading => {
      const level = parseInt(heading.tagName.substring(1));
      
      if (previousLevel > 0 && level - previousLevel > 1) {
        issuesFound.push({
          type: 'skipped-heading-level',
          element: heading.tagName,
          wcag: '1.3.1',
          severity: 'warning'
        });
      }
      
      previousLevel = level;
    });
    
    // Check for page without h1
    if (!document.querySelector('h1')) {
      issuesFound.push({
        type: 'missing-h1',
        wcag: '1.3.1',
        severity: 'warning'
      });
    }
  }
  
  // WCAG 3.1.1: Language of Page
  function fixMissingLanguage() {
    const html = document.documentElement;
    
    if (!html.getAttribute('lang')) {
      issuesFound.push({
        type: 'missing-lang-attribute',
        element: 'html',
        wcag: '3.1.1',
        severity: 'error'
      });
      
      if (settings.autoFix) {
        html.setAttribute('lang', 'en');
        html.setAttribute('data-a11y-ally-fixed', 'true');
        patchesApplied.push({ type: 'added-lang-attribute', element: html, value: 'en' });
      }
    }
  }
  
  // WCAG 1.3.1: Table headers
  function fixEmptyTableHeaders() {
    const tables = document.querySelectorAll('table');
    
    tables.forEach(table => {
      const hasHeaders = table.querySelector('th');
      const hasCaption = table.querySelector('caption');
      
      if (!hasHeaders) {
        issuesFound.push({
          type: 'table-missing-headers',
          element: 'table',
          wcag: '1.3.1',
          severity: 'error'
        });
      }
      
      if (!hasCaption && !table.getAttribute('aria-label')) {
        issuesFound.push({
          type: 'table-missing-caption',
          element: 'table',
          wcag: '1.3.1',
          severity: 'warning'
        });
      }
    });
  }
  
  // WCAG 2.4.1: Bypass Blocks - Add skip links
  function fixMissingSkipLinks() {
    const skipLink = document.querySelector('a[href="#main"], a[href="#content"]');
    
    if (!skipLink) {
      issuesFound.push({
        type: 'missing-skip-link',
        wcag: '2.4.1',
        severity: 'warning'
      });
      
      if (settings.autoFix) {
        const mainContent = document.querySelector('main, [role="main"], #main, #content');
        if (mainContent) {
          // Create skip link
          const skip = document.createElement('a');
          skip.href = '#' + (mainContent.id || 'main');
          skip.textContent = 'Skip to main content';
          skip.className = 'a11y-ally-skip-link';
          skip.setAttribute('data-a11y-ally-fixed', 'true');
          
          // Add styles to make it visible on focus
          skip.style.cssText = `
            position: absolute;
            left: -10000px;
            width: 1px;
            height: 1px;
            overflow: hidden;
          `;
          
          skip.addEventListener('focus', function() {
            this.style.cssText = `
              position: fixed;
              top: 10px;
              left: 10px;
              z-index: 10000;
              padding: 10px;
              background: #000;
              color: #fff;
              text-decoration: none;
              border-radius: 4px;
            `;
          });
          
          skip.addEventListener('blur', function() {
            this.style.cssText = `
              position: absolute;
              left: -10000px;
              width: 1px;
              height: 1px;
              overflow: hidden;
            `;
          });
          
          if (!mainContent.id) {
            mainContent.id = 'main';
          }
          
          document.body.insertBefore(skip, document.body.firstChild);
          patchesApplied.push({ type: 'added-skip-link', element: skip });
        }
      }
    }
  }
  
  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'analyzeAccessibility') {
      analyzeAndPatch().then(() => {
        sendResponse({ 
          success: true, 
          issues: issuesFound.length,
          patches: patchesApplied.length 
        });
      });
      return true;
    }
  });
  
  // Run on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  // Re-run on dynamic content changes (with debounce)
  let timeoutId;
  const observer = new MutationObserver(() => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      if (settings.enabled) {
        analyzeAndPatch();
      }
    }, 1000);
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
})();
