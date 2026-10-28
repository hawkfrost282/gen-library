import { useEffect, useRef, useState } from 'react';
import type { VaultApi, VaultStatus, VaultRequest } from '../shared/vault';
import { VaultRoutingSettings } from './VaultRoutingSettings';
import { DialogShell } from './ui/patterns';
export function VaultEntry({ api, compact = false, onVisibilityChange }: { api: VaultApi | undefined; compact?: boolean; onVisibilityChange?(open: boolean): void }) {
  const [open, setOpen] = useState(false); const [status, setStatus] = useState<VaultStatus | null>(null);
  const [name, setName] = useState('Private Library'); const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState(''); const [size, setSize] = useState(50);
  const prompted = useRef<string | undefined>(undefined);
  useEffect(() => { const id = status?.routing?.pending[0]?.id; if (id && status?.routing?.config.enabled && prompted.current !== id) { prompted.current = id; setOpen(true); } }, [status]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!api) return;
    let alive = true;
    const update = () => { void api.request({ operation: 'status' }).then((value) => { if (alive) setStatus(value); }).catch(() => {}); };
    update(); const timer = setInterval(update, 2000);
    return () => { alive = false; clearInterval(timer); };
  }, [api]);
  useEffect(() => { onVisibilityChange?.(open); return () => onVisibilityChange?.(false); }, [open, onVisibilityChange]);
  if (!api || !status || status.supported === false) return null;
  const close = () => { if (!busy) { setPassword(''); setRepeat(''); setError(''); setNotice(''); setOpen(false); } };
  const action = async (operation: 'create' | 'open' | 'lock' | 'expand', id?: string) => {
    if (operation === 'create' && password !== repeat) { setError('The passwords do not match.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await api.request(operation === 'create' ? { operation, name, password, sizeGiB: size } : operation === 'expand' ? { operation, password, sizeGiB: size } : operation === 'open' ? { operation, password } : { operation, ...(id ? { id } : {}) });
      setStatus(response); if (response.notice) setNotice(response.notice); if (response.error) setError(response.error);
    } catch { setError('The operation did not finish. Check the vault status before assuming it is locked.'); }
    finally { setPassword(''); setRepeat(''); setBusy(false); }
  };
  const routeAction = async (request: VaultRequest) => {
    setBusy(true); setError(''); setNotice('');
    try { const response = await api.request(request); setStatus(response); if (response.error) setError(response.error); }
    catch { setError('The routing request did not finish. Review the pending image before retrying.'); }
    finally { setBusy(false); }
  };
  if (status?.privateWorkspace) return <div className="vault-private-status"><span>Private · offline</span><button className="secondary-button" type="button" disabled={busy} title="Lock & close the private workspace" aria-label="Lock & close" onClick={() => void action('lock')}>Lock & close</button>{error ? <span role="alert">{error}</span> : null}</div>;
  return <>
    <button className="secondary-button vault-entry" type="button" aria-label="Encrypted libraries" title="Encrypted libraries" onClick={() => setOpen(true)}>{compact ? 'Vaults' : 'Encrypted libraries'}{status?.error ? ' (check status)' : status?.sessions.length ? ` (${status.sessions.length} unlocked)` : ''}</button>
    {open ? <div className="dialog-backdrop" role="presentation"><DialogShell className="create-dialog vault-dialog" dialogId="encrypted-libraries" title="Encrypted libraries" onRequestClose={close} footer={<div className="dialog-actions"><button className="secondary-button" disabled={busy} type="button" onClick={close}>Close</button><button className="secondary-button" disabled={busy || !password} type="button" onClick={() => void action('open')}>Unlock existing…</button><button className="primary-button" disabled={busy || password.length < 12 || !name.trim() || !Number.isInteger(size) || size < 1 || size > 16384} type="button" onClick={() => void action('create')}>Create encrypted library…</button></div>}>
      <p>Each vault opens in a separate private workspace. Its images, tags, catalog, thumbnails and application cache stay inside macOS encrypted storage.</p>
      <p>Private workspaces start offline, with cloud AI, sync, plugins, linked files and external sharing disabled. Importing copies files; existing originals remain outside the vault.</p>
      {status?.sessions.map((item) => <div className="vault-session" key={item.id}><strong>{item.name} — unlocked</strong>{item.error ? <p role="alert">{item.error}</p> : null}<button className="secondary-button" disabled={busy} type="button" onClick={() => void action('lock', item.id)}>Lock</button></div>)}
      <p>Storage grows as you add images. The vault does not reserve its full capacity on your drive.</p>
      <div className="vault-fields">
        <label>Name for a new vault<input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></label>
        <label>Password<input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <label>Repeat password for a new vault<input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} /></label>
      </div>
      <details className="vault-capacity-settings"><summary>Advanced · capacity ceiling</summary>
        <p>The ceiling is a technical limit, not space reserved now. Keep the default for a new vault, or choose a higher ceiling. Existing vaults can be enlarged while locked; this app never shrinks them.</p>
        <label>Capacity ceiling in GB<input type="number" min={1} max={16384} value={size} onChange={(e) => setSize(Number(e.target.value))} /></label>
        <button className="secondary-button" disabled={busy || !password || !Number.isInteger(size) || size < 1 || size > 16384} type="button" onClick={() => void action('expand')}>Increase existing vault capacity…</button>
      </details>
      <VaultRoutingSettings key={`${status.routing?.pending[0]?.id ?? 'none'}:${status.routing?.pending[0]?.folder ?? ''}`} status={status} busy={busy} send={routeAction} />
      {notice ? <p role="status">{notice}</p> : null}
      <p>New passwords need at least 12 characters. Passwords are not saved and cannot be recovered by this app. Files are accessible to your signed-in account while unlocked. Copies, exports and clipboard content outside the vault are not encrypted by it.</p>
      <p>The app requests a lock on screen lock or sleep. A busy volume stays visibly unlocked until it can unmount safely.</p>
      {error || status?.error ? <p role="alert">{error || status?.error}</p> : null}
      {busy ? <p role="status">Working with macOS encrypted storage…</p> : null}
    </DialogShell></div> : null}
  </>;
}
