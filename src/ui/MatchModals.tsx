/**
 * Spike Legends Online — Modais de Pausa e Resultado da Partida (Vitória / Derrota)
 */
import React from 'react';
import { HelpCircle, Home, Move, Play, RotateCcw, Trophy } from 'lucide-react';
import type { MatchSnapshot } from '../physics/rapierWorld';

interface PauseModalProps {
  onResume: () => void;
  onShowGuide?: () => void;
  onCustomizeHud?: () => void;
  onRestart: () => void;
  onExitToMenu: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  onResume,
  onShowGuide,
  onCustomizeHud,
  onRestart,
  onExitToMenu,
}) => {
  return (
    <div className="fixed inset-0 z-30 bg-[#0B1120]/80 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-label="Jogo Pausado"
        className="w-full max-w-sm bg-[#0F172A] border-2 border-slate-700 rounded-2xl p-6 text-center shadow-2xl"
      >
        <h2 className="font-display font-bold text-2xl text-white mb-1">PARTIDA PAUSADA</h2>
        <p className="text-xs text-slate-400 mb-6">Pressione ESC para retornar à quadra</p>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onResume}
            className="w-full py-3 rounded-xl bg-[#F97316] hover:bg-[#EA580C] text-slate-950 font-display font-bold text-base flex items-center justify-center gap-2 cursor-pointer"
          >
            <Play className="w-5 h-5 fill-current" />
            Continuar
          </button>

          {onCustomizeHud && (
            <button
              type="button"
              data-testid="btn-pause-customize-hud"
              onClick={onCustomizeHud}
              className="w-full py-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-300 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <Move className="w-4 h-4" />
              Personalizar Controles (HUD)
            </button>
          )}

          {onShowGuide && (
            <button
              type="button"
              onClick={onShowGuide}
              className="w-full py-3 rounded-xl bg-[#1E293B] hover:bg-slate-700 text-amber-300 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <HelpCircle className="w-4 h-4" />
              Como Jogar (Controles)
            </button>
          )}

          <button
            type="button"
            onClick={onRestart}
            className="w-full py-3 rounded-xl bg-[#1E293B] hover:bg-slate-700 text-white font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            Reiniciar Partida
          </button>

          <button
            type="button"
            onClick={onExitToMenu}
            className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <Home className="w-4 h-4" />
            Voltar ao Menu
          </button>
        </div>
      </div>
    </div>
  );
};

interface MatchResultModalProps {
  snapshot: MatchSnapshot;
  localPlayerId: string;
  rewardCoins?: number;
  contextActionLabel?: string;
  onContextAction?: () => void;
  onPlayAgain: () => void;
  onExitToMenu: () => void;
}

export const MatchResultModal: React.FC<MatchResultModalProps> = ({
  snapshot,
  localPlayerId,
  rewardCoins = 0,
  contextActionLabel,
  onContextAction,
  onPlayAgain,
  onExitToMenu,
}) => {
  const localPlayer = snapshot.players.find((p) => p.id === localPlayerId);
  const myTeam = localPlayer?.team ?? 'left';
  const won = snapshot.score.winner === myTeam;
  const myScore = myTeam === 'left' ? snapshot.score.left : snapshot.score.right;
  const oppScore = myTeam === 'left' ? snapshot.score.right : snapshot.score.left;

  return (
    <div className="fixed inset-0 z-30 bg-[#0B1120]/85 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-label={won ? 'Vitória na Partida' : 'Derrota na Partida'}
        className="w-full max-w-md bg-[#0F172A] border-2 border-slate-700 rounded-2xl p-6 text-center shadow-2xl animate-spike-pop"
      >
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-3 bg-[#1E293B]">
          <Trophy className={`w-8 h-8 ${won ? 'text-amber-400' : 'text-slate-400'}`} />
        </div>

        <h2
          className={`font-display font-bold text-3xl tracking-wide mb-1 ${
            won ? 'text-amber-400' : 'text-rose-400'
          }`}
        >
          {won ? 'VITÓRIA LENDÁRIA!' : 'FIM DE JOGO'}
        </h2>
        <p className="text-sm text-slate-300 mb-3">
          {won ? 'Você dominou a rede e garantiu o set!' : 'Boa disputa! Ajuste o tempo de salto e tente a revanche.'}
        </p>

        {rewardCoins > 0 && (
          <div className="inline-block px-3.5 py-1 rounded-lg bg-amber-400/20 border border-amber-400/50 text-amber-300 font-bold text-xs mb-4">
            +{rewardCoins} Moedas RPG recebidas!
          </div>
        )}

        <div className="grid grid-cols-3 gap-2.5 mb-6">
          <div className="bg-[#1E293B] rounded-xl p-3">
            <div className="text-[11px] text-slate-400">Placar</div>
            <div className="font-display font-bold text-xl text-white tabular-nums">
              {myScore} - {oppScore}
            </div>
          </div>
          <div className="bg-[#1E293B] rounded-xl p-3">
            <div className="text-[11px] text-slate-400">Cortadas</div>
            <div className="font-display font-bold text-xl text-amber-400 tabular-nums">
              {localPlayer?.spikesCount ?? 0}
            </div>
          </div>
          <div className="bg-[#1E293B] rounded-xl p-3">
            <div className="text-[11px] text-slate-400">Perfeitos</div>
            <div className="font-display font-bold text-xl text-cyan-400 tabular-nums">
              {localPlayer?.perfectCount ?? 0}
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          {onContextAction && contextActionLabel ? (
            <button
              type="button"
              data-start="true"
              onClick={onContextAction}
              className="flex-1 py-3 rounded-xl bg-[#F97316] hover:bg-[#EA580C] text-slate-950 font-display font-bold text-base flex items-center justify-center gap-2 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              {contextActionLabel}
            </button>
          ) : (
            <button
              type="button"
              data-start="true"
              onClick={onPlayAgain}
              className="flex-1 py-3 rounded-xl bg-[#F97316] hover:bg-[#EA580C] text-slate-950 font-display font-bold text-base flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Jogar Novamente
            </button>
          )}
          <button
            type="button"
            onClick={onExitToMenu}
            className="flex-1 py-3 rounded-xl bg-[#1E293B] hover:bg-slate-700 text-white font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <Home className="w-4 h-4" />
            Menu Principal
          </button>
        </div>
      </div>
    </div>
  );
};
