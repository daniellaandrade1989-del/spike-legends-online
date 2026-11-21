/**
 * Spike Legends Online — Painel Interativo de Mapeamento de Teclas e Botões do Mouse
 * Permite remapear livremente cada ação para Teclado ou Mouse (LMB/RMB),
 * ativar o preset "Modo Só Mouse" e ajustar o layout Touch.
 */
import React, { useEffect, useState } from 'react';
import { Keyboard, Mouse, MousePointerClick, Move, RotateCcw, Smartphone, X } from 'lucide-react';
import {
  createMouseOnlyBindings,
  formatKeyCode,
  GAME_ACTION_META,
  rebindAction,
  type GameActionId,
  type KeyBindingsConfig,
} from '../config/keyBindings';
import { mouseButtonToCode } from '../input/inputManager';
import { soundEngine } from '../audio/soundEngine';
import { HudCustomizerModal } from './HudCustomizerModal';

interface KeyBindingsPanelProps {
  keyBindings: KeyBindingsConfig;
  onChange: (next: KeyBindingsConfig) => void;
  onReset: () => void;
  compact?: boolean;
}

const CATEGORIES = ['Movimento', 'Ações na Quadra', 'Saques & Sistema'] as const;

export const KeyBindingsPanel: React.FC<KeyBindingsPanelProps> = ({
  keyBindings,
  onChange,
  onReset,
  compact = false,
}) => {
  const [listeningId, setListeningId] = useState<GameActionId | null>(null);
  const [showHudCustomizer, setShowHudCustomizer] = useState(false);

  useEffect(() => {
    if (!listeningId) return;
    let armed = false;

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      soundEngine.playButtonClick();
      const updated = rebindAction(keyBindings, listeningId, e.code);
      onChange(updated);
      setListeningId(null);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (!armed) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-rebind-cancel="true"]')) return;
      const code = mouseButtonToCode(e.button);
      if (!code) return;
      e.preventDefault();
      e.stopPropagation();
      soundEngine.playButtonClick();
      const updated = rebindAction(keyBindings, listeningId, code);
      onChange(updated);
      setListeningId(null);
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    // Aguarda um ciclo de evento para não capturar o próprio clique que iniciou a escuta
    const armTimer = window.setTimeout(() => {
      armed = true;
    }, 30);

    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('mousedown', onMouseDown, { capture: true });
    window.addEventListener('contextmenu', onContextMenu, { capture: true });
    return () => {
      window.clearTimeout(armTimer);
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('mousedown', onMouseDown, { capture: true });
      window.removeEventListener('contextmenu', onContextMenu, { capture: true });
    };
  }, [listeningId, keyBindings, onChange]);

  return (
    <div data-testid="key-bindings-panel" className="flex flex-col gap-4">
      {showHudCustomizer && (
        <HudCustomizerModal onClose={() => setShowHudCustomizer(false)} />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Keyboard className="w-4 h-4 text-sky-400 shrink-0" />
          <span className="font-display font-bold text-sm sm:text-base text-white">
            Mapeamento Livre (Teclado & Mouse LMB/RMB)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="btn-open-hud-customizer"
            onClick={() => {
              soundEngine.playButtonClick();
              setListeningId(null);
              setShowHudCustomizer(true);
            }}
            className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/60 text-xs font-bold text-amber-200 flex items-center gap-1.5 cursor-pointer"
          >
            <Move className="w-3.5 h-3.5" />
            Personalizar Controles (HUD)
          </button>

          <button
            type="button"
            data-testid="btn-mouse-only-preset"
            onClick={() => {
              soundEngine.playButtonClick();
              setListeningId(null);
              onChange(createMouseOnlyBindings());
            }}
            className="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/60 text-xs font-bold text-sky-200 flex items-center gap-1.5 cursor-pointer"
          >
            <MousePointerClick className="w-3.5 h-3.5" />
            Modo Só Mouse
          </button>

          <button
            type="button"
            data-testid="btn-reset-keybindings"
            onClick={() => {
              soundEngine.playButtonClick();
              setListeningId(null);
              onReset();
            }}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restaurar Padrão
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Clique em qualquer ação e pressione uma <strong className="text-slate-200">tecla do teclado</strong> ou{' '}
        <strong className="text-sky-300">Botão Esquerdo (LMB) / Direito (RMB)</strong> do mouse. Se já estiver em uso, os botões trocam automaticamente.
      </p>

      <div className={`grid grid-cols-1 ${compact ? '' : 'md:grid-cols-2'} gap-3`}>
        {CATEGORIES.map((category) => {
          const items = GAME_ACTION_META.filter((m) => m.category === category);
          return (
            <div
              key={category}
              className="bg-[#0B1120] border border-slate-800 rounded-xl p-3 space-y-2"
            >
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300 pb-1 border-b border-slate-800">
                {category}
              </div>

              {items.map((item) => {
                const isListening = listeningId === item.id;
                const currentCode = keyBindings.actions[item.id];
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 bg-[#0F172A] border border-slate-800/90 rounded-lg px-2.5 py-2"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">{item.label}</div>
                      {!compact && (
                        <div className="text-[11px] text-slate-400 leading-tight mt-0.5">
                          {item.description}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        data-testid={`rebind-btn-${item.id}`}
                        aria-label={`Mapear tecla ou mouse para ${item.label}: atual ${formatKeyCode(currentCode)}`}
                        onClick={() => {
                          soundEngine.playButtonClick();
                          setListeningId((prev) => (prev === item.id ? null : item.id));
                        }}
                        className={`min-w-[92px] px-2.5 py-1.5 rounded-md border text-xs font-mono-num font-bold cursor-pointer transition-colors ${
                          isListening
                            ? 'bg-amber-400 border-white text-slate-950 animate-pulse'
                            : 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-sky-300'
                        }`}
                      >
                        {isListening ? 'Tecla / Mouse...' : formatKeyCode(currentCode)}
                      </button>

                      {isListening && (
                        <button
                          type="button"
                          data-rebind-cancel="true"
                          aria-label={`Cancelar mapeamento de ${item.label}`}
                          onClick={() => setListeningId(null)}
                          className="w-7 h-7 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Opções adicionais de Mouse, Direção por Cursor e Layout Mobile */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <button
          type="button"
          data-testid="toggle-mouse-controls"
          onClick={() => {
            soundEngine.playButtonClick();
            onChange({ ...keyBindings, mouseEnabled: !keyBindings.mouseEnabled });
          }}
          className={`p-3 rounded-xl border text-left flex items-center justify-between gap-2 cursor-pointer transition-colors ${
            keyBindings.mouseEnabled
              ? 'bg-[#1E293B] border-sky-400/60 text-white'
              : 'bg-[#0B1120] border-slate-800 text-slate-400'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Mouse className="w-4 h-4 text-sky-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold">Cliques LMB/RMB</div>
              <div className="text-[11px] text-slate-400 truncate">
                Atalhos padrão no mouse
              </div>
            </div>
          </div>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
              keyBindings.mouseEnabled ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-300'
            }`}
          >
            {keyBindings.mouseEnabled ? 'ATIVO' : 'OFF'}
          </span>
        </button>

        <button
          type="button"
          data-testid="toggle-mouse-steer"
          onClick={() => {
            soundEngine.playButtonClick();
            onChange({ ...keyBindings, mouseSteerEnabled: !keyBindings.mouseSteerEnabled });
          }}
          className={`p-3 rounded-xl border text-left flex items-center justify-between gap-2 cursor-pointer transition-colors ${
            keyBindings.mouseSteerEnabled
              ? 'bg-[#1E293B] border-amber-400/70 text-white'
              : 'bg-[#0B1120] border-slate-800 text-slate-400'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <MousePointerClick className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold">Mover com Cursor</div>
              <div className="text-[11px] text-slate-400 truncate">
                Jogar só com mouse
              </div>
            </div>
          </div>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
              keyBindings.mouseSteerEnabled ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-300'
            }`}
          >
            {keyBindings.mouseSteerEnabled ? 'ATIVO' : 'OFF'}
          </span>
        </button>

        <button
          type="button"
          data-testid="toggle-touch-handedness"
          onClick={() => {
            soundEngine.playButtonClick();
            onChange({
              ...keyBindings,
              touchHandedness: keyBindings.touchHandedness === 'right' ? 'left' : 'right',
            });
          }}
          className="p-3 rounded-xl border bg-[#1E293B] border-slate-700 text-white text-left flex items-center justify-between gap-2 cursor-pointer hover:border-amber-400/60 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Smartphone className="w-4 h-4 text-[#F97316] shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold">Posição Touch</div>
              <div className="text-[11px] text-slate-400 truncate">
                {keyBindings.touchHandedness === 'right' ? 'Joystick Esq.' : 'Joystick Dir.'}
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#F97316] text-slate-950 shrink-0">
            {keyBindings.touchHandedness === 'right' ? 'DESTRO' : 'CANHOTO'}
          </span>
        </button>
      </div>
    </div>
  );
};
