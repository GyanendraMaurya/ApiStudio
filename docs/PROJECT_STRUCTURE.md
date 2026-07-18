# Project Structure

Root folder:

```text
/Users/gyanendramaurya/Desktop/projects/ApiStudio
```

## Top-Level Files

- `package.json`: npm scripts and dependencies.
- `package-lock.json`: locked dependency versions.
- `vite.config.ts`: Vite multi-entry build for popup, options, Studio, background, offscreen, and sandbox.
- `tsconfig.json`: strict TypeScript configuration.
- `public/manifest.json`: Manifest V3 extension manifest copied into `dist`.
- `popup.html`: popup entry HTML.
- `options.html`: options page entry HTML.
- `studio.html`: full-page Studio entry HTML.
- `offscreen.html`: offscreen document entry HTML.
- `sandbox.html`: sandbox iframe entry HTML.
- `README.md`: project overview and development workflow.
- `AGENTS.md`: short AI/contributor instructions.

## Source Folders

```text
src/background
```

Background service worker and CDP orchestration.

- `background.ts`: runtime message entrypoint.
- `DebuggerManager.ts`: attach/detach debugger, listen to CDP events, apply rules, fulfill/block/continue requests.
- `TransformSandboxClient.ts`: creates offscreen document and sends transform requests.
- `chromeAsync.ts`: small wrappers around Chrome debugger APIs.

```text
src/options
```

React options page for rules CRUD and request logs.

- `Options.tsx`: rule list, editor, validation, save message, request log table.

```text
src/popup
```

React popup page.

- `Popup.tsx`: active-tab lookup, enable/disable interception, open options.

```text
src/studio
```

React full-page request inspector.

- `Studio.tsx`: request timeline, details panel, filters, and create-rule-from-request action.

```text
src/services
```

Shared services used across extension surfaces.

- `RuleEngine.ts`: pure rule matching logic.
- `RuleFactory.ts`: creates blank rules and starter rules from request logs.
- `StorageService.ts`: typed wrapper around `chrome.storage.local`.
- `RuleEngine.test.ts`: rule matching tests.
- `RuleFactory.test.ts`: rule creation tests.
- `StorageService.test.ts`: storage constants/default tests.

```text
src/shared
```

Shared types and utilities.

- `types.ts`: rule, action, storage, log, and tab state types.
- `messages.ts`: runtime message constants and response types.
- `base64.ts`: UTF-8 safe base64 helpers and ID helper.

```text
src/offscreen
```

Offscreen page logic.

- `offscreen.ts`: receives transform requests from background and forwards them to the sandbox iframe.

```text
src/sandbox
```

Sandbox-only code.

- `sandbox.ts`: runs user transform JavaScript in a sandboxed page and returns the result.

```text
src/ui
```

Shared UI styling.

- `styles.css`: popup/options layout and components.

## Build Output

```text
dist
```

This is the folder loaded in `chrome://extensions` as an unpacked extension.

Do not edit files in `dist` directly. Edit source files and run:

```bash
npm run build
```

or during development:

```bash
npm run watch
```
