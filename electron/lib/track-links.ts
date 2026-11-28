import { BrowserWindow } from 'electron';
import { parseZetaTrackLink } from '../../src/lib/track-links';

let pendingId: string | null = null;

export function queueTrackLink(link: string): boolean {
    const id = parseZetaTrackLink(link);
    if (!id) return false;
    pendingId = id;
    BrowserWindow.getAllWindows()[0]?.webContents.send('zeta:track-link');
    return true;
}

export function takeTrackLink() {
    const id = pendingId;
    pendingId = null;
    return id;
}
