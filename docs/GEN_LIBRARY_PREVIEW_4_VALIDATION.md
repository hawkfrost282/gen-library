# Gen Library personal.4 validation

October 28, 2026. Native macOS arm64 preview, locally ad-hoc signed. Not Developer ID signed or notarized.

## Changes

- Optional NSFW moves into encrypted character folders, with an explicitly chosen vault.
- One unambiguous `Character: Name` tag, or a remembered tag-to-folder mapping, supplies the character folder. Ambiguous matches require review.
- New manual matches can move automatically when enabled and the selected vault is unlocked. Existing matches are separately queued for per-image review. Locked vaults keep originals pending, and pending IDs recover after restart.
- Hash-verified staging and private-worker import preserve original image bytes, tag names, stars, favorite, description, author and source URL. Embedded generation metadata stays in the original bytes.
- A fresh verified receipt and an unchanged source snapshot are required before source cleanup. Source artifacts and Chromium cache are handled explicitly. Previously issued receipts must be rechecked against the current private asset.
- Optional controls are folded by default and sit below the password controls. Capacity remains under Advanced and existing locked vaults can be enlarged.

## Verification

- Full unit suite during development: 4,585 passed, 7 skipped. Subsequent changes also received focused routing, interface, appearance and lifecycle regression checks.
- Focused unit/UI checks: 25 passed in the final run, including explicit retry after a failed private import.
- Final worker/native routing checks: 7 passed, including actual encrypted APFS creation, transfer, lock and reopen; changed originals; damaged staging; fresh receipt verification; companion refusal; and source thumbnail cleanup.
- Type checking, targeted lint, whitespace, packaged runtime verification and local signature verification passed.
- The actual packaged application opened an isolated synthetic source/profile. Choosing a vault left routing off. A manual NSFW tag queued an image, identified Momo, and left the source present while the destination was locked. A restart recovered its pending tags and folder. Unlocking and selecting Move next image then completed the move.
- The initial UI test exposed an extra command field in the prepared response. It failed closed with the original retained. The response was corrected, its strict schema was added to the worker regression fixture, and the actual packaged flow subsequently passed.
- The resulting private catalog showed folder Momo, five stars, favorite enabled, and tags Character: Momo and NSFW. SHA-256 confirmed exact image bytes. The normal source contained zero images after completion. The disposable vault was then safely locked.

No real image collection, hidden images, social accounts or paid AI APIs were used. Routing remains off in the ordinary user profile.

## Limits

This is an early preview. Managed available single images with one revision are supported. Linked images, sequences, recognized companion files and revision histories are refused. Tag names transfer; collections, prior folder hierarchy, tag definitions/origins and AI analysis history do not. Legacy manual palettes or incompatible tag names can stop verification safely. New image analysis and sync are paused while routing is on. Already sent requests and outside copies/backups cannot be recalled or encrypted retroactively. Source cleanup does not promise forensic erasure. Broader power-loss, removable-drive and sleep validation and independent security review remain outstanding.
