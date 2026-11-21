/**
 * Spike Legends Online — PlayerAnimatorController (Máquina de Estados Visual & Rig 2D/2.5D)
 *
 * Controla as transições (Triggers e Bools) entre os estados visuais exclusivos do voleibol
 * tradicional escutando os eventos da State Machine principal (OnServe, OnReceive, OnSet,
 * OnSpike, OnBlock), SEM alterar física, regras ou IA.
 *
 * Guia de Vínculo de Sprites / Clips no Motor Gráfico (Three.js AnimationClip ou SpriteSheet):
 * Veja o mapa `ANIMATION_ASSET_SLOTS` abaixo para saber exatamente onde cada arquivo de sprite,
 * textura de frame ou `THREE.AnimationClip` individual deve ser conectado.
 */
import { COURT, type CharacterAnimState, type PlayerActionState } from '../config/gameConfig.ts';

export type AnimatorTriggerName =
  | 'OnServeToss'
  | 'OnServeRunup'
  | 'OnServe'
  | 'OnReceive'
  | 'OnSet'
  | 'OnSpike'
  | 'OnBlock';

export type AnimatorBoolName =
  | 'IsGrounded'
  | 'IsMoving'
  | 'IsDiving'
  | 'IsAirborne'
  | 'IsJumpServing';

export type VisualAnimState = CharacterAnimState | 'serve_runup';

export type JumpServePhase = 'none' | 'toss' | 'runup_jump' | 'hit';
export type SpikeAnimPhase = 'none' | 'windup' | 'impact_snap' | 'follow_through';
export type SetAnimPhase = 'none' | 'cup_load' | 'finger_push';
export type ReceiveAnimPhase = 'none' | 'crouch_lock' | 'lever_lift';
export type AnimeFacialExpression = 'normal' | 'intense' | 'focus';

export interface AnimationAssetLinkSlot {
  readonly state: VisualAnimState;
  readonly trigger?: AnimatorTriggerName;
  readonly clipName: string;
  readonly spriteSheetId: string;
  readonly frameCount: number;
  readonly resolutionDpi: '1024x1024_HD_ANIME';
  readonly defaultExpression: AnimeFacialExpression;
  readonly hasActionTrail: boolean;
  readonly durationSec: number;
  readonly loop: boolean;
  /** Instrução exata de onde linkar o Sprite/AnimationClip individual no motor gráfico */
  readonly graphicEngineLinkNote: string;
}

/**
 * ============================================================================
 * MAPA DE VÍNCULO DE SPRITES HD ANIME 2D/2.5D E ANIMAÇÕES ESQUELÉTICAS
 * ============================================================================
 * Substitui integralmente qualquer referência pixelada antiga por folhas de
 * animação (Sprite Sheets HD 1024x1024 + Rig Esquelético 2.5D Cel-Shaded).
 */
export const ANIMATION_ASSET_SLOTS: Record<VisualAnimState, AnimationAssetLinkSlot> = {
  idle: {
    state: 'idle',
    clipName: 'AnimeHD_Shonen_Idle_Ready',
    spriteSheetId: 'shonen_hd_idle_sheet_8f',
    frameCount: 8,
    resolutionDpi: '1024x1024_HD_ANIME',
    defaultExpression: 'normal',
    hasActionTrail: false,
    durationSec: 1.0,
    loop: true,
    graphicEngineLinkNote: '[ANIME HD 1024px / RIG 2.5D]: Pose atlética pronta (joelheiras visíveis, tênis cano alto, respiração fluida)',
  },
  run: {
    state: 'run',
    clipName: 'AnimeHD_Shonen_Run_Cycle',
    spriteSheetId: 'shonen_hd_run_sheet_10f',
    frameCount: 10,
    resolutionDpi: '1024x1024_HD_ANIME',
    defaultExpression: 'focus',
    hasActionTrail: false,
    durationSec: 0.45,
    loop: true,
    graphicEngineLinkNote: '[ANIME HD 1024px / RIG 2.5D]: Corrida explosiva shonen com inclinação aerodinâmica e mechas dinâmicas',
  },
  jump: {
    state: 'jump',
    clipName: 'AnimeHD_Shonen_Airborne_Apex',
    spriteSheetId: 'shonen_hd_jump_sheet_6f',
    frameCount: 6,
    resolutionDpi: '1024x1024_HD_ANIME',
    defaultExpression: 'focus',
    hasActionTrail: true,
    durationSec: 0.5,
    loop: false,
    graphicEngineLinkNote: '[ANIME HD 1024px / RIG 2.5D]: Impulsão vertical shonen com arqueamento dorsal (bow-and-arrow)',
  },
  dive: {
    state: 'dive',
    clipName: 'AnimeHD_Shonen_Slide_Peixinho',
    spriteSheetId: 'shonen_hd_dive_sheet_6f',
    frameCount: 6,
    resolutionDpi: '1024x1024_HD_ANIME',
    defaultExpression: 'focus',
    hasActionTrail: true,
    durationSec: 0.34,
    loop: false,
    graphicEngineLinkNote: '[ANIME HD 1024px / RIG 2.5D]: Mergulho defensivo / Peixinho rasante com linhas de velocidade',
  },
  preparing_serve: {
    state: 'preparing_serve',
    clipName: 'AnimeHD_PreparingServe_HoldBall',
    spriteSheetId: 'shonen_hd_preparing_serve_sheet_6f',
    frameCount: 6,
    resolutionDpi: '1024x1024_HD_ANIME',
    defaultExpression: 'focus',
    hasActionTrail: false,
    durationSec: 0.6,
    loop: true,
    graphicEngineLinkNote:
      '[ANIME HD 1024px — PREPARING SERVE (HOLD TO CHARGE)]: Personagem concentrado segurando a bola e carregando força antes do saque',
  },
  serve_toss: {
    state: 'serve_toss',
    trigger: 'OnServeToss',
    clipName: 'AnimeHD_JumpServe_Phase1_Toss',
    spriteSheetId: 'shonen_hd_serve_toss_sheet_6f',
    frameCount: 6,
    resolutionDpi: '1024x1024_HD_ANIME',
    defaultExpression: 'focus',
    hasActionTrail: false,
    durationSec: 0.28,
    loop: false,
    graphicEngineLinkNote:
      '[ANIME HD 1024px — SAQUE VIAGEM FASE 1 (TOSS)]: Atrás da linha de fundo, lançando a bola alto com olhar focado',
  },
  serve_runup: {
    state: 'serve_runup',
    trigger: 'OnServeRunup',
    clipName: 'AnimeHD_JumpServe_Phase2_RunupAndJump',
    spriteSheetId: 'shonen_hd_serve_runup_sheet_8f',
    frameCount: 8,
    resolutionDpi: '1024x1024_HD_ANIME',
    defaultExpression: 'intense',
    hasActionTrail: true,
    durationSec: 0.32,
    loop: false,
    graphicEngineLinkNote:
      '[ANIME HD 1024px — SAQUE VIAGEM FASE 2 (RUN-UP & JUMP)]: Passada dupla explosiva + salto com rastro de velocidade',
  },
  serve: {
    state: 'serve',
    trigger: 'OnServe',
    clipName: 'AnimeHD_JumpServe_Phase3_Hit',
    spriteSheetId: 'shonen_hd_serve_hit_sheet_8f',
    frameCount: 8,
    resolutionDpi: '1024x1024_HD_ANIME',
    defaultExpression: 'intense',
    hasActionTrail: true,
    durationSec: 0.36,
    loop: false,
    graphicEngineLinkNote:
      '[ANIME HD 1024px — SAQUE VIAGEM FASE 3 (HIT)]: Chicote aéreo com arco luminoso de ataque e expressão feroz',
  },
  bump: {
    state: 'bump',
    trigger: 'OnReceive',
    clipName: 'AnimeHD_Receive_Manchete',
    spriteSheetId: 'shonen_hd_bump_sheet_6f',
    frameCount: 6,
    resolutionDpi: '1024x1024_HD_ANIME',
    defaultExpression: 'focus',
    hasActionTrail: false,
    durationSec: 0.3,
    loop: false,
    graphicEngineLinkNote:
      '[ANIME HD 1024px — DEFESA / MANCHETE (1º TOQUE)]: Base baixa com joelheiras flexionadas, antebraços unidos e alavanca limpa',
  },
  set: {
    state: 'set',
    trigger: 'OnSet',
    clipName: 'AnimeHD_Set_HighSet_Concha',
    spriteSheetId: 'shonen_hd_set_sheet_6f',
    frameCount: 6,
    resolutionDpi: '1024x1024_HD_ANIME',
    defaultExpression: 'focus',
    hasActionTrail: false,
    durationSec: 0.34,
    loop: false,
    graphicEngineLinkNote:
      '[ANIME HD 1024px — LEVANTAMENTO (2º TOQUE)]: Mãos esculpidas acima da testa em concha + impulsão elástica',
  },
  spike: {
    state: 'spike',
    trigger: 'OnSpike',
    clipName: 'AnimeHD_Spike_BowAndWhip',
    spriteSheetId: 'shonen_hd_spike_sheet_8f',
    frameCount: 8,
    resolutionDpi: '1024x1024_HD_ANIME',
    defaultExpression: 'intense',
    hasActionTrail: true,
    durationSec: 0.3,
    loop: false,
    graphicEngineLinkNote:
      '[ANIME HD 1024px — ATAQUE / CORTADA]: Arco dorsal máximo no ar + chicote explosivo com rastro de lâmina anime',
  },
  shark_attack: {
    state: 'shark_attack',
    trigger: 'OnSpike',
    clipName: 'AnimeHD_SharkAttack_Foot',
    spriteSheetId: 'shonen_hd_shark_sheet_6f',
    frameCount: 6,
    resolutionDpi: '1024x1024_HD_ANIME',
    defaultExpression: 'intense',
    hasActionTrail: true,
    durationSec: 0.32,
    loop: false,
    graphicEngineLinkNote: '[ANIME HD 1024px]: Golpe acrobático de pé (Shark Attack) com rastro de corte',
  },
  header: {
    state: 'header',
    trigger: 'OnSpike',
    clipName: 'AnimeHD_Header_Attack',
    spriteSheetId: 'shonen_hd_header_sheet_6f',
    frameCount: 6,
    resolutionDpi: '1024x1024_HD_ANIME',
    defaultExpression: 'intense',
    hasActionTrail: true,
    durationSec: 0.28,
    loop: false,
    graphicEngineLinkNote: '[ANIME HD 1024px]: Cabeceio ofensivo shonen',
  },
  block: {
    state: 'block',
    trigger: 'OnBlock',
    clipName: 'AnimeHD_Block_NetInvasion',
    spriteSheetId: 'shonen_hd_block_sheet_6f',
    frameCount: 6,
    resolutionDpi: '1024x1024_HD_ANIME',
    defaultExpression: 'intense',
    hasActionTrail: true,
    durationSec: 0.42,
    loop: false,
    graphicEngineLinkNote:
      '[ANIME HD 1024px — BLOQUEIO NA REDE]: Parede vertical acima da fita com braços esticados e aura defensiva',
  },
  failed_bump: {
    state: 'failed_bump',
    trigger: 'OnReceive',
    clipName: 'AnimeHD_Receive_FalhaManchete',
    spriteSheetId: 'shonen_hd_failed_bump_sheet_6f',
    frameCount: 6,
    resolutionDpi: '1024x1024_HD_ANIME',
    defaultExpression: 'intense',
    hasActionTrail: false,
    durationSec: 0.42,
    loop: false,
    graphicEngineLinkNote:
      '[ANIME HD 1024px — FALHA DE MANCHETE]: Postura em pé firme absorvendo recuo pesado',
  },
  stunned: {
    state: 'stunned',
    clipName: 'AnimeHD_GuardBreak_Stun',
    spriteSheetId: 'shonen_hd_stun_sheet_6f',
    frameCount: 6,
    resolutionDpi: '1024x1024_HD_ANIME',
    defaultExpression: 'intense',
    hasActionTrail: false,
    durationSec: 0.6,
    loop: true,
    graphicEngineLinkNote: '[ANIME HD 1024px]: Atordoamento pós Guard Break',
  },
  celebrate: {
    state: 'celebrate',
    clipName: 'AnimeHD_Point_Celebrate',
    spriteSheetId: 'shonen_hd_celebrate_sheet_8f',
    frameCount: 8,
    resolutionDpi: '1024x1024_HD_ANIME',
    defaultExpression: 'normal',
    hasActionTrail: false,
    durationSec: 0.8,
    loop: true,
    graphicEngineLinkNote: '[ANIME HD 1024px]: Comemoração vibrante após ponto',
  },
  lose: {
    state: 'lose',
    clipName: 'AnimeHD_Match_Defeat',
    spriteSheetId: 'shonen_hd_lose_sheet_6f',
    frameCount: 6,
    resolutionDpi: '1024x1024_HD_ANIME',
    defaultExpression: 'focus',
    hasActionTrail: false,
    durationSec: 1.0,
    loop: true,
    graphicEngineLinkNote: '[ANIME HD 1024px]: Reação ao fim do set',
  },
};

export interface StateMachineSyncInput {
  anim: CharacterAnimState;
  actionState: PlayerActionState;
  vx: number;
  y: number;
  x?: number;
  isGrounded?: boolean;
  ballY?: number;
}

export interface ResolvedAnimatorFrame {
  visualState: VisualAnimState;
  stateTimer: number;
  normalizedTime: number;
  currentFrameIndex: number;
  totalFrames: number;
  expression: AnimeFacialExpression;
  trailIntensity: number;
  slashArcActive: boolean;
  servePhase: JumpServePhase;
  spikePhase: SpikeAnimPhase;
  setPhase: SetAnimPhase;
  receivePhase: ReceiveAnimPhase;
  isBehindServeLine: boolean;
  activeClipSlot: AnimationAssetLinkSlot;
  lastTriggerFired: AnimatorTriggerName | null;
}

/**
 * AnimatorController dedicado que espelha a State Machine principal e gerencia
 * Triggers, Bools e fases de animação do vôlei tradicional.
 */
export class PlayerAnimatorController {
  private currentState: VisualAnimState = 'idle';
  private stateTimer = 0;
  private lockTimer = 0;

  private triggers = new Set<AnimatorTriggerName>();
  private bools: Record<AnimatorBoolName, boolean> = {
    IsGrounded: true,
    IsMoving: false,
    IsDiving: false,
    IsAirborne: false,
    IsJumpServing: false,
  };

  private prevAnim: CharacterAnimState = 'idle';
  private prevActionState: PlayerActionState = 'idle';
  private lastTriggerFired: AnimatorTriggerName | null = null;
  private isBehindServeLine = false;
  private spikeImpactTriggered = false;
  private clipRegistry = new Map<VisualAnimState, unknown>();

  /**
   * Permite registrar um `THREE.AnimationClip` ou sprite-sheet customizado para qualquer estado.
   */
  public registerClipAsset(state: VisualAnimState, asset: unknown): void {
    this.clipRegistry.set(state, asset);
  }

  public getRegisteredClipAsset(state: VisualAnimState): unknown {
    return this.clipRegistry.get(state) ?? null;
  }

  public SetTrigger(trigger: AnimatorTriggerName): void {
    this.triggers.add(trigger);
    this.lastTriggerFired = trigger;
  }

  public ResetTrigger(trigger: AnimatorTriggerName): void {
    this.triggers.delete(trigger);
  }

  public HasPendingTrigger(trigger: AnimatorTriggerName): boolean {
    return this.triggers.has(trigger);
  }

  public SetBool(name: AnimatorBoolName, value: boolean): void {
    this.bools[name] = value;
  }

  public GetBool(name: AnimatorBoolName): boolean {
    return this.bools[name];
  }

  public getLastTriggerFired(): AnimatorTriggerName | null {
    return this.lastTriggerFired;
  }

  // =========================================================================
  // LISTENERS DA STATE MACHINE PRINCIPAL (OnServe, OnReceive, OnSet, OnSpike, OnBlock)
  // =========================================================================
  public OnServeToss(): void {
    this.SetBool('IsJumpServing', true);
    this.SetTrigger('OnServeToss');
  }

  public OnServeRunup(): void {
    this.SetBool('IsJumpServing', true);
    this.SetTrigger('OnServeRunup');
  }

  public OnServe(isJumpServe = false): void {
    this.SetBool('IsJumpServing', isJumpServe);
    this.SetTrigger('OnServe');
  }

  public OnReceive(): void {
    this.SetTrigger('OnReceive');
  }

  public OnSet(): void {
    this.SetTrigger('OnSet');
  }

  public OnSpike(): void {
    this.spikeImpactTriggered = true;
    this.SetTrigger('OnSpike');
  }

  public OnBlock(): void {
    this.SetTrigger('OnBlock');
  }

  public reset(): void {
    this.currentState = 'idle';
    this.stateTimer = 0;
    this.lockTimer = 0;
    this.triggers.clear();
    this.lastTriggerFired = null;
    this.prevAnim = 'idle';
    this.prevActionState = 'idle';
    this.spikeImpactTriggered = false;
    this.SetBool('IsGrounded', true);
    this.SetBool('IsMoving', false);
    this.SetBool('IsDiving', false);
    this.SetBool('IsAirborne', false);
    this.SetBool('IsJumpServing', false);
  }

  /**
   * Sincroniza Bools e detecta transições da State Machine principal sem interferir na física.
   */
  public syncFromStateMachine(input: StateMachineSyncInput): void {
    const isGrounded = input.isGrounded ?? input.y <= 0.05;
    const isMoving = isGrounded && Math.abs(input.vx) > 0.6;
    const isDiving = input.anim === 'dive' || input.actionState === 'slide_dive';
    const isAirborne = !isGrounded;
    this.isBehindServeLine =
      typeof input.x === 'number' ? Math.abs(input.x) >= COURT.HALF_WIDTH - 0.1 : this.isBehindServeLine;

    this.SetBool('IsGrounded', isGrounded);
    this.SetBool('IsMoving', isMoving);
    this.SetBool('IsDiving', isDiving);
    this.SetBool('IsAirborne', isAirborne);

    // Transição automática para Fases 1 & 2 do Saque Viagem
    if (input.anim === 'serve_toss' && this.prevAnim !== 'serve_toss') {
      this.OnServeToss();
    } else if (
      input.anim === 'serve_toss' &&
      this.currentState === 'serve_toss' &&
      (this.stateTimer >= 0.2 || !isGrounded || Math.abs(input.vx) > 0.85)
    ) {
      // Fase 2 (Run-up 2 passadas + Salto vertical) antes do golpe no ar
      this.OnServeRunup();
    }

    if (input.anim === 'serve' && this.prevAnim !== 'serve') {
      this.OnServe(!isGrounded || this.bools.IsJumpServing);
    }
    if (input.anim === 'bump' && this.prevAnim !== 'bump') {
      this.OnReceive();
    }
    if (input.anim === 'set' && this.prevAnim !== 'set') {
      this.OnSet();
    }
    if (
      (input.anim === 'spike' || input.anim === 'shark_attack' || input.anim === 'header') &&
      this.prevAnim !== input.anim
    ) {
      this.OnSpike();
    }
    if (input.anim === 'block' && this.prevAnim !== 'block') {
      this.OnBlock();
    }

    // Estados de controle direto quando não há Trigger one-shot travando
    if (this.triggers.size === 0 && this.lockTimer <= 0) {
      if (input.anim === 'stunned' || input.anim === 'celebrate' || input.anim === 'lose') {
        this.enterState(input.anim, 0);
      } else if (isDiving) {
        this.enterState('dive', 0.28);
      } else if (input.anim === 'preparing_serve' || input.actionState === 'preparing_serve') {
        this.enterState('preparing_serve', 0);
      } else if (input.anim === 'serve_toss') {
        if (this.currentState !== 'serve_toss' && this.currentState !== 'serve_runup') {
          this.enterState('serve_toss', 0.22);
        }
      } else if (input.anim === 'block') {
        this.enterState('block', 0.16);
      } else if (input.anim === 'shark_attack' || input.anim === 'header') {
        this.enterState(input.anim, 0.24);
      } else if (isAirborne) {
        if (
          this.currentState !== 'serve_runup' &&
          this.currentState !== 'serve' &&
          this.currentState !== 'spike' &&
          this.currentState !== 'block'
        ) {
          this.enterState('jump', 0);
        }
      } else {
        this.SetBool('IsJumpServing', false);
        this.spikeImpactTriggered = false;
        this.enterState(isMoving ? 'run' : 'idle', 0);
      }
    }

    this.prevAnim = input.anim;
    this.prevActionState = input.actionState;
  }

  private enterState(next: VisualAnimState, lockDurationSec: number): void {
    if (this.currentState !== next) {
      this.currentState = next;
      this.stateTimer = 0;
    }
    if (lockDurationSec > 0) {
      this.lockTimer = Math.max(this.lockTimer, lockDurationSec);
    }
  }

  /**
   * Consome Triggers pendentes seguindo a prioridade da máquina de estados visual
   * e avança os temporizadores de quadro.
   */
  public update(dt: number): void {
    const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0;
    this.stateTimer += safeDt;
    if (this.lockTimer > 0) {
      this.lockTimer = Math.max(0, this.lockTimer - safeDt);
    }

    if (this.triggers.has('OnServe')) {
      this.triggers.delete('OnServe');
      this.enterState('serve', ANIMATION_ASSET_SLOTS.serve.durationSec);
    } else if (this.triggers.has('OnServeRunup')) {
      this.triggers.delete('OnServeRunup');
      this.enterState('serve_runup', ANIMATION_ASSET_SLOTS.serve_runup.durationSec);
    } else if (this.triggers.has('OnServeToss')) {
      this.triggers.delete('OnServeToss');
      this.enterState('serve_toss', ANIMATION_ASSET_SLOTS.serve_toss.durationSec);
    } else if (this.triggers.has('OnSpike')) {
      this.triggers.delete('OnSpike');
      const target =
        this.prevAnim === 'shark_attack' || this.prevAnim === 'header' ? this.prevAnim : 'spike';
      this.enterState(target, ANIMATION_ASSET_SLOTS[target].durationSec);
    } else if (this.triggers.has('OnBlock')) {
      this.triggers.delete('OnBlock');
      this.enterState('block', ANIMATION_ASSET_SLOTS.block.durationSec);
    } else if (this.triggers.has('OnSet')) {
      this.triggers.delete('OnSet');
      this.enterState('set', ANIMATION_ASSET_SLOTS.set.durationSec);
    } else if (this.triggers.has('OnReceive')) {
      this.triggers.delete('OnReceive');
      this.enterState('bump', ANIMATION_ASSET_SLOTS.bump.durationSec);
    }

    if (this.lockTimer <= 0) {
      if (this.currentState === 'serve' || this.currentState === 'spike' || this.currentState === 'block') {
        if (this.bools.IsAirborne) {
          this.enterState('jump', 0);
        } else {
          this.SetBool('IsJumpServing', false);
          this.enterState(this.bools.IsMoving ? 'run' : 'idle', 0);
        }
      } else if (
        this.currentState === 'bump' ||
        this.currentState === 'set' ||
        this.currentState === 'dive' ||
        this.currentState === 'shark_attack' ||
        this.currentState === 'header'
      ) {
        this.enterState(this.bools.IsAirborne ? 'jump' : this.bools.IsMoving ? 'run' : 'idle', 0);
      }
    }
  }

  public getResolvedState(): ResolvedAnimatorFrame {
    const slot = ANIMATION_ASSET_SLOTS[this.currentState];
    const normalizedTime =
      slot.durationSec > 0 ? Math.min(1, Math.max(0, this.stateTimer / slot.durationSec)) : 0;

    let servePhase: JumpServePhase = 'none';
    if (this.currentState === 'serve_toss') servePhase = 'toss';
    else if (this.currentState === 'serve_runup') servePhase = 'runup_jump';
    else if (this.currentState === 'serve') servePhase = 'hit';

    let spikePhase: SpikeAnimPhase = 'none';
    if (this.currentState === 'spike') {
      if (!this.spikeImpactTriggered && normalizedTime < 0.24) spikePhase = 'windup';
      else if (normalizedTime < 0.68) spikePhase = 'impact_snap';
      else spikePhase = 'follow_through';
    } else if (this.currentState === 'jump' && this.bools.IsAirborne) {
      spikePhase = 'windup';
    }

    let setPhase: SetAnimPhase = 'none';
    if (this.currentState === 'set') {
      setPhase = normalizedTime < 0.36 ? 'cup_load' : 'finger_push';
    }

    let receivePhase: ReceiveAnimPhase = 'none';
    if (this.currentState === 'bump') {
      receivePhase = normalizedTime < 0.32 ? 'crouch_lock' : 'lever_lift';
    }

    const totalFrames = slot.frameCount;
    const cycleNorm = slot.loop && slot.durationSec > 0
      ? ((this.stateTimer % slot.durationSec) / slot.durationSec)
      : normalizedTime;
    const currentFrameIndex = Math.min(totalFrames - 1, Math.max(0, Math.floor(cycleNorm * totalFrames)));

    let trailIntensity = 0;
    if (this.currentState === 'spike' || this.currentState === 'serve') {
      trailIntensity = 1.0;
    } else if (this.currentState === 'serve_runup' || this.currentState === 'block') {
      trailIntensity = 0.85;
    } else if (this.currentState === 'dive' || this.currentState === 'shark_attack' || this.currentState === 'header') {
      trailIntensity = 0.75;
    } else if (this.currentState === 'jump') {
      trailIntensity = 0.45;
    }

    const slashArcActive =
      this.currentState === 'spike' ||
      this.currentState === 'serve' ||
      this.currentState === 'shark_attack';

    return {
      visualState: this.currentState,
      stateTimer: this.stateTimer,
      normalizedTime,
      currentFrameIndex,
      totalFrames,
      expression: slot.defaultExpression,
      trailIntensity,
      slashArcActive,
      servePhase,
      spikePhase,
      setPhase,
      receivePhase,
      isBehindServeLine: this.isBehindServeLine,
      activeClipSlot: slot,
      lastTriggerFired: this.lastTriggerFired,
    };
  }
}

