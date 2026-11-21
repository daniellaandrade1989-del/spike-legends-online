import test from 'node:test';
import assert from 'node:assert/strict';
import { GameFeelManager, type GameFeelAudioSink } from './gameFeelManager.ts';

function createMockAudioSink() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const sink: GameFeelAudioSink = {
    playImpactByForce: (...args) => calls.push({ method: 'playImpactByForce', args }),
    duckMusic: (...args) => calls.push({ method: 'duckMusic', args }),
    playCourtShoeSqueak: (...args) => calls.push({ method: 'playCourtShoeSqueak', args }),
    playCourtFloorSlam: (...args) => calls.push({ method: 'playCourtFloorSlam', args }),
    playMancheteBump: () => calls.push({ method: 'playMancheteBump', args: [] }),
    playOverheadSet: () => calls.push({ method: 'playOverheadSet', args: [] }),
    playSandFootstep: (...args) => calls.push({ method: 'playSandFootstep', args }),
    playSandSlideDive: () => calls.push({ method: 'playSandSlideDive', args: [] }),
    playAnimeVoice: (...args) => calls.push({ method: 'playAnimeVoice', args }),
    updateCrowdAmbience: (...args) => calls.push({ method: 'updateCrowdAmbience', args }),
    triggerCrowdRoar: (...args) => calls.push({ method: 'triggerCrowdRoar', args }),
    playGuardBreak: () => calls.push({ method: 'playGuardBreak', args: [] }),
    playPerfectHit: () => calls.push({ method: 'playPerfectHit', args: [] }),
  };
  return { sink, calls };
}

test('triggerImpact synchronizes Hitstop, 0.3s X/Y Screen Shake, Flash, Explosion SFX, and 0.5s Audio Ducking', () => {
  const { sink, calls } = createMockAudioSink();
  const feel = new GameFeelManager(sink);

  feel.triggerImpact(1.15, { isPerfect: true, characterId: 'akira', hitstopSec: 0.15 });

  assert.equal(feel.getHitstopRemaining(), 0.15);
  assert.ok(feel.getFlashState().opacity > 0.2, 'Screen flash must activate on perfect impact');

  assert.ok(calls.some((c) => c.method === 'duckMusic' && c.args[0] === 0.5), 'Must duck BGM for 0.5s');
  assert.ok(calls.some((c) => c.method === 'playPerfectHit'), 'Must play bass-boosted perfect hit SFX');
  assert.ok(
    calls.some((c) => c.method === 'playAnimeVoice' && c.args[0] === 'spike' && c.args[1] === 'akira'),
    'Must trigger anime spike grunt',
  );
  assert.ok(calls.some((c) => c.method === 'triggerCrowdRoar'), 'Must trigger crowd roar on perfect spike');

  // Shake deve permanecer ativo em X e Y durante ~0.3s e decair a zero depois
  const at100ms = feel.updateCameraAndFeel(0.1, 1.23, {
    aspect: 16 / 9,
    phase: 'rally',
    ballPos: { x: 0, y: 2.5, z: 0 },
    ballVel: { x: 18, y: -4, z: 0 },
    activePlayerPos: { x: -1, y: 1.4, z: 0 },
    activePlayerState: 'spike',
    isShowcase: false,
  });
  assert.ok(Math.abs(at100ms.shakeOffset.x) > 0.01 || Math.abs(at100ms.shakeOffset.y) > 0.01);
  assert.equal(at100ms.isHitstopActive, true);

  // Avança mais 0.25s (total 0.35s > 0.3s): hitstop e shake encerram completamente
  const after350ms = feel.updateCameraAndFeel(0.25, 1.48, {
    aspect: 16 / 9,
    phase: 'rally',
    ballPos: { x: 2, y: 1.8, z: 0 },
    ballVel: { x: 16, y: -6, z: 0 },
    activePlayerPos: { x: -1, y: 0.2, z: 0 },
    activePlayerState: 'move',
    isShowcase: false,
  });
  assert.equal(after350ms.isHitstopActive, false);
  assert.equal(after350ms.shakeOffset.x, 0);
  assert.equal(after350ms.shakeOffset.y, 0);
});

test('updateCameraAndFeel implements Dual-Focus Smooth Tracking and Contextual FOV Zoom Out/Zoom In', () => {
  const { sink } = createMockAudioSink();
  const feel = new GameFeelManager(sink);

  // 1. Saque / Levantamento alto -> Zoom Out (FOV maior que baseFovDesktop 46)
  let out = feel.updateCameraAndFeel(0.5, 0.5, {
    aspect: 16 / 9,
    phase: 'serve_wait',
    ballPos: { x: -4.2, y: 3.6, z: 0 },
    ballVel: { x: 0, y: 0, z: 0 },
    activePlayerPos: { x: -4.2, y: 0, z: 0 },
    activePlayerState: 'idle',
    isShowcase: false,
  });
  for (let i = 0; i < 10; i++) {
    out = feel.updateCameraAndFeel(0.1, 1 + i * 0.1, {
      aspect: 16 / 9,
      phase: 'serve_wait',
      ballPos: { x: -4.2, y: 3.6, z: 0 },
      ballVel: { x: 0, y: 0, z: 0 },
      activePlayerPos: { x: -4.2, y: 0, z: 0 },
      activePlayerState: 'idle',
      isShowcase: false,
    });
  }
  assert.ok(feel.baseFovDesktop <= 25, `Side-view The Spike camera must use low FOV (got ${feel.baseFovDesktop})`);
  assert.ok(out.fov > feel.baseFovDesktop + 2.5, `Serve/High-set must Zoom Out FOV (got ${out.fov})`);
  assert.ok(out.lookAt.x < -1.0, `Dual focus must smoothly track left side midpoint (got ${out.lookAt.x})`);

  // 2. Ápice do salto do atacante perto da bola -> Zoom In Dramático (FOV menor que baseFovDesktop 46)
  for (let i = 0; i < 12; i++) {
    out = feel.updateCameraAndFeel(0.1, 2 + i * 0.1, {
      aspect: 16 / 9,
      phase: 'rally',
      ballPos: { x: -0.8, y: 2.6, z: 0.4 },
      ballVel: { x: 0.5, y: 0.2, z: 0 },
      activePlayerPos: { x: -1.1, y: 1.45, z: 0.3 },
      activePlayerState: 'airborne',
      isShowcase: false,
    });
  }
  assert.ok(out.fov < feel.baseFovDesktop - 2.5, `Apex jump attack must Zoom In FOV (got ${out.fov})`);
});

test('GameFeelManager drives Sand Foley, Dynamic Rally Crowd Ambience, and Guard Break', () => {
  const { sink, calls } = createMockAudioSink();
  const feel = new GameFeelManager(sink);

  // Passos/rangido de tênis na quadra indoor ao correr e em parada brusca
  feel.updateCourtFootsteps(0.25, 7.5, true, 7.5);
  feel.updateCourtFootsteps(0.25, 7.5, true, 7.5);
  assert.ok(calls.some((c) => c.method === 'playCourtShoeSqueak' && c.args[1] === false), 'Running on court must emit shoe squeak steps');

  feel.updateCourtFootsteps(0.016, 0.8, true, 6.2);
  assert.ok(calls.some((c) => c.method === 'playCourtShoeSqueak' && c.args[1] === true), 'Sudden stop must emit hard-stop sneaker screech');

  // Manchete, Toque e Impacto no piso da quadra
  feel.triggerBump(0.5, true);
  feel.triggerSet();
  feel.triggerCourtFloorSlam(1.1);
  assert.ok(calls.some((c) => c.method === 'playMancheteBump'));
  assert.ok(calls.some((c) => c.method === 'playOverheadSet'));
  assert.ok(calls.some((c) => c.method === 'playCourtFloorSlam'));

  // Peixinho
  feel.triggerSandDive();
  assert.ok(calls.some((c) => c.method === 'playSandSlideDive'), 'Dive must trigger slide foley');

  // Torcida cresce com a duração do rally
  feel.updateCrowdForRally(3.0, true, false);
  feel.updateCrowdForRally(4.0, true, false);
  const crowdCalls = calls.filter((c) => c.method === 'updateCrowdAmbience');
  assert.ok(crowdCalls.length >= 2);
  const lastRallyDuration = crowdCalls[crowdCalls.length - 1].args[0] as number;
  assert.ok(lastRallyDuration >= 6.5, `Crowd rally timer must grow during rally (got ${lastRallyDuration})`);

  // Guard Break dispara stun feel + ducking + roar
  feel.triggerGuardBreak();
  assert.ok(calls.some((c) => c.method === 'playGuardBreak'));
  assert.ok(calls.some((c) => c.method === 'duckMusic' && c.args[0] === 0.5));
});

test('triggerShadowExplosion triggers dark flash, XY shake, hitstop, 0.5s ducking, and roar', () => {
  const { sink, calls } = createMockAudioSink();
  const feel = new GameFeelManager(sink);

  feel.triggerShadowExplosion(1.1);
  assert.ok(feel.getHitstopRemaining() >= 0.13);
  const flash = feel.getFlashState();
  assert.ok(flash.opacity >= 0.5);
  assert.equal(flash.color, 'rgba(15, 6, 32, 1)');
  assert.ok(calls.some((c) => c.method === 'duckMusic' && c.args[0] === 0.5));
  assert.ok(calls.some((c) => c.method === 'playPerfectHit'));
  assert.ok(calls.some((c) => c.method === 'triggerCrowdRoar'));

  const out = feel.updateCameraAndFeel(0.08, 0.5, {
    aspect: 16 / 9,
    phase: 'rally',
    ballPos: { x: 2, y: 2.2, z: 0 },
    ballVel: { x: 20, y: -5, z: 0 },
    activePlayerPos: { x: -1, y: 1.2, z: 0 },
    activePlayerState: 'spike',
    isShowcase: false,
  });
  assert.ok(Math.abs(out.shakeOffset.x) > 0.01 || Math.abs(out.shakeOffset.y) > 0.01);
});

test('playShoeSqueak triggers on rapid direction changes, dives, and manchete bumps', () => {
  const squeaks: Array<{ intensity?: number; isHardStop?: boolean }> = [];
  const { sink } = createMockAudioSink();
  sink.playShoeSqueak = (intensity, isHardStop) => squeaks.push({ intensity, isHardStop });

  const feel = new GameFeelManager(sink);

  // Mudança rápida de direção no solo
  feel.updateCourtFootsteps(0.016, 4.5, true, 4.5, true);
  assert.equal(squeaks.length, 1);
  assert.equal(squeaks[0].isHardStop, true);

  // Avança cooldown e dispara mergulho (dive) e manchete (bump)
  feel.updateCourtFootsteps(0.25, 0, true, 0, false);
  feel.triggerSandDive();
  feel.triggerBump(0.65, true);

  assert.equal(squeaks.length, 3);
  assert.equal(squeaks[1].isHardStop, true);
  assert.equal(squeaks[2].isHardStop, true);

  // Garante preservação do contexto `this` em instâncias de classe reais (como SoundEngine)
  class BoundAudioSink {
    public calledWithThis = false;
    public playImpactByForce() {}
    public duckMusic() {}
    public playSandFootstep() {}
    public playSandSlideDive() {}
    public playAnimeVoice() {}
    public updateCrowdAmbience() {}
    public triggerCrowdRoar() {}
    public playGuardBreak() {}
    public playPerfectHit() {}
    public PlayRandomShoeSqueak() {
      this.calledWithThis = true;
    }
  }
  const boundSink = new BoundAudioSink();
  const boundFeel = new GameFeelManager(boundSink);
  boundFeel.triggerBump(0.5, true);
  assert.equal(boundSink.calledWithThis, true, 'GameFeelManager must preserve `this` binding on PlayRandomShoeSqueak');
});

test('PlayRandomShoeSqueak fires on slide_dive state entry and AI braking/direction changes', () => {
  const squeaks: Array<{ intensity?: number; isHardStop?: boolean }> = [];
  const { sink } = createMockAudioSink();
  sink.PlayRandomShoeSqueak = (intensity, isHardStop) => squeaks.push({ intensity, isHardStop });

  const feel = new GameFeelManager(sink);

  // Entrada no estado slide_dive ("Peixinho") via máquina de estados
  feel.updateCourtFootsteps(0.016, 6.0, true, 6.0, false, 'slide_dive');
  assert.equal(squeaks.length, 1);
  assert.equal(squeaks[0].isHardStop, true);

  // Mesma frame contínua em slide_dive não deve duplicar
  feel.updateCourtFootsteps(0.016, 5.5, true, 6.0, false, 'slide_dive');
  assert.equal(squeaks.length, 1);

  // IA realizando mudança brusca de direção no eixo X
  feel.updateAiMovementSqueaks(
    [{ id: 'p2', isAi: true, vx: 5.2, vz: 0, y: 0, actionState: 'move' }],
    0.016,
    'p1',
  );
  feel.updateAiMovementSqueaks(
    [{ id: 'p2', isAi: true, vx: -4.4, vz: 0, y: 0, actionState: 'move' }],
    0.016,
    'p1',
  );
  assert.equal(squeaks.length, 2, 'AI rapid X direction reversal must trigger PlayRandomShoeSqueak');
});


