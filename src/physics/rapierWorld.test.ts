import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureRapierReady, VolleyballRapierWorld } from './rapierWorld.ts';
import { COURT, PHYSICS } from '../config/gameConfig.ts';

function stepPastWhistle(world: VolleyballRapierWorld, maxTicks = 45): number {
  for (let i = 0; i < maxTicks; i++) {
    const snap = world.step(PHYSICS.FIXED_DT);
    if (snap.serveWhistleBlown) return i + 1;
  }
  return maxTicks;
}

function triggerHumanServe(
  world: VolleyballRapierWorld,
  kind: 'normal' | 'underhand' | 'jump' = 'normal',
): number {
  const whistleTicks = stepPastWhistle(world);
  world.setPlayerInput('p1', {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    jump: false,
    spike: false,
    serveNormalTrigger: kind === 'normal',
    serveUnderhandTrigger: kind === 'underhand',
    serveJumpTrigger: kind === 'jump',
    dive: false,
    ultimate: false,
  });
  world.step(PHYSICS.FIXED_DT);
  world.setPlayerInput('p1', {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    jump: false,
    spike: false,
    dive: false,
    ultimate: false,
  });
  return whistleTicks + 1;
}

test('VolleyballRapierWorld initializes, serves, and simulates rally without tunneling', async () => {
  await ensureRapierReady();
  const world = new VolleyballRapierWorld({
    mode: 'ai',
    players: [
      { id: 'p1', name: 'Akira', characterId: 'akira', team: 'left', slotIndex: 0, isAi: false },
      { id: 'ai1', name: 'Yuki', characterId: 'yuki', team: 'right', slotIndex: 0, isAi: true, aiDifficulty: 'medium' },
    ],
  });

  triggerHumanServe(world, 'normal');

  let sawRally = false;
  let minBallY = 99;
  for (let i = 0; i < 240; i++) {
    world.setPlayerInput('p1', {
      moveX: 0.4,
      moveZ: 0,
      sprint: false,
      jump: i === 65,
      spike: i === 70,
      dive: false,
      ultimate: false,
    });
    const snap = world.step(PHYSICS.FIXED_DT);
    if (snap.phase === 'rally') sawRally = true;
    minBallY = Math.min(minBallY, snap.ball.y);
  }

  assert.equal(sawRally, true, 'Match must transition from serve_wait to rally');
  assert.ok(minBallY >= 0, `Ball must never tunnel below floor (minBallY=${minBallY})`);
  world.dispose();
});

test('VolleyballRapierWorld clears hitstopTimer cleanly and completes rallies to score points', async () => {
  await ensureRapierReady();
  const world = new VolleyballRapierWorld({
    mode: 'ai',
    players: [
      { id: 'p1', name: 'Akira', characterId: 'akira', team: 'left', slotIndex: 0, isAi: false },
      { id: 'ai1', name: 'Yuki', characterId: 'yuki', team: 'right', slotIndex: 0, isAi: true, aiDifficulty: 'hard' },
    ],
  });

  triggerHumanServe(world, 'normal');

  let sawHitstop = false;
  let hitstopCleared = false;
  let maxScoreTotal = 0;

  for (let i = 0; i < 420; i++) {
    const snap = world.step(PHYSICS.FIXED_DT);
    if (snap.hitstopTimer > 0) sawHitstop = true;
    if (sawHitstop && snap.hitstopTimer === 0) hitstopCleared = true;
    maxScoreTotal = Math.max(maxScoreTotal, snap.score.left + snap.score.right);
  }

  assert.ok(maxScoreTotal >= 1, `Rally should resolve to at least 1 point within 7s (got ${maxScoreTotal})`);
  if (sawHitstop) {
    assert.equal(hitstopCleared, true, 'Hitstop timer must decay back to 0 without freezing');
  }
  world.dispose();
});

test('Opening serve clears the net cleanly and gives player fair defense time at match start', async () => {
  await ensureRapierReady();
  const world = new VolleyballRapierWorld({
    mode: 'ai',
    players: [
      { id: 'p1', name: 'Akira', characterId: 'akira', team: 'left', slotIndex: 0, isAi: false },
      { id: 'ai1', name: 'Yuki', characterId: 'yuki', team: 'right', slotIndex: 0, isAi: true, aiDifficulty: 'medium' },
    ],
  });

  const elapsedTicks = triggerHumanServe(world, 'normal');

  let crossedNet = false;
  let maxBallX = -99;
  let scoreAfterThreeSeconds = 0;

  // Completa 180 ticks (3.0 segundos totais desde o início da partida) sem movimento adicional
  const remainingTicks = Math.max(90, 180 - elapsedTicks);
  for (let i = 0; i < remainingTicks; i++) {
    const snap = world.step(PHYSICS.FIXED_DT);
    maxBallX = Math.max(maxBallX, snap.ball.x);
    if (snap.ball.x > 0.5 && snap.ball.y > 2.35) {
      crossedNet = true;
    }
    scoreAfterThreeSeconds = snap.score.left + snap.score.right;
  }

  assert.equal(crossedNet, true, `Serve must cross the net cleanly above 2.35m (maxBallX=${maxBallX})`);
  assert.equal(
    scoreAfterThreeSeconds,
    0,
    `No point should be lost within the first 3.0s after match start (got ${scoreAfterThreeSeconds})`,
  );
  world.dispose();
});

test('Training minigames launch balls automatically and expose trainingStats', async () => {
  await ensureRapierReady();
  const world = new VolleyballRapierWorld({
    mode: 'training_spike',
    arenaId: 'praia',
    players: [
      {
        id: 'p1',
        name: 'Akira',
        characterId: 'akira',
        team: 'left',
        slotIndex: 0,
        isAi: false,
        stats: { attack: 130, defense: 110, jump: 130, speed: 120 },
      },
    ],
  });

  let sawLauncher = false;
  let lastSnap = world.collectSnapshot();
  for (let i = 0; i < 90; i++) {
    lastSnap = world.step(PHYSICS.FIXED_DT);
    if (lastSnap.events.some((e) => e.type === 'launcher')) {
      sawLauncher = true;
    }
  }
  assert.equal(sawLauncher, true, 'Training spike machine must emit launcher event');
  assert.ok(lastSnap.trainingStats !== undefined, 'Training minigame must expose trainingStats');
  world.dispose();
});

test('Ball stays strictly centered at Z=0 and allied Setter never spikes or steals 3rd touch', async () => {
  await ensureRapierReady();
  const world = new VolleyballRapierWorld({
    mode: 'ai',
    players: [
      { id: 'p1', name: 'Akira', characterId: 'akira', team: 'left', slotIndex: 0, role: 'attacker', isAi: false },
      { id: 'ally_setter', name: 'Hana', characterId: 'hana', team: 'left', slotIndex: 1, role: 'setter', isAi: true },
      { id: 'ai1', name: 'Yuki', characterId: 'yuki', team: 'right', slotIndex: 0, role: 'attacker', isAi: true, aiDifficulty: 'medium' },
    ],
  });

  triggerHumanServe(world, 'normal');

  let maxAbsBallZ = 0;
  let maxAbsPlayerZ = 0;
  let setterSpiked = false;

  for (let i = 0; i < 360; i++) {
    world.setPlayerInput('p1', {
      moveX: 0.5,
      moveZ: 1.0, // tenta andar para o lado, mas deve permanecer na linha central Z=0
      sprint: false,
      jump: i % 90 === 40,
      spike: i % 90 === 50,
      dive: false,
      ultimate: false,
    });
    const snap = world.step(PHYSICS.FIXED_DT);
    maxAbsBallZ = Math.max(maxAbsBallZ, Math.abs(snap.ball.z));
    for (const pl of snap.players) {
      maxAbsPlayerZ = Math.max(maxAbsPlayerZ, Math.abs(pl.z));
    }
    if (snap.events.some((e) => e.playerId === 'ally_setter' && (e.type === 'spike' || e.type === 'block'))) {
      setterSpiked = true;
    }
  }

  assert.ok(maxAbsBallZ < 0.01, `Ball must remain centered on Z=0 (maxAbsBallZ=${maxAbsBallZ})`);
  assert.ok(maxAbsPlayerZ < 0.01, `Players must stay aligned on Z=0 (maxAbsPlayerZ=${maxAbsPlayerZ})`);
  assert.equal(setterSpiked, false, 'Dedicated Setter must never spike or block');
  world.dispose();
});

test('All serve styles launch strictly outside 20m court (|x| > 10.0) and land cleanly in-bounds across the net', async () => {
  await ensureRapierReady();
  for (const serveType of ['float', 'underhand', 'jump_serve'] as const) {
    const world = new VolleyballRapierWorld({
      mode: 'ai',
      players: [
        { id: 'p1', name: 'Akira', characterId: 'akira', team: 'left', slotIndex: 0, role: 'attacker', isAi: false },
        { id: 'ai1', name: 'Yuki', characterId: 'yuki', team: 'right', slotIndex: 0, role: 'attacker', isAi: true, aiDifficulty: 'hard' },
      ],
    });

    const initialSnap = world.collectSnapshot();
    const initialServer = initialSnap.players.find((p) => p.id === 'p1');
    assert.ok(initialServer && initialServer.x < -10.0, `Server must start behind -10m endline (got x=${initialServer?.x})`);
    assert.ok(initialSnap.ball.x < -10.0, `Serve ball must start outside 20m court (got x=${initialSnap.ball.x})`);

    stepPastWhistle(world);

    let launchBallX = 0;
    let crossedNet = false;
    let landedInBounds = false;

    for (let i = 0; i < 240; i++) {
      const triggerFirstTick = i === 0;
      world.setPlayerInput('p1', {
        moveX: 0,
        moveZ: 0,
        sprint: false,
        jump: false,
        spike: false,
        serveNormalTrigger: triggerFirstTick && serveType === 'float',
        serveUnderhandTrigger: triggerFirstTick && serveType === 'underhand',
        serveJumpTrigger: triggerFirstTick && serveType === 'jump_serve',
        dive: false,
        serveType,
        ultimate: false,
      });
      const prevPhase = world.collectSnapshot().phase;
      const snap = world.step(PHYSICS.FIXED_DT);
      if (prevPhase === 'serve_wait' && snap.phase === 'rally') {
        launchBallX = snap.ball.x;
      }
      if (snap.ball.x > 0.4 && snap.ball.y > 2.35) {
        crossedNet = true;
      }
      // Se nenhum jogador interceptar ou tocar, ainda assim deve cair dentro de [0, 10.0]
      if (snap.phase === 'point_freeze' && snap.score.left === 1) {
        landedInBounds = true;
        break;
      }
      if (snap.ball.lastTouchTeam === 'right' && snap.ball.touchesRight >= 1) {
        landedInBounds = true;
        break;
      }
    }

    assert.ok(launchBallX < -10.0, `Serve (${serveType}) must launch outside 20m court (got ${launchBallX})`);
    assert.equal(crossedNet, true, `Serve (${serveType}) must clear net cleanly`);
    assert.equal(landedInBounds, true, `Serve (${serveType}) must land in-bounds on opponent side`);
    world.dispose();
  }
});

test('VolleyballRapierWorld enforces physical net barrier blocking both Player and AI from crossing x=0', async () => {
  await ensureRapierReady();
  const world = new VolleyballRapierWorld({
    mode: 'ai',
    players: [
      { id: 'p1', name: 'Akira', characterId: 'akira', team: 'left', slotIndex: 0, role: 'attacker', isAi: false },
      { id: 'opp_1', name: 'Yuki', characterId: 'yuki', team: 'right', slotIndex: 0, role: 'attacker', isAi: true, aiDifficulty: 'medium' },
      { id: 'opp_2', name: 'Kai', characterId: 'kai', team: 'right', slotIndex: 1, role: 'setter', isAi: true, aiDifficulty: 'medium' },
    ],
  });

  // Avança até rally e tenta correr continuamente para o lado adversário atravessando a rede
  triggerHumanServe(world, 'normal');
  for (let i = 0; i < 20; i++) {
    world.step(PHYSICS.FIXED_DT);
  }
  world.debugPlaceEntity({
    playerId: 'p1',
    playerPos: { x: -1.0, y: 0, z: 0 },
  });

  let maxHumanX = -99;
  let minAiX = 99;
  for (let i = 0; i < 120; i++) {
    world.setPlayerInput('p1', {
      moveX: 1.0,
      moveZ: 0,
      sprint: true,
      jump: false,
      spike: false,
      dive: false,
      ultimate: false,
    });
    const snap = world.step(PHYSICS.FIXED_DT);
    const human = snap.players.find((pl) => pl.id === 'p1')!;
    const opp = snap.players.find((pl) => pl.id === 'opp_1')!;
    maxHumanX = Math.max(maxHumanX, human.x);
    minAiX = Math.min(minAiX, opp.x);
  }

  assert.ok(maxHumanX <= -0.519, `Human must never cross net barrier (maxHumanX=${maxHumanX})`);
  assert.ok(minAiX >= 0.519, `AI must never cross net barrier (minAiX=${minAiX})`);

  // Mesmo via debugPlaceEntity tentando forçar x = +0.55, a barreira trava em <= -0.52 sem falta artificial
  world.debugPlaceEntity({
    playerId: 'p1',
    playerPos: { x: 0.55, y: 0, z: 0 },
  });
  const snapBlocked = world.step(PHYSICS.FIXED_DT);
  const clampedP1 = snapBlocked.players.find((pl) => pl.id === 'p1')!;
  assert.ok(clampedP1.x <= -0.519, `Net barrier must clamp player strictly on left side (x=${clampedP1.x})`);
  world.dispose();
});

test('VolleyballRapierWorld triggers Double Contact when same player hits consecutively and preserves 5s Super Attack buff', async () => {
  await ensureRapierReady();
  const world = new VolleyballRapierWorld({
    mode: 'ai',
    players: [
      { id: 'p1', name: 'Akira', characterId: 'akira', team: 'left', slotIndex: 0, role: 'attacker', isAi: false },
      { id: 'opp_1', name: 'Yuki', characterId: 'yuki', team: 'right', slotIndex: 0, role: 'attacker', isAi: true, aiDifficulty: 'medium' },
    ],
  });

  // Avança até fase de rally
  triggerHumanServe(world, 'normal');
  for (let i = 0; i < 10; i++) {
    const s = world.step(PHYSICS.FIXED_DT);
    if (s.phase === 'rally') break;
  }

  // Carrega 100% e ativa Super Attack (duração exata de 5.0 segundos)
  world.debugPlaceEntity({
    playerId: 'p1',
    playerPos: { x: -4.0, y: 0, z: 0 },
    ballPos: { x: -4.0, y: 1.5, z: 0 },
    ballVel: { x: 0, y: -1.0, z: 0 },
    ultimateCharge: PHYSICS.ULTIMATE_MAX,
  });

  world.setPlayerInput('p1', {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    jump: false,
    spike: false,
    dive: false,
    ultimate: true,
  });
  const afterActivate = world.step(PHYSICS.FIXED_DT);
  const p1Super = afterActivate.players.find((pl) => pl.id === 'p1');
  assert.ok(p1Super && p1Super.superAttackTimer > 4.9, `Super Attack timer must start at ~5.0s (got ${p1Super?.superAttackTimer})`);

  // Mesmo após acertar a bola em spike, o Super Attack NÃO é consumido no 1º golpe (continua > 4s)
  world.setPlayerInput('p1', {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    jump: false,
    spike: true,
    dive: false,
    ultimate: false,
  });
  const afterHit = world.step(PHYSICS.FIXED_DT);
  const p1AfterHit = afterHit.players.find((pl) => pl.id === 'p1');
  assert.ok(p1AfterHit && p1AfterHit.superAttackTimer > 4.5, 'Super Attack buff must persist for the full 5 seconds across hits');

  // Força segundo toque consecutivo do mesmo jogador p1 após hitCooldown expirar -> Dois Toques!
  for (let i = 0; i < 20; i++) {
    world.setPlayerInput('p1', {
      moveX: 0,
      moveZ: 0,
      sprint: false,
      jump: false,
      spike: false,
      dive: false,
      ultimate: false,
    });
    world.step(PHYSICS.FIXED_DT);
  }
  world.debugPlaceEntity({
    playerId: 'p1',
    playerPos: { x: -4.0, y: 0, z: 0 },
    ballPos: { x: -4.0, y: 1.0, z: 0 },
    ballVel: { x: 0, y: -1.0, z: 0 },
  });
  const dblSnap = world.step(PHYSICS.FIXED_DT);
  const dblFault = dblSnap.events.find((e) => e.callout === 'DOIS TOQUES! FALTA!');
  assert.ok(dblFault, 'Consecutive touch by same non-blocking player must trigger Double Contact');
  assert.equal(dblSnap.score.right, 1);

  world.dispose();
});

test('2v2 Enemy Team (Bot 1 + Bot 2) handles incoming ball without Double Contact and plays full match', async () => {
  await ensureRapierReady();
  const world = new VolleyballRapierWorld({
    mode: '2v2',
    aiRng: () => 0.95, // garante zero erros aleatórios neste teste cooperativo
    players: [
      { id: 'p1', name: 'Akira', characterId: 'akira', team: 'left', slotIndex: 0, role: 'attacker', isAi: false },
      { id: 'ally_setter', name: 'Hana', characterId: 'hana', team: 'left', slotIndex: 1, role: 'setter', isAi: true, aiDifficulty: 'medium' },
      { id: 'opp_1', name: 'Yuki', characterId: 'yuki', team: 'right', slotIndex: 0, role: 'attacker', isAi: true, aiDifficulty: 'medium' },
      { id: 'opp_2', name: 'Kai', characterId: 'kai', team: 'right', slotIndex: 1, role: 'setter', isAi: true, aiDifficulty: 'medium' },
    ],
  });

  triggerHumanServe(world, 'normal');

  let oppDoubleContact = false;
  let rightTouchesSeen = 0;

  for (let i = 0; i < 360; i++) {
    const snap = world.step(PHYSICS.FIXED_DT);
    rightTouchesSeen = Math.max(rightTouchesSeen, snap.ball.touchesRight);
    if (snap.events.some((e) => e.team === 'right' && e.callout === 'DOIS TOQUES! FALTA!')) {
      oppDoubleContact = true;
    }
  }

  assert.ok(rightTouchesSeen >= 1, '2v2 enemy bots should engage with incoming serve');
  assert.equal(oppDoubleContact, false, 'Coordinated 2v2 bots must not commit Double Contact');
  world.dispose();
});

test('Ball resize (~20% smaller) and Dynamic Mouse Aiming (largadinha vs fundo) work in Rapier', async () => {
  assert.ok(PHYSICS.BALL_RADIUS <= 0.25 && PHYSICS.BALL_RADIUS >= 0.2, `Ball radius reduced ~20% (got ${PHYSICS.BALL_RADIUS})`);
  assert.equal(PHYSICS.BALL_MASS, 0.22);

  await ensureRapierReady();

  const runSpikeWithMouseRatio = (mouseAimRatio: number) => {
    const world = new VolleyballRapierWorld({
      mode: 'training',
      players: [
        { id: 'p1', name: 'Akira', characterId: 'akira', team: 'left', slotIndex: 0, role: 'attacker', isAi: false },
      ],
    });
    triggerHumanServe(world, 'normal');
    for (let i = 0; i < 15; i++) world.step(PHYSICS.FIXED_DT);
    world.debugPlaceEntity({
      playerId: 'p1',
      playerPos: { x: -1.1, y: 1.15, z: 0 },
      ballPos: { x: -0.8, y: 2.25, z: 0 },
      ballVel: { x: 0, y: 0, z: 0 },
    });
    world.setPlayerInput('p1', {
      moveX: 0,
      moveZ: 0,
      sprint: false,
      jump: false,
      spike: true,
      dive: false,
      ultimate: false,
      mouseAimRatio,
    });
    const afterSpike = world.step(PHYSICS.FIXED_DT);
    world.dispose();
    return afterSpike.ball.vx;
  };

  const nearNetVx = runSpikeWithMouseRatio(0.08);
  const deepCourtVx = runSpikeWithMouseRatio(0.92);

  assert.ok(nearNetVx > 2 && deepCourtVx > nearNetVx + 3.0, `Mouse aim must scale depth: nearNetVx=${nearNetVx}, deepCourtVx=${deepCourtVx}`);
});

test('Exact mouseWorldPos ScreenToWorldPoint aiming steers ball toward target court coordinates', async () => {
  await ensureRapierReady();

  const simulateTargetedSpike = (targetX: number, targetY: number) => {
    const world = new VolleyballRapierWorld({
      mode: 'training',
      players: [
        { id: 'p1', name: 'Akira', characterId: 'akira', team: 'left', slotIndex: 0, role: 'attacker', isAi: false },
      ],
    });
    triggerHumanServe(world, 'normal');
    for (let i = 0; i < 15; i++) world.step(PHYSICS.FIXED_DT);
    world.debugPlaceEntity({
      playerId: 'p1',
      playerPos: { x: -1.15, y: 1.35, z: 0 },
      ballPos: { x: -0.9, y: 2.38, z: 0 },
      ballVel: { x: 0, y: 0, z: 0 },
    });
    world.setPlayerInput('p1', {
      moveX: 0,
      moveZ: 0,
      sprint: false,
      jump: false,
      spike: true,
      dive: false,
      ultimate: false,
      mouseWorldPos: { x: targetX, y: targetY },
    });

    let landingX = 0;
    for (let i = 0; i < 120; i++) {
      const snap = world.step(PHYSICS.FIXED_DT);
      if (i === 0) {
        world.setPlayerInput('p1', {
          moveX: 0,
          moveZ: 0,
          sprint: false,
          jump: false,
          spike: false,
          dive: false,
          ultimate: false,
          mouseWorldPos: { x: targetX, y: targetY },
        });
      }
      const bounceEv = snap.events.find((e) => e.type === 'bounce' && e.x > 0);
      if (bounceEv) {
        landingX = bounceEv.x;
        break;
      }
      if (snap.ball.x > 0 && snap.ball.y <= PHYSICS.BALL_RADIUS + 0.22 && snap.ball.vy < 0) {
        landingX = snap.ball.x;
        break;
      }
    }
    world.dispose();
    return landingX;
  };

  const shortLandingX = simulateTargetedSpike(2.35, 0.12);
  const deepLandingX = simulateTargetedSpike(7.35, 0.12);

  assert.ok(shortLandingX > 1.2 && shortLandingX < 3.6, `Short mouse target should land near 2.35m (got ${shortLandingX.toFixed(2)}m)`);
  assert.ok(deepLandingX > 6.0 && deepLandingX < 8.6, `Deep mouse target should land near 7.35m (got ${deepLandingX.toFixed(2)}m)`);
  assert.ok(deepLandingX > shortLandingX + 3.2, 'Deep target must land significantly further than short target');
});

test('Core volleyball states (serve_toss, serve, bump, set) trigger inside Rapier world', async () => {
  await ensureRapierReady();
  const world = new VolleyballRapierWorld({
    mode: '2v2',
    aiRng: () => 0.95,
    players: [
      { id: 'p1', name: 'Akira', characterId: 'akira', team: 'left', slotIndex: 0, role: 'attacker', isAi: false },
      { id: 'ally_setter', name: 'Hana', characterId: 'hana', team: 'left', slotIndex: 1, role: 'setter', isAi: true, aiDifficulty: 'medium' },
      { id: 'opp_1', name: 'Yuki', characterId: 'yuki', team: 'right', slotIndex: 0, role: 'attacker', isAi: true, aiDifficulty: 'medium' },
      { id: 'opp_2', name: 'Kai', characterId: 'kai', team: 'right', slotIndex: 1, role: 'setter', isAi: true, aiDifficulty: 'medium' },
    ],
  });

  // 1. Aguarda apito do árbitro e dispara saque viagem interativo
  stepPastWhistle(world);
  world.setPlayerInput('p1', {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    jump: false,
    spike: false,
    serveJumpTrigger: true,
    dive: false,
    ultimate: false,
  });
  let sawServeToss = false;
  let sawServeStrike = false;
  for (let i = 0; i < 45; i++) {
    const snap = world.step(PHYSICS.FIXED_DT);
    const p1 = snap.players.find((p) => p.id === 'p1');
    if (p1?.actionState === 'serve_toss') sawServeToss = true;
    if (p1?.actionState === 'serve' || snap.events.some((e) => e.type === 'serve')) sawServeStrike = true;
    if (snap.phase === 'rally') break;
  }
  assert.ok(sawServeToss, 'Server must enter serve_toss state when tossing ball');
  assert.ok(sawServeStrike, 'Server must enter serve state and emit serve event');

  // 2. Verify bump (manchete) on 1st touch reception
  world.setPlayerInput('p1', {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    jump: false,
    spike: false,
    dive: false,
    ultimate: false,
  });
  world.debugPlaceEntity({
    playerId: 'p1',
    playerPos: { x: -4.2, y: 0, z: 0 },
    ballPos: { x: -4.2, y: 1.05, z: 0 },
    ballVel: { x: -1.5, y: -2.0, z: 0 },
  });
  let sawBump = false;
  let sawSet = false;
  for (let i = 0; i < 120; i++) {
    const snap = world.step(PHYSICS.FIXED_DT);
    const p1 = snap.players.find((p) => p.id === 'p1');
    const ally = snap.players.find((p) => p.id === 'ally_setter');
    if (p1?.actionState === 'bump') sawBump = true;
    if (ally?.actionState === 'set' || snap.events.some((e) => e.type === 'set')) sawSet = true;
    if (sawBump && sawSet) break;
  }
  assert.ok(sawBump, '1st-touch grounded defense must enter bump (manchete) state');
  assert.ok(sawSet, '2nd-touch ally setter must enter set (toque) state');

  world.dispose();
});

test('Dual Serve after Whistle: serveNormalTrigger executes grounded Saque Simples while serveJumpTrigger executes jump Saque Viagem', async () => {
  await ensureRapierReady();

  // 1) Saque Simples por seleção explícita após o apito (sem jogar alto e sem pular)
  const simpleWorld = new VolleyballRapierWorld({
    mode: 'ai',
    players: [
      { id: 'p1', name: 'Akira', characterId: 'akira', team: 'left', slotIndex: 0, role: 'attacker', isAi: false },
      { id: 'opp_1', name: 'Yuki', characterId: 'yuki', team: 'right', slotIndex: 0, role: 'attacker', isAi: true, aiDifficulty: 'medium' },
    ],
  });
  stepPastWhistle(simpleWorld);
  simpleWorld.setPlayerInput('p1', {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    jump: false,
    spike: false,
    spikeHeld: false,
    serveNormalTrigger: true,
    dive: false,
    ultimate: false,
  });
  const simpleSnap = simpleWorld.step(PHYSICS.FIXED_DT);
  const simpleP1 = simpleSnap.players.find((p) => p.id === 'p1')!;
  assert.equal(simpleSnap.phase, 'rally');
  assert.ok(simpleP1.y <= 0.05, `Simple serve must not jump (got y=${simpleP1.y})`);
  assert.ok(
    simpleSnap.events.some((e) => e.type === 'serve' && e.callout === 'SAQUE SIMPLES!'),
    'Normal serve trigger must emit SAQUE SIMPLES! event',
  );
  simpleWorld.dispose();

  // 2) Saque Viagem após o apito (lança alto + salta + isForcedAttack: true)
  const jumpWorld = new VolleyballRapierWorld({
    mode: 'ai',
    players: [
      { id: 'p1', name: 'Akira', characterId: 'akira', team: 'left', slotIndex: 0, role: 'attacker', isAi: false },
      { id: 'opp_1', name: 'Yuki', characterId: 'yuki', team: 'right', slotIndex: 0, role: 'attacker', isAi: true, aiDifficulty: 'medium' },
    ],
  });
  stepPastWhistle(jumpWorld);
  jumpWorld.setPlayerInput('p1', {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    jump: false,
    spike: false,
    serveJumpTrigger: true,
    dive: false,
    ultimate: false,
  });
  let maxServerY = 0;
  let sawToss = false;
  let sawJumpServe = false;
  let sawForcedFlag = false;
  for (let i = 0; i < 40; i++) {
    if (i === 12) {
      jumpWorld.setPlayerInput('p1', {
        moveX: 0,
        moveZ: 0,
        sprint: false,
        jump: false,
        spike: true,
        dive: false,
        ultimate: false,
      });
    }
    const snap = jumpWorld.step(PHYSICS.FIXED_DT);
    const p1 = snap.players.find((p) => p.id === 'p1')!;
    maxServerY = Math.max(maxServerY, p1.y);
    if (p1.actionState === 'serve_toss') sawToss = true;
    const jsEv = snap.events.find((e) => e.type === 'serve' && e.callout === 'SAQUE VIAGEM!');
    if (jsEv) {
      sawJumpServe = true;
      if (jsEv.isForcedAttack) sawForcedFlag = true;
      break;
    }
  }
  assert.equal(sawToss, true, 'Jump serve trigger must enter serve_toss');
  assert.ok(maxServerY > 0.25, `Jump serve must jump off ground (maxServerY=${maxServerY})`);
  assert.equal(sawJumpServe, true, 'Jump serve must launch SAQUE VIAGEM!');
  assert.equal(sawForcedFlag, true, 'Jump serve must set isForcedAttack: true for Shadow Explosion VFX');
  jumpWorld.dispose();
});

test('Restricted Hitbox (neck-down): ball passing at graphical head height (1.62m) does not passively bounce off head', async () => {
  await ensureRapierReady();
  const world = new VolleyballRapierWorld({
    mode: 'training',
    players: [
      { id: 'p1', name: 'Akira', characterId: 'akira', team: 'left', slotIndex: 0, role: 'attacker', isAi: false },
    ],
  });
  // Avança para rally após apito
  triggerHumanServe(world, 'normal');

  // Posiciona jogador parado em x = -4.0, y = 0 (cabeça gráfica em y=1.42..1.85)
  // e bola viajando para a esquerda através da altura da cabeça (y = 1.62)
  world.debugPlaceEntity({
    playerId: 'p1',
    playerPos: { x: -4.0, y: 0, z: 0 },
    ballPos: { x: -3.55, y: 1.62, z: 0 },
    ballVel: { x: -11.0, y: 0.4, z: 0 },
  });
  world.setPlayerInput('p1', {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    jump: false,
    spike: false,
    dive: false,
    receive: false,
    ultimate: false,
  });

  let bouncedBackRight = false;
  let registeredTouch = false;
  for (let i = 0; i < 12; i++) {
    const snap = world.step(PHYSICS.FIXED_DT);
    if (snap.ball.vx > 0) bouncedBackRight = true;
    if (snap.ball.touchesLeft > 0) registeredTouch = true;
  }

  assert.equal(bouncedBackRight, false, 'Ball passing through graphical head height must NOT bounce off head');
  assert.equal(registeredTouch, false, 'Passive body hitbox must be restricted to neck-down (y <= 1.32m)');
  world.dispose();
});

test('Referee whistle gates serve and human server waits indefinitely without auto-serve', async () => {
  await ensureRapierReady();
  const world = new VolleyballRapierWorld({
    mode: '2v2',
    players: [
      { id: 'p1', name: 'Akira', characterId: 'akira', team: 'left', slotIndex: 0, role: 'attacker', isAi: false },
      { id: 'ally_setter', name: 'Hana', characterId: 'hana', team: 'left', slotIndex: 1, role: 'setter', isAi: true },
      { id: 'opp_1', name: 'Yuki', characterId: 'yuki', team: 'right', slotIndex: 0, role: 'attacker', isAi: true },
      { id: 'opp_2', name: 'Kai', characterId: 'kai', team: 'right', slotIndex: 1, role: 'setter', isAi: true },
    ],
  });

  // Antes do apito (~0.48s), até inputs de saque NÃO iniciam o rali
  let sawWhistleEvent = false;
  world.setPlayerInput('p1', {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    jump: false,
    spike: false,
    serveNormalTrigger: true,
    dive: false,
    ultimate: false,
  });
  for (let i = 0; i < 20; i++) {
    const s = world.step(PHYSICS.FIXED_DT);
    assert.equal(s.phase, 'serve_wait', 'Must stay in serve_wait before referee whistle');
    assert.equal(s.serveWhistleBlown, false);
  }
  world.setPlayerInput('p1', {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    jump: false,
    spike: false,
    dive: false,
    ultimate: false,
  });

  // Aguarda 3.5 segundos inteiros sem input após o apito -> nunca pode auto-sacar
  for (let i = 0; i < 210; i++) {
    const s = world.step(PHYSICS.FIXED_DT);
    if (s.events.some((e) => e.type === 'whistle')) sawWhistleEvent = true;
    assert.equal(s.phase, 'serve_wait', 'Human server must NEVER auto-serve while awaiting choice');
    assert.equal(s.score.left + s.score.right, 0);
  }
  assert.equal(sawWhistleEvent, true, 'Referee whistle event must fire cleanly');
  world.dispose();
});

test('Anti-Exploit & Forced Spike: 2v2 Enemy AI returns cleanly when human stands idle outside -10m and Super Attack emits isForcedAttack', async () => {
  await ensureRapierReady();
  const world = new VolleyballRapierWorld({
    mode: '2v2',
    aiRng: () => 0.99,
    players: [
      { id: 'p1', name: 'Akira', characterId: 'akira', team: 'left', slotIndex: 0, role: 'attacker', isAi: false },
      { id: 'ally_setter', name: 'Hana', characterId: 'hana', team: 'left', slotIndex: 1, role: 'setter', isAi: true, aiDifficulty: 'hard' },
      { id: 'opp_1', name: 'Yuki', characterId: 'yuki', team: 'right', slotIndex: 0, role: 'attacker', isAi: true, aiDifficulty: 'hard' },
      { id: 'opp_2', name: 'Kai', characterId: 'kai', team: 'right', slotIndex: 1, role: 'setter', isAi: true, aiDifficulty: 'hard' },
    ],
  });

  triggerHumanServe(world, 'normal');

  // Jogador humano permanece parado atrás da linha de -10m (tentando bugar a IA)
  let aiReturnedOverNet = false;
  let aiOwnFloorFault = false;
  for (let i = 0; i < 360; i++) {
    const snap = world.step(PHYSICS.FIXED_DT);
    if (
      (snap.ball.lastTouchTeam === 'right' && snap.ball.vx < -4.0 && snap.ball.x < 0.35) ||
      snap.events.some((e) => e.type === 'block' && e.playerId === 'ally_setter')
    ) {
      aiReturnedOverNet = true;
      break;
    }
    if (snap.phase === 'point_freeze' && snap.score.left > 0) {
      aiOwnFloorFault = true;
      break;
    }
  }
  assert.equal(aiOwnFloorFault, false, 'Enemy AI must not drop or fault ball on its own side when player stays idle outside court');
  assert.equal(aiReturnedOverNet, true, 'Enemy AI must complete Receive -> Set -> Attack over net even with idle out-of-court opponent');

  // Força Super Attack ativo -> spike deve emitir isForcedAttack: true
  world.debugPlaceEntity({
    playerId: 'p1',
    playerPos: { x: -1.1, y: 1.25, z: 0 },
    ultimateCharge: PHYSICS.ULTIMATE_MAX,
  });
  world.setPlayerInput('p1', {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    jump: false,
    spike: false,
    dive: false,
    ultimate: true,
  });
  world.step(PHYSICS.FIXED_DT);
  world.debugPlaceEntity({
    playerId: 'p1',
    playerPos: { x: -1.1, y: 1.25, z: 0 },
    ballPos: { x: -0.8, y: 2.35, z: 0 },
    ballVel: { x: 0, y: 0, z: 0 },
  });
  world.setPlayerInput('p1', {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    jump: false,
    spike: true,
    dive: false,
    ultimate: false,
  });
  const forcedSnap = world.step(PHYSICS.FIXED_DT);
  const forcedEv = forcedSnap.events.find((e) => e.type === 'spike');
  assert.ok(forcedEv, 'Spike event must fire');
  assert.equal(forcedEv?.isForcedAttack, true, 'Super Attack / perfect spike must flag isForcedAttack: true');

  world.dispose();
});

test('Allied Partner (P2) reads opponent net set + attacker jump and jumps to block in 2v2 Rapier world', async () => {
  await ensureRapierReady();
  const world = new VolleyballRapierWorld({
    mode: '2v2',
    aiRng: () => 0.99,
    players: [
      { id: 'p1', name: 'Akira', characterId: 'akira', team: 'left', slotIndex: 0, role: 'attacker', isAi: false },
      { id: 'ally_setter', name: 'Hana', characterId: 'hana', team: 'left', slotIndex: 1, role: 'setter', isAi: true, aiDifficulty: 'medium' },
      { id: 'opp_1', name: 'Yuki', characterId: 'yuki', team: 'right', slotIndex: 0, role: 'attacker', isAi: true, aiDifficulty: 'hard' },
      { id: 'opp_2', name: 'Kai', characterId: 'kai', team: 'right', slotIndex: 1, role: 'setter', isAi: true, aiDifficulty: 'hard' },
    ],
  });

  triggerHumanServe(world, 'normal');

  let allyJumpedToBlock = false;
  let allyBlocked = false;
  for (let i = 0; i < 360; i++) {
    const snap = world.step(PHYSICS.FIXED_DT);
    const ally = snap.players.find((pl) => pl.id === 'ally_setter');
    if (ally && ally.y > 0.35 && Math.abs(ally.x) < 1.8 && snap.ball.lastTouchTeam === 'right') {
      allyJumpedToBlock = true;
    }
    if (snap.events.some((e) => e.type === 'block' && e.playerId === 'ally_setter')) {
      allyBlocked = true;
      break;
    }
    if (snap.phase === 'point_freeze') {
      break;
    }
  }

  assert.equal(
    allyJumpedToBlock || allyBlocked,
    true,
    'Allied P2 should approach net and jump to block when enemy sets near net and jumps to spike',
  );
  world.dispose();
});

test('OutZone freezes high-speed out-of-bounds ball immediately without bouncing back in and scores for opponent', async () => {
  await ensureRapierReady();
  const world = new VolleyballRapierWorld({
    mode: '1v1',
    players: [
      { id: 'p1', name: 'Akira', characterId: 'akira', team: 'left', slotIndex: 0, role: 'attacker', isAi: false },
      { id: 'opp_1', name: 'Yuki', characterId: 'yuki', team: 'right', slotIndex: 0, role: 'attacker', isAi: true, aiDifficulty: 'easy' },
    ],
  });

  triggerHumanServe(world, 'normal');
  for (let i = 0; i < 15; i++) world.step(PHYSICS.FIXED_DT);

  // p1 (Time 1 / left) toca na bola e ela é lançada em alta velocidade para fora da quadra (x > 10.14)
  world.debugPlaceEntity({
    playerId: 'p1',
    playerPos: { x: -2.0, y: 1.1, z: 0 },
    ballPos: { x: -1.6, y: 2.0, z: 0 },
    ballVel: { x: 0, y: 0, z: 0 },
  });
  world.setPlayerInput('p1', {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    jump: false,
    spike: true,
    dive: false,
    ultimate: false,
  });
  const hitSnap = world.step(PHYSICS.FIXED_DT);
  assert.equal(hitSnap.ball.lastPlayerToTouch, 'p1', 'lastPlayerToTouch must record p1');

  // Coloca a bola caindo em altíssima velocidade na zona externa direita (x = 13.8, vy = -22) além de COURT.HALF_WIDTH (12.5m)
  // onde antes quicaria de volta para dentro da quadra sem encerrar o rali
  world.debugPlaceEntity({
    playerId: 'opp_1',
    playerPos: { x: 4.5, y: 0, z: 0 },
    ballPos: { x: 13.8, y: 0.48, z: 0 },
    ballVel: { x: -12.0, y: -22.0, z: 0 },
  });

  let outSnap = world.step(PHYSICS.FIXED_DT);
  for (let i = 0; i < 6 && outSnap.phase === 'rally'; i++) {
    outSnap = world.step(PHYSICS.FIXED_DT);
  }

  assert.equal(outSnap.phase, 'point_freeze', 'Rally must end immediately on OutZone contact');
  assert.equal(outSnap.score.right, 1, 'Team 2 (right) must score when Team 1 lastPlayerToTouch hits OutZone');
  assert.equal(outSnap.score.left, 0);
  assert.equal(outSnap.ball.vx, 0, 'Ball X velocity must be zeroed immediately on OutZone impact');
  assert.equal(outSnap.ball.vy, 0, 'Ball Y velocity must be zeroed immediately on OutZone impact');
  assert.ok(outSnap.ball.x > 12.6, `Ball must remain frozen outside 25m court lines (got x=${outSnap.ball.x})`);
  assert.ok(
    outSnap.events.some((e) => e.type === 'point' && e.callout === 'BOLA FORA!' && e.scoringTeam === 'right'),
    'Point event must report BOLA FORA! for Team 2',
  );

  // Avança mais alguns frames em point_freeze: a bola NÃO pode quicar de volta para dentro da quadra
  for (let i = 0; i < 15; i++) {
    const freezeSnap = world.step(PHYSICS.FIXED_DT);
    assert.equal(freezeSnap.ball.vx, 0);
    assert.equal(freezeSnap.ball.vy, 0);
    assert.ok(freezeSnap.ball.x > 12.6);
  }

  // Avança o restante do POINT_FREEZE_DELAY (~1.35s): deve limpar a quadra e entrar em serve_wait do time 2
  let recoveredSnap = outSnap;
  for (let i = 0; i < 100 && recoveredSnap.phase === 'point_freeze'; i++) {
    recoveredSnap = world.step(PHYSICS.FIXED_DT);
  }
  assert.equal(recoveredSnap.phase, 'serve_wait', 'Match must transition automatically from point_freeze to next serve_wait');
  assert.equal(recoveredSnap.servingTeam, 'right');

  world.dispose();
});

test('Serve state triggers 8-second safety timeout automatic normal serve to prevent softlock', async () => {
  await ensureRapierReady();
  const world = new VolleyballRapierWorld({
    mode: '1v1',
    players: [
      { id: 'p1', name: 'Akira', characterId: 'akira', team: 'left', slotIndex: 0, role: 'attacker', isAi: false },
      { id: 'opp_1', name: 'Yuki', characterId: 'yuki', team: 'right', slotIndex: 0, role: 'attacker', isAi: true, aiDifficulty: 'easy' },
    ],
  });

  // Passa o apito (~0.5s) e mais 3.5s sem input -> continua em serve_wait
  for (let i = 0; i < 240; i++) {
    const s = world.step(PHYSICS.FIXED_DT);
    assert.equal(s.phase, 'serve_wait');
  }

  // Avança até passar os 8.0s de timeout de segurança após o apito -> força saque normal automático
  let finalSnap = world.collectSnapshot();
  for (let i = 0; i < 320 && finalSnap.phase === 'serve_wait'; i++) {
    finalSnap = world.step(PHYSICS.FIXED_DT);
  }
  assert.equal(finalSnap.phase, 'rally', '8s serve safety timeout must launch automatic normal serve');
  assert.ok(finalSnap.ball.vx > 0, 'Forced automatic serve from left must launch ball across net');

  world.dispose();
});

test('Jump Serve (Saque Viagem) with serveForceMultiplier crosses the net with high clearance on 25m court', async () => {
  await ensureRapierReady();
  const world = new VolleyballRapierWorld({
    mode: 'training',
    players: [
      { id: 'p1', name: 'Akira', characterId: 'akira', team: 'left', slotIndex: 0, role: 'attacker', isAi: false },
    ],
  });

  triggerHumanServe(world, 'jump');

  let crossedNet = false;
  let heightAtNet = 0;
  let firstBounceX: number | null = null;

  for (let i = 0; i < 95; i++) {
    const snap = world.step(PHYSICS.FIXED_DT);
    if (!crossedNet && snap.ball.x >= 0) {
      crossedNet = true;
      heightAtNet = snap.ball.y;
    }
    if (crossedNet && firstBounceX === null && snap.ball.y <= PHYSICS.BALL_RADIUS + 0.18) {
      firstBounceX = snap.ball.x;
    }
  }

  assert.equal(crossedNet, true, 'Jump Serve must cross the center net (x = 0) on the 25m court');
  assert.ok(
    heightAtNet > COURT.NET_HEIGHT + PHYSICS.BALL_RADIUS + 0.35,
    `Jump Serve must clear net with safe margin (got y=${heightAtNet.toFixed(2)}m vs net=${COURT.NET_HEIGHT}m)`,
  );
  assert.ok(
    firstBounceX !== null && firstBounceX > 4.5 && firstBounceX <= COURT.HALF_WIDTH,
    `Jump Serve must land deep inside opponent court without going out (got firstBounceX=${firstBounceX}m)`,
  );

  world.dispose();
});

test('Mandatory 3-Touch Cycle in 2v2 & 1x1 Self-Set (RPC_PerformSet metadata) and Watchdog forceNextPointSync', async () => {
  await ensureRapierReady();

  // 1) Modo 2v2: Time controlado por bots executa rigorosamente Toque 1 (receive) -> Toque 2 (set) -> Toque 3 (spike)
  const world2v2 = new VolleyballRapierWorld({
    mode: '2v2',
    is1v1Mode: false,
    aiRng: () => 0.99,
    players: [
      { id: 'p1', name: 'Akira', characterId: 'akira', team: 'left', slotIndex: 0, role: 'attacker', isAi: false },
      { id: 'ally_setter', name: 'Hana', characterId: 'hana', team: 'left', slotIndex: 1, role: 'setter', isAi: true, aiDifficulty: 'hard' },
      { id: 'opp_1', name: 'Yuki', characterId: 'yuki', team: 'right', slotIndex: 0, role: 'attacker', isAi: true, aiDifficulty: 'hard' },
      { id: 'opp_2', name: 'Kai', characterId: 'kai', team: 'right', slotIndex: 1, role: 'setter', isAi: true, aiDifficulty: 'hard' },
    ],
  });

  triggerHumanServe(world2v2, 'normal');

  const rightTouchEvents: Array<{ type: string; playerId?: string; touchNumber?: number }> = [];
  for (let i = 0; i < 360; i++) {
    const snap = world2v2.step(PHYSICS.FIXED_DT);
    for (const ev of snap.events) {
      if (ev.team === 'right' && (ev.type === 'receive' || ev.type === 'set' || ev.type === 'spike')) {
        rightTouchEvents.push({ type: ev.type, playerId: ev.playerId, touchNumber: ev.touchNumber });
      }
    }
    if (rightTouchEvents.length >= 3 || snap.phase === 'point_freeze') {
      break;
    }
  }

  assert.equal(rightTouchEvents.length >= 3, true, `Expected 3 touches from 2v2 AI team, got ${JSON.stringify(rightTouchEvents)}`);
  assert.equal(rightTouchEvents[0].type, 'receive', 'Touch 1 must be a reception (receive)');
  assert.equal(rightTouchEvents[1].type, 'set', 'Touch 2 must be a set (levantamento)');
  assert.equal(rightTouchEvents[2].type, 'spike', 'Touch 3 must be a spike (ataque)');
  assert.notEqual(rightTouchEvents[0].playerId, rightTouchEvents[1].playerId, 'Bot B (Setter) must be distinct from Bot A (Receiver)');
  assert.equal(rightTouchEvents[0].playerId, rightTouchEvents[2].playerId, 'Bot A (Receiver) must execute the 3rd touch Spike after Bot B sets');
  world2v2.dispose();

  // 2) Modo 1v1 Online (is1v1Mode = true): Jogador faz Recepção no Toque 1 e Auto-Levantamento (Self-Set) no Toque 2!
  const world1v1 = new VolleyballRapierWorld({
    mode: '1v1',
    is1v1Mode: true,
    players: [
      { id: 'p1', name: 'Akira', characterId: 'akira', team: 'left', slotIndex: 0, role: 'attacker', isAi: false },
      { id: 'p2', name: 'Ren', characterId: 'ren', team: 'right', slotIndex: 0, role: 'attacker', isAi: false },
    ],
  });

  triggerHumanServe(world1v1, 'normal');
  for (let i = 0; i < 10; i++) world1v1.step(PHYSICS.FIXED_DT);

  // Toque 1 de p2 (Recepção)
  world1v1.debugPlaceEntity({
    playerId: 'p2',
    playerPos: { x: 5.0, y: 0, z: 0 },
    ballPos: { x: 5.0, y: 1.0, z: 0 },
    ballVel: { x: 4.0, y: -2.0, z: 0 },
  });
  const touch1Snap = world1v1.step(PHYSICS.FIXED_DT);
  assert.ok(touch1Snap.events.some((e) => e.type === 'receive' && e.playerId === 'p2'), 'Touch 1 in 1v1 must be receive');

  // Avança cooldown e posiciona p2 para o Toque 2 (Auto-Levantamento / Self-Set)
  for (let i = 0; i < 18; i++) world1v1.step(PHYSICS.FIXED_DT);
  world1v1.debugPlaceEntity({
    playerId: 'p2',
    playerPos: { x: 2.2, y: 0, z: 0 },
    ballPos: { x: 2.2, y: 1.05, z: 0 },
    ballVel: { x: -1.0, y: -1.5, z: 0 },
  });
  const touch2Snap = world1v1.step(PHYSICS.FIXED_DT);
  const selfSetEv = touch2Snap.events.find((e) => e.type === 'set' && e.playerId === 'p2');
  assert.ok(selfSetEv, 'Touch 2 in 1x1 mode must trigger Set state and emit set event');
  assert.equal(selfSetEv?.isSelfSet, true, '1x1 Set event must flag isSelfSet: true');
  assert.equal(selfSetEv?.touchNumber, 2);

  // 3) Watchdog forceNextPointSync destrava estado congelado e avança para o próximo saque
  const syncedSnap = world1v1.forceNextPointSync('WATCHDOG_TEST');
  assert.equal(syncedSnap.phase, 'serve_wait', 'Watchdog forceNextPointSync must advance stalled rally to serve_wait');
  assert.ok(syncedSnap.events.some((e) => e.type === 'sync_state'), 'Must emit sync_state event');

  world1v1.dispose();
});

test('Hold-to-Charge Serve (Max 1.5s): PreparingServe state and chargeTime thresholds (0.0s-0.3s Por Baixo, 0.4s-1.0s Flutuante, 1.1s-1.5s Viagem)', async () => {
  await ensureRapierReady();

  // 1) Toque rápido (0.2s <= timeForUnderhand = 0.3s) -> Saque Por Baixo ('underhand')
  const underhandWorld = new VolleyballRapierWorld({
    mode: '1v1',
    players: [
      { id: 'p1', name: 'Akira', characterId: 'akira', team: 'left', slotIndex: 0, role: 'attacker', isAi: false },
      { id: 'opp_1', name: 'Yuki', characterId: 'yuki', team: 'right', slotIndex: 0, role: 'attacker', isAi: true },
    ],
  });
  stepPastWhistle(underhandWorld);

  // Enquanto segura o botão (preparingServe: true), entra em preparing_serve sem lançar a bola
  underhandWorld.setPlayerInput('p1', {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    jump: false,
    spike: true,
    spikeHeld: true,
    preparingServe: true,
    serveChargeTime: 0.2,
    dive: false,
    ultimate: false,
  });
  const prepSnap = underhandWorld.step(PHYSICS.FIXED_DT);
  const prepP1 = prepSnap.players.find((p) => p.id === 'p1')!;
  assert.equal(prepSnap.phase, 'serve_wait', 'Must remain in serve_wait while holding button');
  assert.equal(prepP1.actionState, 'preparing_serve', 'Must enter preparing_serve while charging');
  assert.equal(prepP1.anim, 'preparing_serve');

  // Solta em 0.2s -> Saque Por Baixo ('underhand')
  underhandWorld.setPlayerInput('p1', {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    jump: false,
    spike: false,
    spikeHeld: false,
    preparingServe: false,
    serveReleaseChargeTime: 0.2,
    hybridCommand: 'serve_underhand_quick',
    dive: false,
    ultimate: false,
  });
  const underhandSnap = underhandWorld.step(PHYSICS.FIXED_DT);
  const underhandEv = underhandSnap.events.find((e) => e.type === 'serve');
  assert.equal(underhandSnap.phase, 'rally');
  assert.equal(underhandEv?.serveType, 'underhand');
  assert.equal(underhandEv?.callout, 'SAQUE POR BAIXO!');
  underhandWorld.dispose();

  // 2) Charge Médio (0.7s: entre 0.4s e 1.0s) -> Saque Flutuante ('float')
  const floatWorld = new VolleyballRapierWorld({
    mode: '1v1',
    players: [
      { id: 'p1', name: 'Akira', characterId: 'akira', team: 'left', slotIndex: 0, role: 'attacker', isAi: false },
      { id: 'opp_1', name: 'Yuki', characterId: 'yuki', team: 'right', slotIndex: 0, role: 'attacker', isAi: true },
    ],
  });
  stepPastWhistle(floatWorld);
  floatWorld.setPlayerInput('p1', {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    jump: false,
    spike: false,
    spikeHeld: false,
    preparingServe: false,
    serveReleaseChargeTime: 0.7,
    hybridCommand: 'serve_float_medium',
    dive: false,
    ultimate: false,
  });
  const floatSnap = floatWorld.step(PHYSICS.FIXED_DT);
  const floatEv = floatSnap.events.find((e) => e.type === 'serve');
  assert.equal(floatSnap.phase, 'rally');
  assert.equal(floatEv?.serveType, 'float');
  assert.equal(floatEv?.callout, 'SAQUE FLUTUANTE!');
  floatWorld.dispose();

  // 3) Charge Máximo (1.3s >= 1.1s, máx 1.5s) -> Saque Viagem (Super Ataque)
  const jumpWorld = new VolleyballRapierWorld({
    mode: '1v1',
    players: [
      { id: 'p1', name: 'Akira', characterId: 'akira', team: 'left', slotIndex: 0, role: 'attacker', isAi: false },
      { id: 'opp_1', name: 'Yuki', characterId: 'yuki', team: 'right', slotIndex: 0, role: 'attacker', isAi: true },
    ],
  });
  stepPastWhistle(jumpWorld);
  jumpWorld.setPlayerInput('p1', {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    jump: false,
    spike: false,
    spikeHeld: false,
    preparingServe: false,
    serveReleaseChargeTime: 1.3,
    hybridCommand: 'serve_jump_max',
    dive: false,
    ultimate: false,
  });
  let sawJumpServeEvent = false;
  for (let i = 0; i < 40; i++) {
    const snap = jumpWorld.step(PHYSICS.FIXED_DT);
    const ev = snap.events.find((e) => e.type === 'serve');
    if (ev && ev.serveType === 'jump_serve' && ev.callout === 'SAQUE VIAGEM!') {
      sawJumpServeEvent = true;
      break;
    }
  }
  assert.equal(sawJumpServeEvent, true, 'Charge >= 1.1s must execute Jump Serve (Saque Viagem)');
  jumpWorld.dispose();
});

test('Contextual & Directional Input Resolution: blocks rally combos during Serve and executes Short/Low (F + Down) & Deep (F + Back) when inGame && nearNet', async () => {
  await ensureRapierReady();

  const world = new VolleyballRapierWorld({
    mode: '1v1',
    players: [
      { id: 'p1', name: 'Akira', characterId: 'akira', team: 'left', slotIndex: 0, role: 'attacker', isAi: false },
      { id: 'opp_1', name: 'Yuki', characterId: 'yuki', team: 'right', slotIndex: 0, role: 'attacker', isAi: false },
    ],
  });
  stepPastWhistle(world);

  // 1) CONFLITO NO SAQUE (isServing === true): comandos de bloqueio/ataque direcional NÃO podem disparar bloqueio nem saque indevido fora da quadra
  world.setPlayerInput('p1', {
    moveX: 0,
    moveZ: 1,
    sprint: false,
    jump: false,
    spike: false,
    dive: false,
    ultimate: false,
    hybridCommand: 'action_down_short',
    directionalCombo: 'down_short',
  });
  const afterBlockedDown = world.step(PHYSICS.FIXED_DT);
  assert.equal(afterBlockedDown.phase, 'serve_wait', 'Directional Down Short must be ignored while player isServing');

  world.setPlayerInput('p1', {
    moveX: -1,
    moveZ: 0,
    sprint: false,
    jump: false,
    spike: false,
    dive: false,
    ultimate: false,
    hybridCommand: 'action_back_deep',
    directionalCombo: 'back_deep',
  });
  const afterBlockedBack = world.step(PHYSICS.FIXED_DT);
  assert.equal(afterBlockedBack.phase, 'serve_wait', 'Directional Back Deep must be ignored while player isServing');

  // Inicia o rally com toque rápido 0.2s (Saque Por Baixo)
  world.setPlayerInput('p1', {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    jump: false,
    spike: false,
    dive: false,
    ultimate: false,
    serveReleaseChargeTime: 0.2,
    hybridCommand: 'serve_underhand_quick',
  });
  const rallyStart = world.step(PHYSICS.FIXED_DT);
  assert.equal(rallyStart.phase, 'rally');

  // 2) EM JOGO PERTO DA REDE (inGame && nearNet): 'F' + Seta para BAIXO executa Super Bloqueio/Ataque Curto!
  for (let i = 0; i < 12; i++) world.step(PHYSICS.FIXED_DT);
  world.debugPlaceEntity({
    playerId: 'p1',
    playerPos: { x: -0.85, y: 0.4, z: 0 },
    ballPos: { x: -0.65, y: 2.35, z: 0 },
    ballVel: { x: -6.0, y: 1.0, z: 0 },
  });
  world.setPlayerInput('p1', {
    moveX: 0,
    moveZ: 1,
    verticalInput: -1,
    downHeld: true,
    directionalCombo: 'down_short',
    sprint: false,
    jump: false,
    spike: true,
    dive: false,
    ultimate: false,
    hybridCommand: 'action_down_short',
  });
  const lowBlockSnap = world.step(PHYSICS.FIXED_DT);
  const lowBlockEv = lowBlockSnap.events.find(
    (e) => e.callout === 'BLOQUEIO SUPER CURTO!' || e.callout === 'BLOQUEIO SUPER BAIXO!',
  );
  assert.ok(lowBlockEv, 'F + Down near net in rally must trigger Super Short/Low Block!');
  assert.ok(lowBlockSnap.ball.vy < -5.0, `Low Super Block must drive ball sharply downward (got vy=${lowBlockSnap.ball.vy})`);

  // 3) EM JOGO PERTO DA REDE (inGame && nearNet): 'F' + Seta para TRÁS executa Super Bloqueio/Ataque Fundo de Quadra!
  for (let i = 0; i < 20; i++) {
    world.setPlayerInput('p1', {
      moveX: 0,
      moveZ: 0,
      sprint: false,
      jump: false,
      spike: false,
      dive: false,
      ultimate: false,
      hybridCommand: 'none',
    });
    world.step(PHYSICS.FIXED_DT);
  }
  world.debugPlaceEntity({
    playerId: 'p1',
    playerPos: { x: -0.85, y: 0.4, z: 0 },
    ballPos: { x: -0.65, y: 2.35, z: 0 },
    ballVel: { x: -6.0, y: 1.0, z: 0 },
  });
  world.setPlayerInput('p1', {
    moveX: -1,
    moveZ: 0,
    directionalCombo: 'back_deep',
    sprint: false,
    jump: false,
    spike: true,
    dive: false,
    ultimate: false,
    hybridCommand: 'action_back_deep',
  });
  const deepBlockSnap = world.step(PHYSICS.FIXED_DT);
  const deepBlockEv = deepBlockSnap.events.find((e) => e.callout === 'BLOQUEIO SUPER FUNDO!');
  assert.ok(deepBlockEv, 'F + Back near net in rally must trigger BLOQUEIO SUPER FUNDO!');
  assert.ok(deepBlockSnap.ball.vx > 18.0, `Deep Super Block must launch ball deep to back court (got vx=${deepBlockSnap.ball.vx})`);

  world.dispose();
});

test('Smart Blocking loop breaker, Dedicated Set (Key E) parabolic arc, Serve Rotation, and Unified Jump+Attack', async () => {
  await ensureRapierReady();

  const world = new VolleyballRapierWorld({
    mode: '2v2',
    aiRng: () => 0.15,
    players: [
      { id: 'p1', name: 'Akira', characterId: 'akira', team: 'left', slotIndex: 0, role: 'attacker', isAi: false },
      { id: 'ally_setter', name: 'Hana', characterId: 'hana', team: 'left', slotIndex: 1, role: 'setter', isAi: true },
      { id: 'opp_1', name: 'Yuki', characterId: 'yuki', team: 'right', slotIndex: 0, role: 'attacker', isAi: true },
      { id: 'opp_2', name: 'Kai', characterId: 'kai', team: 'right', slotIndex: 1, role: 'setter', isAi: true },
    ],
  });

  // 1) Verifica posição inicial do sacador (slot 0 = p1 atrás da linha de fundo)
  const initialSnap = world.collectSnapshot();
  const initialP1 = initialSnap.players.find((p) => p.id === 'p1')!;
  assert.ok(initialP1.x < -COURT.HALF_WIDTH, 'Slot 0 player must start as server behind endline');

  stepPastWhistle(world);
  // Executa saque rápido para iniciar o rally
  world.setPlayerInput('p1', {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    jump: false,
    spike: false,
    dive: false,
    ultimate: false,
    serveReleaseChargeTime: 0.2,
    hybridCommand: 'serve_underhand_quick',
  });
  world.step(PHYSICS.FIXED_DT);

  // 2) Botão de Toque / Levantamento (input.set = true / Tecla E): trajetória parabólica alta perto da rede
  for (let i = 0; i < 15; i++) world.step(PHYSICS.FIXED_DT);
  world.debugPlaceEntity({
    playerId: 'p1',
    playerPos: { x: -3.2, y: 0, z: 0 },
    ballPos: { x: -3.0, y: 1.35, z: 0 },
    ballVel: { x: -2.0, y: -1.5, z: 0 },
  });
  world.setPlayerInput('p1', {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    jump: false,
    spike: false,
    set: true,
    dive: false,
    ultimate: false,
  });
  const afterSet = world.step(PHYSICS.FIXED_DT);
  const setEv = afterSet.events.find((e) => e.type === 'set' && e.playerId === 'p1');
  assert.ok(setEv, 'Pressing Set (Key E / btn-mobile-set) must trigger a Set action');
  assert.ok(afterSet.ball.vy >= 12.0, `Set trajectory must have a high parabolic vertical lift (got vy=${afterSet.ball.vy})`);

  // 3) Pular + Atacar no mesmo botão: no chão com a bola longe, apertar spike faz o jogador PULAR
  for (let i = 0; i < 20; i++) {
    world.setPlayerInput('p1', { moveX: 0, moveZ: 0, sprint: false, jump: false, spike: false, dive: false, ultimate: false });
    world.step(PHYSICS.FIXED_DT);
  }
  world.debugPlaceEntity({
    playerId: 'p1',
    playerPos: { x: -1.5, y: 0, z: 0 },
    ballPos: { x: -1.2, y: 3.6, z: 0 },
    ballVel: { x: 0.2, y: 0.5, z: 0 },
  });
  world.setPlayerInput('p1', {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    jump: false,
    spike: true,
    spikeHeld: true,
    dive: false,
    ultimate: false,
  });
  const afterGroundSpikePress = world.step(PHYSICS.FIXED_DT);
  const jumpedP1 = afterGroundSpikePress.players.find((p) => p.id === 'p1')!;
  assert.ok(jumpedP1.vy > 4.0, `1st press of Spike on the ground must make player jump (got vy=${jumpedP1.vy})`);

  // 4) Sistema de Bloqueio Inteligente: 2º bloqueio consecutivo da IA quebra o looping infinito na rede
  for (let i = 0; i < 20; i++) world.step(PHYSICS.FIXED_DT);
  for (let b = 1; b <= 2; b++) {
    for (let i = 0; i < 16; i++) world.step(PHYSICS.FIXED_DT);
    world.debugPlaceEntity({
      playerId: 'opp_1',
      playerPos: { x: 0.85, y: 0.95, z: 0 },
      ballPos: { x: 0.55, y: 2.35, z: 0 },
      ballVel: { x: 14.0, y: -2.0, z: 0 },
    });
    const blockSnap = world.step(PHYSICS.FIXED_DT);
    if (b === 2) {
      // No 2º bloqueio consecutivo, a bola NUNCA pode ser cravada em loop curto (vy deve subir alto amortecido ou quebrar o bloqueio)
      assert.ok(
        blockSnap.ball.vy > 0 || blockSnap.ball.vx > 0,
        `2nd consecutive AI block must break infinite net ping-pong loop (vx=${blockSnap.ball.vx}, vy=${blockSnap.ball.vy})`,
      );
    }
  }

  world.dispose();
});

test('1x1 Contextual Single-Button Intelligence (Key F / Mobile Action): 1st Touch Self-Set (no jump), 2nd Command Jump, 3rd Command Airborne Spike/Super, Net Block Exception, and Auto Reset', async () => {
  await ensureRapierReady();

  const world = new VolleyballRapierWorld({
    mode: '1v1',
    is1v1Mode: true,
    players: [
      { id: 'p1', name: 'Akira', characterId: 'akira', team: 'left', slotIndex: 0, role: 'attacker', isAi: false, aiDifficulty: 'medium' },
      { id: 'opp_1', name: 'Ren', characterId: 'ren', team: 'right', slotIndex: 0, role: 'attacker', isAi: true, aiDifficulty: 'medium' },
    ],
  });

  // 1) 1º Toque no Chão (Recepção / Ajeitar a Bola — SEM PULAR):
  // Jogador no chão (isGrounded === true), playerTouches === 0, bola vindo para o seu lado da quadra.
  // Mesmo com jump=true + spike=true (como o botão principal mobile 'jumpSpike') ou spike=true (Tecla F no PC),
  // o jogador NÃO pula e executa automaticamente o Self-Set próximo à rede.
  world.debugPlaceEntity({
    playerId: 'p1',
    playerPos: { x: -3.4, y: 0, z: 0 },
    playerVel: { x: 0, y: 0, z: 0 },
    hasSelfSet: false,
    playerTouches: 0,
    ballPos: { x: -3.1, y: 1.25, z: 0 },
    ballVel: { x: -3.0, y: -1.8, z: 0 },
  });

  world.setPlayerInput('p1', {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    jump: true,
    jumpHeld: true,
    spike: true,
    spikeHeld: true,
    dive: false,
    ultimate: false,
  });

  const snap1 = world.step(PHYSICS.FIXED_DT);
  const p1After1stTouch = snap1.players.find((p) => p.id === 'p1')!;
  const selfSetEvent = snap1.events.find((e) => e.type === 'set' && e.playerId === 'p1');

  assert.equal(p1After1stTouch.y, 0, '1st command on ground in 1x1 must NOT make the player jump (y must remain 0)');
  assert.equal(p1After1stTouch.vy, 0, '1st command on ground in 1x1 must keep vy === 0');
  assert.equal(p1After1stTouch.hasSelfSet, true, '1st command on ground in 1x1 must immediately set hasSelfSet = true');
  assert.equal(p1After1stTouch.playerTouches, 1, '1st command on ground in 1x1 must mark playerTouches = 1');
  assert.equal(p1After1stTouch.anim, 'set', '1st command on ground in 1x1 must play set animation');
  assert.ok(selfSetEvent, '1st command on ground in 1x1 must emit a set event');
  assert.equal(selfSetEvent.isSelfSet, true, 'Set event in 1x1 must be flagged as isSelfSet = true');
  assert.ok(snap1.ball.vy >= 12.0, `Self-set must toss the ball high for attack (got vy=${snap1.ball.vy})`);
  assert.ok(snap1.ball.vx > 0, `Self-set on left court must direct ball toward the net attack zone (got vx=${snap1.ball.vx})`);

  // Solta o botão entre o 1º e o 2º comando
  world.setPlayerInput('p1', {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    jump: false,
    spike: false,
    dive: false,
    ultimate: false,
  });
  world.step(PHYSICS.FIXED_DT);

  // 2) 2º Comando no Chão (Pulo para o Ataque):
  // Jogador no chão (isGrounded === true) e já ajeitou a bola (hasSelfSet === true).
  // Apertar F faz o jogador PULAR em direção à bola!
  world.setPlayerInput('p1', {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    jump: false,
    spike: true,
    spikeHeld: true,
    dive: false,
    ultimate: false,
  });
  const snap2 = world.step(PHYSICS.FIXED_DT);
  const p1After2ndCommand = snap2.players.find((p) => p.id === 'p1')!;
  assert.ok(
    p1After2ndCommand.vy > 4.0,
    `2nd command on ground in 1x1 (when hasSelfSet === true) must execute Jump (got vy=${p1After2ndCommand.vy})`,
  );
  assert.equal(p1After2ndCommand.actionState, 'airborne', '2nd command must transition player to airborne');

  // 3) 3º Comando no Ar (Ataque / Cortada + Super Ataque Automático se barra cheia):
  for (let i = 0; i < 16; i++) {
    world.setPlayerInput('p1', { moveX: 0, moveZ: 0, sprint: false, jump: false, spike: false, dive: false, ultimate: false });
    world.step(PHYSICS.FIXED_DT);
  }
  world.debugPlaceEntity({
    playerId: 'p1',
    playerPos: { x: -1.1, y: 1.45, z: 0 },
    playerVel: { x: 0.5, y: 0.2, z: 0 },
    ultimateCharge: PHYSICS.ULTIMATE_MAX,
    hasSelfSet: true,
    playerTouches: 1,
    ballPos: { x: -0.92, y: 2.65, z: 0 },
    ballVel: { x: 0.1, y: -0.2, z: 0 },
  });
  world.setPlayerInput('p1', {
    moveX: 1,
    moveZ: 0,
    sprint: false,
    jump: false,
    spike: true,
    spikeHeld: true,
    dive: false,
    ultimate: false,
  });
  const snap3 = world.step(PHYSICS.FIXED_DT);
  const p1After3rdCommand = snap3.players.find((p) => p.id === 'p1')!;
  const spikeEvent = snap3.events.find((e) => e.type === 'spike' && e.playerId === 'p1');

  assert.ok(spikeEvent, '3rd command in the air in 1x1 must execute Spike impact');
  assert.equal(p1After3rdCommand.anim, 'spike', '3rd command in the air in 1x1 must trigger mid-air Cortada (spike) animation');
  assert.equal(spikeEvent.callout, 'SUPER ATTACK!', 'When ultimateCharge is full in 1x1, 3rd command in the air must auto-trigger Super Attack');
  assert.ok(spikeEvent.ultimateType, 'Super Attack in 1x1 must attach character ultimateType');

  // 4) Reset Automático quando a bola cruza para o lado adversário:
  for (let i = 0; i < 16; i++) {
    world.setPlayerInput('p1', { moveX: 0, moveZ: 0, sprint: false, jump: false, spike: false, dive: false, ultimate: false });
    world.step(PHYSICS.FIXED_DT);
  }
  const snapAfterCross = world.step(PHYSICS.FIXED_DT);
  const p1AfterCross = snapAfterCross.players.find((p) => p.id === 'p1')!;
  assert.ok(snapAfterCross.ball.x > 0.12, `Ball should have crossed to opponent side (got x=${snapAfterCross.ball.x})`);
  assert.equal(p1AfterCross.hasSelfSet, false, 'hasSelfSet must automatically reset to false when ball crosses to opponent side');
  assert.equal(p1AfterCross.playerTouches, 0, 'playerTouches must automatically reset to 0 when ball crosses to opponent side');

  // 5) Exceção de Bloqueio na Rede: se a bola ainda está no lado adversário perto da rede, apertar F no chão faz Pulo de Bloqueio
  for (let i = 0; i < 20; i++) {
    world.setPlayerInput('p1', { moveX: 0, moveZ: 0, sprint: false, jump: false, spike: false, dive: false, ultimate: false });
    world.step(PHYSICS.FIXED_DT);
  }
  world.debugPlaceEntity({
    playerId: 'p1',
    playerPos: { x: -0.95, y: 0, z: 0 },
    playerVel: { x: 0, y: 0, z: 0 },
    hasSelfSet: false,
    playerTouches: 0,
    ballPos: { x: 0.85, y: 2.35, z: 0 },
    ballVel: { x: -1.2, y: 0.8, z: 0 },
  });
  world.setPlayerInput('p1', {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    jump: false,
    spike: true,
    spikeHeld: true,
    dive: false,
    ultimate: false,
  });
  const snapBlockJump = world.step(PHYSICS.FIXED_DT);
  const p1BlockJump = snapBlockJump.players.find((p) => p.id === 'p1')!;
  assert.ok(
    p1BlockJump.vy > 4.0,
    `Pressing F near the net when ball is on opponent side must execute Block Jump (got vy=${p1BlockJump.vy})`,
  );
  assert.equal(p1BlockJump.hasSelfSet, false, 'Block Jump exception must not mark hasSelfSet = true');

  world.dispose();
});




