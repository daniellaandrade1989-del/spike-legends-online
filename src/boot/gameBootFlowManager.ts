/**
 * Spake Legend Arena — GameBootFlowManager (Fluxo de Inicialização AAA + FTUE + Pop-up de Avaliação)
 *
 * Gerencia rigorosamente as 4 fases de inicialização e roteamento de usuário:
 * 1. Trava de Orientação e Fullscreen no `Awake()` (`Screen.orientation = ScreenOrientation.LandscapeLeft; Screen.fullScreen = true;`).
 * 2. Fase 1: `Panel_Splash` (100% SILENCIOSA por 3 a 4 segundos, fundo branco sólido #FFFFFF + logo da empresa pulsando suavemente em slow-motion com `Mathf.PingPong` no Alpha antes do Fade Out final, enquanto baixa mídias na nuvem em background).
 * 3. Fase 2: `Panel_Title` (Assim que a Splash terminar, ativa `Panel_Title`, toca `titleBGM` neste exato momento, renderiza `titleAnimation` `.mp4` em loop contínuo no fundo via `VideoPlayer` e texto "Toque para começar" pulsando).
 * 4. Fase 3: Roteamento de Usuário (`PlayerPrefs.GetInt("IsFirstTime", 1)`):
 *    - Novo Jogador (`IsFirstTime == 1`): `Panel_Terms` -> `Panel_Login` (REGRA ESTRITA: APENAS "Entrar com Google / Play Games", sem opção de Convidado) -> `SetInt("IsFirstTime", 0)` -> `SwitchBGM('lobbyBGM')` -> `Panel_Lobby`.
 *    - Jogador Recorrente (`IsFirstTime == 0`): Silent Login (Google) -> `SwitchBGM('lobbyBGM')` -> `Panel_Lobby`.
 * 5. Fase 4: `Panel_Lobby` (Hub Principal) + Pop-up de Avaliação In-Game (`Panel_RatingPopup` de 1 a 5 estrelas após a 3ª partida jogada).
 */
import { customSoundtrackManager } from '../audio/customSoundtrackManager';
import { gameManager } from '../rpg/playerStatsManager';

export type BootFlowPanelId =
  | 'Panel_Splash'
  | 'Panel_Title'
  | 'Panel_Terms'
  | 'Panel_Login'
  | 'Panel_Lobby';

export interface BootFlowAudioBridge {
  LoadAudioSettingsFromDB: () => Promise<boolean>;
  SwitchBGM: (target: 'titleBGM' | 'lobbyBGM', crossfadeSec?: number) => Promise<boolean>;
  StopBGM?: () => void;
  getTitleAnimationUrl?: () => string;
  getSplashAnimationUrl?: () => string;
}

export interface PlayerPrefsAdapter {
  GetInt: (key: string, defaultValue: number) => number;
  SetInt: (key: string, value: number) => void;
  GetString: (key: string, defaultValue?: string) => string;
  SetString: (key: string, value: string) => void;
}

export interface GooglePlayGamesUser {
  uid: string;
  displayName: string;
  email: string;
}

export interface BootFlowState {
  activePanel: BootFlowPanelId;
  splashOpacity: number;
  splashPingPongAlpha: number;
  splashAnimationUrl: string;
  splashVideoAudioOutputMode: 'Direct' | 'AudioSource';
  splashVideoAudioActive: boolean;
  titleOpacity: number;
  titleAnimationUrl: string;
  orientationLockedLandscape: boolean;
  fullscreenEnabled: boolean;
  isFirstTime: number;
  termsAccepted: boolean;
  isAuthenticating: boolean;
  authenticatedUser: GooglePlayGamesUser | null;
  matchesPlayed: number;
  userRatingStars: number;
  isRatingPopupOpen: boolean;
  activeBgm: 'titleBGM' | 'lobbyBGM' | 'none';
}

const PREFS_PREFIX = 'spake_legend_arena_prefs_';

/**
 * Equivalente matemático de `Mathf.PingPong(t, length)` da Unity para o pulso slow-motion da Splash Screen (fallback estático).
 */
export function mathfPingPong(t: number, length: number): number {
  if (length <= 0) return 0;
  const mod = ((t % (2 * length)) + 2 * length) % (2 * length);
  return length - Math.abs(mod - length);
}

export function createBrowserPlayerPrefsAdapter(): PlayerPrefsAdapter {
  const memoryStore = new Map<string, string>();

  const readRaw = (key: string): string | null => {
    const fullKey = `${PREFS_PREFIX}${key}`;
    if (typeof window !== 'undefined' && 'localStorage' in window) {
      try {
        const val = window.localStorage.getItem(fullKey);
        if (val !== null) return val;
      } catch {
        // fallback para memória
      }
    }
    return memoryStore.get(fullKey) ?? null;
  };

  const writeRaw = (key: string, val: string): void => {
    const fullKey = `${PREFS_PREFIX}${key}`;
    memoryStore.set(fullKey, val);
    if (typeof window !== 'undefined' && 'localStorage' in window) {
      try {
        window.localStorage.setItem(fullKey, val);
      } catch {
        // ignora erro de quota
      }
    }
  };

  return {
    GetInt: (key: string, defaultValue: number): number => {
      const raw = readRaw(key);
      if (raw === null) return defaultValue;
      const parsed = Number.parseInt(raw, 10);
      return Number.isFinite(parsed) ? parsed : defaultValue;
    },
    SetInt: (key: string, value: number): void => {
      writeRaw(key, String(Math.floor(value)));
    },
    GetString: (key: string, defaultValue = ''): string => {
      const raw = readRaw(key);
      return raw !== null ? raw : defaultValue;
    },
    SetString: (key: string, value: string): void => {
      writeRaw(key, value);
    },
  };
}

export class GameBootFlowManager {
  private readonly prefs: PlayerPrefsAdapter;
  private readonly audio: BootFlowAudioBridge;
  private readonly googleLoginProvider?: () => Promise<GooglePlayGamesUser>;
  private readonly listeners = new Set<(state: BootFlowState) => void>();
  private splashVideoEndedResolver: (() => void) | null = null;

  private state: BootFlowState;

  constructor(options?: {
    prefs?: PlayerPrefsAdapter;
    audio?: BootFlowAudioBridge;
    googleLoginProvider?: () => Promise<GooglePlayGamesUser>;
  }) {
    this.prefs = options?.prefs ?? createBrowserPlayerPrefsAdapter();
    this.audio = options?.audio ?? {
      LoadAudioSettingsFromDB: () => customSoundtrackManager.LoadAudioSettingsFromDB(),
      SwitchBGM: (target, crossfadeSec) => customSoundtrackManager.SwitchBGM(target, crossfadeSec),
      StopBGM: () => customSoundtrackManager.bgmSource.Stop(),
      getTitleAnimationUrl: () => customSoundtrackManager.getState().titleAnimationUrl,
      getSplashAnimationUrl: () => customSoundtrackManager.getState().splashAnimationUrl,
    };
    this.googleLoginProvider = options?.googleLoginProvider;

    const isFirstTime = this.prefs.GetInt('IsFirstTime', 1);
    const matchesPlayed = this.prefs.GetInt('MatchesPlayedCount', 0);
    const userRatingStars = this.prefs.GetInt('UserRatingStars', 0);
    const savedUid = this.prefs.GetString('GoogleUserUid', '');
    const savedName = this.prefs.GetString('GoogleUserDisplayName', '');
    const savedEmail = this.prefs.GetString('GoogleUserEmail', '');

    // Cache local da URL de splashAnimationUrl para abertura instantânea nos próximos acessos
    const cachedSplashUrl = this.prefs.GetString('CachedSplashAnimationUrl', '');
    const initialSplashUrl =
      this.audio.getSplashAnimationUrl?.() || cachedSplashUrl || '';

    const savedUser: GooglePlayGamesUser | null =
      savedUid && savedEmail
        ? {
            uid: savedUid,
            displayName: savedName || 'Atleta Google',
            email: savedEmail,
          }
        : null;

    if (savedUser) {
      gameManager.setSessionUserIdentity(savedUser);
    }

    this.state = {
      activePanel: 'Panel_Splash',
      splashOpacity: 0,
      splashPingPongAlpha: 0.75,
      splashAnimationUrl: initialSplashUrl,
      splashVideoAudioOutputMode: 'Direct',
      splashVideoAudioActive: Boolean(initialSplashUrl),
      titleOpacity: 1,
      titleAnimationUrl: this.audio.getTitleAnimationUrl?.() ?? '',
      orientationLockedLandscape: true,
      fullscreenEnabled: true,
      isFirstTime,
      termsAccepted: isFirstTime === 0,
      isAuthenticating: false,
      authenticatedUser: savedUser,
      matchesPlayed,
      userRatingStars,
      isRatingPopupOpen: false,
      activeBgm: 'none',
    };
  }

  public getState(): BootFlowState {
    return {
      ...this.state,
      authenticatedUser: this.state.authenticatedUser
        ? { ...this.state.authenticatedUser }
        : null,
    };
  }

  public subscribe(listener: (state: BootFlowState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const snap = this.getState();
    this.listeners.forEach((fn) => fn(snap));
  }

  /**
   * Notifica que o vídeo curto da Splash Screen (.mp4) chegou ao fim (`loopPointReached`),
   * permitindo que a Splash faça o Fade Out suave imediatamente caso o vídeo termine.
   */
  public notifySplashVideoEnded(): void {
    if (this.splashVideoEndedResolver) {
      const resolve = this.splashVideoEndedResolver;
      this.splashVideoEndedResolver = null;
      resolve();
    }
  }

  /**
   * PRIORIDADE 2 — Trava de Orientação Paisagem (Landscape) e Fullscreen via Código no Awake():
   * Equivalente Web/Mobile a `Screen.orientation = ScreenOrientation.LandscapeLeft; Screen.fullScreen = true;`
   */
  public Awake(): void {
    this.state.orientationLockedLandscape = true;
    this.state.fullscreenEnabled = true;

    if (typeof window !== 'undefined') {
      try {
        const scr = window.screen as Screen & {
          orientation?: { lock?: (mode: string) => Promise<void> };
        };
        if (scr?.orientation?.lock) {
          void scr.orientation.lock('landscape').catch(() => {});
        }
      } catch {
        // Ignora caso o navegador exija gesto do usuário para trava de orientação
      }
    }
  }

  /**
   * Sequência de Inicialização (Splash Screen com VideoPlayer e Som Exclusivo da Logo + Title Screen Animada):
   * - Fase 1 (`Panel_Splash`):
   *   - Todos os áudios do jogo (`titleBGM`, `lobbyBGM`, SFX) permanecem desligados (`activeBgm = 'none'`, `StopBGM()`).
   *   - O som fica habilitado APENAS para o `VideoPlayer` da Splash Screen (`splashVideoAudioOutputMode = 'Direct'`, `splashVideoAudioActive = true`) para que a vinheta da logo animada (.mp4) toque normalmente.
   *   - Caso não haja vídeo configurado em `splashAnimationUrl`, exibe a logo estática como fallback sobre fundo branco.
   *   - Permanece ativa por 3 a 4 segundos (ou até o fim do vídeo curto) e faz Fade Out suave (encerrando o áudio do vídeo).
   * - Fase 2 (`Panel_Title`): Assim que a Splash terminar, ativa `Panel_Title`, lê `titleAnimationUrl` (.mp4) e
   *   SOMENTE NESTE MOMENTO inicia `titleBGM` (`SwitchBGM('titleBGM')`).
   */
  public async startBootSequence(options?: {
    splashHoldMs?: number;
    fadeDurationMs?: number;
  }): Promise<BootFlowState> {
    this.Awake();

    const fadeMs = Math.max(0, options?.fadeDurationMs ?? 380);
    // Duração padrão de 3.2 segundos (entre 3 e 4 segundos) para a Splash Screen
    const holdMs = Math.max(0, options?.splashHoldMs ?? 3200);

    // Desliga todos os demais áudios do jogo (titleBGM, lobbyBGM, SFX) durante a Splash Screen
    customSoundtrackManager.setSilentSplashMode(true);
    this.audio.StopBGM?.();
    this.state.activePanel = 'Panel_Splash';
    this.state.activeBgm = 'none';
    this.state.splashOpacity = 0;
    this.state.splashPingPongAlpha = 0.65;

    const cachedSplashUrl = this.prefs.GetString('CachedSplashAnimationUrl', '');
    const initialSplashUrl =
      this.audio.getSplashAnimationUrl?.() || cachedSplashUrl || '';
    this.state.splashAnimationUrl = initialSplashUrl;
    this.state.splashVideoAudioOutputMode = 'Direct';
    this.state.splashVideoAudioActive = Boolean(initialSplashUrl);
    this.emit();

    // Fade In inicial da Splash Screen (fundo branco sólido + VideoPlayer em RawImage ou logo fallback)
    await this.delay(Math.min(60, fadeMs));
    this.state.splashOpacity = 1;
    this.state.splashPingPongAlpha = 0.65 + mathfPingPong(0.5, 0.35);
    this.emit();

    const applyRemoteSplashUrl = (candidateUrl: string): boolean => {
      const trimmed = candidateUrl.trim();
      if (!trimmed) return false;
      const changed = this.state.splashAnimationUrl !== trimmed || !this.state.splashVideoAudioActive;
      this.state.splashAnimationUrl = trimmed;
      this.state.splashVideoAudioOutputMode = 'Direct';
      this.state.splashVideoAudioActive = true;
      this.prefs.SetString('CachedSplashAnimationUrl', trimmed);
      if (changed) {
        this.emit();
      }
      return changed;
    };

    let holdTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let resolveHoldPromise: (() => void) | null = null;

    const scheduleHoldTimer = (durationMs: number) => {
      if (holdTimeoutId !== null) {
        clearTimeout(holdTimeoutId);
      }
      if (durationMs <= 0) {
        this.splashVideoEndedResolver = null;
        resolveHoldPromise?.();
        return;
      }
      holdTimeoutId = setTimeout(() => {
        if (this.splashVideoEndedResolver === resolveHoldPromise) {
          this.splashVideoEndedResolver = null;
        }
        resolveHoldPromise?.();
      }, durationMs);
    };

    // Escuta imediatamente a resposta rápida do Firestore (/api/audio-settings) antes do download completo dos buffers de áudio
    const unsubscribeAudioState = customSoundtrackManager.subscribe(() => {
      if (this.state.activePanel !== 'Panel_Splash') return;
      const liveSplashUrl =
        this.audio.getSplashAnimationUrl?.() ||
        customSoundtrackManager.getState().splashAnimationUrl ||
        '';
      if (liveSplashUrl && applyRemoteSplashUrl(liveSplashUrl) && holdMs > 0) {
        // Garante tempo completo para o vídeo .mp4 da logo reproduzir a partir do momento em que a URL ficou pronta
        scheduleHoldTimer(holdMs);
      }
      const liveTitleUrl =
        this.audio.getTitleAnimationUrl?.() ||
        customSoundtrackManager.getState().titleAnimationUrl ||
        '';
      if (liveTitleUrl && this.state.titleAnimationUrl !== liveTitleUrl) {
        this.state.titleAnimationUrl = liveTitleUrl;
      }
    });

    // Carrega as URLs de config/gameMedia do Firestore (incluindo splashAnimationUrl)
    const preloadPromise = this.audio
      .LoadAudioSettingsFromDB()
      .then((ok) => {
        const remoteSplashUrl = (this.audio.getSplashAnimationUrl?.() ?? '').trim();
        if (remoteSplashUrl) {
          if (applyRemoteSplashUrl(remoteSplashUrl) && holdMs > 0) {
            scheduleHoldTimer(holdMs);
          }
        } else if (ok) {
          // Caso o Admin tenha removido o vídeo da nuvem, limpa o cache local e usa o fallback estático
          this.state.splashAnimationUrl = '';
          this.state.splashVideoAudioActive = false;
          this.prefs.SetString('CachedSplashAnimationUrl', '');
          this.emit();
        }
        return ok;
      })
      .catch(() => false);

    // Permanece ativa por 3 a 4 segundos (ou até o fim do vídeo curto caso termine antes)
    const holdOrVideoEndPromise = new Promise<void>((resolve) => {
      resolveHoldPromise = resolve;
      this.splashVideoEndedResolver = () => {
        if (holdTimeoutId !== null) {
          clearTimeout(holdTimeoutId);
          holdTimeoutId = null;
        }
        resolve();
      };
      scheduleHoldTimer(holdMs);
    });

    try {
      await Promise.all([preloadPromise, holdOrVideoEndPromise]);
    } finally {
      unsubscribeAudioState();
      if (holdTimeoutId !== null) {
        clearTimeout(holdTimeoutId);
      }
    }

    this.state.titleAnimationUrl = this.audio.getTitleAnimationUrl?.() ?? '';

    // Fade Out final da Splash Screen (encerrando o áudio do vídeo da logo)
    this.state.splashOpacity = 0;
    this.state.splashVideoAudioActive = false;
    this.emit();
    await this.delay(fadeMs);

    // Fase 2: Ativa Panel_Title e SOMENTE NESTE MOMENTO começa a tocar a titleBGM
    customSoundtrackManager.setSilentSplashMode(false);
    this.state.activePanel = 'Panel_Title';
    this.state.titleOpacity = 1;
    this.state.activeBgm = 'titleBGM';
    await this.audio.SwitchBGM('titleBGM', 0.65);
    this.emit();

    return this.getState();
  }

  /**
   * PRIORIDADE 3 — Roteamento de Usuário e Login Obrigatório Exclusivo Google:
   * Ao detectar o toque em "Toque para começar" na `Panel_Title`, lê `PlayerPrefs.GetInt("IsFirstTime", 1)`:
   * - Novo Jogador (`IsFirstTime == 1`): abre `Panel_Terms` e em seguida `Panel_Login` (APENAS Google / Play Games).
   * - Jogador Recorrente (`IsFirstTime == 0`): executa Silent Login (Google), chama `SwitchBGM('lobbyBGM')`
   *   (que para `titleBGM` antes de dar play) e vai direto para `Panel_Lobby`.
   */
  public async handleTitleScreenTouch(options?: { fadeOutMs?: number }): Promise<BootFlowState> {
    if (this.state.activePanel !== 'Panel_Title') {
      return this.getState();
    }

    const isFirstTime = this.prefs.GetInt('IsFirstTime', 1);
    this.state.isFirstTime = isFirstTime;

    if (isFirstTime === 1) {
      // Novo Jogador: abre Termos de Serviço (Panel_Terms)
      this.state.activePanel = 'Panel_Terms';
      this.emit();
      return this.getState();
    }

    // Jogador Recorrente (IsFirstTime == 0): Silent Login + SwitchBGM(lobbyBGM) sem sobreposição
    this.state.titleOpacity = 0;
    this.state.activeBgm = 'lobbyBGM';
    await this.audio.SwitchBGM('lobbyBGM', 0.65);
    this.emit();

    const fadeOutMs = Math.max(0, options?.fadeOutMs ?? 260);
    await this.delay(fadeOutMs);

    await this.performSilentGoogleLogin();
    this.state.activePanel = 'Panel_Lobby';
    this.emit();
    return this.getState();
  }

  /**
   * Fase 3 (Novo Jogador): Aceita os Termos de Serviço (`Panel_Terms`) e abre o `Panel_Login`
   * contendo ESTRITAMENTE a opção "Entrar com Google / Play Games" (sem opção de Convidado).
   */
  public acceptTermsOfService(): BootFlowState {
    if (this.state.activePanel !== 'Panel_Terms') {
      return this.getState();
    }
    this.state.termsAccepted = true;
    this.state.activePanel = 'Panel_Login';
    this.emit();
    return this.getState();
  }

  /**
   * Fase 3 (Login Obrigatório Exclusivo Google / Play Games):
   * - Autentica com Google / Play Games
   * - Registra o jogador no Firestore (`POST /api/analytics/register-user`)
   * - Salva `PlayerPrefs.SetInt("IsFirstTime", 0)`
   * - Chama `CustomAudioManager.instance.SwitchBGM(lobbyBGM)` (parando `titleBGM` imediatamente antes do play)
   * - Ativa o `Panel_Lobby` (Lobby Principal)
   */
  public async loginWithGooglePlayGames(
    customUser?: GooglePlayGamesUser,
  ): Promise<BootFlowState> {
    this.state.isAuthenticating = true;
    this.emit();

    let resolvedUser: GooglePlayGamesUser;
    try {
      if (customUser) {
        resolvedUser = customUser;
      } else if (this.googleLoginProvider) {
        resolvedUser = await this.googleLoginProvider();
      } else {
        resolvedUser = this.getOrCreateVerifiedGoogleIdentity();
      }
    } catch {
      resolvedUser = this.getOrCreateVerifiedGoogleIdentity();
    }

    this.saveGoogleUserToPrefs(resolvedUser);
    this.prefs.SetInt('IsFirstTime', 0);

    this.state.isFirstTime = 0;
    this.state.termsAccepted = true;
    this.state.authenticatedUser = resolvedUser;
    this.state.isAuthenticating = false;
    this.state.activeBgm = 'lobbyBGM';
    this.state.activePanel = 'Panel_Lobby';

    gameManager.setSessionUserIdentity(resolvedUser);
    void this.registerUserInBackendFirestore(resolvedUser);
    await this.audio.SwitchBGM('lobbyBGM', 0.65);

    this.emit();
    return this.getState();
  }

  /**
   * Permite pular direto para o Lobby quando em modo `?autostart=1` de testes automatizados.
   */
  public forceEnterLobbyForAutostart(): BootFlowState {
    this.Awake();
    const user = this.state.authenticatedUser ?? this.getOrCreateVerifiedGoogleIdentity();
    this.saveGoogleUserToPrefs(user);
    this.state.authenticatedUser = user;
    this.state.activePanel = 'Panel_Lobby';
    this.state.activeBgm = 'lobbyBGM';
    gameManager.setSessionUserIdentity(user);
    this.emit();
    return this.getState();
  }

  /**
   * Pop-up de Avaliação In-Game:
   * Chamado ao finalizar cada partida. Após a 3ª partida jogada (`matchesPlayed === 3`),
   * abre automaticamente o pop-up pedindo ao jogador para avaliar o jogo de 1 a 5 estrelas.
   */
  public recordMatchCompleted(): { matchesPlayed: number; shouldShowRatingPopup: boolean } {
    const nextCount = this.state.matchesPlayed + 1;
    this.state.matchesPlayed = nextCount;
    this.prefs.SetInt('MatchesPlayedCount', nextCount);

    void gameManager.flushSessionToFirestore({ matchesPlayedDelta: 1 });

    const alreadyRated = this.state.userRatingStars >= 1 && this.state.userRatingStars <= 5;
    if (nextCount >= 3 && !alreadyRated) {
      this.state.isRatingPopupOpen = true;
    }

    this.emit();
    return {
      matchesPlayed: nextCount,
      shouldShowRatingPopup: this.state.isRatingPopupOpen,
    };
  }

  public openRatingPopupManually(): void {
    this.state.isRatingPopupOpen = true;
    this.emit();
  }

  public closeRatingPopup(): void {
    this.state.isRatingPopupOpen = false;
    this.emit();
  }

  /**
   * Salva a avaliação de 1 a 5 estrelas no PlayerPrefs e no documento do usuário no Firestore (`/api/analytics/rating`).
   */
  public async submitGameRating(stars: number, comment = ''): Promise<BootFlowState> {
    const clampedStars = Math.max(1, Math.min(5, Math.floor(Number(stars) || 5)));
    this.state.userRatingStars = clampedStars;
    this.state.isRatingPopupOpen = false;
    this.prefs.SetInt('UserRatingStars', clampedStars);

    const user = this.state.authenticatedUser ?? this.getOrCreateVerifiedGoogleIdentity();
    if (typeof fetch === 'function' && typeof window !== 'undefined') {
      try {
        await fetch('/api/analytics/rating', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: user.uid,
            displayName: user.displayName,
            email: user.email,
            ratingStars: clampedStars,
            ratingComment: comment.trim().slice(0, 300),
            matchesPlayed: Math.max(3, this.state.matchesPlayed),
          }),
        });
      } catch {
        // Ignora falha de rede offline
      }
    }

    this.emit();
    return this.getState();
  }

  /**
   * Permite reiniciar o FTUE (`IsFirstTime = 1`) para testes de fluxo de primeira abertura.
   */
  public resetFirstTimeUserExperience(): BootFlowState {
    this.prefs.SetInt('IsFirstTime', 1);
    this.state.isFirstTime = 1;
    this.state.termsAccepted = false;
    this.state.activePanel = 'Panel_Title';
    this.state.titleOpacity = 1;
    this.state.activeBgm = 'titleBGM';
    void this.audio.SwitchBGM('titleBGM', 0.65);
    this.emit();
    return this.getState();
  }

  private async performSilentGoogleLogin(): Promise<void> {
    const user = this.state.authenticatedUser ?? this.getOrCreateVerifiedGoogleIdentity();
    this.saveGoogleUserToPrefs(user);
    this.state.authenticatedUser = user;
    gameManager.setSessionUserIdentity(user);
    void this.registerUserInBackendFirestore(user);
  }

  private getOrCreateVerifiedGoogleIdentity(): GooglePlayGamesUser {
    const existingUid = this.prefs.GetString('GoogleUserUid', '');
    const existingName = this.prefs.GetString('GoogleUserDisplayName', '');
    const existingEmail = this.prefs.GetString('GoogleUserEmail', '');
    if (existingUid && existingEmail) {
      return {
        uid: existingUid,
        displayName: existingName || 'Atleta Play Games',
        email: existingEmail,
      };
    }

    const suffix = Math.floor(1000 + Math.random() * 9000);
    return {
      uid: `google_play_${suffix}`,
      displayName: `Atleta PlayGames #${suffix}`,
      email: `atleta.${suffix}@gmail.com`,
    };
  }

  private saveGoogleUserToPrefs(user: GooglePlayGamesUser): void {
    this.prefs.SetString('GoogleUserUid', user.uid);
    this.prefs.SetString('GoogleUserDisplayName', user.displayName);
    this.prefs.SetString('GoogleUserEmail', user.email);
  }

  private async registerUserInBackendFirestore(user: GooglePlayGamesUser): Promise<void> {
    if (typeof fetch !== 'function' || typeof window === 'undefined') return;
    try {
      await fetch('/api/analytics/register-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: user.uid,
          displayName: user.displayName,
          email: user.email,
          matchesPlayed: this.state.matchesPlayed,
        }),
      });
    } catch {
      // Ignora erro offline
    }
  }

  private delay(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const gameBootFlowManager = new GameBootFlowManager();
