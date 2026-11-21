/**
 * Spike Legends Online — Menu Principal (Seleção de Modos, Heróis, Mapas, Economia Dupla Beta,
 * Loja 4 Abas, Missões Rápidas de Beta e Avaliação Beta +500 Diamantes)
 */
import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Bot,
  Coins,
  Crown,
  Dumbbell,
  Gem,
  KeyRound,
  Lock,
  LogOut,
  MessageSquarePlus,
  Play,
  Settings,
  ShoppingBag,
  Sparkles,
  Star,
  Target,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  Swords,
  Zap,
  Shield,
  CheckCircle2,
  X,
} from 'lucide-react';
import {
  DIFFICULTY_TUNING,
  type AiDifficulty,
  type ArenaId,
  type CharacterId,
  type CharacterStats,
} from '../config/gameConfig';
import { CHARACTER_LIST, CHARACTERS } from '../characters/roster';
import { ARENA_LIST, ARENAS } from '../maps/arenas';
import { calculateRankTier } from '../physics/volleyballRules';
import type { PlayerProfile } from '../firebase/client';
import {
  BETA_FEEDBACK_GEM_REWARD,
  BETA_MISSIONS,
  CAMPAIGN_CHAPTERS,
  RARITY_COLORS,
  computeEffectiveStats,
  getAthleteCard,
  type BetaGachaBoxResult,
  type BetaGachaBoxTier,
  type BetaMissionDefinition,
  type CampaignChapter,
  type DiamondRechargePack,
  type GachaPullResult,
  type PlayerRpgSave,
} from '../rpg/rpgSystem';
import { soundEngine } from '../audio/soundEngine';
import { customSoundtrackManager } from '../audio/customSoundtrackManager';
import { adminAuthManager } from '../auth/AdminAuthManager';
import type { KeyBindingsConfig } from '../config/keyBindings';
import { AnimeAvatar } from './AnimeAvatar';
import { RpgShopPanel, type StoreTabId } from './RpgShopPanel';
import { KeyBindingsPanel } from './KeyBindingsPanel';
import { CustomSoundtrackPanel } from './CustomSoundtrackPanel';
import { networkClient, type P2PConnectionDiagnostics } from '../network/socketClient';

interface MainMenuProps {
  profile: PlayerProfile;
  rpgSave: PlayerRpgSave;
  selectedCharacter: CharacterId;
  selectedArena: ArenaId;
  aiDifficulty: AiDifficulty;
  targetPoints: 15 | 21;
  muted: boolean;
  musicVol: number;
  sfxVol: number;
  joinCodeInput: string;
  matchmakingStatus: string | null;
  roomError: string | null;
  onSelectCharacter: (id: CharacterId) => void;
  onSelectArena: (id: ArenaId) => void;
  onChangeAiDifficulty: (diff: AiDifficulty) => void;
  onChangeTargetPoints: (pts: 15 | 21) => void;
  onStartLocalMode: (mode: 'training' | 'training_spike' | 'training_receive' | 'ai' | '2v2') => void;
  onStartCampaignChapter: (chapter: CampaignChapter) => void;
  onOpenTournament: () => void;
  onPullGacha: () => GachaPullResult | null;
  onSelectRpgCard: (cardId: string) => void;
  onUpgradeStat: (cardId: string, statKey: keyof CharacterStats) => { ok: boolean; error: string | null };
  onPurchaseShopItem?: (itemId: string) => { ok: boolean; error: string | null };
  onClaimDiamondPack?: (packId: string) => { ok: boolean; pack: DiamondRechargePack | null };
  onOpenGachaBox?: (boxId: BetaGachaBoxTier['id']) => BetaGachaBoxResult;
  onClaimMissionReward?: (missionId: BetaMissionDefinition['id']) => {
    ok: boolean;
    rewardCoins: number;
    rewardGems: number;
    error: string | null;
  };
  onSubmitBetaFeedback?: (stars: number, comment: string) => Promise<{ ok: boolean; rewardGems: number }>;
  onQueueOnline: (mode: '1v1' | '2v2') => void;
  onCancelQueue: () => void;
  onCreatePrivateRoom: () => void;
  onJoinCodeChange: (code: string) => void;
  onJoinPrivateRoom: () => void;
  onUpdateDisplayName: (name: string) => void;
  onToggleMute: () => void;
  onChangeVolumes: (music: number, sfx: number) => void;
  keyBindings: KeyBindingsConfig;
  onChangeKeyBindings: (next: KeyBindingsConfig) => void;
  onResetKeyBindings: () => void;
  onGoogleUpgrade: () => void;
  onLogout: () => void;
  isAdmin?: boolean;
  onAdminStateChange?: (isAdmin: boolean) => void;
  onAdminLogout?: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  profile,
  rpgSave,
  selectedCharacter,
  selectedArena,
  aiDifficulty,
  targetPoints,
  muted,
  musicVol,
  sfxVol,
  joinCodeInput,
  matchmakingStatus,
  roomError,
  onSelectCharacter,
  onSelectArena,
  onChangeAiDifficulty,
  onChangeTargetPoints,
  onStartLocalMode,
  onStartCampaignChapter,
  onOpenTournament,
  onPullGacha,
  onSelectRpgCard,
  onUpgradeStat,
  onPurchaseShopItem,
  onClaimDiamondPack,
  onOpenGachaBox,
  onClaimMissionReward,
  onSubmitBetaFeedback,
  onQueueOnline,
  onCancelQueue,
  onCreatePrivateRoom,
  onJoinCodeChange,
  onJoinPrivateRoom,
  onUpdateDisplayName,
  onToggleMute,
  onChangeVolumes,
  keyBindings,
  onChangeKeyBindings,
  onResetKeyBindings,
  onGoogleUpgrade,
  onLogout,
  isAdmin: isAdminProp,
  onAdminStateChange,
  onAdminLogout,
}) => {
  const [activeTab, setActiveTab] = useState<'play' | 'campaign' | 'shop' | 'heroes' | 'profile' | 'settings'>('play');
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [storeInitialTab, setStoreInitialTab] = useState<StoreTabId>('recharge');
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackStars, setFeedbackStars] = useState<number>(5);
  const [feedbackComment, setFeedbackComment] = useState<string>('');
  const [submittingFeedback, setSubmittingFeedback] = useState<boolean>(false);
  const [lobbyToast, setLobbyToast] = useState<string | null>(null);

  const [editingName, setEditingName] = useState(profile.displayName);
  const [, setSoundtrackTick] = useState(0);
  const [internalIsAdmin, setInternalIsAdmin] = useState<boolean>(() => adminAuthManager.isAdmin());
  const isAdmin = isAdminProp ?? internalIsAdmin;
  const [showSecretPrompt, setShowSecretPrompt] = useState(false);
  const [secretPasswordInput, setSecretPasswordInput] = useState('');
  const [isAuthenticatingAdmin, setIsAuthenticatingAdmin] = useState(false);
  const [p2pDiag, setP2pDiag] = useState<P2PConnectionDiagnostics>(() =>
    networkClient.getP2PDiagnostics(),
  );

  useEffect(() => {
    const unsubSoundtrack = customSoundtrackManager.subscribe(() => {
      setSoundtrackTick((t) => t + 1);
    });
    const unsubAdmin = adminAuthManager.subscribe((nextAdmin) => {
      setInternalIsAdmin(nextAdmin);
      onAdminStateChange?.(nextAdmin);
    });
    const unsubP2p = networkClient.onP2PDiagnostics((nextDiag) => {
      setP2pDiag(nextDiag);
    });
    void adminAuthManager.initializeFromUrl();
    return () => {
      unsubSoundtrack();
      unsubAdmin();
      unsubP2p();
    };
  }, [onAdminStateChange]);

  const showToast = (msg: string) => {
    setLobbyToast(msg);
    window.setTimeout(() => {
      setLobbyToast((curr) => (curr === msg ? null : curr));
    }, 3500);
  };

  const openStoreModal = (tab: StoreTabId = 'recharge') => {
    soundEngine.playButtonClick();
    setStoreInitialTab(tab);
    setStoreModalOpen(true);
  };

  const soundtrackState = customSoundtrackManager.getState();
  const rank = calculateRankTier(profile.elo);
  const hero = CHARACTERS[selectedCharacter];
  const activeCard = getAthleteCard(rpgSave.activeCardId);
  const activeOwned = rpgSave.ownedCards[rpgSave.activeCardId];
  const activeStats = computeEffectiveStats(activeCard, activeOwned);
  const activeRarityStyle = RARITY_COLORS[activeCard.rarity];
  const totalGames = profile.wins + profile.losses;
  const winrate = totalGames > 0 ? Math.round((profile.wins / totalGames) * 100) : 0;
  const gemsBalance = rpgSave.gems ?? 0;

  // Método 2: Gatilho invisível de 7 toques em menos de 3 segundos no Texto da Versão do Jogo
  const handleVersionTextTap = () => {
    if (isAdmin) return;
    const unlockedPrompt = adminAuthManager.registerVersionTap();
    if (unlockedPrompt) {
      setSecretPasswordInput('');
      setShowSecretPrompt(true);
    }
  };

  const handleSecretPromptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAuthenticatingAdmin) return;
    const candidate = secretPasswordInput.trim();
    if (!candidate) {
      setShowSecretPrompt(false);
      setSecretPasswordInput('');
      return;
    }
    setIsAuthenticatingAdmin(true);
    try {
      const ok = await adminAuthManager.authenticateWithSecretPassword(candidate);
      if (ok) {
        setInternalIsAdmin(true);
        onAdminStateChange?.(true);
        setShowSecretPrompt(false);
        setSecretPasswordInput('');
        setActiveTab('settings');
      } else {
        setShowSecretPrompt(false);
        setSecretPasswordInput('');
      }
    } finally {
      setIsAuthenticatingAdmin(false);
    }
  };

  const handleClaimMission = (missionId: BetaMissionDefinition['id']) => {
    if (!onClaimMissionReward) return;
    const res = onClaimMissionReward(missionId);
    if (res.ok) {
      soundEngine.playPerfectHit();
      soundEngine.playUltimate();
      showToast(`Missão Resgatada! +${res.rewardCoins} Spike Coins e +${res.rewardGems} Diamantes!`);
    } else {
      soundEngine.playButtonClick();
    }
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingFeedback || !onSubmitBetaFeedback) return;
    setSubmittingFeedback(true);
    try {
      const res = await onSubmitBetaFeedback(feedbackStars, feedbackComment.trim());
      soundEngine.playUltimate();
      setFeedbackModalOpen(false);
      setFeedbackComment('');
      if (res.rewardGems > 0) {
        showToast(`Obrigado pelo feedback! +${res.rewardGems} Diamantes creditados na sua conta!`);
      } else {
        showToast('Feedback atualizado com sucesso no Painel Admin!');
      }
    } finally {
      setSubmittingFeedback(false);
    }
  };

  return (
    <div
      id="Panel_Lobby"
      data-testid="panel-lobby"
      className="fixed inset-0 z-20 flex flex-col bg-[#0B1120]/82 overflow-y-auto"
    >
      {/* Top Bar (Perfil e Economia de Moeda Dupla: Spike Coins & Volley Gems / Diamantes) */}
      <header
        id="TopBar"
        data-testid="lobby-top-bar"
        className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 border-b border-slate-800 bg-[#0F172A]/95 shrink-0"
      >
        <div className="flex items-center gap-3">
          <span className="font-display font-bold text-xl tracking-wide text-white whitespace-nowrap">
            SPIKE LEGENDS
          </span>
          {/* Botão LOJA dedicado no Lobby abrindo o modal com as 4 abas */}
          <button
            type="button"
            data-testid="btn-lobby-open-store-modal"
            onClick={() => openStoreModal('recharge')}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#F97316] to-amber-400 hover:from-[#EA580C] hover:to-amber-300 text-slate-950 font-display font-black text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-md"
          >
            <ShoppingBag className="w-4 h-4" />
            LOJA
          </button>
        </div>

        <nav
          id="SideTopMenus"
          data-testid="lobby-side-top-menus"
          className="flex items-center gap-1 bg-[#1E293B] p-1 rounded-lg overflow-x-auto max-w-full"
        >
          {(
            [
              { id: 'play', label: 'Jogar' },
              { id: 'campaign', label: 'Campanha' },
              { id: 'shop', label: 'Loja & RPG' },
              { id: 'heroes', label: 'Heróis' },
              { id: 'profile', label: 'Perfil' },
              { id: 'settings', label: 'Ajustes' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              data-testid={`tab-${tab.id}`}
              onClick={() => {
                soundEngine.playButtonClick();
                setActiveTab(tab.id);
              }}
              className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                activeTab === tab.id
                  ? 'bg-[#F97316] text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
          <button
            type="button"
            data-testid="tab-tournament"
            onClick={() => {
              soundEngine.playButtonClick();
              onOpenTournament();
            }}
            className="px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold whitespace-nowrap cursor-pointer text-amber-300 hover:text-amber-200 flex items-center gap-1"
          >
            <Crown className="w-3.5 h-3.5" />
            Liga
          </button>
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          {/* Saldo 1: Spike Coins (Moeda Comum) */}
          <button
            type="button"
            title="Spike Coins (Moeda ganha em partidas)"
            onClick={() => openStoreModal('gacha')}
            className="px-2.5 py-1.5 rounded-lg bg-[#1E293B] hover:bg-slate-800 border border-amber-400/40 flex items-center gap-1.5 text-amber-300 font-mono-num font-bold text-xs cursor-pointer"
          >
            <Coins className="w-3.5 h-3.5 text-amber-400" />
            <span data-testid="menu-coins">{rpgSave.coins}</span>
          </button>

          {/* Saldo 2: Volley Gems / Diamantes (Moeda Premium — Grátis no Beta) */}
          <button
            type="button"
            title="Volley Gems / Diamantes (Clique para Recarga Grátis no Beta)"
            onClick={() => openStoreModal('recharge')}
            className="px-2.5 py-1.5 rounded-lg bg-[#1E293B] hover:bg-slate-800 border border-cyan-400/50 flex items-center gap-1.5 text-cyan-300 font-mono-num font-bold text-xs cursor-pointer"
          >
            <Gem className="w-3.5 h-3.5 text-cyan-400" />
            <span data-testid="menu-gems">{gemsBalance}</span>
            <span className="px-1 py-0.2 rounded bg-emerald-400 text-slate-950 font-black text-[9px] uppercase">
              +
            </span>
          </button>

          <div className="text-right hidden sm:block">
            <div className="text-sm font-bold text-white leading-tight">{profile.displayName}</div>
            <div className="text-xs text-slate-400 tabular-nums">
              {rank.name} · {profile.elo} Elo · Nv. {profile.level}
            </div>
          </div>

          <button
            type="button"
            aria-label={muted ? 'Ativar áudio' : 'Silenciar áudio'}
            onClick={onToggleMute}
            className="w-10 h-10 rounded-lg bg-[#1E293B] hover:bg-slate-700 flex items-center justify-center text-slate-200 cursor-pointer"
          >
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>

          {profile.isGuest ? (
            <button
              type="button"
              onClick={onGoogleUpgrade}
              className="px-3.5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold whitespace-nowrap cursor-pointer"
            >
              Vincular Google
            </button>
          ) : (
            <button
              type="button"
              aria-label="Sair da conta"
              onClick={onLogout}
              className="w-10 h-10 rounded-lg bg-[#1E293B] hover:bg-slate-700 flex items-center justify-center text-slate-300 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="flex-1 w-full max-w-6xl mx-auto p-4 md:p-8 flex flex-col gap-6">
        {lobbyToast && (
          <div
            data-testid="lobby-reward-toast"
            className="animate-spike-pop bg-emerald-950/90 border-2 border-emerald-400 text-emerald-100 px-4 py-3 rounded-xl text-sm font-bold flex items-center justify-between gap-3 shadow-lg"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-300 shrink-0" />
              <span>{lobbyToast}</span>
            </div>
            <button
              type="button"
              onClick={() => setLobbyToast(null)}
              className="text-xs text-emerald-300 hover:text-white cursor-pointer"
            >
              Fechar
            </button>
          </div>
        )}

        {roomError && (
          <div className="bg-red-950/90 border border-red-500/60 text-red-100 px-4 py-3 rounded-xl text-sm font-medium">
            {roomError}
          </div>
        )}

        {matchmakingStatus && (
          <div className="bg-[#0F172A] border-2 border-cyan-500 rounded-xl px-5 py-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="font-display font-bold text-lg text-cyan-300">{matchmakingStatus}</div>
              <div className="text-xs text-slate-300">
                Aguardando outro jogador na fila ou abra uma Sala Privada com bots para testar já.
              </div>
            </div>
            <button
              type="button"
              onClick={onCancelQueue}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-white cursor-pointer"
            >
              Cancelar Fila
            </button>
          </div>
        )}

        {activeTab === 'play' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Coluna Esquerda: Modos de Partida + Missões Rápidas de Beta */}
            <section className="lg:col-span-7 flex flex-col gap-4">
              <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="font-display font-bold text-xl text-white">Arena & Modos de Jogo</h2>
                    <p className="text-xs text-slate-400" data-testid="ai-difficulty-metrics">
                      Janela Perfeita: <strong className="text-cyan-300">{DIFFICULTY_TUNING[aiDifficulty].perfectReceiveWindowMs}ms</strong>
                      {' · '}ReactionDelay IA: <strong className="text-amber-300">{DIFFICULTY_TUNING[aiDifficulty].aiReactionDelaySec.toFixed(2)}s</strong>
                      {' · '}Bloqueio IA: <strong className="text-orange-300">{Math.round(DIFFICULTY_TUNING[aiDifficulty].aiBlockSuccessRate * 100)}%</strong>
                      {' · '}Vel. IA: <strong className="text-emerald-300">{DIFFICULTY_TUNING[aiDifficulty].aiMoveSpeedMultiplier.toFixed(2)}x</strong>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 bg-[#1E293B] p-1 rounded-lg">
                      {([15, 21] as const).map((pts) => (
                        <button
                          key={pts}
                          type="button"
                          data-testid={`target-points-${pts}`}
                          onClick={() => {
                            soundEngine.playButtonClick();
                            onChangeTargetPoints(pts);
                          }}
                          className={`px-2 py-1.5 rounded-md text-xs font-bold cursor-pointer whitespace-nowrap ${
                            targetPoints === pts
                              ? 'bg-sky-500 text-slate-950'
                              : 'text-slate-300 hover:text-white'
                          }`}
                        >
                          {pts} pts
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-1 bg-[#1E293B] p-1 rounded-lg">
                      {(
                        [
                          { id: 'easy', label: 'Iniciante' },
                          { id: 'medium', label: 'Avançado' },
                          { id: 'hard', label: 'Classe Mundial' },
                        ] as const
                      ).map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          data-testid={`difficulty-${d.id}`}
                          onClick={() => {
                            soundEngine.playButtonClick();
                            onChangeAiDifficulty(d.id);
                          }}
                          className={`px-2.5 py-1.5 rounded-md text-xs font-bold cursor-pointer whitespace-nowrap ${
                            aiDifficulty === d.id
                              ? 'bg-[#F97316] text-slate-950'
                              : 'text-slate-300 hover:text-white'
                          }`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    data-mode="ai"
                    onClick={() => {
                      soundEngine.playButtonClick();
                      onStartLocalMode('ai');
                    }}
                    className="flex items-center justify-between p-4 rounded-xl bg-[#F97316] hover:bg-[#EA580C] text-slate-950 font-bold transition-colors cursor-pointer text-left"
                  >
                    <div>
                      <div className="font-display text-lg leading-tight">Partida 2v2 VS IA</div>
                      <div className="text-xs text-slate-900/80 font-medium mt-0.5">
                        Dupla contra dupla · {targetPoints} pts · {DIFFICULTY_TUNING[aiDifficulty].label}
                      </div>
                    </div>
                    <Bot className="w-7 h-7 shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playButtonClick();
                      onStartLocalMode('2v2');
                    }}
                    className="flex items-center justify-between p-4 rounded-xl bg-[#1E293B] hover:bg-slate-700 border border-slate-700 text-white font-bold transition-colors cursor-pointer text-left"
                  >
                    <div>
                      <div className="font-display text-lg leading-tight">Duplas 2x2 (IA)</div>
                      <div className="text-xs text-slate-400 font-medium mt-0.5">
                        Levantador aliado + Ataque
                      </div>
                    </div>
                    <Users className="w-7 h-7 text-cyan-400 shrink-0" />
                  </button>

                  <button
                    type="button"
                    data-testid="btn-open-campaign"
                    onClick={() => {
                      soundEngine.playButtonClick();
                      setActiveTab('campaign');
                    }}
                    className="flex items-center justify-between p-4 rounded-xl bg-[#1E293B] hover:bg-slate-700 border border-amber-400/50 text-white font-bold transition-colors cursor-pointer text-left"
                  >
                    <div>
                      <div className="font-display text-lg leading-tight text-amber-300">Modo Campanha</div>
                      <div className="text-xs text-slate-300 font-medium mt-0.5">
                        História Visual Novel ({rpgSave.completedChapters.length}/{CAMPAIGN_CHAPTERS.length})
                      </div>
                    </div>
                    <BookOpen className="w-7 h-7 text-amber-400 shrink-0" />
                  </button>

                  <button
                    type="button"
                    data-testid="btn-open-tournament"
                    onClick={() => {
                      soundEngine.playButtonClick();
                      onOpenTournament();
                    }}
                    className="flex items-center justify-between p-4 rounded-xl bg-[#1E293B] hover:bg-slate-700 border border-purple-400/50 text-white font-bold transition-colors cursor-pointer text-left"
                  >
                    <div>
                      <div className="font-display text-lg leading-tight text-purple-300">Liga Mata-Mata</div>
                      <div className="text-xs text-slate-300 font-medium mt-0.5">
                        Chaveamento Quartas → Final
                      </div>
                    </div>
                    <Crown className="w-7 h-7 text-purple-400 shrink-0" />
                  </button>

                  <button
                    type="button"
                    data-testid="btn-training-spike"
                    onClick={() => {
                      soundEngine.playButtonClick();
                      onStartLocalMode('training_spike');
                    }}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-[#1E293B] hover:bg-slate-700 border border-emerald-500/40 text-white font-bold transition-colors cursor-pointer text-left"
                  >
                    <div>
                      <div className="font-display text-base leading-tight text-emerald-300">Treino: Cortadas</div>
                      <div className="text-[11px] text-slate-400 font-medium mt-0.5">
                        Máquina de levantamento p/ timing
                      </div>
                    </div>
                    <Zap className="w-6 h-6 text-emerald-400 shrink-0" />
                  </button>

                  <button
                    type="button"
                    data-testid="btn-training-receive"
                    onClick={() => {
                      soundEngine.playButtonClick();
                      onStartLocalMode('training_receive');
                    }}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-[#1E293B] hover:bg-slate-700 border border-sky-500/40 text-white font-bold transition-colors cursor-pointer text-left"
                  >
                    <div>
                      <div className="font-display text-base leading-tight text-sky-300">Treino: Recepção</div>
                      <div className="text-[11px] text-slate-400 font-medium mt-0.5">
                        Máquina de saques e defesa
                      </div>
                    </div>
                    <Shield className="w-6 h-6 text-sky-400 shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playButtonClick();
                      onStartLocalMode('training');
                    }}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-[#1E293B] hover:bg-slate-700 border border-slate-700 text-white font-bold transition-colors cursor-pointer text-left"
                  >
                    <div>
                      <div className="font-display text-base leading-tight">Treino Livre</div>
                      <div className="text-[11px] text-slate-400 font-medium mt-0.5">
                        Quadra aberta sem pontos
                      </div>
                    </div>
                    <Dumbbell className="w-6 h-6 text-slate-300 shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playButtonClick();
                      onQueueOnline('1v1');
                    }}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-[#1E293B] hover:bg-slate-700 border border-cyan-500/40 text-white font-bold transition-colors cursor-pointer text-left"
                  >
                    <div>
                      <div className="font-display text-base leading-tight">Online 1x1</div>
                      <div className="text-[11px] text-cyan-300 font-medium mt-0.5">
                        Fila competitiva Socket.io
                      </div>
                    </div>
                    <Swords className="w-6 h-6 text-cyan-400 shrink-0" />
                  </button>
                </div>

                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playButtonClick();
                      onQueueOnline('2v2');
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#1E293B] hover:bg-slate-700 border border-slate-700 text-white font-semibold cursor-pointer text-left"
                  >
                    <span className="font-display text-base">Fila Online 2x2</span>
                    <span className="text-xs text-slate-300">4 Jogadores em Tempo Real</span>
                  </button>
                </div>
              </div>

              {/* Painel de Engajamento Beta: Missões Rápidas + Botão de Feedback do Beta (+500 Diamantes) */}
              <div
                data-testid="beta-missions-panel"
                className="bg-[#0F172A] border border-slate-800 rounded-2xl p-5 flex flex-col gap-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display font-bold text-lg text-white flex items-center gap-2">
                      <Target className="w-5 h-5 text-emerald-400" />
                      Missões Rápidas & Engajamento Beta
                    </h2>
                    <p className="text-xs text-slate-400">
                      Complete objetivos simples nas partidas para resgatar Spike Coins e Diamantes!
                    </p>
                  </div>

                  {/* Botão "Avaliar Beta +500 Diamantes" */}
                  <button
                    type="button"
                    data-testid="btn-open-beta-feedback"
                    onClick={() => {
                      soundEngine.playButtonClick();
                      setFeedbackModalOpen(true);
                    }}
                    className={`px-3.5 py-2 rounded-xl font-display font-black text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all ${
                      rpgSave.betaFeedbackClaimed
                        ? 'bg-[#1E293B] border border-cyan-400/40 text-cyan-300 hover:bg-slate-800'
                        : 'bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 text-slate-950 shadow-lg shadow-cyan-500/20'
                    }`}
                  >
                    <MessageSquarePlus className="w-4 h-4" />
                    {rpgSave.betaFeedbackClaimed
                      ? 'Feedback Enviado (+500 Resgatado)'
                      : `Avaliar Beta +${BETA_FEEDBACK_GEM_REWARD} Diamantes`}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {BETA_MISSIONS.map((mission) => {
                    const state = rpgSave.betaMissions?.[mission.id] ?? { progress: 0, claimed: false };
                    const progress = Math.min(mission.target, state.progress);
                    const isReadyToClaim = progress >= mission.target && !state.claimed;
                    const pct = Math.min(100, Math.round((progress / mission.target) * 100));

                    return (
                      <div
                        key={mission.id}
                        data-testid={`beta-mission-${mission.id}`}
                        className="rounded-xl p-3.5 bg-[#1E293B] border border-slate-700 flex flex-col justify-between gap-2.5"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1 text-xs font-bold text-white">
                            <span>{mission.title}</span>
                            <span className="font-mono-num text-cyan-300">
                              {progress}/{mission.target}
                            </span>
                          </div>
                          <div className="h-2 bg-slate-900 rounded-full overflow-hidden mt-2">
                            <div
                              className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-300"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="flex items-center gap-2 text-[11px] font-bold mt-2">
                            <span className="text-amber-300 flex items-center gap-1">
                              <Coins className="w-3 h-3" /> +{mission.rewardCoins}
                            </span>
                            <span className="text-cyan-300 flex items-center gap-1">
                              <Gem className="w-3 h-3" /> +{mission.rewardGems}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          data-testid={`btn-claim-mission-${mission.id}`}
                          disabled={!isReadyToClaim}
                          onClick={() => handleClaimMission(mission.id)}
                          className={`w-full py-1.5 rounded-lg font-display font-black text-xs uppercase tracking-wider transition-all ${
                            state.claimed
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 cursor-default'
                              : isReadyToClaim
                                ? 'bg-emerald-400 hover:bg-emerald-300 text-slate-950 cursor-pointer shadow'
                                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          {state.claimed ? 'Resgatado ✓' : isReadyToClaim ? 'Resgatar' : 'Em Progresso'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Salas Privadas */}
              <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-5">
                <h2 className="font-display font-bold text-lg text-white mb-3 flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-amber-400" />
                  Sala Privada Multiplayer
                </h2>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    data-testid="btn-create-private-room"
                    onClick={() => {
                      soundEngine.playButtonClick();
                      onCreatePrivateRoom();
                    }}
                    className="px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-bold text-sm whitespace-nowrap cursor-pointer"
                  >
                    Criar Sala Privada
                  </button>

                  <div className="flex flex-1 gap-2">
                    <label htmlFor="room-code-input" className="sr-only">
                      Código da Sala
                    </label>
                    <input
                      id="room-code-input"
                      data-testid="input-private-room-code"
                      type="text"
                      value={joinCodeInput}
                      onChange={(e) => onJoinCodeChange(e.target.value.toUpperCase())}
                      placeholder="Código (ex: A7K9P2)"
                      maxLength={8}
                      className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-[#1E293B] border border-slate-700 text-white font-mono-num text-sm uppercase focus:outline-none focus:border-amber-400"
                    />
                    <button
                      type="button"
                      data-testid="btn-join-private-room"
                      onClick={() => {
                        soundEngine.playButtonClick();
                        onJoinPrivateRoom();
                      }}
                      className="px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold whitespace-nowrap cursor-pointer"
                    >
                      Entrar
                    </button>
                  </div>
                </div>
                {(roomError || p2pDiag.errorMessage) && (
                  <div
                    data-testid="private-room-error"
                    className="mt-3 bg-red-950/90 border border-red-500/60 text-red-100 px-3.5 py-2.5 rounded-xl text-xs font-medium"
                  >
                    {roomError || p2pDiag.errorMessage}
                  </div>
                )}

                {(p2pDiag.role !== null || p2pDiag.errorMessage !== null) && (
                  <div
                    data-testid="menu-p2p-step-monitor"
                    className="mt-3 p-3 rounded-xl bg-[#1E293B]/90 border border-slate-700 text-xs space-y-1.5"
                  >
                    <div className="font-bold text-cyan-300 flex items-center justify-between">
                      <span>Monitor de Etapas ({p2pDiag.role === 'host' ? 'Host' : 'Convidado'})</span>
                      <span className="font-mono-num text-[11px] text-slate-400">
                        Firebase: {p2pDiag.projectId}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] font-mono-num text-slate-200">
                      <div>
                        {p2pDiag.step1CreateStatus === 'saved'
                          ? '✓ 1. Sala salva na nuvem'
                          : '• 1. Criando sala no Firestore...'}
                      </div>
                      <div>
                        {p2pDiag.step2JoinStatus === 'found'
                          ? '✓ 2. Sala encontrada'
                          : '• 2. Buscando sala...'}
                      </div>
                      <div>• 3. Trocando Offer/Answer WebRTC...</div>
                      <div>
                        • 4. Status ICE: [{p2pDiag.iceStatus === 'idle' ? 'checking' : p2pDiag.iceStatus}]
                      </div>
                      <div className="sm:col-span-2">
                        • 5. DataChannel: [{p2pDiag.dataChannelStatus === 'open' ? 'open' : 'connecting'}]
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Coluna Direita / Center Display: Personagem em Destaque + Seletor de Arena */}
            <aside
              id="CenterDisplay"
              data-testid="lobby-center-display"
              className="lg:col-span-5 flex flex-col gap-4"
            >
              <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-display font-bold text-lg text-white">Carta RPG & Atleta Ativo</h2>
                  <button
                    type="button"
                    onClick={() => openStoreModal('gacha')}
                    className="text-xs font-semibold text-amber-400 hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    Abrir Loja Beta
                  </button>
                </div>

                <div className="flex items-center gap-4">
                  <AnimeAvatar characterId={hero.id} className="w-16 h-16 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase"
                        style={{
                          backgroundColor: activeRarityStyle.bg,
                          color: activeRarityStyle.text,
                          border: `1px solid ${activeRarityStyle.border}`,
                        }}
                      >
                        {activeCard.rarity} Nv.{activeOwned?.level ?? 1}
                      </span>
                    </div>
                    <div className="font-display font-bold text-lg text-white truncate mt-0.5">
                      {activeCard.name}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      Visual: {hero.name} · Ult: {hero.ultimateName}
                    </div>
                  </div>
                </div>

                {/* Status RPG aplicados diretamente na física via PlayerStatsManager */}
                <div className="grid grid-cols-4 gap-1.5 mt-3 text-center">
                  <div className="bg-[#1E293B] rounded-lg py-1.5 px-1">
                    <div className="text-[10px] text-slate-400">FOR Nv.{(activeOwned?.upgrades.attack ?? 0) + 1}</div>
                    <div className="font-display font-bold text-sm text-orange-400 tabular-nums">{activeStats.attack}</div>
                  </div>
                  <div className="bg-[#1E293B] rounded-lg py-1.5 px-1">
                    <div className="text-[10px] text-slate-400">DEF Nv.{(activeOwned?.upgrades.defense ?? 0) + 1}</div>
                    <div className="font-display font-bold text-sm text-sky-400 tabular-nums">{activeStats.defense}</div>
                  </div>
                  <div className="bg-[#1E293B] rounded-lg py-1.5 px-1">
                    <div className="text-[10px] text-slate-400">SAL Nv.{(activeOwned?.upgrades.jump ?? 0) + 1}</div>
                    <div className="font-display font-bold text-sm text-amber-300 tabular-nums">{activeStats.jump}</div>
                  </div>
                  <div className="bg-[#1E293B] rounded-lg py-1.5 px-1">
                    <div className="text-[10px] text-slate-400">VEL Nv.{(activeOwned?.upgrades.speed ?? 0) + 1}</div>
                    <div className="font-display font-bold text-sm text-emerald-400 tabular-nums">{activeStats.speed}</div>
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-2 mt-3">
                  {CHARACTER_LIST.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        soundEngine.playButtonClick();
                        onSelectCharacter(c.id);
                      }}
                      className={`py-2 px-1 rounded-lg text-xs font-bold text-center cursor-pointer border transition-colors ${
                        selectedCharacter === c.id
                          ? 'border-white text-slate-950'
                          : 'border-slate-700 bg-[#1E293B] text-slate-300 hover:text-white'
                      }`}
                      style={selectedCharacter === c.id ? { backgroundColor: c.colors.accent } : undefined}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Seletor de Quadra / Mapa */}
              <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-5">
                <h2 className="font-display font-bold text-lg text-white mb-3">Arena da Partida</h2>
                <div className="grid grid-cols-2 gap-2">
                  {ARENA_LIST.map((arena) => (
                    <button
                      key={arena.id}
                      type="button"
                      onClick={() => {
                        soundEngine.playButtonClick();
                        onSelectArena(arena.id);
                      }}
                      className={`p-2.5 rounded-xl text-left border cursor-pointer transition-colors ${
                        selectedArena === arena.id
                          ? 'bg-[#1E293B] border-[#F97316] text-white'
                          : 'bg-[#0B1120] border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="text-xs font-bold truncate">{arena.name}</div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">{arena.subtitle}</div>
                    </button>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        )}

        {activeTab === 'campaign' && (
          <div data-testid="campaign-tab" className="flex flex-col gap-4">
            <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display font-bold text-2xl text-white flex items-center gap-2">
                  <BookOpen className="w-6 h-6 text-amber-400" />
                  Modo Campanha (História)
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Vença os rivais para desbloquear novas arenas, cartas RPG e avançar até a Classe Mundial.
                </p>
              </div>
              <div className="text-xs font-bold text-amber-300 bg-[#1E293B] px-3 py-1.5 rounded-lg">
                Progresso: {rpgSave.completedChapters.length} / {CAMPAIGN_CHAPTERS.length} Capítulos
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {CAMPAIGN_CHAPTERS.map((ch, idx) => {
                const prevDone = idx === 0 || rpgSave.completedChapters.includes(CAMPAIGN_CHAPTERS[idx - 1].id);
                const done = rpgSave.completedChapters.includes(ch.id);
                const arenaName = ARENAS[ch.arenaId].name;
                const diffLabel = DIFFICULTY_TUNING[ch.difficulty].label;
                return (
                  <div
                    key={ch.id}
                    className={`bg-[#0F172A] rounded-2xl p-5 border-2 flex flex-col justify-between gap-4 ${
                      done ? 'border-emerald-500/60' : prevDone ? 'border-[#F97316]/80' : 'border-slate-800 opacity-60'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-[11px] font-bold text-amber-300">
                          {arenaName} · {diffLabel}
                        </span>
                        {done && (
                          <span className="text-emerald-400 text-xs font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Concluído
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 mb-2">
                        <AnimeAvatar characterId={ch.opponentCharacterId} className="w-12 h-12 shrink-0" />
                        <div>
                          <h3 className="font-display font-bold text-lg text-white leading-tight">{ch.title}</h3>
                          <div className="text-xs text-orange-300 font-semibold">Rival: {ch.opponentName}</div>
                        </div>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">{ch.subtitle}</p>
                      <div className="text-[11px] text-amber-300 font-semibold mt-2">
                        Recompensa: +{ch.rewardCoins} Moedas
                      </div>
                    </div>

                    <button
                      type="button"
                      data-testid={`btn-campaign-${ch.id}`}
                      disabled={!prevDone}
                      onClick={() => {
                        soundEngine.playButtonClick();
                        onStartCampaignChapter(ch);
                      }}
                      className={`w-full py-2.5 rounded-xl font-display font-bold text-sm flex items-center justify-center gap-2 ${
                        prevDone
                          ? 'bg-[#F97316] hover:bg-[#EA580C] text-slate-950 cursor-pointer'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {prevDone ? (
                        <>
                          <Sparkles className="w-4 h-4" />
                          {done ? 'Rejogar Capítulo' : 'Iniciar História'}
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4" />
                          Vença o Capítulo Anterior
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'shop' && (
          <RpgShopPanel
            rpgSave={rpgSave}
            initialTab={storeInitialTab}
            onPullGacha={onPullGacha}
            onSelectCard={onSelectRpgCard}
            onUpgradeStat={onUpgradeStat}
            onPurchaseShopItem={onPurchaseShopItem}
            onClaimDiamondPack={onClaimDiamondPack}
            onOpenGachaBox={onOpenGachaBox}
          />
        )}

        {activeTab === 'heroes' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {CHARACTER_LIST.map((c) => {
              const active = c.id === selectedCharacter;
              return (
                <div
                  key={c.id}
                  className={`bg-[#0F172A] rounded-2xl p-5 border-2 flex flex-col justify-between gap-4 ${
                    active ? 'border-[#F97316]' : 'border-slate-800'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <AnimeAvatar characterId={c.id} className="w-14 h-14" />
                      <div>
                        <h3 className="font-display font-bold text-xl text-white">
                          {c.name} <span className="text-xs font-mono-num text-amber-400">#{c.jerseyNumber}</span>
                        </h3>
                        <div className="text-xs text-slate-400">{c.title}</div>
                      </div>
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed mb-3">{c.lore}</p>
                    <div className="text-xs text-cyan-300 font-semibold">
                      Ultimate: {c.ultimateName}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{c.ultimateDescription}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playButtonClick();
                      onSelectCharacter(c.id);
                      setActiveTab('play');
                    }}
                    className={`w-full py-2.5 rounded-xl font-bold text-sm cursor-pointer ${
                      active
                        ? 'bg-[#F97316] text-slate-950'
                        : 'bg-[#1E293B] hover:bg-slate-700 text-white'
                    }`}
                  >
                    {active ? 'Selecionado' : `Escolher ${c.name}`}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-6 max-w-2xl">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-[#F97316] flex items-center justify-center font-display font-bold text-2xl text-slate-950">
                  {profile.flagCode}
                </div>
                <div>
                  <h2 className="font-display font-bold text-2xl text-white">{profile.displayName}</h2>
                  <div className="text-sm text-slate-400">
                    {rank.name} · Nível {profile.level} · {profile.isGuest ? 'Conta Convidado Local' : 'Conta Google Sincronizada'}
                  </div>
                </div>
              </div>
              <Trophy className="w-9 h-9" style={{ color: rank.color }} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="bg-[#1E293B] rounded-xl p-3.5">
                <div className="text-xs text-slate-400">Vitórias</div>
                <div className="font-display font-bold text-2xl text-emerald-400 tabular-nums">{profile.wins}</div>
              </div>
              <div className="bg-[#1E293B] rounded-xl p-3.5">
                <div className="text-xs text-slate-400">Derrotas</div>
                <div className="font-display font-bold text-2xl text-rose-400 tabular-nums">{profile.losses}</div>
              </div>
              <div className="bg-[#1E293B] rounded-xl p-3.5">
                <div className="text-xs text-slate-400">Taxa de Vitória</div>
                <div className="font-display font-bold text-2xl text-white tabular-nums">{winrate}%</div>
              </div>
              <div className="bg-[#1E293B] rounded-xl p-3.5">
                <div className="text-xs text-slate-400">Cortadas</div>
                <div className="font-display font-bold text-2xl text-amber-400 tabular-nums">{profile.spikes}</div>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (editingName.trim().length >= 2) {
                  onUpdateDisplayName(editingName.trim());
                }
              }}
              className="flex flex-col sm:flex-row gap-2"
            >
              <label htmlFor="profile-name-input" className="sr-only">
                Apelido do Jogador
              </label>
              <input
                id="profile-name-input"
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                minLength={2}
                maxLength={24}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#1E293B] border border-slate-700 text-white text-sm"
              />
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-[#F97316] hover:bg-[#EA580C] text-slate-950 font-bold text-sm cursor-pointer"
              >
                Salvar Apelido
              </button>
            </form>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-6 max-w-4xl flex flex-col gap-6">
            <div className="flex items-center justify-between gap-2.5 flex-wrap">
              <div className="flex items-center gap-2.5">
                <Settings className="w-5 h-5 text-amber-400" />
                <h2 className="font-display font-bold text-xl text-white">Configurações de Áudio & Controles</h2>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[#1E293B]/60 rounded-xl p-4 border border-slate-800">
              <div>
                <label htmlFor="music-vol" className="flex justify-between text-sm text-slate-300 mb-1.5">
                  <span>Volume da Música</span>
                  <span className="font-mono-num">{Math.round(musicVol * 100)}%</span>
                </label>
                <input
                  id="music-vol"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={musicVol}
                  onChange={(e) => onChangeVolumes(Number(e.target.value), sfxVol)}
                  className="w-full accent-[#F97316]"
                />
              </div>

              <div>
                <label htmlFor="sfx-vol" className="flex justify-between text-sm text-slate-300 mb-1.5">
                  <span>Volume dos Efeitos (SFX)</span>
                  <span className="font-mono-num">{Math.round(sfxVol * 100)}%</span>
                </label>
                <input
                  id="sfx-vol"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={sfxVol}
                  onChange={(e) => onChangeVolumes(musicVol, Number(e.target.value))}
                  className="w-full accent-[#F97316]"
                />
              </div>

              <div>
                <label htmlFor="player-crowd-vol" className="flex justify-between text-sm text-slate-300 mb-1.5">
                  <span>Volume da Plateia / Torcida</span>
                  <span className="font-mono-num text-amber-300">
                    {Math.round(soundtrackState.crowdVolume * 100)}%
                  </span>
                </label>
                <input
                  id="player-crowd-vol"
                  data-testid="player-crowd-volume-slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={soundtrackState.crowdVolume}
                  onChange={(e) => customSoundtrackManager.setCrowdVolume(Number(e.target.value))}
                  className="w-full accent-[#F97316]"
                />
              </div>

              <div>
                <label htmlFor="player-squeak-vol" className="flex justify-between text-sm text-slate-300 mb-1.5">
                  <span>Volume dos Rangidos / Passos</span>
                  <span className="font-mono-num text-cyan-300">
                    {Math.round(soundtrackState.shoeSqueakVolume * 100)}%
                  </span>
                </label>
                <input
                  id="player-squeak-vol"
                  data-testid="player-shoe-squeak-volume-slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={soundtrackState.shoeSqueakVolume}
                  onChange={(e) => customSoundtrackManager.setShoeSqueakVolume(Number(e.target.value))}
                  className="w-full accent-cyan-400"
                />
              </div>
            </div>

            {isAdmin && (
              <CustomSoundtrackPanel
                isAdmin={isAdmin}
                onAdminLogout={() => {
                  if (onAdminLogout) {
                    onAdminLogout();
                  } else {
                    adminAuthManager.logout();
                  }
                  setInternalIsAdmin(false);
                  onAdminStateChange?.(false);
                }}
              />
            )}

            <KeyBindingsPanel
              keyBindings={keyBindings}
              onChange={onChangeKeyBindings}
              onReset={onResetKeyBindings}
            />

            <div className="flex items-center justify-between flex-wrap gap-3 pt-2 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => setActiveTab('play')}
                className="w-fit px-5 py-2.5 rounded-xl bg-[#F97316] text-slate-950 font-bold text-sm cursor-pointer flex items-center gap-2"
              >
                <Play className="w-4 h-4 fill-current" />
                Voltar para Jogar
              </button>

              <button
                type="button"
                data-testid="game-version-secret-trigger"
                onClick={handleVersionTextTap}
                className="bg-transparent border-0 p-0 m-0 text-[11px] text-slate-500 font-mono-num select-none cursor-default focus:outline-none"
              >
                Spake Legend Arena · Versão 2.4.0 (Build 2025.11)
              </button>
            </div>
          </div>
        )}

        {/* Rodapé inocente com Texto da Versão do Jogo + Botão JOGAR no Bottom Right do Hub */}
        {activeTab !== 'settings' && (
          <footer className="mt-6 pt-3 border-t border-slate-800/50 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              data-testid="main-menu-version-secret-trigger"
              onClick={handleVersionTextTap}
              className="bg-transparent border-0 p-0 m-0 text-[11px] text-slate-500 font-mono-num select-none cursor-default focus:outline-none"
            >
              Spake Legend Arena · Versão 2.4.0 (Build 2025.11)
            </button>

            <div id="BottomRight" data-testid="lobby-bottom-right">
              <button
                type="button"
                data-testid="lobby-jogar-btn"
                onClick={() => {
                  soundEngine.playButtonClick();
                  onStartLocalMode('ai');
                }}
                className="px-7 py-3 rounded-xl bg-gradient-to-r from-[#F97316] to-amber-400 hover:from-[#EA580C] hover:to-amber-300 text-slate-950 font-display font-black text-base uppercase tracking-wider shadow-[0_0_25px_rgba(249,115,22,0.4)] flex items-center gap-2 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                JOGAR AGORA
              </button>
            </div>
          </footer>
        )}

        {/* Modal da Loja 4 Abas aberto diretamente pelo botão "LOJA" no Lobby */}
        {storeModalOpen && (
          <div
            data-testid="lobby-store-modal"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-6 overflow-y-auto"
          >
            <div className="relative w-full max-w-6xl max-h-[92vh] overflow-y-auto bg-[#0B1120] border-2 border-slate-700 rounded-3xl p-4 sm:p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                <span className="font-display font-black text-lg text-white uppercase tracking-wider flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-[#F97316]" />
                  Loja Oficial (Modo Beta)
                </span>
                <button
                  type="button"
                  data-testid="btn-close-store-modal"
                  onClick={() => {
                    soundEngine.playButtonClick();
                    setStoreModalOpen(false);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-4 h-4" /> Fechar Loja
                </button>
              </div>

              <RpgShopPanel
                rpgSave={rpgSave}
                initialTab={storeInitialTab}
                onPullGacha={onPullGacha}
                onSelectCard={onSelectRpgCard}
                onUpgradeStat={onUpgradeStat}
                onPurchaseShopItem={onPurchaseShopItem}
                onClaimDiamondPack={onClaimDiamondPack}
                onOpenGachaBox={onOpenGachaBox}
              />
            </div>
          </div>
        )}

        {/* Modal de Feedback do Beta Teste ("Avaliar Beta +500 Diamantes") */}
        {feedbackModalOpen && (
          <div
            data-testid="beta-feedback-modal"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4"
          >
            <form
              onSubmit={handleFeedbackSubmit}
              className="w-full max-w-md bg-[#0F172A] border-2 border-cyan-400 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-black uppercase">
                    <Gem className="w-3 h-3" /> Recompensa Beta Teste
                  </span>
                  <h3 className="font-display font-black text-xl text-white mt-1">
                    Avaliar Beta {rpgSave.betaFeedbackClaimed ? '' : `+${BETA_FEEDBACK_GEM_REWARD} Diamantes`}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Sua nota e comentário vão direto para o Painel Admin para ajudar a evoluir o jogo!
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFeedbackModalOpen(false)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Seletor de 1 a 5 Estrelas */}
              <div className="flex items-center justify-center gap-2 py-2 bg-[#1E293B] rounded-xl border border-slate-700">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    data-testid={`beta-feedback-star-${star}`}
                    onClick={() => {
                      soundEngine.playButtonClick();
                      setFeedbackStars(star);
                    }}
                    className="p-1.5 cursor-pointer transition-transform hover:scale-110"
                  >
                    <Star
                      className={`w-7 h-7 ${
                        star <= feedbackStars
                          ? 'text-amber-400 fill-amber-400'
                          : 'text-slate-600'
                      }`}
                    />
                  </button>
                ))}
              </div>

              <div>
                <label htmlFor="beta-feedback-comment" className="block text-xs font-bold text-slate-300 mb-1">
                  Comentário Rápido (O que achou da jogabilidade e da Loja Beta?)
                </label>
                <textarea
                  id="beta-feedback-comment"
                  data-testid="beta-feedback-comment"
                  rows={3}
                  maxLength={280}
                  value={feedbackComment}
                  onChange={(e) => setFeedbackComment(e.target.value)}
                  placeholder="Ex: Gostei muito do rastro da Bola Fogo e do timing das cortadas!"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#1E293B] border border-slate-700 text-white text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setFeedbackModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  data-testid="btn-submit-beta-feedback"
                  disabled={submittingFeedback}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 text-slate-950 font-display font-black text-xs uppercase tracking-wider cursor-pointer disabled:opacity-60"
                >
                  {submittingFeedback
                    ? 'Enviando...'
                    : rpgSave.betaFeedbackClaimed
                      ? 'Atualizar Avaliação'
                      : `Enviar & Ganhar +${BETA_FEEDBACK_GEM_REWARD} Diamantes`}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Painel Minimalista Secreto (Apenas InputField + Botão OK) acionado pelos 7 toques */}
        {!isAdmin && showSecretPrompt && (
          <div
            data-testid="secret-admin-modal"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          >
            <form
              data-testid="admin-login-form"
              onSubmit={handleSecretPromptSubmit}
              className="bg-[#0F172A] border border-slate-800 rounded-xl p-3 flex items-center gap-2 shadow-2xl"
            >
              <input
                id="admin-password-input"
                data-testid="admin-password-input"
                type="password"
                autoFocus
                value={secretPasswordInput}
                onChange={(e) => setSecretPasswordInput(e.target.value)}
                className="w-48 px-3 py-1.5 rounded-lg bg-[#1E293B] border border-slate-700 text-white text-xs focus:outline-none focus:border-slate-500"
              />
              <button
                type="submit"
                data-testid="btn-submit-admin-login"
                disabled={isAuthenticatingAdmin}
                className="px-3.5 py-1.5 rounded-lg bg-slate-200 hover:bg-white text-slate-950 font-bold text-xs cursor-pointer disabled:opacity-60"
              >
                OK
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
};
