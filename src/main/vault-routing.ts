import { matchesVaultTrigger, type VaultTrigger } from '../shared/organization';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { z } from 'zod';
import { DEFAULT_ROUTING_CONFIG, routedPhysicalFolder, relativeFolderSchema, isNsfwTag, routingConfigSchema, type RoutingConfig, type RoutingState } from '../shared/vault-routing';
import type { WorkerCommand } from '../shared/protocol/requests';
import type { WorkerResult } from '../shared/protocol/responses';
import type { VaultCommand, VaultStatus } from '../shared/vault';
import { atomicVaultJson } from './vault-transfer-io';

type Job = RoutingState['pending'][number] & { libraryId: string; assetId: string; autoEligible?: boolean; manual?: boolean };
type Options = {
  stateFile: string;
  worker(command: WorkerCommand): Promise<WorkerResult>;
  vault(command: VaultCommand): Promise<VaultStatus>;
  policyChanged(enabled: boolean): void;
  clearCache(): Promise<void>;
};
const storedSchema = z.strictObject({ config: routingConfigSchema, pending: z.array(z.strictObject({ id: z.string().uuid(), libraryId: z.string(), assetId: z.string(), manual: z.boolean().optional() })).max(10000) });

/** Source removal is reachable only after a fresh acknowledgement from the private worker. */
export class VaultRouting {
  private config: RoutingConfig = { ...DEFAULT_ROUTING_CONFIG, characterFolders: {} };
  private jobs: Job[] = [];
  private busy = false;
  private message: string | undefined;
  private stopped = false;
  private needsExistingChoice = false;
  private storageMigration = false;
  constructor(private readonly options: Options) {
    if (existsSync(options.stateFile)) {
      try {
        const stored = storedSchema.parse(JSON.parse(readFileSync(options.stateFile, 'utf8')));
        this.config = stored.config;
        this.jobs = stored.pending.map((job) => ({ ...job, name: 'Pending image — reopen its library to continue', tags: [], folder: null }));
      } catch { this.message = 'The routing settings could not be read. Routing is off; originals have been kept.'; }
    }
    options.policyChanged(this.backgroundPaused);
  }
  get enabled(): boolean { return this.config.enabled && this.config.vaultState === 'enabled' && this.config.trigger !== 'manual'; }
  get backgroundPaused(): boolean { return this.enabled || this.config.vaultState === 'disabling'; }
  get selectedImage(): string | null { return this.config.vaultImage; }
  setMessage(message: string): void { this.message = message; }
  migrationFailed(message: string): void { this.storageMigration = false; this.message = message; }
  startDisable(): void { if (this.busy || this.storageMigration) throw new Error('Wait for the current move to finish.'); this.storageMigration = true; this.config.enabled = false; this.config.vaultState = 'disabling'; this.save(); this.options.policyChanged(true); }
  finishDisable(): void { this.storageMigration = false; this.config.enabled = false; this.config.vaultState = 'disabled'; this.jobs = []; this.save(); this.options.policyChanged(false); this.message = 'Vault files were returned and verified. Vault storage and automatic routing are disabled.'; }
  reenableStorage(): void { this.config.vaultState = 'enabled'; this.config.enabled = false; this.save(); this.options.policyChanged(false); this.message = 'Vault storage is enabled. Choose how routing should handle existing matches before turning it on.'; }
  snapshot(): RoutingState { return { config: structuredClone(this.config), busy: this.busy || this.storageMigration, needsExistingChoice: this.needsExistingChoice, pending: this.jobs.map(({ id, name, tags, folder, error }) => ({ id, name, tags, folder, ...(error ? { error } : {}) })), ...(this.message ? { message: this.message } : {}) }; }
  stop(): void { this.stopped = true; }
  private save(): void {
    atomicVaultJson(this.options.stateFile, { config: this.config, pending: this.jobs.map(({ id, libraryId, assetId, manual }) => ({ id, libraryId, assetId, ...(manual ? { manual } : {}) })) });
  }
  chooseVault(image: string): void {
    if (this.busy || this.storageMigration) throw new Error('Wait for the current move to finish.');
    if (!image.toLowerCase().endsWith('.sparsebundle')) throw new Error('Choose an encrypted sparse bundle.');
    const selected = realpathSync(image);
    if (selected !== this.config.vaultImage) { this.config.enabled = false; this.config.vaultState = 'enabled'; this.config.autoCharacterFolders = false; }
    this.config.vaultImage = selected; this.save(); this.options.policyChanged(this.backgroundPaused);
  }
  configure(enabled: boolean, automatic: boolean, options: { trigger?: VaultTrigger; autoCharacterFolders?: boolean; existingMatches?: 'all' | 'future' } = {}): boolean {
    if (this.busy || this.storageMigration) throw new Error('Wait for the current move to finish.');
    if (enabled && !this.config.vaultImage) throw new Error('Choose a destination vault first.');
    if (enabled && this.config.vaultState !== 'enabled') throw new Error('Enable Vault storage before enabling automatic routing.');
    const trigger = options.trigger ?? this.config.trigger;
    if (enabled && trigger !== 'manual' && (!this.config.enabled || trigger !== this.config.trigger) && !options.existingMatches) {
      this.needsExistingChoice = true;
      this.message = 'Apply this trigger to existing matches, or only to future changes?'; return false;
    }
    this.needsExistingChoice = false;
    this.config.enabled = enabled; this.config.automatic = automatic; this.config.trigger = trigger;
    if (options.autoCharacterFolders !== undefined) this.config.autoCharacterFolders = options.autoCharacterFolders;
    this.save(); this.options.policyChanged(this.enabled);
    this.message = this.enabled ? 'Vault routing is enabled. Tags remain metadata unless an explicit storage policy applies.' : 'Automatic Vault routing is off. Vault storage is unchanged.';
    return true;
  }
  async moveAllExisting(): Promise<void> {
    await this.reviewExisting();
    while (this.jobs.length && !this.stopped) { const current = this.jobs[0]; await this.moveNext(); if (this.jobs[0] === current) break; }
  }
  private async refresh(job: Job): Promise<boolean> {
    const result = await this.options.worker({ type: 'asset.metadata.get', libraryId: job.libraryId, assetId: job.assetId });
    if (!result.ok || result.type !== 'asset.metadata.got') throw new Error('Open the source library to review this image.');
    job.tags = result.metadata.tags.map((tag) => tag.name);
    const assets = await this.options.worker({ type: 'asset.list', libraryId: job.libraryId, assetIds: [job.assetId], recursive: true });
    if (assets.ok && assets.type === 'asset.list') {
      const asset = assets.assets[0]; job.name = asset?.displayName ?? 'Pending image';
      const originalFolder = asset?.relativeFilePath.split('/').slice(0, -1).join('/') ?? '';
      job.folder = routedPhysicalFolder(job.tags, this.config, originalFolder);
    }
    return job.manual === true || matchesVaultTrigger(job.tags, this.config.trigger);
  }
  async onTagsAssigned(libraryId: string, assetIds: string[], tagIds: string[]): Promise<void> {
    if (!this.enabled) return;
    const listed = await this.options.worker({ type: 'tag.list', libraryId });
    if (!listed.ok || listed.type !== 'tag.list') return;
    const assigned = new Set(tagIds);
    if (listed.tags.some((tag) => assigned.has(tag.tagId) && matchesVaultTrigger([tag.name], this.config.trigger))) await this.enqueue(libraryId, assetIds, true);
    else for (const job of this.jobs.filter((item) => item.libraryId === libraryId && assetIds.includes(item.assetId))) await this.refresh(job);
  }
  async enqueue(libraryId: string, assetIds: string[], autoEligible = false, manual = false): Promise<void> {
    if ((!manual && !this.enabled) || this.config.vaultState !== 'enabled' || this.stopped) return;
    for (const assetId of assetIds) {
      const existing = this.jobs.find((job) => job.libraryId === libraryId && job.assetId === assetId);
      if (existing) { try { await this.refresh(existing); } catch { /* Keep pending originals for review. */ } continue; }
      const job: Job = { id: randomUUID(), libraryId, assetId, autoEligible, manual, name: 'Pending image', tags: [], folder: null };
      try { if (await this.refresh(job) && !this.jobs.some((item) => item.libraryId === libraryId && item.assetId === assetId) && this.jobs.length < 10000) this.jobs.push(job); } catch { /* Failed lookups cannot authorize a move. */ }
    }
    this.save();
  }
  /** Called after a new manual tag assignment, never on enabling the rule or reviewing old images. */
  async automaticallyMoveNew(): Promise<void> {
    if (!this.enabled || !this.config.automatic || this.busy || this.stopped) return;
    const job = this.jobs[0]; if (!job || !job.autoEligible || job.error || job.folder === null) return;
    const status = await this.options.vault({ operation: 'status' });
    if (!status.sessions.some((item) => item.running && !item.error && item.image === this.config.vaultImage)) return;
    await this.moveNext();
    if (this.jobs[0] !== job) await this.automaticallyMoveNew();
  }
  async refreshNext(): Promise<void> {
    const job = this.jobs[0]; if (!job || job.tags.length || this.busy) return;
    try { if (!await this.refresh(job)) { this.jobs.shift(); this.save(); } } catch { /* Reopen the source library before resuming a pending move. */ }
  }
  async reviewExisting(): Promise<void> {
    if (!this.enabled || this.busy) throw new Error('Enable routing and wait for any move to finish first.');
    const listed = await this.options.worker({ type: 'library.list' });
    if (!listed.ok || listed.type !== 'library.list') throw new Error('Open a source library first.');
    for (const library of listed.libraries) {
      const tags = await this.options.worker({ type: 'tag.list', libraryId: library.libraryId });
      if (!tags.ok || tags.type !== 'tag.list') continue;
      const tagIds = tags.tags.filter((tag) => matchesVaultTrigger([tag.name], this.config.trigger)).map((tag) => tag.tagId);
      if (!tagIds.length) continue;
      for (let offset = 0; offset < 10000; offset += 100) {
        const found = await this.options.worker({ type: 'asset.search', libraryId: library.libraryId, query: { clauses: [] }, filters: [{ field: 'tag', values: tagIds, exclude: false, includeAi: true }], limit: 100, offset });
        if (!found.ok || found.type !== 'asset.search.result') throw new Error('The existing images could not be reviewed.');
        await this.enqueue(library.libraryId, found.items.map((asset) => asset.assetId));
        if (offset + found.items.length >= found.total || !found.items.length) break;
      }
    }
    this.message = `${this.jobs.length} image(s) waiting for review. Existing images move only when you choose Move next image.`;
  }
  skipNext(id: string): void {
    if (this.busy || this.jobs[0]?.id !== id) throw new Error('The pending image changed. Review it before skipping.');
    this.jobs.shift(); this.save(); this.message = 'Skipped. This original remains outside the vault.';
  }
  async moveNext(folderInput?: string, rememberTag?: string, expectedId?: string): Promise<void> {
    if ((!this.enabled && !this.jobs[0]?.manual) || this.config.vaultState !== 'enabled' || this.stopped) throw new Error('Enable Vault storage before moving an image.');
    if (this.busy) throw new Error('Another move is still running.');
    const job = this.jobs[0]; if (!job) return;
    if (expectedId && expectedId !== job.id) throw new Error('The pending image changed. Review it before moving.');
    this.busy = true; delete job.error;
    try {
      if (!await this.refresh(job)) { this.jobs.shift(); this.save(); this.message = 'The image no longer matches the Vault trigger, so it was left in place.'; return; }
      const parsedFolder = relativeFolderSchema.safeParse(folderInput ?? job.folder);
      if (!parsedFolder.success) throw new Error('Choose a character folder without slashes or control characters.');
      let folder = parsedFolder.data;
      const image = this.config.vaultImage; if (!image) throw new Error('Choose a destination vault.');
      const policy = await this.options.vault({ operation: 'return-command', image, command: { operation: 'organization.get' } });
      if (policy.error || policy.returnResult?.error) throw new Error(policy.error ?? policy.returnResult?.error);
      if (policy.returnResult?.organization) {
        this.config.autoCharacterFolders = policy.returnResult.organization.autoCharacterFolders;
        if (folderInput === undefined) folder = routedPhysicalFolder(job.tags, { ...this.config, characterFolders: { ...this.config.characterFolders, ...policy.returnResult.organization.characterFolders } }, job.folder ?? '');
        this.save();
      }
      if (rememberTag) {
        if (!job.tags.includes(rememberTag) || isNsfwTag(rememberTag)) throw new Error('Choose a character tag from this image.');
        this.config.characterFolders[rememberTag] = folder; this.save();
      }
      const prepared = await this.options.worker({ type: 'vault.source.prepare', libraryId: job.libraryId, assetId: job.assetId });
      if (!prepared.ok || prepared.type !== 'vault.source.prepared') throw new Error('This preview moves managed, available single images with one revision. Linked files, sequences, companion files and images with revision history stay in place.');
      const destination = await this.options.vault({ operation: 'transfer', image, source: prepared.source, folder });
      const receipt = destination.transferReceipt;
      if (destination.error || !receipt || receipt.sha256 !== prepared.source.sha256 || receipt.metadataHash !== prepared.source.metadataHash) throw new Error(destination.error ?? 'The encrypted copy was not verified. The original has been kept.');
      if ((!this.enabled && !job.manual) || this.config.vaultState !== 'enabled' || this.stopped || image !== this.config.vaultImage) throw new Error('Routing changed during the copy. The original has been kept.');
      const removed = await this.options.worker({ type: 'vault.source.remove', source: prepared.source });
      if (!removed.ok || removed.type !== 'asset.deleted-from-disk' || removed.deletedCount !== 1) throw new Error('The source changed or could not be removed. The verified copy is in the vault; review both before retrying.');
      this.jobs.shift(); this.save();
      this.message = `Moved into Vault${folder ? ` under ${folder}` : ' at the library root'}.`;
      await this.options.clearCache().catch(() => { this.message = 'The image was moved, but the app cache could not be cleared. Quit and reopen Gen Library.'; });
    } catch (error) {
      job.error = error instanceof Error ? error.message : 'The move did not finish. The original has been kept.';
      this.message = job.error;
    } finally { this.busy = false; }
  }
}
