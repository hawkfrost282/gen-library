import { expect,it } from 'vitest';
import { DEFAULT_LIST_PREFERENCES,loadListPreferences,saveListPreferences,resetListColumns } from '../../src/renderer/list-preferences';
import { TABLE_COLUMNS,compareTableValues } from '../../src/shared/asset-table';
it('keeps column choices, widths, thumbnails and sorting separate for each Library',() => {
 const values=new Map<string,string>(); const storage={ getItem: (key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{ values.set(key,value); } };
 const prefs={ ...DEFAULT_LIST_PREFERENCES,columns:['name','generation.prompt'],widths:{ 'generation.prompt': 360 },thumbnails:true };
 saveListPreferences('one',prefs,storage);expect(loadListPreferences('one',storage)).toEqual(prefs);expect(loadListPreferences('two',storage)).toEqual(DEFAULT_LIST_PREFERENCES);
});
it('recovers invalid preferences and always keeps the name column visible',() => {
 const storage={ getItem:()=>JSON.stringify({ ...DEFAULT_LIST_PREFERENCES,columns:['rating','rating'] }) };expect(loadListPreferences('one',storage).columns).toEqual(['name','rating']);
 expect(loadListPreferences('one',{ getItem:()=>'{bad' })).toEqual(DEFAULT_LIST_PREFERENCES);
});
it('orders numbers and very large seeds precisely with blanks last in either direction',() => {
 const seed=TABLE_COLUMNS.find((c)=>c.id==='generation.seed')!;expect(compareTableValues('18446744073709551614','18446744073709551615',seed,'asc')).toBeLessThan(0);
 expect(compareTableValues(null,'10',seed,'desc')).toBeGreaterThan(0); const stars=TABLE_COLUMNS.find((c)=>c.id==='rating')!;expect(compareTableValues(2,10,stars,'asc')).toBeLessThan(0);
});

it('resets only column layout while preserving sort and thumbnails', () => {
 const prefs={...structuredClone(DEFAULT_LIST_PREFERENCES), columns:['name','generation.seed'],widths:{name:400},thumbnails:true,sort:{column:'rating',order:'desc' as const}};
 const next=resetListColumns(prefs);expect(next.columns).toEqual(DEFAULT_LIST_PREFERENCES.columns);expect(next.widths).toEqual({});expect(next.sort).toEqual(prefs.sort);expect(next.thumbnails).toBe(true);expect(prefs.widths.name).toBe(400);
});
