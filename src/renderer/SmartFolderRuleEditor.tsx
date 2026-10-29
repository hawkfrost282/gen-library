import type { SmartFolderRule } from '../shared/smart-folder-rules';
const choices = { tag: 'Tag', character: 'Character', rating: 'Stars', favorite: 'Favorite', contentLevel: 'Content level', author: 'Author contains', description: 'Description contains', metadata: 'Indexed metadata contains', all: 'AND · all conditions', any: 'OR · any condition', not: 'NOT · exclude condition' };
function initial(kind: SmartFolderRule['kind']): SmartFolderRule {
  if (kind === 'all' || kind === 'any') return { kind, rules: [{ kind: 'tag', value: '' }] };
  if (kind === 'not') return { kind, rule: { kind: 'tag', value: '' } };
  if (kind === 'rating') return { kind, operator: 'atLeast', value: 4 };
  if (kind === 'favorite') return { kind, value: true };
  return { kind, value: '' };
}
export function SmartFolderRuleEditor({ rule, onChange, disabled, depth = 0 }: { rule?: SmartFolderRule; onChange(rule: SmartFolderRule | undefined): void; disabled: boolean; depth?: number }) {
  if (!rule) return <button className="secondary-button" type="button" disabled={disabled} onClick={() => onChange(initial('all'))}>Add automatic rules</button>;
  return <fieldset className="smart-folder-rule" disabled={disabled}>
    <div className="smart-folder-rule-row"><select aria-label="Rule type" value={rule.kind} onChange={(event) => onChange(initial(event.target.value as SmartFolderRule['kind']))}>{Object.entries(choices).filter(([kind]) => depth < 7 || !['all','any','not'].includes(kind)).map(([kind, name]) => <option key={kind} value={kind}>{name}</option>)}</select>
    <button className="secondary-button" type="button" onClick={() => onChange(undefined)}>Remove</button></div>
    {'rules' in rule ? <>
      {rule.rules.map((child, index) => <SmartFolderRuleEditor key={index} rule={child} disabled={disabled} depth={depth + 1} onChange={(value) => { const rules = [...rule.rules]; if (value) rules[index] = value; else rules.splice(index, 1); onChange(rules.length ? { ...rule, rules } : undefined); }} />)}
      <button className="secondary-button" type="button" disabled={rule.rules.length >= 32} onClick={() => onChange({ ...rule, rules: [...rule.rules, initial('tag')] })}>Add condition</button>
    </> : rule.kind === 'not' ? <SmartFolderRuleEditor rule={rule.rule} disabled={disabled} depth={depth + 1} onChange={(value) => onChange(value ? { kind: 'not', rule: value } : undefined)} /> : rule.kind === 'rating' ? <div className="smart-folder-rule-row"><select aria-label="Star comparison" value={rule.operator} onChange={(event) => onChange({ ...rule, operator: event.target.value as 'is' | 'atLeast' | 'atMost' })}><option value="is">Exactly</option><option value="atLeast">At least</option><option value="atMost">At most</option></select><input aria-label="Star rating" type="number" min={0} max={5} value={rule.value} onChange={(event) => onChange({ ...rule, value: Number(event.target.value) })} /></div> : rule.kind === 'favorite' ? <select aria-label="Favorite status" value={String(rule.value)} onChange={(event) => onChange({ ...rule, value: event.target.value === 'true' })}><option value="true">Is a favorite</option><option value="false">Is not a favorite</option></select> : 'value' in rule ? <input aria-label="Rule value" value={rule.value} maxLength={255} placeholder={rule.kind === 'character' ? 'Momo' : rule.kind === 'contentLevel' ? 'NSFW or Explicit' : 'Value'} onChange={(event) => onChange({ ...rule, value: event.target.value })} /> : null}
  </fieldset>;
}
