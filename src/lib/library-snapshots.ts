const INTERVAL = 24 * 60 * 60 * 1000;
const RETENTION = 3;
const STORE = 'snapshots';

function openSnapshots(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('zeta-library-snapshots', 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function read<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function listSnapshots(): Promise<number[]> {
    const db = await openSnapshots();
    try {
        const keys = await read(db.transaction(STORE).objectStore(STORE).getAllKeys());
        return (keys as number[]).reverse();
    } finally { db.close(); }
}

export async function loadSnapshot(time: number): Promise<Uint8Array | undefined> {
    const db = await openSnapshots();
    try { return await read(db.transaction(STORE).objectStore(STORE).get(time)); }
    finally { db.close(); }
}

export async function saveSnapshot(create: () => Promise<Uint8Array>, manual: boolean): Promise<void> {
    if (!manual && Date.now() - ((await listSnapshots())[0] ?? 0) < INTERVAL) return;
    const data = await create();
    const db = await openSnapshots();
    try {
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction(STORE, 'readwrite');
            transaction.oncomplete = () => resolve();
            transaction.onabort = () => reject(transaction.error);
            const snapshots = transaction.objectStore(STORE);
            const keys = snapshots.getAllKeys();
            keys.onsuccess = () => {
                const now = Date.now();
                const times = keys.result as number[];
                if (!manual && now - (times.at(-1) ?? 0) < INTERVAL) return;
                snapshots.put(data, Math.max(now, (times.at(-1) ?? 0) + 1));
                for (const time of times.slice(0, Math.max(0, times.length - RETENTION + 1))) snapshots.delete(time);
            };
        });
    } finally { db.close(); }
}
