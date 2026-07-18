# API Studio Agent Notes

This file is for AI coding agents and future contributors.

## Read Before Editing

Start with these files:

1. `README.md`
2. `docs/ARCHITECTURE.md`
3. `docs/PROJECT_STRUCTURE.md`
4. `docs/AI_HANDOFF.md`

Then inspect the relevant source files before making changes.

## Development Rules

- Keep the extension Manifest V3 compatible.
- Keep Chrome extension APIs behind service-style modules where practical.
- Prefer small, typed modules over large mixed UI/background files.
- Preserve the current separation between popup UI, options UI, background/CDP logic, storage, rule matching, and sandbox transforms.
- Run `npm test` and `npm run build` after meaningful changes.

## Documentation Maintenance

Update docs when a change significantly alters:

- Extension permissions or manifest behavior.
- Storage shape or migration assumptions.
- CDP interception flow.
- Rule model or action behavior.
- Major file structure.
- Development workflow.
- Security posture, especially sandboxed user JavaScript execution.

If a change is tiny, like copy, spacing, or a minor style fix, docs usually do not need updates.
