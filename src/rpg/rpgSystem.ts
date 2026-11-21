/**
 * Spike Legends Online — Motor RPG, Gacha, Upgrades, Economia Dupla (Spike Coins & Volley Gems / Diamantes),
 * Loja Beta Fictícia (Recarga "GRÁTIS NO BETA", Caixas Gacha, Skins/Uniformes, Bolas/Rastros),
 * Missões Rápidas de Beta e Liga Mata-Mata.
 * 100% puro e testável com persistência local + Firestore por UID de jogador.
 */
import type { AiDifficulty, ArenaId, CharacterId, CharacterStats } from '../config/gameConfig.ts';

export type AthleteRarity = 'Comum' | 'Raro' | 'Épico' | 'Lendário';
export type CurrencyType = 'coins' | 'gems';

export interface RpgAthleteCard {
  cardId: string;
  baseCharacterId: CharacterId;
  name: string;
  title: string;
  rarity: AthleteRarity;
  specialty: string;
  baseStats: CharacterStats;
}

export interface OwnedAthleteProgress {
  cardId: string;
  level: number;
  copies: number;
  upgrades: {
    attack: number;
    defense: number;
    jump: number;
    speed: number;
  };
}

export interface CampaignDialogLine {
  speaker: string;
  characterId: CharacterId;
  side: 'left' | 'right';
  mood: string;
  text: string;
}

export interface CampaignChapter {
  chapterNumber: number;
  id: string;
  title: string;
  subtitle: string;
  arenaId: ArenaId;
  difficulty: AiDifficulty;
  opponentName: string;
  opponentCharacterId: CharacterId;
  opponentStats: CharacterStats;
  rewardCoins: number;
  unlockArenaId: ArenaId;
  unlockCardId?: string;
  dialogs: CampaignDialogLine[];
}

export interface TournamentMatchNode {
  id: string;
  round: 'quartas' | 'semi' | 'final';
  teamA: { name: string; characterId: CharacterId; isPlayer: boolean };
  teamB: { name: string; characterId: CharacterId; isPlayer: boolean };
  winner: 'A' | 'B' | null;
}

export interface TournamentState {
  id: string;
  difficulty: AiDifficulty;
  arenaId: ArenaId;
  currentRound: 'quartas' | 'semi' | 'final' | 'completed';
  eliminated: boolean;
  championName: string | null;
  rewardClaimed: boolean;
  matches: TournamentMatchNode[];
}

export type ShopItemCategory = 'ball_color' | 'outfit';

export interface ShopCosmeticItem {
  id: string;
  name: string;
  category: ShopItemCategory;
  cost: number;
  currency: CurrencyType;
  rarity: AthleteRarity;
  previewHex: string;
  secondaryHex?: string;
  accentHex?: string;
  trailHex?: string;
  description: string;
}

export interface DiamondRechargePack {
  id: string;
  name: string;
  gemsAmount: number;
  bonusLabel: string;
  fictionalOriginalPrice: string;
  badgeText: string;
  popular?: boolean;
}

export const DIAMOND_RECHARGE_PACKS: DiamondRechargePack[] = [
  {
    id: 'pack_100',
    name: 'Punhado de Diamantes',
    gemsAmount: 100,
    bonusLabel: 'Pacote Inicial Beta',
    fictionalOriginalPrice: 'R$ 4,90',
    badgeText: 'GRÁTIS NO BETA',
  },
  {
    id: 'pack_500',
    name: 'Saco de Diamantes',
    gemsAmount: 500,
    bonusLabel: '+10% Bônus Beta',
    fictionalOriginalPrice: 'R$ 19,90',
    badgeText: 'GRÁTIS NO BETA',
    popular: true,
  },
  {
    id: 'pack_1200',
    name: 'Baú de Diamantes',
    gemsAmount: 1200,
    bonusLabel: '+25% Bônus Beta',
    fictionalOriginalPrice: 'R$ 39,90',
    badgeText: 'GRÁTIS NO BETA',
  },
  {
    id: 'pack_5000',
    name: 'Cofre Supremo Lenda',
    gemsAmount: 5000,
    bonusLabel: 'Melhor Valor • VIP Beta',
    fictionalOriginalPrice: 'R$ 149,90',
    badgeText: 'GRÁTIS NO BETA',
  },
];

export interface BetaGachaBoxTier {
  id: 'box_common' | 'box_epic' | 'box_legendary';
  name: string;
  subtitle: string;
  cost: number;
  currency: CurrencyType;
  guaranteedMinRarity: AthleteRarity;
  accentHex: string;
  oddsLabel: string;
}

export const BETA_GACHA_BOXES: BetaGachaBoxTier[] = [
  {
    id: 'box_common',
    name: 'Caixa Comum',
    subtitle: 'Suprimentos de Quadra & Cosméticos Básicos',
    cost: 150,
    currency: 'coins',
    guaranteedMinRarity: 'Comum',
    accentHex: '#38BDF8',
    oddsLabel: '60% Comum • 28% Raro • 10% Épico • 2% Lendário',
  },
  {
    id: 'box_epic',
    name: 'Caixa Épica',
    subtitle: 'Uniformes Especiais, Bolas com Rastro & Atletas',
    cost: 120,
    currency: 'gems',
    guaranteedMinRarity: 'Raro',
    accentHex: '#A855F7',
    oddsLabel: '45% Raro • 42% Épico • 13% Lendário',
  },
  {
    id: 'box_legendary',
    name: 'Caixa Lendária',
    subtitle: 'Relíquias Douradas, Rastros Supremos & Lendas Classe S',
    cost: 350,
    currency: 'gems',
    guaranteedMinRarity: 'Épico',
    accentHex: '#FACC15',
    oddsLabel: '55% Épico • 45% Lendário Garantido+',
  },
];

export const SHOP_ITEMS: ShopCosmeticItem[] = [
  // ================= BOLAS E RASTROS (TRAILS) =================
  {
    id: 'ball_classic',
    name: 'Bola Oficial Pro',
    category: 'ball_color',
    cost: 0,
    currency: 'coins',
    rarity: 'Comum',
    previewHex: '#FACC15',
    secondaryHex: '#2563EB',
    trailHex: '#FACC15',
    description: 'Bola oficial amarela e azul do circuito competitivo.',
  },
  {
    id: 'ball_fire',
    name: 'Bola Fogo Solar',
    category: 'ball_color',
    cost: 220,
    currency: 'coins',
    rarity: 'Raro',
    previewHex: '#FF4500',
    secondaryHex: '#F97316',
    trailHex: '#FF5500',
    description: 'Esfera térmica que deixa um rastro de chamas incandescentes ao cortar.',
  },
  {
    id: 'ball_blue_lightning',
    name: 'Bola Raio Azul',
    category: 'ball_color',
    cost: 260,
    currency: 'coins',
    rarity: 'Épico',
    previewHex: '#00E5FF',
    secondaryHex: '#0284C7',
    trailHex: '#00E5FF',
    description: 'Carregada com alta voltagem para saques viagem com rastro elétrico azul.',
  },
  {
    id: 'ball_galaxy',
    name: 'Bola Galáxia Cósmica',
    category: 'ball_color',
    cost: 160,
    currency: 'gems',
    rarity: 'Épico',
    previewHex: '#C084FC',
    secondaryHex: '#4C1D95',
    trailHex: '#D946EF',
    description: 'Núcleo nebular que projeta uma cauda estelar violeta durante o corte.',
  },
  {
    id: 'ball_gold',
    name: 'Bola Ouro Supremo',
    category: 'ball_color',
    cost: 280,
    currency: 'gems',
    rarity: 'Lendário',
    previewHex: '#FDE047',
    secondaryHex: '#CA8A04',
    trailHex: '#FACC15',
    description: 'Relíquia banhada a ouro 24k com rastro reluzente de campeão mundial.',
  },
  // Mantidos para retrocompatibilidade com testes e saves existentes
  {
    id: 'ball_crimson_flare',
    name: 'Bola Labareda Solar',
    category: 'ball_color',
    cost: 150,
    currency: 'coins',
    rarity: 'Raro',
    previewHex: '#FF4D4D',
    secondaryHex: '#F97316',
    trailHex: '#FF4D4D',
    description: 'Revestimento rubro incandescente para cortes de alta velocidade.',
  },
  {
    id: 'ball_neon_plasma',
    name: 'Bola Plasma Ciano',
    category: 'ball_color',
    cost: 200,
    currency: 'coins',
    rarity: 'Épico',
    previewHex: '#00F5D4',
    secondaryHex: '#7C3AED',
    trailHex: '#00F5D4',
    description: 'Brilho neon de alto contraste ideal para arenas noturnas.',
  },
  {
    id: 'ball_royal_gold',
    name: 'Bola Ouro Classe Mundial',
    category: 'ball_color',
    cost: 300,
    currency: 'coins',
    rarity: 'Lendário',
    previewHex: '#FDE047',
    secondaryHex: '#B45309',
    trailHex: '#FDE047',
    description: 'Edição dourada dos campeões da Liga Mundial.',
  },

  // ================= SKINS E UNIFORMES =================
  {
    id: 'outfit_default',
    name: 'Uniforme Tradicional',
    category: 'outfit',
    cost: 0,
    currency: 'coins',
    rarity: 'Comum',
    previewHex: '#F97316',
    secondaryHex: '#1E293B',
    accentHex: '#FFFFFF',
    description: 'Uniforme titular clássico da equipe Spake Legend.',
  },
  {
    id: 'outfit_neon_cyber',
    name: 'Uniforme Neon Cyber',
    category: 'outfit',
    cost: 240,
    currency: 'coins',
    rarity: 'Raro',
    previewHex: '#06B6D4',
    secondaryHex: '#0F172A',
    accentHex: '#F43F5E',
    description: 'Fibra sintética cyberpunk com linhas eletroluminescentes de Tóquio.',
  },
  {
    id: 'outfit_samurai',
    name: 'Armadura Samurai Rubra',
    category: 'outfit',
    cost: 320,
    currency: 'coins',
    rarity: 'Épico',
    previewHex: '#DC2626',
    secondaryHex: '#18181B',
    accentHex: '#FACC15',
    description: 'Manto inspirado nos guerreiros feudais com detalhes carmesim e ouro.',
  },
  {
    id: 'outfit_selecao_ouro',
    name: 'Manto Seleção Ouro',
    category: 'outfit',
    cost: 180,
    currency: 'gems',
    rarity: 'Épico',
    previewHex: '#FACC15',
    secondaryHex: '#15803D',
    accentHex: '#1D4ED8',
    description: 'Uniforme oficial canarinho dos campeões mundiais de vôlei.',
  },
  {
    id: 'outfit_fundador_beta',
    name: 'Traje Fundador Beta',
    category: 'outfit',
    cost: 260,
    currency: 'gems',
    rarity: 'Lendário',
    previewHex: '#A855F7',
    secondaryHex: '#090D16',
    accentHex: '#FDE047',
    description: 'Edição limitada exclusiva para os jogadores pioneiros do Beta Teste.',
  },
  // Mantidos para retrocompatibilidade
  {
    id: 'outfit_cyber_emerald',
    name: 'Manto Esmeralda Neon',
    category: 'outfit',
    cost: 180,
    currency: 'coins',
    rarity: 'Raro',
    previewHex: '#10B981',
    secondaryHex: '#064E3B',
    accentHex: '#A7F3D0',
    description: 'Tecido ultraleve com faixas reflexivas.',
  },
  {
    id: 'outfit_imperial_gold',
    name: 'Armadura Imperial Dourada',
    category: 'outfit',
    cost: 280,
    currency: 'coins',
    rarity: 'Lendário',
    previewHex: '#EAB308',
    secondaryHex: '#422006',
    accentHex: '#FEF08A',
    description: 'Traje de gala dos mestres da Classe Mundial.',
  },
];

export interface BetaMissionDefinition {
  id: 'mission_play_1' | 'mission_win_2' | 'mission_points_3';
  title: string;
  target: number;
  rewardCoins: number;
  rewardGems: number;
}

export const BETA_MISSIONS: BetaMissionDefinition[] = [
  {
    id: 'mission_play_1',
    title: 'Jogue 1 partida',
    target: 1,
    rewardCoins: 150,
    rewardGems: 60,
  },
  {
    id: 'mission_win_2',
    title: 'Vença 2 partidas',
    target: 2,
    rewardCoins: 300,
    rewardGems: 120,
  },
  {
    id: 'mission_points_3',
    title: 'Faça 3 saques/pontos',
    target: 3,
    rewardCoins: 200,
    rewardGems: 80,
  },
];

export interface BetaMissionProgress {
  progress: number;
  claimed: boolean;
}

export interface PlayerRpgSave {
  coins: number;
  gems: number;
  activeCardId: string;
  ownedCards: Record<string, OwnedAthleteProgress>;
  unlockedArenas: ArenaId[];
  completedChapters: string[];
  pityCounter: number;
  activeTournament: TournamentState | null;
  unlockedShopItems?: string[];
  equippedBallId?: string;
  equippedBallColor?: string;
  equippedBallTrailColor?: string;
  equippedOutfitId?: string;
  betaMissions?: Record<string, BetaMissionProgress>;
  betaFeedbackClaimed?: boolean;
}

export const GACHA_COST = 120;
export const UPGRADE_BASE_COST = 100;
export const UPGRADE_STEP = 6;
export const MAX_STAT_UPGRADES = 10;
export const BETA_FEEDBACK_GEM_REWARD = 500;

export const RARITY_COLORS: Record<AthleteRarity, { bg: string; border: string; text: string }> = {
  Comum: { bg: '#334155', border: '#94A3B8', text: '#E2E8F0' },
  Raro: { bg: '#0C4A6E', border: '#38BDF8', text: '#7DD3FC' },
  Épico: { bg: '#4C1D95', border: '#A855F7', text: '#D8B4FE' },
  Lendário: { bg: '#7C2D12', border: '#FACC15', text: '#FDE047' },
};

export const ATHLETE_CATALOG: RpgAthleteCard[] = [
  {
    cardId: 'akira_starter',
    baseCharacterId: 'akira',
    name: 'Akira Asa Laranja',
    title: 'Atacante Principal',
    rarity: 'Comum',
    specialty: 'Salto Rápido & Super Spike',
    baseStats: { attack: 98, defense: 92, jump: 104, speed: 102 },
  },
  {
    cardId: 'kai_beach',
    baseCharacterId: 'kai',
    name: 'Kai Rei da Areia',
    title: 'Craque do Futevôlei',
    rarity: 'Raro',
    specialty: 'Shark Attack na Areia',
    baseStats: { attack: 106, defense: 96, jump: 102, speed: 110 },
  },
  {
    cardId: 'ren_tactician',
    baseCharacterId: 'ren',
    name: 'Ren Estrategista',
    title: 'Maestro do Levantamento',
    rarity: 'Raro',
    specialty: 'Recepção Cirúrgica & Tempo e Meia',
    baseStats: { attack: 96, defense: 112, jump: 100, speed: 104 },
  },
  {
    cardId: 'hana_comet',
    baseCharacterId: 'hana',
    name: 'Hana Cometa',
    title: 'Líbero Acrobática',
    rarity: 'Épico',
    specialty: 'Peixinho Extremo & Defesa Expansiva',
    baseStats: { attack: 102, defense: 124, jump: 108, speed: 118 },
  },
  {
    cardId: 'yuki_glacier',
    baseCharacterId: 'yuki',
    name: 'Yuki Muralha Glacial',
    title: 'Bloqueio Impenetrável',
    rarity: 'Épico',
    specialty: 'Bloqueio Alto & Guard Break',
    baseStats: { attack: 116, defense: 118, jump: 120, speed: 98 },
  },
  {
    cardId: 'akira_awakened',
    baseCharacterId: 'akira',
    name: 'Akira Despertar Solar',
    title: 'Lenda Nacional',
    rarity: 'Lendário',
    specialty: 'Cortada Supersônica & Salto Supremo',
    baseStats: { attack: 132, defense: 112, jump: 134, speed: 124 },
  },
  {
    cardId: 'kai_shark_legend',
    baseCharacterId: 'kai',
    name: 'Kai Tubarão Dourado',
    title: 'Campeão Mundial de Areia',
    rarity: 'Lendário',
    specialty: 'Shark Attack Letal & Reflexo Zero',
    baseStats: { attack: 130, defense: 120, jump: 126, speed: 132 },
  },
  {
    cardId: 'yuki_boss',
    baseCharacterId: 'yuki',
    name: 'Yuki Imperador Classe S',
    title: 'Boss da Liga Mundial',
    rarity: 'Lendário',
    specialty: 'Saque Viagem Projétil & Bloqueio Preditivo',
    baseStats: { attack: 136, defense: 126, jump: 132, speed: 118 },
  },
];

export const CAMPAIGN_CHAPTERS: CampaignChapter[] = [
  {
    chapterNumber: 1,
    id: 'cap_1_praia',
    title: 'Capítulo 1: Areia Escaldante',
    subtitle: 'Primeiro duelo de Futevôlei na Praia Ensolarada',
    arenaId: 'praia',
    difficulty: 'easy',
    opponentName: 'Kai da Praia',
    opponentCharacterId: 'kai',
    opponentStats: { attack: 88, defense: 86, jump: 90, speed: 92 },
    rewardCoins: 180,
    unlockArenaId: 'escola',
    unlockCardId: 'kai_beach',
    dialogs: [
      {
        speaker: 'Akira',
        characterId: 'akira',
        side: 'left',
        mood: 'Determinado',
        text: 'A areia puxa os pés, mas minha impulsionada não perde para ninguém! Vamos começar a jornada!',
      },
      {
        speaker: 'Kai',
        characterId: 'kai',
        side: 'right',
        mood: 'Confiante',
        text: 'Bem-vindo ao futevôlei de praia, novato! Segure o salto para ajustar a altura e prepare o Shark Attack!',
      },
      {
        speaker: 'Akira',
        characterId: 'akira',
        side: 'left',
        mood: 'Empolgado',
        text: 'Fechado! Vou acertar o timing perfeito da recepção e cravar a bola na diagonal!',
      },
    ],
  },
  {
    chapterNumber: 2,
    id: 'cap_2_escola',
    title: 'Capítulo 2: Pátio das Cerejeiras',
    subtitle: 'O duelo tático contra o levantador Ren',
    arenaId: 'escola',
    difficulty: 'easy',
    opponentName: 'Ren Estrategista',
    opponentCharacterId: 'ren',
    opponentStats: { attack: 94, defense: 98, jump: 94, speed: 96 },
    rewardCoins: 220,
    unlockArenaId: 'ginasio',
    unlockCardId: 'ren_tactician',
    dialogs: [
      {
        speaker: 'Ren',
        characterId: 'ren',
        side: 'right',
        mood: 'Analítico',
        text: 'Seus ângulos de ataque estão previsíveis, Akira. Se o levantador variar em tempo e meia, você consegue acompanhar?',
      },
      {
        speaker: 'Akira',
        characterId: 'akira',
        side: 'left',
        mood: 'Focado',
        text: 'Vou ler cada levantamento e usar a largadinha quando o bloqueio subir cedo!',
      },
    ],
  },
  {
    chapterNumber: 3,
    id: 'cap_3_ginasio',
    title: 'Capítulo 3: Torneio Intercolegial',
    subtitle: 'Velocidade extrema contra Hana Cometa',
    arenaId: 'ginasio',
    difficulty: 'medium',
    opponentName: 'Hana Cometa',
    opponentCharacterId: 'hana',
    opponentStats: { attack: 106, defense: 112, jump: 108, speed: 114 },
    rewardCoins: 280,
    unlockArenaId: 'neon',
    unlockCardId: 'hana_comet',
    dialogs: [
      {
        speaker: 'Hana',
        characterId: 'hana',
        side: 'right',
        mood: 'Elétrica',
        text: 'Nenhuma bola cai no meu lado! E cuidado: se você recuar demais, vou soltar uma largadinha na frente da rede!',
      },
      {
        speaker: 'Akira',
        characterId: 'akira',
        side: 'left',
        mood: 'Sério',
        text: 'A janela de recepção perfeita ficou bem menor... Preciso de reflexos de aço e peixinho no limite!',
      },
    ],
  },
  {
    chapterNumber: 4,
    id: 'cap_4_neon',
    title: 'Capítulo 4: Noite Neon',
    subtitle: 'Saques viagem relâmpago no terraço de Tóquio',
    arenaId: 'neon',
    difficulty: 'medium',
    opponentName: 'Kai Neon',
    opponentCharacterId: 'kai',
    opponentStats: { attack: 118, defense: 112, jump: 116, speed: 120 },
    rewardCoins: 340,
    unlockArenaId: 'templo',
    dialogs: [
      {
        speaker: 'Kai',
        characterId: 'kai',
        side: 'right',
        mood: 'Intenso',
        text: 'Hora dos saques viagem com salto! Se errar o tempo da recepção, a bola vai espirrar para longe!',
      },
      {
        speaker: 'Akira',
        characterId: 'akira',
        side: 'left',
        mood: 'Chamas',
        text: 'Pode mandar com força total! No ápice do salto o meu Corte Perfeito para o tempo!',
      },
    ],
  },
  {
    chapterNumber: 5,
    id: 'cap_5_boss',
    title: 'Capítulo Final: Muralha Classe Mundial',
    subtitle: 'Enfrente o Boss Yuki sob as lanternas do Festival',
    arenaId: 'festival',
    difficulty: 'hard',
    opponentName: 'Yuki (Classe Mundial)',
    opponentCharacterId: 'yuki',
    opponentStats: { attack: 134, defense: 126, jump: 130, speed: 118 },
    rewardCoins: 550,
    unlockArenaId: 'montanha',
    unlockCardId: 'yuki_glacier',
    dialogs: [
      {
        speaker: 'Yuki',
        characterId: 'yuki',
        side: 'right',
        mood: 'Implacável',
        text: 'Classe Mundial não perdoa bloqueios atrasados. Um golpe acima de 90% vai quebrar sua guarda por 2 segundos inteiros!',
      },
      {
        speaker: 'Akira',
        characterId: 'akira',
        side: 'left',
        mood: 'Lendário',
        text: 'Janela de 50ms e Guard Break? É tudo o que eu queria! Vamos decidir quem é a Lenda da Quadra!',
      },
    ],
  },
];

export function getAthleteCard(cardId: string): RpgAthleteCard {
  return ATHLETE_CATALOG.find((c) => c.cardId === cardId) ?? ATHLETE_CATALOG[0];
}

export function getShopItemById(itemId?: string): ShopCosmeticItem | undefined {
  if (!itemId) return undefined;
  return SHOP_ITEMS.find((x) => x.id === itemId);
}

export function computeEffectiveStats(card: RpgAthleteCard, progress?: OwnedAthleteProgress): CharacterStats {
  const levelBonus = progress ? (progress.level - 1) * 2 : 0;
  const upg = progress?.upgrades ?? { attack: 0, defense: 0, jump: 0, speed: 0 };
  return {
    attack: Math.min(160, card.baseStats.attack + levelBonus + upg.attack * UPGRADE_STEP),
    defense: Math.min(160, card.baseStats.defense + levelBonus + upg.defense * UPGRADE_STEP),
    jump: Math.min(160, card.baseStats.jump + levelBonus + upg.jump * UPGRADE_STEP),
    speed: Math.min(160, card.baseStats.speed + levelBonus + upg.speed * UPGRADE_STEP),
  };
}

export function getStatUpgradeCost(currentUpgradeCount: number): number {
  return UPGRADE_BASE_COST + currentUpgradeCount * 35;
}

export function createInitialBetaMissions(): Record<string, BetaMissionProgress> {
  return {
    mission_play_1: { progress: 0, claimed: false },
    mission_win_2: { progress: 0, claimed: false },
    mission_points_3: { progress: 0, claimed: false },
  };
}

export function createInitialRpgSave(): PlayerRpgSave {
  return {
    coins: 450,
    gems: 250,
    activeCardId: 'akira_starter',
    ownedCards: {
      akira_starter: {
        cardId: 'akira_starter',
        level: 1,
        copies: 1,
        upgrades: { attack: 0, defense: 0, jump: 0, speed: 0 },
      },
      kai_beach: {
        cardId: 'kai_beach',
        level: 1,
        copies: 1,
        upgrades: { attack: 0, defense: 0, jump: 0, speed: 0 },
      },
    },
    unlockedArenas: ['praia', 'ginasio'],
    completedChapters: [],
    pityCounter: 0,
    activeTournament: null,
    unlockedShopItems: ['ball_classic', 'outfit_default'],
    equippedBallId: 'ball_classic',
    equippedBallColor: '#FACC15',
    equippedBallTrailColor: '#FACC15',
    equippedOutfitId: 'outfit_default',
    betaMissions: createInitialBetaMissions(),
    betaFeedbackClaimed: false,
  };
}

const RPG_STORAGE_PREFIX = 'spike_legends_rpg_v1_';

export function loadRpgSave(uid: string): PlayerRpgSave {
  try {
    if (typeof localStorage === 'undefined') return createInitialRpgSave();
    const raw = localStorage.getItem(`${RPG_STORAGE_PREFIX}${uid}`);
    if (!raw) {
      const fresh = createInitialRpgSave();
      saveRpgSave(uid, fresh);
      return fresh;
    }
    const parsed = JSON.parse(raw) as PlayerRpgSave;
    if (!parsed || !parsed.ownedCards || !parsed.activeCardId) {
      return createInitialRpgSave();
    }
    const base = createInitialRpgSave();
    return {
      ...base,
      ...parsed,
      gems: typeof parsed.gems === 'number' ? parsed.gems : base.gems,
      unlockedShopItems: parsed.unlockedShopItems ?? ['ball_classic', 'outfit_default'],
      equippedBallId: parsed.equippedBallId ?? 'ball_classic',
      equippedBallColor: parsed.equippedBallColor ?? '#FACC15',
      equippedBallTrailColor: parsed.equippedBallTrailColor ?? parsed.equippedBallColor ?? '#FACC15',
      equippedOutfitId: parsed.equippedOutfitId ?? 'outfit_default',
      betaMissions: {
        ...createInitialBetaMissions(),
        ...(parsed.betaMissions ?? {}),
      },
      betaFeedbackClaimed: Boolean(parsed.betaFeedbackClaimed),
    };
  } catch {
    return createInitialRpgSave();
  }
}

export function saveRpgSave(uid: string, save: PlayerRpgSave): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(`${RPG_STORAGE_PREFIX}${uid}`, JSON.stringify(save));
  } catch {
    // ignore storage errors
  }
}

/**
 * Sincroniza `PlayerCoins`, `PlayerGems` e o progresso/inventário de RPG na nuvem
 * (Firestore via `/api/player-economy/:uid`) com fallback silencioso para `localStorage`.
 */
export async function syncRpgSaveToCloud(uid: string, save: PlayerRpgSave): Promise<void> {
  saveRpgSave(uid, save);
  if (typeof fetch === 'undefined') return;
  try {
    await fetch(`/api/player-economy/${encodeURIComponent(uid)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerCoins: save.coins,
        playerGems: save.gems,
        save,
      }),
    });
  } catch {
    // Fallback silencioso caso offline
  }
}

/**
 * Registra evento de compra/resgate da Loja Fictícia no servidor para exibição no Painel Admin.
 */
export async function reportBetaStoreEventToCloud(payload: {
  uid: string;
  playerName?: string;
  itemId: string;
  itemName: string;
  category: 'diamond_pack' | 'gacha_box' | 'outfit' | 'ball_color';
  currency: CurrencyType | 'free_beta';
  amountSpent: number;
}): Promise<void> {
  if (typeof fetch === 'undefined') return;
  try {
    await fetch('/api/beta/store-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // Fallback silencioso
  }
}

/**
 * Carrega `PlayerCoins`, `PlayerGems` e progresso de RPG do Firestore (`/api/player-economy/:uid`),
 * mesclando com o save local caso o servidor possua dados mais recentes.
 */
export async function loadRpgSaveFromCloud(uid: string): Promise<PlayerRpgSave> {
  const local = loadRpgSave(uid);
  if (typeof fetch === 'undefined') return local;
  try {
    const res = await fetch(`/api/player-economy/${encodeURIComponent(uid)}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return local;
    const data = (await res.json()) as {
      ok?: boolean;
      economy?: { playerCoins?: number; playerGems?: number; save?: PlayerRpgSave | null } | null;
    };
    const cloudSave = data?.economy?.save;
    if (cloudSave && cloudSave.ownedCards && cloudSave.activeCardId) {
      const merged: PlayerRpgSave = {
        ...local,
        ...cloudSave,
        coins: typeof data.economy?.playerCoins === 'number' ? data.economy.playerCoins : cloudSave.coins,
        gems:
          typeof data.economy?.playerGems === 'number'
            ? data.economy.playerGems
            : typeof cloudSave.gems === 'number'
              ? cloudSave.gems
              : local.gems,
        betaMissions: {
          ...createInitialBetaMissions(),
          ...(local.betaMissions ?? {}),
          ...(cloudSave.betaMissions ?? {}),
        },
      };
      saveRpgSave(uid, merged);
      return merged;
    }
  } catch {
    // Fallback silencioso para local
  }
  return local;
}

/**
 * Resgata pacote de Diamantes gratuito do Modo Beta ("GRÁTIS NO BETA").
 */
export function claimBetaDiamondPack(
  save: PlayerRpgSave,
  packId: string,
): { ok: boolean; save: PlayerRpgSave; pack: DiamondRechargePack | null } {
  const pack = DIAMOND_RECHARGE_PACKS.find((p) => p.id === packId) ?? null;
  if (!pack) {
    return { ok: false, save, pack: null };
  }
  const nextSave: PlayerRpgSave = {
    ...save,
    gems: (save.gems ?? 0) + pack.gemsAmount,
  };
  return { ok: true, save: nextSave, pack };
}

export interface BetaGachaBoxResult {
  ok: boolean;
  save: PlayerRpgSave;
  box: BetaGachaBoxTier | null;
  rarity: AthleteRarity;
  rewardType: 'cosmetic' | 'athlete';
  rewardName: string;
  rewardDescription: string;
  rewardPreviewHex: string;
  cosmeticItem?: ShopCosmeticItem;
  athleteCard?: RpgAthleteCard;
  isDuplicate: boolean;
  bonusCoins: number;
  error: string | null;
}

/**
 * Abre uma das 3 Caixas Gacha da Loja Beta (Comum em Spike Coins, Épica/Lendária em Diamantes).
 */
export function openBetaGachaBox(
  save: PlayerRpgSave,
  boxId: BetaGachaBoxTier['id'],
  roll: number = Math.random(),
): BetaGachaBoxResult {
  const box = BETA_GACHA_BOXES.find((b) => b.id === boxId) ?? null;
  if (!box) {
    return {
      ok: false,
      save,
      box: null,
      rarity: 'Comum',
      rewardType: 'cosmetic',
      rewardName: '',
      rewardDescription: '',
      rewardPreviewHex: '#64748B',
      isDuplicate: false,
      bonusCoins: 0,
      error: 'Caixa não encontrada.',
    };
  }

  const currentBalance = box.currency === 'gems' ? (save.gems ?? 0) : save.coins;
  if (currentBalance < box.cost) {
    return {
      ok: false,
      save,
      box,
      rarity: 'Comum',
      rewardType: 'cosmetic',
      rewardName: '',
      rewardDescription: '',
      rewardPreviewHex: '#64748B',
      isDuplicate: false,
      bonusCoins: 0,
      error: box.currency === 'gems' ? 'Diamantes Insuficientes' : 'Saldo Insuficiente',
    };
  }

  let rarity: AthleteRarity = 'Comum';
  if (box.id === 'box_common') {
    if (roll >= 0.96) rarity = 'Lendário';
    else if (roll >= 0.84) rarity = 'Épico';
    else if (roll >= 0.52) rarity = 'Raro';
    else rarity = 'Comum';
  } else if (box.id === 'box_epic') {
    if (roll >= 0.85) rarity = 'Lendário';
    else if (roll >= 0.43) rarity = 'Épico';
    else rarity = 'Raro';
  } else {
    // box_legendary
    if (roll >= 0.5) rarity = 'Lendário';
    else rarity = 'Épico';
  }

  const nextPity = save.pityCounter + 1;
  if (nextPity >= 8) {
    rarity = 'Lendário';
  }

  // Deduz custo da caixa
  let nextCoins = box.currency === 'coins' ? save.coins - box.cost : save.coins;
  const nextGems = box.currency === 'gems' ? (save.gems ?? 0) - box.cost : (save.gems ?? 0);

  // Tenta priorizar cosméticos ainda não desbloqueados dessa raridade; caso contrário sorteia carta de atleta
  const unlockedItems = save.unlockedShopItems ?? ['ball_classic', 'outfit_default'];
  const matchingCosmetics = SHOP_ITEMS.filter((item) => item.rarity === rarity && item.cost > 0);
  const lockedCosmetics = matchingCosmetics.filter((item) => !unlockedItems.includes(item.id));

  if (lockedCosmetics.length > 0 && roll < 0.65) {
    const pickedItem = lockedCosmetics[Math.floor((roll * 991) % lockedCosmetics.length)];
    const nextUnlocked = [...unlockedItems, pickedItem.id];
    const nextSave: PlayerRpgSave = {
      ...save,
      coins: nextCoins,
      gems: nextGems,
      unlockedShopItems: nextUnlocked,
      pityCounter: rarity === 'Lendário' ? 0 : nextPity,
    };
    return {
      ok: true,
      save: nextSave,
      box,
      rarity,
      rewardType: 'cosmetic',
      rewardName: pickedItem.name,
      rewardDescription: pickedItem.description,
      rewardPreviewHex: pickedItem.previewHex,
      cosmeticItem: pickedItem,
      isDuplicate: false,
      bonusCoins: 0,
      error: null,
    };
  }

  // Sorteia atleta da raridade
  const athletePool = ATHLETE_CATALOG.filter((c) => c.rarity === rarity);
  const pickedCard =
    athletePool[Math.floor((roll * 997) % athletePool.length)] ??
    ATHLETE_CATALOG[ATHLETE_CATALOG.length - 1];
  const existing = save.ownedCards[pickedCard.cardId];
  const isDuplicate = Boolean(existing);
  const bonusCoins = isDuplicate ? (rarity === 'Lendário' ? 140 : rarity === 'Épico' ? 90 : 50) : 0;
  nextCoins += bonusCoins;

  const nextOwned = { ...save.ownedCards };
  if (existing) {
    nextOwned[pickedCard.cardId] = {
      ...existing,
      copies: existing.copies + 1,
      level: Math.min(20, existing.level + 1),
    };
  } else {
    nextOwned[pickedCard.cardId] = {
      cardId: pickedCard.cardId,
      level: 1,
      copies: 1,
      upgrades: { attack: 0, defense: 0, jump: 0, speed: 0 },
    };
  }

  const nextSave: PlayerRpgSave = {
    ...save,
    coins: nextCoins,
    gems: nextGems,
    ownedCards: nextOwned,
    pityCounter: rarity === 'Lendário' ? 0 : nextPity,
  };

  return {
    ok: true,
    save: nextSave,
    box,
    rarity: pickedCard.rarity,
    rewardType: 'athlete',
    rewardName: pickedCard.name,
    rewardDescription: `${pickedCard.title} • ${pickedCard.specialty}`,
    rewardPreviewHex: RARITY_COLORS[pickedCard.rarity].border,
    athleteCard: pickedCard,
    isDuplicate,
    bonusCoins,
    error: null,
  };
}

export interface GachaPullResult {
  save: PlayerRpgSave;
  pulledCard: RpgAthleteCard;
  isNew: boolean;
  bonusCoins: number;
}

/**
 * Recrutamento Gacha com sistema de Pity (Lendário garantido a cada 8 giros) e reembolso de cópias.
 */
export function pullGachaAthlete(save: PlayerRpgSave, roll: number = Math.random()): GachaPullResult | null {
  if (save.coins < GACHA_COST) return null;

  const nextPity = save.pityCounter + 1;
  let rarity: AthleteRarity = 'Comum';
  if (nextPity >= 8 || roll >= 0.93) {
    rarity = 'Lendário';
  } else if (roll >= 0.72) {
    rarity = 'Épico';
  } else if (roll >= 0.36) {
    rarity = 'Raro';
  }

  const pool = ATHLETE_CATALOG.filter((c) => c.rarity === rarity);
  const picked = pool[Math.floor((roll * 997) % pool.length)] ?? ATHLETE_CATALOG[0];
  const existing = save.ownedCards[picked.cardId];
  const isNew = !existing;
  const bonusCoins = existing ? 45 : 0;

  const nextOwned = { ...save.ownedCards };
  if (existing) {
    nextOwned[picked.cardId] = {
      ...existing,
      copies: existing.copies + 1,
      level: Math.min(20, existing.level + 1),
    };
  } else {
    nextOwned[picked.cardId] = {
      cardId: picked.cardId,
      level: 1,
      copies: 1,
      upgrades: { attack: 0, defense: 0, jump: 0, speed: 0 },
    };
  }

  const nextSave: PlayerRpgSave = {
    ...save,
    coins: save.coins - GACHA_COST + bonusCoins,
    ownedCards: nextOwned,
    pityCounter: rarity === 'Lendário' ? 0 : nextPity,
  };

  return {
    save: nextSave,
    pulledCard: picked,
    isNew,
    bonusCoins,
  };
}

/**
 * Aplica upgrade de atributo (Ataque/Força, Defesa, Pulo/Salto ou Velocidade) consumindo moedas.
 */
export function upgradeAthleteStat(
  save: PlayerRpgSave,
  cardId: string,
  statKey: keyof CharacterStats,
): PlayerRpgSave | null {
  const owned = save.ownedCards[cardId];
  if (!owned) return null;
  const current = owned.upgrades[statKey];
  if (current >= MAX_STAT_UPGRADES) return null;
  const cost = getStatUpgradeCost(current);
  if (save.coins < cost) return null;

  return {
    ...save,
    coins: save.coins - cost,
    ownedCards: {
      ...save.ownedCards,
      [cardId]: {
        ...owned,
        upgrades: {
          ...owned.upgrades,
          [statKey]: current + 1,
        },
      },
    },
  };
}

export interface ShopTransactionResult {
  ok: boolean;
  save: PlayerRpgSave;
  cost: number;
  error: string | null;
}

/**
 * Tenta comprar +1 ponto de evolução para o Sistema de RPG (custo base: 100 moedas).
 * Se o jogador não tiver moedas suficientes (`PlayerCoins < cost`), bloqueia a compra
 * e retorna o aviso `"Saldo Insuficiente"`.
 */
export function attemptUpgradeAthleteStat(
  save: PlayerRpgSave,
  cardId: string,
  statKey: keyof CharacterStats,
): ShopTransactionResult {
  const owned = save.ownedCards[cardId];
  if (!owned) {
    return { ok: false, save, cost: 0, error: 'Atleta não encontrado.' };
  }
  const current = owned.upgrades[statKey];
  if (current >= MAX_STAT_UPGRADES) {
    return { ok: false, save, cost: 0, error: 'Nível Máximo atingido.' };
  }
  const cost = getStatUpgradeCost(current);
  if (save.coins < cost) {
    return { ok: false, save, cost, error: 'Saldo Insuficiente' };
  }
  const nextSave = upgradeAthleteStat(save, cardId, statKey);
  if (!nextSave) {
    return { ok: false, save, cost, error: 'Saldo Insuficiente' };
  }
  return { ok: true, save: nextSave, cost, error: null };
}

/**
 * Tenta desbloquear um item cosmético da Loja (Bolas/Rastros ou Skins/Uniformes)
 * suportando pagamento em Spike Coins (`coins`) ou Volley Gems / Diamantes (`gems`).
 */
export function purchaseShopItem(
  save: PlayerRpgSave,
  itemId: string,
): ShopTransactionResult & { item: ShopCosmeticItem | null } {
  const item = SHOP_ITEMS.find((x) => x.id === itemId) ?? null;
  if (!item) {
    return { ok: false, save, cost: 0, item: null, error: 'Item não encontrado.' };
  }
  const unlocked = save.unlockedShopItems ?? ['ball_classic', 'outfit_default'];
  if (unlocked.includes(item.id)) {
    const equippedSave = equipShopItem(save, item.id);
    return { ok: true, save: equippedSave, cost: 0, item, error: null };
  }

  const currency = item.currency ?? 'coins';
  if (currency === 'gems') {
    const currentGems = save.gems ?? 0;
    if (currentGems < item.cost) {
      return { ok: false, save, cost: item.cost, item, error: 'Diamantes Insuficientes' };
    }
  } else {
    if (save.coins < item.cost) {
      return { ok: false, save, cost: item.cost, item, error: 'Saldo Insuficiente' };
    }
  }

  const nextUnlocked = [...unlocked, item.id];
  const nextSave: PlayerRpgSave = {
    ...save,
    coins: currency === 'coins' ? save.coins - item.cost : save.coins,
    gems: currency === 'gems' ? (save.gems ?? 0) - item.cost : (save.gems ?? 0),
    unlockedShopItems: nextUnlocked,
    equippedBallId: item.category === 'ball_color' ? item.id : (save.equippedBallId ?? 'ball_classic'),
    equippedBallColor: item.category === 'ball_color' ? item.previewHex : (save.equippedBallColor ?? '#FACC15'),
    equippedBallTrailColor:
      item.category === 'ball_color'
        ? (item.trailHex ?? item.previewHex)
        : (save.equippedBallTrailColor ?? save.equippedBallColor ?? '#FACC15'),
    equippedOutfitId: item.category === 'outfit' ? item.id : (save.equippedOutfitId ?? 'outfit_default'),
  };
  return { ok: true, save: nextSave, cost: item.cost, item, error: null };
}

export function equipShopItem(save: PlayerRpgSave, itemId: string): PlayerRpgSave {
  const item = SHOP_ITEMS.find((x) => x.id === itemId);
  if (!item) return save;
  const unlocked = save.unlockedShopItems ?? ['ball_classic', 'outfit_default'];
  if (!unlocked.includes(item.id)) return save;
  return {
    ...save,
    equippedBallId: item.category === 'ball_color' ? item.id : (save.equippedBallId ?? 'ball_classic'),
    equippedBallColor: item.category === 'ball_color' ? item.previewHex : (save.equippedBallColor ?? '#FACC15'),
    equippedBallTrailColor:
      item.category === 'ball_color'
        ? (item.trailHex ?? item.previewHex)
        : (save.equippedBallTrailColor ?? save.equippedBallColor ?? '#FACC15'),
    equippedOutfitId: item.category === 'outfit' ? item.id : (save.equippedOutfitId ?? 'outfit_default'),
  };
}

/**
 * Recompensa o jogador com moedas (`PlayerCoins`) ao vencer partidas.
 */
export function rewardMatchVictoryCoins(
  save: PlayerRpgSave,
  difficulty: AiDifficulty,
): { save: PlayerRpgSave; rewardCoins: number } {
  const rewardCoins = difficulty === 'hard' ? 240 : difficulty === 'medium' ? 160 : 110;
  return {
    rewardCoins,
    save: {
      ...save,
      coins: save.coins + rewardCoins,
    },
  };
}

/**
 * Recompensa o jogador com Spike Coins ao marcar pontos especiais (Ace, Bloqueio ou Super Spike)
 * e atualiza automaticamente a missão de pontos do Beta.
 */
export function rewardSpecialPointCoins(
  save: PlayerRpgSave,
  reason: 'ace' | 'block' | 'spike' = 'spike',
): { save: PlayerRpgSave; bonusCoins: number } {
  const bonusCoins = reason === 'ace' ? 25 : reason === 'block' ? 20 : 15;
  const withMission = recordBetaMissionProgress(save, { pointsScored: 1 });
  return {
    bonusCoins,
    save: {
      ...withMission,
      coins: withMission.coins + bonusCoins,
    },
  };
}

/**
 * Atualiza o progresso das 3 Missões Rápidas de Beta no perfil do jogador.
 */
export function recordBetaMissionProgress(
  save: PlayerRpgSave,
  events: { matchesPlayed?: number; matchesWon?: number; pointsScored?: number },
): PlayerRpgSave {
  const currentMissions = {
    ...createInitialBetaMissions(),
    ...(save.betaMissions ?? {}),
  };

  if (events.matchesPlayed && events.matchesPlayed > 0) {
    const m = currentMissions.mission_play_1;
    currentMissions.mission_play_1 = {
      ...m,
      progress: Math.min(1, m.progress + events.matchesPlayed),
    };
  }

  if (events.matchesWon && events.matchesWon > 0) {
    const m = currentMissions.mission_win_2;
    currentMissions.mission_win_2 = {
      ...m,
      progress: Math.min(2, m.progress + events.matchesWon),
    };
  }

  if (events.pointsScored && events.pointsScored > 0) {
    const m = currentMissions.mission_points_3;
    currentMissions.mission_points_3 = {
      ...m,
      progress: Math.min(3, m.progress + events.pointsScored),
    };
  }

  return {
    ...save,
    betaMissions: currentMissions,
  };
}

/**
 * Resgata a recompensa de uma Missão Rápida concluída (entrega Spike Coins + Diamantes).
 */
export function claimBetaMissionReward(
  save: PlayerRpgSave,
  missionId: BetaMissionDefinition['id'],
): { ok: boolean; save: PlayerRpgSave; rewardCoins: number; rewardGems: number; error: string | null } {
  const def = BETA_MISSIONS.find((m) => m.id === missionId);
  if (!def) {
    return { ok: false, save, rewardCoins: 0, rewardGems: 0, error: 'Missão não encontrada.' };
  }
  const currentMissions = {
    ...createInitialBetaMissions(),
    ...(save.betaMissions ?? {}),
  };
  const state = currentMissions[missionId];
  if (!state || state.progress < def.target) {
    return { ok: false, save, rewardCoins: 0, rewardGems: 0, error: 'Missão ainda não concluída.' };
  }
  if (state.claimed) {
    return { ok: false, save, rewardCoins: 0, rewardGems: 0, error: 'Recompensa já resgatada.' };
  }

  currentMissions[missionId] = {
    ...state,
    claimed: true,
  };

  const nextSave: PlayerRpgSave = {
    ...save,
    coins: save.coins + def.rewardCoins,
    gems: (save.gems ?? 0) + def.rewardGems,
    betaMissions: currentMissions,
  };

  return {
    ok: true,
    save: nextSave,
    rewardCoins: def.rewardCoins,
    rewardGems: def.rewardGems,
    error: null,
  };
}

/**
 * Credita +500 Diamantes uma única vez quando o jogador envia o Feedback do Beta Teste.
 */
export function claimBetaFeedbackReward(save: PlayerRpgSave): {
  ok: boolean;
  save: PlayerRpgSave;
  rewardGems: number;
} {
  if (save.betaFeedbackClaimed) {
    return { ok: false, save, rewardGems: 0 };
  }
  const nextSave: PlayerRpgSave = {
    ...save,
    gems: (save.gems ?? 0) + BETA_FEEDBACK_GEM_REWARD,
    betaFeedbackClaimed: true,
  };
  return {
    ok: true,
    save: nextSave,
    rewardGems: BETA_FEEDBACK_GEM_REWARD,
  };
}

/**
 * Conclui capítulo da campanha, entrega moedas e desbloqueia arenas/cartas rivais.
 */
export function completeCampaignChapter(save: PlayerRpgSave, chapterId: string): PlayerRpgSave {
  const chapter = CAMPAIGN_CHAPTERS.find((c) => c.id === chapterId);
  if (!chapter) return save;

  const alreadyDone = save.completedChapters.includes(chapterId);
  const reward = alreadyDone ? Math.round(chapter.rewardCoins * 0.45) : chapter.rewardCoins;
  const nextArenas = save.unlockedArenas.includes(chapter.unlockArenaId)
    ? save.unlockedArenas
    : [...save.unlockedArenas, chapter.unlockArenaId];

  const nextOwned = { ...save.ownedCards };
  if (chapter.unlockCardId && !nextOwned[chapter.unlockCardId]) {
    nextOwned[chapter.unlockCardId] = {
      cardId: chapter.unlockCardId,
      level: 1,
      copies: 1,
      upgrades: { attack: 0, defense: 0, jump: 0, speed: 0 },
    };
  }

  return {
    ...save,
    coins: save.coins + reward,
    unlockedArenas: nextArenas,
    ownedCards: nextOwned,
    completedChapters: alreadyDone ? save.completedChapters : [...save.completedChapters, chapterId],
  };
}

const TOURNAMENT_BOTS: Array<{ name: string; characterId: CharacterId }> = [
  { name: 'Ren Estrategista', characterId: 'ren' },
  { name: 'Yuki Muralha', characterId: 'yuki' },
  { name: 'Hana Cometa', characterId: 'hana' },
  { name: 'Kai Praia', characterId: 'kai' },
  { name: 'Akira Sombra', characterId: 'akira' },
  { name: 'Tetsu Rocha', characterId: 'yuki' },
  { name: 'Sora Shark', characterId: 'kai' },
];

/**
 * Gera chaveamento procedural de Liga / Torneio Mata-Mata (Quartas -> Semi -> Final).
 */
export function generateTournamentBracket(
  playerName: string,
  playerCharacterId: CharacterId,
  difficulty: AiDifficulty,
  arenaId: ArenaId,
): TournamentState {
  const bots = [...TOURNAMENT_BOTS].sort(() => Math.random() - 0.5).slice(0, 7);
  const matches: TournamentMatchNode[] = [
    {
      id: 'q1',
      round: 'quartas',
      teamA: { name: playerName, characterId: playerCharacterId, isPlayer: true },
      teamB: { ...bots[0], isPlayer: false },
      winner: null,
    },
    {
      id: 'q2',
      round: 'quartas',
      teamA: { ...bots[1], isPlayer: false },
      teamB: { ...bots[2], isPlayer: false },
      winner: null,
    },
    {
      id: 'q3',
      round: 'quartas',
      teamA: { ...bots[3], isPlayer: false },
      teamB: { ...bots[4], isPlayer: false },
      winner: null,
    },
    {
      id: 'q4',
      round: 'quartas',
      teamA: { ...bots[5], isPlayer: false },
      teamB: { ...bots[6], isPlayer: false },
      winner: null,
    },
  ];

  return {
    id: `liga_${Date.now().toString(36)}`,
    difficulty,
    arenaId,
    currentRound: 'quartas',
    eliminated: false,
    championName: null,
    rewardClaimed: false,
    matches,
  };
}

/**
 * Avança a chave do torneio após o resultado do confronto do jogador, simulando os demais jogos da rodada.
 */
export function advanceTournamentRound(
  tournament: TournamentState,
  playerWon: boolean,
): TournamentState {
  if (tournament.currentRound === 'completed') return tournament;

  const updatedMatches = tournament.matches.map((m) => ({ ...m }));
  const roundMatches = updatedMatches.filter((m) => m.round === tournament.currentRound);

  for (const m of roundMatches) {
    if (m.winner !== null) continue;
    if (m.teamA.isPlayer || m.teamB.isPlayer) {
      m.winner = (m.teamA.isPlayer && playerWon) || (m.teamB.isPlayer && !playerWon) ? 'A' : 'B';
    } else {
      m.winner = Math.random() > 0.5 ? 'A' : 'B';
    }
  }

  const getWinnerTeam = (m: TournamentMatchNode) => (m.winner === 'B' ? m.teamB : m.teamA);

  if (!playerWon) {
    return {
      ...tournament,
      matches: updatedMatches,
      eliminated: true,
      currentRound: 'completed',
    };
  }

  if (tournament.currentRound === 'quartas') {
    const q = updatedMatches.filter((m) => m.round === 'quartas');
    updatedMatches.push(
      {
        id: 's1',
        round: 'semi',
        teamA: getWinnerTeam(q[0]),
        teamB: getWinnerTeam(q[1]),
        winner: null,
      },
      {
        id: 's2',
        round: 'semi',
        teamA: getWinnerTeam(q[2]),
        teamB: getWinnerTeam(q[3]),
        winner: null,
      },
    );
    return { ...tournament, matches: updatedMatches, currentRound: 'semi' };
  }

  if (tournament.currentRound === 'semi') {
    const s = updatedMatches.filter((m) => m.round === 'semi');
    updatedMatches.push({
      id: 'f1',
      round: 'final',
      teamA: getWinnerTeam(s[0]),
      teamB: getWinnerTeam(s[1]),
      winner: null,
    });
    return { ...tournament, matches: updatedMatches, currentRound: 'final' };
  }

  const finalMatch = updatedMatches.find((m) => m.round === 'final');
  const champ = finalMatch ? getWinnerTeam(finalMatch).name : null;
  return {
    ...tournament,
    matches: updatedMatches,
    currentRound: 'completed',
    championName: champ,
  };
}
