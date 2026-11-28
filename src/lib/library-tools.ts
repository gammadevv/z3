export interface StoredAudio {
    id: string;
    title: string;
    bytes: number;
    removable: boolean;
}

export interface StorageSummary {
    audio: StoredAudio[];
    cacheBytes: number;
}

export function formatStorage(bytes: number): string {
    return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
