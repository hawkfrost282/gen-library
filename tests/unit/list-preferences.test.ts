import { expect,it } from 'vitest';
import { DEFAULT_LIST_PREFERENCES,loadListPreferences,saveListPreferences } from '../../src/renderer/list-preferences';
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
