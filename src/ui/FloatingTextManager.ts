/**
 * Spake Legend Arena — FloatingTextManager (PRIORIDADE 5: Textos de Ação Sutis na Partida)
 *
 * Responsabilidades:
 * 1. Aplica um Offset no eixo Y (`+3.0f` metros acima da cabeça do personagem: `playerPosition + new Vector3(0f, 3.0f, 0f)`)
 *    para que o texto flutuante ("Recepção!", "Levantamento!", "Corte Perfeito!", etc.) nunca fique na frente do jogador ou da bola.
 * 2. Reduz o tamanho da fonte (`fontScale = 0.72`) para um visual limpo e competitivo.
 * 3. Aplica um Fade Out rápido (`durationMs = 550` / `0.55s`) para desimpedir a visão da quadra imediatamente.
 */

export interface FloatingTextConfig {
  /** Offset vertical em metros acima da posição do jogador (+3.0f no eixo Y) */
  yOffsetMeters: number;
  /** Escala reduzida da fonte para não poluir a visão da bola */
  fontScale: number;
  /** Duração total em milissegundos com Fade Out rápido */
  durationMs: number;
  /** Deslocamento adicional de subida durante o Fade Out (em pixels/metros) */
  riseDistancePx: number;
}

export const FLOATING_TEXT_CONFIG: FloatingTextConfig = {
  yOffsetMeters: 3.0,
  fontScale: 0.72,
  durationMs: 550,
  riseDistancePx: 18,
};

export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * Calcula a posição 3D do texto flutuante aplicando o Offset obrigatório `+3.0f` no eixo Y
 * acima da cabeça do personagem (`playerPos.y + 3.0`).
 */
export function computeFloatingTextWorldPosition(
  playerPos: Vector3Like,
  customYOffset = FLOATING_TEXT_CONFIG.yOffsetMeters,
): Vector3Like {
  return {
    x: Number(playerPos.x.toFixed(3)),
    y: Number((playerPos.y + customYOffset).toFixed(3)),
    z: Number(playerPos.z.toFixed(3)),
  };
}
