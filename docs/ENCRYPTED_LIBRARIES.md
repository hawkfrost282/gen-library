# Encrypted libraries on macOS

This is an early Gen Library feature, validated with synthetic images. Use a disposable test vault first and keep backups. Ordinary libraries are not encrypted.

## Use a vault

1. Open **Vaults** in the toolbar, or **Encrypted libraries** on the first-launch screen.
2. To create one, choose a name, maximum size, and a password of at least 12 characters. Repeat the password, choose **Create encrypted library…**, and select where to save the `.sparsebundle` container. It grows as needed toward the selected limit.
3. To reopen it, enter its password, choose **Unlock existing…**, and select its `.sparsebundle` container.
4. The separate window is labeled **Private library** and **Private · offline**. Import images there to copy them into encrypted storage. Embedded prompts, model and LoRA information remain available locally; tags, ratings and favorites work normally.
5. Choose **Lock & close** in that window, or **Lock** next to the unlocked vault in the main app. The private workspace closes, finishes its shutdown, and the storage unmounts. A busy volume remains listed as unlocked; close files using it and retry. The app never force-unmounts it.

The same vault cannot open twice through two aliases in one controller. A separate background controller handles locking after the main application closes unexpectedly. On restart it checks its journal for unlocked volumes and attempts to secure them. A disk-operation timeout or failed status check is an error, never proof that a volume locked.

## What is encrypted

The container uses macOS APFS and AES-256 encryption through `hdiutil`. Inside it are the images, library database, tags, ratings, thumbnails, previews, private application preferences, Chromium cache/session data, application logs, crash-dump directory, and temporary-file directory. Passwords pass through a pipe and are not saved in command arguments, preferences or the recovery journal. No password recovery or automatic Keychain saving is provided.

The volume mounts at a short, account-owned path under `/private/tmp/glv-<user ID>/` to satisfy macOS Unix-socket path limits. These are mounted encrypted-volume contents, not decrypted copies written elsewhere. Read-only mount-point parents prevent the app from recreating a plaintext profile if storage disappears. The chosen `.sparsebundle` remains at its save location.

The ordinary profile holds operational recovery information: the container's path, display name, mount identifier and controller PID. Give the container a generic name if its name is sensitive. Private images, tags, prompts, thumbnails and passwords do not belong in that journal.

## Private workspace behavior

Private workspaces start offline. Cloud AI, local model services, semantic indexing, synchronization, plugins, automation, linked imports, external open/reveal, dragging files to other apps and export/copy-file actions are blocked. The main process and library worker enforce this; Node TCP/fetch and renderer HTTP/WebSocket requests are also blocked. These restrictions do not affect ordinary workspaces.

Private mode requests a close and lock on screen lock or sleep. Sleep can interrupt the shutdown, so do not assume a vault locked merely because the screen turned off. Confirm its status after resuming if necessary. A private workspace also closes if its controller disappears. Private catalog/cache symlinks that could redirect files outside the volume are rejected before startup.

## Practical limits

- **Importing copies the originals.** Original files, old thumbnails, backups and other copies outside the vault remain outside it. Gen Library does not silently delete or move them.
- While unlocked, the signed-in account and software running with its access can read the mounted files. This does not isolate an unlocked vault from malicious software on that account.
- Text explicitly copied to the clipboard, screenshots, screen recordings, exported copies and system-level traces are outside the vault's protection. This is not a forensic-erasure guarantee.
- Keep independent backups of the locked container. Losing the password or damaging its bands can make the library unrecoverable. Do not edit the `.sparsebundle` bands manually or operate directly on a live catalog with another app.
- Validation covers synthetic encryption/locking, wrong passwords, reopening, controller failures and recovery, loss of a mount, private imports, local metadata and ratings. Broad sleep/resume, power-loss and removable-drive scenarios and an independent security review remain future work. Other operating systems are unsupported for this feature.

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
