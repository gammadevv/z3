import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const RELEASE_API = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest';
const RELEASE_DOWNLOAD = 'https://github.com/yt-dlp/yt-dlp/releases/download';
const VERSION = /^\d{4}\.\d{2}\.\d{2}$/;
const CHECK_INTERVAL = 24 * 60 * 60_000;
const RETRY_INTERVAL = 15 * 60_000;
const MAX_BINARY_BYTES = 80 * 1024 * 1024;

const assets: Partial<Record<string, string>> = {
    'linux-x64': 'yt-dlp_linux',
    'linux-arm64': 'yt-dlp_linux_aarch64',
    'darwin-x64': 'yt-dlp_macos',
    'darwin-arm64': 'yt-dlp_macos',
    'win32-x64': 'yt-dlp.exe',
    'win32-arm64': 'yt-dlp_arm64.exe',
    'win32-ia32': 'yt-dlp_x86.exe',
};

export const ytDlpCommand = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';

let installed: string | undefined;
let nextCheck = 0;
let refresh: Promise<void> | undefined;

async function installLatest(directory: string, assetName: string): Promise<void> {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const versions = (await readdir(directory)).filter((entry) => VERSION.test(entry)).sort().reverse();
    let currentVersion: string | undefined;
    for (const version of versions) {
        const file = join(directory, version, ytDlpCommand);
        if ((await stat(file).catch(() => null))?.isFile()) {
            installed = file;
            currentVersion = version;
            break;
        }
    }

    const metadata = await fetch(RELEASE_API, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(12_000),
    });
    if (!metadata.ok) throw new Error('Could not check the latest yt-dlp release.');
    const release = await metadata.json() as {
        tag_name: string;
        assets: Array<{ name: string; size: number; digest: string | null }>;
    };
    const version = release.tag_name;
    if (!VERSION.test(version)) throw new Error('Unrecognised yt-dlp release version.');
    if (currentVersion && currentVersion >= version) return;

    const asset = release.assets.find(({ name }) => name === assetName);
    if (!asset || !asset.digest || !/^sha256:[a-f0-9]{64}$/.test(asset.digest)
        || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > MAX_BINARY_BYTES) {
        throw new Error('The latest yt-dlp release has no verified binary for this device.');
    }

    const response = await fetch(`${RELEASE_DOWNLOAD}/${version}/${assetName}`, {
        signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok || Number(response.headers.get('content-length')) !== asset.size) {
        throw new Error('Could not download the expected yt-dlp binary.');
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const digest = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== asset.size || digest !== asset.digest) throw new Error('yt-dlp download failed verification.');

    const staging = await mkdtemp(join(directory, '.install-'));
    const destination = join(directory, version);
    try {
        await writeFile(join(staging, ytDlpCommand), bytes, { mode: 0o700 });
        await rename(staging, destination).catch(async (error: NodeJS.ErrnoException) => {
            // Another Zeta process can finish the same installation first.
            if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes(error.code ?? '')
                || !(await stat(join(destination, ytDlpCommand)).catch(() => null))?.isFile()) throw error;
        });
        installed = join(destination, ytDlpCommand);
    } finally {
        await rm(staging, { recursive: true, force: true });
    }
}

/** Keep one updater in flight. Continue serving from a verified install while it checks for updates. */
export async function managedYtDlp(): Promise<string | undefined> {
    const profile = process.env.ZETA_CONFIG_DIR;
    const asset = assets[`${process.platform}-${process.arch}`];
    if (!profile || !asset) return undefined;
    if (!refresh && nextCheck <= Date.now()) {
        refresh = installLatest(join(profile, 'yt-dlp'), asset)
            .then(() => { nextCheck = Date.now() + CHECK_INTERVAL; })
            .catch(() => {
                nextCheck = Date.now() + RETRY_INTERVAL;
                console.warn('[yt-dlp] Automatic install or update failed. Will retry later.');
            })
            .finally(() => { refresh = undefined; });
    }
    if (!installed) await refresh;
    return installed;
}
