import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import {
  TABLE_COLUMNS,
  type AssetTableApi,
  type TableRequest,
  type TableResponse,
  type TableRow,
} from "../shared/asset-table";
import type { FolderBrowseEntry, AssetSummary } from "../shared/asset-types";
import type { SerpentLibraryApi } from "../shared/library-api";
import {
  ContextMenu,
  ContextMenuBackdrop,
  ContextMenuItem,
  ContextMenuSection,
} from "./context-menu";
import { ListColumnChooser } from "./ListColumnChooser";
import {
  loadListPreferences,
  saveListPreferences,
  resetListColumns,
} from "./list-preferences";
import { Icon } from "./Icons";
import { formatListValue } from "./format-list-value";
import { useLocale } from "./i18n";
type Query = Pick<TableRequest, "query" | "filters" | "scope" | "showIgnored">;
const PAGE_SIZE = 100;
export function AssetListView({
  api,
  libraryApi,
  libraryId,
  query,
  selectedIds,
  onRows,
  onSelect,
  onOpen,
  onContextMenu,
  folders = [],
  selectedFolderIds = [],
  onFolderClick,
  onOpenFolder,
  onFolderContextMenu,
}: {
  api: AssetTableApi;
  libraryApi: SerpentLibraryApi;
  libraryId: string;
  query: Query;
  selectedIds: readonly string[];
  folders?: readonly FolderBrowseEntry[];
  selectedFolderIds?: readonly string[];
  onFolderClick?(id: string, event: MouseEvent<HTMLElement>): void;
  onOpenFolder?(id: string): void;
  onFolderContextMenu?(folder: FolderBrowseEntry, event: MouseEvent): void;
  onRows(assets: AssetSummary[]): void;
  onSelect(ids: string[], primary: string | null): void;
  onOpen(asset: AssetSummary): void;
  onContextMenu(
    asset: AssetSummary,
    event: MouseEvent,
    cell?: { label: string; value: string },
  ): void;
}) {
  const { locale, t } = useLocale();
  const [prefs, setPrefs] = useState(() => loadListPreferences(libraryId));
  const [offset, setOffset] = useState(0);
  const [version, setVersion] = useState(0);
  const [data, setData] = useState<TableResponse | null>(null);
  const [completedKey, setCompletedKey] = useState("");
  const [error, setError] = useState("");
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    column: string;
  } | null>(null);
  const [chooser, setChooser] = useState(false);
  const resizeCleanup = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => resizeCleanup.current?.(), []);
  const anchor = useRef<number | null>(null);
  const requestGeneration = useRef(0);
  const rowCallback = useRef(onRows);
  useEffect(() => {
    rowCallback.current = onRows;
  }, [onRows]);
  const queryKey = JSON.stringify(query);
  const columnsKey = JSON.stringify(prefs.columns);
  const sortKey = JSON.stringify(prefs.sort);
  const requestKey = JSON.stringify([
    queryKey,
    columnsKey,
    sortKey,
    offset,
    version,
  ]);
  const busy = completedKey !== requestKey;
  useEffect(() => {
    saveListPreferences(libraryId, prefs);
  }, [libraryId, prefs]);
  useEffect(() => {
    anchor.current = null;
  }, [queryKey, sortKey]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const changed = (event: { libraryId: string }) => {
      if (event.libraryId !== libraryId) return;
      clearTimeout(timer);
      timer = setTimeout(() => setVersion((n) => n + 1), 300);
    };
    const off = libraryApi.onAssetsChanged(changed);
    const offArtifacts =
      prefs.thumbnails ||
      JSON.parse(columnsKey).some((key: string) => key.startsWith("technical."))
        ? libraryApi.onLibraryChanged(changed)
        : () => {};
    return () => {
      off();
      offArtifacts();
      clearTimeout(timer);
    };
  }, [libraryApi, libraryId, columnsKey, prefs.thumbnails]);
  useEffect(() => {
    const generation = ++requestGeneration.current;
    let alive = true;
    void api
      .request({
        libraryId,
        ...JSON.parse(queryKey),
        sort: JSON.parse(sortKey),
        columns: JSON.parse(columnsKey),
        offset,
        limit: PAGE_SIZE,
      })
      .then((result) => {
        if (!alive || generation !== requestGeneration.current) return;
        if (result.error) throw new Error(result.error);
        if (offset > 0 && offset >= result.total) {
          setOffset(
            Math.max(0, Math.floor((result.total - 1) / PAGE_SIZE) * PAGE_SIZE),
          );
          return;
        }
        setError("");
        setData(result);
        rowCallback.current(result.rows.map((row) => row.asset));
      })
      .catch((cause: unknown) => {
        if (alive)
          setError(
            cause instanceof Error ? cause.message : t("listView.readFailed"),
          );
      })
      .finally(() => {
        if (alive) setCompletedKey(requestKey);
      });
    return () => {
      alive = false;
    };
  }, [
    api,
    libraryId,
    queryKey,
    columnsKey,
    sortKey,
    offset,
    version,
    requestKey,
    t,
  ]);
  const columns = prefs.columns
    .map((id) => TABLE_COLUMNS.find((column) => column.id === id)!)
    .filter(Boolean);
  const toggle = (id: string) => {
    if (id === "name") return;
    setPrefs((p) => ({
      ...p,
      columns: p.columns.includes(id)
        ? p.columns.filter((key) => key !== id)
        : [...p.columns, id],
    }));
  };
  const sort = (column: string, order?: "asc" | "desc") => {
    setOffset(0);
    setPrefs((p) => ({
      ...p,
      sort: {
        column,
        order:
          order ??
          (p.sort.column === column && p.sort.order === "asc" ? "desc" : "asc"),
      },
    }));
  };
  const move = (id: string, direction: number) =>
    setPrefs((p) => {
      const next = [...p.columns];
      const index = next.indexOf(id);
      const target = index + direction;
      if (index <= 0 || target <= 0 || target >= next.length) return p;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return { ...p, columns: next };
    });
  const select = async (
    row: TableRow,
    index: number,
    event: Pick<MouseEvent, "shiftKey" | "metaKey" | "ctrlKey">,
  ) => {
    if (busy) return;
    const generation = requestGeneration.current;
    const absolute = offset + index;
    if (event.shiftKey && anchor.current !== null) {
      const from = Math.min(anchor.current, absolute);
      const count = Math.abs(anchor.current - absolute) + 1;
      if (count > 10000) {
        setError(t("listView.rangeLimit"));
        return;
      }
      const result = await api.request({
        libraryId,
        ...query,
        sort: prefs.sort,
        columns: [],
        offset: from,
        limit: count,
        idsOnly: true,
      });
      if (generation !== requestGeneration.current) return;
      if (result.error) {
        setError(result.error);
        return;
      }
      onSelect(result.assetIds, row.asset.assetId);
    } else {
      anchor.current = absolute;
      const ids =
        event.metaKey || event.ctrlKey
          ? selectedIds.includes(row.asset.assetId)
            ? selectedIds.filter((id) => id !== row.asset.assetId)
            : [...selectedIds, row.asset.assetId]
          : [row.asset.assetId];
      onSelect(
        ids,
        ids.includes(row.asset.assetId)
          ? row.asset.assetId
          : (ids.at(-1) ?? null),
      );
    }
  };
  const resize = (id: string, event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    resizeCleanup.current?.();
    const start = event.clientX;
    const initial = prefs.widths[id] ?? (id === "name" ? 240 : 160);
    const changed = (e: PointerEvent) =>
      setPrefs((p) => ({
        ...p,
        widths: {
          ...p.widths,
          [id]: Math.max(
            80,
            Math.min(640, Math.round(initial + e.clientX - start)),
          ),
        },
      }));
    const done = () => {
      window.removeEventListener("pointermove", changed);
      window.removeEventListener("pointerup", done);
      window.removeEventListener("pointercancel", done);
      resizeCleanup.current = undefined;
    };
    resizeCleanup.current = done;
    window.addEventListener("pointercancel", done, { once: true });
    window.addEventListener("pointermove", changed);
    window.addEventListener("pointerup", done, { once: true });
  };
  const text = (row: TableRow, id: string) =>
    formatListValue(row.values[id], id, locale);
  return (
    <div className="asset-list-view" aria-busy={busy}>
      <div
        className="asset-list-controls"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span>
          {busy
            ? t("listView.reading")
            : `${t(data?.total === 1 ? "listView.fileOne" : "listView.files", { count: data?.total ?? 0 })}${folders.length ? ` · ${t(folders.length === 1 ? "listView.folderOne" : "listView.folders", { count: folders.length })}` : ""}`}{" "}
          ·{" "}
          {t("listView.sortedBy", {
            column:
              TABLE_COLUMNS.find((c) => c.id === prefs.sort.column)?.label ??
              "",
            direction: prefs.sort.order === "asc" ? "↑" : "↓",
          })}
        </span>
        <label>
          <input
            type="checkbox"
            checked={prefs.thumbnails}
            onChange={(event) =>
              setPrefs((p) => ({ ...p, thumbnails: event.target.checked }))
            }
          />
          {t("listView.thumbnails")}
        </label>
        <button
          className="secondary-button"
          type="button"
          onClick={() => setChooser(true)}
        >
          {t("listView.columns")}
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={busy}
          onClick={() => setVersion((n) => n + 1)}
        >
          {t("listView.refresh")}
        </button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <div className="asset-list-scroll">
        <table aria-label={t("listView.tableLabel")}>
          <colgroup>
            {prefs.thumbnails ? <col style={{ width: 56 }} /> : null}
            {columns.map((column) => (
              <col
                key={column.id}
                style={{
                  width:
                    prefs.widths[column.id] ??
                    (column.id === "name" ? 240 : 160),
                }}
              />
            ))}
          </colgroup>
          <thead
            onMouseDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!(event.target instanceof Element)) return;
              const column =
                event.target.closest<HTMLElement>("[data-column]")?.dataset
                  .column ?? "name";
              setMenu({ x: event.clientX, y: event.clientY, column });
            }}
          >
            <tr>
              {prefs.thumbnails ? (
                <th scope="col">{t("listView.preview")}</th>
              ) : null}
              {columns.map((column) => (
                <th
                  scope="col"
                  key={column.id}
                  data-column={column.id}
                  aria-sort={
                    prefs.sort.column === column.id
                      ? prefs.sort.order === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button type="button" onClick={() => sort(column.id)}>
                    {column.label}
                    {prefs.sort.column === column.id
                      ? prefs.sort.order === "asc"
                        ? " ↑"
                        : " ↓"
                      : ""}
                  </button>
                  <span
                    className="asset-list-resize"
                    role="separator"
                    aria-label={t("listView.resize", { column: column.label })}
                    aria-orientation="vertical"
                    tabIndex={0}
                    aria-valuemin={80}
                    aria-valuemax={640}
                    aria-valuenow={
                      prefs.widths[column.id] ??
                      (column.id === "name" ? 240 : 160)
                    }
                    onKeyDown={(event) => {
                      if (
                        !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                          event.key,
                        )
                      )
                        return;
                      event.preventDefault();
                      event.stopPropagation();
                      setPrefs((p) => ({
                        ...p,
                        widths: {
                          ...p.widths,
                          [column.id]:
                            event.key === "Home"
                              ? 80
                              : event.key === "End"
                                ? 640
                                : Math.max(
                                    80,
                                    Math.min(
                                      640,
                                      (p.widths[column.id] ??
                                        (column.id === "name" ? 240 : 160)) +
                                        (event.key === "ArrowLeft" ? -16 : 16),
                                    ),
                                  ),
                        },
                      }));
                    }}
                    onPointerDown={(event) => resize(column.id, event)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {offset === 0
              ? [...folders]
                  .sort(
                    (a, b) =>
                      (prefs.sort.column === "name" &&
                      prefs.sort.order === "desc"
                        ? -1
                        : 1) *
                      a.name.localeCompare(b.name, locale, { numeric: true }),
                  )
                  .map((folder) => (
                    <tr
                      key={folder.folderId}
                      className={`folder-list-row${selectedFolderIds.includes(folder.folderId) ? " is-selected" : ""}`}
                      tabIndex={0}
                      aria-selected={selectedFolderIds.includes(
                        folder.folderId,
                      )}
                      onClick={(event) =>
                        onFolderClick?.(folder.folderId, event)
                      }
                      onDoubleClick={() => onOpenFolder?.(folder.folderId)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          onOpenFolder?.(folder.folderId);
                        }
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onFolderContextMenu?.(folder, event);
                      }}
                    >
                      {prefs.thumbnails ? (
                        <td>
                          <Icon name="folder" size={22} />
                        </td>
                      ) : null}
                      {columns.map((column) => (
                        <td
                          key={column.id}
                          title={column.id === "name" ? folder.name : undefined}
                        >
                          {column.id === "name" ? (
                            <>
                              <Icon name="folder" size={14} /> {folder.name} (
                              {folder.recursiveAssetCount})
                            </>
                          ) : column.id === "path" ? (
                            folder.relativePath
                          ) : column.id === "mediaType" ||
                            column.id === "format" ? (
                            t("listView.folder")
                          ) : column.id === "availability" ? (
                            folder.status
                          ) : (
                            "—"
                          )}
                        </td>
                      ))}
                    </tr>
                  ))
              : null}
            {data?.rows.map((row, index) => (
              <tr
                className={`asset-card asset-list-row${selectedIds.includes(row.asset.assetId) ? " is-selected" : ""}`}
                data-asset-id={row.asset.assetId}
                data-asset-name={row.asset.displayName}
                key={row.asset.assetId}
                aria-selected={selectedIds.includes(row.asset.assetId)}
                tabIndex={0}
                onClick={(event) => void select(row, index, event)}
                onDoubleClick={() => onOpen(row.asset)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!(event.target instanceof Element)) return;
                  const id =
                    event.target.closest<HTMLElement>("[data-column]")?.dataset
                      .column;
                  const column = columns.find((c) => c.id === id);
                  onContextMenu(
                    row.asset,
                    event,
                    column
                      ? { label: column.label, value: text(row, column.id) }
                      : undefined,
                  );
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onOpen(row.asset);
                  } else if (
                    event.key === "ArrowDown" ||
                    event.key === "ArrowUp"
                  ) {
                    event.preventDefault();
                    event.stopPropagation();
                    const next =
                      event.key === "ArrowDown"
                        ? event.currentTarget.nextElementSibling
                        : event.currentTarget.previousElementSibling;
                    if (next instanceof HTMLElement) {
                      next.focus();
                      const nextIndex =
                        index + (event.key === "ArrowDown" ? 1 : -1);
                      const nextRow = data?.rows[nextIndex];
                      if (nextRow) void select(nextRow, nextIndex, event);
                    }
                  }
                }}
              >
                {prefs.thumbnails ? (
                  <td>
                    {row.asset.thumbnailArtifactId ? (
                      <img
                        alt=""
                        loading="lazy"
                        src={`serpent://preview/${libraryId}/${row.asset.thumbnailArtifactId}`}
                      />
                    ) : (
                      <Icon name="file" size={20} />
                    )}
                  </td>
                ) : null}
                {columns.map((column) => (
                  <td
                    key={column.id}
                    data-column={column.id}
                    title={text(row, column.id)}
                  >
                    {text(row, column.id)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!busy && !data?.rows.length && !folders.length && !error ? (
        <p>{t("listView.empty")}</p>
      ) : null}
      <div
        className="asset-list-pagination"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="secondary-button"
          type="button"
          disabled={busy || offset === 0}
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
        >
          {t("listView.previous")}
        </button>
        <span>
          {data?.total
            ? t("listView.pageRange", {
                first: offset + 1,
                last: Math.min(offset + PAGE_SIZE, data.total),
                total: data.total,
              })
            : t("listView.files", { count: 0 })}
        </span>
        <button
          className="secondary-button"
          type="button"
          disabled={busy || offset + PAGE_SIZE >= (data?.total ?? 0)}
          onClick={() => setOffset(offset + PAGE_SIZE)}
        >
          {t("listView.next")}
        </button>
      </div>
      {menu
        ? createPortal(
            <ContextMenuBackdrop onClose={() => setMenu(null)}>
              <ContextMenu
                ariaLabel={t("listView.columnOptions")}
                position={{ x: menu.x, y: menu.y }}
              >
                <ContextMenuSection>
                  <ContextMenuItem
                    label={t("listView.sortAscending")}
                    onAction={() => {
                      sort(menu.column, "asc");
                      setMenu(null);
                    }}
                  />
                  <ContextMenuItem
                    label={t("listView.sortDescending")}
                    onAction={() => {
                      sort(menu.column, "desc");
                      setMenu(null);
                    }}
                  />
                  <ContextMenuItem
                    label={t("listView.hideColumn")}
                    disabled={menu.column === "name"}
                    onAction={() => {
                      toggle(menu.column);
                      setMenu(null);
                    }}
                  />
                  <ContextMenuItem
                    label={t("listView.moveLeft")}
                    disabled={prefs.columns.indexOf(menu.column) <= 1}
                    onAction={() => {
                      move(menu.column, -1);
                      setMenu(null);
                    }}
                  />
                  <ContextMenuItem
                    label={t("listView.moveRight")}
                    disabled={
                      menu.column === "name" ||
                      prefs.columns.indexOf(menu.column) ===
                        prefs.columns.length - 1
                    }
                    onAction={() => {
                      move(menu.column, 1);
                      setMenu(null);
                    }}
                  />
                </ContextMenuSection>
                <ContextMenuSection label={t("listView.visibleColumns")}>
                  {TABLE_COLUMNS.filter((c) =>
                    [
                      "name",
                      "rating",
                      "favorite",
                      "tags",
                      "characters",
                      "byteSize",
                      "modifiedAt",
                      "generation.models",
                      "generation.loras",
                      "generation.prompt",
                      "generation.seed",
                    ].includes(c.id),
                  ).map((column) => (
                    <ContextMenuItem
                      key={column.id}
                      label={column.label}
                      checked={prefs.columns.includes(column.id)}
                      disabled={column.id === "name"}
                      onAction={() => {
                        toggle(column.id);
                        setMenu(null);
                      }}
                    />
                  ))}
                  <ContextMenuItem
                    label={t("listView.columns")}
                    onAction={() => {
                      setChooser(true);
                      setMenu(null);
                    }}
                  />
                </ContextMenuSection>
              </ContextMenu>
            </ContextMenuBackdrop>,
            document.body,
          )
        : null}
      {chooser ? (
        <ListColumnChooser
          columns={prefs.columns}
          onToggle={toggle}
          onReset={() => setPrefs(resetListColumns)}
          onClose={() => setChooser(false)}
        />
      ) : null}
    </div>
  );
}
