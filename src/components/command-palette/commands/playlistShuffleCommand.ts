import { Shuffle } from 'lucide-react';
import { defineCommand } from '../commandFactories';
import { canStartPlaylistShuffle, startPlaylistShuffle } from '../../../library/app/PlaylistShuffleButton';

// Contextual entry for shuffling the complete playlist currently open in any library suite.
export const playlistShuffleCommand = defineCommand({
    id: 'playlist-shuffle',
    group: 'playback',
    title: 'Shuffle playlist',
    description: 'Play the complete playlist in a new random order',
    keywords: ['random order', '洗牌', '打散顺序'],
    icon: Shuffle,
    isAvailable: context => (!context || context.scope.view === 'home') && canStartPlaylistShuffle(),
    execute: (_input, context) => {
        if (context.scope.view !== 'home' || !canStartPlaylistShuffle()) return false;
        void startPlaylistShuffle();
        return true;
    },
});
