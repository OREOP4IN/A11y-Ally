# A11y Ally Architecture

This document provides a technical overview of the A11y Ally extension architecture.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│                                                             │
│  ┌─────────────┐      ┌──────────────┐      ┌───────────┐ │
│  │   Popup UI  │◄────►│  Background  │◄────►│  Content  │ │
│  │  (popup.js) │      │Service Worker│      │  Script   │ │
│  │             │      │(background.js)│     │(content.js)│ │
│  └─────────────┘      └──────┬───────┘      └─────┬─────┘ │
│                              │                     │        │
└──────────────────────────────┼─────────────────────┼────────┘
                               │                     │
                               │                     │
                       External APIs          Web Page DOM
                               │                     │
                    ┌──────────▼────────┐   ┌────────▼─────────┐
                    │  Google Cloud     │   │  Accessibility   │
                    │  Vision API       │   │  Issues & Fixes  │
                    │  Vertex AI        │   └──────────────────┘
                    └───────────────────┘
```

## Component Details

### 1. Popup UI (popup.html, popup.css, popup.js)

**Purpose**: User interface for extension control and configuration

**Features**:
- Real-time statistics display (issues found, patches applied)
- Extension enable/disable toggle
- Auto-fix toggle
- Manual analysis trigger
- API key configuration
- Settings persistence

**Data Flow**:
```
User Action → Storage API → Content Script (via reload)
Storage API ← Load Settings ← Background Worker
```

### 2. Background Service Worker (background.js)

**Purpose**: Persistent service handling API communication and extension lifecycle

**Key Functions**:

1. **API Communication**
   ```javascript
   analyzeImageWithCloudVision(imageUrl, apiKey)
   └─> Fetch Cloud Vision API
       └─> Return labels, objects, text
   
   generateAltTextWithVertexAI(imageUrl, config)
   └─> Get Vision analysis
       └─> Generate descriptive alt text
   ```

2. **Message Handling**
   - `analyzeImage`: Process image through Cloud Vision
   - `generateAltText`: Create AI-powered alt text
   - `getSettings`: Retrieve stored configuration

3. **Storage Management**
   - Sync storage for settings (API keys, preferences)
   - Local storage for statistics

**Technologies**:
- Chrome Extension APIs (runtime, storage)
- Fetch API for external requests
- Base64 encoding for image processing

### 3. Content Script (content.js)

**Purpose**: Page analysis and WCAG issue patching

**Architecture**:

```
Page Load
    │
    ▼
Initialize
    │
    ├─> Load Settings
    │
    └─> Analyze and Patch
            │
            ├─> fixMissingAltText()
            ├─> fixEmptyLinks()
            ├─> fixEmptyButtons()
            ├─> fixMissingFormLabels()
            ├─> fixLowContrastText()
            ├─> fixMissingLandmarks()
            ├─> fixHeadingStructure()
            ├─> fixMissingLanguage()
            ├─> fixEmptyTableHeaders()
            └─> fixMissingSkipLinks()
                    │
                    ▼
            Store Results
                    │
                    ▼
            Monitor for Changes (MutationObserver)
```

**Key Features**:

1. **WCAG Detection Functions**
   - Each function targets specific WCAG criterion
   - DOM queries to find problematic elements
   - Severity classification (error, warning)

2. **Patching Functions**
   - Conditional based on `autoFix` setting
   - Adds ARIA attributes
   - Generates content from context
   - Marks fixed elements with `data-a11y-ally-fixed`

3. **Dynamic Monitoring**
   ```javascript
   MutationObserver
   └─> Debounce (1 second)
       └─> Re-run analysis
   ```

## Data Flow

### Settings Configuration

```
User Input (Popup)
    │
    ▼
Chrome Storage Sync API
    │
    ├─> Background Worker (for API calls)
    │
    └─> Content Script (for patching behavior)
```

### Image Analysis Flow

```
Content Script finds <img> without alt
    │
    ▼
Request to Background Worker
    │
    ├─> Extract image URL
    ├─> Convert to base64
    └─> Send to Cloud Vision API
            │
            ▼
        API Response
            │
            ├─> Labels
            ├─> Objects  } Process into
            └─> Text     } descriptive alt text
                │
                ▼
        Return to Content Script
                │
                ▼
        Apply alt attribute to <img>
                │
                ▼
        Mark with data-a11y-ally-fixed="true"
```

### Manual Analysis Flow

```
User clicks "Analyze Page" button
    │
    ▼
Popup sends message to active tab
    │
    ▼
Content Script receives message
    │
    ▼
Run analyzeAndPatch()
    │
    ▼
Update statistics in storage
    │
    ▼
Popup displays updated stats
```

## Storage Schema

### Chrome Storage Sync (Settings)

```javascript
{
  enabled: boolean,              // Extension on/off
  autoFix: boolean,              // Auto-fix issues
  cloudVisionApiKey: string,     // Cloud Vision API key
  vertexAiApiKey: string,        // Vertex AI API key
  vertexAiProject: string,       // GCP Project ID
  vertexAiLocation: string       // Default: 'us-central1'
}
```

### Chrome Storage Local (Statistics)

```javascript
{
  issuesFound: [
    {
      type: string,              // Issue type
      element: string,           // Element tag
      wcag: string,              // WCAG criterion
      severity: string           // error|warning
    }
  ],
  patchesApplied: [
    {
      type: string,              // Patch type
      element: HTMLElement,      // DOM element
      value: string              // Applied value
    }
  ],
  timestamp: number              // Unix timestamp
}
```

## WCAG Detection Rules

### Example: Missing Alt Text (WCAG 1.1.1)

```javascript
Detection:
  Query: 'img:not([alt])'
  Severity: error

Patching:
  1. If API configured:
     - Send image to Cloud Vision
     - Generate descriptive alt text
     - Apply to element
  
  2. Else (fallback):
     - Extract filename from src
     - Clean and format
     - Apply basic alt text
```

### Example: Empty Links (WCAG 2.4.4)

```javascript
Detection:
  Query: 'a:not([aria-label]):not([aria-labelledby])'
  Check: textContent.trim() === '' && !querySelector('img')
  Severity: error

Patching:
  - Get href attribute
  - Generate label: "Link to {href}"
  - Apply aria-label
```

## Performance Considerations

### Optimization Strategies

1. **Debounced Re-analysis**
   - Mutation Observer triggers are debounced to 1 second
   - Prevents excessive re-runs on dynamic content

2. **Efficient Selectors**
   - Use native `querySelectorAll` with specific selectors
   - Cache results where possible

3. **Conditional API Calls**
   - Only call Cloud Vision when API key is configured
   - Fallback to local processing

4. **Minimal DOM Modifications**
   - Only add necessary attributes
   - Mark fixed elements to avoid re-processing

### Memory Management

- Content script runs in page context but isolated
- No memory leaks from event listeners (proper cleanup)
- Storage limited to essential data

## Security Model

### Permissions

```json
{
  "permissions": ["activeTab", "storage", "scripting"],
  "host_permissions": ["<all_urls>"]
}
```

**Why each permission**:
- `activeTab`: Access current tab for analysis
- `storage`: Save settings and statistics
- `scripting`: Inject content script
- `<all_urls>`: Run on any webpage

### Data Privacy

1. **API Keys**: Stored in Chrome Storage Sync (encrypted by browser)
2. **Image Data**: Sent directly to Google APIs, not stored
3. **Statistics**: Stored locally, never transmitted
4. **No Analytics**: Zero telemetry or user tracking

## Extension Lifecycle

### Installation

```
chrome.runtime.onInstalled
    │
    └─> Set default settings
        └─> {enabled: true, autoFix: true}
```

### Page Load

```
Document Load
    │
    └─> Content Script Injection
            │
            └─> Initialize
                    │
                    └─> Run Analysis
```

### Context Menu

```
Right-click on page
    │
    └─> "Analyze Accessibility" option
            │
            └─> Trigger manual analysis
```

## Browser Compatibility

### Manifest V3 Features Used

- Service Worker (instead of background page)
- Action API (instead of browser action)
- Declarative content scripts

### Cross-Browser Support

- **Chrome/Edge**: Full support (Manifest V3 native)
- **Firefox**: Compatible with WebExtensions API
  - Note: Some V3 features polyfilled by Firefox

## Error Handling

### API Errors

```javascript
try {
  const result = await apiCall();
} catch (error) {
  console.error('API Error:', error);
  // Apply fallback fix
}
```

### Missing Elements

- All queries check for `null`/empty results
- Graceful degradation if elements not found

### Network Failures

- Timeout handling in fetch requests
- Fallback to local processing
- User notification via console

## Future Architecture Improvements

### Planned Enhancements

1. **Service Worker Optimization**
   - Cache API responses
   - Batch image processing

2. **Content Script Improvements**
   - WebWorker for heavy processing
   - Incremental analysis

3. **Storage Migration**
   - IndexedDB for large datasets
   - Compression for statistics

4. **Offline Support**
   - Local AI models (TensorFlow.js)
   - Cached rules and patterns

## Development Guidelines

### Adding New WCAG Checks

1. Create detection function in `content.js`
2. Add to `analyzeAndPatch()` call chain
3. Implement fix logic with fallback
4. Document in README and CHANGELOG
5. Add test case to `demo.html`

### Modifying API Integration

1. Update `background.js` API functions
2. Update message handlers
3. Update popup UI if needed
4. Document in CONFIG.md
5. Test error scenarios

## Debugging

### Console Logging

```javascript
// Enable detailed logging
console.log('A11y Ally: Starting analysis');
console.log(`Found ${issuesFound.length} issues`);
console.log(`Applied ${patchesApplied.length} patches`);
```

### Chrome DevTools

1. **Background Worker**: `chrome://extensions/` → Inspect views
2. **Content Script**: Page DevTools → Console tab
3. **Popup**: Right-click popup → Inspect

### Testing

1. Load `demo.html`
2. Check console for analysis logs
3. Inspect elements for `data-a11y-ally-fixed`
4. Verify statistics in popup

---

For more details, see:
- [README.md](README.md) - User documentation
- [CONTRIBUTING.md](CONTRIBUTING.md) - Development guidelines
- [CONFIG.md](CONFIG.md) - Configuration options
