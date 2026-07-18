# API Studio Architecture

## Overview

API Studio is a Chrome Manifest V3 extension. It intercepts API traffic by attaching Chrome's Debugger API to a single active tab and sending Chrome DevTools Protocol commands.

The extension has four main runtime surfaces:

- Popup: current-tab enable/disable control.
- Options page: rule editor and request log.
- Studio page: full-tab request inspector and rule creation from real requests.
- Background service worker: interception engine.
- Offscreen plus sandbox pages: isolated JavaScript transform execution for JSON responses.

## End-To-End Flow

1. The user opens the popup from the Chrome toolbar.
2. `Popup.tsx` asks Chrome for the active tab with `chrome.tabs.query`.
3. The popup sends a runtime message to the background service worker with the tab ID.
4. `background.ts` forwards the request to `DebuggerManager`.
5. `DebuggerManager` attaches `chrome.debugger` to the tab.
6. `DebuggerManager` enables the CDP Fetch domain with `Fetch.enable`.
7. Chrome pauses matching network requests and emits `Fetch.requestPaused`.
8. `DebuggerManager` checks saved rules through `StorageService` and `RuleEngine`.
9. The request is continued, blocked, delayed, or fulfilled with a modified response.
10. A request log entry is saved to `chrome.storage.local`.
11. The Studio page reads logs and lets the user inspect matched, modified, blocked, or discovered requests.

## Chrome Debugger And CDP

`chrome.debugger` is the extension-safe transport into Chrome DevTools Protocol. API Studio currently uses the CDP Fetch domain:

- `Fetch.enable`: tells Chrome to pause requests/responses.
- `Fetch.requestPaused`: event Chrome emits when a request/response is paused.
- `Fetch.continueRequest`: resumes the request normally.
- `Fetch.failRequest`: blocks the request.
- `Fetch.getResponseBody`: reads the original response body while paused at response stage.
- `Fetch.fulfillRequest`: replaces the response that the page receives.

The extension currently limits handling to API-like resource types: `XHR` and `Fetch`.

## Popup To Website Tab Connection

The popup does not directly touch website JavaScript. It only discovers the active tab ID and sends messages to the background service worker.

The background worker attaches the debugger to that tab ID. From then on, Chrome routes paused network events for that tab to the extension through `chrome.debugger.onEvent`.

Current scope is current-tab only. Other tabs are unaffected until interception is enabled for them.

## Options And Studio To Interception Connection

The options page, Studio page, and background worker communicate through shared extension storage.

- The options page writes rules to `chrome.storage.local`.
- The Studio page writes starter rules to `chrome.storage.local` when the user creates a rule from a request.
- After creating a rule, Studio can open `options.html?ruleId=...`; the Options page reads that query parameter and selects the rule for editing.
- The background worker reads rules from `chrome.storage.local` whenever a request is paused.
- The background worker writes logs to `chrome.storage.local`.
- The options and Studio pages listen for storage changes and refresh their UI.

There is no direct connection from the options or Studio page to a website tab.

## Storage

API Studio uses `chrome.storage.local`, not browser `localStorage`.

Storage belongs to the extension and is persisted inside the user's Chrome profile. It survives browser restarts and extension reloads as long as Chrome treats the extension as the same extension ID.

Current storage shape:

```ts
{
  rules: ApiRule[];
  tabStates: Record<string, InterceptionState>;
  logs: RequestLogEntry[];
}
```

Rules are user configuration. Tab states track whether a tab is enabled/attached. Studio settings store UI/runtime options such as Discover mode. Logs keep the latest 100 request events. Request logs may include status code, duration, original response preview, modified response preview, matched rule, and action metadata. Response previews are capped so the extension does not store large bodies.

## Rule Engine

`RuleEngine` receives all saved rules and finds the first enabled rule matching:

- URL match type: `exact`, `contains`, or `regex`.
- URL value.
- HTTP method, or `ANY`.

Invalid regex patterns are treated as non-matches and returned as errors so they can be logged or displayed.

Current behavior: first enabled matching rule wins.

## Response Modification

At request stage:

- If no rule matches and Discover mode is off, API Studio calls `Fetch.continueRequest` without logging.
- If no rule matches and Discover mode is on, API Studio pauses again at response stage to capture a capped original response preview, logs it as `discovered`, fulfills the original response back to the page, and lets the Studio page create a starter rule from it.
- If the action is `block`, API Studio calls `Fetch.failRequest`.
- Otherwise, it stores the matched rule by CDP request ID and continues with `interceptResponse: true`.

At response stage:

- `delay` waits and then continues the original response.
- `replaceBody` and `customStatus` read the original response body, fulfill the modified response, and log original/modified previews.
- `modifyJson` reads the original body, transforms JSON in the sandbox flow, fulfills with transformed JSON, and logs original/modified previews.
- Fulfilled responses store small previews for inspection and rule creation.

`Fetch.fulfillRequest` requires base64-encoded response bodies, handled by `src/shared/base64.ts`.

## Sandboxed JavaScript Transforms

Manifest V3 extension pages cannot freely execute arbitrary dynamic code. To support user-authored JSON transform JavaScript, API Studio uses a sandbox page.

Flow:

1. Background calls `TransformSandboxClient.runTransform`.
2. The client ensures `offscreen.html` exists.
3. The offscreen page hosts `sandbox.html` in an iframe.
4. The sandbox page runs the transform with `new Function`.
5. The transformed value is returned to the background.
6. The background serializes it as JSON and fulfills the response.

The sandbox page is declared in `manifest.json` under `sandbox.pages` and has a separate sandbox CSP.

## Important Constraints

- Attaching `chrome.debugger` shows Chrome's standard debugging notification to the user.
- Only one debugger client can attach to a tab at a time; Chrome DevTools or another extension may conflict.
- The current implementation is Chrome/Chromium focused.
- Service workers can be suspended by Chrome; persistent state must live in storage, not only in memory.
- Studio is intentionally quiet by default. Unmatched request capture only happens when Discover mode is enabled.
- Studio currently shows recent locally stored logs, not a long-term database or backend-backed history.
- Request modification, header editing, profiles, import/export, WebSockets, and HAR recording are future features.
