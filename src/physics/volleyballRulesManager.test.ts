import test from 'node:test';
import assert from 'node:assert/strict';
import { VolleyballRulesManager } from './volleyballRulesManager.ts';

test('VolleyballRulesManager enforces 3-touch limit and flags 4th touch fault', () => {
  const rules = new VolleyballRulesManager({ targetPoints: 15 });

  assert.equal(rules.registerTouch('p1', 'left').teamTouches, 1);
  assert.equal(rules.registerTouch('p2', 'left').teamTouches, 2);
  assert.equal(rules.registerTouch('p1', 'left').teamTouches, 3);

  const fourth = rules.registerTouch('p2', 'left');
  assert.equal(fourth.allowed, false);
  assert.equal(fourth.fault, 'four_touches');
  assert.equal(fourth.scoringTeam, 'right');
  assert.equal(fourth.callout, '4 TOQUES! FALTA!');
});

test('VolleyballRulesManager enforces Double Contact and exempts official Block touch', () => {
  const rules = new VolleyballRulesManager();

  // Jogador P1 toca 2x seguidas -> Dois Toques!
  assert.equal(rules.registerTouch('p1', 'left').allowed, true);
  assert.equal(rules.getLastPlayerToTouch(), 'p1');
  const dbl = rules.registerTouch('p1', 'left');
  assert.equal(dbl.allowed, false);
  assert.equal(dbl.fault, 'double_contact');
  assert.equal(dbl.scoringTeam, 'right');
  assert.equal(dbl.callout, 'DOIS TOQUES! FALTA!');

  // Bloqueio NÃO conta como toque oficial e permite que o mesmo bloqueador faça o 1º toque seguinte
  rules.resetRallyState('right');
  assert.equal(rules.getLastPlayerToTouch(), null);
  const blk = rules.registerTouch('p1', 'left', { isBlock: true });
  assert.equal(blk.allowed, true);
  assert.equal(blk.teamTouches, 0);
  assert.equal(blk.lastTouchWasBlock, true);
  assert.equal(blk.lastPlayerToTouch, null);

  const afterBlock = rules.registerTouch('p1', 'left');
  assert.equal(afterBlock.allowed, true);
  assert.equal(afterBlock.teamTouches, 1);
  assert.equal(rules.getLastPlayerToTouch(), 'p1');
});

test('VolleyballRulesManager allows net contact (Net Fault removed) and enforces Penetration Fault', () => {
  const rules = new VolleyballRulesManager();

  const net = rules.checkNetFault('left', true);
  assert.equal(net.isFault, false, 'Net contact must no longer award a fault/point');
  assert.equal(net.fault, undefined);
  assert.equal(net.scoringTeam, undefined);

  // Cruzamento parcial abaixo do raio NÃO é invasão completa
  assert.equal(rules.checkPenetrationFault('left', 0.25, 0.44).isFault, false);
  // Cruzamento completo do centro (x - radius > 0.04) É invasão!
  const pen = rules.checkPenetrationFault('left', 0.52, 0.44);
  assert.equal(pen.isFault, true);
  assert.equal(pen.fault, 'penetration_fault');
  assert.equal(pen.scoringTeam, 'right');
  assert.equal(pen.callout, 'INVASÃO! FALTA!');
});

test('VolleyballRulesManager resolves In/Out including on-line touches on 25m court and 15/21 rally scoring', () => {
  const rules15 = new VolleyballRulesManager({ targetPoints: 15 });
  // Bola exatamente sobre a linha de fundo da quadra expandida (12.55m com raio 0.225m) é Bola Dentro!
  const onLine = rules15.resolveCourtLanding(12.55, 0, 'left', 0.225);
  assert.equal(onLine.inBounds, true);
  assert.equal(onLine.scoringTeam, 'left');
  assert.equal(onLine.callout, 'BOLA DENTRO!');

  const out = rules15.resolveCourtLanding(13.5, 0, 'left', 0.225);
  assert.equal(out.inBounds, false);
  assert.equal(out.scoringTeam, 'right');
  assert.equal(out.callout, 'BOLA FORA!');

  // 15 pontos com diferença mínima de 2
  assert.equal(rules15.checkWinner(15, 13), 'left');
  assert.equal(rules15.checkWinner(15, 14), null);
  assert.equal(rules15.checkWinner(16, 14), 'left');

  // Modo 21 pontos com empate 20-20 -> 22-20
  const rules21 = new VolleyballRulesManager({ targetPoints: 21 });
  assert.equal(rules21.checkWinner(21, 19), 'left');
  assert.equal(rules21.checkWinner(21, 20), null);
  assert.equal(rules21.checkWinner(22, 20), 'left');

  // OutZone atribui ponto imediatamente ao time adversário de lastPlayerToTouch
  rules15.resetRallyState('right');
  rules15.registerTouch('p1_team1', 'left');
  const outFromP1 = rules15.resolveOutZoneFault((id) => (id === 'p1_team1' ? 'left' : 'right'));
  assert.equal(outFromP1.inBounds, false);
  assert.equal(outFromP1.scoringTeam, 'right');
  assert.equal(outFromP1.callout, 'BOLA FORA!');

  // awardPoint inicia rotina de timer para transição automática ao próximo saque
  rules15.awardPoint('right');
  assert.equal(rules15.tickPointTransition(0.5).ready, false);
  const done = rules15.tickPointTransition(1.0);
  assert.equal(done.ready, true);
  assert.equal(done.servingTeam, 'right');
});

test('VolleyballRulesManager is1v1Mode allows up to 3 consecutive touches in 1v1 and enforces Double Contact in 2v2', () => {
  const rules = new VolleyballRulesManager({ is1v1Mode: true });
  assert.equal(rules.is1v1Mode, true);

  // Em "1x1 Puro" (is1v1Mode = true), o mesmo jogador pode tocar 3 vezes seguidas sem falta de Dois Toques
  assert.equal(rules.registerTouch('p1', 'left').allowed, true);
  assert.equal(rules.registerTouch('p1', 'left').allowed, true);
  assert.equal(rules.registerTouch('p1', 'left').allowed, true);

  // O 4º toque continua sendo falta de 4 toques
  const fourth = rules.registerTouch('p1', 'left');
  assert.equal(fourth.allowed, false);
  assert.equal(fourth.fault, 'four_touches');

  // Em "2x2 (Com Parceiros IA)" (is1v1Mode = false), o 2º toque seguido pelo mesmo jogador é falta imediata
  rules.set1v1Mode(false);
  rules.resetRallyState('left');
  assert.equal(rules.is1v1Mode, false);
  assert.equal(rules.registerTouch('p1', 'left').allowed, true);
  const secondTouch = rules.registerTouch('p1', 'left');
  assert.equal(secondTouch.allowed, false);
  assert.equal(secondTouch.fault, 'double_contact');
  assert.equal(secondTouch.callout, 'DOIS TOQUES! FALTA!');
});



