import { MAP_HEIGHT, MAP_WIDTH, TILE_SIZE } from './prisonMap';

/**
 * Persistent offscreen Gore & Decal Layer.
 * Permanently stamps directional arterial splatters, expanding dark blood pools,
 * bone/flesh gibs, Ray Gun plasma scorch craters, wall impacts, and brass shell casings.
 */
export class GoreLayer {
  public readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = MAP_WIDTH;
    this.canvas.height = MAP_HEIGHT;
    this.ctx = this.canvas.getContext('2d')!;
    this.reset();
  }

  public reset(): void {
    this.ctx.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    this.seedInitialHorrorDecals();
  }

  /** Pre-seeds dried bloodstains & drag marks near breached cells so the prison feels haunted immediately */
  private seedInitialHorrorDecals(): void {
    const spots: Array<[number, number, number]> = [
      [21.6 * TILE_SIZE, 10.6 * TILE_SIZE, 1.3],
      [13.4 * TILE_SIZE, 5.4 * TILE_SIZE, 1.0],
      [26.5 * TILE_SIZE, 25.8 * TILE_SIZE, 1.1],
      [12.8 * TILE_SIZE, 15.6 * TILE_SIZE, 0.9],
      [30.5 * TILE_SIZE, 16.3 * TILE_SIZE, 1.2],
      [7.2 * TILE_SIZE, 14.5 * TILE_SIZE, 1.0],
      [37.2 * TILE_SIZE, 15.6 * TILE_SIZE, 1.2],
    ];

    for (const [x, y, scale] of spots) {
      this.ctx.save();
      this.ctx.fillStyle = 'rgba(66, 12, 12, 0.65)';
      this.ctx.beginPath();
      this.ctx.ellipse(x, y, 16 * scale, 10 * scale, scale * 1.4, 0, Math.PI * 2);
      this.ctx.fill();
      // Subtle dried drag streak
      this.ctx.strokeStyle = 'rgba(58, 10, 10, 0.35)';
      this.ctx.lineWidth = 6 * scale;
      this.ctx.lineCap = 'round';
      this.ctx.beginPath();
      this.ctx.moveTo(x, y);
      this.ctx.lineTo(x + Math.cos(scale * 2.3) * 34, y + Math.sin(scale * 2.3) * 34);
      this.ctx.stroke();
      this.ctx.restore();
    }
  }

  /** Directional arterial bullet-exit blood splatter */
  public stampBloodSplatter(x: number, y: number, impactAngle: number, force = 1.0): void {
    const ctx = this.ctx;
    ctx.save();
    const drops = Math.round(7 + force * 7);
    for (let i = 0; i < drops; i++) {
      const spread = (Math.random() - 0.5) * 0.95;
      const a = impactAngle + spread;
      const dist = (6 + Math.random() * 34) * force;
      const px = x + Math.cos(a) * dist;
      const py = y + Math.sin(a) * dist;
      const rx = 1.8 + Math.random() * 4.2 * Math.min(force, 1.7);
      const ry = rx * (0.45 + Math.random() * 0.55);

      const dark = Math.random() < 0.45;
      ctx.fillStyle = dark
        ? `rgba(74, 10, 12, ${0.55 + Math.random() * 0.3})`
        : `rgba(128, 16, 18, ${0.5 + Math.random() * 0.32})`;
      ctx.beginPath();
      ctx.ellipse(px, py, rx, ry, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Permanent blood pool + gore chunks stamped when a zombie dies */
  public stampCorpseGore(
    x: number,
    y: number,
    killAngle: number,
    gibbed: boolean,
    isPlasma: boolean
  ): void {
    const ctx = this.ctx;
    ctx.save();

    if (isPlasma) {
      // Charred scorch crater with eerie faint phosphor-green residue ring
      const scorch = ctx.createRadialGradient(x, y, 2, x, y, 36);
      scorch.addColorStop(0, 'rgba(10, 14, 12, 0.85)');
      scorch.addColorStop(0.55, 'rgba(20, 48, 30, 0.45)');
      scorch.addColorStop(1, 'rgba(10, 22, 16, 0)');
      ctx.fillStyle = scorch;
      ctx.beginPath();
      ctx.arc(x, y, 36, 0, Math.PI * 2);
      ctx.fill();
    }

    // Irregular dark arterial pool
    const poolCount = gibbed ? 5 : 3;
    for (let i = 0; i < poolCount; i++) {
      const ox = (Math.random() - 0.5) * (gibbed ? 22 : 12);
      const oy = (Math.random() - 0.5) * (gibbed ? 22 : 12);
      const r1 = (gibbed ? 14 : 11) + Math.random() * 14;
      const r2 = r1 * (0.65 + Math.random() * 0.35);
      ctx.fillStyle = i === 0 ? 'rgba(62, 8, 10, 0.86)' : 'rgba(98, 12, 14, 0.72)';
      ctx.beginPath();
      ctx.ellipse(x + ox, y + oy, r1, r2, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    // Heavy directional spray along killing shot
    this.stampBloodSplatter(x, y, killAngle, gibbed ? 2.1 : 1.35);

    // Chunks of meat & bleached bone shards on gibbed kills
    const chunkCount = gibbed ? 9 : 3;
    for (let i = 0; i < chunkCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = Math.random() * (gibbed ? 34 : 14);
      const gx = x + Math.cos(a) * dist;
      const gy = y + Math.sin(a) * dist;
      const isBone = gibbed && i % 3 === 0;
      ctx.fillStyle = isBone ? 'rgba(196, 186, 166, 0.85)' : 'rgba(116, 22, 24, 0.92)';
      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(Math.random() * Math.PI);
      if (isBone) {
        ctx.fillRect(-4, -1.3, 8, 2.6);
      } else {
        ctx.beginPath();
        ctx.ellipse(0, 0, 2.5 + Math.random() * 3.5, 1.8 + Math.random() * 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.restore();
  }

  /** Faint blood footprint / drag mark left by wounded zombies */
  public stampBloodDrip(x: number, y: number): void {
    this.ctx.fillStyle = 'rgba(96, 12, 14, 0.48)';
    this.ctx.beginPath();
    this.ctx.arc(x, y, 1.8 + Math.random() * 2.2, 0, Math.PI * 2);
    this.ctx.fill();
  }

  /** Wall bullet chip or Ray Gun plasma burn mark */
  public stampImpactMark(x: number, y: number, isPlasma: boolean): void {
    const ctx = this.ctx;
    ctx.save();
    if (isPlasma) {
      const g = ctx.createRadialGradient(x, y, 1, x, y, 26);
      g.addColorStop(0, 'rgba(8, 12, 10, 0.85)');
      g.addColorStop(0.5, 'rgba(22, 62, 38, 0.4)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 26, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(12, 14, 16, 0.7)';
      ctx.beginPath();
      ctx.arc(x, y, 2.4 + Math.random() * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Permanent spent brass casing settled on prison floor */
  public stampShellCasing(x: number, y: number, angle: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(176, 144, 72, 0.72)';
    ctx.fillRect(-2.4, -1.0, 4.8, 2.0);
    ctx.restore();
  }
}
