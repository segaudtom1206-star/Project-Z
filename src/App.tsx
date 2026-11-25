import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHud } from './components/GameHud';
import { GameModals } from './components/GameModals';
import { TitleOverlay } from './components/TitleOverlay';
import { IronblockEngine } from './game/engine';
import { HudSnapshot, WeaponId } from './game/types';

const INITIAL_HUD: HudSnapshot = {
  phase: 'TITLE_MENU',
  hp: 100,
  maxHp: 100,
  hpStateLabel: 'STEADY',
  points: 500,
  totalPointsEarned: 500,
  scoreTicks: [],
  wave: 1,
  waveState: 'ACTIVE',
  intermissionSeconds: 0,
  roundAnimPhase: 'IDLE',
  roundAnimProgress: 1,
  zombiesRemaining: 0,
  kills: 0,
  gibs: 0,
  bestWave: 1,
  sectorName: 'CENTRAL ROTUNDA',
  activeWeaponId: 'AN_94',
  weapons: {
    AN_94: { id: 'AN_94', unlocked: true, ammoInMag: 30, ammoReserve: 240 },
    HAMR: { id: 'HAMR', unlocked: false, ammoInMag: 75, ammoReserve: 375 },
    RAY_GUN: { id: 'RAY_GUN', unlocked: false, ammoInMag: 20, ammoReserve: 140 },
  },
  reloading: false,
  reloadProgress: 0,
  nearbyCrate: null,
  statusBanner: null,
  muted: false,
  damageFlash: 0,
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<IronblockEngine | null>(null);
  const hudRecoilRef = useRef<HTMLDivElement | null>(null);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new IronblockEngine(canvas, {
      onHudUpdate: (snapshot) => {
        setHud(snapshot);
      },
      onRecoilFrame: (x, y, rotDeg, trauma) => {
        const el = hudRecoilRef.current;
        if (!el) return;
        const microScale = 1 + trauma * 0.012;
        el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${rotDeg.toFixed(2)}deg) scale(${microScale.toFixed(4)})`;
      },
    });

    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  const handleStart = useCallback(() => {
    engineRef.current?.startNewGame();
  }, []);

  const handleResume = useCallback(() => {
    engineRef.current?.resumeGame();
  }, []);

  const handleTogglePause = useCallback(() => {
    engineRef.current?.togglePause();
  }, []);

  const handleToggleMute = useCallback(() => {
    engineRef.current?.toggleMute();
  }, []);

  const handleSelectWeapon = useCallback((id: WeaponId) => {
    engineRef.current?.selectWeapon(id);
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#080606]">
      {/* Isolated full-viewport game canvas container */}
      <div
        className={`w-full h-full ${hud.phase === 'PLAYING' ? 'game-crosshair' : ''}`}
      >
        <canvas ref={canvasRef} className="block w-full h-full" />
      </div>

      {/* Subtle COD2 film grit overlay (compositor-only, non-blocking) */}
      <div className="fixed inset-0 z-[5] pointer-events-none film-grain opacity-75" />

      {hud.phase === 'TITLE_MENU' && (
        <TitleOverlay
          bestWave={hud.bestWave}
          muted={hud.muted}
          onStart={handleStart}
          onToggleMute={handleToggleMute}
        />
      )}

      {hud.phase !== 'TITLE_MENU' && (
        <GameHud
          hud={hud}
          recoilRef={hudRecoilRef}
          onTogglePause={handleTogglePause}
          onToggleMute={handleToggleMute}
          onSelectWeapon={handleSelectWeapon}
        />
      )}

      <GameModals
        hud={hud}
        onResume={handleResume}
        onRestart={handleStart}
        onToggleMute={handleToggleMute}
      />
    </main>
  );
}
