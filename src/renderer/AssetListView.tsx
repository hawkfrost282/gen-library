import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { TABLE_COLUMNS, type AssetTableApi, type TableRequest, type TableResponse, type TableRow } from '../shared/asset-table';
import type { FolderBrowseEntry, AssetSummary } from '../shared/asset-types';
import type { SerpentLibraryApi } from '../shared/library-api';
import { ContextMenu, ContextMenuBackdrop, ContextMenuItem, ContextMenuSection } from './context-menu';
import { DialogShell } from './ui/patterns';
import { DEFAULT_LIST_PREFERENCES, loadListPreferences, saveListPreferences } from './list-preferences';
import { Icon } from './Icons';
import { formatBytes } from './format-file-meta';
type Query = Pick<TableRequest,'query'|'filters'|'scope'|'showIgnored'>;
const PAGE_SIZE = 100;
export function AssetListView({ api, libraryApi, libraryId, query, selectedIds, onRows, onSelect, onOpen, onContextMenu, folders = [], selectedFolderIds = [], onFolderClick, onOpenFolder, onFolderContextMenu }: {
  api: AssetTableApi; libraryApi: SerpentLibraryApi; libraryId: string; query: Query; selectedIds: readonly string[];
  folders?: readonly FolderBrowseEntry[]; selectedFolderIds?: readonly string[];
  onFolderClick?(id: string,event: MouseEvent<HTMLElement>): void; onOpenFolder?(id: string): void; onFolderContextMenu?(folder: FolderBrowseEntry,event: MouseEvent): void;
  onRows(assets: AssetSummary[]): void; onSelect(ids: string[],primary: string | null): void; onOpen(asset: AssetSummary): void;
  onContextMenu(asset: AssetSummary,event: MouseEvent,cell?: { label: string; value: string }): void;
}) {
  const [prefs,setPrefs] = useState(() => loadListPreferences(libraryId));
  const [offset,setOffset] = useState(0); const [version,setVersion] = useState(0);
  const [data,setData] = useState<TableResponse | null>(null); const [completedKey,setCompletedKey] = useState(''); const [error,setError] = useState('');
  const [menu,setMenu] = useState<{ x: number; y: number; column: string } | null>(null);
  const [chooser,setChooser] = useState(false); const [columnSearch,setColumnSearch] = useState('');
  const anchor = useRef<number | null>(null); const requestGeneration = useRef(0); const rowCallback = useRef(onRows);
  useEffect(() => { rowCallback.current = onRows; },[onRows]);
  const queryKey = JSON.stringify(query); const columnsKey = JSON.stringify(prefs.columns); const sortKey = JSON.stringify(prefs.sort);
  const requestKey = JSON.stringify([queryKey,columnsKey,sortKey,offset,version]);
  const busy = completedKey !== requestKey;
  useEffect(() => { saveListPreferences(libraryId,prefs); }, [libraryId,prefs]);
  useEffect(() => { anchor.current = null; }, [queryKey,sortKey]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const changed = (event: { libraryId: string }) => { if (event.libraryId !== libraryId) return; clearTimeout(timer); timer = setTimeout(() => setVersion((n) => n+1),300); };
    const off = libraryApi.onAssetsChanged(changed);
    const offArtifacts = prefs.thumbnails || JSON.parse(columnsKey).some((key: string) => key.startsWith('technical.')) ? libraryApi.onLibraryChanged(changed) : () => {};
    return () => { off(); offArtifacts(); clearTimeout(timer); };
  }, [libraryApi,libraryId,columnsKey,prefs.thumbnails]);
  useEffect(() => {
    const generation = ++requestGeneration.current; let alive = true;
    void api.request({ libraryId,...JSON.parse(queryKey),sort: JSON.parse(sortKey),columns: JSON.parse(columnsKey),offset,limit: PAGE_SIZE }).then((result) => {
      if (!alive || generation !== requestGeneration.current) return;
      if (result.error) throw new Error(result.error);
      if (offset > 0 && offset >= result.total) { setOffset(Math.max(0,Math.floor((result.total-1)/PAGE_SIZE)*PAGE_SIZE)); return; }
      setError(''); setData(result); rowCallback.current(result.rows.map((row) => row.asset));
    }).catch((cause: unknown) => { if (alive) setError(cause instanceof Error ? cause.message : 'The list could not be read.'); }).finally(() => { if (alive) setCompletedKey(requestKey); });
    return () => { alive = false; };
  }, [api,libraryId,queryKey,columnsKey,sortKey,offset,version,requestKey]);
  const columns = prefs.columns.map((id) => TABLE_COLUMNS.find((column) => column.id === id)!).filter(Boolean);
  const toggle = (id: string) => { if (id === 'name') return; setPrefs((p) => ({ ...p,columns: p.columns.includes(id) ? p.columns.filter((key) => key !== id) : [...p.columns,id] })); };
  const sort = (column: string,order?: 'asc'|'desc') => { setOffset(0); setPrefs((p) => ({ ...p,sort: { column,order: order ?? (p.sort.column === column && p.sort.order === 'asc' ? 'desc' : 'asc') } })); };
  const move = (id: string,direction: number) => setPrefs((p) => { const next = [...p.columns]; const index = next.indexOf(id); const target = index+direction; if (index <= 0 || target <= 0 || target >= next.length) return p; [next[index],next[target]] = [next[target]!,next[index]!]; return { ...p,columns: next }; });
  const select = async (row: TableRow,index: number,event: Pick<MouseEvent,'shiftKey'|'metaKey'|'ctrlKey'>) => {
    if (busy) return;
    const generation = requestGeneration.current;
    const absolute = offset+index;
    if (event.shiftKey && anchor.current !== null) {
      const from = Math.min(anchor.current,absolute); const count = Math.abs(anchor.current-absolute)+1;
      if (count > 10000) { setError('Select ranges of up to 10,000 files at a time.'); return; }
      const result = await api.request({ libraryId,...query,sort: prefs.sort,columns: [],offset: from,limit: count,idsOnly: true });
      if (generation !== requestGeneration.current) return;
      if (result.error) { setError(result.error); return; } onSelect(result.assetIds,row.asset.assetId);
    } else { anchor.current = absolute; const ids = event.metaKey || event.ctrlKey ? selectedIds.includes(row.asset.assetId) ? selectedIds.filter((id) => id !== row.asset.assetId) : [...selectedIds,row.asset.assetId] : [row.asset.assetId]; onSelect(ids,ids.includes(row.asset.assetId) ? row.asset.assetId : ids.at(-1) ?? null); }
  };
  const resize = (id: string,event: React.PointerEvent) => {
    event.preventDefault(); event.stopPropagation(); const start = event.clientX; const initial = prefs.widths[id] ?? (id === 'name' ? 240 : 160);
    const changed = (e: PointerEvent) => setPrefs((p) => ({ ...p,widths: { ...p.widths,[id]: Math.max(80,Math.min(640,Math.round(initial+e.clientX-start))) } }));
    const done = () => { window.removeEventListener('pointermove',changed); window.removeEventListener('pointerup',done); };
    window.addEventListener('pointermove',changed); window.addEventListener('pointerup',done,{ once: true });
  };
  const text = (row: TableRow,id: string) => { const value = row.values[id]; if (value == null || value === '') return '—'; if (['modifiedAt','createdAt','updatedAt','ai.generatedAt'].includes(id)) { const date = new Date(String(value)); return Number.isNaN(date.valueOf()) ? String(value) : new Intl.DateTimeFormat('en',{ dateStyle: 'medium',timeStyle: 'short' }).format(date); } if (id === 'byteSize') return formatBytes(Number(value)); if (id === 'rating') return Number(value) ? '★'.repeat(Number(value)) : 'Unrated'; if (id === 'favorite') return value ? '♥' : '—'; if (typeof value === 'boolean') return value ? 'Yes' : 'No'; return String(value); };
  return <div className="asset-list-view" aria-busy={busy}>
    <div className="asset-list-controls" onMouseDown={(event) => event.stopPropagation()}><span>{busy ? 'Reading local metadata…' : `${data?.total ?? 0} files${folders.length ? ` · ${folders.length} folders` : ''}`} · Sorted by {TABLE_COLUMNS.find((c) => c.id === prefs.sort.column)?.label} {prefs.sort.order === 'asc' ? '↑' : '↓'}</span><label><input type="checkbox" checked={prefs.thumbnails} onChange={(event) => setPrefs((p) => ({ ...p,thumbnails: event.target.checked }))} />Show thumbnails</label><button className="secondary-button" type="button" onClick={() => setChooser(true)}>Columns…</button><button className="secondary-button" type="button" disabled={busy} onClick={() => setVersion((n) => n+1)}>Refresh list</button></div>
    {error ? <p role="alert">{error}</p> : null}
    <div className="asset-list-scroll"><table aria-label="Library files list"><colgroup>{prefs.thumbnails ? <col style={{ width: 56 }} /> : null}{columns.map((column) => <col key={column.id} style={{ width: prefs.widths[column.id] ?? (column.id === 'name' ? 240 : 160) }} />)}</colgroup>
      <thead onMouseDown={(event) => event.stopPropagation()} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); if (!(event.target instanceof Element)) return; const column = event.target.closest<HTMLElement>('[data-column]')?.dataset.column ?? 'name'; setMenu({ x: event.clientX,y: event.clientY,column }); }}><tr>{prefs.thumbnails ? <th scope="col">Preview</th> : null}{columns.map((column) => <th scope="col" key={column.id} data-column={column.id} aria-sort={prefs.sort.column === column.id ? prefs.sort.order === 'asc' ? 'ascending' : 'descending' : 'none'}><button type="button" onClick={() => sort(column.id)}>{column.label}{prefs.sort.column === column.id ? prefs.sort.order === 'asc' ? ' ↑' : ' ↓' : ''}</button><span className="asset-list-resize" role="separator" aria-label={`Resize ${column.label}`} onPointerDown={(event) => resize(column.id,event)} /></th>)}</tr></thead>
      <tbody>{offset === 0 ? [...folders].sort((a,b) => (prefs.sort.column === 'name' && prefs.sort.order === 'desc' ? -1 : 1)*a.name.localeCompare(b.name, 'en', { numeric: true })).map((folder) => <tr key={folder.folderId} className={`folder-list-row${selectedFolderIds.includes(folder.folderId) ? ' is-selected' : ''}`} tabIndex={0} aria-selected={selectedFolderIds.includes(folder.folderId)} onClick={(event) => onFolderClick?.(folder.folderId,event)} onDoubleClick={() => onOpenFolder?.(folder.folderId)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onOpenFolder?.(folder.folderId); } }} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); onFolderContextMenu?.(folder,event); }}>
      {prefs.thumbnails ? <td><Icon name="folder" size={22} /></td> : null}{columns.map((column) => <td key={column.id} title={column.id === 'name' ? folder.name : undefined}>{column.id === 'name' ? <><Icon name="folder" size={14} /> {folder.name} ({folder.recursiveAssetCount})</> : column.id === 'path' ? folder.relativePath : column.id === 'mediaType' || column.id === 'format' ? 'Folder' : column.id === 'availability' ? folder.status : '—'}</td>)}</tr>) : null}{data?.rows.map((row,index) => <tr className={`asset-card asset-list-row${selectedIds.includes(row.asset.assetId) ? ' is-selected' : ''}`} data-asset-id={row.asset.assetId} data-asset-name={row.asset.displayName} key={row.asset.assetId} aria-selected={selectedIds.includes(row.asset.assetId)} tabIndex={0} onClick={(event) => void select(row,index,event)} onDoubleClick={() => onOpen(row.asset)} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); if (!(event.target instanceof Element)) return; const id = event.target.closest<HTMLElement>('[data-column]')?.dataset.column; const column = columns.find((c) => c.id === id); onContextMenu(row.asset,event,column ? { label: column.label,value: text(row,column.id) } : undefined); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onOpen(row.asset); } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); event.stopPropagation(); const next = event.key === 'ArrowDown' ? event.currentTarget.nextElementSibling : event.currentTarget.previousElementSibling; if (next instanceof HTMLElement) { next.focus(); const nextIndex = index+(event.key === 'ArrowDown' ? 1 : -1); const nextRow = data?.rows[nextIndex]; if (nextRow) void select(nextRow,nextIndex,event); } } }}>
        {prefs.thumbnails ? <td>{row.asset.thumbnailArtifactId ? <img alt="" loading="lazy" src={`serpent://preview/${libraryId}/${row.asset.thumbnailArtifactId}`} /> : <Icon name="file" size={20} />}</td> : null}
        {columns.map((column) => <td key={column.id} data-column={column.id} title={text(row,column.id)}>{text(row,column.id)}</td>)}
      </tr>)}</tbody></table></div>
    {!busy && !data?.rows.length && !folders.length && !error ? <p>No files match this view.</p> : null}
    <div className="asset-list-pagination" onMouseDown={(event) => event.stopPropagation()}><button className="secondary-button" type="button" disabled={busy || offset === 0} onClick={() => setOffset(Math.max(0,offset-PAGE_SIZE))}>Previous page</button><span>{data?.total ? `${offset+1}–${Math.min(offset+PAGE_SIZE,data.total)} of ${data.total}` : '0 files'}</span><button className="secondary-button" type="button" disabled={busy || offset+PAGE_SIZE >= (data?.total ?? 0)} onClick={() => setOffset(offset+PAGE_SIZE)}>Next page</button></div>
    {menu ? createPortal(<ContextMenuBackdrop onClose={() => setMenu(null)}><ContextMenu ariaLabel="List column options" position={{ x: menu.x,y: menu.y }}><ContextMenuSection><ContextMenuItem label="Sort ascending" onAction={() => { sort(menu.column,'asc'); setMenu(null); }} /><ContextMenuItem label="Sort descending" onAction={() => { sort(menu.column,'desc'); setMenu(null); }} /><ContextMenuItem label="Hide this column" disabled={menu.column === 'name'} onAction={() => { toggle(menu.column); setMenu(null); }} /><ContextMenuItem label="Move column left" disabled={prefs.columns.indexOf(menu.column) <= 1} onAction={() => { move(menu.column,-1); setMenu(null); }} /><ContextMenuItem label="Move column right" disabled={menu.column === 'name' || prefs.columns.indexOf(menu.column) === prefs.columns.length-1} onAction={() => { move(menu.column,1); setMenu(null); }} /></ContextMenuSection><ContextMenuSection label="Visible columns">{TABLE_COLUMNS.filter((c) => ['name','rating','favorite','tags','characters','byteSize','modifiedAt','generation.models','generation.loras','generation.prompt','generation.seed'].includes(c.id)).map((column) => <ContextMenuItem key={column.id} label={column.label} checked={prefs.columns.includes(column.id)} disabled={column.id === 'name'} onAction={() => { toggle(column.id); setMenu(null); }} />)}<ContextMenuItem label="Choose all available columns…" onAction={() => { setChooser(true); setMenu(null); }} /></ContextMenuSection></ContextMenu></ContextMenuBackdrop>,document.body) : null}
    {chooser ? createPortal(<div className="dialog-backdrop"><DialogShell className="create-dialog asset-list-column-dialog" dialogId="list-columns" title="Choose list columns" onRequestClose={() => setChooser(false)} footer={<div className="dialog-actions"><button className="secondary-button" type="button" onClick={() => setPrefs(structuredClone(DEFAULT_LIST_PREFERENCES))}>Restore defaults</button><button className="primary-button" type="button" onClick={() => setChooser(false)}>Done</button></div>}><p>Click a column header to sort all matching files. Right-click a header to show, hide or reorder columns. Drag a header edge to resize it. Long text is shortened here; full source metadata remains in image details.</p><input aria-label="Search columns" className="text-field" value={columnSearch} onChange={(event) => setColumnSearch(event.target.value)} placeholder="Search columns" />{[...new Set(TABLE_COLUMNS.map((c) => c.group))].map((group) => <fieldset key={group}><legend>{group}</legend>{TABLE_COLUMNS.filter((c) => c.group === group && `${c.label} ${c.id}`.toLowerCase().includes(columnSearch.toLowerCase())).map((column) => <label key={column.id}><input type="checkbox" checked={prefs.columns.includes(column.id)} disabled={column.id === 'name'} onChange={() => toggle(column.id)} />{column.label}</label>)}</fieldset>)}</DialogShell></div>,document.body) : null}
  </div>;
}
