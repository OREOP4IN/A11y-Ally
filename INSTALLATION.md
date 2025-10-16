# Installation Guide

This guide walks you through installing and setting up A11y Ally in your browser.

## Prerequisites

- A modern web browser (Chrome, Edge, or Firefox)
- (Optional) Google Cloud Vision API key for AI-powered features

## Installation Steps

### For Chrome/Edge

1. **Download or Clone the Repository**
   ```bash
   git clone https://github.com/OREOP4IN/A11y-Ally.git
   ```
   
   Or download as ZIP and extract.

2. **Open Extension Management Page**
   - Chrome: Navigate to `chrome://extensions/`
   - Edge: Navigate to `edge://extensions/`
   
3. **Enable Developer Mode**
   - Look for a toggle switch in the top-right corner
   - Turn on "Developer mode"

4. **Load the Extension**
   - Click "Load unpacked" button
   - Navigate to the A11y-Ally directory
   - Select the folder and click "Select Folder"

5. **Verify Installation**
   - You should see the A11y Ally extension appear in your extensions list
   - The icon should appear in your browser toolbar
   - Status should show "Extension enabled"

### For Firefox

1. **Download or Clone the Repository**
   ```bash
   git clone https://github.com/OREOP4IN/A11y-Ally.git
   ```

2. **Open Debugging Page**
   - Navigate to `about:debugging#/runtime/this-firefox`

3. **Load Temporary Add-on**
   - Click "Load Temporary Add-on..."
   - Navigate to the A11y-Ally directory
   - Select the `manifest.json` file
   - Click "Open"

4. **Verify Installation**
   - The extension will appear in the temporary extensions list
   - Icon should appear in the toolbar

**Note for Firefox**: The extension will be removed when you restart Firefox. For permanent installation, you would need to sign and publish it to the Firefox Add-ons store.

## First-Time Setup

### Basic Usage (No API Keys Required)

1. Click the A11y Ally icon in your toolbar
2. Ensure "Extension enabled" is checked
3. Ensure "Auto-fix issues" is checked
4. Navigate to any webpage
5. The extension will automatically analyze and fix issues

### Advanced Setup (With API Keys)

For AI-powered alt text generation:

1. **Get Google Cloud Vision API Key**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project
   - Enable Cloud Vision API
   - Create an API key in Credentials section

2. **Configure the Extension**
   - Click the A11y Ally icon
   - Scroll to "API Configuration"
   - Enter your Cloud Vision API Key (same key works for Vertex AI features)
   - (Optional) Enter Vertex AI Project ID for advanced features
   - (Optional) Enter Vertex AI API Key if using a different key
   - Click "Save Settings"

3. **Test the Configuration**
   - Navigate to the included `demo.html` file
   - Open the extension popup
   - Click "Analyze Page"
   - Check the console for analysis results

## Testing the Installation

### Quick Test

1. Open `demo.html` from the extension directory
2. Open browser DevTools (F12)
3. Check the Console tab
4. You should see messages like "A11y Ally: Starting accessibility analysis and fixes"
5. Click the extension icon to see statistics

### Verify Fixes

1. In DevTools, switch to the Elements tab
2. Find elements that had issues (e.g., images, links, buttons)
3. Look for the `data-a11y-ally-fixed="true"` attribute
4. Check that appropriate ARIA labels or alt text have been added

## Troubleshooting

### Extension Not Appearing

- **Problem**: Extension doesn't show in toolbar
- **Solution**: 
  - Check that it's enabled in the extensions page
  - Pin it to toolbar from the extensions menu
  - Restart your browser

### No Issues Detected

- **Problem**: Extension shows 0 issues on pages with obvious problems
- **Solution**:
  - Verify "Extension enabled" is checked
  - Reload the page after enabling
  - Check browser console for errors
  - Try the demo.html page

### API Key Not Working

- **Problem**: Images still get generic alt text
- **Solution**:
  - Verify the API key is correct
  - Check that Cloud Vision API is enabled in Google Cloud
  - Ensure billing is enabled
  - Check browser console for error messages
  - Try saving settings again

### Extension Not Running on Some Sites

- **Problem**: Extension doesn't work on certain pages
- **Solution**:
  - Some browsers restrict extensions on internal pages (like `chrome://`)
  - Extensions can't modify browser UI pages
  - Check that the site allows extensions (some sites block them)

### Permission Errors

- **Problem**: Extension can't access pages
- **Solution**:
  - Check manifest.json permissions
  - Reload the extension after making changes
  - Some sites may require additional permissions

## Updating the Extension

1. Pull the latest changes:
   ```bash
   cd A11y-Ally
   git pull origin main
   ```

2. Go to your browser's extensions page
3. Click the refresh/reload icon on the A11y Ally card
4. The extension will reload with the new code

## Uninstalling

### Chrome/Edge

1. Go to `chrome://extensions/` or `edge://extensions/`
2. Find A11y Ally
3. Click "Remove"
4. Confirm removal

### Firefox

1. Go to `about:addons`
2. Find A11y Ally
3. Click "..." menu
4. Select "Remove"

## Need Help?

- Check the [README.md](README.md) for feature documentation
- Review [CONFIG.md](CONFIG.md) for configuration details
- File an issue on [GitHub](https://github.com/OREOP4IN/A11y-Ally/issues)

## Next Steps

- Review the [Configuration Guide](CONFIG.md)
- Read about [Contributing](CONTRIBUTING.md)
- Try the demo page
- Test on real websites
- Report any issues you find
