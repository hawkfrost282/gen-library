# Gen Library development roadmap

## Delivered in the first preview

Generation-metadata extraction and inspector display, temporary identity and icon, production dependency updates, safer linked-original deletion, verified optional model/runtime downloads, static HTML previews, and a disabled unpaired browser listener. See the root README for the exact scope and limitations.

## Encrypted libraries: macOS preview

A hidden folder or hidden tag is not encryption. Encrypt the images **and** everything that can reveal their content: catalog, tags, thumbnails, previews, local indexes, application cache, session data and logs.

Implemented macOS design: a password-protected AES-256 sparse bundle, opening a separate application workspace whose entire profile and library live inside the mounted encrypted volume. Ordinary images remain ordinary files while the volume is unlocked. Locking must close that workspace, finish database writes, release file handles, and successfully unmount the volume before showing “locked.” A busy volume must remain visibly unlocked with an actionable error. Never force-unmount or silently discard changes.

Passwords should travel over a pipe to macOS disk utilities, not command-line arguments, preferences, logs, GitHub, or an AI provider. Start without saved passwords or recovery-key automation. Sleep/screen-lock behavior, unexpected exits, interrupted writes, mount recovery, thumbnails, temporary files, backups, and export paths all need explicit validation before real private images are imported. Encryption protects a locked volume; files are accessible to the signed-in account while unlocked.

The integrated preview has native synthetic tests for encryption, wrong passwords, reopening, parent disconnection, controller crashes, recovery, and refusing plaintext recreation after an unexpected unmount. Private-window import, embedded generation details, ratings, favorites, and Lock & close have also been exercised. An actual screen-lock event closed and unmounted the test workspace. See [the usage and limits](ENCRYPTED_LIBRARIES.md). Broad sleep/resume, power-loss and external-drive testing, plus independent security review, remain outstanding. Existing originals must not be silently moved, deleted, or claimed to be protected merely because a copy was imported into a vault.

## Optional NSFW routing

Planned; not enabled or implemented in this preview. An explicit rule should match selected tags by name and route into a user-selected vault. It needs a clear copy/move choice, unlock handling, verified transfers, metadata preservation, and cleanup of ordinary-library image/thumbnail files before reporting a successful move. See [the routing design](NSFW_ROUTING_PLAN.md).

## Metadata and organization

- Expand generator fixtures, especially custom ComfyUI nodes, multi-stage workflows and Draw Things variations. Display uncertainty rather than infer a missing prompt or model.
- Separate detected graph-wide model/LoRA references from the model paths actually feeding the selected output. Preserve exact raw data and large seeds.
- Add searchable generation fields, consistent XMP rating/tag interoperability, explicit rating definitions, and an “absolute best” marker independent of ordinary five-star ratings.
- Design private tags as part of encrypted storage. Do not imply Finder tags can be encrypted individually.
- Keep readable files and source metadata intact, and make relocation/missing-linked-file recovery clear.

## AI connections

Keep metadata parsing independent of image analysis. Review the existing provider/credential controls and clearly distinguish local analysis from sending image content to a remote service. Private workspaces should start with external analysis, synchronization and plugins disabled until a deliberate privacy policy and enforceable boundaries exist. Model installation remains optional and checksum-pinned.

## Deferred

Social publishing stays separate. If added, require an intentional account, destination, image, caption and final publish action, with no background or automatic posting. Do not connect accounts or buy API access as part of the current work.

## Validation and maintenance

Retain the upstream MIT license and attribution. Keep the upstream remote for reviewed merges; never replace a custom build with an upstream auto-update. Track development-tool advisories separately from production dependencies. Add a paired authenticated browser connector before restoring extension support. Developer ID signing, notarization, full cross-platform testing and a broader security review remain future release work.
