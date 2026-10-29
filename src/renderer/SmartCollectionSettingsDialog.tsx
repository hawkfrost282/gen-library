import { smartCollectionQueryDefinitionSchema, type SmartCollectionQueryDefinition } from '../shared/asset-types';
import { withSmartFolderOverride } from '../shared/smart-folder-rules';
import { SmartFolderRuleEditor } from './SmartFolderRuleEditor';
import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "./Icons";
import { iconActionAttrs } from "./icon-action-attrs";
import { useLocale } from "./i18n";
import { DialogShell } from "./ui/patterns";

export type SmartCollectionSettingsTarget = {
  collectionId: string;
  name: string;
};

export type SmartCollectionSettingsDialogProps = {
  target: SmartCollectionSettingsTarget;
  definitionJson?: string;
  selectedAssetIds?: string[];
  onSaveDefinition?(definition: SmartCollectionQueryDefinition): Promise<void>;
  onClose: () => void;
  onRename: (collectionId: string, name: string) => Promise<void>;
  onSaveCurrentQuery: (collectionId: string) => Promise<void>;
};

/**
 * Serpent-era / SMART-007: after inline create, open this dialog so the user
 * can name the collection and attach the current discovery filters — instead
 * of blocking create when no condition is set yet.
 *
 * Remount with `key={collectionId}` from App when the target changes so name
 * state resets without a setState-in-effect sync.
 */
export function SmartCollectionSettingsDialog({
  target,
  definitionJson = "{}", selectedAssetIds = [], onSaveDefinition,
  onClose,
  onRename,
  onSaveCurrentQuery,
}: SmartCollectionSettingsDialogProps): ReactNode {
  const { t } = useLocale();
  const [name, setName] = useState(target.name);
  const [busy, setBusy] = useState(false);
  const [definition, setDefinition] = useState<SmartCollectionQueryDefinition>(() => { try { const parsed = smartCollectionQueryDefinitionSchema.safeParse(JSON.parse(definitionJson)); return parsed.success ? parsed.data : {}; } catch { return {}; } });
  const [error, setError] = useState('');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || busy) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (error) { setError(error instanceof Error ? error.message : 'The Smart Folder was not saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
    >
      <DialogShell
        className="create-dialog smart-collection-settings-dialog"
        dialogId="smart-collection-settings-dialog"
        headerActions={
          <button
            className="dialog-close"
            disabled={busy}
            onClick={onClose}
            type="button"
            {...iconActionAttrs(t("common.close"))}
          >
            <Icon name="close" size={16} />
          </button>
        }
        style={{ padding: 0 }}
        title={t("smartEdit.settingsTitle")}
        description={<span className="app-settings-hint">{t("smartEdit.settingsHint")}</span>}
      >
        <label className="field">
          <span className="micro-label">{t("smartEdit.nameLabel")}</span>
          <input
            className="text-field"
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </label>

        {onSaveDefinition ? <section aria-label="Smart Folder rules">
          <p>Smart Folders are virtual views. One image can appear in many views while keeping one physical file. Characters use Character: Name tags; content levels use NSFW or Content: Explicit tags.</p>
          <SmartFolderRuleEditor rule={definition.rules} disabled={busy} onChange={(rules) => setDefinition((current) => ({ ...current, rules }))} />
          {definition.search || definition.filters?.length ? <p>Saved search filters also apply. <button className="secondary-button" type="button" disabled={busy} onClick={() => setDefinition((current) => ({ ...current, search: undefined, filters: undefined }))}>Clear saved search filters</button></p> : null}
          <p>Manual includes: {definition.includeAssetIds?.length ?? 0} · Manual excludes: {definition.excludeAssetIds?.length ?? 0}. Exclusion wins.</p>
          <div className="smart-folder-rule-row">{(['include','exclude','automatic'] as const).map((choice) => <button className="secondary-button" key={choice} type="button" disabled={busy || !selectedAssetIds.length} onClick={() => setDefinition((current) => withSmartFolderOverride(current, selectedAssetIds, choice))}>{choice === 'include' ? 'Always include selected' : choice === 'exclude' ? 'Exclude selected' : 'Use automatic rules for selected'} ({selectedAssetIds.length})</button>)}</div>
          <button className="primary-button" type="button" disabled={busy} onClick={() => void run(async () => { const checked = smartCollectionQueryDefinitionSchema.safeParse(definition); if (!checked.success) throw new Error('Complete the rule values before saving this Smart Folder.'); const parsed = checked.data; if (name.trim() && name.trim() !== target.name) await onRename(target.collectionId, name.trim()); await onSaveDefinition(parsed); onClose(); })}>Save Smart Folder rules</button>
          {error ? <p role="alert">{error}</p> : null}
        </section> : null}
        <div className="dialog-actions">
          <button
            className="secondary-button"
            disabled={busy || name.trim().length === 0}
            onClick={() =>
              void run(async () => {
                if (name.trim() !== target.name) {
                  await onRename(target.collectionId, name.trim());
                }
                onClose();
              })
            }
            type="button"
          >
            {t("smartEdit.saveName")}
          </button>
          <button
            className="primary-button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (name.trim().length > 0 && name.trim() !== target.name) {
                  await onRename(target.collectionId, name.trim());
                }
                await onSaveCurrentQuery(target.collectionId);
                onClose();
              })
            }
            type="button"
          >
            {t("smartEdit.saveCurrentQuery")}
          </button>
        </div>
      </DialogShell>
    </div>
  );
}
