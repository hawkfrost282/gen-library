import { expect, it } from 'vitest';
import { DEFAULT_ORGANIZATION, physicalCharacterFolder, matchesVaultTrigger } from '../../src/shared/organization';
import { smartFolderRuleSchema, withSmartFolderOverride } from '../../src/shared/smart-folder-rules';
it('keeps metadata separate from placement until character organization is enabled', () => {
 expect(physicalCharacterFolder(['Character: Momo'], DEFAULT_ORGANIZATION)).toBeNull();
 const enabled = { ...DEFAULT_ORGANIZATION, autoCharacterFolders: true };
 expect(physicalCharacterFolder(['Character: Momo'], enabled)).toBe('Momo');
 expect(physicalCharacterFolder(['Character: Momo','Character: Una'], enabled)).toBe('Shared');
 expect(physicalCharacterFolder(['NSFW'], enabled)).toBe('Unassigned');
});
it('supports all four Vault trigger modes without inferring content', () => {
 expect(matchesVaultTrigger(['NSFW'], 'nsfw')).toBe(true); expect(matchesVaultTrigger(['nsfw-ish'], 'nsfw')).toBe(false);
 expect(matchesVaultTrigger(['Vault'], 'vault')).toBe(true); expect(matchesVaultTrigger(['NSFW'], 'vault')).toBe(false);
 expect(matchesVaultTrigger(['vault'], 'nsfw-or-vault')).toBe(true); expect(matchesVaultTrigger(['NSFW'], 'nsfw-or-vault')).toBe(true);
 expect(matchesVaultTrigger(['NSFW','Vault'], 'manual')).toBe(false);
});
it('makes manual Smart Folder choices independent from automatic rules', () => {
 const rule = { kind: 'rating' as const, operator: 'atLeast' as const, value: 5 };
 const initial = { rules: rule, includeAssetIds: ['a'], excludeAssetIds: ['b'] };
 const included = withSmartFolderOverride(initial, ['b'], 'include'); expect(included.includeAssetIds).toEqual(['a','b']); expect(included.excludeAssetIds).toEqual([]); expect(included.rules).toEqual(rule);
 const automatic = withSmartFolderOverride(included, ['a','b'], 'automatic'); expect(automatic.includeAssetIds).toEqual([]); expect(automatic.rules).toEqual(rule);
});
it('bounds nested Smart Folder expressions and rejects executable or unknown rules', () => {
 expect(smartFolderRuleSchema.safeParse({ kind: 'sql', value: 'DROP TABLE assets' }).success).toBe(false);
 let nested: unknown = { kind: 'tag', value: 'Momo' }; for (let index = 0; index < 12; index++) nested = { kind: 'not', rule: nested };
 expect(smartFolderRuleSchema.safeParse(nested).success).toBe(false);
});
