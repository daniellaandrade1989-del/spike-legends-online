/**
 * Spike Legends Online — Tela Inicial (Title Screen) sobre o Palco 3D Vivo
 */
import React, { useEffect } from 'react';
import { Play, ShieldCheck, Sparkles } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';

interface TitleScreenProps {
  onGuestPlay: () => void;
  onGoogleLogin: () => void;
  authLoading: boolean;
  authError: string | null;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  onGuestPlay,
  onGoogleLogin,
  authLoading,
  authError,
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        soundEngine.unlock();
        soundEngine.playButtonClick();
        onGuestPlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onGuestPlay]);

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-6 md:p-12">
      {/* Gradiente sutil à esquerda apenas para legibilidade sem backdrop-blur sobre WebGL */}
      <div
        className="absolute inset-y-0 left-0 w-full md:w-[58%] pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, rgba(11,17,32,0.88) 0%, rgba(11,17,32,0.58) 65%, rgba(11,17,32,0) 100%)',
        }}
      />

      <div className="relative z-10 max-w-xl mt-6 md:mt-14 pointer-events-auto">
        {/* Emblema SVG exclusivo do jogo */}
        <svg
          viewBox="0 0 460 132"
          className="w-full max-w-[440px] h-auto mb-5"
          role="img"
          aria-label="Spike Legends Online"
        >
          <defs>
            <linearGradient id="slFlame" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#F97316" />
              <stop offset="100%" stopColor="#FACC15" />
            </linearGradient>
          </defs>
          <path
            d="M12 22 L420 10 L446 58 L38 72 Z"
            fill="#0F172A"
            stroke="#F97316"
            strokeWidth="4"
          />
          <path d="M22 80 L368 70 L352 114 L8 122 Z" fill="url(#slFlame)" stroke="#090D16" strokeWidth="3" />
          <text
            x="44"
            y="53"
            fill="#F8FAFC"
            fontFamily="Chakra Petch, sans-serif"
            fontWeight="700"
            fontStyle="italic"
            fontSize="36"
            letterSpacing="2"
          >
            SPIKE LEGENDS
          </text>
          <text
            x="38"
            y="102"
            fill="#0B1120"
            fontFamily="Chakra Petch, sans-serif"
            fontWeight="700"
            fontSize="24"
            letterSpacing="5"
          >
            ONLINE ARENA
          </text>
        </svg>

        <p className="text-slate-200 text-base md:text-lg leading-relaxed max-w-md mb-7">
          Vôlei 3D estilo anime com física Rapier, cortadas explosivas, modo 1x1, 2x2 e desafios contra IA.
        </p>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 max-w-md">
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              soundEngine.unlock();
              soundEngine.playButtonClick();
              soundEngine.startMusic('menu');
              onGuestPlay();
            }}
            className="flex items-center justify-center gap-2.5 px-7 py-4 bg-[#F97316] hover:bg-[#EA580C] active:translate-y-0.5 text-slate-950 font-display font-bold text-lg tracking-wide rounded-xl shadow-[0_4px_0_#9A3412] transition-all cursor-pointer whitespace-nowrap"
          >
            <Play className="w-5 h-5 fill-current" />
            Jogar como Convidado
          </button>

          <button
            type="button"
            disabled={authLoading}
            onClick={(e) => {
              e.currentTarget.blur();
              soundEngine.unlock();
              soundEngine.playButtonClick();
              onGoogleLogin();
            }}
            className="flex items-center justify-center gap-2.5 px-6 py-4 bg-[#1E293B] hover:bg-[#334155] border-2 border-slate-600 text-white font-semibold text-base rounded-xl transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
          >
            <ShieldCheck className="w-5 h-5 text-cyan-400" />
            {authLoading ? 'Conectando...' : 'Entrar com Google'}
          </button>
        </div>

        {authError && (
          <p className="mt-3 text-sm text-amber-300 bg-[#0F172A]/90 border border-amber-500/40 rounded-lg px-3.5 py-2 max-w-md">
            {authError}
          </p>
        )}

        <div className="mt-6 flex items-center gap-2 text-xs text-slate-300">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>5 Heróis Equilibrados · Física 3D Rapier · Multiplayer em Tempo Real</span>
        </div>
      </div>

      {/* Dica de controles simples na margem inferior segura */}
      <div className="relative z-10 text-xs md:text-sm text-slate-300 font-medium tracking-wide">
        WASD Mover · Espaço Pular · Clique Esquerdo Cortar · Shift Mergulhar · Q Ultimate · Esc Pausa
      </div>
    </div>
  );
};
