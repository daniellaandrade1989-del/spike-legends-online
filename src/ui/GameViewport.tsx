/**
 * Spike Legends Online — Viewport 3D Three.js + Loop de Jogo (Desacoplado do React)
 * Suporta simulação local Rapier (Treino / VS IA) e partidas autoritativas online (Socket.io + Client-Side Prediction).
 */
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  COURT,
  PHYSICS,
  type AiDifficulty,
  type ArenaId,
  type CharacterId,
  type CharacterStats,
  type GameMode,
  type GameScreenState,
  type ServeType,
  type TeamSide,
} from '../config/gameConfig';
import { matchesActionKey, type KeyBindingsConfig } from '../config/keyBindings';
import { globalInputManager, InputManager, mouseButtonToCode } from '../input/inputManager';
import {
  ensureRapierReady,
  VolleyballRapierWorld,
  type MatchEvent,
  type MatchSnapshot,
  type PlayerInputState,
} from '../physics/rapierWorld';
import type { ScoreState } from '../physics/volleyballRules';
import { buildAnimeCharacter, updateCharacterRigAnimation, type CharacterRig } from '../characters/characterBuilder';
import { PlayerAnimatorController } from '../characters/playerAnimatorController';
import { buildArenaScene, type BuiltArena } from '../maps/courtBuilder';
import { VfxSystem } from '../effects/vfxSystem';
import { GameFeelManager } from '../effects/gameFeelManager';
import { soundEngine } from '../audio/soundEngine';
import { customSoundtrackManager } from '../audio/customSoundtrackManager';
import { networkClient, type PerformSetPayload, type RoomStatePayload } from '../network/socketClient';
import { ReplayManager, type ReplayStateMeta } from '../replay/replayManager';

export interface ReplayControlHandle {
  toggleSlowMo: () => void;
  skip: () => void;
}

export type { ReplayStateMeta };

export interface TouchInputBridge {
  moveX: number;
  moveZ: number;
  moveLeftHeld?: boolean;
  moveRightHeld?: boolean;
  jumpQueued: boolean;
  jumpHeld: boolean;
  spikeQueued: boolean;
  setQueued?: boolean;
  serveNormalQueued?: boolean;
  serveJumpQueued?: boolean;
  diveQueued: boolean;
  receiveQueued: boolean;
  ultimateQueued: boolean;
}

export interface MatchConfig {
  mode: GameMode;
  arenaId: ArenaId;
  localPlayerId: string;
  localPlayerName: string;
  localCharacterId: CharacterId;
  localStats?: CharacterStats;
  opponentConfig?: {
    name: string;
    characterId: CharacterId;
    stats?: CharacterStats;
  };
  aiDifficulty: AiDifficulty;
  targetPoints?: number;
  serveType?: ServeType;
  footMode?: boolean;
  equippedBallColor?: string;
  equippedBallTrailColor?: string;
  equippedOutfitId?: string;
  isOnline: boolean;
  room?: RoomStatePayload | null;
  initialSnapshot?: MatchSnapshot | null;
}

export interface MatchFeedPayload {
  trainingStats?: MatchSnapshot['trainingStats'];
  stunned: boolean;
  waitingHumanServe?: boolean;
  callout?: { text: string; tone: 'perfect' | 'danger' | 'info' };
}

interface GameViewportProps {
  screenState: GameScreenState;
  matchConfig: MatchConfig;
  matchNonce: number;
  keyBindings: KeyBindingsConfig;
  touchBridgeRef: React.MutableRefObject<TouchInputBridge>;
  ultimateFillRef: React.MutableRefObject<HTMLDivElement | null>;
  ultimateReadyRef: React.MutableRefObject<HTMLSpanElement | null>;
  superAttackContainerRef: React.MutableRefObject<HTMLDivElement | null>;
  superAttackFillRef: React.MutableRefObject<HTMLDivElement | null>;
  superAttackTimerTextRef: React.MutableRefObject<HTMLSpanElement | null>;
  serveChargeContainerRef?: React.MutableRefObject<HTMLDivElement | null>;
  serveChargeFillRef?: React.MutableRefObject<HTMLDivElement | null>;
  serveChargeTimerTextRef?: React.MutableRefObject<HTMLSpanElement | null>;
  serveChargeStageLabelRef?: React.MutableRefObject<HTMLSpanElement | null>;
  replayControlRef?: React.MutableRefObject<ReplayControlHandle | null>;
  onReplayStateChange?: (meta: ReplayStateMeta) => void;
  onScoreUpdate: (score: ScoreState, touches: { left: number; right: number }, phase: MatchSnapshot['phase']) => void;
  onMatchFeedUpdate?: (feed: MatchFeedPayload) => void;
  onQuickControlHotkey?: (action: { serveType?: ServeType; toggleFootMode?: boolean }) => void;
  onSpecialPointScored?: (reason: 'ace' | 'block' | 'spike') => void;
  onMatchEnd: (snapshot: MatchSnapshot) => void;
  onTogglePause: () => void;
}

function mergeLatchedPlayerInput(
  prev: PlayerInputState | undefined,
  next: PlayerInputState,
): PlayerInputState {
  if (!prev) return { ...next };
  return {
    ...next,
    jump: Boolean(prev.jump || next.jump),
    spike: Boolean(prev.spike || next.spike),
    set: Boolean(prev.set || next.set),
    receive: Boolean(prev.receive || next.receive),
    dive: Boolean(prev.dive || next.dive),
    ultimate: Boolean(prev.ultimate || next.ultimate),
    serveQuickTap: Boolean(prev.serveQuickTap || next.serveQuickTap),
    serveNormalTrigger: Boolean(prev.serveNormalTrigger || next.serveNormalTrigger),
    serveUnderhandTrigger: Boolean(prev.serveUnderhandTrigger || next.serveUnderhandTrigger),
    serveJumpTrigger: Boolean(prev.serveJumpTrigger || next.serveJumpTrigger),
    serveReleaseChargeTime:
      next.serveReleaseChargeTime !== undefined
        ? next.serveReleaseChargeTime
        : prev.serveReleaseChargeTime,
    hybridCommand:
      next.hybridCommand && next.hybridCommand !== 'none'
        ? next.hybridCommand
        : (prev.hybridCommand ?? 'none'),
  };
}

function clearConsumedEdgeTriggers(inp: PlayerInputState): PlayerInputState {
  return {
    ...inp,
    jump: false,
    spike: false,
    set: false,
    receive: false,
    dive: false,
    ultimate: false,
    serveReleaseChargeTime: undefined,
    hybridCommand: 'none',
    serveQuickTap: false,
    serveNormalTrigger: false,
    serveUnderhandTrigger: false,
    serveJumpTrigger: false,
  };
}

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export const GameViewport: React.FC<GameViewportProps> = ({
  screenState,
  matchConfig,
  matchNonce,
  keyBindings,
  touchBridgeRef,
  ultimateFillRef,
  ultimateReadyRef,
  superAttackContainerRef,
  superAttackFillRef,
  superAttackTimerTextRef,
  serveChargeContainerRef,
  serveChargeFillRef,
  serveChargeTimerTextRef,
  serveChargeStageLabelRef,
  replayControlRef,
  onReplayStateChange,
  onScoreUpdate,
  onMatchFeedUpdate,
  onQuickControlHotkey,
  onSpecialPointScored,
  onMatchEnd,
  onTogglePause,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const flashOverlayRef = useRef<HTMLDivElement | null>(null);

  // Refs para evitar recriação do WebGLRenderer quando estado React muda
  const screenStateRef = useRef(screenState);
  screenStateRef.current = screenState;

  const matchConfigRef = useRef(matchConfig);
  matchConfigRef.current = matchConfig;

  const keyBindingsRef = useRef(keyBindings);
  keyBindingsRef.current = keyBindings;

  const callbacksRef = useRef({
    onReplayStateChange,
    onScoreUpdate,
    onMatchFeedUpdate,
    onQuickControlHotkey,
    onSpecialPointScored,
    onMatchEnd,
    onTogglePause,
  });
  callbacksRef.current = {
    onReplayStateChange,
    onScoreUpdate,
    onMatchFeedUpdate,
    onQuickControlHotkey,
    onSpecialPointScored,
    onMatchEnd,
    onTogglePause,
  };

  const activeArenaRef = useRef<ArenaId | null>(null);
  const rebuildArenaFnRef = useRef<((arenaId: ArenaId) => void) | null>(null);
  const startLocalSimFnRef = useRef<(() => void) | null>(null);
  const latestOnlineSnapRef = useRef<MatchSnapshot | null>(null);
  const latestRemoteInputsRef = useRef>(new Map());
  const pendingNetworkSetsRef = useRef<PerformSetPayload[]>([]);
  const processedEventsTickRef = useRef<number>(-1);

  // Troca de arena quando o jogador escolhe outro mapa
  useEffect(() => {
    if (activeArenaRef.current !== matchConfig.arenaId && rebuildArenaFnRef.current) {
      rebuildArenaFnRef.current(matchConfig.arenaId);
    }
  }, [matchConfig.arenaId]);

  // Vigia de estado da tela no palco 3D: se a tela atual não for a partida ativa, corta imediatamente a plateia
  useEffect(() => {
    if (screenState !== 'playing' && screenState !== 'paused' && screenState !== 'guide') {
      customSoundtrackManager.stopCrowd();
      soundEngine.stopCrowdAmbience();
    }
  }, [screenState]);

  // Reinicia simulação local quando matchNonce ou modo local/host P2P muda
  useEffect(() => {
    processedEventsTickRef.current = -1;
    pendingNetworkSetsRef.current = [];
    latestRemoteInputsRef.current.clear();
    if (matchConfig.isOnline) {
      latestOnlineSnapRef.current = matchConfig.initialSnapshot ?? null;
      const isOnlineHost = Boolean(
        matchConfig.room && matchConfig.room.hostId === matchConfig.localPlayerId,
      );
      if (isOnlineHost && startLocalSimFnRef.current) {
        startLocalSimFnRef.current();
      }
    } else if (
      (screenState === 'playing' || screenState === 'title' || screenState === 'guide') &&
      startLocalSimFnRef.current
    ) {
      startLocalSimFnRef.current();
    }
  }, [
    matchNonce,
    matchConfig.isOnline,
    matchConfig.mode,
    matchConfig.arenaId,
    matchConfig.localCharacterId,
    matchConfig.aiDifficulty,
    matchConfig.targetPoints,
  ]);

  // Escuta pacotes P2P do RTCDataChannel diretamente em useRefs (Zero useState / Zero Re-render do React!)
  useEffect(() => {
    const unsubSnap = networkClient.onMatchSnapshot((snap) => {
      latestOnlineSnapRef.current = snap;
    });
    const unsubRemoteInput = networkClient.onRemoteInput(({ playerId, input }) => {
      const prev = latestRemoteInputsRef.current.get(playerId);
      latestRemoteInputsRef.current.set(playerId, mergeLatchedPlayerInput(prev, input));
    });
    const unsubSync = networkClient.onSyncState((snap) => {
      latestOnlineSnapRef.current = snap;
      processedEventsTickRef.current = -1;
    });
    const unsubSet = networkClient.onPerformSet((setPayload) => {
      pendingNetworkSetsRef.current.push(setPayload);
      if (latestOnlineSnapRef.current) {
        latestOnlineSnapRef.current.ball.vx = setPayload.vx;
        latestOnlineSnapRef.current.ball.vy = setPayload.vy;
        const setterPlayer = latestOnlineSnapRef.current.players.find(
          (pl) => pl.id === setPayload.playerId,
        );
        if (setterPlayer) {
          setterPlayer.anim = 'set';
          setterPlayer.actionState = 'set';
          setterPlayer.animTimer = 0;
        }
      }
    });
    const unsubStart = networkClient.onMatchStarted(({ snapshot }) => {
      latestOnlineSnapRef.current = snapshot;
    });
    return () => {
      unsubSnap();
      unsubRemoteInput();
      unsubSync();
      unsubSet();
      unsubStart();
    };
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      preserveDrawingBuffer: isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);

    const scene = new THREE.Scene();
    const initW = container.clientWidth || window.innerWidth || 1280;
    const initH = container.clientHeight || window.innerHeight || 720;
    const initAspect = initW / initH;
    const computeFov = (aspect: number) =>
      aspect < 1 ? THREE.MathUtils.clamp(23 / Math.pow(Math.max(0.38, aspect), 0.46), 23, 44) : 23;

    const camera = new THREE.PerspectiveCamera(computeFov(initAspect), initAspect, 0.1, 200);
    const initPortraitPull = initAspect < 1 ? (1 - initAspect) * 16 : 0;
    camera.position.set(0, 5.8 + initPortraitPull * 0.28, 29.8 + initPortraitPull * 1.35);
    camera.lookAt(0, 1.65, 0);

    // Environment map procedural obrigatório
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    // Iluminação quente/fria equilibrada (Key + Hemisphere + Rim)
    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x7c2d12, 0.72);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.75);
    keyLight.position.set(8, 16, 10);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 48;
    keyLight.shadow.camera.left = -15;
    keyLight.shadow.camera.right = 15;
    keyLight.shadow.camera.top = 11;
    keyLight.shadow.camera.bottom = -11;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.55);
    rimLight.position.set(-10, 8, -12);
    scene.add(rimLight);

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    let builtArena: BuiltArena = buildArenaScene(scene, matchConfigRef.current.arenaId, maxAnisotropy);
    activeArenaRef.current = matchConfigRef.current.arenaId;

    const vfx = new VfxSystem(scene);
    const gameFeel = new GameFeelManager(soundEngine);
    const playerRigs = new Map<
      string,
      { rig: CharacterRig; characterId: CharacterId; team: TeamSide; animator: PlayerAnimatorController }
    >();

    const clearRigs = () => {
      for (const entry of playerRigs.values()) {
        scene.remove(entry.rig.root);
      }
      playerRigs.clear();
    };

    rebuildArenaFnRef.current = (arenaId: ArenaId) => {
      builtArena.dispose();
      builtArena = buildArenaScene(scene, arenaId, maxAnisotropy);
      activeArenaRef.current = arenaId;
    };

    // Estado da simulação local Rapier + Buffer Circular de Replay Instantâneo (5s)
    let localWorld: VolleyballRapierWorld | null = null;
    let rapierInitialized = false;
    let simAccumulator = 0;
    let currentSnapshot: MatchSnapshot | null = null;
    const replayManager = new ReplayManager(5.0, PHYSICS.FIXED_DT);
    let pendingReplayDelay = -1;
    let lastReplayMetaKey = '';
    let prevSimPhase: MatchSnapshot['phase'] = 'serve_wait';

    // Previsão local imediata (Client-Side Prediction) para o convidado online responder em 0ms
    const guestPred = {
      initialized: false,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      facingX: -1,
      anim: 'idle' as MatchSnapshot['players'][number]['anim'],
      actionState: 'idle' as MatchSnapshot['players'][number]['actionState'],
      actionTimer: 0,
      lastReconciledTick: -1,
      localJumpFxCooldown: 0,
    };

    const emitReplayMeta = (force = false) => {
      const meta = replayManager.getMeta();
      const key = `${meta.active ? 1 : 0}-${meta.slowMotion ? 1 : 0}-${Math.round(meta.progress * 40)}-${meta.highlightLabel}`;
      if (force || key !== lastReplayMetaKey) {
        lastReplayMetaKey = key;
        callbacksRef.current.onReplayStateChange?.(meta);
      }
    };

    if (replayControlRef) {
      replayControlRef.current = {
        toggleSlowMo: () => {
          if (!replayManager.isPlaying()) return;
          replayManager.toggleSlowMotion();
          emitReplayMeta(true);
        },
        skip: () => {
          if (!replayManager.isPlaying()) return;
          replayManager.skipPlayback();
          pendingReplayDelay = -1;
          simAccumulator = 0;
          if (localWorld) {
            localWorld.advanceNextServeAfterReplay();
            currentSnapshot = localWorld.collectSnapshot();
            prevSimPhase = currentSnapshot.phase;
          }
          emitReplayMeta(true);
        },
      };
    }

    const initLocalSimulation = async () => {
      await ensureRapierReady();
      rapierInitialized = true;
      if (localWorld) {
        localWorld.dispose();
        localWorld = null;
      }

      const cfg = matchConfigRef.current;
      const oppName = cfg.opponentConfig?.name ?? 'Yuki (IA)';
      const oppChar = cfg.opponentConfig?.characterId ?? ('yuki' as CharacterId);
      const oppStats = cfg.opponentConfig?.stats;

      const setterChar: CharacterId = cfg.localCharacterId === 'hana' ? 'ren' : 'hana';
      const setterName = setterChar === 'hana' ? 'Hana (Levantadora)' : 'Ren (Levantador)';

      const oppPartnerChar: CharacterId = oppChar === 'kai' ? 'ren' : 'kai';
      const oppPartnerName = oppPartnerChar === 'kai' ? 'Kai (Bot 2)' : 'Ren (Bot 2)';

      const roster: Array<{
        id: string;
        name: string;
        characterId: CharacterId;
        team: TeamSide;
        slotIndex: number;
        role: 'attacker' | 'setter';
        isAi: boolean;
        aiDifficulty: AiDifficulty;
        stats?: CharacterStats;
      }> =
        cfg.isOnline && cfg.initialSnapshot && cfg.initialSnapshot.players.length > 0
          ? cfg.initialSnapshot.players.map((pl) => ({
              id: pl.id,
              name: pl.name,
              characterId: pl.characterId,
              team: pl.team,
              slotIndex: pl.slotIndex,
              role: pl.role,
              isAi: pl.isAi,
              aiDifficulty: pl.aiDifficulty ?? cfg.aiDifficulty,
              stats: pl.id === cfg.localPlayerId ? cfg.localStats ?? pl.stats : pl.stats,
            }))
          : cfg.isOnline && cfg.room && cfg.room.members.length > 0
            ? cfg.room.members.map((m) => ({
                id: m.playerId,
                name: m.name,
                characterId: m.characterId,
                team: m.team,
                slotIndex: m.slotIndex,
                role: m.slotIndex === 1 ? 'setter' : 'attacker',
                isAi: m.isAi,
                aiDifficulty: cfg.aiDifficulty,
                stats: m.playerId === cfg.localPlayerId ? cfg.localStats : undefined,
              }))
            : cfg.mode === 'training_spike' || cfg.mode === 'training_receive'
              ? [
                  {
                    id: cfg.localPlayerId,
                    name: cfg.localPlayerName,
                    characterId: cfg.localCharacterId,
                    team: 'left',
                    slotIndex: 0,
                    role: 'attacker',
                    isAi: false,
                    aiDifficulty: cfg.aiDifficulty,
                    stats: cfg.localStats,
                  },
                ]
              : cfg.mode === 'training'
                ? [
                    {
                      id: cfg.localPlayerId,
                      name: cfg.localPlayerName,
                      characterId: cfg.localCharacterId,
                      team: 'left',
                      slotIndex: 0,
                      role: 'attacker',
                      isAi: false,
                      aiDifficulty: cfg.aiDifficulty,
                      stats: cfg.localStats,
                    },
                    {
                      id: 'ally_setter',
                      name: setterName,
                      characterId: setterChar,
                      team: 'left',
                      slotIndex: 1,
                      role: 'setter',
                      isAi: true,
                      aiDifficulty: 'medium',
                    },
                    {
                      id: 'training_partner',
                      name: 'Ren (Treino)',
                      characterId: 'ren',
                      team: 'right',
                      slotIndex: 0,
                      role: 'attacker',
                      isAi: true,
                      aiDifficulty: 'easy',
                    },
                  ]
                : cfg.mode === '1v1'
                  ? [
                      {
                        id: cfg.localPlayerId,
                        name: cfg.localPlayerName,
                        characterId: cfg.localCharacterId,
                        team: 'left',
                        slotIndex: 0,
                        role: 'attacker',
                        isAi: false,
                        aiDifficulty: cfg.aiDifficulty,
                        stats: cfg.localStats,
                      },
                      {
                        id: 'opp_1',
                        name: oppName,
                        characterId: oppChar,
                        team: 'right',
                        slotIndex: 0,
                        role: 'attacker',
                        isAi: true,
                        aiDifficulty: cfg.aiDifficulty,
                        stats: oppStats,
                      },
                    ]
                  : [
                      {
                        id: cfg.localPlayerId,
                        name: cfg.localPlayerName,
                        characterId: cfg.localCharacterId,
                        team: 'left',
                        slotIndex: 0,
                        role: 'attacker',
                        isAi: false,
                        aiDifficulty: cfg.aiDifficulty,
                        stats: cfg.localStats,
                      },
                      {
                        id: 'ally_setter',
                        name: setterName,
                        characterId: setterChar,
                        team: 'left',
                        slotIndex: 1,
                        role: 'setter',
                        isAi: true,
                        aiDifficulty: cfg.aiDifficulty,
                      },
                      {
                        id: 'opp_1',
                        name: oppName,
                        characterId: oppChar,
                        team: 'right',
                        slotIndex: 0,
                        role: 'attacker',
                        isAi: true,
                        aiDifficulty: cfg.aiDifficulty,
                        stats: oppStats,
                      },
                      {
                        id: 'opp_2',
                        name: oppPartnerName,
                        characterId: oppPartnerChar,
                        team: 'right',
                        slotIndex: 1,
                        role: 'setter',
                        isAi: true,
                        aiDifficulty: cfg.aiDifficulty,
                      },
                    ];

      // Na tela de título, todos jogam como IA em exibição viva 2v2
      if (screenStateRef.current === 'title' && roster.length > 0) {
        roster[0].isAi = true;
      }

      const resolvedIs1v1 =
        cfg.isOnline && cfg.room
          ? (cfg.room.is1v1Mode ?? cfg.room.mode === '1v1')
          : cfg.mode === '1v1';

      localWorld = new VolleyballRapierWorld({
        mode: cfg.mode,
        is1v1Mode: resolvedIs1v1,
        arenaId: cfg.arenaId,
        targetPoints: cfg.targetPoints,
        players: roster,
      });
      simAccumulator = 0;
      pendingReplayDelay = -1;
      replayManager.clearBuffer();
      emitReplayMeta(true);
      // Gera snapshot inicial imediato para posicionar heróis e bola na arena selecionada
      currentSnapshot = localWorld.collectSnapshot();
      prevSimPhase = currentSnapshot.phase;
    };

    startLocalSimFnRef.current = () => {
      guestPred.initialized = false;
      guestPred.lastReconciledTick = -1;
      // Para exclusivamente a música de fundo (bgmSource.Stop()) ao iniciar a simulação da partida
      if (screenStateRef.current === 'playing' || screenStateRef.current === 'guide') {
        const bgmAudioSource = customSoundtrackManager.bgmAudioSource;
        if (bgmAudioSource != null && bgmAudioSource.isPlaying) {
          bgmAudioSource.Stop();
        }
      } else {
        customSoundtrackManager.stopCrowd();
      }
      gameFeel.resetMatchFeel();
      pendingReplayDelay = -1;
      replayManager.clearBuffer();
      emitReplayMeta(true);
      void initLocalSimulation();
    };
    void initLocalSimulation();

    // Gerenciamento Unificado de Inputs via InputManager (Teclado + Mouse LMB/RMB + Touch)
    const inputManager = globalInputManager;
    inputManager.reset();

    const dispatchHotkeys = (trigger: ReturnType<InputManager['handleKeyDown']>) => {
      if (trigger.pause && (screenStateRef.current === 'playing' || screenStateRef.current === 'paused')) {
        callbacksRef.current.onTogglePause();
        return;
      }
      if (screenStateRef.current === 'playing') {
        if (trigger.serveFloat) callbacksRef.current.onQuickControlHotkey?.({ serveType: 'float' });
        if (trigger.serveUnderhand) callbacksRef.current.onQuickControlHotkey?.({ serveType: 'underhand' });
        if (trigger.serveJump) callbacksRef.current.onQuickControlHotkey?.({ serveType: 'jump_serve' });
        if (trigger.toggleFootMode) callbacksRef.current.onQuickControlHotkey?.({ toggleFootMode: true });
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      // TRAVA 4 (Verificação de Input Fantasma): Bloqueia inputs de movimentação se o Menu Inicial estiver aberto
      if (screenStateRef.current !== 'playing' && screenStateRef.current !== 'paused') {
        inputManager.reset();
        return;
      }
      if (
        replayManager.isPlaying() &&
        screenStateRef.current === 'playing' &&
        (e.code === 'Space' || e.code === 'Enter')
      ) {
        e.preventDefault();
        replayControlRef?.current?.skip();
        return;
      }
      const trigger = inputManager.handleKeyDown(e.code, keyBindingsRef.current, performance.now());
      dispatchHotkeys(trigger);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (screenStateRef.current !== 'playing') {
        inputManager.reset();
        return;
      }
      inputManager.handleKeyUp(e.code, performance.now());
    };

    const onMouseDown = (e: MouseEvent) => {
      if (screenStateRef.current !== 'playing') return;
      if (e.target !== renderer.domElement) return;
      soundEngine.unlock();
      const trigger = inputManager.handleMouseDown(e.button, keyBindingsRef.current, performance.now());
      dispatchHotkeys(trigger);
      const mouseCode = mouseButtonToCode(e.button);
      if (mouseCode && matchesActionKey(keyBindingsRef.current, 'spike', mouseCode)) {
        const localP = currentSnapshot?.players.find((pl) => pl.id === matchConfigRef.current.localPlayerId);
        if (localP && (localP.y > 0.25 || guestPred.y > 0.25)) {
          playerRigs.get(localP.id)?.animator.OnSpike();
        }
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      inputManager.handleMouseUp(e.button, performance.now());
    };

    const _raycaster = new THREE.Raycaster();
    const _pointerNdc = new THREE.Vector2();
    const _playPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const _playHit = new THREE.Vector3();
    const _courtPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const _courtHit = new THREE.Vector3();

    const onMouseMove = (e: MouseEvent) => {
      if (screenStateRef.current !== 'playing') return;
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      _pointerNdc.set(ndcX, ndcY);
      _raycaster.setFromCamera(_pointerNdc, camera);

      // ScreenToWorldPoint exato no plano 2D do jogo (Z = 0) com fallback no chão da quadra (Y = 0)
      const hitPlay = _raycaster.ray.intersectPlane(_playPlane, _playHit);
      let rawWorldX = ndcX * COURT.HALF_WIDTH;
      let rawWorldY = 0.1;

      if (hitPlay && _playHit.y > 0.16) {
        rawWorldX = _playHit.x;
        rawWorldY = THREE.MathUtils.clamp(_playHit.y, 0.12, 5.2);
      } else {
        const hitFloor = _raycaster.ray.intersectPlane(_courtPlane, _courtHit);
        if (hitFloor) {
          rawWorldX = _courtHit.x;
          rawWorldY = 0.08;
        }
      }

      const localP = currentSnapshot?.players.find((pl) => pl.id === matchConfigRef.current.localPlayerId);
      const isRightSide = localP?.team === 'right';
      const targetX = isRightSide
        ? THREE.MathUtils.clamp(rawWorldX, -COURT.HALF_WIDTH - 1.2, -0.55)
        : THREE.MathUtils.clamp(rawWorldX, 0.55, COURT.HALF_WIDTH + 1.2);
      inputManager.setMouseWorldPos(targetX, rawWorldY);

      const aimRatio = isRightSide
        ? THREE.MathUtils.clamp((Math.abs(targetX) - 0.55) / (COURT.HALF_WIDTH - 0.55), 0, 1)
        : THREE.MathUtils.clamp((targetX - 0.55) / (COURT.HALF_WIDTH - 0.55), 0, 1);
      inputManager.setMouseAimRatio(aimRatio);

      if (!keyBindingsRef.current.mouseSteerEnabled) {
        inputManager.setMouseSteerDirection(0);
        return;
      }
      if (!localP) return;
      const curLocalX = guestPred.initialized ? guestPred.x : localP.x;
      const worldTargetX = isRightSide
        ? Math.max(0.6, Math.min(COURT.HALF_WIDTH + 0.8, rawWorldX))
        : Math.max(-COURT.HALF_WIDTH - 0.8, Math.min(-0.6, rawWorldX));
      const diffX = worldTargetX - curLocalX;
      inputManager.setMouseSteerDirection(Math.abs(diffX) > 0.25 ? Math.sign(diffX) * Math.min(1, Math.abs(diffX)) : 0);
    };

    const onContextMenu = (e: MouseEvent) => {
      if (e.target === renderer.domElement) e.preventDefault();
    };

    const clearInputs = () => {
      inputManager.reset();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('blur', clearInputs);
    document.addEventListener('visibilitychange', clearInputs);

    // ResizeObserver para manter proporção responsiva e repintar imediatamente após redimensionamento
    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      if (w <= 0 || h <= 0) return;
      const aspect = w / h;
      camera.aspect = aspect;
      camera.fov = computeFov(aspect);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.render(scene, camera);
    });
    resizeObserver.observe(container);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Scratch objects (Zero GC no loop)
    const _ballQuat = new THREE.Quaternion();
    const _activePos = { x: -4.2, y: 0, z: 0 };
    const _ballPos = { x: 0, y: 1.5, z: 0 };
    const _ballVel = { x: 0, y: 0, z: 0 };

    let lastTime = performance.now();
    let elapsed = 0;
    let prevLocalSpeed = 0;
    let prevLocalVx = 0;
    let lastReportedScoreKey = '';
    let lastReportedFeedKey = '';
    let finishedDispatched = false;
    let onlineInputTimer = 0;
    let lastSentMoveX = 0;
    let lastSentMoveZ = 0;
    let onlineHostStateTimer = 0;
    let hostPendingEvents: MatchEvent[] = [];
    let onlineWatchdogTimer = 0;
    let lastOnlineStateSignature = '';
    let frameId = 0;
    let disposed = false;

    const handleEvents = (events: MatchEvent[], isShowcase: boolean) => {
      const cfg = matchConfigRef.current;
      const isOnlineGuest = Boolean(
        cfg.isOnline && !(cfg.room && cfg.room.hostId === cfg.localPlayerId),
      );

      for (const ev of events) {
        const actor = ev.playerId
          ? currentSnapshot?.players.find((p) => p.id === ev.playerId)
          : undefined;
        const actorRig = ev.playerId ? playerRigs.get(ev.playerId) : undefined;
        if (actorRig) {
          if (ev.type === 'serve') {
            actorRig.animator.OnServe(Boolean(ev.isForcedAttack) || (ev.power ?? 0) >= 0.88);
          } else if (ev.type === 'receive') {
            actorRig.animator.OnReceive();
          } else if (ev.type === 'set') {
            actorRig.animator.OnSet();
          } else if (ev.type === 'spike') {
            actorRig.animator.OnSpike();
          } else if (ev.type === 'block') {
            actorRig.animator.OnBlock();
          }
        }

        if (ev.type === 'whistle') {
          if (!isShowcase) {
            soundEngine.playWhistle();
          }
        } else if (ev.type === 'jump') {
          const skipLocalGuestDup =
            isOnlineGuest &&
            ev.playerId === cfg.localPlayerId &&
            guestPred.localJumpFxCooldown > 0;
          if (!skipLocalGuestDup) {
            vfx.spawnBurst(ev.x, 0.1, ev.z, 5, 0xf8fafc, 2.8, 0.7);
            if (!isShowcase) {
              soundEngine.playJump();
              gameFeel.triggerJump(actor?.characterId ?? 'akira', true);
            }
          }
        } else if (ev.type === 'dive') {
          vfx.spawnBurst(ev.x, 0.25, ev.z, 10, 0xfde68a, 4.6, 0.9);
          if (!isShowcase) {
            gameFeel.triggerSandDive();
          }
        } else if (ev.type === 'set') {
          vfx.setShadowTrailActive(false);
          vfx.spawnBurst(ev.x, ev.y, ev.z, 10, 0x38bdf8, 3.8, 0.75);
          if (!isShowcase) {
            gameFeel.triggerSet();
          }
        } else if (ev.type === 'serve') {
          const isForcedServe = Boolean(ev.isForcedAttack) || (ev.power ?? 0) >= 0.88;
          if (isForcedServe) {
            const dirX = ev.team === 'right' ? -1 : 1;
            vfx.TriggerShadowExplosion(ev.x, ev.y, ev.z, dirX, ev.power ?? 0.96);
            if (!isShowcase) {
              gameFeel.triggerShadowExplosion(ev.power ?? 0.96);
            }
          } else {
            vfx.setShadowTrailActive(false);
            vfx.spawnBurst(ev.x, ev.y, ev.z, 12, 0xfbbf24, 4.8, 0.9);
            if (!isShowcase) {
              gameFeel.triggerImpact(ev.power ?? 0.72, {
                isPerfect: false,
                characterId: actor?.characterId,
              });
            }
          }
        } else if (ev.type === 'receive') {
          vfx.setShadowTrailActive(false);
          vfx.spawnBurst(ev.x, ev.y, ev.z, ev.isPerfect ? 12 : 6, ev.isPerfect ? 0xfacc15 : 0xf8fafc, 4.0, 0.8);
          if (!isShowcase) {
            gameFeel.triggerBump(ev.power ?? 0.45, ev.isPerfect);
          }
        } else if (ev.type === 'spike' || ev.type === 'block') {
          const isForcedSpike =
            ev.type === 'spike' &&
            (Boolean(ev.isForcedAttack) ||
              Boolean(ev.isPerfect) ||
              (ev.power ?? 0) >= 0.88 ||
              Boolean(ev.ultimateType));
          if (isForcedSpike) {
            const dirX = ev.team === 'right' ? -1 : 1;
            vfx.TriggerShadowExplosion(ev.x, ev.y, ev.z, dirX, ev.power ?? 1.05);
            if (!isShowcase) {
              replayManager.markHighlight(ev.ultimateType ? 'super_attack' : 'perfect_spike');
              gameFeel.triggerShadowExplosion(ev.power ?? 1.05);
              if (actor?.characterId) {
                soundEngine.playAnimeVoice('spike', actor.characterId);
              }
            }
          } else {
            if (ev.type === 'block') {
              vfx.setShadowTrailActive(false);
            }
            vfx.triggerSpikeShockwave(ev.x, ev.y, ev.z, ev.ultimateType, ev.power ?? 1);
            if (!isShowcase && ev.type === 'spike' && ev.isPerfect) {
              replayManager.markHighlight('perfect_spike');
            }
            if (!isShowcase) {
              gameFeel.triggerImpact(ev.power ?? 1, {
                isPerfect: ev.isPerfect,
                isFoot: ev.callout === 'SHARK ATTACK!',
                characterId: actor?.characterId,
                hitstopSec: ev.isPerfect ? PHYSICS.HITSTOP_PERFECT_SPIKE : undefined,
              });
            }
          }
        } else if (ev.type === 'guard_break') {
          vfx.setShadowTrailActive(false);
          vfx.spawnBurst(ev.x, ev.y, ev.z, 22, 0xef4444, 6.4, 1.25);
          if (!isShowcase) {
            gameFeel.triggerGuardBreak();
          }
        } else if (ev.type === 'launcher') {
          vfx.setShadowTrailActive(false);
          vfx.spawnBurst(ev.x, ev.y, ev.z, 8, 0x34d399, 3.6, 0.75);
        } else if (ev.type === 'bounce') {
          vfx.setShadowTrailActive(false);
          vfx.spawnBurst(ev.x, 0.1, ev.z, 4, 0xfde047, 2.5, 0.6);
          if (!isShowcase) soundEngine.playCourtFloorSlam(0.65);
        } else if (ev.type === 'ultimate') {
          vfx.spawnBurst(ev.x, ev.y, ev.z, 22, 0xf59e0b, 6.5, 1.25);
          if (!isShowcase) {
            replayManager.markHighlight('super_attack');
            soundEngine.playUltimate();
          }
        } else if (ev.type === 'net' || ev.type === 'fault') {
          vfx.setShadowTrailActive(false);
          vfx.spawnBurst(ev.x, ev.y, ev.z, 16, 0xef4444, 5.2, 1.0);
          if (!isShowcase) soundEngine.playWhistle();
        } else if (ev.type === 'point') {
          vfx.setShadowTrailActive(false);
          vfx.spawnBurst(ev.x, 0.3, ev.z, 18, 0xf97316, 6.0, 1.1);
          if (!isShowcase) {
            gameFeel.triggerCourtFloorSlam(1.05);
            soundEngine.playWhistle();
            const scorerChar = currentSnapshot?.players.find((p) => p.team === ev.scoringTeam)?.characterId;
            gameFeel.triggerPointScored(scorerChar, gameFeel.getRallyDurationSec() > 5.0);
            const localP = currentSnapshot?.players.find(
              (p) => p.id === matchConfigRef.current.localPlayerId,
            );
            if (localP && ev.scoringTeam === localP.team) {
              const calloutUpper = (ev.callout || '').toUpperCase();
              const reason: 'ace' | 'block' | 'spike' = calloutUpper.includes('ACE')
                ? 'ace'
                : calloutUpper.includes('BLOQUEIO') || calloutUpper.includes('BLOCK')
                  ? 'block'
                  : 'spike';
              callbacksRef.current.onSpecialPointScored?.(reason);
            }
            pendingReplayDelay = -1;
          }
        } else if (ev.type === 'victory') {
          vfx.setShadowTrailActive(false);
          if (!isShowcase) {
            const localPlayer = currentSnapshot?.players.find(
              (p) => p.id === matchConfigRef.current.localPlayerId,
            );
            const won = localPlayer ? localPlayer.team === ev.scoringTeam : ev.scoringTeam === 'left';
            if (won) soundEngine.playVictory();
            else soundEngine.playDefeat();
          }
        }

        if (!isShowcase && ev.callout) {
          const localP = currentSnapshot?.players.find((p) => p.id === matchConfigRef.current.localPlayerId);
          const isDanger =
            ev.type === 'guard_break' ||
            ev.type === 'fault' ||
            ev.type === 'net' ||
            ev.callout === 'ESPIRROU!' ||
            ev.callout === 'BOLA FORA!' ||
            ev.callout === 'ISOLOU!' ||
            ev.callout.includes('FALTA');
          const tone: 'perfect' | 'danger' | 'info' = isDanger
            ? 'danger'
            : ev.isPerfect ||
                ev.callout === 'SHARK ATTACK!' ||
                ev.callout === 'BOLA DENTRO!' ||
                ev.callout.includes('SUPER ATTACK')
              ? 'perfect'
              : 'info';
          const isTrainingMachine =
            matchConfigRef.current.mode === 'training_spike' ||
            matchConfigRef.current.mode === 'training_receive';
          const waitingHumanServe = Boolean(
            currentSnapshot &&
              currentSnapshot.phase === 'serve_wait' &&
              currentSnapshot.serveWhistleBlown &&
              currentSnapshot.servingTeam === localP?.team &&
              !isTrainingMachine &&
              !localP?.isAi,
          );
          callbacksRef.current.onMatchFeedUpdate?.({
            trainingStats: currentSnapshot?.trainingStats,
            stunned: (localP?.stunTimer ?? 0) > 0,
            waitingHumanServe,
            callout: { text: ev.callout, tone },
          });
        }
      }
    };

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync && gl.deleteSync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 16);
        }
      };
      frameId = window.setTimeout(poll, 4);
    }

    let lastSimTime = performance.now();
    let localLatchedInput: PlayerInputState | undefined = undefined;

    const dispatchSnapshotUiUpdates = (
      snap: MatchSnapshot,
      state: GameScreenState,
      cfg: MatchConfig,
    ) => {
      if (state !== 'playing' && !(state === 'guide' && cfg.isOnline)) return;
      const ball = snap.ball;
      const key = `${snap.score.left}-${snap.score.right}-${ball.touchesLeft}-${ball.touchesRight}-${snap.phase}`;
      if (key !== lastReportedScoreKey) {
        lastReportedScoreKey = key;
        callbacksRef.current.onScoreUpdate(
          snap.score,
          { left: ball.touchesLeft, right: ball.touchesRight },
          snap.phase,
        );
      }

      const localP = snap.players.find((pl) => pl.id === cfg.localPlayerId);
      const isStunned = (localP?.stunTimer ?? 0) > 0;
      const isTrainingMachine = cfg.mode === 'training_spike' || cfg.mode === 'training_receive';
      const waitingHumanServe = Boolean(
        snap.phase === 'serve_wait' &&
          snap.serveWhistleBlown &&
          snap.servingTeam === localP?.team &&
          !isTrainingMachine &&
          !localP?.isAi,
      );
      const ts = snap.trainingStats;
      const feedKey = `${isStunned ? 1 : 0}-${waitingHumanServe ? 1 : 0}-${ts?.attempts ?? 0}-${ts?.perfects ?? 0}-${ts?.streak ?? 0}`;
      if (feedKey !== lastReportedFeedKey) {
        lastReportedFeedKey = feedKey;
        callbacksRef.current.onMatchFeedUpdate?.({
          trainingStats: ts,
          stunned: isStunned,
          waitingHumanServe,
        });
      }

      if (snap.phase === 'finished' && !finishedDispatched) {
        finishedDispatched = true;
        callbacksRef.current.onMatchEnd(snap);
      } else if (snap.phase !== 'finished') {
        finishedDispatched = false;
      }
    };

    const advanceGameplaySimulation = (now: number): {
      inputState: PlayerInputState;
      replayFrameActive: boolean;
    } => {
      const rawSimDt = (now - lastSimTime) / 1000;
      lastSimTime = now;
      const simDt =
        Number.isFinite(rawSimDt) && rawSimDt >= 0 ? Math.min(rawSimDt, 0.2) : PHYSICS.FIXED_DT;

      const state = screenStateRef.current;
      const cfg = matchConfigRef.current;
      const isShowcase = state === 'title' || state === 'menu' || state === 'lobby';
      const isPaused = state !== 'playing' && (currentSnapshot !== null || state !== 'guide');

      if (state !== 'playing') {
        inputManager.reset();
        localLatchedInput = undefined;
        touchBridgeRef.current.moveX = 0;
        touchBridgeRef.current.moveZ = 0;
        touchBridgeRef.current.moveLeftHeld = false;
        touchBridgeRef.current.moveRightHeld = false;
      }

      const localTeamSide =
        currentSnapshot?.players.find((pl) => pl.id === cfg.localPlayerId)?.team ?? 'left';
      const unified = inputManager.consumeFrameInput(
        keyBindingsRef.current,
        touchBridgeRef.current,
        now,
        simDt,
        localTeamSide,
      );
      const frameInput: PlayerInputState = {
        ...unified,
        footMode: Boolean(cfg.footMode),
        serveType: unified.serveChargeStage ?? cfg.serveType ?? 'underhand',
      };
      localLatchedInput = mergeLatchedPlayerInput(localLatchedInput, frameInput);
      const inputState = localLatchedInput;

      let replayFrameActive = false;

      if (!isPaused) {
        const isOnlineHost = Boolean(
          cfg.isOnline && cfg.room && cfg.room.hostId === cfg.localPlayerId,
        );

        if (cfg.isOnline && !isOnlineHost && state === 'playing') {
          // Convidado P2P (Guest):
          // 1) Aplica Previsão Local Imediata (0ms) no próprio personagem antes mesmo do pacote ir e voltar da rede
          const snapForPred = latestOnlineSnapRef.current;
          const serverLocalP = snapForPred?.players.find((pl) => pl.id === cfg.localPlayerId);
          if (serverLocalP && snapForPred) {
            if (!guestPred.initialized) {
              guestPred.initialized = true;
              guestPred.x = serverLocalP.x;
              guestPred.y = serverLocalP.y;
              guestPred.z = serverLocalP.z;
              guestPred.vx = serverLocalP.vx;
              guestPred.vy = serverLocalP.vy;
              guestPred.vz = serverLocalP.vz;
              guestPred.facingX = serverLocalP.facingX;
              guestPred.anim = serverLocalP.anim;
              guestPred.actionState = serverLocalP.actionState;
            }

            guestPred.localJumpFxCooldown = Math.max(0, guestPred.localJumpFxCooldown - simDt);

            if (snapForPred.phase === 'point_freeze' || snapForPred.phase === 'finished') {
              guestPred.x = serverLocalP.x;
              guestPred.y = serverLocalP.y;
              guestPred.z = serverLocalP.z;
              guestPred.vx = serverLocalP.vx;
              guestPred.vy = serverLocalP.vy;
              guestPred.anim = serverLocalP.anim;
              guestPred.actionState = serverLocalP.actionState;
              guestPred.actionTimer = 0;
            } else if ((serverLocalP.stunTimer ?? 0) <= 0) {
              const speedStat = cfg.localStats?.speed ?? serverLocalP.stats?.speed ?? 75;
              const baseSpd = 6.8 + (speedStat / 100) * 1.8;
              const moveSpd = inputState.sprint ? baseSpd * 1.28 : baseSpd;

              if (guestPred.actionState !== 'slide_dive' || guestPred.actionTimer <= 0) {
                const targetVx = inputState.moveX * moveSpd;
                const accel = Math.abs(inputState.moveX) > 0.05 ? 30 : 26;
                guestPred.vx = THREE.MathUtils.lerp(
                  guestPred.vx,
                  targetVx,
                  Math.min(1, accel * simDt),
                );
              }

              guestPred.x += guestPred.vx * simDt;

              const isMyServeWait =
                snapForPred.phase === 'serve_wait' && snapForPred.servingTeam === serverLocalP.team;
              if (serverLocalP.team === 'right') {
                const maxRight = isMyServeWait ? COURT.HALF_WIDTH + 2.2 : COURT.HALF_WIDTH + 1.2;
                guestPred.x = THREE.MathUtils.clamp(guestPred.x, 0.55, maxRight);
              } else {
                const minLeft = isMyServeWait ? -COURT.HALF_WIDTH - 2.2 : -COURT.HALF_WIDTH - 1.2;
                guestPred.x = THREE.MathUtils.clamp(guestPred.x, minLeft, -0.55);
              }

              if (Math.abs(inputState.moveX) > 0.1) {
                guestPred.facingX = Math.sign(inputState.moveX);
              } else {
                guestPred.facingX = serverLocalP.team === 'right' ? -1 : 1;
              }

              // Pulo imediato (0ms)
              if (inputState.jump && guestPred.y <= 0.06) {
                const jumpStat = cfg.localStats?.jump ?? serverLocalP.stats?.jump ?? 75;
                guestPred.vy = 8.4 + (jumpStat / 100) * 1.6;
                guestPred.y = 0.07;
                guestPred.anim = 'jump';
                guestPred.actionState = 'jump';
                guestPred.actionTimer = 0.34;
                if (guestPred.localJumpFxCooldown <= 0) {
                  guestPred.localJumpFxCooldown = 0.38;
                  vfx.spawnBurst(guestPred.x, 0.1, guestPred.z, 5, 0xf8fafc, 2.8, 0.7);
                  soundEngine.playJump();
                  gameFeel.triggerJump(serverLocalP.characterId, true);
                }
              }

              if (guestPred.y > 0 || guestPred.vy > 0) {
                const grav = Math.abs(PHYSICS.GRAVITY) || 22;
                guestPred.vy -= grav * simDt;
                guestPred.y += guestPred.vy * simDt;
                if (guestPred.y <= 0) {
                  guestPred.y = 0;
                  guestPred.vy = 0;
                }
              }

              // Ações imediatas (0ms) nos botões de ataque, levantamento, recepção e mergulho
              const localRigEntry = playerRigs.get(cfg.localPlayerId);
              if (inputState.spike) {
                guestPred.anim = 'spike';
                guestPred.actionState = 'spike';
                guestPred.actionTimer = 0.32;
                localRigEntry?.animator.OnSpike();
              } else if (inputState.set) {
                guestPred.anim = 'set';
                guestPred.actionState = 'set';
                guestPred.actionTimer = 0.28;
                localRigEntry?.animator.OnSet();
              } else if (inputState.receive) {
                guestPred.anim = 'bump';
                guestPred.actionState = 'bump';
                guestPred.actionTimer = 0.28;
                localRigEntry?.animator.OnReceive();
              } else if (inputState.dive) {
                guestPred.anim = 'dive';
                guestPred.actionState = 'slide_dive';
                guestPred.actionTimer = 0.42;
                const diveDir =
                  Math.abs(inputState.moveX) > 0.1
                    ? Math.sign(inputState.moveX)
                    : serverLocalP.team === 'right'
                      ? -1
                      : 1;
                guestPred.vx = diveDir * 10.5;
              }

              guestPred.actionTimer = Math.max(0, guestPred.actionTimer - simDt);
              if (guestPred.actionTimer <= 0) {
                if (guestPred.y > 0.08) {
                  guestPred.anim = 'jump';
                  guestPred.actionState = 'jump';
                } else if (Math.abs(guestPred.vx) > 0.45) {
                  guestPred.anim = 'run';
                  guestPred.actionState = 'run';
                } else {
                  guestPred.anim = 'idle';
                  guestPred.actionState = 'idle';
                }
              }
            }

            // Reconciliação suave quando chega novo pacote autoritativo do Host
            if (snapForPred.tick !== guestPred.lastReconciledTick) {
              guestPred.lastReconciledTick = snapForPred.tick;
              const errX = serverLocalP.x - guestPred.x;
              const errY = serverLocalP.y - guestPred.y;
              if (Math.abs(errX) > 3.2) {
                guestPred.x = serverLocalP.x;
                guestPred.y = serverLocalP.y;
                guestPred.vx = serverLocalP.vx;
                guestPred.vy = serverLocalP.vy;
              } else {
                const isIdleInput = Math.abs(inputState.moveX) < 0.05 && Math.abs(serverLocalP.vx) < 0.25;
                guestPred.x += errX * (isIdleInput ? 0.3 : 0.12);
                if (guestPred.y <= 0.02 && serverLocalP.y <= 0.02) {
                  guestPred.y = 0;
                } else if (Math.abs(errY) > 1.4 && guestPred.actionTimer <= 0) {
                  guestPred.y = THREE.MathUtils.lerp(guestPred.y, serverLocalP.y, 0.35);
                }
              }
            }
          }

          // 2) Envia inputs ao Host em 0ms sempre que qualquer botão ou direção mudar (e a 45 Hz contínuo)
          onlineInputTimer += simDt;
          const moveChanged =
            Math.abs(inputState.moveX - lastSentMoveX) > 0.05 ||
            Math.abs(inputState.moveZ - lastSentMoveZ) > 0.05;
          const hasActionEdge = Boolean(
            moveChanged ||
              inputState.jump ||
              inputState.spike ||
              inputState.set ||
              inputState.preparingServe ||
              inputState.serveReleaseChargeTime !== undefined ||
              (inputState.hybridCommand !== undefined && inputState.hybridCommand !== 'none') ||
              inputState.receive ||
              inputState.dive ||
              inputState.ultimate ||
              inputState.serveNormalTrigger ||
              inputState.serveUnderhandTrigger ||
              inputState.serveJumpTrigger,
          );
          if (onlineInputTimer >= 0.022 || hasActionEdge) {
            onlineInputTimer = 0;
            lastSentMoveX = inputState.moveX;
            lastSentMoveZ = inputState.moveZ;
            networkClient.sendInput(
              {
                moveX: Number(inputState.moveX.toFixed(3)),
                moveZ: Number(inputState.moveZ.toFixed(3)),
                sprint: inputState.sprint,
                jump: inputState.jump,
                jumpHeld: inputState.jumpHeld,
                spike: inputState.spike,
                spikeHeld: inputState.spikeHeld,
                set: inputState.set,
                preparingServe: inputState.preparingServe,
                serveChargeTime: inputState.serveChargeTime,
                serveReleaseChargeTime: inputState.serveReleaseChargeTime,
                serveChargeStage: inputState.serveChargeStage,
                hybridCommand: inputState.hybridCommand,
                receive: inputState.receive,
                dive: inputState.dive,
                ultimate: inputState.ultimate,
                footMode: inputState.footMode,
                serveType: inputState.serveType,
                mouseAimRatio: inputState.mouseAimRatio,
                mouseWorldPos: inputState.mouseWorldPos,
              },
              cfg.localPlayerId,
            );
            localLatchedInput = clearConsumedEdgeTriggers(inputState);
          }

          if (pendingNetworkSetsRef.current.length > 0) {
            const netSets = pendingNetworkSetsRef.current.splice(
              0,
              pendingNetworkSetsRef.current.length,
            );
            for (const netSet of netSets) {
              const setterRig = playerRigs.get(netSet.playerId);
              if (setterRig) {
                setterRig.animator.OnSet();
              }
              vfx.setShadowTrailActive(false);
              vfx.spawnBurst(netSet.x, netSet.y, netSet.z, 10, 0x38bdf8, 3.8, 0.75);
              gameFeel.triggerSet();
            }
          }

          if (latestOnlineSnapRef.current) {
            currentSnapshot = latestOnlineSnapRef.current;
            const onlineSig = `${currentSnapshot.phase}_${currentSnapshot.score.left}_${currentSnapshot.score.right}_${currentSnapshot.ball.touchesLeft}_${currentSnapshot.ball.touchesRight}_${currentSnapshot.serveWhistleBlown ? 1 : 0}`;
            if (onlineSig !== lastOnlineStateSignature || currentSnapshot.events.length > 0) {
              lastOnlineStateSignature = onlineSig;
              onlineWatchdogTimer = 0;
            } else {
              onlineWatchdogTimer += simDt;
              if (onlineWatchdogTimer >= 6.0) {
                onlineWatchdogTimer = 0;
                networkClient.requestSyncState('CLIENT_WATCHDOG_TIMEOUT');
              }
            }

            if (currentSnapshot.tick !== processedEventsTickRef.current) {
              processedEventsTickRef.current = currentSnapshot.tick;
              handleEvents(currentSnapshot.events, false);
            }
            dispatchSnapshotUiUpdates(currentSnapshot, state, cfg);
          } else {
            currentSnapshot = null;
          }
        } else if ((!cfg.isOnline || isOnlineHost) && rapierInitialized && localWorld) {
          if (replayManager.isPlaying()) {
            let replayFinished = false;
            try {
              const stepRes = replayManager.advancePlayback(simDt);
              replayFinished = stepRes.finished;
              if (stepRes.frame) {
                replayFrameActive = true;
                const rf = stepRes.frame;
                builtArena.ballMesh.position.set(rf.ball.x, rf.ball.y, rf.ball.z);
                _ballQuat.set(rf.ball.rx, rf.ball.ry, rf.ball.rz, rf.ball.rw);
                builtArena.ballMesh.quaternion.copy(_ballQuat);
                builtArena.ballShadow.position.set(rf.ball.x, 0.014, rf.ball.z);
                builtArena.ballShadow.scale.setScalar(Math.max(0.38, 1 - rf.ball.y * 0.08));
                builtArena.landingMarker.visible = false;
                builtArena.aimReticle.visible = false;

                let bestDist = Infinity;
                for (const rp of rf.players) {
                  const entry = playerRigs.get(rp.id);
                  if (entry) {
                    entry.rig.root.position.set(rp.x, rp.y, rp.z);
                    entry.animator.syncFromStateMachine({
                      anim: rp.anim,
                      actionState:
                        rp.anim === 'dive'
                          ? 'slide_dive'
                          : rp.anim === 'set'
                            ? 'set'
                            : rp.anim === 'bump'
                              ? 'bump'
                              : rp.anim === 'spike'
                                ? 'spike'
                                : rp.anim === 'block'
                                  ? 'block'
                                  : rp.anim === 'serve'
                                    ? 'serve'
                                    : 'idle',
                      vx: 0,
                      y: rp.y,
                      x: rp.x,
                    });
                    entry.animator.update(simDt * stepRes.speed);
                    updateCharacterRigAnimation(
                      entry.rig,
                      rp.anim,
                      elapsed,
                      rp.animTimer,
                      rp.y,
                      rp.facingX,
                      rp.facingZ,
                      rp.ultimateActiveTimer > 0 || rp.ultimateCharge >= PHYSICS.ULTIMATE_MAX,
                      simDt * stepRes.speed,
                      entry.animator.getResolvedState(),
                    );
                  }
                  const d =
                    Math.hypot(rp.x - rf.ball.x, rp.z - rf.ball.z) - (rp.y > 0.45 ? 1.2 : 0);
                  if (d < bestDist) {
                    bestDist = d;
                    _activePos.x = rp.x;
                    _activePos.y = rp.y;
                    _activePos.z = rp.z;
                  }
                }
                vfx.update(
                  simDt * stepRes.speed,
                  rf.ball.x,
                  rf.ball.y,
                  rf.ball.z,
                  12,
                  rf.ball.activeUltimate,
                );
                builtArena.updateCrowd?.(elapsed, 1.7);
              }
            } catch {
              replayManager.finishAndClear();
              replayFinished = true;
            } finally {
              if (replayFinished || !replayManager.isPlaying()) {
                replayManager.finishAndClear();
                localWorld.advanceNextServeAfterReplay();
                currentSnapshot = localWorld.collectSnapshot();
                prevSimPhase = currentSnapshot.phase;
                pendingReplayDelay = -1;
                simAccumulator = 0;
                emitReplayMeta(true);
              } else {
                emitReplayMeta(false);
              }
            }
          } else {
            if (state === 'playing') {
              localWorld.setPlayerInput(cfg.localPlayerId, inputState);
              if (isOnlineHost) {
                for (const [remotePlayerId, remoteInp] of latestRemoteInputsRef.current.entries()) {
                  if (remotePlayerId !== cfg.localPlayerId) {
                    localWorld.setPlayerInput(remotePlayerId, remoteInp);
                  }
                }
              }
            }
            const slowScale =
              currentSnapshot?.phase === 'point_freeze' && currentSnapshot.score.winner ? 0.48 : 1;
            simAccumulator += simDt * slowScale;

            let steps = 0;
            while (simAccumulator >= PHYSICS.FIXED_DT && steps < 12) {
              const snap = localWorld.step(PHYSICS.FIXED_DT);
              currentSnapshot = snap;

              // Limpa gatilhos discretos de 1 tick SOMENTE após localWorld.step() consumi-los de fato
              if (steps === 0 && state === 'playing') {
                localLatchedInput = clearConsumedEdgeTriggers(inputState);
                localWorld.setPlayerInput(cfg.localPlayerId, localLatchedInput);
                if (isOnlineHost) {
                  for (const [remotePlayerId, remoteInp] of latestRemoteInputsRef.current.entries()) {
                    if (remotePlayerId !== cfg.localPlayerId) {
                      const cleaned = clearConsumedEdgeTriggers(remoteInp);
                      latestRemoteInputsRef.current.set(remotePlayerId, cleaned);
                      localWorld.setPlayerInput(remotePlayerId, cleaned);
                    }
                  }
                }
              }

              if (isOnlineHost && snap.events.length > 0) {
                hostPendingEvents.push(...snap.events);
              }

              if (prevSimPhase === 'point_freeze' && snap.phase === 'serve_wait') {
                replayManager.clearBuffer();
                pendingReplayDelay = -1;
              }
              prevSimPhase = snap.phase;

              const shouldRecordFrame =
                !isShowcase &&
                !isOnlineHost &&
                (snap.phase === 'rally' ||
                  (snap.phase === 'serve_wait' &&
                    snap.players.some((pl) => pl.anim === 'serve_toss' || pl.anim === 'serve')));
              if (shouldRecordFrame) {
                replayManager.recordFrame({
                  tick: snap.tick,
                  dt: PHYSICS.FIXED_DT,
                  ball: {
                    x: snap.ball.x,
                    y: snap.ball.y,
                    z: snap.ball.z,
                    rx: snap.ball.rx,
                    ry: snap.ball.ry,
                    rz: snap.ball.rz,
                    rw: snap.ball.rw,
                    activeUltimate: snap.ball.activeUltimate,
                  },
                  players: snap.players.map((pl) => ({
                    id: pl.id,
                    characterId: pl.characterId,
                    team: pl.team,
                    x: pl.x,
                    y: pl.y,
                    z: pl.z,
                    facingX: pl.facingX,
                    facingZ: pl.facingZ,
                    anim: pl.anim,
                    animTimer: pl.animTimer,
                    ultimateCharge: pl.ultimateCharge,
                    ultimateActiveTimer: pl.ultimateActiveTimer,
                  })),
                });
              }

              handleEvents(snap.events, isShowcase);
              simAccumulator -= PHYSICS.FIXED_DT;
              steps += 1;

              if (pendingReplayDelay >= 0) {
                pendingReplayDelay -= PHYSICS.FIXED_DT;
                if (pendingReplayDelay <= 0) {
                  pendingReplayDelay = -1;
                  if (replayManager.beginPlayback({ slowMotion: true })) {
                    emitReplayMeta(true);
                    break;
                  }
                }
              }
            }

            if (currentSnapshot) {
              dispatchSnapshotUiUpdates(currentSnapshot, state, cfg);
            }

            // Host P2P envia pacotes compactos de estado a 45 Hz (~22ms) para reduzir latência percebida do convidado
            if (isOnlineHost && currentSnapshot && state === 'playing') {
              onlineHostStateTimer += simDt;
              if (
                onlineHostStateTimer >= 0.022 ||
                hostPendingEvents.length > 0 ||
                currentSnapshot.phase === 'finished'
              ) {
                onlineHostStateTimer = 0;
                const eventsToSend = hostPendingEvents;
                hostPendingEvents = [];
                networkClient.sendHostStateSnapshot({
                  ...currentSnapshot,
                  events: eventsToSend,
                });
              }
            }
          }
        }
      }

      return { inputState: localLatchedInput ?? inputState, replayFrameActive };
    };

    // Heartbeat dedicado (20ms) para manter a física do Host e a sincronização P2P fluidas
    const simHeartbeatId = window.setInterval(() => {
      if (disposed || screenStateRef.current !== 'playing') return;
      const now = performance.now();
      if (now - lastSimTime >= 18) {
        advanceGameplaySimulation(now);
      }
    }, 20);

    const tick = () => {
      if (disposed) return;

      const now = performance.now();
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Number.isFinite(rawDt) && rawDt >= 0 ? Math.min(rawDt, 0.1) : PHYSICS.FIXED_DT;
      elapsed += dt;

      const state = screenStateRef.current;
      const cfg = matchConfigRef.current;
      const isShowcase = state === 'title' || state === 'menu' || state === 'lobby';
      const isPaused = state !== 'playing' && (currentSnapshot !== null || state !== 'guide');
      const isOnlineGuest = Boolean(
        cfg.isOnline && !(cfg.room && cfg.room.hostId === cfg.localPlayerId),
      );

      const { inputState, replayFrameActive } = advanceGameplaySimulation(now);

      // Sincroniza malhas Three.js com o Snapshot atual (quando não está renderizando frame de replay)
      if (currentSnapshot && !replayFrameActive) {
        const snap = currentSnapshot;
        const ball = snap.ball;

        // Interpolação suave para elementos remotos online
        const lerpAlpha = cfg.isOnline ? 1 - Math.exp(-24 * dt) : 1;
        builtArena.ballMesh.position.x = THREE.MathUtils.lerp(builtArena.ballMesh.position.x, ball.x, lerpAlpha);
        builtArena.ballMesh.position.y = THREE.MathUtils.lerp(builtArena.ballMesh.position.y, ball.y, lerpAlpha);
        builtArena.ballMesh.position.z = THREE.MathUtils.lerp(builtArena.ballMesh.position.z, ball.z, lerpAlpha);
        _ballQuat.set(ball.rx, ball.ry, ball.rz, ball.rw);
        builtArena.ballMesh.quaternion.slerp(_ballQuat, lerpAlpha);

        // Sombra de contato da bola
        builtArena.ballShadow.position.x = builtArena.ballMesh.position.x;
        builtArena.ballShadow.position.z = builtArena.ballMesh.position.z;
        const bShadowScale = Math.max(0.38, 1 - builtArena.ballMesh.position.y * 0.08);
        builtArena.ballShadow.scale.setScalar(bShadowScale);

        // Marcador preditivo parabólico de queda (onde a bola vai atingir o chão)
        const g = Math.abs(PHYSICS.GRAVITY);
        const hAboveFloor = Math.max(0, ball.y - PHYSICS.BALL_RADIUS);
        const timeToGround = (ball.vy + Math.sqrt(ball.vy * ball.vy + 2 * g * hAboveFloor)) / g;
        const clampedT = Math.min(1.2, timeToGround) * 0.92;
        const predX = THREE.MathUtils.clamp(ball.x + ball.vx * clampedT, -COURT.HALF_WIDTH - 1.5, COURT.HALF_WIDTH + 1.5);
        const predZ = THREE.MathUtils.clamp(ball.z + ball.vz * clampedT, -COURT.HALF_DEPTH - 1.5, COURT.HALF_DEPTH + 1.5);
        builtArena.landingMarker.position.set(predX, 0.02, predZ);
        const pulse = 0.85 + Math.sin(elapsed * 10) * 0.15;
        builtArena.landingMarker.scale.setScalar(pulse);
        builtArena.landingMarker.visible = state === 'playing' && snap.phase === 'rally';

        const activeMouseWorld = inputManager.getMouseWorldPos();
        const activeAimRatio = inputManager.getMouseAimRatio();
        if (state === 'playing' && (activeMouseWorld || activeAimRatio !== undefined)) {
          const aimWorldX = activeMouseWorld ? activeMouseWorld.x : 1.25 + (activeAimRatio ?? 0.5) * (COURT.HALF_WIDTH - 1.25);
          const aimWorldY = activeMouseWorld ? Math.max(0.03, activeMouseWorld.y) : 0.03;
          builtArena.aimReticle.position.set(aimWorldX, aimWorldY, 0);
          builtArena.aimReticle.rotation.x = aimWorldY > 0.25 ? 0 : -Math.PI / 2;
          builtArena.aimReticle.scale.setScalar(0.92 + Math.sin(elapsed * 8) * 0.08);
          builtArena.aimReticle.visible = true;
        } else {
          builtArena.aimReticle.visible = false;
        }

        // Remove rigs antigos que não existem mais no snapshot atual (evita duplicatas entre preview/online)
        const activeIds = new Set(snap.players.map((pl) => pl.id));
        for (const [id, entry] of playerRigs.entries()) {
          if (!activeIds.has(id)) {
            scene.remove(entry.rig.root);
            playerRigs.delete(id);
          }
        }

        // Atualiza personagens
        for (const p of snap.players) {
          let entry = playerRigs.get(p.id);
          if (!entry || entry.characterId !== p.characterId || entry.team !== p.team) {
            if (entry) scene.remove(entry.rig.root);
            const rig = buildAnimeCharacter(p.characterId, p.team);
            scene.add(rig.root);
            entry = { rig, characterId: p.characterId, team: p.team, animator: new PlayerAnimatorController() };
            playerRigs.set(p.id, entry);
          }

          const isLocalPlayer = p.id === cfg.localPlayerId;
          const useGuestPrediction = isLocalPlayer && isOnlineGuest && guestPred.initialized && state === 'playing';

          const targetX = useGuestPrediction ? guestPred.x : p.x;
          const targetY = useGuestPrediction ? guestPred.y : p.y;
          const targetZ = useGuestPrediction ? guestPred.z : p.z;
          const targetVx = useGuestPrediction ? guestPred.vx : p.vx;
          const targetFacingX = useGuestPrediction ? guestPred.facingX : p.facingX;
          const targetAnim = useGuestPrediction ? guestPred.anim : p.anim;
          const targetActionState = useGuestPrediction ? guestPred.actionState : p.actionState;

          // Jogador local sempre responde sem atraso de interpolação (1.0); oponente remoto suaviza
          const playerLerpAlpha = isLocalPlayer ? 1 : lerpAlpha;
          entry.rig.root.position.x = THREE.MathUtils.lerp(entry.rig.root.position.x, targetX, playerLerpAlpha);
          entry.rig.root.position.y = THREE.MathUtils.lerp(entry.rig.root.position.y, targetY, playerLerpAlpha);
          entry.rig.root.position.z = THREE.MathUtils.lerp(entry.rig.root.position.z, targetZ, playerLerpAlpha);

          entry.animator.syncFromStateMachine({
            anim: targetAnim,
            actionState: targetActionState,
            vx: targetVx,
            y: targetY,
            x: targetX,
            ballY: ball.y,
          });
          entry.animator.update(dt);

          updateCharacterRigAnimation(
            entry.rig,
            targetAnim,
            elapsed,
            p.animTimer,
            entry.rig.root.position.y,
            targetFacingX,
            p.facingZ,
            p.ultimateActiveTimer > 0 || p.ultimateCharge >= PHYSICS.ULTIMATE_MAX,
            dt,
            entry.animator.getResolvedState(),
          );

          // Atualiza barra Super Attack + timer regressivo de 5.0s + Barra de Força de Saque (Hold to Charge) via DOM refs (zero setState a 60Hz!)
          if (isLocalPlayer) {
            const pct = Math.min(1, p.ultimateCharge / PHYSICS.ULTIMATE_MAX);
            if (ultimateFillRef.current) {
              ultimateFillRef.current.style.transform = `scaleX(${pct})`;
            }
            if (ultimateReadyRef.current) {
              ultimateReadyRef.current.style.opacity = pct >= 1 ? '1' : '0';
            }

            const superRem = p.superAttackTimer ?? p.ultimateActiveTimer ?? 0;
            if (superAttackContainerRef.current) {
              superAttackContainerRef.current.style.display = superRem > 0.01 ? 'block' : 'none';
            }
            if (superRem > 0.01) {
              const remPct = Math.max(0, Math.min(1, superRem / PHYSICS.SUPER_ATTACK_DURATION));
              if (superAttackFillRef.current) {
                superAttackFillRef.current.style.transform = `scaleX(${remPct})`;
              }
              if (superAttackTimerTextRef.current) {
                superAttackTimerTextRef.current.textContent = `${superRem.toFixed(1)}s`;
              }
            }

            // Feedback Visual Minimalista do Saque (visível APENAS na hora do saque local; desaparece imediatamente ao lançar a bola)
            const isTrainingMachine =
              cfg.mode === 'training_spike' || cfg.mode === 'training_receive';
            const isLocalServeTurn =
              snap.phase === 'serve_wait' &&
              snap.serveWhistleBlown &&
              snap.servingTeam === p.team &&
              !isTrainingMachine &&
              !p.isAi;
            const activeServeCharge =
              isLocalServeTurn && inputState.preparingServe ? (inputState.serveChargeTime ?? 0) : 0;
            const maxJumpCharge = inputManager.maxServeChargeTime || 1.5;
            const underhandThreshold = inputManager.timeForUnderhand || 0.3;
            const floatThreshold = inputManager.timeForFloat || 1.0;
            const chargeRatio = Math.max(0, Math.min(1, activeServeCharge / maxJumpCharge));

            if (serveChargeContainerRef?.current) {
              serveChargeContainerRef.current.style.display = isLocalServeTurn ? 'flex' : 'none';
            }
            if (serveChargeFillRef?.current) {
              serveChargeFillRef.current.style.transform = `scaleX(${chargeRatio.toFixed(3)})`;
              if (activeServeCharge <= 0) {
                serveChargeFillRef.current.style.background = '#38BDF8';
              } else if (activeServeCharge <= underhandThreshold) {
                serveChargeFillRef.current.style.background = '#38BDF8';
              } else if (activeServeCharge <= floatThreshold) {
                serveChargeFillRef.current.style.background = '#FACC15';
              } else {
                serveChargeFillRef.current.style.background = 'linear-gradient(90deg, #F97316, #EF4444)';
              }
            }
            if (serveChargeTimerTextRef?.current) {
              serveChargeTimerTextRef.current.textContent =
                activeServeCharge > 0 ? `${activeServeCharge.toFixed(1)}s` : '';
            }
            if (serveChargeStageLabelRef?.current) {
              if (activeServeCharge <= 0) {
                serveChargeStageLabelRef.current.textContent = 'SEGURE PARA SACAR';
                serveChargeStageLabelRef.current.style.color = '#67E8F9';
              } else if (activeServeCharge <= underhandThreshold) {
                serveChargeStageLabelRef.current.textContent = 'POR BAIXO';
                serveChargeStageLabelRef.current.style.color = '#38BDF8';
              } else if (activeServeCharge <= floatThreshold) {
                serveChargeStageLabelRef.current.textContent = 'FLUTUANTE';
                serveChargeStageLabelRef.current.style.color = '#FACC15';
              } else {
                serveChargeStageLabelRef.current.textContent = 'VIAGEM!';
                serveChargeStageLabelRef.current.style.color = '#F97316';
              }
            }

            // Brilho cromático dinâmico na Bola 3D enquanto carrega o saque + Cor da Bola Equipada na Loja Beta
            const ballMat = builtArena.ballMesh.material as THREE.MeshStandardMaterial | THREE.MeshToonMaterial;
            if (ballMat) {
              const equippedBallHex = cfg.equippedBallColor || '#FFFFFF';
              if (equippedBallHex && equippedBallHex !== '#FACC15') {
                ballMat.color.set(equippedBallHex);
              } else {
                ballMat.color.setHex(0xffffff);
              }
            }
            if (ballMat && 'emissive' in ballMat) {
              if (activeServeCharge > 0) {
                const glowHex =
                  activeServeCharge <= underhandThreshold
                    ? 0x38bdf8
                    : activeServeCharge <= floatThreshold
                      ? 0xfacc15
                      : 0xf97316;
                ballMat.emissive.setHex(glowHex);
                ballMat.emissiveIntensity = 0.42 + Math.sin(elapsed * 14) * 0.16;
                if (activeServeCharge > floatThreshold && Math.random() < 0.35) {
                  vfx.spawnBurst(
                    builtArena.ballMesh.position.x,
                    builtArena.ballMesh.position.y,
                    builtArena.ballMesh.position.z,
                    2,
                    0xf97316,
                    2.2,
                    0.5,
                  );
                }
              } else if (ballMat.emissiveIntensity !== 0) {
                ballMat.emissive.setHex(0x000000);
                ballMat.emissiveIntensity = 0;
              }
            }

            // Aplica Skin/Uniforme equipado na Loja Beta ao personagem local 3D
            const outfitId = cfg.equippedOutfitId;
            const [jerseyM, shortsM, accentM] = entry.rig.hitFlashMaterials;
            if (outfitId && outfitId !== 'outfit_default') {
              if (outfitId === 'outfit_neon_cyber') {
                jerseyM?.color.set('#06B6D4');
                shortsM?.color.set('#0F172A');
                accentM?.color.set('#F43F5E');
              } else if (outfitId === 'outfit_samurai') {
                jerseyM?.color.set('#DC2626');
                shortsM?.color.set('#18181B');
                accentM?.color.set('#FACC15');
              } else if (outfitId === 'outfit_selecao_ouro') {
                jerseyM?.color.set('#FACC15');
                shortsM?.color.set('#15803D');
                accentM?.color.set('#1D4ED8');
              } else if (outfitId === 'outfit_fundador_beta') {
                jerseyM?.color.set('#A855F7');
                shortsM?.color.set('#090D16');
                accentM?.color.set('#FDE047');
              } else if (outfitId === 'outfit_cyber_emerald') {
                jerseyM?.color.set('#10B981');
                shortsM?.color.set('#064E3B');
                accentM?.color.set('#A7F3D0');
              } else if (outfitId === 'outfit_imperial_gold') {
                jerseyM?.color.set('#EAB308');
                shortsM?.color.set('#422006');
                accentM?.color.set('#FEF08A');
              }
            } else {
              jerseyM?.color.setHex(0xffffff);
            }
          }
        }

        // Atualiza rastro customizado da Bola Equipada na Loja Beta e VFX em pool
        vfx.setCustomTrailColor(cfg.equippedBallTrailColor ?? cfg.equippedBallColor);
        const ballSpeed = Math.hypot(ball.vx, ball.vy, ball.vz);
        vfx.update(dt, builtArena.ballMesh.position.x, builtArena.ballMesh.position.y, builtArena.ballMesh.position.z, ballSpeed, ball.activeUltimate);
        const crowdExcite = snap.phase === 'point_freeze' || snap.phase === 'finished' ? 1.85 : ball.activeUltimate ? 1.5 : 1.0;
        builtArena.updateCrowd?.(elapsed, crowdExcite);

        // Dispara callback discreto apenas quando o placar/fase/treino/stun mudar
        if (state === 'playing' || (state === 'guide' && cfg.isOnline)) {
          const key = `${snap.score.left}-${snap.score.right}-${ball.touchesLeft}-${ball.touchesRight}-${snap.phase}`;
          if (key !== lastReportedScoreKey) {
            lastReportedScoreKey = key;
            callbacksRef.current.onScoreUpdate(
              snap.score,
              { left: ball.touchesLeft, right: ball.touchesRight },
              snap.phase,
            );
          }

          const localP = snap.players.find((pl) => pl.id === cfg.localPlayerId);
          const isStunned = (localP?.stunTimer ?? 0) > 0;
          const isTrainingMachine = cfg.mode === 'training_spike' || cfg.mode === 'training_receive';
          const waitingHumanServe = Boolean(
            snap.phase === 'serve_wait' &&
              snap.serveWhistleBlown &&
              snap.servingTeam === localP?.team &&
              !isTrainingMachine &&
              !localP?.isAi,
          );
          const ts = snap.trainingStats;
          const feedKey = `${isStunned ? 1 : 0}-${waitingHumanServe ? 1 : 0}-${ts?.attempts ?? 0}-${ts?.perfects ?? 0}-${ts?.streak ?? 0}`;
          if (feedKey !== lastReportedFeedKey) {
            lastReportedFeedKey = feedKey;
            callbacksRef.current.onMatchFeedUpdate?.({
              trainingStats: ts,
              stunned: isStunned,
              waitingHumanServe,
            });
          }

          if (snap.phase === 'finished' && !finishedDispatched) {
            finishedDispatched = true;
            callbacksRef.current.onMatchEnd(snap);
          } else if (snap.phase !== 'finished') {
            finishedDispatched = false;
          }
        }
      }

      // Identifica o jogador ativo para Foco Duplo + Foley de passos + Torcida dinâmica
      let activePlayer = currentSnapshot?.players.find((p) => p.id === cfg.localPlayerId);
      if (!replayFrameActive && currentSnapshot && currentSnapshot.players.length > 0) {
        const bx = builtArena.ballMesh.position.x;
        const bz = builtArena.ballMesh.position.z;
        let bestDist = Infinity;
        for (const p of currentSnapshot.players) {
          const isLocal = p.id === cfg.localPlayerId;
          const px = isLocal && isOnlineGuest && guestPred.initialized ? guestPred.x : p.x;
          const py = isLocal && isOnlineGuest && guestPred.initialized ? guestPred.y : p.y;
          const d = Math.hypot(px - bx, p.z - bz) - (py > 0.45 ? 1.2 : 0);
          if (d < bestDist) {
            bestDist = d;
            activePlayer = p;
          }
        }
      }

      if (!replayFrameActive && activePlayer) {
        const isActiveLocal = activePlayer.id === cfg.localPlayerId;
        _activePos.x = isActiveLocal && isOnlineGuest && guestPred.initialized ? guestPred.x : activePlayer.x;
        _activePos.y = isActiveLocal && isOnlineGuest && guestPred.initialized ? guestPred.y : activePlayer.y;
        _activePos.z = activePlayer.z;
        if (!isShowcase && !isPaused && state === 'playing' && currentSnapshot) {
          const localP = currentSnapshot.players.find((p) => p.id === cfg.localPlayerId) ?? activePlayer;
          const curVx = isOnlineGuest && guestPred.initialized ? guestPred.vx : localP.vx;
          const curY = isOnlineGuest && guestPred.initialized ? guestPred.y : localP.y;
          const curAction = isOnlineGuest && guestPred.initialized ? guestPred.actionState : localP.actionState;
          const curSpeed = Math.hypot(curVx, localP.vz);
          const isDirectionChange =
            Math.abs(prevLocalVx) >= 2.2 &&
            Math.abs(curVx) >= 1.8 &&
            Math.sign(prevLocalVx) !== Math.sign(curVx);
          gameFeel.updateCourtFootsteps(
            dt,
            curSpeed,
            curY <= 0.05,
            prevLocalSpeed,
            isDirectionChange,
            curAction,
          );
          gameFeel.updateAiMovementSqueaks(currentSnapshot.players, dt, cfg.localPlayerId);
          prevLocalSpeed = curSpeed;
          prevLocalVx = curVx;
        }
      }

      if (!isShowcase && !isPaused && state === 'playing') {
        gameFeel.updateCrowdForRally(
          dt,
          currentSnapshot?.phase === 'rally' || replayFrameActive,
          currentSnapshot?.phase === 'point_freeze',
        );
      }

      _ballPos.x = builtArena.ballMesh.position.x;
      _ballPos.y = builtArena.ballMesh.position.y;
      _ballPos.z = builtArena.ballMesh.position.z;
      if (currentSnapshot) {
        _ballVel.x = currentSnapshot.ball.vx;
        _ballVel.y = currentSnapshot.ball.vy;
        _ballVel.z = currentSnapshot.ball.vz;
      }

      const activeState =
        activePlayer?.id === cfg.localPlayerId && isOnlineGuest && guestPred.initialized
          ? guestPred.actionState
          : (activePlayer?.actionState ?? 'idle');

      // Câmera Dinâmica 2.5D: Foco Duplo + Zoom Contextual de FOV + Screen Shake Escalonado + Flash
      const feel = gameFeel.updateCameraAndFeel(dt, elapsed, {
        aspect: camera.aspect,
        phase: currentSnapshot?.phase ?? 'serve_wait',
        ballPos: _ballPos,
        ballVel: _ballVel,
        activePlayerPos: _activePos,
        activePlayerState: activeState,
        isShowcase,
      });

      camera.position.set(
        feel.position.x + feel.shakeOffset.x,
        feel.position.y + feel.shakeOffset.y,
        feel.position.z + feel.shakeOffset.z,
      );
      camera.lookAt(feel.lookAt.x, feel.lookAt.y, feel.lookAt.z);
      if (Math.abs(camera.fov - feel.fov) > 0.02) {
        camera.fov = feel.fov;
        camera.updateProjectionMatrix();
      }

      if (flashOverlayRef.current) {
        flashOverlayRef.current.style.opacity = feel.flashOpacity > 0.004 ? feel.flashOpacity.toFixed(3) : '0';
        if (feel.flashOpacity > 0.004) {
          flashOverlayRef.current.style.backgroundColor = feel.flashColor;
        }
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    // Cria rigs iniciais imediatamente para que o primeiro paint já exiba você atrás da linha (saque fora) + Levantador junto à rede e o rival na quadra
    const spawnInitialPreviewRigs = () => {
      const previewLeft = buildAnimeCharacter(matchConfigRef.current.localCharacterId, 'left');
      previewLeft.root.position.set(-(COURT.HALF_WIDTH + 0.85), 0, 0);
      const animLeft = new PlayerAnimatorController();
      updateCharacterRigAnimation(previewLeft, 'idle', 0, 0, 0, 1, 0, false, 0.016, animLeft.getResolvedState());
      scene.add(previewLeft.root);
      playerRigs.set(matchConfigRef.current.localPlayerId, {
        rig: previewLeft,
        characterId: matchConfigRef.current.localCharacterId,
        team: 'left',
        animator: animLeft,
      });

      const setterPreviewChar: CharacterId = matchConfigRef.current.localCharacterId === 'hana' ? 'ren' : 'hana';
      const previewSetter = buildAnimeCharacter(setterPreviewChar, 'left');
      previewSetter.root.position.set(-1.45, 0, 0);
      const animSetter = new PlayerAnimatorController();
      updateCharacterRigAnimation(previewSetter, 'idle', 0.4, 0, 0, 1, 0, false, 0.016, animSetter.getResolvedState());
      scene.add(previewSetter.root);
      playerRigs.set('ally_setter', {
        rig: previewSetter,
        characterId: setterPreviewChar,
        team: 'left',
        animator: animSetter,
      });

      const previewRight = buildAnimeCharacter('yuki', 'right');
      previewRight.root.position.set(4.6, 0, 0);
      const animRight = new PlayerAnimatorController();
      updateCharacterRigAnimation(previewRight, 'idle', 0.8, 0, 0, -1, 0, false, 0.016, animRight.getResolvedState());
      scene.add(previewRight.root);
      playerRigs.set('opp_1', {
        rig: previewRight,
        characterId: 'yuki',
        team: 'right',
        animator: animRight,
      });

      const previewRightPartner = buildAnimeCharacter('kai', 'right');
      previewRightPartner.root.position.set(1.65, 0, 0);
      const animRightPartner = new PlayerAnimatorController();
      updateCharacterRigAnimation(previewRightPartner, 'idle', 1.1, 0, 0, -1, 0, false, 0.016, animRightPartner.getResolvedState());
      scene.add(previewRightPartner.root);
      playerRigs.set('opp_2', {
        rig: previewRightPartner,
        characterId: 'kai',
        team: 'right',
        animator: animRightPartner,
      });

      builtArena.ballMesh.position.set(-(COURT.HALF_WIDTH + 0.65), 2.8, 0);
      builtArena.ballShadow.position.set(-(COURT.HALF_WIDTH + 0.65), 0.014, 0);
    };
    spawnInitialPreviewRigs();

    // Renderiza frame 0 imediatamente para evitar tela escura na pintura inicial
    if (screenStateRef.current === 'title') {
      camera.position.set(0, 5.4, 28.0);
      camera.lookAt(0, 1.65, 0);
    }
    renderer.render(scene, camera);

    if (isSoftwareGl) {
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      window.clearInterval(simHeartbeatId);
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('blur', clearInputs);
      document.removeEventListener('visibilitychange', clearInputs);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);

      clearRigs();
      builtArena.dispose();
      vfx.dispose();
      envTex.dispose();
      if (localWorld) localWorld.dispose();
      if (replayControlRef) replayControlRef.current = null;
      customSoundtrackManager.stopCrowd();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden">
      <div
        ref={mountRef}
        data-testid="game-canvas-mount"
        className="w-full h-full"
      />
      <div
        ref={flashOverlayRef}
        data-testid="impact-flash-overlay"
        style={{ opacity: 0, backgroundColor: 'rgba(255, 244, 196, 1)' }}
        className="pointer-events-none fixed inset-0 z-10"
      />
    </div>
  );
};
