/**
 * Spike Legends Online — Configuração Global do Jogo
 * Constantes compartilhadas entre Cliente, Física Rapier e Servidor Autoritativo.
 */

export type CharacterId = 'akira' | 'ren' | 'yuki' | 'hana' | 'kai';
export type ArenaId = 'ginasio' | 'praia' | 'escola' | 'neon' | 'montanha' | 'templo' | 'festival';
export type PrivateRoomMode = '1v1' | '2v2' | 'coop_2v2';
export type GameMode =
  | 'training'
  | 'training_spike'
  | 'training_receive'
  | 'ai'
  | 'campaign'
  | 'tournament'
  | '1v1'
  | '2v2'
  | 'coop_2v2'
  | 'private';
export type AiDifficulty = 'easy' | 'medium' | 'hard';
export type TeamSide = 'left' | 'right';
export type GameScreenState =
  | 'title'
  | 'menu'
  | 'campaign_vn'
  | 'tournament'
  | 'lobby'
  | 'guide'
  | 'playing'
  | 'paused'
  | 'gameover';
export type CharacterAnimState =
  | 'idle'
  | 'run'
  | 'jump'
  | 'dive'
  | 'preparing_serve'
  | 'serve_toss'
  | 'serve'
  | 'bump'
  | 'set'
  | 'spike'
  | 'shark_attack'
  | 'header'
  | 'block'
  | 'failed_bump'
  | 'stunned'
  | 'celebrate'
  | 'lose';
export type PlayerActionState =
  | 'idle'
  | 'move'
  | 'preparing_serve'
  | 'serve_toss'
  | 'serve'
  | 'bump'
  | 'set'
  | 'receive_ready'
  | 'slide_dive'
  | 'jump_charge'
  | 'airborne'
  | 'attack_windup'
  | 'spike'
  | 'shark_attack'
  | 'header'
  | 'block'
  | 'failed_bump'
  | 'stunned'
  | 'celebrate'
  | 'lose';
export type ServeType = 'float' | 'underhand' | 'jump_serve';
export type AimDirection = 'parallel' | 'diagonal' | 'dink';
export type ReceiveQuality = 'perfect' | 'good' | 'imprecise' | 'guard_break';
export type UltimateType = 'super_spike' | 'lightning_spike' | 'freeze_ball' | 'fire_ball' | 'wind_ball';

export interface CharacterStats {
  /** Multiplicador de velocidade e força do ataque (50 a 160) */
  attack: number;
  /** Raio de hitbox de recepção e resistência a Guard Break (50 a 160) */
  defense: number;
  /** Altura máxima do salto escalonado no eixo Y (50 a 160) */
  jump: number;
  /** Aceleração e velocidade máxima lateral com atrito na areia (50 a 160) */
  speed: number;
}

export interface DifficultyProfile {
  id: AiDifficulty;
  label: string;
  subtitle: string;
  /** Janela de tempo em ms para acertar Recepção Perfeita */
  perfectReceiveWindowMs: number;
  /** Tolerância da janela boa em ms */
  goodReceiveWindowMs: number;
  /** Atraso reativo de bloqueio da IA (s) */
  aiBlockReactionSec: number;
  /** IA lê posição do jogador para alternar largadinha x fundo */
  aiReadsDepth: boolean;
  /** Chance de usar saque viagem rápido */
  aiJumpServeChance: number;
  /** Chance de executar finta antes de atacar */
  aiFeintChance: number;
  /** Multiplicador de velocidade de ataque da IA */
  aiPowerMultiplier: number;
  /** Habilita mecânica de Guard Break em ataques >90% mal defendidos */
  guardBreakEnabled: boolean;
  /** Probabilidade de erro humano da IA (0.0 a 1.0) */
  aiErrorChance: number;
  /** Atraso de reação da IA a cortes rápidos (em segundos) */
  aiReactionDelaySec: number;
  /** Margem de erro posicional da IA (em metros) */
  aiErrorMargin: number;
  /** Taxa de sucesso de bloqueio da IA (Iniciante: 0.20, Avançado: 0.60, Classe Mundial: 0.90) */
  aiBlockSuccessRate: number;
  /** Multiplicador de velocidade de movimento da IA no eixo X */
  aiMoveSpeedMultiplier: number;
  /** Precisão dos cortes (spikes) da IA (0.0 a 1.0) */
  aiSpikePrecision: number;
}

export const DIFFICULTY_TUNING: Record<AiDifficulty, DifficultyProfile> = {
  easy: {
    id: 'easy',
    label: 'Iniciante',
    subtitle: 'ReactionDelay alto (0.85s), BlockSuccessRate 20%, velocidade reduzida e janela 500ms',
    perfectReceiveWindowMs: 500,
    goodReceiveWindowMs: 850,
    aiBlockReactionSec: 0.85,
    aiReadsDepth: false,
    aiJumpServeChance: 0,
    aiFeintChance: 0,
    aiPowerMultiplier: 0.78,
    guardBreakEnabled: false,
    aiErrorChance: 0.32,
    aiReactionDelaySec: 0.85,
    aiErrorMargin: 0.85,
    aiBlockSuccessRate: 0.2,
    aiMoveSpeedMultiplier: 0.72,
    aiSpikePrecision: 0.6,
  },
  medium: {
    id: 'medium',
    label: 'Avançado',
    subtitle: 'Status balanceados: ReactionDelay médio (0.5s), BlockSuccessRate 60% e janela 200ms',
    perfectReceiveWindowMs: 200,
    goodReceiveWindowMs: 420,
    aiBlockReactionSec: 0.5,
    aiReadsDepth: true,
    aiJumpServeChance: 0.55,
    aiFeintChance: 0.12,
    aiPowerMultiplier: 1.0,
    guardBreakEnabled: true,
    aiErrorChance: 0.25,
    aiReactionDelaySec: 0.5,
    aiErrorMargin: 0.52,
    aiBlockSuccessRate: 0.6,
    aiMoveSpeedMultiplier: 1.0,
    aiSpikePrecision: 0.8,
  },
  hard: {
    id: 'hard',
    label: 'Classe Mundial',
    subtitle: 'ReactionDelay quase zero (0.1s), BlockSuccessRate 90%, velocidade máxima e corte preciso',
    perfectReceiveWindowMs: 50,
    goodReceiveWindowMs: 180,
    aiBlockReactionSec: 0.1,
    aiReadsDepth: true,
    aiJumpServeChance: 0.85,
    aiFeintChance: 0.38,
    aiPowerMultiplier: 1.24,
    guardBreakEnabled: true,
    aiErrorChance: 0.12,
    aiReactionDelaySec: 0.1,
    aiErrorMargin: 0.22,
    aiBlockSuccessRate: 0.9,
    aiMoveSpeedMultiplier: 1.25,
    aiSpikePrecision: 0.96,
  },
};

export const COURT = {
  /** Largura total da quadra no eixo X (-12.5m a +12.5m — expandida em +25%) */
  WIDTH: 25,
  HALF_WIDTH: 12.5,
  /** Profundidade da quadra no eixo Z (-4.5m a +4.5m) */
  DEPTH: 9,
  HALF_DEPTH: 4.5,
  /** Altura oficial estilizada da rede (exatamente no centro x = 0) */
  NET_HEIGHT: 2.35,
  NET_THICKNESS: 0.16,
  NET_POST_HEIGHT: 2.65,
  /** Limites de contenção (teto e laterais proporcionais à quadra expandida) */
  WALL_HEIGHT: 20,
  OUT_MARGIN: 3.5,
  /** Barreira física mínima do centro da rede até a cápsula do jogador (proíbe invasão) */
  NET_BARRIER_HALF_X: 0.52,
} as const;

export const PHYSICS = {
  FIXED_DT: 1 / 60,
  GRAVITY: -22.5,
  /** Raio reduzido em ~20% (0.28 -> 0.225) com escala visual 0.8 e massa ajustada */
  BALL_RADIUS: 0.225,
  BALL_VISUAL_SCALE: 0.8,
  BALL_MASS: 0.22,
  BALL_RESTITUTION: 0.78,
  BALL_AIR_DRAG: 0.12,
  BALL_MAX_SPEED: 38,
  /** Velocidade base da bola no corte (Spike) antes de aplicar o multiplicador de Força do RPG */
  SPIKE_SPEED: 19.5,
  /** Multiplicador de força do Saque Viagem (Forçado) para compensar a quadra expandida de 25m */
  SERVE_FORCE_MULTIPLIER: 1.32,
  PLAYER_RADIUS: 0.44,
  PLAYER_HEIGHT: 1.45,
  PLAYER_WALK_SPEED: 7.4,
  PLAYER_SPRINT_MULT: 1.32,
  PLAYER_JUMP_VEL: 10.2,
  PLAYER_JUMP_HOLD_MAX: 0.18,
  PLAYER_JUMP_HOLD_BOOST: 3.4,
  PLAYER_DIVE_SPEED: 12.2,
  PLAYER_DIVE_DURATION: 0.36,
  PLAYER_HIT_REACH: 1.82,
  PLAYER_BLOCK_REACH: 1.65,
  HIT_COOLDOWN: 0.24,
  MAX_TOUCHES_PER_SIDE: 3,
  HITSTOP_PERFECT_SPIKE: 0.2,
  SHAKE_POWER_THRESHOLD: 0.8,
  GUARD_BREAK_THRESHOLD: 0.9,
  GUARD_BREAK_STUN_SEC: 2.0,
  SAND_ACCEL: 28,
  SAND_FRICTION: 12,
  COURT_ACCEL: 46,
  COURT_FRICTION: 20,
  ULTIMATE_GAIN_SPIKE: 28,
  ULTIMATE_GAIN_RECEIVE: 20,
  ULTIMATE_GAIN_BLOCK: 26,
  ULTIMATE_MAX: 100,
  /** Duração exata do modo Super Attack em segundos */
  SUPER_ATTACK_DURATION: 5.0,
  SUPER_ATTACK_ATK_MULT: 1.28,
  SUPER_ATTACK_JUMP_MULT: 1.16,
  SUPER_ATTACK_SPEED_MULT: 1.18,
} as const;

export const MATCH_RULES = {
  POINTS_TO_WIN: 15,
  ALT_POINTS_TO_WIN: 21,
  MIN_LEAD: 2,
  POINT_FREEZE_DELAY: 1.35,
  SERVE_HEIGHT: 2.2,
} as const;

export const ANTI_CHEAT = {
  /** Tolerância de deslocamento por tick no servidor para impedir teleporte */
  MAX_STEP_DISTANCE: 0.42,
  INPUT_MIN_INTERVAL_MS: 8,
  CHAT_MIN_INTERVAL_MS: 800,
  MAX_CHAT_LENGTH: 140,
} as const;

export interface RankTierInfo {
  id: string;
  name: string;
  minElo: number;
  color: string;
}

export const RANK_TIERS: RankTierInfo[] = [
  { id: 'bronze', name: 'Bronze', minElo: 0, color: '#CD7F32' },
  { id: 'prata', name: 'Prata', minElo: 900, color: '#CBD5E1' },
  { id: 'ouro', name: 'Ouro', minElo: 1100, color: '#FACC15' },
  { id: 'platina', name: 'Platina', minElo: 1350, color: '#2DD4BF' },
  { id: 'diamante', name: 'Diamante', minElo: 1650, color: '#38BDF8' },
  { id: 'mestre', name: 'Mestre', minElo: 1950, color: '#A855F7' },
  { id: 'lendario', name: 'Lendário', minElo: 2300, color: '#F97316' },
  { id: 'top_mundial', name: 'Top Mundial', minElo: 2700, color: '#EF4444' },
];

export const QUICK_CHAT_MESSAGES = [
  'Boa!',
  'GG',
  'Vamos!',
  'Quase!',
  'Excelente!',
  'Kkkkk',
  '🔥',
  '❤️',
  '😂',
  '👏',
  '👍',
] as const;
