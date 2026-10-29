import { useState } from "react";
import { createPortal } from "react-dom";
import { TABLE_COLUMNS } from "../shared/asset-table";
import { useT } from "./i18n";
import { DialogShell } from "./ui/patterns";

/** Column discovery owns its search state; file selection and storage stay outside. */
export function ListColumnChooser({
  columns,
  onToggle,
  onReset,
  onClose,
}: {
  columns: readonly string[];
  onToggle(id: string): void;
  onReset(): void;
  onClose(): void;
}) {
  const t = useT();
  const [search, setSearch] = useState("");
  const matching = TABLE_COLUMNS.filter((column) =>
    `${column.label} ${column.id}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );
  const groups = [...new Set(matching.map((column) => column.group))];
  return createPortal(
    <div className="dialog-backdrop">
      <DialogShell
        className="create-dialog asset-list-column-dialog"
        dialogId="list-columns"
        title={t("listView.chooserTitle")}
        onRequestClose={onClose}
        footer={
          <div className="dialog-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={onReset}
            >
              {t("listView.reset")}
            </button>
            <button className="primary-button" type="button" onClick={onClose}>
              {t("listView.done")}
            </button>
          </div>
        }
      >
        <p>{t("listView.help")}</p>
        <input
          aria-label={t("listView.search")}
          className="text-field"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("listView.search")}
        />
        {!matching.length ? (
          <p role="status">{t("listView.noColumns")}</p>
        ) : null}
        {groups.map((group) => (
          <fieldset key={group}>
            <legend>{group}</legend>
            {matching
              .filter((column) => column.group === group)
              .map((column) => (
                <label key={column.id}>
                  <input
                    type="checkbox"
                    checked={columns.includes(column.id)}
                    disabled={column.id === "name"}
                    onChange={() => onToggle(column.id)}
                  />
                  {column.label}
                </label>
              ))}
          </fieldset>
        ))}
        <details>
          <summary>{t("listView.moreHelp")}</summary>
          <p>{t("listView.instructions")}</p>
        </details>
      </DialogShell>
    </div>,
    document.body,
  );
}
