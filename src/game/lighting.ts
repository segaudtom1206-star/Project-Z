import { Bullet, CrateEntity, FireSource, Segment, SparkFixture, TransientLight } from './types';

interface RayHit {
  x: number;
  y: number;
}

/**
 * 2D Raycasted Lighting & Bullet Path-Traced Illumination Renderer.
 * Renders dim smoky visibility with a tight high-contrast tactical flashlight beam,
 * dynamic raycasted moving lights for every fired bullet, muzzle flash bursts,
 * plasma explosions, and flickering raycasted firelight pools from burning barrels and floor fires.
 */
export class LightingEngine {
  private lightCanvas: HTMLCanvasElement;
  private lightCtx: CanvasRenderingContext2D;
  private scale = 0.65;
  private nearbySegments: Segment[] = [];

  constructor() {
    this.lightCanvas = document.createElement('canvas');
    this.lightCanvas.width = 640;
    this.lightCanvas.height = 360;
    this.lightCtx = this.lightCanvas.getContext('2d')!;
  }

  public resize(viewWidth: number, viewHeight: number): void {
    const targetW = Math.max(160, Math.round(viewWidth * this.scale));
    const targetH = Math.max(90, Math.round(viewHeight * this.scale));
    if (this.lightCanvas.width !== targetW || this.lightCanvas.height !== targetH) {
      this.lightCanvas.width = targetW;
      this.lightCanvas.height = targetH;
    }
  }

  private filterSegments(segments: Segment[], ox: number, oy: number, radius: number): Segment[] {
    const out = this.nearbySegments;
    out.length = 0;
    const minX = ox - radius;
    const maxX = ox + radius;
    const minY = oy - radius;
    const maxY = oy + radius;

    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      if (
        (s.ax < minX && s.bx < minX) ||
        (s.ax > maxX && s.bx > maxX) ||
        (s.ay < minY && s.by < minY) ||
        (s.ay > maxY && s.by > maxY)
      ) {
        continue;
      }
      out.push(s);
    }
    return out;
  }

  /** Fast ray-segment intersection returning closest distance <= maxDist */
  private castRay(
    ox: number,
    oy: number,
    dx: number,
    dy: number,
    maxDist: number,
    segs: Segment[]
  ): RayHit {
    let closestT = maxDist;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const sx = s.bx - s.ax;
      const sy = s.by - s.ay;
      const denom = dx * sy - dy * sx;
      if (denom > -1e-7 && denom < 1e-7) continue;

      const qpx = s.ax - ox;
      const qpy = s.ay - oy;
      const t = (qpx * sy - qpy * sx) / denom;
      if (t <= 0 || t >= closestT) continue;

      const u = (qpx * dy - qpy * dx) / denom;
      if (u >= 0 && u <= 1) {
        closestT = t;
      }
    }
    return { x: ox + dx * closestT, y: oy + dy * closestT };
  }

  /**
   * Draws a shadow-occluded radial light using angular ray sweeping against nearby wall & bar segments.
   */
  private drawRaycastRadialLight(
    ctx: CanvasRenderingContext2D,
    wx: number,
    wy: number,
    radius: number,
    rgb: [number, number, number],
    intensity: number,
    rayCount: number,
    segments: Segment[],
    camX: number,
    camY: number
  ): void {
    const segs = this.filterSegments(segments, wx, wy, radius);
    const s = this.scale;
    const sx = (wx - camX) * s;
    const sy = (wy - camY) * s;
    const sr = radius * s;

    ctx.save();
    ctx.beginPath();
    const step = (Math.PI * 2) / rayCount;
    for (let i = 0; i < rayCount; i++) {
      const angle = i * step;
      const hit = this.castRay(wx, wy, Math.cos(angle), Math.sin(angle), radius, segs);
      const px = (hit.x - camX) * s;
      const py = (hit.y - camY) * s;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.clip();

    const [r, g, b] = rgb;
    const grad = ctx.createRadialGradient(sx, sy, sr * 0.04, sx, sy, sr);
    grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${Math.min(1, intensity)})`);
    grad.addColorStop(0.35, `rgba(${r}, ${g}, ${b}, ${Math.min(1, intensity * 0.65)})`);
    grad.addColorStop(0.72, `rgba(${r}, ${g}, ${b}, ${Math.min(1, intensity * 0.22)})`);
    grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

    ctx.fillStyle = grad;
    ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    ctx.restore();
  }

  /**
   * Draws the player's tight, high-contrast tactical flashlight cone with crisp shadow casting
   * through prison bars and around concrete pillars.
   */
  private drawFlashlightCone(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    aimAngle: number,
    flicker: number,
    segments: Segment[],
    camX: number,
    camY: number
  ): void {
    const reach = 610;
    const halfCone = 0.36;
    const penumbraHalf = 0.54;
    const segs = this.filterSegments(segments, ox, oy, reach);
    const s = this.scale;
    const sx = (ox - camX) * s;
    const sy = (oy - camY) * s;
    const sr = reach * s;

    // 1. Soft outer penumbra cone
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    const penumbraRays = 54;
    for (let i = 0; i <= penumbraRays; i++) {
      const a = aimAngle - penumbraHalf + (penumbraHalf * 2 * i) / penumbraRays;
      const hit = this.castRay(ox, oy, Math.cos(a), Math.sin(a), reach * 0.74, segs);
      ctx.lineTo((hit.x - camX) * s, (hit.y - camY) * s);
    }
    ctx.closePath();
    ctx.clip();

    const pGrad = ctx.createRadialGradient(sx, sy, 4, sx, sy, sr * 0.74);
    pGrad.addColorStop(0, `rgba(186, 204, 218, ${0.42 * flicker})`);
    pGrad.addColorStop(0.55, `rgba(138, 160, 180, ${0.18 * flicker})`);
    pGrad.addColorStop(1, 'rgba(95, 115, 138, 0)');
    ctx.fillStyle = pGrad;
    ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    ctx.restore();

    // 2. Primary tight high-contrast flashlight beam (dense ray fan for sharp jail-bar stripes)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    const mainRays = 128;
    for (let i = 0; i <= mainRays; i++) {
      const a = aimAngle - halfCone + (halfCone * 2 * i) / mainRays;
      const hit = this.castRay(ox, oy, Math.cos(a), Math.sin(a), reach, segs);
      ctx.lineTo((hit.x - camX) * s, (hit.y - camY) * s);
    }
    ctx.closePath();
    ctx.clip();

    const mGrad = ctx.createRadialGradient(sx, sy, 6, sx, sy, sr);
    mGrad.addColorStop(0, `rgba(248, 246, 242, ${0.98 * flicker})`);
    mGrad.addColorStop(0.3, `rgba(232, 236, 240, ${0.88 * flicker})`);
    mGrad.addColorStop(0.68, `rgba(184, 198, 210, ${0.50 * flicker})`);
    mGrad.addColorStop(0.92, `rgba(128, 146, 162, ${0.14 * flicker})`);
    mGrad.addColorStop(1, 'rgba(80, 100, 118, 0)');
    ctx.fillStyle = mGrad;
    ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    ctx.restore();

    // 3. Close-range player body halo so immediate prison surroundings remain readable
    this.drawRaycastRadialLight(
      ctx,
      ox,
      oy,
      128,
      [182, 186, 192],
      0.40 * flicker,
      36,
      segments,
      camX,
      camY
    );
  }

  public renderLighting(
    mainCtx: CanvasRenderingContext2D,
    viewWidth: number,
    viewHeight: number,
    camX: number,
    camY: number,
    flashlightOrigin: { x: number; y: number; angle: number; flicker: number },
    bullets: Bullet[],
    transientLights: TransientLight[],
    crates: CrateEntity[],
    sparks: SparkFixture[],
    fires: FireSource[],
    segments: Segment[],
    time: number
  ): void {
    this.resize(viewWidth, viewHeight);
    const lctx = this.lightCtx;
    const lw = this.lightCanvas.width;
    const lh = this.lightCanvas.height;

    // 1. Raised dim smoky TranZit twilight floor (~13% visibility so prison architecture reads clearly)
    lctx.globalCompositeOperation = 'source-over';
    lctx.fillStyle = 'rgb(34, 28, 26)';
    lctx.fillRect(0, 0, lw, lh);

    // 2. Additive light accumulation inside the lighting buffer
    lctx.globalCompositeOperation = 'lighter';

    // Tight high-contrast player flashlight cone
    this.drawFlashlightCone(
      lctx,
      flashlightOrigin.x,
      flashlightOrigin.y,
      flashlightOrigin.angle,
      flashlightOrigin.flicker,
      segments,
      camX,
      camY
    );

    // Flickering raycasted firelight pools from burning oil barrels & floor fires
    for (let i = 0; i < fires.length; i++) {
      const f = fires[i];
      if (
        f.x < camX - f.lightRadius - 40 ||
        f.x > camX + viewWidth + f.lightRadius + 40 ||
        f.y < camY - f.lightRadius - 40 ||
        f.y > camY + viewHeight + f.lightRadius + 40
      ) {
        continue;
      }
      const waveA = Math.sin(time * 7.2 + f.phase);
      const waveB = Math.sin(time * 14.8 + f.phase * 2.3);
      const waveC = Math.sin(time * 24.5 + f.phase * 0.7);
      const flicker = 0.84 + waveA * 0.08 + waveB * 0.05 + waveC * 0.03;
      const effRadius = f.lightRadius * (0.94 + waveA * 0.06);
      const effIntensity = Math.min(0.95, f.intensity * flicker);

      this.drawRaycastRadialLight(
        lctx,
        f.x,
        f.y,
        effRadius,
        [255, 118, 36],
        effIntensity,
        44,
        segments,
        camX,
        camY
      );
    }

    // Dynamic path-traced / raycasted illumination for EVERY flying bullet
    const pad = 340;
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      if (
        b.x < camX - pad ||
        b.x > camX + viewWidth + pad ||
        b.y < camY - pad ||
        b.y > camY + viewHeight + pad
      ) {
        continue;
      }
      const rays = b.isPlasma ? 56 : 36;
      this.drawRaycastRadialLight(
        lctx,
        b.x,
        b.y,
        b.lightRadius,
        b.lightRgb,
        b.lightIntensity,
        rays,
        segments,
        camX,
        camY
      );
    }

    // Muzzle flashes, wall-impact bounce flashes, and Ray Gun plasma blast illuminations
    for (let i = 0; i < transientLights.length; i++) {
      const tl = transientLights[i];
      if (
        tl.x < camX - tl.radius ||
        tl.x > camX + viewWidth + tl.radius ||
        tl.y < camY - tl.radius ||
        tl.y > camY + viewHeight + tl.radius
      ) {
        continue;
      }
      const ratio = Math.max(0, tl.life / tl.maxLife);
      const effIntensity = tl.intensity * (tl.isExplosion ? Math.pow(ratio, 0.7) : ratio);
      if (tl.castShadows) {
        this.drawRaycastRadialLight(
          lctx,
          tl.x,
          tl.y,
          tl.radius,
          tl.rgb,
          effIntensity,
          tl.isExplosion ? 64 : 44,
          segments,
          camX,
          camY
        );
      } else {
        const sx = (tl.x - camX) * this.scale;
        const sy = (tl.y - camY) * this.scale;
        const sr = tl.radius * this.scale;
        const [r, g, b] = tl.rgb;
        const grad = lctx.createRadialGradient(sx, sy, 2, sx, sy, sr);
        grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${Math.min(1, effIntensity)})`);
        grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        lctx.fillStyle = grad;
        lctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
      }
    }

    // Weapon Crate landmark beacons
    for (let i = 0; i < crates.length; i++) {
      const c = crates[i];
      if (
        c.x < camX - 160 ||
        c.x > camX + viewWidth + 160 ||
        c.y < camY - 160 ||
        c.y > camY + viewHeight + 160
      ) {
        continue;
      }
      const pulse = 0.30 + 0.12 * Math.sin(time * 2.4 + i * 1.7);
      const sx = (c.x - camX) * this.scale;
      const sy = (c.y - camY) * this.scale;
      const sr = (c.kind === 'WEAPON_RAY_GUN' ? 130 : 98) * this.scale;
      const [r, g, b] = c.accentRgb;
      const grad = lctx.createRadialGradient(sx, sy, 2, sx, sy, sr);
      grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${pulse})`);
      grad.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, ${pulse * 0.38})`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      lctx.fillStyle = grad;
      lctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    }

    // Smoldering TranZit lava-orange ember fissures at prison wing junctions
    for (let i = 0; i < sparks.length; i++) {
      const sp = sparks[i];
      if (
        sp.x < camX - 240 ||
        sp.x > camX + viewWidth + 240 ||
        sp.y < camY - 240 ||
        sp.y > camY + viewHeight + 240
      ) {
        continue;
      }
      const breathe = 0.28 + 0.14 * Math.sin(time * 2.2 + sp.phase);
      const flare =
        Math.sin(time * 3.7 + sp.phase) * Math.sin(time * 15.3 + sp.phase * 2.1) > 0.78 ? 0.24 : 0;
      const strength = Math.min(0.68, (breathe + flare) * sp.intensity);
      this.drawRaycastRadialLight(
        lctx,
        sp.x,
        sp.y,
        195,
        [242, 96, 26],
        strength,
        32,
        segments,
        camX,
        camY
      );
    }

    // 3. Multiply the darkness & raycasted lighting buffer directly onto the main scene
    mainCtx.save();
    mainCtx.globalCompositeOperation = 'multiply';
    mainCtx.imageSmoothingEnabled = true;
    mainCtx.drawImage(this.lightCanvas, 0, 0, viewWidth, viewHeight);
    mainCtx.restore();

    // 4. Additive volumetric bloom pass for fires, bullets, muzzle blasts & Ray Gun plasma
    mainCtx.save();
    mainCtx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < fires.length; i++) {
      const f = fires[i];
      const sx = f.x - camX;
      const sy = f.y - camY;
      const glowR = f.radius * 4.4;
      if (sx < -glowR || sx > viewWidth + glowR || sy < -glowR || sy > viewHeight + glowR) continue;
      const pulse = 0.85 + 0.15 * Math.sin(time * 11.4 + f.phase);
      const grad = mainCtx.createRadialGradient(sx, sy, 2, sx, sy, glowR);
      grad.addColorStop(0, `rgba(255, 165, 62, ${0.34 * pulse})`);
      grad.addColorStop(0.45, `rgba(242, 86, 22, ${0.14 * pulse})`);
      grad.addColorStop(1, 'rgba(200, 40, 10, 0)');
      mainCtx.fillStyle = grad;
      mainCtx.beginPath();
      mainCtx.arc(sx, sy, glowR, 0, Math.PI * 2);
      mainCtx.fill();
    }

    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      const sx = b.x - camX;
      const sy = b.y - camY;
      if (sx < -120 || sx > viewWidth + 120 || sy < -120 || sy > viewHeight + 120) continue;
      const [r, g, bl] = b.lightRgb;
      const glowR = b.isPlasma ? 78 : 42;
      const grad = mainCtx.createRadialGradient(sx, sy, 1, sx, sy, glowR);
      grad.addColorStop(0, `rgba(${r}, ${g}, ${bl}, ${b.isPlasma ? 0.52 : 0.28})`);
      grad.addColorStop(0.5, `rgba(${r}, ${g}, ${bl}, ${b.isPlasma ? 0.16 : 0.08})`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${bl}, 0)`);
      mainCtx.fillStyle = grad;
      mainCtx.beginPath();
      mainCtx.arc(sx, sy, glowR, 0, Math.PI * 2);
      mainCtx.fill();
    }

    for (let i = 0; i < transientLights.length; i++) {
      const tl = transientLights[i];
      const sx = tl.x - camX;
      const sy = tl.y - camY;
      const ratio = Math.max(0, tl.life / tl.maxLife);
      const glowR = tl.radius * (tl.isExplosion ? 0.62 : 0.35);
      if (sx < -glowR || sx > viewWidth + glowR || sy < -glowR || sy > viewHeight + glowR) continue;
      const [r, g, bl] = tl.rgb;
      const grad = mainCtx.createRadialGradient(sx, sy, 2, sx, sy, glowR);
      grad.addColorStop(0, `rgba(${r}, ${g}, ${bl}, ${(tl.isExplosion ? 0.55 : 0.34) * ratio})`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${bl}, 0)`);
      mainCtx.fillStyle = grad;
      mainCtx.beginPath();
      mainCtx.arc(sx, sy, glowR, 0, Math.PI * 2);
      mainCtx.fill();
    }
    mainCtx.restore();
  }
}
