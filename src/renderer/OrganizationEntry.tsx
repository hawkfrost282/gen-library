import { useEffect, useState } from 'react';
import type { OrganizationApi, OrganizationSettings } from '../shared/organization';
import { DialogShell } from './ui/patterns';
export function OrganizationEntry({ api, libraryId, privateWorkspace = false, onVisibilityChange }: { api?: OrganizationApi; libraryId?: string; privateWorkspace?: boolean; onVisibilityChange?(open: boolean): void }) {
  const [open, setOpen] = useState(false); const [settings, setSettings] = useState<OrganizationSettings | null>(null);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  useEffect(() => { onVisibilityChange?.(open); return () => onVisibilityChange?.(false); }, [open, onVisibilityChange]);
  if (!api || !libraryId) return null;
  const read = async () => { setBusy(true); try { const result = await api.request({ operation: 'get', libraryId }); setSettings(result.settings); setMessage(result.error ?? ''); setOpen(true); } finally { setBusy(false); } };
  const close = () => { if (!busy) setOpen(false); };
  return <>
    <button className="secondary-button" type="button" disabled={busy} onClick={() => void read()}>Organization</button>
    {open && settings ? <div className="dialog-backdrop" role="presentation"><DialogShell className="create-dialog" dialogId="physical-organization" title="Physical file organization" onRequestClose={close} footer={<div className="dialog-actions"><button className="secondary-button" type="button" disabled={busy} onClick={close}>Close</button></div>}>
      <p>Imports copy files into this Library’s <b>Assets</b> folder as ordinary files. Your original source files stay where they are. The app manages its Library copy in a regular folder you can browse independently.</p>
      {privateWorkspace ? <p>This Library’s files are inside the encrypted Vault. They are available while the Vault is unlocked; private-workspace sharing restrictions still apply.</p> : <p>Use the <b>Library files</b> button above the image grid to open the actual file structure. Select one image and use the <b>Reveal</b> button in its details panel to see that exact file. Linked folders are a separate, explicit choice that keeps files in their original location.</p>}
      <p>Regular folders are real folders on disk. Keep your own arrangement, use Smart Folders, or combine both. Smart Folders and ordinary tags do not move files.</p>
      <label className="vault-routing-check"><input type="checkbox" checked={settings.autoCharacterFolders} disabled={busy} onChange={async (event) => { setBusy(true); const next = { ...settings, autoCharacterFolders: event.target.checked }; try { const result = await api.request({ operation: 'set', libraryId, settings: next }); setSettings(result.settings); setMessage(result.error ?? 'Saved. Existing files have not moved.'); } finally { setBusy(false); } }} />Automatically organize physical files by character in this library</label>
      <p>When enabled, new imports and character-tag changes use a character folder, <b>Shared</b> for several characters, or <b>Unassigned</b> for none. Use tags such as <b>Character: Momo</b>. This setting applies independently inside a Vault.</p>
      <details><summary>Reorganize existing files</summary><p>This moves existing managed files into those character folders. Linked files stay in their current locations. File contents and metadata are preserved.</p><button className="secondary-button" type="button" disabled={busy || !settings.autoCharacterFolders} onClick={async () => { setBusy(true); try { const result = await api.request({ operation: 'organize-existing', libraryId }); setMessage(result.error ?? `Moved ${result.movedCount ?? 0} file(s); skipped ${result.skippedCount ?? 0}.`); } finally { setBusy(false); } }}>Organize existing physical files</button></details>
      {message ? <p role="status">{message}</p> : null}
    </DialogShell></div> : null}
  </>;
}
