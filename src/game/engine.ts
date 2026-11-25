import { HorrorAudio } from './audio';
import { GoreLayer } from './gore';
import { LightingEngine } from './lighting';
import {
  computeFlowField,
  createPrisonMap,
  getSectorAt,
  hasWallBetween,
  isSolidForBullets,
  MAP_COLS,
  MAP_HEIGHT,
  MAP_ROWS,
  MAP_WIDTH,
  PrisonMapData,
  resolveMapCollision,
  TILE_SIZE,
} from './prisonMap';
import {
  Bullet,
  CrateEntity,
  FloatingCallout,
  GamePhase,
  HudSnapshot,
  NearbyCratePrompt,
  Particle,
  RoundAnimPhase,
  ScoreTick,
  ShellCasing,
  TransientLight,
  WeaponId,
  WeaponRuntimeState,
  Zombie,
  ZombieArchetype,
} from './types';
import { WEAPON_ORDER, WEAPONS } from './weapons';

const BEST_WAVE_STORAGE_KEY = 'ironblock_best_wave_v1';

interface EngineCallbacks {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onRecoilFrame: (x: number, y: number, rotDeg: number, trauma: number) => void;
}

export class IronblockEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private callbacks: EngineCallbacks;

  private map: PrisonMapData;
  private gore: GoreLayer;
  private lighting: LightingEngine;
  private audio: HorrorAudio;
  private flowField: Int16Array;

  private rafId = 0;
  private lastTimestamp = 0;
  private elapsed = 0;
  private viewWidth = 1280;
  private viewHeight = 720;
  private dpr = 1;

  // Game state
  private phase: GamePhase = 'TITLE_MENU';
  private bestWave = 1;

  // Player state
  private player = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    angle: 0,
    radius: 15,
    hp: 100,
    maxHp: 100,
    speed: 228,
    hurtGrace: 0,
    timeSinceHurt: 10,
    flashlightFlicker: 1,
    walkPhase: 0,
    muzzleKick: 0,
  };

  // Economy & Waves
  private points = 500;
  private totalPointsEarned = 500;
  private scoreTicks: Array<ScoreTick & { life: number }> = [];
  private nextScoreTickId = 1;
  private wave = 1;
  private waveState: 'ACTIVE' | 'INTERMISSION' = 'ACTIVE';
  private intermissionTimer = 0;
  private roundAnimPhase: RoundAnimPhase = 'IDLE';
  private roundAnimTimer = 0;
  private roundAnimDuration = 2.4;
  private waveToSpawn = 0;
  private spawnTimer = 0;
  private kills = 0;
  private gibs = 0;
  private statusBanner: { text: string; timer: number } | null = null;
  private damageFlash = 0;
  private hitstopTimer = 0;
  private fireEmitTimer = 0;

  // Weapons
  private activeWeaponId: WeaponId = 'AN_94';
  private weapons!: Record<WeaponId, WeaponRuntimeState>;
  private fireCooldown = 0;
  private burstShotsFired = 0;
  private triggerReleasedSinceShot = true;
  private fireHeat = 0;
  private reloading = false;
  private reloadTimer = 0;
  private reloadDuration = 1.5;

  // Entities
  private nextEntityId = 1;
  private zombies: Zombie[] = [];
  private bullets: Bullet[] = [];
  private transientLights: TransientLight[] = [];
  private particles: Particle[] = [];
  private casings: ShellCasing[] = [];
  private callouts: FloatingCallout[] = [];
  private dustMotes: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
    a: number;
    isEmber: boolean;
    phase: number;
  }> = [];

  // Camera & Coupled Spring Recoil (drives BOTH screen shake AND HUD movement!)
  private camX = 0;
  private camY = 0;
  private camShakeX = 0;
  private camShakeY = 0;
  private camShakeVelX = 0;
  private camShakeVelY = 0;
  private camRoll = 0;
  private camRollVel = 0;
  private trauma = 0;

  private hudOffX = 0;
  private hudOffY = 0;
  private hudVelX = 0;
  private hudVelY = 0;
  private hudRot = 0;
  private hudVelRot = 0;

  // Flow field refresh throttle
  private flowTimer = 0;
  private hudSyncTimer = 0;

  // Input state
  private keysHeld = new Set<string>();
  private mouseDown = false;
  private mouseScreenX = 640;
  private mouseScreenY = 360;

  // Bound listeners
  private onKeyDownBound: (e: KeyboardEvent) => void;
  private onKeyUpBound: (e: KeyboardEvent) => void;
  private onMouseMoveBound: (e: MouseEvent) => void;
  private onMouseDownBound: (e: MouseEvent) => void;
  private onMouseUpBound: (e: MouseEvent) => void;
  private onWheelBound: (e: WheelEvent) => void;
  private onBlurBound: () => void;
  private onResizeBound: () => void;
  private onContextMenuBound: (e: MouseEvent) => void;

  constructor(canvas: HTMLCanvasElement, callbacks: EngineCallbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.callbacks = callbacks;

    this.map = createPrisonMap();
    this.gore = new GoreLayer();
    this.lighting = new LightingEngine();
    this.audio = new HorrorAudio();
    this.flowField = new Int16Array(MAP_COLS * MAP_ROWS);

    this.loadBestWave();
    this.initDustMotes();
    this.resetSimulationState();

    this.onKeyDownBound = this.handleKeyDown.bind(this);
    this.onKeyUpBound = this.handleKeyUp.bind(this);
    this.onMouseMoveBound = this.handleMouseMove.bind(this);
    this.onMouseDownBound = this.handleMouseDown.bind(this);
    this.onMouseUpBound = this.handleMouseUp.bind(this);
    this.onWheelBound = this.handleWheel.bind(this);
    this.onBlurBound = this.handleBlur.bind(this);
    this.onResizeBound = this.handleResize.bind(this);
    this.onContextMenuBound = (e: MouseEvent) => e.preventDefault();

    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);
    window.addEventListener('mousemove', this.onMouseMoveBound);
    window.addEventListener('mousedown', this.onMouseDownBound);
    window.addEventListener('mouseup', this.onMouseUpBound);
    window.addEventListener('wheel', this.onWheelBound, { passive: true });
    window.addEventListener('blur', this.onBlurBound);
    window.addEventListener('resize', this.onResizeBound);
    this.canvas.addEventListener('contextmenu', this.onContextMenuBound);

    this.handleResize();
    this.audio.startMenuTheme();
    this.pushHudSnapshot();
    this.lastTimestamp = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  public destroy(): void {
    cancelAnimationFrame(this.rafId);
    this.audio.destroy();
    window.removeEventListener('keydown', this.onKeyDownBound);
    window.removeEventListener('keyup', this.onKeyUpBound);
    window.removeEventListener('mousemove', this.onMouseMoveBound);
    window.removeEventListener('mousedown', this.onMouseDownBound);
    window.removeEventListener('mouseup', this.onMouseUpBound);
    window.removeEventListener('wheel', this.onWheelBound);
    window.removeEventListener('blur', this.onBlurBound);
    window.removeEventListener('resize', this.onResizeBound);
    this.canvas.removeEventListener('contextmenu', this.onContextMenuBound);
  }

  private loadBestWave(): void {
    try {
      const saved = localStorage.getItem(BEST_WAVE_STORAGE_KEY);
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!Number.isNaN(parsed) && parsed >= 1) this.bestWave = parsed;
      }
    } catch {
      // ignore storage errors
    }
  }

  private saveBestWave(w: number): void {
    if (w > this.bestWave) {
      this.bestWave = w;
      try {
        localStorage.setItem(BEST_WAVE_STORAGE_KEY, String(w));
      } catch {
        // ignore storage errors
      }
    }
  }

  private initDustMotes(): void {
    this.dustMotes = [];
    for (let i = 0; i < 125; i++) {
      const isEmber = i % 3 !== 0; // 2/3 glowing TranZit lava embers, 1/3 floating ash
      this.dustMotes.push({
        x: Math.random() * MAP_WIDTH,
        y: Math.random() * MAP_HEIGHT,
        vx: (Math.random() - 0.35) * (isEmber ? 22 : 12),
        vy: isEmber ? -(10 + Math.random() * 24) : (Math.random() - 0.5) * 14,
        r: isEmber ? 1.1 + Math.random() * 1.9 : 1.0 + Math.random() * 1.5,
        a: isEmber ? 0.45 + Math.random() * 0.45 : 0.16 + Math.random() * 0.22,
        isEmber,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  private addPoints(delta: number): void {
    this.points = Math.max(0, this.points + delta);
    if (delta > 0) this.totalPointsEarned += delta;
    this.scoreTicks.push({
      id: this.nextScoreTickId++,
      delta,
      life: 0.9,
    });
    if (this.scoreTicks.length > 6) {
      this.scoreTicks.shift();
    }
  }

  private resetSimulationState(): void {
    this.player.x = this.map.playerStart.x;
    this.player.y = this.map.playerStart.y;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.angle = -Math.PI / 2;
    this.player.hp = 100;
    this.player.maxHp = 100;
    this.player.hurtGrace = 0;
    this.player.timeSinceHurt = 10;
    this.player.flashlightFlicker = 1;
    this.player.muzzleKick = 0;

    this.points = 500;
    this.totalPointsEarned = 500;
    this.scoreTicks = [];
    this.wave = 1;
    this.waveState = 'ACTIVE';
    this.intermissionTimer = 0;
    this.roundAnimPhase = 'IDLE';
    this.roundAnimTimer = 0;
    this.kills = 0;
    this.gibs = 0;
    this.damageFlash = 0;
    this.hitstopTimer = 0;
    this.statusBanner = null;

    this.activeWeaponId = 'AN_94';
    this.weapons = {
      AN_94: {
        id: 'AN_94',
        unlocked: true,
        ammoInMag: WEAPONS.AN_94.magSize,
        ammoReserve: WEAPONS.AN_94.maxReserve,
      },
      HAMR: {
        id: 'HAMR',
        unlocked: false,
        ammoInMag: WEAPONS.HAMR.magSize,
        ammoReserve: WEAPONS.HAMR.maxReserve,
      },
      RAY_GUN: {
        id: 'RAY_GUN',
        unlocked: false,
        ammoInMag: WEAPONS.RAY_GUN.magSize,
        ammoReserve: WEAPONS.RAY_GUN.maxReserve,
      },
    };
    this.fireCooldown = 0;
    this.burstShotsFired = 0;
    this.triggerReleasedSinceShot = true;
    this.fireHeat = 0;
    this.reloading = false;
    this.reloadTimer = 0;

    for (const c of this.map.crates) {
      c.purchased = false;
      c.cooldown = 0;
    }

    this.zombies = [];
    this.bullets = [];
    this.transientLights = [];
    this.particles = [];
    this.casings = [];
    this.callouts = [];

    this.camShakeX = 0;
    this.camShakeY = 0;
    this.camShakeVelX = 0;
    this.camShakeVelY = 0;
    this.camRoll = 0;
    this.camRollVel = 0;
    this.trauma = 0;
    this.hudOffX = 0;
    this.hudOffY = 0;
    this.hudVelX = 0;
    this.hudVelY = 0;
    this.hudRot = 0;
    this.hudVelRot = 0;

    this.gore.reset();
    this.camX = this.player.x - this.viewWidth / 2;
    this.camY = this.player.y - this.viewHeight / 2;
    computeFlowField(this.map.grid, this.player.x, this.player.y, this.flowField);
  }

  public startNewGame(): void {
    this.audio.unlock();
    this.audio.stopMenuTheme(0.85);
    this.audio.stopActiveRoundAudio();
    this.audio.setPaused(false);
    this.resetSimulationState();
    this.phase = 'PLAYING';
    this.beginWave(1);
    this.pushHudSnapshot();
  }

  public resumeGame(): void {
    if (this.phase === 'PAUSED') {
      this.audio.unlock();
      this.audio.setPaused(false);
      this.phase = 'PLAYING';
      this.keysHeld.clear();
      this.mouseDown = false;
      this.pushHudSnapshot();
    }
  }

  public pauseGame(): void {
    if (this.phase === 'PLAYING') {
      this.phase = 'PAUSED';
      this.audio.setPaused(true);
      this.keysHeld.clear();
      this.mouseDown = false;
      this.pushHudSnapshot();
    }
  }

  public togglePause(): void {
    if (this.phase === 'PLAYING') this.pauseGame();
    else if (this.phase === 'PAUSED') this.resumeGame();
  }

  public toggleMute(): void {
    this.audio.unlock();
    this.audio.toggleMute();
    this.pushHudSnapshot();
  }

  public selectWeapon(id: WeaponId): void {
    if (this.phase !== 'PLAYING') return;
    if (!this.weapons[id].unlocked || this.activeWeaponId === id) return;
    this.activeWeaponId = id;
    this.reloading = false;
    this.reloadTimer = 0;
    this.fireCooldown = 0.14;
    this.burstShotsFired = 0;
    this.audio.playReloadStart();
    this.pushHudSnapshot();
  }

  private beginWave(waveNum: number): void {
    this.wave = waveNum;
    this.saveBestWave(waveNum);
    this.waveState = 'ACTIVE';
    this.waveToSpawn = 6 + Math.floor(waveNum * 3.4);
    // Delay first spawns ~2.25s so zombies emerge right as the round-start thunder slam hits
    this.spawnTimer = 2.25;
    const roundStartDur = this.audio.getRoundStartDuration();
    this.roundAnimPhase = 'STARTING';
    this.roundAnimDuration = roundStartDur;
    this.roundAnimTimer = roundStartDur;
    this.audio.playRoundStart();
  }

  private handleResize(): void {
    const parent = this.canvas.parentElement;
    const w = parent ? parent.clientWidth : window.innerWidth;
    const h = parent ? parent.clientHeight : window.innerHeight;
    this.viewWidth = Math.max(320, w);
    this.viewHeight = Math.max(240, h);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.canvas.width = Math.round(this.viewWidth * this.dpr);
    this.canvas.height = Math.round(this.viewHeight * this.dpr);
    this.canvas.style.width = `${this.viewWidth}px`;
    this.canvas.style.height = `${this.viewHeight}px`;
    this.lighting.resize(this.viewWidth, this.viewHeight);
  }

  private handleBlur(): void {
    this.keysHeld.clear();
    this.mouseDown = false;
  }

  private handleKeyDown(e: KeyboardEvent): void {
    const code = e.code;

    if (this.phase === 'TITLE_MENU') {
      if (code === 'Enter' || code === 'Space') {
        e.preventDefault();
        this.startNewGame();
      } else if (code === 'KeyM') {
        this.toggleMute();
      } else {
        this.audio.startMenuTheme();
      }
      return;
    }

    if (code === 'Escape') {
      e.preventDefault();
      if (this.phase === 'PLAYING' || this.phase === 'PAUSED') {
        this.togglePause();
      }
      return;
    }

    if (code === 'KeyM') {
      this.toggleMute();
      return;
    }

    if (this.phase !== 'PLAYING') return;

    this.keysHeld.add(code);

    if (code === 'Digit1') this.selectWeapon('AN_94');
    else if (code === 'Digit2') this.selectWeapon('HAMR');
    else if (code === 'Digit3') this.selectWeapon('RAY_GUN');
    else if (code === 'KeyR') this.tryStartReload();
    else if (code === 'KeyE') this.tryInteractNearestCrate();
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.keysHeld.delete(e.code);
  }

  private handleMouseMove(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseScreenX = e.clientX - rect.left;
    this.mouseScreenY = e.clientY - rect.top;
  }

  private handleMouseDown(e: MouseEvent): void {
    if (this.phase === 'TITLE_MENU') {
      // Unlock browser autoplay for the Main Menu Theme on first click
      this.audio.startMenuTheme();
      return;
    }
    if (e.button !== 0) return;
    if (this.phase !== 'PLAYING') return;
    this.audio.unlock();
    this.mouseDown = true;
    this.burstShotsFired = 0;
  }

  private handleMouseUp(e: MouseEvent): void {
    if (e.button !== 0) return;
    this.mouseDown = false;
    this.triggerReleasedSinceShot = true;
    this.burstShotsFired = 0;
  }

  private handleWheel(e: WheelEvent): void {
    if (this.phase !== 'PLAYING') return;
    const unlocked = WEAPON_ORDER.filter((id) => this.weapons[id].unlocked);
    if (unlocked.length <= 1) return;
    const idx = unlocked.indexOf(this.activeWeaponId);
    const dir = e.deltaY > 0 ? 1 : -1;
    const next = unlocked[(idx + dir + unlocked.length) % unlocked.length];
    this.selectWeapon(next);
  }

  private tryStartReload(): void {
    if (this.reloading) return;
    const wState = this.weapons[this.activeWeaponId];
    const spec = WEAPONS[this.activeWeaponId];
    if (wState.ammoInMag >= spec.magSize || wState.ammoReserve <= 0) return;

    this.reloading = true;
    this.reloadDuration = spec.reloadTime;
    this.reloadTimer = spec.reloadTime;
    this.audio.playReloadStart();
    // Subtle reload mechanical tug on HUD
    this.hudVelY += 85;
    this.hudVelRot += 2.2;
    this.pushHudSnapshot();
  }

  private finishReload(): void {
    const wState = this.weapons[this.activeWeaponId];
    const spec = WEAPONS[this.activeWeaponId];
    const needed = spec.magSize - wState.ammoInMag;
    const taken = Math.min(needed, wState.ammoReserve);
    wState.ammoInMag += taken;
    wState.ammoReserve -= taken;
    this.reloading = false;
    this.reloadTimer = 0;
    this.audio.playReloadComplete();
    // Crisp bolt-rack clack jolt on HUD
    this.hudVelY -= 120;
    this.hudVelRot -= 3.5;
    this.pushHudSnapshot();
  }

  private getNearestCrate(): CrateEntity | null {
    let best: CrateEntity | null = null;
    let bestDistSq = 98 * 98;
    for (const c of this.map.crates) {
      const dx = c.x - this.player.x;
      const dy = c.y - this.player.y;
      const dSq = dx * dx + dy * dy;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        best = c;
      }
    }
    return best;
  }

  private getCratePrompt(crate: CrateEntity | null): NearbyCratePrompt | null {
    if (!crate) return null;
    if (crate.weaponId) {
      const wState = this.weapons[crate.weaponId];
      if (wState.unlocked) {
        const refillCost = crate.weaponId === 'RAY_GUN' ? 750 : 500;
        return {
          id: crate.id,
          label: crate.label,
          actionText: `Refill ${WEAPONS[crate.weaponId].name} Ammo`,
          cost: refillCost,
          canAfford: this.points >= refillCost,
          accentColor: crate.accentColor,
        };
      }
      return {
        id: crate.id,
        label: crate.label,
        actionText: `Unlock ${WEAPONS[crate.weaponId].name}`,
        cost: crate.cost,
        canAfford: this.points >= crate.cost,
        accentColor: crate.accentColor,
      };
    }

    if (crate.kind === 'AMMO_SUPPLY') {
      return {
        id: crate.id,
        label: crate.label,
        actionText: `Refill ${WEAPONS[this.activeWeaponId].name}`,
        cost: crate.cost,
        canAfford: this.points >= crate.cost,
        accentColor: crate.accentColor,
      };
    }

    return {
      id: crate.id,
      label: crate.label,
      actionText: this.player.hp >= this.player.maxHp ? 'Health Full' : 'Restore Full Health',
      cost: crate.cost,
      canAfford: this.points >= crate.cost && this.player.hp < this.player.maxHp,
      accentColor: crate.accentColor,
    };
  }

  private tryInteractNearestCrate(): void {
    const crate = this.getNearestCrate();
    if (!crate) return;

    if (crate.weaponId) {
      const wId = crate.weaponId;
      const wState = this.weapons[wId];
      const spec = WEAPONS[wId];
      if (!wState.unlocked) {
        if (this.points < crate.cost) {
          this.showStatusBanner(`NEED ${crate.cost} PTS FOR ${spec.name}`);
          this.audio.playDryFire();
          return;
        }
        this.addPoints(-crate.cost);
        wState.unlocked = true;
        wState.ammoInMag = spec.magSize;
        wState.ammoReserve = spec.maxReserve;
        crate.purchased = true;
        this.activeWeaponId = wId;
        this.reloading = false;
        this.audio.playCratePurchase(wId === 'RAY_GUN');
        this.showStatusBanner(`${spec.name} ACQUIRED — EQUIPPED`);
        this.transientLights.push({
          x: crate.x,
          y: crate.y,
          radius: 260,
          rgb: crate.accentRgb,
          intensity: 1.0,
          life: 0.45,
          maxLife: 0.45,
          castShadows: true,
        });
        this.pushHudSnapshot();
      } else {
        const refillCost = wId === 'RAY_GUN' ? 750 : 500;
        if (this.points < refillCost) {
          this.showStatusBanner(`NEED ${refillCost} PTS TO REFILL ${spec.name}`);
          this.audio.playDryFire();
          return;
        }
        this.addPoints(-refillCost);
        wState.ammoInMag = spec.magSize;
        wState.ammoReserve = spec.maxReserve;
        this.reloading = false;
        this.audio.playCratePurchase(false);
        this.showStatusBanner(`${spec.name} AMMO MAXED`);
        this.pushHudSnapshot();
      }
      return;
    }

    if (crate.kind === 'AMMO_SUPPLY') {
      const wState = this.weapons[this.activeWeaponId];
      const spec = WEAPONS[this.activeWeaponId];
      if (wState.ammoInMag === spec.magSize && wState.ammoReserve === spec.maxReserve) {
        this.showStatusBanner(`${spec.name} AMMO ALREADY FULL`);
        return;
      }
      if (this.points < crate.cost) {
        this.showStatusBanner(`NEED ${crate.cost} PTS FOR MUNITIONS`);
        this.audio.playDryFire();
        return;
      }
      this.addPoints(-crate.cost);
      wState.ammoInMag = spec.magSize;
      wState.ammoReserve = spec.maxReserve;
      this.reloading = false;
      this.audio.playCratePurchase(false);
      this.showStatusBanner(`${spec.name} RESUPPLIED`);
      this.pushHudSnapshot();
      return;
    }

    if (crate.kind === 'MEDKIT_CRATE') {
      if (this.player.hp >= this.player.maxHp) {
        this.showStatusBanner('HEALTH ALREADY FULL');
        return;
      }
      if (this.points < crate.cost) {
        this.showStatusBanner(`NEED ${crate.cost} PTS FOR MEDKIT`);
        this.audio.playDryFire();
        return;
      }
      this.addPoints(-crate.cost);
      this.player.hp = this.player.maxHp;
      this.audio.playCratePurchase(false);
      this.showStatusBanner('FIELD BANDAGE APPLIED · 100 HP');
      this.pushHudSnapshot();
    }
  }

  private showStatusBanner(text: string): void {
    this.statusBanner = { text, timer: 2.2 };
  }

  /**
   * Injects caliber- and fire-rate-scaled recoil impulse into BOTH camera shake & HUD spring physics.
   */
  private applyWeaponRecoil(
    aimAngle: number,
    kick: number,
    traumaAdd: number,
    rollAmp: number,
    hudScale: number,
    rateIntensity: number
  ): void {
    const backX = -Math.cos(aimAngle);
    const backY = -Math.sin(aimAngle);
    const jitterAngle = (Math.random() - 0.5) * 0.45;
    const jx = Math.cos(aimAngle + Math.PI + jitterAngle);
    const jy = Math.sin(aimAngle + Math.PI + jitterAngle);

    const scale = 1 + this.fireHeat * 0.34 + rateIntensity * 0.28;
    const rollSign = Math.random() < 0.5 ? -1 : 1;

    // World Camera Spring Shake
    this.camShakeVelX += jx * kick * 24 * scale;
    this.camShakeVelY += jy * kick * 24 * scale;
    this.camRollVel += rollSign * rollAmp * 16 * scale;
    this.trauma = Math.min(1.0, this.trauma + traumaAdd * (0.85 + rateIntensity * 0.35));

    // Coupled HUD Recoil Motion (moves crisply opposite the firing direction + rotational kick!)
    this.hudVelX += (backX * 0.8 + (Math.random() - 0.5) * 0.45) * kick * hudScale * 26 * scale;
    this.hudVelY += (backY * 0.8 + (Math.random() - 0.5) * 0.45) * kick * hudScale * 26 * scale;
    this.hudVelRot += rollSign * hudScale * (6.2 + rateIntensity * 3.5);
  }

  private applyExplosionShake(distToPlayer: number, maxRange: number, power = 1.0): void {
    const factor = Math.max(0, 1 - distToPlayer / maxRange);
    if (factor <= 0) return;
    const a = Math.random() * Math.PI * 2;
    this.camShakeVelX += Math.cos(a) * 420 * factor * power;
    this.camShakeVelY += Math.sin(a) * 420 * factor * power;
    this.camRollVel += (Math.random() - 0.5) * 0.55 * factor * power;
    this.trauma = Math.min(1.0, this.trauma + 0.58 * factor * power);
    this.hudVelX += Math.cos(a) * 320 * factor * power;
    this.hudVelY += Math.sin(a) * 320 * factor * power;
    this.hudVelRot += (Math.random() - 0.5) * 26 * factor * power;
  }

  private fireActiveWeapon(): void {
    const spec = WEAPONS[this.activeWeaponId];
    const wState = this.weapons[this.activeWeaponId];

    if (this.reloading) return;
    if (wState.ammoInMag <= 0) {
      this.audio.playDryFire();
      this.fireCooldown = 0.22;
      if (wState.ammoReserve > 0) {
        this.tryStartReload();
      }
      return;
    }

    wState.ammoInMag -= 1;
    this.burstShotsFired += 1;
    this.triggerReleasedSinceShot = false;

    // Determine authentic BO2 cadence: AN-94 2-round hyperburst, HAMR 7-round rapid start
    const inBurst = this.burstShotsFired < spec.burstCount;
    const interval = inBurst ? spec.burstInterval : spec.fireInterval;
    this.fireCooldown = interval;

    // Higher fire rate amplifies sustained tremor & heat!
    const rateIntensity = Math.min(1.2, 0.08 / Math.max(0.035, interval));
    this.fireHeat = Math.min(1.0, this.fireHeat + (spec.id === 'HAMR' ? 0.16 : 0.11));

    // Spread increases slightly during sustained fire
    const spread = spec.spreadRad * (1 + this.fireHeat * 0.65);
    const shotAngle = this.player.angle + (Math.random() - 0.5) * spread * 2;

    // Gun barrel tip origin
    const muzzleDist = 24;
    const sideOffset = 5;
    const mx =
      this.player.x +
      Math.cos(this.player.angle) * muzzleDist -
      Math.sin(this.player.angle) * sideOffset;
    const my =
      this.player.y +
      Math.sin(this.player.angle) * muzzleDist +
      Math.cos(this.player.angle) * sideOffset;

    // Verify unobstructed line from player center to muzzle tip so pressing against a wall never shoots through it
    const muzzleHit = this.findWallOrBarrelAlongSegment(this.player.x, this.player.y, mx, my);

    const bullet: Bullet = {
      id: this.nextEntityId++,
      weaponId: spec.id,
      x: muzzleHit ? muzzleHit.x : mx,
      y: muzzleHit ? muzzleHit.y : my,
      prevX: this.player.x,
      prevY: this.player.y,
      spawnX: muzzleHit ? muzzleHit.x : mx,
      spawnY: muzzleHit ? muzzleHit.y : my,
      vx: Math.cos(shotAngle) * spec.projectileSpeed,
      vy: Math.sin(shotAngle) * spec.projectileSpeed,
      angle: shotAngle,
      damage: spec.damage,
      splashRadius: spec.splashRadius,
      splashDamage: spec.splashDamage,
      life: spec.isPlasma ? 1.8 : 1.15,
      maxLife: spec.isPlasma ? 1.8 : 1.15,
      lightRadius: spec.bulletLightRadius,
      lightRgb: spec.bulletLightRgb,
      lightIntensity: spec.bulletLightIntensity,
      tracerLength: spec.tracerLength,
      tracerWidth: spec.tracerWidth,
      pelletColor: spec.pelletColor,
      isPlasma: spec.isPlasma,
      goreForce: spec.goreForce,
    };

    if (muzzleHit) {
      this.triggerBulletWallImpact(bullet);
    } else {
      this.bullets.push(bullet);
    }

    // Intense short-lived raycasted muzzle flash light illuminating the corridor
    this.transientLights.push({
      x: muzzleHit ? muzzleHit.x : mx,
      y: muzzleHit ? muzzleHit.y : my,
      radius: spec.muzzleFlashRadius * (0.92 + Math.random() * 0.18),
      rgb: spec.bulletLightRgb,
      intensity: spec.isPlasma ? 1.15 : 1.05,
      life: spec.id === 'HAMR' ? 0.085 : 0.068,
      maxLife: spec.id === 'HAMR' ? 0.085 : 0.068,
      castShadows: true,
    });

    // Gun barrel visual recoil kick
    this.player.muzzleKick = spec.isPlasma ? 7.5 : spec.id === 'HAMR' ? 6.0 : 4.2;

    // Muzzle spark & gunsmoke particles
    const sparkCount = spec.isPlasma ? 7 : spec.id === 'HAMR' ? 8 : 5;
    for (let i = 0; i < sparkCount; i++) {
      const a = shotAngle + (Math.random() - 0.5) * 0.65;
      const spd = 120 + Math.random() * 240;
      this.particles.push({
        x: mx,
        y: my,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        size: spec.isPlasma ? 2.8 + Math.random() * 2.5 : 1.8 + Math.random() * 2,
        color: spec.isPlasma ? '#48ff9e' : '#ffcf73',
        alpha: 0.95,
        life: 0.08 + Math.random() * 0.1,
        maxLife: 0.18,
        drag: 6,
        kind: spec.isPlasma ? 'plasma' : 'spark',
        rotation: a,
        vRot: 0,
        glow: true,
      });
    }

    // Gunsmoke puff
    this.particles.push({
      x: mx,
      y: my,
      vx: Math.cos(shotAngle) * 42 + (Math.random() - 0.5) * 18,
      vy: Math.sin(shotAngle) * 42 + (Math.random() - 0.5) * 18,
      size: spec.id === 'HAMR' ? 8 : 5.5,
      color: spec.isPlasma ? 'rgba(82, 235, 155, 0.32)' : 'rgba(170, 178, 186, 0.26)',
      alpha: 0.45,
      life: 0.42,
      maxLife: 0.42,
      drag: 3.2,
      kind: 'smoke',
      rotation: Math.random() * Math.PI,
      vRot: (Math.random() - 0.5) * 1.5,
    });

    // Brass shell casing ejection for AN-94 and HAMR
    if (spec.ejectsBrass) {
      const ejAngle = this.player.angle + Math.PI * 0.52 + (Math.random() - 0.5) * 0.4;
      const ejSpd = 65 + Math.random() * 55;
      this.casings.push({
        x: this.player.x + Math.cos(this.player.angle) * 8,
        y: this.player.y + Math.sin(this.player.angle) * 8,
        vx: Math.cos(ejAngle) * ejSpd,
        vy: Math.sin(ejAngle) * ejSpd,
        angle: Math.random() * Math.PI * 2,
        vAngle: (Math.random() - 0.5) * 18,
        life: 0.55 + Math.random() * 0.25,
        settled: false,
      });
    }

    // Caliber- & Fire-rate-scaled screen shake + coupled HUD motion!
    this.applyWeaponRecoil(
      this.player.angle,
      spec.shakeKick,
      spec.shakeTrauma,
      spec.shakeRoll,
      spec.hudKickScale,
      rateIntensity
    );
    this.audio.playGunshot(spec.id);

    // Auto-trigger reload when mag hits 0 and reserve remains
    if (wState.ammoInMag === 0 && wState.ammoReserve > 0) {
      this.tryStartReload();
    }
    this.pushHudSnapshot();
  }

  private spawnZombie(): void {
    // Prefer spawns at a fair horror distance (not on top of player, not impossibly far)
    const candidates = this.map.spawns.filter((sp) => {
      const dx = sp.x - this.player.x;
      const dy = sp.y - this.player.y;
      const d = Math.hypot(dx, dy);
      return d > 310 && d < 1450;
    });
    const pool = candidates.length > 0 ? candidates : this.map.spawns;
    const sp = pool[Math.floor(Math.random() * pool.length)];

    // Escalating archetype distribution across waves
    const roll = Math.random();
    let archetype: ZombieArchetype = 'SHAMBLER';
    if (this.wave >= 3 && roll < Math.min(0.24, 0.08 + this.wave * 0.02)) {
      archetype = 'BRUTE';
    } else if (this.wave >= 2 && roll < Math.min(0.55, 0.22 + this.wave * 0.04)) {
      archetype = 'RUNNER';
    }

    const waveHpScale = 1 + (this.wave - 1) * 0.22;
    const waveSpeedScale = Math.min(1.42, 1 + (this.wave - 1) * 0.04);

    let hp = Math.round(92 * waveHpScale);
    let speed = (78 + Math.random() * 20) * waveSpeedScale;
    let radius = 15;
    let damage = 18;
    let attackWindupDuration = 0.42;
    let pointsOnKill = 70;

    if (archetype === 'RUNNER') {
      hp = Math.round(68 * waveHpScale);
      speed = (146 + Math.random() * 26) * waveSpeedScale;
      radius = 13.5;
      damage = 14;
      attackWindupDuration = 0.28;
      pointsOnKill = 85;
    } else if (archetype === 'BRUTE') {
      hp = Math.round(285 * waveHpScale);
      speed = (64 + Math.random() * 12) * Math.min(1.25, waveSpeedScale);
      radius = 20;
      damage = 32;
      attackWindupDuration = 0.58;
      pointsOnKill = 160;
    }

    this.zombies.push({
      id: this.nextEntityId++,
      archetype,
      x: sp.x + (Math.random() - 0.5) * 24,
      y: sp.y + (Math.random() - 0.5) * 24,
      vx: 0,
      vy: 0,
      angle: Math.atan2(this.player.y - sp.y, this.player.x - sp.x),
      radius,
      hp,
      maxHp: hp,
      speed,
      damage,
      attackRange: radius + this.player.radius + 13,
      attackWindup: 0,
      attackWindupDuration,
      attackCooldown: 0,
      hitFlash: 0,
      stagger: 0,
      walkPhase: Math.random() * Math.PI * 2,
      groanTimer: 2 + Math.random() * 5,
      bleedTrailTimer: 0.4,
      bloodied: false,
      pointsOnKill,
    });
  }

  private damageZombie(
    z: Zombie,
    dmg: number,
    hitAngle: number,
    goreForce: number,
    isPlasma: boolean
  ): boolean {
    z.hp -= dmg;
    z.hitFlash = 0.11;
    z.stagger = Math.max(z.stagger, isPlasma ? 0.18 : 0.08);
    z.vx += Math.cos(hitAngle) * 90 * goreForce;
    z.vy += Math.sin(hitAngle) * 90 * goreForce;
    if (z.hp < z.maxHp * 0.65) z.bloodied = true;

    // Hit points (+10 per shot, classic BO2 Zombies!)
    this.addPoints(10);

    // Directional arterial splatter on persistent gore layer
    this.gore.stampBloodSplatter(z.x, z.y, hitAngle, goreForce);

    // Spray blood particles
    const sprayCount = Math.round(5 + goreForce * 4);
    for (let i = 0; i < sprayCount; i++) {
      const a = hitAngle + (Math.random() - 0.5) * 1.1;
      const spd = (80 + Math.random() * 190) * Math.min(goreForce, 2);
      this.particles.push({
        x: z.x,
        y: z.y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        size: 2.2 + Math.random() * 3.0,
        color: Math.random() < 0.4 ? '#7f1113' : '#b81a1c',
        alpha: 0.92,
        life: 0.24 + Math.random() * 0.22,
        maxLife: 0.46,
        drag: 5.5,
        kind: 'blood',
        rotation: a,
        vRot: 0,
      });
    }

    if (z.hp <= 0) {
      const gibbed = isPlasma || goreForce >= 1.55 || z.hp < -35;
      this.kills += 1;
      if (gibbed) this.gibs += 1;
      const killPts = z.pointsOnKill + (gibbed ? 20 : 0);
      this.addPoints(killPts);

      this.gore.stampCorpseGore(z.x, z.y, hitAngle, gibbed, isPlasma);
      this.audio.playFleshHit(gibbed);

      // Flying chunky gore gibs!
      const gibCount = gibbed ? 14 : 6;
      for (let i = 0; i < gibCount; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 70 + Math.random() * (gibbed ? 250 : 120);
        const isBone = gibbed && i % 4 === 0;
        this.particles.push({
          x: z.x,
          y: z.y,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          size: isBone ? 4.2 : 3.2 + Math.random() * 3.5,
          color: isBone ? '#d6cbb8' : i % 2 === 0 ? '#8c1215' : '#570a0d',
          alpha: 0.96,
          life: 0.35 + Math.random() * 0.35,
          maxLife: 0.7,
          drag: 4.5,
          kind: 'gib',
          rotation: Math.random() * Math.PI * 2,
          vRot: (Math.random() - 0.5) * 14,
        });
      }

      if (z.archetype === 'BRUTE' || isPlasma) {
        this.hitstopTimer = Math.max(this.hitstopTimer, isPlasma ? 0.036 : 0.048);
      }

      this.callouts.push({
        x: z.x,
        y: z.y - 12,
        text: `+${killPts}`,
        color: isPlasma ? '#48ff9e' : '#e5b25d',
        life: 0.85,
        maxLife: 0.85,
      });

      return true;
    }

    this.audio.playFleshHit(false);
    return false;
  }

  private detonatePlasmaBolt(b: Bullet): void {
    this.audio.playPlasmaExplosion();
    this.gore.stampImpactMark(b.x, b.y, true);

    // Massive emerald raycasted blast illumination!
    this.transientLights.push({
      x: b.x,
      y: b.y,
      radius: 420,
      rgb: [45, 255, 148],
      intensity: 1.35,
      life: 0.36,
      maxLife: 0.36,
      castShadows: true,
      isExplosion: true,
    });

    // Emerald shockwave particles
    for (let i = 0; i < 24; i++) {
      const a = (Math.PI * 2 * i) / 24 + (Math.random() - 0.5) * 0.2;
      const spd = 110 + Math.random() * 240;
      this.particles.push({
        x: b.x,
        y: b.y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        size: 3 + Math.random() * 4.5,
        color: i % 2 === 0 ? '#5cffad' : '#18c96e',
        alpha: 0.95,
        life: 0.24 + Math.random() * 0.22,
        maxLife: 0.46,
        drag: 5.2,
        kind: 'plasma',
        rotation: a,
        vRot: 0,
        glow: true,
      });
    }

    // Secondary concussive shockwave shake scaled by proximity
    const distToPlayer = Math.hypot(b.x - this.player.x, b.y - this.player.y);
    this.applyExplosionShake(distToPlayer, 560, 1.15);

    // Classic BO2 Ray Gun close-range self-splash danger (blocked by walls)
    if (
      distToPlayer < b.splashRadius * 0.65 &&
      this.player.hurtGrace <= 0 &&
      !hasWallBetween(this.map.grid, b.x, b.y, this.player.x, this.player.y)
    ) {
      this.hurtPlayer(12);
    }

    // Splash damage to all zombies in blast radius with unobstructed line-of-sight
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      const dx = z.x - b.x;
      const dy = z.y - b.y;
      const dist = Math.hypot(dx, dy);
      if (
        dist <= b.splashRadius + z.radius &&
        !hasWallBetween(this.map.grid, b.x, b.y, z.x, z.y)
      ) {
        const falloff = 1 - (dist / (b.splashRadius + z.radius)) * 0.45;
        const killed = this.damageZombie(
          z,
          b.splashDamage * falloff,
          Math.atan2(dy, dx),
          2.8,
          true
        );
        if (killed) {
          this.zombies.splice(i, 1);
        }
      }
    }
  }

  private isBlockedForBulletPoint(x: number, y: number): boolean {
    const tc = Math.floor(x / TILE_SIZE);
    const tr = Math.floor(y / TILE_SIZE);
    if (
      tc < 0 ||
      tc >= MAP_COLS ||
      tr < 0 ||
      tr >= MAP_ROWS ||
      isSolidForBullets(this.map.grid[tr][tc])
    ) {
      return true;
    }
    for (let i = 0; i < this.map.fires.length; i++) {
      const f = this.map.fires[i];
      if (f.solidRadius <= 0) continue;
      const dx = x - f.x;
      const dy = y - f.y;
      if (dx * dx + dy * dy <= f.solidRadius * f.solidRadius) {
        return true;
      }
    }
    return false;
  }

  private findWallOrBarrelAlongSegment(
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ): { x: number; y: number } | null {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / 3));
    let lastSafeX = x0;
    let lastSafeY = y0;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const px = x0 + dx * t;
      const py = y0 + dy * t;
      if (this.isBlockedForBulletPoint(px, py)) {
        return { x: lastSafeX, y: lastSafeY };
      }
      lastSafeX = px;
      lastSafeY = py;
    }
    return null;
  }

  private triggerBulletWallImpact(b: Bullet): void {
    if (b.isPlasma) {
      this.detonatePlasmaBolt(b);
      return;
    }
    this.gore.stampImpactMark(b.x, b.y, false);
    this.transientLights.push({
      x: b.x - Math.cos(b.angle) * 5,
      y: b.y - Math.sin(b.angle) * 5,
      radius: 115,
      rgb: [255, 196, 110],
      intensity: 0.78,
      life: 0.08,
      maxLife: 0.08,
      castShadows: false,
    });
    for (let k = 0; k < 6; k++) {
      const ra = b.angle + Math.PI + (Math.random() - 0.5) * 1.45;
      const spd = 75 + Math.random() * 150;
      this.particles.push({
        x: b.x,
        y: b.y,
        vx: Math.cos(ra) * spd,
        vy: Math.sin(ra) * spd,
        size: 1.8 + Math.random() * 1.6,
        color: '#ffd280',
        alpha: 0.92,
        life: 0.14 + Math.random() * 0.1,
        maxLife: 0.24,
        drag: 7,
        kind: 'spark',
        rotation: ra,
        vRot: 0,
        glow: true,
      });
    }
  }

  private hurtPlayer(amount: number): void {
    if (this.player.hurtGrace > 0 || this.phase !== 'PLAYING') return;
    this.player.hp = Math.max(0, this.player.hp - amount);
    this.player.hurtGrace = 0.58;
    this.player.timeSinceHurt = 0;
    this.damageFlash = 1.0;
    this.player.flashlightFlicker = 0.25;
    this.audio.playPlayerHurt();

    // Heavy damage camera & HUD slam
    const a = Math.random() * Math.PI * 2;
    this.camShakeVelX += Math.cos(a) * 320;
    this.camShakeVelY += Math.sin(a) * 320;
    this.trauma = Math.min(1.0, this.trauma + 0.55);
    this.hudVelX += Math.cos(a) * 260;
    this.hudVelY += Math.sin(a) * 260;
    this.hudVelRot += (Math.random() - 0.5) * 22;

    if (this.player.hp <= 0) {
      this.phase = 'GAME_OVER';
      this.saveBestWave(this.wave);
      this.keysHeld.clear();
      this.mouseDown = false;
      this.audio.setPaused(true);
    }
    this.pushHudSnapshot();
  }

  private loop = (timestamp: number): void => {
    const rawDt = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;
    const dt = Math.min(Math.max(rawDt, 0.0001), 0.05);
    this.elapsed += dt;

    if (this.phase === 'TITLE_MENU') {
      this.updateTitleBackdrop(dt);
      this.render();
    } else if (this.phase === 'PLAYING') {
      if (this.hitstopTimer > 0) {
        this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
        this.updateRecoilSprings(dt);
      } else {
        this.updatePlaying(dt);
      }
      this.render();
    } else {
      // PAUSED or GAME_OVER: keep rendering frozen frame smoothly
      this.updateRecoilSprings(dt);
      this.render();
    }

    this.rafId = requestAnimationFrame(this.loop);
  };

  private updateTitleBackdrop(dt: number): void {
    // Slow brooding pan around Cellblock D rotunda & North cellbars
    const cx = this.map.playerStart.x + Math.sin(this.elapsed * 0.22) * 190;
    const cy = this.map.playerStart.y - 95 + Math.cos(this.elapsed * 0.16) * 115;
    this.camX = cx - this.viewWidth / 2;
    this.camY = cy - this.viewHeight / 2;
    this.updateDust(dt);
  }

  private updateDust(dt: number): void {
    for (let i = 0; i < this.dustMotes.length; i++) {
      const m = this.dustMotes[i];
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.x < 0) m.x += MAP_WIDTH;
      else if (m.x > MAP_WIDTH) m.x -= MAP_WIDTH;
      if (m.y < 0) m.y += MAP_HEIGHT;
      else if (m.y > MAP_HEIGHT) m.y -= MAP_HEIGHT;
    }
  }

  private updateRecoilSprings(dt: number): void {
    // Camera recoil spring-damper
    const camStiffness = 210;
    const camDamping = 19;
    this.camShakeVelX += (-camStiffness * this.camShakeX - camDamping * this.camShakeVelX) * dt;
    this.camShakeVelY += (-camStiffness * this.camShakeY - camDamping * this.camShakeVelY) * dt;
    this.camShakeX += this.camShakeVelX * dt;
    this.camShakeY += this.camShakeVelY * dt;

    this.camRollVel += (-240 * this.camRoll - 20 * this.camRollVel) * dt;
    this.camRoll += this.camRollVel * dt;

    this.trauma = Math.max(0, this.trauma - dt * 2.15);

    // HUD spring-damper (responsive punchy kickback + crisp military snap recovery)
    const hudStiffness = 260;
    const hudDamping = 20;
    this.hudVelX += (-hudStiffness * this.hudOffX - hudDamping * this.hudVelX) * dt;
    this.hudVelY += (-hudStiffness * this.hudOffY - hudDamping * this.hudVelY) * dt;
    this.hudOffX = Math.max(-24, Math.min(24, this.hudOffX + this.hudVelX * dt));
    this.hudOffY = Math.max(-24, Math.min(24, this.hudOffY + this.hudVelY * dt));

    this.hudVelRot += (-280 * this.hudRot - 21 * this.hudVelRot) * dt;
    this.hudRot = Math.max(-3.2, Math.min(3.2, this.hudRot + this.hudVelRot * dt));

    // Direct 60fps DOM transform callback (zero React re-renders!)
    this.callbacks.onRecoilFrame(this.hudOffX, this.hudOffY, this.hudRot, this.trauma);
  }

  private updatePlaying(dt: number): void {
    this.audio.updateAmbience(dt, true);
    this.updateDust(dt);

    // 1. Player movement
    let moveX = 0;
    let moveY = 0;
    if (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp')) moveY -= 1;
    if (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown')) moveY += 1;
    if (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft')) moveX -= 1;
    if (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight')) moveX += 1;

    const len = Math.hypot(moveX, moveY);
    if (len > 0) {
      moveX /= len;
      moveY /= len;
      this.player.walkPhase += dt * 11;
    }

    // Heavy HAMR slightly weights movement speed for tactile weapon feel
    const weightMult = this.activeWeaponId === 'HAMR' ? 0.89 : 1.0;
    const targetVx = moveX * this.player.speed * weightMult;
    const targetVy = moveY * this.player.speed * weightMult;
    const accel = 16;
    this.player.vx += (targetVx - this.player.vx) * Math.min(1, accel * dt);
    this.player.vy += (targetVy - this.player.vy) * Math.min(1, accel * dt);

    const resolved = resolveMapCollision(
      this.map.grid,
      this.player.x + this.player.vx * dt,
      this.player.y + this.player.vy * dt,
      this.player.radius
    );
    const barrelResolved = this.resolveBarrelCollision(resolved.x, resolved.y, this.player.radius);
    this.player.x = barrelResolved.x;
    this.player.y = barrelResolved.y;

    // 2. Player aim angle toward cursor in world space
    const mouseWorldX = this.camX + this.mouseScreenX;
    const mouseWorldY = this.camY + this.mouseScreenY;
    this.player.angle = Math.atan2(mouseWorldY - this.player.y, mouseWorldX - this.player.x);

    // 3. Player health regen (classic COD2/Zombies slow recovery after 5.5s out of danger)
    if (this.player.hurtGrace > 0) this.player.hurtGrace = Math.max(0, this.player.hurtGrace - dt);
    this.player.timeSinceHurt += dt;
    if (this.player.timeSinceHurt > 5.5 && this.player.hp < this.player.maxHp) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 12 * dt);
    }
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.2);

    // Flashlight subtle horror flicker when low HP or recently struck
    let targetFlicker = 1.0;
    if (this.player.hp < 35) {
      targetFlicker = Math.sin(this.elapsed * 34) > 0.72 ? 0.52 : 0.94;
    }
    this.player.flashlightFlicker += (targetFlicker - this.player.flashlightFlicker) * Math.min(1, dt * 12);
    this.player.muzzleKick = Math.max(0, this.player.muzzleKick - dt * 38);

    // 4. Firing & reloading
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.fireHeat = Math.max(0, this.fireHeat - dt * 1.45);
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.finishReload();
      }
    } else if (this.mouseDown && this.fireCooldown <= 0) {
      const spec = WEAPONS[this.activeWeaponId];
      if (spec.automatic || this.triggerReleasedSinceShot) {
        this.fireActiveWeapon();
      }
    }

    // 5. Camera smooth follow with subtle aim-lead peeking into the dark
    const leadX = Math.cos(this.player.angle) * 62;
    const leadY = Math.sin(this.player.angle) * 62;
    const desiredCamX = this.player.x + leadX - this.viewWidth / 2;
    const desiredCamY = this.player.y + leadY - this.viewHeight / 2;
    this.camX += (desiredCamX - this.camX) * Math.min(1, dt * 7.5);
    this.camY += (desiredCamY - this.camY) * Math.min(1, dt * 7.5);
    this.camX = Math.max(-80, Math.min(MAP_WIDTH - this.viewWidth + 80, this.camX));
    this.camY = Math.max(-80, Math.min(MAP_HEIGHT - this.viewHeight + 80, this.camY));

    this.updateRecoilSprings(dt);

    // 6. Update flow field periodically so zombies navigate around prison corridors cleanly
    this.flowTimer -= dt;
    if (this.flowTimer <= 0) {
      this.flowTimer = 0.16;
      computeFlowField(this.map.grid, this.player.x, this.player.y, this.flowField);
    }

    // 7. Wave Director (authentic BO2 End-of-Round & New-Round audio + tally transition)
    if (this.waveState === 'ACTIVE') {
      if (this.waveToSpawn > 0) {
        this.spawnTimer -= dt;
        const maxAlive = Math.min(34, 12 + this.wave * 3);
        if (this.spawnTimer <= 0 && this.zombies.length < maxAlive) {
          this.spawnZombie();
          this.waveToSpawn -= 1;
          this.spawnTimer = Math.max(0.32, 1.35 - this.wave * 0.09);
        }
      } else if (this.zombies.length === 0) {
        const clearBonus = 150 + this.wave * 50;
        this.waveState = 'INTERMISSION';
        // Match the exact 9.50s round-end + eerie pause window from the 20.62s round-change audio file
        const roundEndWindow = Math.max(9.5, this.audio.getRoundEndDuration() + 1.32);
        this.intermissionTimer = roundEndWindow;
        this.roundAnimPhase = 'ENDING';
        this.roundAnimDuration = roundEndWindow;
        this.roundAnimTimer = roundEndWindow;
        this.addPoints(clearBonus);
        this.audio.playRoundEnd();
        this.showStatusBanner(`ROUND ${this.wave} SURVIVED · +${clearBonus} PTS`);
        this.pushHudSnapshot();
      }
    } else {
      this.intermissionTimer -= dt;
      if (this.intermissionTimer <= 0) {
        this.beginWave(this.wave + 1);
        this.pushHudSnapshot();
      }
    }

    if (this.roundAnimTimer > 0) {
      this.roundAnimTimer = Math.max(0, this.roundAnimTimer - dt);
      if (this.roundAnimTimer <= 0 && this.waveState === 'ACTIVE') {
        this.roundAnimPhase = 'IDLE';
      }
    }

    for (let i = this.scoreTicks.length - 1; i >= 0; i--) {
      this.scoreTicks[i].life -= dt;
      if (this.scoreTicks[i].life <= 0) {
        this.scoreTicks.splice(i, 1);
      }
    }

    // 8. Update Bullets (sub-stepped for crisp hit detection even at high speeds)
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.prevX = b.x;
      b.prevY = b.y;
      b.life -= dt;
      if (b.life <= 0) {
        this.bullets.splice(i, 1);
        continue;
      }

      const frameDist = Math.hypot(b.vx * dt, b.vy * dt);
      const subSteps = Math.max(4, Math.ceil(frameDist / 5));
      const stepDt = dt / subSteps;
      let hit = false;

      for (let s = 0; s < subSteps && !hit; s++) {
        const nextX = b.x + b.vx * stepDt;
        const nextY = b.y + b.vy * stepDt;

        // Solid prison wall, pillar, iron bar wall & burning barrel collision (<= 5px step prevents tunneling)
        if (this.isBlockedForBulletPoint(nextX, nextY)) {
          hit = true;
          this.triggerBulletWallImpact(b);
          break;
        }

        b.x = nextX;
        b.y = nextY;

        // Zombie collision check
        for (let zi = this.zombies.length - 1; zi >= 0; zi--) {
          const z = this.zombies[zi];
          const dx = b.x - z.x;
          const dy = b.y - z.y;
          const hitR = z.radius + (b.isPlasma ? 7 : 3);
          if (dx * dx + dy * dy <= hitR * hitR) {
            hit = true;
            if (b.isPlasma) {
              const directKilled = this.damageZombie(z, b.damage, b.angle, b.goreForce, true);
              if (directKilled) {
                this.zombies.splice(zi, 1);
              }
              this.detonatePlasmaBolt(b);
            } else {
              const killed = this.damageZombie(z, b.damage, b.angle, b.goreForce, false);
              if (killed) {
                this.zombies.splice(zi, 1);
              }
            }
            break;
          }
        }
      }

      if (hit) {
        this.bullets.splice(i, 1);
      }
    }

    // 9. Update Zombies (flow-field pathing + separation + telegraphed melee windup)
    for (let i = 0; i < this.zombies.length; i++) {
      const z = this.zombies[i];
      if (z.hitFlash > 0) z.hitFlash = Math.max(0, z.hitFlash - dt);
      if (z.stagger > 0) z.stagger = Math.max(0, z.stagger - dt);
      if (z.attackCooldown > 0) z.attackCooldown = Math.max(0, z.attackCooldown - dt);

      const dxP = this.player.x - z.x;
      const dyP = this.player.y - z.y;
      const distP = Math.hypot(dxP, dyP);

      // Ambient zombie groans when closing in
      z.groanTimer -= dt;
      if (z.groanTimer <= 0 && distP < 540) {
        z.groanTimer = 4.2 + Math.random() * 5.5;
        this.audio.playZombieGroan(z.archetype === 'RUNNER');
      }

      // Wounded zombies leave dragging blood drops behind them
      if (z.bloodied) {
        z.bleedTrailTimer -= dt;
        if (z.bleedTrailTimer <= 0) {
          z.bleedTrailTimer = 0.28 + Math.random() * 0.22;
          this.gore.stampBloodDrip(z.x, z.y);
        }
      }

      // Telegraphed melee attack windup
      if (z.attackWindup > 0) {
        z.attackWindup -= dt;
        z.angle = Math.atan2(dyP, dxP);
        if (z.attackWindup <= 0) {
          if (distP <= z.attackRange + 14) {
            this.hurtPlayer(z.damage);
          }
          z.attackCooldown = z.archetype === 'RUNNER' ? 0.65 : 0.95;
        }
      } else if (distP <= z.attackRange && z.attackCooldown <= 0) {
        z.attackWindup = z.attackWindupDuration;
        if (z.archetype === 'RUNNER') {
          this.audio.playZombieGroan(true);
        }
      } else {
        // Steer via flow field when far, direct chase when close
        let steerX = dxP / (distP || 1);
        let steerY = dyP / (distP || 1);

        if (distP > 130) {
          const zc = Math.max(0, Math.min(MAP_COLS - 1, Math.floor(z.x / TILE_SIZE)));
          const zr = Math.max(0, Math.min(MAP_ROWS - 1, Math.floor(z.y / TILE_SIZE)));
          let bestDist = this.flowField[zr * MAP_COLS + zc];
          let bestC = zc;
          let bestR = zr;
          const neighbors = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
            [1, 1],
            [-1, 1],
            [1, -1],
            [-1, -1],
          ];
          for (let n = 0; n < neighbors.length; n++) {
            const nc = zc + neighbors[n][0];
            const nr = zr + neighbors[n][1];
            if (nc < 0 || nc >= MAP_COLS || nr < 0 || nr >= MAP_ROWS) continue;
            const d = this.flowField[nr * MAP_COLS + nc];
            if (d < bestDist) {
              bestDist = d;
              bestC = nc;
              bestR = nr;
            }
          }
          if (bestC !== zc || bestR !== zr) {
            const tx = (bestC + 0.5) * TILE_SIZE;
            const ty = (bestR + 0.5) * TILE_SIZE;
            const dtx = tx - z.x;
            const dty = ty - z.y;
            const dtLen = Math.hypot(dtx, dty) || 1;
            steerX = dtx / dtLen;
            steerY = dty / dtLen;
          }
        }

        // Soft zombie-to-zombie separation
        for (let j = 0; j < this.zombies.length; j++) {
          if (i === j) continue;
          const o = this.zombies[j];
          const sdx = z.x - o.x;
          const sdy = z.y - o.y;
          const minD = z.radius + o.radius + 4;
          const dSq = sdx * sdx + sdy * sdy;
          if (dSq > 0.01 && dSq < minD * minD) {
            const d = Math.sqrt(dSq);
            const push = (minD - d) / minD;
            steerX += (sdx / d) * push * 1.4;
            steerY += (sdy / d) * push * 1.4;
          }
        }

        const sLen = Math.hypot(steerX, steerY) || 1;
        const speedMult = z.stagger > 0 ? 0.3 : 1.0;
        const desiredVx = (steerX / sLen) * z.speed * speedMult;
        const desiredVy = (steerY / sLen) * z.speed * speedMult;
        z.vx += (desiredVx - z.vx) * Math.min(1, dt * 8);
        z.vy += (desiredVy - z.vy) * Math.min(1, dt * 8);

        const targetA = Math.atan2(z.vy, z.vx);
        let diff = targetA - z.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        z.angle += diff * Math.min(1, dt * 9);
        z.walkPhase += dt * (z.speed / 15);
      }

      const zRes = resolveMapCollision(
        this.map.grid,
        z.x + z.vx * dt,
        z.y + z.vy * dt,
        z.radius
      );
      const zBarrelRes = this.resolveBarrelCollision(zRes.x, zRes.y, z.radius);
      z.x = zBarrelRes.x;
      z.y = zBarrelRes.y;
    }

    // Emit rising atmospheric embers & drifting smoke from visible burning barrels and floor fires
    this.fireEmitTimer -= dt;
    if (this.fireEmitTimer <= 0 && this.particles.length < 240) {
      this.fireEmitTimer = 0.085;
      for (const f of this.map.fires) {
        if (
          f.x < this.camX - 180 ||
          f.x > this.camX + this.viewWidth + 180 ||
          f.y < this.camY - 180 ||
          f.y > this.camY + this.viewHeight + 180
        ) {
          continue;
        }
        // Soft billowing smoke plume drifting diagonally across prison air
        if (Math.random() < 0.62) {
          this.particles.push({
            x: f.x + (Math.random() - 0.5) * f.radius * 0.9,
            y: f.y + (Math.random() - 0.5) * f.radius * 0.9,
            vx: -10 + Math.random() * 24,
            vy: -24 - Math.random() * 22,
            size: 7 + Math.random() * 7,
            color: '#2c2523',
            alpha: 0.24,
            life: 1.5 + Math.random() * 1.1,
            maxLife: 2.6,
            drag: 0.45,
            kind: 'smoke',
            rotation: Math.random() * Math.PI * 2,
            vRot: (Math.random() - 0.5) * 0.6,
            glow: false,
          });
        }
        // Bright glowing ember spark shooting upward from flames
        if (Math.random() < 0.45) {
          this.particles.push({
            x: f.x + (Math.random() - 0.5) * f.radius * 0.85,
            y: f.y + (Math.random() - 0.5) * f.radius * 0.85,
            vx: (Math.random() - 0.5) * 42,
            vy: -38 - Math.random() * 44,
            size: 1.5 + Math.random() * 1.8,
            color: Math.random() < 0.5 ? '#ff9d3b' : '#ff5a1f',
            alpha: 0.92,
            life: 0.55 + Math.random() * 0.55,
            maxLife: 1.1,
            drag: 1.4,
            kind: 'spark',
            rotation: 0,
            vRot: 0,
            glow: true,
          });
        }
      }
    }

    // 10. Update Transient Lights, Particles, Shell Casings, Callouts
    for (let i = this.transientLights.length - 1; i >= 0; i--) {
      this.transientLights[i].life -= dt;
      if (this.transientLights[i].life <= 0) this.transientLights.splice(i, 1);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const damp = Math.exp(-p.drag * dt);
      p.vx *= damp;
      p.vy *= damp;
      p.rotation += p.vRot * dt;
    }

    for (let i = this.casings.length - 1; i >= 0; i--) {
      const c = this.casings[i];
      c.life -= dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      const damp = Math.exp(-5.5 * dt);
      c.vx *= damp;
      c.vy *= damp;
      c.angle += c.vAngle * dt;
      c.vAngle *= damp;
      if (c.life <= 0) {
        this.gore.stampShellCasing(c.x, c.y, c.angle);
        this.casings.splice(i, 1);
      }
    }

    for (let i = this.callouts.length - 1; i >= 0; i--) {
      const co = this.callouts[i];
      co.life -= dt;
      co.y -= 26 * dt;
      if (co.life <= 0) this.callouts.splice(i, 1);
    }

    if (this.statusBanner) {
      this.statusBanner.timer -= dt;
      if (this.statusBanner.timer <= 0) this.statusBanner = null;
    }

    // Throttled HUD snapshot (~15Hz) so React stays whisper-quiet while recoil runs at 60fps!
    this.hudSyncTimer -= dt;
    if (this.hudSyncTimer <= 0) {
      this.hudSyncTimer = 0.065;
      this.pushHudSnapshot();
    }
  }

  private pushHudSnapshot(): void {
    const hp = Math.ceil(this.player.hp);
    const hpStateLabel: HudSnapshot['hpStateLabel'] =
      hp > 65 ? 'STEADY' : hp > 30 ? 'BLOODIED' : 'CRITICAL';

    const nearest = this.phase === 'PLAYING' ? this.getNearestCrate() : null;

    this.callbacks.onHudUpdate({
      phase: this.phase,
      hp,
      maxHp: this.player.maxHp,
      hpStateLabel,
      points: this.points,
      totalPointsEarned: this.totalPointsEarned,
      scoreTicks: this.scoreTicks.map((t) => ({ id: t.id, delta: t.delta })),
      wave: this.wave,
      waveState: this.waveState,
      intermissionSeconds: Math.ceil(this.intermissionTimer),
      roundAnimPhase: this.roundAnimPhase,
      roundAnimProgress:
        this.roundAnimDuration > 0
          ? Math.max(0, Math.min(1, 1 - this.roundAnimTimer / this.roundAnimDuration))
          : 1,
      zombiesRemaining: this.zombies.length + this.waveToSpawn,
      kills: this.kills,
      gibs: this.gibs,
      bestWave: this.bestWave,
      sectorName: getSectorAt(this.map.sectors, this.player.x, this.player.y),
      activeWeaponId: this.activeWeaponId,
      weapons: {
        AN_94: { ...this.weapons.AN_94 },
        HAMR: { ...this.weapons.HAMR },
        RAY_GUN: { ...this.weapons.RAY_GUN },
      },
      reloading: this.reloading,
      reloadProgress: this.reloading
        ? Math.max(0, Math.min(1, 1 - this.reloadTimer / this.reloadDuration))
        : 0,
      nearbyCrate: this.getCratePrompt(nearest),
      statusBanner: this.statusBanner ? this.statusBanner.text : null,
      muted: this.audio.isMuted(),
      damageFlash: this.damageFlash,
    });
  }

  private resolveBarrelCollision(x: number, y: number, radius: number): { x: number; y: number } {
    let rx = x;
    let ry = y;
    for (const f of this.map.fires) {
      if (f.solidRadius <= 0) continue;
      const dx = rx - f.x;
      const dy = ry - f.y;
      const minD = radius + f.solidRadius;
      const distSq = dx * dx + dy * dy;
      if (distSq < minD * minD && distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        const push = minD - dist;
        rx += (dx / dist) * push;
        ry += (dy / dist) * push;
      }
    }
    return { x: rx, y: ry };
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // Clear smoky TranZit void
    ctx.fillStyle = '#080606';
    ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);

    // Compute camera shake + high-frequency trauma tremor
    const traumaSq = this.trauma * this.trauma;
    const jitterX = (Math.random() * 2 - 1) * 9.5 * traumaSq;
    const jitterY = (Math.random() * 2 - 1) * 9.5 * traumaSq;
    const renderCamX = this.camX + this.camShakeX + jitterX;
    const renderCamY = this.camY + this.camShakeY + jitterY;
    const rollAngle = this.camRoll + (Math.random() * 2 - 1) * 0.014 * traumaSq;

    ctx.save();
    if (Math.abs(rollAngle) > 0.0002) {
      ctx.translate(this.viewWidth / 2, this.viewHeight / 2);
      ctx.rotate(rollAngle);
      ctx.translate(-this.viewWidth / 2, -this.viewHeight / 2);
    }

    // 1. Pre-baked Cold Decaying Prison Map Layer
    ctx.drawImage(this.map.mapCanvas, -renderCamX, -renderCamY);

    // 2. Persistent Gore, Blood Pools, Gibs & Spent Shell Casings Layer
    ctx.drawImage(this.gore.canvas, -renderCamX, -renderCamY);

    // 3. World Entities (Crates, Casings, Zombies, Player, Non-glow Particles)
    ctx.save();
    ctx.translate(-renderCamX, -renderCamY);

    this.drawFireProps(ctx);
    this.drawCrates(ctx);
    this.drawCasings(ctx);
    this.drawZombies(ctx);
    if (this.phase !== 'TITLE_MENU') {
      this.drawPlayer(ctx);
    }
    this.drawParticles(ctx, false);
    this.drawDust(ctx);

    ctx.restore();

    // 4. Real-Time 2D Raycasted Lighting, Firelight Pools & Bullet Path-Traced Illumination Pass
    const flashlightOrigin =
      this.phase === 'TITLE_MENU'
        ? {
            x: this.map.playerStart.x + Math.sin(this.elapsed * 0.35) * 80,
            y: this.map.playerStart.y - 40,
            angle: -Math.PI / 2 + Math.sin(this.elapsed * 0.52) * 1.15,
            flicker: 0.92 + Math.sin(this.elapsed * 19) * 0.04,
          }
        : {
            x: this.player.x + Math.cos(this.player.angle) * 10,
            y: this.player.y + Math.sin(this.player.angle) * 10,
            angle: this.player.angle,
            flicker: this.player.flashlightFlicker,
          };

    this.lighting.renderLighting(
      ctx,
      this.viewWidth,
      this.viewHeight,
      renderCamX,
      renderCamY,
      flashlightOrigin,
      this.bullets,
      this.transientLights,
      this.map.crates,
      this.map.sparks,
      this.map.fires,
      this.map.segments,
      this.elapsed
    );

    // 5. Post-Lighting Emissives (Animated Flames, Luminous Tracers, Plasma Bolts, Glow Sparks, Embers, Zombie Eyes)
    ctx.save();
    ctx.translate(-renderCamX, -renderCamY);
    this.drawFireFlames(ctx);
    this.drawGlowingEmbers(ctx);
    this.drawBullets(ctx);
    this.drawParticles(ctx, true);
    this.drawZombieEyeGlints(ctx);
    this.drawCrateLabelsInWorld(ctx);
    this.drawCallouts(ctx);
    ctx.restore();

    ctx.restore(); // end camera roll

    // 6. Atmospheric Horror Vignette & Damage Blood Edge
    this.drawScreenVignette(ctx);

    ctx.restore(); // end dpr scale
  }

  private drawCrates(ctx: CanvasRenderingContext2D): void {
    for (const c of this.map.crates) {
      const hw = c.width / 2;
      const hh = c.height / 2;
      ctx.save();
      ctx.translate(c.x, c.y);

      // Ground drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(-hw + 3, -hh + 4, c.width, c.height);

      // Military crate body
      ctx.fillStyle = c.kind === 'WEAPON_RAY_GUN' ? '#1c2824' : '#312b24';
      ctx.fillRect(-hw, -hh, c.width, c.height);

      // Reinforced iron strapping
      ctx.strokeStyle = c.kind === 'WEAPON_RAY_GUN' ? '#2c5944' : '#524b42';
      ctx.lineWidth = 2;
      ctx.strokeRect(-hw + 1, -hh + 1, c.width - 2, c.height - 2);
      ctx.fillStyle = '#202428';
      ctx.fillRect(-hw + 8, -hh, 5, c.height);
      ctx.fillRect(hw - 13, -hh, 5, c.height);

      // Center accent strip / glass containment core
      ctx.fillStyle = c.accentColor;
      if (c.kind === 'MEDKIT_CRATE') {
        ctx.fillRect(-7, -2.5, 14, 5);
        ctx.fillRect(-2.5, -7, 5, 14);
      } else if (c.kind === 'WEAPON_RAY_GUN') {
        ctx.fillRect(-10, -4, 20, 8);
      } else {
        ctx.fillRect(-8, -3, 16, 6);
      }

      ctx.restore();
    }
  }

  /** Draws physical charred oil barrel drums and floor scorch beds underneath the lighting pass */
  private drawFireProps(ctx: CanvasRenderingContext2D): void {
    for (const f of this.map.fires) {
      ctx.save();
      ctx.translate(f.x, f.y);

      if (f.kind === 'BARREL') {
        // Soot scorch halo + heavy shadow on prison floor
        ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
        ctx.beginPath();
        ctx.arc(3, 4, f.radius + 5, 0, Math.PI * 2);
        ctx.fill();

        // Rusted charred 55-gallon oil drum rim
        ctx.fillStyle = '#2d211d';
        ctx.beginPath();
        ctx.arc(0, 0, f.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#5c3c2e';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.arc(0, 0, f.radius - 1.2, 0, Math.PI * 2);
        ctx.stroke();

        // Glowing hot coals bed inside the drum
        ctx.fillStyle = '#7c1a0e';
        ctx.beginPath();
        ctx.arc(0, 0, f.radius - 4.2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Scorched cracked ash & burning debris patch on concrete
        ctx.fillStyle = 'rgba(12, 8, 7, 0.72)';
        ctx.beginPath();
        ctx.ellipse(0, 0, f.radius * 1.25, f.radius * 0.95, f.phase, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(122, 28, 12, 0.62)';
        ctx.beginPath();
        ctx.ellipse(0, 0, f.radius * 0.72, f.radius * 0.56, f.phase * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  /** Draws animated multi-layered emissive flames dancing over every burning barrel & floor fire */
  private drawFireFlames(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (const f of this.map.fires) {
      const t = this.elapsed;
      const swayX = Math.sin(t * 9.5 + f.phase) * 3.2;
      const swayY = Math.cos(t * 11.2 + f.phase * 1.4) * 2.5 - 2.5;
      const pulse = 0.86 + 0.18 * Math.sin(t * 15.4 + f.phase);
      const baseR = (f.kind === 'BARREL' ? f.radius * 0.84 : f.radius * 0.68) * pulse;

      // Outer crimson-orange flame tongues (3 orbiting overlapping lobes)
      for (let k = 0; k < 3; k++) {
        const a = t * 5.2 + f.phase + k * 2.1;
        const lx = f.x + Math.cos(a) * (baseR * 0.34) + swayX * 0.5;
        const ly = f.y + Math.sin(a) * (baseR * 0.3) + swayY * 0.6;
        const r = baseR * (0.85 + 0.2 * Math.sin(t * 13 + k * 1.9 + f.phase));
        const g = ctx.createRadialGradient(lx, ly, 1, lx, ly, r);
        g.addColorStop(0, 'rgba(255, 130, 32, 0.85)');
        g.addColorStop(0.55, 'rgba(218, 42, 16, 0.45)');
        g.addColorStop(1, 'rgba(140, 14, 8, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(lx, ly, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Bright incandescent yellow-white dancing flame core
      const coreR = baseR * 0.56;
      const cx = f.x + swayX * 0.7;
      const cy = f.y + swayY * 0.75;
      const coreGrad = ctx.createRadialGradient(cx, cy, 0.5, cx, cy, coreR);
      coreGrad.addColorStop(0, 'rgba(255, 248, 212, 0.96)');
      coreGrad.addColorStop(0.45, 'rgba(255, 174, 58, 0.78)');
      coreGrad.addColorStop(1, 'rgba(242, 92, 24, 0)');
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawCrateLabelsInWorld(ctx: CanvasRenderingContext2D): void {
    if (this.phase !== 'PLAYING') return;
    for (const c of this.map.crates) {
      const dist = Math.hypot(c.x - this.player.x, c.y - this.player.y);
      if (dist > 260) continue;
      const alpha = Math.max(0, Math.min(1, (260 - dist) / 140));
      ctx.save();
      ctx.globalAlpha = alpha * 0.92;
      ctx.font = '700 14px Agdasima, "Agency FB", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = c.accentColor;
      ctx.fillText(c.label, c.x, c.y - 22);
      ctx.restore();
    }
  }

  private drawCasings(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#d4b25c';
    for (const c of this.casings) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.angle);
      ctx.fillRect(-2.5, -1, 5, 2);
      ctx.restore();
    }
  }

  private drawZombies(ctx: CanvasRenderingContext2D): void {
    for (const z of this.zombies) {
      ctx.save();
      ctx.translate(z.x, z.y);
      ctx.rotate(z.angle);

      const swing = Math.sin(z.walkPhase) * 3.2;
      const lunge =
        z.attackWindup > 0 ? (1 - z.attackWindup / z.attackWindupDuration) * 7 : 0;

      // Ground shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.ellipse(-2, 3, z.radius * 1.05, z.radius * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();

      // Outstretched decayed arms (visibly telegraphing melee swing!)
      ctx.strokeStyle =
        z.hitFlash > 0
          ? '#e8d8d0'
          : z.archetype === 'BRUTE'
          ? '#2a3038'
          : z.archetype === 'RUNNER'
          ? '#756862'
          : '#58605c';
      ctx.lineWidth = z.archetype === 'BRUTE' ? 7 : 4.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(2, -z.radius * 0.65);
      ctx.lineTo(z.radius + 5 + lunge + swing * 0.5, -z.radius * 0.42);
      ctx.moveTo(2, z.radius * 0.65);
      ctx.lineTo(z.radius + 5 + lunge - swing * 0.5, z.radius * 0.42);
      ctx.stroke();

      // Bloodied hands
      ctx.fillStyle = '#6e1416';
      ctx.beginPath();
      ctx.arc(z.radius + 5 + lunge + swing * 0.5, -z.radius * 0.42, 2.8, 0, Math.PI * 2);
      ctx.arc(z.radius + 5 + lunge - swing * 0.5, z.radius * 0.42, 2.8, 0, Math.PI * 2);
      ctx.fill();

      // Shoulders / Torso (tattered prison uniform / riot armor)
      ctx.fillStyle =
        z.hitFlash > 0
          ? '#f0e2dc'
          : z.archetype === 'BRUTE'
          ? '#232a32'
          : z.archetype === 'RUNNER'
          ? '#665b56'
          : '#495054';
      ctx.beginPath();
      ctx.ellipse(-1, 0, z.radius * 0.72, z.radius * 0.98, 0, 0, Math.PI * 2);
      ctx.fill();

      // Torn blood stains across chest/shoulders
      if (z.bloodied || z.archetype === 'RUNNER') {
        ctx.fillStyle = 'rgba(130, 16, 18, 0.78)';
        ctx.beginPath();
        ctx.ellipse(2, -3, z.radius * 0.38, z.radius * 0.45, 0.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Riot Brute steel shoulder armor plates
      if (z.archetype === 'BRUTE') {
        ctx.strokeStyle = '#525e6a';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(-2, -z.radius * 0.65, 6.5, 0, Math.PI * 2);
        ctx.arc(-2, z.radius * 0.65, 6.5, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Head / Helmet
      ctx.fillStyle =
        z.hitFlash > 0
          ? '#fff2eb'
          : z.archetype === 'BRUTE'
          ? '#1a2026'
          : z.archetype === 'RUNNER'
          ? '#968b80'
          : '#6f7368';
      ctx.beginPath();
      ctx.arc(3, 0, z.radius * 0.54, 0, Math.PI * 2);
      ctx.fill();

      // Melee windup crimson telegraph rim
      if (z.attackWindup > 0) {
        ctx.strokeStyle = 'rgba(220, 38, 38, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, z.radius + 4, -0.9, 0.9);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  /** Subtle eerie eye glints rendered slightly post-lighting so close zombies feel genuinely terrifying */
  private drawZombieEyeGlints(ctx: CanvasRenderingContext2D): void {
    if (this.phase !== 'PLAYING') return;
    for (const z of this.zombies) {
      const dist = Math.hypot(z.x - this.player.x, z.y - this.player.y);
      if (dist > 460) continue;
      const alpha = Math.max(0, Math.min(0.7, (460 - dist) / 380));
      ctx.save();
      ctx.translate(z.x, z.y);
      ctx.rotate(z.angle);
      ctx.fillStyle =
        z.archetype === 'BRUTE'
          ? `rgba(255, 110, 40, ${alpha})`
          : z.archetype === 'RUNNER'
          ? `rgba(245, 50, 50, ${alpha})`
          : `rgba(215, 175, 95, ${alpha * 0.7})`;
      const ex = z.radius * 0.52;
      ctx.fillRect(ex, -3.5, 2.2, 2.2);
      ctx.fillRect(ex, 1.3, 2.2, 2.2);
      ctx.restore();
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D): void {
    const p = this.player;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);

    // Subtle stride bob
    const bob = Math.sin(p.walkPhase) * 1.4;

    // Ground drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.ellipse(-2, 3, 17, 15, 0, 0, Math.PI * 2);
    ctx.fill();

    // COD2 olive-drab & dark steel soldier shoulders
    ctx.fillStyle = p.hurtGrace > 0.42 ? '#8f2424' : '#434c40';
    ctx.beginPath();
    ctx.ellipse(-2, bob * 0.3, 11.5, 15.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#252b24';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Tactical webbing straps
    ctx.strokeStyle = '#605a48';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-8, -9);
    ctx.lineTo(4, -7);
    ctx.moveTo(-8, 9);
    ctx.lineTo(4, 7);
    ctx.stroke();

    // Right arm & weapon model (recoil kicks barrel backward!)
    const kick = p.muzzleKick;
    ctx.save();
    ctx.translate(-kick, 5);
    if (this.activeWeaponId === 'AN_94') {
      // Sleek matte charcoal AN-94 rifle with signature canted mag
      ctx.fillStyle = '#22272c';
      ctx.fillRect(2, -2.5, 23, 5);
      ctx.fillStyle = '#474f57';
      ctx.fillRect(4, -1.5, 11, 3);
      ctx.fillStyle = '#14171a';
      ctx.fillRect(23, -1.2, 7, 2.4);
    } else if (this.activeWeaponId === 'HAMR') {
      // Bulky heavy HAMR LMG with wide box/drum mag & thick shroud
      ctx.fillStyle = '#38362f';
      ctx.fillRect(0, -4, 24, 8);
      ctx.fillStyle = '#1b1e22';
      ctx.fillRect(10, 3, 7, 4.5); // box drum side
      ctx.fillStyle = '#575e66';
      ctx.fillRect(23, -2, 10, 4);
    } else {
      // Iconic BO2 Ray Gun: crimson-red atomic housing + glowing emerald coils!
      ctx.fillStyle = '#9e1c20';
      ctx.fillRect(2, -3.5, 18, 7);
      ctx.fillStyle = '#8b959e';
      ctx.fillRect(19, -2.2, 8, 4.4);
      // Glowing emerald plasma rings
      ctx.fillStyle = '#2ef28b';
      ctx.fillRect(11, -4, 2.2, 8);
      ctx.fillRect(15, -4, 2.2, 8);
      ctx.fillRect(26, -1.4, 3, 2.8);
    }
    ctx.restore();

    // Mounted flashlight tube on left shoulder/forearm
    ctx.fillStyle = '#262c32';
    ctx.fillRect(6, -9, 9, 3.5);
    ctx.fillStyle = '#e5f0fa';
    ctx.fillRect(14, -8.5, 2, 2.5);

    // Classic COD2 matte steel M1 helmet
    ctx.fillStyle = '#3a4238';
    ctx.beginPath();
    ctx.arc(0, 0, 8.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5c6658';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(1, -1, 6.2, -1.2, 1.0);
    ctx.stroke();

    ctx.restore();
  }

  private drawBullets(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (const b of this.bullets) {
      if (b.isPlasma) {
        // Iconic BO2 Ray Gun glowing concentric emerald energy rings!
        const pulse = 1 + Math.sin(this.elapsed * 45 + b.id) * 0.16;
        ctx.strokeStyle = 'rgba(40, 245, 141, 0.88)';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 7.2 * pulse, 0, Math.PI * 2);
        ctx.stroke();

        // Trailing plasma ring behind bolt
        const tailX = b.x - Math.cos(b.angle) * 14;
        const tailY = b.y - Math.sin(b.angle) * 14;
        ctx.strokeStyle = 'rgba(40, 245, 141, 0.42)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(tailX, tailY, 4.8, 0, Math.PI * 2);
        ctx.stroke();

        // Incandescent emerald-white core
        ctx.fillStyle = '#d4ffea';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 3.8, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Blazing ballistic tracer streak clamped to spawn origin so it never clips backward through walls
        const travelDist = Math.hypot(b.x - b.spawnX, b.y - b.spawnY);
        const effLen = Math.min(b.tracerLength, travelDist);
        const tailX = b.x - Math.cos(b.angle) * effLen;
        const tailY = b.y - Math.sin(b.angle) * effLen;
        const grad = ctx.createLinearGradient(tailX, tailY, b.x, b.y);
        const [r, g, bl] = b.lightRgb;
        grad.addColorStop(0, `rgba(${r}, ${g}, ${bl}, 0)`);
        grad.addColorStop(0.55, `rgba(${r}, ${g}, ${bl}, 0.72)`);
        grad.addColorStop(1, '#fff8e2');

        ctx.strokeStyle = grad;
        ctx.lineWidth = b.tracerWidth;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  private drawParticles(ctx: CanvasRenderingContext2D, glowOnly: boolean): void {
    ctx.save();
    if (glowOnly) ctx.globalCompositeOperation = 'lighter';

    for (const p of this.particles) {
      if (Boolean(p.glow) !== glowOnly) continue;
      const ratio = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = p.alpha * ratio;
      ctx.fillStyle = p.color;
      if (p.kind === 'gib') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillRect(-p.size * 0.6, -p.size * 0.35, p.size * 1.2, p.size * 0.7);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (p.kind === 'smoke' ? 2.1 - ratio : 1), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  private drawDust(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(175, 166, 158, 0.24)';
    for (const m of this.dustMotes) {
      if (m.isEmber) continue;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Dimly glowing TranZit volcanic lava embers drifting lazily through the dark prison */
  private drawGlowingEmbers(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const m of this.dustMotes) {
      if (!m.isEmber) continue;
      const flicker = 0.55 + 0.45 * Math.sin(this.elapsed * 4.5 + m.phase);
      const alpha = m.a * flicker * 0.72;
      ctx.fillStyle = `rgba(248, 108, 28, ${alpha})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255, 206, 120, ${alpha * 0.6})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawCallouts(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.font = '700 16px Agdasima, "Agency FB", sans-serif';
    ctx.textAlign = 'center';
    for (const co of this.callouts) {
      ctx.globalAlpha = Math.max(0, Math.min(1, co.life / co.maxLife));
      ctx.fillStyle = co.color;
      ctx.fillText(co.text, co.x, co.y);
    }
    ctx.restore();
  }

  private drawScreenVignette(ctx: CanvasRenderingContext2D): void {
    const cx = this.viewWidth / 2;
    const cy = this.viewHeight / 2;
    const outerR = Math.hypot(cx, cy);

    // Cold claustrophobic horror vignette
    const vig = ctx.createRadialGradient(cx, cy, outerR * 0.42, cx, cy, outerR);
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(1, 'rgba(2, 4, 6, 0.72)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);

    // Classic COD2 arterial crimson edge vignette when wounded or hit!
    const lowHpRatio =
      this.phase === 'PLAYING' ? Math.max(0, (55 - this.player.hp) / 55) : 0;
    const pulse = lowHpRatio > 0 ? 0.55 + 0.45 * Math.sin(this.elapsed * 5.2) : 0;
    const bloodAlpha = Math.min(0.75, this.damageFlash * 0.58 + lowHpRatio * 0.42 * pulse);

    if (bloodAlpha > 0.02) {
      const bGrad = ctx.createRadialGradient(cx, cy, outerR * 0.34, cx, cy, outerR);
      bGrad.addColorStop(0, 'rgba(130, 12, 14, 0)');
      bGrad.addColorStop(0.72, `rgba(128, 14, 16, ${bloodAlpha * 0.45})`);
      bGrad.addColorStop(1, `rgba(110, 6, 10, ${bloodAlpha})`);
      ctx.fillStyle = bGrad;
      ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);
    }
  }
}
