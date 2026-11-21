import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANIMATION_ASSET_SLOTS,
  PlayerAnimatorController,
} from './playerAnimatorController.ts';
import { COURT } from '../config/gameConfig.ts';

describe('PlayerAnimatorController (Volleyball Visual State Machine)', () => {
  it('gerencia SetTrigger, ResetTrigger, SetBool e GetBool corretamente', () => {
    const anim = new PlayerAnimatorController();

    assert.equal(anim.GetBool('IsGrounded'), true);
    anim.SetBool('IsAirborne', true);
    assert.equal(anim.GetBool('IsAirborne'), true);

    anim.SetTrigger('OnSpike');
    assert.equal(anim.HasPendingTrigger('OnSpike'), true);
    assert.equal(anim.getLastTriggerFired(), 'OnSpike');

    anim.ResetTrigger('OnSpike');
    assert.equal(anim.HasPendingTrigger('OnSpike'), false);
  });

  it('executa as 3 fases exclusivas do Saque Viagem atrás da linha (Toss -> Run-up 2 passadas & Salto -> Hit)', () => {
    const anim = new PlayerAnimatorController();
    const serveX = -(COURT.HALF_WIDTH + 0.8);

    // Fase 1: Toss atrás da linha de fundo
    anim.syncFromStateMachine({
      anim: 'serve_toss',
      actionState: 'serve_toss',
      vx: 0,
      y: 0,
      x: serveX,
      isGrounded: true,
    });
    anim.update(0.05);
    let resolved = anim.getResolvedState();
    assert.equal(resolved.visualState, 'serve_toss');
    assert.equal(resolved.servePhase, 'toss');
    assert.equal(resolved.isBehindServeLine, true);
    assert.equal(anim.GetBool('IsJumpServing'), true);

    // Fase 2: Run-up (2 passadas + impulso vertical) quando começa a correr/subir
    anim.syncFromStateMachine({
      anim: 'serve_toss',
      actionState: 'serve_toss',
      vx: 2.2,
      y: 0.4,
      x: serveX + 0.3,
      isGrounded: false,
    });
    anim.update(0.08);
    resolved = anim.getResolvedState();
    assert.equal(resolved.visualState, 'serve_runup');
    assert.equal(resolved.servePhase, 'runup_jump');

    // Fase 3: Hit no ar (braço atrás -> chicote para frente)
    anim.syncFromStateMachine({
      anim: 'serve',
      actionState: 'serve',
      vx: 1.5,
      y: 1.4,
      x: -(COURT.HALF_WIDTH + 0.2),
      isGrounded: false,
    });
    anim.update(0.05);
    resolved = anim.getResolvedState();
    assert.equal(resolved.visualState, 'serve');
    assert.equal(resolved.servePhase, 'hit');
    assert.equal(resolved.lastTriggerFired, 'OnServe');
  });

  it('aciona Defesa/Manchete (crouch_lock -> lever_lift) via OnReceive no 1º toque', () => {
    const anim = new PlayerAnimatorController();
    anim.OnReceive();
    anim.update(0.04);

    let resolved = anim.getResolvedState();
    assert.equal(resolved.visualState, 'bump');
    assert.equal(resolved.receivePhase, 'crouch_lock');

    anim.update(0.14);
    resolved = anim.getResolvedState();
    assert.equal(resolved.visualState, 'bump');
    assert.equal(resolved.receivePhase, 'lever_lift');
  });

  it('aciona Levantamento (cup_load -> finger_push) via OnSet no 2º toque', () => {
    const anim = new PlayerAnimatorController();
    anim.OnSet();
    anim.update(0.05);

    let resolved = anim.getResolvedState();
    assert.equal(resolved.visualState, 'set');
    assert.equal(resolved.setPhase, 'cup_load');

    anim.update(0.16);
    resolved = anim.getResolvedState();
    assert.equal(resolved.visualState, 'set');
    assert.equal(resolved.setPhase, 'finger_push');
  });

  it('executa preparação em arco no ar (windup) e explode para frente no clique/impacto (OnSpike)', () => {
    const anim = new PlayerAnimatorController();

    // Subida no ar antes do clique
    anim.syncFromStateMachine({
      anim: 'jump',
      actionState: 'airborne',
      vx: 1.2,
      y: 1.35,
      x: -2.0,
      isGrounded: false,
    });
    anim.update(0.05);
    let resolved = anim.getResolvedState();
    assert.equal(resolved.visualState, 'jump');
    assert.equal(resolved.spikePhase, 'windup');

    // Clique do mouse dispara OnSpike no milissegundo do impacto
    anim.OnSpike();
    anim.update(0.04);
    resolved = anim.getResolvedState();
    assert.equal(resolved.visualState, 'spike');
    assert.equal(resolved.spikePhase, 'impact_snap');

    anim.update(0.22);
    resolved = anim.getResolvedState();
    assert.equal(resolved.visualState, 'spike');
    assert.equal(resolved.spikePhase, 'follow_through');
  });

  it('aciona Bloqueio vertical na rede via OnBlock e garante que todos os estados usam Sprites/Clips HD Anime 1024x1024 sem traços pixelados', () => {
    const anim = new PlayerAnimatorController();
    anim.SetBool('IsAirborne', true);
    anim.SetBool('IsGrounded', false);
    anim.OnBlock();
    anim.update(0.05);

    const resolved = anim.getResolvedState();
    assert.equal(resolved.visualState, 'block');
    assert.equal(resolved.activeClipSlot.clipName, 'AnimeHD_Block_NetInvasion');
    assert.equal(resolved.activeClipSlot.resolutionDpi, '1024x1024_HD_ANIME');
    assert.equal(resolved.expression, 'intense');
    assert.ok(resolved.trailIntensity >= 0.8);

    const dummyClip = { name: 'Custom_Spike_Clip' };
    anim.registerClipAsset('spike', dummyClip);
    assert.equal(anim.getRegisteredClipAsset('spike'), dummyClip);

    for (const slot of Object.values(ANIMATION_ASSET_SLOTS)) {
      assert.ok(slot.clipName.startsWith('AnimeHD_'));
      assert.equal(slot.resolutionDpi, '1024x1024_HD_ANIME');
      assert.ok(slot.frameCount >= 6);
      assert.ok(slot.graphicEngineLinkNote.includes('[ANIME HD 1024px'));
    }
  });
});

