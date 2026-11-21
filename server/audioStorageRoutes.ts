/**
 * Spike Legends Online — Rotas de Áudio Local (pasta `public/audio`) + Segurança Admin
 * Totalmente livre de Firestore/Firebase Storage para evitar erros de cota (`resource-exhausted`)
 * e garantir persistência permanente no Render via GitHub (`public/audio`).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Express, NextFunction, Request, Response } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_AUDIO_DIR = path.resolve(__dirname, '../public/audio');

export type AudioCategory =
  | 'MenuMusic'
  | 'TitleBGM'
  | 'LobbyBGM'
  | 'TitleAnimation'
  | 'SplashAnimation'
  | 'CrowdAmbient'
  | 'ShoeSqueaks'
  | 'StageBGM'
  | 'SFX';

export interface CloudAudioTrackRecord {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdAtMs: number;
  category: AudioCategory;
  url: string;
  storageUrl: string;
  chunkCount: number;
}

export interface GlobalAudioSettingsRecord {
  settingId: 'audio';
  configId: 'global';
  menuMusicUrl: string;
  titleBgmUrl: string;
  lobbyBgmUrl: string;
  titleAnimationUrl: string;
  splashAnimationUrl: string;
  crowdAmbientUrl: string;
  shoeSqueakUrls: string[];
  crowdTrackId: string;
  assignments: Record<string, string | null>;
  sfxAssignments: Record<string, string[]>;
  trackIds: string[];
  fadeOutSec: number;
  fadeInSec: number;
  crowdVolume: number;
  shoeSqueakVolume: number;
}

export interface AnalyticsUserRecord {
  uid: string;
  displayName: string;
  email: string;
  matchesPlayed: number;
  totalSessionSeconds: number;
  sessionCount: number;
  ratingStars: number;
  ratingComment: string;
  updatedAtMs: number;
}

export type CloudAudioConfigRecord = GlobalAudioSettingsRecord;

const ALLOWED_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/ogg',
  'application/ogg',
  'video/mp4',
  'video/webm',
]);

const ALLOWED_CATEGORIES = new Set<AudioCategory>([
  'MenuMusic',
  'TitleBGM',
  'LobbyBGM',
  'TitleAnimation',
  'SplashAnimation',
  'CrowdAmbient',
  'ShoeSqueaks',
  'StageBGM',
  'SFX',
]);

const DEFAULT_ASSIGNMENTS: Record<string, string | null> = {
  MenuTheme: null,
  TitleBGM: null,
  LobbyBGM: null,
  TitleAnimation: null,
  SplashAnimation: null,
  TitleBGM_URL: null,
  LobbyBGM_URL: null,
  TitleAnimation_URL: null,
  SplashAnimation_URL: null,
  Stage1_BGM: null,
  Stage2_BGM: null,
  Stage3_BGM: null,
  Stage4_BGM: null,
  Stage5_BGM: null,
  Stage6_BGM: null,
  Stage7_BGM: null,
};

const DEFAULT_SFX_ASSIGNMENTS: Record<string, string[]> = {
  ShoeSqueaks: [],
  ImpactSpike: [],
  ImpactReceive: [],
  FloorSlam: [],
  Whistle: [],
  Jump: [],
};

const DEFAULT_ADMIN_EMAILS = ['daniellaandrade1989@gmail.com'];
export const ADMIN_URL_SECRET_KEY = (
  process.env.ADMIN_URL_SECRET_KEY ||
  process.env.ADMIN_SECRET_KEY ||
  'spike-admin-2025'
).trim();
export const ADMIN_FALLBACK_PASSWORD = (
  process.env.ADMIN_FALLBACK_PASSWORD || 'spike-7taps-2025'
).trim();
const ADMIN_SECRET_KEY = ADMIN_URL_SECRET_KEY;
const ADMIN_TOKEN_SECRET = (
  process.env.ADMIN_TOKEN_SECRET || `spike_legends_hmac_${ADMIN_SECRET_KEY}`
).trim();

export function getAuthorizedAdminEmails(): Set<string> {
  const envList = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...DEFAULT_ADMIN_EMAILS.map((e) => e.toLowerCase()), ...envList]);
}

export function isAuthorizedAdminEmail(email?: string | null): boolean {
  if (!email || typeof email !== 'string') return false;
  return getAuthorizedAdminEmails().has(email.trim().toLowerCase());
}

export function createAdminSessionToken(identifier: string): string {
  const cleanId = identifier.trim().toLowerCase() || 'admin';
  const issuedAt = Date.now();
  const payload = Buffer.from(JSON.stringify({ sub: cleanId, role: 'admin', iat: issuedAt })).toString(
    'base64url',
  );
  const sig = crypto.createHmac('sha256', ADMIN_TOKEN_SECRET).update(payload).digest('base64url');
  return `adm_${payload}.${sig}`;
}

export function verifyAdminToken(token?: string | null): boolean {
  if (!token || typeof token !== 'string') return false;
  const clean = token.trim();
  if (!clean) return false;

  if (clean === ADMIN_URL_SECRET_KEY || clean === ADMIN_FALLBACK_PASSWORD) {
    return true;
  }

  if (!clean.startsWith('adm_')) return false;
  const raw = clean.slice(4);
  const dotIdx = raw.indexOf('.');
  if (dotIdx <= 0) return false;

  const payload = raw.slice(0, dotIdx);
  const sig = raw.slice(dotIdx + 1);
  const expectedSig = crypto
    .createHmac('sha256', ADMIN_TOKEN_SECRET)
    .update(payload)
    .digest('base64url');

  if (sig.length !== expectedSig.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    return false;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      role?: string;
    };
    return decoded?.role === 'admin';
  } catch {
    return false;
  }
}

export function extractAdminTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  const xAdminToken = req.headers['x-admin-token'];
  if (typeof xAdminToken === 'string' && xAdminToken.trim()) {
    return xAdminToken.trim();
  }
  const xAdminKey = req.headers['x-admin-key'];
  if (typeof xAdminKey === 'string' && xAdminKey.trim()) {
    return xAdminKey.trim();
  }
  return null;
}

export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractAdminTokenFromRequest(req);
  if (verifyAdminToken(token)) {
    next();
    return;
  }

  res.status(403).json({
    ok: false,
    error:
      '403 Forbidden: Acesso restrito ao Administrador. Jogadores comuns não possuem permissão para enviar ou modificar áudios do servidor.',
  });
}

function sanitizeId(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const cleaned = raw.trim().replace(/[^a-zA-Z0-9_-]/g, '');
  return cleaned.slice(0, 96);
}

function normalizeMimeType(raw: unknown, fileName = ''): string {
  const lower = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (ALLOWED_MIME_TYPES.has(lower)) return lower;
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith('.mp4')) return 'video/mp4';
  if (lowerName.endsWith('.webm')) return 'video/webm';
  if (lowerName.endsWith('.wav')) return 'audio/wav';
  if (lowerName.endsWith('.ogg')) return 'audio/ogg';
  return 'audio/mpeg';
}

function normalizeCategory(raw: unknown, fileName = ''): AudioCategory {
  if (raw === 'SplashAnimation' || /splash/i.test(fileName)) {
    return 'SplashAnimation';
  }
  if (/\.mp4$|\.webm$/i.test(fileName) || raw === 'TitleAnimation') {
    return 'TitleAnimation';
  }
  if (/plateia|platéia|torcida|crowd|ginasio|ginásio/i.test(fileName)) {
    return 'CrowdAmbient';
  }
  if (/tenis|tênis|squeak|ranger|rangido|passo|sapato|shoe/i.test(fileName)) {
    return 'ShoeSqueaks';
  }
  if (/apito|whistle|corte|spike|manchete|receive|chao|chão|floor|salto|jump/i.test(fileName)) {
    return 'SFX';
  }
  if (typeof raw === 'string' && ALLOWED_CATEGORIES.has(raw as AudioCategory)) {
    return raw as AudioCategory;
  }
  return 'MenuMusic';
}

function isShoeSqueakOrCourtSfxTrackName(name: string, category?: string): boolean {
  if (category === 'ShoeSqueaks' || category === 'SFX') return true;
  return /tenis|tênis|squeak|ranger|rangido|passo|sapato|shoe|apito|whistle/i.test(name || '');
}

export interface AudioPersistenceDriver {
  hydrateFromCloud: () => Promise<void>;
  getFullState: () => Promise<{
    settings: GlobalAudioSettingsRecord;
    config: GlobalAudioSettingsRecord;
    tracks: CloudAudioTrackRecord[];
  }>;
  uploadAudio: (params: {
    id?: string;
    name: string;
    mimeType: string;
    category: AudioCategory;
    assignSlot?: string | null;
    buffer: Buffer;
  }) => Promise<{ track: CloudAudioTrackRecord; config: GlobalAudioSettingsRecord }>;
  updateConfig: (
    patch: Partial<GlobalAudioSettingsRecord>,
  ) => Promise<GlobalAudioSettingsRecord>;
  deleteTrack: (trackId: string) => Promise<GlobalAudioSettingsRecord>;
  getTrackAudioBuffer: (trackId: string) => Promise<{ mimeType: string; buffer: Buffer } | null>;
}

export class LocalDiskAudioPersistenceService implements AudioPersistenceDriver {
  private hydrated = false;
  private tracksCache = new Map<string, CloudAudioTrackRecord>();
  private binaryCache = new Map<string, { mimeType: string; buffer: Buffer }>();
  private filePathsCache = new Map<string, string>();

  private configCache: GlobalAudioSettingsRecord = {
    settingId: 'audio',
    configId: 'global',
    menuMusicUrl: '',
    titleBgmUrl: '',
    lobbyBgmUrl: '',
    titleAnimationUrl: '',
    splashAnimationUrl: '',
    crowdAmbientUrl: '',
    shoeSqueakUrls: [],
    crowdTrackId: '',
    assignments: { ...DEFAULT_ASSIGNMENTS },
    sfxAssignments: { ...DEFAULT_SFX_ASSIGNMENTS },
    trackIds: [],
    fadeOutSec: 0.65,
    fadeInSec: 0.65,
    crowdVolume: 0.65,
    shoeSqueakVolume: 0.85,
  };

  constructor() {
    void this.hydrateFromCloud();
  }

  public async hydrateFromCloud(): Promise<void> {
    if (this.hydrated) return;
    this.hydrated = true;

    try {
      if (!fs.existsSync(PUBLIC_AUDIO_DIR)) {
        return;
      }

      const entries = fs.readdirSync(PUBLIC_AUDIO_DIR, { withFileTypes: true });
      let index = 0;
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const fileName = entry.name;
        if (!/\.(mp3|wav|ogg|mp4|webm)$/i.test(fileName)) continue;

        const fullPath = path.join(PUBLIC_AUDIO_DIR, fileName);
        const stat = fs.statSync(fullPath);
        const baseName = fileName.replace(/\.(mp3|wav|ogg|mp4|webm)$/i, '');
        const safeSlug = sanitizeId(baseName.replace(/\s+/g, '_')) || `audio_${index}`;
        const id = `local_${safeSlug}`;
        const mimeType = normalizeMimeType('', fileName);
        const category = normalizeCategory(undefined, fileName);
        const streamUrl = `/api/audio/stream/${id}`;

        const record: CloudAudioTrackRecord = {
          id,
          name: baseName,
          mimeType,
          sizeBytes: Math.max(1, stat.size),
          createdAtMs: Math.floor(stat.mtimeMs) + index,
          category,
          url: streamUrl,
          storageUrl: streamUrl,
          chunkCount: 1,
        };

        this.tracksCache.set(id, record);
        this.filePathsCache.set(id, fullPath);

        const lower = baseName.toLowerCase();
        if (category === 'SplashAnimation') {
          this.configCache.assignments.SplashAnimation = id;
          this.configCache.assignments.SplashAnimation_URL = streamUrl;
          this.configCache.splashAnimationUrl = streamUrl;
        } else if (category === 'TitleAnimation') {
          this.configCache.assignments.TitleAnimation = id;
          this.configCache.assignments.TitleAnimation_URL = streamUrl;
          this.configCache.titleAnimationUrl = streamUrl;
        } else if (category === 'CrowdAmbient') {
          this.configCache.crowdTrackId = id;
          this.configCache.crowdAmbientUrl = streamUrl;
        } else if (category === 'ShoeSqueaks') {
          const list = this.configCache.sfxAssignments.ShoeSqueaks ?? [];
          if (!list.includes(id)) {
            this.configCache.sfxAssignments.ShoeSqueaks = [...list, id];
          }
        } else if (category === 'SFX') {
          if (/apito|whistle/i.test(lower)) {
            this.configCache.sfxAssignments.Whistle = [id];
          } else if (/corte|spike|ataque/i.test(lower)) {
            this.configCache.sfxAssignments.ImpactSpike = [id];
          } else if (/manchete|receive|defesa/i.test(lower)) {
            this.configCache.sfxAssignments.ImpactReceive = [id];
          } else if (/chao|chão|floor|ponto/i.test(lower)) {
            this.configCache.sfxAssignments.FloorSlam = [id];
          } else if (/salto|jump/i.test(lower)) {
            this.configCache.sfxAssignments.Jump = [id];
          }
        } else {
          const stageMatch = lower.match(/(?:stage|estagio|estágio)[_\s-]*([1-7])/i);
          if (stageMatch?.[1]) {
            this.configCache.assignments[`Stage${stageMatch[1]}_BGM`] = id;
          } else if (/title|titulo|título|abertura/i.test(lower)) {
            this.configCache.assignments.TitleBGM = id;
            this.configCache.assignments.TitleBGM_URL = streamUrl;
            this.configCache.titleBgmUrl = streamUrl;
          } else {
            this.configCache.assignments.MenuTheme = id;
            this.configCache.assignments.LobbyBGM = id;
            this.configCache.assignments.LobbyBGM_URL = streamUrl;
            this.configCache.lobbyBgmUrl = streamUrl;
            this.configCache.menuMusicUrl = streamUrl;
          }
        }

        index += 1;
      }

      this.recomputeDerivedUrls();
    } catch {
      // Continua normalmente com os sons internos caso public/audio esteja vazia
    }
  }

  private sanitizeSfxTracksFromBgmSlots(): void {
    const squeakSet = new Set<string>(this.configCache.sfxAssignments.ShoeSqueaks ?? []);

    for (const trk of this.tracksCache.values()) {
      if (isShoeSqueakOrCourtSfxTrackName(trk.name, trk.category)) {
        trk.category = 'ShoeSqueaks';
        squeakSet.add(trk.id);
      }
    }

    for (const slot of Object.keys(this.configCache.assignments)) {
      if (
        slot === 'TitleBGM_URL' ||
        slot === 'LobbyBGM_URL' ||
        slot === 'TitleAnimation_URL' ||
        slot === 'TitleAnimation' ||
        slot === 'SplashAnimation_URL' ||
        slot === 'SplashAnimation'
      ) {
        continue;
      }
      const assignedId = this.configCache.assignments[slot];
      if (!assignedId) continue;
      const trk = this.tracksCache.get(assignedId);
      if (
        squeakSet.has(assignedId) ||
        (trk && isShoeSqueakOrCourtSfxTrackName(trk.name, trk.category))
      ) {
        this.configCache.assignments[slot] = null;
        squeakSet.add(assignedId);
      }
    }

    this.configCache.sfxAssignments.ShoeSqueaks = Array.from(squeakSet).slice(0, 32);
  }

  private recomputeDerivedUrls(): void {
    this.sanitizeSfxTracksFromBgmSlots();

    let menuTrackId = this.configCache.assignments.MenuTheme;
    let menuTrack = menuTrackId ? this.tracksCache.get(menuTrackId) : undefined;
    if (!menuTrack || isShoeSqueakOrCourtSfxTrackName(menuTrack.name, menuTrack.category)) {
      const candidates = Array.from(this.tracksCache.values())
        .filter(
          (t) =>
            (t.category === 'MenuMusic' || t.category === 'LobbyBGM') &&
            !isShoeSqueakOrCourtSfxTrackName(t.name, t.category),
        )
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      menuTrack = candidates[0];
    }

    if (menuTrack) {
      this.configCache.assignments.MenuTheme = menuTrack.id;
      this.configCache.menuMusicUrl = menuTrack.url;
    } else {
      this.configCache.assignments.MenuTheme = null;
      this.configCache.menuMusicUrl = '';
    }

    const titleTrackId = this.configCache.assignments.TitleBGM;
    const titleTrack = titleTrackId ? this.tracksCache.get(titleTrackId) : undefined;
    this.configCache.titleBgmUrl =
      titleTrack?.url ||
      (this.configCache.assignments.TitleBGM_URL || '').trim() ||
      this.configCache.menuMusicUrl ||
      '';

    const lobbyTrackId = this.configCache.assignments.LobbyBGM;
    const lobbyTrack = lobbyTrackId ? this.tracksCache.get(lobbyTrackId) : undefined;
    this.configCache.lobbyBgmUrl =
      lobbyTrack?.url ||
      (this.configCache.assignments.LobbyBGM_URL || '').trim() ||
      this.configCache.menuMusicUrl ||
      '';

    const animTrackId = this.configCache.assignments.TitleAnimation;
    const animTrack = animTrackId ? this.tracksCache.get(animTrackId) : undefined;
    this.configCache.titleAnimationUrl =
      animTrack?.url || (this.configCache.assignments.TitleAnimation_URL || '').trim() || '';

    const splashTrackId = this.configCache.assignments.SplashAnimation;
    const splashTrack = splashTrackId ? this.tracksCache.get(splashTrackId) : undefined;
    this.configCache.splashAnimationUrl =
      splashTrack?.url || (this.configCache.assignments.SplashAnimation_URL || '').trim() || '';

    const crowdId = this.configCache.crowdTrackId;
    const crowdTrack = crowdId ? this.tracksCache.get(crowdId) : undefined;
    this.configCache.crowdAmbientUrl = crowdTrack ? crowdTrack.url : '';

    const squeakIds = this.configCache.sfxAssignments.ShoeSqueaks ?? [];
    const squeakUrls: string[] = [];
    for (const sid of squeakIds) {
      const trk = this.tracksCache.get(sid);
      if (trk) squeakUrls.push(trk.url);
    }
    this.configCache.shoeSqueakUrls = squeakUrls.slice(0, 32);
    this.configCache.trackIds = Array.from(this.tracksCache.keys()).slice(0, 64);
  }

  public async getFullState(): Promise<{
    settings: GlobalAudioSettingsRecord;
    config: GlobalAudioSettingsRecord;
    tracks: CloudAudioTrackRecord[];
  }> {
    if (!this.hydrated) {
      await this.hydrateFromCloud();
    }
    this.recomputeDerivedUrls();
    const tracks = Array.from(this.tracksCache.values()).sort(
      (a, b) => a.createdAtMs - b.createdAtMs,
    );
    const snapshot: GlobalAudioSettingsRecord = {
      ...this.configCache,
      shoeSqueakUrls: [...this.configCache.shoeSqueakUrls],
      assignments: { ...this.configCache.assignments },
      sfxAssignments: { ...this.configCache.sfxAssignments },
      trackIds: [...this.configCache.trackIds],
    };
    return {
      settings: snapshot,
      config: snapshot,
      tracks,
    };
  }

  public async uploadAudio(params: {
    id?: string;
    name: string;
    mimeType: string;
    category: AudioCategory;
    assignSlot?: string | null;
    buffer: Buffer;
  }): Promise<{ track: CloudAudioTrackRecord; config: GlobalAudioSettingsRecord }> {
    const id =
      sanitizeId(params.id) || `trk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const cleanName =
      (params.name || 'Faixa Customizada')
        .replace(/\.(mp3|wav|ogg|mp4|webm)$/i, '')
        .trim()
        .slice(0, 140) || 'Faixa Customizada';
    const mimeType = normalizeMimeType(params.mimeType, params.name);
    const category = normalizeCategory(params.category, cleanName);
    const streamUrl = `/api/audio/stream/${id}`;

    this.binaryCache.set(id, { mimeType, buffer: Buffer.from(params.buffer) });

    const record: CloudAudioTrackRecord = {
      id,
      name: cleanName,
      mimeType,
      sizeBytes: Math.max(1, params.buffer.byteLength),
      createdAtMs: Date.now(),
      category,
      url: streamUrl,
      storageUrl: streamUrl,
      chunkCount: 1,
    };

    this.tracksCache.set(id, record);

    const slot = params.assignSlot?.trim() || null;
    if (category === 'SplashAnimation' || slot === 'SplashAnimation') {
      this.configCache.assignments.SplashAnimation = id;
      this.configCache.assignments.SplashAnimation_URL = record.url;
      this.configCache.splashAnimationUrl = record.url;
    } else if (category === 'TitleAnimation' || slot === 'TitleAnimation') {
      this.configCache.assignments.TitleAnimation = id;
      this.configCache.assignments.TitleAnimation_URL = record.url;
      this.configCache.titleAnimationUrl = record.url;
    } else if (category === 'TitleBGM' || slot === 'TitleBGM') {
      this.configCache.assignments.TitleBGM = id;
      this.configCache.assignments.TitleBGM_URL = record.url;
      this.configCache.titleBgmUrl = record.url;
    } else if (category === 'LobbyBGM' || slot === 'LobbyBGM' || slot === 'MenuTheme') {
      this.configCache.assignments.LobbyBGM = id;
      this.configCache.assignments.MenuTheme = id;
      this.configCache.assignments.LobbyBGM_URL = record.url;
      this.configCache.lobbyBgmUrl = record.url;
    } else if (category === 'CrowdAmbient' || slot === 'CrowdAmbience') {
      this.configCache.crowdTrackId = id;
    } else if (category === 'ShoeSqueaks' || slot === 'ShoeSqueaks') {
      const current = this.configCache.sfxAssignments.ShoeSqueaks ?? [];
      if (!current.includes(id)) {
        this.configCache.sfxAssignments.ShoeSqueaks = [...current, id];
      }
    } else if (slot && slot in DEFAULT_ASSIGNMENTS) {
      this.configCache.assignments[slot] = id;
    } else if (category === 'MenuMusic' && !this.configCache.assignments.MenuTheme) {
      this.configCache.assignments.MenuTheme = id;
    }

    this.recomputeDerivedUrls();
    return {
      track: record,
      config: { ...this.configCache },
    };
  }

  public async updateConfig(
    patch: Partial<GlobalAudioSettingsRecord>,
  ): Promise<GlobalAudioSettingsRecord> {
    if (typeof patch.crowdTrackId === 'string') {
      this.configCache.crowdTrackId = sanitizeId(patch.crowdTrackId);
    }
    if (typeof patch.titleBgmUrl === 'string') {
      const cleanUrl = patch.titleBgmUrl.trim().slice(0, 512);
      this.configCache.assignments.TitleBGM_URL = cleanUrl || null;
      this.configCache.titleBgmUrl = cleanUrl;
    }
    if (typeof patch.lobbyBgmUrl === 'string') {
      const cleanUrl = patch.lobbyBgmUrl.trim().slice(0, 512);
      this.configCache.assignments.LobbyBGM_URL = cleanUrl || null;
      this.configCache.lobbyBgmUrl = cleanUrl;
    }
    if (typeof patch.titleAnimationUrl === 'string') {
      const cleanUrl = patch.titleAnimationUrl.trim().slice(0, 512);
      this.configCache.assignments.TitleAnimation_URL = cleanUrl || null;
      this.configCache.titleAnimationUrl = cleanUrl;
    }
    if (typeof patch.splashAnimationUrl === 'string') {
      const cleanUrl = patch.splashAnimationUrl.trim().slice(0, 512);
      this.configCache.assignments.SplashAnimation_URL = cleanUrl || null;
      this.configCache.splashAnimationUrl = cleanUrl;
    }
    if (patch.assignments && typeof patch.assignments === 'object') {
      for (const slot of Object.keys(DEFAULT_ASSIGNMENTS)) {
        if (slot in patch.assignments) {
          const val = patch.assignments[slot];
          if (
            slot === 'TitleBGM_URL' ||
            slot === 'LobbyBGM_URL' ||
            slot === 'TitleAnimation_URL' ||
            slot === 'SplashAnimation_URL'
          ) {
            this.configCache.assignments[slot] =
              typeof val === 'string' && val.trim() ? val.trim().slice(0, 512) : null;
          } else {
            this.configCache.assignments[slot] = val ? sanitizeId(val) : null;
          }
        }
      }
    }
    if (patch.sfxAssignments && typeof patch.sfxAssignments === 'object') {
      for (const sfxSlot of Object.keys(DEFAULT_SFX_ASSIGNMENTS)) {
        if (sfxSlot in patch.sfxAssignments) {
          const arr = patch.sfxAssignments[sfxSlot];
          if (Array.isArray(arr)) {
            this.configCache.sfxAssignments[sfxSlot] = arr
              .map((id) => sanitizeId(id))
              .filter((id) => id.length > 0)
              .slice(0, 32);
          }
        }
      }
    }
    if (typeof patch.fadeOutSec === 'number' && Number.isFinite(patch.fadeOutSec)) {
      this.configCache.fadeOutSec = Math.max(0.1, Math.min(3.0, patch.fadeOutSec));
    }
    if (typeof patch.fadeInSec === 'number' && Number.isFinite(patch.fadeInSec)) {
      this.configCache.fadeInSec = Math.max(0.1, Math.min(3.0, patch.fadeInSec));
    }
    if (typeof patch.crowdVolume === 'number' && Number.isFinite(patch.crowdVolume)) {
      this.configCache.crowdVolume = Math.max(0, Math.min(1, patch.crowdVolume));
    }
    if (typeof patch.shoeSqueakVolume === 'number' && Number.isFinite(patch.shoeSqueakVolume)) {
      this.configCache.shoeSqueakVolume = Math.max(0, Math.min(1, patch.shoeSqueakVolume));
    }

    this.recomputeDerivedUrls();
    return { ...this.configCache };
  }

  public async deleteTrack(trackId: string): Promise<GlobalAudioSettingsRecord> {
    const cleanId = sanitizeId(trackId);
    if (!cleanId) return { ...this.configCache };

    this.tracksCache.delete(cleanId);
    this.binaryCache.delete(cleanId);
    this.filePathsCache.delete(cleanId);

    if (this.configCache.crowdTrackId === cleanId) {
      this.configCache.crowdTrackId = '';
    }
    for (const slot of Object.keys(this.configCache.assignments)) {
      if (this.configCache.assignments[slot] === cleanId) {
        this.configCache.assignments[slot] = null;
      }
    }
    for (const sfxSlot of Object.keys(this.configCache.sfxAssignments)) {
      const list = this.configCache.sfxAssignments[sfxSlot] ?? [];
      if (list.includes(cleanId)) {
        this.configCache.sfxAssignments[sfxSlot] = list.filter((id) => id !== cleanId);
      }
    }

    this.recomputeDerivedUrls();
    return { ...this.configCache };
  }

  public async getTrackAudioBuffer(
    trackId: string,
  ): Promise<{ mimeType: string; buffer: Buffer } | null> {
    const cleanId = sanitizeId(trackId);
    if (!cleanId) return null;

    const cached = this.binaryCache.get(cleanId);
    if (cached) return cached;

    const filePath = this.filePathsCache.get(cleanId);
    const meta = this.tracksCache.get(cleanId);
    if (filePath && fs.existsSync(filePath)) {
      try {
        const buffer = await fs.promises.readFile(filePath);
        const entry = { mimeType: meta?.mimeType || 'audio/mpeg', buffer };
        this.binaryCache.set(cleanId, entry);
        return entry;
      } catch {
        return null;
      }
    }

    return null;
  }
}

export const CloudAudioPersistenceService = LocalDiskAudioPersistenceService;

export function registerAudioStorageRoutes(
  app: Express,
  customService?: AudioPersistenceDriver,
): AudioPersistenceDriver {
  const persistence = customService ?? new LocalDiskAudioPersistenceService();

  app.post('/api/admin/login', (req: Request, res: Response) => {
    const body = (req.body ?? {}) as {
      adminKey?: string;
      password?: string;
      secretKey?: string;
      email?: string;
    };

    const candidateUrlKey = (body.adminKey ?? '').trim();
    const candidatePassword = (body.password ?? body.secretKey ?? '').trim();
    const candidateEmail = (body.email ?? '').trim().toLowerCase();

    if (candidateUrlKey && candidateUrlKey === ADMIN_URL_SECRET_KEY) {
      const token = createAdminSessionToken(candidateEmail || 'admin_url_key');
      res.json({ ok: true, isAdmin: true, adminToken: token });
      return;
    }

    if (
      candidatePassword &&
      (candidatePassword === ADMIN_FALLBACK_PASSWORD ||
        candidatePassword === ADMIN_URL_SECRET_KEY)
    ) {
      const token = createAdminSessionToken(candidateEmail || 'admin_7tap_fallback');
      res.json({ ok: true, isAdmin: true, adminToken: token });
      return;
    }

    if (candidateEmail && isAuthorizedAdminEmail(candidateEmail)) {
      const token = createAdminSessionToken(candidateEmail);
      res.json({ ok: true, isAdmin: true, adminToken: token });
      return;
    }

    res.status(403).json({
      ok: false,
      isAdmin: false,
      error: '403 Forbidden: Senha ou credencial de Administrador inválida.',
    });
  });

  app.get('/api/admin/verify', (req: Request, res: Response) => {
    const token = extractAdminTokenFromRequest(req);
    const valid = verifyAdminToken(token);
    if (!valid) {
      res.status(403).json({ ok: false, isAdmin: false, error: '403 Forbidden' });
      return;
    }
    res.json({ ok: true, isAdmin: true });
  });

  const handleGetAudioSettings = async (_req: Request, res: Response) => {
    try {
      const state = await persistence.getFullState();
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.json({
        ok: true,
        menuMusicUrl: state.settings.menuMusicUrl,
        titleBgmUrl: state.settings.titleBgmUrl || state.settings.menuMusicUrl,
        lobbyBgmUrl: state.settings.lobbyBgmUrl || state.settings.menuMusicUrl,
        titleAnimationUrl: state.settings.titleAnimationUrl || '',
        splashAnimationUrl: state.settings.splashAnimationUrl || '',
        crowdAmbientUrl: state.settings.crowdAmbientUrl,
        shoeSqueakUrls: state.settings.shoeSqueakUrls,
        settings: state.settings,
        config: state.config,
        tracks: state.tracks,
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Erro ao carregar configurações de áudio.',
      });
    }
  };

  app.get('/api/audio-settings', handleGetAudioSettings);
  app.get('/api/audio/config', handleGetAudioSettings);
  app.get('/api/game-media', handleGetAudioSettings);

  const handleUploadAudio = async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as {
        id?: string;
        name?: string;
        mimeType?: string;
        category?: AudioCategory;
        assignSlot?: string | null;
        dataBase64?: string;
      };

      if (!body.dataBase64 || typeof body.dataBase64 !== 'string') {
        res.status(400).json({ ok: false, error: 'Payload de áudio (dataBase64) ausente.' });
        return;
      }

      const rawBase64 = body.dataBase64.includes(',')
        ? body.dataBase64.split(',')[1]
        : body.dataBase64;
      const buffer = Buffer.from(rawBase64, 'base64');

      if (buffer.byteLength === 0) {
        res.status(400).json({ ok: false, error: 'O arquivo de áudio enviado está vazio.' });
        return;
      }

      if (buffer.byteLength > 25 * 1024 * 1024) {
        res.status(413).json({ ok: false, error: 'O arquivo de áudio excede o limite de 25MB.' });
        return;
      }

      const result = await persistence.uploadAudio({
        id: body.id,
        name: body.name || 'Faixa Customizada',
        mimeType: body.mimeType || 'audio/mpeg',
        category: normalizeCategory(body.category),
        assignSlot: body.assignSlot ?? null,
        buffer,
      });

      res.json({
        ok: true,
        url: result.track.url,
        storageUrl: result.track.storageUrl,
        track: result.track,
        settings: result.config,
        config: result.config,
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Falha ao salvar áudio.',
      });
    }
  };

  app.post('/api/upload-audio', requireAdminAuth, handleUploadAudio);
  app.post('/api/audio/upload', requireAdminAuth, handleUploadAudio);

  const handleUpdateAudioSettings = async (req: Request, res: Response) => {
    try {
      const updated = await persistence.updateConfig(req.body ?? {});
      res.json({ ok: true, settings: updated, config: updated });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Falha ao atualizar configuração de áudio.',
      });
    }
  };

  app.put('/api/audio/config', requireAdminAuth, handleUpdateAudioSettings);
  app.post('/api/audio-settings', requireAdminAuth, handleUpdateAudioSettings);
  app.put('/api/audio-settings', requireAdminAuth, handleUpdateAudioSettings);

  app.delete(
    '/api/audio/tracks/:trackId',
    requireAdminAuth,
    async (req: Request, res: Response) => {
      try {
        const config = await persistence.deleteTrack(String(req.params.trackId || ''));
        res.json({ ok: true, settings: config, config });
      } catch (err) {
        res.status(500).json({
          ok: false,
          error: err instanceof Error ? err.message : 'Falha ao remover faixa.',
        });
      }
    },
  );

  app.get('/api/audio/stream/:trackId', async (req: Request, res: Response) => {
    try {
      const trackId = String(req.params.trackId || '');
      const result = await persistence.getTrackAudioBuffer(trackId);
      if (!result) {
        res.status(404).json({ ok: false, error: 'Faixa de áudio não encontrada.' });
        return;
      }

      const totalLength = result.buffer.byteLength;
      const rangeHeader = req.headers.range;

      res.setHeader('Content-Type', result.mimeType);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

      if (rangeHeader && rangeHeader.startsWith('bytes=')) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = Number.parseInt(parts[0], 10);
        const end = parts[1] ? Number.parseInt(parts[1], 10) : totalLength - 1;

        if (
          Number.isFinite(start) &&
          Number.isFinite(end) &&
          start >= 0 &&
          end < totalLength &&
          start <= end
        ) {
          const chunk = result.buffer.subarray(start, end + 1);
          res.status(206);
          res.setHeader('Content-Range', `bytes ${start}-${end}/${totalLength}`);
          res.setHeader('Content-Length', String(chunk.byteLength));
          res.send(chunk);
          return;
        }
      }

      res.setHeader('Content-Length', String(totalLength));
      res.send(result.buffer);
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Erro no streaming de áudio.',
      });
    }
  });

  // Economia e métricas em memória (sem Firestore)
  const economyMemoryCache = new Map<string, Record<string, unknown>>();

  app.get('/api/player-economy/:uid', (req: Request, res: Response) => {
    const uid = sanitizeId(req.params.uid) || 'default_player';
    const cached = economyMemoryCache.get(uid) ?? null;
    res.json({ ok: true, uid, economy: cached });
  });

  app.post('/api/player-economy/:uid', (req: Request, res: Response) => {
    const uid = sanitizeId(req.params.uid) || 'default_player';
    const body = (req.body ?? {}) as Record<string, unknown>;
    const rawSave =
      body.save && typeof body.save === 'object' && !Array.isArray(body.save)
        ? (body.save as Record<string, unknown>)
        : {};
    const record = {
      uid,
      playerCoins: Math.max(
        0,
        Math.min(10_000_000, Math.floor(Number(body.playerCoins ?? body.coins ?? rawSave.coins ?? 0) || 0)),
      ),
      playerGems: Math.max(
        0,
        Math.min(10_000_000, Math.floor(Number(body.playerGems ?? body.gems ?? rawSave.gems ?? 0) || 0)),
      ),
      save: rawSave,
      updatedAtMs: Math.max(0, Math.floor(Date.now())),
    };
    economyMemoryCache.set(uid, record);
    res.json({ ok: true, uid, economy: record });
  });

  interface BetaStoreMetricRecord {
    itemId: string;
    itemName: string;
    category: 'diamond_pack' | 'gacha_box' | 'outfit' | 'ball_color';
    currency: string;
    redemptionCount: number;
    lastRedeemedBy: string;
    updatedAtMs: number;
  }

  const betaStoreMetricsCache = new Map<string, BetaStoreMetricRecord>();
  const analyticsUsersCache = new Map<string, AnalyticsUserRecord>();

  app.post('/api/beta/store-event', (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const itemId = sanitizeId(body.itemId) || 'pack_100';
    const itemName = String(body.itemName || itemId).trim().slice(0, 96);
    const rawCat = String(body.category || 'diamond_pack');
    const category: BetaStoreMetricRecord['category'] =
      rawCat === 'gacha_box' || rawCat === 'outfit' || rawCat === 'ball_color'
        ? rawCat
        : 'diamond_pack';
    const currency = String(body.currency || 'coins').slice(0, 24);
    const playerName = String(body.playerName || 'Jogador Beta').trim().slice(0, 64) || 'Jogador Beta';

    const existing = betaStoreMetricsCache.get(itemId);
    const updated: BetaStoreMetricRecord = {
      itemId,
      itemName,
      category,
      currency,
      redemptionCount: (existing?.redemptionCount ?? 0) + 1,
      lastRedeemedBy: playerName,
      updatedAtMs: Date.now(),
    };
    betaStoreMetricsCache.set(itemId, updated);
    res.json({ ok: true, metric: updated });
  });

  app.post('/api/analytics/register-user', (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const uid = sanitizeId(body.uid) || `google_${Date.now()}`;
    const existing = analyticsUsersCache.get(uid);
    const displayName =
      String(body.displayName || existing?.displayName || 'Atleta Google')
        .trim()
        .slice(0, 64) || 'Atleta Google';
    const email =
      String(body.email || existing?.email || `${uid}@playgames.google.com`)
        .trim()
        .slice(0, 160) || `${uid}@playgames.google.com`;

    const record: AnalyticsUserRecord = {
      uid,
      displayName,
      email,
      matchesPlayed: Math.max(
        existing?.matchesPlayed ?? 0,
        Math.floor(Number(body.matchesPlayed ?? existing?.matchesPlayed ?? 0) || 0),
      ),
      totalSessionSeconds: Math.max(
        existing?.totalSessionSeconds ?? 0,
        Math.floor(Number(body.totalSessionSeconds ?? existing?.totalSessionSeconds ?? 0) || 0),
      ),
      sessionCount: Math.max(1, (existing?.sessionCount ?? 0) + (existing ? 0 : 1)),
      ratingStars: existing?.ratingStars ?? 0,
      ratingComment: existing?.ratingComment ?? '',
      updatedAtMs: Date.now(),
    };

    analyticsUsersCache.set(uid, record);
    res.json({ ok: true, user: record });
  });

  app.post('/api/analytics/session', (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const uid = sanitizeId(body.uid) || 'google_player_default';
    const existing = analyticsUsersCache.get(uid);
    const addedSeconds = Math.max(
      1,
      Math.min(86_400, Math.floor(Number(body.sessionSeconds ?? body.durationSeconds ?? 0) || 0)),
    );
    const matchesDelta = Math.max(0, Math.floor(Number(body.matchesPlayedDelta ?? 0) || 0));

    const record: AnalyticsUserRecord = {
      uid,
      displayName:
        String(body.displayName || existing?.displayName || 'Atleta Google')
          .trim()
          .slice(0, 64) || 'Atleta Google',
      email:
        String(body.email || existing?.email || `${uid}@playgames.google.com`)
          .trim()
          .slice(0, 160) || `${uid}@playgames.google.com`,
      matchesPlayed: (existing?.matchesPlayed ?? 0) + matchesDelta,
      totalSessionSeconds: (existing?.totalSessionSeconds ?? 0) + addedSeconds,
      sessionCount: (existing?.sessionCount ?? 0) + 1,
      ratingStars: existing?.ratingStars ?? 0,
      ratingComment: existing?.ratingComment ?? '',
      updatedAtMs: Date.now(),
    };

    analyticsUsersCache.set(uid, record);
    res.json({ ok: true, user: record });
  });

  app.post('/api/analytics/rating', (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const uid = sanitizeId(body.uid) || 'google_player_default';
    const existing = analyticsUsersCache.get(uid);
    const stars = Math.max(1, Math.min(5, Math.floor(Number(body.ratingStars ?? body.stars ?? 5) || 5)));
    const comment = String(body.ratingComment ?? body.comment ?? '').trim().slice(0, 300);

    const record: AnalyticsUserRecord = {
      uid,
      displayName:
        String(body.displayName || existing?.displayName || 'Atleta Google')
          .trim()
          .slice(0, 64) || 'Atleta Google',
      email:
        String(body.email || existing?.email || `${uid}@playgames.google.com`)
          .trim()
          .slice(0, 160) || `${uid}@playgames.google.com`,
      matchesPlayed: Math.max(
        existing?.matchesPlayed ?? 1,
        Math.floor(Number(body.matchesPlayed ?? existing?.matchesPlayed ?? 1) || 1),
      ),
      totalSessionSeconds: Math.max(60, existing?.totalSessionSeconds ?? 180),
      sessionCount: Math.max(1, existing?.sessionCount ?? 1),
      ratingStars: stars,
      ratingComment: comment,
      updatedAtMs: Date.now(),
    };

    analyticsUsersCache.set(uid, record);
    res.json({ ok: true, user: record });
  });

  app.get('/api/admin/analytics', (_req: Request, res: Response) => {
    const users = Array.from(analyticsUsersCache.values()).sort(
      (a, b) => b.updatedAtMs - a.updatedAtMs,
    );
    const storeMetrics = Array.from(betaStoreMetricsCache.values()).sort(
      (a, b) => b.redemptionCount - a.redemptionCount,
    );

    const totalUsers = users.length;
    const totalSessions = users.reduce((acc, u) => acc + Math.max(1, u.sessionCount), 0);
    const totalSessionSeconds = users.reduce((acc, u) => acc + u.totalSessionSeconds, 0);
    const averageSessionSeconds =
      totalUsers > 0 ? Math.round(totalSessionSeconds / totalUsers) : 0;

    const ratedUsers = users.filter((u) => u.ratingStars >= 1 && u.ratingStars <= 5);
    const totalRatings = ratedUsers.length;
    const averageRatingStars =
      totalRatings > 0
        ? Number(
            (
              ratedUsers.reduce((acc, u) => acc + u.ratingStars, 0) / totalRatings
            ).toFixed(2),
          )
        : 0;

    const totalStoreRedemptions = storeMetrics.reduce((acc, m) => acc + m.redemptionCount, 0);

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.json({
      ok: true,
      users,
      storeMetrics,
      summary: {
        totalUsers,
        totalSessions,
        totalSessionSeconds,
        averageSessionSeconds,
        totalRatings,
        averageRatingStars,
        totalStoreRedemptions,
      },
    });
  });

  return persistence;
}