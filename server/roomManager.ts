/**
- Spike Legends Online — Gerenciador de Salas, Matchmaking, Chat e Simulação Autoritativa
- Roda no servidor Node.js com física Rapier 3D a 60 Hz e snapshots a 30 Hz.
 */
import type { Server, Socket } from 'socket.io';
import {
  ANTI_CHEAT,
  PHYSICS,
  type AiDifficulty,
  type ArenaId,
  type CharacterId,
  type GameMode,
  type TeamSide,
} from '../src/config/gameConfig.ts';
import { filterProfanity } from '../src/physics/volleyballRules.ts';
import {
  ensureRapierReady,
  VolleyballRapierWorld,
  type MatchSnapshot,
  type PlayerInputState,
} from '../src/physics/rapierWorld.ts';

export interface RoomMember {
  playerId: string;
  socketId: string;
  name: string;
  characterId: CharacterId;
  team: TeamSide;
  slotIndex: number;
  ready: boolean;
  isAi: boolean;
  connected: boolean;
  lastInputAt: number;
  lastChatAt: number;
}

export interface RoomStatePayload {
  code: string;
  mode: GameMode;
  is1v1Mode: boolean;
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

export interface RoomChatEntry {
  id: string;
  sender: string;
  senderName: string;
  text: string;
  channel: 'room' | 'global';
  roomCode?: string;
  timestamp: number;
}

export interface CreateRoomPayload {
  code?: string;
  playerId: string;
  name: string;
  characterId: CharacterId;
  mode: GameMode;
  arenaId: ArenaId;
  isPrivate?: boolean;
}

export interface JoinRoomPayload {
  code: string;
  playerId: string;
  name: string;
  characterId: CharacterId;
  firestoreRoom?: {
    roomCode: string;
    hostId: string;
    hostName: string;
    hostCharacterId: CharacterId;
    mode: GameMode;
    arenaId: ArenaId;
  };
}

export interface ChatMessageInputPayload {
  channel?: 'room' | 'global';
  text: string;
  roomCode?: string;
  senderName?: string;
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

interface GameRoom {
  code: string;
  mode: GameMode;
  arenaId: ArenaId;
  hostId: string;
  status: 'lobby' | 'playing' | 'finished';
  maxPlayers: number;
  isPrivate: boolean;
  members: RoomMember[];
  chatHistory: RoomChatEntry[];
  sim: VolleyballRapierWorld | null;
  simInterval: NodeJS.Timeout | null;
  snapshotTickCounter: number;
  lastStateProgressAt: number;
  lastPhaseSignature: string;
  lastOfferSignal: unknown | null;
  pendingSignals: Array<unknown>;
}

const CHARACTER_CYCLE: CharacterId[] = ['akira', 'ren', 'yuki', 'hana', 'kai'];

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function spawnMatchPlayersForRoomMode(
  room: { code: string; mode: GameMode; members: RoomMember[] },
  aiDifficulty: AiDifficulty = 'medium',
): {
  is1v1Mode: boolean;
  players: Array<{
    id: string;
    name: string;
    characterId: CharacterId;
    team: TeamSide;
    slotIndex: number;
    role: 'attacker' | 'setter';
    isAi: boolean;
    aiDifficulty: AiDifficulty;
  }>;
} {
  const allHumans = room.members.filter((m) => !m.isAi);
  const humansLeft = room.members.filter((m) => !m.isAi && m.team === 'left');
  const humansRight = room.members.filter((m) => !m.isAi && m.team === 'right');

  if (room.mode === 'coop_2v2') {
    const coopP1 =
      allHumans[0] ??
      room.members[0] ?? {
        playerId: `host_${room.code}_p1`,
        name: 'Jogador 1 (Host)',
        characterId: 'akira' as CharacterId,
        team: 'left' as TeamSide,
        slotIndex: 0,
        isAi: false,
      };
    const coopP2 =
      allHumans[1] ??
      room.members.find((m) => m.playerId !== coopP1.playerId && !m.isAi) ?? {
        playerId: `client_${room.code}_p2`,
        name: 'Jogador 2 (Client)',
        characterId: (CHARACTER_CYCLE.find((c) => c !== coopP1.characterId) ?? 'ren') as CharacterId,
        team: 'left' as TeamSide,
        slotIndex: 1,
        isAi: false,
      };

    const existingBotsRight = room.members.filter((m) => m.isAi && m.team === 'right');
    const enemyBot1Char =
      existingBotsRight[0]?.characterId ??
      CHARACTER_CYCLE.find((c) => c !== coopP1.characterId && c !== coopP2.characterId) ??
      'yuki';
    const enemyBot2Char =
      existingBotsRight[1]?.characterId ??
      CHARACTER_CYCLE.find(
        (c) => c !== coopP1.characterId && c !== coopP2.characterId && c !== enemyBot1Char,
      ) ??
      'hana';

    return {
      is1v1Mode: false,
      players: [
        {
          id: coopP1.playerId,
          name: coopP1.name,
          characterId: coopP1.characterId,
          team: 'left',
          slotIndex: 0,
          role: 'attacker',
          isAi: Boolean(coopP1.isAi),
          aiDifficulty,
        },
        {
          id: coopP2.playerId,
          name: coopP2.name,
          characterId: coopP2.characterId,
          team: 'left',
          slotIndex: 1,
          role: 'setter',
          isAi: Boolean(coopP2.isAi),
          aiDifficulty,
        },
        {
          id: existingBotsRight[0]?.playerId ?? 'Enemy_IA_1',
          name: existingBotsRight[0]?.name ?? 'Enemy_IA_1',
          characterId: enemyBot1Char,
          team: 'right',
          slotIndex: 0,
          role: 'attacker',
          isAi: true,
          aiDifficulty,
        },
        {
          id: existingBotsRight[1]?.playerId ?? 'Enemy_IA_2',
          name: existingBotsRight[1]?.name ?? 'Enemy_IA_2',
          characterId: enemyBot2Char,
          team: 'right',
          slotIndex: 1,
          role: 'setter',
          isAi: true,
          aiDifficulty,
        },
      ],
    };
  }

  const is1v1Mode = room.mode !== '2v2';

  const p1 =
    humansLeft[0] ??
    room.members.find((m) => m.team === 'left' && m.slotIndex === 0) ??
    room.members.find((m) => m.team === 'left') ??
    allHumans[0];
  const p2 =
    humansRight[0] ??
    room.members.find((m) => m.team === 'right' && m.slotIndex === 0) ??
    room.members.find((m) => m.team === 'right') ??
    allHumans.find((m) => m.playerId !== p1?.playerId);

  const primaryLeft = p1 ?? {
    playerId: `bot_${room.code}_left_0`,
    name: 'Bot AKIRA',
    characterId: 'akira' as CharacterId,
    team: 'left' as TeamSide,
    slotIndex: 0,
    isAi: true,
  };
  const primaryRight = p2 ?? {
    playerId: `bot_${room.code}_right_0`,
    name: 'Bot REN',
    characterId: 'ren' as CharacterId,
    team: 'right' as TeamSide,
    slotIndex: 0,
    isAi: true,
  };

  if (is1v1Mode) {
    return {
      is1v1Mode: true,
      players: [
        {
          id: primaryLeft.playerId,
          name: primaryLeft.name,
          characterId: primaryLeft.characterId,
          team: 'left',
          slotIndex: 0,
          role: 'attacker',
          isAi: primaryLeft.isAi,
          aiDifficulty,
        },
        {
          id: primaryRight.playerId,
          name: primaryRight.name,
          characterId: primaryRight.characterId,
          team: 'right',
          slotIndex: 0,
          role: 'attacker',
          isAi: primaryRight.isAi,
          aiDifficulty,
        },
      ],
    };
  }

  const existingLeftPartner = room.members.find(
    (m) => m.team === 'left' && m.playerId !== primaryLeft.playerId,
  );
  const existingRightPartner = room.members.find(
    (m) => m.team === 'right' && m.playerId !== primaryRight.playerId,
  );

  const leftPartnerChar =
    existingLeftPartner?.characterId ??
    CHARACTER_CYCLE.find((c) => c !== primaryLeft.characterId) ??
    'yuki';
  const rightPartnerChar =
    existingRightPartner?.characterId ??
    CHARACTER_CYCLE.find((c) => c !== primaryRight.characterId && c !== leftPartnerChar) ??
    'hana';

  return {
    is1v1Mode: false,
    players: [
      {
        id: primaryLeft.playerId,
        name: primaryLeft.name,
        characterId: primaryLeft.characterId,
        team: 'left',
        slotIndex: 0,
        role: 'attacker',
        isAi: primaryLeft.isAi,
        aiDifficulty,
      },
      {
        id: existingLeftPartner?.playerId ?? `bot_partner_left_${room.code}`,
        name: existingLeftPartner?.name ?? `Parceiro IA (${leftPartnerChar.toUpperCase()})`,
        characterId: leftPartnerChar,
        team: 'left',
        slotIndex: 1,
        role: existingLeftPartner && !existingLeftPartner.isAi ? 'attacker' : 'setter',
        isAi: existingLeftPartner ? existingLeftPartner.isAi : true,
        aiDifficulty,
      },
      {
        id: primaryRight.playerId,
        name: primaryRight.name,
        characterId: primaryRight.characterId,
        team: 'right',
        slotIndex: 0,
        role: 'attacker',
        isAi: primaryRight.isAi,
        aiDifficulty,
      },
      {
        id: existingRightPartner?.playerId ?? `bot_partner_right_${room.code}`,
        name: existingRightPartner?.name ?? `Parceiro IA (${rightPartnerChar.toUpperCase()})`,
        characterId: rightPartnerChar,
        team: 'right',
        slotIndex: 1,
        role: existingRightPartner && !existingRightPartner.isAi ? 'attacker' : 'setter',
        isAi: existingRightPartner ? existingRightPartner.isAi : true,
        aiDifficulty,
      },
    ],
  };
}

export class RoomManager {
  public static readonly MATCH_WATCHDOG_TIMEOUT_MS = 6500;

  private rooms = new Map<string, GameRoom>();
  private socketToRoom = new Map<string, { code: string; playerId: string }>();
  private matchmakingQueue: Array<{
    socket: Socket;
    playerId: string;
    name: string;
    characterId: CharacterId;
    mode: '1v1' | '2v2';
  }> = [];

  private io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  public CreateRoom(socket: Socket, payload: CreateRoomPayload): void {
    this.leaveCurrentRoom(socket);
    const mode: GameMode =
      payload.mode === '2v2' ? '2v2' : payload.mode === 'coop_2v2' ? 'coop_2v2' : '1v1';
    const maxPlayers = mode === '1v1' ? 2 : 4;
    const requestedCode = payload.code ? String(payload.code).trim().toUpperCase() : '';
    let code = requestedCode.length >= 4 ? requestedCode : generateRoomCode();
    if (!requestedCode) {
      while (this.rooms.has(code)) code = generateRoomCode();
    }

    const hostPlayerId = String(payload.playerId || `host_${socket.id.slice(0, 6)}`);
    const hostName = (payload.name || 'Jogador 1').slice(0, 24);

    const existingRoom = this.rooms.get(code);
    if (existingRoom && existingRoom.hostId === hostPlayerId) {
      const hostMember = existingRoom.members.find((m) => m.playerId === hostPlayerId);
      if (hostMember) {
        hostMember.socketId = socket.id;
        hostMember.connected = true;
      }
      this.socketToRoom.set(socket.id, { code, playerId: hostPlayerId });
      void socket.join(code);
      socket.emit('room:assigned_id', { playerId: hostPlayerId, roomCode: code });
      this.broadcastRoomState(existingRoom);
      return;
    }

    const room: GameRoom = {
      code,
      mode,
      arenaId: payload.arenaId || 'ginasio',
      hostId: hostPlayerId,
      status: 'lobby',
      maxPlayers,
      isPrivate: payload.isPrivate ?? true,
      members: [
        {
          playerId: hostPlayerId,
          socketId: socket.id,
          name: hostName,
          characterId: payload.characterId || 'akira',
          team: 'left',
          slotIndex: 0,
          ready: true,
          isAi: false,
          connected: true,
          lastInputAt: 0,
          lastChatAt: 0,
        },
      ],
      chatHistory: [],
      sim: null,
      simInterval: null,
      snapshotTickCounter: 0,
      lastStateProgressAt: Date.now(),
      lastPhaseSignature: 'lobby',
      lastOfferSignal: null,
      pendingSignals: [],
    };

    this.rooms.set(code, room);
    this.socketToRoom.set(socket.id, { code, playerId: hostPlayerId });
    void socket.join(code);
    socket.emit('room:assigned_id', { playerId: hostPlayerId, roomCode: code });
    this.broadcastRoomState(room);
  }

  public JoinRoom(socket: Socket, payload: JoinRoomPayload): void {
    const cleanCode = String(payload?.code || '').trim().toUpperCase();
    if (!cleanCode) {
      socket.emit('room:error', { message: 'Digite um código de sala válido.' });
      return;
    }

    let room = this.rooms.get(cleanCode);
    if (
      !room &&
      payload.firestoreRoom &&
      String(payload.firestoreRoom.roomCode || '').trim().toUpperCase() === cleanCode
    ) {
      const fsRoom = payload.firestoreRoom;
      const mode: GameMode =
        fsRoom.mode === '2v2' ? '2v2' : fsRoom.mode === 'coop_2v2' ? 'coop_2v2' : '1v1';
      room = {
        code: cleanCode,
        mode,
        arenaId: fsRoom.arenaId || 'ginasio',
        hostId: String(fsRoom.hostId || 'host_1'),
        status: 'lobby',
        maxPlayers: mode === '1v1' ? 2 : 4,
        isPrivate: true,
        members: [
          {
            playerId: String(fsRoom.hostId || 'host_1'),
            socketId: '',
            name: String(fsRoom.hostName || 'Jogador 1').slice(0, 24),
            characterId: fsRoom.hostCharacterId || 'akira',
            team: 'left',
            slotIndex: 0,
            ready: true,
            isAi: false,
            connected: true,
            lastInputAt: 0,
            lastChatAt: 0,
          },
        ],
        chatHistory: [],
        sim: null,
        simInterval: null,
        snapshotTickCounter: 0,
        lastStateProgressAt: Date.now(),
        lastPhaseSignature: 'lobby',
        lastOfferSignal: null,
        pendingSignals: [],
      };
      this.rooms.set(cleanCode, room);
    }

    if (!room) {
      socket.emit('room:error', { message: 'Sala não encontrada. Verifique o código.' });
      return;
    }

    const rawPlayerId = String(payload.playerId || `guest_${socket.id.slice(0, 6)}`);
    const existing = room.members.find((m) => m.playerId === rawPlayerId);

    if (existing && (!existing.connected || existing.socketId === socket.id)) {
      existing.socketId = socket.id;
      existing.connected = true;
      this.socketToRoom.set(socket.id, { code: room.code, playerId: existing.playerId });
      void socket.join(room.code);
      socket.emit('room:assigned_id', { playerId: existing.playerId, roomCode: room.code });
      this.broadcastRoomState(room);
      this.io.to(room.code).emit('PlayerJoined', {
        room: this.serializeRoom(room),
        playerId: existing.playerId,
        name: existing.name,
        team: existing.team,
      });
      if (room.lastOfferSignal) {
        socket.emit('webrtc:signal', room.lastOfferSignal);
      }
      for (const sig of room.pendingSignals) {
        socket.emit('webrtc:signal', sig);
      }
      if (room.sim && room.status === 'playing') {
        socket.emit('match:started', {
          room: this.serializeRoom(room),
          snapshot: room.sim.collectSnapshot(),
        });
      }
      return;
    }

    if (room.status !== 'lobby') {
      socket.emit('room:error', { message: 'Partida já em andamento nesta sala.' });
      return;
    }

    const humanMembers = room.members.filter((m) => !m.isAi);
    const aiIndex = room.members.findIndex((m) => m.isAi);
    if (room.isPrivate && humanMembers.length >= 2) {
      socket.emit('room:error', { message: 'Esta sala privada já possui os 2 jogadores humanos.' });
      return;
    }
    if (room.members.length >= room.maxPlayers && aiIndex === -1) {
      socket.emit('room:error', { message: 'Esta sala já está cheia.' });
      return;
    }

    this.leaveCurrentRoom(socket);

    if (room.members.length >= room.maxPlayers && aiIndex !== -1) {
      room.members.splice(aiIndex, 1);
    }

    const effectivePlayerId =
      existing && existing.connected && existing.socketId !== socket.id
        ? `${rawPlayerId}_p2_${socket.id.slice(0, 4)}`
        : rawPlayerId;

    const rawName = (payload.name || 'Desafiante').slice(0, 24);
    const nameCollision = room.members.some((m) => m.name.toLowerCase() === rawName.toLowerCase());
    const effectiveName = nameCollision ? `${rawName.slice(0, 19)} (P2)` : rawName;

    const assignment = this.assignSlot(room);
    const newMember: RoomMember = {
      playerId: effectivePlayerId,
      socketId: socket.id,
      name: effectiveName,
      characterId: payload.characterId || 'ren',
      team: assignment.team,
      slotIndex: assignment.slotIndex,
      ready: true,
      isAi: false,
      connected: true,
      lastInputAt: 0,
      lastChatAt: 0,
    };
    room.members.push(newMember);

    this.socketToRoom.set(socket.id, { code: room.code, playerId: effectivePlayerId });
    void socket.join(room.code);

    socket.emit('room:assigned_id', { playerId: effectivePlayerId, roomCode: room.code });

    for (const entry of room.chatHistory) {
      socket.emit('chat:message', entry);
    }

    const serialized = this.serializeRoom(room);
    this.io.to(room.code).emit('PlayerJoined', {
      room: serialized,
      playerId: effectivePlayerId,
      name: newMember.name,
      team: newMember.team,
    });
    this.broadcastRoomState(room);

    // Entrega retroativamente o Offer e os ICE Candidates do Host para o Convidado
    if (room.lastOfferSignal) {
      socket.emit('webrtc:signal', room.lastOfferSignal);
    }
    for (const sig of room.pendingSignals) {
      socket.emit('webrtc:signal', sig);
    }
  }

  public BroadcastChatMessage(socket: Socket, payload: ChatMessageInputPayload): void {
    const ctx = this.getMemberContext(socket.id);
    const now = Date.now();
    if (ctx && now - ctx.member.lastChatAt < 250) {
      return;
    }
    if (ctx) ctx.member.lastChatAt = now;

    const clean = filterProfanity(String(payload?.text || ''));
    if (!clean) return;

    const targetRoom =
      ctx?.room ??
      (payload?.roomCode ? this.rooms.get(String(payload.roomCode).trim().toUpperCase()) : undefined);

    const senderName = ctx?.member.name || payload?.senderName?.slice(0, 24) || 'Visitante';
    const msg: RoomChatEntry = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      sender: senderName,
      senderName,
      text: clean,
      channel: payload?.channel === 'global' ? 'global' : 'room',
      roomCode: targetRoom?.code,
      timestamp: now,
    };

    if (msg.channel === 'global' && !targetRoom) {
      this.io.emit('chat:message', msg);
      this.io.emit('ChatMessage', msg);
    } else if (targetRoom) {
      targetRoom.chatHistory.push(msg);
      if (targetRoom.chatHistory.length > 50) {
        targetRoom.chatHistory.shift();
      }
      this.io.to(targetRoom.code).emit('chat:message', msg);
      this.io.to(targetRoom.code).emit('ChatMessage', msg);
    }
  }

  public ChangeRoomMode(socket: Socket, requestedMode: GameMode): void {
    const ctx = this.getMemberContext(socket.id);
    if (!ctx) return;
    if (ctx.room.hostId !== ctx.member.playerId || ctx.room.status !== 'lobby') {
      socket.emit('room:error', { message: 'Apenas o Criador da Sala (Host) pode alterar o Modo de Jogo.' });
      return;
    }

    const nextMode: '1v1' | '2v2' | 'coop_2v2' =
      requestedMode === '2v2'
        ? '2v2'
        : requestedMode === 'coop_2v2'
          ? 'coop_2v2'
          : '1v1';
    ctx.room.mode = nextMode;
    ctx.room.maxPlayers = nextMode === '1v1' ? 2 : 4;

    const humans = ctx.room.members.filter((m) => !m.isAi);
    if (nextMode === 'coop_2v2') {
      humans.forEach((h, idx) => {
        h.team = 'left';
        h.slotIndex = idx;
      });
    } else {
      humans.forEach((h, idx) => {
        h.team = idx === 0 ? 'left' : 'right';
        h.slotIndex = 0;
      });
    }
    ctx.room.members = humans;

    const serialized = this.serializeRoom(ctx.room);
    this.io.to(ctx.room.code).emit('RoomModeChanged', {
      code: ctx.room.code,
      mode: nextMode,
      is1v1Mode: nextMode === '1v1',
      room: serialized,
    });
    this.broadcastRoomState(ctx.room);
  }

  public ForceNextPoint(roomCode: string, reason = 'WATCHDOG_TIMEOUT'): MatchSnapshot | null {
    const cleanCode = String(roomCode || '').trim().toUpperCase();
    const room = this.rooms.get(cleanCode);
    if (!room || !room.sim || room.status !== 'playing') return null;

    const syncedSnap = room.sim.forceNextPointSync(reason);
    room.lastStateProgressAt = Date.now();
    room.lastPhaseSignature = `${syncedSnap.phase}_${syncedSnap.score.left}_${syncedSnap.score.right}_${syncedSnap.ball.touchesLeft}_${syncedSnap.ball.touchesRight}_${syncedSnap.serveWhistleBlown ? 1 : 0}`;

    this.io.to(room.code).emit('RPC_ForceNextPoint', syncedSnap);
    this.io.to(room.code).emit('SyncState', syncedSnap);
    this.io.to(room.code).emit('match:snapshot', syncedSnap);
    return syncedSnap;
  }

  public handleConnection(socket: Socket): void {
    socket.on('net:ping', (clientTime: number) => {
      socket.emit('net:pong', clientTime);
    });

    socket.on('room:create', (payload: CreateRoomPayload) => {
      this.CreateRoom(socket, payload);
    });
    socket.on('CreateRoom', (payload: CreateRoomPayload) => {
      this.CreateRoom(socket, payload);
    });

    socket.on('room:join', (payload: JoinRoomPayload) => {
      this.JoinRoom(socket, payload);
    });
    socket.on('JoinRoom', (payload: JoinRoomPayload) => {
      this.JoinRoom(socket, payload);
    });

    socket.on('room:set_mode', (payload: { mode: GameMode } | GameMode) => {
      const mode = typeof payload === 'string' ? payload : payload?.mode;
      if (mode) this.ChangeRoomMode(socket, mode);
    });
    socket.on('ChangeRoomMode', (payload: { mode: GameMode } | GameMode) => {
      const mode = typeof payload === 'string' ? payload : payload?.mode;
      if (mode) this.ChangeRoomMode(socket, mode);
    });

    socket.on(
      'matchmaking:join',
      (payload: { playerId: string; name: string; characterId: CharacterId; mode: '1v1' | '2v2' }) => {
        this.leaveCurrentRoom(socket);
        this.removeFromQueue(socket.id);

        const mode = payload.mode === '2v2' ? '2v2' : '1v1';
        this.matchmakingQueue.push({
          socket,
          playerId: payload.playerId,
          name: (payload.name || 'Jogador').slice(0, 24),
          characterId: payload.characterId || 'akira',
          mode,
        });

        socket.emit('matchmaking:waiting', { mode, position: this.matchmakingQueue.length });
        this.tryMatchQueue(mode);
      },
    );

    socket.on('matchmaking:leave', () => {
      this.removeFromQueue(socket.id);
    });

    socket.on('room:leave', () => {
      this.leaveCurrentRoom(socket);
    });

    socket.on('room:ready', (ready: boolean) => {
      const ctx = this.getMemberContext(socket.id);
      if (!ctx) return;
      ctx.member.ready = Boolean(ready);
      this.broadcastRoomState(ctx.room);
    });

    socket.on(
      'room:update_config',
      (patch: { characterId?: CharacterId; arenaId?: ArenaId; team?: TeamSide; mode?: GameMode }) => {
        const ctx = this.getMemberContext(socket.id);
        if (!ctx) return;
        if (patch.characterId && CHARACTER_CYCLE.includes(patch.characterId)) {
          ctx.member.characterId = patch.characterId;
        }
        if (patch.arenaId && ctx.room.hostId === ctx.member.playerId) {
          ctx.room.arenaId = patch.arenaId;
        }
        if (patch.mode && ctx.room.hostId === ctx.member.playerId && ctx.room.status === 'lobby') {
          this.ChangeRoomMode(socket, patch.mode);
          return;
        }
        if (patch.team && ctx.room.status === 'lobby') {
          ctx.member.team = patch.team;
        }
        this.broadcastRoomState(ctx.room);
      },
    );

    socket.on('room:fill_bots', () => {
      const ctx = this.getMemberContext(socket.id);
      if (!ctx || ctx.room.hostId !== ctx.member.playerId || ctx.room.status !== 'lobby') return;
      this.fillRoomWithBots(ctx.room);
      this.broadcastRoomState(ctx.room);
    });

    socket.on('room:start', async () => {
      const ctx = this.getMemberContext(socket.id);
      if (!ctx || ctx.room.hostId !== ctx.member.playerId) return;
      const humanCount = ctx.room.members.filter((m) => !m.isAi && m.connected).length;
      const hasBots = ctx.room.members.some((m) => m.isAi);
      if (ctx.room.isPrivate && humanCount < 2 && !hasBots) {
        socket.emit('room:error', {
          message: 'A Sala Privada exige 2 jogadores humanos conectados para iniciar a partida.',
        });
        return;
      }
      await this.startRoomSimulation(ctx.room);
    });

    socket.on('match:input', (input: PlayerInputState) => {
      const ctx = this.getMemberContext(socket.id);
      if (!ctx || !ctx.room.sim || ctx.room.status !== 'playing') return;

      const now = Date.now();
      const hasDiscreteActionEdge = Boolean(
        input.jump ||
          input.spike ||
          input.set ||
          input.receive ||
          input.dive ||
          input.ultimate ||
          input.serveReleaseChargeTime !== undefined ||
          input.serveQuickTap ||
          input.serveNormalTrigger ||
          input.serveUnderhandTrigger ||
          input.serveJumpTrigger ||
          (input.hybridCommand !== undefined && input.hybridCommand !== 'none'),
      );
      if (!hasDiscreteActionEdge && now - ctx.member.lastInputAt < ANTI_CHEAT.INPUT_MIN_INTERVAL_MS) {
        return;
      }
      ctx.member.lastInputAt = now;

      const sanitized: PlayerInputState = {
        moveX: Math.max(-1, Math.min(1, Number(input.moveX) || 0)),
        moveZ: Math.max(-1, Math.min(1, Number(input.moveZ) || 0)),
        sprint: Boolean(input.sprint),
        jump: Boolean(input.jump),
        jumpHeld: Boolean(input.jumpHeld),
        spike: Boolean(input.spike),
        spikeHeld: input.spikeHeld !== undefined ? Boolean(input.spikeHeld) : undefined,
        set: Boolean(input.set),
        preparingServe: input.preparingServe !== undefined ? Boolean(input.preparingServe) : undefined,
        serveChargeTime:
          typeof input.serveChargeTime === 'number' && Number.isFinite(input.serveChargeTime)
            ? Math.max(0, Math.min(10, input.serveChargeTime))
            : undefined,
        serveReleaseChargeTime:
          typeof input.serveReleaseChargeTime === 'number' && Number.isFinite(input.serveReleaseChargeTime)
            ? Math.max(0, Math.min(10, input.serveReleaseChargeTime))
            : undefined,
        serveChargeStage:
          input.serveChargeStage === 'jump_serve' || input.serveChargeStage === 'underhand'
            ? input.serveChargeStage
            : input.serveChargeStage === 'float'
              ? 'float'
              : undefined,
        hybridCommand:
          input.hybridCommand === 'single_tap' ||
          input.hybridCommand === 'double_tap_low_block' ||
          input.hybridCommand === 'triple_tap_deep_block' ||
          input.hybridCommand === 'hold_1s_underhand_serve' ||
          input.hybridCommand === 'hold_3s_jump_serve'
            ? input.hybridCommand
            : 'none',
        tapCount:
          typeof input.tapCount === 'number' && Number.isFinite(input.tapCount)
            ? Math.max(0, Math.min(3, Math.floor(input.tapCount)))
            : undefined,
        holdTimer:
          typeof input.holdTimer === 'number' && Number.isFinite(input.holdTimer)
            ? Math.max(0, Math.min(10, input.holdTimer))
            : undefined,
        serveQuickTap: Boolean(input.serveQuickTap),
        serveJumpCharge: Boolean(input.serveJumpCharge),
        serveNormalTrigger: Boolean(input.serveNormalTrigger),
        serveUnderhandTrigger: Boolean(input.serveUnderhandTrigger),
        serveJumpTrigger: Boolean(input.serveJumpTrigger),
        dive: Boolean(input.dive),
        receive: Boolean(input.receive),
        footMode: Boolean(input.footMode),
        serveType: input.serveType === 'jump_serve' || input.serveType === 'underhand' ? input.serveType : 'float',
        ultimate: Boolean(input.ultimate),
        aimZ: typeof input.aimZ === 'number' ? Math.max(-5, Math.min(5, input.aimZ)) : undefined,
        mouseAimRatio:
          typeof input.mouseAimRatio === 'number' ? Math.max(0, Math.min(1, input.mouseAimRatio)) : undefined,
        mouseWorldPos:
          input.mouseWorldPos &&
          Number.isFinite(input.mouseWorldPos.x) &&
          Number.isFinite(input.mouseWorldPos.y)
            ? {
                x: Math.max(-14, Math.min(14, Number(input.mouseWorldPos.x))),
                y: Math.max(0, Math.min(6, Number(input.mouseWorldPos.y))),
              }
            : undefined,
      };
      ctx.room.sim.setPlayerInput(ctx.member.playerId, sanitized);
    });

    socket.on('RPC_PerformSet', (payload: Partial<PerformSetPayload>) => {
      const ctx = this.getMemberContext(socket.id);
      if (!ctx || ctx.room.status !== 'playing') return;
      const snap = ctx.room.sim?.collectSnapshot();
      const eventPayload: PerformSetPayload = {
        roomCode: ctx.room.code,
        playerId: payload?.playerId || ctx.member.playerId,
        team: payload?.team || ctx.member.team,
        touchNumber: payload?.touchNumber ?? 2,
        isSelfSet: payload?.isSelfSet ?? ctx.room.mode === '1v1',
        x: Number(payload?.x ?? snap?.ball.x ?? 0),
        y: Number(payload?.y ?? snap?.ball.y ?? 1.5),
        z: 0,
        vx: Number(payload?.vx ?? snap?.ball.vx ?? 0),
        vy: Number(payload?.vy ?? snap?.ball.vy ?? 9.5),
      };
      this.io.to(ctx.room.code).emit('RPC_PerformSet', eventPayload);
    });

    socket.on('RequestSyncState', (payload?: { reason?: string }) => {
      const ctx = this.getMemberContext(socket.id);
      if (!ctx || !ctx.room.sim || ctx.room.status !== 'playing') return;
      const elapsedMs = Date.now() - ctx.room.lastStateProgressAt;
      if (elapsedMs >= 5000) {
        this.ForceNextPoint(ctx.room.code, payload?.reason || 'CLIENT_WATCHDOG_TIMEOUT');
      } else {
        const snap = ctx.room.sim.collectSnapshot();
        socket.emit('SyncState', snap);
        socket.emit('match:snapshot', snap);
      }
    });

    socket.on('RPC_ForceNextPoint', (payload?: { reason?: string }) => {
      const ctx = this.getMemberContext(socket.id);
      if (!ctx || !ctx.room.sim || ctx.room.status !== 'playing') return;
      this.ForceNextPoint(ctx.room.code, payload?.reason || 'RPC_FORCE_NEXT_POINT');
    });

    socket.on('chat:send', (payload: ChatMessageInputPayload) => {
      this.BroadcastChatMessage(socket, payload);
    });
    socket.on('ChatMessage', (payload: ChatMessageInputPayload) => {
      this.BroadcastChatMessage(socket, payload);
    });

    socket.on('chat:emoji', (emoji: string) => {
      const ctx = this.getMemberContext(socket.id);
      if (!ctx) return;
      const clean = String(emoji || '').slice(0, 18);
      if (!clean) return;
      this.io.to(ctx.room.code).emit('chat:emoji_bubble', {
        playerId: ctx.member.playerId,
        name: ctx.member.name,
        text: clean,
      });
    });

    socket.on(
      'webrtc:signal',
      (signal: { roomCode?: string; type: 'offer' | 'answer' | 'candidate'; sdp?: unknown; candidate?: unknown }) => {
        const ctx = this.getMemberContext(socket.id);
        const roomCode = ctx?.room.code || String(signal?.roomCode || '').trim().toUpperCase();
        if (!roomCode) return;
        void socket.join(roomCode);

        const targetRoom = this.rooms.get(roomCode);
        if (targetRoom) {
          if (signal?.type === 'offer') {
            targetRoom.lastOfferSignal = { ...signal, roomCode };
            targetRoom.pendingSignals = [];
          } else if (signal?.type === 'candidate') {
            targetRoom.pendingSignals.push({ ...signal, roomCode });
            if (targetRoom.pendingSignals.length > 30) {
              targetRoom.pendingSignals.shift();
            }
          }
        }

        socket.to(roomCode).emit('webrtc:signal', { ...signal, roomCode });
      },
    );

    socket.on('p2p:packet', (payload: unknown) => {
      const ctx = this.getMemberContext(socket.id);
      const isEnvelope =
        payload !== null &&
        typeof payload === 'object' &&
        'pkt' in (payload as Record<string, unknown>);
      const rawRoomCode = isEnvelope
        ? String((payload as { roomCode?: string }).roomCode || '').trim().toUpperCase()
        : '';
      const roomCode = ctx?.room.code || rawRoomCode;
      if (!roomCode) return;
      if (!ctx) {
        void socket.join(roomCode);
      }
      const pkt = isEnvelope ? (payload as { pkt: unknown }).pkt : payload;
      socket.to(roomCode).emit('p2p:packet', pkt);
    });

    socket.on('disconnect', () => {
      this.removeFromQueue(socket.id);
      const ctx = this.getMemberContext(socket.id);
      if (!ctx) return;
      ctx.member.connected = false;
      this.socketToRoom.delete(socket.id);

      const anyHumanConnected = ctx.room.members.some((m) => !m.isAi && m.connected);
      if (!anyHumanConnected) {
        this.cleanupRoom(ctx.room.code);
      } else {
        this.broadcastRoomState(ctx.room);
      }
    });
  }

  private removeFromQueue(socketId: string): void {
    this.matchmakingQueue = this.matchmakingQueue.filter((item) => item.socket.id !== socketId);
  }

  private tryMatchQueue(mode: '1v1' | '2v2'): void {
    const needed = mode === '2v2' ? 4 : 2;
    const candidates = this.matchmakingQueue.filter((q) => q.mode === mode);
    if (candidates.length < needed) return;

    const picked = candidates.slice(0, needed);
    for (const p of picked) {
      this.removeFromQueue(p.socket.id);
    }

    let code = generateRoomCode();
    while (this.rooms.has(code)) code = generateRoomCode();

    const seenIds = new Set<string>();
    const members: RoomMember[] = picked.map((p, idx) => {
      let pid = p.playerId;
      if (seenIds.has(pid)) {
        pid = `${pid}_p${idx + 1}_${p.socket.id.slice(0, 4)}`;
      }
      seenIds.add(pid);
      return {
        playerId: pid,
        socketId: p.socket.id,
        name: p.name,
        characterId: p.characterId,
        team: idx < needed / 2 ? 'left' : 'right',
        slotIndex: idx % (needed / 2),
        ready: true,
        isAi: false,
        connected: true,
        lastInputAt: 0,
        lastChatAt: 0,
      };
    });

    const room: GameRoom = {
      code,
      mode,
      arenaId: 'ginasio',
      hostId: members[0].playerId,
      status: 'lobby',
      maxPlayers: needed,
      isPrivate: false,
      members,
      chatHistory: [],
      sim: null,
      simInterval: null,
      snapshotTickCounter: 0,
      lastStateProgressAt: Date.now(),
      lastPhaseSignature: 'lobby',
      lastOfferSignal: null,
      pendingSignals: [],
    };

    this.rooms.set(code, room);
    for (let i = 0; i < picked.length; i++) {
      const p = picked[i];
      const assignedId = members[i].playerId;
      this.socketToRoom.set(p.socket.id, { code, playerId: assignedId });
      void p.socket.join(code);
      p.socket.emit('room:assigned_id', { playerId: assignedId, roomCode: code });
    }

    this.broadcastRoomState(room);
    void this.startRoomSimulation(room);
  }

  private assignSlot(room: GameRoom): { team: TeamSide; slotIndex: number } {
    if (room.isPrivate) {
      if (room.mode === 'coop_2v2') {
        const leftHumans = room.members.filter((m) => !m.isAi && m.team === 'left').length;
        return { team: 'left', slotIndex: leftHumans };
      }
      const leftHumans = room.members.filter((m) => !m.isAi && m.team === 'left').length;
      const rightHumans = room.members.filter((m) => !m.isAi && m.team === 'right').length;
      if (leftHumans === 0) return { team: 'left', slotIndex: 0 };
      if (rightHumans === 0) return { team: 'right', slotIndex: 0 };
    }
    const leftCount = room.members.filter((m) => m.team === 'left').length;
    const rightCount = room.members.filter((m) => m.team === 'right').length;
    if (rightCount <= leftCount) {
      return { team: 'right', slotIndex: rightCount };
    }
    return { team: 'left', slotIndex: leftCount };
  }

  private fillRoomWithBots(room: GameRoom): void {
    const targetCount = room.maxPlayers;
    let botIdx = 1;
    while (room.members.length < targetCount) {
      const leftCount = room.members.filter((m) => m.team === 'left').length;
      const rightCount = room.members.filter((m) => m.team === 'right').length;
      const slot: { team: TeamSide; slotIndex: number } =
        rightCount <= leftCount
          ? { team: 'right', slotIndex: rightCount }
          : { team: 'left', slotIndex: leftCount };
      const charId = CHARACTER_CYCLE[(room.members.length + botIdx) % CHARACTER_CYCLE.length];
      room.members.push({
        playerId: `bot_${room.code}_${botIdx}`,
        socketId: '',
        name: `Bot ${charId.toUpperCase()}`,
        characterId: charId,
        team: slot.team,
        slotIndex: slot.slotIndex,
        ready: true,
        isAi: true,
        connected: true,
        lastInputAt: 0,
        lastChatAt: 0,
      });
      botIdx += 1;
    }
  }

  private async startRoomSimulation(room: GameRoom): Promise<void> {
    if (room.simInterval) {
      clearInterval(room.simInterval);
      room.simInterval = null;
    }
    if (room.sim) {
      room.sim.dispose();
      room.sim = null;
    }

    await ensureRapierReady();

    room.status = 'playing';
    room.snapshotTickCounter = 0;

    const aiDifficulty: AiDifficulty = 'medium';
    const { players: spawnedPlayers, is1v1Mode } = spawnMatchPlayersForRoomMode(room, aiDifficulty);

    room.members = spawnedPlayers.map((sp) => {
      const existing = room.members.find((m) => m.playerId === sp.id);
      return {
        playerId: sp.id,
        socketId: existing?.socketId ?? '',
        name: sp.name,
        characterId: sp.characterId,
        team: sp.team,
        slotIndex: sp.slotIndex,
        ready: true,
        isAi: sp.isAi,
        connected: existing?.connected ?? true,
        lastInputAt: existing?.lastInputAt ?? 0,
        lastChatAt: existing?.lastChatAt ?? 0,
      };
    });

    room.sim = new VolleyballRapierWorld({
      mode: room.mode,
      is1v1Mode,
      arenaId: room.arenaId,
      players: spawnedPlayers,
    });

    const initialSnap = room.sim.collectSnapshot();
    room.lastStateProgressAt = Date.now();
    room.lastPhaseSignature = `${initialSnap.phase}_${initialSnap.score.left}_${initialSnap.score.right}_${initialSnap.ball.touchesLeft}_${initialSnap.ball.touchesRight}_${initialSnap.serveWhistleBlown ? 1 : 0}`;

    this.io.to(room.code).emit('match:started', {
      room: this.serializeRoom(room),
      snapshot: initialSnap,
    });

    if (room.isPrivate) {
      room.sim.dispose();
      room.sim = null;
      return;
    }

    room.simInterval = setInterval(() => {
      if (!room.sim) return;
      const snap: MatchSnapshot = room.sim.step(PHYSICS.FIXED_DT);
      room.snapshotTickCounter += 1;

      for (const ev of snap.events) {
        if (ev.type === 'set') {
          const setPayload: PerformSetPayload = {
            roomCode: room.code,
            playerId: ev.playerId ?? snap.ball.lastTouchPlayerId ?? '',
            team: ev.team ?? snap.ball.lastTouchTeam,
            touchNumber: ev.touchNumber ?? 2,
            isSelfSet: Boolean(ev.isSelfSet),
            x: ev.x,
            y: ev.y,
            z: ev.z,
            vx: ev.vx ?? snap.ball.vx,
            vy: ev.vy ?? snap.ball.vy,
          };
          this.io.to(room.code).emit('RPC_PerformSet', setPayload);
        } else if (ev.type === 'sync_state') {
          this.io.to(room.code).emit('RPC_ForceNextPoint', snap);
          this.io.to(room.code).emit('SyncState', snap);
        }
      }

      const currentSignature = `${snap.phase}_${snap.score.left}_${snap.score.right}_${snap.ball.touchesLeft}_${snap.ball.touchesRight}_${snap.serveWhistleBlown ? 1 : 0}`;
      if (currentSignature !== room.lastPhaseSignature || snap.events.length > 0) {
        room.lastPhaseSignature = currentSignature;
        room.lastStateProgressAt = Date.now();
      } else if (Date.now() - room.lastStateProgressAt >= RoomManager.MATCH_WATCHDOG_TIMEOUT_MS) {
        this.ForceNextPoint(room.code, 'SERVER_WATCHDOG_TIMEOUT');
        return;
      }

      if (room.snapshotTickCounter % 2 === 0 || snap.events.length > 0 || snap.phase === 'finished') {
        this.io.to(room.code).emit('match:snapshot', snap);
      }

      if (snap.phase === 'finished') {
        room.status = 'finished';
        if (room.simInterval) {
          clearInterval(room.simInterval);
          room.simInterval = null;
        }
        this.io.to(room.code).emit('match:ended', snap);
      }
    }, Math.round(PHYSICS.FIXED_DT * 1000));
  }

  private leaveCurrentRoom(socket: Socket): void {
    const info = this.socketToRoom.get(socket.id);
    if (!info) return;
    this.socketToRoom.delete(socket.id);
    void socket.leave(info.code);

    const room = this.rooms.get(info.code);
    if (!room) return;
    room.members = room.members.filter((m) => m.playerId !== info.playerId);

    const remainingHumans = room.members.filter((m) => !m.isAi);
    if (remainingHumans.length === 0) {
      this.cleanupRoom(room.code);
      return;
    }

    if (room.hostId === info.playerId) {
      room.hostId = remainingHumans[0].playerId;
    }
    this.broadcastRoomState(room);
  }

  private cleanupRoom(code: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    if (room.simInterval) clearInterval(room.simInterval);
    if (room.sim) room.sim.dispose();
    this.rooms.delete(code);
  }

  private getMemberContext(socketId: string): { room: GameRoom; member: RoomMember } | null {
    const info = this.socketToRoom.get(socketId);
    if (!info) return null;
    const room = this.rooms.get(info.code);
    if (!room) return null;
    const member = room.members.find((m) => m.playerId === info.playerId);
    if (!member) return null;
    return { room, member };
  }

  private serializeRoom(room: GameRoom): RoomStatePayload {
    return {
      code: room.code,
      mode: room.mode,
      is1v1Mode: room.mode === '1v1',
      arenaId: room.arenaId,
      hostId: room.hostId,
      status: room.status,
      maxPlayers: room.maxPlayers,
      members: room.members.map((m) => ({
        playerId: m.playerId,
        name: m.name,
        characterId: m.characterId,
        team: m.team,
        slotIndex: m.slotIndex,
        ready: m.ready,
        isAi: m.isAi,
        connected: m.connected,
      })),
    };
  }

  private broadcastRoomState(room: GameRoom): void {
    this.io.to(room.code).emit('room:state', this.serializeRoom(room));
  }
}