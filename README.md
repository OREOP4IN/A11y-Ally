# A11y Ally

A powerful browser extension that automatically detects and patches WCAG accessibility issues on web pages using pa11y, Google Cloud Vision API, and Vertex AI.

## Features

### Automated WCAG Compliance Fixes

- **Missing Alt Text (WCAG 1.1.1)**: Automatically generates descriptive alt text for images using AI
- **Empty Links (WCAG 2.4.4)**: Adds appropriate labels to links without text
- **Empty Buttons (WCAG 4.1.2)**: Adds aria-labels to buttons without accessible names
- **Missing Form Labels (WCAG 3.3.2)**: Adds labels to form inputs
- **Low Contrast Detection (WCAG 1.4.3)**: Identifies text with insufficient contrast
- **Missing Landmarks (WCAG 1.3.1)**: Adds ARIA landmarks to page structure
- **Heading Structure (WCAG 1.3.1)**: Validates proper heading hierarchy
- **Language Attribute (WCAG 3.1.1)**: Adds lang attribute to HTML element
- **Table Accessibility (WCAG 1.3.1)**: Checks for proper table headers and captions
- **Skip Links (WCAG 2.4.1)**: Adds skip navigation links

### AI-Powered Features

- **Cloud Vision API Integration**: Analyzes images to generate meaningful descriptions
- **Vertex AI Integration**: Enhances alt text generation with advanced AI
- **Smart Label Generation**: Infers appropriate labels from context

### User-Friendly Interface

- Real-time issue detection and patching
- Detailed statistics on issues found and patches applied
- Configurable auto-fix settings
- Easy API key management

## Installation

### From Source

1. Clone this repository:
   ```bash
   git clone https://github.com/OREOP4IN/A11y-Ally.git
   cd A11y-Ally
   ```

2. Load the extension in your browser:

   **Chrome/Edge:**
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `A11y-Ally` directory

   **Firefox:**
   - Open `about:debugging#/runtime/this-firefox`
   - Click "Load Temporary Add-on"
   - Select the `manifest.json` file

## Configuration

### API Keys (Optional but Recommended)

To enable AI-powered alt text generation, you'll need:

1. **Google Cloud Vision API Key**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Enable Cloud Vision API
   - Create API credentials
   - Copy the API key

2. **Vertex AI Configuration**:
   - Project ID from Google Cloud Console
   - API key with Vertex AI permissions
   - Default location: `us-central1`

Enter these in the extension popup under "API Configuration".

## Usage

### Automatic Mode

Once installed and enabled, A11y Ally automatically:
- Scans each page you visit
- Detects WCAG violations
- Applies fixes in real-time
- Monitors for dynamic content changes

### Manual Analysis

1. Click the A11y Ally icon in your browser toolbar
2. Click "Analyze Page" to run a fresh scan
3. View statistics on issues found and patches applied

### Settings

- **Extension Enabled**: Toggle the extension on/off
- **Auto-fix Issues**: Enable/disable automatic patching
- **API Configuration**: Set up Cloud Vision and Vertex AI

## How It Works

### Detection

The extension uses a comprehensive set of rules based on pa11y and WCAG guidelines to detect common accessibility issues:

- DOM traversal to find problematic elements
- Computed style analysis for contrast issues
- Structural validation for landmarks and headings
- Form and interactive element checks

### Patching

When issues are found, the extension:
1. Identifies the most appropriate fix
2. Applies ARIA attributes or content modifications
3. Marks fixed elements with `data-a11y-ally-fixed`
4. Logs all changes for transparency

### AI Enhancement

For images without alt text:
1. Image is sent to Cloud Vision API for analysis
2. Labels, objects, and text are extracted
3. Vertex AI (or local logic) generates a descriptive alt text
4. Alt text is added to the image element

## Supported WCAG Criteria

| Criterion | Level | Status |
|-----------|-------|--------|
| 1.1.1 Non-text Content | A | ✅ Supported |
| 1.3.1 Info and Relationships | A | ✅ Supported |
| 1.4.3 Contrast (Minimum) | AA | ✅ Detected |
| 2.4.1 Bypass Blocks | A | ✅ Supported |
| 2.4.4 Link Purpose | A | ✅ Supported |
| 3.1.1 Language of Page | A | ✅ Supported |
| 3.3.2 Labels or Instructions | A | ✅ Supported |
| 4.1.2 Name, Role, Value | A | ✅ Supported |

## Privacy & Security

- All processing happens in your browser or through APIs you configure
- No data is collected or stored by the extension author
- API keys are stored locally in your browser
- You control when and how the extension runs

## Development

### Project Structure

```
A11y-Ally/
├── manifest.json          # Extension manifest
├── background.js          # Background service worker
├── content.js            # Content script (main logic)
├── popup.html            # Extension popup UI
├── popup.css             # Popup styles
├── popup.js              # Popup functionality
├── icons/                # Extension icons
└── package.json          # Dependencies
```

### Building

No build step required - this is a vanilla JavaScript extension.

### Testing

Load the extension in developer mode and test on various websites.

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT License - see LICENSE file for details

## Acknowledgments

- Built with inspiration from [pa11y](https://pa11y.org/)
- WCAG guidelines from [W3C](https://www.w3.org/WAI/WCAG21/quickref/)
- Powered by Google Cloud Vision API and Vertex AI

## Disclaimer

This extension is a tool to help improve accessibility, but it cannot catch all issues. Manual testing and review are still essential for full WCAG compliance.