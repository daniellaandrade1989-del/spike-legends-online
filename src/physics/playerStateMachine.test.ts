import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerActionStateMachine, PlayerController } from './playerStateMachine.ts';
import { PHYSICS } from '../config/gameConfig.ts';

test('PlayerActionStateMachine validates transitions and locks actions during Guard Break stun', () => {
  const fsm = new PlayerActionStateMachine();
  assert.equal(fsm.getState(), 'idle');
  assert.equal(fsm.startReceiveWindow(0.25), true);
  assert.equal(fsm.getState(), 'receive_ready');
  assert.equal(fsm.startJump(), true);
  assert.equal(fsm.getState(), 'airborne');
  assert.equal(fsm.canApplyJumpBoost(), true);
  assert.equal(fsm.startAttack('shark_attack'), true);
  assert.equal(fsm.getState(), 'shark_attack');
  assert.equal(fsm.toAnimState(), 'shark_attack');

  // Guard Break bloqueia transições por 2 segundos até expirar
  fsm.triggerGuardBreak(2.0);
  assert.equal(fsm.isStunned(), true);
  assert.equal(fsm.getState(), 'stunned');
  assert.equal(fsm.startJump(), false);
  assert.equal(fsm.startAttack('spike'), false);

  fsm.update(1.2, true, 0);
  assert.equal(fsm.isStunned(), true);
  fsm.update(0.9, true, 0);
  assert.equal(fsm.isStunned(), false);
  assert.equal(fsm.getState(), 'idle');
});

test('PlayerController evaluates receive windows across Iniciante (500ms), Avançado (200ms), and Classe Mundial (50ms)', () => {
  const ctrl = new PlayerController({ attack: 100, defense: 100, jump: 100, speed: 100 });

  assert.equal(ctrl.evaluateReceive(420, 'easy', 0.6).quality, 'perfect');
  assert.equal(ctrl.evaluateReceive(420, 'medium', 0.6).quality, 'good');
  assert.equal(ctrl.evaluateReceive(170, 'medium', 0.6).quality, 'perfect');
  assert.equal(ctrl.evaluateReceive(45, 'hard', 0.6).quality, 'perfect');
  assert.equal(ctrl.evaluateReceive(450, 'hard', 0.6).quality, 'imprecise');

  // Bola distante dispara peixinho automaticamente
  assert.equal(ctrl.evaluateReceive(100, 'medium', 2.4).triggerDive, true);
  assert.equal(ctrl.evaluateReceive(100, 'medium', 0.4).triggerDive, false);
});

test('PlayerController applies RPG attributes to movement, jump, attack, and Guard Break', () => {
  const starter = new PlayerController({ attack: 95, defense: 95, jump: 95, speed: 95 });
  const legend = new PlayerController({ attack: 140, defense: 140, jump: 140, speed: 140 });

  assert.ok(legend.getAttackMultiplier() > starter.getAttackMultiplier());
  assert.ok(legend.getBaseJumpVelocity() > starter.getBaseJumpVelocity());
  assert.ok(legend.getReceiveHitboxRadius() > starter.getReceiveHitboxRadius());
  assert.ok(legend.getMaxHorizontalSpeed(false) > starter.getMaxHorizontalSpeed(false));

  // Areia desacelera menos instantaneamente (inércia) que quadra após soltar tecla
  const sandStep = starter.computeInertialVelocity(6.0, 0, { moveX: 0, moveZ: 0, sprint: false }, true, 0.05);
  const courtStep = starter.computeInertialVelocity(6.0, 0, { moveX: 0, moveZ: 0, sprint: false }, false, 0.05);
  assert.ok(sandStep.vx > courtStep.vx, 'Sand inertia should carry more residual drift before stopping');

  // Corte Perfeito no ápice + direção de mira
  const apexEval = legend.evaluateAttack({
    playerY: 1.45,
    playerVy: 0.4,
    playerZ: 0,
    ballY: 2.5,
    moveX: -0.8,
    moveZ: 0,
    team: 'left',
    preferFoot: true,
  });
  assert.equal(apexEval.isPerfectApex, true);
  assert.equal(apexEval.aim, 'dink');
  assert.equal(apexEval.style, 'shark_attack');

  // Guard Break dispara em Classe Mundial com bola >90% mal recebida
  assert.equal(starter.checkGuardBreak(0.95, 'imprecise', 'hard'), true);
  assert.equal(starter.fsm.getStunTimer(), PHYSICS.GUARD_BREAK_STUN_SEC);
});

test('Super Attack buff boosts stats for exact 5.0 seconds and expires cleanly', () => {
  const ctrl = new PlayerController({ attack: 100, defense: 100, jump: 100, speed: 100 });
  const baseAtk = ctrl.getAttackMultiplier();
  const baseJump = ctrl.getBaseJumpVelocity();
  const baseSpeed = ctrl.getMaxHorizontalSpeed(false);

  ctrl.activateSuperAttack(PHYSICS.SUPER_ATTACK_DURATION);
  assert.equal(ctrl.isSuperAttackActive(), true);
  assert.equal(ctrl.getSuperAttackRemaining(), 5.0);
  assert.ok(ctrl.getAttackMultiplier() > baseAtk);
  assert.ok(ctrl.getBaseJumpVelocity() > baseJump);
  assert.ok(ctrl.getMaxHorizontalSpeed(false) > baseSpeed);

  ctrl.updateTimers(3.0);
  assert.equal(ctrl.isSuperAttackActive(), true);
  assert.ok(Math.abs(ctrl.getSuperAttackRemaining() - 2.0) < 1e-6);

  ctrl.updateTimers(2.1);
  assert.equal(ctrl.isSuperAttackActive(), false);
  assert.equal(ctrl.getSuperAttackRemaining(), 0);
  assert.equal(ctrl.getAttackMultiplier(), baseAtk);
});

test('PlayerActionStateMachine supports distinct Serve Toss, Serve, Bump (Manchete), and Set (Toque) states', () => {
  const fsm = new PlayerActionStateMachine();

  assert.equal(fsm.startServeToss(0.4), true);
  assert.equal(fsm.getState(), 'serve_toss');
  assert.equal(fsm.toAnimState(), 'serve_toss');

  assert.equal(fsm.startServe(0.32), true);
  assert.equal(fsm.getState(), 'serve');
  assert.equal(fsm.toAnimState(), 'serve');

  fsm.update(0.4, true, 0);
  assert.equal(fsm.getState(), 'idle');

  assert.equal(fsm.startBump(0.28), true);
  assert.equal(fsm.getState(), 'bump');
  assert.equal(fsm.toAnimState(), 'bump');

  fsm.update(0.32, true, 0);
  assert.equal(fsm.getState(), 'idle');

  assert.equal(fsm.startSet(0.34), true);
  assert.equal(fsm.getState(), 'set');
  assert.equal(fsm.toAnimState(), 'set');
});
