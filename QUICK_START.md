# Quick Start Guide

Get A11y Ally up and running in 5 minutes!

## 1. Install the Extension

### Chrome/Edge
```bash
1. Download/clone this repository
2. Go to chrome://extensions/
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the A11y-Ally folder
```

### Firefox
```bash
1. Download/clone this repository
2. Go to about:debugging#/runtime/this-firefox
3. Click "Load Temporary Add-on"
4. Select manifest.json
```

## 2. Basic Usage (No Setup Required!)

The extension works immediately without any configuration:

1. **Navigate to any webpage**
2. **The extension automatically:**
   - Scans for accessibility issues
   - Applies fixes in real-time
   - Shows results in the popup

3. **View results:**
   - Click the A11y Ally icon in toolbar
   - See issues found and patches applied
   - Check browser console for details

## 3. Test It Out

Open the included `demo.html` file to see the extension in action:

1. Open `demo.html` in your browser
2. Open DevTools (F12) and check the Console
3. Look for "A11y Ally: Found X issues, applied Y patches"
4. Click the extension icon to see statistics

## 4. Optional: Add AI Features

For intelligent alt text generation:

1. Get a free API key from [Google Cloud](https://console.cloud.google.com/)
2. Enable Cloud Vision API
3. Click the A11y Ally icon
4. Scroll to "API Configuration"
5. Paste your API key
6. Click "Save Settings"

**Cost**: First 1,000 API calls/month are FREE!

## Common Issues & Quick Fixes

| Problem | Solution |
|---------|----------|
| Extension not visible | Pin it from the extensions menu |
| No issues detected | Reload the page, ensure extension is enabled |
| API key not working | Check it's enabled in Google Cloud Console |

## What Gets Fixed?

✅ Missing image alt text  
✅ Empty links and buttons  
✅ Missing form labels  
✅ Missing language attributes  
✅ Missing landmarks (main, nav)  
✅ Skip links  
✅ And more!

## Quick Commands

```bash
# Clone repository
git clone https://github.com/OREOP4IN/A11y-Ally.git

# Update extension
git pull origin main
# Then reload extension in browser

# View all issues on current page
# 1. Open browser console (F12)
# 2. Look for "A11y Ally" messages
```

## Keyboard Shortcuts

Currently, the extension doesn't have keyboard shortcuts, but you can:
- Use browser's extension menu (Alt+Shift+E in Chrome)
- Create custom shortcuts in browser settings

## Next Steps

- Read the full [README](README.md)
- Review [WCAG Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- Check [Configuration Guide](CONFIG.md) for advanced setup
- Test on your own websites
- [Report issues](https://github.com/OREOP4IN/A11y-Ally/issues) or contribute!

## Support

Need help? 
- Check the [Installation Guide](INSTALLATION.md)
- Review [CONFIG.md](CONFIG.md)
- Open an [issue on GitHub](https://github.com/OREOP4IN/A11y-Ally/issues)

---

**That's it! You're ready to make the web more accessible! 🎉**
