import { useState } from 'react';
import type { VaultRequest, VaultStatus } from '../shared/vault';
export function VaultRoutingSettings({ status, busy, send }: { status: VaultStatus; busy: boolean; send(request: VaultRequest): Promise<void> }) {
  const routing = status.routing;
  const next = routing?.pending[0];
  const [folder, setFolder] = useState(next?.folder ?? ''); const [tag, setTag] = useState('');
  if (!routing) return null;
  const working = busy || routing.busy;
  const unlocked = status.sessions.some((item) => item.running && !item.error && item.image === routing.config.vaultImage);
  return <details className="vault-routing" aria-label="NSFW vault routing" open={routing.config.enabled || Boolean(next) || undefined}>
    <summary>NSFW routing · optional</summary>
    <p>Move images into character folders inside your chosen vault when you manually apply an exact NSFW tag. Tags, stars, favorites and embedded generation information travel with the image.</p>
    <p>Destination: {routing.config.vaultImage?.split('/').at(-1) ?? 'Choose a vault'}</p>
    <button className="secondary-button" type="button" disabled={working} onClick={() => void send({ operation: 'routing.choose-vault' })}>Choose destination vault…</button>
    <label className="vault-routing-check"><input type="checkbox" checked={routing.config.enabled} disabled={working || !routing.config.vaultImage} onChange={(event) => void send({ operation: 'routing.configure', enabled: event.target.checked, automatic: routing.config.automatic })} />Enable NSFW vault routing</label>
    <label className="vault-routing-check"><input type="checkbox" checked={routing.config.automatic} disabled={working || !routing.config.enabled} onChange={(event) => void send({ operation: 'routing.configure', enabled: routing.config.enabled, automatic: event.target.checked })} />Move new matches automatically when ready</label>
    <p>Use a tag such as <b>Character: Momo</b>, or remember a character tag below. Multiple character matches need your choice. Automatic moves need one known character and an unlocked vault.</p>
    <button className="secondary-button" type="button" disabled={working || !routing.config.enabled} onClick={() => void send({ operation: 'routing.review-existing' })}>Review existing NSFW images</button>
    {routing.pending.length ? <p>{routing.pending.length} image(s) waiting · originals are still outside the vault until their moves finish.</p> : null}
    {next ? <div className="vault-routing-pending">
      <strong>Next: {next.name}</strong><p>Tags: {next.tags.join(', ') || 'Reopen the source library to read its tags.'}</p>
      <div className="vault-fields"><label>Character folder<input value={folder} maxLength={80} onChange={(event) => setFolder(event.target.value)} placeholder="Choose a character folder" /></label>
      <label>Remember a character tag<select value={tag} onChange={(event) => setTag(event.target.value)}><option value="">This image only</option>{next.tags.filter((item) => item.trim().toLowerCase() !== 'nsfw').map((item) => <option value={item} key={item}>{item}</option>)}</select></label></div>
      {!unlocked ? <p>Unlock the destination vault using the password controls above to finish this move.</p> : null}
      {next.error ? <p role="alert">{next.error}</p> : null}
      <button className="primary-button" type="button" disabled={working || !routing.config.enabled || !unlocked || !folder.trim()} onClick={() => void send({ operation: 'routing.move-next', id: next.id, folder: folder.trim(), ...(tag ? { rememberTag: tag } : {}) })}>Move next image</button>
      <button className="secondary-button" type="button" disabled={working} onClick={() => void send({ operation: 'routing.skip-next', id: next.id })}>Skip · keep outside vault</button>
    </div> : null}
    {routing.message ? <p role="status">{routing.message}</p> : null}
    <details className="vault-routing-notes"><summary>How moves work and current limits</summary><p>The encrypted copy is verified before the managed original is removed. A locked vault keeps the original outside encryption until you finish the move.</p><p>New AI analysis and sync work pause while routing is enabled. Requests already sent cannot be recalled. Existing backups, exports and other copies remain outside encryption. The destination and remembered character mappings are saved in ordinary app settings.</p><p>This preview supports managed single images with one revision. Linked images, sequences, companion files and revision history stay in place for review.</p></details>
  </details>;
}
