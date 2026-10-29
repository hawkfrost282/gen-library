# Gen Library personal.9 validation

## Changes

A focused BAMA-inspired interface and maintenance pass, retaining Electron, React, the current design system and file-storage architecture. See [the review](BAMA_POLISH_REVIEW.md), [writing guide](UI_WRITING_GUIDE.md) and [glossary](glossary.md).

- Standard macOS menu order, Settings… in the app menu with Command-comma, and view/sidebar/inspector commands using existing handlers. View checkmarks and panel action labels follow renderer state. Normal packaged menus hide developer reload commands.
- One native command inventory and parser shared by type definitions and the preload bridge. This fixes silently dropped Paste Image and missing-linked-file visibility commands.
- 118 existing English action labels normalized in the shared catalog. Added translated List/menu messages without a second translation framework.
- Shared context-menu focus includes checked items. Unavailable items are skipped, text fields retain editing keys, and Escape is handled before looking for an enabled action.
- Shorter column, organization and Vault explanations. Existing password, encryption consequences and safe-migration safeguards remain. Column discovery and local cell formatting have separate modules. Reset Columns preserves sort and thumbnails; column edges expose keyboard resizing. Date formatters are cached per locale; original sort values and large seeds stay intact.

## Automated evidence

- Full unit suite: **4,607 passed, 7 skipped** (663 test files passed; 3 skipped).
- Focused interface run: **70 passed**, covering menus, context-menu keyboard access, list preferences, formatting, Vault controls and library chooser actions.
- Final menu-only display refinement: **17 passed**.
- Type checking passed. Targeted lint: no errors; two pre-existing App.tsx hook warnings remain.
- Final macOS arm64 packaging and packaged runtime verification passed. Ad-hoc code-signature verification passed.

## Live packaged-app checks

Used an isolated profile and a 105-file synthetic Library. No personal artwork was imported, moved, tagged, sent to AI or deleted. No Vault was unlocked or created.

- Native View → Grid changed the existing view. Hide Sidebar hid it; the next menu showed Show Sidebar and restored it. Native menu order and Settings placement were visible.
- List view and the column chooser were inspected in light appearance; List view also inspected in dark appearance. Metadata columns, pagination and existing ratings remained visible.
- Column search returned a clear empty-result message. Reset behavior and checked-item keyboard navigation were verified by automated regression tests.
- Organization and Vault screens were inspected; ordinary-file access instructions, optional character organization, source-copy warning, password policy, unlocked-file access and lock limitations remained present. Advanced storage and routing sections were folded by default.
- Final normal-profile preview reopened after the checks.

## Limits

This is a focused polish release, not a full Apple HIG certification or complete accessibility audit. Native key injection during computer-use checks was unreliable; keyboard navigation has DOM regression coverage, while a complete manual keyboard/VoiceOver and Accessibility Inspector audit remains outstanding. Not every settings page was recaptured in both appearances, and narrow-window coverage is not complete. New List control messages have translated catalog entries; generated metadata headers and the fork's organization/Vault features do not yet have full bilingual coverage. Large-file orchestration refactors and native fullscreen-menu unification remain follow-up candidates in the review.
