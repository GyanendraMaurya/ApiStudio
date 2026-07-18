# API Studio

API Studio is a Manifest V3 Chrome extension for intercepting and modifying API traffic with the Chrome Debugger API.

## Development Workflow

Install dependencies once:

```bash
npm install
```

Build the extension:

```bash
npm run build
```

Load the extension once:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this folder:

```text
/Users/gyanendramaurya/Desktop/projects/ApiStudio/dist
```

For day-to-day changes, keep Vite building in watch mode:

```bash
npm run watch
```

Then:

- Popup/options UI changes: close and reopen the extension popup, or refresh the options page.
- Background service worker or manifest changes: click the reload icon for API Studio on `chrome://extensions`.
- You do not need to click Load unpacked again unless you remove the extension or switch to a different build folder.

## Checks

```bash
npm test
npm run build
```
