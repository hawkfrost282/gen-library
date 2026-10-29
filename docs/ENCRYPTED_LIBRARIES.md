# Encrypted libraries on macOS

This is an early Gen Library feature, validated with synthetic images. Use a disposable test vault first and keep backups. Ordinary libraries are not encrypted.

## Use a vault

1. Open **Vaults** in the toolbar, or **Encrypted libraries** on the first-launch screen.
2. To create one, choose a name and a password of at least 12 characters. The capacity ceiling is optional under **Advanced** and defaults to 50 GB; it does not reserve 50 GB of disk space. Repeat the password, choose **Create encrypted library…**, and select where to save the `.sparsebundle` container. Disk usage grows as files are added.
3. To reopen it, enter its password, choose **Unlock existing…**, and select its `.sparsebundle` container.
4. The separate window is labeled **Private library** and **Private · offline**. Import images there to copy them into encrypted storage. Embedded prompts, model and LoRA information remain available locally; tags, ratings and favorites work normally.
5. Choose **Lock & close** in that window, or **Lock** next to the unlocked vault in the main app. The private workspace closes, finishes its shutdown, and the storage unmounts. A busy volume remains listed as unlocked; close files using it and retry. The app never force-unmounts it.

To raise an existing vault’s ceiling, lock it first. Enter its password in the vault dialog, open **Advanced · capacity ceiling**, set a higher number, and choose **Increase existing vault capacity…**. Select the existing container. This preserves its contents and does not reserve the whole new amount. The app refuses equal or lower ceilings and mounted vaults.

The same vault cannot open twice through two aliases in one controller. A separate background controller handles locking after the main application closes unexpectedly. On restart it checks its journal for unlocked volumes and attempts to secure them. A disk-operation timeout or failed status check is an error, never proof that a volume locked.

## Optional storage routing

Open **Vault storage and routing** in the vault dialog and choose a destination. Routing is off by default. Choose **NSFW tag**, **Vault tag**, **NSFW OR Vault**, or **manual only**. Enabling a trigger asks whether to queue all existing matches or apply it only to future tag assignments. Tags describe images; only this explicit storage policy requests a physical move. No image recognition or paid AI is used.

Files can also be queued manually without either tag. A locked destination keeps the original pending outside encryption. With automatic moves off, review and use **Move next file** after unlocking. Vault character organization is a separate optional setting: one character uses its folder, several use Shared, and none use Unassigned. Otherwise entry preserves the original relative folder, with a per-file folder override available. Regular folders, ratings, favorites and Smart Folders also work inside the private Library.

## Disable Vault and return files

Pausing routing leaves encrypted files where they are. **Disable Vault** instead merges its files into the currently open normal Library. Read and confirm the warning that returned files will be outside encryption, then enter the Vault password. Authentication is required even when the Vault was already unlocked.

The migration preflights supported files, copies and verifies each file and its metadata, and only then removes its protected source. It preserves tags (including NSFW and Vault), stars, favorites, embedded generation information, metadata provenance, and mapped Collection/Smart Folder memberships. It preserves folders where practical or uses the normal Library's optional character organization. Name conflicts keep both files. Only a verified empty Vault that locks successfully is marked disabled; routing is then turned off. An interrupted migration remains visible and can be resumed with the password.

Re-enabling requires the password. Enabling tag routing again asks whether to move existing matches or affect only future changes. Unsupported multi-file assets, linked sources and revision histories stop preflight rather than losing data. See the [organization model and current limits](ORGANIZATION_MODEL_REVIEW.md).

## What is encrypted

The container uses macOS APFS and AES-256 encryption through `hdiutil`. Inside it are the images, library database, tags, ratings, thumbnails, previews, private application preferences, Chromium cache/session data, application logs, crash-dump directory, and temporary-file directory. Passwords pass through a pipe and are not saved in command arguments, preferences or the recovery journal. No password recovery or automatic Keychain saving is provided.

The volume mounts at a short, account-owned path under `/private/tmp/glv-<user ID>/` to satisfy macOS Unix-socket path limits. These are mounted encrypted-volume contents, not decrypted copies written elsewhere. Read-only mount-point parents prevent the app from recreating a plaintext profile if storage disappears. The chosen `.sparsebundle` remains at its save location.

The ordinary profile holds operational recovery information: the container's path, display name, mount identifier and controller PID. Give the container a generic name if its name is sensitive. Private images, tags, prompts, thumbnails and passwords do not belong in that journal.

## Private workspace behavior

Private workspaces start offline. Cloud AI, local model services, semantic indexing, synchronization, plugins, automation, linked imports, external open/reveal, dragging files to other apps and export/copy-file actions are blocked. The main process and library worker enforce this; Node TCP/fetch and renderer HTTP/WebSocket requests are also blocked. These restrictions do not affect ordinary workspaces.

Private mode requests a close and lock on screen lock or sleep. Sleep can interrupt the shutdown, so do not assume a vault locked merely because the screen turned off. Confirm its status after resuming if necessary. A private workspace also closes if its controller disappears. Private catalog/cache symlinks that could redirect files outside the volume are rejected before startup.

## Practical limits

- **Importing copies the originals.** Ordinary imports leave external originals, old thumbnails, backups and other copies outside the vault. Explicit routing moves a supported managed canonical file only after verification; it does not remove unrelated external copies.
- While unlocked, the signed-in account and software running with its access can read the mounted files. This does not isolate an unlocked vault from malicious software on that account.
- Text explicitly copied to the clipboard, screenshots, screen recordings, exported copies and system-level traces are outside the vault's protection. This is not a forensic-erasure guarantee.
- Keep independent backups of the locked container. Losing the password or damaging its bands can make the library unrecoverable. Do not edit the `.sparsebundle` bands manually or operate directly on a live catalog with another app.
- Validation covers synthetic encryption/locking, wrong passwords, enlargement without data loss, rejecting shrink attempts, reopening, controller failures and recovery, loss of a mount, private imports, local metadata and ratings. Broad sleep/resume, power-loss and removable-drive scenarios and an independent security review remain future work. Other operating systems are unsupported for this feature.

## Developer checks

```sh
npm run typecheck
npm run test:unit
npx vite build --config vite.vault.config.ts --outDir .local/vault-supervisor-test --emptyOutDir
GEN_LIBRARY_VAULT_DISK_TEST=1 npx vitest run tests/unit/vault-native-smoke.test.ts tests/unit/vault-supervisor-native.test.ts
npm run package
npm run verify:package
```

Native tests require macOS disk-image access and create only disposable synthetic containers under the ignored `.local` test directory. They never use the user's collection or vault password.
