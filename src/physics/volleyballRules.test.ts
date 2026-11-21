import test from 'node:test';
import assert from 'node:assert/strict';
import {
  awardPoint,
  calculateEloDelta,
  calculateRankTier,
  checkMatchWinner,
  clampServerMovementStep,
  computeReceiveImpulse,
  computeServeVelocity,
  computeSpikeImpulse,
  createMatchScoreState,
  decideAiAction,
  filterProfanity,
  resolveBallLandingTeam,
} from './volleyballRules.ts';

test('scoring wins at 15 or 21 points with at least 2 points lead', () => {
  assert.equal(checkMatchWinner(14, 12), null);
  assert.equal(checkMatchWinner(15, 13), 'left');
  assert.equal(checkMatchWinner(15, 14), null); // empate 15-14 exige vantagem de 2
  assert.equal(checkMatchWinner(16, 15), null);
  assert.equal(checkMatchWinner(17, 15), 'left');
  assert.equal(checkMatchWinner(19, 21, 21), 'right');
  assert.equal(checkMatchWinner(20, 21, 21), null);
  assert.equal(checkMatchWinner(20, 22, 21), 'right');
});

test('awardPoint increments score, flips serve to scorer, and locks after winner', () => {
  let state = createMatchScoreState('left', 15);
  for (let i = 0; i < 14; i++) {
    state = awardPoint(state, 'right');
  }
  assert.equal(state.right, 14);
  assert.equal(state.winner, null);

  state = awardPoint(state, 'right');
  assert.equal(state.right, 15);
  assert.equal(state.winner, 'right');
  assert.equal(state.servingTeam, 'right');

  // Não muda mais após o vencedor ser definido
  const afterWin = awardPoint(state, 'left');
  assert.equal(afterWin.left, 0);
  assert.equal(afterWin.winner, 'right');
});

test('resolveBallLandingTeam handles in-bounds and out-of-bounds correctly on 25m court', () => {
  // Caiu dentro da quadra direita -> ponto do time esquerdo
  assert.equal(resolveBallLandingTeam(9.2, 1.0, 'left'), 'left');
  // Caiu dentro da quadra esquerda -> ponto do time direito
  assert.equal(resolveBallLandingTeam(-8.8, -2.0, 'right'), 'right');
  // Caiu fora após toque da esquerda (> 12.5m) -> ponto da direita
  assert.equal(resolveBallLandingTeam(13.5, 0, 'left'), 'right');
  assert.equal(resolveBallLandingTeam(2.0, 6.2, 'right'), 'left');
});

test('rank tiers map Elo accurately from Bronze to Top Mundial', () => {
  assert.equal(calculateRankTier(500).name, 'Bronze');
  assert.equal(calculateRankTier(1150).name, 'Ouro');
  assert.equal(calculateRankTier(2750).name, 'Top Mundial');
  assert.ok(calculateEloDelta(1000, 1000, true) > 0);
  assert.ok(calculateEloDelta(1000, 1000, false) < 0);
});

test('filterProfanity masks banned words and trims length', () => {
  assert.equal(filterProfanity('  Boa jogada!  '), 'Boa jogada!');
  assert.equal(filterProfanity('que merda de ponto'), 'que ***** de ponto');
});

test('clampServerMovementStep prevents teleport exploits', () => {
  const clamped = clampServerMovementStep({ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, 0.4);
  assert.ok(Math.abs(clamped.x - 0.4) < 1e-6);
  assert.equal(clamped.z, 0);
});

test('computeSpikeImpulse and computeReceiveImpulse aim across court with positive vertical lift', () => {
  const spike = computeSpikeImpulse({ x: -2, y: 1.1, z: 0 }, { x: -1.8, y: 2.6, z: 0 }, 'left', 1.2, true, false);
  assert.ok(spike.vx > 0, 'Left team spike must travel right (+X)');
  assert.ok(spike.vy > 0, 'Spike impulse must have upward lift to clear net');

  const receive = computeReceiveImpulse({ x: 4, y: 0, z: 1 }, { x: 4, y: 1.1, z: 1 }, 'right', 0);
  assert.ok(receive.vx < 0, 'First receive sets forward toward net');
  assert.ok(receive.vy > 6, 'Receive pops ball up cleanly');
});

test('decideAiAction moves toward ball, jumps for set, and spikes when airborne or on 3rd touch', () => {
  const prepCmd = decideAiAction({
    aiPos: { x: 3.5, y: 0, z: 0.5 },
    aiTeam: 'right',
    ballPos: { x: 3.6, y: 2.3, z: 0.5 },
    ballVel: { x: 0.2, y: -1.0, z: 0 },
    touchesOnSide: 1,
    difficulty: 'hard',
    canHit: true,
  });
  assert.equal(prepCmd.jump, true);

  const airCmd = decideAiAction({
    aiPos: { x: 3.5, y: 1.1, z: 0.5 },
    aiTeam: 'right',
    ballPos: { x: 3.6, y: 2.3, z: 0.5 },
    ballVel: { x: 0.2, y: -1.0, z: 0 },
    touchesOnSide: 1,
    difficulty: 'hard',
    canHit: true,
    humanPos: { x: -5.4, y: 0, z: 1.0 },
  });
  assert.equal(airCmd.spike, true);
  assert.equal(airCmd.aim, 'dink', 'Advanced/Boss AI should use largadinha when player retreats deep');
});

test('ball impulses and serves remain strictly centered (vz = 0) and Setter never spikes or blocks', () => {
  const spike = computeSpikeImpulse({ x: -2, y: 1.2, z: 0 }, { x: -1.8, y: 2.5, z: 0 }, 'left', 3.5, true, false, {
    aim: 'diagonal',
  });
  assert.equal(spike.vz, 0, 'Spike must stay on center Z=0 lane even with diagonal/aimZ input');
  assert.equal(spike.spinX, 0);

  const impreciseRec = computeReceiveImpulse({ x: -4, y: 0, z: 0 }, { x: -4, y: 1.0, z: 0 }, 'left', 0, {
    quality: 'imprecise',
  });
  assert.equal(impreciseRec.vz, 0, 'Imprecise receive must not bounce sideways off center lane');

  const setterSet = computeReceiveImpulse({ x: -1.9, y: 0, z: 0 }, { x: -1.9, y: 1.6, z: 0 }, 'left', 1, {
    isSetter: true,
    attackerPos: { x: -4.2, y: 0, z: 0 },
  });
  assert.equal(setterSet.vz, 0);
  assert.ok(setterSet.vx > 0, 'Setter at -1.9 sets forward toward the net (-0.85m), even when attacker is at -4.2');
  assert.ok(setterSet.vy > 7, 'Setter lifts ball high near the net for spike attack');

  // Mesmo se o atacante estiver longe e a bola estiver em -3.0, o levantamento para perto da rede (-0.95m) com Bola Alta
  const backcourtSet = computeReceiveImpulse({ x: -3.0, y: 0, z: 0 }, { x: -3.0, y: 1.5, z: 0 }, 'left', 1, {
    isSetter: true,
    attackerPos: { x: -5.5, y: 0, z: 0 },
  });
  const setFlightTime = 1.36;
  const setPeakX = -3.0 + backcourtSet.vx * setFlightTime;
  assert.ok(setPeakX >= -1.25 && setPeakX <= -0.65, `Set target must hug the net near -0.95 (got ${setPeakX})`);
  assert.ok(backcourtSet.vy >= 12.0, `High Set parabola must lift high (got vy=${backcourtSet.vy})`);

  // Setter nunca salta, nunca corta e nunca bloqueia
  const setterCmd = decideAiAction({
    aiPos: { x: -1.45, y: 0, z: 0 },
    aiTeam: 'left',
    ballPos: { x: -1.4, y: 2.4, z: 0 },
    ballVel: { x: -0.5, y: -1.5, z: 0 },
    touchesOnSide: 1,
    difficulty: 'hard',
    canHit: true,
    role: 'setter',
    attackerPos: { x: -4.5, y: 0, z: 0 },
  });
  assert.equal(setterCmd.jump, false);
  assert.equal(setterCmd.spike, false);
  assert.equal(setterCmd.moveZ, 0);
});

test('Anti-exploit: AI spikes decisively without stalling on dink when opponent stands outside court', () => {
  const cmd = decideAiAction({
    aiPos: { x: 1.6, y: 1.15, z: 0 },
    aiTeam: 'right',
    ballPos: { x: 1.2, y: 2.35, z: 0 },
    ballVel: { x: -0.4, y: -0.6, z: 0 },
    touchesOnSide: 2,
    difficulty: 'hard',
    canHit: true,
    humanPos: { x: -13.2, y: 0, z: 0 },
  });
  assert.equal(cmd.spike, true);
  assert.notEqual(cmd.aim, 'dink', 'AI must not stall with dink when opponent idles behind endline');

  for (const s of ['underhand', 'float', 'jump_serve'] as const) {
    const vel = computeServeVelocity('left', s, 'medium', 0);
    assert.ok(vel.vx > 9 && vel.vy > 4, `Serve ${s} must propel cleanly across 25m court`);
  }

  // Verifica que o serveForceMultiplier aumenta proporcionalmente a força horizontal e a parábola do Saque Viagem
  const baseJump = computeServeVelocity('left', 'jump_serve', 'medium', 0, 1.0);
  const boostedJump = computeServeVelocity('left', 'jump_serve', 'medium', 0, 1.32);
  assert.ok(boostedJump.vx > baseJump.vx * 1.25, 'serveForceMultiplier must boost horizontal Jump Serve speed');
  assert.ok(boostedJump.vy > baseJump.vy, 'serveForceMultiplier must lengthen Jump Serve parabolic lift');
});


