# Gen Library personal.7 — completed interface validation

October 28, 2026. Locally ad-hoc signed macOS arm64 preview; not Developer ID signed or notarized. All test images, the Vault and its password are disposable synthetic fixtures. The ordinary profile and user collection were not reorganized.

## Packaged app checks

- Library files in Finder opened the real `Assets/` directory. Reveal in Finder highlighted the selected managed image in its real subfolder. Both controls fit the running app layout.
- Physical character organization started off. Enabling it left all three existing images in Manual layout; an unrelated Vault-tag assignment also left that layout alone while its destination was locked.
- The nested character AND five-star AND favorite Smart Folder matched Momo.png. Manually excluding it produced an empty view while all three canonical files stayed on disk.
- The Vault trigger menu exposed NSFW, Vault, NSFW OR Vault and manual-only choices. Choosing a destination left routing off. Enabling a trigger required the existing-matches/future-changes decision.
- Future changes only did not move existing matches. Adding the Vault tag queued the chosen file; the locked destination left its original present and Move next disabled.
- Unlocking the real encrypted APFS Vault and enabling its separate character policy moved the verified image under Momo. The normal catalog then held two files and the private catalog one.
- Disable Vault required a password even though the Vault was already unlocked, plus the explicit unencrypted-storage warning. The merge returned the file into the current Library's Momo folder. Only after verification and locking did storage show Disabled, with no remaining session.
- The returned file retained five stars, favorite, character and Vault tags, prompt/model/LoRA details and exact original fixture bytes (SHA-256 comparison). Its original normal Smart Folder exclusion remained effective. The ordinary character Smart Folder again showed both expected images.
- Re-enable required its password. Routing stayed off until enabled separately, then asked again whether to move existing matches or apply the rule only to future changes.
- Manual queueing accepted Shared.png without a trigger tag. Two character tags selected Shared. Changing the private character policy off and on now refreshes the reviewed folder between Manual layout and Shared. This display-only job was skipped without moving its original.

## Correction found during these checks

The pending-folder field initially retained its old default after the private character policy changed, while the move correctly reread the actual private policy. The controller now refreshes pending destinations from current source paths after saving that policy, so the reviewed field and move agree. Failed refreshes invalidate the stale destination. A regression checks both directions and confirms that refreshing does not transfer or remove a source.

## Final verification

- Focused routing and settings regression checks: 15 passed.
- Type checking, targeted lint, whitespace validation, production packaging, runtime-content checks and local signature verification passed.
- The earlier personal.5 unit/native suites and personal.6 managed-import/Finder checks remain recorded in their respective validation reports.
- The disposable queue was cleared, tag routing turned off, and encrypted storage safely locked after testing. The normal preview was reopened separately.

The documented single-file transfer limits and privacy boundaries remain in place; these interface checks are not broad power-loss, sleep/removable-drive validation or an independent security review. See [the organization review](ORGANIZATION_MODEL_REVIEW.md) and [normal file access](MANAGED_FILES.md).
