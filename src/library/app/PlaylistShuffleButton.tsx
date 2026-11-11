import i18n from '../../i18n/config';
import { useEffect, useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { useTranslation } from 'react-i18next';
import { Shuffle } from 'lucide-react';
import type { CollectionResource } from '../core/shared/resource.contract';
import type { LibraryPlaybackPort } from '../core/shared/ports.contract';
import { collectionResourceRegistry } from '../core/collection/resource/collectionResourceRegistry.service';
import { cancelShufflePreparation, prepareShuffle } from '../../services/playlistShuffle/preparation';
import { usePlaybackStore } from '../../stores/usePlaybackStore';
import { setStatusMessage } from '../../stores/useStatusMessageStore';

// Shared playlist action binding and controls; data preparation remains in services/playlistShuffle.
type Entry = { resource: CollectionResource; playback: LibraryPlaybackPort };
const useShuffleEntry = create<{ entry: Entry | null; busyResource: CollectionResource | null }>(() => ({ entry: null, busyResource: null }));

// The wall seam may live outside the collection subtree; bind its semantic action, not a DOM location.
export function PlaylistShuffleBinding({ resource, playback }: Entry) {
    useEffect(() => {
        const entry = { resource, playback };
        useShuffleEntry.setState({ entry });
        return () => {
            if (useShuffleEntry.getState().entry === entry) useShuffleEntry.setState({ entry: null });
        };
    }, [resource, playback]);
    return null;
}

export default function PlaylistShuffleButton({ className = 'inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs transition-opacity hover:opacity-80 disabled:opacity-40', actionId }: { className?: string; actionId?: string }) {
    const entry = useShuffleEntry(state => state.entry);
    return entry ? <ShuffleAction {...entry} className={className} actionId={actionId} /> : null;
}

// One collection-level entry shared by every library renderer; preparation owns its resource retention.
function ShuffleAction({ resource, playback, className, actionId }: Entry & { className: string; actionId?: string }) {
    const { t } = useTranslation();
    const busyResource = useShuffleEntry(state => state.busyResource);
    const busy = busyResource === resource;
    const snapshot = useSyncExternalStore(resource.subscribe, resource.getSnapshot, resource.getSnapshot);
    const empty = snapshot.status === 'ready' && snapshot.sync.status === 'none' && snapshot.tracks.length === 0;
    const stageActive = usePlaybackStore(state => state.activePlaybackContext !== 'main');
    if (busy || snapshot.status === 'idle' || snapshot.status === 'loading') return null;
    return <button type="button" disabled={busy || stageActive || empty} onClick={() => void startPlaylistShuffle()}
        className={className} data-playlist-shuffle data-bravais-seam-action={actionId}
        title={t('playlistShuffle.hint')}>
        <Shuffle size={16} />{t('playlistShuffle.play')}
    </button>;
}


export const canStartPlaylistShuffle = (): boolean => {
    const { entry, busyResource } = useShuffleEntry.getState();
    if (!entry || busyResource === entry.resource || usePlaybackStore.getState().activePlaybackContext !== 'main') return false;
    const snapshot = entry.resource.getSnapshot();
    return snapshot.status === 'error' || (snapshot.status === 'ready' && (snapshot.tracks.length > 0 || snapshot.sync.status === 'syncing'));
};

/** Button and command palette invoke the same collection action. */
export const startPlaylistShuffle = async (): Promise<void> => {
    const entry = useShuffleEntry.getState().entry;
    if (!entry || !canStartPlaylistShuffle()) return;
    const { resource, playback } = entry;
    const t = i18n.t.bind(i18n);
    if (usePlaybackStore.getState().activePlaybackContext !== 'main') return;
    const release = resource.kind === 'static' ? () => {} : collectionResourceRegistry.retain(resource);
    if (!release) return;
    resource.prepareForShuffle?.();
    if (resource.getSnapshot().status === 'error' || resource.getSnapshot().sync.status === 'interrupted'
        || (resource.kind === 'online' && resource.getSnapshot().status === 'ready' && resource.getSnapshot().sync.status === 'none' && resource.getSnapshot().complete !== true)) resource.reload();
    useShuffleEntry.setState({ busyResource: resource });
    const nonce = Date.now();
    const clearOwnNotice = () => setStatusMessage(previous => previous?.nonce === nonce ? null : previous);
    try {
        const tracks = await prepareShuffle(resource, count => setStatusMessage({
            type: 'info', text: t('playlistShuffle.preparing', { count }), persistent: true, nonce,
            actionLabel: t('playlistShuffle.cancel'), onAction: cancelShufflePreparation,
        }));
        clearOwnNotice();
        if (tracks.length) playback.playTrack(tracks[0], tracks);
        else setStatusMessage({ type: 'info', text: t('playlistShuffle.empty') });
    } catch (error) {
        clearOwnNotice();
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
            console.warn('[PlaylistShuffle] Preparation failed', error);
            setStatusMessage({ type: 'error', text: t('playlistShuffle.failed') });
        }
    } finally {
        release();
        if (useShuffleEntry.getState().busyResource === resource) useShuffleEntry.setState({ busyResource: null });
    }
};
