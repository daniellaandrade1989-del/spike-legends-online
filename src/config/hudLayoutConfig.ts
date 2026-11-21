/**
 * Spike Legends Online — Configuração e Persistência do Layout do HUD Mobile Personalizável
 * Usa coordenadas percentuais normalizadas em tela cheia (100dvw x 100dvh, position: fixed):
 * left: ${x}%, top: ${y}%, transform: translate(-50%, -50%) scale(${scale})
 * garantindo espelhamento 100% idêntico (pixel por pixel) entre a Partida e o Editor de HUD.
 */

export type HudButtonId =
  | 'moveLeft'
  | 'moveRight'
  | 'jumpSpike'
  | 'set'
  | 'receive'
  | 'dive'
  | 'ultimate';

export interface HudButtonTransform {
  /** Posição horizontal normalizada em porcentagem da largura da tela (0 a 100%) */
  x: number;
  /** Posição vertical normalizada em porcentagem da altura da tela (0 a 100%) */
  y: number;
  /** Escala individual do botão (0.65 a 1.45) */
  scale: number;
}

export type HudLayoutConfig = Record<HudButtonId, HudButtonTransform>;

export const HUD_LAYOUT_STORAGE_KEY = 'spike_legends_hud_layout_v2';

export const HUD_BUTTON_ORDER: HudButtonId[] = [
  'moveLeft',
  'moveRight',
  'dive',
  'ultimate',
  'receive',
  'set',
  'jumpSpike',
];

export const HUD_BUTTON_META: Record<
  HudButtonId,
  { label: string; shortLabel: string; description: string }
> = {
  moveLeft: {
    label: 'Mover Esquerda (ESQ)',
    shortLabel: 'ESQ',
    description: 'Botão direcional para recuar/mover para a esquerda na quadra',
  },
  moveRight: {
    label: 'Mover Direita (DIR)',
    shortLabel: 'DIR',
    description: 'Botão direcional para avançar/mover para a direita na quadra',
  },
  dive: {
    label: 'Peixinho (Dive)',
    shortLabel: 'Dive',
    description: 'Mergulho rápido para salvar bolas distantes',
  },
  ultimate: {
    label: 'Super Attack (Super)',
    shortLabel: 'Super',
    description: 'Ativa o modo Super Attack quando a barra atinge 100%',
  },
  receive: {
    label: 'Manchete / Receber',
    shortLabel: 'Manchete',
    description: 'Recepção de saque e defesa de cortadas',
  },
  set: {
    label: 'Toque / Levantar',
    shortLabel: 'Toque',
    description: 'Levantamento parabólico alto próximo à rede na zona ideal de ataque',
  },
  jumpSpike: {
    label: 'Pular / Atacar',
    shortLabel: 'PULAR / ATACAR',
    description: 'Botão principal unificado: 1º toque pula, 2º toque no ar ataca (ou carrega saque)',
  },
};

export const DEFAULT_HUD_LAYOUT: HudLayoutConfig = {
  moveLeft: { x: 7.5, y: 86.0, scale: 1.0 },
  moveRight: { x: 16.5, y: 86.0, scale: 1.0 },
  dive: { x: 64.5, y: 88.0, scale: 1.0 },
  ultimate: { x: 71.5, y: 88.0, scale: 1.0 },
  receive: { x: 79.0, y: 87.0, scale: 1.0 },
  set: { x: 86.5, y: 87.0, scale: 1.0 },
  jumpSpike: { x: 94.5, y: 85.5, scale: 1.0 },
};

export function clampHudTransform(
  t: Partial<HudButtonTransform> | undefined,
  fallback: HudButtonTransform = { x: 50, y: 85, scale: 1.0 },
): HudButtonTransform {
  const rawX = Number(t?.x);
  const rawY = Number(t?.y);
  const rawScale = Number(t?.scale);
  return {
    x: Number.isFinite(rawX)
      ? Math.max(4, Math.min(96, Math.round(rawX * 100) / 100))
      : fallback.x,
    y: Number.isFinite(rawY)
      ? Math.max(8, Math.min(94, Math.round(rawY * 100) / 100))
      : fallback.y,
    scale: Number.isFinite(rawScale)
      ? Math.max(0.65, Math.min(1.45, Math.round(rawScale * 100) / 100))
      : fallback.scale,
  };
}

export function getButtonFixedStyle(transform: HudButtonTransform): {
  position: 'fixed';
  left: string;
  top: string;
  transform: string;
  touchAction: 'none';
} {
  return {
    position: 'fixed',
    left: `${transform.x}%`,
    top: `${transform.y}%`,
    transform: `translate(-50%, -50%) scale(${transform.scale})`,
    touchAction: 'none',
  };
}

export function loadHudLayout(): HudLayoutConfig {
  const base: HudLayoutConfig = {
    moveLeft: { ...DEFAULT_HUD_LAYOUT.moveLeft },
    moveRight: { ...DEFAULT_HUD_LAYOUT.moveRight },
    dive: { ...DEFAULT_HUD_LAYOUT.dive },
    ultimate: { ...DEFAULT_HUD_LAYOUT.ultimate },
    receive: { ...DEFAULT_HUD_LAYOUT.receive },
    set: { ...DEFAULT_HUD_LAYOUT.set },
    jumpSpike: { ...DEFAULT_HUD_LAYOUT.jumpSpike },
  };
  if (typeof window === 'undefined') return base;
  try {
    const raw = window.localStorage.getItem(HUD_LAYOUT_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<Record<HudButtonId, Partial<HudButtonTransform>>>;
    for (const key of HUD_BUTTON_ORDER) {
      if (parsed && parsed[key]) {
        base[key] = clampHudTransform(parsed[key], DEFAULT_HUD_LAYOUT[key]);
      }
    }
  } catch {
    // Fallback para layout padrão
  }
  return base;
}

export function saveHudLayout(layout: HudLayoutConfig): HudLayoutConfig {
  const sanitized: HudLayoutConfig = {
    moveLeft: clampHudTransform(layout.moveLeft, DEFAULT_HUD_LAYOUT.moveLeft),
    moveRight: clampHudTransform(layout.moveRight, DEFAULT_HUD_LAYOUT.moveRight),
    dive: clampHudTransform(layout.dive, DEFAULT_HUD_LAYOUT.dive),
    ultimate: clampHudTransform(layout.ultimate, DEFAULT_HUD_LAYOUT.ultimate),
    receive: clampHudTransform(layout.receive, DEFAULT_HUD_LAYOUT.receive),
    set: clampHudTransform(layout.set, DEFAULT_HUD_LAYOUT.set),
    jumpSpike: clampHudTransform(layout.jumpSpike, DEFAULT_HUD_LAYOUT.jumpSpike),
  };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(HUD_LAYOUT_STORAGE_KEY, JSON.stringify(sanitized));
      window.dispatchEvent(new CustomEvent('spike-hud-layout-updated'));
    } catch {
      // Ignora erro de quota
    }
  }
  return sanitized;
}

export function resetHudLayout(): HudLayoutConfig {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(HUD_LAYOUT_STORAGE_KEY);
      window.dispatchEvent(new CustomEvent('spike-hud-layout-updated'));
    } catch {
      // Ignora erro de storage
    }
  }
  return loadHudLayout();
}
