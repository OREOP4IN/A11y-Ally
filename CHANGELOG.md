# Changelog

All notable changes to A11y Ally will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-10-16

### Added

#### Core Features
- Initial release of A11y Ally web extension
- Automatic detection and patching of WCAG violations
- Support for Manifest V3 (Chrome/Edge/Firefox compatible)

#### WCAG Compliance Features
- **WCAG 1.1.1**: Missing alt text detection and generation
- **WCAG 1.3.1**: Landmark structure validation and fixes
- **WCAG 1.3.1**: Heading hierarchy validation
- **WCAG 1.3.1**: Table header detection
- **WCAG 1.4.3**: Low contrast text detection
- **WCAG 2.4.1**: Skip link generation
- **WCAG 2.4.4**: Empty link detection and fixing
- **WCAG 3.1.1**: Language attribute addition
- **WCAG 3.3.2**: Form label detection and generation
- **WCAG 4.1.2**: Empty button detection and fixing

#### AI Integration
- Google Cloud Vision API integration for image analysis
- Vertex AI support for enhanced alt text generation
- Intelligent label generation based on context
- Fallback mechanisms when APIs are not configured

#### User Interface
- Clean, modern popup interface
- Real-time statistics display (issues found, patches applied)
- Toggle controls for extension and auto-fix features
- API configuration panel
- Visual feedback for actions

#### Developer Features
- Comprehensive logging to browser console
- Elements marked with `data-a11y-ally-fixed` attribute
- MutationObserver for dynamic content monitoring
- Debounced re-analysis on content changes

#### Documentation
- Comprehensive README with feature list
- Installation guide for Chrome, Edge, and Firefox
- Configuration guide for API setup
- Contributing guidelines
- Configuration documentation
- Demo page with examples of detectable issues
- MIT License

#### Project Structure
- ESLint configuration for code quality
- Git ignore file for clean repository
- Package.json for dependency management
- Extension icons in multiple sizes (16x16, 48x48, 128x128)

### Technical Details

#### Architecture
- Background service worker for API communication
- Content script for page analysis and patching
- Popup UI for user interaction
- Chrome Storage API for settings persistence

#### Browser Compatibility
- Chrome/Edge: Full support with Manifest V3
- Firefox: Compatible with minor API differences

#### Performance
- Runs on page load and monitors for changes
- Debounced analysis (1 second delay) for dynamic content
- Efficient DOM traversal
- Minimal memory footprint

### Known Limitations

- Low contrast issues are detected but not automatically fixed
- Complex heading structure issues may require manual intervention
- API-based features require user-provided API keys
- Some fixes may not work on sites with strict CSP policies

### Security

- All API keys stored locally in browser
- No data sent to third parties except configured APIs
- Direct API calls from browser (no intermediary servers)
- No tracking or analytics

---

## Future Roadmap

### Planned for 1.1.0
- [ ] Enhanced contrast ratio calculation and fixing
- [ ] ARIA role validation
- [ ] Focus management improvements
- [ ] Keyboard navigation testing
- [ ] More sophisticated heading structure fixes

### Planned for 1.2.0
- [ ] Options page for advanced configuration
- [ ] Custom rules support
- [ ] Export/import settings
- [ ] Detailed issue reports
- [ ] Integration with other accessibility testing tools

### Planned for 2.0.0
- [ ] Support for additional AI models
- [ ] Offline mode with pre-trained models
- [ ] Multi-language support
- [ ] Performance optimizations
- [ ] Advanced reporting dashboard

---

## Links

- [Repository](https://github.com/OREOP4IN/A11y-Ally)
- [Issues](https://github.com/OREOP4IN/A11y-Ally/issues)
- [WCAG Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
