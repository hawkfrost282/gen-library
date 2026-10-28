# Optional NSFW vault routing — preview

Implemented in personal.4. Off by default. Development and native disk tests use only synthetic images.

## Use it

1. Open Encrypted libraries and choose a destination vault under **NSFW routing**.
2. Enable routing. Existing images are unchanged. New manual assignments are checked for an exact, case-insensitive `NSFW` tag; no image recognition or paid AI is used.
3. Use `Character: Momo` to select a `Momo` folder in the vault. Alternatively enter a folder for a pending image and choose one existing character tag to remember. Multiple or missing character matches ask for a choice.
4. With automatic moves off, use **Move next image**. With automatic moves on, new manual matches move only if one character is known and the selected vault is unlocked. A locked destination prompts for unlocking; its pending original is still outside encryption. After unlocking, choose Move next image.
5. **Review existing NSFW images** queues matches from currently open libraries without automatically moving them. Review and move them one at a time. **Skip · keep outside vault** clears a pending item without changing its original.

The destination and remembered character-tag/folder mappings are saved in ordinary app settings, outside encryption. Pending operational IDs survive app restart. Reopen their source libraries before continuing. The queue has a 10,000-image limit; review further batches after clearing it. Only manual tag assignments trigger this preview. AI/plugin/sync/import tag producers require explicit review; they are not presented as automatic routing.

## What a move does

The normal worker checks the source and computes content and metadata fingerprints. The vault controller stages it only inside the mounted encrypted volume. The private workspace imports through its existing worker, creates the character folder and restores tag names, stars, favorite, description, author and source URL. Exact original image bytes retain embedded prompts, models and LoRAs.

The private worker verifies the destination and flushes its catalog and image before writing a receipt. Each attempt requires a fresh verification nonce; an old receipt cannot authorize deletion of a private image that was subsequently deleted or changed. Only after acknowledgement does the source worker recheck the original content, revision and metadata, cancel media jobs, remove its current derived artifacts and managed original/catalog entry, and set an undo barrier. The normal Chromium cache is cleared. Shared artifacts referenced by another asset remain for that asset.

This preview supports available managed single images with one revision. Linked files, sequences, revision histories and recognized JSON/TXT/XMP/YAML companion files are refused. Legacy nonempty manual palettes or incompatible tag names can prevent metadata verification; the original is retained rather than silently losing metadata. Collections, original folder hierarchy, AI analysis history and tag definitions/origins are not transferred. Tag names are preserved.

## Failure and privacy boundaries

- New AI analysis and sync work in the normal app are paused while routing is enabled. Already submitted network requests cannot be recalled. Private workspaces remain offline regardless of the routing rule.
- A failed or interrupted copy, locked/full vault, unsupported source, stale receipt or changed source leaves an original for review. Destination import progress and receipts support retry. Rare interruption between import commit and its progress record can leave an extra encrypted copy; review it instead of assuming exact-once import.
- Pending originals are not encrypted. Enabling a rule is not proof that a collection has been protected. Do not remove external originals based solely on a tag.
- Current source artifact removal and cache clearing do not erase old backup databases, undo/history records, SQLite free pages, original import locations, exports, clipboard content or OS-level traces. This feature is not forensic erasure or protection from software running as the signed-in user while a vault is unlocked.
- Automatic routing is an early preview. Broad power-loss, removable-drive and sleep testing and independent security review remain outstanding.
