/**
 * Spake Legend Arena — PlayerStatsManager & GameManager (Dificuldade + Atributos RPG + Economia)
 *
 * Responsabilidades:
 * 1. Gerenciar a variável global/estado `CurrentDifficulty` (Iniciante, Avançado, Classe Mundial)
 *    e fornecer os multiplicadores de IA para o `EnemyTeamManager` / `AIManager`.
 * 2. Gerenciar os atributos evolutivos de RPG do jogador:
 *    - Força (`attack`): impacta a velocidade/potência da bola no corte (Spike).
 *    - Salto (`jump`): impacta a altura do pulo no eixo Y (`jumpForce`).
 *    - Velocidade (`speed`): impacta a velocidade de movimento lateral no eixo X (`moveSpeed`).
 *    - Defesa (`defense`): impacta o raio de recepção e a resistência a Guard Break.
 * 3. Sincronizar a economia `PlayerCoins` e o progresso de RPG/Loja com `localStorage` (PlayerPrefs)
 *    e com o banco de dados Firestore (`/api/player-economy`).
 */
import {
  DIFFICULTY_TUNING,
  PHYSICS,
  type AiDifficulty,
  type CharacterStats,
  type DifficultyProfile,
} from '../config/gameConfig.ts';

export interface AiDifficultyBotMultipliers {
  difficulty: AiDifficulty;
  label: string;
  /** Tempo de atraso antes de reagir/saltar no bloqueio (em segundos) */
  reactionDelaySec: number;
  /** Taxa de sucesso no bloqueio (0.20 = 20%, 0.60 = 60%, 0.90 = 90%) */
  blockSuccessRate: number;
  /** Multiplicador de velocidade de deslocamento dos bots no eixo X */
  moveSpeedMultiplier: number;
  /** Multiplicador de potência e precisão dos cortes (Spikes) da IA */
  spikePowerMultiplier: number;
  /** Precisão de mira dos cortes da IA (0.0 a 1.0) */
  spikePrecision: number;
}

/**
 * Tabela oficial dos atributos internos da IA por nível de dificuldade:
 * - Iniciante ('easy'): ReactionDelay alto (0.85s), BlockSuccessRate de 20% (0.20), velocidade reduzida (0.72x).
 * - Avançado ('medium'): ReactionDelay médio (0.50s), BlockSuccessRate de 60% (0.60), velocidade normal (1.00x).
 * - Classe Mundial ('hard'): ReactionDelay quase zero (0.10s), BlockSuccessRate de 90% (0.90),
 *   velocidade máxima (1.25x) e alta precisão nos cortes (96%).
 */
export const AI_DIFFICULTY_BOT_MULTIPLIERS: Record<AiDifficulty, AiDifficultyBotMultipliers> = {
  easy: {
    difficulty: 'easy',
    label: 'Iniciante',
    reactionDelaySec: 0.85,
    blockSuccessRate: 0.2,
    moveSpeedMultiplier: 0.72,
    spikePowerMultiplier: 0.78,
    spikePrecision: 0.6,
  },
  medium: {
    difficulty: 'medium',
    label: 'Avançado',
    reactionDelaySec: 0.5,
    blockSuccessRate: 0.6,
    moveSpeedMultiplier: 1.0,
    spikePowerMultiplier: 1.0,
    spikePrecision: 0.8,
  },
  hard: {
    difficulty: 'hard',
    label: 'Classe Mundial',
    reactionDelaySec: 0.1,
    blockSuccessRate: 0.9,
    moveSpeedMultiplier: 1.25,
    spikePowerMultiplier: 1.24,
    spikePrecision: 0.96,
  },
};

export interface UserSessionAnalyticsIdentity {
  uid: string;
  displayName: string;
  email: string;
}

/**
 * GameManager central que armazena `CurrentDifficulty`, notifica a UI, o RoomManager e o AIManager,
 * e rastreia o Tempo de Sessão (Analytics) enviando para o Firestore ao pausar ou fechar o app.
 */
export class GameManager {
  public CurrentDifficulty: AiDifficulty = 'medium';
  private listeners = new Set<(difficulty: AiDifficulty) => void>();

  // Rastreamento de Tempo de Sessão (Analytics)
  private sessionStartTimeMs: number = Date.now();
  private accumulatedSessionSeconds = 0;
  private isSessionPaused = false;
  private currentIdentity: UserSessionAnalyticsIdentity = {
    uid: 'google_player_default',
    displayName: 'Atleta Google',
    email: 'atleta@playgames.google.com',
  };
  private lifecycleBound = false;

  constructor() {
    this.bindAppLifecycleEvents();
  }

  public setCurrentDifficulty(difficulty: AiDifficulty): AiDifficultyBotMultipliers {
    if (difficulty === 'easy' || difficulty === 'medium' || difficulty === 'hard') {
      this.CurrentDifficulty = difficulty;
      this.listeners.forEach((fn) => fn(this.CurrentDifficulty));
    }
    return this.getBotMultipliers(this.CurrentDifficulty);
  }

  public getCurrentDifficulty(): AiDifficulty {
    return this.CurrentDifficulty;
  }

  public getDifficultyProfile(difficulty: AiDifficulty = this.CurrentDifficulty): DifficultyProfile {
    return DIFFICULTY_TUNING[difficulty];
  }

  public getBotMultipliers(difficulty: AiDifficulty = this.CurrentDifficulty): AiDifficultyBotMultipliers {
    return AI_DIFFICULTY_BOT_MULTIPLIERS[difficulty] ?? AI_DIFFICULTY_BOT_MULTIPLIERS.medium;
  }

  public subscribe(listener: (difficulty: AiDifficulty) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * PRIORIDADE 1: Inicialização da Partida no GameManager (Start / StartMatch):
   * Invoca comando explícito para parar imediatamente a música de fundo (BGM),
   * deixando apenas o sfxAudioSource livre para tocar os efeitos sonoros da quadra (bola, apito, tênis).
   */
  public StartMatch(bgmAudioSource?: { readonly isPlaying: boolean; Stop: () => void } | null): void {
    if (bgmAudioSource != null && bgmAudioSource.isPlaying) {
      bgmAudioSource.Stop();
    }
  }

  /**
   * Define o usuário autenticado (Google / Play Games) para atribuição do Tempo de Sessão no Firestore.
   */
  public setSessionUserIdentity(identity: Partial<UserSessionAnalyticsIdentity>): void {
    if (identity.uid) this.currentIdentity.uid = identity.uid;
    if (identity.displayName) this.currentIdentity.displayName = identity.displayName;
    if (identity.email) this.currentIdentity.email = identity.email;
  }

  public getSessionUserIdentity(): UserSessionAnalyticsIdentity {
    return { ...this.currentIdentity };
  }

  /**
   * Retorna o tempo total da sessão atual em segundos.
   */
  public getCurrentSessionSeconds(nowMs = Date.now()): number {
    if (this.isSessionPaused) {
      return Math.max(1, Math.round(this.accumulatedSessionSeconds));
    }
    const elapsedSec = Math.max(0, (nowMs - this.sessionStartTimeMs) / 1000);
    return Math.max(1, Math.round(this.accumulatedSessionSeconds + elapsedSec));
  }

  /**
   * Envia o delta de tempo de sessão para o Firestore (`/api/analytics/session` -> `analyticsUsers/{uid}`)
   * quando o aplicativo é pausado (`OnApplicationPause`), fechado (`OnApplicationQuit` / `pagehide`)
   * ou ao concluir uma partida.
   */
  public async flushSessionToFirestore(
    options?: { matchesPlayedDelta?: number; useBeacon?: boolean },
    nowMs = Date.now(),
  ): Promise<number> {
    const elapsedSec = this.isSessionPaused
      ? 0
      : Math.max(0, (nowMs - this.sessionStartTimeMs) / 1000);
    const totalToFlush = Math.max(1, Math.round(this.accumulatedSessionSeconds + elapsedSec));

    // Reinicia o marcador para evitar contagem duplicada no próximo flush
    this.accumulatedSessionSeconds = 0;
    this.sessionStartTimeMs = nowMs;

    const payload = {
      uid: this.currentIdentity.uid,
      displayName: this.currentIdentity.displayName,
      email: this.currentIdentity.email,
      sessionSeconds: totalToFlush,
      matchesPlayedDelta: options?.matchesPlayedDelta ?? 0,
    };

    if (
      options?.useBeacon &&
      typeof navigator !== 'undefined' &&
      typeof navigator.sendBeacon === 'function'
    ) {
      try {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        navigator.sendBeacon('/api/analytics/session', blob);
        return totalToFlush;
      } catch {
        // Continua para fetch keepalive
      }
    }

    if (typeof fetch === 'function' && typeof window !== 'undefined') {
      try {
        await fetch('/api/analytics/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        });
      } catch {
        // Ignora erro de rede offline
      }
    }

    return totalToFlush;
  }

  /**
   * Equivalente Web/Mobile ao `OnApplicationPause(bool pauseStatus)` e `OnApplicationQuit()` da Unity.
   */
  private bindAppLifecycleEvents(): void {
    if (this.lifecycleBound || typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    this.lifecycleBound = true;

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        const now = Date.now();
        this.accumulatedSessionSeconds += Math.max(0, (now - this.sessionStartTimeMs) / 1000);
        this.isSessionPaused = true;
        void this.flushSessionToFirestore({ useBeacon: true }, now);
      } else if (document.visibilityState === 'visible') {
        this.sessionStartTimeMs = Date.now();
        this.isSessionPaused = false;
      }
    });

    window.addEventListener('pagehide', () => {
      void this.flushSessionToFirestore({ useBeacon: true }, Date.now());
    });

    window.addEventListener('beforeunload', () => {
      void this.flushSessionToFirestore({ useBeacon: true }, Date.now());
    });
  }
}

export const gameManager = new GameManager();

export interface RpgAttributeLevels {
  /** Nível de Força (impacta a velocidade da bola no corte) */
  attack: number;
  /** Nível de Defesa (impacta o raio de recepção e postura) */
  defense: number;
  /** Nível de Salto (impacta a altura do pulo no eixo Y) */
  jump: number;
  /** Nível de Velocidade (impacta o movimento lateral no eixo X) */
  speed: number;
}

export type RpgStatLevels = RpgAttributeLevels;

export interface ComputedPlayerPhysicsMultipliers {
  /** Multiplicador de Força aplicado à velocidade da bola no corte (Spike) */
  spikeForceMultiplier: number;
  /** Multiplicador de Salto aplicado ao jumpForce no eixo Y */
  jumpForceMultiplier: number;
  /** Multiplicador de Velocidade aplicado ao moveSpeed no eixo X */
  moveSpeedMultiplier: number;
  /** Velocidade escalada final de caminhada no eixo X (m/s) */
  effectiveMoveSpeed: number;
  /** Impulso vertical escalado final de salto no eixo Y (m/s) */
  effectiveJumpForce: number;
  /** Velocidade base escalada da bola no corte (m/s) */
  effectiveSpikeBallSpeed: number;
}

/**
 * PlayerStatsManager: gerencia os níveis de evolução de RPG do jogador (Força, Salto, Velocidade, Defesa)
 * e converte esses níveis em multiplicadores físicos reais lidos pelo `PlayerController`.
 */
export class PlayerStatsManager {
  public levels: RpgAttributeLevels = {
    attack: 1,
    defense: 1,
    jump: 1,
    speed: 1,
  };

  public baseStats: CharacterStats = {
    attack: 100,
    defense: 100,
    jump: 100,
    speed: 100,
  };

  constructor(
    baseStats?: Partial<CharacterStats>,
    initialLevels?: Partial<RpgAttributeLevels>,
  ) {
    if (baseStats) {
      this.setBaseStats(baseStats);
    }
    if (initialLevels) {
      this.levels = {
        attack: Math.max(1, initialLevels.attack ?? 1),
        defense: Math.max(1, initialLevels.defense ?? 1),
        jump: Math.max(1, initialLevels.jump ?? 1),
        speed: Math.max(1, initialLevels.speed ?? 1),
      };
    }
  }

  public setBaseStats(baseStats: Partial<CharacterStats>): void {
    this.baseStats = {
      attack: baseStats.attack ?? 100,
      defense: baseStats.defense ?? 100,
      jump: baseStats.jump ?? 100,
      speed: baseStats.speed ?? 100,
    };
  }

  public getLevels(): RpgAttributeLevels {
    return { ...this.levels };
  }

  /**
   * Converte a contagem de melhorias compradas na Loja (0..10) em Nível do Atributo (1..11).
   */
  public setUpgradeCounts(upgrades: Partial<RpgAttributeLevels>): void {
    this.levels = {
      attack: Math.max(1, 1 + (upgrades.attack ?? 0)),
      defense: Math.max(1, 1 + (upgrades.defense ?? 0)),
      jump: Math.max(1, 1 + (upgrades.jump ?? 0)),
      speed: Math.max(1, 1 + (upgrades.speed ?? 0)),
    };
  }

  /**
   * Retorna os atributos efetivos (baseStats + +6 por nível de upgrade acima do nível 1).
   */
  public getEffectiveStats(): CharacterStats {
    return {
      attack: Math.min(160, this.baseStats.attack + (this.levels.attack - 1) * 6),
      defense: Math.min(160, this.baseStats.defense + (this.levels.defense - 1) * 6),
      jump: Math.min(160, this.baseStats.jump + (this.levels.jump - 1) * 6),
      speed: Math.min(160, this.baseStats.speed + (this.levels.speed - 1) * 6),
    };
  }

  /**
   * Calcula os multiplicadores físicos reais a partir dos atributos e níveis de RPG:
   * - Força (`attack`): aumenta a velocidade da bola no corte (`spikeForceMultiplier`).
   * - Salto (`jump`): aumenta a altura do pulo no eixo Y (`jumpForceMultiplier`).
   * - Velocidade (`speed`): aumenta a velocidade de movimento no eixo X (`moveSpeedMultiplier`).
   */
  public computePhysicsMultipliers(stats: CharacterStats = this.getEffectiveStats()): ComputedPlayerPhysicsMultipliers {
    const spikeForceMultiplier = 0.72 + (stats.attack / 100) * 0.28;
    const jumpForceMultiplier = 0.84 + (stats.jump / 100) * 0.16;
    const moveSpeedMultiplier = 0.78 + (stats.speed / 100) * 0.22;

    return {
      spikeForceMultiplier,
      jumpForceMultiplier,
      moveSpeedMultiplier,
      effectiveMoveSpeed: Number((PHYSICS.PLAYER_WALK_SPEED * moveSpeedMultiplier).toFixed(2)),
      effectiveJumpForce: Number((PHYSICS.PLAYER_JUMP_VEL * jumpForceMultiplier).toFixed(2)),
      effectiveSpikeBallSpeed: Number((PHYSICS.SPIKE_SPEED * spikeForceMultiplier).toFixed(2)),
    };
  }
}

export const playerStatsManager = new PlayerStatsManager();

