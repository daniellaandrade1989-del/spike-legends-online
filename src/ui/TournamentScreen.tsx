/**
 * Spike Legends Online — Tela de Liga / Torneio Mata-Mata Procedural
 */
import React from 'react';
import { ArrowLeft, Crown, Play, RotateCcw, Trophy } from 'lucide-react';
import { DIFFICULTY_TUNING } from '../config/gameConfig';
import type { TournamentMatchNode, TournamentState } from '../rpg/rpgSystem';
import { ARENAS } from '../maps/arenas';
import { soundEngine } from '../audio/soundEngine';
import { AnimeAvatar } from './AnimeAvatar';

interface TournamentScreenProps {
  tournament: TournamentState;
  onPlayNextMatch: () => void;
  onNewTournament: () => void;
  onBackToMenu: () => void;
}

const ROUND_LABELS: Record<'quartas' | 'semi' | 'final', string> = {
  quartas: 'Quartas de Final',
  semi: 'Semifinal',
  final: 'Grande Final',
};

export const TournamentScreen: React.FC<TournamentScreenProps> = ({
  tournament,
  onPlayNextMatch,
  onNewTournament,
  onBackToMenu,
}) => {
  const rounds: Array<'quartas' | 'semi' | 'final'> = ['quartas', 'semi', 'final'];
  const nextPlayerMatch = tournament.matches.find(
    (m) => m.round === tournament.currentRound && (m.teamA.isPlayer || m.teamB.isPlayer) && m.winner === null,
  );
  const arenaName = ARENAS[tournament.arenaId].name;
  const diffName = DIFFICULTY_TUNING[tournament.difficulty].label;

  const renderMatchCard = (m: TournamentMatchNode) => {
    const isPlayerMatch = m.teamA.isPlayer || m.teamB.isPlayer;
    return (
      <div
        key={m.id}
        className={`rounded-xl p-3 border ${
          isPlayerMatch
            ? 'bg-[#1E293B] border-[#F97316]'
            : 'bg-[#0B1120] border-slate-800'
        }`}
      >
        <div className="space-y-1.5 text-xs">
          {[
            { side: 'A' as const, team: m.teamA },
            { side: 'B' as const, team: m.teamB },
          ].map(({ side, team }) => {
            const isWin = m.winner === side;
            return (
              <div
                key={side}
                className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg ${
                  isWin
                    ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                    : m.winner !== null
                      ? 'text-slate-500 line-through'
                      : team.isPlayer
                        ? 'bg-sky-500/15 text-sky-200 font-bold'
                        : 'text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <AnimeAvatar characterId={team.characterId} className="w-6 h-6 shrink-0" />
                  <span className="truncate">{team.name}</span>
                </div>
                {isWin && <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div
      data-testid="tournament-screen"
      className="fixed inset-0 z-20 bg-[#0B1120]/90 flex flex-col overflow-y-auto p-4 md:p-8"
    >
      <div className="max-w-5xl w-full mx-auto flex flex-col gap-6 my-auto">
        <header className="flex flex-wrap items-center justify-between gap-4 bg-[#0F172A] border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center">
              <Crown className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-display font-bold text-2xl text-white">LIGA MATA-MATA</h1>
              <p className="text-xs text-slate-400">
                Arena: {arenaName} · Nível: {diffName} · Prêmio de Campeão: +500 Moedas
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              soundEngine.playButtonClick();
              onBackToMenu();
            }}
            className="px-4 py-2 rounded-xl bg-[#1E293B] hover:bg-slate-700 text-slate-200 text-sm font-semibold flex items-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao Menu
          </button>
        </header>

        {/* Estado do Torneio */}
        {tournament.currentRound === 'completed' && (
          <div
            className={`rounded-2xl p-5 border-2 flex flex-wrap items-center justify-between gap-4 ${
              tournament.championName && !tournament.eliminated
                ? 'bg-amber-950/50 border-amber-400'
                : 'bg-rose-950/40 border-rose-500/60'
            }`}
          >
            <div>
              <h2 className="font-display font-bold text-xl text-white">
                {tournament.eliminated
                  ? 'Eliminado do Torneio'
                  : `Campeão da Liga: ${tournament.championName}!`}
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                {tournament.eliminated
                  ? 'Treine seu timing na quadra ou evolua seus atributos e tente uma nova chave.'
                  : 'Parabéns! Você venceu todas as fases e recebeu +500 Moedas!'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                soundEngine.playButtonClick();
                onNewTournament();
              }}
              className="px-5 py-2.5 rounded-xl bg-[#F97316] hover:bg-[#EA580C] text-slate-950 font-display font-bold text-sm flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Gerar Nova Liga
            </button>
          </div>
        )}

        {/* Chaveamento em 3 Colunas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {rounds.map((r) => {
            const roundMatches = tournament.matches.filter((m) => m.round === r);
            return (
              <section
                key={r}
                className="bg-[#0F172A] border border-slate-800 rounded-2xl p-4 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h3 className="font-display font-bold text-sm uppercase tracking-wider text-amber-300">
                    {ROUND_LABELS[r]}
                  </h3>
                  {tournament.currentRound === r && (
                    <span className="px-2 py-0.5 rounded bg-[#F97316]/20 text-orange-300 text-[10px] font-bold">
                      FASE ATUAL
                    </span>
                  )}
                </div>

                {roundMatches.length === 0 ? (
                  <div className="text-xs text-slate-500 py-8 text-center">
                    Aguardando definição da fase anterior
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">{roundMatches.map(renderMatchCard)}</div>
                )}
              </section>
            );
          })}
        </div>

        {nextPlayerMatch && (
          <div className="flex justify-end">
            <button
              type="button"
              data-testid="btn-tournament-play"
              onClick={() => {
                soundEngine.playButtonClick();
                onPlayNextMatch();
              }}
              className="px-7 py-3.5 rounded-xl bg-[#F97316] hover:bg-[#EA580C] text-slate-950 font-display font-bold text-base flex items-center gap-2 shadow-lg cursor-pointer"
            >
              <Play className="w-5 h-5 fill-current" />
              Jogar {ROUND_LABELS[nextPlayerMatch.round]}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
