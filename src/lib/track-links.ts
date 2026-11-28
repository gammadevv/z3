const PUBLIC_TRACK = /^(yt:[\w-]{11}|js:[\w-]{1,64})$/;

export function isPublicTrackId(id: string): boolean {
    return PUBLIC_TRACK.exec(id)?.[0] === id;
}

export function zetaTrackLink(id: string): string | null {
    return isPublicTrackId(id) ? `zeta://track/${encodeURIComponent(id)}` : null;
}

export function parseZetaTrackLink(link: string): string | null {
    const path = /^zeta:\/\/track\/([^/?#]+)$/i.exec(link)?.[1];
    if (!path || path.length > 80) return null;
    try {
        const id = decodeURIComponent(path);
        return isPublicTrackId(id) ? id : null;
    } catch {
        return null;
    }
}
