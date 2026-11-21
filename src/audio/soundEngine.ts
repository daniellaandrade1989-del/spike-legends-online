/**
 * Spike Legends Online — Motor de Áudio Reativo Procedural (Web Audio API)
 * Zero dependências externas / zero 404s.
 * Inclui:
 * - SFX de impacto com peso dinâmico e bass boost para Corte/Chute Perfeito
 * - Audio Ducking com abafamento (Lowpass) no BGM por 0.5s durante Hitstop
 * - Foley completo de areia (passos pesados e mergulho "peixinho")
 * - Vozes estilo anime (grunts de pulo, ataque e comemoração) com suporte a hooks
 * - Sistema de torcida dinâmica que cresce durante o rally e explode no ponto
 */
import type { CharacterId } from '../config/gameConfig';

export type AnimeVoiceKind = 'jump' | 'spike' | 'celebrate';
export type AnimeVoiceHook = (kind: AnimeVoiceKind, characterId?: CharacterId) => boolean | void;
export type CustomSfxSlot =
  | 'ShoeSqueaks'
  | 'ImpactSpike'
  | 'ImpactReceive'
  | 'FloorSlam'
  | 'Whistle'
  | 'Jump';
export type CustomSfxPlayerFn = (
  slot: CustomSfxSlot,
  opts?: {
    intensity?: number;
    isHardStop?: boolean;
    pitchMin?: number;
    pitchMax?: number;
    allowInMenuTest?: boolean;
  },
) => boolean;

export interface ShoeSqueakClipProfile {
  readonly id: string;
  readonly baseHz: number;
  readonly peakHz: number;
  readonly dur: number;
  readonly q: number;
  readonly amp: number;
  readonly soleHz: number;
  readonly doubleChirpRatio?: number;
}

export const SHOE_SQUEAK_CLIPS: readonly ShoeSqueakClipProfile[] = [
  { id: 'squeak_short_cut', baseHz: 2280, peakHz: 3260, dur: 0.044, q: 5.2, amp: 0.088, soleHz: 118 },
  { id: 'squeak_sharp_brake', baseHz: 2540, peakHz: 3680, dur: 0.068, q: 6.4, amp: 0.132, soleHz: 142, doubleChirpRatio: 1.12 },
  { id: 'squeak_pivot_slide', baseHz: 2040, peakHz: 2980, dur: 0.056, q: 4.8, amp: 0.102, soleHz: 108 },
  { id: 'squeak_double_chirp', baseHz: 2410, peakHz: 3440, dur: 0.062, q: 5.9, amp: 0.118, soleHz: 134, doubleChirpRatio: 0.94 },
  { id: 'squeak_high_traction', baseHz: 2720, peakHz: 3890, dur: 0.051, q: 6.8, amp: 0.095, soleHz: 126 },
];

export function selectRandomShoeSqueakClipIndex(
  totalClips: number,
  lastIndex: number,
  rng: () => number = Math.random,
): number {
  if (totalClips <= 1) return 0;
  let picked = Math.floor(rng() * totalClips);
  picked = Math.max(0, Math.min(totalClips - 1, picked));
  if (picked === lastIndex) {
    // Evita repetição imediata escolhendo outro índice do array
    const offset = 1 + Math.floor(rng() * (totalClips - 1));
    picked = (lastIndex + offset) % totalClips;
  }
  return picked;
}

export function computeShoeSqueakPitch(
  minPitch = 0.85,
  maxPitch = 1.15,
  rng: () => number = Math.random,
): number {
  const clampedRng = Math.max(0, Math.min(1, rng()));
  return Number((minPitch + clampedRng * (maxPitch - minPitch)).toFixed(3));
}

const CHARACTER_BASE_PITCH: Record<CharacterId, number> = {
  akira: 255,
  ren: 215,
  yuki: 195,
  hana: 340,
  kai: 180,
};

class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private musicVolume = 0.35;
  private sfxVolume = 0.72;
  private crowdVolume = 0.65;
  private shoeSqueakVolume = 0.85;
  private musicTimer: number | null = null;
  private currentTrack: 'menu' | 'match' | null = null;
  private stepIdx = 0;
  private currentScreenState = 'title';

  // Canais dedicados para BGM + Ducking + Lowpass + Fade
  private proceduralMusicFadeGain: GainNode | null = null;
  private musicMasterGain: GainNode | null = null;
  private musicDuckGain: GainNode | null = null;
  private musicMuffleFilter: BiquadFilterNode | null = null;
  private stopFadeTimeout: number | null = null;

  // Canais dedicados de Torcida Dinâmica Contínua (Singleton: Procedural ou Custom AudioBuffer em Loop)
  private crowdSource: AudioBufferSourceNode | null = null;
  private readonly activeCrowdSources = new Set<AudioBufferSourceNode>();
  private readonly activeCrowdGains = new Set<GainNode>();
  private crowdMurmurFilter: BiquadFilterNode | null = null;
  private crowdPresenceFilter: BiquadFilterNode | null = null;
  private crowdGain: GainNode | null = null;
  private crowdActive = false;
  private customCrowdBuffer: AudioBuffer | null = null;

  // Referências de segurança para SFX de Tênis (loop estritamente desativado)
  private shoeSqueakSource: AudioScheduledSourceNode | null = null;
  private activeShoeSqueakNodes = new Set<AudioScheduledSourceNode>();

  // Curva suave de saturação (bass boost sem clip)
  private softClipCurve: Float32Array<ArrayBuffer> | null = null;
  private voiceHooks: AnimeVoiceHook[] = [];
  private customSfxPlayer: CustomSfxPlayerFn | null = null;
  private lastShoeSqueakIdx = -1;
  public ShoeSqueakSounds: readonly ShoeSqueakClipProfile[] = SHOE_SQUEAK_CLIPS;

  /**
   * Wrapper explícito da fonte de Música de Fundo (bgmAudioSource) para desligamento imediato na partida:
   * `if (bgmAudioSource != null && bgmAudioSource.isPlaying) { bgmAudioSource.Stop(); }`
   */
  public readonly bgmAudioSource = (() => {
    const self = this;
    return {
      get isPlaying(): boolean {
        return self.isBgmPlaying();
      },
      Stop: (): void => {
        self.forceStopMatchBgm();
      },
    };
  })();

  /**
   * Wrapper explícito da fonte de Efeitos Sonoros da quadra (sfxAudioSource — bola, apito, tênis)
   */
  public readonly sfxAudioSource = {
    isReady: true,
  };

  public isBgmPlaying(): boolean {
    return this.musicTimer !== null || this.currentTrack !== null;
  }

  public isGameplayScreenState(): boolean {
    if (typeof document !== 'undefined' && document.body?.dataset?.state) {
      const domState = document.body.dataset.state;
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

  public forceStopMatchBgm(): void {
    // Para exclusivamente a Música de Fundo (BGM), preservando o canal independente da plateia (crowdSource)
    this.stopMusic(true);
    if (this.ctx && this.musicMasterGain) {
      const now = this.ctx.currentTime;
      this.musicMasterGain.gain.cancelScheduledValues(now);
      this.musicMasterGain.gain.setValueAtTime(0, now);
    }
  }

  public setScreenState(state: string): void {
    this.currentScreenState = state || 'menu';
    if (this.currentScreenState !== 'playing') {
      this.stopShoeSqueakSources();
    }
    if (
      this.currentScreenState === 'playing' ||
      this.currentScreenState === 'paused' ||
      this.currentScreenState === 'guide'
    ) {
      // Desliga imediatamente qualquer BGM ao entrar na partida, mantendo crowdSource e sfxAudioSource livres
      if (this.bgmAudioSource != null && this.bgmAudioSource.isPlaying) {
        this.bgmAudioSource.Stop();
      }
      this.forceStopMatchBgm();
    } else {
      // Fora da partida (TITLE, MENU, LOBBY, GAMEOVER, etc.): corta imediatamente qualquer som de plateia
      this.stopCrowdAmbience();
      if (this.ctx && this.musicMasterGain) {
        this.musicMasterGain.gain.setValueAtTime(this.getEffectiveMusicGain(), this.ctx.currentTime);
      }
    }
  }

  public getScreenState(): string {
    return this.currentScreenState;
  }

  public isInMenuState(): boolean {
    if (typeof document !== 'undefined' && document.body?.dataset?.state) {
      const domState = document.body.dataset.state;
      if (domState !== 'playing') {
        return true;
      }
    }
    return this.currentScreenState !== 'playing';
  }

  public stopShoeSqueakSources(): void {
    if (this.shoeSqueakSource) {
      try {
        if ('loop' in this.shoeSqueakSource) {
          (this.shoeSqueakSource as AudioBufferSourceNode).loop = false;
        }
        this.shoeSqueakSource.stop();
        this.shoeSqueakSource.disconnect();
      } catch {
        // Ignore already stopped
      }
      this.shoeSqueakSource = null;
    }
    for (const node of this.activeShoeSqueakNodes) {
      try {
        if ('loop' in node) {
          (node as AudioBufferSourceNode).loop = false;
        }
        node.stop();
        node.disconnect();
      } catch {
        // Ignore already stopped
      }
    }
    this.activeShoeSqueakNodes.clear();
  }

  public StopAllGameplaySounds(): void {
    this.stopShoeSqueakSources();
    this.stopCrowdAmbience();
    if (!this.customExclusiveMode) {
      this.startMusic('menu');
    }
  }

  public registerCustomSfxPlayer(player: CustomSfxPlayerFn | null): void {
    this.customSfxPlayer = player;
  }

  public playCustomSfxIfAssigned(
    slot: CustomSfxSlot,
    opts?: {
      intensity?: number;
      isHardStop?: boolean;
      pitchMin?: number;
      pitchMax?: number;
      allowInMenuTest?: boolean;
    },
  ): boolean {
    if (this.muted || this.sfxVolume <= 0 || !this.customSfxPlayer) return false;
    return this.customSfxPlayer(slot, opts);
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.setupBuses(this.ctx);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private setupBuses(ctx: AudioContext): void {
    // Cadeia de BGM: osc -> (proceduralMusicFadeGain ->) musicMuffleFilter -> musicDuckGain -> musicMasterGain -> destination
    this.musicMuffleFilter = ctx.createBiquadFilter();
    this.musicMuffleFilter.type = 'lowpass';
    this.musicMuffleFilter.frequency.setValueAtTime(18000, ctx.currentTime);
    this.musicMuffleFilter.Q.setValueAtTime(0.7, ctx.currentTime);

    this.proceduralMusicFadeGain = ctx.createGain();
    this.proceduralMusicFadeGain.gain.setValueAtTime(1.0, ctx.currentTime);

    this.musicDuckGain = ctx.createGain();
    this.musicDuckGain.gain.setValueAtTime(1.0, ctx.currentTime);

    this.musicMasterGain = ctx.createGain();
    this.musicMasterGain.gain.setValueAtTime(this.getEffectiveMusicGain(), ctx.currentTime);

    this.proceduralMusicFadeGain.connect(this.musicMuffleFilter);
    this.musicMuffleFilter
      .connect(this.musicDuckGain)
      .connect(this.musicMasterGain)
      .connect(ctx.destination);

    // Curva de saturação suave para impactos pesados
    const n = 512;
    const curve = new Float32Array(new ArrayBuffer(n * 4));
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = Math.tanh(x * 2.4);
    }
    this.softClipCurve = curve;
  }

  public unlock(): void {
    this.ensureContext();
  }

  public ensureContextAndMusicBus(): { ctx: AudioContext; inputNode: AudioNode } | null {
    const ctx = this.ensureContext();
    if (!ctx || !this.musicMuffleFilter) return null;
    return { ctx, inputNode: this.musicMuffleFilter };
  }

  private refreshCrowdGainImmediate(): void {
    if (!this.ctx || !this.crowdGain || !this.crowdActive) return;
    const sfxGain = this.getEffectiveSfxGain();
    const effective = this.crowdVolume * sfxGain;
    if (this.muted || effective <= 0) {
      this.crowdGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
      return;
    }
    const baseGain = this.customCrowdBuffer ? 1.0 : 0.055;
    this.crowdGain.gain.setTargetAtTime(
      Math.max(0.0001, Math.min(1.0, baseGain * effective)),
      this.ctx.currentTime,
      0.04,
    );
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.musicMasterGain) {
      this.musicMasterGain.gain.setTargetAtTime(this.getEffectiveMusicGain(), this.ctx.currentTime, 0.03);
    }
    this.refreshCrowdGainImmediate();
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setVolumes(music: number, sfx: number): void {
    this.musicVolume = Math.max(0, Math.min(1, music));
    this.sfxVolume = Math.max(0, Math.min(1, sfx));
    if (this.ctx && this.musicMasterGain) {
      this.musicMasterGain.gain.setTargetAtTime(this.getEffectiveMusicGain(), this.ctx.currentTime, 0.03);
    }
    this.refreshCrowdGainImmediate();
  }

  public setCrowdVolume(volume: number): void {
    this.crowdVolume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0.65));
    this.refreshCrowdGainImmediate();
  }

  public getCrowdVolume(): number {
    return this.crowdVolume;
  }

  public setShoeSqueakVolume(volume: number): void {
    this.shoeSqueakVolume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0.85));
  }

  public getShoeSqueakVolume(): number {
    return this.shoeSqueakVolume;
  }

  public setCustomCrowdBuffer(buffer: AudioBuffer | null): void {
    this.customCrowdBuffer = buffer;
    if (this.crowdActive && this.isGameplayScreenState()) {
      this.stopCrowdAmbience();
      this.startCrowdAmbience();
    } else if (!this.isGameplayScreenState()) {
      this.stopCrowdAmbience();
    }
  }

  public hasCustomCrowdBuffer(): boolean {
    return this.customCrowdBuffer !== null;
  }

  public getOrCreateContext(): AudioContext | null {
    return this.ensureContext();
  }

  public getEffectiveSfxVolume(): number {
    return this.getEffectiveSfxGain();
  }

  private getEffectiveSfxGain(): number {
    return this.muted ? 0 : this.sfxVolume;
  }

  private getEffectiveMusicGain(): number {
    return this.muted ? 0 : this.musicVolume;
  }

  private createNoiseBuffer(ctx: AudioContext, durationSec: number, pinkTilt = false): AudioBuffer {
    const bufSize = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
    const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < bufSize; i++) {
      const white = Math.random() * 2 - 1;
      if (pinkTilt) {
        b0 = 0.997 * b0 + white * 0.029;
        b1 = 0.985 * b1 + white * 0.032;
        b2 = 0.950 * b2 + white * 0.048;
        data[i] = (b0 + b1 + b2 + white * 0.18) * 1.4;
      } else {
        data[i] = white;
      }
    }
    return buffer;
  }

  // =========================================================================
  // 1. AUDIO DUCKING (Atenuação & Abafamento do BGM durante Hitstop)
  // =========================================================================
  public duckMusic(durationSec = 0.5, duckLevel = 0.14, muffleHz = 420): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.musicDuckGain || !this.musicMuffleFilter) return;

    const now = ctx.currentTime;
    const holdEnd = now + Math.max(0.12, durationSec * 0.45);
    const recoverEnd = now + Math.max(0.25, durationSec);

    this.musicDuckGain.gain.cancelScheduledValues(now);
    this.musicDuckGain.gain.setValueAtTime(this.musicDuckGain.gain.value, now);
    this.musicDuckGain.gain.linearRampToValueAtTime(duckLevel, now + 0.02);
    this.musicDuckGain.gain.setValueAtTime(duckLevel, holdEnd);
    this.musicDuckGain.gain.exponentialRampToValueAtTime(1.0, recoverEnd);

    this.musicMuffleFilter.frequency.cancelScheduledValues(now);
    this.musicMuffleFilter.frequency.setValueAtTime(this.musicMuffleFilter.frequency.value, now);
    this.musicMuffleFilter.frequency.exponentialRampToValueAtTime(muffleHz, now + 0.025);
    this.musicMuffleFilter.frequency.setValueAtTime(muffleHz, holdEnd);
    this.musicMuffleFilter.frequency.exponentialRampToValueAtTime(18000, recoverEnd);
  }

  // =========================================================================
  // 2. SFX DE IMPACTO COM PESO DINÂMICO (Couro Oco -> Canhão Bass Boost)
  // =========================================================================
  public playImpactByForce(
    force: number,
    options?: { isPerfect?: boolean; isFoot?: boolean; isReceive?: boolean },
  ): void {
    const slot: CustomSfxSlot = options?.isReceive ? 'ImpactReceive' : 'ImpactSpike';
    if (this.playCustomSfxIfAssigned(slot, { intensity: force })) return;

    const ctx = this.ensureContext();
    const vol = this.getEffectiveSfxGain();
    if (!ctx || vol <= 0) return;

    const now = ctx.currentTime;
    const clampedForce = Math.max(0.1, Math.min(1.5, force));
    const isPerfect = Boolean(options?.isPerfect) || clampedForce >= 0.88;

    // Toque leve: som oco de couro
    if (clampedForce < 0.48 && !isPerfect) {
      const osc = ctx.createOscillator();
      const bodyFilter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(240 + clampedForce * 80, now);
      osc.frequency.exponentialRampToValueAtTime(92, now + 0.09);

      bodyFilter.type = 'bandpass';
      bodyFilter.frequency.setValueAtTime(420, now);
      bodyFilter.Q.setValueAtTime(1.8, now);

      gain.gain.setValueAtTime(0.24 * vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.connect(bodyFilter).connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.11);
      return;
    }

    // Impacto médio ou pesado: corpo + estalo de couro/chicote
    const bassBoost = ctx.createBiquadFilter();
    bassBoost.type = 'lowshelf';
    bassBoost.frequency.setValueAtTime(140, now);
    bassBoost.gain.setValueAtTime(isPerfect ? 11 : 4.5, now);

    const shaper = ctx.createWaveShaper();
    if (this.softClipCurve) shaper.curve = this.softClipCurve;

    const masterOut = ctx.createGain();
    masterOut.gain.setValueAtTime(vol * (isPerfect ? 0.95 : 0.7), now);
    bassBoost.connect(shaper).connect(masterOut).connect(ctx.destination);

    // Sub-canhão grave (peso físico)
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = isPerfect ? 'sawtooth' : 'triangle';
    subOsc.frequency.setValueAtTime(isPerfect ? 165 : 190 * clampedForce, now);
    subOsc.frequency.exponentialRampToValueAtTime(isPerfect ? 34 : 54, now + (isPerfect ? 0.28 : 0.16));

    subGain.gain.setValueAtTime(isPerfect ? 0.62 : 0.36, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + (isPerfect ? 0.3 : 0.18));
    subOsc.connect(subGain).connect(bassBoost);
    subOsc.start(now);
    subOsc.stop(now + (isPerfect ? 0.31 : 0.19));

    // Estalo de chicote / impacto seco no ar
    const crackDur = isPerfect ? 0.16 : 0.09;
    const crackBuf = this.createNoiseBuffer(ctx, crackDur, false);
    const crackSrc = ctx.createBufferSource();
    crackSrc.buffer = crackBuf;

    const crackFilter = ctx.createBiquadFilter();
    crackFilter.type = 'bandpass';
    crackFilter.frequency.setValueAtTime(options?.isFoot ? 980 : isPerfect ? 2350 : 1450, now);
    crackFilter.frequency.exponentialRampToValueAtTime(options?.isFoot ? 420 : 820, now + crackDur);
    crackFilter.Q.setValueAtTime(1.1, now);

    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(isPerfect ? 0.65 : 0.34, now);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + crackDur);

    crackSrc.connect(crackFilter).connect(crackGain).connect(masterOut);
    crackSrc.start(now);

    // Camada extra de "boom" grave + eco curto de ginásio em ataques fortes/perfeitos
    if (isPerfect) {
      const boomOsc = ctx.createOscillator();
      const boomGain = ctx.createGain();
      boomOsc.type = 'sine';
      boomOsc.frequency.setValueAtTime(98, now);
      boomOsc.frequency.exponentialRampToValueAtTime(28, now + 0.34);
      boomGain.gain.setValueAtTime(0.55, now);
      boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      boomOsc.connect(boomGain).connect(bassBoost);
      boomOsc.start(now);
      boomOsc.stop(now + 0.37);
    }

    // Eco curto de quadra coberta (slapback 78ms)
    const echoBuf = this.createNoiseBuffer(ctx, 0.08, false);
    const echoSrc = ctx.createBufferSource();
    echoSrc.buffer = echoBuf;
    const echoFilter = ctx.createBiquadFilter();
    echoFilter.type = 'bandpass';
    echoFilter.frequency.setValueAtTime(1150, now + 0.075);
    echoFilter.Q.setValueAtTime(1.4, now + 0.075);
    const echoGain = ctx.createGain();
    echoGain.gain.setValueAtTime(0.14 * clampedForce * vol, now + 0.075);
    echoGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    echoSrc.connect(echoFilter).connect(echoGain).connect(ctx.destination);
    echoSrc.start(now + 0.075);
  }

  // =========================================================================
  // 3. FOLEY DE QUADRA INDOOR (Rangido de Tênis no Piso, Manchete, Toque e Impacto no Chão)
  // =========================================================================
  public PlayRandomShoeSqueak(
    intensity = 0.75,
    isHardStop = false,
    allowInMenuTest = false,
  ): void {
    // Trava estrita: se o jogo estiver no Menu Inicial (ou fora da partida ativa), bloqueia imediatamente!
    if (this.isInMenuState() && !allowInMenuTest) {
      return;
    }

    // 1. Se houver amostras enviadas (.mp3, .wav, .ogg) em ShoeSqueakSounds, escolhe aleatoriamente com pitch [0.85..1.15]
    if (
      this.playCustomSfxIfAssigned('ShoeSqueaks', {
        intensity,
        isHardStop,
        pitchMin: 0.85,
        pitchMax: 1.15,
        allowInMenuTest,
      })
    ) {
      return;
    }

    const ctx = this.ensureContext();
    const vol = this.getEffectiveSfxGain() * this.shoeSqueakVolume;
    if (!ctx || vol <= 0) return;

    // 2. Randomizer sem repetição imediata sobre a lista ShoeSqueakSounds
    const clipIdx = selectRandomShoeSqueakClipIndex(this.ShoeSqueakSounds.length, this.lastShoeSqueakIdx);
    this.lastShoeSqueakIdx = clipIdx;
    const clip = this.ShoeSqueakSounds[clipIdx];

    // 3. Modulação aleatória de Pitch entre 0.85 e 1.15 para soar orgânico e natural
    const pitchFactor = computeShoeSqueakPitch(0.85, 1.15);
    const now = ctx.currentTime;
    const clamped = Math.max(0.25, Math.min(1.2, intensity));

    const emitChirp = (startOffset: number, baseHz: number, peakHz: number, dur: number, amp: number) => {
      const t0 = now + startOffset;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseHz, t0);
      osc.frequency.exponentialRampToValueAtTime(peakHz, t0 + dur * 0.45);
      osc.frequency.exponentialRampToValueAtTime(baseHz * 0.91, t0 + dur);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime((baseHz + peakHz) * 0.5, t0);
      filter.Q.setValueAtTime(clip.q, t0);

      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.linearRampToValueAtTime(amp * clamped * vol, t0 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

      osc.connect(filter).connect(gain).connect(ctx.destination);
      this.shoeSqueakSource = osc;
      this.activeShoeSqueakNodes.add(osc);
      osc.onended = () => {
        this.activeShoeSqueakNodes.delete(osc);
        if (this.shoeSqueakSource === osc) {
          this.shoeSqueakSource = null;
        }
      };
      osc.start(t0);
      osc.stop(t0 + dur + 0.01);
    };

    const mainDur = isHardStop ? Math.max(clip.dur, 0.068) : clip.dur;
    const mainAmp = isHardStop ? Math.max(clip.amp, 0.135) : clip.amp;
    emitChirp(0, clip.baseHz * pitchFactor, clip.peakHz * pitchFactor, mainDur, mainAmp);

    if (isHardStop || clip.doubleChirpRatio) {
      const ratio = clip.doubleChirpRatio ?? 1.08;
      emitChirp(
        0.048,
        clip.baseHz * ratio * pitchFactor,
        clip.peakHz * ratio * pitchFactor,
        mainDur * 0.88,
        mainAmp * 0.78,
      );
    }

    // Batida seca da sola no piso de madeira com leve modulação pelo mesmo pitchFactor
    const soleOsc = ctx.createOscillator();
    const soleGain = ctx.createGain();
    soleOsc.type = 'triangle';
    soleOsc.frequency.setValueAtTime((isHardStop ? Math.max(135, clip.soleHz) : clip.soleHz) * pitchFactor, now);
    soleOsc.frequency.exponentialRampToValueAtTime(46 * pitchFactor, now + 0.045);
    soleGain.gain.setValueAtTime((isHardStop ? 0.11 : 0.065) * clamped * vol, now);
    soleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    soleOsc.connect(soleGain).connect(ctx.destination);
    this.activeShoeSqueakNodes.add(soleOsc);
    soleOsc.onended = () => {
      this.activeShoeSqueakNodes.delete(soleOsc);
    };
    soleOsc.start(now);
    soleOsc.stop(now + 0.055);
  }

  public playShoeSqueak(intensity = 0.75, isHardStop = false): void {
    this.PlayRandomShoeSqueak(intensity, isHardStop);
  }

  public playCourtShoeSqueak(intensity = 0.65, isHardStop = false): void {
    this.PlayRandomShoeSqueak(intensity, isHardStop);
  }

  public playCourtFloorSlam(intensity = 1.0): void {
    if (this.playCustomSfxIfAssigned('FloorSlam', { intensity })) return;

    const ctx = this.ensureContext();
    const vol = this.getEffectiveSfxGain();
    if (!ctx || vol <= 0) return;

    const now = ctx.currentTime;
    const clamped = Math.max(0.4, Math.min(1.4, intensity));

    // Sub-impacto pesado da bola esmagando no piso da quadra
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(145, now);
    subOsc.frequency.exponentialRampToValueAtTime(34, now + 0.22);
    subGain.gain.setValueAtTime(0.44 * clamped * vol, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    subOsc.connect(subGain).connect(ctx.destination);
    subOsc.start(now);
    subOsc.stop(now + 0.25);

    // Ressonância da tábua do piso de ginásio
    const plankOsc = ctx.createOscillator();
    const plankGain = ctx.createGain();
    plankOsc.type = 'triangle';
    plankOsc.frequency.setValueAtTime(310, now);
    plankOsc.frequency.exponentialRampToValueAtTime(125, now + 0.09);
    plankGain.gain.setValueAtTime(0.24 * clamped * vol, now);
    plankGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    plankOsc.connect(plankGain).connect(ctx.destination);
    plankOsc.start(now);
    plankOsc.stop(now + 0.11);
  }

  public playMancheteBump(): void {
    const ctx = this.ensureContext();
    const vol = this.getEffectiveSfxGain();
    if (!ctx || vol <= 0) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(92, now + 0.095);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(750, now);

    gain.gain.setValueAtTime(0.28 * vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    osc.connect(filter).connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  public playOverheadSet(): void {
    const ctx = this.ensureContext();
    const vol = this.getEffectiveSfxGain();
    if (!ctx || vol <= 0) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(590, now);
    osc.frequency.exponentialRampToValueAtTime(340, now + 0.065);
    gain.gain.setValueAtTime(0.18 * vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  public playSandFootstep(intensity = 0.5): void {
    this.playCourtShoeSqueak(intensity, false);
  }

  public playSandSlideDive(): void {
    const ctx = this.ensureContext();
    const vol = this.getEffectiveSfxGain();
    if (!ctx || vol <= 0) return;

    const now = ctx.currentTime;

    // Rajada intensa de areia deslizando
    const slideBuf = this.createNoiseBuffer(ctx, 0.34, true);
    const slideSrc = ctx.createBufferSource();
    slideSrc.buffer = slideBuf;

    const sandFilter = ctx.createBiquadFilter();
    sandFilter.type = 'bandpass';
    sandFilter.frequency.setValueAtTime(2200, now);
    sandFilter.frequency.exponentialRampToValueAtTime(620, now + 0.3);
    sandFilter.Q.setValueAtTime(0.9, now);

    const slideGain = ctx.createGain();
    slideGain.gain.setValueAtTime(0.001, now);
    slideGain.gain.linearRampToValueAtTime(0.3 * vol, now + 0.04);
    slideGain.gain.exponentialRampToValueAtTime(0.001, now + 0.33);

    slideSrc.connect(sandFilter).connect(slideGain).connect(ctx.destination);
    slideSrc.start(now);

    // Baque abafado do corpo caindo na areia
    const bodyOsc = ctx.createOscillator();
    const bodyLp = ctx.createBiquadFilter();
    const bodyGain = ctx.createGain();
    bodyOsc.type = 'triangle';
    bodyOsc.frequency.setValueAtTime(115, now + 0.03);
    bodyOsc.frequency.exponentialRampToValueAtTime(38, now + 0.22);

    bodyLp.type = 'lowpass';
    bodyLp.frequency.setValueAtTime(260, now);

    bodyGain.gain.setValueAtTime(0.32 * vol, now + 0.03);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    bodyOsc.connect(bodyLp).connect(bodyGain).connect(ctx.destination);
    bodyOsc.start(now + 0.03);
    bodyOsc.stop(now + 0.25);
  }

  // =========================================================================
  // 4. VOZES ESTILO ANIME (Grunts + Hooks Customizáveis)
  // =========================================================================
  public registerVoiceHook(hook: AnimeVoiceHook): () => void {
    this.voiceHooks.push(hook);
    return () => {
      this.voiceHooks = this.voiceHooks.filter((h) => h !== hook);
    };
  }

  public playAnimeVoice(kind: AnimeVoiceKind, characterId: CharacterId = 'akira'): void {
    for (const hook of this.voiceHooks) {
      if (hook(kind, characterId) === true) return;
    }

    const ctx = this.ensureContext();
    const vol = this.getEffectiveSfxGain();
    if (!ctx || vol <= 0) return;

    const now = ctx.currentTime;
    const base = CHARACTER_BASE_PITCH[characterId] ?? 240;

    const osc = ctx.createOscillator();
    const formant1 = ctx.createBiquadFilter();
    const formant2 = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    formant1.type = 'bandpass';
    formant2.type = 'bandpass';
    formant1.Q.setValueAtTime(3.2, now);
    formant2.Q.setValueAtTime(3.5, now);

    if (kind === 'jump') {
      // "Hup!" curto de impulso
      osc.frequency.setValueAtTime(base * 0.95, now);
      osc.frequency.exponentialRampToValueAtTime(base * 1.38, now + 0.09);
      formant1.frequency.setValueAtTime(720, now);
      formant2.frequency.setValueAtTime(1450, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.14 * vol, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      osc.connect(formant1).connect(gain).connect(ctx.destination);
      osc.connect(formant2).connect(gain);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (kind === 'spike') {
      // Grito explosivo estilo anime no corte!
      osc.frequency.setValueAtTime(base * 1.18, now);
      osc.frequency.exponentialRampToValueAtTime(base * 1.65, now + 0.07);
      osc.frequency.exponentialRampToValueAtTime(base * 1.05, now + 0.24);
      formant1.frequency.setValueAtTime(840, now);
      formant2.frequency.setValueAtTime(1750, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.2 * vol, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
      osc.connect(formant1).connect(gain).connect(ctx.destination);
      osc.connect(formant2).connect(gain);
      osc.start(now);
      osc.stop(now + 0.27);
    } else {
      // Fala/Exclamação de comemoração ao pontuar ("Yosh!")
      osc.frequency.setValueAtTime(base * 1.15, now);
      osc.frequency.setValueAtTime(base * 1.48, now + 0.1);
      osc.frequency.exponentialRampToValueAtTime(base * 1.72, now + 0.26);
      formant1.frequency.setValueAtTime(780, now);
      formant2.frequency.setValueAtTime(1920, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.18 * vol, now + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(formant1).connect(gain).connect(ctx.destination);
      osc.connect(formant2).connect(gain);
      osc.start(now);
      osc.stop(now + 0.32);
    }
  }

  // =========================================================================
  // 5. TORCIDA DINÂMICA (Murmúrio contínuo por Rally ou Áudio Customizado em Loop)
  // =========================================================================
  public startCrowdAmbience(): void {
    if (!this.isGameplayScreenState()) {
      this.stopCrowdAmbience();
      return;
    }
    const ctx = this.ensureContext();
    if (!ctx) return;

    // REGRA SINGLETON: Antes de criar um novo AudioBufferSourceNode para a plateia,
    // encerra obrigatoriamente qualquer instância anterior para nunca ficarem instâncias fantasmas em segundo plano.
    this.stopCrowdAmbience();

    const gain = ctx.createGain();
    this.activeCrowdGains.add(gain);
    const initialVol = this.getEffectiveSfxGain() * this.crowdVolume;

    if (this.customCrowdBuffer) {
      // Usa o arquivo de áudio customizado da Plateia/Torcida em Loop contínuo obedecendo volumeAdmin * volumeUsuario
      const src = ctx.createBufferSource();
      src.buffer = this.customCrowdBuffer;
      src.loop = true;

      gain.gain.setValueAtTime(Math.max(0, Math.min(1.0, initialVol)), ctx.currentTime);
      src.connect(gain).connect(ctx.destination);
      src.start(ctx.currentTime);

      this.crowdSource = src;
      this.activeCrowdSources.add(src);
      this.crowdMurmurFilter = null;
      this.crowdPresenceFilter = null;
      this.crowdGain = gain;
      this.crowdActive = true;
      return;
    }

    const buffer = this.createNoiseBuffer(ctx, 2.2, true);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const murmur = ctx.createBiquadFilter();
    murmur.type = 'bandpass';
    murmur.frequency.setValueAtTime(420, ctx.currentTime);
    murmur.Q.setValueAtTime(0.9, ctx.currentTime);

    const presence = ctx.createBiquadFilter();
    presence.type = 'bandpass';
    presence.frequency.setValueAtTime(980, ctx.currentTime);
    presence.Q.setValueAtTime(1.1, ctx.currentTime);

    gain.gain.setValueAtTime(Math.max(0, 0.045 * initialVol), ctx.currentTime);

    src.connect(murmur).connect(gain).connect(ctx.destination);
    src.connect(presence).connect(gain);
    src.start(ctx.currentTime);

    this.crowdSource = src;
    this.activeCrowdSources.add(src);
    this.crowdMurmurFilter = murmur;
    this.crowdPresenceFilter = presence;
    this.crowdGain = gain;
    this.crowdActive = true;
  }

  public updateCrowdAmbience(rallyDurationSec: number, excitement = 0): void {
    if (!this.isGameplayScreenState()) {
      this.stopCrowdAmbience();
      return;
    }
    const ctx = this.ctx;
    if (!ctx || !this.crowdActive || !this.crowdGain) {
      return;
    }

    const vol = this.getEffectiveSfxGain() * this.crowdVolume;
    if (vol <= 0) {
      this.crowdGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      return;
    }

    const rallyTension = Math.min(1, rallyDurationSec / 12);
    const level = Math.min(1.25, 0.55 + rallyTension * 0.4 + excitement * 0.35);

    if (this.customCrowdBuffer) {
      const targetCustomGain = Math.min(1.0, level * vol);
      this.crowdGain.gain.setTargetAtTime(Math.max(0, targetCustomGain), ctx.currentTime, 0.12);
      return;
    }

    if (!this.crowdMurmurFilter || !this.crowdPresenceFilter) return;

    const targetGain = 0.055 * level * vol;
    this.crowdGain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.12);
    this.crowdMurmurFilter.frequency.setTargetAtTime(380 + rallyTension * 240 + excitement * 180, ctx.currentTime, 0.15);
    this.crowdPresenceFilter.frequency.setTargetAtTime(920 + rallyTension * 480 + excitement * 380, ctx.currentTime, 0.15);
  }

  public triggerCrowdRoar(intensity = 1): void {
    const ctx = this.ensureContext();
    const vol = this.getEffectiveSfxGain();
    if (!ctx || vol <= 0) return;

    const now = ctx.currentTime;
    const clamped = Math.max(0.4, Math.min(1.5, intensity));
    const dur = 0.55 + clamped * 0.35;
    const buffer = this.createNoiseBuffer(ctx, dur, true);
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(760, now);
    filter.frequency.linearRampToValueAtTime(1420, now + dur * 0.42);
    filter.frequency.linearRampToValueAtTime(950, now + dur);
    filter.Q.setValueAtTime(1.25, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.19 * clamped * vol, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(filter).connect(gain).connect(ctx.destination);
    noise.start(now);
  }

  public stopCrowdAmbience(): void {
    if (this.crowdSource) {
      try {
        this.crowdSource.loop = false;
        this.crowdSource.stop();
        this.crowdSource.disconnect();
      } catch {
        // Ignore already stopped
      }
      this.crowdSource = null;
    }
    for (const src of this.activeCrowdSources) {
      try {
        src.loop = false;
        src.stop();
        src.disconnect();
      } catch {
        // Ignore already stopped
      }
    }
    this.activeCrowdSources.clear();

    for (const g of this.activeCrowdGains) {
      try {
        if (this.ctx) {
          g.gain.cancelScheduledValues(this.ctx.currentTime);
          g.gain.setValueAtTime(0, this.ctx.currentTime);
        }
        g.disconnect();
      } catch {
        // Ignore already disconnected
      }
    }
    this.activeCrowdGains.clear();

    this.crowdMurmurFilter = null;
    this.crowdPresenceFilter = null;
    this.crowdGain = null;
    this.crowdActive = false;
  }

  // =========================================================================
  // SFX CLÁSSICOS & UI (Mantidos compatíveis)
  // =========================================================================
  public playButtonClick(): void {
    const ctx = this.ensureContext();
    const vol = this.getEffectiveSfxGain();
    if (!ctx || vol <= 0) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.06);
    gain.gain.setValueAtTime(0.14 * vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  public playJump(): void {
    if (this.playCustomSfxIfAssigned('Jump', { intensity: 0.9 })) return;

    const ctx = this.ensureContext();
    const vol = this.getEffectiveSfxGain();
    if (!ctx || vol <= 0) return;

    const now = ctx.currentTime;
    const jitter = 0.92 + Math.random() * 0.16;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220 * jitter, now);
    osc.frequency.exponentialRampToValueAtTime(540 * jitter, now + 0.14);
    gain.gain.setValueAtTime(0.16 * vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  public playReceive(): void {
    this.playImpactByForce(0.36, { isReceive: true });
  }

  public playSpike(power = 1): void {
    this.playImpactByForce(power, { isPerfect: power >= 0.9 });
  }

  public playBounce(): void {
    const ctx = this.ensureContext();
    const vol = this.getEffectiveSfxGain();
    if (!ctx || vol <= 0) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(145, now);
    osc.frequency.exponentialRampToValueAtTime(56, now + 0.09);
    gain.gain.setValueAtTime(0.16 * vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  public playWhistle(): void {
    if (this.playCustomSfxIfAssigned('Whistle', { intensity: 1.0 })) return;

    const ctx = this.ensureContext();
    const vol = this.getEffectiveSfxGain();
    if (!ctx || vol <= 0) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(2750, now);
    lfo.frequency.setValueAtTime(42, now);
    lfoGain.gain.setValueAtTime(110, now);
    lfo.connect(lfoGain).connect(osc.frequency);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.14 * vol, now + 0.02);
    gain.gain.setValueAtTime(0.14 * vol, now + 0.22);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

    osc.connect(gain).connect(ctx.destination);
    lfo.start(now);
    osc.start(now);
    lfo.stop(now + 0.35);
    osc.stop(now + 0.35);
  }

  public playCheer(): void {
    this.triggerCrowdRoar(1.0);
  }

  public playUltimate(): void {
    const ctx = this.ensureContext();
    const vol = this.getEffectiveSfxGain();
    if (!ctx || vol <= 0) return;

    const now = ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      const t = now + idx * 0.045;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.11 * vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.26);
    });
  }

  public playPerfectHit(): void {
    this.playImpactByForce(1.15, { isPerfect: true });
    const ctx = this.ensureContext();
    const vol = this.getEffectiveSfxGain();
    if (!ctx || vol <= 0) return;

    const now = ctx.currentTime;
    const chime = ctx.createOscillator();
    const gain = ctx.createGain();
    chime.type = 'triangle';
    chime.frequency.setValueAtTime(740, now);
    chime.frequency.exponentialRampToValueAtTime(1480, now + 0.12);
    gain.gain.setValueAtTime(0.2 * vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    chime.connect(gain).connect(ctx.destination);
    chime.start(now);
    chime.stop(now + 0.19);
  }

  public playGuardBreak(): void {
    const ctx = this.ensureContext();
    const vol = this.getEffectiveSfxGain();
    if (!ctx || vol <= 0) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.36);
    gain.gain.setValueAtTime(0.42 * vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.39);
  }

  public playVictory(): void {
    const ctx = this.ensureContext();
    const vol = this.getEffectiveSfxGain();
    if (!ctx || vol <= 0) return;

    const now = ctx.currentTime;
    const fanfare = [523.25, 659.25, 783.99, 1046.5];
    fanfare.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t = now + idx * 0.11;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.2 * vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.46);
    });
    this.triggerCrowdRoar(1.35);
  }

  public playDefeat(): void {
    const ctx = this.ensureContext();
    const vol = this.getEffectiveSfxGain();
    if (!ctx || vol <= 0) return;

    const now = ctx.currentTime;
    const notes = [392, 349.23, 311.13, 261.63];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const t = now + idx * 0.15;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.18 * vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.36);
    });
  }

  // =========================================================================
  // MÚSICA DO MENU (Partidas operam 100% com SFX de Quadra ou Faixa Uploadada)
  // =========================================================================
  private customExclusiveMode = false;

  public setCustomExclusiveMode(active: boolean): void {
    this.customExclusiveMode = active;
    if (active) {
      this.destroyDefaultMusic(true);
    }
  }

  public destroyDefaultMusic(keepCrowd = true): void {
    if (this.stopFadeTimeout !== null) {
      window.clearTimeout(this.stopFadeTimeout);
      this.stopFadeTimeout = null;
    }
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.ctx && this.proceduralMusicFadeGain) {
      const now = this.ctx.currentTime;
      this.proceduralMusicFadeGain.gain.cancelScheduledValues(now);
      this.proceduralMusicFadeGain.gain.setValueAtTime(0.0001, now);
    }
    this.currentTrack = null;
    if (!keepCrowd) {
      this.stopCrowdAmbience();
    }
  }

  public startMusic(track: 'menu' | 'match', fadeInSec = 0): void {
    if (track === 'match' || this.isGameplayScreenState() || this.customExclusiveMode) {
      // Nunca toca música de fundo durante a partida: para imediatamente a BGM deixando apenas SFX
      if (track === 'match' || this.isGameplayScreenState()) {
        this.forceStopMatchBgm();
      } else {
        this.destroyDefaultMusic(false);
      }
      return;
    }

    if (this.stopFadeTimeout !== null) {
      window.clearTimeout(this.stopFadeTimeout);
      this.stopFadeTimeout = null;
    }

    const ctxForFade = this.ctx;
    if (ctxForFade && this.musicMasterGain) {
      this.musicMasterGain.gain.setValueAtTime(this.getEffectiveMusicGain(), ctxForFade.currentTime);
    }
    if (ctxForFade && this.proceduralMusicFadeGain) {
      const now = ctxForFade.currentTime;
      this.proceduralMusicFadeGain.gain.cancelScheduledValues(now);
      if (fadeInSec > 0.02) {
        this.proceduralMusicFadeGain.gain.setValueAtTime(0.0001, now);
        this.proceduralMusicFadeGain.gain.linearRampToValueAtTime(1.0, now + fadeInSec);
      } else {
        this.proceduralMusicFadeGain.gain.setValueAtTime(1.0, now);
      }
    }

    if (this.currentTrack === 'menu' && this.musicTimer !== null) return;
    this.stopMusic(false);
    this.currentTrack = 'menu';
    this.stepIdx = 0;
    this.stopCrowdAmbience();

    const menuScale = [261.63, 329.63, 392.0, 493.88, 392.0, 329.63, 293.66, 349.23];

    this.musicTimer = window.setInterval(() => {
      const ctx = this.ctx;
      const vol = this.getEffectiveMusicGain();
      const dest = this.proceduralMusicFadeGain ?? this.musicMuffleFilter ?? ctx?.destination;
      if (!ctx || ctx.state !== 'running' || vol <= 0 || !dest) return;

      const now = ctx.currentTime;
      const freq = menuScale[this.stepIdx % menuScale.length];
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain).connect(dest);
      osc.start(now);
      osc.stop(now + 0.29);
      this.stepIdx += 1;
    }, 320);
  }

  public startMusicWithFade(track: 'menu' | 'match', fadeInSec = 0.55): void {
    this.startMusic(track, fadeInSec);
  }

  public stopMusicWithFade(fadeOutSec = 0.55, keepCrowd = true): void {
    if (this.stopFadeTimeout !== null) {
      window.clearTimeout(this.stopFadeTimeout);
      this.stopFadeTimeout = null;
    }
    if (!this.ctx || !this.proceduralMusicFadeGain || fadeOutSec <= 0.02) {
      this.stopMusic(keepCrowd);
      return;
    }
    const now = this.ctx.currentTime;
    this.proceduralMusicFadeGain.gain.cancelScheduledValues(now);
    this.proceduralMusicFadeGain.gain.setValueAtTime(this.proceduralMusicFadeGain.gain.value, now);
    this.proceduralMusicFadeGain.gain.linearRampToValueAtTime(0.0001, now + fadeOutSec);
    this.stopFadeTimeout = window.setTimeout(() => {
      this.stopFadeTimeout = null;
      this.stopMusic(keepCrowd);
      if (this.ctx && this.proceduralMusicFadeGain) {
        this.proceduralMusicFadeGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
      }
    }, Math.round(fadeOutSec * 1000) + 25);
  }

  public stopMusic(keepCrowd = false): void {
    this.destroyDefaultMusic(keepCrowd);
  }
}

export const soundEngine = new SoundEngine();
