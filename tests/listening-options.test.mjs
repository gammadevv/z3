import assert from 'node:assert/strict';
import { test } from 'node:test';
import { anniversaryWindow, matchesListeningFilter } from '../src/lib/listening-history.ts';
import { parseZetaTrackLink, zetaTrackLink } from '../src/lib/track-links.ts';
import { WeakConnection } from '../src/lib/weak-connection.ts';

test('track links accept provider IDs and reject auth URLs, local paths, and invalid IDs', () => {
    for (const id of ['yt:dQw4w9WgXcQ', 'js:dq42-sAz']) {
        assert.equal(parseZetaTrackLink(zetaTrackLink(id)), id);
    }
    assert.equal(zetaTrackLink('local:music.flac'), null);
    for (const url of [
        'zeta://wayship/callback',
        'zeta://track/local%3Amusic.flac',
        'zeta://track/js%3A..%2Fprivate',
        'zeta://other@track/yt%3AdQw4w9WgXcQ',
        'zeta://track/yt%3AdQw4w9WgXcQ%0A',
        'zeta://track/yt%3AdQw4w9WgXcQ?device=desktop',
        'zeta://track/yt%ZZ',
    ]) assert.equal(parseZetaTrackLink(url), null, url);
});

test('weak connection mode adapts after two slow loads and clears after the cooldown', () => {
    const connection = new WeakConnection();
    connection.observe(1200, 1200);
    connection.observe(6000, 8000);
    assert.equal(connection.quality('best', 8000), 'best');
    connection.observe(5200, 30_000);
    assert.equal(connection.quality('high', 30_000), 'low');
    assert.equal(connection.quality('skype-2008', 31_000), 'skype-2008');
    assert.equal(connection.quality('high', 150_000), 'high');
    connection.observe(8000, 155_000);
    assert.equal(connection.quality('best', 155_000), 'best');
    connection.observe(6000, 170_000);
    connection.reset();
    assert.equal(connection.quality('best', 171_000), 'best');
});

test('anniversary listening uses last year’s local calendar day, including leap day', () => {
    const day = anniversaryWindow(new Date(2028, 1, 29, 16));
    assert.equal(day.from, new Date(2027, 1, 28).getTime());
    assert.equal(day.until, new Date(2027, 2, 1).getTime());
    const song = { title: 'A song', artists: [] };
    assert.equal(matchesListeningFilter({ timestamp: day.from - 1 }, song, day), false);
    assert.equal(matchesListeningFilter({ timestamp: day.from }, song, day), true);
    assert.equal(matchesListeningFilter({ timestamp: day.until }, song, day), false);
});
