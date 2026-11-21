/**
 * Spike Legends Online — Painel de Trilha Sonora Customizada & Persistência em Nuvem
 * Permite enviar arquivos (.mp3, .wav, .ogg) para Cloud Storage + Banco de Dados (Firestore),
 * pré-escutar, configurar tempo de Fade Out / Fade In, controlar o Som da Plateia (CrowdAmbient)
 * e os Rangidos de Tênis (ShoeSqueaks[]), além de vincular músicas a MenuTheme e Stage1_BGM..Stage7_BGM.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Cloud,
  Film,
  Lock,
  Music,
  Play,
  RefreshCw,
  ShieldCheck,
  Square,
  Star,
  Trash2,
  Upload,
  Users,
  Volume2,
} from 'lucide-react';
import {
  customSoundtrackManager,
  isShoeSqueakOrCourtSfxTrack,
  SCENE_AUDIO_SLOTS,
  SFX_AUDIO_SLOTS,
  type CustomSfxSlot,
  type SceneAudioSlot,
} from '../audio/customSoundtrackManager';
import { soundEngine } from '../audio/soundEngine';

interface AdminAnalyticsUserRow {
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

interface AdminAnalyticsSummary {
  totalUsers: number;
  totalSessions: number;
  totalSessionSeconds: number;
  averageSessionSeconds: number;
  totalRatings: number;
  averageRatingStars: number;
  totalStoreRedemptions?: number;
}

interface AdminBetaStoreMetricRow {
  itemId: string;
  itemName: string;
  category: 'diamond_pack' | 'gacha_box' | 'outfit' | 'ball_color';
  currency: string;
  redemptionCount: number;
  lastRedeemedBy: string;
  updatedAtMs: number;
}

function formatDurationMinSec(totalSec: number): string {
  const safe = Math.max(0, Math.round(totalSec));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface CustomSoundtrackPanelProps {
  isAdmin?: boolean;
  onAdminLogout?: () => void;
}

export const CustomSoundtrackPanel: React.FC<CustomSoundtrackPanelProps> = ({
  isAdmin,
  onAdminLogout,
}) => {
  const [, setTick] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingMediaSlot, setUploadingMediaSlot] = useState<
    'TitleBGM' | 'LobbyBGM' | 'TitleAnimation' | 'SplashAnimation' | null
  >(null);
  const [titleBgmInput, setTitleBgmInput] = useState('');
  const [lobbyBgmInput, setLobbyBgmInput] = useState('');
  const [titleAnimationInput, setTitleAnimationInput] = useState('');
  const [splashAnimationInput, setSplashAnimationInput] = useState('');
  const [bgmSaveNotice, setBgmSaveNotice] = useState<string | null>(null);
  const [analyticsUsers, setAnalyticsUsers] = useState<AdminAnalyticsUserRow[]>([]);
  const [storeMetrics, setStoreMetrics] = useState<AdminBetaStoreMetricRow[]>([]);
  const [analyticsSummary, setAnalyticsSummary] = useState<AdminAnalyticsSummary>({
    totalUsers: 0,
    totalSessions: 0,
    totalSessionSeconds: 0,
    averageSessionSeconds: 0,
    totalRatings: 0,
    averageRatingStars: 0,
    totalStoreRedemptions: 0,
  });
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const titleBgmFileInputRef = useRef<HTMLInputElement | null>(null);
  const lobbyBgmFileInputRef = useRef<HTMLInputElement | null>(null);
  const titleAnimationFileInputRef = useRef<HTMLInputElement | null>(null);
  const splashAnimationFileInputRef = useRef<HTMLInputElement | null>(null);
  const crowdFileInputRef = useRef<HTMLInputElement | null>(null);
  const shoeSqueakInputRef = useRef<HTMLInputElement | null>(null);

  const effectiveIsAdmin = isAdmin ?? customSoundtrackManager.isAdminUser();

  const fetchAdminAnalytics = async () => {
    setLoadingAnalytics(true);
    try {
      const res = await fetch('/api/admin/analytics', { cache: 'no-store' });
      if (res.ok) {
        const json = (await res.json()) as {
          ok?: boolean;
          users?: AdminAnalyticsUserRow[];
          storeMetrics?: AdminBetaStoreMetricRow[];
          summary?: AdminAnalyticsSummary;
        };
        if (json.ok) {
          setAnalyticsUsers(Array.isArray(json.users) ? json.users : []);
          setStoreMetrics(Array.isArray(json.storeMetrics) ? json.storeMetrics : []);
          if (json.summary) {
            setAnalyticsSummary(json.summary);
          }
        }
      }
    } catch {
      // ignora erro de rede
    } finally {
      setLoadingAnalytics(false);
    }
  };

  useEffect(() => {
    const initial = customSoundtrackManager.getState();
    setTitleBgmInput(initial.titleBgmUrl || initial.menuMusicUrl || '');
    setLobbyBgmInput(initial.lobbyBgmUrl || initial.menuMusicUrl || '');
    setTitleAnimationInput(initial.titleAnimationUrl || '');
    setSplashAnimationInput(initial.splashAnimationUrl || '');

    const unsub = customSoundtrackManager.subscribe(() => {
      setTick((t) => t + 1);
      const st = customSoundtrackManager.getState();
      setTitleBgmInput((prev) => prev || st.titleBgmUrl || st.menuMusicUrl || '');
      setLobbyBgmInput((prev) => prev || st.lobbyBgmUrl || st.menuMusicUrl || '');
      setTitleAnimationInput((prev) => prev || st.titleAnimationUrl || '');
      setSplashAnimationInput((prev) => prev || st.splashAnimationUrl || '');
    });
    return () => {
      unsub();
      customSoundtrackManager.stopPreview();
    };
  }, []);

  useEffect(() => {
    if (effectiveIsAdmin) {
      void fetchAdminAnalytics();
    }
  }, [effectiveIsAdmin]);

  // Proteção Estrita de UI: Jogadores comuns NUNCA instanciam ou visualizam o painel de Upload de Áudios
  if (!effectiveIsAdmin) {
    return null;
  }

  const state = customSoundtrackManager.getState();
  const status = customSoundtrackManager.getStatus();

  const handleCloudMediaUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    slot: 'TitleBGM' | 'LobbyBGM' | 'TitleAnimation' | 'SplashAnimation',
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadError(null);
    setIsUploading(true);
    setUploadingMediaSlot(slot);
    setBgmSaveNotice(`Enviando ${file.name} (${slot}) para Firebase Storage + Firestore (config/gameMedia)...`);
    try {
      soundEngine.unlock();
      const res = await customSoundtrackManager.uploadCloudMediaFile(file, slot);
      if (slot === 'TitleBGM') {
        setTitleBgmInput(res.url);
      } else if (slot === 'LobbyBGM') {
        setLobbyBgmInput(res.url);
      } else if (slot === 'TitleAnimation') {
        setTitleAnimationInput(res.url);
      } else if (slot === 'SplashAnimation') {
        setSplashAnimationInput(res.url);
      }
      setBgmSaveNotice(
        `✓ ${slot} enviado e persistido na nuvem (config/gameMedia): ${res.url}`,
      );
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : `Falha ao enviar arquivo para ${slot}.`);
      setBgmSaveNotice(null);
    } finally {
      setIsUploading(false);
      setUploadingMediaSlot(null);
    }
  };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    setUploadError(null);
    setIsUploading(true);
    try {
      soundEngine.unlock();
      for (const file of files) {
        if (isShoeSqueakOrCourtSfxTrack(file.name)) {
          await customSoundtrackManager.uploadShoeSqueakFiles([file]);
          continue;
        }
        const assignMenu = !customSoundtrackManager.hasTrackForSlot('MenuTheme');
        const meta = await customSoundtrackManager.uploadTrackFile(file, {
          category: assignMenu ? 'MenuMusic' : 'StageBGM',
          assignSlot: assignMenu ? 'MenuTheme' : null,
        });
        if (assignMenu) {
          customSoundtrackManager.assignTrackToSlot('MenuTheme', meta.id);
        }
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Falha ao importar faixa de áudio.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCrowdFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadError(null);
    setIsUploading(true);
    try {
      soundEngine.unlock();
      await customSoundtrackManager.uploadCrowdAmbienceFile(file);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Falha ao enviar áudio da plateia.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleShoeSqueakFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    setUploadError(null);
    setIsUploading(true);
    try {
      soundEngine.unlock();
      await customSoundtrackManager.uploadShoeSqueakFiles(files);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Falha ao enviar amostras de movimentação.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <section
      data-testid="custom-soundtrack-panel"
      className="bg-[#1E293B]/60 rounded-xl p-4 border-2 border-amber-500/40 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display font-bold text-base text-white flex items-center gap-2">
              <Music className="w-4 h-4 text-[#F97316]" />
              Painel Exclusivo de Admin — Upload de Áudios (Nuvem)
            </h3>
            <span
              data-testid="admin-badge-verified"
              className="px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 bg-amber-500/20 border border-amber-400/50 text-amber-300"
            >
              <ShieldCheck className="w-3 h-3" />
              ADMIN AUTENTICADO
            </span>
            <span
              data-testid="cloud-audio-sync-badge"
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 border ${
                status.isCloudSynced
                  ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-900 border-slate-700 text-slate-400'
              }`}
            >
              <Cloud className="w-3 h-3" />
              {status.isCloudSynced ? 'Persistido no Cloud Storage + GlobalSettings' : 'Sincronizando Nuvem...'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Envie arquivos <strong className="text-slate-200">.mp3, .wav ou .ogg</strong>. Os áudios enviados ficam salvos em <strong className="text-amber-300">GlobalSettings</strong> (Cloud Storage + Firestore) e são carregados automaticamente por todos os jogadores.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/ogg"
            multiple
            data-testid="soundtrack-file-input"
            onChange={handleFilesSelected}
            className="hidden"
          />
          <button
            type="button"
            data-testid="btn-upload-soundtrack"
            disabled={isUploading}
            onClick={() => {
              soundEngine.unlock();
              soundEngine.playButtonClick();
              fileInputRef.current?.click();
            }}
            className="px-3.5 py-2 rounded-xl bg-[#F97316] hover:bg-[#EA580C] text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60 whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            {isUploading ? 'Enviando para Nuvem...' : 'Importar Áudio'}
          </button>
          <button
            type="button"
            data-testid="btn-lock-admin-panel"
            onClick={() => {
              soundEngine.playButtonClick();
              if (onAdminLogout) {
                onAdminLogout();
              } else {
                customSoundtrackManager.logoutAdmin();
              }
            }}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            Ocultar Admin
          </button>
        </div>
      </div>

      {uploadError && (
        <div className="px-3 py-2 rounded-lg bg-red-950/90 border border-red-500/60 text-red-100 text-xs font-medium">
          {uploadError}
        </div>
      )}

      {/* Controles Dinâmicos de Volume Independente (Plateia e Rangidos de Tênis) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#0F172A] rounded-xl p-3 border border-slate-800">
        <div>
          <label
            htmlFor="crowd-vol-slider"
            className="flex justify-between text-xs font-semibold text-slate-200 mb-1"
          >
            <span>Volume da Plateia / Torcida</span>
            <span className="font-mono-num text-amber-300">{Math.round(state.crowdVolume * 100)}%</span>
          </label>
          <input
            id="crowd-vol-slider"
            data-testid="crowd-volume-slider"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={state.crowdVolume}
            onChange={(e) => customSoundtrackManager.setCrowdVolume(Number(e.target.value))}
            className="w-full accent-[#F97316]"
          />
        </div>

        <div>
          <label
            htmlFor="shoe-squeak-vol-slider"
            className="flex justify-between text-xs font-semibold text-slate-200 mb-1"
          >
            <span>Volume dos Rangidos / Passos</span>
            <span className="font-mono-num text-cyan-300">
              {Math.round(state.shoeSqueakVolume * 100)}%
            </span>
          </label>
          <input
            id="shoe-squeak-vol-slider"
            data-testid="shoe-squeak-volume-slider"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={state.shoeSqueakVolume}
            onChange={(e) => customSoundtrackManager.setShoeSqueakVolume(Number(e.target.value))}
            className="w-full accent-cyan-400"
          />
        </div>
      </div>

      {/* Sistema de Upload e Loop do Som Ambiente da Plateia (CrowdAmbient) */}
      <div
        data-testid="crowd-ambience-section"
        className="bg-[#0F172A] rounded-xl p-3 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <div className="space-y-0.5">
          <div className="text-xs font-bold text-white flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-amber-400" />
            Som Ambiente da Plateia / Torcida (Loop na Partida)
          </div>
          <div className="text-[11px] text-slate-400">
            Inicia automaticamente em loop contínuo junto com a partida e pausa ao retornar ao menu.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <input
            ref={crowdFileInputRef}
            type="file"
            accept=".mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/ogg"
            data-testid="crowd-file-input"
            onChange={handleCrowdFileSelected}
            className="hidden"
          />
          <button
            type="button"
            data-testid="btn-upload-crowd-audio"
            disabled={isUploading}
            onClick={() => {
              soundEngine.unlock();
              soundEngine.playButtonClick();
              crowdFileInputRef.current?.click();
            }}
            className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-60"
          >
            <Upload className="w-3 h-3" />
            Enviar Plateia
          </button>
          <select
            aria-label="Som da Plateia"
            data-testid="slot-select-CrowdAmbience"
            value={state.crowdTrackId ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              soundEngine.unlock();
              customSoundtrackManager.assignCrowdTrack(val || null);
            }}
            className="w-40 sm:w-44 px-2 py-1.5 rounded-lg bg-[#1E293B] border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-400"
          >
            <option value="">Padrão do Jogo</option>
            {state.tracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Controle de Duração do Fade Out / Fade In */}
      <div className="bg-[#0F172A] rounded-xl p-3 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-xs text-slate-300">
          <div className="font-semibold text-white">Transição Suave entre Cenas (Fade Out / Fade In)</div>
          <div className="text-[11px] text-slate-400">
            Ao entrar na quadra ou voltar ao menu, a trilha anterior reduz o volume suavemente antes da nova entrar.
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0 min-w-[180px]">
          <input
            aria-label="Duração do Fade"
            data-testid="soundtrack-fade-slider"
            type="range"
            min={0.2}
            max={2.0}
            step={0.1}
            value={state.fadeOutSec}
            onChange={(e) => customSoundtrackManager.setFadeDuration(Number(e.target.value))}
            className="flex-1 accent-[#F97316]"
          />
          <span className="font-mono-num text-xs font-bold text-amber-300 w-10 text-right">
            {state.fadeOutSec.toFixed(1)}s
          </span>
        </div>
      </div>

      {/* Biblioteca de Faixas Importadas */}
      <div className="space-y-2">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Arquivos Salvos na Biblioteca ({state.tracks.length})
        </div>

        {state.tracks.length === 0 ? (
          <div className="rounded-xl bg-[#0F172A]/80 border border-dashed border-slate-700 p-3.5 text-xs text-slate-400">
            Nenhum áudio customizado enviado ainda. Enquanto não houver vínculo, o jogo usa a trilha eletrônica reativa padrão.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {state.tracks.map((track) => {
              const isPreviewing = status.previewTrackId === track.id;
              return (
                <div
                  key={track.id}
                  data-testid={`soundtrack-item-${track.id}`}
                  className="bg-[#0F172A] border border-slate-800 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-white truncate">{track.name}</div>
                    <div className="text-[11px] text-slate-400 font-mono-num flex items-center gap-1.5">
                      <span>{formatBytes(track.sizeBytes)}</span>
                      {track.url && <span className="text-emerald-400">• Cloud URL</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      aria-label={isPreviewing ? 'Parar prévia' : 'Ouvir prévia'}
                      onClick={() => {
                        soundEngine.unlock();
                        void customSoundtrackManager.previewTrack(track.id);
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer ${
                        isPreviewing
                          ? 'bg-amber-400 text-slate-950'
                          : 'bg-[#1E293B] hover:bg-slate-700 text-slate-200'
                      }`}
                    >
                      {isPreviewing ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                      {isPreviewing ? 'Parar' : 'Ouvir'}
                    </button>
                    <button
                      type="button"
                      aria-label="Excluir faixa"
                      onClick={() => {
                        soundEngine.playButtonClick();
                        void customSoundtrackManager.deleteTrack(track.id);
                      }}
                      className="p-1.5 rounded-lg bg-[#1E293B] hover:bg-rose-900/70 text-slate-300 hover:text-rose-200 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Vinculação por Cena: MenuTheme + Stage1_BGM..Stage7_BGM */}
      <div className="space-y-2">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Trilha por Cena & Estágio
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {SCENE_AUDIO_SLOTS.map(({ slot, label }) => {
            const assignedId = state.assignments[slot] ?? '';
            return (
              <div
                key={slot}
                className="bg-[#0F172A] border border-slate-800 rounded-xl px-3 py-2 flex items-center justify-between gap-2"
              >
                <label
                  htmlFor={`slot-select-${slot}`}
                  className="text-xs font-semibold text-slate-200 truncate"
                >
                  {label}
                </label>
                <select
                  id={`slot-select-${slot}`}
                  data-testid={`slot-select-${slot}`}
                  value={assignedId}
                  onChange={(e) => {
                    const val = e.target.value;
                    soundEngine.unlock();
                    customSoundtrackManager.assignTrackToSlot(slot as SceneAudioSlot, val || null);
                  }}
                  className="w-40 sm:w-44 px-2 py-1.5 rounded-lg bg-[#1E293B] border border-slate-700 text-xs text-white focus:outline-none focus:border-[#F97316]"
                >
                  <option value="">Padrão do Jogo</option>
                  {state.tracks
                    .filter((track) => !isShoeSqueakOrCourtSfxTrack(track.name, track.category))
                    .map((track) => (
                      <option key={track.id} value={track.id}>
                        {track.name}
                      </option>
                    ))}
                </select>
              </div>
            );
          })}
        </div>
      </div>

      {/* Efeitos Sonoros Customizados (SFX / Foley na Quadra) */}
      <div className="space-y-2.5 pt-2 border-t border-slate-800" data-testid="custom-sfx-section">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
            Efeitos Sonoros Customizados (SFX / Quadra)
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Vincule seus arquivos <strong className="text-slate-200">.wav, .mp3 ou .ogg</strong> ao rangido de tênis (<em>ShoeSqueaks</em>), impactos de corte, recepção, apito e salto. Clipes múltiplos tocam com variação aleatória de pitch.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2.5">
          {SFX_AUDIO_SLOTS.map(({ slot, label, description, multiSelect }) => {
            const assignedIds = state.sfxAssignments[slot] ?? [];
            return (
              <div
                key={slot}
                data-testid={`sfx-slot-${slot}`}
                className="bg-[#0F172A] border border-slate-800 rounded-xl p-3 space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      <span>{label}</span>
                      {slot === 'ShoeSqueaks' && (
                        <span className="px-1.5 py-0.5 rounded-md bg-cyan-950 border border-cyan-500/40 text-cyan-300 text-[10px] font-mono-num">
                          ShoeSqueakSounds: {customSoundtrackManager.ShoeSqueakSounds.length}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400">{description}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {slot === 'ShoeSqueaks' && (
                      <>
                        <input
                          ref={shoeSqueakInputRef}
                          type="file"
                          accept=".mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/ogg"
                          multiple
                          data-testid="shoe-squeak-file-input"
                          onChange={handleShoeSqueakFilesSelected}
                          className="hidden"
                        />
                        <button
                          type="button"
                          data-testid="btn-upload-shoe-squeaks"
                          disabled={isUploading}
                          onClick={() => {
                            soundEngine.unlock();
                            soundEngine.playButtonClick();
                            shoeSqueakInputRef.current?.click();
                          }}
                          className="px-2.5 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-60"
                        >
                          <Upload className="w-3 h-3" />
                          Enviar Amostras
                        </button>
                      </>
                    )}
                    {(assignedIds.length > 0 || slot === 'ShoeSqueaks') && (
                      <button
                        type="button"
                        data-testid={`btn-test-sfx-${slot}`}
                        onClick={() => {
                          soundEngine.unlock();
                          if (slot === 'ShoeSqueaks') {
                            const played = customSoundtrackManager.PlayRandomShoeSqueak({
                              intensity: 0.95,
                              isHardStop: true,
                              allowInMenuTest: true,
                            });
                            if (!played) {
                              soundEngine.PlayRandomShoeSqueak(0.95, true, true);
                            }
                            return;
                          }
                          const played = customSoundtrackManager.playCustomSfx(slot, {
                            intensity: 0.95,
                            isHardStop: false,
                            allowInMenuTest: true,
                          });
                          if (!played) {
                            if (slot === 'Whistle') soundEngine.playWhistle();
                            else if (slot === 'Jump') soundEngine.playJump();
                            else if (slot === 'FloorSlam') soundEngine.playCourtFloorSlam(1.0);
                            else if (slot === 'ImpactReceive') soundEngine.playImpactByForce(0.45, { isReceive: true });
                            else soundEngine.playImpactByForce(1.0, { isPerfect: true });
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-cyan-200 text-[11px] font-bold cursor-pointer"
                      >
                        {slot === 'ShoeSqueaks' ? 'Testar Squeak (Pitch 0.85–1.15)' : 'Testar Pitch'}
                      </button>
                    )}
                    {!multiSelect && (
                      <select
                        aria-label={label}
                        data-testid={`sfx-select-${slot}`}
                        value={assignedIds[0] ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          soundEngine.unlock();
                          customSoundtrackManager.assignSfxTrack(slot as CustomSfxSlot, val || null, 'set');
                        }}
                        className="w-40 sm:w-44 px-2 py-1.5 rounded-lg bg-[#1E293B] border border-slate-700 text-xs text-white focus:outline-none focus:border-cyan-400"
                      >
                        <option value="">Padrão do Jogo</option>
                        {state.tracks.map((track) => (
                          <option key={track.id} value={track.id}>
                            {track.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {multiSelect && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {state.tracks.length === 0 ? (
                      <span className="text-[11px] text-slate-500">
                        Importe um áudio acima para selecionar os clipes deste efeito.
                      </span>
                    ) : (
                      state.tracks.map((track) => {
                        const selected = assignedIds.includes(track.id);
                        return (
                          <button
                            key={track.id}
                            type="button"
                            data-testid={`sfx-chip-${slot}-${track.id}`}
                            onClick={() => {
                              soundEngine.unlock();
                              customSoundtrackManager.assignSfxTrack(slot, track.id, 'toggle');
                            }}
                            className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors ${
                              selected
                                ? 'bg-cyan-500 border-cyan-300 text-slate-950 font-bold'
                                : 'bg-[#1E293B] border-slate-700 text-slate-300 hover:text-white'
                            }`}
                          >
                            {selected ? '✓ ' : ''}
                            {track.name}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* PRIORIDADE 1: MÍDIA DINÂMICA NA NUVEM (Upload de Arquivo para titleBGM, lobbyBGM, titleAnimation .mp4 e splashAnimation .mp4) */}
      <div
        data-testid="admin-bgm-urls-section"
        className="bg-[#0F172A] rounded-xl p-4 border-2 border-amber-500/40 space-y-3.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
              <Cloud className="w-4 h-4 text-amber-400" />
              Mídia Dinâmica na Nuvem — Upload Direto (titleBGM, lobbyBGM, titleAnimation & splashAnimation .mp4)
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Envie arquivos locais diretamente para o <strong className="text-emerald-300">Firebase Storage + Firestore (config/gameMedia)</strong>. Ao abrir o link publicado, o jogo carrega automaticamente essas URLs da nuvem.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="btn-crossfade-title-bgm"
              onClick={() => {
                soundEngine.unlock();
                void customSoundtrackManager.SwitchBGM('titleBGM', 0.65);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-amber-300 text-[11px] font-bold cursor-pointer"
            >
              Testar titleBGM
            </button>
            <button
              type="button"
              data-testid="btn-crossfade-lobby-bgm"
              onClick={() => {
                soundEngine.unlock();
                void customSoundtrackManager.SwitchBGM('lobbyBGM', 0.65);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-emerald-300 text-[11px] font-bold cursor-pointer"
            >
              Testar lobbyBGM
            </button>
          </div>
        </div>

        {/* 4 Cards Independentes de Upload de Arquivo na Nuvem */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 1. titleBGM (Música da Tela de Título / Login) */}
          <div className="rounded-xl bg-[#1E293B]/75 border border-amber-500/30 p-3 space-y-2 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                  <Music className="w-3.5 h-3.5" />
                  1. titleBGM (Início/Login)
                </span>
                {state.titleBgmUrl && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-bold">
                    <CheckCircle2 className="w-3 h-3" />
                    Nuvem OK
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Toca exclusivamente ao entrar na Tela de Título (após o Fade Out da Splash Screen).
              </p>
            </div>

            <div className="space-y-1.5">
              <input
                ref={titleBgmFileInputRef}
                type="file"
                accept=".mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/ogg"
                data-testid="file-input-title-bgm"
                onChange={(e) => void handleCloudMediaUpload(e, 'TitleBGM')}
                className="hidden"
              />
              <button
                type="button"
                data-testid="btn-upload-title-bgm"
                disabled={isUploading}
                onClick={() => {
                  soundEngine.unlock();
                  titleBgmFileInputRef.current?.click();
                }}
                className="w-full py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <Upload className="w-3.5 h-3.5" />
                {uploadingMediaSlot === 'TitleBGM'
                  ? 'Enviando titleBGM...'
                  : 'Upload Arquivo (titleBGM)'}
              </button>
              <input
                type="text"
                data-testid="input-title-bgm-url"
                value={titleBgmInput}
                onChange={(e) => setTitleBgmInput(e.target.value)}
                placeholder="URL na nuvem (/api/audio/stream/...)"
                className="w-full rounded-lg bg-[#0F172A] border border-slate-700 px-2.5 py-1 text-[11px] text-white focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* 2. lobbyBGM (Música do Menu Principal / Hub) */}
          <div className="rounded-xl bg-[#1E293B]/75 border border-emerald-500/30 p-3 space-y-2 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                  <Music className="w-3.5 h-3.5" />
                  2. lobbyBGM (Home/Menu)
                </span>
                {state.lobbyBgmUrl && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-bold">
                    <CheckCircle2 className="w-3 h-3" />
                    Nuvem OK
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Toca no Lobby Principal após o login Google (para a titleBGM antes de iniciar).
              </p>
            </div>

            <div className="space-y-1.5">
              <input
                ref={lobbyBgmFileInputRef}
                type="file"
                accept=".mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/ogg"
                data-testid="file-input-lobby-bgm"
                onChange={(e) => void handleCloudMediaUpload(e, 'LobbyBGM')}
                className="hidden"
              />
              <button
                type="button"
                data-testid="btn-upload-lobby-bgm"
                disabled={isUploading}
                onClick={() => {
                  soundEngine.unlock();
                  lobbyBgmFileInputRef.current?.click();
                }}
                className="w-full py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <Upload className="w-3.5 h-3.5" />
                {uploadingMediaSlot === 'LobbyBGM'
                  ? 'Enviando lobbyBGM...'
                  : 'Upload Arquivo (lobbyBGM)'}
              </button>
              <input
                type="text"
                data-testid="input-lobby-bgm-url"
                value={lobbyBgmInput}
                onChange={(e) => setLobbyBgmInput(e.target.value)}
                placeholder="URL na nuvem (/api/audio/stream/...)"
                className="w-full rounded-lg bg-[#0F172A] border border-slate-700 px-2.5 py-1 text-[11px] text-white focus:outline-none focus:border-emerald-400"
              />
            </div>
          </div>

          {/* 3. titleAnimation (Vídeo curto .mp4 sem áudio para o fundo da Tela de Título) */}
          <div className="rounded-xl bg-[#1E293B]/75 border border-sky-500/30 p-3 space-y-2 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                  <Film className="w-3.5 h-3.5" />
                  3. titleAnimation (.MP4 Loop)
                </span>
                {state.titleAnimationUrl && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-bold">
                    <CheckCircle2 className="w-3 h-3" />
                    Nuvem OK
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Vídeo curto .mp4 sem áudio simulando um GIF em loop no fundo da Tela de Título.
              </p>
            </div>

            <div className="space-y-1.5">
              <input
                ref={titleAnimationFileInputRef}
                type="file"
                accept=".mp4,.webm,video/mp4,video/webm"
                data-testid="file-input-title-animation"
                onChange={(e) => void handleCloudMediaUpload(e, 'TitleAnimation')}
                className="hidden"
              />
              <button
                type="button"
                data-testid="btn-upload-title-animation"
                disabled={isUploading}
                onClick={() => {
                  soundEngine.unlock();
                  titleAnimationFileInputRef.current?.click();
                }}
                className="w-full py-2 px-3 rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <Upload className="w-3.5 h-3.5" />
                {uploadingMediaSlot === 'TitleAnimation'
                  ? 'Enviando Vídeo .MP4...'
                  : 'Upload Vídeo (.mp4 Title)'}
              </button>
              <input
                type="text"
                data-testid="input-title-animation-url"
                value={titleAnimationInput}
                onChange={(e) => setTitleAnimationInput(e.target.value)}
                placeholder="URL do .mp4 (/api/audio/stream/...)"
                className="w-full rounded-lg bg-[#0F172A] border border-slate-700 px-2.5 py-1 text-[11px] text-white focus:outline-none focus:border-sky-400"
              />
            </div>
          </div>

          {/* 4. splashAnimation (Vídeo curto .mp4 da Logo Animada na Splash Screen com Som Exclusivo) */}
          <div className="rounded-xl bg-[#1E293B]/75 border border-purple-500/40 p-3 space-y-2 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                  <Film className="w-3.5 h-3.5" />
                  4. splashAnimation (.MP4 Logo)
                </span>
                {state.splashAnimationUrl && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-bold">
                    <CheckCircle2 className="w-3 h-3" />
                    Nuvem OK
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Logo animada (.mp4) na Splash Screen sobre fundo branco com som exclusivo do vídeo ativo.
              </p>
            </div>

            <div className="space-y-1.5">
              <input
                ref={splashAnimationFileInputRef}
                type="file"
                accept=".mp4,.webm,video/mp4,video/webm"
                data-testid="file-input-splash-animation"
                onChange={(e) => void handleCloudMediaUpload(e, 'SplashAnimation')}
                className="hidden"
              />
              <button
                type="button"
                data-testid="btn-upload-splash-animation"
                disabled={isUploading}
                onClick={() => {
                  soundEngine.unlock();
                  splashAnimationFileInputRef.current?.click();
                }}
                className="w-full py-2 px-3 rounded-lg bg-purple-400 hover:bg-purple-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <Upload className="w-3.5 h-3.5" />
                {uploadingMediaSlot === 'SplashAnimation'
                  ? 'Enviando Splash .MP4...'
                  : 'Upload Logo (.mp4 Splash)'}
              </button>
              <input
                type="text"
                data-testid="input-splash-animation-url"
                value={splashAnimationInput}
                onChange={(e) => setSplashAnimationInput(e.target.value)}
                placeholder="URL de splashAnimationUrl (/api/audio/stream/...)"
                className="w-full rounded-lg bg-[#0F172A] border border-slate-700 px-2.5 py-1 text-[11px] text-white focus:outline-none focus:border-purple-400"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <span
            data-testid="cloud-media-save-status"
            className="text-[11px] text-emerald-300 font-semibold"
          >
            {bgmSaveNotice ||
              `Canal Único bgmSource Ativo: ${customSoundtrackManager.getActiveBgmKey()} • Firestore config/gameMedia sincronizado`}
          </span>
          <button
            type="button"
            data-testid="btn-save-bgm-urls"
            onClick={async () => {
              setBgmSaveNotice('Salvando URLs em config/gameMedia (Firestore)...');
              const ok = await customSoundtrackManager.updateBgmUrls(
                titleBgmInput,
                lobbyBgmInput,
                titleAnimationInput,
                splashAnimationInput,
              );
              setBgmSaveNotice(
                ok
                  ? '✓ URLs de titleBGM, lobbyBGM, titleAnimation e splashAnimation salvas em config/gameMedia (Firestore)!'
                  : 'URLs aplicadas na sessão.',
              );
            }}
            className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer"
          >
            Salvar URLs na Nuvem
          </button>
        </div>
      </div>

      {/* 5B. Dashboard de Usuários e Métricas de Sucesso (Analytics Administrativo) */}
      <div
        data-testid="admin-analytics-dashboard"
        className="bg-[#0F172A] rounded-xl p-3.5 border border-emerald-500/35 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              Dashboard Administrativo — Usuários Registrados & Analytics (Firestore)
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Monitoramento em tempo real das contas Google / Play Games, Tempo Médio de Sessão e
              Avaliações (1 a 5 Estrelas após a 3ª partida).
            </p>
          </div>
          <button
            type="button"
            data-testid="btn-refresh-analytics"
            onClick={() => void fetchAdminAnalytics()}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingAnalytics ? 'animate-spin' : ''}`} />
            Atualizar Dados
          </button>
        </div>

        {/* Cards de Métricas de Sucesso */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="bg-[#1E293B]/80 border border-slate-800 rounded-xl p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-sky-400" />
              Usuários Registrados (Google)
            </div>
            <div
              data-testid="metric-total-users"
              className="mt-1 font-display text-2xl font-black text-white"
            >
              {analyticsSummary.totalUsers}
            </div>
            <div className="text-[11px] text-slate-400">
              {analyticsSummary.totalSessions} sessões contabilizadas
            </div>
          </div>

          <div className="bg-[#1E293B]/80 border border-slate-800 rounded-xl p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              Tempo Médio de Sessão
            </div>
            <div
              data-testid="metric-avg-session"
              className="mt-1 font-display text-2xl font-black text-emerald-300"
            >
              {formatDurationMinSec(analyticsSummary.averageSessionSeconds)}
            </div>
            <div className="text-[11px] text-slate-400">
              Total acumulado: {formatDurationMinSec(analyticsSummary.totalSessionSeconds)}
            </div>
          </div>

          <div className="bg-[#1E293B]/80 border border-slate-800 rounded-xl p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              Média de Estrelas (1 a 5 ★)
            </div>
            <div
              data-testid="metric-avg-stars"
              className="mt-1 font-display text-2xl font-black text-amber-300 flex items-center gap-1.5"
            >
              <span>{analyticsSummary.averageRatingStars.toFixed(2)}</span>
              <span className="text-sm text-amber-400">★</span>
            </div>
            <div className="text-[11px] text-slate-400">
              Baseado em {analyticsSummary.totalRatings} avaliações enviadas
            </div>
          </div>
        </div>

        {/* Lista / Tabela de Usuários Registrados no Firestore */}
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table
            data-testid="admin-users-table"
            className="w-full text-left border-collapse text-xs"
          >
            <thead>
              <tr className="bg-slate-900/90 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <th className="py-2 px-3">Nome do Jogador</th>
                <th className="py-2 px-3">Email (Google)</th>
                <th className="py-2 px-3">ID (UID)</th>
                <th className="py-2 px-3">Partidas</th>
                <th className="py-2 px-3">Tempo de Sessão</th>
                <th className="py-2 px-3">Avaliação & Feedback Beta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 bg-[#1E293B]/40">
              {analyticsUsers.map((u) => (
                <tr key={u.uid} className="hover:bg-slate-800/40">
                  <td className="py-2 px-3 font-bold text-white">{u.displayName}</td>
                  <td className="py-2 px-3 text-slate-300 font-mono text-[11px]">{u.email}</td>
                  <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">{u.uid}</td>
                  <td className="py-2 px-3 text-slate-200 font-bold">{u.matchesPlayed}</td>
                  <td className="py-2 px-3 text-emerald-300 font-mono">
                    {formatDurationMinSec(u.totalSessionSeconds)} ({u.sessionCount}x)
                  </td>
                  <td className="py-2 px-3">
                    {u.ratingStars >= 1 ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="inline-flex w-fit items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/40 text-amber-300 font-bold text-[11px]">
                          {u.ratingStars} ★
                        </span>
                        {u.ratingComment && (
                          <span className="text-[11px] text-slate-300 italic">
                            &ldquo;{u.ratingComment}&rdquo;
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-500 text-[11px]">Pendente</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 5C. Métricas da Loja Fictícia (Modo Beta) — Pacotes e Itens Mais Resgatados */}
        <div
          data-testid="admin-beta-store-metrics"
          className="pt-3 border-t border-slate-800 space-y-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h5 className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                Métricas da Loja Fictícia (Modo Beta) — Pacotes & Itens Mais Resgatados
              </h5>
              <p className="text-[11px] text-slate-400">
                Ranking em tempo real de quais pacotes de Diamantes, Caixas Gacha, Skins e Bolas/Rastros os jogadores mais resgataram.
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-400/40 text-cyan-300 font-mono text-[11px] font-bold">
              Total de Resgates Beta: {analyticsSummary.totalStoreRedemptions ?? storeMetrics.reduce((acc, m) => acc + m.redemptionCount, 0)}
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table
              data-testid="admin-store-metrics-table"
              className="w-full text-left border-collapse text-xs"
            >
              <thead>
                <tr className="bg-slate-900/90 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                  <th className="py-2 px-3">Pacote / Item da Loja</th>
                  <th className="py-2 px-3">Categoria</th>
                  <th className="py-2 px-3">Moeda</th>
                  <th className="py-2 px-3">Qtd. Resgates</th>
                  <th className="py-2 px-3">Último Jogador</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 bg-[#1E293B]/40">
                {storeMetrics.map((m) => (
                  <tr key={m.itemId} className="hover:bg-slate-800/40">
                    <td className="py-2 px-3 font-bold text-white">{m.itemName}</td>
                    <td className="py-2 px-3 text-slate-300 text-[11px] uppercase">
                      {m.category === 'diamond_pack'
                        ? 'Recarga Diamantes'
                        : m.category === 'gacha_box'
                          ? 'Caixa Gacha'
                          : m.category === 'outfit'
                            ? 'Skin / Uniforme'
                            : 'Bola & Rastro'}
                    </td>
                    <td className="py-2 px-3">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-bold text-cyan-300 uppercase">
                        {m.currency === 'free_beta'
                          ? 'GRÁTIS NO BETA'
                          : m.currency === 'gems'
                            ? 'Diamantes'
                            : 'Spike Coins'}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono font-black text-emerald-300">
                      {m.redemptionCount}x
                    </td>
                    <td className="py-2 px-3 text-slate-300 text-[11px]">{m.lastRedeemedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
};
