# AI Handoff Guide

This document is for future AI assistants or agents working on API Studio.

## Project Summary

API Studio is a Chrome Manifest V3 extension built with Vite, React, and TypeScript. It uses `chrome.debugger` as a transport to Chrome DevTools Protocol and currently intercepts Fetch/XHR traffic for the active tab.

The project is intentionally modular so it can grow into a fuller API debugging studio with request modification, header editing, GraphQL matching, profiles, import/export, WebSocket interception, HAR recording, and a full-tab UI.

## Before Making Changes

Read these files first:

1. `README.md`
2. `docs/ARCHITECTURE.md`
3. `docs/PROJECT_STRUCTURE.md`
4. `public/manifest.json`
5. The specific source files related to the requested change.

Use `rg` to search before assuming where code lives.

## Current Technical Decisions

- Framework: Vite + React + TypeScript.
- Extension target: Chrome/Chromium Manifest V3.
- Interception: `chrome.debugger` plus CDP Fetch domain.
- Scope: current tab only.
- Storage: `chrome.storage.local`.
- Rule behavior: first enabled matching rule wins.
- User JavaScript transforms: sandboxed page reached through an offscreen document.
- Logs: latest 100 entries in extension local storage.

## Common Workflows

Install dependencies:

```bash
npm install
```

Watch build while developing:

```bash
npm run watch
```

Run checks:

```bash
npm test
npm run build
```

Load extension:

```text
chrome://extensions -> Developer mode -> Load unpacked -> dist
```

Reload behavior:

- Popup/options changes: close/reopen popup or refresh options page.
- Background/manifest changes: click reload on `chrome://extensions`.

## How To Add Features Safely

- Put pure matching or transformation policy in testable service modules.
- Keep Chrome API calls in background or service wrappers.
- Keep UI components focused on reading/writing typed state.
- Update shared types in `src/shared/types.ts` before wiring UI/background behavior.
- Add or update tests for rule matching, storage shape, and any pure behavior.
- Avoid relying on service worker memory for important state; persist durable data in `chrome.storage.local`.

## Documentation Update Policy

Update docs whenever a change significantly affects how another engineer or AI would understand the system.

Update `docs/ARCHITECTURE.md` for:

- CDP flow changes.
- New extension runtime surfaces.
- Storage model changes.
- Rule engine semantics.
- Security or sandbox changes.
- Current-tab vs multi-tab/profile behavior changes.

Update `docs/PROJECT_STRUCTURE.md` for:

- New folders.
- Renamed files.
- Moved responsibilities.
- New build/runtime entrypoints.

Update `README.md` for:

- New setup steps.
- New scripts.
- Changed development workflow.
- User-visible feature changes.

Update `AGENTS.md` if:

- Future AI agents need different repo-specific instructions.
- The definition of a "significant change" changes.

Small UI tweaks, copy changes, or internal refactors that do not alter behavior usually do not require doc updates.

## Known Limitations

- `chrome.debugger` can conflict with Chrome DevTools or other debugger clients.
- Debugger attachment is visible to the user through Chrome's standard warning.
- The current implementation focuses on XHR/Fetch, not documents, images, scripts, WebSockets, or HAR capture.
- Loaded-unpacked extension storage persistence depends on Chrome keeping the same extension ID.
