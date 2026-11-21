/**
 * Spike Legends Online — ReplayManager (Instant Replay via Circular Frame Buffer)
 * Captura e armazena em buffer circular de memória os últimos 5 segundos (300 ticks @ 60Hz)
 * de posição, rotação e estado de animação da bola e de todos os personagens.
 * Reproduz em câmera lenta (0.45x por padrão) ao final de pontos decisivos, Cortes Perfeitos ou Super Attacks.
 */
import type {
  CharacterAnimState,
  CharacterId,
  TeamSide,
  UltimateType,
} from '../config/gameConfig.ts';

export interface ReplayBallFrame {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  rw: number;
  activeUltimate: UltimateType | null;
}

export interface ReplayPlayerFrame {
  id: string;
  characterId: CharacterId;
  team: TeamSide;
  x: number;
  y: number;
  z: number;
  facingX: number;
  facingZ: number;
  anim: CharacterAnimState;
  animTimer: number;
  ultimateCharge: number;
  ultimateActiveTimer: number;
}

export interface ReplayFrame {
  tick: number;
  dt: number;
  ball: ReplayBallFrame;
  players: ReplayPlayerFrame[];
  callout?: string;
}

export type ReplayHighlightKind = 'perfect_spike' | 'super_attack' | 'decisive_point';

export interface ReplayPlaybackStep {
  frame: ReplayFrame | null;
  finished: boolean;
  progress: number;
  speed: number;
  highlightLabel: string;
}

export interface ReplayStateMeta {
  active: boolean;
  slowMotion: boolean;
  speed: number;
  progress: number;
  highlightLabel: string;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function nlerpQuat(
  ax: number,
  ay: number,
  az: number,
  aw: number,
  bx: number,
  by: number,
  bz: number,
  bw: number,
  t: number,
): { rx: number; ry: number; rz: number; rw: number } {
  const dot = ax * bx + ay * by + az * bz + aw * bw;
  const sign = dot < 0 ? -1 : 1;
  const x = lerp(ax, bx * sign, t);
  const y = lerp(ay, by * sign, t);
  const z = lerp(az, bz * sign, t);
  const w = lerp(aw, bw * sign, t);
  const invLen = 1 / (Math.hypot(x, y, z, w) || 1);
  return {
    rx: x * invLen,
    ry: y * invLen,
    rz: z * invLen,
    rw: w * invLen,
  };
}

export class ReplayManager {
  public readonly maxDurationSec: number;
  public readonly fixedDt: number;
  public readonly capacity: number;

  private ringBuffer: Array<ReplayFrame | null>;
  private writeIndex = 0;
  private count = 0;

  private status: 'recording' | 'playing' = 'recording';
  private playbackFrames: ReplayFrame[] = [];
  private playheadTime = 0;
  private totalPlaybackDuration = 0;
  private playbackStartWallMs = 0;
  private maxPlaybackWallMs = 0;
  private slowMotion = true;
  private slowMoScale = 0.45;

  private rallyHighlights = new Set<ReplayHighlightKind>();
  private activeHighlightLabel = 'REPLAY DA JOGADA';

  constructor(maxDurationSec = 5.0, fixedDt = 1 / 60) {
    this.maxDurationSec = maxDurationSec;
    this.fixedDt = fixedDt;
    this.capacity = Math.max(10, Math.round(maxDurationSec / fixedDt));
    this.ringBuffer = new Array<ReplayFrame | null>(this.capacity).fill(null);
  }

  public isPlaying(): boolean {
    return this.status === 'playing';
  }

  public isSlowMotion(): boolean {
    return this.slowMotion;
  }

  public getPlaybackSpeed(): number {
    return this.slowMotion ? this.slowMoScale : 1.0;
  }

  public setSlowMotion(enabled: boolean): void {
    this.slowMotion = enabled;
  }

  public toggleSlowMotion(): boolean {
    this.slowMotion = !this.slowMotion;
    return this.slowMotion;
  }

  public getBufferedCount(): number {
    return this.count;
  }

  public getMeta(): ReplayStateMeta {
    const progress =
      this.status === 'playing' && this.totalPlaybackDuration > 0
        ? Math.max(0, Math.min(1, this.playheadTime / this.totalPlaybackDuration))
        : 0;
    return {
      active: this.status === 'playing',
      slowMotion: this.slowMotion,
      speed: this.getPlaybackSpeed(),
      progress,
      highlightLabel: this.activeHighlightLabel,
    };
  }

  /**
   * Grava um frame instantâneo no buffer circular (O(1), sobrescreve o frame mais antigo após 5s).
   */
  public recordFrame(frame: ReplayFrame): void {
    if (this.status !== 'recording') return;

    const cloned: ReplayFrame = {
      tick: frame.tick,
      dt: frame.dt > 0 ? frame.dt : this.fixedDt,
      ball: { ...frame.ball },
      players: frame.players.map((p) => ({ ...p })),
      callout: frame.callout,
    };

    this.ringBuffer[this.writeIndex] = cloned;
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count += 1;
    }
  }

  /**
   * Marca um destaque no rali atual (Corte Perfeito, Super Attack ou Ponto Decisivo).
   */
  public markHighlight(kind: ReplayHighlightKind): void {
    this.rallyHighlights.add(kind);
  }

  public hasHighlight(): boolean {
    return this.rallyHighlights.size > 0;
  }

  /**
   * Verifica se o fim do rali deve disparar o Replay Instantâneo:
   * - Ponto decisivo (match point, set point ou diferença mínima no placar final)
   * - Ou rali com "Corte Perfeito" / "Super Attack"
   */
  public shouldTriggerReplay(opts: {
    leftScore: number;
    rightScore: number;
    targetPoints: number;
    winner: TeamSide | null;
  }): boolean {
    if (this.count < 20) return false;
    if (this.rallyHighlights.has('perfect_spike') || this.rallyHighlights.has('super_attack')) {
      return true;
    }
    const maxScore = Math.max(opts.leftScore, opts.rightScore);
    const isDecisive =
      opts.winner !== null ||
      maxScore >= opts.targetPoints - 1 ||
      (opts.leftScore >= opts.targetPoints - 2 && opts.rightScore >= opts.targetPoints - 2);
    if (isDecisive) {
      this.rallyHighlights.add('decisive_point');
      return true;
    }
    return false;
  }

  /**
   * Retorna os frames gravados no buffer circular em ordem cronológica (mais antigo -> mais recente).
   */
  public getOrderedFrames(windowSec: number = this.maxDurationSec): ReplayFrame[] {
    if (this.count === 0) return [];
    const maxWanted = Math.max(1, Math.min(this.count, Math.round(windowSec / this.fixedDt)));
    const frames: ReplayFrame[] = [];
    const oldestIndex = (this.writeIndex - this.count + this.capacity) % this.capacity;
    const startOffset = this.count - maxWanted;
    for (let i = startOffset; i < this.count; i++) {
      const slot = (oldestIndex + i) % this.capacity;
      const item = this.ringBuffer[slot];
      if (item) frames.push(item);
    }
    return frames;
  }

  /**
   * Interrompe a simulação física principal e inicia a reprodução do buffer gravado.
   */
  public beginPlayback(opts?: { slowMotion?: boolean; windowSec?: number }): boolean {
    if (opts?.slowMotion !== undefined) {
      this.slowMotion = opts.slowMotion;
    }
    const frames = this.getOrderedFrames(opts?.windowSec ?? this.maxDurationSec);
    if (frames.length < 2) {
      this.clearBuffer();
      return false;
    }

    if (this.rallyHighlights.has('super_attack')) {
      this.activeHighlightLabel = 'REPLAY · SUPER ATTACK';
    } else if (this.rallyHighlights.has('perfect_spike')) {
      this.activeHighlightLabel = 'REPLAY · CORTE PERFEITO';
    } else {
      this.activeHighlightLabel = 'REPLAY · PONTO DECISIVO';
    }

    this.playbackFrames = frames;
    this.playheadTime = 0;
    this.totalPlaybackDuration = (frames.length - 1) * this.fixedDt;
    const minSpeed = Math.max(0.2, this.slowMotion ? this.slowMoScale : 1.0);
    this.playbackStartWallMs = Date.now();
    this.maxPlaybackWallMs = Math.max(4000, Math.ceil((this.totalPlaybackDuration / minSpeed) * 1000) + 2500);
    this.status = 'playing';
    return true;
  }

  /**
   * Loop de reprodução: lê os dados gravados no buffer e interpola suavemente com suporte a câmera lenta.
   * Possui condição de saída garantida ao atingir o fim do buffer, dt inválido ou timeout em tempo real.
   */
  public advancePlayback(realDt: number): ReplayPlaybackStep {
    if (this.status !== 'playing' || this.playbackFrames.length < 2 || this.totalPlaybackDuration <= 0) {
      const last = this.playbackFrames[this.playbackFrames.length - 1] ?? null;
      const label = this.activeHighlightLabel;
      const speed = this.getPlaybackSpeed();
      this.finishAndClear();
      return {
        frame: last,
        finished: true,
        progress: 1,
        speed,
        highlightLabel: label,
      };
    }

    const speed = Math.max(0.1, this.getPlaybackSpeed());
    const safeDt = Number.isFinite(realDt) && realDt > 0 ? Math.min(realDt, 10.0) : this.fixedDt;
    this.playheadTime += safeDt * speed;

    const wallTimedOut =
      this.playbackStartWallMs > 0 && Date.now() - this.playbackStartWallMs >= this.maxPlaybackWallMs;

    if (!Number.isFinite(this.playheadTime) || this.playheadTime >= this.totalPlaybackDuration || wallTimedOut) {
      const finalFrame = this.playbackFrames[this.playbackFrames.length - 1] ?? null;
      const label = this.activeHighlightLabel;
      this.finishAndClear();
      return {
        frame: finalFrame,
        finished: true,
        progress: 1,
        speed,
        highlightLabel: label,
      };
    }

    const exactIdx = this.playheadTime / this.fixedDt;
    const idxA = Math.min(this.playbackFrames.length - 2, Math.max(0, Math.floor(exactIdx)));
    const idxB = Math.min(this.playbackFrames.length - 1, idxA + 1);
    const alpha = Math.max(0, Math.min(1, exactIdx - idxA));

    const a = this.playbackFrames[idxA];
    const b = this.playbackFrames[idxB];

    const quat = nlerpQuat(
      a.ball.rx,
      a.ball.ry,
      a.ball.rz,
      a.ball.rw,
      b.ball.rx,
      b.ball.ry,
      b.ball.rz,
      b.ball.rw,
      alpha,
    );

    const interpolatedPlayers: ReplayPlayerFrame[] = a.players.map((pa, idx) => {
      const pb = b.players[idx] ?? pa;
      return {
        id: pa.id,
        characterId: pa.characterId,
        team: pa.team,
        x: lerp(pa.x, pb.x, alpha),
        y: lerp(pa.y, pb.y, alpha),
        z: lerp(pa.z, pb.z, alpha),
        facingX: alpha < 0.5 ? pa.facingX : pb.facingX,
        facingZ: alpha < 0.5 ? pa.facingZ : pb.facingZ,
        anim: alpha < 0.5 ? pa.anim : pb.anim,
        animTimer: lerp(pa.animTimer, pb.animTimer, alpha),
        ultimateCharge: lerp(pa.ultimateCharge, pb.ultimateCharge, alpha),
        ultimateActiveTimer: lerp(pa.ultimateActiveTimer, pb.ultimateActiveTimer, alpha),
      };
    });

    const interpolatedFrame: ReplayFrame = {
      tick: Math.round(lerp(a.tick, b.tick, alpha)),
      dt: this.fixedDt,
      ball: {
        x: lerp(a.ball.x, b.ball.x, alpha),
        y: lerp(a.ball.y, b.ball.y, alpha),
        z: lerp(a.ball.z, b.ball.z, alpha),
        ...quat,
        activeUltimate: b.ball.activeUltimate ?? a.ball.activeUltimate,
      },
      players: interpolatedPlayers,
      callout: b.callout ?? a.callout,
    };

    const progress = this.totalPlaybackDuration > 0 ? this.playheadTime / this.totalPlaybackDuration : 1;

    return {
      frame: interpolatedFrame,
      finished: false,
      progress,
      speed,
      highlightLabel: this.activeHighlightLabel,
    };
  }

  public skipPlayback(): void {
    this.finishAndClear();
  }

  public finishAndClear(): void {
    this.clearBuffer();
  }

  public clearBuffer(): void {
    this.ringBuffer.fill(null);
    this.writeIndex = 0;
    this.count = 0;
    this.playbackFrames = [];
    this.playheadTime = 0;
    this.totalPlaybackDuration = 0;
    this.playbackStartWallMs = 0;
    this.maxPlaybackWallMs = 0;
    this.status = 'recording';
    this.rallyHighlights.clear();
  }
}
