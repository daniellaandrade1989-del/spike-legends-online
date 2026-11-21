/**
 * Spike Legends Online — Lobby da Sala Privada Multiplayer com Chat em Tempo Real e Código de Convite
 */
import React, { useState } from 'react';
import { Bot, Check, CheckCircle2, Copy, Play, Send, ArrowLeft } from 'lucide-react';
import { QUICK_CHAT_MESSAGES, type ArenaId } from '../config/gameConfig';
import { ARENA_LIST } from '../maps/arenas';
import { CHARACTERS } from '../characters/roster';
import {
  type ChatMessageItem,
  type RoomStatePayload,
} from '../network/socketClient';
import { soundEngine } from '../audio/soundEngine';
import { AnimeAvatar } from './AnimeAvatar';

interface LobbyScreenProps {
  room: RoomStatePayload;
  localPlayerId: string;
  pingMs: number;
  chatMessages: ChatMessageItem[];
  onLeave: () => void;
  onToggleReady: (ready: boolean) => void;
  onSelectMode?: (mode: '1v1' | '2v2' | 'coop_2v2') => void;
  onSelectArena: (arenaId: ArenaId) => void;
  onFillBots: () => void;
  onStartMatch: () => void;
  onSendChat: (text: string) => void;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  room,
  localPlayerId,
  pingMs,
  chatMessages,
  onLeave,
  onToggleReady,
  onSelectMode,
  onSelectArena,
  onFillBots,
  onStartMatch,
  onSendChat,
}) => {
  const [chatInput, setChatInput] = useState('');
  const [copied, setCopied] = useState(false);

  const isHost = room.hostId === localPlayerId;
  const me = room.members.find((m) => m.playerId === localPlayerId);
  const currentMode: '1v1' | '2v2' | 'coop_2v2' =
    room.mode === '2v2' ? '2v2' : room.mode === 'coop_2v2' ? 'coop_2v2' : '1v1';
  const is1v1Mode = room.is1v1Mode !== undefined ? room.is1v1Mode : currentMode === '1v1';
  const humanMembers = room.members.filter((m) => !m.isAi && m.connected);
  const hasBotsInLobby = room.members.some((m) => m.isAi);
  const canStartMatch = humanMembers.length >= 2 || hasBotsInLobby;

  const modeTitleLabel =
    currentMode === '1v1'
      ? '1x1 Puro'
      : currentMode === 'coop_2v2'
        ? 'Co-op: 2 Jogadores vs 2 Bots'
        : '2x2 (Com Parceiros IA)';

  const handleCopyCode = () => {
    void navigator.clipboard?.writeText(room.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    onSendChat(chatInput);
    setChatInput('');
  };

  const handleModeChange = (nextMode: '1v1' | '2v2' | 'coop_2v2') => {
    if (!isHost || currentMode === nextMode) return;
    soundEngine.playButtonClick();
    onSelectMode?.(nextMode);
  };

  return (
    <div className="fixed inset-0 z-20 bg-[#0B1120]/90 overflow-y-auto p-4 md:p-8">
      <div className="max-w-5xl mx-auto flex flex-col gap-5">
        {/* Cabeçalho do Lobby */}
        <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                soundEngine.playButtonClick();
                onLeave();
              }}
              className="px-3.5 py-2 rounded-lg bg-[#1E293B] hover:bg-slate-700 text-slate-200 text-sm font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Sair
            </button>
            <div>
              <h1 data-testid="lobby-header-title" className="font-display font-bold text-xl text-white">
                Lobby da Sala · {modeTitleLabel}
              </h1>
              <div className="text-xs text-slate-400 font-mono-num">
                Ping {pingMs} ms · Jogadores na sala: {humanMembers.length}/2 ·{' '}
                <span className="text-emerald-400 font-bold">Sala Online Pronta</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div
              data-testid="lobby-room-code"
              className="px-4 py-2 rounded-xl bg-[#1E293B] border border-amber-400/50 font-mono-num text-base font-bold text-amber-300"
            >
              {room.code}
            </div>
            <button
              type="button"
              onClick={handleCopyCode}
              className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Times & Controles */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-5">
              {/* Seletor de Modo de Jogo */}
              <div
                data-testid="lobby-mode-selector"
                className="mb-5 p-4 rounded-xl bg-[#1E293B]/80 border border-slate-700/80"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
                    Modo de Jogo {isHost ? '(Escolha do Líder)' : '(Definido pelo Líder)'}
                  </span>
                  <span
                    data-testid="lobby-rules-badge"
                    className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-md border ${
                      is1v1Mode
                        ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-200'
                        : currentMode === 'coop_2v2'
                          ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200'
                          : 'bg-amber-500/15 border-amber-400/40 text-amber-200'
                    }`}
                  >
                    {is1v1Mode
                      ? 'Duelo 1x1 · Até 3 toques seguidos por jogador'
                      : currentMode === 'coop_2v2'
                        ? 'Co-op 2x2 · 2 Jogadores contra 2 Bots'
                        : 'Duplas 2x2 · Alterne os toques com seu parceiro'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    data-testid="btn-lobby-mode-1v1"
                    disabled={!isHost}
                    onClick={() => handleModeChange('1v1')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      currentMode === '1v1'
                        ? 'bg-cyan-500/20 border-cyan-400 text-white shadow-sm'
                        : 'bg-[#0F172A] border-slate-700 text-slate-300 hover:border-slate-600'
                    } ${!isHost ? 'opacity-90 cursor-default' : 'cursor-pointer'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display font-bold text-sm">1x1 Puro</span>
                      {currentMode === '1v1' && (
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-cyan-400 text-slate-950">
                          Ativo
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1">
                      Duelo direto entre os dois jogadores na quadra, com até 3 toques por jogada.
                    </p>
                  </button>

                  <button
                    type="button"
                    data-testid="btn-lobby-mode-2v2"
                    disabled={!isHost}
                    onClick={() => handleModeChange('2v2')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      currentMode === '2v2'
                        ? 'bg-amber-500/20 border-amber-400 text-white shadow-sm'
                        : 'bg-[#0F172A] border-slate-700 text-slate-300 hover:border-slate-600'
                    } ${!isHost ? 'opacity-90 cursor-default' : 'cursor-pointer'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display font-bold text-sm">2x2 (Com Parceiros IA)</span>
                      {currentMode === '2v2' && (
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-400 text-slate-950">
                          Ativo
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1">
                      Cada jogador ganha um parceiro IA para levantar e bloquear. Não vale dois toques seguidos!
                    </p>
                  </button>

                  <button
                    type="button"
                    data-testid="btn-lobby-mode-coop"
                    disabled={!isHost}
                    onClick={() => handleModeChange('coop_2v2')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      currentMode === 'coop_2v2'
                        ? 'bg-emerald-500/20 border-emerald-400 text-white shadow-sm'
                        : 'bg-[#0F172A] border-slate-700 text-slate-300 hover:border-slate-600'
                    } ${!isHost ? 'opacity-90 cursor-default' : 'cursor-pointer'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display font-bold text-sm">Co-op: 2 Humanos vs 2 Bots</span>
                      {currentMode === 'coop_2v2' && (
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-400 text-slate-950">
                          Ativo
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1">
                      Vocês dois jogam no mesmo time contra uma dupla de Bots adversários.
                    </p>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-bold text-lg text-white">
                  {currentMode === 'coop_2v2'
                    ? `Time Co-op (${humanMembers.length}/2) vs Dupla IA`
                    : `Jogadores na Sala (${humanMembers.length}/2)`}
                </h2>
                {isHost && room.members.length < room.maxPlayers && (
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playButtonClick();
                      onFillBots();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#1E293B] hover:bg-slate-700 text-xs font-bold text-cyan-300 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Bot className="w-4 h-4" />
                    Completar com IA
                  </button>
                )}
              </div>

              <div data-testid="lobby-members-list" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {room.members.map((m, idx) => {
                  const char = CHARACTERS[m.characterId];
                  const coopRoleLabel =
                    currentMode === 'coop_2v2' && !m.isAi
                      ? idx === 0
                        ? 'Ataque / Saque'
                        : 'Levantador / Defesa'
                      : null;
                  return (
                    <div
                      key={m.playerId}
                      data-testid={`lobby-member-${m.team}-${m.slotIndex}`}
                      className="p-3.5 rounded-xl bg-[#1E293B] border border-slate-700 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <AnimeAvatar characterId={m.characterId} className="w-11 h-11" />
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-white truncate">
                            {m.name} {m.isAi ? '(IA)' : m.playerId === localPlayerId ? '(Você)' : ''}
                          </div>
                          <div className="text-xs text-slate-400">
                            {m.team === 'left' ? 'Time Azul' : 'Time Laranja'} · {char.name}
                            {coopRoleLabel ? ` · ${coopRoleLabel}` : ''}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`text-xs font-bold ${
                          m.ready ? 'text-emerald-400' : 'text-amber-300'
                        }`}
                      >
                        {m.ready ? 'Pronto' : 'Aguardando'}
                      </span>
                    </div>
                  );
                })}

                {currentMode === '2v2' &&
                  !room.members.some((m) => m.team === 'left' && m.slotIndex === 1) && (
                    <div
                      data-testid="lobby-ai-partner-preview-left"
                      className="p-3.5 rounded-xl bg-[#1E293B]/60 border border-dashed border-cyan-400/50 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Bot className="w-8 h-8 text-cyan-300 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-cyan-200 truncate">
                            Parceiro IA · Time Azul
                          </div>
                          <div className="text-xs text-slate-400">
                            Levantamento & Bloqueio
                          </div>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-cyan-300">Incluso</span>
                    </div>
                  )}

                {currentMode === '2v2' &&
                  !room.members.some((m) => m.team === 'right' && m.slotIndex === 1) && (
                    <div
                      data-testid="lobby-ai-partner-preview-right"
                      className="p-3.5 rounded-xl bg-[#1E293B]/60 border border-dashed border-amber-400/50 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Bot className="w-8 h-8 text-amber-300 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-amber-200 truncate">
                            Parceiro IA · Time Laranja
                          </div>
                          <div className="text-xs text-slate-400">
                            Levantamento & Bloqueio
                          </div>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-amber-300">Incluso</span>
                    </div>
                  )}

                {currentMode === 'coop_2v2' && (
                  <>
                    <div
                      data-testid="lobby-coop-enemy-bot-1"
                      className="p-3.5 rounded-xl bg-[#1E293B]/60 border border-dashed border-amber-400/50 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Bot className="w-8 h-8 text-amber-300 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-amber-200 truncate">
                            Bot Adversário 1 · Time Laranja
                          </div>
                          <div className="text-xs text-slate-400">
                            Recepção & Ataque
                          </div>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-amber-300">Adversário</span>
                    </div>

                    <div
                      data-testid="lobby-coop-enemy-bot-2"
                      className="p-3.5 rounded-xl bg-[#1E293B]/60 border border-dashed border-amber-400/50 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Bot className="w-8 h-8 text-amber-300 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-amber-200 truncate">
                            Bot Adversário 2 · Time Laranja
                          </div>
                          <div className="text-xs text-slate-400">
                            Levantamento & Bloqueio
                          </div>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-amber-300">Adversário</span>
                    </div>
                  </>
                )}
              </div>

              {isHost && (
                <div className="mt-5">
                  <label htmlFor="lobby-arena-select" className="block text-xs font-semibold text-slate-400 mb-1.5">
                    Arena Selecionada
                  </label>
                  <select
                    id="lobby-arena-select"
                    value={room.arenaId}
                    onChange={(e) => onSelectArena(e.target.value as ArenaId)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#1E293B] border border-slate-700 text-white text-sm"
                  >
                    {ARENA_LIST.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-3">
                {me && (
                  <button
                    type="button"
                    onClick={() => onToggleReady(!me.ready)}
                    className="px-5 py-3 rounded-xl bg-[#1E293B] hover:bg-slate-700 border border-slate-600 text-white font-bold text-sm whitespace-nowrap cursor-pointer"
                  >
                    {me.ready ? 'Cancelar Pronto' : 'Ficar Pronto'}
                  </button>
                )}

                {isHost ? (
                  <button
                    type="button"
                    data-testid="btn-lobby-start-match"
                    disabled={!canStartMatch}
                    onClick={() => {
                      if (!canStartMatch) return;
                      soundEngine.playButtonClick();
                      onStartMatch();
                    }}
                    className={`flex-1 px-6 py-3 rounded-xl font-display font-bold text-base flex items-center justify-center gap-2 whitespace-nowrap ${
                      canStartMatch
                        ? 'bg-[#F97316] hover:bg-[#EA580C] text-slate-950 cursor-pointer'
                        : 'bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed'
                    }`}
                  >
                    <Play className="w-5 h-5 fill-current" />
                    {canStartMatch
                      ? `Iniciar Partida (${modeTitleLabel})`
                      : `Aguardando 2º Jogador (${humanMembers.length}/2)`}
                  </button>
                ) : (
                  <div
                    data-testid="guest-datachannel-status"
                    className="flex-1 px-5 py-3 rounded-xl font-display font-bold text-sm flex items-center justify-center gap-2 border bg-emerald-950/60 border-emerald-500/50 text-emerald-300"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Conectado à sala · Aguardando o líder iniciar a partida</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Chat da Sala + Mensagens Rápidas */}
          <div className="lg:col-span-5 bg-[#0F172A] border border-slate-800 rounded-2xl p-5 flex flex-col h-[420px]">
            <h2 className="font-display font-bold text-lg text-white mb-3">Chat da Sala</h2>

            <div
              data-testid="lobby-chat-log"
              className="flex-1 overflow-y-auto space-y-2 pr-1 mb-3"
            >
              {chatMessages.length === 0 ? (
                <p className="text-xs text-slate-400">
                  Nenhuma mensagem ainda. Use o chat rápido abaixo ou envie uma saudação!
                </p>
              ) : (
                chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    data-testid="lobby-chat-message"
                    className="bg-[#1E293B] rounded-lg px-3 py-2 text-sm"
                  >
                    <span className="font-bold text-amber-300 mr-1.5">
                      {msg.senderName || msg.sender}:
                    </span>
                    <span className="text-slate-100">{msg.text}</span>
                  </div>
                ))
              )}
            </div>

            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {QUICK_CHAT_MESSAGES.slice(0, 6).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => onSendChat(q)}
                  className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
                >
                  {q}
                </button>
              ))}
            </div>

            <form onSubmit={handleChatSubmit} className="flex gap-2">
              <label htmlFor="lobby-chat-input" className="sr-only">
                Mensagem no chat da sala
              </label>
              <input
                id="lobby-chat-input"
                data-testid="lobby-chat-input"
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Digite uma mensagem..."
                maxLength={140}
                className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-[#1E293B] border border-slate-700 text-white text-sm"
              />
              <button
                type="submit"
                data-testid="lobby-chat-send"
                aria-label="Enviar mensagem"
                className="px-3.5 py-2 rounded-xl bg-[#F97316] text-slate-950 font-bold cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};