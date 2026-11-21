/**
 * Spike Legends Online — Editor Visual de Controles Mobile (HUD Personalizável)
 * Renderiza o componente único <TouchControls editMode={true} /> em tela cheia (100dvw x 100dvh)
 * sobre o fundo real da quadra 3D para referência visual exata (100% pixel por pixel com a partida).
 */
import React, { useState } from 'react';
import { Check, Move, RotateCcw, Sliders, X } from 'lucide-react';
import {
  clampHudTransform,
  DEFAULT_HUD_LAYOUT,
  HUD_BUTTON_META,
  loadHudLayout,
  resetHudLayout,
  saveHudLayout,
  type HudButtonId,
  type HudLayoutConfig,
} from '../config/hudLayoutConfig';
import { TouchControls } from './TouchControls';

interface HudCustomizerModalProps {
  onClose: () => void;
  onSaved?: (layout: HudLayoutConfig) => void;
}

export const HudCustomizerModal: React.FC<HudCustomizerModalProps> = ({
  onClose,
  onSaved,
}) => {
  const [layout, setLayout] = useState<HudLayoutConfig>(() => loadHudLayout());
  const [selectedBtn, setSelectedBtn] = useState<HudButtonId>('jumpSpike');

  const handleScaleChange = (scale: number) => {
    setLayout((prev) => ({
      ...prev,
      [selectedBtn]: clampHudTransform(
        {
          ...prev[selectedBtn],
          scale,
        },
        DEFAULT_HUD_LAYOUT[selectedBtn],
      ),
    }));
  };

  const handleResetAll = () => {
    const fresh = resetHudLayout();
    setLayout(fresh);
    onSaved?.(fresh);
  };

  const handleSave = () => {
    const saved = saveHudLayout(layout);
    onSaved?.(saved);
    onClose();
  };

  const selectedTransform = layout[selectedBtn] ?? DEFAULT_HUD_LAYOUT[selectedBtn];
  const selectedMeta = HUD_BUTTON_META[selectedBtn];

  return (
    <div
      data-testid="hud-customizer-modal"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100dvw',
        height: '100dvh',
      }}
      className="z-50 bg-slate-950/25 select-none overflow-hidden"
    >
      {/* Grade sutil de referência da quadra em tela cheia (deixa a quadra 3D real visível ao fundo) */}
      <div className="pointer-events-none fixed inset-0 border-2 border-dashed border-amber-400/25">
        <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-white/10" />
        <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-white/10" />
      </div>

      {/* Barra Superior Compacta e Translúcida do Editor */}
      <div className="relative z-30 w-full max-w-2xl mx-auto mt-2 px-2">
        <div className="bg-slate-950/85 backdrop-blur-md border border-white/15 rounded-2xl p-2.5 sm:p-3.5 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/10">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300">
                <Move className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-white leading-tight">
                  Editor de HUD (Espelhamento 1:1 com a Quadra)
                </h3>
                <p className="text-[10px] text-slate-300 leading-tight">
                  Arraste qualquer botão na quadra e ajuste o tamanho individual abaixo.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="btn-hud-reset"
                onClick={handleResetAll}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200 text-[10px] sm:text-xs font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                Restaurar Padrão
              </button>
              <button
                type="button"
                data-testid="btn-hud-save"
                onClick={handleSave}
                className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[10px] sm:text-xs font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer shadow-md shadow-emerald-500/25"
              >
                <Check className="w-3.5 h-3.5" />
                Salvar HUD
              </button>
              <button
                type="button"
                data-testid="btn-hud-close"
                onClick={onClose}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
                title="Fechar"
                aria-label="Fechar Editor de HUD"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Painel do Botão Selecionado (Tamanho / Escala e Coordenadas Percentuais X% / Y%) */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <div>
                <div
                  data-testid="hud-selected-label"
                  className="text-[11px] font-black uppercase text-amber-300 leading-tight"
                >
                  Selecionado: {selectedMeta.label}
                </div>
                <div
                  data-testid="hud-selected-coords"
                  className="text-[10px] text-slate-300 font-mono-num leading-tight"
                >
                  Posição: X {selectedTransform.x.toFixed(1)}% · Y {selectedTransform.y.toFixed(1)}%
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 bg-slate-900/90 border border-white/10 rounded-xl px-2.5 py-1">
              <span
                data-testid="hud-selected-scale"
                className="text-[10px] font-bold uppercase text-slate-200 whitespace-nowrap font-mono-num"
              >
                Tamanho: {Math.round(selectedTransform.scale * 100)}%
              </span>
              <input
                type="range"
                aria-label="Tamanho do botão selecionado"
                data-testid="hud-scale-slider"
                min={0.65}
                max={1.45}
                step={0.05}
                value={selectedTransform.scale}
                onChange={(e) => handleScaleChange(parseFloat(e.target.value))}
                className="w-28 sm:w-40 accent-amber-400 cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Componente Único <TouchControls editMode={true} /> — 100% Idêntico à Partida */}
      <TouchControls
        editMode={true}
        layout={layout}
        selectedButtonId={selectedBtn}
        onSelectButton={setSelectedBtn}
        onChangeLayout={setLayout}
      />
    </div>
  );
};
