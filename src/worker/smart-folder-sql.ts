import type { SmartFolderRule } from '../shared/smart-folder-rules';
export function compileSmartFolderRule(rule: SmartFolderRule, hasAiTags = true): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const tag = (name: string, prefix?: 'character' | 'content') => {
    const predicate = prefix ? `LOWER(TRIM(SUBSTR(sf_t.name, 1, INSTR(sf_t.name, ':') - 1))) = '${prefix}' AND TRIM(SUBSTR(sf_t.name, INSTR(sf_t.name, ':') + 1)) = ? COLLATE NOCASE` : 'sf_t.name = ? COLLATE NOCASE';
    params.push(name);
    const human = `EXISTS (SELECT 1 FROM human_asset_tags sf_h JOIN tags sf_t ON sf_t.tag_id = sf_h.tag_id WHERE sf_h.asset_id = a.asset_id AND ${predicate})`;
    if (!hasAiTags) return human;
    params.push(name);
    return `(${human} OR EXISTS (SELECT 1 FROM ai_asset_tags sf_ai JOIN tags sf_t ON sf_t.tag_id = sf_ai.tag_id WHERE sf_ai.asset_id = a.asset_id AND ${predicate}))`;
  };
  function visit(node: SmartFolderRule): string {
    if ('rules' in node) return `(${node.rules.map(visit).join(node.kind === 'all' ? ' AND ' : ' OR ')})`;
    if (node.kind === 'not') return `(NOT (${visit(node.rule)}))`;
    if (node.kind === 'tag') return tag(node.value);
    if (node.kind === 'character') return tag(node.value, 'character');
    if (node.kind === 'contentLevel') return node.value.toLowerCase() === 'nsfw' ? tag('NSFW') : tag(node.value, 'content');
    if (node.kind === 'rating') {
      params.push(node.value); const operator = node.operator === 'atLeast' ? '>=' : node.operator === 'atMost' ? '<=' : '=';
      return `COALESCE((SELECT sf_m.rating FROM asset_metadata sf_m WHERE sf_m.asset_id = a.asset_id), 0) ${operator} ?`;
    }
    if (node.kind === 'favorite') { params.push(node.value ? 1 : 0); return 'COALESCE((SELECT sf_m.favorite FROM asset_metadata sf_m WHERE sf_m.asset_id = a.asset_id), 0) = ?'; }
    params.push(`%${node.value.replace(/[\\%_]/gu, '\\$&')}%`);
    const field = node.kind === 'metadata' ? 'metadata_text' : node.kind;
    const table = node.kind === 'metadata' ? 'asset_search_index' : 'asset_metadata';
    return `EXISTS (SELECT 1 FROM ${table} sf_m WHERE sf_m.asset_id = a.asset_id AND COALESCE(sf_m.${field}, '') LIKE ? ESCAPE '\\')`;
  }
  return { sql: visit(rule), params };
}
