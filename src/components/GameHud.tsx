import { RefObject } from 'react';
import { Pause, Volume2, VolumeX } from 'lucide-react';
import { HudSnapshot, RoundAnimPhase, WeaponId } from '../game/types';
import { WEAPON_ORDER, WEAPONS } from '../game/weapons';
import { WeaponSilhouette } from './WeaponSilhouette';

interface GameHudProps {
  hud: HudSnapshot;
  recoilRef: RefObject<HTMLDivElement | null>;
  onTogglePause: () => void;
  onToggleMute: () => void;
  onSelectWeapon: (id: WeaponId) => void;
}

/**
 * Authentic Black Ops 2 Zombies bottom-left hand-scratched chalk round tally.
 * - Rounds 1-10: Rough scratched crimson/lava-orange tallies (groups of 5 with diagonal slash).
 * - Round 11+: Glowing Agdasima / Agency FB numeral.
 * - ENDING phase: Incandescent white-to-lava-orange pulse during uncut round-end audio.
 * - STARTING phase: Blinding white flash -> molten orange -> glowing crimson chalk redraw.
 */
function Bo2RoundTally({
  wave,
  phase,
  progress,
}: {
  wave: number;
  phase: RoundAnimPhase;
  progress: number;
}) {
  let primaryStroke = '#d91c1c';
  let slashStroke = '#ef3222';
  let coreHighlightOpacity = 0.16;
  let containerOpacity = 1;

  if (phase === 'ENDING') {
    const pulse = 0.5 + 0.5 * Math.sin(progress * Math.PI * 10);
    primaryStroke = pulse > 0.45 ? '#fff3e2' : '#ff7b29';
    slashStroke = pulse > 0.45 ? '#ffffff' : '#ff9947';
    coreHighlightOpacity = 0.45 + pulse * 0.45;
    if (progress > 0.88) {
      containerOpacity = Math.max(0.2, 1 - (progress - 0.88) * 6.5);
    }
  } else if (phase === 'STARTING') {
    // Syncs with the full 11.15s round-start audio (choir swell 0..2.25s -> thunder slam at ~2.25s -> eerie decay)
    if (progress < 0.22) {
      primaryStroke = '#ffffff';
      slashStroke = '#fff4e0';
      coreHighlightOpacity = 0.96;
    } else if (progress < 0.42) {
      primaryStroke = '#ff6b1a';
      slashStroke = '#ff9233';
      coreHighlightOpacity = 0.58;
    } else {
      primaryStroke = '#d91c1c';
      slashStroke = '#ef3222';
      coreHighlightOpacity = 0.22;
    }
  }

  const animClass =
    phase === 'STARTING'
      ? 'bo2-tally-flash'
      : phase === 'ENDING'
      ? 'bo2-tally-ending'
      : 'bo2-tally-idle';

  const strokeReveal = phase === 'STARTING' ? Math.min(1, progress / 0.18) : 1;

  if (wave > 10) {
    return (
      <div
        key={`round-num-${wave}-${phase === 'STARTING' ? 'start' : 'steady'}`}
        className={`origin-bottom-left select-none ${animClass}`}
        style={{ opacity: containerOpacity }}
        aria-label={`Round ${wave}`}
      >
        <span
          className="font-bo2 text-8xl font-bold leading-[0.8] tracking-tight font-mono-num"
          style={{ color: primaryStroke }}
        >
          {wave}
        </span>
      </div>
    );
  }

  const groups = Math.floor(wave / 5);
  const rem = wave % 5;

  const renderGroup = (count: number, groupIdx: number, isLastGroup: boolean) => {
    const strokes = [
      { id: 1, d: 'M8 6 Q6 29 4 54', len: 52, isSlash: false },
      { id: 2, d: 'M21 5 Q20 28 18 55', len: 52, isSlash: false },
      { id: 3, d: 'M34 7 Q33 30 31 54', len: 52, isSlash: false },
      { id: 4, d: 'M47 6 Q46 28 44 55', len: 52, isSlash: false },
      { id: 5, d: 'M1 42 Q28 30 57 14', len: 68, isSlash: true },
    ];

    return (
      <svg
        key={groupIdx}
        viewBox="0 0 60 60"
        className="w-14 h-14 md:w-16 md:h-16 overflow-visible"
        aria-hidden="true"
      >
        {strokes.slice(0, count).map((s, idx) => {
          const isNewestStroke = isLastGroup && idx === count - 1;
          const dashOffset = isNewestStroke ? s.len * (1 - strokeReveal) : 0;
          const baseColor = s.isSlash ? slashStroke : primaryStroke;

          return (
            <g key={s.id}>
              <path
                d={s.d}
                fill="none"
                stroke={baseColor}
                strokeWidth={s.isSlash ? 6.4 : 5.8}
                strokeLinecap="round"
                strokeDasharray={s.len}
                strokeDashoffset={dashOffset}
              />
              <path
                d={s.d}
                fill="none"
                stroke="#fff6ea"
                strokeOpacity={coreHighlightOpacity}
                strokeWidth={s.isSlash ? 2.2 : 1.8}
                strokeLinecap="round"
                strokeDasharray={s.len}
                strokeDashoffset={dashOffset}
              />
            </g>
          );
        })}
      </svg>
    );
  };

  return (
    <div
      key={`round-tally-${wave}-${phase === 'STARTING' ? 'start' : 'steady'}`}
      className={`flex items-end gap-2 origin-bottom-left ${animClass}`}
      style={{ opacity: containerOpacity }}
      aria-label={`Round ${wave}`}
    >
      {Array.from({ length: groups }, (_, i) =>
        renderGroup(5, i, rem === 0 && i === groups - 1)
      )}
      {rem > 0 && renderGroup(rem, 99, true)}
    </div>
  );
}

export function GameHud({
  hud,
  recoilRef,
  onTogglePause,
  onToggleMute,
  onSelectWeapon,
}: GameHudProps) {
  const activeSpec = WEAPONS[hud.activeWeaponId];
  const activeState = hud.weapons[hud.activeWeaponId];
  const hpPct = Math.max(0, Math.min(100, (hud.hp / hud.maxHp) * 100));
  const isLowAmmo = activeState.ammoInMag <= Math.ceil(activeSpec.magSize * 0.25);

  return (
    <div className="fixed inset-0 z-10 pointer-events-none overflow-hidden">
      {/* Recoil-coupled container driven directly at 60fps via ref by IronblockEngine */}
      <div
        ref={recoilRef}
        className="w-full h-full p-5 md:p-7 flex flex-col justify-between will-change-transform"
      >
        {/* TOP PERIMETER: Compact Vitals & Sector (Left) · Quiet Utility Controls (Right) */}
        <div className="flex items-start justify-between gap-4">
          <div className="w-56 bg-[#100c0b]/88 border border-[#3a271f] px-3.5 py-2.5">
            <div className="flex items-baseline justify-between mb-1">
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono-num text-2xl font-bold text-[#f0e8dd] leading-none">
                  {hud.hp}
                </span>
                <span className="text-xs font-mono-num uppercase tracking-wider text-[#9c8e84]">
                  / {hud.maxHp} HP
                </span>
              </div>
              <span
                className={`text-sm font-bo2 font-bold tracking-[0.14em] uppercase leading-none ${
                  hud.hpStateLabel === 'CRITICAL'
                    ? 'text-[#ef4444]'
                    : hud.hpStateLabel === 'BLOODIED'
                    ? 'text-[#f26419]'
                    : 'text-[#b5a69b]'
                }`}
              >
                {hud.hpStateLabel}
              </span>
            </div>

            {/* Health Meter */}
            <div className="h-1.5 w-full bg-[#1e1715] overflow-hidden mb-2">
              <div
                className="h-full transition-all duration-100"
                style={{
                  width: `${hpPct}%`,
                  backgroundColor:
                    hud.hpStateLabel === 'CRITICAL'
                      ? '#d91c1c'
                      : hud.hpStateLabel === 'BLOODIED'
                      ? '#f26419'
                      : '#c2a689',
                }}
              />
            </div>

            <div className="flex items-center justify-between gap-2 text-xs font-mono-num tracking-[0.08em] uppercase text-[#a8988d]">
              <span className="truncate">{hud.sectorName}</span>
              <span className="shrink-0">
                {hud.waveState === 'INTERMISSION' ? (
                  <span className="text-[#f26419] font-bold">Next {hud.intermissionSeconds}s</span>
                ) : (
                  <span>{hud.zombiesRemaining} Left</span>
                )}
              </span>
            </div>
          </div>

          {/* Quiet utility buttons */}
          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              type="button"
              onClick={onToggleMute}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-bo2 font-bold uppercase tracking-[0.12em] text-[#d6cac0] bg-[#120d0c]/88 border border-[#3a271f] hover:border-[#f26419]/80 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              aria-label={hud.muted ? 'Unmute audio' : 'Mute audio'}
            >
              {hud.muted ? (
                <VolumeX className="w-3.5 h-3.5 text-[#d91c1c]" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-[#f26419]" />
              )}
              <span>{hud.muted ? 'Muted' : 'Sound'}</span>
            </button>
            <button
              type="button"
              onClick={onTogglePause}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-bo2 font-bold uppercase tracking-[0.12em] text-[#d6cac0] bg-[#120d0c]/88 border border-[#3a271f] hover:border-[#f26419]/80 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              aria-label="Pause game"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Pause</span>
            </button>
          </div>
        </div>

        {/* CENTER: Pure battlefield viewport (no center round banner; only brief crate/bonus status toast) */}
        <div className="flex flex-col items-center justify-center my-auto">
          {hud.statusBanner && (
            <div className="px-4 py-1.5 bg-[#120c0b]/92 border border-[#543020] text-sm font-bo2 font-bold tracking-[0.16em] uppercase text-[#f4b942]">
              {hud.statusBanner}
            </div>
          )}
        </div>

        {/* BOTTOM PERIMETER: Pure BO2 Chalk Tally (Left) · Crate Prompt (Center) · BO2 Points + Weapon Stack (Right) */}
        <div className="flex items-end justify-between gap-6">
          {/* Bottom-Left: Pure Iconic Black Ops 2 Glowing Round Tally */}
          <div className="flex flex-col items-start justify-end pl-1 pb-0.5 min-w-[140px]">
            <Bo2RoundTally
              wave={hud.wave}
              phase={hud.roundAnimPhase}
              progress={hud.roundAnimProgress}
            />
          </div>

          {/* Bottom-Center: Interactive Crate Prompt when in proximity */}
          <div className="flex-1 flex justify-center pb-1">
            {hud.nearbyCrate && (
              <div className="px-4 py-2.5 bg-[#120d0c]/92 border border-[#4e3123] text-center">
                <div className="flex items-center justify-center gap-2.5 text-base font-bo2 tracking-[0.08em] text-[#f0e8dd]">
                  <span className="px-2 py-0.5 bg-[#241814] border border-[#6e402b] font-mono-num text-sm font-bold text-[#fff4e6]">
                    E
                  </span>
                  <span className="font-bold uppercase tracking-[0.1em]">
                    {hud.nearbyCrate.actionText}
                  </span>
                  <span aria-hidden="true" className="text-[#785e52]">
                    ·
                  </span>
                  <span
                    className={`font-mono-num font-bold text-lg ${
                      hud.nearbyCrate.canAfford ? 'text-[#f4b942]' : 'text-[#ef4444]'
                    }`}
                  >
                    {hud.nearbyCrate.cost}
                  </span>
                </div>
                <div className="text-xs font-bo2 tracking-[0.14em] uppercase text-[#a39489] mt-0.5">
                  {hud.nearbyCrate.label}
                </div>
              </div>
            )}
          </div>

          {/* Bottom-Right: Classic BO2 Stacked Points Plate + Weapon / Ammo Plate */}
          <div className="flex flex-col items-end gap-2 w-72">
            {/* BO2 Points Plate with animated floating score ticks */}
            <div className="relative w-full flex items-center justify-between px-3.5 py-1.5 bg-[#1a0d0b]/92 border border-[#5e2319] overflow-visible">
              <div className="flex items-baseline gap-2.5">
                <span className="font-bo2 text-base font-bold tracking-[0.14em] uppercase text-[#dfd0c2] leading-none">
                  Points
                </span>
                <span className="text-xs font-mono-num uppercase tracking-wider text-[#9c8c80]">
                  {hud.kills} Kills
                </span>
              </div>
              <span className="font-mono-num text-3xl font-bold text-[#f4b942] leading-none drop-shadow-[0_1px_6px_rgba(244,185,66,0.3)]">
                {hud.points}
              </span>

              {/* Floating BO2 score delta popups (+10, +70, +160, -2000) */}
              <div className="pointer-events-none absolute -top-3 right-2 flex flex-col items-end">
                {hud.scoreTicks.map((tick) => (
                  <span
                    key={tick.id}
                    className={`bo2-score-tick font-mono-num text-base font-bold leading-none ${
                      tick.delta >= 0 ? 'text-[#f4b942]' : 'text-[#ef4444]'
                    }`}
                  >
                    {tick.delta >= 0 ? `+${tick.delta}` : tick.delta}
                  </span>
                ))}
              </div>
            </div>

            {/* Weapon Silhouette, Ammo Readout & 1-2-3 Slots */}
            <div className="w-full bg-[#100c0b]/90 border border-[#3a271f] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div
                    className="font-bo2 text-2xl font-bold tracking-[0.1em] uppercase leading-none"
                    style={{
                      color: activeSpec.isPlasma ? '#22e584' : '#f0e8dd',
                    }}
                  >
                    {activeSpec.name}
                  </div>
                  <div className="text-xs font-bo2 tracking-[0.1em] uppercase text-[#9c8e84] mt-0.5">
                    {activeSpec.caliberLabel}
                  </div>
                </div>

                <WeaponSilhouette
                  weaponId={hud.activeWeaponId}
                  className={`w-24 h-8 shrink-0 ${
                    activeSpec.isPlasma ? 'text-[#9ff0c4]' : 'text-[#cabcb0]'
                  }`}
                />
              </div>

              {/* Ammo count or Reload bar */}
              <div className="mt-2 flex items-baseline justify-between">
                {hud.reloading ? (
                  <div className="w-full">
                    <div className="flex items-center justify-between text-xs font-mono-num font-bold tracking-[0.12em] uppercase text-[#f26419] mb-1">
                      <span>Reloading</span>
                      <span>{Math.round(hud.reloadProgress * 100)}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-[#1e1715] overflow-hidden">
                      <div
                        className="h-full bg-[#f26419]"
                        style={{ width: `${hud.reloadProgress * 100}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-baseline gap-1.5 font-mono-num">
                      <span
                        className={`text-4xl font-bold leading-none ${
                          activeState.ammoInMag === 0
                            ? 'text-[#ef4444]'
                            : isLowAmmo
                            ? 'text-[#f26419]'
                            : activeSpec.isPlasma
                            ? 'text-[#22e584]'
                            : 'text-[#f5efe6]'
                        }`}
                      >
                        {activeState.ammoInMag}
                      </span>
                      <span className="text-lg text-[#948479]">/ {activeState.ammoReserve}</span>
                    </div>
                    <span className="text-xs font-bo2 tracking-[0.12em] uppercase text-[#9c8e84]">
                      {activeState.ammoInMag === 0
                        ? activeState.ammoReserve > 0
                          ? 'Press R'
                          : 'Empty'
                        : 'R Reload'}
                    </span>
                  </>
                )}
              </div>

              {/* 1-2-3 Weapon Slot Bar */}
              <div className="mt-2.5 pt-2 border-t border-[#291d18] grid grid-cols-3 gap-1.5 pointer-events-auto">
                {WEAPON_ORDER.map((id) => {
                  const spec = WEAPONS[id];
                  const st = hud.weapons[id];
                  const isActive = hud.activeWeaponId === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={!st.unlocked}
                      onClick={() => onSelectWeapon(id)}
                      className={`px-2 py-1 text-xs font-bo2 font-bold uppercase tracking-[0.1em] text-left transition-colors whitespace-nowrap truncate border ${
                        isActive
                          ? spec.isPlasma
                            ? 'bg-[#10261c] border-[#22e584]/75 text-[#22e584]'
                            : 'bg-[#261611] border-[#f26419]/80 text-[#fff4e6]'
                          : st.unlocked
                          ? 'bg-[#15100e] border-[#33231c] text-[#a39489] hover:text-white cursor-pointer'
                          : 'bg-[#0d0908] border-[#211713] text-[#4e423b] cursor-not-allowed'
                      }`}
                    >
                      <span className="opacity-65 mr-1">{spec.slot}</span>
                      <span>{st.unlocked ? spec.name : 'Locked'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
