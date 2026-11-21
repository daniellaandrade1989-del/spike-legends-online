/**
 * Spike Legends Online — Gerenciador de Dupla Inimiga 2v2, Cooperação e Humanização da IA
 * Coordena Bot 1 + Bot 2 no time adversário (recepção -> levantamento na rede -> ataque)
 * sem violar Dois Toques ou Limite de 3 Toques, aplica erros humanos realistas
 * (Margem de Erro e Atraso de Reação) e coordena a máquina de estados do aliado P2.
 */
import {
  COURT,
  DIFFICULTY_TUNING,
  PHYSICS,
  type AiDifficulty,
  type TeamSide,
} from '../config/gameConfig.ts';
import {
  decideAiAction,
  predictBallLandingX,
  type AiCommand,
  type Vec3Like,
} from './volleyballRules.ts';
import {
  AI_DIFFICULTY_BOT_MULTIPLIERS,
  gameManager,
  type AiDifficultyBotMultipliers,
} from '../rpg/playerStatsManager.ts';

/**
 * Constantes de Balanceamento do Bloqueio da IA:
 * - ReactionDelay entre 0.2s e 0.5s antes de saltar para o bloqueio
 * - BlockSuccessRate de 60% (40% de chance de atrasar o pulo ou deixar a paralela aberta)
 */
export const AI_BLOCK_SUCCESS_RATE = 0.6;
export const AI_BLOCK_REACTION_DELAY_MIN_SEC = 0.2;
export const AI_BLOCK_REACTION_DELAY_MAX_SEC = 0.5;

export type AiBlockFailureMode = 'none' | 'wrong_timing' | 'open_parallel';

export interface AiBlockEvaluation {
  reactionDelaySec: number;
  elapsedSec: number;
  willSucceed: boolean;
  failureMode: AiBlockFailureMode;
  readyToJump: boolean;
}

export interface AiHumanizationProfile {
  errorChance: number;
  reactionDelaySec: number;
  errorMargin: number;
  blockSuccessRate: number;
  moveSpeedMultiplier: number;
  spikePrecision: number;
}

export type HumanErrorKind = 'none' | 'late_reaction' | 'mistime_block' | 'receive_drift' | 'overpower_out';

export interface ActiveHumanErrorState {
  kind: HumanErrorKind;
  delayTimer: number;
  driftOffsetX: number;
}

export interface DuoPlayerObservation {
  id: string;
  slotIndex: number;
  pos: Vec3Like;
  velY: number;
  isStunned: boolean;
  canHit: boolean;
}

export interface DuoStepObservation {
  team: TeamSide;
  difficulty: AiDifficulty;
  ballPos: Vec3Like;
  ballVel: Vec3Like;
  touchesOnSide: number;
  lastTouchTeam: TeamSide;
  lastTouchPlayerId: string | null;
  lastTouchWasBlock: boolean;
  opposingPos?: Vec3Like;
  opposingJumping?: boolean;
  players: DuoPlayerObservation[];
  tick: number;
  dt: number;
  matchPhase?: 'serve_wait' | 'rally' | 'point_freeze' | 'finished';
  servingTeam?: TeamSide;
  activeServerId?: string;
}

export type ExtendedAiCommand = AiCommand & {
  intendedRole: 'receiver' | 'setter' | 'attacker' | 'blocker' | 'support' | 'coverage' | 'server';
  overpowerOut?: boolean;
  humanError?: HumanErrorKind;
  faceOpponents?: boolean;
};

/**
 * Coordenada alvo obrigatória atrás da linha de fundo (completamente fora da área de jogo).
 */
export function getServeWaitTargetX(team: TeamSide): number {
  const dir = team === 'left' ? -1 : 1;
  return dir * (COURT.HALF_WIDTH + 0.95);
}

/**
 * Garante que o collider inteiro do personagem está além da linha de fundo antes de liberar o saque.
 */
export function isCompletelyOutsideCourtForServe(x: number, team: TeamSide): boolean {
  const minClearance = COURT.HALF_WIDTH + PHYSICS.PLAYER_RADIUS + 0.12;
  return team === 'left' ? x <= -minClearance : x >= minClearance;
}

export function getHumanizationProfile(difficulty: AiDifficulty): AiHumanizationProfile {
  const profile = DIFFICULTY_TUNING[difficulty];
  return {
    errorChance: profile.aiErrorChance,
    reactionDelaySec: profile.aiReactionDelaySec,
    errorMargin: profile.aiErrorMargin,
    blockSuccessRate: profile.aiBlockSuccessRate,
    moveSpeedMultiplier: profile.aiMoveSpeedMultiplier,
    spikePrecision: profile.aiSpikePrecision,
  };
}

/**
 * Gerencia a cooperação da dupla adversária (Bot 1 e Bot 2), o ciclo tático obrigatório de 3 toques
 * (Toque 1 Recepção -> Toque 2 Levantamento -> Toque 3 Ataque) e o balanceamento de bloqueio (ReactionDelay + 60% Success).
 */
export class EnemyTeamManager {
  public currentDifficulty: AiDifficulty = gameManager.getCurrentDifficulty();
  private rng: () => number;
  private errorState: ActiveHumanErrorState = {
    kind: 'none',
    delayTimer: 0,
    driftOffsetX: 0,
  };
  private lastIncomingSignature = '';
  private blockEvalState: {
    active: boolean;
    reactionDelaySec: number;
    elapsedSec: number;
    willSucceed: boolean;
    failureMode: AiBlockFailureMode;
  } = {
    active: false,
    reactionDelaySec: AI_BLOCK_REACTION_DELAY_MIN_SEC,
    elapsedSec: 0,
    willSucceed: true,
    failureMode: 'none',
  };

  constructor(rng: () => number = Math.random, initialDifficulty?: AiDifficulty) {
    this.rng = rng;
    if (initialDifficulty) {
      this.currentDifficulty = initialDifficulty;
    }
  }

  public setDifficulty(difficulty: AiDifficulty): AiDifficultyBotMultipliers {
    this.currentDifficulty = difficulty;
    return this.getBotMultipliers(difficulty);
  }

  public getBotMultipliers(difficulty: AiDifficulty = this.currentDifficulty): AiDifficultyBotMultipliers {
    return AI_DIFFICULTY_BOT_MULTIPLIERS[difficulty] ?? AI_DIFFICULTY_BOT_MULTIPLIERS.medium;
  }

  public resetRally(): void {
    this.errorState = { kind: 'none', delayTimer: 0, driftOffsetX: 0 };
    this.lastIncomingSignature = '';
    this.blockEvalState = {
      active: false,
      reactionDelaySec: AI_BLOCK_REACTION_DELAY_MIN_SEC,
      elapsedSec: 0,
      willSucceed: true,
      failureMode: 'none',
    };
  }

  public getCurrentErrorState(): Readonly<ActiveHumanErrorState> {
    return this.errorState;
  }

  public getCurrentBlockEvaluation(): Readonly<AiBlockEvaluation> {
    return {
      reactionDelaySec: this.blockEvalState.reactionDelaySec,
      elapsedSec: this.blockEvalState.elapsedSec,
      willSucceed: this.blockEvalState.willSucceed,
      failureMode: this.blockEvalState.failureMode,
      readyToJump: this.blockEvalState.elapsedSec >= this.blockEvalState.reactionDelaySec,
    };
  }

  /**
   * Avalia o ReactionDelay e o BlockSuccessRate de acordo com a Dificuldade escolhida:
   * - Iniciante ('easy'): ReactionDelay alto (~0.85s) e BlockSuccessRate de 20% (0.20).
   * - Avançado ('medium'): ReactionDelay médio (0.2s a 0.5s) e BlockSuccessRate de 60% (0.60).
   * - Classe Mundial ('hard'): ReactionDelay quase zero (0.10s) e BlockSuccessRate de 90% (0.90).
   */
  public evaluateBlockAttempt(
    ballOnMySide: boolean,
    dt: number,
    difficulty?: AiDifficulty,
  ): AiBlockEvaluation {
    if (ballOnMySide) {
      this.blockEvalState.active = false;
      this.blockEvalState.elapsedSec = 0;
      return {
        reactionDelaySec: this.blockEvalState.reactionDelaySec,
        elapsedSec: 0,
        willSucceed: this.blockEvalState.willSucceed,
        failureMode: this.blockEvalState.failureMode,
        readyToJump: false,
      };
    }

    if (!this.blockEvalState.active) {
      const effectiveDiff: AiDifficulty = difficulty ?? 'medium';
      const mult = this.getBotMultipliers(effectiveDiff);
      const successRoll = this.rng();
      const willSucceed = successRoll >= 1 - mult.blockSuccessRate;
      const delayRoll = this.rng();

      let reactionDelaySec: number;
      if (effectiveDiff === 'easy') {
        // Iniciante: demora mais para agir (~0.75s a 0.95s, média 0.85s)
        reactionDelaySec = 0.75 + (1 - delayRoll) * 0.2;
      } else if (effectiveDiff === 'hard') {
        // Classe Mundial: ReactionDelay quase zero (0.08s a 0.12s, média 0.10s)
        reactionDelaySec = 0.08 + (1 - delayRoll) * 0.04;
      } else {
        // Avançado: ReactionDelay médio (0.20s a 0.50s)
        reactionDelaySec =
          AI_BLOCK_REACTION_DELAY_MIN_SEC +
          (1 - delayRoll) * (AI_BLOCK_REACTION_DELAY_MAX_SEC - AI_BLOCK_REACTION_DELAY_MIN_SEC);
      }

      const failureMode: AiBlockFailureMode = willSucceed
        ? 'none'
        : this.rng() < 0.5
          ? 'wrong_timing'
          : 'open_parallel';

      this.blockEvalState = {
        active: true,
        reactionDelaySec,
        elapsedSec: dt,
        willSucceed,
        failureMode,
      };
    } else {
      this.blockEvalState.elapsedSec += dt;
    }

    return {
      reactionDelaySec: this.blockEvalState.reactionDelaySec,
      elapsedSec: this.blockEvalState.elapsedSec,
      willSucceed: this.blockEvalState.willSucceed,
      failureMode: this.blockEvalState.failureMode,
      readyToJump: this.blockEvalState.elapsedSec >= this.blockEvalState.reactionDelaySec,
    };
  }

  /**
   * Sorteia erro humano realista quando uma nova jogada perigosa cruza para o lado da IA
   * (ou na preparação de corte).
   */
  public evaluateHumanizedError(
    difficulty: AiDifficulty,
    ballPos: Vec3Like,
    ballVel: Vec3Like,
    touchesOnSide: number,
    team: TeamSide,
  ): ActiveHumanErrorState {
    const profile = getHumanizationProfile(difficulty);
    const ballOnMySide = team === 'left' ? ballPos.x < 0.2 : ballPos.x > -0.2;
    const comingFast = team === 'left' ? ballVel.x < -7.5 : ballVel.x > 7.5;
    const signature = `${ballOnMySide ? 'my' : 'opp'}_${touchesOnSide}`;

    if (signature !== this.lastIncomingSignature) {
      this.lastIncomingSignature = signature;
      if (this.rng() < profile.errorChance) {
        const roll = this.rng();
        let kind: HumanErrorKind = 'receive_drift';
        if (comingFast && touchesOnSide === 0 && roll < 0.36) {
          kind = 'late_reaction';
        } else if (!ballOnMySide && roll < 0.55) {
          kind = 'mistime_block';
        } else if (touchesOnSide >= 2 && roll >= 0.58) {
          kind = 'overpower_out';
        }
        const sign = this.rng() < 0.5 ? -1 : 1;
        this.errorState = {
          kind,
          delayTimer: kind === 'late_reaction' ? profile.reactionDelaySec : 0,
          driftOffsetX: sign * profile.errorMargin,
        };
      } else {
        this.errorState = { kind: 'none', delayTimer: 0, driftOffsetX: 0 };
      }
    }

    return this.errorState;
  }

  /**
   * Calcula comandos coordenados para os 2 bots da equipe (Bot 1 e Bot 2) aplicando
   * rigorosamente o Ciclo Obrigatório de 3 Toques no modo 2v2:
   * - Toque 1 (Recepção): Bot A defende a bola e a direciona para a posição do Bot B.
   * - Toque 2 (Levantamento): Bot B (Levantador) corre para a bola e executa o estado de Levantamento (Set).
   * - Toque 3 (Ataque): Bot A corre, pula e executa o Corte (Spike) para o outro lado da quadra.
   */
  public computeDuoCommands(obs: DuoStepObservation): Record<string, ExtendedAiCommand> {
    const result: Record<string, ExtendedAiCommand> = {};
    if (obs.players.length === 0) return result;

    if (this.errorState.delayTimer > 0) {
      this.errorState.delayTimer = Math.max(0, this.errorState.delayTimer - obs.dt);
    }

    const activeErr = this.evaluateHumanizedError(
      obs.difficulty,
      obs.ballPos,
      obs.ballVel,
      obs.touchesOnSide,
      obs.team,
    );

    const sideSign = obs.team === 'left' ? -1 : 1;

    // Estado de espera pré-saque: IA é obrigada a recuar até a coordenada atrás da linha de fundo
    if (obs.matchPhase === 'serve_wait') {
      this.resetRally();
      const serverId = obs.activeServerId ?? obs.players[0].id;
      const serveSpotX = getServeWaitTargetX(obs.team);
      for (const pl of obs.players) {
        const isDesignatedServer = obs.servingTeam === obs.team && pl.id === serverId;
        const targetX = isDesignatedServer
          ? serveSpotX
          : sideSign * (pl.slotIndex === 1 ? COURT.HALF_WIDTH * 0.22 : COURT.HALF_WIDTH * 0.48);
        const dx = targetX - pl.pos.x;
        const distThreshold = isDesignatedServer ? 0.08 : 0.22;
        const moveX =
          Math.abs(dx) > distThreshold ? Math.sign(dx) * Math.min(1, Math.abs(dx) * 1.8) : 0;
        result[pl.id] = {
          moveX,
          moveZ: 0,
          jump: false,
          spike: false,
          dive: false,
          aim: 'parallel',
          aimZ: 0,
          isFeint: false,
          intendedRole: isDesignatedServer ? 'server' : 'support',
          faceOpponents: true,
          humanError: 'none',
        };
      }
      return result;
    }

    this.currentDifficulty = obs.difficulty;
    const botMult = this.getBotMultipliers(obs.difficulty);
    const ballOnMySide = obs.team === 'left' ? obs.ballPos.x < 0.2 : obs.ballPos.x > -0.2;
    const blockEval = this.evaluateBlockAttempt(ballOnMySide, obs.dt, obs.difficulty);

    if (obs.players.length === 1) {
      const solo = obs.players[0];
      const base = decideAiAction({
        aiPos: solo.pos,
        aiTeam: obs.team,
        ballPos: obs.ballPos,
        ballVel: obs.ballVel,
        touchesOnSide: obs.touchesOnSide,
        difficulty: obs.difficulty,
        canHit: solo.canHit,
        role: 'attacker',
        humanPos: obs.opposingPos,
        humanJumping: obs.opposingJumping,
        tick: obs.tick,
      });

      let soloJump = base.jump;
      let soloMoveX = Math.max(-1, Math.min(1, base.moveX * botMult.moveSpeedMultiplier));
      if (!ballOnMySide) {
        if (!blockEval.readyToJump) {
          soloJump = false;
        } else if (!blockEval.willSucceed) {
          if (blockEval.failureMode === 'open_parallel') {
            const openX = sideSign * 2.25;
            const dxOpen = openX - solo.pos.x;
            soloMoveX = Math.abs(dxOpen) > 0.14 ? Math.sign(dxOpen) * 0.85 : 0;
            soloJump = false;
          } else {
            soloJump = solo.canHit && obs.ballPos.y < 1.95 && obs.tick % 18 === 0;
          }
        }
      }

      result[solo.id] = {
        ...base,
        moveX: soloMoveX,
        jump: soloJump,
        intendedRole: 'attacker',
        humanError: activeErr.kind,
      };
      return result;
    }

    // Ordena os 2 bots da dupla
    const sorted = [...obs.players].sort((a, b) => a.slotIndex - b.slotIndex);
    const bot1 = sorted[0];
    const bot2 = sorted[1];

    const sameSideSequence = obs.lastTouchTeam === obs.team && obs.touchesOnSide > 0;
    const cannotDoubleContactId =
      sameSideSequence && !obs.lastTouchWasBlock ? obs.lastTouchPlayerId : null;

    let activeActor = bot1;
    let partner = bot2;
    let actorRole: 'receiver' | 'setter' | 'attacker' = 'receiver';

    if (!ballOnMySide) {
      // Defesa de rede: quem estiver mais próximo à rede vigia bloqueio, outro cobre o fundo
      const b1Near = Math.abs(bot1.pos.x);
      const b2Near = Math.abs(bot2.pos.x);
      activeActor = b1Near <= b2Near ? bot1 : bot2;
      partner = activeActor.id === bot1.id ? bot2 : bot1;
      actorRole = 'attacker';
    } else if (obs.touchesOnSide === 0) {
      // Toque 1 (Recepção): Bot A (mais próximo do ponto de queda previsto da bola) defende e direciona para o Bot B
      const predLandingX = predictBallLandingX(obs.ballPos, obs.ballVel, obs.team, 1.05, obs.difficulty);
      const d1 = Math.abs(bot1.pos.x - predLandingX);
      const d2 = Math.abs(bot2.pos.x - predLandingX);
      activeActor = d1 <= d2 ? bot1 : bot2;
      partner = activeActor.id === bot1.id ? bot2 : bot1;
      actorRole = 'receiver';
    } else if (obs.touchesOnSide === 1) {
      // Toque 2 (Levantamento): Bot B (Levantador — obrigatoriamente quem NÃO deu o 1º toque) corre para a bola e executa o Set
      if (cannotDoubleContactId === bot1.id) {
        activeActor = bot2;
        partner = bot1;
      } else if (cannotDoubleContactId === bot2.id) {
        activeActor = bot1;
        partner = bot2;
      } else {
        activeActor = Math.abs(bot2.pos.x) <= Math.abs(bot1.pos.x) ? bot2 : bot1;
        partner = activeActor.id === bot1.id ? bot2 : bot1;
      }
      actorRole = 'setter';
    } else {
      // Toque 3 (Ataque): Bot A (que fez a recepção e não levantou no 2º toque) corre, salta e executa o Corte (Spike)
      if (cannotDoubleContactId === bot2.id) {
        activeActor = bot1;
        partner = bot2;
      } else if (cannotDoubleContactId === bot1.id) {
        activeActor = bot2;
        partner = bot1;
      } else {
        const predSpikeX = predictBallLandingX(obs.ballPos, obs.ballVel, obs.team, 2.35, obs.difficulty);
        const d1 = Math.abs(bot1.pos.x - predSpikeX);
        const d2 = Math.abs(bot2.pos.x - predSpikeX);
        activeActor = d1 <= d2 ? bot1 : bot2;
        partner = activeActor.id === bot1.id ? bot2 : bot1;
      }
      actorRole = 'attacker';
    }

    // Decisão do ator principal
    const delayFrozen = activeErr.kind === 'late_reaction' && activeErr.delayTimer > 0;
    const baseRoleForDecide: 'attacker' | 'setter' = actorRole === 'setter' ? 'setter' : 'attacker';

    const effectiveBallPos: Vec3Like =
      activeErr.kind === 'receive_drift' && actorRole === 'receiver'
        ? { ...obs.ballPos, x: obs.ballPos.x + activeErr.driftOffsetX }
        : obs.ballPos;

    let actorCmd = decideAiAction({
      aiPos: activeActor.pos,
      aiTeam: obs.team,
      ballPos: effectiveBallPos,
      ballVel: obs.ballVel,
      touchesOnSide: obs.touchesOnSide,
      difficulty: obs.difficulty,
      canHit: activeActor.canHit,
      role: baseRoleForDecide,
      attackerPos: partner.pos,
      humanPos: obs.opposingPos,
      humanJumping: obs.opposingJumping,
      tick: obs.tick,
    });

    if (delayFrozen) {
      actorCmd = {
        ...actorCmd,
        moveX: 0,
        jump: false,
        dive: false,
        spike: false,
      };
    }

    // Balanceamento do Bloqueio da IA (ReactionDelay de 0.2s–0.5s + BlockSuccessRate de 60%)
    if (!ballOnMySide) {
      if (!blockEval.readyToJump) {
        actorCmd = {
          ...actorCmd,
          jump: false,
        };
      } else if (!blockEval.willSucceed || activeErr.kind === 'mistime_block') {
        if (blockEval.failureMode === 'open_parallel') {
          // Deixa o corredor da paralela aberto sem saltar
          const openParallelX = sideSign * 2.25;
          const dxOpen = openParallelX - activeActor.pos.x;
          actorCmd = {
            ...actorCmd,
            moveX: Math.abs(dxOpen) > 0.14 ? Math.sign(dxOpen) * 0.85 : 0,
            jump: false,
          };
        } else {
          // Salta fora do tempo ideal (cedo/tarde)
          actorCmd = {
            ...actorCmd,
            jump: activeActor.canHit && obs.ballPos.y < 1.95 && obs.tick % 24 === 0,
          };
        }
      }
    }

    // Regra Rígida do Ciclo de 3 Toques (2v2):
    // - No Toque 1 (touchesOnSide === 0): Recepção obrigatória (sem pulo e sem ataque de primeira)
    // - No Toque 2 (touchesOnSide === 1): Levantamento obrigatório (Set alto para o parceiro, sem atacar de segunda)
    if (ballOnMySide && (obs.touchesOnSide === 0 || obs.touchesOnSide === 1)) {
      actorCmd.jump = false;
      actorCmd.spike = false;
    }

    // Limite de 3 toques: se a equipe já deu 3 toques, não tenta um 4º toque ilegal
    if (ballOnMySide && obs.touchesOnSide >= 3) {
      actorCmd.jump = false;
      actorCmd.spike = false;
      actorCmd.dive = false;
    }

    // No 3º toque, se houve erro de força desproporcional, isola para fora da quadra
    const overpowerOut =
      actorRole === 'attacker' && obs.touchesOnSide >= 2 && activeErr.kind === 'overpower_out';

    result[activeActor.id] = {
      ...actorCmd,
      moveX: Math.max(-1, Math.min(1, actorCmd.moveX * botMult.moveSpeedMultiplier)),
      intendedRole: actorRole,
      overpowerOut,
      humanError: activeErr.kind,
    };

    // Posicionamento tático do parceiro no Ciclo de 3 Toques:
    // - Enquanto Bot A recepciona (Toque 1), Bot B já corre para a posição de Levantamento perto da rede (±1.45m)
    // - Enquanto Bot B levanta (Toque 2), Bot A prepara a corrida de aproximação de Ataque (±2.25m)
    // - Enquanto o atacante salta no Toque 3 (ou bloqueia), o parceiro faz cobertura no meio da quadra
    const teammateJumpingForAttackOrBlock =
      activeActor.pos.y > 0.35 ||
      (actorCmd.jump && (!ballOnMySide || obs.touchesOnSide >= 2));

    const partnerTargetX = teammateJumpingForAttackOrBlock
      ? sideSign * (COURT.HALF_WIDTH * 0.5)
      : actorRole === 'receiver'
        ? sideSign * 1.45 // Bot B se posiciona na zona de levantamento perto da rede
        : actorRole === 'setter'
          ? sideSign * 2.25 // Bot A prepara a passada de aproximação para cortar o 3º toque
          : sideSign * (COURT.HALF_WIDTH * 0.5); // Cobertura de meio de quadra

    const safeMinX = obs.team === 'left' ? -COURT.HALF_WIDTH + 0.7 : 0.72;
    const safeMaxX = obs.team === 'left' ? -0.72 : COURT.HALF_WIDTH - 0.7;
    const clampedTarget = Math.max(safeMinX, Math.min(safeMaxX, partnerTargetX));
    const dxPartner = clampedTarget - partner.pos.x;
    const partnerMoveX =
      Math.abs(dxPartner) > 0.14 ? Math.sign(dxPartner) * Math.min(1, Math.abs(dxPartner) * 1.45) : 0;

    result[partner.id] = {
      moveX: partnerMoveX,
      moveZ: 0,
      jump: false,
      spike: false,
      dive: false,
      aim: 'parallel',
      aimZ: 0,
      isFeint: false,
      intendedRole: teammateJumpingForAttackOrBlock ? 'coverage' : 'support',
      faceOpponents: true,
      humanError: activeErr.kind,
    };

    return result;
  }
}

/**
 * Máquina de estados tática do Parceiro Aliado (P2) na equipe do jogador:
 * - Herda exatamente o mesmo rastreamento balístico (predictBallLandingX) e precisão de recepção da IA inimiga.
 * - Executa o Ciclo Obrigatório de 3 Toques em conjunto com o jogador humano:
 *   - Toque 1 (Recepção): Defende qualquer bola na sua metade ou fora do eixo imediato do humano e direciona para o Levantamento.
 *   - Toque 2 (Levantamento): Corre para a bola e executa o estado de Levantamento (Set) alto perto da rede.
 *   - Toque 3 (Ataque): Se o humano levantou no 2º toque (ou está atordoado/longe), corre, salta e executa o Corte (Spike).
 */
export function decideAlliedPartnerAction(params: {
  partnerPos: Vec3Like;
  partnerVelY: number;
  partnerTeam: TeamSide;
  partnerCanHit: boolean;
  humanPos: Vec3Like;
  humanJumping?: boolean;
  humanStunned: boolean;
  ballPos: Vec3Like;
  ballVel: Vec3Like;
  touchesOnSide: number;
  lastTouchTeam: TeamSide;
  lastTouchPlayerId: string | null;
  lastTouchWasBlock: boolean;
  humanId: string;
  difficulty: AiDifficulty;
  tick: number;
  oppTouchesOnSide?: number;
  oppAttackerPos?: Vec3Like;
  oppAttackerVelY?: number;
  oppAttackerActionState?: string;
  oppAttackerJumping?: boolean;
  blockEval?: AiBlockEvaluation;
}): ExtendedAiCommand {
  const {
    partnerPos,
    partnerTeam,
    partnerCanHit,
    humanPos,
    humanJumping = humanPos.y > 0.35,
    humanStunned,
    ballPos,
    ballVel,
    touchesOnSide,
    lastTouchTeam,
    lastTouchPlayerId,
    lastTouchWasBlock,
    humanId,
    difficulty,
    tick,
    oppTouchesOnSide = 0,
    oppAttackerPos,
    oppAttackerVelY,
    oppAttackerActionState,
    oppAttackerJumping = false,
    blockEval,
  } = params;

  const sideSign = partnerTeam === 'left' ? -1 : 1;
  const ballOnMySide = partnerTeam === 'left' ? ballPos.x < 0.2 : ballPos.x > -0.2;
  const humanTookLast =
    lastTouchTeam === partnerTeam && lastTouchPlayerId === humanId && !lastTouchWasBlock;
  const partnerTookLast =
    lastTouchTeam === partnerTeam &&
    lastTouchPlayerId !== null &&
    lastTouchPlayerId !== humanId &&
    !lastTouchWasBlock;

  // IA de Cobertura: se P1 pulou para atacar (3º toque / bola alta) ou bloquear (bola no campo rival),
  // P2 corre imediatamente para o meio da sua quadra virado para os oponentes!
  const isHumanAirborneAttackOrBlock = (humanJumping || humanPos.y > 0.35) && touchesOnSide !== 1;
  if (isHumanAirborneAttackOrBlock) {
    const coverageX = sideSign * (COURT.HALF_WIDTH * 0.5);
    const dxCov = coverageX - partnerPos.x;
    const moveCov = Math.abs(dxCov) > 0.16 ? Math.sign(dxCov) * Math.min(1, Math.abs(dxCov) * 1.35) : 0;
    return {
      moveX: moveCov,
      moveZ: 0,
      jump: false,
      spike: false,
      dive: false,
      aim: 'parallel',
      aimZ: 0,
      isFeint: false,
      intendedRole: 'coverage',
      faceOpponents: true,
    };
  }

  // Bloqueio Ativo do Parceiro Aliado (P2) com ReactionDelay (0.2s–0.5s) e BlockSuccessRate (60%)
  const oppSetNearNet =
    !ballOnMySide &&
    oppTouchesOnSide >= 2 &&
    Math.abs(ballPos.x) < 3.6 &&
    ballPos.y >= 1.65;
  const oppAttackerNearNet = oppAttackerPos ? Math.abs(oppAttackerPos.x) < 3.8 : true;
  const oppInSpikeJump = Boolean(
    oppAttackerJumping ||
      (oppAttackerPos && oppAttackerPos.y > 0.22) ||
      (oppAttackerVelY !== undefined && oppAttackerVelY > 2.0) ||
      oppAttackerActionState === 'airborne' ||
      oppAttackerActionState === 'jump_charge' ||
      oppAttackerActionState === 'attack_windup' ||
      oppAttackerActionState === 'spike' ||
      oppAttackerActionState === 'shark_attack',
  );
  const partnerMidAirBlockAtNet =
    partnerPos.y > 0.35 &&
    Math.abs(partnerPos.x) < 1.85 &&
    touchesOnSide === 0 &&
    lastTouchTeam !== partnerTeam;

  if (
    partnerMidAirBlockAtNet ||
    (oppSetNearNet && oppAttackerNearNet && oppInSpikeJump && !humanStunned)
  ) {
    const isOpenParallelFail =
      blockEval && !blockEval.willSucceed && blockEval.failureMode === 'open_parallel';
    const blockX = isOpenParallelFail ? sideSign * 2.25 : sideSign * 0.85;
    const dxBlock = blockX - partnerPos.x;
    const moveBlock =
      Math.abs(dxBlock) > 0.14 ? Math.sign(dxBlock) * Math.min(1, Math.abs(dxBlock) * 1.45) : 0;
    const readyAtNet = Math.abs(partnerPos.x) <= 2.25;
    const exactBlockTiming =
      ballPos.y >= 1.85 &&
      ballPos.y <= 4.35 &&
      (ballVel.y < 3.6 ||
        oppAttackerActionState === 'attack_windup' ||
        oppAttackerActionState === 'spike' ||
        (oppAttackerPos?.y ?? 0) > 0.35);

    let shouldJumpBlock = partnerMidAirBlockAtNet
      ? false
      : partnerCanHit && readyAtNet && exactBlockTiming;

    if (blockEval && !partnerMidAirBlockAtNet) {
      if (!blockEval.readyToJump) {
        shouldJumpBlock = false;
      } else if (!blockEval.willSucceed) {
        if (blockEval.failureMode === 'open_parallel') {
          shouldJumpBlock = false;
        } else {
          shouldJumpBlock = partnerCanHit && readyAtNet && ballPos.y < 1.95 && tick % 18 === 0;
        }
      }
    }

    return {
      moveX: moveBlock,
      moveZ: 0,
      jump: shouldJumpBlock,
      spike: false,
      dive: false,
      aim: 'parallel',
      aimZ: 0,
      isFeint: false,
      intendedRole: 'blocker',
      faceOpponents: true,
    };
  }

  // Toque 3 (Ataque): se o humano levantou no 2º toque (ou está atordoado/longe), o Bot Aliado salta e corta!
  if (
    ballOnMySide &&
    touchesOnSide === 2 &&
    (humanTookLast || humanStunned || Math.abs(humanPos.x - ballPos.x) > 2.4)
  ) {
    const atkCmd = decideAiAction({
      aiPos: partnerPos,
      aiTeam: partnerTeam,
      ballPos,
      ballVel,
      touchesOnSide,
      difficulty: 'hard',
      canHit: partnerCanHit,
      role: 'attacker',
      tick,
    });
    return {
      ...atkCmd,
      intendedRole: 'attacker',
      faceOpponents: true,
    };
  }

  // Toque 1 (Recepção): o Bot Aliado herda a mesma precisão de rastreamento balístico (predictBallLandingX)
  // da IA inimiga e recepciona qualquer bola que venha na sua direção ou quando o humano não está exatamente sob ela!
  if (ballOnMySide && touchesOnSide === 0) {
    const predLandingX = predictBallLandingX(ballPos, ballVel, partnerTeam, 1.05, 'hard');
    const partnerDistToLanding = Math.abs(partnerPos.x - predLandingX);
    const humanDistToLanding = Math.abs(humanPos.x - predLandingX);
    const shouldPartnerReceive =
      humanStunned ||
      partnerDistToLanding <= humanDistToLanding + 0.35 ||
      humanDistToLanding > 1.45;

    if (shouldPartnerReceive) {
      const recCmd = decideAiAction({
        aiPos: partnerPos,
        aiTeam: partnerTeam,
        ballPos,
        ballVel,
        touchesOnSide: 0,
        difficulty: 'hard',
        canHit: partnerCanHit,
        role: 'attacker',
        attackerPos: humanPos,
        tick,
      });
      return {
        ...recCmd,
        jump: false,
        spike: false,
        intendedRole: 'receiver',
        faceOpponents: true,
      };
    }

    // Se o humano já está posicionado para recepcionar o 1º toque, o Bot Aliado já corre para a posição de Levantador (±1.45m)
    const setterReadyX = sideSign * 1.45;
    const dxSetter = setterReadyX - partnerPos.x;
    return {
      moveX: Math.abs(dxSetter) > 0.14 ? Math.sign(dxSetter) * Math.min(1, Math.abs(dxSetter) * 1.45) : 0,
      moveZ: 0,
      jump: false,
      spike: false,
      dive: false,
      aim: 'parallel',
      aimZ: 0,
      isFeint: false,
      intendedRole: 'setter',
      faceOpponents: true,
    };
  }

  // Toque 2 (Levantamento): se o Bot Aliado deu o 1º toque (partnerTookLast), ele não pode dar dois toques,
  // então se posiciona em ±2.25m para saltar e cortar no 3º toque após o levantamento do humano!
  if (ballOnMySide && touchesOnSide === 1 && partnerTookLast && !humanStunned) {
    const approachX = sideSign * 2.25;
    const dxApproach = approachX - partnerPos.x;
    return {
      moveX: Math.abs(dxApproach) > 0.14 ? Math.sign(dxApproach) * Math.min(1, Math.abs(dxApproach) * 1.45) : 0,
      moveZ: 0,
      jump: false,
      spike: false,
      dive: false,
      aim: 'parallel',
      aimZ: 0,
      isFeint: false,
      intendedRole: 'support',
      faceOpponents: true,
    };
  }

  // Caso padrão (Toque 2 após recepção do humano): Bot Aliado corre até a bola com rastreamento completo e executa o Set!
  const setterCmd = decideAiAction({
    aiPos: partnerPos,
    aiTeam: partnerTeam,
    ballPos,
    ballVel,
    touchesOnSide,
    difficulty: 'hard',
    canHit: partnerCanHit,
    role: 'setter',
    attackerPos: humanPos,
    tick,
  });

  if (!ballOnMySide && touchesOnSide === 0) {
    const targetX = sideSign * 1.65;
    const dx = targetX - partnerPos.x;
    return {
      ...setterCmd,
      moveX: Math.abs(dx) > 0.2 ? Math.sign(dx) * Math.min(1, Math.abs(dx)) : 0,
      jump: false,
      spike: false,
      intendedRole: 'setter',
      faceOpponents: true,
    };
  }

  return {
    ...setterCmd,
    jump: false,
    spike: false,
    intendedRole: 'setter',
    faceOpponents: true,
  };
}

