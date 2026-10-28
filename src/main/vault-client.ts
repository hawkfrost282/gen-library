import { fork, type ChildProcess } from 'node:child_process';
import { vaultStatusSchema, type VaultStatus, type VaultCommand } from '../shared/vault';
export class VaultClient {
  private child?: ChildProcess;
  private initialization?: Promise<VaultStatus>;
  private nextId = 0;
  private pending = new Map<number, { resolve(value: VaultStatus): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  constructor(private readonly entry: string, private readonly options: { userData: string; executable: string; appPath: string; packaged: boolean }) {}
  private async start(): Promise<VaultStatus> {
    if (this.initialization) return this.initialization;
    this.child = fork(this.entry, [], { execPath: this.options.executable, execArgv: [], stdio: ['ignore','ignore','ignore','ipc'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
    const ownedChild = this.child;
    this.child.on('message', (message: unknown) => {
      if (!message || typeof message !== 'object') return;
      const value = message as { id?: number; value?: unknown };
      if (typeof value.id !== 'number') return;
      const request = this.pending.get(value.id); if (!request) return;
      this.pending.delete(value.id); clearTimeout(request.timer);
      const parsed = vaultStatusSchema.safeParse(value.value);
      if (parsed.success) request.resolve(parsed.data); else request.reject(new Error('The vault controller returned an invalid status.'));
    });
    const failed = () => {
      if (this.child !== ownedChild) return;
      this.child = undefined; this.initialization = undefined;
      for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('The vault controller stopped. Existing volumes will be checked on recovery.')); }
      this.pending.clear();
    };
    this.child.once('exit', failed); this.child.once('error', failed);
    this.initialization = this.send({ operation: 'initialize', ...this.options });
    return this.initialization;
  }
  private send(command: unknown): Promise<VaultStatus> {
    return new Promise((resolve, reject) => {
      if (!this.child?.connected) { reject(new Error('The vault controller is unavailable.')); return; }
      const id = ++this.nextId;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('The vault controller is still working. Do not assume the vault is locked; check its status.')); }, 180_000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.send({ id, command }, (error) => { if (error) { clearTimeout(timer); this.pending.delete(id); reject(new Error('Could not contact the vault controller.')); } });
    });
  }
  async request(command: VaultCommand): Promise<VaultStatus> {
    const initial = await this.start(); if (initial.error) return initial;
    return this.send(command);
  }
  async lockAll(): Promise<void> {
    const result = await this.request({ operation: 'lock-all' });
    if (result.error || result.sessions.length) throw new Error(result.error ?? 'A vault remains unlocked.');
  }
}
