// Wait for an owned collection resource to finish all pages without committing a partial queue.
type Snapshot<T> = {
    status: 'idle' | 'loading' | 'ready' | 'error';
    tracks: T[];
    generation: number;
    complete?: boolean;
    sync: { status: 'none' | 'syncing' | 'interrupted' };
    error: unknown;
};

type ReadableCollection<T> = {
    getSnapshot(): Snapshot<T>;
    subscribe(listener: () => void): () => void;
};

/** The caller retains the resource for this request and releases it after settlement. */
export const readCompleteCollection = <T>(resource: ReadableCollection<T>, signal: AbortSignal, onProgress: (count: number) => void = () => {}): Promise<T[]> => new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    let settled = false;
    let scheduled = false;
    const generation = resource.getSnapshot().generation;
    const finish = (error: unknown, tracks?: T[]) => {
        if (settled) return;
        settled = true;
        unsubscribe();
        signal.removeEventListener('abort', aborted);
        if (error) reject(error);
        else resolve([...(tracks ?? [])]);
    };
    const aborted = () => finish(new DOMException('Collection preparation cancelled', 'AbortError'));
    const inspect = () => {
        scheduled = false;
        if (settled) return;
        if (signal.aborted) return aborted();
        const snapshot = resource.getSnapshot();
        if (snapshot.generation !== generation) return finish(new Error('Collection changed during preparation'));
        onProgress(snapshot.tracks.length);
        if (snapshot.status === 'error' || snapshot.sync.status === 'interrupted') {
            finish(new Error('Complete collection could not be read', { cause: snapshot.error }));
        } else if (snapshot.status === 'ready' && snapshot.sync.status === 'none') {
            if (snapshot.complete === false) finish(new Error('Upstream did not confirm a complete collection'));
            else finish(null, snapshot.tracks);
        }
    };
    // A resource publishes the first page before starting its background sync in the same turn.
    const schedule = () => {
        if (scheduled || settled) return;
        scheduled = true;
        queueMicrotask(inspect);
    };
    unsubscribe = resource.subscribe(schedule);
    signal.addEventListener('abort', aborted, { once: true });
    schedule();
});
