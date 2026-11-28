import { musicText } from './music-metadata.ts';
import { ytToSong } from './music-catalog.ts';
import type { Song } from './schema';

interface PlaylistPage {
    items?: any[];
    contents?: any[];
    info?: { title?: string; total_items?: string };
    header?: { title?: { toString(): string }; header?: unknown } | null;
    has_continuation?: boolean;
    getContinuation(): Promise<PlaylistPage>;
}

const MAX_TRACKS = 500;
const MAX_PAGES = 25;

export function youtubePlaylistId(value: string): string {
    let url: URL;
    try { url = new URL(value.trim()); }
    catch { throw new Error('Enter a valid YouTube playlist link.'); }
    if (!['https:', 'http:'].includes(url.protocol) ||
        !['youtube.com', 'www.youtube.com', 'music.youtube.com', 'm.youtube.com', 'youtu.be'].includes(url.hostname)) {
        throw new Error('Only YouTube and YouTube Music playlist links are supported.');
    }
    const id = url.searchParams.get('list');
    if (!id || !/^[\w-]{10,120}$/.test(id)) throw new Error('The YouTube link is missing a valid playlist ID.');
    return id;
}

function playlistTrack(item: any, downloaded: Set<string>): Song | null {
    if (item?.is_playable === false || item?.is_upcoming || item?.is_live) return null;
    const watch = item?.renderer_context?.command_context?.on_tap ?? item?.on_tap_endpoint;
    const id = [item?.id, item?.endpoint?.payload?.videoId, watch?.payload?.videoId,
        item?.content_type === 'VIDEO' ? item.content_id : undefined].find((value) =>
            typeof value === 'string' && /^[\w-]{11}$/.test(value),
        );
    if (!id) return null;
    const title = item.title?.toString?.() ?? item.metadata?.title?.toString?.() ?? item.overlay_metadata?.primary_text?.toString?.();
    if (!title || /^\[?(?:private|deleted|unavailable) video\]?$/i.test(title.trim())) return null;
    const byline = item.metadata?.metadata?.metadata_rows?.[0]?.metadata_parts?.[0]?.text?.toString?.();
    return ytToSong({
        ...item, id, title, duration: item.duration,
        thumbnails: item.thumbnails ?? item.thumbnail ?? item.content_image?.image,
    }, downloaded, { artists: byline ? [{ name: musicText(byline), thumbnails: [] }] : [] });
}

async function readPlaylist(first: PlaylistPage, downloaded: Set<string>) {
    const songs: Song[] = [];
    const seen = new Set<string>();
    let processed = 0;
    let skipped = 0;
    let page = first;
    for (let count = 0; count < MAX_PAGES; count++) {
        for (const item of page.items ?? page.contents ?? []) {
            if (processed === MAX_TRACKS) break;
            if (/^ContinuationItem/.test(item?.type ?? '')) continue;
            processed++;
            const track = playlistTrack(item, downloaded);
            if (track && !seen.has(track.id)) {
                seen.add(track.id);
                songs.push(track);
            } else skipped++;
        }
        if (processed === MAX_TRACKS || !page.has_continuation || count + 1 === MAX_PAGES) break;
        page = await page.getContinuation();
    }
    const total = Number.parseInt(first.info?.total_items?.replace(/,/g, '') ?? '', 10);
    if (Number.isFinite(total)) skipped += Math.max(0, total - processed);
    const nestedHeader = first.header?.header as { title?: { toString(): string } } | null | undefined;
    const name = musicText(first.info?.title ?? first.header?.title?.toString() ?? nestedHeader?.title?.toString() ?? '').trim() || 'YouTube playlist';
    return { name, songs, skipped };
}

export async function fetchYoutubePlaylist(
    url: string, downloaded: Set<string>, youtube: (id: string) => Promise<PlaylistPage>, music: (id: string) => Promise<PlaylistPage>,
) {
    const id = youtubePlaylistId(url);
    let availableResponse = false;
    for (const fetchPlaylist of [youtube, music]) {
        const result = await fetchPlaylist(id).then((page) => readPlaylist(page, downloaded)).catch(() => null);
        if (result?.songs.length) return result;
        if (result) availableResponse = true;
    }
    throw new Error(availableResponse
        ? 'This playlist has no available videos. Check that its tracks can be opened on YouTube.'
        : 'Could not load this YouTube playlist. Check your connection and use a public or unlisted playlist link.');
}
