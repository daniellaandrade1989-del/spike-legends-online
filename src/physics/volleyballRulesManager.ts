/**
 * Spike Legends Online — Gerenciador Oficial de Regras do Voleibol Profissional
 * Aplica rigorosamente:
 *  1. Limite de 3 toques por time (4º toque = falta)
 *  2. Dois Toques consecutivos pelo mesmo jogador (exceto Bloqueio, que não conta como toque)
 *  3. Falta de Rede (contato do jogador com a rede durante o rally)
 *  4. Invasão por baixo da rede (cruzamento completo da linha central x = 0)
 *  5. Bola Dentro / Bola Fora (Triggers de quadra incluindo linhas)
 *  6. Sistema de Rally Point (15 ou 21 pontos com diferença mínima de 2 pontos)
 */
import { COURT, MATCH_RULES, PHYSICS, type TeamSide } from '../config/gameConfig.ts';

export type VolleyballFaultType =
  | 'four_touches'
  | 'double_contact'
  | 'net_fault'
  | 'penetration_fault'
  | 'ball_out'
  | 'ball_in';

export interface ScoreState {
  left: number;
  right: number;
  servingTeam: TeamSide;
  winner: TeamSide | null;
  pointNumber: number;
  targetPoints: number;
}

export interface TouchValidationResult {
  allowed: boolean;
  fault?: 'four_touches' | 'double_contact';
  scoringTeam?: TeamSide;
  callout?: string;
  teamTouches: number;
  lastTouchTeam: TeamSide;
  lastTouchPlayerId: string | null;
  lastPlayerToTouch: string | null;
  lastTouchWasBlock: boolean;
}

export interface FaultCheckResult {
  isFault: boolean;
  fault?: VolleyballFaultType;
  scoringTeam?: TeamSide;
  callout?: string;
}

export interface LandingResolution {
  inBounds: boolean;
  scoringTeam: TeamSide;
  callout: 'BOLA DENTRO!' | 'BOLA FORA!';
}

export class VolleyballRulesManager {
  public targetPoints: number;
  public minLead: number;
  public maxTouchesPerSide: number;
  public is1v1Mode: boolean;

  private lastTouchTeam: TeamSide = 'left';
  private touchesLeft = 0;
  private touchesRight = 0;
  private lastTouchPlayerId: string | null = null;
  private lastPlayerToTouch: string | null = null;
  private lastTouchWasBlock = false;
  private pointTransitionActive = false;
  private pointResetTimer = 0;
  private pointResetRealDeadlineMs = 0;
  private score: ScoreState;

  constructor(options?: {
    targetPoints?: number;
    minLead?: number;
    maxTouchesPerSide?: number;
    initialServe?: TeamSide;
    is1v1Mode?: boolean;
  }) {
    this.targetPoints = options?.targetPoints ?? MATCH_RULES.POINTS_TO_WIN;
    this.minLead = options?.minLead ?? MATCH_RULES.MIN_LEAD;
    this.maxTouchesPerSide = options?.maxTouchesPerSide ?? PHYSICS.MAX_TOUCHES_PER_SIDE;
    this.is1v1Mode = Boolean(options?.is1v1Mode);
    this.score = this.createInitialScore(options?.initialServe ?? 'left');
  }

  public set1v1Mode(is1v1: boolean): void {
    this.is1v1Mode = Boolean(is1v1);
  }

  private createInitialScore(initialServe: TeamSide): ScoreState {
    return {
      left: 0,
      right: 0,
      servingTeam: initialServe,
      winner: null,
      pointNumber: 1,
      targetPoints: this.targetPoints,
    };
  }

  public resetMatch(initialServe: TeamSide = 'left', targetPoints?: number): ScoreState {
    if (targetPoints !== undefined) {
      this.targetPoints = targetPoints;
    }
    this.score = this.createInitialScore(initialServe);
    this.resetRallyState(initialServe);
    return this.getScore();
  }

  public resetRallyState(servingTeam: TeamSide): void {
    this.lastTouchTeam = servingTeam;
    this.touchesLeft = 0;
    this.touchesRight = 0;
    this.lastTouchPlayerId = null;
    this.lastPlayerToTouch = null;
    this.lastTouchWasBlock = false;
    this.cancelPointTransition();
  }

  public getScore(): ScoreState {
    return { ...this.score };
  }

  public getTouches(team: TeamSide): number {
    return team === 'left' ? this.touchesLeft : this.touchesRight;
  }

  public getLastPlayerToTouch(): string | null {
    return this.lastPlayerToTouch;
  }

  public getTouchesSnapshot(): {
    left: number;
    right: number;
    lastTouchTeam: TeamSide;
    lastTouchPlayerId: string | null;
    lastPlayerToTouch: string | null;
    lastTouchWasBlock: boolean;
  } {
    return {
      left: this.touchesLeft,
      right: this.touchesRight,
      lastTouchTeam: this.lastTouchTeam,
      lastTouchPlayerId: this.lastTouchPlayerId,
      lastPlayerToTouch: this.lastPlayerToTouch,
      lastTouchWasBlock: this.lastTouchWasBlock,
    };
  }

  /**
   * Registra um toque oficial ou bloqueio verificando:
   * - Em modo 2x2 (`is1v1Mode === false`): Dois Toques (mesmo jogador tocando 2x seguidas, exceto após Bloqueio)
   * - Em modo 1x1 Puro (`is1v1Mode === true`): Permite múltiplos toques consecutivos pelo mesmo jogador até o limite de 3 toques
   * - Limite de 3 Toques (4º toque resulta em falta)
   * - Bloqueio não conta no limite de 3 toques e libera o bloqueador para o 1º toque seguinte
   */
  public registerTouch(
    playerId: string,
    team: TeamSide,
    options?: { isBlock?: boolean; ignoreFaults?: boolean },
  ): TouchValidationResult {
    const isBlock = Boolean(options?.isBlock);
    const ignoreFaults = Boolean(options?.ignoreFaults);
    const opponent: TeamSide = team === 'left' ? 'right' : 'left';

    if (isBlock) {
      this.lastTouchTeam = team;
      this.touchesLeft = 0;
      this.touchesRight = 0;
      this.lastTouchPlayerId = null;
      this.lastPlayerToTouch = null;
      this.lastTouchWasBlock = true;
      return {
        allowed: true,
        teamTouches: 0,
        lastTouchTeam: this.lastTouchTeam,
        lastTouchPlayerId: this.lastTouchPlayerId,
        lastPlayerToTouch: this.lastPlayerToTouch,
        lastTouchWasBlock: true,
      };
    }

    // Regra estrita de Dois Toques (ativa quando is1v1Mode === false):
    // O mesmo jogador (lastPlayerToTouch) não pode tocar duas vezes consecutivas,
    // exceto quando o contato anterior foi um Bloqueio oficial ou quando is1v1Mode === true.
    if (
      !ignoreFaults &&
      !this.is1v1Mode &&
      this.lastTouchTeam === team &&
      this.lastPlayerToTouch === playerId &&
      !this.lastTouchWasBlock
    ) {
      return {
        allowed: false,
        fault: 'double_contact',
        scoringTeam: opponent,
        callout: 'DOIS TOQUES! FALTA!',
        teamTouches: this.getTouches(team),
        lastTouchTeam: this.lastTouchTeam,
        lastTouchPlayerId: this.lastTouchPlayerId,
        lastPlayerToTouch: this.lastPlayerToTouch,
        lastTouchWasBlock: this.lastTouchWasBlock,
      };
    }

    if (this.lastTouchTeam !== team) {
      this.lastTouchTeam = team;
      if (team === 'left') {
        this.touchesLeft = 1;
        this.touchesRight = 0;
      } else {
        this.touchesRight = 1;
        this.touchesLeft = 0;
      }
    } else {
      if (team === 'left') this.touchesLeft += 1;
      else this.touchesRight += 1;
    }

    this.lastTouchPlayerId = playerId;
    this.lastPlayerToTouch = playerId;
    this.lastTouchWasBlock = false;
    const currentTouches = this.getTouches(team);

    if (!ignoreFaults && currentTouches > this.maxTouchesPerSide) {
      return {
        allowed: false,
        fault: 'four_touches',
        scoringTeam: opponent,
        callout: '4 TOQUES! FALTA!',
        teamTouches: currentTouches,
        lastTouchTeam: this.lastTouchTeam,
        lastTouchPlayerId: this.lastTouchPlayerId,
        lastPlayerToTouch: this.lastPlayerToTouch,
        lastTouchWasBlock: false,
      };
    }

    return {
      allowed: true,
      teamTouches: currentTouches,
      lastTouchTeam: this.lastTouchTeam,
      lastTouchPlayerId: this.lastTouchPlayerId,
      lastPlayerToTouch: this.lastPlayerToTouch,
      lastTouchWasBlock: false,
    };
  }

  /**
   * Falta de Rede removida: jogadores e IA podem encostar livremente na rede sem gerar falta ou ponto adversário.
   */
  public checkNetFault(_playerTeam: TeamSide, _isTouchingNet: boolean): FaultCheckResult {
    return { isFault: false };
  }

  /**
   * Verifica Invasão por baixo da rede: jogador cruza completamente a linha central (x = 0)
   * para o lado adversário considerando seu raio físico.
   */
  public checkPenetrationFault(
    playerTeam: TeamSide,
    playerX: number,
    playerRadius: number = PHYSICS.PLAYER_RADIUS,
  ): FaultCheckResult {
    const tolerance = 0.04;
    const crossedCompletely =
      playerTeam === 'left'
        ? playerX - playerRadius > tolerance
        : playerX + playerRadius < -tolerance;

    if (!crossedCompletely) {
      return { isFault: false };
    }

    return {
      isFault: true,
      fault: 'penetration_fault',
      scoringTeam: playerTeam === 'left' ? 'right' : 'left',
      callout: 'INVASÃO! FALTA!',
    };
  }

  /**
   * Verifica Bola Dentro / Bola Fora quando a bola toca o chão.
   * No vôlei oficial, se a bola tocar exatamente sobre a linha, é Bola Dentro!
   */
  public resolveCourtLanding(
    ballX: number,
    ballZ: number,
    lastTouchTeam: TeamSide = this.lastTouchTeam,
    ballRadius: number = PHYSICS.BALL_RADIUS,
  ): LandingResolution {
    const lineGrace = ballRadius * 0.5;
    const inBoundsX = Math.abs(ballX) <= COURT.HALF_WIDTH + lineGrace;
    const inBoundsZ = Math.abs(ballZ) <= COURT.HALF_DEPTH + lineGrace;

    if (!inBoundsX || !inBoundsZ) {
      return {
        inBounds: false,
        scoringTeam: lastTouchTeam === 'left' ? 'right' : 'left',
        callout: 'BOLA FORA!',
      };
    }

    return {
      inBounds: true,
      scoringTeam: ballX < 0 ? 'right' : 'left',
      callout: 'BOLA DENTRO!',
    };
  }

  /**
   * Resolução imediata de Bola Fora (OutZone):
   * Verifica quem foi `lastPlayerToTouch` (último jogador a tocar na bola)
   * e atribui o ponto imediatamente ao time adversário.
   */
  public resolveOutZoneFault(
    playerTeamResolver?: (playerId: string) => TeamSide | undefined,
  ): LandingResolution {
    const touchingTeam =
      (this.lastPlayerToTouch && playerTeamResolver?.(this.lastPlayerToTouch)) ?? this.lastTouchTeam;
    return {
      inBounds: false,
      scoringTeam: touchingTeam === 'left' ? 'right' : 'left',
      callout: 'BOLA FORA!',
    };
  }

  /**
   * Sistema de Pontuação Rally Point:
   * Vence quem atingir `targetPoints` (15 ou 21) com vantagem mínima de `minLead` (2 pontos).
   */
  public checkWinner(left: number, right: number): TeamSide | null {
    if (left >= this.targetPoints && left - right >= this.minLead) return 'left';
    if (right >= this.targetPoints && right - left >= this.minLead) return 'right';
    return null;
  }

  public startPointTransition(delaySec: number = MATCH_RULES.POINT_FREEZE_DELAY): void {
    const safeDelay = Number.isFinite(delaySec) && delaySec > 0 ? Math.min(delaySec, 5.0) : MATCH_RULES.POINT_FREEZE_DELAY;
    this.pointTransitionActive = true;
    this.pointResetTimer = safeDelay;
    this.pointResetRealDeadlineMs = Date.now() + Math.round(safeDelay * 1000) + 450;
  }

  public cancelPointTransition(): void {
    this.pointTransitionActive = false;
    this.pointResetTimer = 0;
    this.pointResetRealDeadlineMs = 0;
  }

  public tickPointTransition(dt: number): {
    ready: boolean;
    winner: TeamSide | null;
    servingTeam: TeamSide;
  } {
    if (!this.pointTransitionActive) {
      return {
        ready: true,
        winner: this.score.winner,
        servingTeam: this.score.servingTeam,
      };
    }

    const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0;
    this.pointResetTimer -= safeDt;
    const deadlineReached = this.pointResetRealDeadlineMs > 0 && Date.now() >= this.pointResetRealDeadlineMs;
    const ready = !Number.isFinite(this.pointResetTimer) || this.pointResetTimer <= 0 || deadlineReached;

    if (ready) {
      this.cancelPointTransition();
    }
    return {
      ready,
      winner: this.score.winner,
      servingTeam: this.score.servingTeam,
    };
  }

  public awardPoint(scoringTeam: TeamSide): ScoreState {
    if (this.score.winner !== null) return this.getScore();
    const nextLeft = scoringTeam === 'left' ? this.score.left + 1 : this.score.left;
    const nextRight = scoringTeam === 'right' ? this.score.right + 1 : this.score.right;
    const winner = this.checkWinner(nextLeft, nextRight);

    this.score = {
      left: nextLeft,
      right: nextRight,
      servingTeam: scoringTeam,
      winner,
      pointNumber: this.score.pointNumber + 1,
      targetPoints: this.targetPoints,
    };
    this.startPointTransition(MATCH_RULES.POINT_FREEZE_DELAY);
    return this.getScore();
  }
}
