# Gen Library personal.5 validation

October 28, 2026. Native macOS arm64 development preview, locally ad-hoc signed. Not Developer ID signed or notarized.

## Organization changes

Physical storage, metadata and Smart Folder membership are separate layers. Regular folders remain real disk folders. Optional character placement is independent for each normal or private Library and uses character, Shared and Unassigned folders. Installing or merely enabling the setting does not reorganize existing files.

Smart Folders support nested AND/OR/NOT rules for tags, characters, stars, content level, favorites and other indexed metadata, plus manual includes and exclusions. Exclusion wins. Direct execution, counts and browsing use the same predicate; membership never copies or moves a file.

Vault routing supports NSFW, Vault, NSFW OR Vault and manual-only modes. Existing-match migration requires a choice. Manual moves can protect files without either tag. Disable Vault authenticates its password, warns about unencrypted storage, and performs a resumable verified merge into the current normal Library. It preserves tags, rating/favorite, metadata provenance, file modification dates and mapped Collection/Smart Folder memberships. Storage is marked disabled only after all remaining files are returned and the volume locks. A completed migration record does not constrain a later enable/disable cycle.

## Automated verification

- Full unit suite: **4,596 passed, 7 skipped**, across 661 passing files and three skipped files.
- Worker/native integration suite: **114 passed**, including real encrypted APFS entry and return, Smart Folder queries, physical organization and browse-session behavior.
- After final review, an additional repeated-enable/disable regression passed in the focused return suite: **11 passed**, including the real encrypted return path.
- Type checking passed. Lint reported zero errors and seven existing React hook dependency warnings across the repository; two are in App.tsx. The local generated QA app and synthetic fixtures are excluded from source linting.
- Production packaging, runtime-content verification and local signature verification passed.
- Transfers use strict worker response validation in regression fixtures. Wrong passwords, unchanged-source checks, metadata/byte verification failures, companion refusal, filename conflicts, lost removal acknowledgements, preserved AI provenance and original manual Smart Folder choices are covered.

## Interface verification

The new packaged preview has been built. Final interactive checks of the new organization controls remain pending: the computer-control tool confirmed that the Mac was locked and required manual unlocking. Earlier personal.4 interface checks do not constitute verification of these new controls.

No real image collection, hidden images, social accounts or paid AI APIs were used. Development fixtures and encrypted containers are synthetic and remain under the ignored project-local test directory. No user collection has been migrated or reorganized.

## Current limits

Available managed single-file assets with one revision are supported by the transfer path. Linked sources, missing/trashed entries, sequences, companions, multi-resource models/web files and revision histories stop disable preflight before file movement. The Vault is never marked disabled while unsupported items remain. Private catalogs remain offline and do not expose locked metadata through public Smart Folders. Broad power-loss, removable-drive and sleep validation, release signing/notarization and independent security review remain outstanding. Cleanup is not forensic erasure of old backups or system traces.

See [the comparison and architecture review](ORGANIZATION_MODEL_REVIEW.md) and [encrypted-library usage](ENCRYPTED_LIBRARIES.md).
