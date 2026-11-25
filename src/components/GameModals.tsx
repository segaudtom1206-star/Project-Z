import { HudSnapshot } from '../game/types';

interface GameModalsProps {
  hud: HudSnapshot;
  onResume: () => void;
  onRestart: () => void;
  onToggleMute: () => void;
}

export function GameModals({ hud, onResume, onRestart, onToggleMute }: GameModalsProps) {
  if (hud.phase !== 'PAUSED' && hud.phase !== 'GAME_OVER') return null;

  if (hud.phase === 'PAUSED') {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#080505]/82 p-6">
        <div className="w-full max-w-sm bg-[#120e0d] border border-[#452b20] p-7 shadow-[0_0_40px_rgba(0,0,0,0.75)]">
          <div className="text-sm font-bo2 tracking-[0.18em] uppercase text-[#a8968a] mb-1">
            Cellblock D · Round {hud.wave}
          </div>
          <h2 className="font-bo2 text-5xl font-bold tracking-[0.12em] uppercase text-[#f2ebe1] leading-none mb-6">
            Paused
          </h2>

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={onResume}
              className="w-full py-2.5 px-4 font-bo2 text-2xl font-bold tracking-[0.14em] uppercase bg-[#c72017] hover:bg-[#e02d19] text-[#fff8f0] border border-[#ff7a29]/75 transition-colors whitespace-nowrap cursor-pointer"
            >
              Resume
            </button>
            <button
              type="button"
              onClick={onToggleMute}
              className="w-full py-2.5 px-4 font-bo2 text-base font-bold tracking-[0.14em] uppercase bg-[#1a1311] hover:bg-[#241a17] text-[#d4c8be] border border-[#3d2920] transition-colors whitespace-nowrap cursor-pointer"
            >
              {hud.muted ? 'Unmute Audio' : 'Mute Audio'}
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="w-full py-2.5 px-4 font-bo2 text-base font-bold tracking-[0.14em] uppercase bg-[#1a1311] hover:bg-[#241a17] text-[#d4c8be] border border-[#3d2920] transition-colors whitespace-nowrap cursor-pointer"
            >
              Restart Round 1
            </button>
          </div>

          <div className="mt-5 pt-4 border-t border-[#2b1e19] text-sm font-bo2 tracking-[0.08em] uppercase text-[#9c8c82] leading-relaxed">
            WASD Move · Mouse Aim &amp; Fire · R Reload · 1-3 Weapons · E Crates · Esc Resume
          </div>
        </div>
      </div>
    );
  }

  const roundLabel = hud.wave === 1 ? 'Round' : 'Rounds';

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-6"
      style={{
        background:
          'radial-gradient(circle at 50% 42%, rgba(90,14,10,0.42) 0%, rgba(7,5,5,0.92) 72%)',
      }}
    >
      <div className="w-full max-w-lg bg-[#110c0b]/96 border border-[#5e2218] p-8 shadow-[0_0_50px_rgba(217,28,28,0.22)]">
        {/* Authentic BO2 Zombies GAME OVER header */}
        <div className="text-center mb-6">
          <div className="text-sm font-bo2 tracking-[0.22em] uppercase text-[#a8968a] mb-1">
            Ironwood Penitentiary · {hud.sectorName}
          </div>
          <h2 className="font-bo2 text-7xl font-bold tracking-[0.12em] uppercase text-[#e62419] leading-[0.88] drop-shadow-[0_0_24px_rgba(242,100,25,0.55)]">
            Game Over
          </h2>
          <p className="font-bo2 text-3xl font-bold tracking-[0.08em] uppercase text-[#f0e8dd] mt-2">
            You Survived <span className="text-[#f4b942] font-mono-num">{hud.wave}</span> {roundLabel}
          </p>
        </div>

        {/* Classic BO2 Charred Scoreboard Table */}
        <div className="border-y border-[#3d261d] mb-6 font-mono-num">
          <div className="grid grid-cols-4 gap-2 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[#a8968a] bg-[#1a110f]">
            <span>Kills</span>
            <span>Gibs</span>
            <span>Score</span>
            <span className="text-right">Best</span>
          </div>
          <div className="grid grid-cols-4 gap-2 px-3 py-3.5 text-2xl font-bold items-center bg-[#140e0d]">
            <span className="text-[#f0e8dd]">{hud.kills}</span>
            <span className="text-[#e03124]">{hud.gibs}</span>
            <span className="text-[#f4b942]">{hud.totalPointsEarned}</span>
            <span className="text-right text-[#f26419]">R{hud.bestWave}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onRestart}
          className="w-full py-3 px-6 font-bo2 text-2xl font-bold tracking-[0.16em] uppercase bg-[#c72017] hover:bg-[#e02d19] text-[#fff8f0] border border-[#ff7a29]/75 shadow-[0_0_24px_rgba(242,100,25,0.3)] transition-all whitespace-nowrap cursor-pointer"
        >
          Play Again
        </button>
      </div>
    </div>
  );
}
