/**
 * Spike Legends Online — HUD Minimalista de Partida + Controles Touch Mobile Unificados (<TouchControls editMode={false} />)
 * Exibe barra Super Attack com timer regressivo de 5.0 segundos via DOM ref (60 FPS limpos).
 */
import React, { useEffect, useState } from 'react';
import {
  Pause,
  Volume2,
  VolumeX,
  Smile,
  Footprints,
  Flame,
  Film,
  FastForward,
  SkipForward,
  Send,
} from 'lucide-react';
import {
  QUICK_CHAT_MESSAGES,
  type GameMode,
  type ServeType,
  type TeamSide,
} from '../config/gameConfig';
import { formatKeyCode, type KeyBindingsConfig } from '../config/keyBindings';
import { loadHudLayout, type HudLayoutConfig } from '../config/hudLayoutConfig';
import { deviceManager, globalInputManager, type VirtualButtonId } from '../input/inputManager';
import type { ScoreState } from '../physics/volleyballRules';
import type { TouchInputBridge } from './GameViewport';
import type { ReplayStateMeta } from '../replay/replayManager';
import type { ChatMessagePayload } from '../network/socketClient';
import { soundEngine } from '../audio/soundEngine';
import { customSoundtrackManager } from '../audio/customSoundtrackManager';
import { TouchControls } from './TouchControls';

export interface HudCalloutState {
  id: number;
  text: string;
  tone: 'perfect' | 'danger' | 'info';
}

interface GameHudProps {
  mode: GameMode;
  score: ScoreState;
  touches: { left: number; right: number };
  leftLabel: string;
  rightLabel: string;
  pingMs: number;
  isOnline: boolean;
  muted: boolean;
  serveType: ServeType;
  footMode: boolean;
  stunned: boolean;
  waitingHumanServe?: boolean;
  activeCallout: HudCalloutState | null;
  trainingStats?: { attempts: number; perfects: number; streak: number };
  keyBindings: KeyBindingsConfig;
  ultimateFillRef: React.MutableRefObject<HTMLDivElement | null>;
  ultimateReadyRef: React.MutableRefObject<HTMLSpanElement | null>;
  superAttackContainerRef: React.MutableRefObject<HTMLDivElement | null>;
  superAttackFillRef: React.MutableRefObject<HTMLDivElement | null>;
  superAttackTimerTextRef: React.MutableRefObject<HTMLSpanElement | null>;
  serveChargeContainerRef?: React.MutableRefObject<HTMLDivElement | null>;
  serveChargeFillRef?: React.MutableRefObject<HTMLDivElement | null>;
  serveChargeTimerTextRef?: React.MutableRefObject<HTMLSpanElement | null>;
  serveChargeStageLabelRef?: React.MutableRefObject<HTMLSpanElement | null>;
  touchBridgeRef: React.MutableRefObject<TouchInputBridge>;
  activeBubbles: Array<{ id: string; name: string; text: string }>;
  replayMeta?: ReplayStateMeta | null;
  onToggleReplaySlowMo?: () => void;
  onSkipReplay?: () => void;
  onChangeServeType: (serve: ServeType) => void;
  onToggleFootMode: () => void;
  onToggleMute: () => void;
  onPause: () => void;
  onSendEmoji: (emoji: string) => void;
  chatMessages?: ChatMessagePayload[];
  onSendChat?: (text: string) => void;
}

export const GameHud: React.FC<GameHudProps> = ({
  mode,
  score,
  touches,
  leftLabel,
  rightLabel,
  pingMs,
  isOnline,
  muted,
  footMode,
  stunned,
  waitingHumanServe = false,
  trainingStats,
  keyBindings,
  ultimateFillRef,
  ultimateReadyRef,
  superAttackContainerRef,
  superAttackFillRef,
  superAttackTimerTextRef,
  serveChargeContainerRef,
  serveChargeFillRef,
  serveChargeTimerTextRef,
  serveChargeStageLabelRef,
  touchBridgeRef,
  activeBubbles,
  replayMeta,
  onToggleReplaySlowMo,
  onSkipReplay,
  onToggleFootMode,
  onToggleMute,
  onPause,
  onSendEmoji,
  chatMessages = [],
  onSendChat,
}) => {
  const [emojiMenuOpen, setEmojiMenuOpen] = useState(false);
  const [hudChatInput, setHudChatInput] = useState('');
  const [isMobile, setIsMobile] = useState<boolean>(() => deviceManager.isMobile);
  const [hudLayout, setHudLayout] = useState<HudLayoutConfig>(() => loadHudLayout());

  useEffect(() => {
    setIsMobile(deviceManager.refresh());
    const unsubDevice = deviceManager.subscribe((mobile) => {
      setIsMobile(mobile);
    });
    const onHudLayoutChange = () => {
      setHudLayout(loadHudLayout());
    };
    window.addEventListener('spike-hud-layout-updated', onHudLayoutChange);
    return () => {
      unsubDevice();
      window.removeEventListener('spike-hud-layout-updated', onHudLayoutChange);
      // Garante que, ao desmontar o HUD da partida por qualquer motivo, a plateia pare instantaneamente
      customSoundtrackManager.stopCrowd();
    };
  }, []);

  const handleVirtualPointerDown = (button: VirtualButtonId) => {
    soundEngine.unlock();
    globalInputManager.OnPointerDown(button, touchBridgeRef.current);
  };

  const handleVirtualPointerUp = (button: VirtualButtonId) => {
    globalInputManager.OnPointerUp(button, touchBridgeRef.current);
  };

  const handleHudChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = hudChatInput.trim();
    if (!clean) return;
    if (onSendChat) {
      onSendChat(clean);
    } else {
      onSendEmoji(clean);
    }
    setHudChatInput('');
  };

  const renderTouchDots = (count: number, side: TeamSide) => (
    <div className="flex items-center gap-0.5 mt-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full ${
            i < count
              ? side === 'left'
                ? 'bg-sky-400'
                : 'bg-orange-400'
              : 'bg-slate-700/80'
          }`}
        />
      ))}
    </div>
  );

  const isTrainingMachine = mode === 'training_spike' || mode === 'training_receive';

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-2 md:p-4">
      {/* Barra Superior Minimalista e Translúcida (Mantém >85% da quadra livre no Mobile) */}
      <div className="flex items-start justify-between gap-1.5 md:gap-3 w-full">
        {/* Canto Superior Esquerdo: Placar Compacto + Barra Super Attack Fina + Indicador Minimalista de Saque */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 md:gap-2.5 min-w-0">
          {/* Placar Compacto ou Contador de Treino */}
          {isTrainingMachine && trainingStats ? (
            <div
              data-testid="training-stats-hud"
              className="bg-slate-950/50 backdrop-blur-[2px] border border-emerald-500/50 rounded-lg px-2 py-1 md:px-3.5 md:py-1.5 flex items-center gap-2.5 shadow-sm"
            >
              <div>
                <div className="text-[8px] md:text-[10px] uppercase font-bold text-emerald-300 leading-tight">
                  {mode === 'training_spike' ? 'Treino: Cortada' : 'Treino: Recepção'}
                </div>
                <div className="font-display font-bold text-xs md:text-base text-white tabular-nums leading-tight">
                  Perfeitos: {trainingStats.perfects}/{trainingStats.attempts}
                </div>
              </div>
              <div className="border-l border-slate-700/70 pl-2 text-center">
                <div className="text-[8px] md:text-[10px] uppercase text-slate-400 leading-tight">Seq.</div>
                <div className="font-display font-bold text-xs md:text-lg text-amber-400 tabular-nums leading-tight">
                  {trainingStats.streak}x
                </div>
              </div>
            </div>
          ) : (
            <div
              aria-label="Placar da Partida"
              data-testid="match-scoreboard"
              className="bg-slate-950/50 backdrop-blur-[2px] border border-slate-600/45 rounded-lg px-2 py-0.5 md:px-3.5 md:py-1.5 flex items-center gap-1.5 md:gap-3 shadow-sm min-w-0"
            >
              <div className="flex flex-col items-end min-w-0">
                <span className="text-[9px] md:text-xs font-bold text-sky-300 max-w-[54px] md:max-w-[96px] truncate leading-tight">
                  {leftLabel}
                </span>
                {renderTouchDots(touches.left, 'left')}
              </div>

              <div className="flex items-center gap-1 md:gap-1.5 font-display font-bold text-base md:text-3xl tabular-nums shrink-0 leading-none">
                <span data-testid="score-left" className="text-sky-400">
                  {String(score.left).padStart(2, '0')}
                </span>
                <span className="text-slate-500 text-xs md:text-lg">:</span>
                <span data-testid="score-right" className="text-orange-400">
                  {String(score.right).padStart(2, '0')}
                </span>
              </div>

              <div className="flex flex-col items-start min-w-0">
                <span className="text-[9px] md:text-xs font-bold text-orange-300 max-w-[54px] md:max-w-[96px] truncate leading-tight">
                  {rightLabel}
                </span>
                {renderTouchDots(touches.right, 'right')}
              </div>
            </div>
          )}

          {/* Barra Super Attack Fina (Sem tags de teclas de PC no Mobile) */}
          <div className="bg-slate-950/50 backdrop-blur-[2px] border border-slate-600/45 rounded-lg px-2 py-0.5 md:px-2.5 md:py-1">
            <div className="flex items-center justify-between gap-1.5 text-[8px] md:text-[10px] font-bold tracking-wider text-slate-200 leading-tight">
              <span>SUPER</span>
              <span
                ref={ultimateReadyRef}
                style={{ opacity: 0 }}
                className="text-amber-300 transition-opacity"
              >
                PRONTO
              </span>
            </div>
            <div className="mt-0.5 h-1.5 md:h-2 w-16 md:w-28 bg-slate-800/80 rounded-full overflow-hidden">
              <div
                ref={ultimateFillRef}
                style={{ transform: 'scaleX(0)', transformOrigin: 'left center' }}
                className="h-full w-full bg-[#06B6D4]"
              />
            </div>
          </div>

          {/* Barra Regressiva do Buff Super Attack (5.0s) */}
          <div
            ref={superAttackContainerRef}
            data-testid="super-attack-hud"
            style={{ display: 'none' }}
            className="bg-amber-950/65 backdrop-blur-[2px] border border-amber-400/80 rounded-lg px-2 py-0.5 md:px-2.5 md:py-1 shadow-sm"
          >
            <div className="flex items-center justify-between gap-1.5 text-[8px] md:text-[10px] font-display font-bold tracking-wider text-amber-300 leading-tight">
              <span className="flex items-center gap-0.5">
                <Flame className="w-2.5 h-2.5 md:w-3 md:h-3 text-orange-400" />
                SUPER
              </span>
              <span
                ref={superAttackTimerTextRef}
                data-testid="super-attack-timer"
                className="font-mono-num text-white tabular-nums"
              >
                5.0s
              </span>
            </div>
            <div className="mt-0.5 h-1.5 w-16 md:w-28 bg-slate-900/80 rounded-full overflow-hidden">
              <div
                ref={superAttackFillRef}
                style={{ transform: 'scaleX(1)', transformOrigin: 'left center' }}
                className="h-full w-full bg-gradient-to-r from-[#F97316] to-amber-300"
              />
            </div>
          </div>

          {/* Indicador Único Minimalista de Saque: Barra Fina + 1 Linha Curta ("SEGURE PARA SACAR") que some imediatamente ao sacar */}
          {!isTrainingMachine && (
            <div
              ref={serveChargeContainerRef}
              data-testid="serve-charge-hud"
              style={{ display: waitingHumanServe ? 'flex' : 'none' }}
              className="bg-slate-950/60 backdrop-blur-[2px] border border-cyan-400/60 rounded-lg px-2 py-0.5 md:px-2.5 md:py-1 flex-col justify-center shadow-sm"
            >
              <div className="flex items-center justify-between gap-2 text-[8px] md:text-[10px] font-display font-bold tracking-wider leading-tight">
                <span
                  ref={serveChargeStageLabelRef}
                  data-testid="serve-charge-stage-label"
                  className="text-cyan-300 uppercase"
                >
                  SEGURE PARA SACAR
                </span>
                <span
                  ref={serveChargeTimerTextRef}
                  data-testid="serve-charge-timer"
                  className="font-mono-num text-white/90 tabular-nums"
                />
              </div>
              <div className="relative mt-0.5 h-1.5 w-24 md:w-32 bg-slate-900/85 rounded-full overflow-hidden">
                <div
                  ref={serveChargeFillRef}
                  data-testid="serve-charge-fill"
                  style={{ transform: 'scaleX(0)', transformOrigin: 'left center' }}
                  className="h-full w-full bg-gradient-to-r from-sky-400 via-amber-400 to-orange-500 transition-none"
                />
              </div>
            </div>
          )}

          {isOnline && (
            <div
              data-testid="hud-ping-badge"
              className="text-[9px] md:text-[11px] font-mono-num text-slate-200 bg-slate-950/50 backdrop-blur-[2px] border border-slate-600/45 rounded-md px-1.5 py-0.5 w-fit"
            >
              {pingMs}ms · P2P
            </div>
          )}
        </div>

        {/* Canto Superior Direito: Botões Utilitários Compactos e Translúcidos (Mão, Emoji, Som, Pause) */}
        <div className="pointer-events-auto flex items-center gap-1 md:gap-1.5 shrink-0 relative">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Alternar Shark Attack"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleFootMode();
            }}
            className={`px-1.5 h-7 md:px-2.5 md:h-9 rounded-lg border text-[10px] md:text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors ${
              footMode
                ? 'bg-amber-400/90 border-white text-slate-950'
                : 'bg-slate-950/50 backdrop-blur-[2px] border-slate-600/45 text-slate-200 hover:bg-slate-800/70'
            }`}
          >
            <Footprints className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span>{footMode ? 'Shark' : 'Mão'}</span>
          </button>

          {isMobile && (
            <button
              type="button"
              tabIndex={-1}
              aria-label="Emoji rápido"
              onClick={() => setEmojiMenuOpen((v) => !v)}
              className="w-7 h-7 md:w-9 md:h-9 flex items-center justify-center rounded-lg bg-slate-950/50 backdrop-blur-[2px] border border-slate-600/45 text-amber-300 hover:bg-slate-800/70 cursor-pointer"
            >
              <Smile className="w-3.5 h-3.5 md:w-4 md:h-4" />
            </button>
          )}

          {isMobile && emojiMenuOpen && (
            <div className="absolute top-9 right-0 w-60 p-2 rounded-xl bg-slate-950/90 border border-slate-700 flex flex-col gap-1.5 shadow-xl z-40">
              {isOnline && chatMessages.length > 0 && (
                <div className="max-h-20 overflow-y-auto space-y-1 p-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs">
                  {chatMessages.slice(-6).map((m) => (
                    <div key={m.id} className="leading-snug">
                      <span className="font-bold text-amber-300 mr-1">{m.senderName}:</span>
                      <span className="text-slate-100">{m.text}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-1">
                {QUICK_CHAT_MESSAGES.map((msg) => (
                  <button
                    key={msg}
                    type="button"
                    onClick={() => {
                      onSendEmoji(msg);
                      setEmojiMenuOpen(false);
                    }}
                    className="px-2 py-0.5 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded-md"
                  >
                    {msg}
                  </button>
                ))}
              </div>
              {isOnline && onSendChat && (
                <form onSubmit={handleHudChatSubmit} className="flex gap-1">
                  <input
                    type="text"
                    maxLength={140}
                    value={hudChatInput}
                    onChange={(e) => setHudChatInput(e.target.value)}
                    placeholder="Mensagem..."
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                  <button
                    type="submit"
                    className="px-2 py-1 rounded-lg bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              )}
            </div>
          )}

          <button
            type="button"
            tabIndex={-1}
            aria-label={muted ? 'Ativar som' : 'Silenciar som'}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="w-7 h-7 md:w-9 md:h-9 flex items-center justify-center rounded-lg bg-slate-950/50 backdrop-blur-[2px] border border-slate-600/45 text-slate-200 hover:bg-slate-800/70 cursor-pointer"
          >
            {muted ? (
              <VolumeX className="w-3.5 h-3.5 md:w-4 md:h-4" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
            )}
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Pausar partida"
            onClick={(e) => {
              e.currentTarget.blur();
              soundEngine.playButtonClick();
              onPause();
            }}
            className="w-7 h-7 md:w-9 md:h-9 flex items-center justify-center rounded-lg bg-slate-950/50 backdrop-blur-[2px] border border-slate-600/45 text-slate-200 hover:bg-slate-800/70 cursor-pointer"
          >
            <Pause className="w-3.5 h-3.5 md:w-4 md:h-4" />
          </button>
        </div>
      </div>

      {/* Zona Central Limpa (Apenas Replay caso ativo, Guard Break discreto ou Bolha rápida de chat) */}
      <div
        data-testid="hud-callouts-container"
        className="self-center mb-auto mt-1 flex flex-col items-center gap-1.5"
      >
        {replayMeta?.active && (
          <div
            data-testid="replay-overlay"
            className="pointer-events-auto animate-spike-pop bg-slate-950/80 backdrop-blur-sm border border-amber-400/80 rounded-xl px-3 py-1.5 shadow-lg flex flex-col gap-1 min-w-[220px] sm:min-w-[300px]"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
                <Film className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span className="font-display font-bold text-[11px] sm:text-xs tracking-wider text-amber-300">
                  {replayMeta.highlightLabel}
                </span>
              </div>
              <span className="text-[10px] font-mono-num text-slate-300 tabular-nums">
                {replayMeta.speed.toFixed(2)}×
              </span>
            </div>

            <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
              <div
                style={{ width: `${Math.round(replayMeta.progress * 100)}%` }}
                className="h-full bg-gradient-to-r from-[#F97316] to-amber-300 transition-[width] duration-75"
              />
            </div>

            <div className="flex items-center justify-end gap-1.5 pt-0.5">
              <button
                type="button"
                tabIndex={-1}
                data-testid="btn-replay-slowmo"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleReplaySlowMo?.();
                }}
                className={`px-2 py-0.5 rounded border text-[10px] font-bold flex items-center gap-1 cursor-pointer ${
                  replayMeta.slowMotion
                    ? 'bg-amber-400 border-white text-slate-950'
                    : 'bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700'
                }`}
              >
                <FastForward className="w-3 h-3" />
                {replayMeta.slowMotion ? '0.45×' : '1.0×'}
              </button>
              <button
                type="button"
                tabIndex={-1}
                data-testid="btn-replay-skip"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onSkipReplay?.();
                }}
                className="px-2 py-0.5 rounded bg-[#F97316] hover:bg-[#EA580C] border border-orange-300 text-slate-950 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <SkipForward className="w-3 h-3" />
                Pular
              </button>
            </div>
          </div>
        )}

        {stunned && (
          <div
            data-testid="stunned-banner"
            className="animate-spike-pop bg-rose-600/85 border border-white/80 text-white px-2.5 py-0.5 rounded-lg font-display font-bold text-[10px] md:text-xs tracking-wider shadow-md"
          >
            GUARD BREAK!
          </div>
        )}

        {activeBubbles.length > 0 && (
          <div className="flex flex-col items-center gap-1">
            {activeBubbles.map((b) => (
              <div
                key={b.id}
                className="animate-spike-pop bg-slate-950/75 border border-amber-400/50 text-white px-2.5 py-0.5 rounded-lg text-[11px] font-semibold"
              >
                <span className="text-amber-300 mr-1">{b.name}:</span>
                {b.text}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rodapé: Componente Único <TouchControls editMode={false} /> no Mobile (100% idêntico ao Editor de HUD) */}
      {isMobile ? (
        <TouchControls
          editMode={false}
          layout={hudLayout}
          onButtonDown={handleVirtualPointerDown}
          onButtonUp={handleVirtualPointerUp}
        />
      ) : (
        /* Desktop: Botão compacto de Chat/Reação; legenda de teclado oculta em telas menores que 1280px */
        <div className="flex items-center gap-3 pointer-events-auto">
          <div className="relative">
            <button
              type="button"
              tabIndex={-1}
              data-testid="btn-open-quick-chat"
              aria-label="Abrir chat rápido"
              onClick={(e) => {
                e.currentTarget.blur();
                setEmojiMenuOpen((v) => !v);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950/60 backdrop-blur-[2px] border border-slate-700/60 text-xs font-semibold text-slate-200 hover:bg-slate-800 cursor-pointer"
            >
              <Smile className="w-4 h-4 text-amber-400" />
              {isOnline ? 'Chat / Reagir' : 'Reagir'}
            </button>
            {emojiMenuOpen && (
              <div className="absolute bottom-11 left-0 w-72 p-2.5 rounded-xl bg-[#0F172A]/95 border border-slate-700 flex flex-col gap-2 shadow-xl">
                {isOnline && chatMessages.length > 0 && (
                  <div className="max-h-28 overflow-y-auto space-y-1 p-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs">
                    {chatMessages.slice(-8).map((m) => (
                      <div key={m.id} className="leading-snug">
                        <span className="font-bold text-amber-300 mr-1">{m.senderName}:</span>
                        <span className="text-slate-100">{m.text}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_CHAT_MESSAGES.map((msg) => (
                    <button
                      key={msg}
                      type="button"
                      onClick={() => {
                        onSendEmoji(msg);
                        setEmojiMenuOpen(false);
                      }}
                      className="px-2.5 py-1 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded-md cursor-pointer"
                    >
                      {msg}
                    </button>
                  ))}
                </div>
                {isOnline && onSendChat && (
                  <form onSubmit={handleHudChatSubmit} className="flex gap-1.5">
                    <input
                      type="text"
                      maxLength={140}
                      value={hudChatInput}
                      onChange={(e) => setHudChatInput(e.target.value)}
                      placeholder="Mensagem na sala..."
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                    <button
                      type="submit"
                      className="px-2.5 py-1 rounded-lg bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>

          <span
            data-testid="hud-controls-hint"
            className="hidden xl:inline-block text-[11px] text-slate-300 bg-slate-950/60 backdrop-blur-[2px] px-2.5 py-1 rounded-lg border border-slate-800/70"
          >
            {keyBindings.mouseSteerEnabled
              ? 'Cursor Mover'
              : `${formatKeyCode(keyBindings.actions.moveLeft)}/${formatKeyCode(keyBindings.actions.moveRight)} Mover`}{' '}
            · {formatKeyCode(keyBindings.actions.jump)}/{formatKeyCode(keyBindings.actions.spike)} Pular + Atacar ·{' '}
            {formatKeyCode(keyBindings.actions.set)} Toque ·{' '}
            {formatKeyCode(keyBindings.actions.receive)} Manchete ·{' '}
            {formatKeyCode(keyBindings.actions.dive)} Peixinho ·{' '}
            {formatKeyCode(keyBindings.actions.ultimate)} Super
          </span>
        </div>
      )}
    </div>
  );
};
