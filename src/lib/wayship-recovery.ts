import type { PeerMode } from './peer-connection';

export type WayshipLinkMode = PeerMode | 'sync';

export function canAutoSyncWayshipPeer(localId: string, peer: { peer_id: string; meta?: Record<string, unknown> | null }): boolean {
    // Older devices interpret an unfamiliar mode as remote control.
    return localId < peer.peer_id && peer.meta?.librarySync === true;
}

export function readWayshipOfferMode(payload: { mode?: unknown; userInitiated?: unknown }): WayshipLinkMode | null {
    if (payload.mode === 'remote') return payload.userInitiated === true ? 'remote' : null;
    if (payload.mode === 'sync' || payload.mode === 'backup' || payload.mode === 'party') return payload.mode;
    return null;
}

const linkPriority: Record<WayshipLinkMode, number> = { sync: 0, remote: 1, party: 1, backup: 2 };

export function acceptsWayshipOffer(
    incoming: WayshipLinkMode, existing: { mode: WayshipLinkMode; host: boolean },
    localId?: string, remoteId?: string,
): boolean {
    const priority = linkPriority[incoming] - linkPriority[existing.mode];
    if (priority !== 0) return priority > 0;
    return !existing.host || !localId || !remoteId || localId >= remoteId;
}

export function carriesPeerPlayback(mode: WayshipLinkMode): boolean {
    return mode === 'remote' || mode === 'party';
}

const FIRST_RETRY_MS = 1000;
const MAX_RETRY_MS = 30_000;

export class WayshipHttpError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

export function nextWayshipRetry(delay: number) {
    return delay ? Math.min(delay * 2, MAX_RETRY_MS) : FIRST_RETRY_MS;
}

export class WayshipSignalInbox {
    private received = new Map<string, number>();

    accept(from: string, kind: string, payload: unknown, now = Date.now()) {
        if (kind !== 'offer' && kind !== 'answer') return true;
        const sdp = (payload as { sdp?: unknown } | null)?.sdp;
        if (typeof sdp !== 'string') return false;
        for (const [key, expires] of this.received) {
            if (expires <= now) this.received.delete(key);
        }
        const key = `${from}\0${kind}\0${sdp}`;
        if (this.received.has(key)) return false;
        if (this.received.size >= 128) this.received.delete(this.received.keys().next().value!);
        this.received.set(key, now + 60_000);
        return true;
    }
}
