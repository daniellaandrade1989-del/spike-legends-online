import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeCompactInputPacket,
  decodeCompactStatePacket,
  encodeCompactInputPacket,
  encodeCompactStatePacket,
} from './compactPacketCodec';
import type { MatchSnapshot, PlayerInputState } from '../physics/rapierWorld';

test('encodeCompactInputPacket and decodeCompactInputPacket preserve all movement and action flags', () => {
  const original: PlayerInputState = {
    moveX: -0.875,
    moveZ: 0.25,
    sprint: true,
    jump: true,
    jumpHeld: true,
    spike: false,
    spikeHeld: false,
    set: true,
    preparingServe: true,
    serveChargeTime: 0.65,
    serveReleaseChargeTime: 0.65,
    serveChargeStage: 'float',
    hybridCommand: 'serve_float_medium',
    dive: false,
    receive: true,
    ultimate: false,
    footMode: true,
    serveType: 'float',
    mouseAimRatio: 0.72,
    mouseWorldPos: { x: 4.125, y: 1.5 },
  };

  const pkt = encodeCompactInputPacket('player_guest_2', original);
  assert.equal(pkt.t, 'i');
  assert.equal(pkt.id, 'player_guest_2');
  assert.equal(pkt.d.length, 11);

  const decoded = decodeCompactInputPacket(pkt);
  assert.equal(decoded.playerId, 'player_guest_2');
  assert.equal(decoded.input.moveX, -0.875);
  assert.equal(decoded.input.moveZ, 0.25);
  assert.equal(decoded.input.sprint, true);
  assert.equal(decoded.input.jump, true);
  assert.equal(decoded.input.set, true);
  assert.equal(decoded.input.receive, true);
  assert.equal(decoded.input.footMode, true);
  assert.equal(decoded.input.serveChargeTime, 0.65);
  assert.equal(decoded.input.serveReleaseChargeTime, 0.65);
  assert.equal(decoded.input.serveChargeStage, 'float');
  assert.equal(decoded.input.hybridCommand, 'serve_float_medium');
  assert.deepEqual(decoded.input.mouseWorldPos, { x: 4.125, y: 1.5 });
});

test('encodeCompactStatePacket and decodeCompactStatePacket roundtrip ball, players, score, and events', () => {
  const template: MatchSnapshot = {
    tick: 120,
    phase: 'rally',
    serveWhistleBlown: true,
    servingTeam: 'left',
    mode: '1v1',
    is1v1Mode: true,
    hitstopTimer: 0,
    score: {
      left: 4,
      right: 3,
      servingTeam: 'left',
      targetPoints: 15,
      pointNumber: 8,
      winner: null,
    },
    ball: {
      x: 1.234,
      y: 3.456,
      z: 0,
      vx: 6.5,
      vy: -2.1,
      vz: 0,
      rx: 0,
      ry: 0,
      rz: 0,
      rw: 1,
      activeUltimate: 'fire_ball',
      lastTouchTeam: 'left',
      lastTouchPlayerId: 'p1',
      lastPlayerToTouch: 'p1',
      touchesLeft: 2,
      touchesRight: 0,
    },
    players: [
      {
        id: 'p1',
        name: 'Host',
        characterId: 'akira',
        team: 'left',
        slotIndex: 0,
        role: 'attacker',
        isAi: false,
        aiDifficulty: 'medium',
        stats: { attack: 80, defense: 75, jump: 82, speed: 78 },
        x: -2.5,
        y: 1.15,
        z: 0,
        vx: 3.2,
        vy: 1.4,
        vz: 0,
        facingX: 1,
        facingZ: 0,
        anim: 'spike',
        actionState: 'spike',
        animTimer: 0.12,
        diveTimer: 0,
        diveDirX: 0,
        diveDirZ: 0,
        stunTimer: 0,
        spikeCooldown: 0.2,
        hitCooldown: 0.1,
        ultimateCharge: 100,
        ultimateActiveTimer: 3.5,
        superAttackTimer: 3.5,
        spikesCount: 5,
        blocksCount: 1,
        perfectCount: 3,
      },
    ],
    events: [{ type: 'spike', x: -2.2, y: 2.8, z: 0, team: 'left', playerId: 'p1', isPerfect: true }],
  };

  const compact = encodeCompactStatePacket(template);
  assert.equal(compact.t, 's');
  assert.equal(compact.m[0], 120);
  assert.equal(compact.b[0], 1.234);

  const restored = decodeCompactStatePacket(compact, template);
  assert.equal(restored.tick, 120);
  assert.equal(restored.phase, 'rally');
  assert.equal(restored.score.left, 4);
  assert.equal(restored.score.right, 3);
  assert.equal(restored.ball.x, 1.234);
  assert.equal(restored.ball.y, 3.456);
  assert.equal(restored.ball.activeUltimate, 'fire_ball');
  assert.equal(restored.players[0].x, -2.5);
  assert.equal(restored.players[0].y, 1.15);
  assert.equal(restored.players[0].anim, 'spike');
  assert.equal(restored.players[0].spikesCount, 5);
  assert.equal(restored.events.length, 1);
  assert.equal(restored.events[0].type, 'spike');
});
