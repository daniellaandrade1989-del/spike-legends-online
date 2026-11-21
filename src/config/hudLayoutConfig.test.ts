import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampHudTransform,
  DEFAULT_HUD_LAYOUT,
  getButtonFixedStyle,
  HUD_BUTTON_ORDER,
} from './hudLayoutConfig';

test('DEFAULT_HUD_LAYOUT defines normalized percentage coordinates for all 7 touch buttons', () => {
  assert.equal(HUD_BUTTON_ORDER.length, 7);
  for (const id of HUD_BUTTON_ORDER) {
    const t = DEFAULT_HUD_LAYOUT[id];
    assert.ok(t.x >= 4 && t.x <= 96, `${id}.x out of bounds: ${t.x}`);
    assert.ok(t.y >= 8 && t.y <= 94, `${id}.y out of bounds: ${t.y}`);
    assert.equal(t.scale, 1.0);
  }
});

test('clampHudTransform clamps percentage coordinates and scale within safe screen bounds', () => {
  const clamped = clampHudTransform({ x: -15, y: 120, scale: 2.5 });
  assert.equal(clamped.x, 4);
  assert.equal(clamped.y, 94);
  assert.equal(clamped.scale, 1.45);

  const clampedMin = clampHudTransform({ x: 50.126, y: 80.987, scale: 0.2 });
  assert.equal(clampedMin.x, 50.13);
  assert.equal(clampedMin.y, 80.99);
  assert.equal(clampedMin.scale, 0.65);
});

test('getButtonFixedStyle returns exact normalized percentage CSS style', () => {
  const style = getButtonFixedStyle({ x: 25.5, y: 82, scale: 1.15 });
  assert.equal(style.position, 'fixed');
  assert.equal(style.left, '25.5%');
  assert.equal(style.top, '82%');
  assert.equal(style.transform, 'translate(-50%, -50%) scale(1.15)');
  assert.equal(style.touchAction, 'none');
});
