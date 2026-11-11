import { describe, expect, it, vi } from 'vitest';
import { readCompleteCollection } from '@/services/playlistShuffle/readCompleteCollection';

// Simulate the first-page and background-sync notifications emitted by collection resources.
const collection = () => {
    const listeners = new Set<() => void>();
    let snapshot = { status: 'loading' as 'loading' | 'ready' | 'error', tracks: [] as number[], generation: 1, sync: { status: 'none' as 'none' | 'syncing' | 'interrupted' }, error: null, complete: undefined as boolean | undefined };
    return {
        getSnapshot: () => snapshot,
        subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
        publish: (next: Partial<typeof snapshot>) => { snapshot = { ...snapshot, ...next }; listeners.forEach(listener => listener()); },
        count: () => listeners.size,
    };
};

describe('complete collection for shuffle', () => {
    it('does not mistake the first ready page for a complete collection', async () => {
        const resource = collection();
        const done = vi.fn();
        const progress = vi.fn();
        const read = readCompleteCollection(resource, new AbortController().signal, progress).then(done);
        resource.publish({ status: 'ready', tracks: [1, 2] });
        resource.publish({ sync: { status: 'syncing' } });
        await Promise.resolve();
        expect(done).not.toHaveBeenCalled();
        resource.publish({ tracks: [1, 2, 3, 3], sync: { status: 'none' } });
        await read;
        expect(done).toHaveBeenCalledWith([1, 2, 3, 3]);
        expect(resource.count()).toBe(0);
    });
    it('cancels without returning a partial queue and detaches its listener', async () => {
        const resource = collection();
        const abort = new AbortController();
        const read = readCompleteCollection(resource, abort.signal);
        abort.abort();
        await expect(read).rejects.toMatchObject({ name: 'AbortError' });
        expect(resource.count()).toBe(0);
    });
    it('rejects interrupted pagination', async () => {
        const resource = collection();
        const read = readCompleteCollection(resource, new AbortController().signal);
        resource.publish({ status: 'ready', tracks: [1], sync: { status: 'interrupted' } });
        await expect(read).rejects.toThrow('Complete collection');
        expect(resource.count()).toBe(0);
    });
    it('refuses a stalled upstream even when background sync has stopped', async () => {
        const resource = collection();
        const read = readCompleteCollection(resource, new AbortController().signal);
        resource.publish({ status: 'ready', tracks: [1], complete: false });
        await expect(read).rejects.toThrow('Upstream did not confirm');
    });

    it('rejects a collection reload that overtakes the preparation', async () => {
        const resource = collection();
        const read = readCompleteCollection(resource, new AbortController().signal);
        resource.publish({ generation: 2 });
        await expect(read).rejects.toThrow('Collection changed');
    });
});
