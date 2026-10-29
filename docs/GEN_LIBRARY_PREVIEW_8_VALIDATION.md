# Gen Library personal.8 validation

This preview adds Finder-style List view and fills gaps in right-click actions. See [List views and right-click actions](LIST_VIEW_AND_CONTEXT_MENUS.md) for usage, the surface audit and implementation limits.

## Automated checks

- Full unit suite: **4,600 passed, 7 skipped**; 662 test files passed and 3 skipped.
- Final worker table suite: **6 passed**, including sorting before paging, filtered Smart Folder membership with manual exclusions, cache invalidation, actual file-name ordering independent of folders, generation metadata and exact large integer seeds, and request validation.
- Focused worker organization and browse coverage also passed (10 tests).
- Focused preference, toolbar, appearance and context-menu coverage passed.
- Type checking passed. Targeted lint passed with no errors; two existing App.tsx hook warnings remain.
- Packaged macOS arm64 application built successfully. Runtime verification and ad-hoc signature verification passed.

## Packaged-app checks

Checks used isolated synthetic libraries; no personal artwork was imported, moved, relabeled or deleted.

- Switched among thumbnail and plain List views; enabled row thumbnails and confirmed their saved preference after restart.
- Opened the header context menu, added LoRAs, inspected the complete searchable column chooser and verified generation values.
- Confirmed ascending and descending sorting, file-name sorting across physical folders, and selection/details retained while sorting.
- Browsed a 105-image library across both pages. Sorting Stars descending moved the five-star last-page image to the first row.
- Opened physical folder rows and confirmed their contents.
- Checked list-cell Copy field value and file actions, blank-area Workspace actions, Library-root actions from the Library selector, and image actions from the details preview.
- Reopened the normal preview profile and left the two-file demo Library in List view. Test Vault sessions remained empty.

## Practical limits

List pages contain 100 files. A first sort on locally read generation or technical metadata can take time on a large Library; later pages reuse the ordering. This release has not been benchmarked with million-file libraries. Columns expose fields the app currently parses, rather than inventing values from unavailable metadata. Full original long values remain in details while table cells are bounded. Shift selection has an explicit 10,000-file limit.
