export const DISCORD_PEER_PREFIX = 'zeta-discord-';
export const DISCORD_PROTOCOL = 'zeta.discord.v1';
export const DISCORD_QUERY_LIMIT = 200;
export const DISCORD_REQUEST_LIFETIME = 20_000;

type SimpleCommand = 'status' | 'skip' | 'previous' | 'pause' | 'unpause';
export type DiscordCommand =
    | { action: SimpleCommand }
    | { action: 'play' | 'playnext' | 'enqueue'; query: string }
    | { action: 'lyrics'; query?: string }
    | { action: 'seek' | 'volume'; value: number };

export type DiscordRequest = DiscordCommand & {
    protocol: typeof DISCORD_PROTOCOL;
    requestId: string;
    expiresAt: number;
};

export interface DiscordTrack {
    title: string;
    artist: string;
}

export interface DiscordPlayback {
    track: DiscordTrack | null;
    phase: 'idle' | 'paused' | 'playing' | 'loading';
    controllable: boolean;
    position: number;
    duration: number;
    queue: DiscordTrack[];
}

export type DiscordResult =
    | { ok: false; error: string }
    | { ok: true; playback?: DiscordPlayback; track?: DiscordTrack; lyrics?: string };

export function readDiscordRequest(input: unknown, now = Date.now()): DiscordRequest | null {
    if (!input || typeof input !== 'object') return null;
    const request = input as DiscordRequest;
    if (request.protocol !== DISCORD_PROTOCOL || typeof request.requestId !== 'string' ||
        !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(request.requestId) ||
        !Number.isFinite(request.expiresAt) || request.expiresAt <= now ||
        request.expiresAt > now + DISCORD_REQUEST_LIFETIME + 5000) return null;

    switch (request.action) {
        case 'status': case 'skip': case 'previous': case 'pause': case 'unpause':
            return request;
        case 'lyrics':
            if (request.query === undefined) return request;
            return validQuery(request.query) ? request : null;
        case 'play': case 'playnext': case 'enqueue':
            return validQuery(request.query) ? request : null;
        case 'seek':
            return validNumber(request.value, 86_400) ? request : null;
        case 'volume':
            return validNumber(request.value, 100) ? request : null;
        default:
            return null;
    }
}

function validQuery(query: unknown): query is string {
    return typeof query === 'string' && query.length <= DISCORD_QUERY_LIMIT && !!query.trim();
}

function validNumber(value: number, max: number): boolean {
    return Number.isFinite(value) && value >= 0 && value <= max;
}

export class DiscordRequests {
    private seen = new Map<string, number>();

    accept(peer: string, input: unknown, now = Date.now()): DiscordRequest | null {
        const request = readDiscordRequest(input, now);
        if (!request) return null;
        for (const [key, expiresAt] of this.seen) {
            if (expiresAt <= now) this.seen.delete(key);
        }
        // Wayship can deliver the same signal over its WebSocket and HTTP poll.
        const key = `${peer}/${request.requestId}`;
        if (this.seen.size >= 256 || this.seen.has(key)) return null;
        this.seen.set(key, request.expiresAt);
        return request;
    }
}
