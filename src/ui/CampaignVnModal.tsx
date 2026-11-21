/**
 * Spike Legends Online — Diálogo Visual Novel Pré-Partida do Modo Campanha
 */
import React, { useState } from 'react';
import { ChevronRight, Play, Sparkles, X } from 'lucide-react';
import type { CampaignChapter } from '../rpg/rpgSystem';
import { ARENAS } from '../maps/arenas';
import { DIFFICULTY_TUNING } from '../config/gameConfig';
import { soundEngine } from '../audio/soundEngine';
import { AnimeAvatar } from './AnimeAvatar';

interface CampaignVnModalProps {
  chapter: CampaignChapter;
  onProceedToMatch: () => void;
  onCancel: () => void;
}

export const CampaignVnModal: React.FC<CampaignVnModalProps> = ({
  chapter,
  onProceedToMatch,
  onCancel,
}) => {
  const [lineIndex, setLineIndex] = useState(0);
  const currentLine = chapter.dialogs[lineIndex] ?? chapter.dialogs[0];
  const isLastLine = lineIndex >= chapter.dialogs.length - 1;
  const arena = ARENAS[chapter.arenaId];
  const diffLabel = DIFFICULTY_TUNING[chapter.difficulty].label;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`História ${chapter.title}`}
      data-testid="campaign-vn-modal"
      className="fixed inset-0 z-30 bg-[#0B1120]/90 flex flex-col justify-between p-4 md:p-8"
    >
      {/* Cabeçalho do Capítulo */}
      <div className="max-w-4xl w-full mx-auto flex items-center justify-between gap-3 bg-[#0F172A] border border-slate-700 rounded-xl px-4 py-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-amber-400">
            Modo Campanha · {arena.name} · {diffLabel}
          </div>
          <h2 className="font-display font-bold text-lg md:text-xl text-white">
            {chapter.title}
          </h2>
        </div>
        <button
          type="button"
          aria-label="Voltar ao Menu"
          onClick={() => {
            soundEngine.playButtonClick();
            onCancel();
          }}
          className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Palco Visual Novel: Retratos Anime frente a frente */}
      <div className="max-w-4xl w-full mx-auto my-auto flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4 px-2 sm:px-6">
          <div
            className={`flex flex-col items-center transition-all duration-200 ${
              currentLine.side === 'left' ? 'scale-105 opacity-100' : 'scale-95 opacity-55'
            }`}
          >
            <div className="p-2 rounded-2xl bg-[#0F172A] border-2 border-sky-400 shadow-lg">
              <AnimeAvatar characterId="akira" className="w-20 h-20 sm:w-28 sm:h-28" />
            </div>
            <span className="mt-2 px-3 py-0.5 rounded bg-sky-500/20 border border-sky-400/50 text-sky-300 text-xs font-bold">
              Akira (Você)
            </span>
          </div>

          <div className="hidden sm:flex flex-col items-center text-center pb-6">
            <span className="font-display font-bold text-2xl text-amber-400 tracking-widest">VS</span>
            <span className="text-xs text-slate-300 mt-1">Recompensa: +{chapter.rewardCoins} Moedas</span>
          </div>

          <div
            className={`flex flex-col items-center transition-all duration-200 ${
              currentLine.side === 'right' ? 'scale-105 opacity-100' : 'scale-95 opacity-55'
            }`}
          >
            <div className="p-2 rounded-2xl bg-[#0F172A] border-2 border-[#F97316] shadow-lg">
              <AnimeAvatar characterId={chapter.opponentCharacterId} className="w-20 h-20 sm:w-28 sm:h-28" />
            </div>
            <span className="mt-2 px-3 py-0.5 rounded bg-orange-500/20 border border-orange-400/50 text-orange-300 text-xs font-bold">
              {chapter.opponentName}
            </span>
          </div>
        </div>

        {/* Caixa de Diálogo */}
        <div className="bg-[#0F172A] border-2 border-slate-700 rounded-2xl p-5 md:p-6 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-lg text-white">{currentLine.speaker}</span>
              <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-600 text-[11px] font-semibold text-amber-300">
                {currentLine.mood}
              </span>
            </div>
            <span className="text-xs font-mono-num text-slate-400">
              {lineIndex + 1} / {chapter.dialogs.length}
            </span>
          </div>

          <p className="text-sm md:text-base text-slate-100 leading-relaxed min-h-[3.5rem]">
            “{currentLine.text}”
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={() => {
                soundEngine.playButtonClick();
                onProceedToMatch();
              }}
              className="text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
            >
              Pular Diálogo
            </button>

            {!isLastLine ? (
              <button
                type="button"
                data-testid="btn-vn-next"
                onClick={() => {
                  soundEngine.playButtonClick();
                  setLineIndex((i) => Math.min(chapter.dialogs.length - 1, i + 1));
                }}
                className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-display font-bold text-sm flex items-center gap-1.5 cursor-pointer"
              >
                Próxima Fala
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                data-testid="btn-vn-start-match"
                onClick={() => {
                  soundEngine.playButtonClick();
                  onProceedToMatch();
                }}
                className="px-6 py-2.5 rounded-xl bg-[#F97316] hover:bg-[#EA580C] text-slate-950 font-display font-bold text-sm flex items-center gap-2 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                Desafiar {chapter.opponentName}
                <Sparkles className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="h-2" />
    </div>
  );
};
