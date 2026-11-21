import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRoomStateFromSignalDoc,
  createInitialP2PDiagnostics,
  FIRESTORE_ANSWER_CANDIDATES_SUBCOLLECTION,
  FIRESTORE_OFFER_CANDIDATES_SUBCOLLECTION,
  FIRESTORE_ROOMS_COLLECTION,
  normalizeRoomCode,
  serializeIceCandidate,
  serializeSessionDescription,
  STAGE_TIMEOUT_MS,
  verifyRealFirebaseConfiguration,
  WEBRTC_ICE_CONFIG,
  WebRtcP2PManager,
  type RoomSignalDoc,
} from './webrtcP2PManager';

test('normalizeRoomCode trims whitespace and converts to uppercase for exact doc(db, "rooms", cleanCode) matching', () => {
  assert.equal(FIRESTORE_ROOMS_COLLECTION, 'rooms');
  assert.equal(FIRESTORE_OFFER_CANDIDATES_SUBCOLLECTION, 'offerCandidates');
  assert.equal(FIRESTORE_ANSWER_CANDIDATES_SUBCOLLECTION, 'answerCandidates');
  assert.equal(STAGE_TIMEOUT_MS, 10000);
  assert.equal(normalizeRoomCode('  a7k9p2 \n'), 'A7K9P2');
  assert.equal(normalizeRoomCode('x9y8z7'), 'X9Y8Z7');
});

test('verifyRealFirebaseConfiguration confirms real project credentials and WEBRTC_ICE_CONFIG includes multiple public STUN servers', () => {
  const fbCheck = verifyRealFirebaseConfiguration();
  assert.equal(fbCheck.valid, true);
  assert.ok(fbCheck.projectId.length > 0);
  assert.ok(fbCheck.databaseId.length > 0);

  const iceServers = WEBRTC_ICE_CONFIG.iceServers ?? [];
  assert.ok(iceServers.length > 0);
  const urls = Array.isArray(iceServers[0].urls) ? iceServers[0].urls : [iceServers[0].urls];
  assert.ok(urls.includes('stun:stun.l.google.com:19302'));
  assert.ok(urls.includes('stun:stun1.l.google.com:19302'));
  assert.ok(urls.includes('stun:stun2.l.google.com:19302'));
});

test('createInitialP2PDiagnostics and WebRtcP2PManager track 5-step diagnostics and dc_ready / match_start packets', () => {
  const initDiag = createInitialP2PDiagnostics();
  assert.equal(initDiag.step1CreateStatus, 'idle');
  assert.equal(initDiag.step2JoinStatus, 'idle');
  assert.equal(initDiag.step3SdpStatus, 'idle');
  assert.equal(initDiag.iceStatus, 'idle');
  assert.equal(initDiag.dataChannelStatus, 'idle');

  const mgr = new WebRtcP2PManager();
  let matchedCode = '';
  mgr.setMatchStartPacketHandler((code) => {
    matchedCode = code;
  });
  mgr.handleIncomingPacket({ t: 'dc_ready', ts: 123 });
  assert.equal(mgr.getDiagnostics().iceStatus, 'connected');
  assert.equal(mgr.getDiagnostics().dataChannelStatus, 'open');

  mgr.handleIncomingPacket({ t: 'match_start', roomCode: ' a7k9p2 ' });
  assert.equal(matchedCode, 'A7K9P2');
  mgr.closeSession();
});

test('serializeSessionDescription produces a plain object { type, sdp } compatible with Firestore', () => {
  const fakeNativeRtcSessionDescription = Object.create(
    { toJSON: () => ({ type: 'offer', sdp: 'v=0\r\no=- 123 2 IN IP4 127.0.0.1' }) },
    {
      type: { value: 'offer', enumerable: true },
      sdp: { value: 'v=0\r\no=- 123 2 IN IP4 127.0.0.1', enumerable: true },
    },
  );

  const plainOffer = serializeSessionDescription(fakeNativeRtcSessionDescription);
  assert.equal(Object.getPrototypeOf(plainOffer), Object.prototype);
  assert.deepEqual(plainOffer, {
    type: 'offer',
    sdp: 'v=0\r\no=- 123 2 IN IP4 127.0.0.1',
  });
});

test('serializeIceCandidate calls candidate.toJSON() and strips undefined values for Firestore compatibility', () => {
  let toJsonCalled = false;
  const fakeNativeCandidate = {
    candidate: 'candidate:1 1 UDP 2122252543 192.168.1.10 54321 typ host',
    sdpMid: '0',
    sdpMLineIndex: 0,
    usernameFragment: undefined,
    toJSON() {
      toJsonCalled = true;
      return {
        candidate: this.candidate,
        sdpMid: this.sdpMid,
        sdpMLineIndex: this.sdpMLineIndex,
        usernameFragment: undefined,
      };
    },
  };

  const plainCandidate = serializeIceCandidate(fakeNativeCandidate as unknown as RTCIceCandidate);
  assert.equal(toJsonCalled, true);
  assert.equal(Object.getPrototypeOf(plainCandidate), Object.prototype);
  assert.deepEqual(plainCandidate, {
    candidate: 'candidate:1 1 UDP 2122252543 192.168.1.10 54321 typ host',
    sdpMid: '0',
    sdpMLineIndex: 0,
    usernameFragment: null,
  });
  for (const val of Object.values(plainCandidate)) {
    assert.notEqual(val, undefined);
  }
});

test('buildRoomStateFromSignalDoc maps Firestore RoomSignalDoc to RoomStatePayload for 1v1 and coop_2v2', () => {
  const baseDoc: RoomSignalDoc = {
    roomCode: ' a7k9p2 ',
    hostId: 'host_1',
    hostName: 'Host Akira',
    hostCharacterId: 'akira',
    guestId: 'guest_2',
    guestName: 'Guest Ren',
    guestCharacterId: 'ren',
    mode: '1v1',
    arenaId: 'praia',
    status: 'lobby',
    offer: { type: 'offer', sdp: 'v=0' },
    answer: { type: 'answer', sdp: 'v=0' },
    hostCandidates: [],
    guestCandidates: [],
    updatedAtMs: 1700000000000,
  };

  const state1v1 = buildRoomStateFromSignalDoc(baseDoc);
  assert.equal(state1v1.code, 'A7K9P2');
  assert.equal(state1v1.members.length, 2);
  assert.equal(state1v1.members[0].team, 'left');
  assert.equal(state1v1.members[1].team, 'right');

  const stateCoop = buildRoomStateFromSignalDoc({ ...baseDoc, mode: 'coop_2v2' });
  assert.equal(stateCoop.members.length, 2);
  assert.equal(stateCoop.members[0].team, 'left');
  assert.equal(stateCoop.members[0].slotIndex, 0);
  assert.equal(stateCoop.members[1].team, 'left');
  assert.equal(stateCoop.members[1].slotIndex, 1);
});
