import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RoomManager,
  spawnMatchPlayersForRoomMode,
  type RoomStatePayload,
  type RoomChatEntry,
} from './roomManager.ts';

function createMockServerAndSockets() {
  const roomBuckets = new Map<string, Set<MockSocket>>();
  const globalEmits: Array<{ event: string; payload: unknown }> = [];

  class MockSocket {
    public id: string;
    public emitted: Array<{ event: string; payload: unknown }> = [];
    private handlers = new Map<string, (...args: unknown[]) => void>();

    constructor(id: string) {
      this.id = id;
    }

    public on(event: string, cb: (...args: unknown[]) => void): void {
      this.handlers.set(event, cb);
    }

    public emit(event: string, payload?: unknown): void {
      this.emitted.push({ event, payload });
    }

    public async join(code: string): Promise<void> {
      let bucket = roomBuckets.get(code);
      if (!bucket) {
        bucket = new Set();
        roomBuckets.set(code, bucket);
      }
      bucket.add(this);
    }

    public async leave(code: string): Promise<void> {
      roomBuckets.get(code)?.delete(this);
    }

    public triggerClientEvent(event: string, payload?: unknown): void {
      const fn = this.handlers.get(event);
      if (fn) fn(payload);
    }
  }

  const io = {
    to(code: string) {
      return {
        emit(event: string, payload: unknown) {
          const bucket = roomBuckets.get(code);
          if (!bucket) return;
          for (const sock of bucket) {
            sock.emit(event, payload);
          }
        },
      };
    },
    emit(event: string, payload: unknown) {
      globalEmits.push({ event, payload });
    },
  };

  return { io, MockSocket };
}

test('RoomManager CreateRoom, JoinRoom (including same-browser UID collision), and BroadcastChatMessage', () => {
  const { io, MockSocket } = createMockServerAndSockets();
  const manager = new RoomManager(io as never);

  const client1 = new MockSocket('sock_host_1111');
  const client2 = new MockSocket('sock_guest_2222');
  const outsider = new MockSocket('sock_outsider_3333');

  manager.handleConnection(client1 as never);
  manager.handleConnection(client2 as never);
  manager.handleConnection(outsider as never);

  // 1) Player 1 cria sala privada
  client1.triggerClientEvent('room:create', {
    playerId: 'guest_shared_uid',
    name: 'Jogador',
    characterId: 'akira',
    mode: '1v1',
    arenaId: 'ginasio',
  });

  const hostRoomStateEvent = client1.emitted.find((e) => e.event === 'room:state');
  assert.ok(hostRoomStateEvent, 'Host must receive initial room:state on CreateRoom');
  const createdRoom = hostRoomStateEvent.payload as RoomStatePayload;
  assert.equal(createdRoom.code.length, 6, 'Generated room code must be 6 characters');
  assert.equal(createdRoom.members.length, 1);
  assert.equal(createdRoom.is1v1Mode, true);

  // 2) Player 2 entra usando o código da sala (mesmo com UID compartilhado de localStorage!)
  client2.triggerClientEvent('room:join', {
    code: `  ${createdRoom.code.toLowerCase()} `,
    playerId: 'guest_shared_uid',
    name: 'Jogador',
    characterId: 'ren',
  });

  const playerJoinedOnHost = client1.emitted.find((e) => e.event === 'PlayerJoined');
  const playerJoinedOnGuest = client2.emitted.find((e) => e.event === 'PlayerJoined');
  assert.ok(playerJoinedOnHost, 'Host must receive PlayerJoined event when Player 2 joins');
  assert.ok(playerJoinedOnGuest, 'Player 2 must receive PlayerJoined event when joining');

  const latestRoomOnHost = [...client1.emitted]
    .reverse()
    .find((e) => e.event === 'room:state')?.payload as RoomStatePayload;
  assert.equal(latestRoomOnHost.members.length, 2, 'Room must contain both Player 1 and Player 2');
  assert.equal(latestRoomOnHost.members[0].team, 'left');
  assert.equal(latestRoomOnHost.members[1].team, 'right');
  assert.notEqual(
    latestRoomOnHost.members[0].playerId,
    latestRoomOnHost.members[1].playerId,
    'Player 1 and Player 2 must have distinct session playerIds',
  );

  // 3) Chat Online sincronizado apenas para membros da mesma sala
  client1.triggerClientEvent('chat:send', {
    channel: 'room',
    text: 'Bora jogar!',
    roomCode: createdRoom.code,
  });

  const p2ChatMsg = client2.emitted.find((e) => e.event === 'chat:message')?.payload as RoomChatEntry | undefined;
  const outsiderChatMsg = outsider.emitted.find((e) => e.event === 'chat:message');
  assert.ok(p2ChatMsg, 'Player 2 in the same room must receive the chat message');
  assert.equal(p2ChatMsg?.text, 'Bora jogar!');
  assert.equal(outsiderChatMsg, undefined, 'Socket outside the room must NOT receive room chat');
});

test('RoomManager Host-only mode selector ("1x1 Puro" vs "2x2 Com Parceiros IA") and spawnMatchPlayersForRoomMode', () => {
  const { io, MockSocket } = createMockServerAndSockets();
  const manager = new RoomManager(io as never);

  const host = new MockSocket('sock_host_a');
  const guest = new MockSocket('sock_guest_b');
  manager.handleConnection(host as never);
  manager.handleConnection(guest as never);

  host.triggerClientEvent('room:create', {
    playerId: 'host_id_1',
    name: 'Host P1',
    characterId: 'akira',
    mode: '1v1',
    arenaId: 'ginasio',
  });
  const initialRoom = host.emitted.find((e) => e.event === 'room:state')?.payload as RoomStatePayload;

  guest.triggerClientEvent('room:join', {
    code: initialRoom.code,
    playerId: 'guest_id_2',
    name: 'Cliente P2',
    characterId: 'ren',
  });

  // Cliente (Jogador 2) tenta mudar o modo -> bloqueado!
  guest.triggerClientEvent('room:set_mode', { mode: '2v2' });
  const guestError = [...guest.emitted].reverse().find((e) => e.event === 'room:error');
  assert.ok(guestError, 'Non-host client must be prevented from changing the game mode');

  // Host muda para "2x2 (Com Parceiros IA)" -> sincroniza imediatamente para Cliente P2
  host.triggerClientEvent('room:set_mode', { mode: '2v2' });
  const modeChangedOnGuest = [...guest.emitted].reverse().find((e) => e.event === 'RoomModeChanged')?.payload as
    | { mode: string; is1v1Mode: boolean; room: RoomStatePayload }
    | undefined;
  assert.ok(modeChangedOnGuest, 'Player 2 must immediately receive RoomModeChanged when Host switches mode');
  assert.equal(modeChangedOnGuest?.mode, '2v2');
  assert.equal(modeChangedOnGuest?.is1v1Mode, false);
  assert.equal(modeChangedOnGuest?.room.maxPlayers, 4);

  // Verifica spawn de "2x2 (Com Parceiros IA)": P1 + Bot Parceiro Time 1 e P2 + Bot Parceiro Time 2
  const spawn2v2 = spawnMatchPlayersForRoomMode({
    code: initialRoom.code,
    mode: '2v2',
    members: modeChangedOnGuest!.room.members.map((m) => ({
      ...m,
      socketId: '',
      lastInputAt: 0,
      lastChatAt: 0,
    })),
  });
  assert.equal(spawn2v2.is1v1Mode, false);
  assert.equal(spawn2v2.players.length, 4);
  assert.equal(spawn2v2.players.filter((p) => p.team === 'left' && !p.isAi).length, 1);
  assert.equal(spawn2v2.players.filter((p) => p.team === 'left' && p.isAi && p.role === 'setter').length, 1);
  assert.equal(spawn2v2.players.filter((p) => p.team === 'right' && !p.isAi).length, 1);
  assert.equal(spawn2v2.players.filter((p) => p.team === 'right' && p.isAi && p.role === 'setter').length, 1);

  // Host muda para "Co-op: 2 Humanos vs 2 Bots" (coop_2v2) -> sincroniza para Cliente P2 e coloca ambos no Time 1 (left)
  host.triggerClientEvent('room:set_mode', { mode: 'coop_2v2' });
  const coopChangedOnGuest = [...guest.emitted].reverse().find((e) => e.event === 'RoomModeChanged')?.payload as
    | { mode: string; is1v1Mode: boolean; room: RoomStatePayload }
    | undefined;
  assert.ok(coopChangedOnGuest, 'Player 2 must immediately receive RoomModeChanged when Host selects coop_2v2');
  assert.equal(coopChangedOnGuest?.mode, 'coop_2v2');
  assert.equal(coopChangedOnGuest?.is1v1Mode, false);
  assert.equal(coopChangedOnGuest?.room.maxPlayers, 4);
  assert.equal(coopChangedOnGuest?.room.members.length, 2);
  assert.equal(coopChangedOnGuest?.room.members[0].team, 'left');
  assert.equal(coopChangedOnGuest?.room.members[0].slotIndex, 0);
  assert.equal(coopChangedOnGuest?.room.members[1].team, 'left');
  assert.equal(coopChangedOnGuest?.room.members[1].slotIndex, 1);

  // Verifica spawn de "Co-op: 2 Humanos vs 2 Bots":
  // Time 1 (left): P1 (Host, attacker) + P2 (Client, setter)
  // Time 2 (right): Enemy_IA_1 (attacker) + Enemy_IA_2 (setter)
  const spawnCoop = spawnMatchPlayersForRoomMode({
    code: initialRoom.code,
    mode: 'coop_2v2',
    members: coopChangedOnGuest!.room.members.map((m) => ({
      ...m,
      socketId: '',
      lastInputAt: 0,
      lastChatAt: 0,
    })),
  });
  assert.equal(spawnCoop.is1v1Mode, false);
  assert.equal(spawnCoop.players.length, 4);
  assert.equal(spawnCoop.players[0].id, 'host_id_1');
  assert.equal(spawnCoop.players[0].team, 'left');
  assert.equal(spawnCoop.players[0].role, 'attacker');
  assert.equal(spawnCoop.players[0].isAi, false);
  assert.equal(spawnCoop.players[1].id, 'guest_id_2');
  assert.equal(spawnCoop.players[1].team, 'left');
  assert.equal(spawnCoop.players[1].role, 'setter');
  assert.equal(spawnCoop.players[1].isAi, false);
  assert.equal(spawnCoop.players[2].id, 'Enemy_IA_1');
  assert.equal(spawnCoop.players[2].team, 'right');
  assert.equal(spawnCoop.players[2].role, 'attacker');
  assert.equal(spawnCoop.players[2].isAi, true);
  assert.equal(spawnCoop.players[3].id, 'Enemy_IA_2');
  assert.equal(spawnCoop.players[3].team, 'right');
  assert.equal(spawnCoop.players[3].role, 'setter');
  assert.equal(spawnCoop.players[3].isAi, true);

  // Host volta para "1x1 Puro" -> instancia apenas P1 (left) e P2 (right) com is1v1Mode = true
  host.triggerClientEvent('room:set_mode', { mode: '1v1' });
  const backTo1v1OnGuest = [...guest.emitted].reverse().find((e) => e.event === 'RoomModeChanged')?.payload as
    | { mode: string; is1v1Mode: boolean; room: RoomStatePayload }
    | undefined;
  const spawn1v1 = spawnMatchPlayersForRoomMode({
    code: initialRoom.code,
    mode: '1v1',
    members: backTo1v1OnGuest!.room.members.map((m) => ({
      ...m,
      socketId: '',
      lastInputAt: 0,
      lastChatAt: 0,
    })),
  });
  assert.equal(spawn1v1.is1v1Mode, true);
  assert.equal(spawn1v1.players.length, 2);
  assert.equal(spawn1v1.players[0].team, 'left');
  assert.equal(spawn1v1.players[1].team, 'right');
  assert.equal(spawn1v1.players.every((p) => !p.isAi), true);
});

test('RoomManager propagates RPC_PerformSet and executes ForceNextPoint / SyncState Watchdog to prevent Host softlock', async () => {
  const { io, MockSocket } = createMockServerAndSockets();
  const manager = new RoomManager(io as never);

  const host = new MockSocket('sock_host_w1');
  const guest = new MockSocket('sock_guest_w2');
  manager.handleConnection(host as never);
  manager.handleConnection(guest as never);

  host.triggerClientEvent('room:create', {
    playerId: 'host_w1',
    name: 'Host P1',
    characterId: 'akira',
    mode: '1v1',
    arenaId: 'ginasio',
  });
  const roomState = host.emitted.find((e) => e.event === 'room:state')?.payload as RoomStatePayload;

  guest.triggerClientEvent('room:join', {
    code: roomState.code,
    playerId: 'guest_w2',
    name: 'Guest P2',
    characterId: 'ren',
  });

  // Inicia partida na sala privada com 2 jogadores humanos
  host.triggerClientEvent('room:start');
  await new Promise((r) => setTimeout(r, 60));

  // Testa propagação de RPC_PerformSet (Levantamento 1x1 / 2x2) para ambos os jogadores da sala
  host.triggerClientEvent('RPC_PerformSet', {
    playerId: 'host_w1',
    team: 'left',
    touchNumber: 2,
    isSelfSet: true,
    x: -1.5,
    y: 1.4,
    vx: 0.8,
    vy: 9.8,
  });

  const setOnGuest = guest.emitted.find((e) => e.event === 'RPC_PerformSet')?.payload as
    | { playerId: string; touchNumber: number; isSelfSet: boolean }
    | undefined;
  assert.ok(setOnGuest, 'Opponent client must receive RPC_PerformSet broadcast');
  assert.equal(setOnGuest?.playerId, 'host_w1');
  assert.equal(setOnGuest?.touchNumber, 2);
  assert.equal(setOnGuest?.isSelfSet, true);

  // Testa Watchdog ForceNextPoint / SyncState para destravar Host e Cliente
  const synced = manager.ForceNextPoint(roomState.code, 'WATCHDOG_TEST');
  assert.ok(synced, 'ForceNextPoint must return authoritative synced snapshot');
  assert.equal(synced?.phase, 'serve_wait');

  const forceEventOnHost = host.emitted.find((e) => e.event === 'RPC_ForceNextPoint');
  const syncEventOnGuest = guest.emitted.find((e) => e.event === 'SyncState');
  assert.ok(forceEventOnHost, 'Host must receive RPC_ForceNextPoint when watchdog triggers');
  assert.ok(syncEventOnGuest, 'Guest must receive SyncState when watchdog triggers');

  // Encerra sala para limpar interval
  host.triggerClientEvent('room:leave');
  guest.triggerClientEvent('room:leave');
});


