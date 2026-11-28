import { decode, encode } from '@msgpack/msgpack';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { VFS } from './vfs';

const INDEXES = ['.zeta/index.msgpack', '.zeta/index.json', '.zeta/stats.msgpack'];
type LibraryFiles = Map<string, Buffer>;
interface Checkpoint {
    root: string;
    time: number;
    changes: Array<{ path: string; before: Uint8Array | null; after: string | null }>;
    audio: string[];
}

const digest = (bytes: Buffer | Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const playlist = (name: string) => /^[^.\\/\0][^\\/\0]*\.m3u8$/.test(name);
const importedAudio = (name: string) => /^Restored music\/[^\\/\0]+ \[[\da-f-]{36}\]\.[a-z0-9]+$/i.test(name);

function checkpointPath() {
    const directory = process.env.ZETA_CONFIG_DIR;
    if (!directory) throw new Error('Application settings are unavailable.');
    return join(directory, 'last-zeta-import.msgpack');
}

export async function captureImportFiles(vfs: VFS): Promise<LibraryFiles> {
    const paths = [...INDEXES, ...(await vfs.readdir('')).filter(({ isFile, name }) => isFile && playlist(name)).map(({ name }) => name)];
    const files: LibraryFiles = new Map();
    for (const path of paths) if (await vfs.exists(path)) files.set(path, await vfs.readFile(path));
    return files;
}

export async function saveImportCheckpoint(vfs: VFS, before: LibraryFiles, audio: string[]) {
    const after = await captureImportFiles(vfs);
    const changes: Checkpoint['changes'] = [];
    for (const path of new Set([...before.keys(), ...after.keys()])) {
        const old = before.get(path) ?? null;
        const next = after.get(path) ?? null;
        if (old === next || (old && next && old.equals(next))) continue;
        changes.push({ path, before: old, after: next && digest(next) });
    }
    if (!changes.length && !audio.length) return;
    const destination = checkpointPath();
    const temp = `${destination}.${randomUUID()}.tmp`;
    await mkdir(process.env.ZETA_CONFIG_DIR!, { recursive: true });
    try {
        const data: Checkpoint = { root: digest(vfs.root), time: Date.now(), changes, audio };
        await writeFile(temp, encode(data), { mode: 0o600, flag: 'wx' });
        await rename(temp, destination);
    } finally {
        await unlink(temp).catch(() => {});
    }
}

async function readCheckpoint(vfs: VFS): Promise<Checkpoint | null> {
    let bytes: Buffer;
    try { bytes = await readFile(checkpointPath()); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    const data = decode(bytes) as Checkpoint;
    if (data.root !== digest(vfs.root)) return null;
    if (!Number.isFinite(data.time) || !Array.isArray(data.changes) || !Array.isArray(data.audio) ||
        data.changes.some(({ path, before }) => (!INDEXES.includes(path) && !playlist(path)) ||
            (before !== null && !(before instanceof Uint8Array))) || data.audio.some((name) => !importedAudio(name))) {
        throw new Error('The import checkpoint is invalid.');
    }
    return data;
}

export async function importCheckpointTime(vfs: VFS) {
    return (await readCheckpoint(vfs))?.time ?? null;
}

export async function undoImportCheckpoint(vfs: VFS) {
    const data = await readCheckpoint(vfs);
    if (!data) return false;
    const pending = [];
    for (const change of data.changes) {
        const current = await vfs.exists(change.path) ? digest(await vfs.readFile(change.path)) : null;
        if (current === (change.before && digest(change.before))) continue; // Allow retry after a partial restore.
        if (current !== change.after) throw new Error('The library changed after the import. Undo would overwrite those changes.');
        pending.push(change);
    }
    // Keep the copies brought over by the import in recovery storage. The
    // desktop scanner ignores .zeta, so it will not add them back as local tracks.
    if (data.audio.length) await vfs.mkdir('.zeta/undone-import');
    for (const path of data.audio) {
        if (await vfs.exists(path)) await vfs.rename(path, `.zeta/undone-import/${path.split('/').at(-1)}`);
    }
    for (const { path, before } of pending) {
        if (!before) await vfs.unlink(path);
        else {
            const temp = `${path}.${randomUUID()}.tmp`;
            try {
                await vfs.writeFile(temp, Buffer.from(before));
                await vfs.rename(temp, path);
            } finally {
                await vfs.unlink(temp).catch(() => {});
            }
        }
    }
    await unlink(checkpointPath());
    return true;
}
