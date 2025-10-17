// File: content.js

console.log("Content script loaded.");

// Listen for messages from the popup
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.type === "RUN_MANUAL_FIXES") {
        console.log("Received command to run manual fixes.");
        runGeneralFixes();
    }

    if (request.type === "GET_HTML") {
        console.log("Popup requested current HTML. Sending it back.");
        const currentHtml = document.documentElement.outerHTML;
        console.log("currentHTML:", currentHtml);
        sendResponse({ html: currentHtml });
    }

    if (request.type === "GENERATE_ALT_TEXT") {
        await generateAltForImages();
    }

    return true; // asynchronous response
});


async function runGeneralFixes() {
    console.log('Running general accessibility fixes...');

    // Fix 'align' attributes
    document.querySelectorAll('[align]').forEach(el => {
        const alignValue = el.getAttribute('align');
        if (alignValue) { el.style.textAlign = alignValue; }
        el.removeAttribute('align');
    });
    console.log('align')

    // Adds alt and title attributes to anchors
    document.querySelectorAll('a').forEach(anchor => {
        const anchorText = anchor.textContent.trim();
        if (anchorText) {
            anchor.setAttribute('alt', anchorText);
            anchor.setAttribute('title', anchorText);
        }
    });
    console.log('anchor')

    // Fixes duplicate element IDs
    const ids = {};
    document.querySelectorAll('[id]').forEach(element => {
        let id = element.id;
        if (ids[id]) {
            element.id = `${id}_${ids[id]++}`;
        } else {
            ids[id] = 1;
        }
    });
    console.log('duplicate ids')

    // Replaces obsolete <center> tags
    document.querySelectorAll('center').forEach(center => {
        const div = document.createElement('div');
        div.innerHTML = center.innerHTML;
        div.style.textAlign = 'center';
        center.parentNode.replaceChild(div, center);
    });
    console.log('center')

    // Improves accessibility for buttons
    document.querySelectorAll('button').forEach(button => {
        let name = button.getAttribute('aria-label') || button.getAttribute('title') || button.textContent.trim() || button.id.trim() || 'Button';
        name = name.replace(/([a-z])([A-Z])/g, '$1 $2');
        button.setAttribute('aria-label', name);
        button.setAttribute('title', name);
    });
    console.log('button')

    // Improves accessibility for iframes
    document.querySelectorAll('iframe').forEach(iframe => {
        if (!iframe.hasAttribute('title') || iframe.getAttribute('title').trim() === '') {
            iframe.setAttribute('title', 'Embedded Content');
        }
    });
    console.log('iframe')

    // Removes empty headings
    document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
        if (!heading.textContent.trim()) { heading.remove(); }
    });
    console.log('heading')

    // alert("General accessibility fixes have been applied!");
    console.log("General fixes script has run!");
    // Generate alt text for images without alt attributes
    await generateAltForImages();
    console.log('Alt text generation completed.');
}

async function generateAltForImages() {
    const images = document.querySelectorAll('img');
    const imagesWithoutAlt = Array.from(images).filter(img => !img.hasAttribute('alt'));

    console.log("images without alt", imagesWithoutAlt);

    for (const image of imagesWithoutAlt) {
        const imageUrl = image.src;

        try {
            console.log('imageUrl', imageUrl);
            // Send image URL to the backend for generating alt text
            const response = await fetch('http://localhost:3000/generate-alt-text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageUrl })
            });

            console.log('response', response);
            
            const result = await response.json();
            if (result.altText) {
                image.setAttribute('alt', result.altText);
                console.log(`Generated alt text for image: ${result.altText}`);
            }
            console.log('result', result);
        } catch (error) {
            console.error('Error generating alt text:', error);
        }
    }
}
