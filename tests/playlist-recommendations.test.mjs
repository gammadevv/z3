import test from 'node:test';
import assert from 'node:assert/strict';
import {
    filterPlaylistRecommendations, filterRecommendationsByArtist, matchRadioSeed, rankRadioTracks,
    offlineRadioTracks, rankRecommendationLists, recommendationExplanation, selectPlaylistSeeds,
} from '../src/lib/playlist-recommendations.ts';

function song(id, title, artists) {
    return {
        id,
        title,
        artists: artists.map((name) => ({ name, thumbnails: [] })),
        album: null,
        thumbnails: [],
        duration: 180,
        isDownloaded: false,
    };
}

test('excludes a playlist song returned with a different provider ID', () => {
    const playlist = [song('yt:one', 'Moonlight', ['XXXTENTACION'])];
    const recommendations = [
        song('yt:other-upload', 'Moonlight', ['XXXTENTACION']),
        song('yt:two', 'Changes', ['XXXTENTACION']),
    ];

    assert.deepEqual(filterPlaylistRecommendations(recommendations, playlist).map((track) => track.id), ['yt:two']);
});

test('matches case, punctuation, accents, and featured artist variations', () => {
    const playlist = [song('js:one', 'Café (feat. Guest)', ['Artist One'])];
    const recommendations = [
        song('yt:duplicate', 'Cafe', ['Artist-One, Guest']),
        song('yt:different-artist', 'Cafe', ['Another Artist']),
    ];

    assert.deepEqual(
        filterPlaylistRecommendations(recommendations, playlist).map((track) => track.id),
        ['yt:different-artist'],
    );
});

test('removes duplicate recommendations and honors the result limit', () => {
    const recommendations = [
        song('yt:a', 'One', ['Artist']),
        song('js:a', 'One', ['Artist']),
        song('yt:b', 'Two', ['Artist']),
    ];

    assert.deepEqual(filterPlaylistRecommendations(recommendations, [], 1).map((track) => track.id), ['yt:a']);
});

test('keeps recommendations to one song per credited artist', () => {
    const recommendations = [
        song('yt:a', 'One', ['Artist One']),
        song('yt:b', 'Two', ['Artist One']),
        song('yt:c', 'Three', ['Artist Two feat. Artist One']),
        song('yt:d', 'Four', ['Artist Two']),
        song('yt:e', 'Five', ['Artist Three']),
    ];

    assert.deepEqual(filterRecommendationsByArtist(recommendations).map((track) => track.id), ['yt:a', 'yt:d', 'yt:e']);
});

test('focused radio keeps supported tracks and drops an unrelated song from up next', () => {
    const seed = song('yt:seed', 'BAND4BAND', ['Central Cee', 'Lil Baby']);
    const outlier = song('yt:coldplay', 'Hymn for the Weekend', ['Coldplay']);
    const doja = song('yt:doja', 'Central Cee - Doja (Official Music Video)', ['Central Cee']);
    const sprinter = song('yt:sprinter', 'Sprinter', ['Dave', 'Central Cee']);
    const guest = song('yt:guest', 'Thiago Silva', ['Dave', 'AJ Tracey']);
    const alternateDoja = song('js:doja', 'Doja', ['Central Cee']);
    const seedCopy = song('yt:seed-copy', 'BAND4BAND (Official Video)', ['Central Cee']);
    const artists = [{ name: 'Dave', thumbnails: [] }];
    const upNext = [sprinter, doja, outlier, guest];
    const related = [alternateDoja, seedCopy];

    assert.deepEqual(rankRadioTracks(seed, upNext, related, artists, []).map(track => track.id), ['js:doja', 'yt:sprinter', 'yt:guest']);
    assert.deepEqual(rankRadioTracks(seed, upNext, related, artists, ['js:doja', 'yt:sprinter', 'yt:guest']), []);
});

test('focused radio without related data uses a bounded part of the original queue', () => {
    const seed = song('yt:seed', 'Seed', ['Main artist']);
    const queue = Array.from({ length: 12 }, (_, index) => song(`yt:${index}`, `Track ${index}`, [`Artist ${index}`]));
    const sameArtist = song('yt:extra', 'Another track', ['Main artist']);
    const ranked = rankRadioTracks(seed, [...queue, sameArtist], [], [], ['yt:1']);
    assert.deepEqual(ranked.map(track => track.id), ['yt:extra', 'yt:0', 'yt:2', 'yt:3', 'yt:4', 'yt:5', 'yt:6', 'yt:7']);
});

test('a local radio seed matches a recording by title, artist, and plausible duration', () => {
    const seed = song('local:band4band.m4a', 'BAND4BAND', ['Central Cee']);
    const unrelated = song('yt:unrelated', 'Hymn for the Weekend', ['Coldplay']);
    const compilation = { ...seed, id: 'yt:compilation', duration: 900 };
    const verified = song('yt:official', 'Central Cee - BAND4BAND (Official Video)', ['Central Cee', 'Lil Baby']);
    assert.equal(matchRadioSeed(seed, [unrelated, compilation, verified]), verified);
    assert.equal(matchRadioSeed(seed, [unrelated, compilation]), undefined);
});

test('playlist suggestions use its most common artists and favor results that occur across seeds', () => {
    const tracks = [song('yt:1', 'First track', ['Rare']), song('yt:2', 'Second track', ['Often']), song('yt:3', 'Third track', ['Often'])];
    assert.deepEqual(selectPlaylistSeeds(tracks, 2).map((track) => track.id), ['yt:2', 'yt:1']);
    const rare = song('yt:rare', 'One source pick', ['Rare suggestion']);
    const match = song('yt:match', 'Confirmed pick', ['Related artist']);
    const sameMatch = { ...match, id: 'js:match' };
    const ranked = rankRecommendationLists([[rare, rare, match], [sameMatch]]);
    assert.deepEqual(ranked.map(({ id }) => id), [match.id, rare.id]);
    assert.match(recommendationExplanation(ranked[0]), /several songs/);
});

test('offline radio ranks local matches and excludes streaming tracks', () => {
    const seed = song('yt:seed', 'Seed', ['Central Cee']);
    const sameArtist = { ...song('yt:offline', 'Offline match', ['Central Cee']), isDownloaded: true };
    const other = { ...song('local:other.m4a', 'Mix track', ['Another artist']), isDownloaded: true };
    const online = song('yt:online', 'Online match', ['Central Cee']);
    const tracks = offlineRadioTracks(seed, [other, online, sameArtist], []);
    assert.deepEqual(tracks.map(({ id }) => id), [sameArtist.id, other.id]);
    assert.match(recommendationExplanation(tracks[0]), /shares an artist/);
});
