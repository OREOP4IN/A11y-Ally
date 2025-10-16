# Configuration Guide

This document explains how to configure A11y Ally for optimal performance.

## API Configuration

### Google Cloud Vision API

The Cloud Vision API is used to analyze images and generate descriptive content.

#### Setup Steps:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Cloud Vision API:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Cloud Vision API"
   - Click "Enable"
4. Create API credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "API Key"
   - Copy the generated API key
5. (Optional) Restrict the API key:
   - Click on the key to edit
   - Under "API restrictions", select "Restrict key"
   - Choose "Cloud Vision API"
   - Save

#### Adding to Extension:

1. Click the A11y Ally icon in your browser
2. Scroll to "API Configuration"
3. Paste your API key in "Cloud Vision API Key"
4. Click "Save Settings"

### Vertex AI (Optional)

Vertex AI can be used for advanced AI features. Currently, the extension uses Cloud Vision results to generate alt text, but can be extended to use Vertex AI models.

#### Setup Steps:

1. Enable Vertex AI API in Google Cloud Console
2. Note your Project ID
3. Create an API key with Vertex AI permissions
4. Enter in the extension popup:
   - Vertex AI API Key
   - Vertex AI Project ID
   - Location (default: us-central1)

## Extension Settings

### Auto-fix Issues

When enabled (default), the extension automatically applies fixes to detected issues.

**Recommendation**: Keep enabled for best experience.

### Extension Enabled

Master toggle for the extension.

**Note**: When disabled, no analysis or fixes will be performed.

## Privacy Considerations

### API Usage

- Images are sent to Google Cloud Vision API only if configured
- API calls are made directly from your browser
- No intermediary servers are used

### Data Storage

- Settings are stored in browser's sync storage
- Issue reports are stored in local storage
- No data is sent to extension developers

### API Keys

- Stored locally in your browser only
- Never transmitted except to Google APIs
- Use restricted API keys for additional security

## Cost Considerations

### Cloud Vision API Pricing

Google Cloud Vision API offers:
- First 1,000 units per month: Free
- Additional units: ~$1.50 per 1,000 units

A "unit" is one image analysis request.

**Recommendation**: Monitor your usage in Google Cloud Console.

### Reducing Costs

1. Only configure API keys if you need AI-generated alt text
2. Use the extension on sites where you're actively working on accessibility
3. Disable auto-fix on sites where images already have alt text
4. Set up billing alerts in Google Cloud Console

## Troubleshooting

### API Key Not Working

- Verify the API is enabled in Google Cloud Console
- Check that the key hasn't been restricted to exclude Cloud Vision API
- Ensure billing is enabled for your Google Cloud project
- Try regenerating the API key

### Extension Not Running

- Check that the extension is enabled in browser settings
- Verify the "Extension Enabled" toggle is on in the popup
- Check browser console for errors
- Try reloading the page

### No Issues Detected

- Some pages may already be accessible
- Try testing on a page with known accessibility issues
- Check that auto-fix isn't already applied (look for `data-a11y-ally-fixed` attributes)

## Advanced Configuration

### Custom WCAG Checks

To add custom checks, modify `content.js` and add your detection function.

### Styling Fixed Elements

Fixed elements can be identified by the `data-a11y-ally-fixed="true"` attribute.

You can add custom CSS to highlight these elements for review:

```css
[data-a11y-ally-fixed] {
  outline: 2px solid #2196F3;
}
```

## Support

For issues or questions, please file an issue on GitHub:
https://github.com/OREOP4IN/A11y-Ally/issues
