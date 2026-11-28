import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acceptsWayshipOffer, canAutoSyncWayshipPeer, carriesPeerPlayback, nextWayshipRetry, readWayshipOfferMode, WayshipSignalInbox } from '../src/lib/wayship-recovery.ts';

test('a duplicate WebRTC offer or answer only gets through once', () => {
    const inbox = new WayshipSignalInbox();
    const offer = { sdp: 'first-offer' };
    assert.equal(inbox.accept('phone', 'offer', offer, 1000), true);
    assert.equal(inbox.accept('phone', 'offer', { ...offer }, 1001), false);
    assert.equal(inbox.accept('desktop', 'offer', offer, 1001), true);
    assert.equal(inbox.accept('phone', 'offer', { sdp: 'new-offer' }, 1001), true);
    assert.equal(inbox.accept('phone', 'answer', offer, 1001), true);
    assert.equal(inbox.accept('phone', 'answer', offer, 1002), false);
    assert.equal(inbox.accept('phone', 'offer', offer, 61_000), true);
});

test('a Wayship reconnect starts quickly and caps the retry delay', () => {
    let delay = 0;
    const timeline = Array.from({ length: 8 }, () => (delay = nextWayshipRetry(delay)));
    assert.deepEqual(timeline, [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
});

test('automatic Wayship discovery only opens sync links between compatible devices', () => {
    assert.equal(canAutoSyncWayshipPeer('device-a', { peer_id: 'device-b', meta: { librarySync: true } }), true);
    assert.equal(canAutoSyncWayshipPeer('device-b', { peer_id: 'device-a', meta: { librarySync: true } }), false);
    assert.equal(canAutoSyncWayshipPeer('device-a', { peer_id: 'legacy-device', meta: { backupPreview: true } }), false);
    assert.equal(carriesPeerPlayback('sync'), false);
    assert.equal(carriesPeerPlayback('remote'), true);
});

test('legacy automatic remote offers cannot put an updated device into remote control', () => {
    assert.equal(readWayshipOfferMode({ mode: 'remote' }), null);
    assert.equal(readWayshipOfferMode({ mode: 'remote', userInitiated: false }), null);
    assert.equal(readWayshipOfferMode({ mode: 'remote', userInitiated: true }), 'remote');
    assert.equal(readWayshipOfferMode({ mode: 'sync' }), 'sync');
    assert.equal(readWayshipOfferMode({ mode: 'backup' }), 'backup');
    assert.equal(readWayshipOfferMode({ mode: 'party' }), 'party');
    assert.equal(readWayshipOfferMode({ mode: 'unknown' }), null);
});

test('an explicit remote link can replace background sync in either direction', () => {
    assert.equal(acceptsWayshipOffer('remote', { mode: 'sync', host: true }, 'a', 'b'), true);
    assert.equal(acceptsWayshipOffer('sync', { mode: 'remote', host: false }, 'b', 'a'), false);
    assert.equal(acceptsWayshipOffer('remote', { mode: 'backup', host: false }, 'b', 'a'), false);
    assert.equal(acceptsWayshipOffer('sync', { mode: 'sync', host: true }, 'a', 'b'), false);
    assert.equal(acceptsWayshipOffer('sync', { mode: 'sync', host: true }, 'b', 'a'), true);
});
