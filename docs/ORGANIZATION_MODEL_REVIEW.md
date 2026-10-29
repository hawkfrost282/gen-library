# Organization model review — Gen Library personal.5

The design now treats physical storage, descriptive metadata and Smart Folder membership as separate concerns. No existing user collection is reorganized by installing this preview.

| Area | Previous behavior | Refactored behavior |
|---|---|---|
| Regular folders | Real folders below the library's Assets directory | Retained; users can arrange them manually |
| Character placement | Vault routing assumed a character folder | Independent, off-by-default physical policy per Library; one character, Shared or Unassigned |
| Tags | Metadata in SQLite, with a special NSFW routing hook | Metadata producers emit exact tag deltas; a separate opt-in storage coordinator decides whether movement applies |
| Smart Folders | Saved flat search/filter definitions, called Smart Collections | Saved definitions plus nested AND/OR/NOT rule trees and manual include/exclude overrides |
| Smart Folder membership | Automatic matches | Automatic matches OR manual includes, with manual exclusion winning; live UI filters apply outside this membership |
| Canonical file | Managed files and linked sources | Virtual memberships keep the same asset and file; view changes never copy or move it |
| Vault meaning | NSFW destination | Optional protected physical storage for manually selected files or configured trigger matches |
| Trigger | NSFW only | NSFW, Vault, NSFW OR Vault, or manual only |
| Disable | Pausing the routing checkbox left protected data in place | Distinct password-authenticated return migration into the current normal Library; storage is marked disabled only after verification and locking |
| Re-enable | No existing-match decision | Turning on a trigger asks to move existing matches or apply it only to future assignments |

## Physical storage

The Organization button applies to the active Library, including a private Vault Library. Enabling character organization affects new imports and actual character-tag changes. Enabling the setting alone does not move existing files. Reorganizing existing files is a separate explicit action.

Characters use `Character: Momo` metadata tags (legacy tag-to-folder mappings are also recognized). Several characters use Shared; none use Unassigned. An unrelated tag edit does not invoke character movement. Disabling character organization leaves the physical arrangement alone. Linked files are never silently relocated by this policy.

Vault entry preserves the source's physical relative folder by default. Its character policy can instead choose character/Shared/Unassigned folders. A reviewed per-file destination can override that placement. Smart Folders and metadata restoration do not invoke another storage move.

## Smart Folders

The UI uses the term Smart Folders; internal `smart-collection` protocol names remain compatible. Rule types cover tags, characters, stars, content-level tags, favorites, author, description and indexed metadata. Character and content-level rules are explicit metadata matches, not image-content guesses. Content levels use NSFW or `Content: Explicit` style tags.

Nested AND/OR/NOT rules are parameterized SQL. A rule is bounded to eight nested levels and 512 nodes. Manual include/exclude lists support up to 10,000 entries per definition, with a 1 MiB serialized definition limit. There is no exclusive membership or per-image limit on the number of Smart Folders it may match. Membership is virtual and never creates another canonical file.

Saved legacy search/filter definitions continue to work. Sidebar counts, paged browsing, full-scope selection and direct execution use the same membership predicate. Manual exclusion wins over both a rule match and manual inclusion. Ordinary live search/filters further narrow the resulting view.

## Optional Vault storage

The trigger, automatic execution and character placement are independent settings. Manual moves do not require NSFW or Vault tags. Trigger changes do not classify image content or use an AI API. Existing matches are never silently migrated when enabling a new trigger; the user chooses all existing matches or future changes only. A locked Vault keeps sources pending.

For privacy, new analysis, embedding and synchronization work is paused while Vault routing or a return migration is active. Already sent requests cannot be recalled. Private workspaces remain offline and keep their catalog/cache inside encrypted APFS storage.

## Disabling and returning files

Disable Vault is separate from pausing tag routing. The user selects the current normal Library as the merge destination, reads the unencrypted-storage warning, confirms it and supplies the Vault password. The controller closes any existing private session, then performs a fresh attach with that password; an already-unlocked session cannot bypass authentication.

Preflight inventories the private catalog before moving files. The resumable journal records mappings from source assets to destination assets. A deterministic temporary import name recovers the narrow crash gap between import commit and journal update. File bytes and metadata are verified and flushed before each protected source is removed. The source is checked again for changes before removal. Existing normal files are never overwritten on a name conflict.

The merge preserves physical folders when practical, or uses the normal Library's character policy if enabled. It preserves descriptive metadata, tags and their human/AI origins, AI analysis fields, stars, favorites and original image bytes including embedded generation information. Collections and Smart Folder definitions are restored, and manual memberships/tag-ID filters are mapped to destination identities. Normal Library views and folders are preserved. Per-asset storage identities retain the previous identity in each Library, so original manual Smart Folder includes and excludes can be remapped when an image returns. These opaque identity records stay inside the Library metadata area (and inside encryption for a Vault). File modification dates are restored explicitly after import.

After all returned files and metadata verify, the remaining Vault inventory must be empty and the encrypted volume must lock safely. Only then is Vault storage marked disabled and automatic routing turned off. A failed password, copy, metadata check, remaining file or failed lock leaves the Vault in a visible unfinished state, with automatic routing paused. A retry requires its password again and resumes verified progress. Returned files retain NSFW and Vault tags.

## Current limits and privacy boundaries

- Private storage still owns a separate offline catalog. This does not expose a locked Vault's metadata as ordinary public Smart Folder results.
- The safe transfer path currently handles available managed single-file assets with one revision. Linked sources, missing/trashed entries, sequences, recognized companion files and multi-resource models/web files require review. Disable preflight refuses these before moving anything; it never silently drops history or marks an incomplete migration disabled.
- A move is copy/verify/remove, so transient staging and a protected original coexist during migration. Completed virtual views do not create copies.
- Live filesystem edits to files being migrated can stop verification. Keep the migration journal and retry rather than assuming storage was disabled.
- Current cache/artifact cleanup does not erase prior backups, SQLite free pages, old exports, clipboard contents or system-level traces. An unlocked Vault is accessible to the signed-in account. This is not forensic erasure or isolation from malware running as that account.
- Broad power-loss, sleep/removable-drive validation, release signing/notarization and an independent security review remain outstanding.
