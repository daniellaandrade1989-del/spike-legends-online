import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultKeyBindings,
  formatKeyCode,
  GAME_ACTION_META,
  isActionPressed,
  matchesActionKey,
  rebindAction,
  sanitizeKeyBindings,
  type GameActionId,
} from './keyBindings.ts';

test('default key bindings cover every action metadata entry with unique keys', () => {
  const defaults = createDefaultKeyBindings();
  const keys = new Set<string>();
  for (const meta of GAME_ACTION_META) {
    const code = defaults.actions[meta.id];
    assert.ok(code && code.length > 0, `Action ${meta.id} must have a default key`);
    assert.equal(keys.has(code), false, `Duplicate default key ${code}`);
    keys.add(code);
  }
});

test('rebindAction swaps keys cleanly on conflict and updates key matching', () => {
  const initial = createDefaultKeyBindings();
  assert.equal(matchesActionKey(initial, 'spike', 'KeyJ'), true);

  // Remapeia Cortar (KeyJ) para KeyZ
  const custom = rebindAction(initial, 'spike', 'KeyZ');
  assert.equal(custom.actions.spike, 'KeyZ');
  assert.equal(matchesActionKey(custom, 'spike', 'KeyZ'), true);
  assert.equal(matchesActionKey(custom, 'spike', 'KeyJ'), false);

  // Remapeia Receber (KeyR) para Espaço (conflita com Pular) -> Pular recebe KeyR
  const swapped = rebindAction(custom, 'receive', 'Space');
  assert.equal(swapped.actions.receive, 'Space');
  assert.equal(swapped.actions.jump, 'KeyR');
  assert.equal(matchesActionKey(swapped, 'jump', 'KeyR'), true);
  assert.equal(matchesActionKey(swapped, 'receive', 'Space'), true);
});

test('secondary aliases defer when explicitly bound to another action', () => {
  let cfg = createDefaultKeyBindings();
  // Por padrão ArrowLeft aciona moveLeft
  assert.equal(isActionPressed(cfg, 'moveLeft', new Set(['ArrowLeft'])), true);

  // Se o jogador mapear ArrowLeft para Cortar (spike), moveLeft não dispara mais com ArrowLeft
  cfg = rebindAction(cfg, 'spike', 'ArrowLeft');
  assert.equal(matchesActionKey(cfg, 'spike', 'ArrowLeft'), true);
  assert.equal(isActionPressed(cfg, 'moveLeft', new Set(['ArrowLeft'])), false);
});

test('formatKeyCode formats keys in readable Portuguese labels and sanitize recovers invalid data', () => {
  assert.equal(formatKeyCode('Space'), 'Espaço');
  assert.equal(formatKeyCode('ShiftLeft'), 'Shift Esq.');
  assert.equal(formatKeyCode('KeyJ'), 'J');
  assert.equal(formatKeyCode('Digit3'), '3');
  assert.equal(formatKeyCode('ArrowRight'), 'Seta →');
  assert.equal(formatKeyCode('Mouse0'), 'Mouse Esq. (LMB)');
  assert.equal(formatKeyCode('Mouse2'), 'Mouse Dir. (RMB)');

  const recovered = sanitizeKeyBindings({
    actions: { spike: 'KeyZ', receive: 'KeyZ' } as Partial<Record<GameActionId, string>>,
    mouseEnabled: false,
    mouseSteerEnabled: true,
    touchHandedness: 'left',
  });
  assert.equal(recovered.actions.spike, 'KeyZ');
  assert.notEqual(recovered.actions.receive, 'KeyZ');
  assert.equal(recovered.mouseEnabled, false);
  assert.equal(recovered.mouseSteerEnabled, true);
  assert.equal(recovered.touchHandedness, 'left');
});
