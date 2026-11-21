/**
 * Spike Legends Online — Retrato Vetorial de Alta Definição em Estilo Anime Shonen (Cel-Shaded)
 * Contornos ink definidos, cabelos espetados com mechas iluminadas (hairHighlight),
 * sombreamento cel-shading de 2 tons na pele e linhas de velocidade de mangá.
 */
import React from 'react';
import type { CharacterId } from '../config/gameConfig';
import { CHARACTERS } from '../characters/roster';

interface AnimeAvatarProps {
  characterId: CharacterId;
  className?: string;
}

export const AnimeAvatar: React.FC<AnimeAvatarProps> = ({ characterId, className = 'w-14 h-14' }) => {
  const hero = CHARACTERS[characterId];
  const { primary, accent, hair, hairHighlight, skin, eye } = hero.colors;

  return (
    <div
      className={`relative rounded-xl overflow-hidden border-2 border-slate-700/90 shrink-0 ${className}`}
      style={{
        background: `linear-gradient(148deg, ${primary} 0%, #090D16 68%, ${accent}55 100%)`,
      }}
      aria-label={`Retrato anime de ${hero.name}`}
    >
      <svg viewBox="0 0 100 100" className="w-full h-full block">
        {/* Linhas de ação estilo mangá shonen ao fundo */}
        <path d="M0 74 L100 50 L100 59 L0 83 Z" fill={accent} opacity="0.28" />
        <path d="M0 89 L100 66 L100 71 L0 94 Z" fill="#FFFFFF" opacity="0.16" />
        <path d="M0 30 L100 8 L100 12 L0 34 Z" fill={hairHighlight} opacity="0.18" />

        {/* Cabelo de trás (twintails / volume traseiro) e fitas de bandana */}
        {hero.hairStyle === 'twintails' && (
          <g>
            <path d="M22 44 C8 54, 6 78, 15 92 C23 76, 26 60, 29 48 Z" fill={hair} stroke="#090D16" strokeWidth="2.6" />
            <path d="M78 44 C92 54, 94 78, 85 92 C77 76, 74 60, 71 48 Z" fill={hair} stroke="#090D16" strokeWidth="2.6" />
            <circle cx="24" cy="44" r="4.8" fill={accent} stroke="#090D16" strokeWidth="2.2" />
            <circle cx="76" cy="44" r="4.8" fill={accent} stroke="#090D16" strokeWidth="2.2" />
          </g>
        )}
        {(hero.accessory === 'bandana' || hero.accessory === 'headband') && (
          <g>
            <path d="M72 34 L94 26 L89 35 L96 41 L73 39 Z" fill={accent} stroke="#090D16" strokeWidth="2.2" strokeLinejoin="round" />
          </g>
        )}

        {/* Ombros Atléticos e Camisa Esportiva Shonen */}
        <path
          d="M14 100 L21 77 C28 72, 37 70, 50 70 C63 70, 72 72, 79 77 L86 100 Z"
          fill={primary}
          stroke="#090D16"
          strokeWidth="2.8"
        />
        {/* Mangas e Faixas Esportivas de Alto Contraste */}
        <path d="M21 78 L30 74 L27 100 L15 100 Z" fill={accent} stroke="#090D16" strokeWidth="1.8" />
        <path d="M79 78 L70 74 L73 100 L85 100 Z" fill={accent} stroke="#090D16" strokeWidth="1.8" />

        {/* Pescoço com Sombra Cel-Shaded e Gola Esportiva em V */}
        <path d="M39 71 L50 86 L61 71 Z" fill={skin} stroke={accent} strokeWidth="2.6" />
        <rect x="43" y="60" width="14" height="15" rx="4" fill={skin} stroke="#090D16" strokeWidth="2.3" />
        <path d="M43 62 L57 62 L57 68 Q50 72 43 68 Z" fill="rgba(15, 23, 42, 0.24)" />

        {/* Número da camisa com contorno manga */}
        <text
          x="50"
          y="96.5"
          textAnchor="middle"
          fill="#FFFFFF"
          stroke="#090D16"
          strokeWidth="2.5"
          paintOrder="stroke"
          fontFamily="Chakra Petch, sans-serif"
          fontWeight="900"
          fontSize="13"
        >
          {hero.jerseyNumber}
        </text>

        {/* Orelhas */}
        <ellipse cx="29" cy="49" rx="4" ry="6.2" fill={skin} stroke="#090D16" strokeWidth="2.3" />
        <ellipse cx="71" cy="49" rx="4" ry="6.2" fill={skin} stroke="#090D16" strokeWidth="2.3" />

        {/* Rosto Anime Shonen com Queixo Angulado + Sombra Lateral Cel-Shading */}
        <path
          d="M31 35 C31 23, 69 23, 69 35 L68 50 C67 59, 57 67.5, 50 68.5 C43 67.5, 33 59, 32 50 Z"
          fill={skin}
          stroke="#090D16"
          strokeWidth="2.6"
        />
        <path
          d="M56 28 C65 30, 68 38, 67.5 50 C66.5 58, 58 66, 50 68 C56 63, 61 55, 61.5 46 C62 37, 59 31, 56 28 Z"
          fill="rgba(180, 83, 9, 0.16)"
        />

        {/* Olhos Anime de Ação com Brilho Duplo e Íris Multicamada */}
        {[-1, 1].map((side) => {
          const cx = 50 + side * 10.6;
          return (
            <g key={side}>
              <ellipse cx={cx} cy="48" rx="5.8" ry="6.2" fill="#FFFFFF" />
              <ellipse cx={cx - side * 0.5} cy="48.5" rx="3.9" ry="4.7" fill={eye} />
              <circle cx={cx - side * 0.5} cy="49" r="2.1" fill="#090D16" />
              <circle cx={cx - side * 0.5 - 1.4} cy="46.6" r="1.45" fill="#FFFFFF" />
              <circle cx={cx - side * 0.5 + 1.2} cy="50.5" r="0.8" fill="#FFFFFF" />
              <path
                d={`M${cx - side * 6.3} 45 Q${cx} 39.5 ${cx + side * 6.2} 44`}
                fill="none"
                stroke="#090D16"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
              {/* Sobrancelha determinada estilo Shonen */}
              <path
                d={`M${cx - side * 5.5} 39.8 Q${cx} 36.8 ${cx + side * 5.6} 41.2`}
                fill="none"
                stroke="#090D16"
                strokeWidth="2.3"
                strokeLinecap="round"
              />
            </g>
          );
        })}

        {/* Nariz cel-shaded & Sorriso Confiante Shonen */}
        <path d="M50 51.5 L48.8 55 L51.4 55.5" fill="none" stroke="#9A3412" strokeWidth="1.7" strokeLinecap="round" />
        <path
          d="M42.5 59 Q50 60 57.5 59 Q55.5 64.8 50 64.8 Q44.5 64.8 42.5 59 Z"
          fill="#9F1239"
          stroke="#090D16"
          strokeWidth="1.9"
        />
        <path d="M44 59.4 L56 59.4 L54.8 61.6 L45.2 61.6 Z" fill="#FFFFFF" />

        {/* Óculos esportivos (Ren) */}
        {hero.accessory === 'glasses' && (
          <g stroke="#090D16" strokeWidth="2.1" fill="rgba(56,189,248,0.18)">
            <rect x="33" y="43" width="13.5" height="9" rx="2" />
            <rect x="53.5" y="43" width="13.5" height="9" rx="2" />
            <line x1="46.5" y1="47" x2="53.5" y2="47" />
          </g>
        )}

        {/* Cabelo Anime Shonen Estilizado e Espetado + Luzes (Highlights) */}
        {hero.hairStyle === 'spiky' && (
          <g stroke="#090D16" strokeWidth="2.4" strokeLinejoin="round">
            <path
              fill={hair}
              d="M26 42 L18 30 L28 28 L22 14 L36 20 L42 5 L51 16 L62 4 L65 19 L79 13 L73 27 L84 31 L74 43 C69 32, 62 29, 58 37 L53 28 L48 39 L42 29 L36 39 L31 31 Z"
            />
            <path
              fill={hairHighlight}
              stroke="none"
              opacity="0.88"
              d="M36 22 L42 9 L46 19 Z M55 18 L61 8 L63 20 Z M32 28 Q50 22 68 28 Q50 25 32 28 Z"
            />
          </g>
        )}
        {hero.hairStyle === 'sleek' && (
          <g stroke="#090D16" strokeWidth="2.4" strokeLinejoin="round">
            <path
              fill={hair}
              d="M27 43 C26 20, 41 11, 50 11 C59 11, 74 20, 73 43 C66 30, 56 28, 50 37 C44 28, 34 30, 27 43 Z"
            />
            <path fill={hairHighlight} stroke="none" opacity="0.85" d="M34 25 Q50 19 66 25 Q50 22 34 25 Z" />
          </g>
        )}
        {hero.hairStyle === 'swept' && (
          <g stroke="#090D16" strokeWidth="2.4" strokeLinejoin="round">
            <path
              fill={hair}
              d="M27 44 C25 19, 43 10, 56 12 C69 14, 75 25, 73 43 L62 31 L54 39 L48 29 L38 40 Z"
            />
            <path fill={hairHighlight} stroke="none" opacity="0.88" d="M35 23 Q52 17 67 24 Q51 20 35 23 Z" />
            <path d="M29 31 Q50 26 71 31" fill="none" stroke={accent} strokeWidth="4.2" />
          </g>
        )}
        {hero.hairStyle === 'twintails' && (
          <g stroke="#090D16" strokeWidth="2.4" strokeLinejoin="round">
            <path
              fill={hair}
              d="M28 42 C27 20, 42 13, 50 13 C58 13, 73 20, 72 42 L62 32 L55 39 L50 30 L45 39 L38 32 Z"
            />
            <path fill={hairHighlight} stroke="none" opacity="0.85" d="M35 24 Q50 18 65 24 Q50 21 35 24 Z" />
          </g>
        )}
        {hero.hairStyle === 'messy' && (
          <g stroke="#090D16" strokeWidth="2.4" strokeLinejoin="round">
            <path
              fill={hair}
              d="M26 42 L20 27 L32 22 L37 9 L49 17 L60 8 L66 20 L79 23 L73 42 L61 31 L53 40 L46 30 L37 39 Z"
            />
            <path fill={hairHighlight} stroke="none" opacity="0.85" d="M37 13 L44 20 L35 22 Z M58 12 L63 20 L55 20 Z" />
          </g>
        )}
      </svg>
    </div>
  );
};

