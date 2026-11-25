import { useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

const LOADSCREEN_IMAGE_URL = '/src/assets/images/bo2_prison_loading_screen_1795556782241.jpg';

interface TitleOverlayProps {
  bestWave: number;
  muted: boolean;
  onStart: () => void;
  onToggleMute: () => void;
}

export function TitleOverlay({ bestWave, muted, onStart, onToggleMute }: TitleOverlayProps) {
  const [artFailed, setArtFailed] = useState(false);

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between p-6 md:p-10 bg-[#080606]">
      {/* Full-bleed AI-generated Black Ops 2 Zombies Graphic-Novel Comic Loading Screen */}
      <div className="fixed inset-0 -z-10 overflow-hidden bg-[#0a0706]">
        {!artFailed ? (
          <img
            src={LOADSCREEN_IMAGE_URL}
            alt="Black Ops 2 style comic loading screen depicting the burning abandoned Ironwood Penitentiary"
            referrerPolicy="no-referrer"
            onError={() => setArtFailed(true)}
            className="w-full h-full object-cover bo2-loadscreen-art select-none"
          />
        ) : (
          <div
            className="w-full h-full"
            style={{
              background:
                'radial-gradient(circle at 22% 78%, rgba(242,100,25,0.28) 0%, rgba(16,10,9,0.96) 58%, #080606 100%)',
            }}
          />
        )}

        {/* Measured BO2 loading-screen corner vignette scrim: preserves comic panels while anchoring contrast */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(180deg, rgba(8,6,6,0.72) 0%, rgba(8,6,6,0.12) 26%, rgba(8,6,6,0.16) 56%, rgba(8,6,6,0.92) 90%, rgba(8,6,6,0.98) 100%), linear-gradient(90deg, rgba(8,6,6,0.78) 0%, rgba(8,6,6,0.28) 42%, rgba(8,6,6,0.08) 100%)',
          }}
        />
      </div>

      {/* Top row: BO2 map location metadata & Audio toggle */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-base md:text-lg tracking-[0.14em] text-[#e0d4c8] font-bo2 uppercase drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
          <span className="font-bold text-[#f4ebe1]">Ironwood Penitentiary</span>
          <span aria-hidden="true" className="text-[#f26419]">·</span>
          <span>Cellblock D</span>
          {bestWave > 1 && (
            <>
              <span aria-hidden="true" className="text-[#f26419]">·</span>
              <span className="font-mono-num font-bold text-[#f4b942]">Best Round {bestWave}</span>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleMute}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bo2 font-bold tracking-[0.12em] uppercase text-[#ebe2d7] bg-[#120d0c]/90 border border-[#4a3024] hover:border-[#f26419] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f26419]"
          aria-label={muted ? 'Unmute audio' : 'Mute audio'}
        >
          {muted ? (
            <VolumeX className="w-4 h-4 text-[#d91c1c]" />
          ) : (
            <Volume2 className="w-4 h-4 text-[#f26419]" />
          )}
          <span>{muted ? 'Audio Off' : 'Audio On'}</span>
        </button>
      </div>

      {/* Bottom BO2 Loading Screen Corner Title Plate + Primary Play Action */}
      <div className="mt-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-5">
          <div className="max-w-xl">
            <div className="text-sm md:text-base font-bo2 font-bold tracking-[0.26em] uppercase text-[#f26419] drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)] mb-1">
              Zombies Survival · Sector 04
            </div>
            <h1 className="font-bo2 text-7xl md:text-8xl font-bold tracking-[0.08em] uppercase text-[#f6efe6] leading-[0.86] drop-shadow-[0_4px_18px_rgba(0,0,0,0.95)]">
              Ironblock
            </h1>
            <div className="h-[3px] w-72 mt-3 mb-3 bg-gradient-to-r from-[#d91c1c] via-[#f26419] to-transparent" />
            <p className="text-lg md:text-xl text-[#d6c9bc] leading-snug max-w-lg font-bo2 tracking-[0.03em] drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]">
              Survive endless rounds inside the burning cellblocks. Sweep the corridors with your
              flashlight, light the halls with gunfire, and unlock the HAMR and Ray Gun.
            </p>
          </div>

          <div className="flex flex-col items-start md:items-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onStart}
              className="px-12 py-3 text-3xl font-bo2 font-bold tracking-[0.16em] uppercase bg-[#c92016] hover:bg-[#e32d18] active:translate-y-[1px] text-[#fff8f0] border border-[#ff8230]/80 shadow-[0_0_28px_rgba(242,100,25,0.42)] hover:shadow-[0_0_36px_rgba(242,100,25,0.62)] transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f26419]"
            >
              Play
            </button>
            <span className="text-sm font-bo2 tracking-[0.14em] uppercase text-[#b8a79a]">
              Press Enter or Space
            </span>
          </div>
        </div>

        {/* Bottom single flat BO2 loading-screen control strip */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#422a20]/85 pt-3.5 text-sm tracking-[0.12em] uppercase text-[#b8a79a] font-bo2">
          <span>WASD Move · Mouse Aim &amp; Fire · R Reload · 1-3 Weapons · E Crates · Esc Pause</span>
          <span className="text-[#f4b942] font-bold">AN-94 · HAMR · RAY GUN</span>
        </div>
      </div>
    </div>
  );
}
