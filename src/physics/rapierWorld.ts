/**
 * Spike Legends Online — Mundo Físico 3D com Rapier
 * Compartilhado entre o Servidor Autoritativo (Socket.io) e o Modo Local (Treino / VS IA).
 * Integra o VolleyballRulesManager (3 toques, Dois Toques com exceção de bloqueio,
 * Falta de Rede por collider sensor, Invasão, Bola Dentro/Fora e 15/21 pontos),
 * EnemyTeamManager (dupla 2v2 + humanização de erro/atraso), FSM do Parceiro Aliado P2
 * e modo Super Attack de 5 segundos.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import {
  COURT,
  DIFFICULTY_TUNING,
  MATCH_RULES,
  PHYSICS,
  type AiDifficulty,
  type ArenaId,
  type CharacterAnimState,
  type CharacterId,
  type CharacterStats,
  type GameMode,
  type PlayerActionState,
  type ServeType,
  type TeamSide,
  type UltimateType,
} from '../config/gameConfig.ts';
import { CHARACTERS } from '../characters/roster.ts';
import {
  DEFAULT_CHARACTER_STATS,
  PlayerController,
} from './playerStateMachine.ts';
import {
  clampServerMovementStep,
  computeReceiveImpulse,
  computeServeVelocity,
  computeSpikeImpulse,
  decideAiAction,
} from './volleyballRules.ts';
import {
  VolleyballRulesManager,
  type ScoreState,
} from './volleyballRulesManager.ts';
import {
  decideAlliedPartnerAction,
  EnemyTeamManager,
  isCompletelyOutsideCourtForServe,
  type ExtendedAiCommand,
} from './enemyTeamManager.ts';

let rapierReadyPromise: Promise<void> | null = null;

export function ensureRapierReady(): Promise<void> {
  if (!rapierReadyPromise) {
    rapierReadyPromise = RAPIER.init();
  }
  return rapierReadyPromise;
}

export interface PlayerInputState {
  moveX: number;
  moveZ: number;
  sprint: boolean;
  jump: boolean;
  /** Mantido pressionado para Salto Escalonado */
  jumpHeld?: boolean;
  spike: boolean;
  spikeHeld?: boolean;
  /** Clique rápido (<220ms) no botão de ação para Saque Simples */
  serveQuickTap?: boolean;
  /** Segurar botão de ação (>=220ms) para Saque Viagem com lançamento e salto */
  serveJumpCharge?: boolean;
  /** Gatilho explícito para Saque Normal / Flutuante */
  serveNormalTrigger?: boolean;
  /** Gatilho explícito para Saque Por Baixo */
  serveUnderhandTrigger?: boolean;
  /** Gatilho explícito para Saque Viagem (toss + salto + ataque) */
  serveJumpTrigger?: boolean;
  /** Comando resolvido pelo Sistema de Input Contextual e Direcional */
  hybridCommand?:
    | 'none'
    | 'serve_underhand_quick'
    | 'serve_float_medium'
    | 'serve_jump_max'
    | 'action_neutral'
    | 'action_down_short'
    | 'action_back_deep'
    | 'single_tap'
    | 'double_tap_low_block'
    | 'triple_tap_deep_block'
    | 'hold_1s_underhand_serve'
    | 'hold_3s_jump_serve';
  /** Eixo vertical de movimento (-1 = Baixo/S/DownArrow, 0 = Neutro, +1 = Cima/W/UpArrow) */
  verticalInput?: number;
  /** Verdadeiro quando a Seta para BAIXO ('S' / 'ArrowDown' / Touch Down) está pressionada */
  downHeld?: boolean;
  /** Direcional simultâneo lido junto com o botão 'F' durante a partida */
  directionalCombo?: 'none' | 'neutral' | 'down_short' | 'back_deep';
  /** Contador atual de toques rápidos (mantido em 0/1 para compatibilidade) */
  tapCount?: number;
  /** Tempo atual segurando o botão de ação (em segundos, limitado a 1.5s no saque) */
  holdTimer?: number;
  /** Verdadeiro enquanto o jogador segura o botão de Saque/Ataque (Hold to Charge / PreparingServe) */
  preparingServe?: boolean;
  /** Tempo atual acumulado no temporizador de Saque (em segundos) */
  serveChargeTime?: number;
  /** Tempo final de chargeTime emitido no exato frame em que o jogador solta o botão (OnPointerUp / GetKeyUp) */
  serveReleaseChargeTime?: number;
  /** Estágio visual atual de carga do Saque ('underhand' | 'float' | 'jump_serve') */
  serveChargeStage?: ServeType;
  dive: boolean;
  /** Botão dedicado ou compartilhado para janela de timing de Recepção (Manchete) */
  receive?: boolean;
  /** Botão dedicado de Toque / Levantamento (Set - Tecla E / Botão Mobile) */
  set?: boolean;
  /** Alterna ataque de futevôlei (Shark Attack com o pé) */
  footMode?: boolean;
  /** Tipo de saque escolhido pelo jogador */
  serveType?: ServeType;
  ultimate: boolean;
  aimZ?: number;
  /** Mira dinâmica do ataque pelo ponteiro do mouse (0 = perto da rede, 1 = fundo da quadra) */
  mouseAimRatio?: number;
  /** Coordenada exata do ponteiro do mouse no mundo (ScreenToWorldPoint) */
  mouseWorldPos?: { x: number; y: number };
}

export interface SimPlayerState {
  id: string;
  name: string;
  characterId: CharacterId;
  team: TeamSide;
  slotIndex: number;
  role: 'attacker' | 'setter';
  isAi: boolean;
  aiDifficulty: AiDifficulty;
  stats: CharacterStats;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  facingX: number;
  facingZ: number;
  anim: CharacterAnimState;
  actionState: PlayerActionState;
  animTimer: number;
  diveTimer: number;
  diveDirX: number;
  diveDirZ: number;
  stunTimer: number;
  spikeCooldown: number;
  hitCooldown: number;
  ultimateCharge: number;
  ultimateActiveTimer: number;
  superAttackTimer: number;
  spikesCount: number;
  blocksCount: number;
  perfectCount: number;
  hasSelfSet?: boolean;
  playerTouches?: number;
}

export type MatchEventType =
  | 'whistle'
  | 'jump'
  | 'serve'
  | 'set'
  | 'spike'
  | 'receive'
  | 'block'
  | 'dive'
  | 'bounce'
  | 'net'
  | 'fault'
  | 'point'
  | 'ultimate'
  | 'guard_break'
  | 'launcher'
  | 'sync_state'
  | 'victory';

export interface MatchEvent {
  type: MatchEventType;
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  team?: TeamSide;
  playerId?: string;
  serveType?: ServeType;
  touchNumber?: number;
  isSelfSet?: boolean;
  ultimateType?: UltimateType;
  power?: number;
  scoringTeam?: TeamSide;
  callout?: string;
  isPerfect?: boolean;
  isForcedAttack?: boolean;
}

export interface BallSnapshot {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  rw: number;
  activeUltimate: UltimateType | null;
  lastTouchTeam: TeamSide;
  lastTouchPlayerId: string | null;
  lastPlayerToTouch: string | null;
  touchesLeft: number;
  touchesRight: number;
}

export interface MatchSnapshot {
  tick: number;
  phase: 'serve_wait' | 'rally' | 'point_freeze' | 'finished';
  serveWhistleBlown: boolean;
  servingTeam: TeamSide;
  mode: GameMode;
  is1v1Mode: boolean;
  score: ScoreState;
  ball: BallSnapshot;
  players: SimPlayerState[];
  events: MatchEvent[];
  hitstopTimer: number;
  trainingStats?: {
    attempts: number;
    perfects: number;
    streak: number;
  };
}

export interface CreateMatchOptions {
  mode: GameMode;
  is1v1Mode?: boolean;
  arenaId?: ArenaId;
  targetPoints?: number;
  aiRng?: () => number;
  players: Array<{
    id: string;
    name: string;
    characterId: CharacterId;
    team: TeamSide;
    slotIndex: number;
    role?: 'attacker' | 'setter';
    isAi: boolean;
    aiDifficulty?: AiDifficulty;
    stats?: Partial<CharacterStats>;
  }>;
}

export class VolleyballRapierWorld {
  private world: RAPIER.World;
  private eventQueue: RAPIER.EventQueue;
  private ballBody: RAPIER.RigidBody;
  private ballCollider: RAPIER.Collider;
  private floorCollider: RAPIER.Collider;
  private netBarrierCollider: RAPIER.Collider;
  private inBoundsFloorCollider: RAPIER.Collider;
  private outZoneColliders: RAPIER.Collider[] = [];
  private playerBodies = new Map<string, RAPIER.RigidBody>();
  private playerColliders = new Map<string, RAPIER.Collider>();
  private controllers = new Map<string, PlayerController>();
  private players: SimPlayerState[] = [];
  private inputs = new Map<string, PlayerInputState>();
  private receivePressedAtTick = new Map<string, number>();
  private rulesManager: VolleyballRulesManager;
  private enemyTeamManagers: Record<TeamSide, EnemyTeamManager>;
  private aiCommandCache = new Map<string, ExtendedAiCommand>();
  private aiRng: () => number;
  private mode: GameMode;
  private arenaId: ArenaId;
  private isSandSurface: boolean;
  private phase: 'serve_wait' | 'rally' | 'point_freeze' | 'finished' = 'serve_wait';
  private phaseTimer = 0.75;
  private serveSubPhase: 'ready' | 'tossed' = 'ready';
  private serveWhistleTimer = 0.48;
  private serveWhistleBlown = false;
  private pendingServeType: ServeType | null = null;
  /** Limiar público (em segundos) para Saque Por Baixo (Soltar entre 0.0s e 0.3s -> Underhand Serve) */
  public timeForUnderhand = 0.3;
  /** Limiar público (em segundos) para Saque Flutuante (Soltar entre 0.4s e 1.0s -> Float Serve) */
  public timeForFloat = 1.0;
  /** Limiar público (em segundos) para Saque Viagem (Soltar acima de 1.1s, máx 1.5s -> Jump Serve) */
  public timeForJumpServe = 1.1;
  /** Limite máximo prático de carga do Saque (1.5s) */
  public maxServeChargeTime = 1.5;
  private static readonly MAX_HITSTOP_SEC = 0.28;
  private static readonly SERVE_TIMEOUT_SEC = 8.0;
  private static readonly RALLY_WATCHDOG_TIMEOUT_SEC = 6.5;
  private static readonly POINT_FREEZE_WATCHDOG_SEC = 5.5;

  private serveIdleTimer = 0;
  private serveTossTimer = 0;
  private rallyWithoutTouchTimer = 0;
  private pointFreezeWatchdogTimer = 0;
  private ballStuckTimer = 0;
  private serveInFlightTeam: TeamSide | null = null;
  private hitstopTimer = 0;
  private hitstopRealDeadlineMs = 0;
  private tickCount = 0;
  private lastIncomingPowerRatio = 0.6;
  private activeUltimate: UltimateType | null = null;
  private pendingEvents: MatchEvent[] = [];
  private prevBallVy = 0;
  private bounceSfxCooldown = 0;
  private launcherTimer = 0.6;
  private trainingStats = { attempts: 0, perfects: 0, streak: 0 };
  private servingSlotByTeam: Record<TeamSide, number> = { left: 0, right: 0 };
  private lastServingTeam: TeamSide = 'left';
  private consecutiveBlocks = 0;
  private aiBlockCooldownByPlayer = new Map<string, number>();
  private pendingSelfSetByPlayer = new Map<string, number>();
  private ballVisitedPlayerSide = new Map<string, boolean>();

  constructor(options: CreateMatchOptions) {
    this.mode = options.mode;
    this.arenaId = options.arenaId ?? 'ginasio';
    this.isSandSurface = this.arenaId === 'praia';
    this.aiRng = options.aiRng ?? Math.random;

    const is1v1Mode =
      options.is1v1Mode !== undefined ? Boolean(options.is1v1Mode) : options.mode === '1v1';

    this.rulesManager = new VolleyballRulesManager({
      targetPoints: options.targetPoints ?? MATCH_RULES.POINTS_TO_WIN,
      initialServe: 'left',
      is1v1Mode,
    });
    this.enemyTeamManagers = {
      left: new EnemyTeamManager(this.aiRng),
      right: new EnemyTeamManager(this.aiRng),
    };

    this.world = new RAPIER.World({ x: 0, y: PHYSICS.GRAVITY, z: 0 });
    this.eventQueue = new RAPIER.EventQueue(true);

    // Chão sólido estendido para quadra expandida de 25m (superfície em y = 0)
    const floorBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
    this.floorCollider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(50, 0.5, 36)
        .setRestitution(this.isSandSurface ? 0.68 : PHYSICS.BALL_RESTITUTION)
        .setFriction(this.isSandSurface ? 0.85 : 0.65)
        .setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      floorBody,
    );

    // Trigger Sensor de Bola Dentro (inclui exatamente as linhas da quadra de 25m)
    const lineGrace = PHYSICS.BALL_RADIUS * 0.5;
    const inBoundsBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0.02, 0));
    this.inBoundsFloorCollider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        COURT.HALF_WIDTH + lineGrace,
        0.04,
        COURT.HALF_DEPTH + lineGrace,
      )
        .setSensor(true)
        .setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      inBoundsBody,
    );

    // Áreas de Trigger "OutZone" cobrindo todo o chão externo além das linhas da quadra
    const outStartX = COURT.HALF_WIDTH + lineGrace + PHYSICS.BALL_RADIUS;
    const outStartZ = COURT.HALF_DEPTH + lineGrace + PHYSICS.BALL_RADIUS;
    const outerLimitX = 50;
    const outerLimitZ = 36;
    const sideWidth = (outerLimitX - outStartX) * 0.5;
    const sideCenterX = outStartX + sideWidth;
    const depthSpan = (outerLimitZ - outStartZ) * 0.5;
    const sideCenterZ = outStartZ + depthSpan;
    const outZoneBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0.02, 0));
    const outZoneSpecs = [
      { x: -sideCenterX, z: 0, hx: sideWidth, hz: outerLimitZ },
      { x: sideCenterX, z: 0, hx: sideWidth, hz: outerLimitZ },
      { x: 0, z: -sideCenterZ, hx: outStartX, hz: depthSpan },
      { x: 0, z: sideCenterZ, hx: outStartX, hz: depthSpan },
    ];
    for (const oz of outZoneSpecs) {
      this.outZoneColliders.push(
        this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(oz.hx, 0.04, oz.hz)
            .setTranslation(oz.x, 0, oz.z)
            .setSensor(true)
            .setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL)
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
          outZoneBody,
        ),
      );
    }

    // Rede central sólida exatamente no centro (x = 0) + Barreira Física Invisível proibindo invasão
    const netBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, COURT.NET_HEIGHT / 2, 0),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(COURT.NET_THICKNESS / 2, COURT.NET_HEIGHT / 2, COURT.HALF_DEPTH + 0.35)
        .setRestitution(0.45)
        .setFriction(0.3)
        .setCollisionGroups(0x00010001),
      netBody,
    );
    this.netBarrierCollider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(COURT.NET_THICKNESS / 2, COURT.WALL_HEIGHT / 2, COURT.HALF_DEPTH + 1.5)
        .setTranslation(0, COURT.WALL_HEIGHT / 2 - COURT.NET_HEIGHT / 2, 0)
        .setCollisionGroups(0x00040002),
      netBody,
    );

    // Barreiras invisíveis externas (laterais e teto) escaladas para a quadra de 25m
    const wallX = COURT.HALF_WIDTH + COURT.OUT_MARGIN;
    const wallZ = COURT.HALF_DEPTH + COURT.OUT_MARGIN;
    const wallDefs = [
      { x: -wallX - 0.5, y: COURT.WALL_HEIGHT / 2, z: 0, hx: 0.5, hy: COURT.WALL_HEIGHT / 2, hz: wallZ + 1 },
      { x: wallX + 0.5, y: COURT.WALL_HEIGHT / 2, z: 0, hx: 0.5, hy: COURT.WALL_HEIGHT / 2, hz: wallZ + 1 },
      { x: 0, y: COURT.WALL_HEIGHT / 2, z: -wallZ - 0.5, hx: wallX + 1, hy: COURT.WALL_HEIGHT / 2, hz: 0.5 },
      { x: 0, y: COURT.WALL_HEIGHT / 2, z: wallZ + 0.5, hx: wallX + 1, hy: COURT.WALL_HEIGHT / 2, hz: 0.5 },
      { x: 0, y: COURT.WALL_HEIGHT + 0.5, z: 0, hx: wallX + 1, hy: 0.5, hz: wallZ + 1 },
    ];
    for (const w of wallDefs) {
      const b = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(w.x, w.y, w.z));
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(w.hx, w.hy, w.hz).setRestitution(0.55),
        b,
      );
    }

    // Bola dinâmica com CCD (grupo 0x0001, colide com chão/paredes/rede mas ignora barreira alta dos jogadores)
    this.ballBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(-4.5, MATCH_RULES.SERVE_HEIGHT, 0)
        .setCcdEnabled(true)
        .setLinearDamping(PHYSICS.BALL_AIR_DRAG)
        .setAngularDamping(0.35),
    );
    this.ballCollider = this.world.createCollider(
      RAPIER.ColliderDesc.ball(PHYSICS.BALL_RADIUS)
        .setRestitution(PHYSICS.BALL_RESTITUTION)
        .setFriction(0.4)
        .setMass(PHYSICS.BALL_MASS)
        .setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
        .setCollisionGroups(0x0001fffb),
      this.ballBody,
    );

    // Jogadores + PlayerController & StateMachine
    for (const p of options.players) {
      const role: 'attacker' | 'setter' = p.role ?? (p.slotIndex === 1 && p.isAi ? 'setter' : 'attacker');
      const teamSize = options.players.filter((x) => x.team === p.team).length;
      const spawn = this.getSpawnPosition(p.team, p.slotIndex, teamSize, role);
      const aiDiff = p.aiDifficulty ?? 'medium';
      const controller = new PlayerController(p.stats);
      if (p.isAi) {
        this.enemyTeamManagers[p.team].setDifficulty(aiDiff);
      }
      this.controllers.set(p.id, controller);

      const playerState: SimPlayerState = {
        id: p.id,
        name: p.name,
        characterId: p.characterId,
        team: p.team,
        slotIndex: p.slotIndex,
        role,
        isAi: p.isAi,
        aiDifficulty: aiDiff,
        stats: { ...controller.stats },
        x: spawn.x,
        y: 0,
        z: spawn.z,
        vx: 0,
        vy: 0,
        vz: 0,
        facingX: p.team === 'left' ? 1 : -1,
        facingZ: 0,
        anim: 'idle',
        actionState: 'idle',
        animTimer: 0,
        diveTimer: 0,
        diveDirX: 0,
        diveDirZ: 0,
        stunTimer: 0,
        spikeCooldown: 0,
        hitCooldown: 0,
        ultimateCharge: 0,
        ultimateActiveTimer: 0,
        superAttackTimer: 0,
        spikesCount: 0,
        blocksCount: 0,
        perfectCount: 0,
        hasSelfSet: false,
        playerTouches: 0,
      };
      this.players.push(playerState);

      // Freeze Rotation (lockRotations) em todos os eixos para impedir o boneco de capotar ou cair de lado
      const kb = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased()
          .setTranslation(spawn.x, 0.66, spawn.z)
          .lockRotations(),
      );
      // Colisão restrita do pescoço para baixo (0.0m até 1.32m; cabeça gráfica inicia em 1.42m)
      const pCollider = this.world.createCollider(
        RAPIER.ColliderDesc.capsule(0.24, 0.42)
          .setCollisionGroups(0x00020004)
          .setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL)
          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        kb,
      );
      this.playerBodies.set(p.id, kb);
      this.playerColliders.set(p.id, pCollider);
    }

    this.resetForServe('left');
  }

  private reset1v1PlayerPossession(playerId?: string): void {
    for (const pl of this.players) {
      if (!playerId || pl.id === playerId) {
        pl.hasSelfSet = false;
        pl.playerTouches = 0;
        this.pendingSelfSetByPlayer.delete(pl.id);
        this.ballVisitedPlayerSide.delete(pl.id);
      }
    }
  }

  private perform1v1SelfSetBallLaunch(p: SimPlayerState, controller: PlayerController): boolean {
    const bPos = this.ballBody.translation();
    const preSnap = this.rulesManager.getTouchesSnapshot();
    const alreadyTouchedThisPossession =
      preSnap.lastTouchTeam === p.team &&
      preSnap.lastTouchPlayerId === p.id &&
      !preSnap.lastTouchWasBlock &&
      this.rulesManager.getTouches(p.team) >= 1;

    let currentTouches = 1;
    if (!alreadyTouchedThisPossession) {
      const touchResult = this.rulesManager.registerTouch(p.id, p.team, {
        isBlock: false,
        ignoreFaults: this.isTrainingMinigame(),
      });
      if (!touchResult.allowed && touchResult.scoringTeam) {
        this.pendingEvents.push({
          type: 'fault',
          x: bPos.x,
          y: bPos.y,
          z: 0,
          team: p.team,
          playerId: p.id,
          callout: touchResult.callout,
        });
        this.registerPoint(touchResult.scoringTeam, bPos.x, 0, touchResult.callout);
        return false;
      }
      currentTouches = touchResult.teamTouches;
    } else {
      currentTouches = this.rulesManager.getTouches(p.team);
    }

    p.hasSelfSet = true;
    p.playerTouches = Math.max(1, currentTouches);
    p.hitCooldown = PHYSICS.HIT_COOLDOWN;
    p.vy = 0;
    this.pendingSelfSetByPlayer.delete(p.id);
    this.ballVisitedPlayerSide.set(p.id, true);
    this.rallyWithoutTouchTimer = 0;
    this.ballStuckTimer = 0;
    this.serveInFlightTeam = null;
    this.consecutiveBlocks = 0;

    controller.fsm.startSet(0.36);
    p.anim = 'set';
    p.actionState = 'set';
    p.animTimer = 0;

    const rec = computeReceiveImpulse(
      { x: p.x, y: p.y, z: 0 },
      bPos,
      p.team,
      1,
      {
        quality: 'perfect',
        isQuickTempo: false,
        isSetter: true,
        attackerPos: { x: p.x, y: p.y, z: 0 },
        setterPos: { x: (p.team === 'left' ? -1 : 1) * 0.95, y: 0, z: 0 },
      },
    );
    this.ballBody.setLinvel({ x: rec.vx, y: rec.vy, z: 0 }, true);
    this.ballBody.setAngvel({ x: 0, y: 0, z: rec.spinZ }, true);

    if (!controller.isSuperAttackActive()) {
      p.ultimateCharge = Math.min(PHYSICS.ULTIMATE_MAX, p.ultimateCharge + PHYSICS.ULTIMATE_GAIN_RECEIVE);
    }
    if (!p.isAi) {
      p.perfectCount += 1;
    }
    this.activeUltimate = null;
    this.lastIncomingPowerRatio = 0.5;

    this.pendingEvents.push({
      type: 'set',
      x: bPos.x,
      y: bPos.y,
      z: 0,
      vx: rec.vx,
      vy: rec.vy,
      team: p.team,
      playerId: p.id,
      touchNumber: currentTouches,
      isSelfSet: true,
      power: 0.65,
      callout: 'BOLA ALTA!',
      isPerfect: true,
    });
    return true;
  }

  private getSpawnPosition(
    team: TeamSide,
    slotIndex: number,
    teamSize: number,
    role: 'attacker' | 'setter' = 'attacker',
  ): { x: number; z: number } {
    const dir = team === 'left' ? -1 : 1;
    if (role === 'setter' || (teamSize >= 2 && slotIndex === 1)) {
      return { x: dir * (slotIndex === 1 ? 1.85 : 1.55), z: 0 };
    }
    if (teamSize <= 1) {
      return { x: dir * (COURT.HALF_WIDTH * 0.52), z: 0 };
    }
    return { x: dir * (COURT.HALF_WIDTH * 0.56), z: 0 };
  }

  public setPlayerInput(playerId: string, input: PlayerInputState): void {
    this.inputs.set(playerId, input);
    if (input.receive || input.dive || input.spike || input.set) {
      this.receivePressedAtTick.set(playerId, this.tickCount);
    }
  }

  /**
   * Utilitário de teste / debug para posicionar bola ou jogador em cenários controlados.
   */
  public debugPlaceEntity(opts: {
    ballPos?: { x: number; y: number; z?: number };
    ballVel?: { x: number; y: number; z?: number };
    playerId?: string;
    playerPos?: { x: number; y: number; z?: number };
    playerVel?: { x: number; y: number; z?: number };
    ultimateCharge?: number;
    hasSelfSet?: boolean;
    playerTouches?: number;
  }): void {
    if (opts.ballPos) {
      this.phase = 'rally';
      this.serveInFlightTeam = null;
      this.clearHitstop();
      this.ballBody.setGravityScale(1, true);
      this.ballBody.setTranslation({ x: opts.ballPos.x, y: opts.ballPos.y, z: opts.ballPos.z ?? 0 }, true);
      this.ballBody.wakeUp();
      for (const pl of this.players) {
        const onSide = pl.team === 'left' ? opts.ballPos.x <= 0.08 : opts.ballPos.x >= -0.08;
        if (onSide) {
          this.ballVisitedPlayerSide.set(pl.id, true);
        }
      }
    }
    if (opts.ballVel) {
      this.phase = 'rally';
      this.serveInFlightTeam = null;
      this.ballBody.setGravityScale(1, true);
      this.ballBody.setLinvel({ x: opts.ballVel.x, y: opts.ballVel.y, z: opts.ballVel.z ?? 0 }, true);
      this.ballBody.wakeUp();
      this.lastIncomingPowerRatio = Math.min(1.2, Math.hypot(opts.ballVel.x, opts.ballVel.y) / 22);
    }
    if (opts.playerId) {
      const p = this.players.find((pl) => pl.id === opts.playerId);
      if (p) {
        if (opts.playerPos) {
          const minX = p.team === 'left' ? -(COURT.HALF_WIDTH + 2.0) : COURT.NET_BARRIER_HALF_X;
          const maxX = p.team === 'left' ? -COURT.NET_BARRIER_HALF_X : COURT.HALF_WIDTH + 2.0;
          p.x = Math.max(minX, Math.min(maxX, opts.playerPos.x));
          p.y = opts.playerPos.y;
          p.z = opts.playerPos.z ?? 0;
          this.playerBodies.get(p.id)?.setTranslation({ x: p.x, y: p.y + 0.66, z: 0 }, true);
        }
        if (opts.playerVel) {
          p.vx = opts.playerVel.x;
          p.vy = opts.playerVel.y;
          p.vz = opts.playerVel.z ?? 0;
        }
        if (opts.ultimateCharge !== undefined) {
          p.ultimateCharge = opts.ultimateCharge;
        }
        if (opts.hasSelfSet !== undefined) {
          p.hasSelfSet = opts.hasSelfSet;
        }
        if (opts.playerTouches !== undefined) {
          p.playerTouches = opts.playerTouches;
        }
      }
    }
  }

  public advanceNextServeAfterReplay(): void {
    const curScore = this.rulesManager.getScore();
    if (curScore.winner) {
      this.phase = 'finished';
    } else {
      this.resetForServe(curScore.servingTeam);
    }
  }

  public resetMatch(targetPoints?: number): void {
    this.rulesManager.resetMatch('left', targetPoints);
    this.trainingStats = { attempts: 0, perfects: 0, streak: 0 };
    this.servingSlotByTeam = { left: 0, right: 0 };
    this.lastServingTeam = 'left';
    this.consecutiveBlocks = 0;
    this.aiBlockCooldownByPlayer.clear();
    this.reset1v1PlayerPossession();
    for (const p of this.players) {
      p.ultimateCharge = 0;
      p.ultimateActiveTimer = 0;
      p.superAttackTimer = 0;
      p.spikesCount = 0;
      p.blocksCount = 0;
      p.perfectCount = 0;
      p.stunTimer = 0;
      const ctrl = this.controllers.get(p.id);
      ctrl?.fsm.reset();
      ctrl?.clearSuperAttack();
    }
    this.resetForServe('left');
  }

  private isTrainingMinigame(): boolean {
    return this.mode === 'training' || this.mode === 'training_spike' || this.mode === 'training_receive';
  }

  private resetForServe(servingTeam: TeamSide): void {
    // Revezamento de Saque: quando a equipe recupera o direito de sacar (side-out), alterna a vez entre os jogadores da dupla
    const servingTeamPlayers = this.players.filter((p) => p.team === servingTeam);
    if (servingTeam !== this.lastServingTeam && servingTeamPlayers.length > 1) {
      this.servingSlotByTeam[servingTeam] =
        (this.servingSlotByTeam[servingTeam] + 1) % servingTeamPlayers.length;
    }
    this.lastServingTeam = servingTeam;

    this.phase = 'serve_wait';
    this.phaseTimer = this.isTrainingMinigame() ? 0.65 : 1.25;
    this.serveSubPhase = 'ready';
    this.serveWhistleTimer = this.isTrainingMinigame() ? 0 : 0.48;
    this.serveWhistleBlown = this.isTrainingMinigame();
    this.pendingServeType = null;
    this.serveIdleTimer = 0;
    this.serveTossTimer = 0;
    this.rallyWithoutTouchTimer = 0;
    this.pointFreezeWatchdogTimer = 0;
    this.ballStuckTimer = 0;
    this.serveInFlightTeam = null;
    this.consecutiveBlocks = 0;
    this.aiBlockCooldownByPlayer.clear();
    this.reset1v1PlayerPossession();
    this.clearHitstop();
    this.rulesManager.resetRallyState(servingTeam);
    this.enemyTeamManagers.left.resetRally();
    this.enemyTeamManagers.right.resetRally();
    this.aiCommandCache.clear();
    this.lastIncomingPowerRatio = 0.55;
    this.activeUltimate = null;

    const leftPlayers = this.players.filter((p) => p.team === 'left');
    const rightPlayers = this.players.filter((p) => p.team === 'right');
    const server = this.getActiveServer(servingTeam);
    const serverOutX = servingTeam === 'left' ? -(COURT.HALF_WIDTH + 0.85) : COURT.HALF_WIDTH + 0.85;
    const serveBallX = servingTeam === 'left' ? -(COURT.HALF_WIDTH + 0.65) : COURT.HALF_WIDTH + 0.65;

    for (const p of this.players) {
      const teamCount = p.team === 'left' ? leftPlayers.length : rightPlayers.length;
      const spawn = this.getSpawnPosition(p.team, p.slotIndex, teamCount, p.role);
      const isServer = server?.id === p.id && !this.isTrainingMinigame();
      p.x = isServer ? serverOutX : spawn.x;
      p.y = 0;
      p.z = spawn.z;
      p.vx = 0;
      p.vy = 0;
      p.vz = 0;
      p.diveTimer = 0;
      p.stunTimer = 0;
      p.hitCooldown = 0;
      p.spikeCooldown = 0;
      p.hasSelfSet = false;
      p.playerTouches = 0;
      p.anim = 'idle';
      p.actionState = 'idle';
      this.controllers.get(p.id)?.fsm.reset();
      this.playerBodies.get(p.id)?.setTranslation({ x: p.x, y: 0.66, z: 0 }, true);
    }

    this.ballBody.setGravityScale(1, true);
    this.ballBody.setTranslation({ x: serveBallX, y: MATCH_RULES.SERVE_HEIGHT + 0.25, z: 0 }, true);
    this.ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.ballBody.sleep();
  }

  private getActiveServer(servingTeam: TeamSide): SimPlayerState | undefined {
    const rotatedSlot = this.servingSlotByTeam[servingTeam] ?? 0;
    return (
      this.players.find((p) => p.team === servingTeam && p.slotIndex === rotatedSlot) ??
      this.players.find((p) => p.team === servingTeam && p.slotIndex === 0) ??
      this.players.find((p) => p.team === servingTeam && p.role !== 'setter') ??
      this.players.find((p) => p.team === servingTeam)
    );
  }

  private launchTrainingMachineBall(): void {
    this.phase = 'rally';
    this.ballBody.setGravityScale(1, true);
    this.ballBody.wakeUp();
    this.rulesManager.resetRallyState('left');

    if (this.mode === 'training_spike') {
      // Máquina lançadora envia levantamento parabólico alto colado à rede (-0.85m)
      this.ballBody.setTranslation({ x: -1.65, y: 1.5, z: 0 }, true);
      this.ballBody.setLinvel({ x: 0.74, y: 10.6, z: 0 }, true);
      this.ballBody.setAngvel({ x: 0, y: 0, z: -3 }, true);
      // Simula 2 toques prévios para a próxima batida ser o corte direto
      this.rulesManager.registerTouch('machine_1', 'left', { ignoreFaults: true });
      this.rulesManager.registerTouch('machine_2', 'left', { ignoreFaults: true });
      this.pendingEvents.push({
        type: 'launcher',
        x: -1.65,
        y: 1.5,
        z: 0,
        callout: 'LEVANTAMENTO!',
      });
    } else {
      // Máquina lançadora de recepção dispara saques de fora da quadra pelo centro
      const launchX = COURT.HALF_WIDTH + 0.65;
      this.ballBody.setTranslation({ x: launchX, y: 2.8, z: 0 }, true);
      const flight = 1.48;
      const vx = (-COURT.HALF_WIDTH * 0.45 - launchX) / flight;
      const vy = (0.8 - 2.8 - 0.5 * PHYSICS.GRAVITY * flight * flight) / flight;
      this.ballBody.setLinvel({ x: vx, y: vy, z: 0 }, true);
      this.ballBody.setAngvel({ x: 0, y: 0, z: 14 }, true);
      this.rulesManager.resetRallyState('right');
      this.lastIncomingPowerRatio = 0.78;
      this.pendingEvents.push({
        type: 'launcher',
        x: launchX,
        y: 2.8,
        z: 0,
        callout: 'DEFENDA!',
      });
    }
  }

  private triggerServeToss(servingTeam: TeamSide): void {
    const server = this.getActiveServer(servingTeam);
    const dir = servingTeam === 'left' ? 1 : -1;
    const tossX = server ? server.x + dir * 0.35 : servingTeam === 'left' ? -(COURT.HALF_WIDTH + 0.65) : COURT.HALF_WIDTH + 0.65;
    const tossY = (server?.y ?? 0) + 1.45;
    this.serveSubPhase = 'tossed';
    this.serveTossTimer = 0;
    this.ballBody.setGravityScale(1, true);
    this.ballBody.wakeUp();
    this.ballBody.setTranslation({ x: tossX, y: tossY, z: 0 }, true);
    this.ballBody.setLinvel({ x: dir * 0.12, y: 8.2, z: 0 }, true);
    this.ballBody.setAngvel({ x: 0, y: 0, z: -dir * 4 }, true);

    if (server) {
      const ctrl = this.controllers.get(server.id);
      ctrl?.fsm.startServeToss(0.45);
      server.anim = 'serve_toss';
      server.actionState = 'serve_toss';
      server.animTimer = 0;
    }
  }

  /**
   * Regra A — Contexto de Saque (Hold - Máximo 1.5s):
   * Avalia o `chargeTime` final ao soltar o botão 'F' no estado `isServing`:
   * - Soltar entre 0.0s e 0.3s (Toque Rápido, <= timeForUnderhand): Executa o Saque Por Baixo ('underhand').
   * - Soltar entre 0.4s e 1.0s (Charge Médio, <= timeForFloat): Executa o Saque Flutuante ('float').
   * - Soltar acima de 1.1s (Charge Máximo, > timeForFloat, limite prático 1.5s): Executa o Saque Viagem ('jump_serve').
   */
  public executeServeByChargeTime(servingTeam: TeamSide, chargeTime: number): ServeType {
    const server = this.getActiveServer(servingTeam);
    const clampedCharge = Math.max(0, Math.min(this.maxServeChargeTime, chargeTime));
    if (clampedCharge <= this.timeForUnderhand + 1e-6) {
      // Soltar entre 0.0s e 0.3s (Toque Rápido): Executa o Saque Por Baixo (Underhand Serve)
      this.launchServe(servingTeam, {
        isSimpleServe: true,
        forcedServeType: 'underhand',
        calloutOverride: 'SAQUE POR BAIXO!',
      });
      return 'underhand';
    } else if (clampedCharge <= this.timeForFloat + 1e-6) {
      // Soltar entre 0.4s e 1.0s (Charge Médio): Executa o Saque Flutuante (Float Serve)
      this.launchServe(servingTeam, {
        isSimpleServe: true,
        forcedServeType: 'float',
        calloutOverride: 'SAQUE FLUTUANTE!',
      });
      return 'float';
    } else {
      // Soltar acima de 1.1s (Charge Máximo, até 1.5s): Executa o Saque Viagem (Jump Serve)
      this.pendingServeType = 'jump_serve';
      if (server && server.y <= 0.03) {
        const ctrl = this.controllers.get(server.id);
        if (ctrl?.fsm.startJump()) {
          server.vy = ctrl.getBaseJumpVelocity();
        }
      }
      this.triggerServeToss(servingTeam);
      return 'jump_serve';
    }
  }

  private launchServe(
    servingTeam: TeamSide,
    opts?: { isSimpleServe?: boolean; forcedServeType?: ServeType; calloutOverride?: string },
  ): void {
    if (this.mode === 'training_spike' || this.mode === 'training_receive') {
      this.launchTrainingMachineBall();
      return;
    }

    this.phase = 'rally';
    this.serveSubPhase = 'ready';
    this.serveInFlightTeam = servingTeam;
    this.ballBody.setGravityScale(1, true);
    this.ballBody.wakeUp();
    this.rulesManager.resetRallyState(servingTeam);
    this.enemyTeamManagers.left.resetRally();
    this.enemyTeamManagers.right.resetRally();

    const server = this.getActiveServer(servingTeam);
    const diff: AiDifficulty = server?.aiDifficulty ?? 'medium';
    const diffProfile = DIFFICULTY_TUNING[diff];
    const input = server ? this.inputs.get(server.id) : undefined;

    let serveType: ServeType = opts?.forcedServeType
      ? opts.forcedServeType
      : opts?.isSimpleServe
        ? input?.serveType === 'underhand'
          ? 'underhand'
          : 'float'
        : this.pendingServeType === 'jump_serve'
          ? 'jump_serve'
          : input?.serveType ?? 'float';
    if (
      !opts?.isSimpleServe &&
      !opts?.forcedServeType &&
      !server?.isAi &&
      (input?.serveJumpCharge || input?.serveJumpTrigger || (server && server.y > 0.25))
    ) {
      serveType = 'jump_serve';
    }
    if (server?.isAi) {
      serveType = this.aiRng() < diffProfile.aiJumpServeChance ? 'jump_serve' : 'float';
    }
    this.pendingServeType = null;

    const curBallPos = this.ballBody.translation();
    const serveOutDefaultX =
      servingTeam === 'left' ? -(COURT.HALF_WIDTH + 0.65) : COURT.HALF_WIDTH + 0.65;
    const serveBallX =
      Math.abs(curBallPos.x) >= COURT.HALF_WIDTH + 0.45 ? curBallPos.x : serveOutDefaultX;
    const serveBallY = opts?.isSimpleServe
      ? serveType === 'underhand'
        ? 1.1
        : 1.72
      : serveType === 'jump_serve'
        ? Math.max(2.95, curBallPos.y)
        : curBallPos.y > 1.8
          ? curBallPos.y
          : MATCH_RULES.SERVE_HEIGHT + 0.45;
    this.ballBody.setTranslation({ x: serveBallX, y: serveBallY, z: 0 }, true);

    if (server) {
      const ctrl = this.controllers.get(server.id);
      if (opts?.isSimpleServe) {
        server.vy = 0;
        ctrl?.fsm.startSimpleServe(0.32);
      } else {
        if (serveType === 'jump_serve' && server.y < 0.2) {
          server.vy = 7.4;
        }
        ctrl?.fsm.startServe(0.36);
      }
      server.anim = 'serve';
      server.actionState = 'serve';
      server.animTimer = 0;
    }

    const serveForceMultiplier =
      serveType === 'jump_serve' ? PHYSICS.SERVE_FORCE_MULTIPLIER : 1.0;
    const vel = computeServeVelocity(servingTeam, serveType, diff, 0, serveForceMultiplier);
    this.ballBody.setLinvel({ x: vel.vx, y: vel.vy, z: 0 }, true);
    this.ballBody.setAngvel({ x: 0, y: 0, z: vel.angZ }, true);
    this.lastIncomingPowerRatio =
      serveType === 'jump_serve' ? 0.92 : serveType === 'underhand' ? 0.48 : 0.55;

    const defaultCallout =
      serveType === 'jump_serve'
        ? 'SAQUE VIAGEM!'
        : serveType === 'underhand' && opts?.calloutOverride
          ? opts.calloutOverride
          : opts?.calloutOverride ?? 'SAQUE SIMPLES!';

    this.pendingEvents.push({
      type: 'serve',
      x: serveBallX,
      y: serveBallY,
      z: 0,
      team: servingTeam,
      playerId: server?.id,
      serveType,
      power: serveType === 'jump_serve' ? 0.96 : serveType === 'underhand' ? 0.5 : 0.55,
      isForcedAttack: serveType === 'jump_serve',
      callout: defaultCallout,
    });
  }

  private activateHitstop(durationSec: number): void {
    const safeSec = Number.isFinite(durationSec) && durationSec > 0
      ? Math.min(VolleyballRapierWorld.MAX_HITSTOP_SEC, durationSec)
      : 0;
    if (safeSec <= 0) return;
    this.hitstopTimer = safeSec;
    this.hitstopRealDeadlineMs = Date.now() + Math.round(safeSec * 1000) + 80;
  }

  private clearHitstop(): void {
    this.hitstopTimer = 0;
    this.hitstopRealDeadlineMs = 0;
  }

  /**
   * Watchdog / Timeout de Segurança (5 a 8 segundos):
   * Destrava qualquer estado congelado (point_freeze prolongado, bola presa ou pacote de fim de rally perdido)
   * e força o avanço sincronizado para o próximo ponto (ForceNextPoint / SyncState).
   */
  public forceNextPointSync(reason = 'WATCHDOG_TIMEOUT'): MatchSnapshot {
    this.clearHitstop();
    const bPos = this.ballBody.translation();

    if (this.phase === 'rally' && !this.isTrainingMinigame()) {
      const scoringTeam: TeamSide = bPos.x < 0 ? 'right' : 'left';
      const nextScore = this.rulesManager.awardPoint(scoringTeam);
      if (nextScore.winner) {
        this.phase = 'finished';
      } else {
        this.resetForServe(nextScore.servingTeam);
      }
    } else {
      const curScore = this.rulesManager.getScore();
      if (curScore.winner) {
        this.phase = 'finished';
      } else {
        this.resetForServe(curScore.servingTeam);
      }
    }

    this.pendingEvents.push({
      type: 'sync_state',
      x: bPos.x,
      y: bPos.y,
      z: 0,
      callout: reason,
    });

    return this.collectSnapshot();
  }

  public step(dt: number = PHYSICS.FIXED_DT): MatchSnapshot {
    const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : PHYSICS.FIXED_DT;
    this.tickCount += 1;
    this.bounceSfxCooldown = Math.max(0, this.bounceSfxCooldown - safeDt);

    if (this.hitstopTimer > 0) {
      if (
        !Number.isFinite(this.hitstopTimer) ||
        (this.hitstopRealDeadlineMs > 0 && Date.now() >= this.hitstopRealDeadlineMs)
      ) {
        this.clearHitstop();
      } else {
        this.hitstopTimer = Math.max(0, this.hitstopTimer - safeDt);
        if (this.hitstopTimer <= 0) {
          this.hitstopRealDeadlineMs = 0;
        } else if (this.phase === 'rally') {
          return this.collectSnapshot();
        }
      }
    }

    if (this.phase === 'serve_wait') {
      if (this.isTrainingMinigame()) {
        this.phaseTimer -= dt;
        this.updatePlayers(dt, false);
        const humanTrainer = this.players.find((pl) => !pl.isAi);
        const trainerInput = humanTrainer ? this.inputs.get(humanTrainer.id) : undefined;
        const manualServePressed = Boolean(
          trainerInput?.serveReleaseChargeTime !== undefined ||
            trainerInput?.serveNormalTrigger ||
            trainerInput?.serveUnderhandTrigger ||
            trainerInput?.serveJumpTrigger ||
            trainerInput?.serveQuickTap,
        );
        if (this.phaseTimer <= 0 || manualServePressed) {
          this.launchServe(this.rulesManager.getScore().servingTeam);
        }
        return this.collectSnapshot();
      }

      const servingTeam = this.rulesManager.getScore().servingTeam;
      const server = this.getActiveServer(servingTeam);
      const serverInput = server && !server.isAi ? this.inputs.get(server.id) : undefined;
      const dir = servingTeam === 'left' ? 1 : -1;

      this.updatePlayers(dt, false);

      // 1) Aguarda apito oficial do árbitro antes de liberar qualquer ação de saque
      if (!this.serveWhistleBlown) {
        const holdX = server ? server.x + dir * 0.42 : servingTeam === 'left' ? -(COURT.HALF_WIDTH + 0.65) : COURT.HALF_WIDTH + 0.65;
        const holdY = (server?.y ?? 0) + 1.15;
        this.ballBody.setTranslation({ x: holdX, y: holdY, z: 0 }, true);
        this.ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);

        this.serveWhistleTimer -= dt;
        if (this.serveWhistleTimer <= 0) {
          this.serveWhistleBlown = true;
          this.pendingEvents.push({
            type: 'whistle',
            x: server?.x ?? holdX,
            y: 2.0,
            z: 0,
            team: servingTeam,
            playerId: server?.id,
            callout: server && !server.isAi ? 'APITO! SEGURE PARA SACAR!' : undefined,
          });
        }
        return this.collectSnapshot();
      }

      this.serveIdleTimer += dt;

      const serverOutsideCourt =
        !server || !server.isAi || isCompletelyOutsideCourtForServe(server.x, servingTeam);

      if (this.serveSubPhase === 'ready') {
        const holdX =
          server && serverOutsideCourt
            ? server.x + dir * 0.42
            : servingTeam === 'left'
              ? -(COURT.HALF_WIDTH + 0.65)
              : COURT.HALF_WIDTH + 0.65;
        const holdY = (server?.y ?? 0) + 1.15;
        this.ballBody.setTranslation({ x: holdX, y: holdY, z: 0 }, true);
        this.ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);

        if (server && !server.isAi) {
          const ctrl = this.controllers.get(server.id);

          // 3. Tratamento de Conflitos e Contexto (if (isServing)):
          // Bloqueia completamente ações de Bloqueio Especial (2 ou 3 toques) enquanto segura a bola para sacar!
          if (
            serverInput?.hybridCommand === 'double_tap_low_block' ||
            serverInput?.hybridCommand === 'triple_tap_deep_block'
          ) {
            ctrl?.resolveContextualHybridAction(serverInput.hybridCommand, {
              isServing: true,
              inGame: false,
              nearNet: false,
            });
            serverInput.hybridCommand = undefined;
            serverInput.serveReleaseChargeTime = undefined;
            return this.collectSnapshot();
          }

          // 1) Hold to Charge (OnPointerDown / GetKeyDown): Enquanto segura o botão de Ação ('F' / Touch),
          // o personagem permanece em PreparingServe segurando a bola e acumulando holdTimer / chargeTime.
          if (serverInput?.preparingServe) {
            ctrl?.fsm.startPreparingServe(0.25);
            server.actionState = 'preparing_serve';
            server.anim = 'preparing_serve';
            this.serveIdleTimer = 0;
            return this.collectSnapshot();
          }

          // 2) Ao soltar o botão (OnPointerUp / GetKeyUp) ou confirmar comando no estado isServing:
          // - Soltar entre 0.0s e 0.3s (Toque Rápido): Saque Por Baixo
          // - Soltar entre 0.4s e 1.0s (Charge Médio): Saque Flutuante
          // - Soltar acima de 1.1s (Charge Máximo, máx 1.5s): Saque Viagem
          if (
            serverInput?.hybridCommand === 'serve_jump_max' ||
            serverInput?.hybridCommand === 'serve_float_medium' ||
            serverInput?.hybridCommand === 'serve_underhand_quick' ||
            serverInput?.hybridCommand === 'hold_3s_jump_serve' ||
            serverInput?.hybridCommand === 'hold_1s_underhand_serve' ||
            serverInput?.hybridCommand === 'single_tap'
          ) {
            const cmd = serverInput.hybridCommand;
            const releaseTime =
              typeof serverInput.serveReleaseChargeTime === 'number'
                ? serverInput.serveReleaseChargeTime
                : cmd === 'serve_jump_max' || cmd === 'hold_3s_jump_serve'
                  ? this.timeForJumpServe
                  : cmd === 'serve_float_medium'
                    ? 0.65
                    : cmd === 'serve_underhand_quick' || cmd === 'hold_1s_underhand_serve'
                      ? 0.15
                      : 0.15;
            serverInput.hybridCommand = undefined;
            serverInput.serveReleaseChargeTime = undefined;
            this.executeServeByChargeTime(servingTeam, releaseTime);
            return this.collectSnapshot();
          }

          if (typeof serverInput?.serveReleaseChargeTime === 'number') {
            const releasedCharge = serverInput.serveReleaseChargeTime;
            serverInput.serveReleaseChargeTime = undefined;
            serverInput.hybridCommand = undefined;
            this.executeServeByChargeTime(servingTeam, releasedCharge);
            return this.collectSnapshot();
          }

          // Fallback para gatilhos diretos / testes unitários legados
          const wantsNormalServe = Boolean(
            serverInput?.serveNormalTrigger ||
              serverInput?.serveUnderhandTrigger ||
              (serverInput?.serveQuickTap && serverInput?.serveType !== 'jump_serve'),
          );
          if (wantsNormalServe) {
            const forcedServeType: ServeType | undefined = serverInput?.serveUnderhandTrigger
              ? 'underhand'
              : serverInput?.serveNormalTrigger
                ? 'float'
                : undefined;
            this.launchServe(servingTeam, { isSimpleServe: true, forcedServeType });
            return this.collectSnapshot();
          }

          const wantsJumpServeToss = Boolean(
            serverInput?.serveJumpTrigger ||
              serverInput?.serveJumpCharge ||
              serverInput?.jump ||
              (serverInput?.serveQuickTap && serverInput?.serveType === 'jump_serve') ||
              (serverInput?.spike && serverInput.spikeHeld === undefined),
          );
          if (wantsJumpServeToss) {
            this.pendingServeType = 'jump_serve';
            if ((serverInput?.serveJumpTrigger || serverInput?.jump || serverInput?.serveJumpCharge) && server.y <= 0.03) {
              const ctrl = this.controllers.get(server.id);
              if (ctrl?.fsm.startJump()) {
                server.vy = ctrl.getBaseJumpVelocity();
              }
            }
            this.triggerServeToss(servingTeam);
          } else if (this.serveIdleTimer >= VolleyballRapierWorld.SERVE_TIMEOUT_SEC) {
            // Timeout de segurança (8s): força Saque Normal automático para evitar travamento esperando tecla
            this.launchServe(servingTeam, { isSimpleServe: true, forcedServeType: 'float' });
            this.pendingEvents.push({
              type: 'whistle',
              x: server.x,
              y: 2.0,
              z: 0,
              team: servingTeam,
              playerId: server.id,
              callout: 'TEMPO ESGOTADO! SAQUE AUTOMÁTICO!',
            });
            return this.collectSnapshot();
          }
        } else if (serverOutsideCourt && this.serveIdleTimer >= 0.42) {
          // Servidor IA só ativa o estado de saque quando estiver 100% fora da área de jogo (atrás da linha de fundo)
          this.triggerServeToss(servingTeam);
        } else if (!serverOutsideCourt) {
          // Enquanto a IA caminha até atrás da linha de fundo, mantém timer de saque travado
          this.serveIdleTimer = 0;
        }
      } else {
        this.serveTossTimer += safeDt;
        this.world.step();
        const bPos = this.ballBody.translation();
        const bVel = this.ballBody.linvel();
        if (Math.abs(bPos.z) > 0.0005) {
          this.ballBody.setTranslation({ x: bPos.x, y: bPos.y, z: 0 }, true);
        }
        if (Math.abs(bVel.z) > 0.0005) {
          this.ballBody.setLinvel({ x: bVel.x, y: bVel.y, z: 0 }, true);
        }

        // Se o sacador humano ainda está no chão após lançar, salta para o corte no ar
        if (
          server &&
          !server.isAi &&
          server.y <= 0.03 &&
          (serverInput?.jump || serverInput?.spike || this.pendingServeType === 'jump_serve')
        ) {
          const ctrl = this.controllers.get(server.id);
          if (ctrl?.fsm.startJump()) {
            server.vy = ctrl.getBaseJumpVelocity();
          }
        }

        const humanStrikes =
          Boolean(serverInput?.spike || serverInput?.serveQuickTap || serverInput?.serveJumpTrigger) &&
          this.serveTossTimer >= 0.08;
        const forcedJumpApexStrike =
          this.pendingServeType === 'jump_serve' && this.serveTossTimer >= 0.34 && bVel.y <= 0.35;
        const aiStrikes = Boolean(server?.isAi) && this.serveTossTimer >= 0.42;
        const apexFallbackStrikes = this.serveTossTimer >= 0.3 && bVel.y < -0.35 && bPos.y <= 2.45;
        const tossTimeoutStrikes = this.serveTossTimer >= 2.2;
        if (humanStrikes || forcedJumpApexStrike || aiStrikes || apexFallbackStrikes || tossTimeoutStrikes) {
          this.launchServe(servingTeam, { isSimpleServe: tossTimeoutStrikes });
        }
      }
      return this.collectSnapshot();
    }

    if (this.phase === 'point_freeze') {
      this.phaseTimer -= safeDt;
      this.pointFreezeWatchdogTimer += safeDt;
      this.world.step();
      const transition = this.rulesManager.tickPointTransition(safeDt);
      if (
        !Number.isFinite(this.phaseTimer) ||
        this.phaseTimer <= 0 ||
        transition.ready ||
        this.pointFreezeWatchdogTimer >= VolleyballRapierWorld.POINT_FREEZE_WATCHDOG_SEC
      ) {
        const curScore = this.rulesManager.getScore();
        if (curScore.winner) {
          this.phase = 'finished';
        } else {
          this.resetForServe(curScore.servingTeam);
        }
      }
      return this.collectSnapshot();
    }

    if (this.phase === 'finished') {
      this.updateCelebrationPoses(dt);
      return this.collectSnapshot();
    }

    // Rally ativo
    this.rallyWithoutTouchTimer += safeDt;
    this.updatePlayers(dt, true);

    // Efeito Magnus vertical/horizontal calibrado para a massa reduzida da bola (sem derrubar o Saque Viagem na rede)
    const vel = this.ballBody.linvel();
    const ang = this.ballBody.angvel();
    if (Math.abs(ang.z) > 10) {
      this.ballBody.applyImpulse(
        {
          x: -ang.z * 0.000045,
          y: ang.z * vel.x * 0.000028,
          z: 0,
        },
        true,
      );
    }

    const preBallPos = this.ballBody.translation();
    const preBallVel = this.ballBody.linvel();
    this.world.step(this.eventQueue);

    let ballTouchedFloorCollider = false;
    let ballTouchedOutZoneEvent = false;
    const outZoneHandles = new Set(this.outZoneColliders.map((c) => c.handle));
    const ballHandle = this.ballCollider.handle;
    const floorHandle = this.floorCollider.handle;
    this.eventQueue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const other = h1 === ballHandle ? h2 : h2 === ballHandle ? h1 : null;
      if (other === null) return;
      if (other === floorHandle) ballTouchedFloorCollider = true;
      if (outZoneHandles.has(other)) ballTouchedOutZoneEvent = true;
    });

    const postVel = this.ballBody.linvel();
    const speed = Math.hypot(postVel.x, postVel.y);
    if (speed > PHYSICS.BALL_MAX_SPEED) {
      const s = PHYSICS.BALL_MAX_SPEED / speed;
      this.ballBody.setLinvel({ x: postVel.x * s, y: postVel.y * s, z: 0 }, true);
    }

    // Trava estrita no eixo central da quadra (Z = 0, Vz = 0)
    let bPos = this.ballBody.translation();
    let bVel = this.ballBody.linvel();
    if (Math.abs(bPos.z) > 0.0005) {
      this.ballBody.setTranslation({ x: bPos.x, y: bPos.y, z: 0 }, true);
      bPos = this.ballBody.translation();
    }
    if (Math.abs(bVel.z) > 0.0005) {
      this.ballBody.setLinvel({ x: bVel.x, y: bVel.y, z: 0 }, true);
      bVel = this.ballBody.linvel();
    }
    if (Math.abs(ang.x) > 0.001 || Math.abs(ang.y) > 0.001) {
      this.ballBody.setAngvel({ x: 0, y: 0, z: ang.z }, true);
    }

    if (this.prevBallVy < -2.2 && bVel.y > 0.5 && bPos.y < PHYSICS.BALL_RADIUS + 0.35 && this.bounceSfxCooldown <= 0) {
      this.bounceSfxCooldown = 0.25;
      this.reset1v1PlayerPossession();
      this.pendingEvents.push({ type: 'bounce', x: bPos.x, y: 0.1, z: bPos.z });
    }
    this.prevBallVy = bVel.y;

    this.handlePlayerBallHits();
    bPos = this.ballBody.translation();
    bVel = this.ballBody.linvel();
    for (const pl of this.players) {
      const onMySide = pl.team === 'left' ? bPos.x <= 0.08 : bPos.x >= -0.08;
      const onOppSide = pl.team === 'left' ? bPos.x > 0.08 : bPos.x < -0.08;
      const comingToMe = pl.team === 'left' ? bVel.x < -0.2 : bVel.x > 0.2;
      if (onMySide) {
        this.ballVisitedPlayerSide.set(pl.id, true);
      }
      if (
        onOppSide &&
        (pl.hasSelfSet || (pl.playerTouches ?? 0) > 0) &&
        (this.ballVisitedPlayerSide.get(pl.id) || !comingToMe)
      ) {
        this.reset1v1PlayerPossession(pl.id);
      }
    }
    if (this.phase !== 'rally') {
      return this.collectSnapshot();
    }

    // Verifica colisão imediata com o chão ou Trigger "OutZone" (Bola Dentro / Bola Fora)
    const outZoneSensorHit =
      ballTouchedOutZoneEvent || this.outZoneColliders.some((c) => this.world.intersectionPair(this.ballCollider, c));
    const lowFloorContact = bPos.y <= PHYSICS.BALL_RADIUS + 0.06 && bVel.y <= 0.4;
    const bouncedOnFloorThisStep =
      ballTouchedFloorCollider ||
      (preBallVel.y < -0.5 && bVel.y > 0.2 && Math.min(preBallPos.y, bPos.y) <= PHYSICS.BALL_RADIUS + 0.55);

    if (outZoneSensorHit || lowFloorContact || bouncedOnFloorThisStep) {
      this.reset1v1PlayerPossession();
      if (this.mode === 'training_spike' || this.mode === 'training_receive') {
        if (lowFloorContact || bouncedOnFloorThisStep) {
          this.launcherTimer -= dt;
          if (bPos.x < 0 && this.mode === 'training_receive') {
            this.trainingStats.streak = 0;
          }
          if (this.launcherTimer <= 0) {
            this.launcherTimer = 0.65;
            this.launchTrainingMachineBall();
          }
        }
      } else if (this.mode === 'training') {
        if (lowFloorContact && Math.abs(bVel.y) < 1.2 && Math.hypot(bVel.x, bVel.z) < 1.0) {
          this.ballBody.setLinvel({ x: -Math.sign(bPos.x || 1) * 4.5, y: 9.0, z: 0 }, true);
        }
      } else {
        // Interpola o ponto exato do impacto no chão antes de qualquer quique de retorno
        let impactX = bPos.x;
        let impactZ = bPos.z;
        if (preBallVel.y < 0 && bVel.y > 0) {
          const denom = Math.max(0.001, Math.abs(preBallVel.y) + Math.abs(bVel.y));
          const tImpact = Math.abs(preBallVel.y) / denom;
          impactX = preBallPos.x + (bPos.x - preBallPos.x) * tImpact;
          impactZ = preBallPos.z + (bPos.z - preBallPos.z) * tImpact;
        }

        const touchSnap = this.rulesManager.getTouchesSnapshot();
        const sensorInBounds = this.world.intersectionPair(this.ballCollider, this.inBoundsFloorCollider);
        const landing = this.rulesManager.resolveCourtLanding(
          impactX,
          impactZ,
          touchSnap.lastTouchTeam,
          PHYSICS.BALL_RADIUS,
        );
        const isOutZone = outZoneSensorHit || !landing.inBounds;

        if (isOutZone) {
          // Zera velocidade imediatamente na OutZone para impedir que a bola quique de volta para a quadra
          this.freezeBallAtImpact(impactX, impactZ);
          const outFault = this.rulesManager.resolveOutZoneFault(
            (pid) => this.players.find((pl) => pl.id === pid)?.team,
          );
          this.registerPoint(outFault.scoringTeam, impactX, impactZ, outFault.callout);
        } else {
          const inBounds = sensorInBounds || landing.inBounds;
          const scoringTeam: TeamSide = inBounds
            ? impactX < 0
              ? 'right'
              : 'left'
            : touchSnap.lastTouchTeam === 'left'
              ? 'right'
              : 'left';
          this.freezeBallAtImpact(impactX, impactZ);
          this.registerPoint(scoringTeam, impactX, impactZ, inBounds ? 'BOLA DENTRO!' : 'BOLA FORA!');
        }
      }
    } else if (!this.isTrainingMinigame()) {
      // Watchdog durante o Rally (5 a 8 segundos sem resolução ou bola estagnada):
      const isBallStagnant =
        Math.hypot(bVel.x, bVel.y) < 0.25 ||
        bPos.y < -0.5 ||
        Math.abs(bPos.x) > COURT.HALF_WIDTH + COURT.OUT_MARGIN + 4.0;
      if (isBallStagnant) {
        this.ballStuckTimer += safeDt;
      } else {
        this.ballStuckTimer = 0;
      }
      if (
        this.ballStuckTimer >= 2.2 ||
        this.rallyWithoutTouchTimer >= VolleyballRapierWorld.RALLY_WATCHDOG_TIMEOUT_SEC
      ) {
        return this.forceNextPointSync('WATCHDOG_TIMEOUT');
      }
    }

    return this.collectSnapshot();
  }

  private freezeBallAtImpact(x: number, z: number): void {
    this.ballBody.setTranslation({ x, y: PHYSICS.BALL_RADIUS, z }, true);
    this.ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.ballBody.setGravityScale(0, true);
    this.ballBody.sleep();
  }

  private registerPoint(scoringTeam: TeamSide, x: number, z: number, callout?: string): void {
    this.clearHitstop();
    this.reset1v1PlayerPossession();
    this.rallyWithoutTouchTimer = 0;
    this.pointFreezeWatchdogTimer = 0;
    this.ballStuckTimer = 0;
    const nextScore = this.rulesManager.awardPoint(scoringTeam);
    this.phase = 'point_freeze';
    this.phaseTimer = MATCH_RULES.POINT_FREEZE_DELAY;
    this.pendingEvents.push({
      type: 'point',
      x,
      y: 0.2,
      z,
      scoringTeam,
      callout,
    });
    if (nextScore.winner) {
      this.pendingEvents.push({
        type: 'victory',
        x: 0,
        y: 1.5,
        z: 0,
        scoringTeam: nextScore.winner,
      });
    }
  }

  private updateCelebrationPoses(dt: number): void {
    const winner = this.rulesManager.getScore().winner;
    for (const p of this.players) {
      p.animTimer += dt;
      const won = p.team === winner;
      p.anim = won ? 'celebrate' : 'lose';
      p.actionState = p.anim;
      this.controllers.get(p.id)?.fsm.transitionTo(p.anim, true);
    }
  }

  private computeAllAiCommands(allowActions: boolean, dt: number): void {
    const ballPos = this.ballBody.translation();
    const ballVel = this.ballBody.linvel();
    const touchSnap = this.rulesManager.getTouchesSnapshot();
    this.aiCommandCache.clear();

    for (const team of ['left', 'right'] as const) {
      const teamPlayers = this.players.filter((pl) => pl.team === team);
      const teamAiPlayers = teamPlayers.filter((pl) => pl.isAi);
      if (teamAiPlayers.length === 0) continue;

      const oppTeam: TeamSide = team === 'left' ? 'right' : 'left';
      const oppPrimary =
        this.players.find((pl) => pl.team === oppTeam && !pl.isAi) ??
        this.players.find((pl) => pl.team === oppTeam);
      const touchesOnSide = touchSnap.lastTouchTeam === team ? this.rulesManager.getTouches(team) : 0;

      // Caso 1: Time com 1 Humano + 1 Parceiro P2 (FSM Autônoma)
      const human = teamPlayers.find((pl) => !pl.isAi);
      if (human && teamAiPlayers.length === 1) {
        const partner = teamAiPlayers[0];
        const partnerCtrl = this.controllers.get(partner.id);
        const oppPlayers = this.players.filter((pl) => pl.team === oppTeam);
        const oppTouchesOnSide =
          touchSnap.lastTouchTeam === oppTeam ? this.rulesManager.getTouches(oppTeam) : 0;
        const oppAttacker =
          oppPlayers.find(
            (pl) =>
              pl.y > 0.2 ||
              pl.vy > 2.0 ||
              pl.actionState === 'airborne' ||
              pl.actionState === 'attack_windup' ||
              pl.actionState === 'spike' ||
              pl.actionState === 'shark_attack',
          ) ?? oppPrimary;
        const partnerBallOnMySide =
          partner.team === 'left' ? ballPos.x < 0.2 : ballPos.x > -0.2;
        const partnerBlockEval = this.enemyTeamManagers[team].evaluateBlockAttempt(
          partnerBallOnMySide,
          dt,
        );
        const cmd = decideAlliedPartnerAction({
          partnerPos: { x: partner.x, y: partner.y, z: partner.z },
          partnerVelY: partner.vy,
          partnerTeam: partner.team,
          partnerCanHit: partner.hitCooldown <= 0 && allowActions,
          humanPos: { x: human.x, y: human.y, z: human.z },
          humanJumping: human.y > 0.35,
          humanStunned: human.stunTimer > 0,
          ballPos,
          ballVel,
          touchesOnSide,
          lastTouchTeam: touchSnap.lastTouchTeam,
          lastTouchPlayerId: touchSnap.lastTouchPlayerId,
          lastTouchWasBlock: touchSnap.lastTouchWasBlock,
          humanId: human.id,
          difficulty: partner.aiDifficulty,
          tick: this.tickCount,
          oppTouchesOnSide,
          oppAttackerPos: oppAttacker ? { x: oppAttacker.x, y: oppAttacker.y, z: oppAttacker.z } : undefined,
          oppAttackerVelY: oppAttacker?.vy,
          oppAttackerActionState: oppAttacker?.actionState,
          oppAttackerJumping: oppAttacker ? oppAttacker.y > 0.22 || oppAttacker.vy > 2.0 : false,
          blockEval: partnerBlockEval,
        });
        const isDedicatedSetterOnly = partner.id === 'ally_setter' && oppPlayers.length === 1;
        const activeServerNow = this.getActiveServer(this.rulesManager.getScore().servingTeam);
        const partnerIsActiveServer =
          this.phase === 'serve_wait' && activeServerNow?.id === partner.id;
        const partnerActsAsAttacker =
          !isDedicatedSetterOnly &&
          !partnerCtrl?.fsm.isStunned() &&
          touchesOnSide === 2 &&
          ((touchSnap.lastTouchTeam === team && touchSnap.lastTouchPlayerId === human.id && !touchSnap.lastTouchWasBlock) ||
            human.stunTimer > 0 ||
            Math.abs(human.x - ballPos.x) > 2.4);
        this.aiCommandCache.set(partner.id, {
          ...cmd,
          moveX: partnerIsActiveServer ? 0 : cmd.moveX,
          jump: partnerIsActiveServer || isDedicatedSetterOnly ? false : cmd.jump,
          spike: partnerIsActiveServer || isDedicatedSetterOnly ? false : cmd.spike,
          dive: partnerIsActiveServer ? false : cmd.dive,
          intendedRole: isDedicatedSetterOnly ? 'setter' : partnerActsAsAttacker ? 'attacker' : cmd.intendedRole,
          faceOpponents: true,
        });
        continue;
      }

      // Caso 2: Dupla 2v2 de IA (ou 1v1 IA) via EnemyTeamManager com cooperação + humanização + recuo para saque
      const diff = teamAiPlayers[0].aiDifficulty;
      const curScore = this.rulesManager.getScore();
      const activeServer = this.getActiveServer(curScore.servingTeam);
      const duoCmds = this.enemyTeamManagers[team].computeDuoCommands({
        team,
        difficulty: diff,
        ballPos,
        ballVel,
        touchesOnSide,
        lastTouchTeam: touchSnap.lastTouchTeam,
        lastTouchPlayerId: touchSnap.lastTouchPlayerId,
        lastTouchWasBlock: touchSnap.lastTouchWasBlock,
        opposingPos: oppPrimary ? { x: oppPrimary.x, y: oppPrimary.y, z: oppPrimary.z } : undefined,
        opposingJumping: oppPrimary ? oppPrimary.y > 0.35 : false,
        players: teamAiPlayers.map((pl) => ({
          id: pl.id,
          slotIndex: pl.slotIndex,
          pos: { x: pl.x, y: pl.y, z: pl.z },
          velY: pl.vy,
          isStunned: pl.stunTimer > 0,
          canHit: pl.hitCooldown <= 0 && allowActions,
        })),
        tick: this.tickCount,
        dt,
        matchPhase: this.phase,
        servingTeam: curScore.servingTeam,
        activeServerId: activeServer?.id,
      });
      for (const [id, cmd] of Object.entries(duoCmds)) {
        this.aiCommandCache.set(id, cmd);
      }
    }
  }

  private updatePlayers(dt: number, allowActions: boolean): void {
    this.computeAllAiCommands(allowActions, dt);
    const curBallPos = this.ballBody.translation();
    const curBallVel = this.ballBody.linvel();

    for (const p of this.players) {
      const controller = this.controllers.get(p.id) ?? new PlayerController(p.stats);
      p.animTimer += dt;
      p.spikeCooldown = Math.max(0, p.spikeCooldown - dt);
      p.hitCooldown = Math.max(0, p.hitCooldown - dt);
      const prevBlockCd = this.aiBlockCooldownByPlayer.get(p.id) ?? 0;
      const nextBlockCd = Math.max(0, prevBlockCd - dt);
      if (prevBlockCd > 0) {
        this.aiBlockCooldownByPlayer.set(p.id, nextBlockCd);
      }
      const prevPendingSelfSet = this.pendingSelfSetByPlayer.get(p.id) ?? 0;
      if (prevPendingSelfSet > 0) {
        const nextPending = Math.max(0, prevPendingSelfSet - dt);
        if (nextPending > 0) {
          this.pendingSelfSetByPlayer.set(p.id, nextPending);
        } else {
          this.pendingSelfSetByPlayer.delete(p.id);
        }
      }
      controller.updateTimers(dt);
      p.superAttackTimer = controller.getSuperAttackRemaining();
      p.ultimateActiveTimer = p.superAttackTimer;

      const ballOnMySide = p.team === 'left' ? curBallPos.x <= 0.08 : curBallPos.x >= -0.08;
      const ballOnOpponentSide = p.team === 'left' ? curBallPos.x > 0.08 : curBallPos.x < -0.08;
      const ballComingToMySide = p.team === 'left' ? curBallVel.x < -0.2 : curBallVel.x > 0.2;
      if (ballOnMySide) {
        this.ballVisitedPlayerSide.set(p.id, true);
      }
      if (
        ballOnOpponentSide &&
        (p.hasSelfSet || (p.playerTouches ?? 0) > 0) &&
        (this.ballVisitedPlayerSide.get(p.id) || !ballComingToMySide)
      ) {
        this.reset1v1PlayerPossession(p.id);
      }

      let input: PlayerInputState;
      let canJumpOrAttack = !p.isAi || p.role !== 'setter';

      if (p.isAi) {
        const aiCmd = this.aiCommandCache.get(p.id) ?? decideAiAction({
          aiPos: { x: p.x, y: p.y, z: p.z },
          aiTeam: p.team,
          ballPos: curBallPos,
          ballVel: curBallVel,
          touchesOnSide: 0,
          difficulty: p.aiDifficulty,
          canHit: p.hitCooldown <= 0 && allowActions,
          role: p.role,
          tick: this.tickCount,
        });
        const ext = aiCmd as ExtendedAiCommand;
        const isActingSetter =
          ext.intendedRole === 'setter' ||
          ext.intendedRole === 'support' ||
          ext.intendedRole === 'coverage';
        canJumpOrAttack = !isActingSetter || (p.slotIndex === 1 && ext.intendedRole === 'attacker');
        const aiBallOnOpponentSide =
          p.team === 'left' ? curBallPos.x > 0.15 : curBallPos.x < -0.15;
        const suppressBlockJump = nextBlockCd > 0 && aiBallOnOpponentSide;
        input = {
          moveX: aiCmd.moveX,
          moveZ: 0,
          sprint:
            ext.intendedRole === 'coverage' ||
            ext.intendedRole === 'blocker' ||
            (!isActingSetter && p.aiDifficulty === 'hard'),
          jump: canJumpOrAttack && !suppressBlockJump ? aiCmd.jump : false,
          jumpHeld: canJumpOrAttack && !suppressBlockJump ? aiCmd.jump : false,
          spike: canJumpOrAttack ? aiCmd.spike : false,
          dive: aiCmd.dive,
          receive: false,
          ultimate: canJumpOrAttack && p.ultimateCharge >= PHYSICS.ULTIMATE_MAX && aiCmd.spike,
          aimZ: 0,
        };
      } else {
        const rawInput = this.inputs.get(p.id) ?? {
          moveX: 0,
          moveZ: 0,
          sprint: false,
          jump: false,
          jumpHeld: false,
          spike: false,
          dive: false,
          receive: false,
          set: false,
          ultimate: false,
        };
        input = { ...rawInput };
      }

      const isGrounded = p.y <= 0.03;
      let assist1v1JumpTowardBall = false;
      let suppress1v1GroundSuperBlock = false;

      if (allowActions && this.phase === 'rally' && !p.isAi && !controller.fsm.isStunned()) {
        if (this.rulesManager.is1v1Mode) {
          // Inteligência Contextual de Botão Único (Tecla F no PC / Botão Principal no Mobile) exclusiva do Modo 1x1:
          const unifiedButtonPressed = Boolean(input.spike);
          if (unifiedButtonPressed) {
            const ballOnOppSideNearNet =
              p.team === 'left'
                ? curBallPos.x > 0.08 && curBallPos.x <= 3.6
                : curBallPos.x < -0.08 && curBallPos.x >= -3.6;
            const playerNearNet = Math.abs(p.x) <= 3.6;
            const oppNearNetOrAttacking = this.players.some(
              (opp) =>
                opp.team !== p.team &&
                (opp.y > 0.05 ||
                  opp.vy > 0.4 ||
                  Math.abs(opp.x) <= 3.6 ||
                  opp.actionState === 'airborne' ||
                  opp.actionState === 'spike' ||
                  opp.actionState === 'set'),
            );
            const isNetBlockException =
              isGrounded &&
              ballOnOppSideNearNet &&
              playerNearNet &&
              this.serveInFlightTeam === null &&
              (curBallPos.y >= 1.35 || oppNearNetOrAttacking || !ballComingToMySide);

            if (!isGrounded) {
              // 3º Comando no Ar (isGrounded === false):
              // Executa Ataque / Cortada (com animação de envergadura no ar) e dispara Super Attack automaticamente se cheio ou ativo
              input.spike = true;
              input.jump = false;
              input.set = false;
              this.pendingSelfSetByPlayer.delete(p.id);
              p.hitCooldown = 0;
              p.spikeCooldown = 0;
              if (p.ultimateCharge >= PHYSICS.ULTIMATE_MAX && !controller.isSuperAttackActive()) {
                p.ultimateCharge = 0;
                controller.activateSuperAttack(PHYSICS.SUPER_ATTACK_DURATION);
                p.superAttackTimer = controller.getSuperAttackRemaining();
                p.ultimateActiveTimer = p.superAttackTimer;
                this.pendingEvents.push({
                  type: 'ultimate',
                  x: p.x,
                  y: p.y + 1.0,
                  z: p.z,
                  playerId: p.id,
                  team: p.team,
                  ultimateType: CHARACTERS[p.characterId]?.ultimateId ?? 'meteor_spike',
                  callout: 'SUPER ATTACK! (5s)',
                });
              }
            } else if (isNetBlockException) {
              // Exceção de Bloqueio na Rede: bola do lado adversário próxima à rede -> permite o Pulo de Bloqueio
              input.jump = true;
              input.jumpHeld = Boolean(input.spikeHeld ?? true);
              input.spike = false;
              input.set = false;
            } else if (p.hasSelfSet || (p.playerTouches ?? 0) >= 1) {
              // 2º Comando no Chão (isGrounded === true && hasSelfSet === true):
              // A bola já está alta e preparada -> executa o Pulo em direção à bola para o Ataque
              input.jump = true;
              input.jumpHeld = Boolean(input.spikeHeld ?? true);
              input.spike = false;
              input.set = false;
              input.hybridCommand = undefined;
              suppress1v1GroundSuperBlock = true;
              assist1v1JumpTowardBall = true;
              this.pendingSelfSetByPlayer.delete(p.id);
              p.hitCooldown = 0;
              p.spikeCooldown = 0;
            } else if (ballOnMySide || ballComingToMySide) {
              // 1º Toque no Chão (isGrounded === true && playerTouches === 0 && bola vindo para o seu lado):
              // O jogador NÃO pula; executa automaticamente um Toque / Levantamento para si mesmo (Self-Set)
              input.jump = false;
              input.jumpHeld = false;
              input.spike = false;
              input.spikeHeld = false;
              input.receive = false;
              input.set = true;
              input.hybridCommand = undefined;
              suppress1v1GroundSuperBlock = true;
              p.vy = 0;
              p.hasSelfSet = true;
              p.playerTouches = 1;
              this.ballVisitedPlayerSide.set(p.id, true);
              controller.fsm.startSet(0.36);
              p.anim = 'set';
              p.actionState = 'set';
              p.animTimer = 0;
              p.facingX = p.team === 'left' ? 1 : -1;

              const horizDistToBall = Math.abs(curBallPos.x - p.x);
              if (
                (ballOnMySide && horizDistToBall <= 3.2 && curBallPos.y <= p.y + 3.1) ||
                (horizDistToBall <= 2.4 && curBallPos.y <= p.y + 2.8)
              ) {
                this.perform1v1SelfSetBallLaunch(p, controller);
              } else {
                this.pendingSelfSetByPlayer.set(p.id, 0.9);
              }
            }
          } else if (!isGrounded && p.y > 0.08 && input.jump && !input.set) {
            input.spike = true;
          }
        } else {
          // Controles Unificados Modo 2x2 (Pular + Atacar no mesmo botão):
          // - 1º clique no chão (quando a bola não está colada para golpe imediato no solo): faz o jogador Pular
          // - 2º clique já no ar (p.y > 0.08): executa o Ataque / Cortada
          const hasDirectionalCombo =
            input.directionalCombo === 'down_short' ||
            input.directionalCombo === 'back_deep' ||
            Boolean(input.downHeld) ||
            (input.verticalInput ?? 0) < -0.35;
          if (!isGrounded && p.y > 0.08 && input.jump && !input.set) {
            input.spike = true;
          } else if (
            isGrounded &&
            p.diveTimer <= 0 &&
            input.spike &&
            !input.jump &&
            !input.set &&
            !hasDirectionalCombo
          ) {
            const distToBallNow = Math.hypot(curBallPos.x - p.x, curBallPos.y - (p.y + 0.95));
            if (distToBallNow > PHYSICS.PLAYER_HIT_REACH) {
              input.jump = true;
              input.jumpHeld = Boolean(input.spikeHeld ?? true);
              input.spike = false;
            }
          }
        }
        this.inputs.set(p.id, input);
      }

      // Movimentação restrita ao eixo central (Z = 0) com inércia (areia vs quadra) ou Peixinho
      if (p.diveTimer > 0) {
        p.diveTimer = Math.max(0, p.diveTimer - dt);
        p.vx = p.diveDirX * PHYSICS.PLAYER_DIVE_SPEED;
        p.vz = 0;
      } else if (!controller.fsm.isStunned()) {
        const vel = controller.computeInertialVelocity(
          p.vx,
          0,
          { moveX: input.moveX, moveZ: 0, sprint: input.sprint },
          this.isSandSurface,
          dt,
        );
        p.vx = vel.vx;
        p.vz = 0;

        const aiCmdMeta = p.isAi ? this.aiCommandCache.get(p.id) : undefined;
        if (aiCmdMeta?.faceOpponents || aiCmdMeta?.intendedRole === 'coverage') {
          p.facingX = p.team === 'left' ? 1 : -1;
          p.facingZ = 0;
        } else if (Math.abs(input.moveX) > 0.15) {
          p.facingX = Math.sign(input.moveX);
          p.facingZ = 0;
        }

        // Janela de Recepção (Manchete) ou Toque / Levantamento (Set)
        if (allowActions && isGrounded) {
          if (input.set) {
            controller.fsm.startSet(0.36);
          } else if (input.receive) {
            controller.fsm.startReceiveWindow(0.36);
          }
        }

        // Mergulho Peixinho na linha central
        if (allowActions && input.dive && isGrounded && Math.abs(input.moveX) > 0.2) {
          if (controller.fsm.startSlideDive(PHYSICS.PLAYER_DIVE_DURATION)) {
            p.diveTimer = PHYSICS.PLAYER_DIVE_DURATION;
            p.diveDirX = Math.sign(input.moveX);
            p.diveDirZ = 0;
            p.vy = 3.6;
            p.animTimer = 0;
            this.pendingEvents.push({ type: 'dive', x: p.x, y: p.y + 0.3, z: 0, playerId: p.id });
          }
        }
      } else {
        const vel = controller.computeInertialVelocity(
          p.vx,
          0,
          { moveX: 0, moveZ: 0, sprint: false },
          this.isSandSurface,
          dt,
        );
        p.vx = vel.vx;
        p.vz = 0;
      }

      // Salto Escalonado (com multiplicador do modo Super Attack quando ativo)
      if (allowActions && !controller.fsm.isStunned() && canJumpOrAttack) {
        if (input.jump && isGrounded && p.diveTimer <= 0) {
          if (controller.fsm.startJump()) {
            p.vy = controller.getBaseJumpVelocity();
            if (assist1v1JumpTowardBall && ballOnMySide) {
              const dxToBall = curBallPos.x - p.x;
              if (Math.abs(dxToBall) > 0.15 && Math.abs(input.moveX) < 0.15) {
                const jumpHorizSpeed = Math.min(
                  controller.getMaxHorizontalSpeed(false) * 0.85,
                  Math.max(2.4, Math.abs(dxToBall) * 2.4),
                );
                p.vx = Math.sign(dxToBall) * jumpHorizSpeed;
                p.facingX = p.team === 'left' ? 1 : -1;
              }
            }
            this.pendingEvents.push({ type: 'jump', x: p.x, y: 0.1, z: p.z, playerId: p.id });
          }
        } else if (input.jumpHeld && controller.fsm.canApplyJumpBoost() && p.vy > 0) {
          p.vy += PHYSICS.PLAYER_JUMP_HOLD_BOOST * dt;
        } else if (!input.jumpHeld) {
          controller.fsm.releaseJumpHold();
        }
      }

      // Ativa Super Attack (buff temporário de exatos 5.0 segundos)
      if (
        allowActions &&
        !controller.fsm.isStunned() &&
        canJumpOrAttack &&
        input.ultimate &&
        p.ultimateCharge >= PHYSICS.ULTIMATE_MAX &&
        !controller.isSuperAttackActive()
      ) {
        p.ultimateCharge = 0;
        controller.activateSuperAttack(PHYSICS.SUPER_ATTACK_DURATION);
        p.superAttackTimer = controller.getSuperAttackRemaining();
        p.ultimateActiveTimer = p.superAttackTimer;
        this.pendingEvents.push({
          type: 'ultimate',
          x: p.x,
          y: p.y + 1.0,
          z: p.z,
          playerId: p.id,
          team: p.team,
          ultimateType: CHARACTERS[p.characterId].ultimateId,
          callout: 'SUPER ATTACK! (5s)',
        });
      }

      // Regra B — Contexto de Partida (Direcional + Botão 'F', sem Double/Triple Tap):
      // Durante o rali (this.phase === 'rally'), ignora comandos de Hold de Saque e avalia o combo simultâneo:
      // - 'F' sozinho (Neutro): Executa Bloqueio / Ataque Padrão
      // - 'F' + Seta para BAIXO: Executa o Super Ataque / Bloqueio Curto (deixadinha / bloqueio na rede)
      // - 'F' + Seta para TRÁS (Lado oposto): Executa o Super Ataque / Bloqueio Fundo de Quadra
      if (allowActions && this.phase === 'rally' && !p.isAi && !controller.fsm.isStunned() && !suppress1v1GroundSuperBlock) {
        if (input.serveReleaseChargeTime !== undefined) {
          input.serveReleaseChargeTime = undefined;
        }
        const hasDirectionalActionTrigger =
          (input.hybridCommand && input.hybridCommand !== 'none') ||
          Boolean(
            input.spike &&
              (input.directionalCombo === 'down_short' ||
                input.directionalCombo === 'back_deep' ||
                input.downHeld ||
                input.moveZ > 0.35 ||
                (input.verticalInput ?? 0) < -0.35),
          );
        if (hasDirectionalActionTrigger) {
          const nearNet = Math.abs(p.x) <= 3.6;
          const cmdToEvaluate =
            input.hybridCommand && input.hybridCommand !== 'none'
              ? input.hybridCommand
              : input.directionalCombo === 'down_short' ||
                  input.downHeld ||
                  input.moveZ > 0.35 ||
                  (input.verticalInput ?? 0) < -0.35
                ? 'action_down_short'
                : input.directionalCombo === 'back_deep'
                  ? 'action_back_deep'
                  : 'action_neutral';
          const resolved = controller.resolveContextualHybridAction(cmdToEvaluate, {
            isServing: false,
            inGame: true,
            nearNet,
            teamSide: p.team,
            horizontalAxis: input.moveX,
            verticalAxis:
              input.verticalInput ?? (input.downHeld || input.moveZ > 0.35 ? -1 : input.moveZ < -0.35 ? 1 : 0),
            directionalCombo: input.directionalCombo,
          });
          input.hybridCommand = undefined;

          if (resolved.type === 'block_super_low' || resolved.type === 'block_super_deep') {
            if (isGrounded && p.diveTimer <= 0) {
              p.vy = controller.getBaseJumpVelocity() * 1.08;
            }
            controller.fsm.startBlock();
            p.actionState = 'block';
            p.anim = 'block';
            p.animTimer = 0;
            this.pendingEvents.push({
              type: 'block',
              x: p.x,
              y: p.y + 1.1,
              z: 0,
              team: p.team,
              playerId: p.id,
              power: resolved.type === 'block_super_deep' ? 1.25 : 1.15,
              isForcedAttack: true,
              callout:
                resolved.type === 'block_super_low'
                  ? 'BLOQUEIO SUPER CURTO!'
                  : 'BLOQUEIO SUPER FUNDO!',
            });
          }
        }
      }

      // Animação manual de corte / shark attack
      if (allowActions && !controller.fsm.isStunned() && canJumpOrAttack && input.spike && p.spikeCooldown <= 0) {
        p.spikeCooldown = 0.28;
        const swingStyle = input.footMode ? 'shark_attack' : 'spike';
        controller.fsm.startAttack(swingStyle);
        p.animTimer = 0;
      }

      // Gravidade vertical do jogador
      p.vy += PHYSICS.GRAVITY * dt;
      const proposed = {
        x: p.x + p.vx * dt,
        y: Math.max(0, p.y + p.vy * dt),
        z: 0,
      };
      if (proposed.y <= 0) {
        proposed.y = 0;
        if (p.vy < 0) p.vy = 0;
      }

      const clampedStep = clampServerMovementStep({ x: p.x, y: p.y, z: 0 }, proposed);
      // Barreira física estrita na rede (Math.clamp no eixo X + collider central):
      // Nem jogador humano nem IA podem atravessar para o lado adversário da quadra.
      const netBarrier = COURT.NET_BARRIER_HALF_X;
      const minX = p.team === 'left' ? -(COURT.HALF_WIDTH + 1.8) : netBarrier;
      const maxX = p.team === 'left' ? -netBarrier : COURT.HALF_WIDTH + 1.8;

      p.x = Math.max(minX, Math.min(maxX, clampedStep.x));
      if ((p.team === 'left' && p.x >= -netBarrier && p.vx > 0) || (p.team === 'right' && p.x <= netBarrier && p.vx < 0)) {
        p.vx = 0;
      }
      p.y = clampedStep.y;
      p.z = 0;

      controller.fsm.update(dt, p.y <= 0.03, Math.abs(p.vx));
      p.stunTimer = controller.fsm.getStunTimer();
      p.actionState = controller.fsm.getState();
      p.anim = controller.fsm.toAnimState();

      const pBody = this.playerBodies.get(p.id);
      if (pBody) {
        pBody.setTranslation({ x: p.x, y: p.y + 0.66, z: 0 }, true);
        pBody.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      }
    }
  }

  private handlePlayerBallHits(): void {
    const bPos = this.ballBody.translation();
    const bVel = this.ballBody.linvel();
    const preTouchSnap = this.rulesManager.getTouchesSnapshot();

    // Ordena priorizando quem deve executar o toque atual sem cometer Dois Toques
    const orderedPlayers = [...this.players].sort((a, b) => {
      const aDouble =
        preTouchSnap.lastTouchTeam === a.team &&
        preTouchSnap.lastTouchPlayerId === a.id &&
        !preTouchSnap.lastTouchWasBlock;
      const bDouble =
        preTouchSnap.lastTouchTeam === b.team &&
        preTouchSnap.lastTouchPlayerId === b.id &&
        !preTouchSnap.lastTouchWasBlock;
      if (aDouble !== bDouble) return aDouble ? 1 : -1;
      if (a.isAi !== b.isAi) return a.isAi ? 1 : -1;
      if (a.role !== b.role) return a.role === 'attacker' ? -1 : 1;
      return 0;
    });

    // Limpa flag de saque em voo assim que a bola cruza para o campo adversário ou inverte sentido
    if (
      this.serveInFlightTeam !== null &&
      ((this.serveInFlightTeam === 'left' && (bPos.x > 0.15 || bVel.x < -0.5)) ||
        (this.serveInFlightTeam === 'right' && (bPos.x < -0.15 || bVel.x > 0.5)))
    ) {
      this.serveInFlightTeam = null;
    }

    for (const p of orderedPlayers) {
      const controller = this.controllers.get(p.id) ?? new PlayerController(p.stats);
      if (p.hitCooldown > 0 || controller.fsm.isStunned()) continue;

      // Impede o sacador ou seu parceiro de interceptarem o próprio saque enquanto cruza a própria quadra
      if (this.serveInFlightTeam === p.team) continue;

      const cachedAi = this.aiCommandCache.get(p.id);
      if (
        cachedAi?.intendedRole === 'blocker' &&
        ((p.team === 'left' && bPos.x > 0.12) || (p.team === 'right' && bPos.x < -0.12))
      ) {
        continue;
      }
      const isSetterBehavior =
        p.isAi &&
        (cachedAi ? cachedAi.intendedRole === 'setter' || cachedAi.intendedRole === 'support' : p.role === 'setter');

      const projectedTouches =
        preTouchSnap.lastTouchTeam === p.team
          ? (p.team === 'left' ? preTouchSnap.left : preTouchSnap.right) + 1
          : 1;

      // Em times com mais de 1 jogador, a IA evita tocar 2x consecutivas, roubar ataque ou cometer 4º toque
      if (p.isAi) {
        const teamCount = this.players.filter((pl) => pl.team === p.team).length;
        const wouldDouble =
          preTouchSnap.lastTouchTeam === p.team &&
          preTouchSnap.lastTouchPlayerId === p.id &&
          !preTouchSnap.lastTouchWasBlock;
        if (teamCount > 1 && wouldDouble) continue;
        if (isSetterBehavior && projectedTouches >= 3) continue;
        if (projectedTouches > PHYSICS.MAX_TOUCHES_PER_SIDE) continue;
      }

      const input = this.inputs.get(p.id);
      const wantsManualSet = !p.isAi && Boolean(input?.set);
      const wantsActiveReceive = !p.isAi && Boolean(input?.receive || input?.dive);
      const horizDist = Math.abs(bPos.x - p.x);

      // 1x1 Inteligência Contextual (1º Toque no Chão — Self-Set pendente sem conflito com manchete passiva)
      if (
        this.rulesManager.is1v1Mode &&
        !p.isAi &&
        p.y <= 0.08 &&
        (this.pendingSelfSetByPlayer.get(p.id) ?? 0) > 0 &&
        horizDist <= 2.4 &&
        bPos.y <= p.y + 2.8
      ) {
        this.perform1v1SelfSetBallLaunch(p, controller);
        return;
      }

      // Colisão restrita estritamente do pescoço para baixo (pescoço em p.y + 1.32m; cabeça gráfica em 1.42m..1.85m).
      // A bola nunca deve colidir passivamente na cabeça gráfica dos personagens.
      const neckCeilingY = p.y + 1.32;
      const torsoCenterY = p.y + 0.68;
      const torsoDist = Math.hypot(bPos.x - p.x, bPos.y - torsoCenterY);
      const swingReachDist = Math.hypot(bPos.x - p.x, bPos.y - (p.y + 0.95));
      const receiveRadius = controller.getReceiveHitboxRadius();

      const armedSuperBlock = controller.getArmedSuperBlockMode();
      const hasSuperBlock = armedSuperBlock !== null;
      const is1v1AirbornePlayer = this.rulesManager.is1v1Mode && !p.isAi && p.y > 0.03;

      const inGraphicalHeadZone =
        horizDist <= 0.44 && bPos.y >= neckCeilingY + 0.04 && bPos.y <= p.y + 1.98;
      const isActiveArmAction = Boolean(
        hasSuperBlock ||
          wantsManualSet ||
          (!isSetterBehavior && (input?.spike || p.spikeCooldown > 0.1)) ||
          (p.isAi && !isSetterBehavior && (p.y > 0.35 || projectedTouches >= 3)) ||
          (isSetterBehavior && (bPos.y <= neckCeilingY + 0.9 || horizDist > 0.45)),
      );

      if (inGraphicalHeadZone && !isActiveArmAction) {
        continue;
      }

      const effectiveSwingReach = hasSuperBlock
        ? PHYSICS.PLAYER_HIT_REACH + 0.35
        : is1v1AirbornePlayer
          ? PHYSICS.PLAYER_HIT_REACH + 0.45
          : PHYSICS.PLAYER_HIT_REACH;

      const isSwinging =
        !isSetterBehavior &&
        !wantsManualSet &&
        (hasSuperBlock ||
          input?.spike ||
          p.spikeCooldown > 0.1 ||
          (p.isAi && (!inGraphicalHeadZone || p.y > 0.35 || projectedTouches >= 3))) &&
        swingReachDist <= effectiveSwingReach;
      const bodyTouch =
        (bPos.y <= neckCeilingY && torsoDist <= receiveRadius) ||
        (wantsActiveReceive && bPos.y <= neckCeilingY + 0.14 && torsoDist <= receiveRadius + 0.28) ||
        (wantsManualSet && bPos.y <= neckCeilingY + 0.58 && torsoDist <= receiveRadius + 0.3) ||
        (isSetterBehavior && torsoDist <= receiveRadius);

      if (!isSwinging && !bodyTouch) continue;

      // Verifica se trata-se de Bloqueio na rede (não conta como toque da equipe e isenta de Dois Toques)
      const nearNet =
        Math.abs(p.x) < (hasSuperBlock ? 2.1 : 1.75) &&
        (p.y > 0.45 || hasSuperBlock) &&
        bPos.y > COURT.NET_HEIGHT - (hasSuperBlock ? 0.55 : 0.35);
      const ballComingTowardTeam = p.team === 'left' ? bVel.x < -1.0 : bVel.x > 1.0;
      const isBlock =
        !isSetterBehavior &&
        !wantsManualSet &&
        nearNet &&
        ballComingTowardTeam &&
        (preTouchSnap.lastTouchTeam !== p.team || hasSuperBlock) &&
        !input?.receive &&
        !input?.dive;

      const touchResult = this.rulesManager.registerTouch(p.id, p.team, {
        isBlock,
        ignoreFaults: this.isTrainingMinigame(),
      });

      if (!touchResult.allowed && touchResult.scoringTeam) {
        this.pendingEvents.push({
          type: 'fault',
          x: bPos.x,
          y: bPos.y,
          z: 0,
          team: p.team,
          playerId: p.id,
          callout: touchResult.callout,
        });
        this.registerPoint(touchResult.scoringTeam, bPos.x, 0, touchResult.callout);
        return;
      }

      const currentTouches = touchResult.teamTouches;
      p.hitCooldown = PHYSICS.HIT_COOLDOWN;
      this.rallyWithoutTouchTimer = 0;
      this.ballStuckTimer = 0;

      if (!isBlock) {
        for (const other of this.players) {
          if (other.team !== p.team) {
            this.reset1v1PlayerPossession(other.id);
          }
        }
      }

      // Precisão de timing do jogador (IA aliada e inimiga possuem mesma precisão de recepção)
      const pressedTick = this.receivePressedAtTick.get(p.id) ?? -9999;
      const timingErrorMs = p.isAi ? 20 : Math.abs(this.tickCount - pressedTick) * (PHYSICS.FIXED_DT * 1000);
      const receiveEval = controller.evaluateReceive(timingErrorMs, p.aiDifficulty, horizDist);

      if (isBlock) {
        this.consecutiveBlocks += 1;
        if (p.isAi) {
          this.aiBlockCooldownByPlayer.set(p.id, 0.88);
        }

        if (!p.isAi && controller.checkGuardBreak(this.lastIncomingPowerRatio, receiveEval.quality, p.aiDifficulty)) {
          const knockDir = p.team === 'left' ? -1 : 1;
          // Sem knockdown/derrubado: mantém o atleta firme, ereto e sem arremesso ao chão
          p.vx = 0;
          if (p.y <= 0.05) p.vy = 0;
          p.stunTimer = PHYSICS.GUARD_BREAK_STUN_SEC;
          p.anim = 'failed_bump';
          p.actionState = 'stunned';
          this.ballBody.setLinvel({ x: knockDir * 5.0, y: 5.5, z: 0 }, true);
          this.pendingEvents.push({
            type: 'guard_break',
            x: p.x,
            y: p.y + 1.0,
            z: 0,
            team: p.team,
            playerId: p.id,
            callout: 'FALHA NA DEFESA!',
            power: 1.2,
          });
          return;
        }

        const dir = p.team === 'left' ? 1 : -1;
        const armedSuperBlock = controller.consumeArmedSuperBlockMode();
        let blockCallout = 'BLOQUEIO!';
        if (armedSuperBlock === 'low') {
          // Bloqueio com Super Ataque Baixo (crava curto/baixo na quadra adversária)
          this.ballBody.setLinvel({ x: dir * 15.8, y: -7.8, z: 0 }, true);
          this.ballBody.setAngvel({ x: 0, y: 0, z: -dir * 22 }, true);
          this.lastIncomingPowerRatio = 1.18;
          blockCallout = 'BLOQUEIO SUPER BAIXO!';
        } else if (armedSuperBlock === 'deep') {
          // Bloqueio com Super Ataque no Fundo da Quadra
          this.ballBody.setLinvel({ x: dir * 21.2, y: 4.1, z: 0 }, true);
          this.ballBody.setAngvel({ x: 0, y: 0, z: -dir * 26 }, true);
          this.lastIncomingPowerRatio = 1.25;
          blockCallout = 'BLOQUEIO SUPER FUNDO!';
        } else {
          // Sistema de Bloqueio Inteligente (Fim do Looping Infinito da IA na rede):
          // A partir do 1º ou 2º bloqueio seguido, aplica física realista:
          // 1) Quebra de Bloqueio (ataque potente fura o bloqueio para o fundo da defesa)
          // 2) Amortecimento Alto (bola sobe alta para o fundo da quadra permitindo defesa e contra-ataque)
          // 3) Explosão / Desvio Angular (block-out / desvio em arco tirando a bola da zona da rede)
          const roll = this.aiRng();
          const isBlockBreak =
            this.consecutiveBlocks >= 3 ||
            (this.consecutiveBlocks >= 1 && this.lastIncomingPowerRatio >= 0.92 && roll < 0.42);
          const isSoftCushion =
            !isBlockBreak && (this.consecutiveBlocks >= 2 || roll < 0.56);

          if (isBlockBreak) {
            const breakVx = -dir * (4.8 + this.aiRng() * 2.0);
            const breakVy = 6.2 + this.aiRng() * 1.4;
            this.ballBody.setLinvel({ x: breakVx, y: breakVy, z: 0 }, true);
            this.ballBody.setAngvel({ x: 0, y: 0, z: dir * 12 }, true);
            this.lastIncomingPowerRatio = 0.62;
            blockCallout = 'QUEBRA DE BLOQUEIO!';
          } else if (isSoftCushion) {
            const cushionVx = dir * (4.3 + this.aiRng() * 1.9);
            const cushionVy = 9.0 + this.aiRng() * 1.6;
            this.ballBody.setLinvel({ x: cushionVx, y: cushionVy, z: 0 }, true);
            this.ballBody.setAngvel({ x: 0, y: 0, z: -dir * 7 }, true);
            this.lastIncomingPowerRatio = 0.52;
            blockCallout = 'BLOQUEIO AMORTECIDO!';
          } else {
            const deflectVx = dir * (7.6 + this.aiRng() * 2.4);
            const deflectVy = 5.6 + this.aiRng() * 1.4;
            this.ballBody.setLinvel({ x: deflectVx, y: deflectVy, z: 0 }, true);
            this.ballBody.setAngvel({ x: 0, y: 0, z: -dir * 14 }, true);
            this.lastIncomingPowerRatio = 0.72;
          }
        }
        p.blocksCount += 1;
        p.ultimateCharge = Math.min(PHYSICS.ULTIMATE_MAX, p.ultimateCharge + PHYSICS.ULTIMATE_GAIN_BLOCK);
        controller.fsm.startBlock();
        p.anim = 'block';
        p.actionState = 'block';
        p.animTimer = 0;
        this.activateHitstop(armedSuperBlock ? 0.1 : 0.05);
        this.pendingEvents.push({
          type: 'block',
          x: bPos.x,
          y: bPos.y,
          z: 0,
          team: p.team,
          playerId: p.id,
          power: armedSuperBlock === 'deep' ? 1.25 : armedSuperBlock === 'low' ? 1.18 : 0.85,
          isForcedAttack: Boolean(armedSuperBlock),
          callout: blockCallout,
        });
        return;
      }

      this.consecutiveBlocks = 0;
      const teamSize = this.players.filter((pl) => pl.team === p.team).length;

      // Ciclo Obrigatório de 3 Toques para a IA no Modo 2v2:
      // No modo 2v2 (teamSize >= 2), os bots nunca devolvem de 1ª ou 2ª; só atacam no 3º toque!
      const shouldSpike =
        isSetterBehavior || wantsManualSet
          ? false
          : p.isAi
            ? teamSize >= 2
              ? currentTouches >= 3
              : currentTouches >= 3 || (currentTouches >= 2 && (Boolean(cachedAi?.spike) || p.y > 0.35))
            : Boolean(input?.spike) || p.spikeCooldown > 0.1 || (p.y > 0.35 && isSwinging);

      if (shouldSpike) {
        p.playerTouches = (p.playerTouches ?? 0) + 1;
        const atkEval = controller.evaluateAttack({
          playerY: p.y,
          playerVy: p.vy,
          playerZ: 0,
          ballY: bPos.y,
          moveX: input?.moveX ?? 0,
          moveZ: input?.moveZ ?? 0,
          team: p.team,
          preferFoot: Boolean(input?.footMode),
          mouseAimRatio: p.isAi ? undefined : input?.mouseAimRatio,
          mouseWorldPos: p.isAi ? undefined : input?.mouseWorldPos,
          directionalCombo: p.isAi
            ? undefined
            : input?.directionalCombo && input.directionalCombo !== 'none'
              ? input.directionalCombo
              : input?.downHeld || (input?.verticalInput ?? 0) < -0.35 || (input?.moveZ ?? 0) > 0.35
                ? 'down_short'
                : (p.team === 'left' ? (input?.moveX ?? 0) : -(input?.moveX ?? 0)) < -0.35
                  ? 'back_deep'
                  : 'neutral',
        });

        // No modo 1x1 no ar (3º comando), garante a animação de Cortada (envergadura no ar)
        // e aciona automaticamente o Super Ataque caso a barra esteja cheia!
        if (this.rulesManager.is1v1Mode && !p.isAi && p.y > 0.03) {
          if (!input?.footMode) {
            atkEval.style = 'spike';
          }
          if (p.ultimateCharge >= PHYSICS.ULTIMATE_MAX && !controller.isSuperAttackActive()) {
            p.ultimateCharge = 0;
            controller.activateSuperAttack(PHYSICS.SUPER_ATTACK_DURATION);
            p.superAttackTimer = controller.getSuperAttackRemaining();
            p.ultimateActiveTimer = p.superAttackTimer;
            this.activeUltimate = CHARACTERS[p.characterId]?.ultimateId ?? 'meteor_spike';
          }
        }

        const isSuperAttack = controller.isSuperAttackActive();
        const aimDir = cachedAi?.overpowerOut
          ? 'overpower_out'
          : cachedAi
            ? cachedAi.aim
            : atkEval.aim;
        const aiPowerMult = p.isAi ? DIFFICULTY_TUNING[p.aiDifficulty].aiPowerMultiplier : 1.0;

        const imp = computeSpikeImpulse(
          { x: p.x, y: p.y, z: 0 },
          bPos,
          p.team,
          0,
          p.y > 0.25,
          isSuperAttack,
          {
            attackStat: p.stats.attack,
            aim: aimDir,
            isPerfectApex: atkEval.isPerfectApex,
            targetDepthX: aimDir === 'overpower_out' ? undefined : atkEval.targetDepthX,
            powerMultiplier: aiPowerMult * (isSuperAttack ? PHYSICS.SUPER_ATTACK_ATK_MULT : 1.0),
            mouseTargetWorldPos: p.isAi ? undefined : input?.mouseWorldPos,
          },
        );
        this.ballBody.setLinvel({ x: imp.vx, y: imp.vy, z: 0 }, true);
        this.ballBody.setAngvel({ x: 0, y: 0, z: imp.spinZ }, true);

        const effectivePower = Math.min(1.45, (isSuperAttack ? 1.28 : atkEval.powerRatio) * aiPowerMult);
        this.lastIncomingPowerRatio = effectivePower;
        p.spikesCount += 1;
        if (atkEval.isPerfectApex) p.perfectCount += 1;
        if (!isSuperAttack) {
          p.ultimateCharge = Math.min(PHYSICS.ULTIMATE_MAX, p.ultimateCharge + PHYSICS.ULTIMATE_GAIN_SPIKE);
        }

        controller.fsm.startAttack(atkEval.style);
        p.anim = atkEval.style;
        p.actionState = atkEval.style;
        p.animTimer = 0;

        if (atkEval.isPerfectApex && !p.isAi) {
          this.activateHitstop(PHYSICS.HITSTOP_PERFECT_SPIKE);
        } else if (isSuperAttack || p.y > 0.25) {
          this.activateHitstop(0.06);
        }

        if (this.mode === 'training_spike' && !p.isAi) {
          this.trainingStats.attempts += 1;
          if (atkEval.isPerfectApex) {
            this.trainingStats.perfects += 1;
            this.trainingStats.streak += 1;
          } else {
            this.trainingStats.streak = 0;
          }
          this.launcherTimer = 0.75;
        }

        // Super Attack permanece ativo por toda a duração de 5.0 segundos (não expira após 1 golpe)
        this.activeUltimate = isSuperAttack ? CHARACTERS[p.characterId].ultimateId : null;

        const callout =
          aimDir === 'overpower_out'
            ? 'ISOLOU!'
            : aimDir === 'dink'
              ? 'LARGADINHA!'
              : isSuperAttack
                ? 'SUPER ATTACK!'
                : atkEval.style === 'shark_attack'
                  ? 'SHARK ATTACK!'
                  : atkEval.style === 'header'
                    ? 'CABECEIO!'
                    : atkEval.isPerfectApex
                      ? 'CORTE PERFEITO!'
                      : undefined;

        const isForcedAttack =
          isSuperAttack || (p.y > 0.25 && (atkEval.isPerfectApex || effectivePower >= 0.88));

        this.pendingEvents.push({
          type: 'spike',
          x: bPos.x,
          y: bPos.y,
          z: 0,
          team: p.team,
          playerId: p.id,
          ultimateType: this.activeUltimate ?? undefined,
          power: effectivePower,
          callout,
          isPerfect: atkEval.isPerfectApex || isSuperAttack,
          isForcedAttack,
        });
        return;
      }

      // Recepção Dinâmica (sem knockdown: falha em ataque forçado toca apenas "falha de manchete" com pés no chão)
      const incomingBallSpeed = Math.hypot(bVel.x, bVel.y);
      if (
        !p.isAi &&
        !wantsManualSet &&
        currentTouches === 1 &&
        incomingBallSpeed >= 8.0 &&
        controller.checkGuardBreak(this.lastIncomingPowerRatio, receiveEval.quality, p.aiDifficulty)
      ) {
        const knockDir = p.team === 'left' ? -1 : 1;
        p.vx = 0;
        p.vy = 0;
        p.y = 0;
        p.stunTimer = PHYSICS.GUARD_BREAK_STUN_SEC;
        p.anim = 'failed_bump';
        p.actionState = 'stunned';
        this.ballBody.setLinvel({ x: knockDir * 4.0, y: 6.2, z: 0 }, true);
        this.pendingEvents.push({
          type: 'guard_break',
          x: p.x,
          y: p.y + 0.9,
          z: 0,
          team: p.team,
          playerId: p.id,
          callout: 'FALHA DE MANCHETE!',
          power: 1.15,
        });
        return;
      }

      // Peixinho apenas quando o jogador aciona deliberadamente o mergulho (nunca tomba no chão "do nada")
      const deliberateDive = Boolean(input?.dive);
      if (deliberateDive && receiveEval.triggerDive && p.y <= 0.15) {
        const dirToBallX = Math.sign(bPos.x - p.x || 1);
        controller.fsm.startSlideDive(0.28);
        p.diveTimer = 0.28;
        p.diveDirX = dirToBallX;
        p.diveDirZ = 0;
        p.anim = 'dive';
        p.actionState = 'slide_dive';
      }

      const teammatePartner = this.players.find((pl) => pl.team === p.team && pl.id !== p.id);
      const teammateAttacker =
        this.players.find((pl) => pl.team === p.team && pl.id !== p.id && pl.role !== 'setter') ??
        teammatePartner;
      const teammateSetterPos = teammatePartner
        ? { x: teammatePartner.x, y: teammatePartner.y, z: teammatePartner.z }
        : { x: (p.team === 'left' ? -1 : 1) * 1.45, y: 0, z: 0 };

      // No Toque 2 (currentTouches === 2) ou quando o jogador aciona o Botão de Toque / Levantamento (Set - Tecla E / Botão Mobile):
      // - Calcula automaticamente uma trajetória parabólica alta que coloca a bola próxima à rede na zona ideal de ataque!
      const isSetterTouch =
        wantsManualSet ||
        currentTouches === 2 ||
        (isSetterBehavior && currentTouches > 1);
      const isQuickTempo = false; // Levantamento é sempre Bola Alta (High Set)
      const effectiveQuality = isSetterTouch
        ? 'perfect'
        : cachedAi?.humanError === 'receive_drift'
          ? 'imprecise'
          : receiveEval.quality;

      p.playerTouches = currentTouches;
      if (isSetterTouch) {
        p.hasSelfSet = true;
      }

      // Máquina de estados e animação específica: Toque / Levantamento (Set) vs Manchete (Bump)
      if (isSetterTouch) {
        controller.fsm.startSet(0.34);
        p.anim = 'set';
        p.actionState = 'set';
        p.animTimer = 0;
      } else if (!receiveEval.triggerDive || p.y > 0.15) {
        controller.fsm.startBump(0.28);
        p.anim = 'bump';
        p.actionState = 'bump';
        p.animTimer = 0;
      }

      const effectiveTouchesBeforeHit =
        wantsManualSet && currentTouches <= 2
          ? 1
          : p.isAi && teamSize === 1 && !isSetterTouch
            ? PHYSICS.MAX_TOUCHES_PER_SIDE - 1
            : currentTouches - 1;
      const rec = computeReceiveImpulse(
        { x: p.x, y: p.y, z: 0 },
        bPos,
        p.team,
        effectiveTouchesBeforeHit,
        {
          quality: effectiveQuality,
          isQuickTempo,
          isSetter: isSetterTouch,
          attackerPos: teammateAttacker ?? { x: p.x, y: p.y, z: 0 },
          setterPos: teammateSetterPos,
        },
      );
      this.ballBody.setLinvel({ x: rec.vx, y: rec.vy, z: 0 }, true);
      this.ballBody.setAngvel({ x: 0, y: 0, z: rec.spinZ }, true);
      if (!controller.isSuperAttackActive()) {
        p.ultimateCharge = Math.min(PHYSICS.ULTIMATE_MAX, p.ultimateCharge + PHYSICS.ULTIMATE_GAIN_RECEIVE);
      }
      if (effectiveQuality === 'perfect' && !p.isAi) p.perfectCount += 1;
      this.activeUltimate = null;
      this.lastIncomingPowerRatio = 0.5;

      if (this.mode === 'training_receive' && !p.isAi) {
        this.trainingStats.attempts += 1;
        if (effectiveQuality === 'perfect' || effectiveQuality === 'good') {
          this.trainingStats.perfects += 1;
          this.trainingStats.streak += 1;
        } else {
          this.trainingStats.streak = 0;
        }
        this.launcherTimer = 0.8;
      }

      const recCallout =
        isSetterTouch && currentTouches === 2
          ? 'BOLA ALTA!'
          : effectiveQuality === 'perfect'
            ? 'RECEPÇÃO PERFEITA!'
            : effectiveQuality === 'imprecise'
              ? 'ESPIRROU!'
              : undefined;

      this.pendingEvents.push({
        type: isSetterTouch ? 'set' : 'receive',
        x: bPos.x,
        y: bPos.y,
        z: 0,
        vx: rec.vx,
        vy: rec.vy,
        team: p.team,
        playerId: p.id,
        touchNumber: currentTouches,
        isSelfSet: isSetterTouch && (teamSize === 1 || this.rulesManager.is1v1Mode),
        power: effectiveQuality === 'perfect' ? 0.65 : 0.4,
        callout: recCallout,
        isPerfect: effectiveQuality === 'perfect',
      });
      return;
    }
  }

  public collectSnapshot(): MatchSnapshot {
    const pos = this.ballBody.translation();
    const vel = this.ballBody.linvel();
    const rot = this.ballBody.rotation();
    const events = this.pendingEvents.splice(0, this.pendingEvents.length);
    const touches = this.rulesManager.getTouchesSnapshot();

    return {
      tick: this.tickCount,
      phase: this.phase,
      serveWhistleBlown: this.serveWhistleBlown,
      servingTeam: this.rulesManager.getScore().servingTeam,
      mode: this.mode,
      is1v1Mode: this.rulesManager.is1v1Mode,
      score: this.rulesManager.getScore(),
      ball: {
        x: pos.x,
        y: pos.y,
        z: pos.z,
        vx: vel.x,
        vy: vel.y,
        vz: vel.z,
        rx: rot.x,
        ry: rot.y,
        rz: rot.z,
        rw: rot.w,
        activeUltimate: this.activeUltimate,
        lastTouchTeam: touches.lastTouchTeam,
        lastTouchPlayerId: touches.lastTouchPlayerId,
        lastPlayerToTouch: touches.lastPlayerToTouch,
        touchesLeft: touches.left,
        touchesRight: touches.right,
      },
      players: this.players.map((p) => ({ ...p })),
      events,
      hitstopTimer: this.hitstopTimer,
      trainingStats: this.isTrainingMinigame() ? { ...this.trainingStats } : undefined,
    };
  }

  public is1v1Mode(): boolean {
    return this.rulesManager.is1v1Mode;
  }

  public set1v1Mode(is1v1: boolean): void {
    this.rulesManager.set1v1Mode(is1v1);
  }

  public dispose(): void {
    this.world.free();
  }
}
