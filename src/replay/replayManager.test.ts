import test from 'node:test';
import assert from 'node:assert/strict';
import { ReplayManager, type ReplayFrame } from './replayManager.ts';

function makeFrame(tick: number, ballX: number, playerX = -4): ReplayFrame {
  return {
    tick,
    dt: 1 / 60,
    ball: {
      x: ballX,
      y: 2.0 + Math.sin(tick * 0.1),
      z: 0,
      rx: 0,
      ry: 0,
      rz: 0,
      rw: 1,
      activeUltimate: null,
    },
    players: [
      {
        id: 'p1',
        characterId: 'akira',
        team: 'left',
        x: playerX,
        y: 0,
        z: 0,
        facingX: 1,
        facingZ: 0,
        anim: tick % 2 === 0 ? 'run' : 'spike',
        animTimer: tick * (1 / 60),
        ultimateCharge: 50,
        ultimateActiveTimer: 0,
      },
    ],
  };
}

test('ReplayManager circular buffer retains strictly the latest 5 seconds (300 frames @ 60Hz)', () => {
  const manager = new ReplayManager(5.0, 1 / 60);
  assert.equal(manager.capacity, 300);

  // Grava 420 frames (7 segundos) -> deve sobrescrever os 120 mais antigos
  for (let i = 0; i < 420; i++) {
    manager.recordFrame(makeFrame(i, i * 0.05));
  }

  assert.equal(manager.getBufferedCount(), 300);
  const ordered = manager.getOrderedFrames();
  assert.equal(ordered.length, 300);
  assert.equal(ordered[0].tick, 120);
  assert.equal(ordered[ordered.length - 1].tick, 419);
});

test('ReplayManager plays back highlights in slow motion (0.45x) and clears buffer cleanly on completion', () => {
  const manager = new ReplayManager(5.0, 1 / 60);
  for (let i = 0; i <= 60; i++) {
    manager.recordFrame(makeFrame(i, -4 + i * 0.12, -4 + i * 0.05));
  }

  manager.markHighlight('perfect_spike');
  assert.equal(
    manager.shouldTriggerReplay({ leftScore: 2, rightScore: 1, targetPoints: 15, winner: null }),
    true,
  );

  const started = manager.beginPlayback({ slowMotion: true });
  assert.equal(started, true);
  assert.equal(manager.isPlaying(), true);
  assert.equal(manager.getPlaybackSpeed(), 0.45);
  assert.equal(manager.getMeta().highlightLabel, 'REPLAY · CORTE PERFEITO');

  // Primeiro avanço de 0.5s em tempo real a 0.45x deve avançar ~0.225s na linha do tempo gravada
  const mid = manager.advancePlayback(0.5);
  assert.equal(mid.finished, false);
  assert.ok(mid.frame !== null);
  assert.ok(mid.progress > 0.15 && mid.progress < 0.35, `Expected ~0.225 progress, got ${mid.progress}`);

  // Alterna para velocidade normal (1.0x) e avança até o fim
  assert.equal(manager.toggleSlowMotion(), false);
  assert.equal(manager.getPlaybackSpeed(), 1.0);

  const end = manager.advancePlayback(2.5);
  assert.equal(end.finished, true);
  assert.equal(manager.isPlaying(), false);
  assert.equal(manager.getBufferedCount(), 0);
  assert.equal(manager.hasHighlight(), false);
});

test('ReplayManager never softlocks on NaN or stalled dt and exits cleanly when buffer ends', () => {
  const manager = new ReplayManager(5.0, 1 / 60);
  for (let i = 0; i <= 30; i++) {
    manager.recordFrame(makeFrame(i, -2 + i * 0.1));
  }
  assert.equal(manager.beginPlayback({ slowMotion: true }), true);

  // Mesmo recebendo NaN ou dt=0 repetidamente, advancePlayback sanitiza o passo e termina no fim do buffer
  for (let i = 0; i < 120 && manager.isPlaying(); i++) {
    manager.advancePlayback(i % 2 === 0 ? Number.NaN : 0);
  }
  assert.equal(manager.isPlaying(), false, 'ReplayManager must never remain stuck playing on invalid dt');
  assert.equal(manager.getMeta().active, false);
});

