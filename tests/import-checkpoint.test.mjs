import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { captureImportFiles, importCheckpointTime, saveImportCheckpoint, undoImportCheckpoint } from '../electron/lib/import-checkpoint.ts';

test('a desktop import checkpoint restores the prior library and protects later edits', async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'zeta-import-checkpoint-'));
    process.env.ZETA_CONFIG_DIR = directory;
    t.after(() => rm(directory, { recursive: true, force: true }));
    const audio = 'Restored music/Test track [0f908f9f-8c04-4dbf-85f5-1478ecb3b66d].m4a';
    const playlist = 'favourites.m3u8';
    const files = new Map([[playlist, Buffer.from('favourites before')], ['.zeta/index.json', Buffer.from('legacy')]]);
    const writes = [];
    const vfs = {
        root: '/testing/zeta',
        readdir: async () => [...files.keys()].filter((path) => !path.includes('/')).map((name) => ({ isFile: true, name })),
        readFile: async (path) => Buffer.from(files.get(path)),
        exists: async (path) => files.has(path),
        mkdir: async () => {},
        writeFile: async (path, value) => { writes.push(path); files.set(path, Buffer.from(value)); },
        unlink: async (path) => { files.delete(path); },
        rename: async (from, to) => { files.set(to, files.get(from)); files.delete(from); },
    };

    const before = await captureImportFiles(vfs);
    files.set(playlist, Buffer.from('favourites after'));
    files.set('imported.m3u8', Buffer.from('imported playlist'));
    files.set('.zeta/index.msgpack', Buffer.from('updated index'));
    files.delete('.zeta/index.json');
    files.set(audio, Buffer.from('copied audio'));
    await saveImportCheckpoint(vfs, before, [audio]);
    assert.ok(await importCheckpointTime(vfs));
    assert.equal(await importCheckpointTime({ ...vfs, root: '/testing/other' }), null);

    files.set(playlist, Buffer.from('favourites edited after import'));
    await assert.rejects(undoImportCheckpoint(vfs), /library changed/i);
    assert.deepEqual(writes, []);
    assert.equal(files.get(playlist).toString(), 'favourites edited after import');
    assert.ok(files.has(audio));

    files.set(playlist, Buffer.from('favourites after'));
    assert.equal(await undoImportCheckpoint(vfs), true);
    assert.equal(files.get(playlist).toString(), 'favourites before');
    assert.equal(files.get('.zeta/index.json').toString(), 'legacy');
    assert.ok(!files.has('imported.m3u8') && !files.has('.zeta/index.msgpack') && !files.has(audio));
    assert.equal(files.get('.zeta/undone-import/' + audio.split('/').at(-1)).toString(), 'copied audio');
    assert.equal(await importCheckpointTime(vfs), null);
    assert.equal(await undoImportCheckpoint(vfs), false);
});
