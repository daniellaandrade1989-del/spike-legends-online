/**
 * Spike Legends Online — Gerenciador de Trilha Sonora Customizada (CustomAudioManager / AudioMixer)
 */
import type { ArenaId } from '../config/gameConfig';
import {
  computeShoeSqueakPitch,
  selectRandomShoeSqueakClipIndex,
  soundEngine,
  type CustomSfxSlot,
} from './soundEngine';

export type { CustomSfxSlot } from './soundEngine';

export type SceneAudioSlot =
  | 'MenuTheme'
  | 'Stage1_BGM'
  | 'Stage2_BGM'
  | 'Stage3_BGM'
  | 'Stage4_BGM'
  | 'Stage5_BGM'
  | 'Stage6_BGM'
  | 'Stage7_BGM';

export type AudioCloudCategory =
  | 'MenuMusic'
  | 'TitleBGM'
  | 'LobbyBGM'
  | 'TitleAnimation'
  | 'SplashAnimation'
  | 'CrowdAmbient'
  | 'ShoeSqueaks'
  | 'StageBGM'
  | 'SFX';

export const SCENE_AUDIO_SLOTS: ReadonlyArray<{
  slot: SceneAudioSlot;
  label: string;
  arenaId?: ArenaId;
}> = [
  { slot: 'MenuTheme', label: 'Tema do Menu Principal (MenuTheme)' },
  { slot: 'Stage1_BGM', label: 'Estágio 1 — Ginásio Oficial', arenaId: 'ginasio' },
  { slot: 'Stage2_BGM', label: 'Estágio 2 — Praia do Pôr do Sol', arenaId: 'praia' },
  { slot: 'Stage3_BGM', label: 'Estágio 3 — Quadra Escolar', arenaId: 'escola' },
  { slot: 'Stage4_BGM', label: 'Estágio 4 — Cobertura Neon Tóquio', arenaId: 'neon' },
  { slot: 'Stage5_BGM', label: 'Estágio 5 — Santuário da Montanha', arenaId: 'montanha' },
  { slot: 'Stage6_BGM', label: 'Estágio 6 — Templo de Kyoto', arenaId: 'templo' },
  { slot: 'Stage7_BGM', label: 'Estágio 7 — Festival de Verão', arenaId: 'festival' },
];

export const SFX_AUDIO_SLOTS: ReadonlyArray<{
  slot: CustomSfxSlot;
  label: string;
  description: string;
  multiSelect: boolean;
}> = [
  {
    slot: 'ShoeSqueaks',
    label: 'Rangido de Tênis na Quadra (ShoeSqueaks)',
    description: 'Selecione 1 ou mais clipes (.wav/.mp3/.ogg) — escolhe aleatoriamente com variação de pitch.',
    multiSelect: true,
  },
  {
    slot: 'ImpactSpike',
    label: 'Impacto de Corte / Ataque (ImpactSpike)',
    description: 'Tocado nos ataques, saques viagem e cortes perfeitos com pitch dinâmico.',
    multiSelect: false,
  },
  {
    slot: 'ImpactReceive',
    label: 'Manchete / Recepção (ImpactReceive)',
    description: 'Tocado nas defesas de manchete e levantamentos.',
    multiSelect: false,
  },
  {
    slot: 'FloorSlam',
    label: 'Bola no Chão / Ponto (FloorSlam)',
    description: 'Tocado quando a bola explode no piso da quadra.',
    multiSelect: false,
  },
  {
    slot: 'Whistle',
    label: 'Apito do Árbitro (Whistle)',
    description: 'Tocado na autorização de saque e marcação de ponto.',
    multiSelect: false,
  },
  {
    slot: 'Jump',
    label: 'Impulso de Salto (Jump)',
    description: 'Tocado ao saltar para bloquear ou cortar.',
    multiSelect: false,
  },
];

export const SUPPORTED_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg'] as const;
export const SUPPORTED_VIDEO_EXTENSIONS = ['.mp4', '.webm'] as const;
export const SUPPORTED_VIDEO_MIMES = ['video/mp4', 'video/webm'] as const;
export const SUPPORTED_AUDIO_MIMES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/ogg',
  'application/ogg',
] as const;

export interface CustomAudioTrackMeta {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdAtMs: number;
  url?: string;
  storageUrl?: string;
  category?: AudioCloudCategory;
}

export interface ShoeSqueakSoundClip {
  id: string;
  name: string;
  mimeType: string;
  buffer: ArrayBuffer;
  decoded: AudioBuffer | null;
  url?: string;
}

export interface CustomSoundtrackState {
  tracks: CustomAudioTrackMeta[];
  assignments: Record<SceneAudioSlot, string | null>;
  sfxAssignments: Record<CustomSfxSlot, string[]>;
  crowdTrackId: string | null;
  menuMusicUrl: string;
  titleBgmUrl: string;
  lobbyBgmUrl: string;
  titleAnimationUrl: string;
  splashAnimationUrl: string;
  crowdAmbientUrl: string;
  shoeSqueakUrls: string[];
  crowdVolume: number;
  shoeSqueakVolume: number;
  fadeOutSec: number;
  fadeInSec: number;
}

export interface SoundtrackTransitionEvent {
  fromSlot: SceneAudioSlot | null;
  toSlot: SceneAudioSlot;
  trackId: string | null;
  mode: 'custom' | 'procedural';
  fadeOutSec: number;
  fadeInSec: number;
  timestampMs: number;
}

export interface SoundtrackAudioBridge {
  ensureMusicBus: () => { ctx: AudioContext; inputNode: AudioNode } | null;
  getSfxPlaybackContext?: () => { ctx: AudioContext; sfxGain: number } | null;
  startProceduralWithFade: (track: 'menu' | 'match', fadeInSec: number) => void;
  stopProceduralWithFade: (fadeOutSec: number) => void;
  setCrowdForSlot: (isMatchSlot: boolean) => void;
  destroyDefaultMusic?: (keepCrowd: boolean) => void;
  setCustomExclusiveMode?: (active: boolean) => void;
  setCustomCrowdBuffer?: (buffer: AudioBuffer | null) => void;
  setCrowdVolume?: (volume: number) => void;
  setShoeSqueakVolume?: (volume: number) => void;
  getShoeSqueakVolume?: () => number;
}

export interface SoundtrackStorageAdapter {
  saveBuffer: (id: string, buffer: ArrayBuffer) => Promise<void>;
  loadBuffer: (id: string) => Promise<ArrayBuffer | null>;
  deleteBuffer: (id: string) => Promise<void>;
  saveState: (state: CustomSoundtrackState) => void;
  loadState: () => CustomSoundtrackState | null;
}

export interface RemoteAudioConfigPayload {
  configId: 'global';
  menuMusicUrl: string;
  titleBgmUrl?: string;
  lobbyBgmUrl?: string;
  titleAnimationUrl?: string;
  splashAnimationUrl?: string;
  crowdAmbientUrl: string;
  shoeSqueakUrls: string[];
  crowdTrackId: string;
  assignments: Record<string, string | null>;
  sfxAssignments: Record<string, string[]>;
  fadeOutSec: number;
  fadeInSec: number;
  crowdVolume: number;
  shoeSqueakVolume: number;
}

export interface RemoteAudioUploadRequest {
  id: string;
  name: string;
  mimeType: string;
  category: AudioCloudCategory;
  assignSlot?: string | null;
  dataBase64: string;
}

export interface RemoteAudioSyncAdapter {
  fetchConfig: () => Promise<{
    config: RemoteAudioConfigPayload;
    tracks: CustomAudioTrackMeta[];
  } | null>;
  uploadTrack: (
    req: RemoteAudioUploadRequest,
  ) => Promise<{ track: CustomAudioTrackMeta; config: RemoteAudioConfigPayload } | null>;
  saveConfig: (patch: Partial<RemoteAudioConfigPayload>) => Promise<RemoteAudioConfigPayload | null>;
  deleteTrack: (trackId: string) => Promise<RemoteAudioConfigPayload | null>;
  fetchAudioBufferByUrl: (url: string) => Promise<ArrayBuffer | null>;
}

const STORAGE_KEY = 'spike_legends_custom_soundtracks_v1';
const IDB_NAME = 'spike_legends_soundtrack_db';
const IDB_STORE = 'audio_buffers';

const DEFAULT_ASSIGNMENTS: Record<SceneAudioSlot, string | null> = {
  MenuTheme: null,
  Stage1_BGM: null,
  Stage2_BGM: null,
  Stage3_BGM: null,
  Stage4_BGM: null,
  Stage5_BGM: null,
  Stage6_BGM: null,
  Stage7_BGM: null,
};

const DEFAULT_SFX_ASSIGNMENTS: Record<CustomSfxSlot, string[]> = {
  ShoeSqueaks: [],
  ImpactSpike: [],
  ImpactReceive: [],
  FloorSlam: [],
  Whistle: [],
  Jump: [],
};

const ARENA_TO_STAGE_SLOT: Record<ArenaId, SceneAudioSlot> = {
  ginasio: 'Stage1_BGM',
  praia: 'Stage2_BGM',
  escola: 'Stage3_BGM',
  neon: 'Stage4_BGM',
  montanha: 'Stage5_BGM',
  templo: 'Stage6_BGM',
  festival: 'Stage7_BGM',
};

export function arenaToStageSlot(arenaId: ArenaId): SceneAudioSlot {
  return ARENA_TO_STAGE_SLOT[arenaId] ?? 'Stage1_BGM';
}

export type SoundtrackScreenState =
  | 'title'
  | 'menu'
  | 'lobby'
  | 'guide'
  | 'playing'
  | 'paused'
  | 'finished'
  | 'campaign_vn'
  | 'tournament'
  | 'gameover';

export function resolveSceneAudioSlot(
  screenState: SoundtrackScreenState,
  arenaId: ArenaId,
): SceneAudioSlot {
  if (screenState === 'playing' || screenState === 'paused' || screenState === 'finished') {
    return arenaToStageSlot(arenaId);
  }
  return 'MenuTheme';
}

export function isSupportedAudioFormat(fileName: string, mimeType = ''): boolean {
  const lowerName = fileName.trim().toLowerCase();
  const hasValidExt = SUPPORTED_AUDIO_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  if (hasValidExt) return true;
  const lowerMime = mimeType.trim().toLowerCase();
  return (SUPPORTED_AUDIO_MIMES as readonly string[]).includes(lowerMime);
}

export function isSupportedVideoFormat(fileName: string, mimeType = ''): boolean {
  const lowerName = fileName.trim().toLowerCase();
  const hasValidExt = SUPPORTED_VIDEO_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  if (hasValidExt) return true;
  const lowerMime = mimeType.trim().toLowerCase();
  return (SUPPORTED_VIDEO_MIMES as readonly string[]).includes(lowerMime);
}

export function isShoeSqueakOrCourtSfxTrack(
  name: string,
  category?: string | null,
): boolean {
  if (category === 'ShoeSqueaks' || category === 'SFX') {
    return true;
  }
  const clean = (name || '').trim().toLowerCase();
  if (!clean) return false;
  return /tenis|tênis|squeak|ranger|rangido|passo|sapato|shoe|apito|whistle/i.test(clean);
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buffer).toString('base64');
  }
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    chunks.push(String.fromCharCode.apply(null, Array.from(slice)));
  }
  return typeof btoa === 'function' ? btoa(chunks.join('')) : '';
}

const ADMIN_TOKEN_SESSION_KEY = 'spike_legends_admin_token_v1';
export const AUTHORIZED_ADMIN_EMAILS = ['daniellaandrade1989@gmail.com'] as const;

export const DEFAULT_ADMIN_URL_KEY = 'spike-admin-2025';
export const DEFAULT_ADMIN_7TAP_PASSWORD = 'spike-7taps-2025';
export const SECRET_TAP_REQUIRED_COUNT = 7;
export const SECRET_TAP_WINDOW_MS = 3000;

export function extractAdminKeyFromUrlSearch(search: string): string | null {
  if (!search || typeof search !== 'string') return null;
  try {
    const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
    const key = params.get('adminKey');
    return key && key.trim() ? key.trim() : null;
  } catch {
    return null;
  }
}

export function isAuthorizedAdminUserEmail(email?: string | null): boolean {
  if (!email || typeof email !== 'string') return false;
  const clean = email.trim().toLowerCase();
  return (AUTHORIZED_ADMIN_EMAILS as readonly string[]).includes(clean);
}

function getStoredAdminToken(): string | null {
  if (typeof window === 'undefined' || !('sessionStorage' in window)) return null;
  try {
    return window.sessionStorage.getItem(ADMIN_TOKEN_SESSION_KEY);
  } catch {
    return null;
  }
}

function setStoredAdminToken(token: string | null): void {
  if (typeof window === 'undefined' || !('sessionStorage' in window)) return;
  try {
    if (token) {
      window.sessionStorage.setItem(ADMIN_TOKEN_SESSION_KEY, token);
    } else {
      window.sessionStorage.removeItem(ADMIN_TOKEN_SESSION_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

function buildAdminHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extra ?? {}) };
  const token = getStoredAdminToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers['x-admin-token'] = token;
  }
  return headers;
}

function createBrowserRemoteSyncAdapter(): RemoteAudioSyncAdapter {
  const hasFetch = typeof fetch === 'function' && typeof window !== 'undefined';

  return {
    fetchConfig: async () => {
      if (!hasFetch) return null;
      try {
        const res = await fetch('/api/audio-settings', {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });
        if (!res.ok) return null;
        const json = (await res.json()) as {
          ok?: boolean;
          settings?: RemoteAudioConfigPayload;
          config?: RemoteAudioConfigPayload;
          tracks?: CustomAudioTrackMeta[];
        };
        const cfg = json?.settings ?? json?.config;
        if (!json || !json.ok || !cfg) return null;
        return {
          config: cfg,
          tracks: Array.isArray(json.tracks) ? json.tracks : [],
        };
      } catch {
        return null;
      }
    },

    uploadTrack: async (req: RemoteAudioUploadRequest) => {
      if (!hasFetch) return null;
      const res = await fetch('/api/upload-audio', {
        method: 'POST',
        headers: buildAdminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(req),
      });
      if (res.status === 403) {
        throw new Error('403 Forbidden: Apenas o Administrador pode fazer upload de áudios.');
      }
      if (!res.ok) return null;
      const json = (await res.json()) as {
        ok?: boolean;
        track?: CustomAudioTrackMeta;
        settings?: RemoteAudioConfigPayload;
        config?: RemoteAudioConfigPayload;
      };
      const cfg = json?.settings ?? json?.config;
      if (!json || !json.ok || !json.track || !cfg) return null;
      return { track: json.track, config: cfg };
    },

    saveConfig: async (patch: Partial<RemoteAudioConfigPayload>) => {
      if (!hasFetch) return null;
      const token = getStoredAdminToken();
      if (!token) return null;
      try {
        const res = await fetch('/api/audio-settings', {
          method: 'POST',
          headers: buildAdminHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(patch),
        });
        if (!res.ok) return null;
        const json = (await res.json()) as {
          ok?: boolean;
          settings?: RemoteAudioConfigPayload;
          config?: RemoteAudioConfigPayload;
        };
        const cfg = json?.settings ?? json?.config;
        return json?.ok && cfg ? cfg : null;
      } catch {
        return null;
      }
    },

    deleteTrack: async (trackId: string) => {
      if (!hasFetch) return null;
      const token = getStoredAdminToken();
      if (!token) return null;
      try {
        const res = await fetch(`/api/audio/tracks/${encodeURIComponent(trackId)}`, {
          method: 'DELETE',
          headers: buildAdminHeaders(),
        });
        if (!res.ok) return null;
        const json = (await res.json()) as {
          ok?: boolean;
          settings?: RemoteAudioConfigPayload;
          config?: RemoteAudioConfigPayload;
        };
        const cfg = json?.settings ?? json?.config;
        return json?.ok && cfg ? cfg : null;
      } catch {
        return null;
      }
    },

    fetchAudioBufferByUrl: async (url: string) => {
      if (!hasFetch || !url) return null;
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return await res.arrayBuffer();
      } catch {
        return null;
      }
    },
  };
}

function createBrowserStorageAdapter(): SoundtrackStorageAdapter {
  const memoryFallback = new Map<string, ArrayBuffer>();

  const openDb = (): Promise<IDBDatabase | null> => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      try {
        const req = window.indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  };

  return {
    saveBuffer: async (id: string, buffer: ArrayBuffer) => {
      memoryFallback.set(id, buffer);
      const db = await openDb();
      if (!db) return;
      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(IDB_STORE, 'readwrite');
          tx.objectStore(IDB_STORE).put(buffer, id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    },

    loadBuffer: async (id: string) => {
      const mem = memoryFallback.get(id);
      if (mem) return mem;
      const db = await openDb();
      if (!db) return null;
      return new Promise<ArrayBuffer | null>((resolve) => {
        try {
          const tx = db.transaction(IDB_STORE, 'readonly');
          const req = tx.objectStore(IDB_STORE).get(id);
          req.onsuccess = () => {
            const res = req.result as ArrayBuffer | undefined;
            if (res) memoryFallback.set(id, res);
            resolve(res ?? null);
          };
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    },

    deleteBuffer: async (id: string) => {
      memoryFallback.delete(id);
      const db = await openDb();
      if (!db) return;
      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(IDB_STORE, 'readwrite');
          tx.objectStore(IDB_STORE).delete(id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    },

    saveState: (state: CustomSoundtrackState) => {
      if (typeof window === 'undefined' || !('localStorage' in window)) return;
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Ignora erro de quota
      }
    },

    loadState: () => {
      if (typeof window === 'undefined' || !('localStorage' in window)) return null;
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<CustomSoundtrackState>;
        return {
          tracks: Array.isArray(parsed.tracks) ? parsed.tracks : [],
          assignments: { ...DEFAULT_ASSIGNMENTS, ...(parsed.assignments ?? {}) },
          sfxAssignments: { ...DEFAULT_SFX_ASSIGNMENTS, ...(parsed.sfxAssignments ?? {}) },
          crowdTrackId: typeof parsed.crowdTrackId === 'string' ? parsed.crowdTrackId : null,
          menuMusicUrl: typeof parsed.menuMusicUrl === 'string' ? parsed.menuMusicUrl : '',
          titleBgmUrl: typeof parsed.titleBgmUrl === 'string' ? parsed.titleBgmUrl : '',
          lobbyBgmUrl: typeof parsed.lobbyBgmUrl === 'string' ? parsed.lobbyBgmUrl : '',
          titleAnimationUrl: typeof parsed.titleAnimationUrl === 'string' ? parsed.titleAnimationUrl : '',
          splashAnimationUrl: typeof parsed.splashAnimationUrl === 'string' ? parsed.splashAnimationUrl : '',
          crowdAmbientUrl: typeof parsed.crowdAmbientUrl === 'string' ? parsed.crowdAmbientUrl : '',
          shoeSqueakUrls: Array.isArray(parsed.shoeSqueakUrls) ? parsed.shoeSqueakUrls : [],
          crowdVolume: typeof parsed.crowdVolume === 'number' ? parsed.crowdVolume : 0.65,
          shoeSqueakVolume: typeof parsed.shoeSqueakVolume === 'number' ? parsed.shoeSqueakVolume : 0.85,
          fadeOutSec: typeof parsed.fadeOutSec === 'number' ? parsed.fadeOutSec : 0.65,
          fadeInSec: typeof parsed.fadeInSec === 'number' ? parsed.fadeInSec : 0.65,
        };
      } catch {
        return null;
      }
    },
  };
}

function createDefaultBridge(): SoundtrackAudioBridge {
  return {
    ensureMusicBus: () => soundEngine.ensureContextAndMusicBus(),
    getSfxPlaybackContext: () => {
      const ctx = soundEngine.getOrCreateContext();
      if (!ctx) return null;
      return { ctx, sfxGain: soundEngine.getEffectiveSfxVolume() };
    },
    startProceduralWithFade: (track, fadeInSec) => soundEngine.startMusicWithFade(track, fadeInSec),
    stopProceduralWithFade: (fadeOutSec) => soundEngine.stopMusicWithFade(fadeOutSec),
    setCrowdForSlot: (isMatchSlot) => {
      if (isMatchSlot) {
        soundEngine.startCrowdAmbience();
      } else {
        soundEngine.stopCrowdAmbience();
      }
    },
    destroyDefaultMusic: (keepCrowd) => soundEngine.destroyDefaultMusic(keepCrowd),
    setCustomExclusiveMode: (active) => soundEngine.setCustomExclusiveMode(active),
    setCustomCrowdBuffer: (buffer) => soundEngine.setCustomCrowdBuffer(buffer),
    setCrowdVolume: (vol) => soundEngine.setCrowdVolume(vol),
    setShoeSqueakVolume: (vol) => soundEngine.setShoeSqueakVolume(vol),
    getShoeSqueakVolume: () => soundEngine.getShoeSqueakVolume(),
  };
}

interface ActiveCustomSource {
  trackId: string;
  slot: SceneAudioSlot;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

export class CustomSoundtrackManager {
  private state: CustomSoundtrackState;
  private readonly bridge: SoundtrackAudioBridge;
  private readonly storage: SoundtrackStorageAdapter;
  private readonly remoteSync: RemoteAudioSyncAdapter;
  private readonly rng: () => number;
  private readonly memoryBuffers = new Map<string, ArrayBuffer>();
  private readonly decodedCache = new Map<string, AudioBuffer>();
  private readonly listeners = new Set<() => void>();

  public menuMusic: AudioBuffer | null = null;
  public titleBGM: AudioBuffer | null = null;
  public lobbyBGM: AudioBuffer | null = null;
  public crowdMusic: AudioBuffer | null = null;
  public shoeSqueaks: AudioBuffer[] = [];
  private activeBgmKey: 'titleBGM' | 'lobbyBGM' | 'custom' | 'none' = 'none';
  private crowdLoopActive = false;
  private crowdLoop = true;
  private crowdMuted = false;
  private crowdVol = 0.65;
  private crowdCurrentTime = 0;
  private crowdPlayGeneration = 0;
  private crowdAudioElement: HTMLAudioElement | null = null;
  private readonly activeCrowdAudioElements = new Set<HTMLAudioElement>();
  private loadedCrowdUrl = '';
  private silentSplashMode = false;

  public setSilentSplashMode(silent: boolean): void {
    this.silentSplashMode = silent;
    if (silent) {
      this.bgmSource.Stop();
    }
  }

  public computeEffectiveCrowdVolume(): number {
    if (this.crowdMuted || soundEngine.isMuted()) {
      return 0;
    }
    const adminVol = Math.max(
      0,
      Math.min(1, Number.isFinite(this.state.crowdVolume) ? this.state.crowdVolume : 0.65),
    );
    const userVol = Math.max(0, Math.min(1, soundEngine.getEffectiveSfxVolume()));
    return Number((adminVol * userVol).toFixed(4));
  }

  public syncCrowdSourceVolume(): number {
    const isMuted = this.crowdMuted || soundEngine.isMuted();
    const effectiveVol = this.computeEffectiveCrowdVolume();
    this.crowdVol = effectiveVol;
    if (this.crowdAudioElement) {
      this.crowdAudioElement.muted = isMuted;
      this.crowdAudioElement.volume = effectiveVol;
    }
    this.bridge.setCrowdVolume?.(this.state.crowdVolume);
    return effectiveVol;
  }

  public resolveCrowdAudioUrl(): string {
    if (this.state.crowdAmbientUrl && this.state.crowdAmbientUrl.trim()) {
      return this.state.crowdAmbientUrl.trim();
    }
    if (this.state.crowdTrackId) {
      const assigned = this.state.tracks.find((t) => t.id === this.state.crowdTrackId);
      if (assigned?.url) return assigned.url;
      return `/api/audio/stream/${this.state.crowdTrackId}`;
    }
    const candidate = this.state.tracks.find(
      (t) =>
        t.category === 'CrowdAmbient' ||
        /plateia|platéia|torcida|ginasio|ginásio|ginagio|crowd/i.test(t.name || ''),
    );
    if (candidate) {
      if (!this.state.crowdTrackId) {
        this.state.crowdTrackId = candidate.id;
      }
      const url = candidate.url || `/api/audio/stream/${candidate.id}`;
      this.state.crowdAmbientUrl = url;
      return url;
    }
    return '';
  }

  private ensureCrowdAudioElement(): HTMLAudioElement | null {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') {
      return null;
    }
    if (!this.crowdAudioElement) {
      const el = new Audio();
      el.preload = 'auto';
      el.loop = true;
      this.crowdAudioElement = el;
      this.activeCrowdAudioElements.add(el);
    }
    return this.crowdAudioElement;
  }

  private forceTerminateActiveCrowdInstances(): void {
    if (this.crowdAudioElement) {
      try {
        this.crowdAudioElement.pause();
        this.crowdAudioElement.currentTime = 0;
        this.crowdAudioElement.src = '';
        this.crowdAudioElement.removeAttribute('src');
      } catch {
        // ignora erro em elemento de mídia
      }
    }
    for (const el of this.activeCrowdAudioElements) {
      try {
        el.pause();
        el.currentTime = 0;
        el.src = '';
        el.removeAttribute('src');
      } catch {
        // ignora
      }
    }
    this.loadedCrowdUrl = '';
    this.crowdCurrentTime = 0;
    this.bridge.setCrowdForSlot(false);
    soundEngine.stopCrowdAmbience();
  }

  public ShoeSqueakSounds: ShoeSqueakSoundClip[] = [];
  private lastShoeSqueakArrayIndex = -1;

  private shoeSqueakSource: AudioBufferSourceNode | null = null;
  private readonly activeSfxSources = new Set<AudioBufferSourceNode>();
  private currentScreenState: SoundtrackScreenState = 'title';

  private activeCustom: ActiveCustomSource | null = null;
  private previewCustom: { trackId: string; source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private activeSlot: SceneAudioSlot | null = null;
  private activeMode: 'custom' | 'procedural' | 'idle' = 'idle';
  private lastTransition: SoundtrackTransitionEvent | null = null;
  private lastSfxIndices = new Map<CustomSfxSlot, number>();
  private lastCustomSfxEvent: { slot: CustomSfxSlot; trackId: string; pitch: number; timestampMs: number } | null = null;
  private isCloudSynced = false;
  private isAdmin = false;
  private adminToken: string | null = null;

  constructor(
    bridge?: SoundtrackAudioBridge,
    storage?: SoundtrackStorageAdapter,
    rng: () => number = Math.random,
    remoteSync?: RemoteAudioSyncAdapter,
  ) {
    this.bridge = bridge ?? createDefaultBridge();
    this.storage = storage ?? createBrowserStorageAdapter();
    this.remoteSync = remoteSync ?? createBrowserRemoteSyncAdapter();
    this.rng = rng;

    const existingToken = getStoredAdminToken();
    if (existingToken) {
      this.adminToken = existingToken;
      this.isAdmin = true;
    }

    const loaded = this.storage.loadState();
    this.state = loaded ?? {
      tracks: [],
      assignments: { ...DEFAULT_ASSIGNMENTS },
      sfxAssignments: { ...DEFAULT_SFX_ASSIGNMENTS },
      crowdTrackId: null,
      menuMusicUrl: '',
      titleBgmUrl: '',
      lobbyBgmUrl: '',
      titleAnimationUrl: '',
      splashAnimationUrl: '',
      crowdAmbientUrl: '',
      shoeSqueakUrls: [],
      crowdVolume: 0.65,
      shoeSqueakVolume: 0.85,
      fadeOutSec: 0.65,
      fadeInSec: 0.65,
    };

    this.sanitizeSfxTracksFromBgmSlots();
    this.recomputeLocalUrls();
    this.syncCrowdSourceVolume();
    this.bridge.setShoeSqueakVolume?.(this.state.shoeSqueakVolume);
  }

  public readonly bgmSource = (() => {
    const self = this;
    return {
      get isPlaying(): boolean {
        return self.hasActiveBgmSource() || soundEngine.bgmAudioSource.isPlaying;
      },
      Stop: (): void => {
        self.forceStopBgmSourceImmediate(true);
      },
      Play: (): void => {
        void self.transitionToSlot('MenuTheme', true);
      },
    };
  })();

  public readonly bgmAudioSource = this.bgmSource;

  public readonly crowdSource = (() => {
    const self = this;
    return {
      get isPlaying(): boolean {
        return self.crowdLoopActive;
      },
      get loop(): boolean {
        return self.crowdLoop;
      },
      set loop(val: boolean) {
        self.crowdLoop = Boolean(val);
        if (self.crowdAudioElement) {
          self.crowdAudioElement.loop = self.crowdLoop;
        }
      },
      get muted(): boolean {
        return self.crowdMuted || soundEngine.isMuted();
      },
      set muted(val: boolean) {
        self.crowdMuted = Boolean(val);
        self.syncCrowdSourceVolume();
      },
      get volume(): number {
        return self.crowdVol;
      },
      set volume(val: number) {
        const clamped = Math.max(0, Math.min(1, Number.isFinite(val) ? val : 0));
        self.crowdVol = clamped;
        if (self.crowdAudioElement) {
          self.crowdAudioElement.volume = clamped;
        }
      },
      get currentTime(): number {
        if (self.crowdAudioElement) {
          return self.crowdAudioElement.currentTime;
        }
        return self.crowdCurrentTime;
      },
      set currentTime(val: number) {
        const nextTime = Math.max(0, Number.isFinite(val) ? val : 0);
        self.crowdCurrentTime = nextTime;
        if (self.crowdAudioElement) {
          try {
            self.crowdAudioElement.currentTime = nextTime;
          } catch {
            // ignora erro caso o elemento ainda não tenha metadados carregados
          }
        }
      },
      get src(): string {
        return self.resolveCrowdAudioUrl();
      },
      load: (): void => {
        const targetUrl = self.resolveCrowdAudioUrl();
        const el = self.ensureCrowdAudioElement();
        if (el && targetUrl) {
          if (self.loadedCrowdUrl !== targetUrl || !el.src) {
            el.src = targetUrl;
            el.loop = self.crowdLoop;
            el.preload = 'auto';
            try {
              el.load();
              self.loadedCrowdUrl = targetUrl;
            } catch (err) {
              console.error('Erro crowdSource.load():', err);
            }
          }
        }
      },
      play: async (): Promise<void> => {
        self.crowdPlayGeneration += 1;
        const myGeneration = self.crowdPlayGeneration;
        self.forceTerminateActiveCrowdInstances();

        self.crowdLoopActive = true;
        self.crowdLoop = true;
        const effectiveVol = self.syncCrowdSourceVolume();

        const targetUrl = self.resolveCrowdAudioUrl();
        const el = self.ensureCrowdAudioElement();

        if (el && targetUrl) {
          try {
            el.onerror = () => {
              if (
                myGeneration === self.crowdPlayGeneration &&
                self.crowdLoopActive &&
                self.isGameplayMatchState()
              ) {
                self.loadedCrowdUrl = '';
                self.bridge.setCrowdForSlot(true);
                soundEngine.startCrowdAmbience();
              }
            };
            el.src = targetUrl;
            el.preload = 'auto';
            el.loop = true;
            el.muted = self.crowdMuted || soundEngine.isMuted();
            el.volume = effectiveVol;
            self.loadedCrowdUrl = targetUrl;

            await el.play();

            if (
              myGeneration !== self.crowdPlayGeneration ||
              !self.crowdLoopActive ||
              !self.isGameplayMatchState()
            ) {
              self.stopCrowd();
            }
            return;
          } catch {
            // Se falhar ao carregar o áudio remoto (ex: cota do Firestore), cai para o som ambiente interno
            try {
              el.pause();
              el.removeAttribute('src');
            } catch {
              // ignore
            }
            self.loadedCrowdUrl = '';
          }
        }

        // Fallback para som ambiente interno de plateia
        try {
          if (self.state.crowdTrackId && !soundEngine.hasCustomCrowdBuffer()) {
            await self.preloadAndApplyCrowdBuffer(self.state.crowdTrackId);
          }
          if (
            myGeneration !== self.crowdPlayGeneration ||
            !self.crowdLoopActive ||
            !self.isGameplayMatchState()
          ) {
            self.stopCrowd();
            return;
          }
          self.bridge.setCrowdForSlot(true);
          soundEngine.startCrowdAmbience();
        } catch (err) {
          console.error('Erro crowdSource fallback:', err);
        }
      },
      Play: (): void => {
        void self.crowdSource.play();
      },
      pause: (): void => {
        self.crowdLoopActive = false;
        if (self.crowdAudioElement) {
          try {
            self.crowdAudioElement.pause();
          } catch {
            // ignora erro ao pausar
          }
        }
        for (const el of self.activeCrowdAudioElements) {
          try {
            el.pause();
          } catch {
            // ignora
          }
        }
        self.bridge.setCrowdForSlot(false);
        soundEngine.stopCrowdAmbience();
      },
      Stop: (): void => {
        self.stopCrowd();
      },
    };
  })();

  public stopCrowd(): void {
    this.crowdPlayGeneration += 1;
    this.crowdLoopActive = false;
    this.crowdSource.pause();
    this.crowdSource.currentTime = 0;
    this.forceTerminateActiveCrowdInstances();
  }

  public readonly sfxSource = (() => {
    const self = this;
    return {
      isReady: true,
      Stop: (): void => {
        self.stopAllActiveSfxSources();
      },
    };
  })();

  public readonly sfxAudioSource = this.sfxSource;

  public hasActiveBgmSource(): boolean {
    return (
      this.activeCustom !== null ||
      this.previewCustom !== null ||
      this.activeMode !== 'idle' ||
      this.activeSlot !== null
    );
  }

  public forceStopBgmSourceImmediate(keepCrowd = true): void {
    this.stopPreview();
    this.bridge.stopProceduralWithFade(0);
    this.bridge.destroyDefaultMusic?.(true);
    if (!keepCrowd) {
      this.stopCrowd();
    }
    soundEngine.forceStopMatchBgm();

    if (this.activeCustom) {
      try {
        this.activeCustom.source.loop = false;
        this.activeCustom.source.stop();
        this.activeCustom.source.disconnect();
        this.activeCustom.gain.disconnect();
      } catch {
        // Ignore already stopped source
      }
      this.activeCustom = null;
    }
    this.activeSlot = null;
    this.activeMode = 'idle';
  }

  public StartMatchCrowdAmbience(): void {
    if (
      this.currentScreenState !== 'playing' &&
      this.currentScreenState !== 'paused' &&
      this.currentScreenState !== 'guide'
    ) {
      this.currentScreenState = 'playing';
      soundEngine.setScreenState('playing');
    }
    this.bgmSource.Stop();
    this.activeBgmKey = 'none';
    this.crowdSource.loop = true;
    this.crowdMuted = false;
    this.syncCrowdSourceVolume();
    void this.crowdSource.play().catch((err) => {
      console.error('Erro crowdSource:', err);
    });
    this.emit();
  }

  public StopMatchBackgroundMusic(): void {
    this.StartMatchCrowdAmbience();
  }

  public isGameplayMatchState(): boolean {
    if (typeof document !== 'undefined' && document.body?.dataset?.state) {
      const domState = document.body?.dataset?.state;
      if (domState === 'playing' || domState === 'paused' || domState === 'guide') {
        return true;
      }
    }
    return (
      this.currentScreenState === 'playing' ||
      this.currentScreenState === 'paused' ||
      this.currentScreenState === 'guide'
    );
  }

  public setScreenState(screenState: SoundtrackScreenState): void {
    this.currentScreenState = screenState;
    soundEngine.setScreenState(screenState);
    if (screenState === 'playing' || screenState === 'paused' || screenState === 'guide') {
      this.StartMatchCrowdAmbience();
      if (screenState !== 'playing') {
        this.stopAllActiveSfxSources();
      }
    } else {
      this.stopCrowd();
      this.stopAllActiveSfxSources();
    }
  }

  public getScreenState(): SoundtrackScreenState {
    return this.currentScreenState;
  }

  public isMenuOrNonGameplayState(): boolean {
    if (typeof document !== 'undefined' && document.body?.dataset?.state) {
      const domState = document.body.dataset.state;
      if (domState !== 'playing') {
        return true;
      }
    }
    return this.currentScreenState !== 'playing';
  }

  public getShoeSqueakSource(): AudioBufferSourceNode | null {
    return this.shoeSqueakSource;
  }

  public stopAllActiveSfxSources(): void {
    if (this.shoeSqueakSource) {
      try {
        this.shoeSqueakSource.loop = false;
        this.shoeSqueakSource.stop();
        this.shoeSqueakSource.disconnect();
      } catch {
        // Ignore already stopped source
      }
      this.shoeSqueakSource = null;
    }
    for (const src of this.activeSfxSources) {
      try {
        src.loop = false;
        src.stop();
        src.disconnect();
      } catch {
        // Ignore already stopped source
      }
    }
    this.activeSfxSources.clear();
    soundEngine.stopShoeSqueakSources();
  }

  public StopAllGameplaySounds(): void {
    this.currentScreenState = 'menu';
    soundEngine.setScreenState('menu');
    this.sfxSource.Stop();
    this.stopCrowd();
    void this.SwitchBGM('lobbyBGM');
  }

  private sanitizeSfxTracksFromBgmSlots(): boolean {
    let modified = false;
    const sfxSqueaks = new Set<string>(this.state.sfxAssignments.ShoeSqueaks ?? []);

    for (const track of this.state.tracks) {
      if (isShoeSqueakOrCourtSfxTrack(track.name, track.category)) {
        if (track.category !== 'ShoeSqueaks') {
          track.category = 'ShoeSqueaks';
          modified = true;
        }
      }
    }

    for (const { slot } of SCENE_AUDIO_SLOTS) {
      const assignedId = this.state.assignments[slot];
      if (!assignedId) continue;
      const trk = this.state.tracks.find((t) => t.id === assignedId);
      if (
        sfxSqueaks.has(assignedId) ||
        (trk && isShoeSqueakOrCourtSfxTrack(trk.name, trk.category))
      ) {
        this.state.assignments[slot] = null;
        sfxSqueaks.add(assignedId);
        modified = true;
      }
    }

    if (modified) {
      this.state.sfxAssignments.ShoeSqueaks = Array.from(sfxSqueaks);
    }
    return modified;
  }

  private secretTapTimestamps: number[] = [];

  public isAdminUser(): boolean {
    return this.isAdmin;
  }

  public getAdminToken(): string | null {
    return this.adminToken;
  }

  public setAdminSession(isAdmin: boolean, token: string | null): void {
    this.isAdmin = isAdmin;
    this.adminToken = isAdmin ? token : null;
    setStoredAdminToken(this.adminToken);
    this.emit();
  }

  public logoutAdmin(): void {
    this.setAdminSession(false, null);
  }

  public async checkUrlAdminKey(searchOverride?: string): Promise<boolean> {
    const rawSearch =
      searchOverride !== undefined
        ? searchOverride
        : typeof window !== 'undefined'
          ? window.location.search
          : '';
    const candidateKey = extractAdminKeyFromUrlSearch(rawSearch);
    if (!candidateKey) {
      return this.isAdmin;
    }

    if (
      searchOverride === undefined &&
      typeof window !== 'undefined' &&
      window.history?.replaceState
    ) {
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has('adminKey')) {
          url.searchParams.delete('adminKey');
          const nextSearch = url.searchParams.toString();
          const cleanUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash}`;
          window.history.replaceState({}, document.title, cleanUrl);
        }
      } catch {
        // Ignora erro de URL em ambiente restrito
      }
    }

    if (typeof fetch !== 'function' || typeof window === 'undefined') {
      if (candidateKey === DEFAULT_ADMIN_URL_KEY) {
        this.setAdminSession(true, candidateKey);
        return true;
      }
      return false;
    }

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminKey: candidateKey }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        isAdmin?: boolean;
        adminToken?: string;
      };
      if (res.ok && json.ok && json.adminToken) {
        this.setAdminSession(true, json.adminToken);
        return true;
      }
    } catch {
      if (candidateKey === DEFAULT_ADMIN_URL_KEY) {
        this.setAdminSession(true, candidateKey);
        return true;
      }
    }

    return false;
  }

  public registerSecretVersionTap(nowMs = Date.now()): boolean {
    this.secretTapTimestamps = this.secretTapTimestamps.filter(
      (t) => nowMs - t >= 0 && nowMs - t <= SECRET_TAP_WINDOW_MS,
    );
    this.secretTapTimestamps.push(nowMs);
    if (this.secretTapTimestamps.length >= SECRET_TAP_REQUIRED_COUNT) {
      this.secretTapTimestamps = [];
      return true;
    }
    return false;
  }

  public resetSecretVersionTaps(): void {
    this.secretTapTimestamps = [];
  }

  public async authenticateAdminWithPassword(
    password: string,
    email?: string | null,
  ): Promise<{ ok: boolean; error?: string }> {
    const cleanPassword = password.trim();
    if (!cleanPassword) {
      return { ok: false, error: 'Senha inválida.' };
    }
    if (typeof fetch !== 'function' || typeof window === 'undefined') {
      if (
        cleanPassword === DEFAULT_ADMIN_7TAP_PASSWORD ||
        cleanPassword === DEFAULT_ADMIN_URL_KEY
      ) {
        this.setAdminSession(true, cleanPassword);
        return { ok: true };
      }
      return { ok: false, error: '403 Forbidden' };
    }
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: cleanPassword, email: email ?? undefined }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        isAdmin?: boolean;
        adminToken?: string;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.adminToken) {
        return {
          ok: false,
          error: json.error || '403 Forbidden: Senha de Administrador incorreta.',
        };
      }
      this.setAdminSession(true, json.adminToken);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Erro de conexão ao validar credencial de Admin.' };
    }
  }

  public async syncAdminFromUserEmail(email?: string | null): Promise<boolean> {
    if (!isAuthorizedAdminUserEmail(email)) {
      return this.isAdmin;
    }
    if (typeof fetch !== 'function' || typeof window === 'undefined') {
      this.setAdminSession(true, 'admin_email_verified');
      return true;
    }
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email?.trim().toLowerCase() }),
      });
      if (!res.ok) return this.isAdmin;
      const json = (await res.json()) as { ok?: boolean; adminToken?: string };
      if (json.ok && json.adminToken) {
        this.setAdminSession(true, json.adminToken);
        return true;
      }
    } catch {
      // ignore network error
    }
    return this.isAdmin;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    this.storage.saveState(this.state);
    this.listeners.forEach((fn) => fn());
  }

  private recomputeLocalUrls(): void {
    const menuId = this.state.assignments.MenuTheme;
    const menuTrack = menuId ? this.state.tracks.find((t) => t.id === menuId) : undefined;
    this.state.menuMusicUrl = menuTrack?.url ?? '';
    if (!this.state.titleBgmUrl) {
      this.state.titleBgmUrl = this.state.menuMusicUrl;
    }
    if (!this.state.lobbyBgmUrl) {
      this.state.lobbyBgmUrl = this.state.menuMusicUrl;
    }

    const crowdId = this.state.crowdTrackId;
    const crowdTrack = crowdId ? this.state.tracks.find((t) => t.id === crowdId) : undefined;
    this.state.crowdAmbientUrl = crowdTrack?.url ?? '';

    const squeakIds = this.state.sfxAssignments.ShoeSqueaks ?? [];
    const urls: string[] = [];
    for (const id of squeakIds) {
      const trk = this.state.tracks.find((t) => t.id === id);
      if (trk?.url) urls.push(trk.url);
    }
    this.state.shoeSqueakUrls = urls;
  }

  private syncConfigToCloudInBackground(): void {
    this.recomputeLocalUrls();
    void this.remoteSync
      .saveConfig({
        titleBgmUrl: this.state.titleBgmUrl,
        lobbyBgmUrl: this.state.lobbyBgmUrl,
        titleAnimationUrl: this.state.titleAnimationUrl,
        splashAnimationUrl: this.state.splashAnimationUrl,
        crowdTrackId: this.state.crowdTrackId ?? '',
        assignments: { ...this.state.assignments },
        sfxAssignments: { ...this.state.sfxAssignments },
        fadeOutSec: this.state.fadeOutSec,
        fadeInSec: this.state.fadeInSec,
        crowdVolume: this.state.crowdVolume,
        shoeSqueakVolume: this.state.shoeSqueakVolume,
      })
      .then((remoteCfg) => {
        if (remoteCfg) {
          this.isCloudSynced = true;
        }
      })
      .catch(() => {});
  }

  public getState(): CustomSoundtrackState {
    return {
      tracks: [...this.state.tracks],
      assignments: { ...this.state.assignments },
      sfxAssignments: {
        ShoeSqueaks: [...(this.state.sfxAssignments.ShoeSqueaks ?? [])],
        ImpactSpike: [...(this.state.sfxAssignments.ImpactSpike ?? [])],
        ImpactReceive: [...(this.state.sfxAssignments.ImpactReceive ?? [])],
        FloorSlam: [...(this.state.sfxAssignments.FloorSlam ?? [])],
        Whistle: [...(this.state.sfxAssignments.Whistle ?? [])],
        Jump: [...(this.state.sfxAssignments.Jump ?? [])],
      },
      crowdTrackId: this.state.crowdTrackId,
      menuMusicUrl: this.state.menuMusicUrl,
      titleBgmUrl: this.state.titleBgmUrl,
      lobbyBgmUrl: this.state.lobbyBgmUrl,
      titleAnimationUrl: this.state.titleAnimationUrl,
      splashAnimationUrl: this.state.splashAnimationUrl,
      crowdAmbientUrl: this.state.crowdAmbientUrl,
      shoeSqueakUrls: [...this.state.shoeSqueakUrls],
      crowdVolume: this.state.crowdVolume,
      shoeSqueakVolume: this.state.shoeSqueakVolume,
      fadeOutSec: this.state.fadeOutSec,
      fadeInSec: this.state.fadeInSec,
    };
  }

  public getStatus(): {
    activeSlot: SceneAudioSlot | null;
    activeMode: 'custom' | 'procedural' | 'idle';
    activeTrackId: string | null;
    previewTrackId: string | null;
    isPlayingCustom: boolean;
    lastTransition: SoundtrackTransitionEvent | null;
    isCloudSynced: boolean;
  } {
    return {
      activeSlot: this.activeSlot,
      activeMode: this.activeMode,
      activeTrackId: this.activeCustom?.trackId ?? null,
      previewTrackId: this.previewCustom?.trackId ?? null,
      isPlayingCustom: this.activeCustom !== null,
      lastTransition: this.lastTransition,
      isCloudSynced: this.isCloudSynced,
    };
  }

  public setFadeDuration(fadeOutSec: number, fadeInSec = fadeOutSec): void {
    this.state.fadeOutSec = Math.max(0.1, Math.min(3.0, Number(fadeOutSec) || 0.65));
    this.state.fadeInSec = Math.max(0.1, Math.min(3.0, Number(fadeInSec) || 0.65));
    this.emit();
    this.syncConfigToCloudInBackground();
  }

  public setCrowdVolume(volume: number): void {
    this.state.crowdVolume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0.65));
    this.syncCrowdSourceVolume();
    this.emit();
    this.syncConfigToCloudInBackground();
  }

  public setShoeSqueakVolume(volume: number): void {
    this.state.shoeSqueakVolume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0.85));
    this.bridge.setShoeSqueakVolume?.(this.state.shoeSqueakVolume);
    this.emit();
    this.syncConfigToCloudInBackground();
  }

  public hasTrackForSlot(slot: SceneAudioSlot): boolean {
    const id = this.state.assignments[slot];
    if (!id) return false;
    return this.state.tracks.some((t) => t.id === id);
  }

  public getAssignedTrack(slot: SceneAudioSlot): CustomAudioTrackMeta | null {
    const id = this.state.assignments[slot];
    if (!id) return null;
    return this.state.tracks.find((t) => t.id === id) ?? null;
  }

  public getAssignedCrowdTrack(): CustomAudioTrackMeta | null {
    const id = this.state.crowdTrackId;
    if (!id) return null;
    return this.state.tracks.find((t) => t.id === id) ?? null;
  }

  public assignCrowdTrack(trackId: string | null): void {
    if (trackId && !this.state.tracks.some((t) => t.id === trackId)) {
      return;
    }
    this.state.crowdTrackId = trackId;
    this.recomputeLocalUrls();
    this.emit();
    this.syncConfigToCloudInBackground();

    if (trackId) {
      void this.preloadAndApplyCrowdBuffer(trackId);
    } else {
      this.bridge.setCustomCrowdBuffer?.(null);
    }
  }

  private async preloadAndApplyCrowdBuffer(trackId: string): Promise<void> {
    const buffer = await this.ensureTrackArrayBuffer(trackId);
    if (!buffer) {
      this.bridge.setCustomCrowdBuffer?.(null);
      return;
    }
    const sfxCtx = this.bridge.getSfxPlaybackContext?.()?.ctx ?? this.bridge.ensureMusicBus()?.ctx;
    if (!sfxCtx) return;

    try {
      let decoded = this.decodedCache.get(trackId);
      if (!decoded) {
        decoded = await sfxCtx.decodeAudioData(buffer.slice(0));
        this.decodedCache.set(trackId, decoded);
      }
      if (this.state.crowdTrackId === trackId) {
        this.bridge.setCustomCrowdBuffer?.(decoded);
      }
    } catch {
      this.bridge.setCustomCrowdBuffer?.(null);
    }
  }

  public async uploadTrackFromBuffer(
    fileName: string,
    mimeType: string,
    buffer: ArrayBuffer,
    options?: { category?: AudioCloudCategory; assignSlot?: string | null },
  ): Promise<CustomAudioTrackMeta> {
    if (!isSupportedAudioFormat(fileName, mimeType)) {
      throw new Error('Formato não suportado. Envie um arquivo .mp3, .wav ou .ogg.');
    }
    if (!buffer || buffer.byteLength === 0) {
      throw new Error('O arquivo de áudio enviado está vazio.');
    }

    const id = `trk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const cleanName = fileName.replace(/\.(mp3|wav|ogg)$/i, '').trim() || 'Faixa Customizada';
    const isSqueakSfx = isShoeSqueakOrCourtSfxTrack(cleanName, options?.category);
    const category: AudioCloudCategory = isSqueakSfx
      ? 'ShoeSqueaks'
      : options?.category ?? 'MenuMusic';
    const effectiveAssignSlot = isSqueakSfx ? 'ShoeSqueaks' : options?.assignSlot ?? null;
    const streamUrl = `/api/audio/stream/${id}`;

    const meta: CustomAudioTrackMeta = {
      id,
      name: cleanName,
      mimeType: mimeType || 'audio/mpeg',
      sizeBytes: buffer.byteLength,
      createdAtMs: Date.now(),
      url: streamUrl,
      storageUrl: streamUrl,
      category,
    };

    this.memoryBuffers.set(id, buffer.slice(0));
    await this.storage.saveBuffer(id, buffer.slice(0));
    this.state.tracks.push(meta);
    if (isSqueakSfx && (options?.assignSlot === 'MenuTheme' || options?.assignSlot === 'ShoeSqueaks')) {
      const current = this.state.sfxAssignments.ShoeSqueaks ?? [];
      if (!current.includes(id)) {
        this.state.sfxAssignments.ShoeSqueaks = [...current, id];
      }
      this.syncShoeSqueakSoundsFromAssignments();
      this.preloadSfxBuffer(id);
    }
    this.sanitizeSfxTracksFromBgmSlots();
    this.recomputeLocalUrls();
    this.emit();

    const base64Data = arrayBufferToBase64(buffer);
    if (base64Data) {
      const cloudRes = await this.remoteSync.uploadTrack({
        id,
        name: cleanName,
        mimeType: meta.mimeType,
        category,
        assignSlot: effectiveAssignSlot,
        dataBase64: base64Data,
      });

      if (cloudRes?.track) {
        meta.url = cloudRes.track.url || streamUrl;
        meta.storageUrl = cloudRes.track.storageUrl || meta.url;
        this.isCloudSynced = true;
        this.recomputeLocalUrls();
        this.emit();
      }
    }

    return meta;
  }

  public async uploadTrackFile(
    file: File,
    options?: { category?: AudioCloudCategory; assignSlot?: string | null },
  ): Promise<CustomAudioTrackMeta> {
    const buffer = await file.arrayBuffer();
    return this.uploadTrackFromBuffer(file.name, file.type, buffer, options);
  }

  public async uploadCrowdAmbienceFile(file: File): Promise<CustomAudioTrackMeta> {
    const buffer = await file.arrayBuffer();
    const meta = await this.uploadTrackFromBuffer(file.name, file.type, buffer, {
      category: 'CrowdAmbient',
      assignSlot: 'CrowdAmbience',
    });
    this.assignCrowdTrack(meta.id);
    return meta;
  }

  public async uploadShoeSqueakFromBuffers(
    samples: ReadonlyArray<{ name: string; mimeType: string; buffer: ArrayBuffer }>,
  ): Promise<ShoeSqueakSoundClip[]> {
    const added: ShoeSqueakSoundClip[] = [];

    for (const sample of samples) {
      const meta = await this.uploadTrackFromBuffer(sample.name, sample.mimeType, sample.buffer, {
        category: 'ShoeSqueaks',
        assignSlot: 'ShoeSqueaks',
      });
      const current = this.state.sfxAssignments.ShoeSqueaks ?? [];
      if (!current.includes(meta.id)) {
        this.state.sfxAssignments.ShoeSqueaks = [...current, meta.id];
      }

      const clip: ShoeSqueakSoundClip = {
        id: meta.id,
        name: meta.name,
        mimeType: meta.mimeType,
        buffer: sample.buffer.slice(0),
        decoded: this.decodedCache.get(meta.id) ?? null,
        url: meta.url,
      };
      if (!this.ShoeSqueakSounds.some((c) => c.id === meta.id)) {
        this.ShoeSqueakSounds.push(clip);
      }
      added.push(clip);
      this.preloadSfxBuffer(meta.id);
    }

    this.recomputeLocalUrls();
    this.emit();
    this.syncConfigToCloudInBackground();
    return added;
  }

  public async uploadShoeSqueakFiles(files: ReadonlyArray<File>): Promise<ShoeSqueakSoundClip[]> {
    const samples: Array<{ name: string; mimeType: string; buffer: ArrayBuffer }> = [];
    for (const file of files) {
      const buffer = await file.arrayBuffer();
      samples.push({ name: file.name, mimeType: file.type, buffer });
    }
    return this.uploadShoeSqueakFromBuffers(samples);
  }

  public PlayRandomShoeSqueak(opts?: {
    intensity?: number;
    isHardStop?: boolean;
    pitchMin?: number;
    pitchMax?: number;
    allowInMenuTest?: boolean;
  }): boolean {
    if (this.isMenuOrNonGameplayState() && !opts?.allowInMenuTest) {
      return false;
    }

    if (this.ShoeSqueakSounds.length > 0) {
      const playback = this.bridge.getSfxPlaybackContext?.();
      const shoeVol = this.bridge.getShoeSqueakVolume?.() ?? this.state.shoeSqueakVolume;
      if (!playback || playback.sfxGain <= 0 || shoeVol <= 0) return false;

      const readyClips = this.ShoeSqueakSounds.filter((clip) => {
        if (!clip.decoded) {
          const cached = this.decodedCache.get(clip.id);
          if (cached) clip.decoded = cached;
        }
        return clip.decoded !== null;
      });

      if (readyClips.length === 0) {
        for (const clip of this.ShoeSqueakSounds) {
          this.preloadSfxBuffer(clip.id);
        }
        return false;
      }

      const pickedIdx = selectRandomShoeSqueakClipIndex(
        readyClips.length,
        this.lastShoeSqueakArrayIndex,
        this.rng,
      );
      this.lastShoeSqueakArrayIndex = pickedIdx;
      const chosenClip = readyClips[pickedIdx];
      if (!chosenClip.decoded) return false;

      const minPitch = opts?.pitchMin ?? 0.85;
      const maxPitch = opts?.pitchMax ?? 1.15;
      const pitch = computeShoeSqueakPitch(minPitch, maxPitch, this.rng);

      const { ctx, sfxGain } = playback;
      const source = ctx.createBufferSource();
      source.buffer = chosenClip.decoded;
      source.loop = false;
      source.playbackRate.setValueAtTime(pitch, ctx.currentTime);

      this.shoeSqueakSource = source;
      this.shoeSqueakSource.loop = false;
      this.activeSfxSources.add(source);
      source.onended = () => {
        this.activeSfxSources.delete(source);
        if (this.shoeSqueakSource === source) {
          this.shoeSqueakSource = null;
        }
      };

      const gain = ctx.createGain();
      const intensity = Math.max(0.25, Math.min(1.35, opts?.intensity ?? 0.85));
      const hardStopBoost = opts?.isHardStop ? 1.15 : 1.0;
      const targetGain = Math.min(1.2, sfxGain * shoeVol * intensity * hardStopBoost);
      gain.gain.setValueAtTime(targetGain, ctx.currentTime);

      source.connect(gain).connect(ctx.destination);
      source.start(ctx.currentTime);

      this.lastCustomSfxEvent = {
        slot: 'ShoeSqueaks',
        trackId: chosenClip.id,
        pitch,
        timestampMs: Date.now(),
      };
      return true;
    }

    return this.playCustomSfx('ShoeSqueaks', {
      intensity: opts?.intensity ?? 0.85,
      isHardStop: opts?.isHardStop ?? false,
      pitchMin: opts?.pitchMin ?? 0.85,
      pitchMax: opts?.pitchMax ?? 1.15,
      allowInMenuTest: opts?.allowInMenuTest ?? false,
    });
  }

  public assignTrackToSlot(slot: SceneAudioSlot, trackId: string | null): void {
    if (trackId) {
      const trk = this.state.tracks.find((t) => t.id === trackId);
      if (!trk) return;
      if (isShoeSqueakOrCourtSfxTrack(trk.name, trk.category)) {
        this.assignSfxTrack('ShoeSqueaks', trackId, 'toggle');
        return;
      }
    }
    this.state.assignments[slot] = trackId;
    this.recomputeLocalUrls();
    this.emit();
    this.syncConfigToCloudInBackground();

    if (this.activeSlot === slot) {
      void this.transitionToSlot(slot, true);
    }
  }

  public hasCustomSfxForSlot(slot: CustomSfxSlot): boolean {
    const ids = this.state.sfxAssignments[slot] ?? [];
    return ids.some((id) => this.state.tracks.some((t) => t.id === id));
  }

  public getAssignedSfxTrackIds(slot: CustomSfxSlot): string[] {
    const ids = this.state.sfxAssignments[slot] ?? [];
    return ids.filter((id) => this.state.tracks.some((t) => t.id === id));
  }

  public assignSfxTrack(
    slot: CustomSfxSlot,
    trackId: string | null,
    mode: 'set' | 'toggle' = 'set',
  ): void {
    if (trackId && !this.state.tracks.some((t) => t.id === trackId)) {
      return;
    }
    const current = [...(this.state.sfxAssignments[slot] ?? [])];
    if (!trackId) {
      this.state.sfxAssignments[slot] = [];
    } else if (mode === 'set') {
      this.state.sfxAssignments[slot] = [trackId];
      this.preloadSfxBuffer(trackId);
    } else {
      const idx = current.indexOf(trackId);
      if (idx >= 0) {
        current.splice(idx, 1);
      } else {
        current.push(trackId);
        this.preloadSfxBuffer(trackId);
      }
      this.state.sfxAssignments[slot] = current;
    }
    if (slot === 'ShoeSqueaks') {
      this.syncShoeSqueakSoundsFromAssignments();
    }
    this.recomputeLocalUrls();
    this.emit();
    this.syncConfigToCloudInBackground();
  }

  private syncShoeSqueakSoundsFromAssignments(): void {
    const ids = this.state.sfxAssignments.ShoeSqueaks ?? [];
    const nextClips: ShoeSqueakSoundClip[] = [];
    for (const id of ids) {
      const meta = this.state.tracks.find((t) => t.id === id);
      const buffer = this.memoryBuffers.get(id);
      if (!meta || !buffer) continue;
      nextClips.push({
        id: meta.id,
        name: meta.name,
        mimeType: meta.mimeType,
        buffer,
        decoded: this.decodedCache.get(id) ?? null,
        url: meta.url,
      });
    }
    this.ShoeSqueakSounds = nextClips;
  }

  private preloadSfxBuffer(trackId: string): void {
    void (async () => {
      const raw = await this.ensureTrackArrayBuffer(trackId);
      if (!raw) return;

      const sfxCtx = this.bridge.getSfxPlaybackContext?.()?.ctx ?? this.bridge.ensureMusicBus()?.ctx;
      if (!sfxCtx) return;

      if (!this.decodedCache.has(trackId)) {
        try {
          const decoded = await sfxCtx.decodeAudioData(raw.slice(0));
          this.decodedCache.set(trackId, decoded);
          for (const clip of this.ShoeSqueakSounds) {
            if (clip.id === trackId) {
              clip.decoded = decoded;
            }
          }
        } catch {
          // Ignora falha de decodificação em ambiente sem codec real
        }
      }
    })();
  }

  private async ensureTrackArrayBuffer(trackId: string): Promise<ArrayBuffer | null> {
    let raw = this.memoryBuffers.get(trackId) ?? null;
    if (raw) return raw;

    raw = await this.storage.loadBuffer(trackId);
    if (raw) {
      this.memoryBuffers.set(trackId, raw);
      return raw;
    }

    const meta = this.state.tracks.find((t) => t.id === trackId);
    const downloadUrl = meta?.url || `/api/audio/stream/${trackId}`;
    const downloaded = await this.remoteSync.fetchAudioBufferByUrl(downloadUrl);
    if (downloaded && downloaded.byteLength > 0) {
      this.memoryBuffers.set(trackId, downloaded.slice(0));
      await this.storage.saveBuffer(trackId, downloaded.slice(0));
      return downloaded;
    }

    return null;
  }

  public playCustomSfx(
    slot: CustomSfxSlot,
    opts?: {
      intensity?: number;
      isHardStop?: boolean;
      pitchMin?: number;
      pitchMax?: number;
      allowInMenuTest?: boolean;
    },
  ): boolean {
    if (slot === 'ShoeSqueaks' && this.isMenuOrNonGameplayState() && !opts?.allowInMenuTest) {
      return false;
    }

    const validIds = this.getAssignedSfxTrackIds(slot);
    if (validIds.length === 0) return false;

    const playback = this.bridge.getSfxPlaybackContext?.();
    if (!playback || playback.sfxGain <= 0) return false;
    const { ctx, sfxGain } = playback;

    const readyIds = validIds.filter((id) => this.decodedCache.has(id));
    if (readyIds.length === 0) {
      for (const id of validIds) {
        this.preloadSfxBuffer(id);
      }
      return false;
    }

    const lastIdx = this.lastSfxIndices.get(slot) ?? -1;
    const pickedIdx = selectRandomShoeSqueakClipIndex(readyIds.length, lastIdx, this.rng);
    this.lastSfxIndices.set(slot, pickedIdx);
    const trackId = readyIds[pickedIdx];
    const audioBuffer = this.decodedCache.get(trackId);
    if (!audioBuffer) return false;

    const defaultMin = slot === 'ShoeSqueaks' ? 0.85 : 0.94;
    const defaultMax = slot === 'ShoeSqueaks' ? 1.15 : 1.06;
    const minPitch = opts?.pitchMin ?? defaultMin;
    const maxPitch = opts?.pitchMax ?? defaultMax;
    const basePitch = computeShoeSqueakPitch(minPitch, maxPitch, this.rng);
    const hardStopPitchBoost = slot === 'ShoeSqueaks' && opts?.isHardStop ? 1.03 : 1.0;
    const finalPitch = Number((basePitch * hardStopPitchBoost).toFixed(3));

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.loop = false;
    source.playbackRate.setValueAtTime(finalPitch, ctx.currentTime);

    if (slot === 'ShoeSqueaks') {
      this.shoeSqueakSource = source;
      this.shoeSqueakSource.loop = false;
    }
    this.activeSfxSources.add(source);
    source.onended = () => {
      this.activeSfxSources.delete(source);
      if (this.shoeSqueakSource === source) {
        this.shoeSqueakSource = null;
      }
    };

    const gain = ctx.createGain();
    const intensity = Math.max(0.25, Math.min(1.35, opts?.intensity ?? 0.85));
    const hardStopGainBoost = opts?.isHardStop ? 1.15 : 1.0;
    const slotVol =
      slot === 'ShoeSqueaks'
        ? this.bridge.getShoeSqueakVolume?.() ?? this.state.shoeSqueakVolume
        : 1.0;
    const targetGain = Math.min(1.2, sfxGain * slotVol * intensity * hardStopGainBoost);
    gain.gain.setValueAtTime(targetGain, ctx.currentTime);

    source.connect(gain).connect(ctx.destination);
    source.start(ctx.currentTime);

    this.lastCustomSfxEvent = {
      slot,
      trackId,
      pitch: finalPitch,
      timestampMs: Date.now(),
    };
    return true;
  }

  public getLastCustomSfxEvent(): {
    slot: CustomSfxSlot;
    trackId: string;
    pitch: number;
    timestampMs: number;
  } | null {
    return this.lastCustomSfxEvent;
  }

  public async deleteTrack(trackId: string): Promise<void> {
    this.state.tracks = this.state.tracks.filter((t) => t.id !== trackId);
    this.memoryBuffers.delete(trackId);
    this.decodedCache.delete(trackId);
    await this.storage.deleteBuffer(trackId);

    if (this.previewCustom?.trackId === trackId) {
      this.stopPreview();
    }

    let activeSlotAffected = false;
    for (const slot of Object.keys(this.state.assignments) as SceneAudioSlot[]) {
      if (this.state.assignments[slot] === trackId) {
        this.state.assignments[slot] = null;
        if (this.activeSlot === slot) {
          activeSlotAffected = true;
        }
      }
    }

    for (const sfxSlot of Object.keys(this.state.sfxAssignments) as CustomSfxSlot[]) {
      const list = this.state.sfxAssignments[sfxSlot] ?? [];
      if (list.includes(trackId)) {
        this.state.sfxAssignments[sfxSlot] = list.filter((id) => id !== trackId);
      }
    }

    if (this.state.crowdTrackId === trackId) {
      this.state.crowdTrackId = null;
      this.bridge.setCustomCrowdBuffer?.(null);
    }

    this.ShoeSqueakSounds = this.ShoeSqueakSounds.filter((clip) => clip.id !== trackId);
    this.recomputeLocalUrls();
    this.emit();

    void this.remoteSync.deleteTrack(trackId).catch(() => {});

    if (activeSlotAffected && this.activeSlot) {
      await this.transitionToSlot(this.activeSlot, true);
    }
  }

  public async loadRemoteAudioConfig(): Promise<boolean> {
    const remote = await this.remoteSync.fetchConfig();
    if (!remote) return false;

    this.isCloudSynced = true;
    const { config: remoteCfg, tracks: remoteTracks } = remote;

    const mergedTracksMap = new Map<string, CustomAudioTrackMeta>();
    for (const localTrack of this.state.tracks) {
      mergedTracksMap.set(localTrack.id, localTrack);
    }
    for (const remoteTrack of remoteTracks) {
      if (remoteTrack && remoteTrack.id) {
        mergedTracksMap.set(remoteTrack.id, {
          ...remoteTrack,
          url: remoteTrack.url || `/api/audio/stream/${remoteTrack.id}`,
          storageUrl: remoteTrack.storageUrl || remoteTrack.url || `/api/audio/stream/${remoteTrack.id}`,
        });
      }
    }

    const extractIdFromStreamUrl = (url: string, fallbackId: string): string => {
      const m = url.match(/\/api\/audio\/stream\/([a-zA-Z0-9_-]+)/);
      return m?.[1] || fallbackId;
    };

    if (typeof remoteCfg.menuMusicUrl === 'string' && remoteCfg.menuMusicUrl.trim()) {
      const menuUrl = remoteCfg.menuMusicUrl.trim();
      const menuId =
        (remoteCfg.assignments?.MenuTheme && String(remoteCfg.assignments.MenuTheme)) ||
        extractIdFromStreamUrl(menuUrl, 'cloud_menu_music');
      if (!mergedTracksMap.has(menuId)) {
        mergedTracksMap.set(menuId, {
          id: menuId,
          name: 'Música do Menu (Nuvem)',
          mimeType: 'audio/mpeg',
          sizeBytes: 1024,
          createdAtMs: Date.now(),
          url: menuUrl,
          storageUrl: menuUrl,
          category: 'MenuMusic',
        });
      }
      this.state.assignments.MenuTheme = menuId;
    }

    if (typeof remoteCfg.crowdAmbientUrl === 'string' && remoteCfg.crowdAmbientUrl.trim()) {
      const crowdUrl = remoteCfg.crowdAmbientUrl.trim();
      const crowdId =
        (remoteCfg.crowdTrackId && String(remoteCfg.crowdTrackId)) ||
        extractIdFromStreamUrl(crowdUrl, 'cloud_crowd_ambient');
      if (!mergedTracksMap.has(crowdId)) {
        mergedTracksMap.set(crowdId, {
          id: crowdId,
          name: 'Torcida / Plateia (Nuvem)',
          mimeType: 'audio/mpeg',
          sizeBytes: 1024,
          createdAtMs: Date.now(),
          url: crowdUrl,
          storageUrl: crowdUrl,
          category: 'CrowdAmbient',
        });
      }
      this.state.crowdTrackId = crowdId;
    }

    if (Array.isArray(remoteCfg.shoeSqueakUrls) && remoteCfg.shoeSqueakUrls.length > 0) {
      const existingSqueakIds = Array.isArray(remoteCfg.sfxAssignments?.ShoeSqueaks)
        ? [...remoteCfg.sfxAssignments.ShoeSqueaks]
        : [];
      const resolvedSqueakIds: string[] = [];
      remoteCfg.shoeSqueakUrls.forEach((rawUrl, idx) => {
        if (typeof rawUrl !== 'string' || !rawUrl.trim()) return;
        const squeakUrl = rawUrl.trim();
        const squeakId =
          existingSqueakIds[idx] ||
          extractIdFromStreamUrl(squeakUrl, `cloud_shoe_squeak_${idx}`);
        if (!mergedTracksMap.has(squeakId)) {
          mergedTracksMap.set(squeakId, {
            id: squeakId,
            name: `Rangido de Tênis #${idx + 1}`,
            mimeType: 'audio/wav',
            sizeBytes: 1024,
            createdAtMs: Date.now() + idx,
            url: squeakUrl,
            storageUrl: squeakUrl,
            category: 'ShoeSqueaks',
          });
        }
        resolvedSqueakIds.push(squeakId);
      });
      if (resolvedSqueakIds.length > 0) {
        this.state.sfxAssignments.ShoeSqueaks = resolvedSqueakIds;
      }
    }

    if (mergedTracksMap.size > 0 || remoteTracks.length > 0) {
      this.state.tracks = Array.from(mergedTracksMap.values()).sort(
        (a, b) => a.createdAtMs - b.createdAtMs,
      );
    }

    if (remoteCfg.assignments && typeof remoteCfg.assignments === 'object') {
      for (const { slot } of SCENE_AUDIO_SLOTS) {
        const remoteAssignedId = remoteCfg.assignments[slot];
        if (remoteAssignedId && mergedTracksMap.has(remoteAssignedId)) {
          this.state.assignments[slot] = remoteAssignedId;
        }
      }
    }

    if (remoteCfg.sfxAssignments && typeof remoteCfg.sfxAssignments === 'object') {
      for (const { slot } of SFX_AUDIO_SLOTS) {
        const remoteIds = remoteCfg.sfxAssignments[slot];
        if (Array.isArray(remoteIds) && remoteIds.length > 0) {
          const validIds = remoteIds.filter((id) => mergedTracksMap.has(id));
          if (validIds.length > 0) {
            this.state.sfxAssignments[slot] = validIds;
          }
        }
      }
    }

    if (remoteCfg.crowdTrackId && mergedTracksMap.has(remoteCfg.crowdTrackId)) {
      this.state.crowdTrackId = remoteCfg.crowdTrackId;
    }

    if (typeof remoteCfg.fadeOutSec === 'number') {
      this.state.fadeOutSec = remoteCfg.fadeOutSec;
    }
    if (typeof remoteCfg.fadeInSec === 'number') {
      this.state.fadeInSec = remoteCfg.fadeInSec;
    }
    if (typeof remoteCfg.crowdVolume === 'number') {
      this.state.crowdVolume = remoteCfg.crowdVolume;
      this.syncCrowdSourceVolume();
    }
    if (typeof remoteCfg.shoeSqueakVolume === 'number') {
      this.state.shoeSqueakVolume = remoteCfg.shoeSqueakVolume;
      this.bridge.setShoeSqueakVolume?.(remoteCfg.shoeSqueakVolume);
    }

    if (typeof remoteCfg.titleBgmUrl === 'string' && remoteCfg.titleBgmUrl.trim()) {
      this.state.titleBgmUrl = remoteCfg.titleBgmUrl.trim();
    } else if (typeof remoteCfg.assignments?.TitleBGM_URL === 'string' && remoteCfg.assignments.TitleBGM_URL.trim()) {
      this.state.titleBgmUrl = remoteCfg.assignments.TitleBGM_URL.trim();
    }

    if (typeof remoteCfg.lobbyBgmUrl === 'string' && remoteCfg.lobbyBgmUrl.trim()) {
      this.state.lobbyBgmUrl = remoteCfg.lobbyBgmUrl.trim();
    } else if (typeof remoteCfg.assignments?.LobbyBGM_URL === 'string' && remoteCfg.assignments.LobbyBGM_URL.trim()) {
      this.state.lobbyBgmUrl = remoteCfg.assignments.LobbyBGM_URL.trim();
    }

    if (typeof remoteCfg.titleAnimationUrl === 'string' && remoteCfg.titleAnimationUrl.trim()) {
      this.state.titleAnimationUrl = remoteCfg.titleAnimationUrl.trim();
    } else if (typeof remoteCfg.assignments?.TitleAnimation_URL === 'string' && remoteCfg.assignments.TitleAnimation_URL.trim()) {
      this.state.titleAnimationUrl = remoteCfg.assignments.TitleAnimation_URL.trim();
    }

    if (typeof remoteCfg.splashAnimationUrl === 'string' && remoteCfg.splashAnimationUrl.trim()) {
      this.state.splashAnimationUrl = remoteCfg.splashAnimationUrl.trim();
    } else if (typeof remoteCfg.assignments?.SplashAnimation_URL === 'string' && remoteCfg.assignments.SplashAnimation_URL.trim()) {
      this.state.splashAnimationUrl = remoteCfg.assignments.SplashAnimation_URL.trim();
    }

    const sanitized = this.sanitizeSfxTracksFromBgmSlots();
    this.recomputeLocalUrls();
    this.emit();
    if (sanitized) {
      this.syncConfigToCloudInBackground();
    }

    await Promise.all(
      this.state.tracks
        .filter(
          (track) =>
            track.category !== 'TitleAnimation' &&
            track.category !== 'SplashAnimation' &&
            !track.mimeType.startsWith('video/'),
        )
        .map(async (track) => {
          await this.ensureTrackArrayBuffer(track.id);
        }),
    );

    const menuId = this.state.assignments.MenuTheme;
    if (menuId) {
      const menuMeta = this.state.tracks.find((t) => t.id === menuId);
      const menuClip = await this.decodeTrackToAudioBuffer(menuId, menuMeta?.url);
      if (menuClip) {
        this.menuMusic = menuClip;
      }
    }

    const resolvedTitleUrl = this.state.titleBgmUrl || this.state.menuMusicUrl;
    if (resolvedTitleUrl) {
      const titleClip =
        (await this.streamAudioClipFromUrl(resolvedTitleUrl, 'MPEG')) ?? this.menuMusic;
      if (titleClip) {
        this.titleBGM = titleClip;
      }
    } else if (this.menuMusic) {
      this.titleBGM = this.menuMusic;
    }

    const resolvedLobbyUrl = this.state.lobbyBgmUrl || this.state.menuMusicUrl;
    if (resolvedLobbyUrl) {
      const lobbyClip =
        (await this.streamAudioClipFromUrl(resolvedLobbyUrl, 'MPEG')) ?? this.menuMusic;
      if (lobbyClip) {
        this.lobbyBGM = lobbyClip;
      }
    } else if (this.menuMusic) {
      this.lobbyBGM = this.menuMusic;
    }

    this.syncShoeSqueakSoundsFromAssignments();
    const decodedSqueaks: AudioBuffer[] = [];
    for (const sfxSlot of Object.keys(this.state.sfxAssignments) as CustomSfxSlot[]) {
      for (const id of this.state.sfxAssignments[sfxSlot] ?? []) {
        this.preloadSfxBuffer(id);
        if (sfxSlot === 'ShoeSqueaks') {
          const squeakMeta = this.state.tracks.find((t) => t.id === id);
          const clip = await this.decodeTrackToAudioBuffer(id, squeakMeta?.url);
          if (clip) {
            decodedSqueaks.push(clip);
            for (const item of this.ShoeSqueakSounds) {
              if (item.id === id) {
                item.decoded = clip;
              }
            }
          }
        }
      }
    }
    if (decodedSqueaks.length > 0) {
      this.shoeSqueaks = decodedSqueaks;
    }

    if (this.state.crowdTrackId) {
      await this.preloadAndApplyCrowdBuffer(this.state.crowdTrackId);
      this.crowdMusic = this.decodedCache.get(this.state.crowdTrackId) ?? this.crowdMusic;
    }

    if (this.isGameplayMatchState()) {
      this.StopMatchBackgroundMusic();
      return true;
    }

    if (this.silentSplashMode) {
      this.emit();
      return true;
    }

    const slotToRefresh = this.activeSlot ?? (this.hasTrackForSlot('MenuTheme') ? 'MenuTheme' : null);
    if (slotToRefresh) {
      await this.transitionToSlot(slotToRefresh, true);
    }

    this.emit();
    return true;
  }

  public async streamAudioClipFromUrl(
    url: string,
    _audioType: 'MPEG' | 'WAV' | 'OGG' = 'MPEG',
  ): Promise<AudioBuffer | null> {
    if (!url || typeof url !== 'string') return null;
    try {
      const rawBuffer = await this.remoteSync.fetchAudioBufferByUrl(url);
      if (!rawBuffer || rawBuffer.byteLength === 0) return null;

      const ctx =
        this.bridge.ensureMusicBus()?.ctx ?? this.bridge.getSfxPlaybackContext?.()?.ctx ?? null;
      if (!ctx) return null;

      return await ctx.decodeAudioData(rawBuffer.slice(0));
    } catch {
      return null;
    }
  }

  private async decodeTrackToAudioBuffer(
    trackId: string,
    fallbackUrl?: string,
  ): Promise<AudioBuffer | null> {
    const cached = this.decodedCache.get(trackId);
    if (cached) return cached;

    const raw =
      (await this.ensureTrackArrayBuffer(trackId)) ??
      (fallbackUrl ? await this.remoteSync.fetchAudioBufferByUrl(fallbackUrl) : null);
    if (!raw || raw.byteLength === 0) return null;

    const ctx =
      this.bridge.ensureMusicBus()?.ctx ?? this.bridge.getSfxPlaybackContext?.()?.ctx ?? null;
    if (!ctx) return null;

    try {
      const decoded = await ctx.decodeAudioData(raw.slice(0));
      this.decodedCache.set(trackId, decoded);
      return decoded;
    } catch {
      return null;
    }
  }

  public async LoadAudioSettingsFromDB(): Promise<boolean> {
    try {
      await this.checkUrlAdminKey();

      for (const track of this.state.tracks) {
        if (
          track.category === 'TitleAnimation' ||
          track.category === 'SplashAnimation' ||
          track.mimeType.startsWith('video/')
        ) {
          continue;
        }
        if (!this.memoryBuffers.has(track.id)) {
          const buf = await this.storage.loadBuffer(track.id);
          if (buf) {
            this.memoryBuffers.set(track.id, buf);
          }
        }
      }
      this.syncShoeSqueakSoundsFromAssignments();
      for (const sfxSlot of Object.keys(this.state.sfxAssignments) as CustomSfxSlot[]) {
        for (const id of this.state.sfxAssignments[sfxSlot] ?? []) {
          this.preloadSfxBuffer(id);
        }
      }
      if (this.state.crowdTrackId) {
        await this.preloadAndApplyCrowdBuffer(this.state.crowdTrackId);
      }

      const loadedFromDb = await this.loadRemoteAudioConfig();
      if (!loadedFromDb) {
        if (!this.hasTrackForSlot('MenuTheme')) {
          this.bridge.setCustomExclusiveMode?.(false);
        }
        return false;
      }
      return true;
    } catch {
      if (!this.hasTrackForSlot('MenuTheme')) {
        this.bridge.setCustomExclusiveMode?.(false);
      }
      return false;
    }
  }

  public async Awake(): Promise<boolean> {
    return this.LoadAudioSettingsFromDB();
  }

  public async Start(): Promise<boolean> {
    return this.LoadAudioSettingsFromDB();
  }

  public async hydrate(): Promise<void> {
    await this.LoadAudioSettingsFromDB();
  }

  public async playLobbyBGM(crossfadeDurationSec = 0.65): Promise<boolean> {
    this.stopCrowd();
    return this.SwitchBGM('lobbyBGM', crossfadeDurationSec);
  }

  public async SwitchBGM(
    target: 'titleBGM' | 'lobbyBGM' | AudioBuffer | null,
    crossfadeDurationSec = 0.65,
  ): Promise<boolean> {
    this.stopCrowd();

    if (this.isGameplayMatchState()) {
      this.StopMatchBackgroundMusic();
      return false;
    }

    const duration = Math.max(0.05, Math.min(3.0, Number(crossfadeDurationSec) || 0.65));
    this.bgmSource.Stop();

    const resolvedBuffer: AudioBuffer | null =
      target === 'titleBGM'
        ? this.titleBGM ?? this.menuMusic
        : target === 'lobbyBGM'
          ? this.lobbyBGM ?? this.menuMusic
          : target;

    if (target === 'titleBGM') {
      this.activeBgmKey = 'titleBGM';
    } else if (target === 'lobbyBGM') {
      this.activeBgmKey = 'lobbyBGM';
    } else {
      this.activeBgmKey = resolvedBuffer ? 'custom' : 'none';
    }

    const bus = this.bridge.ensureMusicBus();
    if (!bus) {
      if (target === 'titleBGM' || target === 'lobbyBGM') {
        await this.transitionToSlot('MenuTheme', true);
      }
      return false;
    }

    if (resolvedBuffer) {
      try {
        this.bridge.setCustomExclusiveMode?.(true);
        this.bridge.destroyDefaultMusic?.(false);

        const source = bus.ctx.createBufferSource();
        source.buffer = resolvedBuffer;
        source.loop = true;

        const gain = bus.ctx.createGain();
        const now = bus.ctx.currentTime;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(1.0, now + duration);

        source.connect(gain).connect(bus.inputNode);
        source.start(now);

        const trackIdLabel =
          target === 'titleBGM'
            ? 'title_bgm_clip'
            : target === 'lobbyBGM'
              ? 'lobby_bgm_clip'
              : 'custom_bgm_clip';
        this.activeSlot = 'MenuTheme';
        this.activeMode = 'custom';
        this.activeCustom = {
          trackId: trackIdLabel,
          slot: 'MenuTheme',
          source,
          gain,
        };
        this.emit();
        return true;
      } catch {
        // Fallback para transição padrão caso o contexto esteja suspenso
      }
    }

    await this.transitionToSlot('MenuTheme', true);
    return true;
  }

  public getActiveBgmKey(): 'titleBGM' | 'lobbyBGM' | 'custom' | 'none' {
    return this.activeBgmKey;
  }

  public async uploadCloudMediaFile(
    file: File,
    mediaSlot: 'TitleBGM' | 'LobbyBGM' | 'TitleAnimation' | 'SplashAnimation',
  ): Promise<{ ok: boolean; url: string; trackId: string }> {
    const buffer = await file.arrayBuffer();
    if (!buffer || buffer.byteLength === 0) {
      throw new Error('O arquivo selecionado está vazio.');
    }

    const isVideoSlot = mediaSlot === 'TitleAnimation' || mediaSlot === 'SplashAnimation';
    if (isVideoSlot) {
      if (!isSupportedVideoFormat(file.name, file.type)) {
        throw new Error('Formato de vídeo inválido. Envie um arquivo .mp4 ou .webm.');
      }
    } else if (!isSupportedAudioFormat(file.name, file.type)) {
      throw new Error('Formato de áudio inválido. Envie um arquivo .mp3, .wav ou .ogg.');
    }

    const id = `${mediaSlot.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const cleanName =
      file.name.replace(/\.(mp3|wav|ogg|mp4|webm)$/i, '').trim() || mediaSlot;
    const defaultMime = isVideoSlot ? 'video/mp4' : 'audio/mpeg';
    const mimeType = file.type || defaultMime;
    const base64Data = arrayBufferToBase64(buffer);

    const cloudRes = await this.remoteSync.uploadTrack({
      id,
      name: cleanName,
      mimeType,
      category: mediaSlot,
      assignSlot: mediaSlot,
      dataBase64: base64Data,
    });

    const publicUrl = cloudRes?.track?.url || `/api/audio/stream/${id}`;
    this.isCloudSynced = Boolean(cloudRes);

    if (!isVideoSlot) {
      this.memoryBuffers.set(id, buffer.slice(0));
      await this.storage.saveBuffer(id, buffer.slice(0));
    }

    const meta: CustomAudioTrackMeta = {
      id,
      name: cleanName,
      mimeType,
      sizeBytes: buffer.byteLength,
      createdAtMs: Date.now(),
      url: publicUrl,
      storageUrl: cloudRes?.track?.storageUrl || publicUrl,
      category: mediaSlot,
    };
    this.state.tracks = [...this.state.tracks.filter((t) => t.id !== id), meta];

    if (mediaSlot === 'TitleBGM') {
      this.state.titleBgmUrl = publicUrl;
      const decoded = await this.decodeTrackToAudioBuffer(id, publicUrl);
      if (decoded) {
        this.titleBGM = decoded;
      }
    } else if (mediaSlot === 'LobbyBGM') {
      this.state.lobbyBgmUrl = publicUrl;
      this.state.menuMusicUrl = publicUrl;
      this.state.assignments.MenuTheme = id;
      const decoded = await this.decodeTrackToAudioBuffer(id, publicUrl);
      if (decoded) {
        this.lobbyBGM = decoded;
        this.menuMusic = decoded;
      }
      if (this.activeBgmKey === 'lobbyBGM' && !this.isGameplayMatchState()) {
        await this.SwitchBGM('lobbyBGM', 0.5);
      }
    } else if (mediaSlot === 'TitleAnimation') {
      this.state.titleAnimationUrl = publicUrl;
    } else if (mediaSlot === 'SplashAnimation') {
      this.state.splashAnimationUrl = publicUrl;
    }

    this.emit();
    return { ok: true, url: publicUrl, trackId: id };
  }

  public async updateBgmUrls(
    titleBgmUrl: string,
    lobbyBgmUrl: string,
    titleAnimationUrl?: string,
    splashAnimationUrl?: string,
  ): Promise<boolean> {
    this.state.titleBgmUrl = titleBgmUrl.trim();
    this.state.lobbyBgmUrl = lobbyBgmUrl.trim();
    if (typeof titleAnimationUrl === 'string') {
      this.state.titleAnimationUrl = titleAnimationUrl.trim();
    }
    if (typeof splashAnimationUrl === 'string') {
      this.state.splashAnimationUrl = splashAnimationUrl.trim();
    }
    this.emit();

    const saved = await this.remoteSync.saveConfig({
      titleBgmUrl: this.state.titleBgmUrl,
      lobbyBgmUrl: this.state.lobbyBgmUrl,
      titleAnimationUrl: this.state.titleAnimationUrl,
      splashAnimationUrl: this.state.splashAnimationUrl,
      assignments: {
        ...this.state.assignments,
      },
    });

    if (this.state.titleBgmUrl) {
      const clip = await this.streamAudioClipFromUrl(this.state.titleBgmUrl, 'MPEG');
      if (clip) this.titleBGM = clip;
    }
    if (this.state.lobbyBgmUrl) {
      const clip = await this.streamAudioClipFromUrl(this.state.lobbyBgmUrl, 'MPEG');
      if (clip) this.lobbyBGM = clip;
    }

    if (saved) {
      this.isCloudSynced = true;
      this.emit();
      return true;
    }
    return false;
  }

  public async previewTrack(trackId: string): Promise<void> {
    if (this.previewCustom?.trackId === trackId) {
      this.stopPreview();
      return;
    }
    this.stopPreview();

    const bus = this.bridge.ensureMusicBus();
    if (!bus) return;

    const rawBuffer = await this.ensureTrackArrayBuffer(trackId);
    if (!rawBuffer) return;

    try {
      let audioBuffer = this.decodedCache.get(trackId);
      if (!audioBuffer) {
        audioBuffer = await bus.ctx.decodeAudioData(rawBuffer.slice(0));
        this.decodedCache.set(trackId, audioBuffer);
      }

      this.bridge.stopProceduralWithFade(0.2);
      if (this.activeCustom) {
        this.fadeOutAndStopCustom(this.activeCustom, bus.ctx, 0.2);
        this.activeCustom = null;
      }

      const source = bus.ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.loop = true;

      const gain = bus.ctx.createGain();
      const now = bus.ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(1.0, now + 0.25);

      source.connect(gain).connect(bus.inputNode);
      source.start(now);

      this.previewCustom = { trackId, source, gain };
      this.emit();
    } catch {
      // Falha silenciosa se o navegador bloquear ou o arquivo estiver corrompido
    }
  }

  public stopPreview(): void {
    if (!this.previewCustom) return;
    const bus = this.bridge.ensureMusicBus();
    const prev = this.previewCustom;
    this.previewCustom = null;

    if (bus) {
      const now = bus.ctx.currentTime;
      try {
        prev.gain.gain.cancelScheduledValues(now);
        prev.gain.gain.setValueAtTime(prev.gain.gain.value, now);
        prev.gain.gain.linearRampToValueAtTime(0.0001, now + 0.15);
        window.setTimeout(() => {
          try {
            prev.source.stop();
            prev.source.disconnect();
            prev.gain.disconnect();
          } catch {
            // já desconectado
          }
        }, 180);
      } catch {
        // ignora
      }
    }
    this.emit();

    if (this.activeSlot) {
      void this.transitionToSlot(this.activeSlot, true);
    }
  }

  public async transitionToScene(
    screenState: SoundtrackScreenState,
    arenaId: ArenaId,
  ): Promise<SoundtrackTransitionEvent> {
    this.setScreenState(screenState);
    if (screenState === 'playing' || screenState === 'paused' || screenState === 'guide') {
      const prevSlot = this.activeSlot;
      this.StopMatchBackgroundMusic();
      const targetSlot = resolveSceneAudioSlot(screenState, arenaId);
      const evt: SoundtrackTransitionEvent = {
        fromSlot: prevSlot,
        toSlot: targetSlot,
        trackId: null,
        mode: 'procedural',
        fadeOutSec: 0,
        fadeInSec: 0,
        timestampMs: Date.now(),
      };
      this.lastTransition = evt;
      return evt;
    }
    this.stopAllActiveSfxSources();
    this.stopCrowd();
    const targetSlot = resolveSceneAudioSlot(screenState, arenaId);
    if (
      targetSlot === 'MenuTheme' &&
      this.activeCustom !== null &&
      (this.activeBgmKey === 'lobbyBGM' || this.activeBgmKey === 'titleBGM')
    ) {
      const evt: SoundtrackTransitionEvent = {
        fromSlot: this.activeSlot,
        toSlot: targetSlot,
        trackId: this.activeCustom.trackId,
        mode: 'custom',
        fadeOutSec: 0,
        fadeInSec: 0,
        timestampMs: Date.now(),
      };
      this.lastTransition = evt;
      return evt;
    }
    return this.transitionToSlot(targetSlot);
  }

  public stopMatchMusic(fadeOutSec = 0): void {
    this.stopPreview();
    this.bridge.stopProceduralWithFade(fadeOutSec);
    this.bridge.destroyDefaultMusic?.(false);
    soundEngine.stopMusic();
    if (this.activeCustom) {
      const bus = this.bridge.ensureMusicBus();
      if (bus && fadeOutSec > 0) {
        this.fadeOutAndStopCustom(this.activeCustom, bus.ctx, fadeOutSec);
      } else {
        try {
          this.activeCustom.source.loop = false;
          this.activeCustom.source.stop();
          this.activeCustom.source.disconnect();
        } catch {
          // ignore
        }
      }
      this.activeCustom = null;
    }
    this.activeSlot = null;
    this.activeMode = 'idle';
    this.stopCrowd();
    this.emit();
  }

  public async transitionToSlot(
    targetSlot: SceneAudioSlot,
    forceRestart = false,
  ): Promise<SoundtrackTransitionEvent> {
    if (targetSlot === 'MenuTheme') {
      this.stopCrowd();
    } else if (
      this.currentScreenState !== 'playing' &&
      this.currentScreenState !== 'paused' &&
      this.currentScreenState !== 'guide'
    ) {
      this.currentScreenState = 'playing';
      soundEngine.setScreenState('playing');
    }
    this.stopPreview();
    this.sanitizeSfxTracksFromBgmSlots();

    const fromSlot = this.activeSlot;
    const assignedTrackId = this.state.assignments[targetSlot] ?? null;
    const assignedTrackMeta = assignedTrackId
      ? this.state.tracks.find((t) => t.id === assignedTrackId)
      : undefined;
    const hasCustomTrack =
      assignedTrackId !== null &&
      assignedTrackMeta !== undefined &&
      !isShoeSqueakOrCourtSfxTrack(assignedTrackMeta.name, assignedTrackMeta.category);

    const fadeOutSec = this.state.fadeOutSec;
    const fadeInSec = this.state.fadeInSec;
    const isMatchSlot = targetSlot !== 'MenuTheme';

    if (
      !forceRestart &&
      this.activeSlot === targetSlot &&
      ((hasCustomTrack && this.activeMode === 'custom' && this.activeCustom?.trackId === assignedTrackId) ||
        (!hasCustomTrack && this.activeMode === 'procedural'))
    ) {
      this.bridge.setCrowdForSlot(isMatchSlot);
      const evt: SoundtrackTransitionEvent = {
        fromSlot,
        toSlot: targetSlot,
        trackId: hasCustomTrack ? assignedTrackId : null,
        mode: hasCustomTrack ? 'custom' : 'procedural',
        fadeOutSec: 0,
        fadeInSec: 0,
        timestampMs: Date.now(),
      };
      this.lastTransition = evt;
      return evt;
    }

    this.activeSlot = targetSlot;
    this.bridge.setCrowdForSlot(isMatchSlot);

    if (hasCustomTrack && assignedTrackId) {
      this.bridge.setCustomExclusiveMode?.(true);
      this.bridge.destroyDefaultMusic?.(isMatchSlot);
      this.bridge.stopProceduralWithFade(fadeOutSec);

      const bus = this.bridge.ensureMusicBus();
      if (this.activeCustom && bus) {
        this.fadeOutAndStopCustom(this.activeCustom, bus.ctx, fadeOutSec);
        this.activeCustom = null;
      } else if (this.activeCustom) {
        try {
          this.activeCustom.source.stop();
          this.activeCustom.source.disconnect();
        } catch {
          // ignora
        }
        this.activeCustom = null;
      }

      let customBufferLoaded = false;
      if (bus) {
        const rawBuffer = await this.ensureTrackArrayBuffer(assignedTrackId);
        if (rawBuffer) {
          try {
            let audioBuffer = this.decodedCache.get(assignedTrackId);
            if (!audioBuffer) {
              audioBuffer = await bus.ctx.decodeAudioData(rawBuffer.slice(0));
              this.decodedCache.set(assignedTrackId, audioBuffer);
            }

            if (this.isGameplayMatchState()) {
              this.StopMatchBackgroundMusic();
            } else if (this.activeSlot === targetSlot) {
              this.bridge.destroyDefaultMusic?.(isMatchSlot);

              const source = bus.ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.loop = true;

              const gain = bus.ctx.createGain();
              const now = bus.ctx.currentTime;
              gain.gain.setValueAtTime(0.0001, now);
              gain.gain.linearRampToValueAtTime(1.0, now + fadeInSec);

              source.connect(gain).connect(bus.inputNode);
              source.start(now);

              this.activeCustom = {
                trackId: assignedTrackId,
                slot: targetSlot,
                source,
                gain,
              };
            }
            customBufferLoaded = true;
          } catch {
            customBufferLoaded = false;
          }
        }
      }

      if (!customBufferLoaded) {
        this.bridge.setCustomExclusiveMode?.(false);
        this.bridge.startProceduralWithFade(isMatchSlot ? 'match' : 'menu', fadeInSec);
        this.activeMode = 'procedural';
        const fallbackEvt: SoundtrackTransitionEvent = {
          fromSlot,
          toSlot: targetSlot,
          trackId: null,
          mode: 'procedural',
          fadeOutSec,
          fadeInSec,
          timestampMs: Date.now(),
        };
        this.lastTransition = fallbackEvt;
        this.emit();
        return fallbackEvt;
      }

      this.activeMode = 'custom';
      const evt: SoundtrackTransitionEvent = {
        fromSlot,
        toSlot: targetSlot,
        trackId: assignedTrackId,
        mode: 'custom',
        fadeOutSec,
        fadeInSec,
        timestampMs: Date.now(),
      };
      this.lastTransition = evt;
      this.emit();
      return evt;
    }

    // Sem trilha customizada atribuída ao slot -> usa trilha procedural padrão com Fade Out / Fade In
    this.bridge.setCustomExclusiveMode?.(false);
    if (this.activeCustom) {
      const bus = this.bridge.ensureMusicBus();
      if (bus) {
        this.fadeOutAndStopCustom(this.activeCustom, bus.ctx, fadeOutSec);
      }
      this.activeCustom = null;
    }

    this.bridge.startProceduralWithFade(isMatchSlot ? 'match' : 'menu', fadeInSec);
    this.activeMode = 'procedural';

    const evt: SoundtrackTransitionEvent = {
      fromSlot,
      toSlot: targetSlot,
      trackId: null,
      mode: 'procedural',
      fadeOutSec,
      fadeInSec,
      timestampMs: Date.now(),
    };
    this.lastTransition = evt;
    this.emit();
    return evt;
  }

  private fadeOutAndStopCustom(
    item: ActiveCustomSource,
    ctx: AudioContext,
    fadeOutSec: number,
  ): void {
    const now = ctx.currentTime;
    const duration = Math.max(0.05, fadeOutSec);
    try {
      item.gain.gain.cancelScheduledValues(now);
      item.gain.gain.setValueAtTime(Math.max(0.0001, item.gain.gain.value), now);
      item.gain.gain.linearRampToValueAtTime(0.0001, now + duration);
      if (typeof window !== 'undefined') {
        window.setTimeout(() => {
          try {
            item.source.stop();
            item.source.disconnect();
            item.gain.disconnect();
          } catch {
            // já parado
          }
        }, Math.round(duration * 1000) + 40);
      } else {
        item.source.stop();
        item.source.disconnect();
        item.gain.disconnect();
      }
    } catch {
      // ignora erro em contexto fechado
    }
  }
}

export const customSoundtrackManager = new CustomSoundtrackManager();
soundEngine.registerCustomSfxPlayer((slot, opts) =>
  slot === 'ShoeSqueaks'
    ? customSoundtrackManager.PlayRandomShoeSqueak(opts)
    : customSoundtrackManager.playCustomSfx(slot, opts),
);