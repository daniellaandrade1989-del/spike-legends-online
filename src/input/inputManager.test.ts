import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultKeyBindings,
  createMouseOnlyBindings,
  rebindAction,
} from '../config/keyBindings.ts';
import {
  detectMobilePlatform,
  InputManager,
  mouseButtonToCode,
} from './inputManager.ts';

test('InputManager supports free LMB/RMB (Mouse0/Mouse2) mapping and held states', () => {
  const mgr = new InputManager();
  let cfg = createDefaultKeyBindings();

  // Remapeia Pular para Mouse2 (RMB) e Cortar para Mouse0 (LMB)
  cfg = rebindAction(cfg, 'jump', mouseButtonToCode(2)!);
  cfg = rebindAction(cfg, 'spike', mouseButtonToCode(0)!);

  assert.equal(cfg.actions.jump, 'Mouse2');
  assert.equal(cfg.actions.spike, 'Mouse0');

  // Pressiona e mantém RMB -> jump e jumpHeld ficam ativos
  mgr.handleMouseDown(2, cfg);
  const frame1 = mgr.consumeFrameInput(cfg);
  assert.equal(frame1.jump, true);
  assert.equal(frame1.jumpHeld, true);
  assert.equal(frame1.spike, false);

  // Frame seguinte ainda segurando RMB -> jump edge limpa, mas jumpHeld continua true!
  const frame2 = mgr.consumeFrameInput(cfg);
  assert.equal(frame2.jump, false);
  assert.equal(frame2.jumpHeld, true);

  // Solta RMB -> jumpHeld vira false
  mgr.handleMouseUp(2);
  const frame3 = mgr.consumeFrameInput(cfg);
  assert.equal(frame3.jumpHeld, false);

  // LMB dispara Cortar (spike)
  mgr.handleMouseDown(0, cfg);
  const frame4 = mgr.consumeFrameInput(cfg);
  assert.equal(frame4.spike, true);
});

test('InputManager allows mouse-only preset with cursor steering + LMB + RMB', () => {
  const mgr = new InputManager();
  const mouseOnly = createMouseOnlyBindings();

  assert.equal(mouseOnly.mouseSteerEnabled, true);
  assert.equal(mouseOnly.actions.spike, 'Mouse0');
  assert.equal(mouseOnly.actions.jump, 'Mouse2');

  mgr.setMouseSteerDirection(0.85);
  mgr.setMouseWorldPos(6.4, 1.8);
  mgr.handleMouseDown(0, mouseOnly);
  const frame = mgr.consumeFrameInput(mouseOnly);

  assert.ok(Math.abs(frame.moveX - 0.85) < 1e-6);
  assert.equal(frame.spike, true);
  assert.deepEqual(frame.mouseWorldPos, { x: 6.4, y: 1.8 });
});

test('InputManager distinguishes quick tap (<220ms) vs hold (>=220ms) for Dual Serve', () => {
  const mgr = new InputManager();
  const cfg = createDefaultKeyBindings();

  // Clique rápido (< 220ms) -> serveQuickTap = true
  mgr.handleKeyDown('KeyJ', cfg, 1000);
  mgr.handleKeyUp('KeyJ', 1110);
  const tapFrame = mgr.consumeFrameInput(cfg, undefined, 1120);
  assert.equal(tapFrame.serveQuickTap, true);
  assert.equal(tapFrame.serveJumpCharge, false);

  // Segurar (>= 220ms) -> serveJumpCharge = true, soltar depois não dispara serveQuickTap
  mgr.handleKeyDown('KeyJ', cfg, 2000);
  const holdFrame = mgr.consumeFrameInput(cfg, undefined, 2260);
  assert.equal(holdFrame.spikeHeld, true);
  assert.equal(holdFrame.serveJumpCharge, true);
  assert.equal(holdFrame.serveQuickTap, false);

  mgr.handleKeyUp('KeyJ', 2310);
  const releaseFrame = mgr.consumeFrameInput(cfg, undefined, 2320);
  assert.equal(releaseFrame.serveQuickTap, false);
});

test('InputManager maps mobile virtual Left/Right directional buttons to horizontal moveX', () => {
  const mgr = new InputManager();
  const cfg = createDefaultKeyBindings();

  const touchState = {
    moveX: 0,
    moveZ: 0,
    moveLeftHeld: true,
    moveRightHeld: false,
    jumpQueued: false,
    jumpHeld: false,
    spikeQueued: false,
    diveQueued: false,
    receiveQueued: false,
    ultimateQueued: false,
  };

  const leftFrame = mgr.consumeFrameInput(cfg, touchState);
  assert.equal(leftFrame.moveX, -1, 'Holding mobile Left button must drive moveX = -1');

  touchState.moveLeftHeld = false;
  touchState.moveRightHeld = true;
  const rightFrame = mgr.consumeFrameInput(cfg, touchState);
  assert.equal(rightFrame.moveX, 1, 'Holding mobile Right button must drive moveX = +1');

  touchState.moveRightHeld = false;
  mgr.setMobileMoveButton('left', true);
  assert.equal(mgr.consumeFrameInput(cfg, touchState).moveX, -1);
  mgr.setMobileMoveButton('left', false);
  assert.equal(mgr.consumeFrameInput(cfg, touchState).moveX, 0);
});

test('detectMobilePlatform and unified OnPointerDown/OnPointerUp touch abstraction', () => {
  // 1) Detecção automática de plataforma Mobile vs PC
  assert.equal(
    detectMobilePlatform({
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36',
      maxTouchPoints: 5,
      coarsePointer: true,
    }),
    true,
    'Android device must set isMobile = true',
  );
  assert.equal(
    detectMobilePlatform({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      maxTouchPoints: 5,
      coarsePointer: true,
    }),
    true,
    'iOS device must set isMobile = true',
  );
  assert.equal(
    detectMobilePlatform({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
      maxTouchPoints: 0,
      coarsePointer: false,
    }),
    false,
    'Windows Web PC must set isMobile = false',
  );

  // 2) Abstração unificada: OnPointerDown / OnPointerUp alimentam exatamente as mesmas variáveis do teclado
  const mgr = new InputManager();
  const cfg = createDefaultKeyBindings();

  mgr.OnPointerDown('moveRight');
  mgr.OnPointerDown('jump');
  mgr.OnPointerDown('spike', undefined, 500);
  const f1 = mgr.consumeFrameInput(cfg, undefined, 520);
  assert.equal(f1.horizontalInput, 1);
  assert.equal(f1.moveX, 1);
  assert.equal(f1.jump, true);
  assert.equal(f1.jumpHeld, true);
  assert.equal(f1.spike, true);

  mgr.OnPointerUp('moveRight');
  mgr.OnPointerUp('jump');
  mgr.OnPointerUp('spike', undefined, 580);
  const f2 = mgr.consumeFrameInput(cfg, undefined, 600);
  assert.equal(f2.horizontalInput, 0);
  assert.equal(f2.moveX, 0);
  assert.equal(f2.jumpHeld, false);
  assert.equal(f2.serveQuickTap, true);
});

test('InputManager Hold-to-Charge Serve timer (Max 1.5s) evaluates Por Baixo (0.0s-0.3s), Flutuante (0.4s-1.0s), and Viagem (1.1s-1.5s)', () => {
  const mgr = new InputManager();
  const cfg = createDefaultKeyBindings();

  assert.equal(mgr.timeForUnderhand, 0.3);
  assert.equal(mgr.timeForFloat, 1.0);
  assert.equal(mgr.timeForJumpServe, 1.1);
  assert.equal(mgr.maxServeChargeTime, 1.5);

  // 1) Soltar entre 0.0s e 0.3s (Toque Rápido, ex: 0.2s) -> Saque Por Baixo ('underhand' + 'serve_underhand_quick')
  mgr.handleKeyDown('KeyF', cfg, 1000);
  const holdUnderhand = mgr.consumeFrameInput(cfg, undefined, 1100);
  assert.equal(holdUnderhand.preparingServe, true);
  assert.ok(Math.abs((holdUnderhand.serveChargeTime ?? 0) - 0.1) < 1e-6);
  assert.equal(holdUnderhand.serveChargeStage, 'underhand');
  mgr.handleKeyUp('KeyF', 1200);
  const releaseUnderhand = mgr.consumeFrameInput(cfg, undefined, 1210);
  assert.equal(releaseUnderhand.preparingServe, false);
  assert.equal(releaseUnderhand.serveChargeTime, 0);
  assert.ok(Math.abs((releaseUnderhand.serveReleaseChargeTime ?? 0) - 0.2) < 1e-6);
  assert.equal(releaseUnderhand.serveChargeStage, 'underhand');
  assert.equal(releaseUnderhand.hybridCommand, 'serve_underhand_quick');
  assert.equal(mgr.chargeTime, 0);

  // 2) Soltar entre 0.4s e 1.0s (Charge Médio, ex: 0.7s) -> Saque Flutuante ('float' + 'serve_float_medium')
  mgr.handleKeyDown('KeyF', cfg, 3000);
  const holdFloat = mgr.consumeFrameInput(cfg, undefined, 3600);
  assert.equal(holdFloat.preparingServe, true);
  assert.equal(holdFloat.serveChargeStage, 'float');
  mgr.handleKeyUp('KeyF', 3700);
  const releaseFloat = mgr.consumeFrameInput(cfg, undefined, 3710);
  assert.equal(releaseFloat.preparingServe, false);
  assert.ok(Math.abs((releaseFloat.serveReleaseChargeTime ?? 0) - 0.7) < 1e-6);
  assert.equal(releaseFloat.serveChargeStage, 'float');
  assert.equal(releaseFloat.hybridCommand, 'serve_float_medium');
  assert.equal(mgr.chargeTime, 0);

  // 3) Soltar acima de 1.1s (Charge Máximo, ex: 1.8s limitado a 1.5s) -> Saque Viagem ('jump_serve' + 'serve_jump_max')
  mgr.OnPointerDown('spike', undefined, 6000);
  const holdJump = mgr.consumeFrameInput(cfg, undefined, 7300);
  assert.equal(holdJump.preparingServe, true);
  assert.equal(holdJump.serveChargeStage, 'jump_serve');
  mgr.OnPointerUp('spike', undefined, 7800);
  const releaseJump = mgr.consumeFrameInput(cfg, undefined, 7810);
  assert.equal(releaseJump.preparingServe, false);
  assert.ok(Math.abs((releaseJump.serveReleaseChargeTime ?? 0) - 1.5) < 1e-6, 'Serve charge must cap at 1.5s');
  assert.equal(releaseJump.serveChargeStage, 'jump_serve');
  assert.equal(releaseJump.hybridCommand, 'serve_jump_max');
  assert.equal(mgr.chargeTime, 0);
});

test('Contextual & Directional Input System: simultaneous KeyF + Directional Axes evaluates Neutral, Down Short, and Back Deep without multi-tap delay', () => {
  const mgr = new InputManager();
  const cfg = createDefaultKeyBindings();

  // 1) Pressionar 'F' sozinho (Neutro): lê imediatamente directionalCombo = 'neutral' sem esperar 2º/3º toque
  mgr.handleKeyDown('KeyF', cfg, 1000);
  const neutralFrame = mgr.consumeFrameInput(cfg, undefined, 1016, 0.016, 'left');
  assert.equal(neutralFrame.spike, true);
  assert.equal(neutralFrame.directionalCombo, 'neutral');
  mgr.handleKeyUp('KeyF', 1050);
  mgr.consumeFrameInput(cfg, undefined, 1066, 0.016, 'left');

  // 2) Pressionar 'F' + Seta para BAIXO ('KeyS' / 'ArrowDown'): lê directionalCombo = 'down_short' (Super Ataque / Bloqueio Curto)
  mgr.handleKeyDown('ArrowDown', cfg, 2000);
  mgr.handleKeyDown('KeyF', cfg, 2010);
  const downShortFrame = mgr.consumeFrameInput(cfg, undefined, 2020, 0.016, 'left');
  assert.equal(downShortFrame.downHeld, true);
  assert.equal(downShortFrame.verticalInput, -1);
  assert.equal(downShortFrame.directionalCombo, 'down_short');
  mgr.handleKeyUp('KeyF', 2060);
  mgr.handleKeyUp('ArrowDown', 2070);
  mgr.consumeFrameInput(cfg, undefined, 2080, 0.016, 'left');

  // 3) Pressionar 'F' + Seta para TRÁS ('KeyA' / 'ArrowLeft' para time 'left'): lê directionalCombo = 'back_deep' (Super Ataque / Bloqueio Fundo de Quadra)
  mgr.handleKeyDown('ArrowLeft', cfg, 3000);
  mgr.handleKeyDown('KeyF', cfg, 3010);
  const backDeepFrame = mgr.consumeFrameInput(cfg, undefined, 3020, 0.016, 'left');
  assert.equal(backDeepFrame.moveX, -1);
  assert.equal(backDeepFrame.directionalCombo, 'back_deep');
  mgr.handleKeyUp('KeyF', 3060);
  mgr.handleKeyUp('ArrowLeft', 3070);
});


