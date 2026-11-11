import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SongResult } from '@/types';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { cancelShufflePreparation, prepareShuffle, preserveShuffleOccurrence } from '@/services/playlistShuffle/preparation';

vi.mock('@/services/onlineMusic/songAvailability', () => ({ isSongUnavailable: (song: SongResult) => song.name === 'blocked' }));

// Preparation uses one contract for local, server-backed and online tracks and never probes audio URLs.
const song = (id: string, kind: 'local' | 'navidrome' | 'online'): SongResult => ({
    id, name: id, artists: [], album: { id: 'album', name: '' }, durationMs: 1000,
    sourceRef: kind === 'online' ? { kind, providerId: 'test', mediaId: id } : { kind, mediaId: id },
});
const resource = (tracks: SongResult[], ready = true) => {
    const listeners = new Set<() => void>();
    return {
        getSnapshot: () => ({ status: ready ? 'ready' as const : 'loading' as const, tracks, generation: 1, sync: { status: 'none' as const }, error: null }),
        subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
        listeners,
    };
};
afterEach(() => { cancelShufflePreparation(); });

describe('shuffle preparation ownership', () => {
    it.each(['local', 'navidrome', 'online'] as const)('prepares every occurrence for %s tracks', async kind => {
        const first = song('first', kind);
        const rows = [first, { ...first }, song('blocked', kind), song('last', kind)];
        const prepared = await prepareShuffle(resource(rows), () => {});
        expect(prepared).toHaveLength(3);
        expect(prepared.filter(track => track.id === first.id)).toHaveLength(2);
        expect(new Set(prepared.map(track => track.playlistShuffle?.occurrence)).size).toBe(3);
        expect(new Set(prepared.map(track => track.playlistShuffle?.session)).size).toBe(1);
        expect(rows[0].playlistShuffle).toBeUndefined();
    });
    it('retains a saved duplicate position while rebuilding fresh local metadata', () => {
        const cached = JSON.parse(JSON.stringify({ ...song('same', 'local'), playlistShuffle: { session: 'saved', occurrence: 2 } })) as SongResult;
        const refreshed = preserveShuffleOccurrence(cached, { ...song('same', 'local'), name: 'Updated title' });
        expect(refreshed?.name).toBe('Updated title');
        expect(refreshed?.playlistShuffle).toEqual({ session: 'saved', occurrence: 2 });
        expect(preserveShuffleOccurrence(cached, null)).toBeNull();
    });
    it('drops the old read when a newer preparation starts', async () => {
        const old = resource([song('old', 'online')], false);
        const read = prepareShuffle(old, () => {});
        const assertion = expect(read).rejects.toMatchObject({ name: 'AbortError' });
        await prepareShuffle(resource([song('new', 'local')]), () => {});
        await assertion;
        expect(old.listeners.size).toBe(0);
    });
    it('cancels when the live queue is replaced during preparation', async () => {
        const oldQueue = usePlaybackStore.getState().playQueue;
        const pending = resource([], false);
        const read = prepareShuffle(pending, () => {});
        const assertion = expect(read).rejects.toMatchObject({ name: 'AbortError' });
        usePlaybackStore.setState({ playQueue: [] });
        await assertion;
        expect(pending.listeners.size).toBe(0);
        usePlaybackStore.setState({ playQueue: oldQueue });
    });
});
