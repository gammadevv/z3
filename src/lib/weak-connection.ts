import { MAX_BITRATE_KBPS, type AudioQuality } from './audio-quality.ts';

const INTERRUPTION_MS = 5000;
const CONNECTION_WINDOW_MS = 120_000;

export class WeakConnection {
    private previousInterruption = -Infinity;
    private reduceUntil = -Infinity;

    observe(waitMs: number, now: number) {
        if (waitMs < INTERRUPTION_MS) return;
        if (now - this.previousInterruption <= CONNECTION_WINDOW_MS) {
            this.reduceUntil = now + CONNECTION_WINDOW_MS;
        }
        this.previousInterruption = now;
    }

    quality(preferred: AudioQuality, now: number): AudioQuality {
        return now < this.reduceUntil && MAX_BITRATE_KBPS[preferred] > MAX_BITRATE_KBPS.low ? 'low' : preferred;
    }

    reset() {
        this.previousInterruption = this.reduceUntil = -Infinity;
    }
}
