import { usePlaybackStore } from '../../stores/usePlaybackStore';
import { getPlaybackSongKey } from '../../utils/appPlaybackGuards';
import type { SongResult } from '../../types';
import { readCompleteCollection } from './readCompleteCollection';
import { shuffleItems } from './shuffle';
import { isSongUnavailable } from '../onlineMusic/songAvailability';

// Own one asynchronous shuffle preparation; playback intent changes cancel it at the shared start.
let pending: AbortController | null = null;
let sessionCounter = 0;
export const cancelShufflePreparation = () => { pending?.abort(); pending = null; };
export const prepareShuffle = async (
    resource: Parameters<typeof readCompleteCollection<SongResult>>[0],
    progress: (count: number) => void,
): Promise<SongResult[]> => {
    cancelShufflePreparation();
    const controller = new AbortController();
    pending = controller;
    const before = usePlaybackStore.getState();
    const unsubscribe = usePlaybackStore.subscribe(state => {
        if (state.playQueue !== before.playQueue || state.activePlaybackContext !== before.activePlaybackContext) controller.abort();
    });
    try {
        const tracks = await readCompleteCollection(resource, controller.signal, progress);
        if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        const session = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${++sessionCounter}-${Math.random().toString(36).slice(2)}`;
        return shuffleItems(tracks.filter(track => !isSongUnavailable(track))).map((track, index) => ({
            ...track,
            playlistShuffle: { session, occurrence: index },
        }));
    } finally {
        unsubscribe();
        if (pending === controller) pending = null;
    }
};

let requested: SongResult | null = null;
/** Carry queue occurrence metadata through local/remote playback adapters that rebuild song records. */
export const rememberShuffleOccurrence = (song: SongResult | null) => { requested = song; };
export const inheritShuffleOccurrence = <T extends SongResult>(song: T | null): T | null => {
    if (!song || !requested?.playlistShuffle) return song;
    return getPlaybackSongKey(song) === getPlaybackSongKey(requested)
        ? { ...song, playlistShuffle: requested.playlistShuffle } : song;
};

/** Keep the occurrence when an adapter refreshes a saved or currently displayed song's metadata. */
export const preserveShuffleOccurrence = <T extends SongResult>(from: SongResult | null, next: T | null): T | null => (
    from?.playlistShuffle && next ? { ...next, playlistShuffle: from.playlistShuffle } : next
);
