import { useState } from "react";
import type { VaultRequest, VaultStatus } from "../shared/vault";
import type { VaultTrigger } from "../shared/organization";
export function VaultRoutingSettings({
  status,
  busy,
  send,
  libraryId,
  libraryName,
  selectedAssetIds = [],
  password = "",
}: {
  status: VaultStatus;
  busy: boolean;
  send(request: VaultRequest): Promise<void>;
  libraryId?: string;
  libraryName?: string;
  selectedAssetIds?: string[];
  password?: string;
}) {
  const routing = status.routing;
  const next = routing?.pending[0];
  const [folder, setFolder] = useState(next?.folder ?? "");
  const [tag, setTag] = useState("");
  const [trigger, setTrigger] = useState<VaultTrigger>(
    routing?.config.trigger ?? "nsfw",
  );
  const [returnConfirmed, setReturnConfirmed] = useState(false);
  if (!routing) return null;
  const working = busy || routing.busy;
  const storageEnabled = routing.config.vaultState === "enabled";
  const unlocked = status.sessions.some(
    (item) =>
      item.running && !item.error && item.image === routing.config.vaultImage,
  );
  const configure = (
    enabled: boolean,
    automatic = routing.config.automatic,
    existingMatches?: "all" | "future",
    autoCharacterFolders = routing.config.autoCharacterFolders,
    chosenTrigger = trigger,
  ) =>
    send({
      operation: "routing.configure",
      enabled,
      automatic,
      trigger: chosenTrigger,
      autoCharacterFolders,
      ...(existingMatches ? { existingMatches } : {}),
    });
  return (
    <details
      className="vault-routing"
      aria-label="Vault storage and routing"
      open={
        routing.config.enabled ||
        Boolean(next) ||
        routing.needsExistingChoice ||
        routing.config.vaultState !== "enabled" ||
        undefined
      }
    >
      <summary>Vault Storage and Routing</summary>
      <p>
        Vault storage is optional. Choose tags that should move files into it,
        or move files manually.
      </p>
      <p>
        Destination:{" "}
        {routing.config.vaultImage?.split("/").at(-1) ?? "Choose a Vault"} ·{" "}
        {!routing.config.vaultImage
          ? "Not configured"
          : routing.config.vaultState === "disabled"
            ? "Disabled"
            : routing.config.vaultState === "disabling"
              ? "Return in progress — not disabled"
              : "Enabled"}
      </p>
      <button
        className="secondary-button"
        type="button"
        disabled={working || routing.config.vaultState === "disabling"}
        onClick={() => void send({ operation: "routing.choose-vault" })}
      >
        Choose Vault…
      </button>
      {storageEnabled ? (
        <>
          <label className="field">
            Move files tagged
            <select
              aria-label="Vault trigger"
              value={trigger}
              disabled={working}
              onChange={(event) => {
                const value = event.target.value as VaultTrigger;
                setTrigger(value);
                void configure(
                  value === "manual" ? false : routing.config.enabled,
                  routing.config.automatic,
                  undefined,
                  routing.config.autoCharacterFolders,
                  value,
                );
              }}
            >
              <option value="nsfw">NSFW tag</option>
              <option value="vault">Vault tag</option>
              <option value="nsfw-or-vault">NSFW OR Vault</option>
              <option value="manual">Manual only</option>
            </select>
          </label>
          <label className="vault-routing-check">
            <input
              type="checkbox"
              checked={routing.config.enabled && trigger !== "manual"}
              disabled={
                working || !routing.config.vaultImage || trigger === "manual"
              }
              onChange={(event) => void configure(event.target.checked)}
            />
            Use tag-based routing
          </label>
          <label className="vault-routing-check">
            <input
              type="checkbox"
              checked={routing.config.automatic}
              disabled={
                working || !routing.config.enabled || trigger === "manual"
              }
              onChange={(event) =>
                void configure(routing.config.enabled, event.target.checked)
              }
            />
            Move matches automatically while unlocked
          </label>
          <label className="vault-routing-check">
            <input
              type="checkbox"
              checked={routing.config.autoCharacterFolders}
              disabled={working || !unlocked}
              onChange={(event) =>
                void configure(
                  routing.config.enabled,
                  routing.config.automatic,
                  undefined,
                  event.target.checked,
                )
              }
            />
            Organize Vault files by character
          </label>
          {routing.config.vaultImage && !unlocked ? (
            <p>
              Unlock the Vault above to change its physical organization
              setting.
            </p>
          ) : null}
          <p>
            With character organization off, existing physical folders are
            preserved. When enabled, one character gets its folder, several use{" "}
            <b>Shared</b>, and none use <b>Unassigned</b>. Regular folders and
            Smart Folders also work inside the private workspace.
          </p>
          {routing.needsExistingChoice ? (
            <div className="vault-routing-pending">
              <strong>Apply the trigger to existing matches?</strong>
              <p>
                Choose whether existing matching files should move, or only
                future tag changes should be routed.
              </p>
              <button
                className="primary-button"
                type="button"
                disabled={working || !unlocked}
                onClick={() =>
                  void configure(true, routing.config.automatic, "all")
                }
              >
                Move Existing Matches
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={working}
                onClick={() =>
                  void configure(true, routing.config.automatic, "future")
                }
              >
                Future Changes Only
              </button>
              {!unlocked ? (
                <p>
                  Unlock the destination Vault above to move existing matches
                  now.
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="smart-folder-rule-row">
            <button
              className="secondary-button"
              type="button"
              disabled={
                working || !routing.config.enabled || trigger === "manual"
              }
              onClick={() =>
                void send({ operation: "routing.review-existing" })
              }
            >
              Review Existing Matches
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={
                working ||
                !routing.config.vaultImage ||
                !libraryId ||
                !selectedAssetIds.length
              }
              onClick={() => {
                if (libraryId)
                  void send({
                    operation: "routing.move-selection",
                    libraryId,
                    assetIds: selectedAssetIds,
                  });
              }}
            >
              Move Selected Files to Vault ({selectedAssetIds.length})
            </button>
          </div>
        </>
      ) : routing.config.vaultState === "disabled" ? (
        <>
          <p>
            Files remain in the normal Library with their original tags.
            Re-enabling storage does not silently move existing matches.
          </p>
          <button
            className="primary-button"
            type="button"
            disabled={working || !password}
            onClick={() =>
              void send({ operation: "storage.reenable", password })
            }
          >
            Enable Vault Storage
          </button>
        </>
      ) : null}
      {routing.pending.length ? (
        <p>
          {routing.pending.length}{" "}
          {routing.pending.length === 1 ? "file" : "files"} waiting · originals
          are outside the Vault until their moves finish.
        </p>
      ) : null}
      {next && storageEnabled ? (
        <div className="vault-routing-pending">
          <strong>Next: {next.name}</strong>
          <p>
            Tags:{" "}
            {next.tags.join(", ") ||
              "Reopen the source Library to read its tags."}
          </p>
          <div className="vault-fields">
            <label>
              Folder inside Vault
              <input
                value={folder}
                maxLength={4096}
                onChange={(event) => setFolder(event.target.value)}
                placeholder="Leave blank for the Vault root"
              />
            </label>
            {routing.config.autoCharacterFolders ? (
              <label>
                Remember folder for character tag
                <select
                  value={tag}
                  onChange={(event) => setTag(event.target.value)}
                >
                  <option value="">This file only</option>
                  {next.tags
                    .filter(
                      (item) =>
                        !["nsfw", "vault"].includes(item.trim().toLowerCase()),
                    )
                    .map((item) => (
                      <option value={item} key={item}>
                        {item}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
          </div>
          {!unlocked ? (
            <p>
              Unlock the destination Vault using the password controls above to
              finish this move.
            </p>
          ) : null}
          {next.error ? <p role="alert">{next.error}</p> : null}
          <button
            className="primary-button"
            type="button"
            disabled={working || !unlocked}
            onClick={() =>
              void send({
                operation: "routing.move-next",
                id: next.id,
                ...(folder !== (next.folder ?? "")
                  ? { folder: folder.trim() }
                  : {}),
                ...(tag ? { rememberTag: tag } : {}),
              })
            }
          >
            Move Next File
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={working}
            onClick={() =>
              void send({ operation: "routing.skip-next", id: next.id })
            }
          >
            Keep Outside Vault
          </button>
        </div>
      ) : null}
      {routing.config.vaultImage && routing.config.vaultState !== "disabled" ? (
        <details className="vault-routing-notes">
          <summary>Disable Vault and Return Files</summary>
          <p>
            This moves all Vault files into{" "}
            <b>{libraryName ?? "the currently open normal Library"}</b>.
            Returned files will no longer be encrypted by the Vault. NSFW, Vault
            and character tags, stars, favorites and other metadata are
            preserved. Folder structure is retained unless the normal Library
            has character organization enabled.
          </p>
          <p>
            Your Vault password is required. The Vault stays enabled if copying,
            verification or cleanup cannot finish.
          </p>
          <label className="vault-routing-check">
            <input
              type="checkbox"
              disabled={working}
              checked={returnConfirmed}
              onChange={(event) => setReturnConfirmed(event.target.checked)}
            />
            I understand these files will become ordinary, unencrypted Library
            files.
          </label>
          <button
            className="primary-button"
            type="button"
            disabled={working || !libraryId || !password || !returnConfirmed}
            onClick={() => {
              if (libraryId)
                void send({
                  operation: "storage.disable",
                  libraryId,
                  password,
                  confirmed: true,
                });
            }}
          >
            {routing.config.vaultState === "disabling"
              ? "Resume Return to Library"
              : "Return Files and Disable Vault"}
          </button>
        </details>
      ) : null}
      {routing.message ? <p role="status">{routing.message}</p> : null}
      <details className="vault-routing-notes">
        <summary>How Vault Moves Work</summary>
        <p>
          The destination bytes and metadata are verified before each managed
          original is removed. A locked Vault keeps originals in place. New AI
          analysis and sync pause during automatic routing and Vault return.
          Already sent requests, outside backups and exports cannot be recalled
          or encrypted retroactively.
        </p>
        <p>
          Linked files, sequences, companions, revision history, missing files
          and Vault Trash must be resolved before disabling storage. If
          preflight finds these, it moves nothing. Progress is saved so an
          interrupted return can resume.
        </p>
      </details>
    </details>
  );
}
