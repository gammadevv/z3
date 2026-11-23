import { client } from '$lib/ephaptic';
import type { Song } from '$lib/schema';
import { buildLyricLines, slimSong } from '$lib/utils';
import type { DiscordCommand, DiscordPlayback, DiscordResult, DiscordTrack } from '$lib/wayship-discord';
import { libraryState } from './library.svelte';
import { peers } from './peers.svelte';
import {
    addToQueue, getUpcomingTracks, isNextTrackAvailable, nextTrack, playerState,
    playNext, playTrack, previousTrack, seek, setVolume,
} from './player.svelte';

function controllable() {
    return !peers.links.some((link) => link.connected && !link.host &&
        (link.mode === 'remote' || (link.mode === 'party' && peers.following)));
}

function trackSummary(song: Song): DiscordTrack {
    return {
        title: song.title.slice(0, 200),
        artist: song.artists.map(({ name }) => name).join(', ').slice(0, 150),
    };
}

function playback(): DiscordPlayback {
    const { currentTrack, currentTime, duration, isLoading, paused } = playerState;
    return {
        track: currentTrack ? trackSummary(currentTrack) : null,
        phase: !currentTrack ? 'idle' : isLoading ? 'loading' : paused ? 'paused' : 'playing',
        controllable: controllable(),
        position: Number.isFinite(currentTime) ? currentTime : 0,
        duration: Number.isFinite(duration) ? duration : 0,
        queue: getUpcomingTracks(5).map(trackSummary),
    };
}

async function searchTrack(query: string): Promise<Song | undefined> {
    const found = (await client.musicSearch(query.trim(), 'yt'))[0];
    return found && (libraryState.findLocalTrack(found) ?? found);
}

export async function runDiscordCommand(command: DiscordCommand, isCurrent: () => boolean): Promise<DiscordResult> {
    if (command.action === 'status') return { ok: true, playback: playback() };
    if (command.action === 'lyrics') {
        const song = command.query ? await searchTrack(command.query) : playerState.currentTrack;
        if (!song) return { ok: false, error: 'No track found. Try providing a song title and artist.' };
        const lyrics = (playerState.currentTrack?.id === song.id && playerState.lyrics) || song.lyrics
            || await client.musicLyrics(slimSong($state.snapshot(song) as Song));
        const lines = buildLyricLines(lyrics, song.duration).map(({ text }) => text).join('\n').slice(0, 12_000);
        if (!lines) return { ok: false, error: 'Zeta could not find lyrics for this track.' };
        return { ok: true, track: trackSummary(song), lyrics: lines };
    }

    if (!controllable()) return { ok: false, error: 'This device is following another player. Choose the playback host.' };
    if (command.action === 'play' || command.action === 'playnext' || command.action === 'enqueue') {
        const song = await searchTrack(command.query);
        if (!song) return { ok: false, error: 'No matching track found. Try the song title and artist.' };
        // Search can finish after the request expired, the account changed, or
        // the device started following another player.
        if (!isCurrent() || !controllable()) return { ok: false, error: 'The player changed while searching. Try again.' };
        if (command.action === 'play') playTrack(song);
        else {
            if (playerState.upNext.length >= 100) return { ok: false, error: 'The player queue is full.' };
            if (command.action === 'playnext') playNext(song);
            else addToQueue(song);
        }
        return { ok: true, track: trackSummary(song) };
    }

    if (command.action === 'volume') {
        setVolume(command.value / 100);
        return { ok: true };
    }
    if (!playerState.currentTrack) return { ok: false, error: 'No track is loaded on this device.' };
    switch (command.action) {
        case 'pause': case 'unpause':
            if (playerState.isLoading) return { ok: false, error: 'Zeta is still loading the track. Try again in a moment.' };
            playerState.paused = command.action === 'pause';
            break;
        case 'seek':
            if (playerState.isLoading) return { ok: false, error: 'Zeta is still loading the track. Try again in a moment.' };
            seek(command.value);
            break;
        case 'skip':
            if (!isNextTrackAvailable()) return { ok: false, error: 'There is no next track in Zeta.' };
            nextTrack();
            break;
        case 'previous':
            previousTrack();
            break;
    }
    return { ok: true };
}
