/**
 * Spike Legends Online — Codec de Pacotes Compactos para WebRTC DataChannel P2P (20–30 Hz)
 * Converte MatchSnapshot e PlayerInputState em arrays numéricos compactos (estilo UDP),
 * reduzindo o payload em ~80% e eliminando re-renders do React no loop online.
 */
import type {
  CharacterAnimState,
  PlayerActionState,
  ServeType,
  TeamSide,
  UltimateType,
} from '../config/gameConfig';
import type {
  MatchEvent,
  MatchSnapshot,
  PlayerInputState,
  SimPlayerState,
} from '../physics/rapierWorld';

const PHASES: MatchSnapshot['phase'][] = ['serve_wait', 'rally', 'point_freeze', 'finished'];
const TEAMS: TeamSide[] = ['left', 'right'];
const ULTIMATES: (UltimateType | null)[] = [
  null,
  'super_spike',
  'lightning_spike',
  'freeze_ball',
  'fire_ball',
  'wind_ball',
];
const ANIM_STATES: CharacterAnimState[] = [
  'idle',
  'run',
  'jump',
  'dive',
  'preparing_serve',
  'serve_toss',
  'serve',
  'bump',
  'set',
  'spike',
  'shark_attack',
  'header',
  'block',
  'failed_bump',
  'stunned',
  'celebrate',
  'lose',
];
const ACTION_STATES: PlayerActionState[] = [
  'idle',
  'move',
  'preparing_serve',
  'serve_toss',
  'serve',
  'bump',
  'set',
  'receive_ready',
  'slide_dive',
  'jump_charge',
  'airborne',
  'attack_windup',
  'spike',
  'shark_attack',
  'header',
  'block',
  'failed_bump',
  'stunned',
  'celebrate',
  'lose',
];
const SERVE_TYPES: (ServeType | undefined)[] = [undefined, 'underhand', 'float', 'jump_serve'];
const HYBRID_COMMANDS: NonNullable<PlayerInputState['hybridCommand']>[] = [
  'none',
  'serve_underhand_quick',
  'serve_float_medium',
  'serve_jump_max',
  'action_neutral',
  'action_down_short',
  'action_back_deep',
  'single_tap',
  'double_tap_low_block',
  'triple_tap_deep_block',
  'hold_1s_underhand_serve',
  'hold_3s_jump_serve',
];

function r3(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : 0;
}

export interface CompactStatePacket {
  /** 's' = State Snapshot */
  t: 's';
  /**
   * Meta: [
   *   0: tick,
   *   1: phaseIdx,
   *   2: scoreLeft,
   *   3: scoreRight,
   *   4: touchesLeft,
   *   5: touchesRight,
   *   6: servingTeamIdx,
   *   7: serveWhistleBlown (0|1),
   *   8: winnerIdx (-1|0|1),
   *   9: targetPoints
   * ]
   */
  m: [number, number, number, number, number, number, number, number, number, number];
  /**
   * Ball: [
   *   0: x, 1: y, 2: z,
   *   3: vx, 4: vy, 5: vz,
   *   6: rx, 7: ry, 8: rz, 9: rw,
   *   10: lastTouchTeamIdx,
   *   11: activeUltimateIdx
   * ]
   */
  b: [number, number, number, number, number, number, number, number, number, number, number, number];
  /**
   * Players: array of [
   *   0: x, 1: y, 2: z,
   *   3: vx, 4: vy, 5: vz,
   *   6: facingX, 7: facingZ,
   *   8: animIdx, 9: actionIdx,
   *   10: animTimer, 11: ultimateCharge, 12: ultimateActiveTimer, 13: superAttackTimer,
   *   14: stunTimer, 15: spikesCount, 16: blocksCount, 17: perfectCount
   * ]
   */
  p: number[][];
  /** Eventos discretos do tick (presentes apenas quando ocorrem) */
  e?: MatchEvent[];
}

export interface CompactInputPacket {
  /** 'i' = Input State */
  t: 'i';
  /** ID do jogador que enviou o input */
  id: string;
  /**
   * Dados compactos: [
   *   0: moveX,
   *   1: moveZ,
   *   2: flagsBitmask,
   *   3: serveChargeTime (-1 se undefined),
   *   4: serveReleaseChargeTime (-1 se undefined),
   *   5: mouseAimRatio (-1 se undefined),
   *   6: mouseWorldX (999 se undefined),
   *   7: mouseWorldY (999 se undefined),
   *   8: serveTypeIdx,
   *   9: serveChargeStageIdx,
   *   10: hybridCommandIdx
   * ]
   */
  d: [number, number, number, number, number, number, number, number, number, number, number];
}

export type P2PDataChannelPacket =
  | CompactStatePacket
  | CompactInputPacket
  | { t: 'ping'; ts: number }
  | { t: 'pong'; ts: number }
  | { t: 'dc_ready'; ts: number }
  | { t: 'match_start'; roomCode: string };

export function encodeCompactStatePacket(snap: MatchSnapshot): CompactStatePacket {
  const phaseIdx = Math.max(0, PHASES.indexOf(snap.phase));
  const servingTeamIdx = snap.servingTeam === 'right' ? 1 : 0;
  const winnerIdx = snap.score.winner === 'left' ? 0 : snap.score.winner === 'right' ? 1 : -1;
  const lastTouchTeamIdx = snap.ball.lastTouchTeam === 'right' ? 1 : 0;
  const ultIdx = Math.max(0, ULTIMATES.indexOf(snap.ball.activeUltimate));

  const playersCompact = snap.players.map((pl) => [
    r3(pl.x),
    r3(pl.y),
    r3(pl.z),
    r3(pl.vx),
    r3(pl.vy),
    r3(pl.vz),
    r3(pl.facingX),
    r3(pl.facingZ),
    Math.max(0, ANIM_STATES.indexOf(pl.anim)),
    Math.max(0, ACTION_STATES.indexOf(pl.actionState)),
    r3(pl.animTimer),
    r3(pl.ultimateCharge),
    r3(pl.ultimateActiveTimer),
    r3(pl.superAttackTimer ?? pl.ultimateActiveTimer ?? 0),
    r3(pl.stunTimer),
    pl.spikesCount | 0,
    pl.blocksCount | 0,
    pl.perfectCount | 0,
  ]);

  const pkt: CompactStatePacket = {
    t: 's',
    m: [
      snap.tick | 0,
      phaseIdx,
      snap.score.left | 0,
      snap.score.right | 0,
      snap.ball.touchesLeft | 0,
      snap.ball.touchesRight | 0,
      servingTeamIdx,
      snap.serveWhistleBlown ? 1 : 0,
      winnerIdx,
      snap.score.targetPoints | 0,
    ],
    b: [
      r3(snap.ball.x),
      r3(snap.ball.y),
      r3(snap.ball.z),
      r3(snap.ball.vx),
      r3(snap.ball.vy),
      r3(snap.ball.vz),
      r3(snap.ball.rx),
      r3(snap.ball.ry),
      r3(snap.ball.rz),
      r3(snap.ball.rw),
      lastTouchTeamIdx,
      ultIdx,
    ],
    p: playersCompact,
  };

  if (snap.events && snap.events.length > 0) {
    pkt.e = snap.events;
  }

  return pkt;
}

export function decodeCompactStatePacket(
  pkt: CompactStatePacket,
  template: MatchSnapshot,
): MatchSnapshot {
  const m = pkt.m;
  const b = pkt.b;
  const phase = PHASES[m[1]] ?? 'serve_wait';
  const servingTeam = TEAMS[m[6]] ?? 'left';
  const winner: TeamSide | null = m[8] === 0 ? 'left' : m[8] === 1 ? 'right' : null;
  const lastTouchTeam = TEAMS[b[10]] ?? 'left';
  const activeUltimate = ULTIMATES[b[11]] ?? null;

  const players: SimPlayerState[] = template.players.map((tpl, idx) => {
    const arr = pkt.p[idx];
    if (!arr) return tpl;
    return {
      ...tpl,
      x: arr[0],
      y: arr[1],
      z: arr[2],
      vx: arr[3],
      vy: arr[4],
      vz: arr[5],
      facingX: arr[6],
      facingZ: arr[7],
      anim: ANIM_STATES[arr[8]] ?? 'idle',
      actionState: ACTION_STATES[arr[9]] ?? 'idle',
      animTimer: arr[10],
      ultimateCharge: arr[11],
      ultimateActiveTimer: arr[12],
      superAttackTimer: arr[13],
      stunTimer: arr[14],
      spikesCount: arr[15],
      blocksCount: arr[16],
      perfectCount: arr[17],
    };
  });

  return {
    ...template,
    tick: m[0],
    phase,
    serveWhistleBlown: m[7] === 1,
    servingTeam,
    score: {
      ...template.score,
      left: m[2],
      right: m[3],
      servingTeam,
      winner,
      targetPoints: m[9] || template.score.targetPoints,
    },
    ball: {
      ...template.ball,
      x: b[0],
      y: b[1],
      z: b[2],
      vx: b[3],
      vy: b[4],
      vz: b[5],
      rx: b[6],
      ry: b[7],
      rz: b[8],
      rw: b[9],
      lastTouchTeam,
      activeUltimate,
      touchesLeft: m[4],
      touchesRight: m[5],
    },
    players,
    events: pkt.e ?? [],
  };
}

export function encodeCompactInputPacket(
  playerId: string,
  input: PlayerInputState,
): CompactInputPacket {
  let flags = 0;
  if (input.sprint) flags |= 1 << 0;
  if (input.jump) flags |= 1 << 1;
  if (input.jumpHeld) flags |= 1 << 2;
  if (input.spike) flags |= 1 << 3;
  if (input.spikeHeld) flags |= 1 << 4;
  if (input.set) flags |= 1 << 5;
  if (input.preparingServe) flags |= 1 << 6;
  if (input.receive) flags |= 1 << 7;
  if (input.dive) flags |= 1 << 8;
  if (input.ultimate) flags |= 1 << 9;
  if (input.footMode) flags |= 1 << 10;
  if (input.serveQuickTap) flags |= 1 << 11;
  if (input.serveJumpCharge) flags |= 1 << 12;
  if (input.serveNormalTrigger) flags |= 1 << 13;
  if (input.serveUnderhandTrigger) flags |= 1 << 14;
  if (input.serveJumpTrigger) flags |= 1 << 15;

  const serveTypeIdx = Math.max(0, SERVE_TYPES.indexOf(input.serveType));
  const serveStageIdx = Math.max(0, SERVE_TYPES.indexOf(input.serveChargeStage));
  const hybridIdx = Math.max(0, HYBRID_COMMANDS.indexOf(input.hybridCommand ?? 'none'));

  return {
    t: 'i',
    id: playerId,
    d: [
      r3(input.moveX),
      r3(input.moveZ),
      flags,
      input.serveChargeTime !== undefined ? r3(input.serveChargeTime) : -1,
      input.serveReleaseChargeTime !== undefined ? r3(input.serveReleaseChargeTime) : -1,
      input.mouseAimRatio !== undefined ? r3(input.mouseAimRatio) : -1,
      input.mouseWorldPos ? r3(input.mouseWorldPos.x) : 999,
      input.mouseWorldPos ? r3(input.mouseWorldPos.y) : 999,
      serveTypeIdx,
      serveStageIdx,
      hybridIdx,
    ],
  };
}

export function decodeCompactInputPacket(pkt: CompactInputPacket): {
  playerId: string;
  input: PlayerInputState;
} {
  const d = pkt.d;
  const flags = d[2] | 0;
  const serveType = SERVE_TYPES[d[8]] ?? 'float';
  const serveChargeStage = SERVE_TYPES[d[9]];
  const hybridCommand = HYBRID_COMMANDS[d[10]] ?? 'none';

  const input: PlayerInputState = {
    moveX: d[0],
    moveZ: d[1],
    sprint: Boolean(flags & (1 << 0)),
    jump: Boolean(flags & (1 << 1)),
    jumpHeld: Boolean(flags & (1 << 2)),
    spike: Boolean(flags & (1 << 3)),
    spikeHeld: Boolean(flags & (1 << 4)),
    set: Boolean(flags & (1 << 5)),
    preparingServe: Boolean(flags & (1 << 6)),
    receive: Boolean(flags & (1 << 7)),
    dive: Boolean(flags & (1 << 8)),
    ultimate: Boolean(flags & (1 << 9)),
    footMode: Boolean(flags & (1 << 10)),
    serveQuickTap: Boolean(flags & (1 << 11)),
    serveJumpCharge: Boolean(flags & (1 << 12)),
    serveNormalTrigger: Boolean(flags & (1 << 13)),
    serveUnderhandTrigger: Boolean(flags & (1 << 14)),
    serveJumpTrigger: Boolean(flags & (1 << 15)),
    serveChargeTime: d[3] >= 0 ? d[3] : undefined,
    serveReleaseChargeTime: d[4] >= 0 ? d[4] : undefined,
    mouseAimRatio: d[5] >= 0 ? d[5] : undefined,
    mouseWorldPos: d[6] < 900 && d[7] < 900 ? { x: d[6], y: d[7] } : undefined,
    serveType,
    serveChargeStage,
    hybridCommand,
  };

  return {
    playerId: pkt.id,
    input,
  };
}
