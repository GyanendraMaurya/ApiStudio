# API Studio

API Studio is a Manifest V3 Chrome extension for intercepting and modifying API traffic with the Chrome Debugger API.

## What It Does

- Enables/disables interception for the current Chrome tab from the popup.
- Attaches `chrome.debugger` to that tab and uses Chrome DevTools Protocol Fetch commands.
- Matches Fetch/XHR requests against locally saved rules.
- Supports response replacement, JSON transform scripts, custom status codes, artificial delay, and request blocking.
- Stores rules, tab state, and recent request logs in `chrome.storage.local`.

## Read This First

For future development or AI-assisted work:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the extension works end to end.
- [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md): where files live and what each area owns.
- [docs/AI_HANDOFF.md](docs/AI_HANDOFF.md): instructions for future AI agents working on this repo.
- [AGENTS.md](AGENTS.md): short repo-specific working rules for coding agents.

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

Run tests during development:

```bash
npm test
```

Run a production build before loading/reloading the extension:

```bash
npm run build
```

## Current Phase

This is Phase 1/MVP. The code is intentionally structured for future features such as request modification, header editing, GraphQL operation matching, import/export, multiple rule profiles, WebSocket interception, HAR recording, and a full-tab studio UI.
