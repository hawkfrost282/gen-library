# Optional routing of tagged images into a vault

Status: design only. No routing toggle is exposed yet and no collection is migrated by these changes.

## User behavior

- Off by default, with an explicitly chosen destination vault and matching tags. Start with exact, case-insensitive `NSFW`; do not infer image content or use substring matches.
- Distinguish a verified **move** from a **copy**. A copy leaves the original outside encryption. The destination must be verified before any source can be removed.
- For a locked destination, offer to unlock it. Do not silently route to an ordinary folder, save its password, or label an image protected while it remains outside the vault.
- Ask separately before processing existing matches in bulk. Turning a rule on must not unexpectedly migrate the existing collection.
- Offer per-image confirmation or automatic routing, chosen explicitly. Linked originals need a separate explicit policy because they may be used by other apps.

## Transfer requirements

Route through the private workspace that owns the destination catalog. The main app must not open that live catalog with a second writer. An encrypted inbox and receipt can support private import without opening networking or plugins.

Preserve original image bytes, embedded generation information, tag names, rating, favorite marker, description, author, palette and source URL. Preserve or explicitly refuse multi-file assets, revision histories and companions; never drop them silently.

A move requires a durable, verified destination receipt, content hashes and a check that the source revision and metadata have not changed. Retry safely after a crash without deleting an unverified source or creating endless duplicate copies. Full disks, cancellation, locking, missing sources, and stale source state must leave a recoverable result with honest status.

Ordinary delete helpers remove catalog rows and the original file but can leave derived artifact files behind. A privacy-oriented move must deliberately handle those thumbnails/previews as well, invalidate source caches and refresh the ordinary window. Existing backup databases, SQLite history/free pages, exports and OS-level traces are not retroactively encrypted; do not promise forensic erasure.

Observe changes from all supported tag producers, including manual changes and library operations. Coalesce events and query matching tag IDs efficiently, without repeatedly loading every image or invoking an AI model. Prevent automated AI/sync work from being presented as private merely because a pending image has a matching tag.

Use only synthetic libraries and vaults for development and destructive transfer tests.
