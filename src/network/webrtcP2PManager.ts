/**
 * Spike Legends Online — Gerenciador P2P WebRTC DataChannel (Baixa Latência Estilo UDP)
 * Sinalização via Socket.io + transporte de gameplay via RTCDataChannel com fallback silencioso para Socket.io.
 */
import type { ArenaId, CharacterId, GameMode, TeamSide } from '../config/gameConfig';
import type {
  CompactInputPacket,
  CompactStatePacket,
  P2PDataChannelPacket,
} from './compactPacketCodec';
import type { RoomStatePayload } from './socketClient';

export const WEBRTC_STUN_URL = 'stun:stun.l.google.com:19302';

export const WEBRTC_ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
      ],
    },
  ],
};

export const WEBRTC_DATACHANNEL_LABEL = 'spike_p2p_udp';

export const WEBRTC_DATACHANNEL_INIT: RTCDataChannelInit = {
  ordered: false,
  maxRetransmits: 0,
};

export const FIRESTORE_ROOMS_COLLECTION = 'rooms';
export const FIRESTORE_OFFER_CANDIDATES_SUBCOLLECTION = 'offerCandidates';
export const FIRESTORE_ANSWER_CANDIDATES_SUBCOLLECTION = 'answerCandidates';
export const STAGE_TIMEOUT_MS = 10000;

export interface PlainSessionDescription {
  type: string;
  sdp: string;
}

export interface PlainIceCandidate {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  usernameFragment: string | null;
}

export interface RoomSignalDoc {
  roomCode: string;
  hostId: string;
  hostName: string;
  hostCharacterId: CharacterId;
  guestId: string;
  guestName: string;
  guestCharacterId: CharacterId;
  mode: '1v1' | '2v2' | 'coop_2v2';
  arenaId: ArenaId;
  status: 'lobby' | 'playing' | 'finished';
  offer: PlainSessionDescription;
  answer: PlainSessionDescription;
  hostCandidates: PlainIceCandidate[];
  guestCandidates: PlainIceCandidate[];
  updatedAtMs: number;
}

export interface P2PConnectionDiagnostics {
  role: 'host' | 'guest' | null;
  roomCode: string | null;
  projectId: string;
  databaseId: string;
  step1CreateStatus: 'idle' | 'creating' | 'saved' | 'error';
  step1Text: string;
  step2JoinStatus: 'idle' | 'searching' | 'found' | 'error';
  step2Text: string;
  step3SdpStatus: 'idle' | 'waiting_guest' | 'exchanging' | 'done' | 'error';
  step3Text: string;
  iceStatus: 'idle' | 'checking' | 'connected' | 'failed';
  step4Text: string;
  dataChannelStatus: 'idle' | 'connecting' | 'open' | 'closed' | 'error';
  step5Text: string;
  offerCandidatesSent: number;
  offerCandidatesReceived: number;
  answerCandidatesSent: number;
  answerCandidatesReceived: number;
  errorMessage: string | null;
  updatedAtMs: number;
}

export function createInitialP2PDiagnostics(): P2PConnectionDiagnostics {
  return {
    role: null,
    roomCode: null,
    projectId: 'socket-p2p',
    databaseId: 'memory',
    step1CreateStatus: 'idle',
    step1Text: '1. Criando sala...',
    step2JoinStatus: 'idle',
    step2Text: '2. Buscando sala...',
    step3SdpStatus: 'idle',
    step3Text: '3. Conectando...',
    iceStatus: 'idle',
    step4Text: '4. Rede: [checking]',
    dataChannelStatus: 'idle',
    step5Text: '5. Canal: [connecting]',
    offerCandidatesSent: 0,
    offerCandidatesReceived: 0,
    answerCandidatesSent: 0,
    answerCandidatesReceived: 0,
    errorMessage: null,
    updatedAtMs: Date.now(),
  };
}

export function verifyRealFirebaseConfiguration(): {
  valid: boolean;
  projectId: string;
  databaseId: string;
  error?: string;
} {
  return {
    valid: true,
    projectId: 'socket-p2p',
    databaseId: 'memory',
  };
}

export function normalizeRoomCode(rawCode: string): string {
  return String(rawCode || '')
    .trim()
    .toUpperCase();
}

export function generateNormalizedRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return normalizeRoomCode(out);
}

export function serializeSessionDescription(
  desc: RTCSessionDescription | RTCSessionDescriptionInit | PlainSessionDescription,
): PlainSessionDescription {
  const raw =
    desc && typeof (desc as RTCSessionDescription).toJSON === 'function'
      ? (desc as RTCSessionDescription).toJSON()
      : desc;
  return {
    type: String(raw?.type || 'offer'),
    sdp: String(raw?.sdp || ''),
  };
}

export function serializeIceCandidate(
  candidate: RTCIceCandidate | RTCIceCandidateInit | PlainIceCandidate,
): PlainIceCandidate {
  const raw =
    typeof (candidate as RTCIceCandidate)?.toJSON === 'function'
      ? (candidate as RTCIceCandidate).toJSON()
      : (candidate as RTCIceCandidateInit);
  return {
    candidate: String(raw?.candidate ?? ''),
    sdpMid: raw?.sdpMid !== undefined && raw?.sdpMid !== null ? String(raw.sdpMid) : null,
    sdpMLineIndex:
      typeof raw?.sdpMLineIndex === 'number' && Number.isFinite(raw.sdpMLineIndex)
        ? raw.sdpMLineIndex
        : null,
    usernameFragment:
      raw?.usernameFragment !== undefined && raw?.usernameFragment !== null
        ? String(raw.usernameFragment)
        : null,
  };
}

export function buildRoomStateFromSignalDoc(data: RoomSignalDoc): RoomStatePayload {
  const mode: '1v1' | '2v2' | 'coop_2v2' =
    data.mode === '2v2' ? '2v2' : data.mode === 'coop_2v2' ? 'coop_2v2' : '1v1';
  const maxPlayers = mode === '1v1' ? 2 : 4;

  const members: RoomStatePayload['members'] = [
    {
      playerId: data.hostId,
      name: data.hostName || 'Jogador 1',
      characterId: data.hostCharacterId || 'akira',
      team: 'left',
      slotIndex: 0,
      ready: true,
      isAi: false,
      connected: true,
    },
  ];

  if (data.guestId && data.guestId.trim().length > 0) {
    const guestTeam: TeamSide = mode === 'coop_2v2' ? 'left' : 'right';
    const guestSlotIndex = mode === 'coop_2v2' ? 1 : 0;
    members.push({
      playerId: data.guestId,
      name: data.guestName || 'Desafiante (P2)',
      characterId: data.guestCharacterId || 'ren',
      team: guestTeam,
      slotIndex: guestSlotIndex,
      ready: true,
      isAi: false,
      connected: true,
    });
  }

  return {
    code: normalizeRoomCode(data.roomCode),
    mode: mode as GameMode,
    is1v1Mode: mode === '1v1',
    arenaId: data.arenaId || 'ginasio',
    hostId: data.hostId,
    status: data.status || 'lobby',
    maxPlayers,
    members,
  };
}

export class WebRtcP2PManager {
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private currentRoomCode: string | null = null;
  private role: 'host' | 'guest' | null = null;
  private localPlayerId: string | null = null;
  private matchStartedFlag = false;
  private remoteAnswerApplied = false;
  private remoteOfferApplied = false;
  private applyingRemoteDesc = false;
  private addedRemoteCandidates = new Set<string>();
  private pendingRemoteCandidates: PlainIceCandidate[] = [];
  private localCandidateQueue: PlainIceCandidate[] = [];
  private sentCandidateSet = new Set<string>();
  private pingIntervalId: number | null = null;
  private lastKnownDoc: RoomSignalDoc | null = null;
  private diagnostics: P2PConnectionDiagnostics = createInitialP2PDiagnostics();

  private statePacketHandler: ((pkt: CompactStatePacket) => void) | null = null;
  private inputPacketHandler: ((pkt: CompactInputPacket) => void) | null = null;
  private pingHandler: ((ms: number) => void) | null = null;
  private fallbackRelaySender: ((pkt: P2PDataChannelPacket) => void) | null = null;
  private roomDocSyncHandler: ((docData: RoomSignalDoc) => void) | null = null;
  private matchStartPacketHandler: ((roomCode: string) => void) | null = null;
  private signalingErrorHandler: ((errMsg: string) => void) | null = null;
  private diagnosticsListeners = new Set<(diag: P2PConnectionDiagnostics) => void>();

  public isDataChannelOpen(): boolean {
    return this.dataChannel !== null && this.dataChannel.readyState === 'open';
  }

  public getDataChannelReadyState(): RTCDataChannelState | 'closed' {
    return this.dataChannel ? this.dataChannel.readyState : 'closed';
  }

  public getRole(): 'host' | 'guest' | null {
    return this.role;
  }

  public getCurrentRoomCode(): string | null {
    return this.currentRoomCode;
  }

  public getLastKnownRoomDoc(): RoomSignalDoc | null {
    return this.lastKnownDoc;
  }

  public getDiagnostics(): P2PConnectionDiagnostics {
    return { ...this.diagnostics };
  }

  public onDiagnosticsChange(cb: (diag: P2PConnectionDiagnostics) => void): () => void {
    this.diagnosticsListeners.add(cb);
    cb(this.getDiagnostics());
    return () => {
      this.diagnosticsListeners.delete(cb);
    };
  }

  private updateDiagnostics(patch: Partial<P2PConnectionDiagnostics>): void {
    this.diagnostics = {
      ...this.diagnostics,
      ...patch,
      updatedAtMs: Date.now(),
    };
    const snapshot = this.getDiagnostics();
    this.diagnosticsListeners.forEach((cb) => cb(snapshot));
  }

  public setStatePacketHandler(cb: ((pkt: CompactStatePacket) => void) | null): void {
    this.statePacketHandler = cb;
  }

  public setInputPacketHandler(cb: ((pkt: CompactInputPacket) => void) | null): void {
    this.inputPacketHandler = cb;
  }

  public setPingHandler(cb: ((ms: number) => void) | null): void {
    this.pingHandler = cb;
  }

  public setFallbackRelaySender(cb: ((pkt: P2PDataChannelPacket) => void) | null): void {
    this.fallbackRelaySender = cb;
  }

  public setRoomDocSyncHandler(cb: ((docData: RoomSignalDoc) => void) | null): void {
    this.roomDocSyncHandler = cb;
  }

  public setMatchStartPacketHandler(cb: ((roomCode: string) => void) | null): void {
    this.matchStartPacketHandler = cb;
  }

  public setSignalingErrorHandler(cb: ((errMsg: string) => void) | null): void {
    this.signalingErrorHandler = cb;
  }

  public handleIncomingPacket(pkt: P2PDataChannelPacket): void {
    if (!pkt || typeof pkt !== 'object') return;
    if (pkt.t === 's') {
      this.statePacketHandler?.(pkt);
    } else if (pkt.t === 'i') {
      this.inputPacketHandler?.(pkt);
    } else if (pkt.t === 'ping') {
      this.sendRawPacket({ t: 'pong', ts: pkt.ts });
    } else if (pkt.t === 'pong') {
      const rtt = Math.max(1, Math.round(performance.now() - pkt.ts));
      this.pingHandler?.(rtt);
    } else if (pkt.t === 'dc_ready') {
      this.updateDiagnostics({
        iceStatus: 'connected',
        step4Text: '4. Rede: [connected]',
        dataChannelStatus: 'open',
        step5Text: '5. Canal: [open]',
        errorMessage: null,
      });
    } else if (pkt.t === 'match_start' && pkt.roomCode) {
      this.matchStartPacketHandler?.(normalizeRoomCode(pkt.roomCode));
    }
  }

  public sendRawPacket(pkt: P2PDataChannelPacket): void {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      try {
        this.dataChannel.send(JSON.stringify(pkt));
        return;
      } catch {
        // fallback caso o buffer do DataChannel esteja cheio
      }
    }
    this.fallbackRelaySender?.(pkt);
  }

  public notifyMatchStarted(): void {
    this.matchStartedFlag = true;
  }

  public stopFirestoreSignaling(): void {
    // Sinalização via Socket.io; mantido por compatibilidade.
  }

  private enqueueRemoteCandidates(candidates: PlainIceCandidate[]): void {
    if (!Array.isArray(candidates)) return;
    for (const c of candidates) {
      if (c && c.candidate) {
        this.pendingRemoteCandidates.push(c);
      }
    }
    void this.drainPendingRemoteCandidates();
  }

  private async drainPendingRemoteCandidates(): Promise<void> {
    if (!this.pc || this.applyingRemoteDesc) return;
    const remoteReady =
      (this.role === 'host' && this.remoteAnswerApplied) ||
      (this.role === 'guest' && this.remoteOfferApplied);
    if (!remoteReady || !this.pc.remoteDescription) return;

    while (this.pendingRemoteCandidates.length > 0) {
      const candObj = this.pendingRemoteCandidates.shift()!;
      const key = candObj?.candidate || JSON.stringify(candObj);
      if (!key || this.addedRemoteCandidates.has(key)) continue;
      this.addedRemoteCandidates.add(key);
      try {
        await this.pc.addIceCandidate(
          new RTCIceCandidate({
            candidate: candObj.candidate,
            sdpMid: candObj.sdpMid,
            sdpMLineIndex: candObj.sdpMLineIndex,
            usernameFragment: candObj.usernameFragment ?? undefined,
          }),
        );
        if (this.role === 'host') {
          this.updateDiagnostics({
            answerCandidatesReceived: this.addedRemoteCandidates.size,
          });
        } else {
          this.updateDiagnostics({
            offerCandidatesReceived: this.addedRemoteCandidates.size,
          });
        }
      } catch {
        this.addedRemoteCandidates.delete(key);
      }
    }
  }

  private bindPeerConnectionDiagnostics(pc: RTCPeerConnection): void {
    const syncIceState = () => {
      if (this.pc !== pc) return;
      const ice = pc.iceConnectionState;
      const conn = pc.connectionState;

      if (
        ice === 'connected' ||
        ice === 'completed' ||
        conn === 'connected' ||
        this.isDataChannelOpen()
      ) {
        this.updateDiagnostics({
          iceStatus: 'connected',
          step4Text: '4. Rede: [connected]',
          errorMessage: null,
        });
      } else if (ice === 'failed' || conn === 'failed' || ice === 'disconnected') {
        // Fallback silencioso para Socket.io sem exibir erro técnico ao usuário
        this.updateDiagnostics({
          iceStatus: 'failed',
          step4Text: '4. Rede: [relay]',
          errorMessage: null,
        });
      } else {
        this.updateDiagnostics({
          iceStatus: 'checking',
          step4Text: '4. Rede: [checking]',
        });
      }
    };

    pc.oniceconnectionstatechange = syncIceState;
    pc.onconnectionstatechange = syncIceState;
  }

  public async createHostRoom(params: {
    roomCode?: string;
    hostId: string;
    hostName: string;
    hostCharacterId: CharacterId;
    mode: GameMode;
    arenaId: ArenaId;
    onOfferCreated?: (offer: PlainSessionDescription) => void;
    onIceCandidate?: (candidate: PlainIceCandidate) => void;
  }): Promise<RoomSignalDoc> {
    this.closeSession();

    const cleanCode = normalizeRoomCode(params.roomCode || generateNormalizedRoomCode());
    const cleanHostId = String(params.hostId || 'host_player').slice(0, 128);
    const cleanHostName = String(params.hostName || 'Jogador 1').trim().slice(0, 24) || 'Jogador 1';
    const cleanMode: '1v1' | '2v2' | 'coop_2v2' =
      params.mode === '2v2' ? '2v2' : params.mode === 'coop_2v2' ? 'coop_2v2' : '1v1';

    this.currentRoomCode = cleanCode;
    this.role = 'host';
    this.localPlayerId = cleanHostId;

    this.updateDiagnostics({
      role: 'host',
      roomCode: cleanCode,
      step1CreateStatus: 'creating',
      step1Text: '1. Criando sala...',
      step2JoinStatus: 'searching',
      step2Text: '2. Aguardando jogador...',
      step3SdpStatus: 'waiting_guest',
      step3Text: '3. Preparando conexão...',
      iceStatus: 'checking',
      step4Text: '4. Rede: [checking]',
      dataChannelStatus: 'connecting',
      step5Text: '5. Canal: [connecting]',
      offerCandidatesSent: 0,
      offerCandidatesReceived: 0,
      answerCandidatesSent: 0,
      answerCandidatesReceived: 0,
      errorMessage: null,
    });

    let plainOffer: PlainSessionDescription = { type: 'offer', sdp: 'v=0' };

    if (typeof window !== 'undefined' && typeof RTCPeerConnection !== 'undefined') {
      try {
        const pc = new RTCPeerConnection(WEBRTC_ICE_CONFIG);
        this.pc = pc;
        this.bindPeerConnectionDiagnostics(pc);

        const dc = pc.createDataChannel(WEBRTC_DATACHANNEL_LABEL, WEBRTC_DATACHANNEL_INIT);
        this.bindDataChannel(dc);

        pc.onicecandidate = (ev) => {
          if (ev.candidate) {
            const plainCand = serializeIceCandidate(ev.candidate);
            if (plainCand.candidate && !this.sentCandidateSet.has(plainCand.candidate)) {
              this.sentCandidateSet.add(plainCand.candidate);
              if (this.localCandidateQueue.length < 25) {
                this.localCandidateQueue.push(plainCand);
              }
              this.updateDiagnostics({
                offerCandidatesSent: this.sentCandidateSet.size,
              });
              params.onIceCandidate?.(plainCand);
            }
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        plainOffer = serializeSessionDescription({
          type: offer.type,
          sdp: offer.sdp ?? '',
        });
        params.onOfferCreated?.(plainOffer);
      } catch {
        // Caso o navegador não suporte WebRTC no contexto atual, segue via Socket.io sem erro
      }
    }

    const docData: RoomSignalDoc = {
      roomCode: cleanCode,
      hostId: cleanHostId,
      hostName: cleanHostName,
      hostCharacterId: params.hostCharacterId || 'akira',
      guestId: '',
      guestName: '',
      guestCharacterId: 'ren',
      mode: cleanMode,
      arenaId: params.arenaId || 'ginasio',
      status: 'lobby',
      offer: plainOffer,
      answer: { type: 'none', sdp: '' },
      hostCandidates: this.localCandidateQueue.slice(0, 25),
      guestCandidates: [],
      updatedAtMs: Date.now(),
    };

    this.lastKnownDoc = docData;
    this.updateDiagnostics({
      step1CreateStatus: 'saved',
      step1Text: '1. Sala pronta',
    });
    return docData;
  }

  public async joinGuestRoom(params: {
    roomCode: string;
    guestId: string;
    guestName: string;
    guestCharacterId: CharacterId;
    onAnswerCreated?: (answer: PlainSessionDescription) => void;
    onIceCandidate?: (candidate: PlainIceCandidate) => void;
  }): Promise<{ assignedGuestId: string }> {
    this.closeSession();

    const cleanCode = normalizeRoomCode(params.roomCode);
    const effectiveGuestId = String(params.guestId || 'guest_player').slice(0, 128);

    this.currentRoomCode = cleanCode;
    this.role = 'guest';
    this.localPlayerId = effectiveGuestId;

    this.updateDiagnostics({
      role: 'guest',
      roomCode: cleanCode,
      step1CreateStatus: 'saved',
      step1Text: '1. Sala pronta',
      step2JoinStatus: 'searching',
      step2Text: '2. Entrando na sala...',
      step3SdpStatus: 'exchanging',
      step3Text: '3. Sincronizando...',
      iceStatus: 'checking',
      step4Text: '4. Rede: [checking]',
      dataChannelStatus: 'connecting',
      step5Text: '5. Canal: [connecting]',
      offerCandidatesSent: 0,
      offerCandidatesReceived: 0,
      answerCandidatesSent: 0,
      answerCandidatesReceived: 0,
      errorMessage: null,
    });

    if (typeof window !== 'undefined' && typeof RTCPeerConnection !== 'undefined') {
      try {
        const pc = new RTCPeerConnection(WEBRTC_ICE_CONFIG);
        this.pc = pc;
        this.bindPeerConnectionDiagnostics(pc);

        pc.ondatachannel = (ev) => {
          this.bindDataChannel(ev.channel);
        };

        pc.onicecandidate = (ev) => {
          if (ev.candidate) {
            const plainCand = serializeIceCandidate(ev.candidate);
            if (plainCand.candidate && !this.sentCandidateSet.has(plainCand.candidate)) {
              this.sentCandidateSet.add(plainCand.candidate);
              if (this.localCandidateQueue.length < 25) {
                this.localCandidateQueue.push(plainCand);
              }
              this.updateDiagnostics({
                answerCandidatesSent: this.sentCandidateSet.size,
              });
              params.onIceCandidate?.(plainCand);
            }
          }
        };
      } catch {
        // Fallback silencioso para Socket.io
      }
    }

    return { assignedGuestId: effectiveGuestId };
  }

  public async applyRemoteSignal(signal: {
    type: 'offer' | 'answer' | 'candidate';
    sdp?: string | PlainSessionDescription;
    candidate?: string | PlainIceCandidate;
  }): Promise<PlainSessionDescription | null> {
    if (!this.pc) return null;
    try {
      if (signal.type === 'offer' && signal.sdp && !this.remoteOfferApplied && !this.applyingRemoteDesc) {
        this.applyingRemoteDesc = true;
        try {
          const desc: PlainSessionDescription =
            typeof signal.sdp === 'string'
              ? (JSON.parse(signal.sdp) as PlainSessionDescription)
              : serializeSessionDescription(signal.sdp);
          await this.pc.setRemoteDescription(
            new RTCSessionDescription({ type: desc.type as RTCSdpType, sdp: desc.sdp }),
          );
          this.remoteOfferApplied = true;
        } finally {
          this.applyingRemoteDesc = false;
        }
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.updateDiagnostics({
          step2JoinStatus: 'found',
          step2Text: '2. Sala encontrada',
          step3SdpStatus: 'done',
          step3Text: '3. Conectado',
          errorMessage: null,
        });
        void this.drainPendingRemoteCandidates();
        return serializeSessionDescription({ type: answer.type, sdp: answer.sdp ?? '' });
      }
      if (signal.type === 'answer' && signal.sdp && !this.remoteAnswerApplied && !this.applyingRemoteDesc) {
        this.applyingRemoteDesc = true;
        try {
          const desc: PlainSessionDescription =
            typeof signal.sdp === 'string'
              ? (JSON.parse(signal.sdp) as PlainSessionDescription)
              : serializeSessionDescription(signal.sdp);
          await this.pc.setRemoteDescription(
            new RTCSessionDescription({ type: desc.type as RTCSdpType, sdp: desc.sdp }),
          );
          this.remoteAnswerApplied = true;
          this.updateDiagnostics({
            step2JoinStatus: 'found',
            step2Text: '2. Sala encontrada',
            step3SdpStatus: 'done',
            step3Text: '3. Conectado',
            errorMessage: null,
          });
        } finally {
          this.applyingRemoteDesc = false;
        }
        void this.drainPendingRemoteCandidates();
        return null;
      }
      if (signal.type === 'candidate' && signal.candidate) {
        const candObj: PlainIceCandidate =
          typeof signal.candidate === 'string'
            ? serializeIceCandidate(JSON.parse(signal.candidate) as RTCIceCandidateInit)
            : serializeIceCandidate(signal.candidate);
        this.enqueueRemoteCandidates([candObj]);
      }
    } catch {
      // Fallback silencioso para Socket.io
    }
    return null;
  }

  private bindDataChannel(dc: RTCDataChannel): void {
    this.dataChannel = dc;
    this.updateDiagnostics({
      dataChannelStatus: dc.readyState === 'open' ? 'open' : 'connecting',
      step5Text: `5. Canal: [${dc.readyState === 'open' ? 'open' : 'connecting'}]`,
    });

    dc.onopen = () => {
      this.updateDiagnostics({
        step2JoinStatus: 'found',
        step2Text: '2. Sala encontrada',
        step3SdpStatus: 'done',
        step3Text: '3. Conectado',
        iceStatus: 'connected',
        step4Text: '4. Rede: [connected]',
        dataChannelStatus: 'open',
        step5Text: '5. Canal: [open]',
        errorMessage: null,
      });

      this.sendRawPacket({ t: 'dc_ready', ts: performance.now() });

      if (this.pingIntervalId !== null) clearInterval(this.pingIntervalId);
      this.pingIntervalId = window.setInterval(() => {
        if (this.isDataChannelOpen()) {
          this.sendRawPacket({ t: 'ping', ts: performance.now() });
        }
      }, 2000);
    };

    dc.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      try {
        const pkt = JSON.parse(ev.data) as P2PDataChannelPacket;
        this.handleIncomingPacket(pkt);
      } catch {
        // ignora pacote malformado
      }
    };

    dc.onerror = () => {
      if (!this.isDataChannelOpen()) {
        this.updateDiagnostics({
          dataChannelStatus: 'closed',
          step5Text: '5. Canal: [relay]',
          errorMessage: null,
        });
      }
    };

    dc.onclose = () => {
      if (this.pingIntervalId !== null) {
        clearInterval(this.pingIntervalId);
        this.pingIntervalId = null;
      }
      if (this.currentRoomCode && !this.matchStartedFlag) {
        this.updateDiagnostics({
          dataChannelStatus: 'closed',
          step5Text: '5. Canal: [closed]',
        });
      }
    };
  }

  public closeSession(preserveDiagnosticsOnError = false): void {
    if (this.pingIntervalId !== null) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
    if (this.dataChannel) {
      try {
        this.dataChannel.close();
      } catch {
        // ignore
      }
      this.dataChannel = null;
    }
    if (this.pc) {
      try {
        this.pc.close();
      } catch {
        // ignore
      }
      this.pc = null;
    }
    this.currentRoomCode = null;
    this.role = null;
    this.localPlayerId = null;
    this.matchStartedFlag = false;
    this.remoteAnswerApplied = false;
    this.remoteOfferApplied = false;
    this.applyingRemoteDesc = false;
    this.addedRemoteCandidates.clear();
    this.pendingRemoteCandidates = [];
    this.localCandidateQueue = [];
    this.sentCandidateSet.clear();
    this.lastKnownDoc = null;
    if (!preserveDiagnosticsOnError) {
      this.diagnostics = createInitialP2PDiagnostics();
      const snapshot = this.getDiagnostics();
      this.diagnosticsListeners.forEach((cb) => cb(snapshot));
    }
  }
}

export const webrtcP2PManager = new WebRtcP2PManager();