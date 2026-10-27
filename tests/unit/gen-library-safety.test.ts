import { describe, expect, it, vi } from 'vitest';
import { assertInputBudget } from '../../src/shared/input-budget';
import { trashLinkedSource } from '../../src/worker/trash-linked-source';
const { trash } = vi.hoisted(() => ({ trash: vi.fn() }));
vi.mock('trash', () => ({ default: trash }));
describe('Gen Library safety', () => {
  it('treats linked filenames as literal paths and propagates Trash failures', async () => {
    trash.mockResolvedValueOnce(undefined);
    await trashLinkedSource('/sample/art[1]*?.png');
    expect(trash).toHaveBeenCalledWith(['/sample/art[1]*?.png'], { glob: false });
    trash.mockRejectedValueOnce(new Error('Trash unavailable'));
    await expect(trashLinkedSource('/sample/art.png')).rejects.toThrow('Trash unavailable');
  });
  it('rejects deeply nested and very wide JSON before protocol validation', () => {
    let deep: unknown = null; for (let i = 0; i < 100; i++) deep = { child: deep };
    expect(() => assertInputBudget(deep)).toThrow();
    expect(() => assertInputBudget(Array.from({ length: 10001 }, () => 1))).toThrow();
    expect(() => assertInputBudget({ jsonrpc: '2.0', method: 'tools/list', params: {} })).not.toThrow();
  });
});
