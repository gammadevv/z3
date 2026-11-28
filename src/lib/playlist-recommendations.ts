import { splitArtistCredits } from './music-metadata.ts';
import type { Artist, Playlist, Song } from './schema';

function normalize(value: string): string {
    return value
        .normalize('NFKD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
        .replace(/[^\p{L}\p{N}]+/gu, '');
}

function artistKeys(artists: Artist[]): Set<string> {
    const keys = new Set<string>();
    for (const artist of splitArtistCredits(artists)) {
        const name = normalize(artist.name.replace(/\s*-\s*Topic$/i, ''));
        if (name && name !== 'unknownartist' && name !== 'unknown') keys.add(name);
        if (artist.id) keys.add(artist.id);
    }
    return keys;
}

function identifySong(song: Song) {
    const artists = artistKeys(song.artists);
    const parts = song.title.split(/\s+[-–—]\s+/);
    if (parts.length > 1 && artists.has(normalize(parts[0]))) parts.shift();
    return { id: song.id, title: normalize(parts.join(' ')), artists };
}

type SongIdentity = ReturnType<typeof identifySong>;

function isSameSong(left: SongIdentity, right: SongIdentity): boolean {
    if (left.id === right.id) return true;
    return !!left.title && left.title === right.title && [...left.artists].some((artist) => right.artists.has(artist));
}

export function matchRadioSeed(seed: Song, candidates: Song[]): Song | undefined {
    const original = identifySong(seed);
    return candidates.find((candidate) => isSameSong(original, identifySong(candidate)) && (
        !seed.duration || !candidate.duration || Math.abs(seed.duration - candidate.duration) <= Math.max(15, seed.duration * .12)
    ));
}

export function filterPlaylistRecommendations(
    recommendations: Song[],
    playlistTracks: Song[],
    limit = 8,
): Song[] {
    if (limit <= 0) return [];
    const known = playlistTracks.map(identifySong);
    const filtered: Song[] = [];

    for (const recommendation of recommendations) {
        const identity = identifySong(recommendation);
        if (known.some((track) => isSameSong(identity, track))) continue;
        filtered.push(recommendation);
        known.push(identity);
        if (filtered.length >= limit) break;
    }

    return filtered;
}

export function filterRecommendationsByArtist(recommendations: Song[], limit = 8): Song[] {
    const seen = new Set<string>();
    const filtered: Song[] = [];

    for (const recommendation of recommendations) {
        const artists = artistKeys(recommendation.artists);
        if ([...artists].some((artist) => seen.has(artist))) continue;
        artists.forEach((artist) => seen.add(artist));
        filtered.push(recommendation);
        if (filtered.length >= limit) break;
    }

    return filtered;
}

// A song confirmed by multiple seed tracks should outrank a one-off suggestion.
export function rankRecommendationLists(lists: Song[][]): Song[] {
    const ranked: { track: Song; identity: SongIdentity; score: number; lastList: number; sources: number }[] = [];
    for (const [listIndex, list] of lists.entries()) {
        for (const [index, track] of list.entries()) {
            const identity = identifySong(track);
            const entry = ranked.find((item) => isSameSong(item.identity, identity));
            if (entry?.lastList === listIndex) continue;
            const score = 1 / (5 + index);
            if (entry) {
                entry.score += score;
                entry.lastList = listIndex;
                entry.sources++;
            } else ranked.push({ track, identity, score, lastList: listIndex, sources: 1 });
        }
    }
    return ranked.sort((a, b) => b.score - a.score).map(({ track, sources }) => ({
        ...track, recommendation: sources > 1 ? 'multiple-seeds' : track.recommendation ?? 'up-next',
    }));
}

export function selectPlaylistSeeds(tracks: Song[], limit = 3): Song[] {
    const groups = new Map<string, { seed: Song; count: number }>();
    for (const track of tracks) {
        const artist = artistKeys(track.artists).values().next().value ?? track.id;
        const group = groups.get(artist);
        if (group) group.count++;
        else groups.set(artist, { seed: track, count: 1 });
    }
    return [...groups.values()].sort((a, b) => b.count - a.count).slice(0, limit).map(({ seed }) => seed);
}

export function rankRadioTracks(
    seed: Song, upNext: Song[], related: Song[], similarArtists: Artist[], exclude: string[],
): Song[] {
    const omitted = new Set(exclude);
    const seedArtists = artistKeys(seed.artists);
    const neighbours = artistKeys(similarArtists);
    const hasRelatedData = related.length > 0 || neighbours.size > 0;
    const nextIdentities = upNext.map(identifySong);
    const relatedIdentities = related.map(identifySong);
    const pool = filterPlaylistRecommendations([...related, ...upNext], [seed], related.length + upNext.length);
    const ranked = pool.flatMap((track) => {
        if (omitted.has(track.id)) return [];
        const identity = identifySong(track);
        const nextIndex = nextIdentities.findIndex((candidate) => isSameSong(identity, candidate));
        const relatedIndex = relatedIdentities.findIndex((candidate) => isSameSong(identity, candidate));
        const keys = [...identity.artists];
        const sameArtist = keys.some((key) => seedArtists.has(key));
        const similarArtist = keys.some((key) => neighbours.has(key));
        const knownArtist = sameArtist || similarArtist;
        const inBoth = nextIndex >= 0 && relatedIndex >= 0;
        const nearby = hasRelatedData ? relatedIndex >= 0 && relatedIndex < 8 : nextIndex >= 0 && nextIndex < 8;
        if (!knownArtist && !inBoth && !nearby) return [];
        const strength = Number(inBoth) * 2 + Number(knownArtist);
        const position = Math.min(nextIndex < 0 ? Infinity : nextIndex, relatedIndex < 0 ? Infinity : relatedIndex);
        const recommendation: Song['recommendation'] = inBoth ? 'confirmed' : sameArtist ? 'same-artist'
            : similarArtist ? 'similar-artist' : relatedIndex >= 0 ? 'related' : 'up-next';
        return [{ track: { ...track, recommendation }, strength, position }];
    });
    ranked.sort((a, b) => b.strength - a.strength || a.position - b.position);
    // Vary the artists only among candidates with the same recommendation evidence.
    return [3, 2, 1, 0].flatMap((strength) => {
        const group = ranked.filter((item) => item.strength === strength).map(({ track }) => track);
        const varied = filterRecommendationsByArtist(group, group.length);
        const included = new Set(varied.map(({ id }) => id));
        return [...varied, ...group.filter(({ id }) => !included.has(id))];
    });
}

const reasons: Record<NonNullable<Song['recommendation']>, string> = {
    confirmed: 'It appeared in both Up next and the related songs for the radio seed.',
    'same-artist': 'It shares an artist with the song that started the radio.',
    'similar-artist': 'Its artist is listed as similar for the song that started the radio.',
    related: 'The provider recommends it alongside the song that started the radio.',
    'up-next': 'The provider returned it near the top of the seed song’s Up next list.',
    'multiple-seeds': 'It appeared in recommendations for several songs that started this mix.',
    'offline-album': 'It comes from the same album and is available offline.',
    'offline-artist': 'It shares an artist with the starting song and is available offline.',
    'offline-playlist': 'You saved it in a playlist with the starting song, and it is available offline.',
    'offline-library': 'It is part of this mix from music available offline.',
};

export function recommendationExplanation(track: Song) {
    return track.recommendation ? reasons[track.recommendation] : undefined;
}

export function offlineRadioTracks(seed: Song | undefined, downloaded: Song[], playlists: Playlist[]): Song[] {
    const available = downloaded.filter(({ isDownloaded }) => isDownloaded);
    const original = seed && (available.find(({ id }) => id === seed.id) ?? matchRadioSeed(seed, available));
    const artists = seed ? artistKeys(seed.artists) : new Set<string>();
    const album = seed?.album?.title && normalize(seed.album.title);
    const withSeed = new Set(playlists.filter(({ tracks, isProtected }) =>
        !isProtected && tracks.some(({ id }) => id === seed?.id || id === original?.id),
    ).flatMap(({ tracks }) => tracks.map(({ id }) => id)));
    const ranked = available.map((track) => {
        const sameArtist = [...artistKeys(track.artists)].some((artist) => artists.has(artist));
        const sameAlbum = !!album && sameArtist && track.album && normalize(track.album.title) === album;
        const recommendation: Song['recommendation'] = sameAlbum ? 'offline-album' : sameArtist ? 'offline-artist'
            : withSeed.has(track.id) ? 'offline-playlist' : 'offline-library';
        const rank = sameAlbum ? 3 : sameArtist ? 2 : withSeed.has(track.id) ? 1 : 0;
        return { track: { ...track, recommendation }, rank };
    });
    ranked.sort((a, b) => b.rank - a.rank);
    const known = [...(seed ? [seed] : []), ...(original ? [original] : [])];
    const tracks = filterPlaylistRecommendations(ranked.map(({ track }) => track), known, original ? 49 : 50);
    return original ? [original, ...tracks] : tracks;
}
