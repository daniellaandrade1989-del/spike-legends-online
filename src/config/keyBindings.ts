/**
 * Spike Legends Online — Sistema de Mapeamento de Teclas e Controles
 * Módulo puro para leitura, persistência, formatação PT-BR e troca sem conflitos.
 */

export type GameActionId =
  | 'moveLeft'
  | 'moveRight'
  | 'moveUp'
  | 'moveDown'
  | 'jump'
  | 'spike'
  | 'set'
  | 'receive'
  | 'dive'
  | 'toggleFootMode'
  | 'ultimate'
  | 'serveFloat'
  | 'serveUnderhand'
  | 'serveJump'
  | 'pause';

export const MOUSE_BUTTON_CODES = {
  LEFT: 'Mouse0',
  MIDDLE: 'Mouse1',
  RIGHT: 'Mouse2',
} as const;

export interface KeyBindingsConfig {
  actions: Record<GameActionId, string>;
  mouseEnabled: boolean;
  mouseSteerEnabled: boolean;
  touchHandedness: 'right' | 'left';
}

export interface GameActionMeta {
  id: GameActionId;
  label: string;
  description: string;
  category: 'Movimento' | 'Ações na Quadra' | 'Saques & Sistema';
  accent: 'orange' | 'cyan' | 'amber' | 'slate';
}

export const KEY_BINDINGS_STORAGE_KEY = 'spike_legends_key_bindings_v1';

export const DEFAULT_ACTION_KEYS: Record<GameActionId, string> = {
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  moveUp: 'KeyW',
  moveDown: 'KeyS',
  jump: 'Space',
  spike: 'KeyJ',
  set: 'KeyE',
  receive: 'KeyR',
  dive: 'ShiftLeft',
  toggleFootMode: 'KeyC',
  ultimate: 'KeyQ',
  serveFloat: 'Digit1',
  serveUnderhand: 'Digit2',
  serveJump: 'Digit3',
  pause: 'Escape',
};

export const SECONDARY_ALIASES: Partial<Record<GameActionId, string[]>> = {
  moveLeft: ['ArrowLeft'],
  moveRight: ['ArrowRight'],
  moveUp: ['ArrowUp'],
  moveDown: ['ArrowDown'],
  spike: ['KeyF'],
  dive: ['ShiftRight', 'KeyK'],
  pause: ['KeyP'],
};

export const GAME_ACTION_META: GameActionMeta[] = [
  {
    id: 'moveLeft',
    label: 'Recuar / Esquerda',
    description: 'Move para trás no corredor central ou mira Largadinha ao cortar.',
    category: 'Movimento',
    accent: 'slate',
  },
  {
    id: 'moveRight',
    label: 'Avançar / Direita',
    description: 'Aproxima-se da rede para o ataque ou bloqueio.',
    category: 'Movimento',
    accent: 'slate',
  },
  {
    id: 'moveUp',
    label: 'Mirar Fundo',
    description: 'Direciona cortadas para o fundo da quadra adversária.',
    category: 'Movimento',
    accent: 'slate',
  },
  {
    id: 'moveDown',
    label: 'Mirar Curto',
    description: 'Ajusta a trajetória de ataque e postura defensiva.',
    category: 'Movimento',
    accent: 'slate',
  },
  {
    id: 'jump',
    label: 'Pular / Atacar no Ar',
    description: 'No chão: salta (ou bloqueia na rede). No ar: executa o ataque (Cortada).',
    category: 'Ações na Quadra',
    accent: 'cyan',
  },
  {
    id: 'spike',
    label: 'Atacar / Pular / Sacar',
    description: 'Botão unificado: salta se estiver no chão, corta se estiver no ar e carrega o saque.',
    category: 'Ações na Quadra',
    accent: 'orange',
  },
  {
    id: 'set',
    label: 'Toque / Levantamento',
    description: 'Levantamento parabólico alto e próximo à rede na zona ideal de ataque do parceiro.',
    category: 'Ações na Quadra',
    accent: 'cyan',
  },
  {
    id: 'receive',
    label: 'Manchete / Recepção',
    description: 'Aperte no timing da chegada da bola para defender saques e cortadas.',
    category: 'Ações na Quadra',
    accent: 'cyan',
  },
  {
    id: 'dive',
    label: 'Peixinho (Mergulho)',
    description: 'Mergulho rápido na areia/quadra para alcançar bolas distantes.',
    category: 'Ações na Quadra',
    accent: 'cyan',
  },
  {
    id: 'toggleFootMode',
    label: 'Alternar Shark Attack (Pé)',
    description: 'Alterna o ataque entre cortada clássica (mão) e Shark Attack (chute).',
    category: 'Ações na Quadra',
    accent: 'orange',
  },
  {
    id: 'ultimate',
    label: 'Ativar Super Attack (5s)',
    description: 'Ativa o modo Super Attack por 5 segundos quando a barra estiver carregada (100%).',
    category: 'Ações na Quadra',
    accent: 'amber',
  },
  {
    id: 'serveFloat',
    label: 'Saque Normal / Flutuante',
    description: 'Após o apito do árbitro, inicia imediatamente o Saque Normal/Flutuante sem salto.',
    category: 'Saques & Sistema',
    accent: 'cyan',
  },
  {
    id: 'serveUnderhand',
    label: 'Saque Por Baixo',
    description: 'Após o apito do árbitro, executa o saque alto por baixo para colocar a bola em jogo.',
    category: 'Saques & Sistema',
    accent: 'slate',
  },
  {
    id: 'serveJump',
    label: 'Saque Viagem (Forçado)',
    description: 'Após o apito do árbitro, lança a bola alto e salta para o Saque Viagem potente.',
    category: 'Saques & Sistema',
    accent: 'orange',
  },
  {
    id: 'pause',
    label: 'Pausar Partida',
    description: 'Abre ou fecha o menu de pausa durante o jogo.',
    category: 'Saques & Sistema',
    accent: 'slate',
  },
];

export function createDefaultKeyBindings(): KeyBindingsConfig {
  return {
    actions: { ...DEFAULT_ACTION_KEYS },
    mouseEnabled: true,
    mouseSteerEnabled: false,
    touchHandedness: 'right',
  };
}

/**
 * Preset "Modo Só Mouse": permite jogar usando apenas o mouse
 * (Cursor move na quadra + LMB Cortar/Atacar + RMB Pular/Bloquear).
 */
export function createMouseOnlyBindings(): KeyBindingsConfig {
  let cfg = createDefaultKeyBindings();
  cfg = rebindAction(cfg, 'spike', MOUSE_BUTTON_CODES.LEFT);
  cfg = rebindAction(cfg, 'jump', MOUSE_BUTTON_CODES.RIGHT);
  return {
    ...cfg,
    mouseEnabled: true,
    mouseSteerEnabled: true,
  };
}

/**
 * Reatribui uma tecla para `actionId`. Se outra ação já usava `newCode`,
 * faz a troca automática entre as duas ações para nunca haver duplicidade.
 */
export function rebindAction(
  config: KeyBindingsConfig,
  actionId: GameActionId,
  newCode: string,
): KeyBindingsConfig {
  const trimmed = newCode.trim();
  if (!trimmed) return config;

  const previousCode = config.actions[actionId];
  const nextActions: Record<GameActionId, string> = { ...config.actions };

  for (const id of Object.keys(nextActions) as GameActionId[]) {
    if (id !== actionId && nextActions[id] === trimmed) {
      nextActions[id] = previousCode;
    }
  }
  nextActions[actionId] = trimmed;

  return {
    ...config,
    actions: nextActions,
  };
}

/**
 * Verifica se o código de tecla pressionado corresponde à ação configurada.
 * Aliases secundários (ex: Setas além de WASD) só disparam se não estiverem
 * mapeados explicitamente para outra ação pelo jogador.
 */
export function matchesActionKey(
  config: KeyBindingsConfig,
  actionId: GameActionId,
  code: string,
): boolean {
  if (config.actions[actionId] === code) {
    return true;
  }

  const aliases = SECONDARY_ALIASES[actionId];
  if (!aliases || !aliases.includes(code)) {
    return false;
  }

  // Se o jogador mapeou esse código explicitamente em qualquer ação, respeita o mapeamento explícito
  for (const id of Object.keys(config.actions) as GameActionId[]) {
    if (config.actions[id] === code) {
      return id === actionId;
    }
  }
  return true;
}

/**
 * Verifica se qualquer tecla mapeada (ou alias livre) corresponde à ação na coleção `pressedKeys`.
 */
export function isActionPressed(
  config: KeyBindingsConfig,
  actionId: GameActionId,
  pressedKeys: ReadonlySet<string>,
): boolean {
  if (pressedKeys.has(config.actions[actionId])) {
    return true;
  }
  const aliases = SECONDARY_ALIASES[actionId];
  if (!aliases) return false;

  for (const alias of aliases) {
    if (!pressedKeys.has(alias)) continue;
    let claimedElsewhere = false;
    for (const id of Object.keys(config.actions) as GameActionId[]) {
      if (config.actions[id] === alias && id !== actionId) {
        claimedElsewhere = true;
        break;
      }
    }
    if (!claimedElsewhere) return true;
  }
  return false;
}

const KEY_CODE_LABELS: Record<string, string> = {
  Space: 'Espaço',
  ShiftLeft: 'Shift Esq.',
  ShiftRight: 'Shift Dir.',
  ControlLeft: 'Ctrl Esq.',
  ControlRight: 'Ctrl Dir.',
  AltLeft: 'Alt Esq.',
  AltRight: 'Alt Dir.',
  Enter: 'Enter',
  NumpadEnter: 'Enter Num',
  Escape: 'Esc',
  Tab: 'Tab',
  Backspace: 'Backspace',
  ArrowLeft: 'Seta ←',
  ArrowRight: 'Seta →',
  ArrowUp: 'Seta ↑',
  ArrowDown: 'Seta ↓',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Minus: '-',
  Equal: '=',
  Mouse0: 'Mouse Esq. (LMB)',
  Mouse1: 'Mouse Meio',
  Mouse2: 'Mouse Dir. (RMB)',
};

export function formatKeyCode(code: string): string {
  if (KEY_CODE_LABELS[code]) return KEY_CODE_LABELS[code];
  if (code.startsWith('Key') && code.length === 4) {
    return code.slice(3).toUpperCase();
  }
  if (code.startsWith('Digit') && code.length === 6) {
    return code.slice(5);
  }
  if (code.startsWith('Numpad')) {
    return `Num ${code.slice(6)}`;
  }
  return code;
}

export function sanitizeKeyBindings(raw: unknown): KeyBindingsConfig {
  const base = createDefaultKeyBindings();
  if (!raw || typeof raw !== 'object') return base;
  const obj = raw as Partial<KeyBindingsConfig>;

  if (obj.actions && typeof obj.actions === 'object') {
    for (const id of Object.keys(base.actions) as GameActionId[]) {
      const candidate = (obj.actions as Record<string, unknown>)[id];
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        base.actions[id] = candidate.trim();
      }
    }
  }

  // Garante unicidade caso um JSON editado manualmente tenha duplicatas
  const seen = new Set<string>();
  for (const id of Object.keys(base.actions) as GameActionId[]) {
    if (seen.has(base.actions[id])) {
      base.actions[id] = DEFAULT_ACTION_KEYS[id];
    }
    seen.add(base.actions[id]);
  }

  if (typeof obj.mouseEnabled === 'boolean') {
    base.mouseEnabled = obj.mouseEnabled;
  }
  if (typeof obj.mouseSteerEnabled === 'boolean') {
    base.mouseSteerEnabled = obj.mouseSteerEnabled;
  }
  if (obj.touchHandedness === 'left' || obj.touchHandedness === 'right') {
    base.touchHandedness = obj.touchHandedness;
  }
  return base;
}

export function loadKeyBindings(): KeyBindingsConfig {
  if (typeof window === 'undefined' || !window.localStorage) {
    return createDefaultKeyBindings();
  }
  try {
    const raw = window.localStorage.getItem(KEY_BINDINGS_STORAGE_KEY);
    if (!raw) return createDefaultKeyBindings();
    return sanitizeKeyBindings(JSON.parse(raw));
  } catch {
    return createDefaultKeyBindings();
  }
}

export function saveKeyBindings(config: KeyBindingsConfig): KeyBindingsConfig {
  const clean = sanitizeKeyBindings(config);
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(KEY_BINDINGS_STORAGE_KEY, JSON.stringify(clean));
    } catch {
      // Ignora erro de quota do navegador
    }
  }
  return clean;
}

export function resetKeyBindings(): KeyBindingsConfig {
  return saveKeyBindings(createDefaultKeyBindings());
}
