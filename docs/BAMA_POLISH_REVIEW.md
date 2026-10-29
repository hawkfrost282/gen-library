# Focused BAMA review — personal.9

## Scope and approach

Gen Library is an existing Electron/React/TypeScript app, with an isolated renderer, validated main/worker boundaries, SQLite catalog, shared commands and message catalogs. Keep those working foundations. BAMA's Swift scaffolding, SwiftData persistence, native-control rewrite, icon replacement and blanket visual redesign would add migration risk without helping this request. No BAMA package or runtime dependency is needed. Existing translation coverage and private-workspace boundaries stay in place.

Apply its transferable practices: name concepts once, write the intended flow before changes, prefer existing components, keep explanations behind disclosures, check keyboard access and both appearances, and refactor one concrete problem at a time. Source review used BAMA's README, UX design/writing, Mac design/menus, design-system and improve-architecture guidance. Apple documentation is the authority when a broad BAMA rule needs interpretation.

## Strong: menu access and shared words

Signal: Settings appears in Help rather than the app menu; Library precedes File/Edit/View; the new List view is absent from the native View menu. English action capitalization and wording drift between the shared catalogs and newer components.

Plan: standard menu order, Settings… with ⌘,, view and sidebar/inspector commands routed through the same renderer actions; hide renderer reload commands in normal packaged builds; normalize common English commands in the existing catalog. Keep command IDs, shortcuts, file semantics and existing security gates stable.

UX: View menu or toolbar → choose view → same files and selection in the new view. Settings… → existing settings dialog → Close/Escape. No new storage operation.

## Strong: checked menu keyboard access

Signal: ContextMenuItem emits menuitemcheckbox, but the shared focus selectors only match menuitem. Column visibility and view choices cannot be reached with arrows.

Plan: one selector inventory for ordinary, checkbox and radio roles, consistently used by initial focus, pointer focus and keyboard paths. Escape also closes an empty/disabled-only menu. Embedded text fields keep editing keys. Regression tests exercise focus and activation.

## Strong: focused list and organization wording

Signal: the column chooser has a long paragraph, duplicate action names and a reset that also resets unrelated sort and thumbnail settings. Organization/Vault explanations repeat technical storage details before primary tasks.

Plan: concise commands and help with optional details; one Vault name; clear move/encryption consequences stay visible. Reset Columns affects only columns/widths/order, preserving sort and thumbnails. Improve list formatting readability without changing the table request/storage model.

## Worth exploring later

- App.tsx and LibraryService are very large orchestration files. Feature controllers and worker services are safer extraction targets than a broad rewrite; require behavior-level tests at each boundary.
- Native menu coverage of all selection commands is incomplete. Add commands by feature with selection, modal and private-workspace guards rather than moving hundreds of handlers at once.
- Complete language coverage of the fork's new organization/Vault features remains work. This English-focused pass retains existing catalogs and adds translated view/menu keys; do not claim full bilingual parity.
- macOS may append its own Full Screen entry alongside the existing custom fullscreen command. Unifying those safely requires preserving configurable shortcut behavior and should be handled separately.
- A full VoiceOver/Accessibility Inspector audit and large-library performance measurements are separate validation tasks. Keyboard and visual checks do not establish those claims.

Acceptance and verification results are recorded in GEN_LIBRARY_PREVIEW_9_VALIDATION.md.
