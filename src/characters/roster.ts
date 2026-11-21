import type { CharacterId, UltimateType } from '../config/gameConfig';

export interface CharacterDefinition {
  id: CharacterId;
  name: string;
  jerseyNumber: string;
  title: string;
  lore: string;
  hairStyle: 'spiky' | 'sleek' | 'swept' | 'twintails' | 'messy';
  accessory: 'bandana' | 'glasses' | 'headband' | 'ribbons' | 'jacket';
  ultimateId: UltimateType;
  ultimateName: string;
  ultimateDescription: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    hair: string;
    hairHighlight: string;
    skin: string;
    eye: string;
    aura: string;
    kneePad: string;
    shoeAccent: string;
  };
  proportions: {
    heightScale: number;
    shoulderWidth: number;
    limbLength: number;
  };
  /** Todos os personagens mantêm equilíbrio competitivo estrito (sem P2W). */
  balancedProfile: {
    speedLabel: string;
    jumpLabel: string;
    techniqueLabel: string;
  };
}

export const CHARACTERS: Record<CharacterId, CharacterDefinition> = {
  akira: {
    id: 'akira',
    name: 'Akira',
    jerseyNumber: '10',
    title: 'Asa Laranja Incansável',
    lore: 'Atacante explosivo de cabelos espetados laranja-dourados que salta acima do bloqueio para cravar cortadas impossíveis.',
    hairStyle: 'spiky',
    accessory: 'bandana',
    ultimateId: 'super_spike',
    ultimateName: 'Super Spike',
    ultimateDescription: 'Onda de choque dourada e rastro incandescente no impacto da cortada.',
    colors: {
      primary: '#0F172A',
      secondary: '#090D16',
      accent: '#FF6B00',
      hair: '#FF6B00',
      hairHighlight: '#FDE047',
      skin: '#FFE0C4',
      eye: '#EA580C',
      aura: '#FACC15',
      kneePad: '#0F172A',
      shoeAccent: '#FF6B00',
    },
    proportions: {
      heightScale: 1.03,
      shoulderWidth: 1.08,
      limbLength: 1.1,
    },
    balancedProfile: {
      speedLabel: 'Equilibrado',
      jumpLabel: 'Equilibrado',
      techniqueLabel: 'Equilibrado',
    },
  },
  ren: {
    id: 'ren',
    name: 'Ren',
    jerseyNumber: '09',
    title: 'Levantador Estrategista',
    lore: 'Gênio de cabelos azul-elétrico que calcula cada ângulo da quadra em milissegundos com precisão cirúrgica.',
    hairStyle: 'sleek',
    accessory: 'glasses',
    ultimateId: 'lightning_spike',
    ultimateName: 'Lightning Spike',
    ultimateDescription: 'Relâmpagos cianos cercam a bola com faíscas elétricas no impacto.',
    colors: {
      primary: '#1E3A8A',
      secondary: '#0F172A',
      accent: '#38BDF8',
      hair: '#1D4ED8',
      hairHighlight: '#67E8F9',
      skin: '#FFE4CE',
      eye: '#0284C7',
      aura: '#38BDF8',
      kneePad: '#0F172A',
      shoeAccent: '#38BDF8',
    },
    proportions: {
      heightScale: 1.06,
      shoulderWidth: 1.05,
      limbLength: 1.12,
    },
    balancedProfile: {
      speedLabel: 'Equilibrado',
      jumpLabel: 'Equilibrado',
      techniqueLabel: 'Equilibrado',
    },
  },
  yuki: {
    id: 'yuki',
    name: 'Yuki',
    jerseyNumber: '04',
    title: 'Muralha Glacial',
    lore: 'Especialista de cabelos loiro-platinados em bloqueios frios e recepções impecáveis nos momentos decisivos.',
    hairStyle: 'swept',
    accessory: 'headband',
    ultimateId: 'freeze_ball',
    ultimateName: 'Freeze Ball',
    ultimateDescription: 'Cristais de gelo e névoa congelante acompanham toda a trajetória da bola.',
    colors: {
      primary: '#083344',
      secondary: '#0F172A',
      accent: '#22D3EE',
      hair: '#FACC15',
      hairHighlight: '#FEF08A',
      skin: '#FFF0E5',
      eye: '#0891B2',
      aura: '#22D3EE',
      kneePad: '#0F172A',
      shoeAccent: '#22D3EE',
    },
    proportions: {
      heightScale: 1.07,
      shoulderWidth: 1.1,
      limbLength: 1.13,
    },
    balancedProfile: {
      speedLabel: 'Equilibrado',
      jumpLabel: 'Equilibrado',
      techniqueLabel: 'Equilibrado',
    },
  },
  hana: {
    id: 'hana',
    name: 'Hana',
    jerseyNumber: '07',
    title: 'Chama Carmesim da Quadra',
    lore: 'Atacante ruiva-carmesim de energia contagiante que levanta a torcida inteira com mergulhos acrobáticos.',
    hairStyle: 'twintails',
    accessory: 'ribbons',
    ultimateId: 'fire_ball',
    ultimateName: 'Fire Ball',
    ultimateDescription: 'Chamas vibrantes envolvem a bola criando um cometa de anime.',
    colors: {
      primary: '#991B1B',
      secondary: '#18181B',
      accent: '#FBBF24',
      hair: '#EF4444',
      hairHighlight: '#FDA4AF',
      skin: '#FFE2C8',
      eye: '#E11D48',
      aura: '#FB7185',
      kneePad: '#18181B',
      shoeAccent: '#EF4444',
    },
    proportions: {
      heightScale: 1.01,
      shoulderWidth: 1.0,
      limbLength: 1.08,
    },
    balancedProfile: {
      speedLabel: 'Equilibrado',
      jumpLabel: 'Equilibrado',
      techniqueLabel: 'Equilibrado',
    },
  },
  kai: {
    id: 'kai',
    name: 'Kai',
    jerseyNumber: '12',
    title: 'Vendaval Esmeralda',
    lore: 'Craque atlético que mistura força bruta, impulsão explosiva e jogadas imprevisíveis na rede.',
    hairStyle: 'messy',
    accessory: 'jacket',
    ultimateId: 'wind_ball',
    ultimateName: 'Wind Ball',
    ultimateDescription: 'Anéis de vento esmeralda giram em espiral ao redor da bola.',
    colors: {
      primary: '#065F46',
      secondary: '#0F172A',
      accent: '#34D399',
      hair: '#10B981',
      hairHighlight: '#A7F3D0',
      skin: '#F6C69A',
      eye: '#059669',
      aura: '#34D399',
      kneePad: '#0F172A',
      shoeAccent: '#10B981',
    },
    proportions: {
      heightScale: 1.08,
      shoulderWidth: 1.14,
      limbLength: 1.14,
    },
    balancedProfile: {
      speedLabel: 'Equilibrado',
      jumpLabel: 'Equilibrado',
      techniqueLabel: 'Equilibrado',
    },
  },
};

export const CHARACTER_LIST: CharacterDefinition[] = Object.values(CHARACTERS);

