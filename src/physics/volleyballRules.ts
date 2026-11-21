/**
 * Spike Legends Online — Regras Puras de Vôlei, Física de Golpe, Ranking, IA e Anti-Cheat.
 * Módulo 100% puro e determinístico para testes unitários rápidos via node:test.
 */
import {
  ANTI_CHEAT,
  COURT,
  DIFFICULTY_TUNING,
  MATCH_RULES,
  PHYSICS,
  RANK_TIERS,
  type AiDifficulty,
  type AimDirection,
  type RankTierInfo,
  type ReceiveQuality,
  type ServeType,
  type TeamSide,
} from '../config/gameConfig.ts';

export interface ScoreState {
  left: number;
  right: number;
  servingTeam: TeamSide;
  winner: TeamSide | null;
  pointNumber: number;
  targetPoints: number;
}

export function createMatchScoreState(
  initialServe: TeamSide = 'left',
  targetPoints: number = MATCH_RULES.POINTS_TO_WIN,
): ScoreState {
  return {
    left: 0,
    right: 0,
    servingTeam: initialServe,
    winner: null,
    pointNumber: 1,
    targetPoints,
  };
}

/**
 * Verifica se há vencedor segundo as regras oficiais:
 * Primeiro a 15 ou 21 pontos vence, exigindo vantagem mínima de 2 pontos em caso de empate.
 */
export function checkMatchWinner(
  left: number,
  right: number,
  targetPoints: number = MATCH_RULES.POINTS_TO_WIN,
): TeamSide | null {
  if (left >= targetPoints && left - right >= MATCH_RULES.MIN_LEAD) {
    return 'left';
  }
  if (right >= targetPoints && right - left >= MATCH_RULES.MIN_LEAD) {
    return 'right';
  }
  return null;
}

export function awardPoint(state: ScoreState, scoringTeam: TeamSide): ScoreState {
  if (state.winner !== null) return state;
  const nextLeft = scoringTeam === 'left' ? state.left + 1 : state.left;
  const nextRight = scoringTeam === 'right' ? state.right + 1 : state.right;
  const targetPoints = state.targetPoints || MATCH_RULES.POINTS_TO_WIN;
  const winner = checkMatchWinner(nextLeft, nextRight, targetPoints);

  return {
    left: nextLeft,
    right: nextRight,
    servingTeam: scoringTeam,
    winner,
    pointNumber: state.pointNumber + 1,
    targetPoints,
  };
}

/**
 * Determina qual lado marca ponto quando a bola toca o chão em (x, z).
 * Se cair fora da quadra, o ponto vai para a equipe contrária ao último toque.
 */
export function resolveBallLandingTeam(
  ballX: number,
  ballZ: number,
  lastTouchTeam: TeamSide,
): TeamSide {
  const inBoundsX = Math.abs(ballX) <= COURT.HALF_WIDTH + 0.15;
  const inBoundsZ = Math.abs(ballZ) <= COURT.HALF_DEPTH + 0.15;

  if (!inBoundsX || !inBoundsZ) {
    return lastTouchTeam === 'left' ? 'right' : 'left';
  }

  return ballX < 0 ? 'right' : 'left';
}

export function calculateRankTier(elo: number): RankTierInfo {
  let matched = RANK_TIERS[0];
  for (const tier of RANK_TIERS) {
    if (elo >= tier.minElo) {
      matched = tier;
    }
  }
  return matched;
}

export function calculateEloDelta(playerElo: number, opponentElo: number, won: boolean): number {
  const k = 28;
  const expected = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
  const actual = won ? 1 : 0;
  return Math.round(k * (actual - expected));
}

const BANNED_WORDS = [
  'porra',
  'caralho',
  'merda',
  'puta',
  'fdp',
  'desgraca',
  'desgraça',
  'arrombado',
  'viado',
  'bosta',
  'cuzao',
  'cuzão',
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'idiot',
];

export function filterProfanity(rawText: string): string {
  const trimmed = rawText.trim().slice(0, ANTI_CHEAT.MAX_CHAT_LENGTH);
  if (!trimmed) return '';
  let result = trimmed;
  for (const word of BANNED_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    result = result.replace(regex, (match) => '*'.repeat(match.length));
  }
  return result;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * Validação anti-cheat no servidor: impede teleporte ou velocidade acima do permitido.
 */
export function clampServerMovementStep(
  prev: Vec3Like,
  proposed: Vec3Like,
  maxStep: number = ANTI_CHEAT.MAX_STEP_DISTANCE,
): Vec3Like {
  const dx = proposed.x - prev.x;
  const dz = proposed.z - prev.z;
  const distSq = dx * dx + dz * dz;
  if (distSq <= maxStep * maxStep) {
    return proposed;
  }
  const dist = Math.sqrt(distSq);
  const scale = maxStep / dist;
  return {
    x: prev.x + dx * scale,
    y: proposed.y,
    z: prev.z + dz * scale,
  };
}

export interface ImpulseResult {
  vx: number;
  vy: number;
  vz: number;
  spinX: number;
  spinZ: number;
}

export interface SpikeImpulseOptions {
  attackStat?: number;
  aim?: AimDirection | 'overpower_out';
  isPerfectApex?: boolean;
  targetDepthX?: number;
  powerMultiplier?: number;
  /** Coordenada exata do ponteiro no mundo (ScreenToWorldPoint) para o ataque ir exatamente onde o mouse aponta */
  mouseTargetWorldPos?: { x: number; y: number };
}

/**
 * Calcula impulso de ataque (Cortada / Shark Attack / Cabeceio / Largadinha) com mira exata pelo mouse
 * (ScreenToWorldPoint) e escalonamento pelo atributo Ataque + timing no ápice do salto.
 */
export function computeSpikeImpulse(
  playerPos: Vec3Like,
  ballPos: Vec3Like,
  team: TeamSide,
  _aimZ: number,
  isJumping: boolean,
  isUltimate: boolean,
  options?: SpikeImpulseOptions,
): ImpulseResult {
  const dirX = team === 'left' ? 1 : -1;
  const aim = options?.aim ?? 'parallel';
  const statMult = options?.attackStat ? 0.72 + (options.attackStat / 100) * 0.28 : 1.0;
  const extMult = options?.powerMultiplier ?? 1.0;
  const apexMult = options?.isPerfectApex ? 1.18 : 1.0;

  if (aim === 'overpower_out') {
    // Erro humano da IA: força desproporcional isola a bola para fora da linha de fundo
    const outTargetX = dirX * (COURT.HALF_WIDTH + 1.85);
    const dx = outTargetX - ballPos.x;
    const speed = 23.5;
    const flightTime = Math.max(0.42, Math.abs(dx) / speed);
    const vy = (0.3 - ballPos.y - 0.5 * PHYSICS.GRAVITY * flightTime * flightTime) / flightTime;
    return {
      vx: Math.sign(dx || dirX) * speed,
      vy: Math.max(5.5, Math.min(11.8, vy)),
      vz: 0,
      spinX: 0,
      spinZ: -dirX * 30,
    };
  }

  // Mira exata pela coordenada do mouse no mundo (ScreenToWorldPoint)
  const rawMouse = options?.mouseTargetWorldPos;
  if (rawMouse && Number.isFinite(rawMouse.x) && Number.isFinite(rawMouse.y)) {
    // Garante que o alvo X aponta para o lado adversário respeitando distância mínima para cruzar a rede
    const targetX =
      Math.sign(rawMouse.x) === dirX && Math.abs(rawMouse.x) >= 0.45
        ? Math.max(-COURT.HALF_WIDTH - 1.8, Math.min(COURT.HALF_WIDTH + 1.8, rawMouse.x))
        : dirX * Math.max(0.75, Math.min(COURT.HALF_WIDTH + 1.5, Math.abs(rawMouse.x) || 4.8));
    // O centro da bola nunca fica abaixo do seu próprio raio no chão
    const targetY = Math.max(PHYSICS.BALL_RADIUS, Math.min(5.2, rawMouse.y));

    const dx = targetX - ballPos.x;
    const dy = targetY - ballPos.y;
    const distHoriz = Math.max(0.6, Math.abs(dx));

    const desiredHorizSpeed =
      (isJumping ? (isUltimate ? 20.5 : 18.2) : 14.5) *
      statMult *
      extMult *
      apexMult *
      (0.75 + 0.35 * Math.min(1, distHoriz / 7.5));

    const solveBallistic = (t: number) => {
      // Compensa linearDamping (BALL_AIR_DRAG) para que a bola alcance exatamente targetX e targetY no Rapier
      const k = PHYSICS.BALL_AIR_DRAG;
      const dampScale = k > 0 ? (k * t) / Math.max(1e-4, 1 - Math.exp(-k * t)) : 1;
      const vxSolved = (dx / t) * dampScale;
      const vySolved = ((dy - 0.5 * PHYSICS.GRAVITY * t * t) / t) * (1 + 0.35 * k * t);
      return { vx: vxSolved, vy: vySolved };
    };

    let flightTime = Math.max(0.16, Math.min(0.92, distHoriz / Math.max(8.0, desiredHorizSpeed)));
    let solved = solveBallistic(flightTime);

    // Se cruzar a rede (x = 0), garante que a borda inferior da bola passe acima da fita mantendo o destino EXATO (targetX, targetY)
    const crossesNet = (ballPos.x < 0 && targetX > 0) || (ballPos.x > 0 && targetX < 0);
    if (crossesNet) {
      const minCenterYAtNet = COURT.NET_HEIGHT + PHYSICS.BALL_RADIUS + 0.06;
      for (let attempt = 0; attempt < 18; attempt++) {
        const tNet = (Math.abs(ballPos.x) / Math.max(0.1, Math.abs(dx))) * flightTime;
        const yAtNet = ballPos.y + solved.vy * tNet + 0.5 * PHYSICS.GRAVITY * tNet * tNet;
        if (yAtNet >= minCenterYAtNet) break;
        flightTime = Math.min(1.35, flightTime + 0.045);
        solved = solveBallistic(flightTime);
      }
    }

    return {
      vx: solved.vx,
      vy: solved.vy,
      vz: 0,
      spinX: 0,
      // Mantém giro visual limpo sem acionar impulso Magnus extra que desviaria da coordenada exata do mouse
      spinZ: -dirX * 9,
    };
  }

  if (aim === 'dink') {
    // Largadinha curta no centro logo após a rede para punir defesa recuada (garante passar a rede)
    const dinkTargetX = options?.targetDepthX ?? dirX * 2.4;
    const dx = dinkTargetX - ballPos.x;
    const k = PHYSICS.BALL_AIR_DRAG;
    const crossesNet = (ballPos.x < 0 && dinkTargetX > 0) || (ballPos.x > 0 && dinkTargetX < 0);
    let flightTime = 0.72;
    let vx = (dx / flightTime) * ((k * flightTime) / Math.max(1e-4, 1 - Math.exp(-k * flightTime)));
    let vy = ((0.18 - ballPos.y - 0.5 * PHYSICS.GRAVITY * flightTime * flightTime) / flightTime) * (1 + 0.35 * k * flightTime);

    if (crossesNet) {
      const minCenterYAtNet = COURT.NET_HEIGHT + PHYSICS.BALL_RADIUS + 0.14;
      for (let attempt = 0; attempt < 16; attempt++) {
        const tNet = (Math.abs(ballPos.x) / Math.max(0.1, Math.abs(dx))) * flightTime;
        const yAtNet = ballPos.y + vy * tNet + 0.5 * PHYSICS.GRAVITY * tNet * tNet;
        if (yAtNet >= minCenterYAtNet) break;
        flightTime = Math.min(1.28, flightTime + 0.055);
        vx = (dx / flightTime) * ((k * flightTime) / Math.max(1e-4, 1 - Math.exp(-k * flightTime)));
        vy = ((0.18 - ballPos.y - 0.5 * PHYSICS.GRAVITY * flightTime * flightTime) / flightTime) * (1 + 0.35 * k * flightTime);
      }
    }

    return {
      vx,
      vy: Math.max(6.4, Math.min(12.2, vy)),
      vz: 0,
      spinX: 0,
      spinZ: -dirX * 8,
    };
  }

  // Bola permanece estritamente no centro (Z = 0); variação tática ocorre na profundidade X (quadra 25m)
  const defaultDepth =
    aim === 'diagonal'
      ? COURT.HALF_WIDTH * 0.78
      : isJumping
        ? COURT.HALF_WIDTH * 0.64
        : COURT.HALF_WIDTH * 0.56;
  const targetX = options?.targetDepthX ?? dirX * defaultDepth;

  const dx = targetX - ballPos.x;
  const dist = Math.max(1.5, Math.abs(dx));

  const baseSpeed = (isJumping ? (isUltimate ? 18.8 : 16.6) : 13.8) * statMult * extMult * apexMult;
  const clampedSpeed = Math.min(28.0, baseSpeed);
  const flightTime = dist / clampedSpeed;

  const minClearY = Math.max(ballPos.y, COURT.NET_HEIGHT + 0.52);
  const peakBoost = isJumping && ballPos.y > COURT.NET_HEIGHT + 0.25 ? 2.4 : 6.6;
  let vy = Math.max(
    (minClearY - ballPos.y) / Math.max(0.22, flightTime * 0.45) + 1.8,
    peakBoost + (playerPos.y > 0.2 ? 0.5 : 0),
  );

  // Garante passagem segura acima da fita da rede (x = 0) quando o golpe cruza para a quadra rival
  const crossesNet = (ballPos.x < 0 && targetX > 0) || (ballPos.x > 0 && targetX < 0);
  if (crossesNet) {
    const tNet = Math.abs(ballPos.x) / Math.max(4.0, clampedSpeed);
    const minCenterYAtNet = COURT.NET_HEIGHT + PHYSICS.BALL_RADIUS + 0.14;
    const reqVy = (minCenterYAtNet - ballPos.y - 0.5 * PHYSICS.GRAVITY * tNet * tNet) / Math.max(0.05, tNet);
    if (reqVy > vy) {
      vy = reqVy;
    }
  }

  return {
    vx: Math.sign(dx || dirX) * clampedSpeed,
    vy: Math.min(Math.max(vy, 2.2), 12.6),
    vz: 0,
    spinX: 0,
    spinZ: -dirX * 26 * apexMult,
  };
}

export interface ReceiveImpulseOptions {
  quality?: ReceiveQuality;
  isQuickTempo?: boolean;
  isSetter?: boolean;
  attackerPos?: Vec3Like;
  setterPos?: Vec3Like;
}

/**
 * Calcula impulso de recepção ou levantamento parabólico (bola alta ou rápida "tempo e meia").
 * Mantém a bola sempre no eixo central (vz = 0) para foco em recepção, bloqueio e ataque.
 */
export function computeReceiveImpulse(
  _playerPos: Vec3Like,
  ballPos: Vec3Like,
  team: TeamSide,
  touchesOnSide: number,
  options?: ReceiveImpulseOptions,
): ImpulseResult {
  const dirX = team === 'left' ? 1 : -1;
  const quality = options?.quality ?? 'good';
  const sendOverNet = touchesOnSide >= PHYSICS.MAX_TOUCHES_PER_SIDE - 1;

  if (!sendOverNet && !options?.isSetter && quality === 'imprecise') {
    // Recepção imprecisa: arco instável em X no centro da quadra (sem ir para os lados)
    const wildX = -dirX * (4.2 + Math.random() * 2.4);
    const flightTime = 0.88;
    const vy = (1.5 - ballPos.y - 0.5 * PHYSICS.GRAVITY * flightTime * flightTime) / flightTime;
    return {
      vx: (wildX - ballPos.x) / flightTime,
      vy: Math.max(7.4, Math.min(12.6, vy)),
      vz: 0,
      spinX: 0,
      spinZ: -dirX * 11,
    };
  }

  // Toque 2 (Levantamento / Set): bola alta parabólica próxima à rede (±0.95m) para preparar o Toque 3 (Spike)
  if (!sendOverNet && (touchesOnSide === 1 || options?.isSetter)) {
    const targetX = -dirX * 0.95;
    const dx = targetX - ballPos.x;
    const flightTime = 1.38;
    const targetHitY = 2.7;
    const k = PHYSICS.BALL_AIR_DRAG;
    const dampScale = k > 0 ? (k * flightTime) / Math.max(1e-4, 1 - Math.exp(-k * flightTime)) : 1;
    const vy = (targetHitY - ballPos.y - 0.5 * PHYSICS.GRAVITY * flightTime * flightTime) / flightTime;
    return {
      vx: (dx / flightTime) * dampScale,
      vy: Math.max(12.4, Math.min(17.4, vy)),
      vz: 0,
      spinX: 0,
      spinZ: -dirX * 3.5,
    };
  }

  // Toque 1 (Recepção): direciona a bola para a posição do Levantador (Bot B / Parceiro perto da rede ±1.45m)
  // Toque 3 defensivo (sendOverNet): envia sobre a rede
  const setterTargetX = options?.setterPos
    ? Math.max(
        team === 'left' ? -3.2 : 0.85,
        Math.min(team === 'left' ? -0.85 : 3.2, options.setterPos.x),
      )
    : -dirX * 1.45;
  const targetX = sendOverNet
    ? dirX * (COURT.HALF_WIDTH * 0.58)
    : quality === 'perfect'
      ? setterTargetX
      : -dirX * 1.85;

  const dx = targetX - ballPos.x;
  const flightTime = sendOverNet ? 1.28 : quality === 'perfect' ? 1.16 : 1.08;
  const targetY = sendOverNet ? 0.85 : quality === 'perfect' ? 2.25 : 1.75;
  const k = PHYSICS.BALL_AIR_DRAG;
  const dampScale = k > 0 ? (k * flightTime) / Math.max(1e-4, 1 - Math.exp(-k * flightTime)) : 1;
  let vy = (targetY - ballPos.y - 0.5 * PHYSICS.GRAVITY * flightTime * flightTime) / flightTime;
  if (sendOverNet) {
    const tNet = (Math.abs(ballPos.x) / Math.max(0.5, Math.abs(dx))) * flightTime;
    const reqVy = (COURT.NET_HEIGHT + PHYSICS.BALL_RADIUS + 0.3 - ballPos.y - 0.5 * PHYSICS.GRAVITY * tNet * tNet) / Math.max(0.1, tNet);
    vy = Math.max(vy, reqVy);
  }

  return {
    vx: (dx / flightTime) * (sendOverNet ? 1 : dampScale),
    vy: Math.max(8.8, Math.min(15.8, vy)),
    vz: 0,
    spinX: 0,
    spinZ: -dirX * 5,
  };
}

/**
 * Calcula vetor de saque partindo de FORA da quadra (x = ∓13.45m atrás da linha de fundo em quadra 25m)
 * para os 3 estilos: Flutuante, Por Baixo e Viagem (sempre no centro Z = 0).
 */
export function computeServeVelocity(
  servingTeam: TeamSide,
  serveType: ServeType,
  difficulty: AiDifficulty,
  _aimZ = 0,
  serveForceMultiplier: number = PHYSICS.SERVE_FORCE_MULTIPLIER,
): { vx: number; vy: number; vz: number; angZ: number } {
  const dir = servingTeam === 'left' ? 1 : -1;
  const diffMult = DIFFICULTY_TUNING[difficulty].aiPowerMultiplier;
  const safeMult = Number.isFinite(serveForceMultiplier) && serveForceMultiplier > 0
    ? serveForceMultiplier
    : PHYSICS.SERVE_FORCE_MULTIPLIER;

  if (serveType === 'underhand') {
    return {
      vx: dir * 14.2,
      vy: 17.2,
      vz: 0,
      angZ: -dir * 2.0,
    };
  }
  if (serveType === 'jump_serve') {
    // Multiplica a força horizontal e alonga a parábola vertical para cruzar a rede (x = 0) com folga
    // mesmo saindo de ±13.45m (quadra expandida de 25m) e caindo fundo na quadra adversária (~∓8.8m).
    const baseVx = 18.4 * Math.max(0.96, Math.min(1.12, diffMult));
    const vxMag = baseVx * safeMult;
    const baseVy = 8.4;
    const vy = Math.max(8.2, Math.min(13.2, baseVy * Math.sqrt(safeMult)));
    return {
      vx: dir * vxMag,
      vy,
      vz: 0,
      angZ: -dir * 16,
    };
  }
  // Flutuante padrão saindo de fora da quadra (±13.45m) com tempo justo de reação
  return {
    vx: dir * (15.4 * Math.max(0.95, Math.min(1.06, diffMult))),
    vy: 16.4,
    vz: 0,
    angZ: -dir * 3.0,
  };
}

export interface AiObservation {
  aiPos: Vec3Like;
  aiTeam: TeamSide;
  ballPos: Vec3Like;
  ballVel: Vec3Like;
  touchesOnSide: number;
  difficulty: AiDifficulty;
  canHit: boolean;
  /** Papel tático: 'setter' fica responsável APENAS por levantar para o atacante */
  role?: 'attacker' | 'setter';
  /** Posição do atacante aliado para o levantador abrir espaço após o passe */
  attackerPos?: Vec3Like;
  /** Posição do oponente humano para leitura tática (Avançado / Classe Mundial) */
  humanPos?: Vec3Like;
  /** Se o oponente saltou próximo à rede */
  humanJumping?: boolean;
  /** Tick atual para cadência de finta/bloqueio reativo */
  tick?: number;
}

export interface AiCommand {
  moveX: number;
  moveZ: number;
  jump: boolean;
  spike: boolean;
  dive: boolean;
  aim: AimDirection;
  aimZ: number;
  isFeint: boolean;
}

/**
 * Rastreador balístico unificado compartilhado entre a IA Inimiga e o Bot Aliado.
 * Calcula exatamente onde a bola atingirá a altura de contato (targetPlayY) sem nenhuma desvantagem para o aliado.
 */
export function predictBallLandingX(
  ballPos: Vec3Like,
  ballVel: Vec3Like,
  aiTeam: TeamSide,
  targetPlayY = 1.05,
  difficulty: AiDifficulty = 'hard',
): number {
  const g = Math.abs(PHYSICS.GRAVITY);
  const disc = Math.max(0, ballVel.y * ballVel.y + 2 * g * Math.max(0, ballPos.y - targetPlayY));
  const tToTarget = ballPos.y > targetPlayY ? (ballVel.y + Math.sqrt(disc)) / g : 0.14;
  const lookAhead =
    difficulty === 'easy' ? Math.min(0.65, tToTarget * 0.78) : Math.min(1.22, tToTarget * 0.94);
  const predX = ballPos.x + ballVel.x * lookAhead;
  const minX = aiTeam === 'left' ? -COURT.HALF_WIDTH + 0.55 : 0.7;
  const maxX = aiTeam === 'left' ? -0.7 : COURT.HALF_WIDTH - 0.55;
  return Math.max(minX, Math.min(maxX, predX));
}

/**
 * Prevê onde a bola atingirá altura jogável e decide posicionamento, pulo, bloqueio,
 * leitura de profundidade (largadinha vs fundo) e comportamento dedicado do Levantador.
 * Desacoplado de exploits onde o humano fica parado fora da quadra ou evita bloquear.
 */
export function decideAiAction(obs: AiObservation): AiCommand {
  const {
    aiPos,
    aiTeam,
    ballPos,
    ballVel,
    difficulty,
    canHit,
    touchesOnSide,
    role = 'attacker',
    attackerPos,
    humanPos,
    humanJumping = false,
    tick = 0,
  } = obs;
  const profile = DIFFICULTY_TUNING[difficulty];
  const sideSign = aiTeam === 'left' ? -1 : 1;
  const ballOnMySide = aiTeam === 'left' ? ballPos.x < 0.2 : ballPos.x > -0.2;
  const ballComingToMe = aiTeam === 'left' ? ballVel.x < -0.5 : ballVel.x > 0.5;

  // Modo Levantador Dedicado (Setter): posiciona-se perto da rede e levanta sempre colado na rede (±0.95m)
  if (role === 'setter') {
    let targetX = sideSign * 1.45;
    let shouldDive = false;

    if (ballOnMySide && touchesOnSide < 2) {
      const clampedPredX = predictBallLandingX(ballPos, ballVel, aiTeam, 1.15, difficulty);
      // No 2º toque (touchesOnSide === 1) ou bola vindo para recepção do setter, rastreia toda a quadra sem limite curto
      if (touchesOnSide === 1 || Math.abs(clampedPredX) < COURT.HALF_WIDTH) {
        targetX = clampedPredX;
        const distToBall = Math.abs(ballPos.x - aiPos.x);
        shouldDive =
          distToBall > 1.7 &&
          distToBall < 3.85 &&
          ballPos.y < 1.15 &&
          ballVel.y < -1.4;
      }
    } else if (touchesOnSide >= 2) {
      // Após levantar colado à rede, abre espaço para o atacante subir livre na rede
      targetX = attackerPos && Math.abs(attackerPos.x) < 2.4 ? sideSign * 2.85 : sideSign * 2.35;
    }

    const dx = targetX - aiPos.x;
    const moveX = Math.abs(dx) > 0.16 ? Math.sign(dx) * Math.min(1, Math.abs(dx) * 1.45) : 0;
    return {
      moveX,
      moveZ: 0,
      jump: false,
      spike: false,
      dive: shouldDive,
      aim: 'parallel',
      aimZ: 0,
      isFeint: false,
    };
  }

  const homeX = sideSign * (COURT.HALF_WIDTH * 0.46);
  const reactionFactor = difficulty === 'easy' ? 0.78 : difficulty === 'medium' ? 0.98 : 1.08;
  let targetX = homeX;

  if (ballOnMySide || ballComingToMe) {
    const targetPlayY = touchesOnSide >= 2 ? 2.25 : 1.05;
    targetX = predictBallLandingX(ballPos, ballVel, aiTeam, targetPlayY, difficulty);
  } else {
    targetX = sideSign * (difficulty === 'hard' ? 1.5 : difficulty === 'medium' ? 2.2 : 3.4);
  }

  const dx = targetX - aiPos.x;
  const moveX = Math.abs(dx) > 0.18 ? Math.sign(dx) * Math.min(1, reactionFactor) : 0;

  const distToBallHoriz = Math.abs(ballPos.x - aiPos.x);
  const nearNet = Math.abs(ballPos.x) < 2.6;

  // Bloqueio reativo com variação de timing humano (nem sempre bloqueando 100% perfeito):
  // apenas quando o oponente está realmente atacando perto da rede;
  // nunca trava ou oscila quando o jogador fica parado longe/fora da quadra
  const humanNearNet = !humanPos || Math.abs(humanPos.x) < 3.6;
  const hardTimingVariation = tick === 0 || (tick % 13 !== 5 && tick % 17 !== 9);
  const reactiveWindowOk =
    difficulty === 'hard'
      ? hardTimingVariation
      : tick % 18 > (difficulty === 'easy' ? 11 : 5);
  const shouldJumpToBlock =
    !ballOnMySide &&
    nearNet &&
    humanNearNet &&
    ballPos.y > 1.85 &&
    ballVel.x * sideSign < 0 &&
    reactiveWindowOk &&
    ((profile.aiBlockReactionSec <= 0.05 && (humanJumping || ballPos.y > 2.05)) ||
      (difficulty !== 'easy' && ballPos.y > 2.25));

  // No 3º toque (ou bola levantada após recepção), salta perto do ápice descendente para cortar limpo acima da rede
  const shouldJumpToSpike =
    ballOnMySide &&
    touchesOnSide >= 1 &&
    distToBallHoriz < 1.95 &&
    ballPos.y > 1.75 &&
    ballPos.y < 4.2 &&
    ballVel.y < 2.1;

  const shouldDive =
    difficulty !== 'easy' &&
    ballOnMySide &&
    distToBallHoriz > 1.75 &&
    distToBallHoriz < 3.85 &&
    ballPos.y < 1.15 &&
    ballVel.y < -1.4;

  const shouldSpike =
    canHit &&
    ballOnMySide &&
    distToBallHoriz < PHYSICS.PLAYER_HIT_REACH + 0.35 &&
    (touchesOnSide >= 2 || (touchesOnSide >= 1 && aiPos.y > 0.35));

  // Leitura tática e variação de ângulo de ataque (diagonal, paralela ou largadinha):
  // só usa largadinha se estiver próximo à rede (< 3.8m) e o humano estiver defendendo dentro da quadra;
  // se o humano ficar parado atrás da linha de fundo ou fora da quadra, alterna entre diagonal e paralela!
  let aim: AimDirection = tick > 0 && tick % 3 === 1 ? 'diagonal' : 'parallel';
  let isFeint = false;

  if (difficulty === 'easy') {
    aim = tick > 0 && tick % 4 === 2 ? 'diagonal' : 'parallel';
  } else if (profile.aiReadsDepth && humanPos) {
    const humanDepth = Math.abs(humanPos.x);
    if (humanDepth > 4.6 && humanDepth < COURT.HALF_WIDTH - 1.0 && Math.abs(aiPos.x) < 3.8) {
      aim = tick > 0 && tick % 5 === 3 ? 'parallel' : 'dink';
    } else if (humanDepth < 3.2 && tick > 0 && tick % 2 === 1) {
      aim = 'parallel';
    } else {
      aim = tick > 0 && tick % 3 === 2 ? 'parallel' : 'diagonal';
    }
    if (difficulty === 'hard' && Math.abs(aiPos.x) < 2.6 && humanDepth < COURT.HALF_WIDTH - 1.0 && (tick % 29 === 0 || tick % 19 === 7)) {
      isFeint = true;
      aim = 'dink';
    }
  }

  return {
    moveX,
    moveZ: 0,
    jump: shouldJumpToSpike || shouldJumpToBlock,
    spike: shouldSpike,
    dive: shouldDive,
    aim,
    aimZ: 0,
    isFeint,
  };
}

