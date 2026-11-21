/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AiDifficulty,
  ArenaId,
  CharacterId,
  CharacterStats,
  GameMode,
  GameScreenState,
  ServeType,
} from './config/gameConfig';
import {
  loadKeyBindings,
  resetKeyBindings,
  saveKeyBindings,
  type KeyBindingsConfig,
} from './config/keyBindings';
import { createMatchScoreState, type ScoreState } from './physics/volleyballRules';
import type { MatchSnapshot } from './physics/rapierWorld';
import {
  loadOrCreateGuestProfile,
  recordMatchOutcome,
  signInWithGoogle,
  signOutAccount,
  subscribeAuth,
  syncFirebaseUserProfile,
  updateProfileIdentity,
  type PlayerProfile,
} from './firebase/client';
import {
  advanceTournamentRound,
  attemptUpgradeAthleteStat,
  claimBetaDiamondPack,
  claimBetaFeedbackReward,
  claimBetaMissionReward,
  completeCampaignChapter,
  computeEffectiveStats,
  generateTournamentBracket,
  getAthleteCard,
  loadRpgSave,
  loadRpgSaveFromCloud,
  openBetaGachaBox,
  pullGachaAthlete,
  purchaseShopItem,
  recordBetaMissionProgress,
  reportBetaStoreEventToCloud,
  rewardMatchVictoryCoins,
  rewardSpecialPointCoins,
  saveRpgSave,
  syncRpgSaveToCloud,
  type BetaGachaBoxResult,
  type BetaGachaBoxTier,
  type BetaMissionDefinition,
  type CampaignChapter,
  type DiamondRechargePack,
  type GachaPullResult,
  type PlayerRpgSave,
} from './rpg/rpgSystem';
import { gameManager, playerStatsManager } from './rpg/playerStatsManager';
import { networkClient, type ChatMessageItem, type RoomStatePayload } from './network/socketClient';
import { soundEngine } from './audio/soundEngine';
import { customSoundtrackManager } from './audio/customSoundtrackManager';
import { useAdminAuth } from './auth/AdminAuthManager';
import {
  GameViewport,
  type MatchConfig,
  type MatchFeedPayload,
  type ReplayControlHandle,
  type ReplayStateMeta,
  type TouchInputBridge,
} from './ui/GameViewport';
import { TitleScreen } from './ui/TitleScreen';
import { MainMenu } from './ui/MainMenu';
import { LobbyScreen } from './ui/LobbyScreen';
import { GameHud, type HudCalloutState } from './ui/GameHud';
import { MatchResultModal, PauseModal } from './ui/MatchModals';
import { HowToPlayModal } from './ui/HowToPlayModal';
import { CampaignVnModal } from './ui/CampaignVnModal';
import { TournamentScreen } from './ui/TournamentScreen';
import { BootFlowOverlay, RatingPopupModal } from './ui/BootFlowPanels';
import { SafeAreaFitter } from './ui/SafeAreaFitter';
import { HudCustomizerModal } from './ui/HudCustomizerModal';
import { FLOATING_TEXT_CONFIG } from './ui/FloatingTextManager';
import { gameBootFlowManager, type BootFlowState } from './boot/gameBootFlowManager';

function getInitialAutostart(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('autostart') === '1' || params.get('screen') === 'menu';
}

function getInitialScreenState(): GameScreenState {
  if (typeof window === 'undefined') return 'title';
  const params = new URLSearchParams(window.location.search);
  if (params.get('screen') === 'menu') return 'menu';
  if (params.get('autostart') === '1') return 'playing';
  return 'title';
}

export default function App() {
  const autostart = getInitialAutostart();
  const { isAdmin, setIsAdmin, logoutAdmin } = useAdminAuth();
  const [profile, setProfile] = useState<PlayerProfile>(() => loadOrCreateGuestProfile());
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [bootState, setBootState] = useState<BootFlowState>(() => gameBootFlowManager.getState());

  const [screenState, setScreenState] = useState<GameScreenState>(() => getInitialScreenState());
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterId>(profile.avatarCharacterId);
  const [selectedArena, setSelectedArena] = useState<ArenaId>('ginasio');
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>('medium');
  const [targetPoints, setTargetPoints] = useState<15 | 21>(15);

  const [muted, setMuted] = useState(false);
  const [musicVol, setMusicVol] = useState(0.35);
  const [sfxVol, setSfxVol] = useState(0.7);

  const [activeRoom, setActiveRoom] = useState<RoomStatePayload | null>(null);
  const [assignedPlayerId, setAssignedPlayerId] = useState<string | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [matchmakingStatus, setMatchmakingStatus] = useState<string | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [pingMs, setPingMs] = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMessageItem[]>([]);
  const [emojiBubbles, setEmojiBubbles] = useState<Array<{ id: string; name: string; text: string }>>([]);

  const [rpgSave, setRpgSave] = useState<PlayerRpgSave>(() => loadRpgSave(profile.uid));
  const [activeCampaignChapter, setActiveCampaignChapter] = useState<CampaignChapter | null>(null);
  const [serveType, setServeType] = useState<ServeType>('float');
  const [footMode, setFootMode] = useState(false);
  const [keyBindings, setKeyBindings] = useState<KeyBindingsConfig>(() => loadKeyBindings());

  const [matchConfig, setMatchConfig] = useState<MatchConfig>(() => {
    const initialRpg = loadRpgSave(profile.uid);
    const card = getAthleteCard(initialRpg.activeCardId);
    const localStats = computeEffectiveStats(card, initialRpg.ownedCards[initialRpg.activeCardId]);
    return {
      mode: 'ai',
      arenaId: 'ginasio',
      localPlayerId: profile.uid,
      localPlayerName: profile.displayName,
      localCharacterId: profile.avatarCharacterId,
      localStats,
      aiDifficulty: 'medium',
      targetPoints: 15,
      serveType: 'float',
      footMode: false,
      isOnline: false,
    };
  });
  const [matchNonce, setMatchNonce] = useState(1);

  const [hudScore, setHudScore] = useState<ScoreState>(() => createMatchScoreState('left', 15));
  const [hudTouches, setHudTouches] = useState({ left: 0, right: 0 });
  const [hudStunned, setHudStunned] = useState(false);
  const [hudWaitingServe, setHudWaitingServe] = useState(false);
  const [activeCallout, setActiveCallout] = useState<HudCalloutState | null>(null);
  const [trainingStats, setTrainingStats] = useState<MatchSnapshot['trainingStats']>(undefined);
  const [finishedSnapshot, setFinishedSnapshot] = useState<MatchSnapshot | null>(null);
  const [lastRewardCoins, setLastRewardCoins] = useState(0);
  const [showPauseGuide, setShowPauseGuide] = useState(false);
  const [showHudCustomizer, setShowHudCustomizer] = useState(false);
  const [replayMeta, setReplayMeta] = useState<ReplayStateMeta | null>(null);

  const ultimateFillRef = useRef<HTMLDivElement | null>(null);
  const ultimateReadyRef = useRef<HTMLSpanElement | null>(null);
  const superAttackContainerRef = useRef<HTMLDivElement | null>(null);
  const superAttackFillRef = useRef<HTMLDivElement | null>(null);
  const superAttackTimerTextRef = useRef<HTMLSpanElement | null>(null);
  const serveChargeContainerRef = useRef<HTMLDivElement | null>(null);
  const serveChargeFillRef = useRef<HTMLDivElement | null>(null);
  const serveChargeTimerTextRef = useRef<HTMLSpanElement | null>(null);
  const serveChargeStageLabelRef = useRef<HTMLSpanElement | null>(null);
  const replayControlRef = useRef<ReplayControlHandle | null>(null);
  const calloutTimerRef = useRef<number | null>(null);
  const touchBridgeRef = useRef<TouchInputBridge>({
    moveX: 0,
    moveZ: 0,
    moveLeftHeld: false,
    moveRightHeld: false,
    jumpQueued: false,
    jumpHeld: false,
    spikeQueued: false,
    setQueued: false,
    serveNormalQueued: false,
    serveJumpQueued: false,
    diveQueued: false,
    receiveQueued: false,
    ultimateQueued: false,
  });

  const getLocalStatsFromSave = useCallback((save: PlayerRpgSave): CharacterStats => {
    const card = getAthleteCard(save.activeCardId);
    const owned = save.ownedCards[save.activeCardId];
    playerStatsManager.setBaseStats(card.baseStats);
    playerStatsManager.setUpgradeCounts(owned?.upgrades ?? { attack: 0, defense: 0, jump: 0, speed: 0 });
    return computeEffectiveStats(card, owned);
  }, []);

  const updateRpgSave = useCallback(
    (updater: (prev: PlayerRpgSave) => PlayerRpgSave, uidOverride?: string) => {
      setRpgSave((prev) => {
        const next = updater(prev);
        const targetUid = uidOverride ?? profile.uid;
        saveRpgSave(targetUid, next);
        void syncRpgSaveToCloud(targetUid, next);
        return next;
      });
    },
    [profile.uid],
  );

  // Sincroniza o PlayerStatsManager e matchConfig (status RPG + cosméticos equipados na Loja Beta) sempre que rpgSave muda
  useEffect(() => {
    const effective = getLocalStatsFromSave(rpgSave);
    setMatchConfig((prev) => ({
      ...prev,
      localStats: effective,
      equippedBallColor: rpgSave.equippedBallColor ?? '#FACC15',
      equippedBallTrailColor: rpgSave.equippedBallTrailColor ?? rpgSave.equippedBallColor ?? '#FACC15',
      equippedOutfitId: rpgSave.equippedOutfitId ?? 'outfit_default',
    }));
  }, [rpgSave, getLocalStatsFromSave]);

  // Inicialização do GameBootFlowManager (Splash -> Title -> Terms/Login -> Lobby) + Hidratação de Áudio e PlayerCoins:
  useEffect(() => {
    const unsubBoot = gameBootFlowManager.subscribe((nextBoot) => {
      setBootState(nextBoot);
      if (nextBoot.authenticatedUser) {
        setProfile((prev) => ({
          ...prev,
          uid: nextBoot.authenticatedUser?.uid || prev.uid,
          displayName: nextBoot.authenticatedUser?.displayName || prev.displayName,
          email: nextBoot.authenticatedUser?.email || prev.email,
          isGuest: false,
        }));
      }
      if (nextBoot.activePanel === 'Panel_Lobby') {
        setScreenState((prev) => (prev === 'title' ? 'menu' : prev));
      }
    });

    if (autostart) {
      gameBootFlowManager.forceEnterLobbyForAutostart();
    } else {
      void gameBootFlowManager.startBootSequence({ splashHoldMs: 3200, fadeDurationMs: 380 });
    }

    return () => {
      unsubBoot();
    };
  }, [autostart]);

  useEffect(() => {
    void loadRpgSaveFromCloud(profile.uid).then((cloudSave) => {
      setRpgSave(cloudSave);
    });
  }, [profile.uid]);

  // Vigia global de estado da tela: sempre que a tela atual for diferente da partida/gameplay
  // (ex: TITLE, MENU, LOBBY, TOURNAMENT, CAMPAIGN_VN, GAMEOVER), corta a plateia imediatamente via stopCrowd().
  useEffect(() => {
    const isGameplayScreen =
      screenState === 'playing' || screenState === 'paused' || screenState === 'guide';
    if (!isGameplayScreen) {
      customSoundtrackManager.stopCrowd();
      soundEngine.stopCrowdAmbience();
    }
  }, [screenState, bootState.activePanel]);

  // Sincroniza estado do jogo e gerencia os 3 canais de áudio separados (bgmSource, crowdSource, sfxSource):
  // - Na Partida ('playing' / 'paused' / 'guide'): para APENAS a música de fundo (bgmSource.Stop()) e mantém a torcida em loop (crowdSource.Play()).
  // - Ao voltar para o Lobby ('menu') ou encerrar partida: chama stopCrowd() (crowdSource.pause() + currentTime = 0) antes de tocar lobbyBGM.
  useEffect(() => {
    document.body.dataset.state = screenState;
    soundEngine.setScreenState(screenState);

    const isMatchActive =
      screenState === 'guide' || screenState === 'playing' || screenState === 'paused';

    if (isMatchActive) {
      if (screenState !== 'playing') {
        customSoundtrackManager.stopAllActiveSfxSources();
      }
      const bgmAudioSource = customSoundtrackManager.bgmSource;
      gameManager.StartMatch(bgmAudioSource);
      customSoundtrackManager.setScreenState(screenState);
    } else if (screenState !== 'title') {
      // Ao sair da partida para qualquer tela de Menu, Fim de Jogo ou Lobby, para a plateia imediatamente antes da lobbyBGM
      customSoundtrackManager.stopCrowd();
      customSoundtrackManager.StopAllGameplaySounds();
      if (customSoundtrackManager.hasTrackForSlot('MenuTheme')) {
        soundEngine.setCustomExclusiveMode(true);
        soundEngine.destroyDefaultMusic(false);
      }
      void customSoundtrackManager.transitionToScene(screenState, matchConfig.arenaId);
    } else {
      customSoundtrackManager.stopAllActiveSfxSources();
      customSoundtrackManager.stopCrowd();
    }

    return () => {
      if (isMatchActive) {
        customSoundtrackManager.stopCrowd();
      }
    };
  }, [screenState, matchConfig.arenaId]);

  // Monitora autenticação Google Firebase
  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      if (!user) return;
      try {
        const synced = await syncFirebaseUserProfile(user);
        setProfile(synced);
        setSelectedCharacter(synced.avatarCharacterId);
        setRpgSave(loadRpgSave(synced.uid));
        setAuthError(null);
        setScreenState((prev) => (prev === 'title' ? 'menu' : prev));
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Erro ao carregar perfil.');
      }
    });
    return unsub;
  }, []);

  // Eventos de Rede Socket.io
  useEffect(() => {
    const unsubAssigned = networkClient.onAssignedId((pid) => {
      setAssignedPlayerId(pid);
    });

    const unsubRoom = networkClient.onRoomState((room) => {
      setActiveRoom(room);
      setRoomError(null);
      setMatchmakingStatus(null);
      if (room.status === 'lobby') {
        setScreenState('lobby');
      }
    });

    const unsubErr = networkClient.onRoomError((msg) => {
      setRoomError(msg);
      setMatchmakingStatus(null);
    });

    const unsubWait = networkClient.onWaiting((info) => {
      setMatchmakingStatus(`Buscando oponentes (${info.mode.toUpperCase()})...`);
    });

    const unsubStart = networkClient.onMatchStarted(({ room, snapshot }) => {
      const effectiveId = networkClient.getAssignedPlayerId(profile.uid);
      const myMember = room.members.find((m) => m.playerId === effectiveId);
      setActiveRoom(room);
      setMatchmakingStatus(null);
      setFinishedSnapshot(null);
      setHudScore(snapshot.score);
      setMatchConfig({
        mode: room.mode,
        arenaId: room.arenaId,
        localPlayerId: effectiveId,
        localPlayerName: myMember?.name || profile.displayName,
        localCharacterId: myMember?.characterId || selectedCharacter,
        aiDifficulty,
        serveType,
        footMode,
        equippedBallColor: rpgSave.equippedBallColor ?? '#FACC15',
        equippedBallTrailColor: rpgSave.equippedBallTrailColor ?? rpgSave.equippedBallColor ?? '#FACC15',
        equippedOutfitId: rpgSave.equippedOutfitId ?? 'outfit_default',
        isOnline: true,
        room,
        initialSnapshot: snapshot,
      });
      setMatchNonce((n) => n + 1);
      setShowPauseGuide(false);
      soundEngine.unlock();
      // Para exclusivamente a BGM do lobby e dispara explicitamente o canal da plateia (crowdSource)
      const bgmAudioSource = customSoundtrackManager.bgmAudioSource;
      if (bgmAudioSource != null && bgmAudioSource.isPlaying) {
        bgmAudioSource.Stop();
      }
      gameManager.StartMatch(bgmAudioSource);
      customSoundtrackManager.StartMatchCrowdAmbience();
      setScreenState('playing');
    });

    const unsubEnd = networkClient.onMatchEnded((snap) => {
      customSoundtrackManager.stopCrowd();
      setFinishedSnapshot(snap);
      setScreenState('gameover');
    });

    const unsubPing = networkClient.onPing((ms) => setPingMs(ms));

    const unsubChat = networkClient.onChatMessage((msg) => {
      setChatMessages((prev) => [...prev.slice(-40), msg]);
    });

    const unsubBubble = networkClient.onEmojiBubble((ev) => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setEmojiBubbles((prev) => [...prev.slice(-2), { id, name: ev.name, text: ev.text }]);
      window.setTimeout(() => {
        setEmojiBubbles((prev) => prev.filter((item) => item.id !== id));
      }, 2400);
    });

    return () => {
      unsubAssigned();
      unsubRoom();
      unsubErr();
      unsubWait();
      unsubStart();
      unsubEnd();
      unsubPing();
      unsubChat();
      unsubBubble();
    };
  }, [profile.uid, profile.displayName, selectedCharacter, aiDifficulty, serveType, footMode]);

  const handleGuestPlay = useCallback(() => {
    soundEngine.unlock();
    setScreenState('menu');
  }, []);

  const handleGoogleLogin = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      soundEngine.unlock();
      try {
        const user = await signInWithGoogle();
        const synced = await syncFirebaseUserProfile(user);
        setProfile(synced);
        setSelectedCharacter(synced.avatarCharacterId);
        await gameBootFlowManager.loginWithGooglePlayGames({
          uid: synced.uid,
          displayName: synced.displayName,
          email: synced.email || `${synced.uid}@gmail.com`,
        });
      } catch {
        // Caso o navegador/iframe bloqueie o popup OAuth, conclui o registro Google Play Games no Firestore via GameBootFlowManager
        const afterLogin = await gameBootFlowManager.loginWithGooglePlayGames();
        if (afterLogin.authenticatedUser) {
          setProfile((prev) => ({
            ...prev,
            uid: afterLogin.authenticatedUser?.uid || prev.uid,
            displayName: afterLogin.authenticatedUser?.displayName || prev.displayName,
            email: afterLogin.authenticatedUser?.email || prev.email,
            isGuest: false,
          }));
        }
      }
      setScreenState('menu');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    customSoundtrackManager.stopCrowd();
    await signOutAccount();
    const guest = loadOrCreateGuestProfile();
    setProfile(guest);
    setRpgSave(loadRpgSave(guest.uid));
    gameBootFlowManager.resetFirstTimeUserExperience();
    setScreenState('title');
  };

  const resetHudFeeds = useCallback(() => {
    setFinishedSnapshot(null);
    setLastRewardCoins(0);
    setHudScore(createMatchScoreState('left', targetPoints));
    setHudTouches({ left: 0, right: 0 });
    setHudStunned(false);
    setHudWaitingServe(false);
    setActiveCallout(null);
    setTrainingStats(undefined);
    setReplayMeta(null);
  }, [targetPoints]);

  const handleStartLocalMode = (mode: 'training' | 'training_spike' | 'training_receive' | 'ai' | '2v2') => {
    setRoomError(null);
    setActiveCampaignChapter(null);
    resetHudFeeds();
    if (mode === 'training_spike' || mode === 'training_receive') {
      setTrainingStats({ attempts: 0, perfects: 0, streak: 0 });
    }
    setMatchConfig({
      mode,
      arenaId: selectedArena,
      localPlayerId: profile.uid,
      localPlayerName: profile.displayName,
      localCharacterId: selectedCharacter,
      localStats: getLocalStatsFromSave(rpgSave),
      aiDifficulty,
      targetPoints,
      serveType,
      footMode,
      equippedBallColor: rpgSave.equippedBallColor ?? '#FACC15',
      equippedBallTrailColor: rpgSave.equippedBallTrailColor ?? rpgSave.equippedBallColor ?? '#FACC15',
      equippedOutfitId: rpgSave.equippedOutfitId ?? 'outfit_default',
      isOnline: false,
    });
    setMatchNonce((n) => n + 1);
    setShowPauseGuide(false);
    setScreenState('guide');
  };

  const handleStartCampaignChapter = (chapter: CampaignChapter) => {
    setRoomError(null);
    setActiveCampaignChapter(chapter);
    setSelectedArena(chapter.arenaId);
    setScreenState('campaign_vn');
  };

  const handleProceedCampaignMatch = () => {
    if (!activeCampaignChapter) return;
    resetHudFeeds();
    setMatchConfig({
      mode: 'campaign',
      arenaId: activeCampaignChapter.arenaId,
      localPlayerId: profile.uid,
      localPlayerName: profile.displayName,
      localCharacterId: selectedCharacter,
      localStats: getLocalStatsFromSave(rpgSave),
      opponentConfig: {
        name: activeCampaignChapter.opponentName,
        characterId: activeCampaignChapter.opponentCharacterId,
        stats: activeCampaignChapter.opponentStats,
      },
      aiDifficulty: activeCampaignChapter.difficulty,
      targetPoints,
      serveType,
      footMode,
      equippedBallColor: rpgSave.equippedBallColor ?? '#FACC15',
      equippedBallTrailColor: rpgSave.equippedBallTrailColor ?? rpgSave.equippedBallColor ?? '#FACC15',
      equippedOutfitId: rpgSave.equippedOutfitId ?? 'outfit_default',
      isOnline: false,
    });
    setMatchNonce((n) => n + 1);
    setShowPauseGuide(false);
    setScreenState('guide');
  };

  const handleOpenTournament = () => {
    if (!rpgSave.activeTournament) {
      const fresh = generateTournamentBracket(profile.displayName, selectedCharacter, aiDifficulty, selectedArena);
      updateRpgSave((prev) => ({ ...prev, activeTournament: fresh }));
    }
    setScreenState('tournament');
  };

  const handleNewTournament = () => {
    const fresh = generateTournamentBracket(profile.displayName, selectedCharacter, aiDifficulty, selectedArena);
    updateRpgSave((prev) => ({ ...prev, activeTournament: fresh }));
  };

  const handlePlayTournamentMatch = () => {
    const t = rpgSave.activeTournament;
    if (!t) return;
    const match = t.matches.find(
      (m) => m.round === t.currentRound && (m.teamA.isPlayer || m.teamB.isPlayer) && m.winner === null,
    );
    if (!match) return;
    const opp = match.teamA.isPlayer ? match.teamB : match.teamA;
    setActiveCampaignChapter(null);
    resetHudFeeds();
    setMatchConfig({
      mode: 'tournament',
      arenaId: t.arenaId,
      localPlayerId: profile.uid,
      localPlayerName: profile.displayName,
      localCharacterId: selectedCharacter,
      localStats: getLocalStatsFromSave(rpgSave),
      opponentConfig: {
        name: opp.name,
        characterId: opp.characterId,
      },
      aiDifficulty: t.difficulty,
      targetPoints,
      serveType,
      footMode,
      equippedBallColor: rpgSave.equippedBallColor ?? '#FACC15',
      equippedBallTrailColor: rpgSave.equippedBallTrailColor ?? rpgSave.equippedBallColor ?? '#FACC15',
      equippedOutfitId: rpgSave.equippedOutfitId ?? 'outfit_default',
      isOnline: false,
    });
    setMatchNonce((n) => n + 1);
    setShowPauseGuide(false);
    setScreenState('guide');
  };

  const handlePullGacha = (): GachaPullResult | null => {
    const res = pullGachaAthlete(rpgSave);
    if (!res) return null;
    saveRpgSave(profile.uid, res.save);
    void syncRpgSaveToCloud(profile.uid, res.save);
    setRpgSave(res.save);
    return res;
  };

  const handleSelectRpgCard = (cardId: string) => {
    const card = getAthleteCard(cardId);
    setSelectedCharacter(card.baseCharacterId);
    updateRpgSave((prev) => ({ ...prev, activeCardId: cardId }));
    void updateProfileIdentity(profile, { avatarCharacterId: card.baseCharacterId }).then(setProfile);
  };

  const handleUpgradeStat = (
    cardId: string,
    statKey: keyof CharacterStats,
  ): { ok: boolean; error: string | null } => {
    const attempt = attemptUpgradeAthleteStat(rpgSave, cardId, statKey);
    if (!attempt.ok) {
      return { ok: false, error: attempt.error ?? 'Saldo Insuficiente' };
    }
    saveRpgSave(profile.uid, attempt.save);
    void syncRpgSaveToCloud(profile.uid, attempt.save);
    setRpgSave(attempt.save);
    return { ok: true, error: null };
  };

  const handlePurchaseShopItem = (itemId: string): { ok: boolean; error: string | null } => {
    const attempt = purchaseShopItem(rpgSave, itemId);
    if (!attempt.ok) {
      return { ok: false, error: attempt.error ?? 'Saldo Insuficiente' };
    }
    saveRpgSave(profile.uid, attempt.save);
    void syncRpgSaveToCloud(profile.uid, attempt.save);
    if (attempt.item && attempt.cost > 0) {
      void reportBetaStoreEventToCloud({
        uid: profile.uid,
        playerName: profile.displayName,
        itemId: attempt.item.id,
        itemName: attempt.item.name,
        category: attempt.item.category,
        currency: attempt.item.currency ?? 'coins',
        amountSpent: attempt.cost,
      });
    }
    setRpgSave(attempt.save);
    return { ok: true, error: null };
  };

  const handleClaimDiamondPack = (packId: string): { ok: boolean; pack: DiamondRechargePack | null } => {
    const res = claimBetaDiamondPack(rpgSave, packId);
    if (!res.ok || !res.pack) {
      return { ok: false, pack: null };
    }
    saveRpgSave(profile.uid, res.save);
    void syncRpgSaveToCloud(profile.uid, res.save);
    void reportBetaStoreEventToCloud({
      uid: profile.uid,
      playerName: profile.displayName,
      itemId: res.pack.id,
      itemName: `${res.pack.name} (${res.pack.gemsAmount} Diamantes)`,
      category: 'diamond_pack',
      currency: 'free_beta',
      amountSpent: 0,
    });
    setRpgSave(res.save);
    return { ok: true, pack: res.pack };
  };

  const handleOpenGachaBox = (boxId: BetaGachaBoxTier['id']): BetaGachaBoxResult => {
    const res = openBetaGachaBox(rpgSave, boxId);
    if (!res.ok) return res;
    saveRpgSave(profile.uid, res.save);
    void syncRpgSaveToCloud(profile.uid, res.save);
    if (res.box) {
      void reportBetaStoreEventToCloud({
        uid: profile.uid,
        playerName: profile.displayName,
        itemId: res.box.id,
        itemName: `${res.box.name} (Gacha)`,
        category: 'gacha_box',
        currency: res.box.currency,
        amountSpent: res.box.cost,
      });
    }
    setRpgSave(res.save);
    return res;
  };

  const handleClaimMissionReward = (
    missionId: BetaMissionDefinition['id'],
  ): { ok: boolean; rewardCoins: number; rewardGems: number; error: string | null } => {
    const res = claimBetaMissionReward(rpgSave, missionId);
    if (!res.ok) {
      return { ok: false, rewardCoins: 0, rewardGems: 0, error: res.error };
    }
    saveRpgSave(profile.uid, res.save);
    void syncRpgSaveToCloud(profile.uid, res.save);
    setRpgSave(res.save);
    return {
      ok: true,
      rewardCoins: res.rewardCoins,
      rewardGems: res.rewardGems,
      error: null,
    };
  };

  const handleSubmitBetaFeedback = async (
    stars: number,
    comment: string,
  ): Promise<{ ok: boolean; rewardGems: number }> => {
    try {
      await fetch('/api/analytics/rating', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: profile.uid,
          displayName: profile.displayName,
          email: profile.email || `${profile.uid}@playgames.google.com`,
          ratingStars: stars,
          ratingComment: comment,
          matchesPlayed: Math.max(1, profile.wins + profile.losses),
        }),
      });
    } catch {
      // Fallback silencioso
    }
    const rewardRes = claimBetaFeedbackReward(rpgSave);
    if (rewardRes.ok) {
      saveRpgSave(profile.uid, rewardRes.save);
      void syncRpgSaveToCloud(profile.uid, rewardRes.save);
      setRpgSave(rewardRes.save);
      return { ok: true, rewardGems: rewardRes.rewardGems };
    }
    return { ok: true, rewardGems: 0 };
  };

  const handleSpecialPointScored = useCallback(
    (reason: 'ace' | 'block' | 'spike') => {
      updateRpgSave((prev) => rewardSpecialPointCoins(prev, reason).save);
    },
    [updateRpgSave],
  );

  const handleChangeAiDifficulty = useCallback((diff: AiDifficulty) => {
    gameManager.setCurrentDifficulty(diff);
    setAiDifficulty(diff);
    setMatchConfig((prev) => ({ ...prev, aiDifficulty: diff }));
  }, []);

  const handleQueueOnline = (mode: '1v1' | '2v2') => {
    setRoomError(null);
    networkClient.joinMatchmaking({
      playerId: profile.uid,
      name: profile.displayName,
      characterId: selectedCharacter,
      mode,
    });
  };

  const handleCreatePrivateRoom = () => {
    setRoomError(null);
    setChatMessages([]);
    void networkClient.createRoom({
      playerId: profile.uid,
      name: profile.displayName,
      characterId: selectedCharacter,
      mode: '1v1',
      arenaId: selectedArena,
    });
  };

  const handleJoinPrivateRoom = () => {
    const domVal =
      typeof document !== 'undefined'
        ? (document.getElementById('room-code-input') as HTMLInputElement | null)?.value || ''
        : '';
    const cleanCode = (joinCodeInput.trim() || domVal.trim()).toUpperCase();
    if (!cleanCode) {
      setRoomError('Digite o código da sala para entrar.');
      return;
    }
    setJoinCodeInput(cleanCode);
    setRoomError(null);
    setChatMessages([]);
    void networkClient.joinRoom({
      code: cleanCode,
      playerId: profile.uid,
      name: profile.displayName,
      characterId: selectedCharacter,
    });
  };

  const handleScoreUpdate = useCallback(
    (score: ScoreState, touches: { left: number; right: number }) => {
      setHudScore({ ...score });
      setHudTouches({ ...touches });
    },
    [],
  );

  const handleMatchFeedUpdate = useCallback((feed: MatchFeedPayload) => {
    if (feed.trainingStats) {
      setTrainingStats({ ...feed.trainingStats });
    }
    setHudStunned(feed.stunned);
    if (feed.waitingHumanServe !== undefined) {
      setHudWaitingServe(feed.waitingHumanServe);
    }
    if (feed.callout) {
      const nextCallout: HudCalloutState = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        text: feed.callout.text,
        tone: feed.callout.tone,
      };
      setActiveCallout(nextCallout);
      if (calloutTimerRef.current) window.clearTimeout(calloutTimerRef.current);
      calloutTimerRef.current = window.setTimeout(() => {
        setActiveCallout((cur) => (cur?.id === nextCallout.id ? null : cur));
      }, FLOATING_TEXT_CONFIG.durationMs);
    }
  }, []);

  const handleChangeServeType = useCallback((nextServe: ServeType) => {
    setServeType(nextServe);
    setMatchConfig((prev) => ({ ...prev, serveType: nextServe }));
  }, []);

  const handleToggleFootMode = useCallback(() => {
    setFootMode((prev) => {
      const next = !prev;
      setMatchConfig((cfg) => ({ ...cfg, footMode: next }));
      return next;
    });
  }, []);

  const handleQuickControlHotkey = useCallback(
    (action: { serveType?: ServeType; toggleFootMode?: boolean }) => {
      if (action.serveType) handleChangeServeType(action.serveType);
      if (action.toggleFootMode) handleToggleFootMode();
    },
    [handleChangeServeType, handleToggleFootMode],
  );

  const handleMatchEnd = useCallback(
    (snap: MatchSnapshot) => {
      customSoundtrackManager.stopCrowd();
      setFinishedSnapshot(snap);
      setScreenState('gameover');
      const localP =
        snap.players.find((p) => p.id === matchConfig.localPlayerId) ??
        snap.players.find((p) => p.id === profile.uid);
      const isTraining =
        snap.mode === 'training' || snap.mode === 'training_spike' || snap.mode === 'training_receive';
      if (!isTraining && localP && snap.score.winner) {
        const myTeam = localP.team;
        const won = snap.score.winner === myTeam;
        const teamScore = myTeam === 'left' ? snap.score.left : snap.score.right;
        const opponentScore = myTeam === 'left' ? snap.score.right : snap.score.left;
        const firestoreMode: 'ai' | '1v1' | '2v2' | 'training' | 'private' =
          snap.mode === 'campaign' || snap.mode === 'tournament'
            ? 'ai'
            : snap.mode === 'training_spike' || snap.mode === 'training_receive'
              ? 'training'
              : snap.mode === 'coop_2v2'
                ? '2v2'
                : snap.mode;

        void recordMatchOutcome(profile, {
          mode: firestoreMode,
          arenaId: matchConfig.arenaId,
          characterId: localP.characterId,
          teamScore,
          opponentScore,
          won,
          spikesCount: localP.spikesCount,
          blocksCount: localP.blocksCount,
        }).then((updated) => setProfile(updated));

        if (snap.mode === 'campaign' && activeCampaignChapter) {
          if (won) {
            const reward = rpgSave.completedChapters.includes(activeCampaignChapter.id)
              ? Math.round(activeCampaignChapter.rewardCoins * 0.45)
              : activeCampaignChapter.rewardCoins;
            setLastRewardCoins(reward);
            updateRpgSave((prev) => completeCampaignChapter(prev, activeCampaignChapter.id));
          } else {
            setLastRewardCoins(0);
          }
        } else if (snap.mode === 'tournament' && rpgSave.activeTournament) {
          const nextT = advanceTournamentRound(rpgSave.activeTournament, won);
          const isChampion = !nextT.eliminated && nextT.currentRound === 'completed';
          const prize = isChampion ? 500 : won ? 100 : 25;
          setLastRewardCoins(prize);
          updateRpgSave((prev) => ({
            ...prev,
            coins: prev.coins + prize,
            activeTournament: { ...nextT, rewardClaimed: isChampion },
          }));
        } else {
          if (won) {
            const { rewardCoins } = rewardMatchVictoryCoins(rpgSave, matchConfig.aiDifficulty);
            setLastRewardCoins(rewardCoins);
            updateRpgSave((prev) => {
              const afterCoins = rewardMatchVictoryCoins(prev, matchConfig.aiDifficulty).save;
              return recordBetaMissionProgress(afterCoins, { matchesPlayed: 1, matchesWon: 1 });
            });
          } else {
            const consolation = 25;
            setLastRewardCoins(consolation);
            updateRpgSave((prev) => {
              const afterCoins = { ...prev, coins: prev.coins + consolation };
              return recordBetaMissionProgress(afterCoins, { matchesPlayed: 1 });
            });
          }
        }

        // Contabiliza a partida concluída no GameBootFlowManager (exibe Pop-up de 1 a 5 estrelas após a 3ª partida)
        gameBootFlowManager.recordMatchCompleted();
      }
    },
    [profile, matchConfig.arenaId, matchConfig.aiDifficulty, activeCampaignChapter, rpgSave, updateRpgSave],
  );

  const handleTogglePause = useCallback(() => {
    setShowPauseGuide(false);
    setScreenState((prev) => {
      if (prev === 'playing') return 'paused';
      if (prev === 'paused') return 'playing';
      return prev;
    });
  }, []);

  const handleToggleMute = () => {
    const next = !muted;
    setMuted(next);
    soundEngine.setMuted(next);
    customSoundtrackManager.crowdSource.muted = next;
    customSoundtrackManager.syncCrowdSourceVolume();
  };

  const handleChangeVolumes = (music: number, sfx: number) => {
    setMusicVol(music);
    setSfxVol(sfx);
    soundEngine.setVolumes(music, sfx);
    customSoundtrackManager.syncCrowdSourceVolume();
  };

  const handleSendEmoji = (text: string) => {
    if (matchConfig.isOnline) {
      networkClient.sendEmoji(text);
    } else {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setEmojiBubbles((prev) => [...prev.slice(-2), { id, name: profile.displayName, text }]);
      window.setTimeout(() => {
        setEmojiBubbles((prev) => prev.filter((item) => item.id !== id));
      }, 2200);
    }
  };

  const handleExitToMenu = () => {
    if (matchConfig.isOnline) {
      networkClient.leaveRoom();
    }
    // Parada imediata e explícita da plateia (crowdSource.pause() + currentTime = 0) e retorno à Música do Lobby
    customSoundtrackManager.stopCrowd();
    customSoundtrackManager.StopAllGameplaySounds();
    touchBridgeRef.current.moveX = 0;
    touchBridgeRef.current.moveZ = 0;
    touchBridgeRef.current.moveLeftHeld = false;
    touchBridgeRef.current.moveRightHeld = false;
    setActiveRoom(null);
    setFinishedSnapshot(null);
    setShowPauseGuide(false);
    setReplayMeta(null);
    setScreenState('menu');
  };

  const handlePlayAgain = () => {
    setFinishedSnapshot(null);
    setShowPauseGuide(false);
    setReplayMeta(null);
    if (matchConfig.isOnline && activeRoom) {
      networkClient.startRoomMatch();
    } else {
      setHudScore(createMatchScoreState('left', matchConfig.targetPoints ?? targetPoints));
      setMatchNonce((n) => n + 1);
      setScreenState('guide');
    }
  };

  const handleConfirmGuideStart = useCallback(() => {
    soundEngine.unlock();
    // Para exclusivamente a Música de Fundo (bgmSource.Stop()) e dispara a plateia em loop (crowdSource.play())
    const bgmAudioSource = customSoundtrackManager.bgmSource;
    gameManager.StartMatch(bgmAudioSource);
    customSoundtrackManager.StartMatchCrowdAmbience();
    setShowPauseGuide(false);
    setScreenState('playing');
  }, []);

  const handleSelectCharacter = (id: CharacterId) => {
    setSelectedCharacter(id);
    setMatchConfig((prev) => ({ ...prev, localCharacterId: id }));
    void updateProfileIdentity(profile, { avatarCharacterId: id }).then(setProfile);
  };

  const handleSelectArena = (arenaId: ArenaId) => {
    setSelectedArena(arenaId);
    setMatchConfig((prev) => ({ ...prev, arenaId }));
  };

  const handleChangeKeyBindings = useCallback((next: KeyBindingsConfig) => {
    setKeyBindings(saveKeyBindings(next));
  }, []);

  const handleResetKeyBindings = useCallback(() => {
    setKeyBindings(resetKeyBindings());
  }, []);

  return (
    <SafeAreaFitter>
      {/* Palco Three.js montado uma única vez */}
      <GameViewport
        screenState={screenState}
        matchConfig={matchConfig}
        matchNonce={matchNonce}
        keyBindings={keyBindings}
        touchBridgeRef={touchBridgeRef}
        ultimateFillRef={ultimateFillRef}
        ultimateReadyRef={ultimateReadyRef}
        superAttackContainerRef={superAttackContainerRef}
        superAttackFillRef={superAttackFillRef}
        superAttackTimerTextRef={superAttackTimerTextRef}
        serveChargeContainerRef={serveChargeContainerRef}
        serveChargeFillRef={serveChargeFillRef}
        serveChargeTimerTextRef={serveChargeTimerTextRef}
        serveChargeStageLabelRef={serveChargeStageLabelRef}
        replayControlRef={replayControlRef}
        onReplayStateChange={setReplayMeta}
        onScoreUpdate={handleScoreUpdate}
        onMatchFeedUpdate={handleMatchFeedUpdate}
        onQuickControlHotkey={handleQuickControlHotkey}
        onSpecialPointScored={handleSpecialPointScored}
        onMatchEnd={handleMatchEnd}
        onTogglePause={handleTogglePause}
      />

      {screenState === 'title' && (
        <BootFlowOverlay
          bootState={bootState}
          soundMuted={muted}
          onToggleMute={handleToggleMute}
          onTitleTouch={() => {
            soundEngine.unlock();
            soundEngine.playButtonClick();
            void gameBootFlowManager.handleTitleScreenTouch();
          }}
          onAcceptTerms={() => {
            soundEngine.unlock();
            soundEngine.playButtonClick();
            gameBootFlowManager.acceptTermsOfService();
          }}
          onGoogleLogin={handleGoogleLogin}
        />
      )}

      {screenState === 'menu' && (
        <MainMenu
          profile={profile}
          rpgSave={rpgSave}
          selectedCharacter={selectedCharacter}
          selectedArena={selectedArena}
          aiDifficulty={aiDifficulty}
          targetPoints={targetPoints}
          muted={muted}
          musicVol={musicVol}
          sfxVol={sfxVol}
          joinCodeInput={joinCodeInput}
          matchmakingStatus={matchmakingStatus}
          roomError={roomError}
          onSelectCharacter={handleSelectCharacter}
          onSelectArena={handleSelectArena}
          onChangeAiDifficulty={handleChangeAiDifficulty}
          onChangeTargetPoints={setTargetPoints}
          onStartLocalMode={handleStartLocalMode}
          onStartCampaignChapter={handleStartCampaignChapter}
          onOpenTournament={handleOpenTournament}
          onPullGacha={handlePullGacha}
          onSelectRpgCard={handleSelectRpgCard}
          onUpgradeStat={handleUpgradeStat}
          onPurchaseShopItem={handlePurchaseShopItem}
          onClaimDiamondPack={handleClaimDiamondPack}
          onOpenGachaBox={handleOpenGachaBox}
          onClaimMissionReward={handleClaimMissionReward}
          onSubmitBetaFeedback={handleSubmitBetaFeedback}
          onQueueOnline={handleQueueOnline}
          onCancelQueue={() => {
            networkClient.leaveMatchmaking();
            setMatchmakingStatus(null);
          }}
          onCreatePrivateRoom={handleCreatePrivateRoom}
          onJoinCodeChange={setJoinCodeInput}
          onJoinPrivateRoom={handleJoinPrivateRoom}
          onUpdateDisplayName={(name) => {
            void updateProfileIdentity(profile, { displayName: name }).then(setProfile);
          }}
          onToggleMute={handleToggleMute}
          onChangeVolumes={handleChangeVolumes}
          keyBindings={keyBindings}
          onChangeKeyBindings={handleChangeKeyBindings}
          onResetKeyBindings={handleResetKeyBindings}
          onGoogleUpgrade={handleGoogleLogin}
          onLogout={handleLogout}
          isAdmin={isAdmin}
          onAdminStateChange={setIsAdmin}
          onAdminLogout={logoutAdmin}
        />
      )}

      {screenState === 'campaign_vn' && activeCampaignChapter && (
        <CampaignVnModal
          chapter={activeCampaignChapter}
          onProceedToMatch={handleProceedCampaignMatch}
          onCancel={() => setScreenState('menu')}
        />
      )}

      {screenState === 'tournament' && rpgSave.activeTournament && (
        <TournamentScreen
          tournament={rpgSave.activeTournament}
          onPlayNextMatch={handlePlayTournamentMatch}
          onNewTournament={handleNewTournament}
          onBackToMenu={() => setScreenState('menu')}
        />
      )}

      {screenState === 'lobby' && activeRoom && (
        <LobbyScreen
          room={activeRoom}
          localPlayerId={assignedPlayerId || networkClient.getAssignedPlayerId(profile.uid)}
          pingMs={pingMs}
          chatMessages={chatMessages}
          onLeave={() => {
            networkClient.leaveRoom();
            setAssignedPlayerId(null);
            setActiveRoom(null);
            setScreenState('menu');
          }}
          onToggleReady={(ready) => networkClient.setReady(ready)}
          onSelectMode={(mode) => networkClient.setRoomMode(mode)}
          onSelectArena={(arenaId) => {
            handleSelectArena(arenaId);
            networkClient.updateRoomConfig({ arenaId });
          }}
          onFillBots={() => networkClient.fillBots()}
          onStartMatch={() => networkClient.startRoomMatch()}
          onSendChat={(text) => networkClient.sendChat(text, 'room', activeRoom.code)}
        />
      )}

      {screenState === 'guide' && (
        <HowToPlayModal
          mode={matchConfig.mode}
          arenaId={matchConfig.arenaId}
          targetPoints={matchConfig.targetPoints ?? targetPoints}
          isOnline={matchConfig.isOnline}
          keyBindings={keyBindings}
          onChangeKeyBindings={handleChangeKeyBindings}
          onResetKeyBindings={handleResetKeyBindings}
          onStartMatch={handleConfirmGuideStart}
          onBackToMenu={handleExitToMenu}
        />
      )}

      {(screenState === 'playing' || screenState === 'paused') && !showHudCustomizer && (
        <GameHud
          mode={matchConfig.mode}
          score={hudScore}
          touches={hudTouches}
          leftLabel={
            matchConfig.isOnline && activeRoom
              ? activeRoom.mode === 'coop_2v2'
                ? activeRoom.members
                    .filter((m) => m.team === 'left' && !m.isAi)
                    .map((m) => m.name)
                    .join(' & ') || profile.displayName
                : activeRoom.members.find((m) => m.team === 'left')?.name ?? profile.displayName
              : profile.displayName
          }
          rightLabel={
            matchConfig.isOnline && activeRoom
              ? activeRoom.mode === 'coop_2v2'
                ? 'Enemy_IA_1 & Enemy_IA_2'
                : activeRoom.members.find((m) => m.team === 'right')?.name ?? 'Rival Online'
              : matchConfig.opponentConfig?.name ?? (matchConfig.mode === 'training' ? 'Treino' : 'Dupla IA')
          }
          pingMs={pingMs}
          isOnline={matchConfig.isOnline}
          muted={muted}
          serveType={serveType}
          footMode={footMode}
          stunned={hudStunned}
          waitingHumanServe={hudWaitingServe}
          activeCallout={activeCallout}
          trainingStats={trainingStats}
          keyBindings={keyBindings}
          ultimateFillRef={ultimateFillRef}
          ultimateReadyRef={ultimateReadyRef}
          superAttackContainerRef={superAttackContainerRef}
          superAttackFillRef={superAttackFillRef}
          superAttackTimerTextRef={superAttackTimerTextRef}
          serveChargeContainerRef={serveChargeContainerRef}
          serveChargeFillRef={serveChargeFillRef}
          serveChargeTimerTextRef={serveChargeTimerTextRef}
          serveChargeStageLabelRef={serveChargeStageLabelRef}
          touchBridgeRef={touchBridgeRef}
          activeBubbles={emojiBubbles}
          replayMeta={replayMeta}
          onToggleReplaySlowMo={() => replayControlRef.current?.toggleSlowMo()}
          onSkipReplay={() => replayControlRef.current?.skip()}
          onChangeServeType={handleChangeServeType}
          onToggleFootMode={handleToggleFootMode}
          onToggleMute={handleToggleMute}
          onPause={handleTogglePause}
          onSendEmoji={handleSendEmoji}
          chatMessages={chatMessages}
          onSendChat={(text) => networkClient.sendChat(text, 'room', activeRoom?.code)}
        />
      )}

      {screenState === 'paused' && !showPauseGuide && !showHudCustomizer && (
        <PauseModal
          onResume={() => setScreenState('playing')}
          onShowGuide={() => setShowPauseGuide(true)}
          onCustomizeHud={() => setShowHudCustomizer(true)}
          onRestart={handlePlayAgain}
          onExitToMenu={handleExitToMenu}
        />
      )}

      {showHudCustomizer && (
        <HudCustomizerModal onClose={() => setShowHudCustomizer(false)} />
      )}

      {screenState === 'paused' && showPauseGuide && (
        <HowToPlayModal
          mode={matchConfig.mode}
          arenaId={matchConfig.arenaId}
          targetPoints={matchConfig.targetPoints ?? targetPoints}
          isOnline={matchConfig.isOnline}
          isMidMatchHelp
          keyBindings={keyBindings}
          onChangeKeyBindings={handleChangeKeyBindings}
          onResetKeyBindings={handleResetKeyBindings}
          onStartMatch={handleConfirmGuideStart}
          onBackToMenu={() => setShowPauseGuide(false)}
        />
      )}

      {screenState === 'gameover' && finishedSnapshot && (
        <MatchResultModal
          snapshot={finishedSnapshot}
          localPlayerId={matchConfig.localPlayerId || profile.uid}
          rewardCoins={lastRewardCoins}
          contextActionLabel={matchConfig.mode === 'tournament' ? 'Ver Chave da Liga' : undefined}
          onContextAction={
            matchConfig.mode === 'tournament'
              ? () => {
                  customSoundtrackManager.stopCrowd();
                  setFinishedSnapshot(null);
                  setScreenState('tournament');
                }
              : undefined
          }
          onPlayAgain={handlePlayAgain}
          onExitToMenu={handleExitToMenu}
        />
      )}

      {/* 5. Pop-up de Avaliação In-Game (1 a 5 Estrelas após a 3ª partida jogada) */}
      <RatingPopupModal
        isOpen={bootState.isRatingPopupOpen}
        matchesPlayed={bootState.matchesPlayed}
        onClose={() => gameBootFlowManager.closeRatingPopup()}
        onSubmitRating={async (stars, comment) => {
          await gameBootFlowManager.submitGameRating(stars, comment);
        }}
      />
    </SafeAreaFitter>
  );
}
