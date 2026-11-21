/**
 * Spike Legends Online — Construtor Procedural de Quadra e Arenas Temáticas (Three.js)
 * Constrói piso com texturas procedurais (SRGBColorSpace + anisotropia), rede detalhada,
 * iluminação quente/fria com RoomEnvironment e cenário temático envolvente.
 */
import * as THREE from 'three';
import { COURT, PHYSICS, type ArenaId } from '../config/gameConfig';
import { ARENAS } from './arenas';
import { getOutlineMaterial, getToonGradientTexture } from '../characters/characterBuilder';

function createCourtTexture(
  floorColor: string,
  lineColor: string,
  accentColor: string,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;

  // Base da quadra anime de alta definição
  ctx.fillStyle = floorColor;
  ctx.fillRect(0, 0, w, h);

  // Tábuas longitudinais estilo ginásio de anime (Haikyuu / Shonen) com variação tonal cel-shaded
  const plankCount = 32;
  const plankH = h / plankCount;
  for (let i = 0; i < plankCount; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 255, 255, 0.065)' : 'rgba(7, 10, 18, 0.055)';
    ctx.fillRect(0, i * plankH, w, plankH);

    // Divisória fina ink entre tábuas
    ctx.fillStyle = 'rgba(7, 10, 18, 0.12)';
    ctx.fillRect(0, i * plankH, w, 2);
  }

  // Reflexo diagonal estilizado de holofote de estádio anime
  const spotGrad = ctx.createLinearGradient(w * 0.2, 0, w * 0.8, h);
  spotGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
  spotGrad.addColorStop(0.45, 'rgba(255, 255, 255, 0.08)');
  spotGrad.addColorStop(0.55, 'rgba(255, 255, 255, 0.11)');
  spotGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = spotGrad;
  ctx.fillRect(0, 0, w, h);

  // Zona de ataque central próxima à rede (3m de cada lado) com destaque anime
  ctx.save();
  ctx.fillStyle = accentColor;
  ctx.globalAlpha = 0.2;
  ctx.fillRect(732, 48, 584, 928);
  ctx.globalAlpha = 1;
  ctx.restore();

  // Contorno ink externo das linhas oficiais para nitidez máxima na câmera 2.5D
  ctx.strokeStyle = 'rgba(7, 10, 18, 0.65)';
  ctx.lineWidth = 34;
  ctx.strokeRect(48, 48, w - 96, h - 96);

  // Linhas oficiais principais de alto contraste
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 24;
  ctx.strokeRect(48, 48, w - 96, h - 96);

  // Linha central sob a rede
  ctx.strokeStyle = 'rgba(7, 10, 18, 0.65)';
  ctx.lineWidth = 28;
  ctx.beginPath();
  ctx.moveTo(w * 0.5, 48);
  ctx.lineTo(w * 0.5, h - 48);
  ctx.stroke();

  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 20;
  ctx.beginPath();
  ctx.moveTo(w * 0.5, 48);
  ctx.lineTo(w * 0.5, h - 48);
  ctx.stroke();

  // Linhas de ataque (3m da rede) com contorno ink
  for (const ax of [732, 1316]) {
    ctx.strokeStyle = 'rgba(7, 10, 18, 0.55)';
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.moveTo(ax, 48);
    ctx.lineTo(ax, h - 48);
    ctx.stroke();

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 15;
    ctx.beginPath();
    ctx.moveTo(ax, 48);
    ctx.lineTo(ax, h - 48);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

function createNetTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 512, 256);

  // Malha preta/escura externa + fio claro interno estilo anime HD
  ctx.strokeStyle = 'rgba(7, 10, 18, 0.85)';
  ctx.lineWidth = 7;
  for (let x = 0; x <= 512; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }
  for (let y = 0; y <= 256; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(248, 250, 252, 0.92)';
  ctx.lineWidth = 3.5;
  for (let x = 0; x <= 512; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }
  for (let y = 0; y <= 256; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(9, 2);
  return tex;
}

function createVolleyballTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Gomos tricolores vibrantes estilo bola oficial de anime (Amarelo Solar / Azul Royal / Branco)
  ctx.fillStyle = '#FACC15';
  ctx.fillRect(0, 0, 512, 256);

  ctx.fillStyle = '#1D4ED8';
  ctx.fillRect(0, 60, 512, 64);

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 170, 512, 56);

  // Costuras curvas estilo mangá com linha ink grossa
  ctx.strokeStyle = '#070A12';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(0, 60);
  ctx.lineTo(512, 60);
  ctx.moveTo(0, 124);
  ctx.lineTo(512, 124);
  ctx.moveTo(0, 170);
  ctx.lineTo(512, 170);
  ctx.moveTo(0, 226);
  ctx.lineTo(512, 226);
  for (const vx of [128, 256, 384]) {
    ctx.moveTo(vx, 0);
    ctx.lineTo(vx, 256);
  }
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

export interface BuiltArena {
  group: THREE.Group;
  ballMesh: THREE.Mesh;
  ballShadow: THREE.Mesh;
  landingMarker: THREE.Mesh;
  aimReticle: THREE.Mesh;
  updateCrowd?: (elapsed: number, exciteBoost: number) => void;
  dispose: () => void;
}

export function buildArenaScene(
  scene: THREE.Scene,
  arenaId: ArenaId,
  maxAnisotropy: number,
): BuiltArena {
  const theme = ARENAS[arenaId];
  const gradientMap = getToonGradientTexture();
  const group = new THREE.Group();

  scene.background = new THREE.Color(theme.skyBottom);
  scene.fog = new THREE.FogExp2(theme.fogColor, 0.014);

  // Chão estendido externo (para nunca parecer uma caixa flutuando no vazio)
  const outerGround = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 160),
    new THREE.MeshToonMaterial({ color: theme.outerFloorColor, gradientMap }),
  );
  outerGround.rotation.x = -Math.PI / 2;
  outerGround.position.y = -0.02;
  outerGround.receiveShadow = true;
  group.add(outerGround);

  // Quadra oficial Cel-Shaded Anime (offset +0.02 acima do chão externo para zero Z-fighting)
  const courtTex = createCourtTexture(
    theme.floorColor,
    theme.lineColor,
    theme.accentColor,
    maxAnisotropy,
  );
  const courtMat = new THREE.MeshStandardMaterial({
    map: courtTex,
    color: 0xffffff,
    roughness: 0.56,
    metalness: 0.06,
  });
  const courtMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(COURT.WIDTH, COURT.DEPTH),
    courtMat,
  );
  courtMesh.rotation.x = -Math.PI / 2;
  courtMesh.position.y = 0;
  courtMesh.receiveShadow = true;
  group.add(courtMesh);

  // Postes da rede + antenas listradas + fita superior e inferior com contorno anime
  const postMat = new THREE.MeshToonMaterial({ color: '#1E293B', gradientMap });
  const padMat = new THREE.MeshToonMaterial({ color: theme.accentColor, gradientMap });
  for (const zSign of [-1, 1]) {
    const zPos = zSign * (COURT.HALF_DEPTH + 0.45);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, COURT.NET_POST_HEIGHT, 14), postMat);
    post.position.set(0, COURT.NET_POST_HEIGHT / 2, zPos);
    post.castShadow = true;
    group.add(post);

    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.45, 14), padMat);
    pad.position.set(0, 0.75, zPos);
    group.add(pad);

    // Antena listrada oficial FIVB (vermelha e branca)
    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 1.05, 8),
      new THREE.MeshBasicMaterial({ color: '#EF4444' }),
    );
    antenna.position.set(0, COURT.NET_HEIGHT + 0.32, zSign * COURT.HALF_DEPTH);
    group.add(antenna);
  }

  // Fita superior e inferior da rede com acabamento Cel-Shaded
  const topTape = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.115, COURT.DEPTH + 0.7),
    new THREE.MeshToonMaterial({ color: theme.netColor, gradientMap }),
  );
  topTape.position.set(0, COURT.NET_HEIGHT, 0);
  topTape.castShadow = true;
  group.add(topTape);

  const bottomTape = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.07, COURT.DEPTH + 0.6),
    new THREE.MeshToonMaterial({ color: theme.accentColor, gradientMap }),
  );
  bottomTape.position.set(0, COURT.NET_HEIGHT - 1.18, 0);
  group.add(bottomTape);

  // Malha da rede HD
  const netTex = createNetTexture();
  const netMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 1.15, COURT.DEPTH + 0.5),
    new THREE.MeshBasicMaterial({
      map: netTex,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
    }),
  );
  netMesh.position.set(0, COURT.NET_HEIGHT - 0.62, 0);
  group.add(netMesh);

  // Decoração de entorno conforme o mapa (InstancedMesh / Grupos compostos)
  const crowdUpdater = addArenaEnvironmentProps(group, arenaId, gradientMap, theme.accentColor);

  // Bola de vôlei estilizada HD com contorno ink
  const ballTex = createVolleyballTexture();
  const ballMat = new THREE.MeshToonMaterial({
    map: ballTex,
    color: 0xffffff,
    gradientMap,
  });
  const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(PHYSICS.BALL_RADIUS, 24, 18), ballMat);
  ballMesh.castShadow = true;
  const ballOutline = new THREE.Mesh(
    new THREE.SphereGeometry(PHYSICS.BALL_RADIUS, 20, 16),
    getOutlineMaterial(),
  );
  ballOutline.scale.setScalar(1.065);
  ballMesh.add(ballOutline);
  group.add(ballMesh);

  // Sombra de contato da bola no chão
  const ballShadow = new THREE.Mesh(
    new THREE.CircleGeometry(PHYSICS.BALL_RADIUS * 1.35, 20),
    new THREE.MeshBasicMaterial({ color: 0x090d16, transparent: true, opacity: 0.42, depthWrite: false }),
  );
  ballShadow.rotation.x = -Math.PI / 2;
  ballShadow.position.y = 0.014;
  group.add(ballShadow);

  // Marcador de ponto de queda no chão (ajuda leitura 3D)
  const landingMarker = new THREE.Mesh(
    new THREE.RingGeometry(0.32, 0.46, 24),
    new THREE.MeshBasicMaterial({
      color: theme.accentColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    }),
  );
  landingMarker.rotation.x = -Math.PI / 2;
  landingMarker.position.y = 0.02;
  group.add(landingMarker);

  // Retícula de mira exata do ataque pelo cursor do mouse (ScreenToWorldPoint)
  const aimReticle = new THREE.Mesh(
    new THREE.RingGeometry(0.24, 0.35, 24),
    new THREE.MeshBasicMaterial({
      color: 0xef4444,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    }),
  );
  const aimCenterDot = new THREE.Mesh(
    new THREE.CircleGeometry(0.08, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    }),
  );
  aimReticle.add(aimCenterDot);
  aimReticle.rotation.x = -Math.PI / 2;
  aimReticle.position.set(4.5, 0.04, 0);
  aimReticle.visible = false;
  group.add(aimReticle);

  scene.add(group);

  return {
    group,
    ballMesh,
    ballShadow,
    landingMarker,
    aimReticle,
    updateCrowd: crowdUpdater,
    dispose: () => {
      scene.remove(group);
      courtTex.dispose();
      netTex.dispose();
      ballTex.dispose();
    },
  };
}

function addArenaEnvironmentProps(
  group: THREE.Group,
  arenaId: ArenaId,
  gradientMap: THREE.DataTexture,
  accentColor: string,
): ((elapsed: number, exciteBoost: number) => void) | undefined {
  const darkMat = new THREE.MeshToonMaterial({ color: '#1E293B', gradientMap });
  const trimMat = new THREE.MeshToonMaterial({ color: accentColor, gradientMap });

  if (arenaId === 'ginasio' || arenaId === 'neon') {
    // Paredes de fundo do ginásio para enquadrar toda a largura da câmera anime
    const wallMat = new THREE.MeshToonMaterial({
      color: arenaId === 'neon' ? '#090D16' : '#1E293B',
      gradientMap,
    });
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(76, 14, 0.8), wallMat);
    backWall.position.set(0, 6.8, -15.5);
    group.add(backWall);

    // Faixa luminosa superior e placar suspenso visíveis acima das arquibancadas
    const stripMat = new THREE.MeshBasicMaterial({
      color: arenaId === 'neon' ? '#22D3EE' : '#F59E0B',
      transparent: true,
      opacity: 0.45,
    });
    const topStrip = new THREE.Mesh(new THREE.BoxGeometry(70, 0.16, 0.3), stripMat);
    topStrip.position.set(0, 8.6, -14.9);
    group.add(topStrip);

    const jumbotron = new THREE.Mesh(new THREE.BoxGeometry(7.2, 2.0, 0.5), darkMat);
    jumbotron.position.set(0, 4.9, -14.4);
    group.add(jumbotron);
    const screenGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(6.3, 1.3),
      new THREE.MeshBasicMaterial({ color: accentColor, transparent: true, opacity: 0.38 }),
    );
    screenGlow.position.set(0, 4.9, -14.12);
    group.add(screenGlow);

    // Arquibancada de fundo com torcedores estilo personagem anime chibi (sem obstruir a visão lateral frontal)
    for (let step = 0; step < 3; step++) {
      const tier = new THREE.Mesh(new THREE.BoxGeometry(26, 0.65, 1.3), darkMat);
      tier.position.set(0, 0.32 + step * 0.65, -(7.8 + step * 1.2));
      tier.receiveShadow = true;
      group.add(tier);
    }

    const crowdCount = 48;
    const jerseyPalette = [0xf97316, 0x38bdf8, 0xfacc15, 0xec4899, 0x34d399, 0xa855f7];
    const skinPalette = [0xfde2c8, 0xfad4b8, 0xf1c27d, 0xd9a074];
    const hairPalette = [0x0f172a, 0x1e293b, 0x3b82f6, 0xf472b6, 0xf59e0b, 0x7c2d12, 0xe2e8f0];

    const torsoGeo = new THREE.CylinderGeometry(0.18, 0.21, 0.38, 10);
    const headGeo = new THREE.SphereGeometry(0.27, 12, 10);
    const hairGeo = new THREE.SphereGeometry(0.295, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6);
    const eyeGeo = new THREE.SphereGeometry(0.048, 8, 8);
    const armGeo = new THREE.CapsuleGeometry(0.052, 0.19, 4, 6);
    const outlineGeo = new THREE.SphereGeometry(0.29, 10, 8);

    const toonWhiteMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap });
    const eyeDarkMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });

    const torsoInst = new THREE.InstancedMesh(torsoGeo, toonWhiteMat, crowdCount);
    const headInst = new THREE.InstancedMesh(headGeo, toonWhiteMat, crowdCount);
    const hairInst = new THREE.InstancedMesh(hairGeo, toonWhiteMat, crowdCount);
    const outlineInst = new THREE.InstancedMesh(outlineGeo, getOutlineMaterial(), crowdCount);
    const eyeInst = new THREE.InstancedMesh(eyeGeo, eyeDarkMat, crowdCount * 2);
    const armInst = new THREE.InstancedMesh(armGeo, toonWhiteMat, crowdCount * 2);

    const slots: Array<{ x: number; baseY: number; z: number; scale: number; phase: number }> = [];
    const tmpColor = new THREE.Color();
    let idx = 0;

    for (let step = 0; step < 3; step++) {
      for (let c = 0; c < 16 && idx < crowdCount; c++) {
        const x = -11.2 + c * 1.49 + (step % 2 === 1 ? 0.3 : 0);
        const baseY = 0.65 + step * 0.65;
        const z = -(7.75 + step * 1.2);
        const scale = 0.88 + ((c + step) % 3) * 0.08;
        const phase = idx * 0.65;

        slots.push({ x, baseY, z, scale, phase });

        tmpColor.setHex(jerseyPalette[(c + step * 2) % jerseyPalette.length]);
        torsoInst.setColorAt(idx, tmpColor);

        tmpColor.setHex(skinPalette[(c * 3 + step) % skinPalette.length]);
        headInst.setColorAt(idx, tmpColor);
        armInst.setColorAt(idx * 2, tmpColor);
        armInst.setColorAt(idx * 2 + 1, tmpColor);

        tmpColor.setHex(hairPalette[(c * 5 + step * 3) % hairPalette.length]);
        hairInst.setColorAt(idx, tmpColor);

        idx += 1;
      }
    }

    if (torsoInst.instanceColor) torsoInst.instanceColor.needsUpdate = true;
    if (headInst.instanceColor) headInst.instanceColor.needsUpdate = true;
    if (hairInst.instanceColor) hairInst.instanceColor.needsUpdate = true;
    if (armInst.instanceColor) armInst.instanceColor.needsUpdate = true;

    const dummy = new THREE.Object3D();
    const updateCrowd = (elapsed: number, exciteBoost: number) => {
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        const wave = Math.sin(elapsed * (3.6 * exciteBoost) + s.phase);
        const bounce = Math.abs(wave) * (0.06 * exciteBoost) * s.scale;
        const sway = Math.cos(elapsed * 2.2 + s.phase) * 0.05;
        const y0 = s.baseY + bounce;

        // Tronco
        dummy.position.set(s.x, y0 + 0.19 * s.scale, s.z);
        dummy.rotation.set(0, sway, 0);
        dummy.scale.setScalar(s.scale);
        dummy.updateMatrix();
        torsoInst.setMatrixAt(i, dummy.matrix);

        // Cabeça grande estilo chibi
        dummy.position.set(s.x, y0 + 0.57 * s.scale, s.z);
        dummy.rotation.set(0.06, sway * 1.4, 0);
        dummy.scale.setScalar(s.scale);
        dummy.updateMatrix();
        headInst.setMatrixAt(i, dummy.matrix);

        // Contorno anime da cabeça
        dummy.scale.setScalar(s.scale * 1.02);
        dummy.updateMatrix();
        outlineInst.setMatrixAt(i, dummy.matrix);

        // Cabelo
        dummy.position.set(s.x, y0 + 0.59 * s.scale, s.z - 0.01 * s.scale);
        dummy.rotation.set(-0.22, sway * 1.4, 0);
        dummy.scale.setScalar(s.scale);
        dummy.updateMatrix();
        hairInst.setMatrixAt(i, dummy.matrix);

        // Olhos voltados para a quadra (+Z)
        for (let e = 0; e < 2; e++) {
          const eSide = e === 0 ? -1 : 1;
          dummy.position.set(
            s.x + eSide * 0.1 * s.scale,
            y0 + 0.56 * s.scale,
            s.z + 0.235 * s.scale,
          );
          dummy.rotation.set(0, eSide * 0.18, 0);
          dummy.scale.set(0.88 * s.scale, 1.25 * s.scale, 0.5 * s.scale);
          dummy.updateMatrix();
          eyeInst.setMatrixAt(i * 2 + e, dummy.matrix);
        }

        // Braços acenando na torcida
        for (let a = 0; a < 2; a++) {
          const aSide = a === 0 ? -1 : 1;
          const armSwing = Math.sin(elapsed * (5.2 * exciteBoost) + s.phase + a * 0.7) * 0.35;
          dummy.position.set(
            s.x + aSide * 0.25 * s.scale,
            y0 + 0.39 * s.scale,
            s.z + 0.03 * s.scale,
          );
          dummy.rotation.set(-0.35, 0, aSide * (2.35 + armSwing));
          dummy.scale.setScalar(s.scale);
          dummy.updateMatrix();
          armInst.setMatrixAt(i * 2 + a, dummy.matrix);
        }
      }

      torsoInst.instanceMatrix.needsUpdate = true;
      headInst.instanceMatrix.needsUpdate = true;
      hairInst.instanceMatrix.needsUpdate = true;
      outlineInst.instanceMatrix.needsUpdate = true;
      eyeInst.instanceMatrix.needsUpdate = true;
      armInst.instanceMatrix.needsUpdate = true;
    };

    // Inicializa frame 0 imediatamente e garante frustum culling seguro
    updateCrowd(0, 1);
    for (const inst of [torsoInst, headInst, hairInst, outlineInst, eyeInst, armInst]) {
      inst.frustumCulled = false;
      group.add(inst);
    }

    // Banners de torneio no fundo da quadra (fora da área expandida de 20m)
    for (const xSide of [-1, 1]) {
      const banner = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.6, 10.5), trimMat);
      banner.position.set(xSide * (COURT.HALF_WIDTH + 2.8), 0.8, 0);
      group.add(banner);
    }
    if (arenaId === 'neon') {
      const buildingMat = new THREE.MeshToonMaterial({ color: '#0F172A', gradientMap });
      const neonWindowMat = new THREE.MeshBasicMaterial({ color: '#22D3EE' });
      for (let i = -3; i <= 3; i++) {
        const h = 8 + Math.abs(i * 2.5);
        const b = new THREE.Mesh(new THREE.BoxGeometry(3.2, h, 3.2), buildingMat);
        b.position.set(i * 5.2, h / 2 - 0.1, -18 - (Math.abs(i) % 2) * 3);
        group.add(b);
        const strip = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.25, 3.3), neonWindowMat);
        strip.position.set(b.position.x, h - 1.2, b.position.z);
        group.add(strip);
      }
    }
    return updateCrowd;
  } else if (arenaId === 'praia') {
    // Mar turquesa e palmeiras estilizadas
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(140, 60),
      new THREE.MeshToonMaterial({ color: '#0284C7', gradientMap }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.01, -38);
    group.add(water);

    const trunkMat = new THREE.MeshToonMaterial({ color: '#92400E', gradientMap });
    const leafMat = new THREE.MeshToonMaterial({ color: '#22C55E', gradientMap });
    for (const px of [-13.5, -6, 6.5, 13.5]) {
      const palm = new THREE.Group();
      palm.position.set(px, 0, -10.5 - Math.abs(px % 3));
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 4.8, 7), trunkMat);
      trunk.position.y = 2.4;
      trunk.rotation.z = px < 0 ? 0.12 : -0.12;
      palm.add(trunk);
      for (let l = 0; l < 5; l++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.4, 5), leafMat);
        leaf.position.set(0, 4.7, 0);
        leaf.rotation.z = 1.25;
        leaf.rotation.y = (l / 5) * Math.PI * 2;
        palm.add(leaf);
      }
      group.add(palm);
    }
  } else if (arenaId === 'escola' || arenaId === 'festival') {
    // Cerejeiras / Lanternas japonesas ao fundo
    const trunkMat = new THREE.MeshToonMaterial({ color: '#57534E', gradientMap });
    const blossomMat = new THREE.MeshToonMaterial({
      color: arenaId === 'escola' ? '#F472B6' : '#F59E0B',
      gradientMap,
    });
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      const tree = new THREE.Group();
      tree.position.set(i * 4.2, 0, -10.2);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 2.8, 6), trunkMat);
      trunk.position.y = 1.4;
      tree.add(trunk);
      const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(1.45, 0), blossomMat);
      crown.position.y = 3.2;
      tree.add(crown);
      group.add(tree);
    }
  } else if (arenaId === 'montanha') {
    const rockMat = new THREE.MeshToonMaterial({ color: '#475569', gradientMap });
    const snowMat = new THREE.MeshToonMaterial({ color: '#F8FAFC', gradientMap });
    for (let i = -3; i <= 3; i++) {
      const peakH = 9 + (Math.abs(i) % 2) * 4;
      const peak = new THREE.Mesh(new THREE.ConeGeometry(5.5, peakH, 5), rockMat);
      peak.position.set(i * 7.5, peakH / 2 - 0.5, -22);
      group.add(peak);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(2.3, peakH * 0.42, 5), snowMat);
      cap.position.set(peak.position.x, peakH * 0.78, peak.position.z);
      group.add(cap);
    }
  } else if (arenaId === 'templo') {
    // Portal Torii ao fundo
    const toriiMat = new THREE.MeshToonMaterial({ color: '#DC2626', gradientMap });
    for (const px of [-2.4, 2.4]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 5.2, 8), toriiMat);
      pillar.position.set(px, 2.6, -11.5);
      group.add(pillar);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.45, 0.5), toriiMat);
    beam.position.set(0, 5.1, -11.5);
    group.add(beam);
    const subBeam = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.3, 0.35), darkMat);
    subBeam.position.set(0, 4.2, -11.5);
    group.add(subBeam);
  }
}
