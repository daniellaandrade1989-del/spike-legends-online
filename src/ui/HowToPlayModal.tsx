/**
 * Spike Legends Online — Guia Pré-Partida "Como Jogar"
 * Exibido sempre antes de iniciar uma partida (ou acessível pela Pausa),
 * detalhando o que cada tecla/botão faz no PC e no Celular e como executar cada jogada.
 */
import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowUp,
  Gamepad2,
  Keyboard,
  Play,
  Settings2,
  Shield,
  Smartphone,
  Sparkles,
  Zap,
} from 'lucide-react';
import { ARENAS } from '../maps/arenas';
import type { ArenaId, GameMode } from '../config/gameConfig';
import { formatKeyCode, type KeyBindingsConfig } from '../config/keyBindings';
import { soundEngine } from '../audio/soundEngine';
import { KeyBindingsPanel } from './KeyBindingsPanel';

interface HowToPlayModalProps {
  mode: GameMode;
  arenaId: ArenaId;
  targetPoints?: number;
  isOnline: boolean;
  isMidMatchHelp?: boolean;
  keyBindings: KeyBindingsConfig;
  onChangeKeyBindings: (next: KeyBindingsConfig) => void;
  onResetKeyBindings: () => void;
  onStartMatch: () => void;
  onBackToMenu?: () => void;
}

interface ControlItem {
  keys: string;
  action: string;
  howTo: string;
  accent?: 'orange' | 'cyan' | 'amber' | 'slate';
}

function buildPcControls(kb: KeyBindingsConfig): ControlItem[] {
  const a = kb.actions;
  return [
    {
      keys: `${formatKeyCode(a.moveLeft)} ${formatKeyCode(a.moveRight)} + Mouse`,
      action: 'Mover & Mira Dinâmica',
      howTo: `Na areia há inércia! Mova o ponteiro do mouse na quadra rival para mirar: perto da rede faz Largadinha, no fundo manda Cortada Longa.`,
      accent: 'slate',
    },
    {
      keys: `${formatKeyCode(a.jump)} / ${kb.mouseEnabled ? `Clique Esq. ou ${formatKeyCode(a.spike)}` : formatKeyCode(a.spike)}`,
      action: 'Pular + Atacar Unificado & Saque',
      howTo: `No chão, o 1º clique faz o jogador pular (ou sacar após o apito). No ar, o 2º clique executa o corte com envergadura! Pule na rede para bloquear.`,
      accent: 'orange',
    },
    {
      keys: formatKeyCode(a.set),
      action: 'Toque / Levantamento Preciso',
      howTo: `Aperte ${formatKeyCode(a.set)} (Tecla E) para levantar a bola em arco parabólico alto e próximo à rede, na zona ideal de ataque do parceiro!`,
      accent: 'cyan',
    },
    {
      keys: kb.mouseEnabled
        ? `${formatKeyCode(a.receive)} / ${formatKeyCode(a.dive)} / Clique Dir.`
        : `${formatKeyCode(a.receive)} / ${formatKeyCode(a.dive)}`,
      action: 'Manchete (Recepção) & Peixinho',
      howTo: `Aperte ${formatKeyCode(a.receive)} para defender saques e cortadas na manchete! Use ${formatKeyCode(a.dive)} para mergulho Peixinho.`,
      accent: 'cyan',
    },
    {
      keys: `${formatKeyCode(a.serveFloat)} · ${formatKeyCode(a.serveUnderhand)} · ${formatKeyCode(a.serveJump)} / ${formatKeyCode(a.toggleFootMode)}`,
      action: 'Seleção de Saque & Shark Attack',
      howTo: `A jogada só inicia após o apito! ${formatKeyCode(a.serveFloat)} Saque Simples · ${formatKeyCode(a.serveUnderhand)} Por Baixo · ${formatKeyCode(a.serveJump)} Saque Viagem. ${formatKeyCode(a.toggleFootMode)} alterna Shark Attack.`,
      accent: 'slate',
    },
    {
      keys: formatKeyCode(a.ultimate),
      action: 'Ativar Super Attack (5s)',
      howTo: `Quando a barra atingir 100%, aperte ${formatKeyCode(a.ultimate)} para ganhar buff de status por 5 segundos!`,
      accent: 'amber',
    },
  ];
}

const MOBILE_CONTROLS: ControlItem[] = [
  {
    keys: 'Setas Esq. / Dir.',
    action: 'Mover e Posicionar',
    howTo: 'Toque nos botões direcionais para posicionar na defesa, aproximar da rede ou preparar o ataque.',
    accent: 'slate',
  },
  {
    keys: 'Pular / Atacar (Laranja ⚡)',
    action: 'Pular + Atacar no Mesmo Botão',
    howTo: 'No chão: 1º toque faz o jogador pular (ou sacar). No ar: 2º toque executa o ataque/cortada com envergadura!',
    accent: 'orange',
  },
  {
    keys: 'Botão Toque (Azul ↑)',
    action: 'Toque / Levantamento Alto',
    howTo: 'Calcula trajetória parabólica precisa que coloca a bola alta e perto da rede para o parceiro atacar.',
    accent: 'cyan',
  },
  {
    keys: 'Manchete (Verde) & Dive',
    action: 'Recepção de Manchete & Peixinho',
    howTo: 'Hitbox ampliada para defender saques e cortadas com precisão, ou mergulhe no Peixinho.',
    accent: 'cyan',
  },
];

function getModeLabel(mode: GameMode, isOnline: boolean): string {
  if (mode === 'coop_2v2') return 'Co-op: 2 Humanos vs 2 Bots';
  if (isOnline) {
    return mode === '2v2' ? 'Online 2×2' : 'Online 1×1';
  }
  if (mode === 'training_spike') return 'Treino: Cortadas';
  if (mode === 'training_receive') return 'Treino: Recepção';
  if (mode === 'campaign') return 'Modo Campanha';
  if (mode === 'tournament') return 'Liga Mata-Mata';
  if (mode === 'training') return 'Treino Livre';
  if (mode === '2v2') return 'Duplas 2×2 (IA)';
  return 'Duelo 1×1 VS IA';
}

function getBadgeStyle(accent: ControlItem['accent']): string {
  switch (accent) {
    case 'orange':
      return 'bg-[#F97316]/20 border-[#F97316]/60 text-orange-300';
    case 'cyan':
      return 'bg-sky-500/20 border-sky-400/60 text-sky-300';
    case 'amber':
      return 'bg-amber-400/20 border-amber-400/60 text-amber-300';
    default:
      return 'bg-slate-800 border-slate-600 text-slate-200';
  }
}

export const HowToPlayModal: React.FC<HowToPlayModalProps> = ({
  mode,
  arenaId,
  targetPoints = 15,
  isOnline,
  isMidMatchHelp = false,
  keyBindings,
  onChangeKeyBindings,
  onResetKeyBindings,
  onStartMatch,
  onBackToMenu,
}) => {
  const [mobileTab, setMobileTab] = useState<'pc' | 'mobile'>(() => {
    if (typeof window !== 'undefined' && (window.innerWidth < 768 || 'ontouchstart' in window)) {
      return 'mobile';
    }
    return 'pc';
  });
  const [showRemap, setShowRemap] = useState(false);

  // Permite iniciar rapidamente pelo teclado após pequeno intervalo de segurança (quando não está remapeando)
  useEffect(() => {
    if (showRemap) return;
    let armed = false;
    const timer = window.setTimeout(() => {
      armed = true;
    }, 180);

    const onKey = (e: KeyboardEvent) => {
      if (!armed || e.repeat) return;
      if (e.code === 'Enter') {
        e.preventDefault();
        soundEngine.unlock();
        soundEngine.playButtonClick();
        onStartMatch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [onStartMatch, showRemap]);

  const arenaName = ARENAS[arenaId].name;
  const modeLabel = getModeLabel(mode, isOnline);
  const pcControls = buildPcControls(keyBindings);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Como Jogar"
      data-testid="how-to-play-modal"
      className="fixed inset-0 z-30 bg-[#0B1120]/88 flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
    >
      <div className="w-full max-w-4xl bg-[#0F172A] border-2 border-slate-700 rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[94vh] flex flex-col">
        {/* Cabeçalho do Guia */}
        <div className="px-4 sm:px-6 py-4 bg-[#1E293B] border-b border-slate-700 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#F97316] text-slate-950 flex items-center justify-center shrink-0">
              <Gamepad2 className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display font-bold text-xl sm:text-2xl text-white tracking-wide">
                  COMO JOGAR
                </h2>
                <span className="px-2.5 py-0.5 rounded-md bg-slate-900 border border-slate-600 text-[11px] font-bold text-amber-300 whitespace-nowrap">
                  {modeLabel} · {arenaName}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
                Veja o que cada tecla faz no <strong className="text-white">PC</strong> e no{' '}
                <strong className="text-white">Celular</strong> antes do saque inicial.
              </p>
            </div>
          </div>

          {isOnline && (
            <span className="px-3 py-1 rounded-lg bg-cyan-500/15 border border-cyan-400/50 text-cyan-300 text-xs font-bold whitespace-nowrap">
              Partida Online ao Vivo
            </span>
          )}
        </div>

        {/* Corpo com Abas no Celular e Colunas Lado a Lado no Desktop */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {/* Seletor PC / Celular visível apenas em telas pequenas (< md) */}
          <div className="grid grid-cols-2 gap-2 md:hidden bg-[#1E293B] p-1 rounded-xl">
            <button
              type="button"
              data-testid="tab-guide-mobile"
              onClick={() => setMobileTab('mobile')}
              className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                mobileTab === 'mobile'
                  ? 'bg-[#F97316] text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              Celular (Touch)
            </button>
            <button
              type="button"
              data-testid="tab-guide-pc"
              onClick={() => setMobileTab('pc')}
              className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                mobileTab === 'pc'
                  ? 'bg-[#F97316] text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Keyboard className="w-4 h-4" />
              PC (Teclado)
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Cartão PC / Remapeamento Inline */}
            <section
              aria-label="Controles no PC"
              className={`${
                mobileTab === 'pc' ? 'block' : 'hidden'
              } md:block bg-[#0B1120] border border-slate-800 rounded-xl p-4`}
            >
              <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Keyboard className="w-5 h-5 text-sky-400 shrink-0" />
                  <h3 className="font-display font-bold text-base text-white">
                    No Computador (PC)
                  </h3>
                </div>
                <button
                  type="button"
                  data-testid="btn-toggle-guide-remap"
                  onClick={() => {
                    soundEngine.playButtonClick();
                    setShowRemap((v) => !v);
                  }}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                    showRemap
                      ? 'bg-[#F97316] border-[#F97316] text-slate-950'
                      : 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-amber-300'
                  }`}
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  {showRemap ? 'Ver Resumo' : 'Mapear Botões'}
                </button>
              </div>

              {showRemap ? (
                <KeyBindingsPanel
                  keyBindings={keyBindings}
                  onChange={onChangeKeyBindings}
                  onReset={onResetKeyBindings}
                  compact
                />
              ) : (
                <div className="space-y-2.5">
                  {pcControls.map((item) => (
                    <div
                      key={item.action}
                      className="bg-[#0F172A] border border-slate-800/90 rounded-lg p-2.5 flex flex-col gap-1"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white">{item.action}</span>
                        <kbd
                          className={`px-2 py-0.5 rounded border text-[11px] font-mono-num font-bold ${getBadgeStyle(
                            item.accent,
                          )}`}
                        >
                          {item.keys}
                        </kbd>
                      </div>
                      <p className="text-xs text-slate-300 leading-snug">{item.howTo}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Cartão Celular + Como Pontuar */}
            <div
              className={`${
                mobileTab === 'mobile' ? 'flex' : 'hidden'
              } md:flex flex-col gap-4`}
            >
              <section
                aria-label="Controles no Celular"
                className="bg-[#0B1120] border border-slate-800 rounded-xl p-4"
              >
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-800">
                  <Smartphone className="w-5 h-5 text-[#F97316] shrink-0" />
                  <h3 className="font-display font-bold text-base text-white">
                    No Celular (Toque na Tela)
                  </h3>
                </div>

                <div className="space-y-2.5">
                  {MOBILE_CONTROLS.map((item) => (
                    <div
                      key={item.keys}
                      className="bg-[#0F172A] border border-slate-800/90 rounded-lg p-2.5 flex flex-col gap-1"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white">{item.action}</span>
                        <span
                          className={`px-2 py-0.5 rounded border text-[11px] font-bold ${getBadgeStyle(
                            item.accent,
                          )}`}
                        >
                          {item.keys}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 leading-snug">{item.howTo}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Resumo Rápido de Como Vencer */}
              <section className="bg-[#1E293B]/80 border border-slate-700 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center gap-2 text-amber-300 font-display font-bold text-sm">
                  <Sparkles className="w-4 h-4 shrink-0" />
                  Como Funciona a Partida
                </div>
                <ul className="text-xs text-slate-200 space-y-1.5 leading-relaxed">
                  <li className="flex items-start gap-2">
                    <Zap className="w-3.5 h-3.5 text-[#F97316] shrink-0 mt-0.5" />
                    <span>
                      <strong>Apito do Árbitro & Quadra Ampla (20m):</strong> Todo rali começa após o apito oficial! Escolha entre Saque Simples ou Viagem atrás da linha de fundo. O 2º jogador levanta sempre uma <strong>Bola Alta</strong> perto da rede.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <ArrowUp className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>Regras Oficiais ({targetPoints} Pontos):</strong> Máximo de 3 toques por time, sem Dois Toques (bloqueio não conta!) e sem invadir o lado rival. Tocar na rede é liberado! Vence quem fizer <strong>{targetPoints} pontos</strong> (diferença de 2).
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>Mira pelo Mouse & LMB/RMB:</strong> Aponte o mouse na quadra adversária para mirar curto ou fundo e remapeie Pulo/Corte para LMB e RMB em "Mapear Botões"!
                    </span>
                  </li>
                </ul>
              </section>
            </div>
          </div>
        </div>

        {/* Rodapé com Botão de Entrar em Quadra */}
        <div className="px-4 sm:px-6 py-3.5 bg-[#1E293B] border-t border-slate-700 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0">
          {onBackToMenu ? (
            <button
              type="button"
              onClick={() => {
                soundEngine.playButtonClick();
                onBackToMenu();
              }}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <ArrowLeft className="w-4 h-4" />
              {isMidMatchHelp ? 'Voltar à Pausa' : 'Voltar ao Menu'}
            </button>
          ) : (
            <span className="text-xs text-slate-400 hidden sm:inline">
              Dica: Pressione <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-200">Enter</kbd> para começar
            </span>
          )}

          <button
            type="button"
            data-testid="btn-start-from-guide"
            data-start="true"
            onClick={() => {
              soundEngine.unlock();
              soundEngine.playButtonClick();
              onStartMatch();
            }}
            className="sm:ml-auto px-7 py-3 rounded-xl bg-[#F97316] hover:bg-[#EA580C] active:translate-y-0.5 text-slate-950 font-display font-bold text-base tracking-wide flex items-center justify-center gap-2 shadow-[0_3px_0_#9A3412] cursor-pointer whitespace-nowrap"
          >
            <Play className="w-5 h-5 fill-current" />
            {isMidMatchHelp ? 'Voltar para a Quadra' : 'Entrar em Quadra!'}
          </button>
        </div>
      </div>
    </div>
  );
};
