import type { ArenaId } from '../config/gameConfig';

export interface ArenaTheme {
  id: ArenaId;
  name: string;
  subtitle: string;
  skyTop: string;
  skyBottom: string;
  fogColor: string;
  floorColor: string;
  outerFloorColor: string;
  lineColor: string;
  netColor: string;
  accentColor: string;
  sunColor: string;
  hemiSky: string;
  hemiGround: string;
  isOutdoor: boolean;
  mvpEnabled: boolean;
}

export const ARENAS: Record<ArenaId, ArenaTheme> = {
  ginasio: {
    id: 'ginasio',
    name: 'Ginásio Nacional',
    subtitle: 'Piso de madeira polida com arquibancadas vibrantes',
    skyTop: '#1E293B',
    skyBottom: '#334155',
    fogColor: '#1E293B',
    floorColor: '#E59F52',
    outerFloorColor: '#2563EB',
    lineColor: '#FFFFFF',
    netColor: '#F8FAFC',
    accentColor: '#F97316',
    sunColor: '#FFF7ED',
    hemiSky: '#93C5FD',
    hemiGround: '#7C2D12',
    isOutdoor: false,
    mvpEnabled: true,
  },
  praia: {
    id: 'praia',
    name: 'Praia Ensolarada',
    subtitle: 'Areia dourada, mar turquesa e brisa tropical',
    skyTop: '#0284C7',
    skyBottom: '#BAE6FD',
    fogColor: '#BAE6FD',
    floorColor: '#F6D38D',
    outerFloorColor: '#0EA5E9',
    lineColor: '#FFFBEB',
    netColor: '#FFFFFF',
    accentColor: '#06B6D4',
    sunColor: '#FEF08A',
    hemiSky: '#7DD3FC',
    hemiGround: '#D97706',
    isOutdoor: true,
    mvpEnabled: true,
  },
  escola: {
    id: 'escola',
    name: 'Escola Japonesa',
    subtitle: 'Pátio colegial cercado por cerejeiras ao pôr do sol',
    skyTop: '#312E81',
    skyBottom: '#FDBA74',
    fogColor: '#FED7AA',
    floorColor: '#D97742',
    outerFloorColor: '#475569',
    lineColor: '#FFF7ED',
    netColor: '#F1F5F9',
    accentColor: '#EC4899',
    sunColor: '#FDBA74',
    hemiSky: '#F9A8D4',
    hemiGround: '#431407',
    isOutdoor: true,
    mvpEnabled: true,
  },
  neon: {
    id: 'neon',
    name: 'Cidade Neon',
    subtitle: 'Terraço futurista iluminado por letreiros vibrantes',
    skyTop: '#090D16',
    skyBottom: '#1E1B4B',
    fogColor: '#13162D',
    floorColor: '#1E293B',
    outerFloorColor: '#0F172A',
    lineColor: '#22D3EE',
    netColor: '#38BDF8',
    accentColor: '#A855F7',
    sunColor: '#E0E7FF',
    hemiSky: '#38BDF8',
    hemiGround: '#311042',
    isOutdoor: true,
    mvpEnabled: true,
  },
  montanha: {
    id: 'montanha',
    name: 'Montanha Sagrada',
    subtitle: 'Arena elevada entre picos nevados e ar puro',
    skyTop: '#0369A1',
    skyBottom: '#E0F2FE',
    fogColor: '#CFE8FA',
    floorColor: '#64748B',
    outerFloorColor: '#E2E8F0',
    lineColor: '#FFFFFF',
    netColor: '#F8FAFC',
    accentColor: '#10B981',
    sunColor: '#FFFFFF',
    hemiSky: '#BAE6FD',
    hemiGround: '#475569',
    isOutdoor: true,
    mvpEnabled: true,
  },
  templo: {
    id: 'templo',
    name: 'Templo Antigo',
    subtitle: 'Pátio de pedra com portões torii e lanternas',
    skyTop: '#7C2D12',
    skyBottom: '#FDE68A',
    fogColor: '#FDE68A',
    floorColor: '#B45309',
    outerFloorColor: '#44403C',
    lineColor: '#FEF3C7',
    netColor: '#FEF3C7',
    accentColor: '#EF4444',
    sunColor: '#FDE047',
    hemiSky: '#FCD34D',
    hemiGround: '#451A03',
    isOutdoor: true,
    mvpEnabled: true,
  },
  festival: {
    id: 'festival',
    name: 'Festival Japonês',
    subtitle: 'Noite festiva com lanternas e fogos de artifício',
    skyTop: '#0F172A',
    skyBottom: '#4C1D95',
    fogColor: '#2E1065',
    floorColor: '#9A3412',
    outerFloorColor: '#1E1B4B',
    lineColor: '#FDE047',
    netColor: '#FFFBEB',
    accentColor: '#F59E0B',
    sunColor: '#FDE68A',
    hemiSky: '#C084FC',
    hemiGround: '#431407',
    isOutdoor: true,
    mvpEnabled: true,
  },
};

export const ARENA_LIST: ArenaTheme[] = Object.values(ARENAS);
