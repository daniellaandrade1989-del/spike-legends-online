/**
 * Spike Legends Online — GameFeelManager (Câmera Dinâmica 2.5D + Áudio Reativo + Juice)
 * Replica o peso, o impacto e o ritmo dramático de The Spike Cross:
 * - Foco Duplo (Smooth Tracking entre Bola e Jogador Ativo)
 * - Zoom Contextual de FOV (Zoom Out em saques/levantamentos altos, Zoom In no ápice do ataque)
 * - Screen Shake Escalonado (eixos X e Y por 0.3s em Corte Perfeito / Guard Break)
 * - Hitstop (0.15s) + Flash sutil na tela sincronizados
 * - Áudio Reativo: SFX escalonado por força, Ducking de BGM (0.5s), Foley de Areia, Vozes Anime e Torcida Dinâmica
 */
import type { CharacterId, PlayerActionState } from '../config/gameConfig.ts';
import type { AnimeVoiceKind } from '../audio/soundEngine.ts';

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface GameFeelAudioSink {
  playImpactByForce: (
    force: number,
    options?: { isPerfect?: boolean; isFoot?: boolean; isReceive?: boolean },
  ) => void;
  duckMusic: (durationSec?: number, duckLevel?: number, muffleHz?: number) => void;
  PlayRandomShoeSqueak?: (intensity?: number, isHardStop?: boolean) => void;
  playShoeSqueak?: (intensity?: number, isHardStop?: boolean) => void;
  playCourtShoeSqueak?: (intensity?: number, isHardStop?: boolean) => void;
  playCourtFloorSlam?: (intensity?: number) => void;
  playMancheteBump?: () => void;
  playOverheadSet?: () => void;
  playSandFootstep: (intensity?: number) => void;
  playSandSlideDive: () => void;
  playAnimeVoice: (kind: AnimeVoiceKind, characterId?: CharacterId) => void;
  updateCrowdAmbience: (rallyDurationSec: number, excitement?: number) => void;
  triggerCrowdRoar: (intensity?: number) => void;
  playGuardBreak: () => void;
  playPerfectHit: () => void;
}

export interface ImpactOptions {
  isPerfect?: boolean;
  isFoot?: boolean;
  characterId?: CharacterId;
  hitstopSec?: number;
}

export interface CameraFeelContext {
  aspect: number;
  phase: 'serve_wait' | 'rally' | 'point_freeze' | 'finished';
  ballPos: Vec3Like;
  ballVel: Vec3Like;
  activePlayerPos: Vec3Like;
  activePlayerState: PlayerActionState;
  isShowcase: boolean;
}

export interface CameraFeelOutput {
  position: Vec3Like;
  lookAt: Vec3Like;
  fov: number;
  shakeOffset: Vec3Like;
  flashOpacity: number;
  flashColor: string;
  isHitstopActive: boolean;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class GameFeelManager {
  // Parâmetros de Câmera Lateral 2.5D estilo The Spike Cross (FOV baixo + profundidade sutil no piso)
  public baseFovDesktop = 23;
  public zoomOutFovOffset = 5.5;
  public zoomInFovOffset = -4.2;
  public cameraTrackSpeed = 6.4;
  public fovTrackSpeed = 7.2;

  // Estado interno interpolado da câmera (calibrado para quadra expandida de 20m)
  public currentCamX = 0;
  public currentCamY = 5.8;
  public currentCamZ = 29.8;
  public currentLookX = 0;
  public currentLookY = 1.65;
  public currentLookZ = 0;
  public currentFov = 23;

  // Controle de Screen Shake Escalonado
  private shakeTimer = 0;
  private shakeDuration = 0.3;
  private shakeStrengthX = 0;
  private shakeStrengthY = 0;

  // Controle de Hitstop & Flash sutil (com failsafe em tempo real)
  private hitstopTimer = 0;
  private hitstopRealDeadlineMs = 0;
  private flashOpacity = 0;
  private flashColor = 'rgba(255, 250, 220, 1)';

  // Foley de passos/rangido de tênis na quadra indoor e Torcida Dinâmica
  private footstepTimer = 0;
  private hardStopCooldown = 0;
  private diveSqueakCooldown = 0;
  private lastLocalActionState: PlayerActionState = 'idle';
  private aiMotionMap = new Map<
    string,
    { prevSpeed: number; prevVx: number; prevActionState: PlayerActionState; cooldown: number }
  >();
  private rallyDurationSec = 0;
  private crowdExcitement = 0;
  private crowdUpdateAccum = 0;

  // Output reutilizável (Zero GC no loop de 60 FPS)
  private readonly _output: CameraFeelOutput = {
    position: { x: 0, y: 5.8, z: 29.8 },
    lookAt: { x: 0, y: 1.65, z: 0 },
    fov: 23,
    shakeOffset: { x: 0, y: 0, z: 0 },
    flashOpacity: 0,
    flashColor: 'rgba(255, 250, 220, 1)',
    isHitstopActive: false,
  };

  private audio: GameFeelAudioSink;

  constructor(audio: GameFeelAudioSink) {
    this.audio = audio;
  }

  public resetMatchFeel(): void {
    this.shakeTimer = 0;
    this.shakeStrengthX = 0;
    this.shakeStrengthY = 0;
    this.hitstopTimer = 0;
    this.hitstopRealDeadlineMs = 0;
    this.flashOpacity = 0;
    this.footstepTimer = 0;
    this.hardStopCooldown = 0;
    this.diveSqueakCooldown = 0;
    this.lastLocalActionState = 'idle';
    this.aiMotionMap.clear();
    this.rallyDurationSec = 0;
    this.crowdExcitement = 0;
    this.audio.updateCrowdAmbience(0, 0);
  }

  private activateHitstop(durationSec: number): void {
    const safeSec = Number.isFinite(durationSec) && durationSec > 0 ? Math.min(0.28, durationSec) : 0;
    if (safeSec <= 0) return;
    this.hitstopTimer = Math.max(this.hitstopTimer, safeSec);
    const nextDeadline = Date.now() + Math.round(this.hitstopTimer * 1000) + 80;
    this.hitstopRealDeadlineMs = Math.max(this.hitstopRealDeadlineMs, nextDeadline);
  }

  /**
   * Aciona o pacote completo de impacto (Hitstop + Screen Shake X/Y + Flash + SFX Pesado + Ducking 0.5s + Voz/Torcida).
   * @param force Força normalizada da jogada (0.2 = toque leve, 0.7 = cortada normal, >= 0.9 / isPerfect = máximo)
   */
  public triggerImpact(force: number, options?: ImpactOptions): void {
    const clampedForce = clamp(force, 0.1, 1.5);
    const isPerfect = Boolean(options?.isPerfect) || clampedForce >= 0.92;

    if (isPerfect) {
      // 1. Hitstop (ex: 0.15s) + Flash sutil na tela
      this.activateHitstop(options?.hitstopSec ?? 0.15);
      this.flashOpacity = Math.max(this.flashOpacity, 0.34);
      this.flashColor = 'rgba(255, 244, 196, 1)';

      // 2. Screen Shake violento em X e Y por 0.3s
      this.triggerScreenShake(0.3, 0.52 * Math.min(1.25, clampedForce), 0.44 * Math.min(1.25, clampedForce));

      // 3. Audio Ducking por 0.5s para o impacto dominar o mix
      this.audio.duckMusic(0.5, 0.14, 420);
      this.audio.playPerfectHit();

      // 4. Voz anime e explosão da torcida
      if (options?.characterId) {
        this.audio.playAnimeVoice('spike', options.characterId);
      }
      this.crowdExcitement = Math.min(1.2, this.crowdExcitement + 0.65);
      this.audio.triggerCrowdRoar(1.05);
      return;
    }

    // Impacto normal/forte
    this.audio.playImpactByForce(clampedForce, { isPerfect: false, isFoot: options?.isFoot });
    if (clampedForce >= 0.75) {
      this.triggerScreenShake(0.2, 0.24 * clampedForce, 0.18 * clampedForce);
      this.flashOpacity = Math.max(this.flashOpacity, 0.14);
      this.flashColor = 'rgba(255, 255, 255, 1)';
      if (options?.characterId) {
        this.audio.playAnimeVoice('spike', options.characterId);
      }
      this.crowdExcitement = Math.min(1.0, this.crowdExcitement + 0.32);
    } else {
      this.triggerScreenShake(0.12, 0.08 * clampedForce, 0.06 * clampedForce);
    }
  }

  public triggerReceive(force: number, options?: { isPerfect?: boolean }): void {
    const isPerfect = Boolean(options?.isPerfect);
    this.audio.playImpactByForce(clamp(force, 0.2, 0.75), { isReceive: true, isPerfect: false });
    this.triggerScreenShake(0.12, isPerfect ? 0.1 : 0.06, isPerfect ? 0.08 : 0.05);
    if (isPerfect) {
      this.flashOpacity = Math.max(this.flashOpacity, 0.12);
      this.flashColor = 'rgba(186, 230, 253, 1)';
      this.crowdExcitement = Math.min(1.0, this.crowdExcitement + 0.25);
      if (this.rallyDurationSec > 4.5) {
        // Defesa difícil em rally longo anima a torcida
        this.audio.triggerCrowdRoar(0.75);
      }
    }
  }

  public triggerGuardBreak(): void {
    this.activateHitstop(0.18);
    this.triggerScreenShake(0.3, 0.62, 0.52);
    this.flashOpacity = Math.max(this.flashOpacity, 0.42);
    this.flashColor = 'rgba(244, 63, 94, 1)';
    this.audio.duckMusic(0.5, 0.12, 340);
    this.audio.playGuardBreak();
    this.audio.triggerCrowdRoar(1.15);
  }

  public triggerShadowExplosion(power = 1.0): void {
    const clamped = clamp(power, 0.7, 1.4);
    this.activateHitstop(0.14);
    this.flashColor = 'rgba(15, 6, 32, 1)';
    this.flashOpacity = Math.max(this.flashOpacity, 0.56);
    this.triggerScreenShake(0.3, 0.58 * clamped, 0.48 * clamped);
    this.audio.duckMusic(0.5, 0.12, 320);
    this.audio.playPerfectHit();
    this.crowdExcitement = Math.min(1.25, this.crowdExcitement + 0.7);
    this.audio.triggerCrowdRoar(1.15);
  }

  private emitShoeSqueak(intensity: number, isHardStop: boolean): void {
    if (this.audio.PlayRandomShoeSqueak) {
      this.audio.PlayRandomShoeSqueak(intensity, isHardStop);
    } else if (this.audio.playShoeSqueak) {
      this.audio.playShoeSqueak(intensity, isHardStop);
    } else if (this.audio.playCourtShoeSqueak) {
      this.audio.playCourtShoeSqueak(intensity, isHardStop);
    } else {
      this.audio.playSandFootstep(intensity);
    }
  }

  public triggerSandDive(): void {
    this.emitShoeSqueak(0.95, true);
    this.diveSqueakCooldown = 0.16;
    this.audio.playSandSlideDive();
    this.triggerScreenShake(0.14, 0.09, 0.08);
  }

  public triggerBump(force = 0.45, isPerfect = false): void {
    this.emitShoeSqueak(clamp(0.58 + force * 0.42, 0.55, 1.05), force >= 0.45);
    this.diveSqueakCooldown = 0.16;
    this.audio.playMancheteBump?.();
    this.triggerReceive(force, { isPerfect });
  }

  public triggerSet(): void {
    this.audio.playOverheadSet?.();
    this.triggerScreenShake(0.08, 0.03, 0.03);
  }

  public triggerCourtFloorSlam(intensity = 1.0): void {
    this.audio.playCourtFloorSlam?.(intensity);
    this.triggerScreenShake(0.18, 0.14 * intensity, 0.22 * intensity);
  }

  public triggerJump(characterId: CharacterId, isHighJump = false): void {
    this.emitShoeSqueak(0.9, true);
    if (isHighJump) {
      this.audio.playAnimeVoice('jump', characterId);
    }
  }

  public triggerPointScored(scoringCharacterId?: CharacterId, wasLongRally = false): void {
    if (scoringCharacterId) {
      this.audio.playAnimeVoice('celebrate', scoringCharacterId);
    }
    this.audio.triggerCrowdRoar(wasLongRally || this.rallyDurationSec > 6 ? 1.35 : 0.95);
    this.crowdExcitement = 1.0;
    this.rallyDurationSec = 0;
  }

  public triggerScreenShake(durationSec: number, amplitudeX: number, amplitudeY: number): void {
    this.shakeDuration = Math.max(0.05, durationSec);
    this.shakeTimer = Math.max(this.shakeTimer, this.shakeDuration);
    this.shakeStrengthX = Math.max(this.shakeStrengthX, amplitudeX);
    this.shakeStrengthY = Math.max(this.shakeStrengthY, amplitudeY);
  }

  public updateCourtFootsteps(
    dt: number,
    horizontalSpeed: number,
    isGrounded: boolean,
    prevHorizontalSpeed = horizontalSpeed,
    isDirectionChange = false,
    actionState?: PlayerActionState,
  ): void {
    this.hardStopCooldown = Math.max(0, this.hardStopCooldown - dt);
    this.diveSqueakCooldown = Math.max(0, this.diveSqueakCooldown - dt);

    // 3. Início da animação de "Peixinho" (Slide/Manchete com mergulho) via Máquina de Estados
    if (
      actionState === 'slide_dive' &&
      this.lastLocalActionState !== 'slide_dive' &&
      this.diveSqueakCooldown <= 0
    ) {
      this.diveSqueakCooldown = 0.22;
      this.footstepTimer = Math.max(this.footstepTimer, 0.22);
      this.emitShoeSqueak(0.95, true);
    }
    if (actionState) {
      this.lastLocalActionState = actionState;
    }

    // 1 e 2. Freada brusca (velocidade caindo de alto para próximo de zero) ou mudança rápida de direção (eixo X)
    const isHardStop = prevHorizontalSpeed >= 3.6 && horizontalSpeed <= 1.65;
    if (isGrounded && (isHardStop || isDirectionChange) && this.hardStopCooldown <= 0) {
      this.hardStopCooldown = 0.2;
      this.footstepTimer = Math.max(this.footstepTimer, 0.18);
      this.emitShoeSqueak(0.96, true);
    }

    if (!isGrounded || horizontalSpeed < 2.0 || actionState === 'slide_dive') {
      this.footstepTimer = 0.08;
      return;
    }
    this.footstepTimer -= dt;
    if (this.footstepTimer <= 0) {
      const cadence = clamp(0.4 - horizontalSpeed * 0.022, 0.17, 0.34);
      this.footstepTimer = cadence;
      const intensity = clamp(horizontalSpeed / 9.5, 0.35, 0.95);
      this.emitShoeSqueak(intensity, false);
    }
  }

  public updateAiMovementSqueaks(
    players: ReadonlyArray<{
      id: string;
      isAi?: boolean;
      vx: number;
      vz: number;
      y: number;
      actionState: PlayerActionState;
    }>,
    dt: number,
    localPlayerId?: string,
  ): void {
    for (const p of players) {
      if (localPlayerId && p.id === localPlayerId) continue;
      const curSpeed = Math.hypot(p.vx, p.vz);
      const isGrounded = p.y <= 0.05;
      let rec = this.aiMotionMap.get(p.id);
      if (!rec) {
        rec = { prevSpeed: curSpeed, prevVx: p.vx, prevActionState: p.actionState, cooldown: 0 };
        this.aiMotionMap.set(p.id, rec);
        continue;
      }

      rec.cooldown = Math.max(0, rec.cooldown - dt);
      const isHardStop = isGrounded && rec.prevSpeed >= 3.8 && curSpeed <= 1.55;
      const isDirectionChange =
        isGrounded &&
        Math.abs(rec.prevVx) >= 2.4 &&
        Math.abs(p.vx) >= 2.0 &&
        Math.sign(rec.prevVx) !== Math.sign(p.vx);
      const enteredDive =
        p.actionState === 'slide_dive' &&
        rec.prevActionState !== 'slide_dive' &&
        this.diveSqueakCooldown <= 0;

      if ((isHardStop || isDirectionChange || enteredDive) && rec.cooldown <= 0) {
        rec.cooldown = 0.32;
        if (enteredDive) this.diveSqueakCooldown = 0.2;
        this.emitShoeSqueak(0.78, true);
      }

      rec.prevSpeed = curSpeed;
      rec.prevVx = p.vx;
      rec.prevActionState = p.actionState;
    }
  }

  public updateSandFootsteps(dt: number, horizontalSpeed: number, isGrounded: boolean): void {
    this.updateCourtFootsteps(dt, horizontalSpeed, isGrounded, horizontalSpeed);
  }

  public updateCrowdForRally(dt: number, isRallyActive: boolean, isPointFreeze: boolean): void {
    if (isRallyActive) {
      this.rallyDurationSec += dt;
      this.crowdExcitement = Math.max(0, this.crowdExcitement - dt * 0.18);
    } else if (!isPointFreeze) {
      this.rallyDurationSec = Math.max(0, this.rallyDurationSec - dt * 2.0);
      this.crowdExcitement = Math.max(0, this.crowdExcitement - dt * 0.5);
    }

    this.crowdUpdateAccum += dt;
    if (this.crowdUpdateAccum >= 0.15) {
      this.crowdUpdateAccum = 0;
      this.audio.updateCrowdAmbience(this.rallyDurationSec, this.crowdExcitement);
    }
  }

  /**
   * Atualiza Foco Duplo, Zoom Contextual de FOV, Screen Shake X/Y, Hitstop e Flash na tela.
   */
  public updateCameraAndFeel(dt: number, elapsed: number, ctx: CameraFeelContext): CameraFeelOutput {
    if (this.hitstopTimer > 0) {
      if (
        !Number.isFinite(this.hitstopTimer) ||
        (this.hitstopRealDeadlineMs > 0 && Date.now() >= this.hitstopRealDeadlineMs)
      ) {
        this.hitstopTimer = 0;
        this.hitstopRealDeadlineMs = 0;
      } else {
        const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0;
        this.hitstopTimer = Math.max(0, this.hitstopTimer - safeDt);
        if (this.hitstopTimer <= 0) {
          this.hitstopRealDeadlineMs = 0;
        }
      }
    }
    if (this.flashOpacity > 0) {
      this.flashOpacity = Math.max(0, this.flashOpacity - dt * 2.4);
    }
    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
      if (this.shakeTimer <= 0) {
        this.shakeStrengthX = 0;
        this.shakeStrengthY = 0;
      }
    }

    const baseFov =
      ctx.aspect < 1
        ? clamp(this.baseFovDesktop / Math.pow(Math.max(0.38, ctx.aspect), 0.46), 23, 44)
        : this.baseFovDesktop;
    const portraitPull = ctx.aspect < 1 ? (1 - ctx.aspect) * 16 : 0;

    if (ctx.isShowcase) {
      const targetCamX = Math.sin(elapsed * 0.25) * 4.2;
      const targetCamY = 5.4 + portraitPull * 0.24 + Math.cos(elapsed * 0.18) * 0.35;
      const targetCamZ = 28.0 + portraitPull * 1.25;
      const damp = 1 - Math.exp(-this.cameraTrackSpeed * dt);
      this.currentCamX = lerp(this.currentCamX, targetCamX, damp);
      this.currentCamY = lerp(this.currentCamY, targetCamY, damp);
      this.currentCamZ = lerp(this.currentCamZ, targetCamZ, damp);
      this.currentLookX = lerp(this.currentLookX, 0, damp);
      this.currentLookY = lerp(this.currentLookY, 1.65, damp);
      this.currentLookZ = lerp(this.currentLookZ, 0, damp);
      this.currentFov = lerp(this.currentFov, baseFov, damp);
    } else {
      // 1. Foco Duplo lateral estrito (ponto médio ponderado no plano 2D X/Y)
      const distPlayerBall = Math.hypot(
        ctx.ballPos.x - ctx.activePlayerPos.x,
        ctx.ballPos.y - ctx.activePlayerPos.y,
        ctx.ballPos.z - ctx.activePlayerPos.z,
      );
      const isAttackingApex =
        ctx.activePlayerPos.y > 0.55 &&
        distPlayerBall < 3.6 &&
        (ctx.activePlayerState === 'airborne' ||
          ctx.activePlayerState === 'attack_windup' ||
          ctx.activePlayerState === 'serve' ||
          ctx.activePlayerState === 'spike' ||
          ctx.activePlayerState === 'shark_attack' ||
          ctx.activePlayerState === 'header');

      const midX = ctx.ballPos.x * 0.56 + ctx.activePlayerPos.x * 0.44;
      const midY = ctx.ballPos.y * 0.45 + ctx.activePlayerPos.y * 0.55;

      // 2. Zoom Contextual (FOV):
      // - Zoom Out no saque ou levantamento de Bola Alta para mostrar toda a quadra expandida de 20m
      // - Zoom In dramático no ápice do salto do atacante
      const ballSpeed = Math.hypot(ctx.ballVel.x, ctx.ballVel.y, ctx.ballVel.z);
      const isHighSetOrServe = ctx.phase === 'serve_wait' || (ctx.ballPos.y > 3.2 && ballSpeed < 19);

      let targetFov = baseFov;
      let distanceBiasZ = 0;
      if (isAttackingApex) {
        targetFov = baseFov + this.zoomInFovOffset;
        distanceBiasZ = -3.4;
      } else if (isHighSetOrServe) {
        targetFov = baseFov + this.zoomOutFovOffset;
        distanceBiasZ = ctx.phase === 'serve_wait' ? 5.8 : 3.6;
      }

      const targetCamX = clamp(midX * 0.36, -2.6, 2.6);
      const targetCamY = 5.8 + portraitPull * 0.28 + clamp(midY * 0.2, -0.3, 1.45) + (isAttackingApex ? -0.6 : 0);
      const targetCamZ = 30.2 + portraitPull * 1.35 + distanceBiasZ;

      const targetLookX = clamp(midX * 0.32, -2.4, 2.4);
      const targetLookY = clamp(1.35 + midY * 0.24, 1.35, 2.55);
      const targetLookZ = 0;

      const camDamp = 1 - Math.exp(-this.cameraTrackSpeed * dt);
      const fovDamp = 1 - Math.exp(-(isAttackingApex ? this.fovTrackSpeed * 1.45 : this.fovTrackSpeed) * dt);

      this.currentCamX = lerp(this.currentCamX, targetCamX, camDamp);
      this.currentCamY = lerp(this.currentCamY, targetCamY, camDamp);
      this.currentCamZ = lerp(this.currentCamZ, targetCamZ, camDamp);
      this.currentLookX = lerp(this.currentLookX, targetLookX, camDamp);
      this.currentLookY = lerp(this.currentLookY, targetLookY, camDamp);
      this.currentLookZ = lerp(this.currentLookZ, targetLookZ, camDamp);
      this.currentFov = lerp(this.currentFov, targetFov, fovDamp);
    }

    // 3. Screen Shake Escalonado (eixos X e Y decaindo suavemente)
    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeTimer > 0) {
      const decay = this.shakeTimer / this.shakeDuration;
      const env = decay * decay;
      shakeX = Math.sin(elapsed * 68) * this.shakeStrengthX * env;
      shakeY = Math.cos(elapsed * 83) * this.shakeStrengthY * env;
    }

    this._output.position.x = this.currentCamX;
    this._output.position.y = this.currentCamY;
    this._output.position.z = this.currentCamZ;
    this._output.lookAt.x = this.currentLookX;
    this._output.lookAt.y = this.currentLookY;
    this._output.lookAt.z = this.currentLookZ;
    this._output.fov = this.currentFov;
    this._output.shakeOffset.x = shakeX;
    this._output.shakeOffset.y = shakeY;
    this._output.shakeOffset.z = 0;
    this._output.flashOpacity = this.flashOpacity;
    this._output.flashColor = this.flashColor;
    this._output.isHitstopActive = this.hitstopTimer > 0;
    return this._output;
  }

  public getHitstopRemaining(): number {
    return this.hitstopTimer;
  }

  public getFlashState(): { opacity: number; color: string } {
    return { opacity: this.flashOpacity, color: this.flashColor };
  }

  public getRallyDurationSec(): number {
    return this.rallyDurationSec;
  }
}
