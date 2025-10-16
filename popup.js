// Popup script for A11y Ally extension

document.addEventListener('DOMContentLoaded', async () => {
  // Load current settings
  await loadSettings();
  await loadStats();
  
  // Set up event listeners
  document.getElementById('analyzeBtn').addEventListener('click', analyzeCurrentPage);
  document.getElementById('autoFixToggle').addEventListener('change', saveToggleSettings);
  document.getElementById('enabledToggle').addEventListener('change', saveToggleSettings);
  document.getElementById('saveSettingsBtn').addEventListener('click', saveApiSettings);
});

async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get(null);
    
    // Set toggle states
    document.getElementById('autoFixToggle').checked = result.autoFix !== false;
    document.getElementById('enabledToggle').checked = result.enabled !== false;
    
    // Set API keys (masked)
    if (result.cloudVisionApiKey) {
      document.getElementById('cloudVisionKey').value = result.cloudVisionApiKey;
    }
    if (result.vertexAiApiKey) {
      document.getElementById('vertexAiKey').value = result.vertexAiApiKey;
    }
    if (result.vertexAiProject) {
      document.getElementById('vertexAiProject').value = result.vertexAiProject;
    }
    
    // Update status
    const statusEl = document.getElementById('extensionStatus');
    if (result.enabled !== false) {
      statusEl.textContent = 'Active';
      statusEl.style.color = '#388E3C';
    } else {
      statusEl.textContent = 'Disabled';
      statusEl.style.color = '#F44336';
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

async function loadStats() {
  try {
    const result = await chrome.storage.local.get(['issuesFound', 'patchesApplied', 'timestamp']);
    
    if (result.issuesFound) {
      document.getElementById('issuesCount').textContent = result.issuesFound.length || 0;
    }
    if (result.patchesApplied) {
      document.getElementById('patchesCount').textContent = result.patchesApplied.length || 0;
    }
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

async function analyzeCurrentPage() {
  const btn = document.getElementById('analyzeBtn');
  const originalText = btn.textContent;
  
  try {
    btn.textContent = 'Analyzing...';
    btn.disabled = true;
    
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Send message to content script
    const response = await chrome.tabs.sendMessage(tab.id, { 
      action: 'analyzeAccessibility' 
    });
    
    if (response && response.success) {
      // Reload stats
      await loadStats();
      btn.textContent = 'Analysis Complete!';
      setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
      }, 2000);
    }
  } catch (error) {
    console.error('Error analyzing page:', error);
    btn.textContent = 'Error - Try Again';
    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
    }, 2000);
  }
}

async function saveToggleSettings() {
  try {
    const autoFix = document.getElementById('autoFixToggle').checked;
    const enabled = document.getElementById('enabledToggle').checked;
    
    await chrome.storage.sync.set({
      autoFix: autoFix,
      enabled: enabled
    });
    
    // Update status display
    const statusEl = document.getElementById('extensionStatus');
    if (enabled) {
      statusEl.textContent = 'Active';
      statusEl.style.color = '#388E3C';
    } else {
      statusEl.textContent = 'Disabled';
      statusEl.style.color = '#F44336';
    }
    
    // Reload the current page to apply new settings
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.reload(tab.id);
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

async function saveApiSettings() {
  const btn = document.getElementById('saveSettingsBtn');
  const originalText = btn.textContent;
  
  try {
    btn.textContent = 'Saving...';
    btn.disabled = true;
    
    const cloudVisionKey = document.getElementById('cloudVisionKey').value.trim();
    const vertexAiKey = document.getElementById('vertexAiKey').value.trim();
    const vertexAiProject = document.getElementById('vertexAiProject').value.trim();
    
    await chrome.storage.sync.set({
      cloudVisionApiKey: cloudVisionKey,
      vertexAiApiKey: vertexAiKey,
      vertexAiProject: vertexAiProject
    });
    
    btn.textContent = 'Saved!';
    btn.style.background = '#388E3C';
    
    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.background = '';
      btn.disabled = false;
    }, 2000);
  } catch (error) {
    console.error('Error saving API settings:', error);
    btn.textContent = 'Error!';
    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
    }, 2000);
  }
}
