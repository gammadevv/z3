export interface ListeningFilter { query?: string; from?: number; until?: number }

export function anniversaryWindow(now = new Date()) {
    const year = now.getFullYear() - 1;
    const month = now.getMonth();
    const day = Math.min(now.getDate(), new Date(year, month + 1, 0).getDate());
    const date = new Date(year, month, day);
    return { date, from: date.getTime(), until: new Date(year, month, day + 1).getTime() };
}

export function matchesListeningFilter(
    event: { timestamp: number },
    name: { title: string; artists: string[] },
    filter?: ListeningFilter,
) {
    if (filter?.from !== undefined && event.timestamp < filter.from) return false;
    if (filter?.until !== undefined && event.timestamp >= filter.until) return false;
    const query = filter?.query?.trim().toLowerCase();
    return !query || `${name.title} ${name.artists.join(' ')}`.toLowerCase().includes(query);
}
