import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchYoutubePlaylist, youtubePlaylistId } from '../src/lib/youtube-playlist-import.ts';

const playlistId = 'PLQxo8OvVvJ1WI_Bp67F2wdIl_R2Rc_1-u';
const url = `https://www.youtube.com/playlist?list=${playlistId}`;
const empty = { items: [], info: { title: 'Example' }, has_continuation: false };

test('imports YouTube Music playlist tracks when the standard playlist is empty', async () => {
    const music = {
        header: { title: 'In Tongues' },
        contents: [
            { item_type: 'song', id: 'tCGHE2E4NDg', title: 'Will He', artists: [{ name: 'Joji' }] },
            { type: 'ContinuationItem' },
        ],
        has_continuation: true,
        async getContinuation() {
            return { contents: [{ id: '4KW7irpWYhw', title: 'Pills', artists: [{ name: 'Joji' }] }], has_continuation: false };
        },
    };
    const result = await fetchYoutubePlaylist(url, new Set(['yt:tCGHE2E4NDg']), async () => empty, async (id) => {
        assert.equal(id, playlistId);
        return music;
    });
    assert.equal(result.name, 'In Tongues');
    assert.deepEqual(result.songs.map(({ title, isDownloaded }) => [title, isDownloaded]), [['Will He', true], ['Pills', false]]);
    assert.equal(result.skipped, 0);
});

test('decodes modern playlist cards and skips unavailable videos', async () => {
    const page = { ...empty, items: [
        { content_type: 'VIDEO', content_id: 'tCGHE2E4NDg', metadata: { title: 'Will He' }, duration: { seconds: 201 } },
        { id: '4KW7irpWYhw', title: '[Private video]', is_playable: false },
    ] };
    const result = await fetchYoutubePlaylist(url, new Set(), async () => page, async () => { throw new Error('Not needed'); });
    assert.deepEqual(result.songs.map(({ id, duration }) => [id, duration]), [['yt:tCGHE2E4NDg', 201]]);
    assert.equal(result.skipped, 1);
    assert.throws(() => youtubePlaylistId('https://youtube.com.example.com/playlist?list=' + playlistId), /Only YouTube/);
});
