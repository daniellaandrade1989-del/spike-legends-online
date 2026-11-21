/**
 * Spike Legends Online — Sistema de Efeitos Visuais em Pool (Zero GC no Render Loop)
 * Partículas em InstancedMesh ring-buffer, rastro da bola, tremor de câmera (trauma²) e cores Ultimate.
 */
import * as THREE from 'three';
import type { UltimateType } from '../config/gameConfig';

const MAX_PARTICLES = 200;
const TRAIL_LENGTH = 16;
const SPEED_LINE_COUNT = 18;

interface ParticleSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
  color: THREE.Color;
}

const ULTIMATE_COLORS: Record<UltimateType, number> = {
  super_spike: 0xfacc15,
  lightning_spike: 0x38bdf8,
  freeze_ball: 0x67e8f9,
  fire_ball: 0xf97316,
  wind_ball: 0x34d399,
};

export class VfxSystem {
  private instancedParticles: THREE.InstancedMesh;
  private particles: ParticleSlot[] = [];
  private cursor = 0;

  private trailMeshes: THREE.Mesh[] = [];
  private trailPositions: THREE.Vector3[] = [];
  private trailTimer = 0;

  private shockRing: THREE.Mesh;
  private shockTimer = 0;
  private shadowFlashSphere: THREE.Mesh;
  private shadowRingOuter: THREE.Mesh;
  private shadowTimer = 0;
  private shadowTrailActive = false;

  private speedLines: THREE.LineSegments;
  private speedLinePositions: Float32Array;
  private readonly _prevBallPos = new THREE.Vector3(0, 1.5, 0);
  private _hasPrevBall = false;
  private _ballDirX = 1;
  private _ballDirY = 0;

  private trauma = 0;

  // Scratch objects (zero alocação no tick)
  private readonly _dummy = new THREE.Object3D();
  private readonly _color = new THREE.Color();

  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const pGeo = new THREE.OctahedronGeometry(0.14, 0);
    const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.instancedParticles = new THREE.InstancedMesh(pGeo, pMat, MAX_PARTICLES);
    this.instancedParticles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.instancedParticles.frustumCulled = false;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -50,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        scale: 0,
        color: new THREE.Color(0xffffff),
      });
      this._dummy.position.set(0, -50, 0);
      this._dummy.scale.setScalar(0.001);
      this._dummy.updateMatrix();
      this.instancedParticles.setMatrixAt(i, this._dummy.matrix);
      this.instancedParticles.setColorAt(i, this._color);
    }
    scene.add(this.instancedParticles);

    // Rastro da bola pré-alocado (16 segmentos com taper suave)
    const trailGeo = new THREE.SphereGeometry(0.2, 10, 8);
    for (let i = 0; i < TRAIL_LENGTH; i++) {
      const m = new THREE.Mesh(
        trailGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfacc15,
          transparent: true,
          opacity: ((TRAIL_LENGTH - i) / TRAIL_LENGTH) * 0.48,
          depthWrite: false,
        }),
      );
      m.visible = false;
      scene.add(m);
      this.trailMeshes.push(m);
      this.trailPositions.push(new THREE.Vector3(0, -20, 0));
    }

    // Onda de choque de impacto padrão
    this.shockRing = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.55, 24),
      new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    );
    this.shockRing.visible = false;
    scene.add(this.shockRing);

    // Esfera escura explosiva (Shadow Explosion)
    this.shadowFlashSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0x090514,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
      }),
    );
    this.shadowFlashSphere.visible = false;
    scene.add(this.shadowFlashSphere);

    // Anel externo de distorção sombria (violeta/carmesim)
    this.shadowRingOuter = new THREE.Mesh(
      new THREE.RingGeometry(0.52, 0.85, 28),
      new THREE.MeshBasicMaterial({
        color: 0x7c3aed,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
      }),
    );
    this.shadowRingOuter.visible = false;
    scene.add(this.shadowRingOuter);

    // Linhas de velocidade direcionais pré-alocadas (zero GC no loop)
    this.speedLinePositions = new Float32Array(SPEED_LINE_COUNT * 2 * 3);
    const lineGeo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(this.speedLinePositions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    lineGeo.setAttribute('position', posAttr);
    this.speedLines = new THREE.LineSegments(
      lineGeo,
      new THREE.LineBasicMaterial({
        color: 0xc084fc,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    this.speedLines.frustumCulled = false;
    this.speedLines.visible = false;
    scene.add(this.speedLines);
  }

  public addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  public getShakeOffset(time: number, out: THREE.Vector3): void {
    const shake = this.trauma * this.trauma;
    if (shake < 0.001) {
      out.set(0, 0, 0);
      return;
    }
    out.set(
      Math.sin(time * 53) * shake * 0.45,
      Math.cos(time * 67) * shake * 0.35,
      Math.sin(time * 41) * shake * 0.25,
    );
  }

  public spawnBurst(
    x: number,
    y: number,
    z: number,
    count: number,
    hexColor: number,
    speed = 5.5,
    scale = 1,
  ): void {
    for (let i = 0; i < count; i++) {
      const slot = this.particles[this.cursor];
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.75;
      const spd = speed * (0.45 + Math.random() * 0.8);

      slot.active = true;
      slot.x = x;
      slot.y = y;
      slot.z = z;
      slot.vx = Math.cos(theta) * Math.sin(phi) * spd;
      slot.vy = Math.cos(phi) * spd + 1.5;
      slot.vz = Math.sin(theta) * Math.sin(phi) * spd;
      slot.life = 0;
      slot.maxLife = 0.28 + Math.random() * 0.28;
      slot.scale = scale * (0.65 + Math.random() * 0.7);
      slot.color.setHex(hexColor);
    }
  }

  public triggerSpikeShockwave(
    x: number,
    y: number,
    z: number,
    ultimateType?: UltimateType,
    power = 1,
  ): void {
    const isHeavyImpact = power >= 0.8 || Boolean(ultimateType);
    const color = ultimateType ? ULTIMATE_COLORS[ultimateType] : isHeavyImpact ? 0xf97316 : 0x38bdf8;
    this.spawnBurst(x, y, z, ultimateType ? 32 : isHeavyImpact ? 24 : 12, color, 8.2 * Math.max(0.8, power), isHeavyImpact ? 1.45 : 0.95);
    // Screen Shake acoplado a impactos onde a força ultrapassa 80%
    if (isHeavyImpact) {
      this.addTrauma(ultimateType ? 0.8 : Math.min(0.95, 0.45 * power));
    }

    this.shockRing.position.set(x, y, z);
    this.shockRing.lookAt(x + (x < 0 ? 1 : -1), y, z);
    (this.shockRing.material as THREE.MeshBasicMaterial).color.setHex(color);
    this.shockRing.scale.setScalar(0.55);
    this.shockRing.visible = true;
    this.shockTimer = isHeavyImpact ? 0.34 : 0.22;
  }

  /**
   * Explosão Visual Sombria para Ataques Forçados (Corte Perfeito / Saque Viagem / Super Attack).
   * Dispara esfera sombria expansiva, onda de distorção dupla, partículas obsidiana/violeta/carmesim
   * e ativa o rastro de cometa sombrio + linhas de velocidade contínuas até a defesa/chão.
   */
  public TriggerShadowExplosion(x: number, y: number, z: number, dirX = 1, power = 1): void {
    this.shadowTrailActive = true;
    this._ballDirX = dirX >= 0 ? 1 : -1;
    this._ballDirY = -0.18;

    // Semeia posições do rastro no ponto da explosão para evitar salto visual do frame anterior
    for (let i = 0; i < TRAIL_LENGTH; i++) {
      this.trailPositions[i].set(x - this._ballDirX * i * 0.09, y, z);
    }

    // Esfera de impacto sombrio + anel de distorção secundário
    this.shadowFlashSphere.position.set(x, y, z);
    this.shadowFlashSphere.scale.setScalar(0.6);
    (this.shadowFlashSphere.material as THREE.MeshBasicMaterial).opacity = 0.88;
    this.shadowFlashSphere.visible = true;

    this.shadowRingOuter.position.set(x, y, z);
    this.shadowRingOuter.lookAt(x + this._ballDirX, y, z);
    this.shadowRingOuter.scale.setScalar(0.7);
    (this.shadowRingOuter.material as THREE.MeshBasicMaterial).opacity = 0.92;
    this.shadowRingOuter.visible = true;

    this.shockRing.position.set(x, y, z);
    this.shockRing.lookAt(x + this._ballDirX, y, z);
    (this.shockRing.material as THREE.MeshBasicMaterial).color.setHex(0xe11d48);
    this.shockRing.scale.setScalar(0.65);
    this.shockRing.visible = true;
    this.shockTimer = 0.34;
    this.shadowTimer = 0.42;

    // Explosão radial multi-camada: Obsidiana + Roxo Sombrio + Carmesim
    const speedScale = Math.max(0.85, power);
    this.spawnBurst(x, y, z, 26, 0x090514, 9.5 * speedScale, 1.65);
    this.spawnBurst(x, y, z, 22, 0x581c87, 10.8 * speedScale, 1.45);
    this.spawnBurst(x, y, z, 14, 0xe11d48, 8.2 * speedScale, 1.15);

    this.addTrauma(Math.min(1.0, 0.85 * speedScale));
  }

  public setShadowTrailActive(active: boolean): void {
    this.shadowTrailActive = active;
    if (!active) {
      this.speedLines.visible = false;
    }
  }

  public isShadowTrailActive(): boolean {
    return this.shadowTrailActive;
  }

  private customTrailHex: number | null = null;

  public setCustomTrailColor(hexString?: string): void {
    if (!hexString) {
      this.customTrailHex = null;
      return;
    }
    try {
      const c = new THREE.Color(hexString);
      this.customTrailHex = c.getHex();
    } catch {
      this.customTrailHex = null;
    }
  }

  public update(dt: number, ballX: number, ballY: number, ballZ: number, ballSpeed: number, activeUlt: UltimateType | null): void {
    this.trauma = Math.max(0, this.trauma - dt * 2.2);

    if (this._hasPrevBall && dt > 0.0005) {
      const dx = ballX - this._prevBallPos.x;
      const dy = ballY - this._prevBallPos.y;
      const len = Math.hypot(dx, dy);
      if (len > 0.01) {
        this._ballDirX = dx / len;
        this._ballDirY = dy / len;
      }
    }
    this._prevBallPos.set(ballX, ballY, ballZ);
    this._hasPrevBall = true;

    // Atualiza onda de choque / distorção de ar
    if (this.shockTimer > 0) {
      this.shockTimer = Math.max(0, this.shockTimer - dt);
      const t = 1 - this.shockTimer / 0.34;
      this.shockRing.scale.setScalar(0.55 + t * 4.4);
      (this.shockRing.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.9;
      if (this.shockTimer <= 0) this.shockRing.visible = false;
    }

    // Atualiza esfera e anel sombrio da Shadow Explosion
    if (this.shadowTimer > 0) {
      this.shadowTimer = Math.max(0, this.shadowTimer - dt);
      const t = 1 - this.shadowTimer / 0.42;
      this.shadowFlashSphere.scale.setScalar(0.6 + t * 3.8);
      (this.shadowFlashSphere.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (1 - t) * 0.85);
      this.shadowRingOuter.scale.setScalar(0.7 + t * 5.6);
      (this.shadowRingOuter.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (1 - t) * 0.92);
      if (this.shadowTimer <= 0) {
        this.shadowFlashSphere.visible = false;
        this.shadowRingOuter.visible = false;
      }
    }

    // Atualiza rastro colorido ou cometa sombrio da bola em alta velocidade
    this.trailTimer += dt;
    if (this.trailTimer >= 0.016) {
      this.trailTimer = 0;
      for (let i = TRAIL_LENGTH - 1; i > 0; i--) {
        this.trailPositions[i].copy(this.trailPositions[i - 1]);
      }
      this.trailPositions[0].set(ballX, ballY, ballZ);
    }

    const showTrail = this.shadowTrailActive || ballSpeed > 7.5 || activeUlt !== null;
    const defaultTrailColor = activeUlt
      ? ULTIMATE_COLORS[activeUlt]
      : this.customTrailHex !== null
        ? this.customTrailHex
        : ballSpeed > 15
          ? 0xf97316
          : ballSpeed > 11.5
            ? 0xfacc15
            : 0x38bdf8;
    for (let i = 0; i < TRAIL_LENGTH; i++) {
      const m = this.trailMeshes[i];
      m.visible = showTrail;
      if (showTrail) {
        m.position.copy(this.trailPositions[i]);
        const frac = 1 - i / TRAIL_LENGTH;
        const baseScale = this.shadowTrailActive ? 1.55 : activeUlt || ballSpeed > 15 ? 1.25 : 0.95;
        m.scale.setScalar(Math.max(0.14, frac) * baseScale);
        const mat = m.material as THREE.MeshBasicMaterial;
        if (this.shadowTrailActive) {
          const shadowHex =
            i < 3
              ? 0x020617
              : i < 8
                ? (this.customTrailHex ?? 0x3b0764)
                : i < 12
                  ? (this.customTrailHex ?? 0x7c3aed)
                  : 0xe11d48;
          mat.color.setHex(shadowHex);
          mat.opacity = frac * 0.76;
        } else {
          mat.color.setHex(defaultTrailColor);
          mat.opacity = frac * 0.52;
        }
      }
    }

    // Atualiza linhas de velocidade direcionais durante ataque forçado sombrio
    if (this.shadowTrailActive) {
      const oppX = -this._ballDirX;
      const oppY = -this._ballDirY;
      const perpX = -oppY;
      const perpY = oppX;
      let offset = 0;
      for (let i = 0; i < SPEED_LINE_COUNT; i++) {
        const radial = ((i / (SPEED_LINE_COUNT - 1)) - 0.5) * 1.15;
        const zOff = Math.sin(i * 2.3) * 0.35;
        const leadDist = (i % 4) * 0.28;
        const streakLen = 1.25 + (i % 3) * 0.55;

        const sx = ballX + perpX * radial + oppX * leadDist;
        const sy = ballY + perpY * radial + oppY * leadDist;
        const sz = ballZ + zOff;

        this.speedLinePositions[offset++] = sx;
        this.speedLinePositions[offset++] = sy;
        this.speedLinePositions[offset++] = sz;
        this.speedLinePositions[offset++] = sx + oppX * streakLen;
        this.speedLinePositions[offset++] = sy + oppY * streakLen;
        this.speedLinePositions[offset++] = sz;
      }
      const attr = this.speedLines.geometry.getAttribute('position') as THREE.BufferAttribute;
      attr.needsUpdate = true;
      this.speedLines.visible = true;

      if (Math.random() < 0.75) {
        this.spawnBurst(ballX, ballY, ballZ, 1, Math.random() < 0.5 ? 0x090514 : 0x7c3aed, 3.2, 1.05);
      }
    } else {
      this.speedLines.visible = false;
      if (activeUlt && Math.random() < 0.55) {
        this.spawnBurst(ballX, ballY, ballZ, 1, ULTIMATE_COLORS[activeUlt], 2.2, 0.9);
      }
    }

    // Atualiza partículas em ring buffer
    let dirty = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      dirty = true;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        this._dummy.position.set(0, -50, 0);
        this._dummy.scale.setScalar(0.001);
        this._dummy.updateMatrix();
        this.instancedParticles.setMatrixAt(i, this._dummy.matrix);
        continue;
      }

      p.vy -= 14 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const ratio = 1 - p.life / p.maxLife;

      this._dummy.position.set(p.x, p.y, p.z);
      this._dummy.rotation.set(p.life * 6, p.life * 4, 0);
      this._dummy.scale.setScalar(p.scale * ratio);
      this._dummy.updateMatrix();
      this.instancedParticles.setMatrixAt(i, this._dummy.matrix);
      this.instancedParticles.setColorAt(i, p.color);
    }

    if (dirty) {
      this.instancedParticles.instanceMatrix.needsUpdate = true;
      if (this.instancedParticles.instanceColor) {
        this.instancedParticles.instanceColor.needsUpdate = true;
      }
    }
  }

  public dispose(): void {
    this.scene.remove(this.instancedParticles);
    this.scene.remove(this.shockRing);
    this.scene.remove(this.shadowFlashSphere);
    this.scene.remove(this.shadowRingOuter);
    this.scene.remove(this.speedLines);
    this.shadowFlashSphere.geometry.dispose();
    (this.shadowFlashSphere.material as THREE.Material).dispose();
    this.shadowRingOuter.geometry.dispose();
    (this.shadowRingOuter.material as THREE.Material).dispose();
    this.speedLines.geometry.dispose();
    (this.speedLines.material as THREE.Material).dispose();
    for (const m of this.trailMeshes) {
      this.scene.remove(m);
    }
  }
}
