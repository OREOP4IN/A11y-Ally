# Contributing to A11y Ally

Thank you for your interest in contributing to A11y Ally! This document provides guidelines and instructions for contributing.

## How to Contribute

### Reporting Issues

If you find a bug or have a suggestion:

1. Check if the issue already exists in the [Issues](https://github.com/OREOP4IN/A11y-Ally/issues) section
2. If not, create a new issue with:
   - Clear title and description
   - Steps to reproduce (for bugs)
   - Expected vs actual behavior
   - Browser and version information
   - Screenshots if applicable

### Submitting Changes

1. Fork the repository
2. Create a new branch: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Test your changes thoroughly
5. Commit with clear messages: `git commit -m "Add feature: description"`
6. Push to your fork: `git push origin feature/your-feature-name`
7. Create a Pull Request

### Code Style

- Use consistent indentation (2 spaces)
- Follow existing code patterns
- Add comments for complex logic
- Keep functions focused and small
- Use meaningful variable names

### Adding New WCAG Checks

When adding a new accessibility check:

1. Reference the specific WCAG criterion (e.g., "WCAG 1.4.3")
2. Add detection logic in `content.js`
3. Implement the fix function
4. Update README.md with the new criterion
5. Test on multiple websites

### Testing

Before submitting:

1. Test the extension in Chrome/Edge and Firefox
2. Verify on multiple websites
3. Check that existing functionality still works
4. Test with and without API keys configured

### Documentation

- Update README.md for new features
- Add inline comments for complex code
- Document API changes
- Update WCAG criteria table if applicable

## Development Setup

1. Clone the repository
2. Make your changes
3. Load the extension in developer mode
4. Test thoroughly

## Questions?

Feel free to open an issue for questions or discussion.

## Code of Conduct

Be respectful and inclusive. We're all here to make the web more accessible!
