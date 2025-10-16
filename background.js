// Background service worker for A11y Ally extension
// Handles API communication and extension lifecycle

// Extension installation/update handler
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('A11y Ally installed');
    // Set default settings
    chrome.storage.sync.set({
      enabled: true,
      autoFix: true,
      cloudVisionApiKey: '',
      vertexAiApiKey: '',
      vertexAiProject: '',
      vertexAiLocation: 'us-central1'
    });
  }
});

// Message handler for content script communication
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'analyzeImage') {
    analyzeImageWithCloudVision(request.imageUrl, request.apiKey)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'generateAltText') {
    generateAltTextWithVertexAI(request.imageUrl, request.config)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.action === 'getSettings') {
    chrome.storage.sync.get(null, (settings) => {
      sendResponse({ success: true, data: settings });
    });
    return true;
  }
});

// Cloud Vision API integration
async function analyzeImageWithCloudVision(imageUrl, apiKey) {
  if (!apiKey) {
    throw new Error('Cloud Vision API key not configured');
  }
  
  try {
    // Convert image URL to base64 if needed
    const imageData = await fetchImageAsBase64(imageUrl);
    
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              image: {
                content: imageData
              },
              features: [
                { type: 'LABEL_DETECTION', maxResults: 10 },
                { type: 'TEXT_DETECTION', maxResults: 5 },
                { type: 'OBJECT_LOCALIZATION', maxResults: 10 }
              ]
            }
          ]
        })
      }
    );
    
    if (!response.ok) {
      throw new Error(`Cloud Vision API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.responses[0];
  } catch (error) {
    console.error('Cloud Vision API error:', error);
    throw error;
  }
}

// Vertex AI integration for generating alt text
async function generateAltTextWithVertexAI(imageUrl, config) {
  const { apiKey, project, location } = config;
  
  if (!apiKey || !project) {
    throw new Error('Vertex AI configuration incomplete');
  }
  
  try {
    // Get Cloud Vision analysis first
    const visionData = await analyzeImageWithCloudVision(imageUrl, apiKey);
    
    // Extract labels and descriptions
    const labels = visionData.labelAnnotations?.map(l => l.description) || [];
    const texts = visionData.textAnnotations?.map(t => t.description) || [];
    const objects = visionData.localizedObjectAnnotations?.map(o => o.name) || [];
    
    // Generate descriptive alt text
    let altText = '';
    
    if (objects.length > 0) {
      altText = `Image showing ${objects.slice(0, 3).join(', ')}`;
    } else if (labels.length > 0) {
      altText = `Image depicting ${labels.slice(0, 3).join(', ')}`;
    }
    
    if (texts.length > 0 && texts[0].length < 50) {
      altText += ` with text: "${texts[0]}"`;
    }
    
    // Fallback to simple description
    if (!altText) {
      altText = 'Image content';
    }
    
    return {
      altText: altText.substring(0, 125), // Keep alt text concise
      labels,
      objects,
      hasText: texts.length > 0
    };
  } catch (error) {
    console.error('Vertex AI generation error:', error);
    throw error;
  }
}

// Helper function to fetch image as base64
async function fetchImageAsBase64(imageUrl) {
  try {
    // For relative URLs, we need to handle them differently
    if (imageUrl.startsWith('data:')) {
      return imageUrl.split(',')[1];
    }
    
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Error fetching image:', error);
    throw error;
  }
}

// Context menu for manual analysis
chrome.contextMenus.create({
  id: 'analyzeAccessibility',
  title: 'Analyze Accessibility',
  contexts: ['page']
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'analyzeAccessibility') {
    chrome.tabs.sendMessage(tab.id, { action: 'analyzeAccessibility' });
  }
});
