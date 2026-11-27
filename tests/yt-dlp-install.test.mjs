import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

test('the managed installer coalesces downloads and installs only verified assets', {
    skip: process.platform !== 'linux' || process.arch !== 'x64',
}, async (context) => {
    const profile = await mkdtemp(join(tmpdir(), 'zeta-managed-test-'));
    const previousProfile = process.env.ZETA_CONFIG_DIR;
    process.env.ZETA_CONFIG_DIR = profile;
    context.after(async () => {
        if (previousProfile === undefined) delete process.env.ZETA_CONFIG_DIR;
        else process.env.ZETA_CONFIG_DIR = previousProfile;
        await rm(profile, { recursive: true, force: true });
    });

    const binary = Buffer.from('Example release binary');
    const digest = `sha256:${createHash('sha256').update(binary).digest('hex')}`;
    const asset = { name: 'yt-dlp_linux', size: binary.length, digest };
    let release = { tag_name: '2026.11.23', assets: [asset] };
    let downloads = 0;
    context.mock.method(globalThis, 'fetch', async (url) => {
        if (url === 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest') return Response.json(release);
        assert.equal(url, `https://github.com/yt-dlp/yt-dlp/releases/download/${release.tag_name}/yt-dlp_linux`);
        downloads++;
        return new Response(binary, { headers: { 'content-length': String(binary.length) } });
    });

    const { managedYtDlp } = await import('../electron/lib/yt-dlp-install.ts');
    const [first, second] = await Promise.all([managedYtDlp(), managedYtDlp()]);
    assert.equal(first, join(profile, 'yt-dlp', release.tag_name, 'yt-dlp'));
    assert.equal(second, first);
    assert.deepEqual(await readFile(first), binary);
    assert.equal(downloads, 1);
    assert.equal(await managedYtDlp(), first);
    assert.equal(downloads, 1);

    release = { tag_name: '2026.11.27', assets: [{ ...asset, digest: `sha256:${'0'.repeat(64)}` }] };
    const restarted = await import('../electron/lib/yt-dlp-install.ts?restart');
    assert.equal(await restarted.managedYtDlp(), first);
    assert.deepEqual(await readdir(join(profile, 'yt-dlp')), ['2026.11.23']);
});
