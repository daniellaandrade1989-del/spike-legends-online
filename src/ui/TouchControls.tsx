/**
 * Spike Legends Online — Componente Único de Controles Touch (<TouchControls editMode={boolean} />)
 * Single Source of Truth: Renderizado de forma 100% idêntica (pixel por pixel) tanto na Partida
 * (editMode={false}) quanto no Editor de HUD (editMode={true}), usando coordenadas percentuais
 * normalizadas em tela cheia (100dvw x 100dvh, position: fixed):
 * left: ${x}%, top: ${y}%, transform: translate(-50%, -50%) scale(${scale})
 */
import React, { useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Flame,
  Footprints,
  Shield,
  Zap,
} from 'lucide-react';
import {
  clampHudTransform,
  DEFAULT_HUD_LAYOUT,
  getButtonFixedStyle,
  type HudButtonId,
  type HudLayoutConfig,
} from '../config/hudLayoutConfig';
import type { VirtualButtonId } from '../input/inputManager';

export interface TouchControlsProps {
  editMode: boolean;
  layout: HudLayoutConfig;
  selectedButtonId?: HudButtonId;
  onSelectButton?: (id: HudButtonId) => void;
  onChangeLayout?: (next: HudLayoutConfig) => void;
  onButtonDown?: (id: VirtualButtonId) => void;
  onButtonUp?: (id: VirtualButtonId) => void;
}

export const TouchControls: React.FC<TouchControlsProps> = ({
  editMode,
  layout,
  selectedButtonId,
  onSelectButton,
  onChangeLayout,
  onButtonDown,
  onButtonUp,
}) => {
  const [leftBtnActive, setLeftBtnActive] = useState(false);
  const [rightBtnActive, setRightBtnActive] = useState(false);

  const dragRef = useRef<{
    id: HudButtonId;
    startClientX: number;
    startClientY: number;
    initialX: number;
    initialY: number;
  } | null>(null);

  const handleEditPointerDown = (id: HudButtonId, e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onSelectButton?.(id);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore pointer capture error
    }
    const current = layout[id] ?? DEFAULT_HUD_LAYOUT[id];
    dragRef.current = {
      id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      initialX: current.x,
      initialY: current.y,
    };
  };

  const handleEditPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const active = dragRef.current;
    if (!active || !onChangeLayout) return;
    e.preventDefault();
    const vw = Math.max(1, window.innerWidth);
    const vh = Math.max(1, window.innerHeight);
    const dxPct = ((e.clientX - active.startClientX) / vw) * 100;
    const dyPct = ((e.clientY - active.startClientY) / vh) * 100;
    const prevItem = layout[active.id] ?? DEFAULT_HUD_LAYOUT[active.id];
    const updated = clampHudTransform(
      {
        ...prevItem,
        x: active.initialX + dxPct,
        y: active.initialY + dyPct,
      },
      DEFAULT_HUD_LAYOUT[active.id],
    );
    onChangeLayout({
      ...layout,
      [active.id]: updated,
    });
  };

  const handleEditPointerUp = () => {
    dragRef.current = null;
  };

  const triggerDown = (id: VirtualButtonId) => {
    if (editMode) return;
    if (id === 'moveLeft') setLeftBtnActive(true);
    if (id === 'moveRight') setRightBtnActive(true);
    onButtonDown?.(id);
  };

  const triggerUp = (id: VirtualButtonId) => {
    if (editMode) return;
    if (id === 'moveLeft') setLeftBtnActive(false);
    if (id === 'moveRight') setRightBtnActive(false);
    onButtonUp?.(id);
  };

  const getEditRingClass = (id: HudButtonId): string => {
    if (!editMode) return '';
    return selectedButtonId === id
      ? 'ring-3 ring-amber-300 shadow-lg shadow-amber-500/40 cursor-grab active:cursor-grabbing'
      : 'ring-1 ring-white/40 hover:ring-amber-300/80 cursor-grab active:cursor-grabbing';
  };

  const bindButtonEvents = (id: HudButtonId) => {
    if (editMode) {
      return {
        onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => handleEditPointerDown(id, e),
        onPointerMove: handleEditPointerMove,
        onPointerUp: handleEditPointerUp,
        onPointerCancel: handleEditPointerUp,
      };
    }
    return {
      onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
        e.preventDefault();
        triggerDown(id);
      },
      onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
        e.preventDefault();
        triggerUp(id);
      },
      onPointerCancel: () => triggerUp(id),
      onPointerLeave: () => {
        if ((id === 'moveLeft' && leftBtnActive) || (id === 'moveRight' && rightBtnActive)) {
          triggerUp(id);
        }
      },
      onTouchStart: (e: React.TouchEvent<HTMLButtonElement>) => {
        e.preventDefault();
        triggerDown(id);
      },
      onTouchEnd: (e: React.TouchEvent<HTMLButtonElement>) => {
        e.preventDefault();
        triggerUp(id);
      },
      onTouchCancel: () => triggerUp(id),
      onClick: () => {
        if (id !== 'moveLeft' && id !== 'moveRight') {
          triggerDown(id);
        }
      },
    };
  };

  return (
    <div
      data-testid={editMode ? 'touch-controls-editor-canvas' : 'mobile-controls-canvas'}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100dvw',
        height: '100dvh',
        pointerEvents: 'none',
      }}
      className="z-20 select-none touch-none"
    >
      {/* Botão Direcional: Mover para Esquerda (ESQ) */}
      <button
        type="button"
        data-testid="btn-mobile-left"
        aria-label="Mover para Esquerda"
        style={getButtonFixedStyle(layout.moveLeft ?? DEFAULT_HUD_LAYOUT.moveLeft)}
        {...bindButtonEvents('moveLeft')}
        className={`pointer-events-auto w-13 h-13 rounded-2xl border flex flex-col items-center justify-center font-display font-bold text-[9px] tracking-wider select-none touch-none ${
          !editMode && leftBtnActive
            ? 'bg-[#F97316]/90 border-white text-slate-950 shadow-md'
            : 'bg-slate-950/55 border-slate-500/60 text-white active:bg-[#F97316]/90 active:text-slate-950'
        } ${getEditRingClass('moveLeft')}`}
      >
        <ArrowLeft className="w-5 h-5" />
        <span>ESQ</span>
      </button>

      {/* Botão Direcional: Mover para Direita (DIR) */}
      <button
        type="button"
        data-testid="btn-mobile-right"
        aria-label="Mover para Direita"
        style={getButtonFixedStyle(layout.moveRight ?? DEFAULT_HUD_LAYOUT.moveRight)}
        {...bindButtonEvents('moveRight')}
        className={`pointer-events-auto w-13 h-13 rounded-2xl border flex flex-col items-center justify-center font-display font-bold text-[9px] tracking-wider select-none touch-none ${
          !editMode && rightBtnActive
            ? 'bg-[#F97316]/90 border-white text-slate-950 shadow-md'
            : 'bg-slate-950/55 border-slate-500/60 text-white active:bg-[#F97316]/90 active:text-slate-950'
        } ${getEditRingClass('moveRight')}`}
      >
        <ArrowRight className="w-5 h-5" />
        <span>DIR</span>
      </button>

      {/* Botão de Ação: Peixinho (Dive) */}
      <button
        type="button"
        data-testid="btn-mobile-dive"
        aria-label="Peixinho"
        style={getButtonFixedStyle(layout.dive ?? DEFAULT_HUD_LAYOUT.dive)}
        {...bindButtonEvents('dive')}
        className={`pointer-events-auto w-10 h-10 rounded-full bg-violet-500/85 border border-white/80 flex flex-col items-center justify-center text-white font-bold text-[8px] shadow-sm select-none touch-none ${getEditRingClass('dive')}`}
      >
        <Footprints className="w-3.5 h-3.5" />
        <span>Dive</span>
      </button>

      {/* Botão de Ação: Super Attack (Super) */}
      <button
        type="button"
        data-testid="btn-mobile-super"
        aria-label="Ativar Super Attack"
        style={getButtonFixedStyle(layout.ultimate ?? DEFAULT_HUD_LAYOUT.ultimate)}
        {...bindButtonEvents('ultimate')}
        className={`pointer-events-auto w-10 h-10 rounded-full bg-amber-400/85 border border-white/80 flex flex-col items-center justify-center text-slate-950 font-bold text-[8px] shadow-sm select-none touch-none ${getEditRingClass('ultimate')}`}
      >
        <Flame className="w-3.5 h-3.5" />
        <span>Super</span>
      </button>

      {/* Botão de Ação: Manchete / Receber */}
      <button
        type="button"
        data-testid="btn-mobile-receive"
        aria-label="Manchete / Receber"
        style={getButtonFixedStyle(layout.receive ?? DEFAULT_HUD_LAYOUT.receive)}
        {...bindButtonEvents('receive')}
        className={`pointer-events-auto w-11 h-11 rounded-full bg-emerald-500/85 border border-white/85 flex flex-col items-center justify-center text-slate-950 font-bold text-[9px] shadow-sm select-none touch-none ${getEditRingClass('receive')}`}
      >
        <Shield className="w-3.5 h-3.5" />
        <span>Manchete</span>
      </button>

      {/* Botão de Ação: Toque e Levantamento */}
      <button
        type="button"
        data-testid="btn-mobile-set"
        aria-label="Toque e Levantamento"
        style={getButtonFixedStyle(layout.set ?? DEFAULT_HUD_LAYOUT.set)}
        {...bindButtonEvents('set')}
        className={`pointer-events-auto w-11 h-11 rounded-full bg-sky-400/85 border border-white/85 flex flex-col items-center justify-center text-slate-950 font-bold text-[9px] shadow-sm select-none touch-none ${getEditRingClass('set')}`}
      >
        <ArrowUp className="w-4 h-4" />
        <span>Toque</span>
      </button>

      {/* Botão Principal Unificado: Pular / Atacar */}
      <button
        type="button"
        data-testid="btn-mobile-jump-spike"
        aria-label="Pular e Atacar"
        style={getButtonFixedStyle(layout.jumpSpike ?? DEFAULT_HUD_LAYOUT.jumpSpike)}
        {...bindButtonEvents('jumpSpike')}
        className={`pointer-events-auto w-14 h-14 rounded-full bg-gradient-to-br from-[#F97316]/90 to-amber-500/90 border-2 border-white/90 flex flex-col items-center justify-center text-slate-950 font-display font-bold text-[9px] leading-tight shadow-md select-none touch-none ${getEditRingClass('jumpSpike')}`}
      >
        <Zap className="w-4 h-4" />
        <span>PULAR</span>
        <span className="text-[7px] font-extrabold tracking-tight">/ ATACAR</span>
      </button>
    </div>
  );
};
