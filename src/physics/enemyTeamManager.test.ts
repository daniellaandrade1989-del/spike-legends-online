import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decideAlliedPartnerAction,
  EnemyTeamManager,
  getHumanizationProfile,
} from './enemyTeamManager.ts';

test('EnemyTeamManager coordinates 2v2 bots (receive -> net set -> spike) without Double Contact', () => {
  // RNG fixo alto (0.99) evita erro humano aleatório para validar a cooperação pura
  const mgr = new EnemyTeamManager(() => 0.99);

  // 1º toque: Bot 1 está perto da bola em x=4.6 -> recepciona, Bot 2 corre para zona de levantamento
  const step0 = mgr.computeDuoCommands({
    team: 'right',
    difficulty: 'medium',
    ballPos: { x: 4.5, y: 1.5, z: 0 },
    ballVel: { x: 4.0, y: -2.0, z: 0 },
    touchesOnSide: 0,
    lastTouchTeam: 'left',
    lastTouchPlayerId: 'p1',
    lastTouchWasBlock: false,
    players: [
      { id: 'opp_1', slotIndex: 0, pos: { x: 4.6, y: 0, z: 0 }, velY: 0, isStunned: false, canHit: true },
      { id: 'opp_2', slotIndex: 1, pos: { x: 1.65, y: 0, z: 0 }, velY: 0, isStunned: false, canHit: true },
    ],
    tick: 10,
    dt: 1 / 60,
  });
  assert.equal(step0.opp_1.intendedRole, 'receiver');
  assert.equal(step0.opp_2.intendedRole, 'support');
  assert.equal(step0.opp_1.spike, false);

  // 2º toque após Bot 1 tocar: obrigatoriamente Bot 2 assume como Levantador
  const step1 = mgr.computeDuoCommands({
    team: 'right',
    difficulty: 'medium',
    ballPos: { x: 2.0, y: 2.0, z: 0 },
    ballVel: { x: -1.5, y: -1.0, z: 0 },
    touchesOnSide: 1,
    lastTouchTeam: 'right',
    lastTouchPlayerId: 'opp_1',
    lastTouchWasBlock: false,
    players: [
      { id: 'opp_1', slotIndex: 0, pos: { x: 4.2, y: 0, z: 0 }, velY: 0, isStunned: false, canHit: true },
      { id: 'opp_2', slotIndex: 1, pos: { x: 1.8, y: 0, z: 0 }, velY: 0, isStunned: false, canHit: true },
    ],
    tick: 30,
    dt: 1 / 60,
  });
  assert.equal(step1.opp_2.intendedRole, 'setter');
  assert.equal(step1.opp_1.intendedRole, 'support');

  // 3º toque após Bot 2 levantar: obrigatoriamente Bot 1 assume ataque (salta e corta)
  const step2 = mgr.computeDuoCommands({
    team: 'right',
    difficulty: 'medium',
    ballPos: { x: 1.1, y: 2.5, z: 0 },
    ballVel: { x: -0.4, y: -0.8, z: 0 },
    touchesOnSide: 2,
    lastTouchTeam: 'right',
    lastTouchPlayerId: 'opp_2',
    lastTouchWasBlock: false,
    players: [
      { id: 'opp_1', slotIndex: 0, pos: { x: 1.3, y: 0.9, z: 0 }, velY: 0, isStunned: false, canHit: true },
      { id: 'opp_2', slotIndex: 1, pos: { x: 1.6, y: 0, z: 0 }, velY: 0, isStunned: false, canHit: true },
    ],
    tick: 60,
    dt: 1 / 60,
  });
  assert.equal(step2.opp_1.intendedRole, 'attacker');
  assert.equal(step2.opp_1.spike, true);
  assert.equal(step2.opp_2.intendedRole, 'coverage');
  assert.equal(step2.opp_2.faceOpponents, true);
});

test('EnemyTeamManager applies humanized late reaction, drift, and overpower errors', () => {
  const profile = getHumanizationProfile('medium');
  assert.ok(profile.errorChance >= 0.2 && profile.errorChance <= 0.35);
  assert.ok(profile.reactionDelaySec > 0);
  assert.ok(profile.errorMargin > 0);

  // RNG sempre < errorChance (0.05) e roll = 0.1 -> dispara late_reaction contra corte rápido
  const seq = [0.05, 0.1, 0.2];
  let idx = 0;
  const mgr = new EnemyTeamManager(() => seq[idx++ % seq.length]);

  const cmd = mgr.computeDuoCommands({
    team: 'right',
    difficulty: 'easy',
    ballPos: { x: 1.5, y: 2.2, z: 0 },
    ballVel: { x: 14.0, y: -2.0, z: 0 },
    touchesOnSide: 0,
    lastTouchTeam: 'left',
    lastTouchPlayerId: 'p1',
    lastTouchWasBlock: false,
    players: [
      { id: 'opp_1', slotIndex: 0, pos: { x: 4.5, y: 0, z: 0 }, velY: 0, isStunned: false, canHit: true },
      { id: 'opp_2', slotIndex: 1, pos: { x: 1.5, y: 0, z: 0 }, velY: 0, isStunned: false, canHit: true },
    ],
    tick: 5,
    dt: 1 / 60,
  });
  assert.equal(cmd.opp_2.humanError, 'late_reaction');
  assert.equal(cmd.opp_2.moveX, 0, 'Late reaction freezes AI movement during reactionDelaySec');
});

test('decideAlliedPartnerAction covers setting on touch 2 and autonomous spiking on touch 3 if human took touch 2', () => {
  // Quando P1 deu o 2º toque, P2 precisa atacar no 3º toque para evitar Dois Toques de P1
  const attackCmd = decideAlliedPartnerAction({
    partnerPos: { x: -1.4, y: 0, z: 0 },
    partnerVelY: 0,
    partnerTeam: 'left',
    partnerCanHit: true,
    humanPos: { x: -3.2, y: 0, z: 0 },
    humanStunned: false,
    ballPos: { x: -1.1, y: 2.5, z: 0 },
    ballVel: { x: 0.4, y: -0.9, z: 0 },
    touchesOnSide: 2,
    lastTouchTeam: 'left',
    lastTouchPlayerId: 'p1',
    lastTouchWasBlock: false,
    humanId: 'p1',
    difficulty: 'medium',
    tick: 20,
  });
  assert.equal(attackCmd.jump, true);
  assert.equal(attackCmd.spike, true);

  // Quando P1 deu o 1º toque, P2 atua estritamente como Levantador (não salta nem corta)
  const setCmd = decideAlliedPartnerAction({
    partnerPos: { x: -1.5, y: 0, z: 0 },
    partnerVelY: 0,
    partnerTeam: 'left',
    partnerCanHit: true,
    humanPos: { x: -4.2, y: 0, z: 0 },
    humanStunned: false,
    ballPos: { x: -1.4, y: 2.1, z: 0 },
    ballVel: { x: 1.2, y: -1.0, z: 0 },
    touchesOnSide: 1,
    lastTouchTeam: 'left',
    lastTouchPlayerId: 'p1',
    lastTouchWasBlock: false,
    humanId: 'p1',
    difficulty: 'medium',
    tick: 21,
  });
  assert.equal(setCmd.jump, false);
  assert.equal(setCmd.spike, false);
});

test('Partner runs to mid-court coverage (±5.0m) facing opponents whenever teammate jumps to attack or block', () => {
  const mgr = new EnemyTeamManager(() => 0.99);

  // Bot 1 salta perto da rede para atacar/bloquear -> Bot 2 corre para +5.0m em cobertura
  const duoCoverage = mgr.computeDuoCommands({
    team: 'right',
    difficulty: 'medium',
    ballPos: { x: 0.8, y: 2.7, z: 0 },
    ballVel: { x: -1.5, y: 0.5, z: 0 },
    touchesOnSide: 2,
    lastTouchTeam: 'right',
    lastTouchPlayerId: 'opp_2',
    lastTouchWasBlock: false,
    players: [
      { id: 'opp_1', slotIndex: 0, pos: { x: 1.2, y: 1.15, z: 0 }, velY: 1.5, isStunned: false, canHit: true },
      { id: 'opp_2', slotIndex: 1, pos: { x: 1.8, y: 0, z: 0 }, velY: 0, isStunned: false, canHit: true },
    ],
    tick: 90,
    dt: 1 / 60,
  });
  assert.equal(duoCoverage.opp_2.intendedRole, 'coverage');
  assert.equal(duoCoverage.opp_2.faceOpponents, true);
  assert.ok(duoCoverage.opp_2.moveX > 0.5, `Bot 2 should move toward +5.0m coverage (got moveX=${duoCoverage.opp_2.moveX})`);

  // P1 humano salta perto da rede -> P2 corre para -5.0m em cobertura olhando para os adversários
  const allyCoverage = decideAlliedPartnerAction({
    partnerPos: { x: -1.6, y: 0, z: 0 },
    partnerVelY: 0,
    partnerTeam: 'left',
    partnerCanHit: true,
    humanPos: { x: -1.1, y: 1.05, z: 0 },
    humanJumping: true,
    humanStunned: false,
    ballPos: { x: -0.9, y: 2.6, z: 0 },
    ballVel: { x: 0.2, y: -0.3, z: 0 },
    touchesOnSide: 2,
    lastTouchTeam: 'left',
    lastTouchPlayerId: 'ally_setter',
    lastTouchWasBlock: false,
    humanId: 'p1',
    difficulty: 'medium',
    tick: 95,
  });
  assert.equal(allyCoverage.intendedRole, 'coverage');
  assert.equal(allyCoverage.faceOpponents, true);
  assert.ok(allyCoverage.moveX < -0.5, `P2 should sprint toward -5.0m coverage (got moveX=${allyCoverage.moveX})`);
});

test('Anti-exploit: EnemyTeamManager selects closest eligible attacker on touch 2/3 when opponent idles outside court', () => {
  const mgr = new EnemyTeamManager(() => 0.99);
  const res = mgr.computeDuoCommands({
    team: 'right',
    difficulty: 'hard',
    ballPos: { x: 2.4, y: 2.35, z: 0 },
    ballVel: { x: -0.3, y: -1.1, z: 0 },
    touchesOnSide: 2,
    lastTouchTeam: 'right',
    lastTouchPlayerId: 'opp_2',
    lastTouchWasBlock: false,
    opposingPos: { x: -13.2, y: 0, z: 0 },
    players: [
      { id: 'opp_1', slotIndex: 0, pos: { x: 2.6, y: 1.05, z: 0 }, velY: 0.4, isStunned: false, canHit: true },
      { id: 'opp_2', slotIndex: 1, pos: { x: 1.5, y: 0, z: 0 }, velY: 0, isStunned: false, canHit: true },
    ],
    tick: 120,
    dt: 1 / 60,
  });
  assert.equal(res.opp_1.intendedRole, 'attacker');
  assert.equal(res.opp_1.spike, true);
  assert.notEqual(res.opp_1.aim, 'dink');
});

test('decideAlliedPartnerAction transitions to blocker when opponent sets near net and enemy attacker initiates spike jump', () => {
  // P2 distante (-2.6m), oponente levantou perto da rede (+1.1m, toque 2) e atacante rival iniciou salto -> P2 corre para a rede
  const approachBlock = decideAlliedPartnerAction({
    partnerPos: { x: -2.6, y: 0, z: 0 },
    partnerVelY: 0,
    partnerTeam: 'left',
    partnerCanHit: true,
    humanPos: { x: -5.2, y: 0, z: 0 },
    humanJumping: false,
    humanStunned: false,
    ballPos: { x: 1.1, y: 2.65, z: 0 },
    ballVel: { x: -0.4, y: 1.2, z: 0 },
    touchesOnSide: 0,
    lastTouchTeam: 'right',
    lastTouchPlayerId: 'opp_2',
    lastTouchWasBlock: false,
    humanId: 'p1',
    difficulty: 'medium',
    tick: 140,
    oppTouchesOnSide: 2,
    oppAttackerPos: { x: 1.15, y: 0.45, z: 0 },
    oppAttackerVelY: 4.5,
    oppAttackerActionState: 'airborne',
    oppAttackerJumping: true,
  });
  assert.equal(approachBlock.intendedRole, 'blocker');
  assert.ok(approachBlock.moveX > 0.5, `P2 should sprint toward net (-0.85m), got moveX=${approachBlock.moveX}`);
  assert.equal(approachBlock.jump, false, 'P2 waits until reaching net proximity before jumping');
  assert.equal(approachBlock.spike, false);

  // P2 já posicionado perto da rede (-1.1m) no timing do ataque inimigo -> salta para bloquear!
  const jumpBlock = decideAlliedPartnerAction({
    partnerPos: { x: -1.1, y: 0, z: 0 },
    partnerVelY: 0,
    partnerTeam: 'left',
    partnerCanHit: true,
    humanPos: { x: -5.2, y: 0, z: 0 },
    humanJumping: false,
    humanStunned: false,
    ballPos: { x: 0.95, y: 2.55, z: 0 },
    ballVel: { x: -0.5, y: -0.6, z: 0 },
    touchesOnSide: 0,
    lastTouchTeam: 'right',
    lastTouchPlayerId: 'opp_2',
    lastTouchWasBlock: false,
    humanId: 'p1',
    difficulty: 'medium',
    tick: 145,
    oppTouchesOnSide: 2,
    oppAttackerPos: { x: 1.05, y: 1.1, z: 0 },
    oppAttackerVelY: 0.2,
    oppAttackerActionState: 'spike',
    oppAttackerJumping: true,
  });
  assert.equal(jumpBlock.intendedRole, 'blocker');
  assert.equal(jumpBlock.jump, true, 'P2 must jump at exact timing near net to block enemy spike');
  assert.equal(jumpBlock.spike, false);
});

test('AI Block Balancing: enforces 0.2s–0.5s ReactionDelay and 60% BlockSuccessRate (40% open_parallel or wrong_timing)', () => {
  // 1) Caso de sucesso (roll >= 0.40 -> 60% de chance), mas bloqueado durante o ReactionDelay (0.2s a 0.5s)
  const successMgr = new EnemyTeamManager(() => 0.75);
  const evalEarly = successMgr.evaluateBlockAttempt(false, 0.05);
  assert.equal(evalEarly.willSucceed, true);
  assert.ok(evalEarly.reactionDelaySec >= 0.2 && evalEarly.reactionDelaySec <= 0.5);
  assert.equal(evalEarly.readyToJump, false, 'Must wait ReactionDelay (0.2s–0.5s) before jumping to block');

  const evalReady = successMgr.evaluateBlockAttempt(false, 0.45);
  assert.equal(evalReady.readyToJump, true, 'After ReactionDelay expires, blocker is ready to jump');

  // 2) Caso de falha (roll < 0.40 -> 40% de chance de errar o bloqueio: open_parallel ou wrong_timing)
  const failMgr = new EnemyTeamManager(() => 0.2);
  const evalFail = failMgr.evaluateBlockAttempt(false, 0.55);
  assert.equal(evalFail.willSucceed, false);
  assert.ok(
    evalFail.failureMode === 'wrong_timing' || evalFail.failureMode === 'open_parallel',
    `Expected wrong_timing or open_parallel failure mode, got ${evalFail.failureMode}`,
  );
});

test('Allied Bot Reception Parity: tracks and receives deep court balls using same predictBallLandingX precision as Enemy AI', () => {
  // Bola viajando fundo na quadra esquerda (x = -8.5m), humano longe na rede (x = -1.5m), Bot Aliado perto (x = -6.8m)
  const recDeep = decideAlliedPartnerAction({
    partnerPos: { x: -6.8, y: 0, z: 0 },
    partnerVelY: 0,
    partnerTeam: 'left',
    partnerCanHit: true,
    humanPos: { x: -1.5, y: 0, z: 0 },
    humanJumping: false,
    humanStunned: false,
    ballPos: { x: -6.5, y: 2.2, z: 0 },
    ballVel: { x: -4.2, y: -2.0, z: 0 },
    touchesOnSide: 0,
    lastTouchTeam: 'right',
    lastTouchPlayerId: 'opp_1',
    lastTouchWasBlock: false,
    humanId: 'p1',
    difficulty: 'medium',
    tick: 50,
  });
  assert.equal(recDeep.intendedRole, 'receiver');
  assert.equal(recDeep.jump, false);
  assert.equal(recDeep.spike, false);
  assert.ok(recDeep.moveX < -0.5, `Allied Bot must sprint toward deep predicted landing point (got moveX=${recDeep.moveX})`);
});

test('AI Difficulty System (Iniciante, Avançado, Classe Mundial): scales ReactionDelay, BlockSuccessRate (20% / 60% / 90%), and MoveSpeed', () => {
  // Roll = 0.50:
  // - Iniciante (BlockSuccessRate 20% -> threshold 0.80): roll 0.50 < 0.80 -> FALHA no bloqueio!
  // - Avançado (BlockSuccessRate 60% -> threshold 0.40): roll 0.50 >= 0.40 -> SUCESSO no bloqueio!
  // - Classe Mundial (BlockSuccessRate 90% -> threshold 0.10): roll 0.50 >= 0.10 -> SUCESSO no bloqueio!
  const easyMgr = new EnemyTeamManager(() => 0.50);
  easyMgr.setDifficulty('easy');
  const easyMults = easyMgr.getBotMultipliers();
  assert.equal(easyMults.blockSuccessRate, 0.20);
  assert.ok(easyMults.reactionDelaySec > 0.70, 'Iniciante must have high ReactionDelay (~0.85s)');
  assert.ok(easyMults.moveSpeedMultiplier < 0.85, 'Iniciante must have reduced movement speed (0.72x)');

  const easyEval = easyMgr.evaluateBlockAttempt(false, 0.30, 'easy');
  assert.equal(easyEval.willSucceed, false, 'Roll 0.50 must fail block on Iniciante (20% success rate)');
  assert.equal(easyEval.readyToJump, false, '0.30s is still within Iniciante ReactionDelay');

  const mediumMgr = new EnemyTeamManager(() => 0.50);
  mediumMgr.setDifficulty('medium');
  const medMults = mediumMgr.getBotMultipliers();
  assert.equal(medMults.blockSuccessRate, 0.60);
  assert.equal(medMults.reactionDelaySec, 0.50);
  assert.equal(medMults.moveSpeedMultiplier, 1.0);
  const medEval = mediumMgr.evaluateBlockAttempt(false, 0.55, 'medium');
  assert.equal(medEval.willSucceed, true, 'Roll 0.50 must succeed block on Avançado (60% success rate)');
  assert.equal(medEval.readyToJump, true);

  const hardMgr = new EnemyTeamManager(() => 0.15);
  hardMgr.setDifficulty('hard');
  const hardMults = hardMgr.getBotMultipliers();
  assert.equal(hardMults.blockSuccessRate, 0.90);
  assert.equal(hardMults.reactionDelaySec, 0.10, 'Classe Mundial must have near-zero ReactionDelay (0.10s)');
  assert.ok(hardMults.moveSpeedMultiplier > 1.2, 'Classe Mundial must have maximum movement speed (1.25x)');
  assert.ok(hardMults.spikePrecision >= 0.95, 'Classe Mundial must have high spike precision');

  const hardEval = hardMgr.evaluateBlockAttempt(false, 0.12, 'hard');
  assert.equal(hardEval.willSucceed, true, 'Roll 0.15 must succeed block on Classe Mundial (90% success rate)');
  assert.equal(hardEval.readyToJump, true, '0.12s exceeds Classe Mundial ReactionDelay (0.10s)');
});

