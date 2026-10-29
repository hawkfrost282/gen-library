# List views and right-click actions — personal.8

## Views and columns

The browse toolbar and Appearance settings offer thumbnail grid, masonry thumbnails and a true List view. List view defaults to plain rows; Show thumbnails adds small image previews without changing the view's file membership.

Click a data header to sort ascending or descending across the complete filtered scope, including files beyond the current page. Right-click a header for sort direction, common column toggles, hiding and moving a column, or the complete searchable column chooser. Drag a header edge to resize it. Name remains visible and pinned while scrolling sideways. Column choices, widths, order, thumbnails and list sorting are remembered separately for each Library.

Columns cover file properties, folder/relative path, stars, favorites, tags, characters, content-level tags, description, author, source URL, palette and metadata timestamps; generation prompts, negative prompts, models, LoRAs, seeds, steps, guidance, sampler, scheduler, dimensions and original generation metadata; every technical field currently exposed by the metadata schema; and existing AI analysis fields and provenance. Empty fields stay empty rather than becoming guesses. Long text is shortened in the table; full source values remain in image details.

The list is paged at 100 files. Sorting happens before paging. Name sorting uses the actual file name independently of physical folder paths; large integer generation seeds retain precision. Folder rows appear above the first file page in physical-folder views. File and folder selection, opening and right-click actions reuse the existing handlers. Shift ranges can span pages, with an explicit 10,000-file range limit.

List sorting is independent of thumbnail-view sorting; the redundant gallery sort control and caption controls are hidden in List mode. Scope, search, live filters, Collections, Smart Folder automatic/manual membership, ignored-file visibility and Trash continue to determine which files appear. View changes do not copy, move or relabel files.

## Right-click review

| Surface | Result |
|---|---|
| List header | Added sort, visible-column choices, hide/reorder and access to all columns |
| List data cell | Added Copy field value, followed by the existing file or batch actions |
| Blank file area | Previously empty without plugin contributions; now offers view modes, imports, new physical folder, refresh and normal-Library Finder access |
| Library selector | Added the existing physical Library-root menu, including file-manager access and folder actions |
| Image preview in details | Added the same file actions as the image card |
| Image cards and folder rows | Retained shared single/multiple-selection actions; List mode uses those handlers too |
| Physical folders, Collections, Smart Folders, tag management, Trash and workspace tabs | Existing context menus reviewed and retained |
| Editable text and controls | Native text editing and normal button behavior retained |

## Implementation and limits

The validated table API is available only to the application's own window. It sends Library IDs and bounded queries, never renderer-supplied source paths or executable expressions. The worker reads the existing catalog and local metadata. It does not run AI analysis, make API calls, create another catalog or duplicate canonical files. Private workspaces retain their offline and external-access restrictions.

Common indexed sorts reuse catalog queries. Other sorts build a local ordered-ID snapshot in bounded batches, yielding between batches and invalidating on catalog changes. Only a few snapshots are retained. A first generation/technical sort over a large scope can take time while local metadata is read; subsequent pages reuse the ordering. This is not a benchmark for million-file libraries. Technical values depend on the existing extraction pipeline; unavailable values remain blank and can be refreshed. Raw binary metadata that the app has never parsed is not converted into arbitrary new typed columns.
