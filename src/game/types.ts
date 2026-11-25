export type GamePhase = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export type WeaponId = 'AN_94' | 'HAMR' | 'RAY_GUN';

export type ZombieArchetype = 'SHAMBLER' | 'RUNNER' | 'BRUTE';

export type CrateKind = 'WEAPON_HAMR' | 'WEAPON_RAY_GUN' | 'AMMO_SUPPLY' | 'MEDKIT_CRATE';

export interface WeaponSpec {
  id: WeaponId;
  slot: 1 | 2 | 3;
  name: string;
  caliberLabel: string;
  roleLabel: string;
  magSize: number;
  maxReserve: number;
  damage: number;
  splashRadius: number;
  splashDamage: number;
  projectileSpeed: number;
  /** Standard time between shots in seconds */
  fireInterval: number;
  /** Initial fast burst interval (AN-94 2-round hyperburst / HAMR 7-round rapid start) */
  burstInterval: number;
  /** Number of shots fired at burstInterval before settling to fireInterval */
  burstCount: number;
  automatic: boolean;
  spreadRad: number;
  reloadTime: number;
  /** Base positional recoil kick (world px) */
  shakeKick: number;
  /** High-frequency camera trauma injected per shot */
  shakeTrauma: number;
  /** Rotational jolt in radians */
  shakeRoll: number;
  /** HUD impulse multiplier */
  hudKickScale: number;
  /** Moving bullet light properties */
  bulletLightColor: string;
  bulletLightRgb: [number, number, number];
  bulletLightRadius: number;
  bulletLightIntensity: number;
  muzzleFlashRadius: number;
  muzzleFlashColor: string;
  tracerLength: number;
  tracerWidth: number;
  pelletColor: string;
  isPlasma: boolean;
  ejectsBrass: boolean;
  /** Relative caliber mass for gore splatter force */
  goreForce: number;
}

export interface WeaponRuntimeState {
  id: WeaponId;
  unlocked: boolean;
  ammoInMag: number;
  ammoReserve: number;
}

export interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  isBar: boolean;
}

export interface CrateEntity {
  id: string;
  kind: CrateKind;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  sublabel: string;
  cost: number;
  accentColor: string;
  accentRgb: [number, number, number];
  weaponId?: WeaponId;
  purchased: boolean;
  cooldown: number;
}

export interface SectorZone {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SpawnPoint {
  x: number;
  y: number;
  sector: string;
}

export interface SparkFixture {
  x: number;
  y: number;
  phase: number;
  intensity: number;
}

export interface FireSource {
  x: number;
  y: number;
  kind: 'BARREL' | 'FLOOR_FIRE';
  radius: number;
  solidRadius: number;
  lightRadius: number;
  phase: number;
  intensity: number;
}

export interface Bullet {
  id: number;
  weaponId: WeaponId;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  spawnX: number;
  spawnY: number;
  vx: number;
  vy: number;
  angle: number;
  damage: number;
  splashRadius: number;
  splashDamage: number;
  life: number;
  maxLife: number;
  lightRadius: number;
  lightRgb: [number, number, number];
  lightIntensity: number;
  tracerLength: number;
  tracerWidth: number;
  pelletColor: string;
  isPlasma: boolean;
  goreForce: number;
}

export interface TransientLight {
  x: number;
  y: number;
  radius: number;
  rgb: [number, number, number];
  intensity: number;
  life: number;
  maxLife: number;
  castShadows: boolean;
  isExplosion?: boolean;
}

export interface Zombie {
  id: number;
  archetype: ZombieArchetype;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  attackRange: number;
  attackWindup: number;
  attackWindupDuration: number;
  attackCooldown: number;
  hitFlash: number;
  stagger: number;
  walkPhase: number;
  groanTimer: number;
  bleedTrailTimer: number;
  bloodied: boolean;
  pointsOnKill: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  drag: number;
  kind: 'blood' | 'spark' | 'smoke' | 'plasma' | 'gib' | 'dust';
  rotation: number;
  vRot: number;
  glow?: boolean;
}

export interface ShellCasing {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  vAngle: number;
  life: number;
  settled: boolean;
}

export interface FloatingCallout {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export interface NearbyCratePrompt {
  id: string;
  label: string;
  actionText: string;
  cost: number;
  canAfford: boolean;
  accentColor: string;
}

export type RoundAnimPhase = 'IDLE' | 'ENDING' | 'STARTING';

export interface ScoreTick {
  id: number;
  delta: number;
}

export interface HudSnapshot {
  phase: GamePhase;
  hp: number;
  maxHp: number;
  hpStateLabel: 'STEADY' | 'BLOODIED' | 'CRITICAL';
  points: number;
  totalPointsEarned: number;
  scoreTicks: ScoreTick[];
  wave: number;
  waveState: 'ACTIVE' | 'INTERMISSION';
  intermissionSeconds: number;
  roundAnimPhase: RoundAnimPhase;
  roundAnimProgress: number;
  zombiesRemaining: number;
  kills: number;
  gibs: number;
  bestWave: number;
  sectorName: string;
  activeWeaponId: WeaponId;
  weapons: Record<WeaponId, WeaponRuntimeState>;
  reloading: boolean;
  reloadProgress: number;
  nearbyCrate: NearbyCratePrompt | null;
  statusBanner: string | null;
  muted: boolean;
  damageFlash: number;
}
