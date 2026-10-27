import { useState } from 'react';
import type { GenerationMetadata } from '../shared/generation-metadata';

export function GenerationDetails({ metadata, loading }: { metadata: GenerationMetadata | null; loading: boolean }) {
  const [message, setMessage] = useState('');
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setMessage('Copied'); }
    catch { setMessage('Select and copy the text manually.'); }
  };
  const fields: Array<[string, string | null | undefined]> = metadata ? [
    ['Source', metadata.source], ['Generation model', metadata.models.join('\n')],
    ['LoRAs', metadata.loras.join('\n')], ['Seed', metadata.seed], ['Steps', metadata.steps],
    ['Guidance / CFG', metadata.cfg], ['Sampler', metadata.sampler], ['Scheduler', metadata.scheduler],
    ['Dimensions', metadata.width && metadata.height ? `${metadata.width} × ${metadata.height}` : null],
  ] : [];
  return <details className="generation-details" open={Boolean(metadata)}>
    <summary>Generation details</summary>
    {loading ? <p role="status">Reading embedded generation information…</p> : !metadata ? <p>No supported generation metadata was found in this file.</p> : <>
      <dl>{fields.filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      {([['Prompt', metadata.prompt], ['Negative prompt', metadata.negativePrompt]] as const).map(([label, value]) => value ? <div className="generation-prompt" key={label}>
        <div className="generation-field-heading"><strong>{label}</strong><button type="button" onClick={() => void copy(value)}>Copy</button></div>
        <pre>{value}</pre>
      </div> : null)}
      {metadata.notes.map((note) => <p className="generation-note" key={note}>{note}</p>)}
      {metadata.raw ? <details><summary>Original generation metadata</summary><button type="button" onClick={() => void copy(metadata.raw!)}>Copy metadata</button><pre>{metadata.raw}</pre></details> : null}
      <p className="generation-note">Read locally from the image. These values are not AI guesses.</p>
      <span role="status">{message}</span>
    </>}
  </details>;
}
