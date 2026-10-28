import { useEffect, useState } from 'react';
import type { VaultApi, VaultStatus } from '../shared/vault';
import { DialogShell } from './ui/patterns';
export function VaultEntry({ api, compact = false, onVisibilityChange }: { api: VaultApi | undefined; compact?: boolean; onVisibilityChange?(open: boolean): void }) {
  const [open, setOpen] = useState(false); const [status, setStatus] = useState<VaultStatus | null>(null);
  const [name, setName] = useState('Private Library'); const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState(''); const [size, setSize] = useState(50);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => {
    if (!api) return;
    let alive = true;
    const update = () => { void api.request({ operation: 'status' }).then((value) => { if (alive) setStatus(value); }).catch(() => {}); };
    update(); const timer = setInterval(update, 2000);
    return () => { alive = false; clearInterval(timer); };
  }, [api]);
  useEffect(() => { onVisibilityChange?.(open); return () => onVisibilityChange?.(false); }, [open, onVisibilityChange]);
  if (!api || !status || status.supported === false) return null;
  const close = () => { if (!busy) { setPassword(''); setRepeat(''); setOpen(false); } };
  const action = async (operation: 'create' | 'open' | 'lock', id?: string) => {
    if (operation === 'create' && password !== repeat) { setError('The passwords do not match.'); return; }
    setBusy(true); setError('');
    try {
      const response = await api.request(operation === 'create' ? { operation, name, password, sizeGiB: size } : operation === 'open' ? { operation, password } : { operation, ...(id ? { id } : {}) });
      setStatus(response); if (response.error) setError(response.error);
    } catch { setError('The operation did not finish. Check the vault status before assuming it is locked.'); }
    finally { setPassword(''); setRepeat(''); setBusy(false); }
  };
  if (status?.privateWorkspace) return <div className="vault-private-status"><span>Private · offline</span><button className="secondary-button" type="button" disabled={busy} title="Lock & close the private workspace" aria-label="Lock & close" onClick={() => void action('lock')}>Lock & close</button>{error ? <span role="alert">{error}</span> : null}</div>;
  return <>
    <button className="secondary-button vault-entry" type="button" aria-label="Encrypted libraries" title="Encrypted libraries" onClick={() => setOpen(true)}>{compact ? 'Vaults' : 'Encrypted libraries'}{status?.error ? ' (check status)' : status?.sessions.length ? ` (${status.sessions.length} unlocked)` : ''}</button>
    {open ? <div className="dialog-backdrop" role="presentation"><DialogShell className="create-dialog vault-dialog" dialogId="encrypted-libraries" title="Encrypted libraries" onRequestClose={close} footer={<div className="dialog-actions"><button className="secondary-button" disabled={busy} type="button" onClick={close}>Close</button><button className="secondary-button" disabled={busy || !password} type="button" onClick={() => void action('open')}>Unlock existing…</button><button className="primary-button" disabled={busy || password.length < 12 || !name.trim() || !Number.isInteger(size) || size < 1 || size > 1000} type="button" onClick={() => void action('create')}>Create encrypted library…</button></div>}>
      <p>Each vault opens in a separate private workspace. Its images, tags, catalog, thumbnails and application cache stay inside macOS encrypted storage.</p>
      <p>Private workspaces start offline, with cloud AI, sync, plugins, linked files and external sharing disabled. Importing copies files; existing originals remain outside the vault.</p>
      {status?.sessions.map((item) => <div className="vault-session" key={item.id}><strong>{item.name} — unlocked</strong>{item.error ? <p role="alert">{item.error}</p> : null}<button className="secondary-button" disabled={busy} type="button" onClick={() => void action('lock', item.id)}>Lock</button></div>)}
      <div className="vault-fields">
        <label>Name for a new vault<input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></label>
        <label>Maximum size in GB (grows as needed)<input type="number" min={1} max={1000} value={size} onChange={(e) => setSize(Number(e.target.value))} /></label>
        <label>Password<input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <label>Repeat password for a new vault<input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} /></label>
      </div>
      <p>New passwords need at least 12 characters. Passwords are not saved and cannot be recovered by this app. Files are accessible to your signed-in account while unlocked. Copies, exports and clipboard content outside the vault are not encrypted by it.</p>
      <p>The app requests a lock on screen lock or sleep. A busy volume stays visibly unlocked until it can unmount safely.</p>
      {error || status?.error ? <p role="alert">{error || status?.error}</p> : null}
      {busy ? <p role="status">Working with macOS encrypted storage…</p> : null}
    </DialogShell></div> : null}
  </>;
}
