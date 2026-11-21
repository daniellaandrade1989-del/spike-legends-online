/**
 * Spike Legends Online — Máquina de Estados e Controlador RPG do Jogador
 * Gerencia transições determinísticas entre Recepção, Salto Escalonado, Bloqueio,
 * Ataque (Spike, Shark Attack, Cabeceio) e Guard Break (atordoamento).
 */
import {
  COURT,
  DIFFICULTY_TUNING,
  PHYSICS,
  type AiDifficulty,
  type AimDirection,
  type CharacterAnimState,
  type CharacterStats,
  type PlayerActionState,
  type ReceiveQuality,
  type ServeType,
  type TeamSide,
} from '../config/gameConfig.ts';
import { PlayerStatsManager, type RpgStatLevels } from '../rpg/playerStatsManager.ts';

export const DEFAULT_CHARACTER_STATS: CharacterStats = {
  attack: 100,
  defense: 100,
  jump: 100,
  speed: 100,
};

/**
 * Estados proibidos de queda/tombamento: removidos e bloqueados definitivamente.
 */
export const BLOCKED_KNOCKDOWN_STATES = new Set<string>([
  'knockdown',
  'ragdoll',
  'derrubado',
  'fallen',
  'collapse',
]);

/**
 * Mapa de transições válidas entre estados de ação do atleta.
 */
const VALID_TRANSITIONS: Record<PlayerActionState, ReadonlyArray<PlayerActionState>> = {
  idle: ['idle', 'move', 'preparing_serve', 'serve_toss', 'serve', 'bump', 'set', 'receive_ready', 'slide_dive', 'jump_charge', 'airborne', 'attack_windup', 'spike', 'shark_attack', 'header', 'failed_bump', 'stunned', 'celebrate', 'lose'],
  move: ['idle', 'move', 'preparing_serve', 'serve_toss', 'serve', 'bump', 'set', 'receive_ready', 'slide_dive', 'jump_charge', 'airborne', 'attack_windup', 'spike', 'shark_attack', 'header', 'failed_bump', 'stunned', 'celebrate', 'lose'],
  preparing_serve: ['idle', 'move', 'preparing_serve', 'serve_toss', 'serve', 'jump_charge', 'airborne', 'spike', 'failed_bump', 'stunned', 'celebrate', 'lose'],
  serve_toss: ['idle', 'move', 'preparing_serve', 'serve_toss', 'serve', 'spike', 'jump_charge', 'airborne', 'failed_bump', 'stunned', 'celebrate', 'lose'],
  serve: ['idle', 'move', 'preparing_serve', 'serve', 'spike', 'airborne', 'failed_bump', 'stunned', 'celebrate', 'lose'],
  bump: ['idle', 'move', 'bump', 'set', 'receive_ready', 'slide_dive', 'jump_charge', 'airborne', 'attack_windup', 'spike', 'shark_attack', 'header', 'block', 'failed_bump', 'stunned', 'celebrate', 'lose'],
  set: ['idle', 'move', 'set', 'bump', 'receive_ready', 'jump_charge', 'airborne', 'attack_windup', 'spike', 'shark_attack', 'header', 'block', 'failed_bump', 'stunned', 'celebrate', 'lose'],
  receive_ready: ['idle', 'move', 'bump', 'set', 'receive_ready', 'slide_dive', 'jump_charge', 'airborne', 'failed_bump', 'stunned', 'celebrate', 'lose'],
  slide_dive: ['idle', 'move', 'slide_dive', 'failed_bump', 'stunned', 'celebrate', 'lose'],
  jump_charge: ['idle', 'move', 'airborne', 'serve', 'block', 'failed_bump', 'stunned', 'celebrate', 'lose'],
  airborne: ['idle', 'move', 'airborne', 'serve', 'set', 'attack_windup', 'spike', 'shark_attack', 'header', 'block', 'failed_bump', 'stunned', 'celebrate', 'lose'],
  attack_windup: ['idle', 'airborne', 'spike', 'shark_attack', 'header', 'failed_bump', 'stunned', 'celebrate', 'lose'],
  spike: ['idle', 'move', 'airborne', 'set', 'failed_bump', 'stunned', 'celebrate', 'lose'],
  shark_attack: ['idle', 'move', 'airborne', 'set', 'failed_bump', 'stunned', 'celebrate', 'lose'],
  header: ['idle', 'move', 'airborne', 'set', 'failed_bump', 'stunned', 'celebrate', 'lose'],
  block: ['idle', 'move', 'airborne', 'set', 'spike', 'failed_bump', 'stunned', 'celebrate', 'lose'],
  failed_bump: ['idle', 'move', 'airborne', 'failed_bump', 'celebrate', 'lose'],
  stunned: ['idle', 'failed_bump', 'stunned', 'celebrate', 'lose'],
  celebrate: ['celebrate', 'idle'],
  lose: ['lose', 'idle'],
};

export interface ReceiveEvaluation {
  quality: ReceiveQuality;
  hitboxRadius: number;
  windowUsedMs: number;
  triggerDive: boolean;
}

export interface AttackEvaluation {
  style: 'spike' | 'shark_attack' | 'header';
  aim: AimDirection;
  isPerfectApex: boolean;
  powerRatio: number;
  targetZ: number;
  targetDepthX: number;
}

/**
 * Máquina de Estados Finita (FSM) responsável pelas transições de ação do jogador.
 */
export class PlayerActionStateMachine {
  private state: PlayerActionState = 'idle';
  private stateTimer = 0;
  private stunTimer = 0;
  private receiveWindowTimer = 0;
  private diveTimer = 0;
  private jumpHoldTimer = 0;
  private attackLockTimer = 0;
  private actionPoseTimer = 0;
  private isJumpHeld = false;

  public getState(): PlayerActionState {
    return this.state;
  }

  public getStateTimer(): number {
    return this.stateTimer;
  }

  public getStunTimer(): number {
    return this.stunTimer;
  }

  public getReceiveWindowTimer(): number {
    return this.receiveWindowTimer;
  }

  public getDiveTimer(): number {
    return this.diveTimer;
  }

  public isStunned(): boolean {
    return this.state === 'stunned' && this.stunTimer > 0;
  }

  public isReceiving(): boolean {
    return this.state === 'receive_ready' || this.receiveWindowTimer > 0 || this.state === 'slide_dive';
  }

  public isAttacking(): boolean {
    return (
      this.state === 'spike' ||
      this.state === 'shark_attack' ||
      this.state === 'header' ||
      this.attackLockTimer > 0
    );
  }

  /** Travamento estrito: impede qualquer estado de Knockdown/Ragdoll/Derrubado */
  public readonly freezeRotationZ = true;
  public readonly allowKnockdown = false;

  public canTransition(next: PlayerActionState | string): boolean {
    if (BLOCKED_KNOCKDOWN_STATES.has(next)) {
      return false;
    }
    if (!(next in VALID_TRANSITIONS)) {
      return false;
    }
    if (this.isStunned() && next !== 'stunned' && next !== 'failed_bump' && next !== 'celebrate' && next !== 'lose') {
      return false;
    }
    return VALID_TRANSITIONS[this.state].includes(next as PlayerActionState);
  }

  public transitionTo(next: PlayerActionState | string, force = false): boolean {
    if (BLOCKED_KNOCKDOWN_STATES.has(next) || !(next in VALID_TRANSITIONS)) {
      return false;
    }
    const typedNext = next as PlayerActionState;
    if (!force && !this.canTransition(typedNext)) {
      return false;
    }
    if (this.state !== typedNext) {
      this.state = typedNext;
      this.stateTimer = 0;
    }
    return true;
  }

  public startReceiveWindow(durationSec: number): boolean {
    if (!this.transitionTo('receive_ready')) return false;
    this.receiveWindowTimer = Math.max(this.receiveWindowTimer, durationSec);
    return true;
  }

  public startSlideDive(durationSec: number = PHYSICS.PLAYER_DIVE_DURATION): boolean {
    if (!this.transitionTo('slide_dive')) return false;
    this.diveTimer = durationSec;
    this.receiveWindowTimer = Math.max(this.receiveWindowTimer, durationSec);
    return true;
  }

  public startJump(): boolean {
    if (!this.transitionTo('airborne')) return false;
    this.actionPoseTimer = 0;
    this.jumpHoldTimer = 0;
    this.isJumpHeld = true;
    return true;
  }

  public releaseJumpHold(): void {
    this.isJumpHeld = false;
  }

  public canApplyJumpBoost(): boolean {
    return this.isJumpHeld && this.state === 'airborne' && this.jumpHoldTimer < PHYSICS.PLAYER_JUMP_HOLD_MAX;
  }

  public startBlock(): boolean {
    if (!this.transitionTo('block')) return false;
    this.actionPoseTimer = 0;
    return true;
  }

  public startPreparingServe(durationSec = 0.25): boolean {
    if (!this.transitionTo('preparing_serve')) return false;
    this.actionPoseTimer = Math.max(this.actionPoseTimer, durationSec);
    return true;
  }

  public startServeToss(durationSec = 0.45): boolean {
    if (!this.transitionTo('serve_toss')) return false;
    this.actionPoseTimer = Math.max(this.actionPoseTimer, durationSec);
    return true;
  }

  public startJumpServeToss(durationSec = 0.45): boolean {
    return this.startServeToss(durationSec);
  }

  public startServe(durationSec = 0.34): boolean {
    if (!this.transitionTo('serve')) return false;
    this.attackLockTimer = Math.max(this.attackLockTimer, durationSec);
    this.actionPoseTimer = Math.max(this.actionPoseTimer, durationSec);
    return true;
  }

  public startSimpleServe(durationSec = 0.32): boolean {
    return this.startServe(durationSec);
  }

  public startBump(durationSec = 0.28): boolean {
    if (!this.transitionTo('bump')) return false;
    this.actionPoseTimer = Math.max(this.actionPoseTimer, durationSec);
    return true;
  }

  public startSet(durationSec = 0.34): boolean {
    if (!this.transitionTo('set')) return false;
    this.actionPoseTimer = Math.max(this.actionPoseTimer, durationSec);
    return true;
  }

  public startAttack(style: 'spike' | 'shark_attack' | 'header'): boolean {
    if (!this.transitionTo(style)) return false;
    this.actionPoseTimer = 0;
    this.attackLockTimer = 0.28;
    return true;
  }

  /**
   * Em falha de defesa / ataque forçado, o jogador NUNCA cai no chão (sem Knockdown/Ragdoll):
   * mantém os pés plantados na quadra e executa a animação em pé de "falha de manchete".
   */
  public startFailedBump(durationSec = 0.42): boolean {
    if (!this.transitionTo('failed_bump')) return false;
    this.actionPoseTimer = Math.max(this.actionPoseTimer, durationSec);
    return true;
  }

  public triggerGuardBreak(durationSec: number = PHYSICS.GUARD_BREAK_STUN_SEC): void {
    this.stunTimer = durationSec;
    this.diveTimer = 0;
    this.receiveWindowTimer = 0;
    this.attackLockTimer = 0;
    this.actionPoseTimer = 0;
    this.isJumpHeld = false;
    this.transitionTo('stunned', true);
  }

  public reset(): void {
    this.state = 'idle';
    this.stateTimer = 0;
    this.stunTimer = 0;
    this.receiveWindowTimer = 0;
    this.diveTimer = 0;
    this.jumpHoldTimer = 0;
    this.attackLockTimer = 0;
    this.actionPoseTimer = 0;
    this.isJumpHeld = false;
  }

  public update(dt: number, isGrounded: boolean, horizontalSpeed: number): void {
    this.stateTimer += dt;
    if (this.receiveWindowTimer > 0) this.receiveWindowTimer = Math.max(0, this.receiveWindowTimer - dt);
    if (this.diveTimer > 0) this.diveTimer = Math.max(0, this.diveTimer - dt);
    if (this.attackLockTimer > 0) this.attackLockTimer = Math.max(0, this.attackLockTimer - dt);
    if (this.actionPoseTimer > 0) this.actionPoseTimer = Math.max(0, this.actionPoseTimer - dt);
    if (this.isJumpHeld && this.state === 'airborne') {
      this.jumpHoldTimer += dt;
    }

    if (this.state === 'stunned') {
      this.stunTimer = Math.max(0, this.stunTimer - dt);
      if (this.stunTimer <= 0) {
        this.state = isGrounded ? 'idle' : 'airborne';
        this.stateTimer = 0;
      }
      return;
    }

    if (this.state === 'celebrate' || this.state === 'lose') {
      return;
    }

    if (this.diveTimer > 0) {
      this.state = 'slide_dive';
      return;
    }

    if (this.attackLockTimer > 0 || this.actionPoseTimer > 0) {
      return;
    }

    if (!isGrounded) {
      if (this.state !== 'block') {
        this.state = 'airborne';
      }
      return;
    }

    if (this.receiveWindowTimer > 0) {
      this.state = 'receive_ready';
      return;
    }

    this.state = horizontalSpeed > 0.6 ? 'move' : 'idle';
  }

  public toAnimState(): CharacterAnimState {
    switch (this.state) {
      case 'move':
        return 'run';
      case 'jump_charge':
      case 'airborne':
      case 'attack_windup':
        return 'jump';
      case 'slide_dive':
        return 'dive';
      case 'receive_ready':
        return 'idle';
      case 'preparing_serve':
        return 'preparing_serve';
      case 'serve_toss':
      case 'serve':
      case 'bump':
      case 'set':
      case 'spike':
      case 'shark_attack':
      case 'header':
      case 'block':
      case 'failed_bump':
      case 'celebrate':
      case 'lose':
        return this.state;
      case 'stunned':
        // Sem knockdown/queda no chão: falha de defesa executa apenas "falha de manchete" de pé
        return 'failed_bump';
      default:
        return 'idle';
    }
  }
}

export interface ControllerMoveInput {
  moveX: number;
  moveZ: number;
  sprint: boolean;
}

export type SuperBlockMode = 'low' | 'deep';

export type ResolvedHybridAction =
  | { type: 'none' }
  | { type: 'blocked_in_serve' }
  | { type: 'blocked_in_rally' }
  | { type: 'serve'; serveType: ServeType }
  | { type: 'rally_standard_touch' }
  | { type: 'block_super_low' }
  | { type: 'block_super_deep' };

/**
 * Controlador de física e habilidades do jogador guiado pelos 4 atributos RPG:
 * Ataque, Defesa, Pulo e Velocidade.
 */
export class PlayerController {
  public readonly fsm = new PlayerActionStateMachine();
  public readonly statsManager: PlayerStatsManager;
  public stats: CharacterStats;
  public peakJumpY = 0;
  /** Forças base (escaladas dinamicamente pelos níveis de RPG do PlayerStatsManager) */
  public baseJumpForce = PHYSICS.PLAYER_JUMP_VEL;
  public baseMoveSpeed = PHYSICS.PLAYER_WALK_SPEED;
  public baseSpikeForce = PHYSICS.SPIKE_SPEED;
  /** Regra A (Saque): 0.0s a 0.3s (Toque Rápido) -> Saque Por Baixo ('underhand') */
  public timeForUnderhand = 0.3;
  /** Regra A (Saque): 0.4s a 1.0s (Charge Médio) -> Saque Flutuante ('float') */
  public timeForFloat = 1.0;
  /** Regra A (Saque): Acima de 1.0s / >= 1.1s (Charge Máximo, limite 1.5s) -> Saque Viagem ('jump_serve') */
  public timeForJumpServe = 1.1;
  public maxServeChargeTime = 1.5;
  private superAttackTimer = 0;
  private armedSuperBlockMode: SuperBlockMode | null = null;
  private armedSuperBlockTimer = 0;

  constructor(stats: Partial<CharacterStats> = {}, rpgLevels: Partial<RpgStatLevels> = {}) {
    this.stats = {
      attack: stats.attack ?? DEFAULT_CHARACTER_STATS.attack,
      defense: stats.defense ?? DEFAULT_CHARACTER_STATS.defense,
      jump: stats.jump ?? DEFAULT_CHARACTER_STATS.jump,
      speed: stats.speed ?? DEFAULT_CHARACTER_STATS.speed,
    };
    this.statsManager = new PlayerStatsManager(this.stats, rpgLevels);
    this.stats = this.statsManager.getEffectiveStats();
  }

  /**
   * Sincroniza os níveis de upgrade do RPG (+1 Força, +1 Salto, +1 Velocidade, +1 Defesa)
   * com os atributos físicos ativos do PlayerController.
   */
  public applyRpgUpgrades(upgrades: { attack: number; defense: number; jump: number; speed: number }): void {
    this.statsManager.setUpgradeCounts(upgrades);
    this.stats = this.statsManager.getEffectiveStats();
  }

  private getResolvedStats(): CharacterStats {
    const fromMgr = this.statsManager.getEffectiveStats();
    return {
      attack: Math.max(this.stats.attack, fromMgr.attack),
      defense: Math.max(this.stats.defense, fromMgr.defense),
      jump: Math.max(this.stats.jump, fromMgr.jump),
      speed: Math.max(this.stats.speed, fromMgr.speed),
    };
  }

  /**
   * Regra A — Contexto de Saque (Hold - Máximo 1.5s):
   * Avalia o tempo final de carregamento (chargeTime) ao soltar o botão 'F':
   * - Soltar entre 0.0s e 0.3s (`<= 0.3s`, Toque Rápido): Executa o Saque Por Baixo ('underhand')
   * - Soltar entre 0.4s e 1.0s (`> 0.3s && <= 1.0s`, Charge Médio): Executa o Saque Flutuante ('float')
   * - Soltar acima de 1.1s (`> 1.0s`, Charge Máximo, máx 1.5s): Executa o Saque Viagem ('jump_serve')
   */
  public evaluateServeCharge(chargeTime: number): ServeType {
    const clamped = Math.max(0, Math.min(this.maxServeChargeTime, chargeTime));
    if (clamped <= this.timeForUnderhand) {
      return 'underhand';
    } else if (clamped <= this.timeForFloat) {
      return 'float';
    } else {
      return 'jump_serve';
    }
  }

  /**
   * Regra B — Contexto de Partida (Direcional + Botão 'F' simultâneos, sem contadores de múltiplos toques):
   * Combina o botão 'F' com a Seta de Movimento pressionada no mesmo momento:
   * - 'F' sozinho (Neutro): Bloqueio / Ataque Padrão ('rally_standard_touch')
   * - 'F' + Seta para BAIXO: Super Ataque / Bloqueio Curto (deixadinha / bloqueio na rede -> 'block_super_low')
   * - 'F' + Seta para TRÁS (Lado oposto): Super Ataque / Bloqueio Fundo de Quadra ('block_super_deep')
   */
  public evaluateDirectionalComboAction(params: {
    actionPressed: boolean;
    horizontalAxis: number;
    verticalAxis: number;
    downHeld?: boolean;
    teamSide: TeamSide;
    isServing: boolean;
    inGame: boolean;
    nearNet: boolean;
    chargeTimeOnRelease?: number;
  }): ResolvedHybridAction {
    if (params.isServing) {
      if (typeof params.chargeTimeOnRelease === 'number') {
        return {
          type: 'serve',
          serveType: this.evaluateServeCharge(params.chargeTimeOnRelease),
        };
      }
      return { type: 'blocked_in_serve' };
    }

    if (!params.inGame || !params.actionPressed) {
      return { type: 'none' };
    }

    const pressingDown = Boolean(params.downHeld) || params.verticalAxis < -0.35;
    const pressingBack =
      params.teamSide === 'left'
        ? params.horizontalAxis < -0.35
        : params.horizontalAxis > 0.35;

    if (pressingDown) {
      if (params.nearNet) {
        this.armSuperBlock('low', 1.15);
        this.fsm.startBlock();
      }
      return { type: 'block_super_low' };
    }

    if (pressingBack) {
      if (params.nearNet) {
        this.armSuperBlock('deep', 1.15);
        this.fsm.startBlock();
      }
      return { type: 'block_super_deep' };
    }

    return { type: 'rally_standard_touch' };
  }

  /**
   * Tratamento de Conflitos e Contexto (State Machine):
   * Valida o estado atual do personagem (isServing vs inGame / nearNet) antes de acionar
   * as habilidades do botão de Ação ('F' / Touch).
   */
  public resolveContextualHybridAction(
    command:
      | 'none'
      | 'action_neutral'
      | 'action_down_short'
      | 'action_back_deep'
      | 'single_tap'
      | 'double_tap_low_block'
      | 'triple_tap_deep_block'
      | 'hold_1s_underhand_serve'
      | 'hold_3s_jump_serve'
      | 'serve_underhand_quick'
      | 'serve_float_medium'
      | 'serve_jump_max',
    context: {
      isServing: boolean;
      inGame: boolean;
      nearNet: boolean;
      teamSide?: TeamSide;
      horizontalAxis?: number;
      verticalAxis?: number;
      directionalCombo?: 'none' | 'neutral' | 'down_short' | 'back_deep';
    },
  ): ResolvedHybridAction {
    if (!command || command === 'none') {
      return { type: 'none' };
    }

    // Contexto 1 (Regra A): Jogador está no momento do Saque (isServing)
    if (context.isServing) {
      if (
        command === 'double_tap_low_block' ||
        command === 'triple_tap_deep_block' ||
        command === 'action_down_short' ||
        command === 'action_back_deep'
      ) {
        // Bloqueia execução de Bloqueio Especial enquanto segura a bola para sacar
        return { type: 'blocked_in_serve' };
      }
      if (command === 'serve_jump_max' || command === 'hold_3s_jump_serve') {
        return { type: 'serve', serveType: 'jump_serve' };
      }
      if (command === 'serve_underhand_quick' || command === 'hold_1s_underhand_serve') {
        return { type: 'serve', serveType: 'underhand' };
      }
      if (command === 'serve_float_medium' || command === 'single_tap' || command === 'action_neutral') {
        return { type: 'serve', serveType: 'float' };
      }
      return { type: 'none' };
    }

    // Contexto 2 (Regra B): Jogador está dentro do Rali / Partida (inGame)
    if (context.inGame) {
      if (
        command === 'serve_underhand_quick' ||
        command === 'serve_float_medium' ||
        command === 'serve_jump_max' ||
        command === 'hold_1s_underhand_serve' ||
        command === 'hold_3s_jump_serve'
      ) {
        // Bloqueia execução de Saque no meio de um rali
        return { type: 'blocked_in_rally' };
      }
      if (command === 'double_tap_low_block' || command === 'action_down_short') {
        // Pressionar 'F' + Seta para BAIXO: Super Ataque / Bloqueio Curto (deixadinha / bloqueio na rede)
        if (!context.nearNet) return { type: 'none' };
        this.armSuperBlock('low', 1.15);
        this.fsm.startBlock();
        return { type: 'block_super_low' };
      }
      if (command === 'triple_tap_deep_block' || command === 'action_back_deep') {
        // Pressionar 'F' + Seta para TRÁS (Lado oposto): Super Ataque / Bloqueio Fundo de Quadra
        if (!context.nearNet) return { type: 'none' };
        this.armSuperBlock('deep', 1.15);
        this.fsm.startBlock();
        return { type: 'block_super_deep' };
      }
      if (command === 'single_tap' || command === 'action_neutral') {
        // Pressionar 'F' sozinho (Neutro): Bloqueio / Ataque Padrão
        return { type: 'rally_standard_touch' };
      }
    }

    return { type: 'none' };
  }

  public armSuperBlock(mode: SuperBlockMode, durationSec = 1.15): void {
    this.armedSuperBlockMode = mode;
    this.armedSuperBlockTimer = Math.max(this.armedSuperBlockTimer, durationSec);
  }

  public getArmedSuperBlockMode(): SuperBlockMode | null {
    return this.armedSuperBlockTimer > 0 ? this.armedSuperBlockMode : null;
  }

  public consumeArmedSuperBlockMode(): SuperBlockMode | null {
    const mode = this.getArmedSuperBlockMode();
    this.armedSuperBlockMode = null;
    this.armedSuperBlockTimer = 0;
    return mode;
  }

  public setStats(stats: CharacterStats): void {
    this.stats = { ...stats };
    this.statsManager.setBaseStats(stats);
  }

  public activateSuperAttack(durationSec: number = PHYSICS.SUPER_ATTACK_DURATION): void {
    this.superAttackTimer = Math.max(0, durationSec);
  }

  public clearSuperAttack(): void {
    this.superAttackTimer = 0;
  }

  public isSuperAttackActive(): boolean {
    return this.superAttackTimer > 0;
  }

  public getSuperAttackRemaining(): number {
    return this.superAttackTimer;
  }

  public updateTimers(dt: number): void {
    if (this.superAttackTimer > 0) {
      this.superAttackTimer = Math.max(0, this.superAttackTimer - dt);
    }
    if (this.armedSuperBlockTimer > 0) {
      this.armedSuperBlockTimer = Math.max(0, this.armedSuperBlockTimer - dt);
      if (this.armedSuperBlockTimer <= 0) {
        this.armedSuperBlockMode = null;
      }
    }
  }

  /** Multiplicador de força e velocidade da bola baseado em Força (Ataque RPG) + buff Super Attack (5s) */
  public getAttackMultiplier(): number {
    const resolved = this.getResolvedStats();
    const base = 0.72 + (resolved.attack / 100) * 0.28;
    return this.isSuperAttackActive() ? base * PHYSICS.SUPER_ATTACK_ATK_MULT : base;
  }

  /** Velocidade final da bola no corte (Spike) escalada pela Força (Ataque RPG) */
  public getSpikeBallSpeed(): number {
    return this.baseSpikeForce * this.getAttackMultiplier();
  }

  /** Raio de recepção expandido pelo atributo Defesa do RPG (Hitbox ampliada e responsiva) */
  public getReceiveHitboxRadius(): number {
    const resolved = this.getResolvedStats();
    const bonus = ((resolved.defense - 100) / 100) * 0.35;
    return Math.max(1.15, Math.min(1.85, 1.45 + bonus));
  }

  /** Bônus de janela de tempo para Recepção Perfeita em milissegundos */
  public getDefenseWindowBonusMs(): number {
    const resolved = this.getResolvedStats();
    return Math.max(-25, Math.min(90, (resolved.defense - 100) * 0.9));
  }

  /** Velocidade inicial do salto (Eixo Y) multiplicada pelo nível de Salto do RPG + buff Super Attack */
  public getBaseJumpVelocity(): number {
    const resolved = this.getResolvedStats();
    const scale = 0.84 + (resolved.jump / 100) * 0.16;
    const superBoost = this.isSuperAttackActive() ? PHYSICS.SUPER_ATTACK_JUMP_MULT : 1.0;
    return this.baseJumpForce * scale * superBoost;
  }

  /** Velocidade máxima lateral (Eixo X) multiplicada pelo nível de Velocidade do RPG + buff Super Attack */
  public getMaxHorizontalSpeed(sprint: boolean): number {
    const resolved = this.getResolvedStats();
    const statMult = 0.78 + (resolved.speed / 100) * 0.22;
    const superBoost = this.isSuperAttackActive() ? PHYSICS.SUPER_ATTACK_SPEED_MULT : 1.0;
    return this.baseMoveSpeed * statMult * superBoost * (sprint ? PHYSICS.PLAYER_SPRINT_MULT : 1);
  }

  /**
   * Movimentação física com peso de inércia para simular atrito da areia ou piso da quadra.
   */
  public computeInertialVelocity(
    currentVx: number,
    currentVz: number,
    input: ControllerMoveInput,
    isSandSurface: boolean,
    dt: number,
  ): { vx: number; vz: number } {
    if (this.fsm.isStunned()) {
      const stunDamp = Math.exp(-6.5 * dt);
      return { vx: currentVx * stunDamp, vz: currentVz * stunDamp };
    }

    const len = Math.hypot(input.moveX, input.moveZ);
    const nx = len > 1 ? input.moveX / len : input.moveX;
    const nz = len > 1 ? input.moveZ / len : input.moveZ;
    const maxSpeed = this.getMaxHorizontalSpeed(input.sprint);
    const resolved = this.getResolvedStats();

    const accel = (isSandSurface ? PHYSICS.SAND_ACCEL : PHYSICS.COURT_ACCEL) * (0.85 + (resolved.speed / 100) * 0.15);
    const friction = isSandSurface ? PHYSICS.SAND_FRICTION : PHYSICS.COURT_FRICTION;

    if (len > 0.08) {
      const targetVx = nx * maxSpeed;
      const targetVz = nz * maxSpeed;
      const alpha = Math.min(1, accel * dt / Math.max(1, maxSpeed));
      return {
        vx: currentVx + (targetVx - currentVx) * alpha,
        vz: currentVz + (targetVz - currentVz) * alpha,
      };
    }

    const decay = Math.exp(-friction * dt);
    const nextVx = Math.abs(currentVx * decay) < 0.05 ? 0 : currentVx * decay;
    const nextVz = Math.abs(currentVz * decay) < 0.05 ? 0 : currentVz * decay;
    return { vx: nextVx, vz: nextVz };
  }

  /**
   * Avalia qualidade da Recepção com base na janela da dificuldade (500ms / 200ms / 50ms) + atributo Defesa.
   */
  public evaluateReceive(
    timingErrorMs: number,
    difficulty: AiDifficulty,
    ballHorizontalDist: number,
  ): ReceiveEvaluation {
    const profile = DIFFICULTY_TUNING[difficulty];
    const perfectWindow = Math.max(35, profile.perfectReceiveWindowMs + this.getDefenseWindowBonusMs());
    const goodWindow = Math.max(perfectWindow + 80, profile.goodReceiveWindowMs + this.getDefenseWindowBonusMs());
    const hitboxRadius = this.getReceiveHitboxRadius();
    const triggerDive = ballHorizontalDist > hitboxRadius * 0.92;

    if (timingErrorMs <= perfectWindow) {
      return { quality: 'perfect', hitboxRadius, windowUsedMs: perfectWindow, triggerDive };
    }
    if (timingErrorMs <= goodWindow) {
      return { quality: 'good', hitboxRadius, windowUsedMs: goodWindow, triggerDive };
    }
    return { quality: 'imprecise', hitboxRadius, windowUsedMs: goodWindow, triggerDive };
  }

  /**
   * Calcula estilo de ataque (Spike, Shark Attack com o pé ou Cabeceio), mira dinâmica pelo cursor do mouse
   * (ou direcional de teclado como fallback) e se houve Corte Perfeito no ápice do salto.
   */
  public evaluateAttack(params: {
    playerY: number;
    playerVy: number;
    playerZ: number;
    ballY: number;
    moveX: number;
    moveZ: number;
    team: TeamSide;
    preferFoot: boolean;
    directionalCombo?: 'none' | 'neutral' | 'down_short' | 'back_deep';
    mouseAimRatio?: number;
    mouseWorldPos?: { x: number; y: number };
  }): AttackEvaluation {
    const {
      playerY,
      playerVy,
      playerZ,
      ballY,
      moveX,
      moveZ,
      team,
      preferFoot,
      directionalCombo,
      mouseAimRatio,
      mouseWorldPos,
    } = params;
    const forwardDir = team === 'left' ? moveX : -moveX;
    const dirX = team === 'left' ? 1 : -1;

    // Regra B (Direcional + Botão 'F'):
    // - 'down_short' ('F' + Seta para BAIXO): Super Ataque Curto (deixadinha na rede)
    // - 'back_deep' ('F' + Seta para TRÁS): Super Ataque Fundo de Quadra
    // - 'neutral' ('F' sozinho) ou ponteiro do mouse: Ataque Padrão / Mira Dinâmica
    let aim: AimDirection = 'parallel';
    let targetDepthX: number | undefined;
    if (directionalCombo === 'down_short') {
      aim = 'dink';
      targetDepthX = dirX * 1.95;
    } else if (directionalCombo === 'back_deep') {
      aim = 'diagonal';
      targetDepthX = dirX * (COURT.HALF_WIDTH - 1.15);
    } else if (mouseWorldPos && Number.isFinite(mouseWorldPos.x)) {
      const oppDist = Math.max(0.65, Math.min(COURT.HALF_WIDTH + 1.4, Math.abs(mouseWorldPos.x)));
      targetDepthX = dirX * oppDist;
      aim = oppDist < 3.0 ? 'dink' : oppDist < 5.6 ? 'parallel' : 'diagonal';
    } else if (typeof mouseAimRatio === 'number' && Number.isFinite(mouseAimRatio)) {
      const clamped = Math.max(0, Math.min(1, mouseAimRatio));
      if (clamped < 0.28) {
        aim = 'dink';
        targetDepthX = dirX * (1.25 + clamped * 3.5);
      } else if (clamped < 0.65) {
        aim = 'parallel';
        targetDepthX = dirX * (3.2 + (clamped - 0.28) * 6.5);
      } else {
        aim = 'diagonal';
        targetDepthX = dirX * (5.8 + (clamped - 0.65) * 5.7);
      }
    } else if (forwardDir < -0.35) {
      aim = 'dink';
    } else if (Math.abs(moveZ) > 0.35) {
      aim = 'diagonal';
    }

    // Estilo Futevôlei / Vôlei
    let style: 'spike' | 'shark_attack' | 'header' = 'spike';
    if (preferFoot || (playerY > 0.25 && ballY < 2.25 && Math.abs(moveZ) > 0.25)) {
      style = 'shark_attack';
    } else if (playerY <= 0.35 || (ballY < 1.85 && forwardDir > 0.25)) {
      style = 'header';
    }

    // Ápice do salto: velocidade vertical próxima de zero no ponto alto
    const isHighEnough = playerY >= 0.95;
    const nearApex = Math.abs(playerVy) <= 2.95;
    const isPerfectApex = isHighEnough && nearApex;

    const atkMult = this.getAttackMultiplier();
    const baseRatio = isPerfectApex ? 1.0 : playerY > 0.35 ? 0.82 : 0.65;
    const powerRatio = Math.min(1.35, baseRatio * atkMult);

    let targetZ = playerZ * 0.4;
    if (aim === 'diagonal') {
      targetZ = playerZ >= 0 ? -COURT.HALF_DEPTH + 1.15 : COURT.HALF_DEPTH - 1.15;
    } else if (aim === 'parallel') {
      targetZ = Math.max(-COURT.HALF_DEPTH + 1.0, Math.min(COURT.HALF_DEPTH - 1.0, playerZ + moveZ * 1.4));
    } else {
      targetZ = Math.max(-2.5, Math.min(2.5, playerZ * 0.6 + moveZ * 1.2));
    }

    const resolvedDepthX =
      targetDepthX ??
      (aim === 'dink'
        ? dirX * 2.15
        : aim === 'diagonal'
          ? dirX * 5.8
          : dirX * 6.35);

    return {
      style,
      aim,
      isPerfectApex,
      powerRatio,
      targetZ,
      targetDepthX: resolvedDepthX,
    };
  }

  /**
   * Verifica se um ataque violento (>90% da força máxima) quebra a defesa/bloqueio mal cronometrado.
   */
  public checkGuardBreak(
    incomingPowerRatio: number,
    receiveQuality: ReceiveQuality,
    difficulty: AiDifficulty,
  ): boolean {
    const profile = DIFFICULTY_TUNING[difficulty];
    if (!profile.guardBreakEnabled && incomingPowerRatio < 0.96) return false;
    // Defesa alta reduz chance de Guard Break exigindo ataques ainda mais fortes
    const defenseResistance = Math.max(0, (this.stats.defense - 100) * 0.0015);
    const threshold = PHYSICS.GUARD_BREAK_THRESHOLD + defenseResistance;
    if (incomingPowerRatio > threshold && receiveQuality === 'imprecise') {
      this.fsm.triggerGuardBreak(PHYSICS.GUARD_BREAK_STUN_SEC);
      return true;
    }
    return false;
  }
}
