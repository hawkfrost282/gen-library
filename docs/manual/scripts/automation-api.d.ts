export declare const AUTOMATION_API_VERSION: 1;
export type GenLibraryCommandId = 'library.create' | 'asset.metadata.set-many' | 'library.list-open' | 'library.open' | 'library.show-in-desktop' | 'library.list-recent' | 'library.close' | 'library.rename' | 'library.delete-from-disk' | 'library.export' | 'library.import-folder' | 'library.import-zip' | 'file.import' | 'library.inspect' | 'library.change-sequence' | 'execution.status' | 'history.status' | 'history.undo' | 'history.redo' | 'ui.notify' | 'ui.dialog' | 'ui.widget-patch' | 'media.binaries.get' | 'asset.rating.set' | 'asset.paths.copy' | 'asset.trash' | 'asset.delete-permanent' | 'asset.content.replace' | 'asset.content.stage' | 'asset.content.replace-batch' | 'asset.content.read' | 'asset.move' | 'asset.rename-file' | 'asset.rename-files' | 'asset.list-trash' | 'asset.restore-if-original-vacant' | 'asset.palette.aggregate-recent' | 'folder.list' | 'folder.create' | 'folder.rename' | 'folder.move' | 'folder.delete-empty' | 'linked-folder.list' | 'linked-folder.create' | 'linked-folder.relink' | 'linked-folder.remove' | 'linked-folder.rules.get' | 'linked-folder.rules.set' | 'linked-folder.refresh' | 'asset.list' | 'asset.copy' | 'asset.thumbnail.get' | 'asset.preview.get' | 'asset.refresh' | 'asset.metadata.get' | 'asset.ai-content.get' | 'asset.metadata.set' | 'asset.extracted-metadata.get' | 'asset.search' | 'tag.list' | 'tag.create' | 'tag.rename' | 'tag.delete' | 'tag.delete-many' | 'tag.merge' | 'tag.cooccurrence' | 'tag.assign' | 'tag.remove' | 'collection.list' | 'collection.create' | 'collection.update' | 'collection.reorder' | 'collection.delete' | 'collection.assets.add' | 'collection.assets.remove' | 'collection.assets.reorder' | 'collection.assets.list' | 'collection.assets.memberships' | 'smart-collection.list' | 'smart-collection.create' | 'smart-collection.update' | 'smart-collection.delete' | 'smart-collection.execute' | 'media.jobs.list' | 'media.jobs.cancel' | 'ai.jobs.status' | 'ai.enqueue';

export {};

declare global {
  interface SerpentScriptAsset {
    readonly id: string;
    readonly name: string;
    /** Stable file-content revision; metadata edits do not change it. */
    readonly currentRevisionId: string;
    readonly rating: number;
    readonly favorite: boolean;
    readonly locationKind: 'managed' | 'linked';
    readonly folderId: string | null;
    readonly mimeType: string | null;
    readonly byteSize: number;
    readonly relativeFilePath: string;
  }

  interface SerpentScriptAssetSearchPage {
    readonly items: readonly SerpentScriptAsset[];
    readonly total: number;
    readonly offset: number;
    readonly limit: number;
    readonly hasMore: boolean;
  }

  interface SerpentRatingUpdateResult {
    readonly updatedCount: number;
    readonly skipped: readonly { readonly assetId: string; readonly reason: string }[];
  }

  interface SerpentScriptAssetMetadata {
    readonly assetId: string;
    readonly description: string | null;
    readonly rating: number;
    readonly favorite: boolean;
    readonly tags: readonly { readonly id: string; readonly name: string; readonly source: 'user' | 'ai' }[];
    readonly automaticPalette: readonly { readonly hex: string; readonly ratio: number }[];
    readonly sourcePageUrl: string | null;
    readonly author: string | null;
    /** Optimistic-concurrency token for the metadata row, not a file revision. */
    readonly entityVersion: number;
    readonly updatedAt: string;
  }

  interface SerpentAiContent {
    readonly assetId: string;
    readonly description: string | null;
    readonly tags: readonly string[];
    readonly rating: number | null;
    readonly modelVersion: string | null;
  }

  interface SerpentRecentPalette {
    readonly days: number;
    readonly assetCount: number;
    readonly paletteAssetCount: number;
    readonly colors: readonly { readonly hex: string; readonly weight: number; readonly assetCount: number }[];
  }

  interface SerpentScriptFolder {
    readonly id: string;
    readonly parentId: string | null;
    readonly name: string;
  }

  interface SerpentScriptFolderPage {
    readonly items: readonly SerpentScriptFolder[];
    readonly total: number;
    readonly offset: number;
    readonly limit: number;
    readonly hasMore: boolean;
  }

  interface SerpentScriptLibrary {
    readonly id: string;
    readonly displayName: string;
  }

  interface SerpentScriptImportResult {
    readonly status: 'conflicts' | 'completed';
    readonly plan?: { readonly importId: string; readonly fileCount: number; readonly totalBytes: number; readonly suspectedDuplicateCount: number; readonly libraryDuplicateCount: number; readonly nameConflictCount: number };
    readonly completion?: { readonly importedCount: number; readonly fileCount: number; readonly assetCount: number; readonly skippedCount: number; readonly replacedCount: number; readonly assets: readonly SerpentScriptAsset[] };
  }

  interface SerpentScriptTag {
    readonly id: string;
    readonly name: string;
    readonly assetCount: number;
  }

  interface SerpentScriptTagPage {
    readonly items: readonly SerpentScriptTag[];
    readonly total: number;
    readonly offset: number;
    readonly limit: number;
    readonly hasMore: boolean;
  }

  interface SerpentTagMutationResult {
    readonly assignedCount?: number;
    readonly removedCount?: number;
    readonly skipped: readonly { readonly assetId: string; readonly reason: string }[];
  }

  interface SerpentScriptCollection {
    readonly id: string;
    readonly parentId: string | null;
    readonly name: string;
    readonly description: string | null;
    readonly assetCount: number;
    readonly childCollectionCount: number;
  }

  interface SerpentScriptSmartCollection {
    readonly id: string;
    readonly name: string;
    readonly queryDefinition: string;
    readonly assetCount: number;
  }

  interface SerpentScriptLinkedFolder {
    readonly id: string;
    readonly name: string;
    readonly status: 'available' | 'offline';
    readonly assetCount: number;
  }

  interface SerpentScriptExtractedMetadata {
    readonly assetId: string;
    readonly status: 'ready' | 'pending' | 'failed' | 'missing';
    readonly metadata: unknown;
    readonly errorCode: string | null;
  }

  interface SerpentAutomationApi {
    readonly library: {
      inspect(): Promise<SerpentScriptLibrary>;
      changeSequence(): Promise<{ readonly changeSequence: number }>;
      create(input: { displayName: string; selectedParentPath: string; idempotencyKey?: string }): Promise<{ readonly libraryId: string; readonly displayName: string }>;
    };
    readonly files: {
      import(input: { sourceKind: 'files' | 'folder'; sourcePaths: readonly string[]; targetFolderId?: string; imageSequenceFps?: number; expandImageSequences?: boolean; idempotencyKey?: string }): Promise<SerpentScriptImportResult>;
    };
    readonly folders: {
      list(input?: { limit?: number; offset?: number }): Promise<SerpentScriptFolderPage>;
      create(name: string, parentFolderId?: string | null): Promise<SerpentScriptFolder>;
    };
    readonly linkedFolders: {
      list(input?: { limit?: number; offset?: number }): Promise<{
        readonly items: readonly SerpentScriptLinkedFolder[];
        readonly total: number; readonly offset: number; readonly limit: number; readonly hasMore: boolean;
      }>;
    };
    readonly tags: {
      list(input?: { limit?: number; offset?: number }): Promise<SerpentScriptTagPage>;
      create(name: string): Promise<SerpentScriptTag>;
      assign(assetIds: readonly string[], tagIds: readonly string[]): Promise<SerpentTagMutationResult>;
      remove(assetIds: readonly string[], tagIds: readonly string[]): Promise<SerpentTagMutationResult>;
    };
    readonly collections: {
      list(input?: { limit?: number; offset?: number }): Promise<{
        readonly items: readonly SerpentScriptCollection[];
        readonly total: number; readonly offset: number; readonly limit: number; readonly hasMore: boolean;
      }>;
      getMemberships(assetIds: readonly string[], input?: { limit?: number; offset?: number }): Promise<{
        readonly items: readonly { readonly assetId: string; readonly collectionId: string }[];
        readonly total: number; readonly offset: number; readonly limit: number; readonly hasMore: boolean;
      }>;
      create(name: string, parentId?: string | null): Promise<{ readonly id: string; readonly parentId: string | null; readonly name: string; readonly assetCount: number }>;
      addAssets(collectionId: string, assetIds: readonly string[]): Promise<{ readonly collectionId: string }>;
      removeAssets(collectionId: string, assetIds: readonly string[]): Promise<{ readonly collectionId: string }>;
    };
    readonly smartCollections: {
      list(input?: { limit?: number; offset?: number }): Promise<{
        readonly items: readonly SerpentScriptSmartCollection[];
        readonly total: number; readonly offset: number; readonly limit: number; readonly hasMore: boolean;
      }>;
    };
    readonly jobs: {
      readonly media: {
        list(input?: { limit?: number; offset?: number }): Promise<unknown>;
      };
      readonly ai: {
        status(input?: { jobIds?: readonly string[]; limit?: number; offset?: number }): Promise<unknown>;
        enqueue(input?: { assetIds?: readonly string[]; folderId?: string; resumePaused?: boolean }): Promise<{ readonly enqueued: number; readonly jobIds: readonly string[]; readonly alreadyPendingJobIds: readonly string[]; readonly skippedAssetIds: readonly string[] }>;
      };
    };
    readonly assets: {
      search(input: { query: string | null; limit?: number; offset?: number }): Promise<SerpentScriptAssetSearchPage>;
      list(input?: { folderId?: string; recursive?: boolean; assetIds?: readonly string[]; limit?: number; offset?: number }): Promise<SerpentScriptAssetSearchPage>;
      getMetadata(assetId: string): Promise<SerpentScriptAssetMetadata>;
      getAiContent(assetId: string): Promise<SerpentAiContent>;
      setMetadata(input: { assetId: string; expectedVersion: number; description?: string | null; rating?: 0 | 1 | 2 | 3 | 4 | 5; favorite?: boolean; sourcePageUrl?: string | null; author?: string | null }): Promise<SerpentScriptAssetMetadata>;
      getExtractedMetadata(assetId: string): Promise<SerpentScriptExtractedMetadata>;
      setRating(assetIds: readonly string[], rating: 0 | 1 | 2 | 3 | 4 | 5): Promise<SerpentRatingUpdateResult>;
      copyFilePaths(assetIds: readonly string[]): Promise<{ readonly copiedCount: number }>;
      moveToTrash(assetIds: readonly string[]): Promise<{ readonly trashedCount: number; readonly operationId: string }>;
      readContent(assetId: string, options?: { readonly maxBytes?: number }): Promise<{ readonly assetId: string; readonly revisionId: string; readonly byteSize: number; readonly dataBase64: string; readonly truncated: boolean; readonly mimeType: string | null }>;
      replaceContent(assetId: string, dataBase64: string, options?: { readonly expectedRevisionId?: string; readonly mimeHint?: string }): Promise<{ readonly assetId: string; readonly revisionId: string; readonly byteSize: number }>;
      stageContent(assetId: string, dataBase64: string, options?: { readonly stagingToken?: string; readonly complete?: boolean }): Promise<{ readonly assetId: string; readonly stagingToken: string; readonly byteSize: number; readonly complete: boolean }>;
      replaceContentBatch(items: readonly ({ readonly assetId: string; readonly dataBase64: string; readonly expectedRevisionId: string } | { readonly assetId: string; readonly stagingToken: string; readonly expectedRevisionId: string })[]): Promise<{ readonly operationId: string; readonly items: readonly { readonly assetId: string; readonly revisionId: string; readonly byteSize: number }[] }>;
      moveToFolder(assetIds: readonly string[], targetFolderId: string | null, options?: { readonly conflictStrategy?: 'keep-both' | 'replace' | 'skip' }): Promise<{ readonly movedCount: number; readonly skippedCount: number; readonly operationId: string | null }>;
      renameFile(assetId: string, newBaseName: string, options?: { readonly fileName?: string }): Promise<{ readonly assetId: string; readonly name: string }>;
      renameFiles(items: readonly { readonly assetId: string; readonly newBaseName: string }[]): Promise<{ readonly renamedCount: number; readonly skipped: readonly { readonly assetId: string; readonly reason: 'asset_not_found' | 'asset_unavailable' | 'name_conflict' | 'invalid_name' }[] }>;
    };
    readonly trash: {
      list(input?: { limit?: number; offset?: number }): Promise<SerpentScriptAssetSearchPage>;
      restoreIfOriginalVacant(assetIds: readonly string[]): Promise<{ readonly restoredCount: number; readonly skippedCount: number; readonly skipped: readonly { readonly assetId: string; readonly reason: 'original_folder_missing' | 'name_conflict' | 'trash_file_missing' }[] }>;
    };
    readonly palettes: {
      mostFrequent(input?: { days?: number; limit?: number }): Promise<SerpentRecentPalette>;
    };
    readonly ui: {
      notify(input: { severity: 'info' | 'warning' | 'error'; message: string; mode?: 'toast' | 'dialog'; title?: string }): Promise<{ readonly shown: true; readonly mode: 'toast' | 'dialog'; readonly severity: 'info' | 'warning' | 'error' }>;
    };
  }

  const serpent: SerpentAutomationApi;
}
