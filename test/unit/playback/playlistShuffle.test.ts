import { queueIndexOf } from '@/utils/playbackNeighbors';
import { replacePlaybackSongInQueue } from '@/utils/appPlaybackGuards';
import type { SongResult } from '@/types';
import { describe, expect, it } from 'vitest';
import { shuffleItems, shuffleNextRound, shufflePlayableRound } from '@/services/playlistShuffle/shuffle';

// Deterministic shuffle coverage: duplicate occurrences are data, not accidental repeats to discard.
describe('playlist shuffle', () => {
    it('keeps the source unchanged and preserves every occurrence', () => {
        const first = { id: 'a' };
        const second = { id: 'a' };
        const third = { id: 'b' };
        const source = Object.freeze([first, second, third]);
        const result = shuffleItems(source, () => 0);
        expect(result).toEqual([second, third, first]);
        expect(source).toEqual([first, second, third]);
        expect(new Set(result).size).toBe(3);
    });
    it('keeps repeated song occurrences distinct after metadata refresh', () => {
        const first = { id: 'same', name: 'same', artists: [], album: { id: 'album', name: 'album' }, durationMs: 1000, playlistShuffle: { session: 'round', occurrence: 0 } } as SongResult;
        const second = { ...first, playlistShuffle: { session: 'round', occurrence: 1 } };
        const refreshed = replacePlaybackSongInQueue([first, second], { ...second, name: 'refreshed' });
        expect(refreshed.map(song => song.playlistShuffle?.occurrence)).toEqual([0, 1]);
        expect(queueIndexOf(refreshed, second)).toBe(1);
    });
    it('handles empty and single-item collections', () => {
        expect(shuffleItems([])).toEqual([]);
        expect(shuffleItems(['a'])).toEqual(['a']);
    });
    it('can select a last-page item as the first item', () => {
        const draws = [0, 0.99];
        expect(shuffleItems(['page1', 'page2', 'page3'], () => draws.shift()!)[0]).toBe('page3');
    });
    it('avoids repeating the previous last track when another track exists', () => {
        const result = shuffleNextRound(['a', 'a', 'b'], 'a', value => value, () => 0.99);
        expect(result[0]).toBe('b');
        expect(result.filter(value => value === 'a')).toHaveLength(2);
    });
    it('keeps unavailable entries and avoids repeating the first playable item', () => {
        const source = ['unavailable', 'last', 'other'];
        const result = shufflePlayableRound(source, 'last', value => value, value => value !== 'unavailable', () => 0.99);
        expect(result).toContain('unavailable');
        expect(result.find(value => value !== 'unavailable')).toBe('other');
    });
    it('permits replay when every occurrence is the same song', () => {
        expect(shuffleNextRound(['a', 'a'], 'a', value => value)).toEqual(['a', 'a']);
    });
    it.each([NaN, -1, 1, Infinity])('rejects invalid random values %s', value => {
        expect(() => shuffleItems([1, 2], () => value)).toThrow(RangeError);
    });
});
