/**
 * Spake Legend Arena — Painéis da Sequência de Inicialização (Boot Flow), FTUE e Pop-up de Avaliação
 *
 * Hierarquia de Painéis Equivalente ao Unity Canvas:
 * - `Panel_Splash`: 100% SILENCIOSA por 3 a 4 segundos, fundo branco sólido (#FFFFFF) com Logomarca do Estúdio pulsando em slow-motion (`Mathf.PingPong` no Alpha) antes do Fade Out final.
 * - `Panel_Title`: Ativada após a Splash; toca `titleBGM` neste exato momento, renderiza `titleAnimation` (.mp4 sem áudio em loop via `VideoPlayer` / `<video autoPlay loop muted playsInline>`) no fundo e exibe "Toque para começar" pulsando.
 * - `Panel_Terms`: Termos de Serviço exibidos na primeira abertura (`IsFirstTime == 1`).
 * - `Panel_Login`: Login Obrigatório contendo ESTRITAMENTE a opção "Entrar com Google / Play Games" (sem opção de Convidado).
 * - `Panel_RatingPopup`: Pop-up de Avaliação In-Game (1 a 5 estrelas) exibido após a 3ª partida jogada.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ShieldCheck, Star, Trophy, Volume2, VolumeX } from 'lucide-react';
import {
  gameBootFlowManager,
  mathfPingPong,
  type BootFlowState,
} from '../boot/gameBootFlowManager';
import { customSoundtrackManager } from '../audio/customSoundtrackManager';

interface BootFlowOverlayProps {
  bootState: BootFlowState;
  soundMuted: boolean;
  onToggleMute: () => void;
  onTitleTouch: () => void;
  onAcceptTerms: () => void;
  onGoogleLogin: () => Promise<void>;
  onSecretVersionTap?: () => void;
}

export const BootFlowOverlay: React.FC<BootFlowOverlayProps> = ({
  bootState,
  soundMuted,
  onToggleMute,
  onTitleTouch,
  onAcceptTerms,
  onGoogleLogin,
  onSecretVersionTap,
}) => {
  const [pulseLow, setPulseLow] = useState(false);
  const [agreedCheckbox, setAgreedCheckbox] = useState(true);
  const [splashLogoAlpha, setSplashLogoAlpha] = useState(0.75);
  const [splashVideoFailed, setSplashVideoFailed] = useState(false);
  const [isAutoplayAudioBlocked, setIsAutoplayAudioBlocked] = useState(false);
  const splashVideoRef = useRef<HTMLVideoElement | null>(null);
  const [cloudSplashAnimationUrl, setCloudSplashAnimationUrl] = useState<string>(
    () =>
      bootState.splashAnimationUrl ||
      customSoundtrackManager.getState().splashAnimationUrl ||
      '',
  );
  const [cloudTitleAnimationUrl, setCloudTitleAnimationUrl] = useState<string>(
    () => bootState.titleAnimationUrl || customSoundtrackManager.getState().titleAnimationUrl || '',
  );

  // Animação suave em slow-motion (Mathf.PingPong no Alpha da logo entre 0.45 e 1.0) durante os 3-4s da Splash Screen (fallback estático)
  useEffect(() => {
    if (bootState.activePanel !== 'Panel_Splash') return;
    const startMs = performance.now();
    const interval = window.setInterval(() => {
      const elapsedSec = (performance.now() - startMs) / 1000;
      const alpha = 0.45 + mathfPingPong(elapsedSec * 0.45, 0.55);
      setSplashLogoAlpha(Number(alpha.toFixed(3)));
    }, 40);
    return () => window.clearInterval(interval);
  }, [bootState.activePanel]);

  // Sincroniza URLs dos vídeos .mp4 (splashAnimation e titleAnimation) carregadas da nuvem
  useEffect(() => {
    setSplashVideoFailed(false);
    setCloudSplashAnimationUrl(
      bootState.splashAnimationUrl ||
        customSoundtrackManager.getState().splashAnimationUrl ||
        '',
    );
    setCloudTitleAnimationUrl(
      bootState.titleAnimationUrl || customSoundtrackManager.getState().titleAnimationUrl || '',
    );
    return customSoundtrackManager.subscribe(() => {
      const st = customSoundtrackManager.getState();
      if (st.splashAnimationUrl !== undefined) {
        setCloudSplashAnimationUrl(st.splashAnimationUrl);
      }
      if (st.titleAnimationUrl) {
        setCloudTitleAnimationUrl(st.titleAnimationUrl);
      }
    });
  }, [bootState.splashAnimationUrl, bootState.titleAnimationUrl]);

  /**
   * Força a reprodução do vídeo da Splash Screen (.mp4) tratando o bloqueio de Autoplay com Som do navegador:
   * 1. Tenta dar video.play() com som ativado (muted = false).
   * 2. Caso o navegador bloqueie o autoplay com áudio (NotAllowedError), define video.muted = true no catch
   *    e chama video.play() novamente para garantir que a animação da logo SEMPRE rode perfeitamente sem travar.
   */
  const attemptPlaySplashVideo = useCallback(
    async (videoEl: HTMLVideoElement | null) => {
      if (!videoEl || bootState.activePanel !== 'Panel_Splash') return;
      const shouldAllowAudio = !soundMuted && bootState.splashVideoAudioActive;

      if (!shouldAllowAudio) {
        videoEl.muted = true;
        videoEl.volume = 0;
        setIsAutoplayAudioBlocked(false);
        try {
          await videoEl.play();
        } catch {
          // Aguarda próximo evento de buffer (onCanPlay)
        }
        return;
      }

      try {
        videoEl.muted = false;
        videoEl.volume = 1.0;
        await videoEl.play();
        setIsAutoplayAudioBlocked(false);
      } catch {
        // Fallback imediato: navegador bloqueou autoplay com som -> roda a animação mutada sem travar e libera o som no 1º clique/toque
        try {
          videoEl.muted = true;
          setIsAutoplayAudioBlocked(true);
          await videoEl.play();
        } catch {
          // Aguarda buffer completar
        }
      }
    },
    [bootState.activePanel, bootState.splashVideoAudioActive, soundMuted],
  );

  // Dispara videoRef.current.play() assim que a URL da Splash estiver pronta
  useEffect(() => {
    if (bootState.activePanel !== 'Panel_Splash' || !cloudSplashAnimationUrl || splashVideoFailed) {
      return;
    }
    const vid = splashVideoRef.current;
    if (vid) {
      void attemptPlaySplashVideo(vid);
    }
  }, [
    bootState.activePanel,
    cloudSplashAnimationUrl,
    splashVideoFailed,
    attemptPlaySplashVideo,
  ]);

  // Libera o áudio do vídeo da Splash imediatamente no primeiro clique/toque em qualquer lugar da tela
  useEffect(() => {
    if (bootState.activePanel !== 'Panel_Splash') return;

    const unlockSplashVideoAudio = () => {
      const vid = splashVideoRef.current;
      if (!vid || soundMuted || !bootState.splashVideoAudioActive) return;
      try {
        vid.muted = false;
        vid.volume = 1.0;
        void vid.play().catch(() => {});
        setIsAutoplayAudioBlocked(false);
      } catch {
        // ignora
      }
    };

    window.addEventListener('pointerdown', unlockSplashVideoAudio, { passive: true });
    window.addEventListener('touchstart', unlockSplashVideoAudio, { passive: true });
    window.addEventListener('click', unlockSplashVideoAudio, { passive: true });
    window.addEventListener('keydown', unlockSplashVideoAudio, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', unlockSplashVideoAudio);
      window.removeEventListener('touchstart', unlockSplashVideoAudio);
      window.removeEventListener('click', unlockSplashVideoAudio);
      window.removeEventListener('keydown', unlockSplashVideoAudio);
    };
  }, [bootState.activePanel, bootState.splashVideoAudioActive, soundMuted]);

  // Durante o Fade Out final da Splash Screen, encerra suavemente o áudio do VideoPlayer da logo
  useEffect(() => {
    const vid = splashVideoRef.current;
    if (!vid) return;
    if (bootState.splashOpacity === 0 || !bootState.splashVideoAudioActive) {
      vid.volume = 0;
      try {
        vid.pause();
      } catch {
        // ignora
      }
    } else if (!vid.muted) {
      vid.volume = soundMuted ? 0 : 1.0;
    }
  }, [bootState.splashOpacity, bootState.splashVideoAudioActive, soundMuted]);

  // Loop de pulsação suave de "Toque para começar" (opacidade 100% <-> 30%)
  useEffect(() => {
    if (bootState.activePanel !== 'Panel_Title') return;
    const timer = window.setInterval(() => {
      setPulseLow((prev) => !prev);
    }, 950);
    return () => window.clearInterval(timer);
  }, [bootState.activePanel]);

  if (bootState.activePanel === 'Panel_Lobby') {
    return null;
  }

  // FASE 1: Panel_Splash (Fundo branco sólido #FFFFFF + VideoPlayer em RawImage com som exclusivo do vídeo da logo ou fallback estático)
  if (bootState.activePanel === 'Panel_Splash') {
    const hasSplashVideo = Boolean(cloudSplashAnimationUrl) && !splashVideoFailed;

    return (
      <div
        id="Panel_Splash"
        data-testid="panel-splash"
        data-silent-splash="true"
        data-splash-video-active={hasSplashVideo ? 'true' : 'false'}
        data-splash-audio-mode={bootState.splashVideoAudioOutputMode}
        onClick={() => {
          const vid = splashVideoRef.current;
          if (vid && !soundMuted && bootState.splashVideoAudioActive) {
            vid.muted = false;
            vid.volume = 1.0;
            void vid.play().catch(() => {});
            setIsAutoplayAudioBlocked(false);
          }
        }}
        className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-white text-slate-900 select-none transition-opacity duration-500 ${
          bootState.splashOpacity > 0 ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {hasSplashVideo ? (
          <>
            <video
              ref={splashVideoRef}
              key={cloudSplashAnimationUrl}
              data-testid="splash-animation-video-player"
              data-audio-output-mode={bootState.splashVideoAudioOutputMode}
              src={cloudSplashAnimationUrl}
              autoPlay
              playsInline
              preload="auto"
              onLoadedMetadata={(e) => {
                void attemptPlaySplashVideo(e.currentTarget);
              }}
              onCanPlay={(e) => {
                if (e.currentTarget.paused) {
                  void attemptPlaySplashVideo(e.currentTarget);
                }
              }}
              onEnded={() => gameBootFlowManager.notifySplashVideoEnded()}
              onError={() => setSplashVideoFailed(true)}
              className="w-full h-full object-contain bg-white"
            />
            {isAutoplayAudioBlocked && !soundMuted && (
              <button
                type="button"
                data-testid="splash-unmute-prompt"
                onClick={(e) => {
                  e.stopPropagation();
                  const vid = splashVideoRef.current;
                  if (vid) {
                    vid.muted = false;
                    vid.volume = 1.0;
                    void vid.play().catch(() => {});
                  }
                  setIsAutoplayAudioBlocked(false);
                }}
                className="
                  fixed bottom-6 right-6 z-50 flex items-center gap-2
                  px-3.5 py-2 rounded-lg bg-slate-900/80 text-white
                  text-xs font-bold shadow-lg backdrop-blur-sm cursor-pointer
                "
              >
                <Volume2 className="w-4 h-4 text-amber-400" />
                <span>Toque para ativar o som</span>
              </button>
            )}
          </>
        ) : (
          <div
            data-testid="splash-static-fallback-logo"
            style={{ opacity: splashLogoAlpha }}
            className="flex flex-col items-center gap-4 px-6 text-center transition-opacity duration-150"
          >
            <div className="w-24 h-24 rounded-3xl bg-slate-950 text-white flex items-center justify-center shadow-2xl border-2 border-amber-400">
              <Trophy className="w-12 h-12 text-amber-400" />
            </div>
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.38em] text-amber-600">
                AERO VOLLEY STUDIOS
              </div>
              <h1 className="mt-1 font-display text-3xl sm:text-4xl font-black uppercase tracking-tight text-slate-950">
                SPAKE LEGEND ENGINE
              </h1>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Sincronizando mídias na nuvem (config/gameMedia) • BGM e SFX desligados na Splash
              </p>
            </div>
            <div className="w-52 h-1.5 rounded-full bg-slate-200 overflow-hidden mt-2">
              <div className="h-full w-3/4 bg-amber-500 animate-pulse rounded-full" />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-between select-none overflow-hidden">
      {/* FASE 2: Vídeo .mp4 sem áudio em loop contínuo (RawImage + VideoPlayer renderizando titleAnimation da nuvem) */}
      {cloudTitleAnimationUrl && (
        <video
          key={cloudTitleAnimationUrl}
          data-testid="title-animation-video-player"
          src={cloudTitleAnimationUrl}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="pointer-events-none absolute inset-0 w-full h-full object-cover opacity-80"
        />
      )}

      {/* Arte de Capa / Backdrop Cinematográfico da Tela de Título */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/45 to-slate-950/75"
        aria-hidden="true"
      />

      {/* Barra Superior (Versão com Gatilho Admin 7 Toques + Mute, sem badges de debug) */}
      <header className="relative z-20 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSecretVersionTap?.();
            }}
            data-testid="boot-version-badge"
            className="flex items-center gap-2 bg-slate-900/85 border border-white/15 px-3 py-1.5 rounded-lg backdrop-blur-md cursor-pointer"
            title="Versão Oficial"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono text-[11px] font-bold tracking-widest uppercase text-slate-200">
              SPAKE LEGEND ARENA • v2.5 AAA
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleMute();
          }}
          aria-label={soundMuted ? 'Ativar som' : 'Silenciar som'}
          className="pointer-events-auto flex items-center gap-1.5 bg-slate-900/85 hover:bg-slate-800 border border-white/15 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-200 transition cursor-pointer"
        >
          {soundMuted ? (
            <VolumeX className="w-4 h-4 text-rose-400" />
          ) : (
            <Volume2 className="w-4 h-4 text-amber-400" />
          )}
          <span>{soundMuted ? 'Mudo' : 'Áudio'}</span>
        </button>
      </header>

      {/* FASE 2: Panel_Title (Tela de Título Animada com "Toque para Começar") */}
      {bootState.activePanel === 'Panel_Title' && (
        <div
          id="Panel_Title"
          data-testid="panel-title"
          onClick={onTitleTouch}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onTitleTouch();
            }
          }}
          className={`relative z-10 flex-1 flex flex-col items-center justify-between py-8 px-6 cursor-pointer transition-opacity duration-300 ${
            bootState.titleOpacity > 0 ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="my-auto flex flex-col items-center text-center max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-md bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-extrabold uppercase tracking-[0.22em] mb-3">
              CAMPEONATO MUNDIAL DE VÔLEI 3D
            </div>
            <h1 className="font-display text-5xl sm:text-7xl md:text-8xl font-black italic uppercase tracking-tight text-white drop-shadow-[0_10px_30px_rgba(0,0,0,0.85)] leading-[0.92]">
              SPAKE <span className="text-amber-400">LEGEND</span>
              <span className="block text-2xl sm:text-4xl not-italic font-extrabold tracking-[0.26em] text-sky-300 mt-2">
                ARENA ONLINE
              </span>
            </h1>
            <p className="mt-4 max-w-xl text-xs sm:text-sm text-slate-300 font-medium">
              Física oficial FIVB • Saques de Precisão e Cortes Direcionais • Evolução RPG & Liga Mundial
            </p>
          </div>

          {/* Texto "Toque para começar" pulsando suavemente na parte inferior (opacidade 100% para 30% em loop) */}
          <div className="flex flex-col items-center gap-2 pb-6">
            <div
              data-testid="tap-to-start-text"
              className={`px-8 py-3 rounded-xl bg-slate-950/75 border border-amber-400/50 text-amber-300 font-display text-lg sm:text-2xl font-black uppercase tracking-[0.25em] shadow-[0_0_30px_rgba(245,158,11,0.3)] transition-opacity duration-700 ${
                pulseLow ? 'opacity-30' : 'opacity-100'
              }`}
            >
              Toque para começar
            </div>
          </div>
        </div>
      )}

      {/* FASE 3A: Panel_Terms (Termos de Serviço para Novo Jogador IsFirstTime == 1) */}
      {bootState.activePanel === 'Panel_Terms' && (
        <div
          id="Panel_Terms"
          data-testid="panel-terms"
          className="relative z-20 flex-1 flex items-center justify-center px-4"
        >
          <div className="w-full max-w-lg rounded-2xl bg-slate-900/95 border border-white/15 p-6 shadow-2xl backdrop-blur-xl text-white">
            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                  FIRST-TIME USER EXPERIENCE (FTUE)
                </span>
                <h2 className="font-display text-xl font-black uppercase tracking-wide">
                  Termos de Serviço & Privacidade
                </h2>
              </div>
            </div>

            <div className="mt-4 space-y-2.5 text-xs text-slate-300 leading-relaxed bg-slate-950/70 border border-white/10 rounded-xl p-4 max-h-48 overflow-y-auto">
              <p className="font-bold text-white">
                Bem-vindo ao Spake Legend Arena! Antes de entrar na quadra, confirme os termos oficiais:
              </p>
              <p>
                1. <strong>Conta Oficial Vinculada:</strong> Seu progresso de RPG (Força, Salto,
                Velocidade), saldo de PlayerCoins e histórico competitivo são sincronizados na nuvem
                via Google / Play Games no Firestore.
              </p>
              <p>
                2. <strong>Métricas de Qualidade & Sessão:</strong> O jogo registra o tempo de sessão
                e avaliações opcionais para balanceamento contínuo da Inteligência Artificial e
                estabilidade dos servidores.
              </p>
              <p>
                3. <strong>Jogo Limpo (Fair Play):</strong> Partidas ranqueadas e torneios seguem as
                regras oficiais da arena.
              </p>
            </div>

            <label className="mt-4 flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={agreedCheckbox}
                onChange={(e) => setAgreedCheckbox(e.target.checked)}
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
              />
              <span>Li e aceito os Termos de Serviço e a Política de Dados do Spake Legend Arena.</span>
            </label>

            <button
              type="button"
              disabled={!agreedCheckbox}
              onClick={onAcceptTerms}
              data-testid="accept-terms-btn"
              className="mt-5 w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-display font-black uppercase tracking-wider text-sm transition cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Aceitar e Continuar para Login
            </button>
          </div>
        </div>
      )}

      {/* FASE 3B: Panel_Login (REGRA ESTRITA: APENAS "Entrar com Google / Play Games", sem opção de Convidado) */}
      {bootState.activePanel === 'Panel_Login' && (
        <div
          id="Panel_Login"
          data-testid="panel-login"
          className="relative z-20 flex-1 flex items-center justify-center px-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-slate-900/95 border border-white/15 p-6 shadow-2xl backdrop-blur-xl text-white text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300 mb-3">
              <Trophy className="w-7 h-7" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
              AUTENTICAÇÃO OFICIAL OBRIGATÓRIA
            </span>
            <h2 className="mt-1 font-display text-2xl font-black uppercase tracking-wide">
              Vincular Conta de Atleta
            </h2>
            <p className="mt-2 text-xs text-slate-300 leading-relaxed">
              Todos os jogadores do <strong>Spake Legend Arena</strong> são registrados no banco de
              dados oficial (Firestore) para salvar atributos RPG, PlayerCoins e Ranking Mundial.
            </p>

            <div className="mt-6">
              <button
                type="button"
                disabled={bootState.isAuthenticating}
                onClick={() => void onGoogleLogin()}
                data-testid="google-play-login-btn"
                className="w-full flex items-center justify-center gap-3 py-3.5 px-5 rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-display font-black uppercase tracking-wider text-sm shadow-lg transition cursor-pointer disabled:opacity-60"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#EA4335"
                    d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12s4.3 9.5 9.5 9.5c5.5 0 9.1-3.8 9.1-9.2 0-.6-.1-1.1-.2-1.6H12z"
                  />
                </svg>
                <span>
                  {bootState.isAuthenticating
                    ? 'Autenticando no Firestore...'
                    : 'Entrar com Google / Play Games'}
                </span>
              </button>
            </div>

            <div className="mt-4 text-[11px] text-slate-400">
              Sincronização automática com Cloud Firestore • Sem contas anônimas/visitantes
            </div>
          </div>
        </div>
      )}

      <footer className="relative z-20 px-6 py-3 flex items-center justify-between text-[11px] text-slate-400">
        <span>Spake Legend Arena • Boot Flow AAA (Landscape Lock)</span>
        <span>Firestore Cloud Sync Ativo (config/gameMedia)</span>
      </footer>
    </div>
  );
};

interface RatingPopupModalProps {
  isOpen: boolean;
  matchesPlayed: number;
  onClose: () => void;
  onSubmitRating: (stars: number, comment: string) => Promise<void>;
}

/**
 * Pop-up de Avaliação In-Game (Panel_RatingPopup):
 * Exibido após a 3ª partida jogada para coletar avaliação de 1 a 5 estrelas e salvar no Firestore.
 */
export const RatingPopupModal: React.FC<RatingPopupModalProps> = ({
  isOpen,
  matchesPlayed,
  onClose,
  onSubmitRating,
}) => {
  const [selectedStars, setSelectedStars] = useState<number>(5);
  const [comment, setComment] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onSubmitRating(selectedStars, comment);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      id="Panel_RatingPopup"
      data-testid="panel-rating-popup"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-amber-400/40 p-6 text-white shadow-2xl">
        <div className="text-center">
          <span className="inline-block px-3 py-1 rounded-md bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[10px] font-black uppercase tracking-widest">
            {matchesPlayed}ª PARTIDA CONCLUÍDA!
          </span>
          <h3 className="mt-2 font-display text-2xl font-black uppercase tracking-wide">
            Avalie o Spake Legend Arena
          </h3>
          <p className="mt-1 text-xs text-slate-300">
            Você completou {matchesPlayed} partidas! Como está sendo sua experiência na quadra?
          </p>
        </div>

        {/* Seletor de 1 a 5 Estrelas */}
        <div className="mt-5 flex items-center justify-center gap-2.5">
          {[1, 2, 3, 4, 5].map((star) => {
            const active = star <= selectedStars;
            return (
              <button
                key={star}
                type="button"
                onClick={() => setSelectedStars(star)}
                data-testid={`rating-star-${star}`}
                className={`p-2.5 rounded-xl border transition cursor-pointer ${
                  active
                    ? 'bg-amber-500/25 border-amber-400 text-amber-300 scale-105'
                    : 'bg-slate-800/70 border-white/10 text-slate-500 hover:text-slate-300'
                }`}
                aria-label={`${star} estrelas`}
              >
                <Star className={`w-7 h-7 ${active ? 'fill-amber-400 text-amber-400' : ''}`} />
              </button>
            );
          })}
        </div>
        <div className="mt-2 text-center text-xs font-bold text-amber-300">
          Nota selecionada: {selectedStars} de 5 Estrelas
        </div>

        <div className="mt-4">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            Comentário Opcional (Salvo no Firestore)
          </label>
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Ex: Jogabilidade fluida e saques incríveis!"
            maxLength={200}
            className="w-full rounded-xl bg-slate-950 border border-white/15 px-3.5 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
          />
        </div>

        <div className="mt-5 flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition cursor-pointer"
          >
            Agora não
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleConfirm()}
            data-testid="submit-rating-btn"
            className="flex-1 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-black uppercase tracking-wider text-xs transition cursor-pointer disabled:opacity-50"
          >
            {submitting ? 'Salvando...' : 'Enviar Avaliação'}
          </button>
        </div>
      </div>
    </div>
  );
};
