// Immutable shuffle rules shared by collection preparation and playback round transitions.
export const shuffleItems = <T>(items: readonly T[], random: () => number = Math.random): T[] => {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
        const value = random();
        if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Random value must be in [0, 1)');
        const other = Math.floor(value * (index + 1));
        [result[index], result[other]] = [result[other], result[index]];
    }
    return result;
};

/** Preserve occurrences while avoiding an immediate repeat across two rounds when possible. */
export const shuffleNextRound = <T>(items: readonly T[], previousKey: string | null, keyOf: (item: T) => string, random: () => number = Math.random): T[] => {
    const result = shuffleItems(items, random);
    if (result.length > 1 && previousKey !== null && keyOf(result[0]) === previousKey) {
        const other = result.findIndex(item => keyOf(item) !== previousKey);
        if (other > 0) [result[0], result[other]] = [result[other], result[0]];
    }
    return result;
};

/** Keep unavailable entries in the queue while avoiding a repeat at the first playable position. */
export const shufflePlayableRound = <T>(items: readonly T[], previousKey: string, keyOf: (item: T) => string, playable: (item: T) => boolean, random: () => number = Math.random): T[] => {
    const result = shuffleItems(items, random);
    const first = result.findIndex(playable);
    if (first >= 0 && keyOf(result[first]) === previousKey) {
        const other = result.findIndex(item => playable(item) && keyOf(item) !== previousKey);
        if (other >= 0) [result[first], result[other]] = [result[other], result[first]];
    }
    return result;
};
