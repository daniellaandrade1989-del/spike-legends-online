/**
 * Spake Legend Arena — SafeAreaFitter (PRIORIDADE 4: Responsividade Mobile, Canvas Scaler & Safe Area)
 *
 * Equivalente Web/Mobile ao script `SafeAreaFitter.cs` da Unity:
 * - Lê a área segura da tela (`Screen.safeArea` / `env(safe-area-inset-*)`) e a proporção (16:9 até Ultrawide 20:9 / 21:9).
 * - Calcula as âncoras normalizadas (`anchorMin` e `anchorMax`) do painel pai da UI para que os botões de ação,
 *   o placar e o cabeçalho nunca fiquem cortados por câmeras frontais ("notches" / "punch-holes") ou bordas curvas.
 * - Mantém a referência lógica do Unity Canvas Scaler:
 *   `UI Scale Mode: Scale With Screen Size | Reference Resolution: 1920 x 1080 | Screen Match Mode: Match Width Or Height (Match = 0.5)`.
 */
import React, { useEffect, useState } from 'react';

export interface SafeAreaRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NormalizedSafeAreaAnchors {
  anchorMin: { x: number; y: number };
  anchorMax: { x: number; y: number };
}

export const UNITY_CANVAS_SCALER_SPEC = {
  uiScaleMode: 'ScaleWithScreenSize',
  referenceResolution: { width: 1920, height: 1080 },
  screenMatchMode: 'MatchWidthOrHeight',
  matchWidthOrHeight: 0.5,
} as const;

/**
 * Converte um `Rect` de `Screen.safeArea` em âncoras normalizadas (`anchorMin` e `anchorMax` em [0..1]),
 * exatamente como no `SafeAreaFitter.cs` da Unity.
 */
export function computeSafeAreaAnchors(
  safeArea: SafeAreaRect,
  screenWidth: number,
  screenHeight: number,
): NormalizedSafeAreaAnchors {
  const safeW = Math.max(1, screenWidth);
  const safeH = Math.max(1, screenHeight);

  const minX = Math.max(0, Math.min(1, safeArea.x / safeW));
  const minY = Math.max(0, Math.min(1, safeArea.y / safeH));
  const maxX = Math.max(minX, Math.min(1, (safeArea.x + safeArea.width) / safeW));
  const maxY = Math.max(minY, Math.min(1, (safeArea.y + safeArea.height) / safeH));

  return {
    anchorMin: { x: Number(minX.toFixed(4)), y: Number(minY.toFixed(4)) },
    anchorMax: { x: Number(maxX.toFixed(4)), y: Number(maxY.toFixed(4)) },
  };
}

/**
 * Calcula o fator de escala logarítmico do Canvas Scaler da Unity (`Match Width Or Height = 0.5` sobre `1920x1080`).
 */
export function computeCanvasScalerFactor(
  screenWidth: number,
  screenHeight: number,
  match = UNITY_CANVAS_SCALER_SPEC.matchWidthOrHeight,
): number {
  const refW = UNITY_CANVAS_SCALER_SPEC.referenceResolution.width;
  const refH = UNITY_CANVAS_SCALER_SPEC.referenceResolution.height;
  const logWidth = Math.log2(Math.max(320, screenWidth) / refW);
  const logHeight = Math.log2(Math.max(240, screenHeight) / refH);
  const logWeightedAverage = logWidth * (1 - match) + logHeight * match;
  return Number(Math.pow(2, logWeightedAverage).toFixed(4));
}

export interface SafeAreaFitterProps {
  children: React.ReactNode;
  className?: string;
}

export const SafeAreaFitter: React.FC<SafeAreaFitterProps> = ({ children, className = '' }) => {
  const [anchors, setAnchors] = useState<NormalizedSafeAreaAnchors>({
    anchorMin: { x: 0, y: 0 },
    anchorMax: { x: 1, y: 1 },
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateSafeArea = () => {
      const w = window.innerWidth || 1920;
      const h = window.innerHeight || 1080;
      const aspect = w / Math.max(1, h);

      // Em telas ultrawide mobile (> 18.5:9, ex: 20:9 / 21:9 com notch/câmera frontal),
      // reserva margem horizontal segura caso o navegador não exponha env(safe-area-inset-*)
      const ultrawideHorizontalInset = aspect > 2.05 ? Math.round(w * 0.022) : 0;
      const safeRect: SafeAreaRect = {
        x: ultrawideHorizontalInset,
        y: 0,
        width: Math.max(1, w - ultrawideHorizontalInset * 2),
        height: h,
      };
      setAnchors(computeSafeAreaAnchors(safeRect, w, h));
    };

    updateSafeArea();
    window.addEventListener('resize', updateSafeArea);
    window.addEventListener('orientationchange', updateSafeArea);
    return () => {
      window.removeEventListener('resize', updateSafeArea);
      window.removeEventListener('orientationchange', updateSafeArea);
    };
  }, []);

  return (
    <div
      id="SafeAreaPanel"
      data-testid="safe-area-fitter"
      data-anchor-min={`${anchors.anchorMin.x},${anchors.anchorMin.y}`}
      data-anchor-max={`${anchors.anchorMax.x},${anchors.anchorMax.y}`}
      style={{
        width: '100dvw',
        height: '100dvh',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
      }}
      className={`relative w-full h-full max-w-full max-h-full overflow-hidden select-none ${className}`}
    >
      {children}
    </div>
  );
};
