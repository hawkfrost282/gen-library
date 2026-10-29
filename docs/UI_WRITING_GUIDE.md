# Gen Library interface writing

Voice: calm, direct, brief. Use this guide for new and changed UI; it does not require rewriting the app or replacing its existing components.

## Words and actions

Use the product glossary in [glossary.md](glossary.md). Say **file** for the image, video or document a person manages; keep asset IDs and catalog terminology in developer documentation. A **Library** contains managed files and metadata. A **folder** is physical. A **Collection** is manual and virtual. A **Smart Folder** is rule-based, with manual inclusions and exclusions. A **Vault** is optional encrypted physical storage; its unlocked window is a private workspace.

- Use short verb phrases for commands: Import Files…, Show in Finder, Move to Trash.
- Use title case for English buttons, menu commands, dialog titles and column headers. Use sentence case for explanatory text, field labels, status messages and tooltips. Keep acronyms such as AI, URL, ISO and LoRA intact.
- Use an ellipsis when a command needs a choice or input before it acts. Opening an informational view alone does not need an ellipsis. Completion buttons say Create Vault, Save or Done.
- Use one action name across toolbar, menu and context menu. Put reusable translated labels in the existing message catalogs; do not add runtime capitalization or a competing translation system.
- Distinguish recoverable Move to Trash from permanent Delete. Retain warnings, passwords and verification for file moves and Vault changes.
- Errors say what happened and what to try. Keep file paths and technical details in disclosure sections when they help recovery.

## Density and access

Lead with the action or setting. One sentence of help is usually enough; put background and limitations in a disclosure. Never hide a privacy consequence or an irreversible-action warning in optional help. Use true singular/plural forms for counts.

Use existing shared controls and design tokens. Icon-only buttons need accessible names and useful hover help. Keyboard focus must reach ordinary and checked menu items, skip unavailable items, and close with Escape. Preserve text editing keys inside menus. Do not restyle the whole app to imitate SwiftUI.

On macOS keep App, File, Edit, View, Library, Window, Help order. Put Settings… (⌘,) in the app menu. Add common views to View and reuse the toolbar's handlers. Do not assign standard system shortcuts a different meaning.

## Review before shipping

Check changed screens in light and dark appearance, narrow and wide layouts, pointer and keyboard operation, empty results and long text. Run tests for changed behavior plus type checking and package verification. Record what was actually checked; do not claim a full accessibility audit from screenshots alone.

Sources: [Apple Writing](https://developer.apple.com/design/human-interface-guidelines/writing), [Menus](https://developer.apple.com/design/human-interface-guidelines/menus), [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons), [Context Menus](https://developer.apple.com/design/human-interface-guidelines/context-menus). Adapted review practices: [BAMA UX design](https://github.com/daveebbelaar/bama/blob/main/skills/design/ux-design/SKILL.md), [Mac design](https://github.com/daveebbelaar/bama/blob/main/skills/design/mac-design/SKILL.md), [incremental architecture review](https://github.com/daveebbelaar/bama/blob/main/skills/code/improve-architecture/SKILL.md).
