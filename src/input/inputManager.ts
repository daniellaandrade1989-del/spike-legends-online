/**
 * Spike Legends Online — InputManager Unificado (Teclado + Mouse LMB/RMB + Touch)
 * Permite mapear qualquer ação livremente para Botão Esquerdo (Mouse0 / LMB) e Botão Direito (Mouse2 / RMB),
 * suportando inclusive jogar usando apenas o mouse (com direção opcional pelo cursor).
 */
import type { ServeType } from '../config/gameConfig.ts';
import {
  isActionPressed,
  matchesActionKey,
  MOUSE_BUTTON_CODES,
  type GameActionId,
  type KeyBindingsConfig,
} from '../config/keyBindings.ts';

export const SIMPLE_SERVE_TAP_MAX_MS = 220;
/** Regra A (Saque): 0.0s a 0.3s (Toque Rápido) -> Saque Por Baixo ('underhand') */
export const DEFAULT_SERVE_UNDERHAND_MAX_SEC = 0.3;
/** Regra A (Saque): 0.4s a 1.0s (Charge Médio) -> Saque Flutuante ('float') */
export const DEFAULT_SERVE_FLOAT_MAX_SEC = 1.0;
/** Regra A (Saque): Acima de 1.0s / >= 1.1s (Charge Máximo) -> Saque Viagem ('jump_serve'), limite máximo 1.5s */
export const DEFAULT_SERVE_JUMP_MIN_SEC = 1.1;
export const DEFAULT_MAX_SERVE_CHARGE_SEC = 1.5;

// Aliases de compatibilidade
export const DEFAULT_TIME_FOR_UNDERHAND_SEC = DEFAULT_SERVE_UNDERHAND_MAX_SEC;
export const DEFAULT_TIME_FOR_FLOAT_SEC = DEFAULT_SERVE_FLOAT_MAX_SEC;
export const DEFAULT_TIME_FOR_JUMP_SERVE_SEC = DEFAULT_MAX_SERVE_CHARGE_SEC;

/**
 * Combinação Direcional + Botão Principal ('F' / Touch Action) no Contexto de Partida (Regra B):
 * - 'neutral': Pressionar 'F' sozinho -> Bloqueio / Ataque Padrão
 * - 'down_short': Pressionar 'F' + Seta para BAIXO -> Super Ataque / Bloqueio Curto (deixadinha / bloqueio na rede)
 * - 'back_deep': Pressionar 'F' + Seta para TRÁS (lado oposto) -> Super Ataque / Bloqueio Fundo de Quadra
 */
export type DirectionalActionCombo = 'none' | 'neutral' | 'down_short' | 'back_deep';

/**
 * Comandos contextuais emitidos pelo InputManager (Tecla 'F' / Touch Action Button):
 * - Contexto de Saque (Hold máx 1.5s):
 *   - 'serve_underhand_quick' (0.0s a 0.3s): Saque Por Baixo
 *   - 'serve_float_medium' (0.4s a 1.0s): Saque Flutuante
 *   - 'serve_jump_max' (> 1.0s até 1.5s): Saque Viagem
 * - Contexto de Partida (Direcional + Botão 'F', sem contagem de múltiplos toques):
 *   - 'single_tap' ('F' Neutro): Bloqueio / Ataque Padrão
 *   - 'double_tap_low_block' ('F' + Seta para BAIXO): Super Ataque / Bloqueio Curto
 *   - 'triple_tap_deep_block' ('F' + Seta para TRÁS): Super Ataque / Bloqueio Fundo de Quadra
 */
export type HybridActionCommand =
  | 'none'
  | 'single_tap'
  | 'double_tap_low_block'
  | 'triple_tap_deep_block'
  | 'hold_1s_underhand_serve'
  | 'hold_3s_jump_serve'
  | 'serve_underhand_quick'
  | 'serve_float_medium'
  | 'serve_jump_max';

export type VirtualButtonId =
  | 'moveLeft'
  | 'moveRight'
  | 'jump'
  | 'spike'
  | 'jumpSpike'
  | 'set'
  | 'serve'
  | 'serveJump'
  | 'receive'
  | 'dive'
  | 'ultimate';

export interface MobileDetectionInput {
  userAgent?: string;
  maxTouchPoints?: number;
  coarsePointer?: boolean;
  mobileUaData?: boolean;
}

/**
 * Identifica em tempo real se o jogo está rodando em um dispositivo Mobile (Android, iOS ou tela touch mobile)
 * ou em um Desktop (Windows / macOS / Linux Web PC).
 */
export function detectMobilePlatform(input?: MobileDetectionInput): boolean {
  const ua =
    input?.userAgent !== undefined
      ? input.userAgent
      : typeof navigator !== 'undefined'
        ? navigator.userAgent || ''
        : '';

  if (input?.mobileUaData === true) return true;
  if (
    input?.mobileUaData === undefined &&
    typeof navigator !== 'undefined' &&
    (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile === true
  ) {
    return true;
  }

  const isMobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
  if (isMobileUserAgent) return true;

  // iPadOS 13+ reporta Macintosh no userAgent mas possui múltiplos pontos de toque e ponteiro coarse
  const touchPoints =
    input?.maxTouchPoints !== undefined
      ? input.maxTouchPoints
      : typeof navigator !== 'undefined'
        ? navigator.maxTouchPoints || 0
        : 0;
  const coarsePointer =
    input?.coarsePointer !== undefined
      ? input.coarsePointer
      : typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(pointer: coarse)').matches
        : false;

  const screenWidth =
    typeof window !== 'undefined' && Number.isFinite(window.innerWidth) ? window.innerWidth : 1280;
  const screenHeight =
    typeof window !== 'undefined' && Number.isFinite(window.innerHeight) ? window.innerHeight : 720;

  if (touchPoints > 0 && (coarsePointer || screenWidth <= 960 || screenHeight <= 560)) {
    return true;
  }

  if (input === undefined && typeof window !== 'undefined') {
    try {
      const forceMobileParam = new URLSearchParams(window.location.search).get('mobile') === '1';
      if (forceMobileParam || Math.min(screenWidth, screenHeight) <= 540 || screenWidth <= 860) {
        return true;
      }
    } catch {
      // Ignora caso window.location não esteja disponível
    }
  }

  return false;
}

export class DeviceManager {
  public isMobile: boolean;
  private overrideMobile: boolean | null = null;
  private listeners = new Set<(isMobile: boolean) => void>();

  constructor() {
    this.isMobile = detectMobilePlatform();
    if (typeof window !== 'undefined') {
      const onChange = () => this.refresh();
      window.addEventListener('resize', onChange);
      if (typeof window.matchMedia === 'function') {
        try {
          const mql = window.matchMedia('(pointer: coarse)');
          if (typeof mql.addEventListener === 'function') {
            mql.addEventListener('change', onChange);
          }
        } catch {
          // Ignora ambientes sem matchMedia completo
        }
      }
    }
  }

  public refresh(): boolean {
    const next = this.overrideMobile !== null ? this.overrideMobile : detectMobilePlatform();
    if (next !== this.isMobile) {
      this.isMobile = next;
      this.listeners.forEach((cb) => cb(this.isMobile));
    }
    return this.isMobile;
  }

  public setMobileOverride(override: boolean | null): void {
    this.overrideMobile = override;
    this.refresh();
  }

  public subscribe(cb: (isMobile: boolean) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}

export const deviceManager = new DeviceManager();

export interface UnifiedInputFrame {
  /** Direção horizontal unificada (-1 = Esquerda/Trás, 0 = Parado, +1 = Direita/Frente) alimentada por Teclado ou Touch */
  horizontalInput: number;
  moveX: number;
  moveZ: number;
  sprint: boolean;
  jump: boolean;
  jumpHeld: boolean;
  spike: boolean;
  spikeHeld?: boolean;
  /** Eixo vertical direcional (-1 = Seta para Baixo, 0 = Neutro, +1 = Seta para Cima) lido simultaneamente ao botão 'F' */
  verticalInput?: number;
  /** Seta para BAIXO pressionada simultaneamente com o botão 'F' */
  downHeld?: boolean;
  /** Combo direcional resolvido instantaneamente ao pressionar 'F' ('neutral' | 'down_short' | 'back_deep') */
  directionalCombo?: DirectionalActionCombo;
  /** Comando contextual resolvido pelo InputManager */
  hybridCommand?: HybridActionCommand;
  /** Mantido em 0 (contagem de múltiplos toques desativada em favor do input direcional imediato) */
  tapCount?: number;
  /** Tempo atual segurando o botão de ação (em segundos, limitado a 1.5s) */
  holdTimer?: number;
  /** Estado PreparingServe ativo enquanto o jogador mantém o botão de Saque/Ataque pressionado */
  preparingServe?: boolean;
  /** Tempo atual acumulado no temporizador de saque (chargeTime em segundos, máx 1.5s) enquanto segura o botão */
  serveChargeTime?: number;
  /** Tempo final acumulado (em segundos, máx 1.5s) disparado no exato frame em que o jogador solta o botão de saque */
  serveReleaseChargeTime?: number;
  /** Estágio de saque correspondente ao tempo carregado ('underhand' [0.0-0.3s] | 'float' [0.4-1.0s] | 'jump_serve' [>1.0s]) */
  serveChargeStage?: ServeType;
  /** Clique rápido (<= 0.3s) no botão de ação para Saque Por Baixo */
  serveQuickTap?: boolean;
  /** Segurar botão de ação (> 1.0s) para lançar a bola alto e saltar no Saque Viagem */
  serveJumpCharge?: boolean;
  /** Tecla dedicada de Saque Normal / Flutuante acionada após o apito */
  serveNormalTrigger?: boolean;
  /** Tecla dedicada de Saque Por Baixo acionada após o apito */
  serveUnderhandTrigger?: boolean;
  /** Tecla dedicada de Saque Viagem / Forçado acionada após o apito */
  serveJumpTrigger?: boolean;
  spikeHoldDurationMs?: number;
  /** Botão dedicado ou Tecla E para Toque / Levantamento (Set parabólico alto na zona ideal de ataque) */
  set?: boolean;
  dive: boolean;
  receive: boolean;
  ultimate: boolean;
  /** Mira dinâmica do ataque baseada no ponteiro do mouse (0 = perto da rede/largadinha, 1 = fundo da quadra) */
  mouseAimRatio?: number;
  /** Coordenada exata do ponteiro do mouse convertida para o mundo do jogo (ScreenToWorldPoint) */
  mouseWorldPos?: { x: number; y: number };
}

export interface HotkeyTrigger {
  serveFloat: boolean;
  serveUnderhand: boolean;
  serveJump: boolean;
  toggleFootMode: boolean;
  pause: boolean;
}

export interface TouchInputStateLike {
  moveX: number;
  moveZ: number;
  moveLeftHeld?: boolean;
  moveRightHeld?: boolean;
  jumpQueued: boolean;
  jumpHeld: boolean;
  spikeQueued: boolean;
  spikeHeld?: boolean;
  setQueued?: boolean;
  serveNormalQueued?: boolean;
  serveJumpQueued?: boolean;
  diveQueued: boolean;
  receiveQueued: boolean;
  ultimateQueued: boolean;
}

export function mouseButtonToCode(button: number): string | null {
  if (button === 0) return MOUSE_BUTTON_CODES.LEFT;
  if (button === 1) return MOUSE_BUTTON_CODES.MIDDLE;
  if (button === 2) return MOUSE_BUTTON_CODES.RIGHT;
  return null;
}

export function isMouseCode(code: string): boolean {
  return code === 'Mouse0' || code === 'Mouse1' || code === 'Mouse2';
}

export class InputManager {
  public isMobile: boolean = deviceManager.isMobile;
  public horizontalInput = 0;
  /** Eixo vertical (-1 = Seta para Baixo, 0 = Neutro, +1 = Seta para Cima) */
  public verticalInput = 0;

  /** Mantidos por compatibilidade legada (sempre 0: sem espera de múltiplos toques) */
  public tapCount = 0;
  public tapTimer = 0;
  /** Temporizador (em segundos, máx 1.5s) que mede o tempo que o botão de Ação ('F' / Touch) fica pressionado */
  public holdTimer = 0;
  /** Temporizador de carga do saque (0.0s a 1.5s) */
  public chargeTime = 0;

  /** Limite máximo de tempo (em segundos) para o Saque Por Baixo (0.0s a 0.3s -> Underhand Serve) */
  public timeForUnderhand: number = DEFAULT_SERVE_UNDERHAND_MAX_SEC;
  /** Limite máximo de tempo (em segundos) para o Saque Flutuante (0.4s a 1.0s -> Float Serve) */
  public timeForFloat: number = DEFAULT_SERVE_FLOAT_MAX_SEC;
  /** Limiar (em segundos) para o Saque Viagem (> 1.0s / >= 1.1s -> Jump Serve) */
  public timeForJumpServe: number = DEFAULT_SERVE_JUMP_MIN_SEC;
  /** Teto máximo do temporizador de carga do saque (1.5s) */
  public maxServeChargeTime: number = DEFAULT_MAX_SERVE_CHARGE_SEC;

  /** Indica se o jogador está segurando o botão de ação no estado PreparingServe */
  public isPreparingServe = false;

  private pressedCodes = new Set<string>();
  private edgeActions = new Set<GameActionId>();
  private mouseSteerMoveX = 0;
  private mobileLeftHeld = false;
  private mobileRightHeld = false;
  private mobileDownHeld = false;
  private virtualJumpHeld = false;
  private virtualSpikeHeld = false;
  private mouseAimRatio: number | undefined = undefined;
  private mouseWorldPos: { x: number; y: number } | undefined = undefined;
  private spikeDownAtMs: number | null = null;
  private lastChargeSampleMs: number | null = null;
  private lastReleasedChargeTime: number | null = null;
  private spikeTriggerCodes = new Set<string>();
  private queuedQuickServeTap = false;
  private pendingHybridCommand: HybridActionCommand = 'none';
  private pendingDirectionalCombo: DirectionalActionCombo = 'none';

  public reset(): void {
    this.pressedCodes.clear();
    this.edgeActions.clear();
    this.mouseSteerMoveX = 0;
    this.horizontalInput = 0;
    this.verticalInput = 0;
    this.tapCount = 0;
    this.tapTimer = 0;
    this.holdTimer = 0;
    this.chargeTime = 0;
    this.isPreparingServe = false;
    this.mobileLeftHeld = false;
    this.mobileRightHeld = false;
    this.mobileDownHeld = false;
    this.virtualJumpHeld = false;
    this.virtualSpikeHeld = false;
    this.spikeDownAtMs = null;
    this.lastChargeSampleMs = null;
    this.lastReleasedChargeTime = null;
    this.spikeTriggerCodes.clear();
    this.queuedQuickServeTap = false;
    this.pendingHybridCommand = 'none';
    this.pendingDirectionalCombo = 'none';
  }

  /**
   * Regra A — Contexto de Saque (Hold - Máximo 1.5s):
   * Avalia qual tipo de saque deve ser disparado ao soltar o botão 'F':
   * - Soltar entre 0.0s e 0.3s (`<= 0.3s`, Toque Rápido): Executa o Saque Por Baixo ('underhand')
   * - Soltar entre 0.4s e 1.0s (`> 0.3s && <= 1.0s`, Charge Médio): Executa o Saque Flutuante ('float')
   * - Soltar acima de 1.1s (`> 1.0s`, Charge Máximo, limitado a 1.5s): Executa o Saque Viagem ('jump_serve')
   */
  public evaluateServeCharge(chargeTimeSec: number = this.chargeTime): ServeType {
    const clamped = Math.max(0, Math.min(this.maxServeChargeTime, chargeTimeSec));
    if (clamped <= this.timeForUnderhand) {
      return 'underhand';
    } else if (clamped <= this.timeForFloat) {
      return 'float';
    } else {
      return 'jump_serve';
    }
  }

  /**
   * Regra B — Contexto de Partida (Direcional + Botão 'F' simultâneos, sem Double/Triple Tap):
   * Avalia os eixos direcionais no exato momento em que o botão 'F' é pressionado:
   * - 'F' + Seta para BAIXO (`verticalInput < -0.35` ou tecla S/ArrowDown): Super Ataque / Bloqueio Curto ('down_short')
   * - 'F' + Seta para TRÁS (`horizontalInput` oposto à rede): Super Ataque / Bloqueio Fundo de Quadra ('back_deep')
   * - 'F' sozinho (Neutro): Bloqueio / Ataque Padrão ('neutral')
   */
  public evaluateDirectionalCombo(
    horizontalAxis: number = this.horizontalInput,
    verticalAxis: number = this.verticalInput,
    teamSide: 'left' | 'right' = 'left',
  ): DirectionalActionCombo {
    if (verticalAxis < -0.35) {
      return 'down_short';
    }
    const isPressingBack =
      teamSide === 'left' ? horizontalAxis < -0.35 : horizontalAxis > 0.35;
    if (isPressingBack) {
      return 'back_deep';
    }
    return 'neutral';
  }

  /**
   * Atualiza o temporizador `holdTimer` / `chargeTime` (limitado ao máximo de 1.5s) usando `deltaTime`.
   */
  public updateChargeTimer(deltaTimeSec: number): number {
    this.updateHybridTimers(deltaTimeSec);
    return this.chargeTime;
  }

  public updateHybridTimers(deltaTimeSec: number): HybridActionCommand {
    const safeDt = Number.isFinite(deltaTimeSec) && deltaTimeSec > 0 ? deltaTimeSec : 0;

    if (this.isPreparingServe) {
      this.holdTimer = Math.min(this.maxServeChargeTime, this.holdTimer + safeDt);
      this.chargeTime = this.holdTimer;
    } else {
      this.holdTimer = 0;
      this.chargeTime = 0;
    }

    return this.pendingHybridCommand;
  }

  public getPressedCodes(): ReadonlySet<string> {
    return this.pressedCodes;
  }

  public setMobileMoveButton(direction: 'left' | 'right', pressed: boolean): void {
    if (direction === 'left') {
      this.mobileLeftHeld = pressed;
    } else {
      this.mobileRightHeld = pressed;
    }
    this.horizontalInput =
      this.mobileLeftHeld && !this.mobileRightHeld
        ? -1
        : this.mobileRightHeld && !this.mobileLeftHeld
          ? 1
          : 0;
  }

  /**
   * Recebe eventos de toque (OnPointerDown) dos botões virtuais do MobileControlsCanvas
   * e traduz para as mesmas variáveis e ações do teclado/mouse.
   */
  public OnPointerDown(
    button: VirtualButtonId,
    touchBridge?: TouchInputStateLike,
    nowMs: number = typeof performance !== 'undefined' ? performance.now() : Date.now(),
  ): void {
    switch (button) {
      case 'moveLeft':
        this.setMobileMoveButton('left', true);
        if (touchBridge) {
          touchBridge.moveLeftHeld = true;
          touchBridge.moveX = this.horizontalInput;
        }
        break;
      case 'moveRight':
        this.setMobileMoveButton('right', true);
        if (touchBridge) {
          touchBridge.moveRightHeld = true;
          touchBridge.moveX = this.horizontalInput;
        }
        break;
      case 'jump':
        this.edgeActions.add('jump');
        this.virtualJumpHeld = true;
        if (touchBridge) {
          touchBridge.jumpQueued = true;
          touchBridge.jumpHeld = true;
        }
        break;
      case 'jumpSpike':
        this.edgeActions.add('jump');
        this.edgeActions.add('spike');
        this.virtualJumpHeld = true;
        this.virtualSpikeHeld = true;
        this.recordSpikeDown('TouchJumpSpike', nowMs);
        if (touchBridge) {
          touchBridge.jumpQueued = true;
          touchBridge.jumpHeld = true;
          touchBridge.spikeQueued = true;
          touchBridge.spikeHeld = true;
        }
        break;
      case 'spike':
      case 'serve':
        this.edgeActions.add('spike');
        this.virtualSpikeHeld = true;
        this.recordSpikeDown('TouchSpike', nowMs);
        if (touchBridge) {
          touchBridge.spikeQueued = true;
          touchBridge.spikeHeld = true;
        }
        break;
      case 'set':
        this.edgeActions.add('set');
        if (touchBridge) {
          touchBridge.setQueued = true;
        }
        break;
      case 'serveJump':
        this.edgeActions.add('serveJump');
        if (touchBridge) {
          touchBridge.serveJumpQueued = true;
        }
        break;
      case 'receive':
        this.edgeActions.add('receive');
        if (touchBridge) {
          touchBridge.receiveQueued = true;
        }
        break;
      case 'dive':
        this.edgeActions.add('dive');
        if (touchBridge) {
          touchBridge.diveQueued = true;
        }
        break;
      case 'ultimate':
        this.edgeActions.add('ultimate');
        if (touchBridge) {
          touchBridge.ultimateQueued = true;
        }
        break;
    }
  }

  /**
   * Recebe eventos de liberação de toque (OnPointerUp) dos botões virtuais do MobileControlsCanvas.
   */
  public OnPointerUp(
    button: VirtualButtonId,
    touchBridge?: TouchInputStateLike,
    nowMs: number = typeof performance !== 'undefined' ? performance.now() : Date.now(),
  ): void {
    switch (button) {
      case 'moveLeft':
        this.setMobileMoveButton('left', false);
        if (touchBridge) {
          touchBridge.moveLeftHeld = false;
          touchBridge.moveX = this.horizontalInput;
        }
        break;
      case 'moveRight':
        this.setMobileMoveButton('right', false);
        if (touchBridge) {
          touchBridge.moveRightHeld = false;
          touchBridge.moveX = this.horizontalInput;
        }
        break;
      case 'jump':
        this.virtualJumpHeld = false;
        if (touchBridge) {
          touchBridge.jumpHeld = false;
        }
        break;
      case 'jumpSpike':
        this.virtualJumpHeld = false;
        this.virtualSpikeHeld = false;
        this.recordSpikeUp('TouchJumpSpike', nowMs);
        if (touchBridge) {
          touchBridge.jumpHeld = false;
          touchBridge.spikeHeld = false;
        }
        break;
      case 'spike':
      case 'serve':
        this.virtualSpikeHeld = false;
        this.recordSpikeUp('TouchSpike', nowMs);
        if (touchBridge) {
          touchBridge.spikeHeld = false;
        }
        break;
      default:
        break;
    }
  }

  public onPointerDown(
    button: VirtualButtonId,
    touchBridge?: TouchInputStateLike,
    nowMs?: number,
  ): void {
    this.OnPointerDown(button, touchBridge, nowMs);
  }

  public onPointerUp(
    button: VirtualButtonId,
    touchBridge?: TouchInputStateLike,
    nowMs?: number,
  ): void {
    this.OnPointerUp(button, touchBridge, nowMs);
  }

  public setMouseSteerDirection(moveX: number): void {
    this.mouseSteerMoveX = Math.max(-1, Math.min(1, moveX));
  }

  public setMouseAimRatio(ratio: number | undefined): void {
    if (ratio === undefined || !Number.isFinite(ratio)) {
      this.mouseAimRatio = undefined;
    } else {
      this.mouseAimRatio = Math.max(0, Math.min(1, ratio));
    }
  }

  public getMouseAimRatio(): number | undefined {
    return this.mouseAimRatio;
  }

  public setMouseWorldPos(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.mouseWorldPos = { x, y };
  }

  public getMouseWorldPos(): { x: number; y: number } | undefined {
    return this.mouseWorldPos ? { ...this.mouseWorldPos } : undefined;
  }

  private recordSpikeDown(code: string, nowMs: number): void {
    this.spikeTriggerCodes.add(code);
    if (this.spikeDownAtMs === null) {
      this.spikeDownAtMs = nowMs;
      this.lastChargeSampleMs = nowMs;
      this.holdTimer = 0;
      this.chargeTime = 0;
      this.isPreparingServe = true;
    }
  }

  private recordSpikeUp(code: string, nowMs: number): void {
    if (!this.spikeTriggerCodes.delete(code)) return;
    if (this.spikeTriggerCodes.size === 0 && this.spikeDownAtMs !== null) {
      const heldMs = Math.max(0, nowMs - this.spikeDownAtMs);
      if (this.lastChargeSampleMs !== null && nowMs >= this.lastChargeSampleMs) {
        this.holdTimer += (nowMs - this.lastChargeSampleMs) / 1000;
      } else {
        this.holdTimer = Math.max(this.holdTimer, this.chargeTime, heldMs / 1000);
      }
      // Regra A: Limita chargeTime ao teto máximo de 1.5s para manter o dinamismo da partida
      this.holdTimer = Math.min(this.maxServeChargeTime, this.holdTimer);
      this.chargeTime = Math.min(this.maxServeChargeTime, Math.max(this.chargeTime, this.holdTimer));
      const finalHoldSec = this.chargeTime;
      this.lastReleasedChargeTime = finalHoldSec;

      if (heldMs <= SIMPLE_SERVE_TAP_MAX_MS) {
        this.queuedQuickServeTap = true;
      }

      // Avaliação de Saque ao Soltar o Botão ('F' / Touch Action Button):
      // - Soltar entre 0.0s e 0.3s (<= 0.3s): Saque Por Baixo ('serve_underhand_quick')
      // - Soltar entre 0.4s e 1.0s (> 0.3s e <= 1.0s): Saque Flutuante ('serve_float_medium')
      // - Soltar acima de 1.1s (> 1.0s até 1.5s): Saque Viagem ('serve_jump_max' / 'hold_3s_jump_serve')
      if (finalHoldSec <= this.timeForUnderhand) {
        this.pendingHybridCommand = 'serve_underhand_quick';
      } else if (finalHoldSec <= this.timeForFloat) {
        this.pendingHybridCommand = 'serve_float_medium';
      } else {
        this.pendingHybridCommand = 'serve_jump_max';
      }

      // Para o temporizador ao soltar o botão e zera o holdTimer / chargeTime ativo
      this.isPreparingServe = false;
      this.holdTimer = 0;
      this.chargeTime = 0;
      this.spikeDownAtMs = null;
      this.lastChargeSampleMs = null;
    }
  }

  public handleKeyDown(
    code: string,
    config: KeyBindingsConfig,
    nowMs: number = typeof performance !== 'undefined' ? performance.now() : Date.now(),
  ): HotkeyTrigger {
    const trigger: HotkeyTrigger = {
      serveFloat: false,
      serveUnderhand: false,
      serveJump: false,
      toggleFootMode: false,
      pause: false,
    };

    const wasDown = this.pressedCodes.has(code);
    this.pressedCodes.add(code);

    if (!wasDown) {
      if (matchesActionKey(config, 'pause', code)) trigger.pause = true;
      if (matchesActionKey(config, 'jump', code)) this.edgeActions.add('jump');
      if (matchesActionKey(config, 'spike', code)) {
        this.edgeActions.add('spike');
        this.recordSpikeDown(code, nowMs);
      }
      if (matchesActionKey(config, 'set', code)) this.edgeActions.add('set');
      if (matchesActionKey(config, 'dive', code)) this.edgeActions.add('dive');
      if (matchesActionKey(config, 'receive', code)) this.edgeActions.add('receive');
      if (matchesActionKey(config, 'ultimate', code)) this.edgeActions.add('ultimate');
      if (matchesActionKey(config, 'serveFloat', code)) {
        trigger.serveFloat = true;
        this.edgeActions.add('serveFloat');
      }
      if (matchesActionKey(config, 'serveUnderhand', code)) {
        trigger.serveUnderhand = true;
        this.edgeActions.add('serveUnderhand');
      }
      if (matchesActionKey(config, 'serveJump', code)) {
        trigger.serveJump = true;
        this.edgeActions.add('serveJump');
      }
      if (matchesActionKey(config, 'toggleFootMode', code)) trigger.toggleFootMode = true;
    }

    return trigger;
  }

  public handleKeyUp(
    code: string,
    nowMs: number = typeof performance !== 'undefined' ? performance.now() : Date.now(),
  ): void {
    this.pressedCodes.delete(code);
    this.recordSpikeUp(code, nowMs);
  }

  /**
   * Processa pressionamento de botão do mouse (0 = LMB, 1 = MMB, 2 = RMB).
   * Se o botão estiver explicitamente mapeado em `config.actions`, dispara a ação mapeada;
   * caso contrário e `mouseEnabled === true`, aplica o fallback (LMB = Cortar, RMB = Recepção/Peixinho).
   */
  public handleMouseDown(
    button: number,
    config: KeyBindingsConfig,
    nowMs: number = typeof performance !== 'undefined' ? performance.now() : Date.now(),
  ): HotkeyTrigger {
    const trigger: HotkeyTrigger = {
      serveFloat: false,
      serveUnderhand: false,
      serveJump: false,
      toggleFootMode: false,
      pause: false,
    };

    const code = mouseButtonToCode(button);
    if (!code) return trigger;

    const wasDown = this.pressedCodes.has(code);
    this.pressedCodes.add(code);

    const mappedToAnyAction = (Object.values(config.actions) as string[]).includes(code);
    if (!mappedToAnyAction && !config.mouseEnabled) {
      return trigger;
    }

    if (!wasDown) {
      if (mappedToAnyAction) {
        if (matchesActionKey(config, 'pause', code)) trigger.pause = true;
        if (matchesActionKey(config, 'jump', code)) this.edgeActions.add('jump');
        if (matchesActionKey(config, 'spike', code)) {
          this.edgeActions.add('spike');
          this.recordSpikeDown(code, nowMs);
        }
        if (matchesActionKey(config, 'set', code)) this.edgeActions.add('set');
        if (matchesActionKey(config, 'dive', code)) this.edgeActions.add('dive');
        if (matchesActionKey(config, 'receive', code)) this.edgeActions.add('receive');
        if (matchesActionKey(config, 'ultimate', code)) this.edgeActions.add('ultimate');
        if (matchesActionKey(config, 'serveFloat', code)) {
          trigger.serveFloat = true;
          this.edgeActions.add('serveFloat');
        }
        if (matchesActionKey(config, 'serveUnderhand', code)) {
          trigger.serveUnderhand = true;
          this.edgeActions.add('serveUnderhand');
        }
        if (matchesActionKey(config, 'serveJump', code)) {
          trigger.serveJump = true;
          this.edgeActions.add('serveJump');
        }
        if (matchesActionKey(config, 'toggleFootMode', code)) trigger.toggleFootMode = true;
      } else if (config.mouseEnabled) {
        if (button === 0) {
          this.edgeActions.add('spike');
          this.recordSpikeDown(code, nowMs);
        }
        if (button === 2) {
          this.edgeActions.add('dive');
          this.edgeActions.add('receive');
        }
      }
    }

    return trigger;
  }

  public handleMouseUp(
    button: number,
    nowMs: number = typeof performance !== 'undefined' ? performance.now() : Date.now(),
  ): void {
    const code = mouseButtonToCode(button);
    if (code) {
      this.pressedCodes.delete(code);
      this.recordSpikeUp(code, nowMs);
    }
  }

  public consumeFrameInput(
    config: KeyBindingsConfig,
    touch?: TouchInputStateLike,
    nowMs: number = typeof performance !== 'undefined' ? performance.now() : Date.now(),
    deltaTimeSec?: number,
    teamSide: 'left' | 'right' = 'left',
  ): UnifiedInputFrame {
    let moveX = touch?.moveX ?? 0;
    let moveZ = touch?.moveZ ?? 0;

    const leftTouchHeld = Boolean(touch?.moveLeftHeld) || this.mobileLeftHeld;
    const rightTouchHeld = Boolean(touch?.moveRightHeld) || this.mobileRightHeld;
    if (leftTouchHeld && !rightTouchHeld) {
      moveX = -1;
    } else if (rightTouchHeld && !leftTouchHeld) {
      moveX = 1;
    } else if (leftTouchHeld && rightTouchHeld) {
      moveX = 0;
    }

    if (isActionPressed(config, 'moveLeft', this.pressedCodes)) moveX -= 1;
    if (isActionPressed(config, 'moveRight', this.pressedCodes)) moveX += 1;
    if (isActionPressed(config, 'moveUp', this.pressedCodes)) moveZ -= 1;
    if (isActionPressed(config, 'moveDown', this.pressedCodes)) moveZ += 1;

    const downKeyHeld =
      this.mobileDownHeld ||
      isActionPressed(config, 'moveDown', this.pressedCodes) ||
      this.pressedCodes.has('ArrowDown') ||
      this.pressedCodes.has('KeyS') ||
      (touch?.moveZ ?? 0) > 0.35;
    const upKeyHeld =
      isActionPressed(config, 'moveUp', this.pressedCodes) ||
      this.pressedCodes.has('ArrowUp') ||
      this.pressedCodes.has('KeyW') ||
      (touch?.moveZ ?? 0) < -0.35;

    if (Math.abs(moveX) < 0.05 && config.mouseSteerEnabled && Math.abs(this.mouseSteerMoveX) > 0.05) {
      moveX = this.mouseSteerMoveX;
    }

    const clampedMoveX = Math.max(-1, Math.min(1, moveX));
    const clampedMoveZ = Math.max(-1, Math.min(1, moveZ));
    this.horizontalInput = clampedMoveX;
    this.verticalInput = downKeyHeld ? -1 : upKeyHeld ? 1 : -clampedMoveZ;

    const spikeEdge = this.edgeActions.has('spike') || Boolean(touch?.spikeQueued);
    const spikeHeld =
      this.spikeTriggerCodes.size > 0 ||
      this.virtualSpikeHeld ||
      isActionPressed(config, 'spike', this.pressedCodes) ||
      Boolean(touch?.spikeHeld);

    // Atualiza o temporizador holdTimer / chargeTime enquanto segura o botão (limitado ao máximo de 1.5s)
    if (spikeHeld && this.isPreparingServe) {
      if (typeof deltaTimeSec === 'number' && Number.isFinite(deltaTimeSec) && deltaTimeSec > 0) {
        this.holdTimer = Math.min(this.maxServeChargeTime, this.holdTimer + deltaTimeSec);
        this.chargeTime = this.holdTimer;
        this.lastChargeSampleMs = nowMs;
      } else if (this.lastChargeSampleMs !== null && nowMs >= this.lastChargeSampleMs) {
        const dtWall = (nowMs - this.lastChargeSampleMs) / 1000;
        this.holdTimer = Math.min(this.maxServeChargeTime, this.holdTimer + dtWall);
        this.chargeTime = this.holdTimer;
        this.lastChargeSampleMs = nowMs;
      }
    }

    const spikeHoldDurationMs =
      spikeHeld && this.spikeDownAtMs !== null ? Math.max(0, nowMs - this.spikeDownAtMs) : 0;
    const serveJumpCharge = spikeHeld && spikeHoldDurationMs >= SIMPLE_SERVE_TAP_MAX_MS;

    const releasedCharge =
      this.lastReleasedChargeTime !== null ? this.lastReleasedChargeTime : undefined;
    const activeChargeTime = spikeHeld && this.isPreparingServe ? this.chargeTime : 0;
    const referenceCharge = releasedCharge !== undefined ? releasedCharge : activeChargeTime;
    const serveChargeStage: ServeType = this.evaluateServeCharge(referenceCharge);

    // Regra B (Contexto de Partida): Lê simultaneamente os eixos direcionais no instante em que 'F' é pressionado
    let directionalCombo: DirectionalActionCombo = this.pendingDirectionalCombo;
    if (spikeEdge) {
      directionalCombo = this.evaluateDirectionalCombo(this.horizontalInput, this.verticalInput, teamSide);
    }

    let resolvedHybrid = this.pendingHybridCommand;
    if (resolvedHybrid === 'none' && spikeEdge) {
      if (directionalCombo === 'down_short') {
        resolvedHybrid = 'double_tap_low_block';
      } else if (directionalCombo === 'back_deep') {
        resolvedHybrid = 'triple_tap_deep_block';
      } else {
        resolvedHybrid = 'single_tap';
      }
    }

    const frame: UnifiedInputFrame = {
      horizontalInput: clampedMoveX,
      verticalInput: this.verticalInput,
      downHeld: downKeyHeld,
      directionalCombo,
      moveX: clampedMoveX,
      moveZ: clampedMoveZ,
      sprint: isActionPressed(config, 'dive', this.pressedCodes),
      jump: this.edgeActions.has('jump') || Boolean(touch?.jumpQueued),
      jumpHeld:
        isActionPressed(config, 'jump', this.pressedCodes) ||
        this.virtualJumpHeld ||
        Boolean(touch?.jumpHeld),
      spike: spikeEdge,
      spikeHeld,
      set: this.edgeActions.has('set') || Boolean(touch?.setQueued),
      hybridCommand: resolvedHybrid,
      tapCount: 0,
      holdTimer: activeChargeTime,
      preparingServe: spikeHeld && this.isPreparingServe,
      serveChargeTime: activeChargeTime,
      serveReleaseChargeTime: releasedCharge,
      serveChargeStage,
      serveQuickTap: this.queuedQuickServeTap || (Boolean(touch?.spikeQueued) && !touch?.spikeHeld),
      serveJumpCharge,
      serveNormalTrigger: this.edgeActions.has('serveFloat') || Boolean(touch?.serveNormalQueued),
      serveUnderhandTrigger: this.edgeActions.has('serveUnderhand'),
      serveJumpTrigger: this.edgeActions.has('serveJump') || Boolean(touch?.serveJumpQueued),
      spikeHoldDurationMs,
      dive: this.edgeActions.has('dive') || Boolean(touch?.diveQueued),
      receive: this.edgeActions.has('receive') || Boolean(touch?.receiveQueued),
      ultimate: this.edgeActions.has('ultimate') || Boolean(touch?.ultimateQueued),
      mouseAimRatio: this.mouseAimRatio,
      mouseWorldPos: this.mouseWorldPos ? { ...this.mouseWorldPos } : undefined,
    };

    this.edgeActions.clear();
    this.queuedQuickServeTap = false;
    this.lastReleasedChargeTime = null;
    this.pendingHybridCommand = 'none';
    this.pendingDirectionalCombo = 'none';
    if (touch) {
      touch.jumpQueued = false;
      touch.spikeQueued = false;
      touch.setQueued = false;
      touch.serveNormalQueued = false;
      touch.serveJumpQueued = false;
      touch.diveQueued = false;
      touch.receiveQueued = false;
      touch.ultimateQueued = false;
    }

    return frame;
  }
}

export const globalInputManager = new InputManager();

