/**
 * Spike Legends Online — Cliente de Rede Híbrido (WebRTC DataChannel P2P + Sinalização Socket.io)
 */
import { io, type Socket } from 'socket.io-client';
import type { AiDifficulty, ArenaId, CharacterId, GameMode, TeamSide } from '../config/gameConfig';
import {
  ensureRapierReady,
  VolleyballRapierWorld,
  type MatchSnapshot,
  type PlayerInputState,
} from '../physics/rapierWorld';
import {
  decodeCompactInputPacket,
  decodeCompactStatePacket,
  encodeCompactInputPacket,
  encodeCompactStatePacket,
  type CompactInputPacket,
  type CompactStatePacket,
  type P2PDataChannelPacket,
} from './compactPacketCodec';
import {
  buildRoomStateFromSignalDoc,
  generateNormalizedRoomCode,
  normalizeRoomCode,
  webrtcP2PManager,
  type P2PConnectionDiagnostics,
  type PlainSessionDescription,
} from './webrtcP2PManager';

export type { P2PConnectionDiagnostics };

export interface ChatMessageItem {
  id: string;
  sender: string;
  senderName?: string;
  text: string;
  channel: 'room' | 'global';
  roomCode?: string;
  timestamp: number;
}

export type ChatMessagePayload = ChatMessageItem;

export interface EmojiBubbleEvent {
  playerId: string;
  name: string;
  text: string;
}

export interface RoomStatePayload {
  code: string;
  mode: GameMode;
  is1v1Mode?: boolean;
  arenaId: ArenaId;
  hostId: string;
  status: 'lobby' | 'playing' | 'finished';
  maxPlayers: number;
  members: Array<{
    playerId: string;
    name: string;
    characterId: CharacterId;
    team: TeamSide;
    slotIndex: number;
    ready: boolean;
    isAi: boolean;
    connected: boolean;
  }>;
}

export interface PlayerJoinedPayload {
  room: RoomStatePayload;
  playerId: string;
  name: string;
  team: TeamSide;
}

export interface PerformSetPayload {
  roomCode: string;
  playerId: string;
  team: TeamSide;
  touchNumber: number;
  isSelfSet: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
}

const CHARACTER_CYCLE: CharacterId[] = ['akira', 'ren', 'yuki', 'hana', 'kai'];

async function buildInitialMatchSnapshotForRoom(room: RoomStatePayload): Promise<MatchSnapshot> {
  await ensureRapierReady();
  const aiDifficulty: AiDifficulty = 'medium';
  const allHumans = room.members.filter((m) => !m.isAi);

  if (room.mode === 'coop_2v2') {
    const p1 = allHumans[0] ?? room.members[0];
    const p2 =
      allHumans[1] ??
      room.members.find((m) => m.playerId !== p1?.playerId) ?? {
        playerId: `client_${room.code}_p2`,
        name: 'Jogador 2 (Client)',
        characterId: (CHARACTER_CYCLE.find((c) => c !== p1?.characterId) ?? 'ren') as CharacterId,
        team: 'left' as TeamSide,
        slotIndex: 1,
        isAi: false,
      };
    const bot1Char =
      CHARACTER_CYCLE.find((c) => c !== p1.characterId && c !== p2.characterId) ?? 'yuki';
    const bot2Char =
      CHARACTER_CYCLE.find((c) => c !== p1.characterId && c !== p2.characterId && c !== bot1Char) ??
      'hana';

    const sim = new VolleyballRapierWorld({
      mode: 'coop_2v2',
      is1v1Mode: false,
      arenaId: room.arenaId,
      players: [
        {
          id: p1.playerId,
          name: p1.name,
          characterId: p1.characterId,
          team: 'left',
          slotIndex: 0,
          role: 'attacker',
          isAi: Boolean(p1.isAi),
          aiDifficulty,
        },
        {
          id: p2.playerId,
          name: p2.name,
          characterId: p2.characterId,
          team: 'left',
          slotIndex: 1,
          role: 'setter',
          isAi: Boolean(p2.isAi),
          aiDifficulty,
        },
        {
          id: 'Enemy_IA_1',
          name: 'Enemy_IA_1',
          characterId: bot1Char,
          team: 'right',
          slotIndex: 0,
          role: 'attacker',
          isAi: true,
          aiDifficulty,
        },
        {
          id: 'Enemy_IA_2',
          name: 'Enemy_IA_2',
          characterId: bot2Char,
          team: 'right',
          slotIndex: 1,
          role: 'setter',
          isAi: true,
          aiDifficulty,
        },
      ],
    });
    const snap = sim.collectSnapshot();
    sim.dispose();
    return snap;
  }

  const p1 =
    room.members.find((m) => m.team === 'left' && !m.isAi) ??
    room.members.find((m) => m.team === 'left') ??
    allHumans[0];
  const p2 =
    room.members.find((m) => m.team === 'right' && !m.isAi) ??
    room.members.find((m) => m.team === 'right') ??
    allHumans.find((m) => m.playerId !== p1?.playerId) ?? {
      playerId: `bot_${room.code}_right_0`,
      name: 'Bot REN',
      characterId: 'ren' as CharacterId,
      team: 'right' as TeamSide,
      slotIndex: 0,
      isAi: true,
    };

  if (room.mode !== '2v2') {
    const sim = new VolleyballRapierWorld({
      mode: '1v1',
      is1v1Mode: true,
      arenaId: room.arenaId,
      players: [
        {
          id: p1.playerId,
          name: p1.name,
          characterId: p1.characterId,
          team: 'left',
          slotIndex: 0,
          role: 'attacker',
          isAi: Boolean(p1.isAi),
          aiDifficulty,
        },
        {
          id: p2.playerId,
          name: p2.name,
          characterId: p2.characterId,
          team: 'right',
          slotIndex: 0,
          role: 'attacker',
          isAi: Boolean(p2.isAi),
          aiDifficulty,
        },
      ],
    });
    const snap = sim.collectSnapshot();
    sim.dispose();
    return snap;
  }

  const leftPartnerChar = CHARACTER_CYCLE.find((c) => c !== p1.characterId) ?? 'yuki';
  const rightPartnerChar =
    CHARACTER_CYCLE.find((c) => c !== p2.characterId && c !== leftPartnerChar) ?? 'hana';

  const sim = new VolleyballRapierWorld({
    mode: '2v2',
    is1v1Mode: false,
    arenaId: room.arenaId,
    players: [
      {
        id: p1.playerId,
        name: p1.name,
        characterId: p1.characterId,
        team: 'left',
        slotIndex: 0,
        role: 'attacker',
        isAi: Boolean(p1.isAi),
        aiDifficulty,
      },
      {
        id: `bot_partner_left_${room.code}`,
        name: `Parceiro IA (${leftPartnerChar.toUpperCase()})`,
        characterId: leftPartnerChar,
        team: 'left',
        slotIndex: 1,
        role: 'setter',
        isAi: true,
        aiDifficulty,
      },
      {
        id: p2.playerId,
        name: p2.name,
        characterId: p2.characterId,
        team: 'right',
        slotIndex: 0,
        role: 'attacker',
        isAi: Boolean(p2.isAi),
        aiDifficulty,
      },
      {
        id: `bot_partner_right_${room.code}`,
        name: `Parceiro IA (${rightPartnerChar.toUpperCase()})`,
        characterId: rightPartnerChar,
        team: 'right',
        slotIndex: 1,
        role: 'setter',
        isAi: true,
        aiDifficulty,
      },
    ],
  });
  const snap = sim.collectSnapshot();
  sim.dispose();
  return snap;
}

class NetworkClient {
  private socket: Socket | null = null;
  private pingTimer: number | null = null;
  private currentPing = 0;
  private assignedPlayerId: string | null = null;
  private activeRoomCode: string | null = null;
  private latestRoomState: RoomStatePayload | null = null;
  private templateSnapshot: MatchSnapshot | null = null;
  private matchStartedForRoomCode: string | null = null;
  private isCreatingOrJoiningRoom = false;
  private seenChatIds = new Set<string>();

  private listeners = {
    roomState: new Set<(room: RoomStatePayload) => void>(),
    roomError: new Set<(msg: string) => void>(),
    assignedId: new Set<(playerId: string) => void>(),
    playerJoined: new Set<(data: PlayerJoinedPayload) => void>(),
    matchStarted: new Set<(data: { room: RoomStatePayload; snapshot: MatchSnapshot }) => void>(),
    matchSnapshot: new Set<(snap: MatchSnapshot) => void>(),
    remoteInput: new Set<(data: { playerId: string; input: PlayerInputState }) => void>(),
    syncState: new Set<(snap: MatchSnapshot) => void>(),
    performSet: new Set<(data: PerformSetPayload) => void>(),
    matchEnded: new Set<(snap: MatchSnapshot) => void>(),
    chatMessage: new Set<(msg: ChatMessageItem) => void>(),
    emojiBubble: new Set<(ev: EmojiBubbleEvent) => void>(),
    ping: new Set<(ms: number) => void>(),
    connection: new Set<(connected: boolean) => void>(),
    waiting: new Set<(info: { mode: string; position: number }) => void>(),
  };

  constructor() {
    webrtcP2PManager.setStatePacketHandler((pkt: CompactStatePacket) => {
      if (!this.templateSnapshot) return;
      const snap = decodeCompactStatePacket(pkt, this.templateSnapshot);
      this.templateSnapshot = snap;
      this.listeners.matchSnapshot.forEach((cb) => cb(snap));
      if (snap.phase === 'finished') {
        this.listeners.matchEnded.forEach((cb) => cb(snap));
      }
    });

    webrtcP2PManager.setInputPacketHandler((pkt: CompactInputPacket) => {
      const decoded = decodeCompactInputPacket(pkt);
      this.listeners.remoteInput.forEach((cb) => cb(decoded));
    });

    webrtcP2PManager.setPingHandler((rttMs: number) => {
      this.currentPing = rttMs;
      this.listeners.ping.forEach((cb) => cb(rttMs));
    });

    webrtcP2PManager.setFallbackRelaySender((pkt: P2PDataChannelPacket) => {
      if (this.socket && this.socket.connected) {
        const roomCode = this.activeRoomCode || webrtcP2PManager.getCurrentRoomCode() || '';
        this.socket.emit('p2p:packet', { roomCode, pkt });
      }
    });

    webrtcP2PManager.setSignalingErrorHandler((errMsg: string) => {
      this.listeners.roomError.forEach((cb) => cb(errMsg));
    });

    webrtcP2PManager.setMatchStartPacketHandler((roomCode: string) => {
      const doc = webrtcP2PManager.getLastKnownRoomDoc();
      const targetRoom = doc ? buildRoomStateFromSignalDoc(doc) : this.latestRoomState;
      if (targetRoom && normalizeRoomCode(targetRoom.code) === normalizeRoomCode(roomCode)) {
        this.triggerMatchStartTransition(targetRoom);
      }
    });
  }

  private triggerMatchStartTransition(room: RoomStatePayload): void {
    const cleanCode = normalizeRoomCode(room.code);
    if (this.matchStartedForRoomCode === cleanCode) return;
    this.matchStartedForRoomCode = cleanCode;
    void buildInitialMatchSnapshotForRoom(room).then((snapshot) => {
      webrtcP2PManager.notifyMatchStarted();
      this.templateSnapshot = snapshot;
      this.listeners.matchStarted.forEach((cb) => cb({ room, snapshot }));
    });
  }

  private dispatchChatMessage(raw: ChatMessageItem): void {
    if (!raw || !raw.id || this.seenChatIds.has(raw.id)) return;
    this.seenChatIds.add(raw.id);
    if (this.seenChatIds.size > 200) {
      const first = this.seenChatIds.values().next().value;
      if (first) this.seenChatIds.delete(first);
    }
    const normalized: ChatMessageItem = {
      ...raw,
      sender: raw.sender || raw.senderName || 'Jogador',
      senderName: raw.senderName || raw.sender || 'Jogador',
    };
    this.listeners.chatMessage.forEach((cb) => cb(normalized));
  }

  public connect(): Socket {
    if (this.socket) return this.socket;

    const socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 800,
    });

    socket.on('connect', () => {
      this.listeners.connection.forEach((cb) => cb(true));
    });

    socket.on('disconnect', () => {
      this.listeners.connection.forEach((cb) => cb(false));
    });

    socket.on('net:pong', (sentAt: number) => {
      if (!webrtcP2PManager.isDataChannelOpen()) {
        this.currentPing = Math.max(1, Math.round(performance.now() - sentAt));
        this.listeners.ping.forEach((cb) => cb(this.currentPing));
      }
    });

    socket.on('room:assigned_id', (data: { playerId: string; roomCode?: string }) => {
      if (data?.playerId) {
        this.assignedPlayerId = data.playerId;
        this.listeners.assignedId.forEach((cb) => cb(data.playerId));
      }
    });

    socket.on('room:state', (room: RoomStatePayload) => {
      this.activeRoomCode = room.code;
      this.latestRoomState = room;
      this.listeners.roomState.forEach((cb) => cb(room));
    });

    socket.on(
      'RoomModeChanged',
      (data: { code: string; mode: GameMode; is1v1Mode: boolean; room?: RoomStatePayload }) => {
        if (data?.room) {
          this.latestRoomState = data.room;
          this.listeners.roomState.forEach((cb) => cb(data.room!));
        }
      },
    );

    socket.on('PlayerJoined', (data: PlayerJoinedPayload) => {
      if (data?.room) {
        this.latestRoomState = data.room;
        this.listeners.roomState.forEach((cb) => cb(data.room));
      }
      this.listeners.playerJoined.forEach((cb) => cb(data));
    });

    socket.on(
      'webrtc:signal',
      async (signal: {
        roomCode: string;
        type: 'offer' | 'answer' | 'candidate';
        sdp?: string | PlainSessionDescription;
        candidate?: string;
      }) => {
        const answerDesc = await webrtcP2PManager.applyRemoteSignal(signal);
        if (answerDesc && signal.roomCode) {
          socket.emit('webrtc:signal', {
            roomCode: normalizeRoomCode(signal.roomCode),
            type: 'answer',
            sdp: answerDesc,
          });
        }
      },
    );

    socket.on(
      'p2p:packet',
      (payload: P2PDataChannelPacket | { roomCode?: string; pkt?: P2PDataChannelPacket }) => {
        const pkt =
          payload && typeof payload === 'object' && 'pkt' in payload && payload.pkt
            ? payload.pkt
            : (payload as P2PDataChannelPacket);
        if (pkt && typeof pkt === 'object' && 't' in pkt) {
          webrtcP2PManager.handleIncomingPacket(pkt);
        }
      },
    );

    socket.on('room:error', (err: { message: string }) => {
      this.isCreatingOrJoiningRoom = false;
      this.listeners.roomError.forEach((cb) => cb(err.message));
    });

    socket.on('matchmaking:waiting', (info: { mode: string; position: number }) => {
      this.listeners.waiting.forEach((cb) => cb(info));
    });

    socket.on('match:started', (data: { room: RoomStatePayload; snapshot: MatchSnapshot }) => {
      const code = normalizeRoomCode(data.room.code);
      if (this.matchStartedForRoomCode === code) return;
      this.matchStartedForRoomCode = code;
      webrtcP2PManager.notifyMatchStarted();
      this.templateSnapshot = data.snapshot;
      this.listeners.matchStarted.forEach((cb) => cb(data));
    });

    socket.on('match:snapshot', (snap: MatchSnapshot) => {
      this.templateSnapshot = snap;
      this.listeners.matchSnapshot.forEach((cb) => cb(snap));
    });

    socket.on('RPC_PerformSet', (data: PerformSetPayload) => {
      this.listeners.performSet.forEach((cb) => cb(data));
    });

    socket.on('SyncState', (snap: MatchSnapshot) => {
      this.templateSnapshot = snap;
      this.listeners.syncState.forEach((cb) => cb(snap));
      this.listeners.matchSnapshot.forEach((cb) => cb(snap));
    });

    socket.on('RPC_ForceNextPoint', (snap: MatchSnapshot) => {
      this.templateSnapshot = snap;
      this.listeners.syncState.forEach((cb) => cb(snap));
      this.listeners.matchSnapshot.forEach((cb) => cb(snap));
    });

    socket.on('match:ended', (snap: MatchSnapshot) => {
      this.templateSnapshot = snap;
      this.listeners.matchEnded.forEach((cb) => cb(snap));
    });

    socket.on('chat:message', (msg: ChatMessageItem) => {
      this.dispatchChatMessage(msg);
    });

    socket.on('ChatMessage', (msg: ChatMessageItem) => {
      this.dispatchChatMessage(msg);
    });

    socket.on('chat:emoji_bubble', (ev: EmojiBubbleEvent) => {
      this.listeners.emojiBubble.forEach((cb) => cb(ev));
    });

    this.pingTimer = window.setInterval(() => {
      if (socket.connected && !webrtcP2PManager.isDataChannelOpen()) {
        socket.emit('net:ping', performance.now());
      }
    }, 3000);

    this.socket = socket;
    return socket;
  }

  public getPing(): number {
    return this.currentPing;
  }

  public isP2PConnected(): boolean {
    return webrtcP2PManager.isDataChannelOpen();
  }

  public getP2PDiagnostics(): P2PConnectionDiagnostics {
    return webrtcP2PManager.getDiagnostics();
  }

  public onP2PDiagnostics(cb: (diag: P2PConnectionDiagnostics) => void): () => void {
    return webrtcP2PManager.onDiagnosticsChange(cb);
  }

  public getAssignedPlayerId(fallbackUid: string): string {
    return this.assignedPlayerId || fallbackUid;
  }

  public async createRoom(params: {
    playerId: string;
    name: string;
    characterId: CharacterId;
    mode: GameMode;
    arenaId: ArenaId;
  }): Promise<void> {
    if (this.isCreatingOrJoiningRoom) return;
    this.isCreatingOrJoiningRoom = true;
    this.matchStartedForRoomCode = null;

    const cleanCode = generateNormalizedRoomCode();
    const sock = this.connect();

    try {
      await webrtcP2PManager.createHostRoom({
        roomCode: cleanCode,
        hostId: params.playerId,
        hostName: params.name,
        hostCharacterId: params.characterId,
        mode: params.mode,
        arenaId: params.arenaId,
        onOfferCreated: (plainOffer) => {
          sock.emit('webrtc:signal', {
            roomCode: cleanCode,
            type: 'offer',
            sdp: plainOffer,
          });
        },
        onIceCandidate: (plainCand) => {
          sock.emit('webrtc:signal', {
            roomCode: cleanCode,
            type: 'candidate',
            candidate: plainCand,
          });
        },
      });

      this.activeRoomCode = cleanCode;
      sock.emit('room:create', {
        ...params,
        code: cleanCode,
        isPrivate: true,
      });
    } catch (error) {
      const errMsg =
        error instanceof Error ? error.message : 'Erro ao criar sala privada via Socket.io.';
      this.listeners.roomError.forEach((cb) => cb(errMsg));
    } finally {
      this.isCreatingOrJoiningRoom = false;
    }
  }

  public async joinRoom(params: {
    code: string;
    playerId: string;
    name: string;
    characterId: CharacterId;
  }): Promise<void> {
    if (this.isCreatingOrJoiningRoom) return;
    const cleanCode = normalizeRoomCode(params.code);
    if (!cleanCode) {
      this.listeners.roomError.forEach((cb) => cb('Digite o código da sala para entrar.'));
      return;
    }

    this.isCreatingOrJoiningRoom = true;
    this.matchStartedForRoomCode = null;
    const sock = this.connect();

    try {
      const { assignedGuestId } = await webrtcP2PManager.joinGuestRoom({
        roomCode: cleanCode,
        guestId: params.playerId,
        guestName: params.name,
        guestCharacterId: params.characterId,
        onAnswerCreated: (plainAnswer) => {
          sock.emit('webrtc:signal', {
            roomCode: cleanCode,
            type: 'answer',
            sdp: plainAnswer,
          });
        },
        onIceCandidate: (plainCand) => {
          sock.emit('webrtc:signal', {
            roomCode: cleanCode,
            type: 'candidate',
            candidate: plainCand,
          });
        },
      });

      this.activeRoomCode = cleanCode;
      sock.emit('room:join', {
        ...params,
        code: cleanCode,
        playerId: assignedGuestId,
      });
    } catch (error) {
      const errMsg =
        error instanceof Error ? error.message : `Erro ao entrar na sala "${cleanCode}".`;
      this.listeners.roomError.forEach((cb) => cb(errMsg));
    } finally {
      this.isCreatingOrJoiningRoom = false;
    }
  }

  public joinMatchmaking(params: {
    playerId: string;
    name: string;
    characterId: CharacterId;
    mode: '1v1' | '2v2';
  }): void {
    this.assignedPlayerId = params.playerId;
    this.connect().emit('matchmaking:join', params);
  }

  public leaveMatchmaking(): void {
    this.socket?.emit('matchmaking:leave');
  }

  public leaveRoom(): void {
    this.assignedPlayerId = null;
    this.activeRoomCode = null;
    this.latestRoomState = null;
    this.templateSnapshot = null;
    this.matchStartedForRoomCode = null;
    this.isCreatingOrJoiningRoom = false;
    webrtcP2PManager.closeSession();
    this.socket?.emit('room:leave');
  }

  public setReady(ready: boolean): void {
    this.socket?.emit('room:ready', ready);
  }

  public updateRoomConfig(patch: {
    characterId?: CharacterId;
    arenaId?: ArenaId;
    team?: TeamSide;
    mode?: GameMode;
  }): void {
    this.socket?.emit('room:update_config', patch);
  }

  public setRoomMode(mode: '1v1' | '2v2' | 'coop_2v2'): void {
    this.socket?.emit('room:set_mode', { mode });
  }

  public fillBots(): void {
    this.socket?.emit('room:fill_bots');
  }

  public startRoomMatch(): void {
    const activeRoom = this.latestRoomState;
    if (activeRoom) {
      const cleanCode = normalizeRoomCode(activeRoom.code);
      webrtcP2PManager.sendRawPacket({ t: 'match_start', roomCode: cleanCode });
      this.triggerMatchStartTransition(activeRoom);
    }
    this.socket?.emit('room:start');
  }

  public sendHostStateSnapshot(snap: MatchSnapshot): void {
    this.templateSnapshot = snap;
    const compact = encodeCompactStatePacket(snap);
    webrtcP2PManager.sendRawPacket(compact);
  }

  public sendInput(input: PlayerInputState, playerId?: string): void {
    const pid = playerId || this.assignedPlayerId || 'guest';
    const compact = encodeCompactInputPacket(pid, input);
    webrtcP2PManager.sendRawPacket(compact);
  }

  public sendPerformSet(payload: Partial<PerformSetPayload>): void {
    this.socket?.emit('RPC_PerformSet', payload);
  }

  public requestSyncState(reason = 'CLIENT_WATCHDOG_TIMEOUT'): void {
    this.socket?.emit('RequestSyncState', { reason });
  }

  public forceNextPoint(reason = 'RPC_FORCE_NEXT_POINT'): void {
    this.socket?.emit('RPC_ForceNextPoint', { reason });
  }

  public sendChat(text: string, channel: 'room' | 'global' = 'room', roomCode?: string): void {
    const clean = text.trim();
    if (!clean) return;
    this.connect().emit('chat:send', {
      channel,
      text: clean,
      roomCode: roomCode || this.activeRoomCode || undefined,
    });
  }

  public sendEmoji(emoji: string): void {
    this.socket?.emit('chat:emoji', emoji);
  }

  public onRoomState(cb: (room: RoomStatePayload) => void): () => void {
    this.listeners.roomState.add(cb);
    return () => this.listeners.roomState.delete(cb);
  }

  public onAssignedId(cb: (playerId: string) => void): () => void {
    this.listeners.assignedId.add(cb);
    return () => this.listeners.assignedId.delete(cb);
  }

  public onPlayerJoined(cb: (data: PlayerJoinedPayload) => void): () => void {
    this.listeners.playerJoined.add(cb);
    return () => this.listeners.playerJoined.delete(cb);
  }

  public onRoomError(cb: (msg: string) => void): () => void {
    this.listeners.roomError.add(cb);
    return () => this.listeners.roomError.delete(cb);
  }

  public onMatchStarted(
    cb: (data: { room: RoomStatePayload; snapshot: MatchSnapshot }) => void,
  ): () => void {
    this.listeners.matchStarted.add(cb);
    return () => this.listeners.matchStarted.delete(cb);
  }

  public onMatchSnapshot(cb: (snap: MatchSnapshot) => void): () => void {
    this.listeners.matchSnapshot.add(cb);
    return () => this.listeners.matchSnapshot.delete(cb);
  }

  public onRemoteInput(cb: (data: { playerId: string; input: PlayerInputState }) => void): () => void {
    this.listeners.remoteInput.add(cb);
    return () => this.listeners.remoteInput.delete(cb);
  }

  public onSyncState(cb: (snap: MatchSnapshot) => void): () => void {
    this.listeners.syncState.add(cb);
    return () => this.listeners.syncState.delete(cb);
  }

  public onPerformSet(cb: (data: PerformSetPayload) => void): () => void {
    this.listeners.performSet.add(cb);
    return () => this.listeners.performSet.delete(cb);
  }

  public onMatchEnded(cb: (snap: MatchSnapshot) => void): () => void {
    this.listeners.matchEnded.add(cb);
    return () => this.listeners.matchEnded.delete(cb);
  }

  public onChatMessage(cb: (msg: ChatMessageItem) => void): () => void {
    this.listeners.chatMessage.add(cb);
    return () => this.listeners.chatMessage.delete(cb);
  }

  public onEmojiBubble(cb: (ev: EmojiBubbleEvent) => void): () => void {
    this.listeners.emojiBubble.add(cb);
    return () => this.listeners.emojiBubble.delete(cb);
  }

  public onPing(cb: (ms: number) => void): () => void {
    this.listeners.ping.add(cb);
    return () => this.listeners.ping.delete(cb);
  }

  public onWaiting(cb: (info: { mode: string; position: number }) => void): () => void {
    this.listeners.waiting.add(cb);
    return () => this.listeners.waiting.delete(cb);
  }

  public dispose(): void {
    if (this.pingTimer !== null) window.clearInterval(this.pingTimer);
    webrtcP2PManager.closeSession();
    this.socket?.disconnect();
    this.socket = null;
  }
}

export const networkClient = new NetworkClient();