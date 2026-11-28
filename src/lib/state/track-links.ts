import { goto } from '$app/navigation';
import { client } from '$lib/ephaptic';
import { libraryState } from './library.svelte';
import { playTrack, playerState } from './player.svelte';
import { toasts } from './toast.svelte';
import { isAndroid } from '$lib/platform';
import { isPublicTrackId, parseZetaTrackLink } from '$lib/track-links';

export function listenForTrackLinks() {
    let ticket = 0;
    let disposed = false;
    let remove: (() => void) | undefined;

    async function openTrack(id: string | null) {
        if (disposed || !id || !isPublicTrackId(id)) return;
        const request = ++ticket;
        try {
            if (!/^\/music(?:\/|$)/.test(window.location.pathname)) await goto('/music');
            if (disposed || ticket !== request) return;
            const previousTrack = playerState.currentTrack;
            const track = libraryState.tracks.get(id) ?? await client.musicTrack(id);
            if (!disposed && ticket === request && previousTrack === playerState.currentTrack) playTrack({ ...track });
        } catch {
            if (!disposed && ticket === request) toasts.error('Could not open this Zeta track link.');
        }
    }

    if (isAndroid) {
        void import('@capacitor/app').then(async ({ App }) => {
            if (disposed) return;
            let receivedLink = false;
            const listener = await App.addListener('appUrlOpen', ({ url }) => {
                const id = parseZetaTrackLink(url);
                if (!id) return;
                receivedLink = true;
                void openTrack(id);
            });
            remove = () => void listener.remove();
            if (disposed) return remove();
            const launch = await App.getLaunchUrl();
            if (!receivedLink && launch?.url) void openTrack(parseZetaTrackLink(launch.url));
        }).catch(() => {});
    } else {
        const bridge = (globalThis as { __zeta?: { onTrackLink?: (callback: () => void) => () => void } }).__zeta;
        if (bridge?.onTrackLink) {
            const read = () => void client.windowTakeTrackLink().then(openTrack).catch(() => {});
            remove = bridge.onTrackLink(read);
            read();
        }
    }

    return () => { disposed = true; remove?.(); };
}
