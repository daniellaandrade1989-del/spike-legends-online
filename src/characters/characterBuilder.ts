/**
 * Spike Legends Online — Construtor Procedural de Personagens Anime 2D/2.5D de Alta Definição (Estilo Shonen Esportivo)
 *
 * Substitui integralmente qualquer traço rústico/baixa resolução por:
 * - Texturas HD (1024x1024) com sombreamento Cel-Shading multi-banda e Contornos Ink definidos;
 * - Expressões faciais dinâmicas de anime de ação ('normal', 'focus', 'intense');
 * - Proporções atléticas alongadas de Anime Shonen Esportivo;
 * - Uniformes detalhados: camisa com mangas e gola em V, bermudas, JOELHEIRAS VISÍVEIS,
 *   MEIAS ESPORTIVAS listradas, TÊNIS DE CANO ALTO esculpidos, munhequeiras e fitas esvoaçantes;
 * - Cabelos estilizados e espetados com mechas iluminadas (hairHighlight) e brilho angel-ring;
 * - Rastro visual de ação (linhas de velocidade anime, arco de cortada e chamas de aura) para
 *   Super Ataque, Cortada (Spike), Saque Viagem e Bloqueio.
 */
import * as THREE from 'three';
import type { CharacterAnimState, CharacterId, TeamSide } from '../config/gameConfig';
import { CHARACTERS, type CharacterDefinition } from './roster';
import type { AnimeFacialExpression, ResolvedAnimatorFrame } from './playerAnimatorController';

export const ANIME_VISUAL_STYLE_VERSION = 'SHONEN_HD_1024_CEL_SHADED_V2';

let sharedToonGradient: THREE.DataTexture | null = null;
let sharedOutlineMat: THREE.MeshBasicMaterial | null = null;
let sharedShadowMat: THREE.MeshBasicMaterial | null = null;

const jerseyTextureCache = new Map<CharacterId, THREE.CanvasTexture>();
const faceTextureCache = new Map<string, THREE.CanvasTexture>();
const sockTextureCache = new Map<CharacterId, THREE.CanvasTexture>();

/**
 * Rampa Cel-Shading Anime de 5 faixas de alto contraste (sombra profunda -> meio-tom -> base -> luz -> rim specular).
 */
export function getToonGradientTexture(): THREE.DataTexture {
  if (!sharedToonGradient) {
    const colors = new Uint8Array([78, 136, 198, 240, 255]);
    sharedToonGradient = new THREE.DataTexture(colors, 5, 1, THREE.RedFormat);
    sharedToonGradient.minFilter = THREE.NearestFilter;
    sharedToonGradient.magFilter = THREE.NearestFilter;
    sharedToonGradient.generateMipmaps = false;
    sharedToonGradient.needsUpdate = true;
  }
  return sharedToonGradient;
}

export function getOutlineMaterial(): THREE.MeshBasicMaterial {
  if (!sharedOutlineMat) {
    sharedOutlineMat = new THREE.MeshBasicMaterial({
      color: 0x070a12,
      side: THREE.BackSide,
    });
  }
  return sharedOutlineMat;
}

function getContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 14, 128, 128, 120);
  grad.addColorStop(0, 'rgba(7, 10, 18, 0.62)');
  grad.addColorStop(0.6, 'rgba(7, 10, 18, 0.26)');
  grad.addColorStop(1, 'rgba(7, 10, 18, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

function getContactShadowMaterial(): THREE.MeshBasicMaterial {
  if (!sharedShadowMat) {
    sharedShadowMat = new THREE.MeshBasicMaterial({
      map: getContactShadowTexture(),
      transparent: true,
      depthWrite: false,
    });
  }
  return sharedShadowMat;
}

/**
 * Gera textura HD (512x512) para as meias esportivas de cano médio/alto com listras duplas do time.
 */
function getSockTexture(def: CharacterDefinition): THREE.CanvasTexture {
  const cached = sockTextureCache.get(def.id);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Base branca esportiva com leve sombreamento cel-shaded inferior
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, 512, 512);

  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(0, 360, 512, 152);

  // Duas faixas horizontais de alto contraste no topo da meia
  ctx.fillStyle = def.colors.primary;
  ctx.fillRect(0, 44, 512, 36);
  ctx.fillStyle = def.colors.accent;
  ctx.fillRect(0, 96, 512, 28);

  // Linhas de contorno ink nas faixas
  ctx.strokeStyle = '#070A12';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, 44);
  ctx.lineTo(512, 44);
  ctx.moveTo(0, 124);
  ctx.lineTo(512, 124);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  sockTextureCache.set(def.id, tex);
  return tex;
}

/**
 * Gera textura HD (1024x512) da camisa esportiva de vôlei anime com gola V contrastante,
 * faixas laterais, emblema no peito, dobras cel-shaded e número na frente/costas.
 */
function getJerseyTexture(def: CharacterDefinition): THREE.CanvasTexture {
  const cached = jerseyTextureCache.get(def.id);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;

  // Base da camisa esportiva
  ctx.fillStyle = def.colors.primary;
  ctx.fillRect(0, 0, w, h);

  // Sombra cel-shading de dobra diagonal sutil no tecido
  ctx.fillStyle = 'rgba(7, 10, 18, 0.22)';
  ctx.beginPath();
  ctx.moveTo(w * 0.34, h * 0.55);
  ctx.lineTo(w * 0.64, h * 0.38);
  ctx.lineTo(w * 0.66, h * 0.48);
  ctx.lineTo(w * 0.36, h * 0.65);
  ctx.closePath();
  ctx.fill();

  // Painéis laterais esportivos (em u = 0.25 e u = 0.75) com friso branco e contorno ink
  const stripeW = 72;
  for (const cx of [w * 0.25, w * 0.75]) {
    ctx.fillStyle = '#070A12';
    ctx.fillRect(cx - stripeW / 2 - 14, 0, stripeW + 28, h);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(cx - stripeW / 2 - 8, 0, stripeW + 16, h);
    ctx.fillStyle = def.colors.accent;
    ctx.fillRect(cx - stripeW / 2, 0, stripeW, h);
  }

  // Faixa diagonal dinâmica estilo uniforme anime shonen no peito
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(w * 0.34, h * 0.24);
  ctx.lineTo(w * 0.66, h * 0.14);
  ctx.lineTo(w * 0.66, h * 0.21);
  ctx.lineTo(w * 0.34, h * 0.31);
  ctx.closePath();
  ctx.fillStyle = def.colors.accent;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#070A12';
  ctx.stroke();
  ctx.restore();

  // Decote em V esportivo no topo frontal (u = 0.5)
  ctx.fillStyle = def.colors.skin;
  ctx.beginPath();
  ctx.moveTo(w * 0.42, 0);
  ctx.quadraticCurveTo(w * 0.5, 92, w * 0.58, 0);
  ctx.closePath();
  ctx.fill();

  // Gola esportiva tripla (ink + branco + cor de destaque)
  ctx.strokeStyle = '#070A12';
  ctx.lineWidth = 20;
  ctx.beginPath();
  ctx.moveTo(w * 0.41, 0);
  ctx.quadraticCurveTo(w * 0.5, 98, w * 0.59, 0);
  ctx.stroke();

  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(w * 0.412, 0);
  ctx.quadraticCurveTo(w * 0.5, 96, w * 0.588, 0);
  ctx.stroke();

  ctx.strokeStyle = def.colors.accent;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(w * 0.415, 0);
  ctx.quadraticCurveTo(w * 0.5, 94, w * 0.585, 0);
  ctx.stroke();

  // Número do uniforme na frente (u = 0.5) e nas costas (u = 0 / u = 1) em alta resolução
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 156px "Chakra Petch", sans-serif';
  ctx.lineJoin = 'round';

  // Frente
  ctx.strokeStyle = '#070A12';
  ctx.lineWidth = 18;
  ctx.strokeText(def.jerseyNumber, w * 0.5, 272);
  ctx.strokeStyle = def.colors.accent;
  ctx.lineWidth = 6;
  ctx.strokeText(def.jerseyNumber, w * 0.5, 272);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(def.jerseyNumber, w * 0.5, 272);

  // Costas
  ctx.font = '900 172px "Chakra Petch", sans-serif';
  for (const bx of [0, w]) {
    ctx.strokeStyle = '#070A12';
    ctx.lineWidth = 18;
    ctx.strokeText(def.jerseyNumber, bx, 260);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(def.jerseyNumber, bx, 260);
  }

  // Barra inferior contrastante da camisa
  ctx.fillStyle = '#070A12';
  ctx.fillRect(0, h - 26, w, 26);
  ctx.fillStyle = def.colors.accent;
  ctx.fillRect(0, h - 20, w, 20);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  jerseyTextureCache.set(def.id, tex);
  return tex;
}

/**
 * Gera textura facial HD (1024x1024) estilo Anime Shonen com 3 expressões dinâmicas:
 * - 'normal': confiante e expressivo
 * - 'focus': olhar concentrado de recepção/levantamento
 * - 'intense': expressão feroz de ataque/cortada/saque viagem com linhas de ação mangá
 */
function getAnimeFaceTexture(
  def: CharacterDefinition,
  expression: AnimeFacialExpression = 'normal',
): THREE.CanvasTexture {
  const cacheKey = `${def.id}_${expression}`;
  const cached = faceTextureCache.get(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;

  // Base de pele anime limpa
  ctx.fillStyle = def.colors.skin;
  ctx.fillRect(0, 0, w, h);

  // Sombra cel-shaded sob a franja e lateral da mandíbula
  ctx.fillStyle = 'rgba(180, 83, 9, 0.14)';
  ctx.fillRect(0, 0, w, Math.round(h * 0.43));

  const faceCx = w * 0.5;
  const eyeY = h * 0.55;
  const eyeOffset = 86;

  // Olhos estilo Anime Shonen de Alta Definição
  for (const side of [-1, 1]) {
    const ex = faceCx + side * eyeOffset;
    const ey = eyeY;

    // Esclera branca nítida
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(ex, ey, 46, expression === 'intense' ? 44 : 50, 0, 0, Math.PI * 2);
    ctx.fill();

    // Sombra superior cel-shaded na esclera
    ctx.fillStyle = 'rgba(100, 116, 139, 0.34)';
    ctx.beginPath();
    ctx.ellipse(ex, ey - 24, 43, 20, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    // Íris multicamada com gradiente rico
    const irisRadiusX = expression === 'intense' ? 27 : 31;
    const irisRadiusY = expression === 'intense' ? 33 : 38;
    const irisGrad = ctx.createLinearGradient(ex, ey - 36, ex, ey + 36);
    irisGrad.addColorStop(0, '#070A12');
    irisGrad.addColorStop(0.32, def.colors.eye);
    irisGrad.addColorStop(0.78, def.colors.accent);
    irisGrad.addColorStop(1, '#FEF08A');
    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.ellipse(ex - side * 4, ey + 2, irisRadiusX, irisRadiusY, 0, 0, Math.PI * 2);
    ctx.fill();

    // Anel interno de contorno da íris
    ctx.strokeStyle = '#070A12';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // Pupila vertical intensa
    ctx.fillStyle = '#070A12';
    ctx.beginPath();
    ctx.ellipse(
      ex - side * 4,
      ey + 3,
      expression === 'intense' ? 11 : 14,
      expression === 'intense' ? 15 : 19,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    // Brilhos especulares duplos estilo anime (catchlights)
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(ex - side * 4 - 11, ey - 13, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex - side * 4 + 10, ey + 14, 5.2, 0, Math.PI * 2);
    ctx.fill();

    // Cílio superior ink bem definido
    ctx.strokeStyle = '#070A12';
    ctx.lineWidth = 13;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ex - side * 48, ey - (expression === 'intense' ? 2 : 8));
    ctx.quadraticCurveTo(
      ex,
      ey - (expression === 'intense' ? 54 : 62),
      ex + side * 48,
      ey - (expression === 'intense' ? 16 : 20),
    );
    ctx.stroke();

    // Linha inferior do olho
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.moveTo(ex - side * 28, ey + 43);
    ctx.quadraticCurveTo(ex, ey + 51, ex + side * 28, ey + 41);
    ctx.stroke();

    // Sobrancelha expressiva dinâmica (arqueada em 'normal', franzida em 'focus' e agressiva em 'intense')
    ctx.strokeStyle = '#070A12';
    ctx.lineWidth = 11;
    ctx.beginPath();
    if (expression === 'intense') {
      ctx.moveTo(ex - side * 42, ey - 84);
      ctx.quadraticCurveTo(ex, ey - 72, ex + side * 42, ey - 48);
    } else if (expression === 'focus') {
      ctx.moveTo(ex - side * 42, ey - 76);
      ctx.quadraticCurveTo(ex, ey - 82, ex + side * 42, ey - 58);
    } else {
      ctx.moveTo(ex - side * 40, ey - 74);
      ctx.quadraticCurveTo(ex, ey - 94, ex + side * 42, ey - 64);
    }
    ctx.stroke();

    // Hachuras de ação estilo mangá shonen nas bochechas quando em 'intense'
    if (expression === 'intense') {
      ctx.strokeStyle = 'rgba(180, 83, 9, 0.45)';
      ctx.lineWidth = 3.5;
      for (let hIdx = 0; hIdx < 3; hIdx++) {
        const hx = ex + side * (22 + hIdx * 10);
        const hy = ey + 58 + hIdx * 4;
        ctx.beginPath();
        ctx.moveTo(hx - 4, hy - 7);
        ctx.lineTo(hx + 4, hy + 7);
        ctx.stroke();
      }
    }
  }

  // Nariz esculpido com sombra triangular cel-shaded
  ctx.fillStyle = 'rgba(180, 83, 9, 0.28)';
  ctx.beginPath();
  ctx.moveTo(faceCx, eyeY + 62);
  ctx.lineTo(faceCx - 11, eyeY + 94);
  ctx.lineTo(faceCx + 4, eyeY + 96);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#7C2D12';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(faceCx + 3, eyeY + 64);
  ctx.lineTo(faceCx - 5, eyeY + 92);
  ctx.lineTo(faceCx + 8, eyeY + 96);
  ctx.stroke();

  // Boca dinâmica conforme estado de ação
  const mouthY = eyeY + 148;
  ctx.strokeStyle = '#070A12';
  ctx.lineWidth = 6.5;

  if (expression === 'intense') {
    // Grito de ataque / dentes cerrados estilo anime shonen
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(faceCx - 52, mouthY - 8);
    ctx.quadraticCurveTo(faceCx, mouthY - 18, faceCx + 52, mouthY - 8);
    ctx.lineTo(faceCx + 44, mouthY + 34);
    ctx.quadraticCurveTo(faceCx, mouthY + 26, faceCx - 44, mouthY + 34);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Linha de dentes cerrados
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(faceCx - 46, mouthY + 12);
    ctx.quadraticCurveTo(faceCx, mouthY + 6, faceCx + 46, mouthY + 12);
    ctx.stroke();
  } else if (expression === 'focus') {
    // Sorriso determinado fechado com canto erguido
    ctx.beginPath();
    ctx.moveTo(faceCx - 38, mouthY + 8);
    ctx.quadraticCurveTo(faceCx + 4, mouthY + 18, faceCx + 44, mouthY - 4);
    ctx.stroke();
  } else {
    // Sorriso energético aberto estilo protagonista shonen
    ctx.fillStyle = '#9F1239';
    ctx.beginPath();
    ctx.moveTo(faceCx - 48, mouthY - 8);
    ctx.quadraticCurveTo(faceCx, mouthY + 4, faceCx + 48, mouthY - 8);
    ctx.quadraticCurveTo(faceCx + 36, mouthY + 50, faceCx, mouthY + 50);
    ctx.quadraticCurveTo(faceCx - 36, mouthY + 50, faceCx - 48, mouthY - 8);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(faceCx - 52, mouthY - 12, 104, 24);
    ctx.fillStyle = '#FB7185';
    ctx.beginPath();
    ctx.ellipse(faceCx, mouthY + 42, 32, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  faceTextureCache.set(cacheKey, tex);
  return tex;
}

function addWithOutline(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  outlineScale = 1.048,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const outline = new THREE.Mesh(geo, getOutlineMaterial());
  outline.scale.setScalar(outlineScale);
  mesh.add(outline);

  parent.add(mesh);
  return mesh;
}

/**
 * Cria uma mecha pontiaguda/curvada estilo cabelo anime shonen usando ExtrudeGeometry.
 */
function createAnimeHairLockGeometry(
  length: number,
  width: number,
  thickness: number,
  curveOffset = 0.04,
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-width * 0.5, 0);
  shape.quadraticCurveTo(-width * 0.32 + curveOffset, length * 0.58, curveOffset * 1.45, length);
  shape.quadraticCurveTo(width * 0.32 + curveOffset, length * 0.58, width * 0.5, 0);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 6,
  });
  geo.translate(0, 0, -thickness * 0.5);
  return geo;
}

/**
 * Geometria esculpida de cabeça anime (crânio cheio em cima + mandíbula e queixo em V bem marcados).
 */
function createAnimeHeadGeometry(): THREE.LatheGeometry {
  const profile = [
    new THREE.Vector2(0.0, -0.195),
    new THREE.Vector2(0.068, -0.18),
    new THREE.Vector2(0.138, -0.115),
    new THREE.Vector2(0.18, -0.02),
    new THREE.Vector2(0.188, 0.085),
    new THREE.Vector2(0.168, 0.168),
    new THREE.Vector2(0.105, 0.218),
    new THREE.Vector2(0.0, 0.232),
  ];
  const geo = new THREE.LatheGeometry(profile, 28, -Math.PI, Math.PI * 2);
  geo.scale(0.93, 1.0, 0.94);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Geometria de tronco atlético alongado em V estilo Shonen Esportivo.
 */
function createAthleticTorsoGeometry(): THREE.LatheGeometry {
  const profile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.162, 0.0),
    new THREE.Vector2(0.156, 0.13),
    new THREE.Vector2(0.192, 0.29),
    new THREE.Vector2(0.218, 0.41),
    new THREE.Vector2(0.162, 0.46),
    new THREE.Vector2(0.0, 0.46),
  ];
  const geo = new THREE.LatheGeometry(profile, 24, -Math.PI, Math.PI * 2);
  geo.scale(1.14, 1.0, 0.76);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Mão esculpida orgânica estilo anime (substitui BoxGeometry quadrada por silhueta arredondada).
 */
function createSculptedHandGeometry(): THREE.LatheGeometry {
  const profile = [
    new THREE.Vector2(0.0, -0.055),
    new THREE.Vector2(0.028, -0.048),
    new THREE.Vector2(0.042, -0.015),
    new THREE.Vector2(0.039, 0.03),
    new THREE.Vector2(0.026, 0.052),
    new THREE.Vector2(0.0, 0.055),
  ];
  const geo = new THREE.LatheGeometry(profile, 14);
  geo.scale(0.95, 1.05, 0.62);
  geo.computeVertexNormals();
  return geo;
}

export interface CharacterRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  headGroup: THREE.Group;
  headMesh: THREE.Mesh;
  faceMaterials: Record<AnimeFacialExpression, THREE.MeshToonMaterial>;
  currentExpression: AnimeFacialExpression;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftForearm: THREE.Group;
  rightForearm: THREE.Group;
  leftHand: THREE.Mesh;
  rightHand: THREE.Mesh;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftShin: THREE.Group;
  rightShin: THREE.Group;
  leftKneePad: THREE.Mesh;
  rightKneePad: THREE.Mesh;
  leftHighTopShoe: THREE.Group;
  rightHighTopShoe: THREE.Group;
  bandanaTailsGroup: THREE.Group;
  actionTrailGroup: THREE.Group;
  spikeSlashArc: THREE.Mesh;
  speedStreaksGroup: THREE.Group;
  powerAuraFlames: THREE.Group;
  auraRing: THREE.Mesh;
  contactShadow: THREE.Mesh;
  teamIndicator: THREE.Mesh;
  hitFlashMaterials: THREE.MeshToonMaterial[];
}

export function buildAnimeCharacter(characterId: CharacterId, team: TeamSide): CharacterRig {
  const def = CHARACTERS[characterId];
  const gradientMap = getToonGradientTexture();

  const root = new THREE.Group();
  root.name = `AnimeCharacter_${characterId}_${ANIME_VISUAL_STYLE_VERSION}`;
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const skinMat = new THREE.MeshToonMaterial({ color: def.colors.skin, gradientMap });
  const jerseyMat = new THREE.MeshToonMaterial({
    map: getJerseyTexture(def),
    gradientMap,
  });
  const shortsMat = new THREE.MeshToonMaterial({ color: def.colors.secondary, gradientMap });
  const accentMat = new THREE.MeshToonMaterial({ color: def.colors.accent, gradientMap });
  const hairMat = new THREE.MeshToonMaterial({ color: def.colors.hair, gradientMap });
  const hairHighlightMat = new THREE.MeshToonMaterial({ color: def.colors.hairHighlight, gradientMap });
  const kneePadMat = new THREE.MeshToonMaterial({ color: def.colors.kneePad, gradientMap });
  const sockMat = new THREE.MeshToonMaterial({ map: getSockTexture(def), gradientMap });
  const shoeUpperMat = new THREE.MeshToonMaterial({ color: '#F8FAFC', gradientMap });
  const shoeCollarMat = new THREE.MeshToonMaterial({ color: '#0F172A', gradientMap });
  const shoeAccentMat = new THREE.MeshToonMaterial({ color: def.colors.shoeAccent, gradientMap });

  const faceMaterials: Record<AnimeFacialExpression, THREE.MeshToonMaterial> = {
    normal: new THREE.MeshToonMaterial({ map: getAnimeFaceTexture(def, 'normal'), gradientMap }),
    focus: new THREE.MeshToonMaterial({ map: getAnimeFaceTexture(def, 'focus'), gradientMap }),
    intense: new THREE.MeshToonMaterial({ map: getAnimeFaceTexture(def, 'intense'), gradientMap }),
  };

  // Sombra suave de contato no chão (y = 0.015)
  const contactShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.58, 28),
    getContactShadowMaterial(),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.015;
  root.add(contactShadow);

  // Anel de equipe ao redor dos pés
  const teamColor = team === 'left' ? '#38BDF8' : '#F97316';
  const teamIndicator = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.52, 28),
    new THREE.MeshBasicMaterial({ color: teamColor, side: THREE.DoubleSide, transparent: true, opacity: 0.88 }),
  );
  teamIndicator.rotation.x = -Math.PI / 2;
  teamIndicator.position.y = 0.022;
  root.add(teamIndicator);

  // Anel de Aura Ultimate no chão
  const auraRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.64, 0.048, 10, 32),
    new THREE.MeshBasicMaterial({ color: def.colors.aura, transparent: true, opacity: 0.92 }),
  );
  auraRing.rotation.x = Math.PI / 2;
  auraRing.position.y = 0.16;
  auraRing.visible = false;
  root.add(auraRing);

  // ============================================================================
  // PERNAS ALONGADAS SHONEN + BERMUDAS + JOELHEIRAS VISÍVEIS + MEIAS + TÊNIS CANO ALTO
  // ============================================================================
  const thighGeo = new THREE.CylinderGeometry(0.086, 0.068, 0.37, 14);
  const shinGeo = new THREE.CylinderGeometry(0.066, 0.048, 0.17, 14);
  const sockGeo = new THREE.CylinderGeometry(0.062, 0.052, 0.21, 14);
  const kneePadMainGeo = new THREE.CylinderGeometry(0.078, 0.074, 0.125, 14);
  const kneePadShieldGeo = new THREE.SphereGeometry(0.068, 12, 10);
  const shortsLegGeo = new THREE.CylinderGeometry(0.118, 0.128, 0.23, 14);
  const shortsTrimGeo = new THREE.TorusGeometry(0.124, 0.014, 8, 20);

  // Geometrias esculpidas para o Tênis de Cano Alto (High-Top Volleyball Sneaker)
  const highTopCollarGeo = new THREE.CylinderGeometry(0.066, 0.072, 0.105, 14);
  const shoeFootGeo = new THREE.CapsuleGeometry(0.058, 0.13, 8, 14);
  const shoeSoleGeo = new THREE.CapsuleGeometry(0.062, 0.14, 6, 12);
  const shoeTongueGeo = new THREE.CapsuleGeometry(0.026, 0.065, 6, 10);

  const buildLeg = (
    side: -1 | 1,
  ): { leg: THREE.Group; shin: THREE.Group; kneePad: THREE.Mesh; highTopShoe: THREE.Group } => {
    const leg = new THREE.Group();
    leg.position.set(side * 0.138, 0.81, 0);

    // Coxa atlética
    const thigh = addWithOutline(leg, thighGeo, skinMat, 1.052);
    thigh.position.y = -0.185;

    // Bermuda esportiva com barra contrastante e faixa lateral
    const shortsLeg = addWithOutline(leg, shortsLegGeo, shortsMat, 1.045);
    shortsLeg.position.y = -0.095;

    const shortsTrim = new THREE.Mesh(shortsTrimGeo, accentMat);
    shortsTrim.rotation.x = Math.PI / 2;
    shortsTrim.position.y = -0.205;
    leg.add(shortsTrim);

    // Pivot do joelho em y = -0.36
    const shin = new THREE.Group();
    shin.position.set(0, -0.36, 0);
    leg.add(shin);

    // JOELHEIRA VISÍVEL DE VÔLEI (Knee Pad acolchoada com relevo frontal e contorno ink)
    const kneePad = addWithOutline(shin, kneePadMainGeo, kneePadMat, 1.06);
    kneePad.name = `KneePad_${side < 0 ? 'L' : 'R'}`;
    kneePad.position.set(0, -0.01, 0.008);

    const kneeShield = addWithOutline(kneePad, kneePadShieldGeo, kneePadMat, 1.05);
    kneeShield.scale.set(0.95, 1.15, 0.65);
    kneeShield.position.set(0, 0, 0.032);

    const kneeAccentStripe = new THREE.Mesh(
      new THREE.TorusGeometry(0.076, 0.008, 6, 18),
      accentMat,
    );
    kneeAccentStripe.rotation.x = Math.PI / 2;
    kneeAccentStripe.position.y = 0.048;
    kneePad.add(kneeAccentStripe);

    // Parte superior da panturrilha
    const upperCalf = addWithOutline(shin, shinGeo, skinMat, 1.052);
    upperCalf.position.y = -0.12;

    // MEIA ESPORTIVA DE CANO ALTO (Crew Sock com listras duplas)
    const sock = addWithOutline(shin, sockGeo, sockMat, 1.052);
    sock.name = `CrewSock_${side < 0 ? 'L' : 'R'}`;
    sock.position.y = -0.265;

    // TÊNIS DE CANO ALTO ESCULPIDO (High-Top Volleyball Sneaker)
    const highTopShoe = new THREE.Group();
    highTopShoe.name = `HighTopShoe_${side < 0 ? 'L' : 'R'}`;
    highTopShoe.position.set(0, -0.395, 0.036);
    shin.add(highTopShoe);

    // Cano alto acolchoado envolvendo o tornozelo
    const ankleCollar = addWithOutline(highTopShoe, highTopCollarGeo, shoeUpperMat, 1.055);
    ankleCollar.position.set(0, 0.058, -0.028);
    ankleCollar.rotation.x = 0.1;

    const collarRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.066, 0.014, 8, 18),
      shoeAccentMat,
    );
    collarRim.rotation.x = Math.PI / 2 + 0.1;
    collarRim.position.set(0, 0.105, -0.024);
    highTopShoe.add(collarRim);

    // Língua frontal elevada do tênis de cano alto
    const tongue = addWithOutline(highTopShoe, shoeTongueGeo, shoeCollarMat, 1.05);
    tongue.position.set(0, 0.072, 0.034);
    tongue.rotation.x = -0.22;

    // Corpo principal aerodinâmico do tênis
    const shoeBody = addWithOutline(highTopShoe, shoeFootGeo, shoeUpperMat, 1.052);
    shoeBody.rotation.x = Math.PI / 2;
    shoeBody.scale.set(1.08, 1.0, 0.78);
    shoeBody.position.set(0, -0.004, 0.012);

    // Faixa lateral dinâmica do tênis
    const sideSlash = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.016, 0.16, 8),
      shoeAccentMat,
    );
    sideSlash.rotation.x = Math.PI / 2 - 0.35;
    sideSlash.position.set(side * 0.062, 0.008, 0.01);
    highTopShoe.add(sideSlash);

    // Solado esportivo aderente de alto contraste
    const shoeSole = addWithOutline(highTopShoe, shoeSoleGeo, shoeAccentMat, 1.045);
    shoeSole.rotation.x = Math.PI / 2;
    shoeSole.scale.set(1.14, 1.04, 0.36);
    shoeSole.position.set(0, -0.036, 0.012);

    bodyGroup.add(leg);
    return { leg, shin, kneePad, highTopShoe };
  };

  const leftLegBuilt = buildLeg(-1);
  const rightLegBuilt = buildLeg(1);

  // ============================================================================
  // QUADRIL + TRONCO ATLÉTICO SHONEN + MANGAS ESPORTIVAS
  // ============================================================================
  const pelvis = addWithOutline(
    bodyGroup,
    new THREE.CylinderGeometry(0.18, 0.21, 0.18, 18),
    shortsMat,
    1.045,
  );
  pelvis.scale.set(1.12, 1, 0.76);
  pelvis.position.y = 0.81;

  const torsoGeo = createAthleticTorsoGeometry();
  const torso = addWithOutline(bodyGroup, torsoGeo, jerseyMat, 1.045);
  torso.position.y = 0.88;

  // Pescoço esguio estilo anime shonen
  const neck = addWithOutline(
    bodyGroup,
    new THREE.CylinderGeometry(0.064, 0.08, 0.145, 14),
    skinMat,
    1.05,
  );
  neck.position.y = 1.36;

  // ============================================================================
  // BRAÇOS ARTICULADOS EM 2 SEGMENTOS (Manga Esportiva + Bíceps + Cotovelo + Munhequeira + Mão Esculpida)
  // ============================================================================
  const shoulderSleeveGeo = new THREE.CylinderGeometry(0.078, 0.072, 0.13, 14);
  const shoulderCapGeo = new THREE.SphereGeometry(0.078, 14, 10);
  const upperArmGeo = new THREE.CylinderGeometry(0.058, 0.049, 0.25, 12);
  const elbowGeo = new THREE.SphereGeometry(0.051, 12, 10);
  const forearmGeo = new THREE.CylinderGeometry(0.051, 0.038, 0.24, 12);
  const wristbandGeo = new THREE.CylinderGeometry(0.046, 0.044, 0.058, 12);
  const handGeo = createSculptedHandGeometry();

  const buildArm = (side: -1 | 1): { arm: THREE.Group; forearm: THREE.Group; hand: THREE.Mesh } => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.265, 1.28, 0);

    // Manga curta esportiva da camisa de vôlei no ombro
    addWithOutline(arm, shoulderCapGeo, accentMat, 1.055);
    const sleeve = addWithOutline(arm, shoulderSleeveGeo, shortsMat, 1.055);
    sleeve.position.y = -0.055;

    const upper = addWithOutline(arm, upperArmGeo, skinMat, 1.055);
    upper.position.y = -0.13;

    const forearm = new THREE.Group();
    forearm.position.set(0, -0.255, 0);
    arm.add(forearm);

    addWithOutline(forearm, elbowGeo, skinMat, 1.055);

    const foreMesh = addWithOutline(forearm, forearmGeo, skinMat, 1.055);
    foreMesh.position.y = -0.12;

    // Munhequeira esportiva (Wristband)
    const wristband = addWithOutline(forearm, wristbandGeo, accentMat, 1.055);
    wristband.name = `Wristband_${side < 0 ? 'L' : 'R'}`;
    wristband.position.y = -0.205;

    // Mão esculpida orgânica estilo anime
    const hand = addWithOutline(forearm, handGeo, skinMat, 1.055);
    hand.position.y = -0.268;

    bodyGroup.add(arm);
    return { arm, forearm, hand };
  };

  const leftArmBuilt = buildArm(-1);
  const rightArmBuilt = buildArm(1);

  // ============================================================================
  // CABEÇA ESCULPIDA + EXPRESSÃO DINÂMICA + CABELO ESPETADO COM LUZES + FITAS
  // ============================================================================
  const headGroup = new THREE.Group();
  headGroup.position.y = 1.43;
  bodyGroup.add(headGroup);

  const headCenter = new THREE.Group();
  headCenter.position.y = 0.18;
  headGroup.add(headCenter);

  const headMesh = addWithOutline(headCenter, createAnimeHeadGeometry(), faceMaterials.normal, 1.046);
  headMesh.name = 'AnimeHeadMesh';

  // Orelhas
  const earGeo = new THREE.SphereGeometry(0.045, 10, 10);
  for (const side of [-1, 1]) {
    const ear = addWithOutline(headCenter, earGeo, skinMat, 1.06);
    ear.scale.set(0.55, 1.15, 0.8);
    ear.position.set(side * 0.178, -0.01, -0.01);
  }

  // Calota base do cabelo (cobre topo e nuca)
  const hairBackCap = addWithOutline(
    headCenter,
    new THREE.SphereGeometry(0.204, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.66),
    hairMat,
    1.046,
  );
  hairBackCap.position.set(0, 0.036, -0.024);
  hairBackCap.rotation.x = -0.45;

  // Anel de brilho especular "Angel Ring" clássico de anime no topo do cabelo
  const angelRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.155, 0.012, 6, 24, Math.PI * 0.85),
    hairHighlightMat,
  );
  angelRing.position.set(0, 0.125, 0.055);
  angelRing.rotation.x = 1.25;
  angelRing.rotation.z = 0.35;
  headCenter.add(angelRing);

  const hairGroup = new THREE.Group();
  headCenter.add(hairGroup);

  const highlightLockGeo = createAnimeHairLockGeometry(0.15, 0.048, 0.022, 0.02);

  if (def.hairStyle === 'spiky') {
    const bangGeo = createAnimeHairLockGeometry(0.175, 0.085, 0.032, 0.018);
    for (let i = -2; i <= 2; i++) {
      const bang = addWithOutline(hairGroup, bangGeo, i % 2 === 0 ? hairMat : hairHighlightMat, 1.05);
      bang.position.set(i * 0.066, 0.156, 0.146 - Math.abs(i) * 0.018);
      bang.rotation.x = 2.55 - Math.abs(i) * 0.08;
      bang.rotation.z = -i * 0.22;
      bang.rotation.y = i * 0.25;
    }

    const sideLockGeo = createAnimeHairLockGeometry(0.195, 0.076, 0.035, 0.022);
    for (const side of [-1, 1]) {
      const sLock = addWithOutline(hairGroup, sideLockGeo, hairMat, 1.05);
      sLock.position.set(side * 0.174, 0.11, 0.072);
      sLock.rotation.z = side * 2.55;
      sLock.rotation.x = 0.2;
    }

    const crownGeo = createAnimeHairLockGeometry(0.25, 0.128, 0.056, 0.034);
    const spikeConfigs = [
      { x: 0, y: 0.205, z: 0.02, rx: -0.22, ry: 0, rz: 0, hl: true },
      { x: -0.11, y: 0.195, z: 0.04, rx: -0.18, ry: 0.2, rz: 0.58, hl: false },
      { x: 0.11, y: 0.195, z: 0.04, rx: -0.18, ry: -0.2, rz: -0.58, hl: false },
      { x: -0.175, y: 0.135, z: -0.02, rx: -0.1, ry: 0.42, rz: 1.08, hl: true },
      { x: 0.175, y: 0.135, z: -0.02, rx: -0.1, ry: -0.42, rz: -1.08, hl: true },
      { x: -0.12, y: 0.165, z: -0.11, rx: -0.88, ry: 0.3, rz: 0.62, hl: false },
      { x: 0.12, y: 0.165, z: -0.11, rx: -0.88, ry: -0.3, rz: -0.62, hl: false },
      { x: 0, y: 0.165, z: -0.15, rx: -1.12, ry: 0, rz: 0, hl: true },
    ];
    for (const sc of spikeConfigs) {
      const sp = addWithOutline(hairGroup, crownGeo, hairMat, 1.046);
      sp.position.set(sc.x, sc.y, sc.z);
      sp.rotation.set(sc.rx, sc.ry, sc.rz);
      if (sc.hl) {
        const streak = new THREE.Mesh(highlightLockGeo, hairHighlightMat);
        streak.position.set(0, 0.05, 0.024);
        sp.add(streak);
      }
    }
  } else if (def.hairStyle === 'sleek') {
    const sleekBang = createAnimeHairLockGeometry(0.185, 0.11, 0.032, 0.026);
    for (const side of [-1, 1]) {
      const b = addWithOutline(hairGroup, sleekBang, hairMat, 1.05);
      b.position.set(side * 0.075, 0.17, 0.145);
      b.rotation.x = 2.6;
      b.rotation.z = -side * 0.28;
      const streak = new THREE.Mesh(highlightLockGeo, hairHighlightMat);
      streak.position.set(0, 0.03, 0.018);
      b.add(streak);
    }
    const backLock = createAnimeHairLockGeometry(0.23, 0.13, 0.045, 0.015);
    for (let i = -1; i <= 1; i++) {
      const bl = addWithOutline(hairGroup, backLock, hairMat, 1.045);
      bl.position.set(i * 0.09, 0.15, -0.14);
      bl.rotation.x = -2.35;
    }
  } else if (def.hairStyle === 'swept') {
    const sweptGeo = createAnimeHairLockGeometry(0.23, 0.12, 0.042, 0.042);
    for (let i = -1; i <= 2; i++) {
      const sw = addWithOutline(
        hairGroup,
        sweptGeo,
        i === 1 ? hairHighlightMat : hairMat,
        1.05,
      );
      sw.position.set(i * 0.06, 0.175, 0.12);
      sw.rotation.x = 2.45;
      sw.rotation.z = -0.55;
    }
  } else if (def.hairStyle === 'twintails') {
    const frontBang = createAnimeHairLockGeometry(0.155, 0.085, 0.028, 0);
    for (let i = -1; i <= 1; i++) {
      const fb = addWithOutline(
        hairGroup,
        frontBang,
        i === 0 ? hairHighlightMat : hairMat,
        1.05,
      );
      fb.position.set(i * 0.07, 0.165, 0.15);
      fb.rotation.x = 2.65;
    }
    const tailGeo = createAnimeHairLockGeometry(0.4, 0.145, 0.075, 0.055);
    for (const side of [-1, 1]) {
      const tail = addWithOutline(hairGroup, tailGeo, hairMat, 1.045);
      tail.position.set(side * 0.21, 0.12, -0.05);
      tail.rotation.z = side * 2.45;
      const streak = new THREE.Mesh(highlightLockGeo, hairHighlightMat);
      streak.position.set(0, 0.09, 0.032);
      tail.add(streak);
      const ribbon = addWithOutline(hairGroup, new THREE.SphereGeometry(0.054, 10, 10), accentMat, 1.06);
      ribbon.position.set(side * 0.195, 0.135, -0.04);
    }
  } else {
    const messyGeo = createAnimeHairLockGeometry(0.22, 0.12, 0.046, 0.038);
    for (let i = -2; i <= 2; i++) {
      const m = addWithOutline(
        hairGroup,
        messyGeo,
        Math.abs(i) === 1 ? hairHighlightMat : hairMat,
        1.05,
      );
      m.position.set(i * 0.07, 0.18, 0.08 - Math.abs(i) * 0.03);
      m.rotation.x = 1.9 + i * 0.18;
      m.rotation.z = -i * 0.35;
    }
  }

  // Faixa de cabeça / Bandana com fitas esvoaçantes estilo Anime Shonen
  const bandanaTailsGroup = new THREE.Group();
  bandanaTailsGroup.position.set(0, 0.1, -0.185);
  headCenter.add(bandanaTailsGroup);

  if (def.accessory === 'glasses') {
    const glassMat = new THREE.MeshBasicMaterial({ color: 0x070a12 });
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.018, 0.02), glassMat);
    bridge.position.set(0, 0.026, 0.19);
    headCenter.add(bridge);
  } else {
    const band = addWithOutline(headCenter, new THREE.TorusGeometry(0.188, 0.022, 8, 24), accentMat, 1.05);
    band.rotation.x = Math.PI / 2 - 0.14;
    band.position.y = 0.098;

    const tailRibbonGeo = createAnimeHairLockGeometry(0.22, 0.048, 0.016, 0.025);
    for (const side of [-1, 1]) {
      const rTail = addWithOutline(bandanaTailsGroup, tailRibbonGeo, accentMat, 1.05);
      rTail.position.set(side * 0.03, 0, 0);
      rTail.rotation.x = -1.25;
      rTail.rotation.z = side * 0.38;
    }
  }

  // ============================================================================
  // RASTRO DE AÇÃO ANIME (Linhas de Velocidade + Arco de Cortada + Chamas de Aura)
  // ============================================================================
  const actionTrailGroup = new THREE.Group();
  actionTrailGroup.name = 'AnimeActionTrailGroup';
  bodyGroup.add(actionTrailGroup);

  // Arco crescente luminoso de Cortada / Saque Viagem (Slash Arc)
  const spikeSlashArc = new THREE.Mesh(
    new THREE.TorusGeometry(0.68, 0.042, 8, 24, Math.PI * 0.85),
    new THREE.MeshBasicMaterial({
      color: def.colors.aura,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  spikeSlashArc.name = 'AnimeSpikeSlashArc';
  spikeSlashArc.position.set(0, 1.38, 0.18);
  spikeSlashArc.rotation.y = Math.PI / 2;
  spikeSlashArc.visible = false;
  actionTrailGroup.add(spikeSlashArc);

  // Linhas de velocidade de anime (Speed Streaks) ao redor do atleta
  const speedStreaksGroup = new THREE.Group();
  speedStreaksGroup.name = 'AnimeSpeedStreaksGroup';
  const streakGeo = new THREE.ConeGeometry(0.028, 0.72, 6);
  const streakMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
  });
  const streakAccentMat = new THREE.MeshBasicMaterial({
    color: def.colors.accent,
    transparent: true,
    opacity: 0.84,
    depthWrite: false,
  });
  for (let i = 0; i < 6; i++) {
    const streak = new THREE.Mesh(streakGeo, i % 2 === 0 ? streakMat : streakAccentMat);
    const angle = (i / 6) * Math.PI * 2;
    streak.position.set(Math.cos(angle) * 0.42, 0.7 + (i % 3) * 0.34, -0.28 + Math.sin(angle) * 0.18);
    streak.rotation.x = -Math.PI / 2 + 0.25;
    speedStreaksGroup.add(streak);
  }
  speedStreaksGroup.visible = false;
  actionTrailGroup.add(speedStreaksGroup);

  // Chamas / Lâminas ascendentes de Aura de Poder (Super Attack / Ultimate)
  const powerAuraFlames = new THREE.Group();
  powerAuraFlames.name = 'AnimePowerAuraFlames';
  const flameGeo = createAnimeHairLockGeometry(0.45, 0.14, 0.025, 0.04);
  const flameMat = new THREE.MeshBasicMaterial({
    color: def.colors.aura,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  for (let i = 0; i < 5; i++) {
    const flame = new THREE.Mesh(flameGeo, flameMat);
    const angle = (i / 5) * Math.PI * 2;
    flame.position.set(Math.cos(angle) * 0.36, 0.25 + (i % 2) * 0.22, Math.sin(angle) * 0.32);
    flame.rotation.y = -angle;
    powerAuraFlames.add(flame);
  }
  powerAuraFlames.visible = false;
  actionTrailGroup.add(powerAuraFlames);

  // Aplica escala de proporção individual Shonen (sem afetar o collider físico Rapier)
  bodyGroup.scale.set(
    def.proportions.shoulderWidth * 0.96,
    def.proportions.heightScale,
    1.0,
  );

  return {
    root,
    bodyGroup,
    headGroup,
    headMesh,
    faceMaterials,
    currentExpression: 'normal',
    leftArm: leftArmBuilt.arm,
    rightArm: rightArmBuilt.arm,
    leftForearm: leftArmBuilt.forearm,
    rightForearm: rightArmBuilt.forearm,
    leftHand: leftArmBuilt.hand,
    rightHand: rightArmBuilt.hand,
    leftLeg: leftLegBuilt.leg,
    rightLeg: rightLegBuilt.leg,
    leftShin: leftLegBuilt.shin,
    rightShin: rightLegBuilt.shin,
    leftKneePad: leftLegBuilt.kneePad,
    rightKneePad: rightLegBuilt.kneePad,
    leftHighTopShoe: leftLegBuilt.highTopShoe,
    rightHighTopShoe: rightLegBuilt.highTopShoe,
    bandanaTailsGroup,
    actionTrailGroup,
    spikeSlashArc,
    speedStreaksGroup,
    powerAuraFlames,
    auraRing,
    contactShadow,
    teamIndicator,
    hitFlashMaterials: [jerseyMat, shortsMat, accentMat],
  };
}

/**
 * Aplica animação procedural atlética estilo anime com flexão de joelhos, cotovelos e squash-and-stretch.
 */
export function updateCharacterRigAnimation(
  rig: CharacterRig,
  anim: CharacterAnimState,
  time: number,
  animTimer: number,
  playerY: number,
  facingX: number,
  facingZ: number,
  ultimateActive: boolean,
  dt: number,
  animatorFrame?: ResolvedAnimatorFrame,
): void {
  const visualAnim = animatorFrame?.visualState ?? anim;
  const normT = animatorFrame ? animatorFrame.normalizedTime : Math.min(1, Math.max(0, animTimer * 3.2));

  // Orientação suave (no bloqueio, mantém frente alinhada à rede)
  const targetYaw = Math.atan2(facingX, facingZ);
  let diff = targetYaw - rig.bodyGroup.rotation.y;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  rig.bodyGroup.rotation.y += diff * Math.min(1, dt * 14);

  // Sombra fixa no chão mesmo quando o jogador pula
  rig.contactShadow.position.y = -playerY + 0.015;
  const shadowScale = Math.max(0.45, 1 - playerY * 0.16);
  rig.contactShadow.scale.setScalar(shadowScale);
  rig.teamIndicator.position.y = -playerY + 0.022;

  // Aura Ultimate e Chamas de Poder Anime Shonen
  rig.auraRing.visible = ultimateActive;
  rig.powerAuraFlames.visible = ultimateActive;
  if (ultimateActive) {
    rig.auraRing.rotation.z = time * 4;
    const pulse = 1 + Math.sin(time * 10) * 0.12;
    rig.auraRing.scale.set(pulse, pulse, 1);

    rig.powerAuraFlames.rotation.y = time * 3.5;
    for (let i = 0; i < rig.powerAuraFlames.children.length; i++) {
      const flame = rig.powerAuraFlames.children[i];
      const fPulse = 0.85 + Math.sin(time * 14 + i * 1.4) * 0.28;
      flame.scale.set(1, fPulse, 1);
    }
  }

  // Troca de Expressão Facial Anime Dinâmica (Zero GC: usa materiais pré-cacheados)
  let targetExpression: AnimeFacialExpression = animatorFrame?.expression ?? 'normal';
  if (
    ultimateActive ||
    visualAnim === 'spike' ||
    visualAnim === 'serve' ||
    visualAnim === 'serve_runup' ||
    visualAnim === 'block' ||
    visualAnim === 'shark_attack' ||
    visualAnim === 'header' ||
    visualAnim === 'stunned'
  ) {
    targetExpression = 'intense';
  } else if (
    visualAnim === 'run' ||
    visualAnim === 'jump' ||
    visualAnim === 'bump' ||
    visualAnim === 'set' ||
    visualAnim === 'dive' ||
    visualAnim === 'serve_toss'
  ) {
    targetExpression = 'focus';
  }
  if (rig.currentExpression !== targetExpression) {
    rig.currentExpression = targetExpression;
    rig.headMesh.material = rig.faceMaterials[targetExpression];
  }

  // Fitas da bandana/headband esvoaçando dinamicamente
  const tailFlutter =
    visualAnim === 'run' || visualAnim === 'serve_runup' || playerY > 0.1
      ? Math.sin(time * 18) * 0.25 + 0.35
      : Math.sin(time * 5) * 0.08;
  rig.bandanaTailsGroup.rotation.x = tailFlutter;

  // Rastro de Velocidade Anime (Speed Streaks) e Arco de Cortada (Slash Arc)
  const showSpeedStreaks =
    ultimateActive ||
    visualAnim === 'spike' ||
    visualAnim === 'serve' ||
    visualAnim === 'serve_runup' ||
    visualAnim === 'block' ||
    visualAnim === 'dive' ||
    visualAnim === 'shark_attack';
  rig.speedStreaksGroup.visible = showSpeedStreaks;
  if (showSpeedStreaks) {
    for (let i = 0; i < rig.speedStreaksGroup.children.length; i++) {
      const streak = rig.speedStreaksGroup.children[i];
      const sScale = 0.75 + Math.abs(Math.sin(time * 24 + i * 1.1)) * 0.65;
      streak.scale.set(1, sScale, 1);
    }
  }

  const showSlashArc =
    visualAnim === 'spike' ||
    visualAnim === 'serve' ||
    visualAnim === 'shark_attack';
  rig.spikeSlashArc.visible = showSlashArc;
  if (showSlashArc) {
    rig.spikeSlashArc.rotation.x = -0.8 + normT * 2.4;
    const arcScale = 0.9 + Math.sin(normT * Math.PI) * 0.35;
    rig.spikeSlashArc.scale.setScalar(arcScale);
  }

  // Base padrão (reset zero-GC das mãos e tronco)
  let targetScaleY = 1;
  let targetScaleXZ = 1;
  rig.bodyGroup.rotation.x = 0;
  rig.bodyGroup.position.y = 0;
  rig.leftHand.rotation.set(0, 0, 0);
  rig.rightHand.rotation.set(0, 0, 0);
  let customHeadPitch = false;

  if (visualAnim === 'idle') {
    // Postura atlética pronta de vôlei tradicional (joelhos flexionados e braços abertos)
    const breath = Math.sin(time * 4.2) * 0.018;
    rig.bodyGroup.position.y = -0.04 + breath;
    rig.bodyGroup.rotation.x = 0.14;

    rig.leftLeg.rotation.set(-0.28, 0, -0.18);
    rig.rightLeg.rotation.set(-0.22, 0, 0.18);
    rig.leftShin.rotation.set(0.44, 0, 0);
    rig.rightShin.rotation.set(0.36, 0, 0);

    rig.leftArm.rotation.set(-0.22 + Math.sin(time * 3.2) * 0.06, 0, -0.58);
    rig.rightArm.rotation.set(-0.22 - Math.sin(time * 3.2) * 0.06, 0, 0.58);
    rig.leftForearm.rotation.set(-0.55, 0, 0);
    rig.rightForearm.rotation.set(-0.55, 0, 0);
  } else if (visualAnim === 'run') {
    const cycle = time * 15;
    rig.bodyGroup.position.y = Math.abs(Math.sin(cycle)) * 0.08 - 0.03;
    rig.bodyGroup.rotation.x = 0.2;

    const lSwing = Math.sin(cycle);
    const rSwing = -lSwing;
    rig.leftLeg.rotation.set(lSwing * 0.72 - 0.15, 0, -0.05);
    rig.rightLeg.rotation.set(rSwing * 0.72 - 0.15, 0, 0.05);
    rig.leftShin.rotation.set(Math.max(0.15, -lSwing * 0.75 + 0.42), 0, 0);
    rig.rightShin.rotation.set(Math.max(0.15, -rSwing * 0.75 + 0.42), 0, 0);

    rig.leftArm.rotation.set(rSwing * 0.65, 0, -0.28);
    rig.rightArm.rotation.set(lSwing * 0.65, 0, 0.28);
    rig.leftForearm.rotation.set(-1.05, 0, 0);
    rig.rightForearm.rotation.set(-1.05, 0, 0);
  } else if (visualAnim === 'jump') {
    // Preparação aérea em arco (costas curvadas para trás estilo arco-e-flecha antes do impacto da cortada)
    const windup = animatorFrame?.spikePhase === 'windup' ? 1 : 0.78;
    const airFactor = Math.min(1, Math.max(0.25, playerY / 1.15));
    const bowIntensity = windup * airFactor;
    targetScaleY = 1.09;
    targetScaleXZ = 0.94;
    rig.bodyGroup.rotation.x = -0.36 * bowIntensity;
    rig.bodyGroup.position.y = 0.05 * bowIntensity;

    rig.rightArm.rotation.set(-3.12 * bowIntensity, -0.16 * bowIntensity, 0.42);
    rig.rightForearm.rotation.set(-1.12 * bowIntensity, 0, 0);
    rig.leftArm.rotation.set(-2.05 * bowIntensity, 0.12 * bowIntensity, -0.34);
    rig.leftForearm.rotation.set(-0.28, 0, 0);

    rig.leftLeg.rotation.set(0.44 * bowIntensity, 0, -0.08);
    rig.rightLeg.rotation.set(0.56 * bowIntensity, 0, 0.08);
    rig.leftShin.rotation.set(1.05 * bowIntensity, 0, 0);
    rig.rightShin.rotation.set(0.98 * bowIntensity, 0, 0);
  } else if (visualAnim === 'dive') {
    targetScaleY = 0.92;
    targetScaleXZ = 1.06;
    rig.bodyGroup.rotation.x = 1.2;
    rig.bodyGroup.position.y = 0.34;

    rig.leftArm.rotation.set(-2.65, 0, -0.15);
    rig.rightArm.rotation.set(-2.65, 0, 0.15);
    rig.leftForearm.rotation.set(-0.1, 0, 0);
    rig.rightForearm.rotation.set(-0.1, 0, 0);

    rig.leftLeg.rotation.set(0.25, 0, -0.06);
    rig.rightLeg.rotation.set(0.25, 0, 0.06);
    rig.leftShin.rotation.set(0.3, 0, 0);
    rig.rightShin.rotation.set(0.3, 0, 0);
  } else if (visualAnim === 'preparing_serve') {
    // PREPARING SERVE (Hold to Charge): segura a bola à frente com a mão esquerda e arma o braço direito
    const chargePulse = Math.sin(time * 9.0) * 0.035;
    rig.bodyGroup.rotation.x = 0.08;
    rig.bodyGroup.position.y = -0.05 + chargePulse;
    customHeadPitch = true;
    rig.headGroup.rotation.x = -0.06;

    rig.leftArm.rotation.set(-1.35 + chargePulse, 0, -0.18);
    rig.leftForearm.rotation.set(-0.28, 0, 0);
    rig.leftHand.rotation.set(-0.22, 0, 0);

    rig.rightArm.rotation.set(0.55 - chargePulse * 1.5, 0, 0.38);
    rig.rightForearm.rotation.set(-0.85, 0, 0);

    rig.leftLeg.rotation.set(-0.34, 0, -0.12);
    rig.rightLeg.rotation.set(0.24, 0, 0.12);
    rig.leftShin.rotation.set(0.46, 0, 0);
    rig.rightShin.rotation.set(0.32, 0, 0);
  } else if (visualAnim === 'serve_toss') {
    // SAQUE VIAGEM — FASE 1 (Toss atrás da linha): lança a bola alto no eixo Y e acompanha com o olhar
    const toss = Math.sin(Math.min(1, normT * 1.15) * Math.PI);
    rig.bodyGroup.rotation.x = -0.14;
    rig.bodyGroup.position.y = -0.04 + 0.06 * toss;
    customHeadPitch = true;
    rig.headGroup.rotation.x = -0.28 - toss * 0.22;

    rig.leftArm.rotation.set(-2.45 - toss * 0.42, 0, -0.14);
    rig.leftForearm.rotation.set(-0.12, 0, 0);
    rig.leftHand.rotation.set(-0.35, 0, 0);

    rig.rightArm.rotation.set(0.65, 0, 0.42);
    rig.rightForearm.rotation.set(-0.95, 0, 0);

    rig.leftLeg.rotation.set(-0.32, 0, -0.1);
    rig.rightLeg.rotation.set(0.22, 0, 0.1);
    rig.leftShin.rotation.set(0.42, 0, 0);
    rig.rightShin.rotation.set(0.28, 0, 0);
  } else if (visualAnim === 'serve_runup') {
    // SAQUE VIAGEM — FASE 2 (Run-up 2 passadas + Salto vertical intenso)
    if (normT < 0.56) {
      // 2 passadas curtas de aproximação com braços lançados para trás (arm swing preparation)
      const stride = Math.sin((normT / 0.56) * Math.PI * 2);
      rig.bodyGroup.position.y = -0.08 + Math.abs(stride) * 0.06;
      rig.bodyGroup.rotation.x = 0.26;
      rig.leftLeg.rotation.set(stride * 0.78 - 0.15, 0, -0.06);
      rig.rightLeg.rotation.set(-stride * 0.78 - 0.15, 0, 0.06);
      rig.leftShin.rotation.set(Math.max(0.2, -stride * 0.65 + 0.45), 0, 0);
      rig.rightShin.rotation.set(Math.max(0.2, stride * 0.65 + 0.45), 0, 0);

      rig.leftArm.rotation.set(0.85, 0, -0.26);
      rig.rightArm.rotation.set(0.95, 0, 0.26);
      rig.leftForearm.rotation.set(-0.22, 0, 0);
      rig.rightForearm.rotation.set(-0.22, 0, 0);
    } else {
      // Impulsão e salto vertical intenso (carregamento de arco no ar)
      const leap = (normT - 0.56) / 0.44;
      targetScaleY = 1.06 + leap * 0.08;
      targetScaleXZ = 0.94;
      rig.bodyGroup.position.y = 0.04 * leap;
      rig.bodyGroup.rotation.x = -0.22 * leap;
      customHeadPitch = true;
      rig.headGroup.rotation.x = -0.26;

      rig.leftArm.rotation.set(-2.35 * leap, 0, -0.28);
      rig.rightArm.rotation.set(-2.85 * leap, 0, 0.36);
      rig.leftForearm.rotation.set(-0.2, 0, 0);
      rig.rightForearm.rotation.set(-0.85 * leap, 0, 0);

      rig.leftLeg.rotation.set(-0.35 + leap * 0.65, 0, -0.08);
      rig.rightLeg.rotation.set(-0.32 + leap * 0.75, 0, 0.08);
      rig.leftShin.rotation.set(0.65 + leap * 0.45, 0, 0);
      rig.rightShin.rotation.set(0.65 + leap * 0.45, 0, 0);
    }
  } else if (visualAnim === 'serve') {
    // SAQUE VIAGEM — FASE 3 (Hit): braço vai atrás, arqueia o corpo e chicoteia para frente no impacto
    const whip = normT < 0.32 ? normT / 0.32 : 1;
    const snap = normT < 0.32 ? 0 : Math.min(1, (normT - 0.32) / 0.38);
    targetScaleY = 1 + Math.sin(whip * Math.PI) * 0.14;
    targetScaleXZ = 1 - Math.sin(whip * Math.PI) * 0.06;

    // Arqueia para trás (-0.36) e chicoteia para frente (+0.48) na colisão
    rig.bodyGroup.rotation.x = -0.36 * (1 - snap) + 0.48 * snap;

    rig.rightArm.rotation.set(-3.25 + snap * 3.55, 0, 0.22);
    rig.rightForearm.rotation.set(-0.95 * (1 - snap) - 0.08 * snap, 0, 0);
    rig.rightHand.rotation.set(0.35 * snap, 0, 0);

    rig.leftArm.rotation.set(-1.35 + snap * 1.15, 0, -0.38);
    rig.leftForearm.rotation.set(-0.45, 0, 0);

    rig.leftLeg.rotation.set(0.38 * (1 - snap) - 0.32 * snap, 0, -0.08);
    rig.rightLeg.rotation.set(0.45 * (1 - snap) - 0.18 * snap, 0, 0.08);
    rig.leftShin.rotation.set(0.9 * (1 - snap) + 0.35 * snap, 0, 0);
    rig.rightShin.rotation.set(0.85 * (1 - snap) + 0.3 * snap, 0, 0);
  } else if (visualAnim === 'bump') {
    // DEFESA / MANCHETE (1º Toque): centro de gravidade bem baixo, mãos unidas, braços esticados e alavanca para cima
    const lift = animatorFrame?.receivePhase === 'lever_lift'
      ? Math.sin(Math.min(1, (normT - 0.32) / 0.68) * Math.PI)
      : 0;
    rig.bodyGroup.position.y = -0.22 + lift * 0.11;
    rig.bodyGroup.rotation.x = 0.44 - lift * 0.12;
    customHeadPitch = true;
    rig.headGroup.rotation.x = -0.3;

    // Braços esticados para frente com mãos juntas (plataforma firme de manchete)
    rig.leftArm.rotation.set(-0.96 - lift * 0.36, 0.18, 0.44);
    rig.rightArm.rotation.set(-0.96 - lift * 0.36, -0.18, -0.44);
    rig.leftForearm.rotation.set(-0.04, 0, 0);
    rig.rightForearm.rotation.set(-0.04, 0, 0);
    rig.leftHand.rotation.set(0.25, 0.3, 0.25);
    rig.rightHand.rotation.set(0.25, -0.3, -0.25);

    // Flexão profunda de joelhos
    rig.leftLeg.rotation.set(-0.78 + lift * 0.18, 0, -0.2);
    rig.rightLeg.rotation.set(-0.72 + lift * 0.18, 0, 0.2);
    rig.leftShin.rotation.set(1.22 - lift * 0.22, 0, 0);
    rig.rightShin.rotation.set(1.14 - lift * 0.22, 0, 0);
  } else if (visualAnim === 'set') {
    // LEVANTAMENTO (2º Toque — High Set): mãos acima da cabeça em concha + impulsão rápida dos dedos
    const isPush = animatorFrame?.setPhase === 'finger_push' || normT >= 0.36;
    const push = isPush ? Math.sin(Math.min(1, (normT - 0.36) / 0.64) * Math.PI * 0.75) : 0;

    rig.bodyGroup.position.y = -0.1 + push * 0.16;
    rig.bodyGroup.rotation.x = -0.08;
    customHeadPitch = true;
    rig.headGroup.rotation.x = -0.38;

    // Fase concha -> extensão rápida para cima
    rig.leftArm.rotation.set(-2.22 - push * 0.65, 0.12, -0.24 + push * 0.08);
    rig.rightArm.rotation.set(-2.22 - push * 0.65, -0.12, 0.24 - push * 0.08);
    rig.leftForearm.rotation.set(-1.12 + push * 0.88, 0, 0);
    rig.rightForearm.rotation.set(-1.12 + push * 0.88, 0, 0);
    rig.leftHand.rotation.set(-0.55 + push * 0.85, 0.22, 0.18);
    rig.rightHand.rotation.set(-0.55 + push * 0.85, -0.22, -0.18);

    rig.leftLeg.rotation.set(-0.46 + push * 0.32, 0, -0.14);
    rig.rightLeg.rotation.set(-0.42 + push * 0.32, 0, 0.14);
    rig.leftShin.rotation.set(0.76 - push * 0.48, 0, 0);
    rig.rightShin.rotation.set(0.7 - push * 0.48, 0, 0);
  } else if (visualAnim === 'spike') {
    // ATAQUE / CORTADA PROFISSIONAL (Envergadura no Ar -> Chicote Explosivo):
    // Fase 1 (normT < 0.28): Envergadura de arco no ar (tronco arqueado para trás, peito aberto e braço armado atrás da nuca)
    // Fase 2 (normT >= 0.28): Chicoteia o tronco e o braço para frente com alta velocidade angular no momento do impacto
    const windupEnd = 0.28;
    const isWindupBow = normT < windupEnd;
    const rawWhip = isWindupBow ? 0 : Math.min(1, (normT - windupEnd) / 0.44);
    // Ease-out cúbico para dar explosão instantânea na saída do chicote
    const snap = 1 - Math.pow(1 - rawWhip, 3);
    const bowCharge = isWindupBow ? Math.sin((normT / windupEnd) * (Math.PI * 0.5)) : 1;

    targetScaleY = isWindupBow ? 1.06 + bowCharge * 0.08 : 1.15 - snap * 0.09;
    targetScaleXZ = isWindupBow ? 0.94 - bowCharge * 0.02 : 0.92 + snap * 0.07;

    // Envergadura dorsal profunda (-0.48 rad) -> chicote explosivo abdominal para frente (+0.52 rad)
    const archBack = -0.32 - bowCharge * 0.16;
    rig.bodyGroup.rotation.x = isWindupBow ? archBack : -0.48 + snap * 1.0;
    rig.bodyGroup.position.y = isWindupBow ? 0.07 * bowCharge : 0.07 * (1 - snap);

    // Braço de ataque puxa bem para trás da cabeça na envergadura e chicoteia em arco até a frente
    rig.rightArm.rotation.set(
      isWindupBow ? -2.95 - bowCharge * 0.45 : -3.4 + snap * 3.68,
      isWindupBow ? -0.22 * bowCharge : -0.22 * (1 - snap),
      0.28,
    );
    rig.rightForearm.rotation.set(
      isWindupBow ? -1.0 - bowCharge * 0.28 : -1.28 + snap * 1.22,
      0,
      0,
    );
    rig.rightHand.rotation.set(isWindupBow ? -0.25 * bowCharge : -0.25 + snap * 0.82, 0, 0);

    // Braço guia (esquerdo) aponta para a bola na envergadura e puxa para baixo/trás para gerar torque no chicote
    rig.leftArm.rotation.set(
      isWindupBow ? -1.95 - bowCharge * 0.25 : -2.2 + snap * 1.85,
      0,
      -0.42,
    );
    rig.leftForearm.rotation.set(-0.48, 0, 0);

    // Pernas arqueadas para trás em "C" na preparação aérea e chutam à frente no impacto (efeito canivete)
    rig.leftLeg.rotation.set(isWindupBow ? 0.42 + bowCharge * 0.14 : 0.56 - snap * 0.92, 0, -0.08);
    rig.rightLeg.rotation.set(isWindupBow ? 0.52 + bowCharge * 0.14 : 0.66 - snap * 0.88, 0, 0.08);
    rig.leftShin.rotation.set(isWindupBow ? 0.95 + bowCharge * 0.18 : 1.13 - snap * 0.72, 0, 0);
    rig.rightShin.rotation.set(isWindupBow ? 0.9 + bowCharge * 0.18 : 1.08 - snap * 0.72, 0, 0);
  } else if (visualAnim === 'shark_attack') {
    const kick = Math.sin(Math.min(1, animTimer * 6.5) * Math.PI);
    targetScaleY = 0.94;
    targetScaleXZ = 1.06;
    rig.bodyGroup.rotation.x = -0.55 - kick * 0.65;
    rig.bodyGroup.position.y = 0.16;

    rig.rightLeg.rotation.set(-2.05 - kick * 0.45, 0, 0.25);
    rig.rightShin.rotation.set(0.15, 0, 0);
    rig.leftLeg.rotation.set(0.35, 0, -0.22);
    rig.leftShin.rotation.set(0.85, 0, 0);

    rig.leftArm.rotation.set(-0.9, 0, -0.75);
    rig.rightArm.rotation.set(0.45, 0, 0.65);
    rig.leftForearm.rotation.set(-0.4, 0, 0);
    rig.rightForearm.rotation.set(-0.4, 0, 0);
  } else if (visualAnim === 'header') {
    const thrust = Math.sin(Math.min(1, animTimer * 7) * Math.PI);
    rig.bodyGroup.rotation.x = 0.55 * thrust;
    rig.bodyGroup.position.y = 0.06;
    customHeadPitch = true;
    rig.headGroup.rotation.x = -0.35 * thrust;

    rig.leftArm.rotation.set(0.35, 0, -0.55);
    rig.rightArm.rotation.set(0.35, 0, 0.55);
    rig.leftForearm.rotation.set(-0.6, 0, 0);
    rig.rightForearm.rotation.set(-0.6, 0, 0);
    rig.leftLeg.rotation.set(-0.25, 0, -0.14);
    rig.rightLeg.rotation.set(0.2, 0, 0.14);
    rig.leftShin.rotation.set(0.4, 0, 0);
    rig.rightShin.rotation.set(0.3, 0, 0);
  } else if (visualAnim === 'block') {
    // BLOQUEIO NA REDE: salto estritamente vertical, braços 100% esticados para cima e inclinados invadindo o plano da rede
    targetScaleY = 1.12;
    targetScaleXZ = 0.95;
    rig.bodyGroup.rotation.x = 0.06;

    rig.leftArm.rotation.set(-2.96, 0, -0.1);
    rig.rightArm.rotation.set(-2.96, 0, 0.1);
    rig.leftForearm.rotation.set(-0.04, 0, 0);
    rig.rightForearm.rotation.set(-0.04, 0, 0);
    // Mãos abertas e inclinadas à frente sobre a borda superior da rede para fechar o ângulo
    rig.leftHand.rotation.set(0.42, 0, 0);
    rig.rightHand.rotation.set(0.42, 0, 0);

    // Pernas paralelas retas no salto vertical
    rig.leftLeg.rotation.set(-0.06, 0, -0.07);
    rig.rightLeg.rotation.set(-0.06, 0, 0.07);
    rig.leftShin.rotation.set(0.14, 0, 0);
    rig.rightShin.rotation.set(0.14, 0, 0);
  } else if (visualAnim === 'stunned') {
    rig.bodyGroup.rotation.x = 1.25;
    rig.bodyGroup.position.y = -0.22;
    rig.headGroup.rotation.z = Math.sin(time * 18) * 0.28;
    rig.leftArm.rotation.set(-0.4, 0, -0.95);
    rig.rightArm.rotation.set(-0.4, 0, 0.95);
    rig.leftForearm.rotation.set(-0.3, 0, 0);
    rig.rightForearm.rotation.set(-0.3, 0, 0);
    rig.leftLeg.rotation.set(-0.1, 0, -0.2);
    rig.rightLeg.rotation.set(-0.1, 0, 0.2);
    rig.leftShin.rotation.set(0.2, 0, 0);
    rig.rightShin.rotation.set(0.2, 0, 0);
  } else if (visualAnim === 'celebrate') {
    const hop = Math.abs(Math.sin(time * 9)) * 0.32;
    rig.bodyGroup.position.y = hop;
    rig.leftArm.rotation.set(-2.75, 0, -0.38);
    rig.rightArm.rotation.set(-2.75, 0, 0.38);
    rig.leftForearm.rotation.set(-0.4, 0, 0);
    rig.rightForearm.rotation.set(-0.4, 0, 0);
    rig.leftLeg.rotation.set(Math.sin(time * 9) * 0.25, 0, -0.08);
    rig.rightLeg.rotation.set(-Math.sin(time * 9) * 0.25, 0, 0.08);
    rig.leftShin.rotation.set(0.25, 0, 0);
    rig.rightShin.rotation.set(0.25, 0, 0);
  } else if (visualAnim === 'lose') {
    rig.bodyGroup.rotation.x = 0.45;
    rig.bodyGroup.position.y = -0.08;
    rig.leftArm.rotation.set(0.25, 0, -0.15);
    rig.rightArm.rotation.set(0.25, 0, 0.15);
    rig.leftForearm.rotation.set(-0.5, 0, 0);
    rig.rightForearm.rotation.set(-0.5, 0, 0);
    rig.leftLeg.rotation.set(-0.3, 0, -0.1);
    rig.rightLeg.rotation.set(-0.3, 0, 0.1);
    rig.leftShin.rotation.set(0.55, 0, 0);
    rig.rightShin.rotation.set(0.55, 0, 0);
    customHeadPitch = true;
    rig.headGroup.rotation.x = 0.25;
  }

  if (!customHeadPitch) {
    rig.headGroup.rotation.x = -rig.bodyGroup.rotation.x * 0.45;
  }
  if (visualAnim !== 'stunned') {
    rig.headGroup.rotation.z = 0;
  }

  const damp = 1 - Math.exp(-16 * dt);
  rig.bodyGroup.scale.x = THREE.MathUtils.lerp(rig.bodyGroup.scale.x, targetScaleXZ, damp);
  rig.bodyGroup.scale.y = THREE.MathUtils.lerp(rig.bodyGroup.scale.y, targetScaleY, damp);
  rig.bodyGroup.scale.z = THREE.MathUtils.lerp(rig.bodyGroup.scale.z, targetScaleXZ, damp);
}

