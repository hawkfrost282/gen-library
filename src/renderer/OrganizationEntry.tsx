import { useEffect, useState } from "react";
import type {
  OrganizationApi,
  OrganizationSettings,
} from "../shared/organization";
import { DialogShell } from "./ui/patterns";
export function OrganizationEntry({
  api,
  libraryId,
  privateWorkspace = false,
  onVisibilityChange,
}: {
  api?: OrganizationApi;
  libraryId?: string;
  privateWorkspace?: boolean;
  onVisibilityChange?(open: boolean): void;
}) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<OrganizationSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    onVisibilityChange?.(open);
    return () => onVisibilityChange?.(false);
  }, [open, onVisibilityChange]);
  if (!api || !libraryId) return null;
  const read = async () => {
    setBusy(true);
    try {
      const result = await api.request({ operation: "get", libraryId });
      setSettings(result.settings);
      setMessage(result.error ?? "");
      setOpen(true);
    } catch {
      setMessage("Unable to read organization settings. Try again.");
      setOpen(true);
    } finally {
      setBusy(false);
    }
  };
  const close = () => {
    if (!busy) setOpen(false);
  };
  return (
    <>
      <button
        className="secondary-button"
        type="button"
        disabled={busy}
        onClick={() => void read()}
      >
        Organize Files…
      </button>
      {open ? (
        <div className="dialog-backdrop" role="presentation">
          <DialogShell
            className="create-dialog"
            dialogId="physical-organization"
            title="Organize Files"
            onRequestClose={close}
            footer={
              <div className="dialog-actions">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={busy}
                  onClick={close}
                >
                  Close
                </button>
              </div>
            }
          >
            <p>
              Imported files are ordinary files in this Library’s <b>Assets</b>{" "}
              folder. The source files stay where they are.
            </p>
            {privateWorkspace ? (
              <p>
                This Library is inside an encrypted Vault. Its files are
                accessible while the Vault is unlocked.
              </p>
            ) : (
              <p>
                Use <b>Show Library in Finder</b> to browse its folders, or{" "}
                <b>Show in Finder</b> in image details to reveal a file.
              </p>
            )}
            <details>
              <summary>Folders and file storage</summary>
              <p>
                Folders are real directories on disk. Collections and Smart
                Folders are virtual views. Use either, or both. Ordinary tags do
                not move files. Linking a folder is a separate choice that keeps
                its files in their original location.
              </p>
            </details>
            {settings ? (
              <>
                <label className="vault-routing-check">
                  <input
                    type="checkbox"
                    checked={settings.autoCharacterFolders}
                    disabled={busy}
                    onChange={async (event) => {
                      setBusy(true);
                      const next = {
                        ...settings,
                        autoCharacterFolders: event.target.checked,
                      };
                      try {
                        const result = await api.request({
                          operation: "set",
                          libraryId,
                          settings: next,
                        });
                        setSettings(result.settings);
                        setMessage(
                          result.error ??
                            "Saved. Existing files have not moved.",
                        );
                      } catch {
                        setMessage(
                          "Unable to save organization settings. Try again.",
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                  Organize files by character
                </label>
                <p>
                  When enabled, new imports and character-tag changes use a
                  character folder, <b>Shared</b> for several characters, or{" "}
                  <b>Unassigned</b> for none. Use tags such as{" "}
                  <b>Character: Momo</b>. This setting applies independently
                  inside a Vault.
                </p>
                <details>
                  <summary>Reorganize existing files</summary>
                  <p>
                    This moves existing managed files into those character
                    folders. Linked files stay in their current locations. File
                    contents and metadata are preserved.
                  </p>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={busy || !settings.autoCharacterFolders}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const result = await api.request({
                          operation: "organize-existing",
                          libraryId,
                        });
                        setMessage(
                          result.error ??
                            `Moved ${result.movedCount ?? 0} file(s); skipped ${result.skippedCount ?? 0}.`,
                        );
                      } catch {
                        setMessage(
                          "Unable to organize files. Check their locations before trying again.",
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Organize Existing Files
                  </button>
                </details>
              </>
            ) : null}
            {message ? <p role="status">{message}</p> : null}
          </DialogShell>
        </div>
      ) : null}
    </>
  );
}
