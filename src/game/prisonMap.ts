import { CrateEntity, FireSource, SectorZone, Segment, SparkFixture, SpawnPoint } from './types';

export const TILE_SIZE = 52;
export const MAP_COLS = 44;
export const MAP_ROWS = 32;
export const MAP_WIDTH = MAP_COLS * TILE_SIZE;
export const MAP_HEIGHT = MAP_ROWS * TILE_SIZE;

export const enum TileType {
  FLOOR_CONCRETE = 0,
  FLOOR_CELL = 1,
  FLOOR_SHOWER = 2,
  FLOOR_MESS = 3,
  FLOOR_ROTUNDA = 4,
  WALL_CONCRETE = 5,
  WALL_BARS_H = 6,
  WALL_BARS_V = 7,
  PILLAR = 8,
  TABLE_LOW = 9,
}

export interface PrisonMapData {
  grid: TileType[][];
  segments: Segment[];
  crates: CrateEntity[];
  spawns: SpawnPoint[];
  sectors: SectorZone[];
  sparks: SparkFixture[];
  fires: FireSource[];
  playerStart: { x: number; y: number };
  mapCanvas: HTMLCanvasElement;
}

/** Deterministic PRNG for consistent weathered concrete cracks & stains */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function isSolidForMovement(tile: TileType): boolean {
  return (
    tile === TileType.WALL_CONCRETE ||
    tile === TileType.WALL_BARS_H ||
    tile === TileType.WALL_BARS_V ||
    tile === TileType.PILLAR ||
    tile === TileType.TABLE_LOW
  );
}

export function isSolidForBullets(tile: TileType): boolean {
  return (
    tile === TileType.WALL_CONCRETE ||
    tile === TileType.PILLAR ||
    tile === TileType.WALL_BARS_H ||
    tile === TileType.WALL_BARS_V
  );
}

export function isOpaqueWall(tile: TileType): boolean {
  return tile === TileType.WALL_CONCRETE || tile === TileType.PILLAR;
}

/** Returns true if any bullet-blocking wall tile lies along the segment (x0, y0) -> (x1, y1) */
export function hasWallBetween(
  grid: TileType[][],
  x0: number,
  y0: number,
  x1: number,
  y1: number
): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 6));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const px = x0 + dx * t;
    const py = y0 + dy * t;
    const c = Math.floor(px / TILE_SIZE);
    const r = Math.floor(py / TILE_SIZE);
    if (c < 0 || c >= MAP_COLS || r < 0 || r >= MAP_ROWS) return true;
    if (isSolidForBullets(grid[r][c])) return true;
  }
  return false;
}

function buildGrid(): TileType[][] {
  const grid: TileType[][] = Array.from({ length: MAP_ROWS }, () =>
    Array.from({ length: MAP_COLS }, () => TileType.FLOOR_CONCRETE)
  );

  const fill = (c0: number, r0: number, c1: number, r1: number, t: TileType) => {
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (r >= 0 && r < MAP_ROWS && c >= 0 && c < MAP_COLS) {
          grid[r][c] = t;
        }
      }
    }
  };

  // Floor zones first
  fill(1, 1, 42, 30, TileType.FLOOR_CONCRETE);
  // Central Rotunda floor
  fill(14, 10, 29, 21, TileType.FLOOR_ROTUNDA);
  // North & South Cell interiors
  fill(12, 1, 31, 4, TileType.FLOOR_CELL);
  fill(12, 27, 31, 30, TileType.FLOOR_CELL);
  // West Shower / Infirmary tiled floor
  fill(1, 4, 11, 27, TileType.FLOOR_SHOWER);
  // East Mess Hall tiled floor
  fill(32, 4, 42, 27, TileType.FLOOR_MESS);

  // Outer perimeter concrete walls
  fill(0, 0, MAP_COLS - 1, 0, TileType.WALL_CONCRETE);
  fill(0, MAP_ROWS - 1, MAP_COLS - 1, MAP_ROWS - 1, TileType.WALL_CONCRETE);
  fill(0, 0, 0, MAP_ROWS - 1, TileType.WALL_CONCRETE);
  fill(MAP_COLS - 1, 0, MAP_COLS - 1, MAP_ROWS - 1, TileType.WALL_CONCRETE);

  // Corner dead-space structural blocks (creates realistic prison wing cross-shape)
  fill(1, 1, 10, 3, TileType.WALL_CONCRETE);
  fill(33, 1, 42, 3, TileType.WALL_CONCRETE);
  fill(1, 28, 10, 30, TileType.WALL_CONCRETE);
  fill(33, 28, 42, 30, TileType.WALL_CONCRETE);

  // --- NORTH CELLBLOCK A (r = 1..5, c = 11..32) ---
  // Partition walls separating 5 cells across c = 11..32
  const cellDividers = [11, 15, 19, 24, 28, 32];
  for (const col of cellDividers) {
    fill(col, 1, col, 5, TileType.WALL_CONCRETE);
  }
  // Iron cell bars along r = 5 with breached doorways in each cell so zombies emerge & light slices through bars
  fill(12, 5, 14, 5, TileType.WALL_BARS_H);
  grid[5][13] = TileType.FLOOR_CONCRETE; // breached cell door

  fill(16, 5, 18, 5, TileType.WALL_BARS_H);
  grid[5][17] = TileType.FLOOR_CONCRETE;

  fill(20, 5, 23, 5, TileType.WALL_BARS_H);
  grid[5][21] = TileType.FLOOR_CONCRETE;
  grid[5][22] = TileType.FLOOR_CONCRETE;

  fill(25, 5, 27, 5, TileType.WALL_BARS_H);
  grid[5][26] = TileType.FLOOR_CONCRETE;

  fill(29, 5, 31, 5, TileType.WALL_BARS_H);
  grid[5][30] = TileType.FLOOR_CONCRETE;

  // --- SOUTH CELLBLOCK B (r = 26..30, c = 11..32) ---
  for (const col of cellDividers) {
    fill(col, 26, col, 30, TileType.WALL_CONCRETE);
  }
  fill(12, 26, 14, 26, TileType.WALL_BARS_H);
  grid[26][13] = TileType.FLOOR_CONCRETE;

  fill(16, 26, 18, 26, TileType.WALL_BARS_H);
  grid[26][17] = TileType.FLOOR_CONCRETE;

  fill(20, 26, 23, 26, TileType.WALL_BARS_H);
  grid[26][21] = TileType.FLOOR_CONCRETE;
  grid[26][22] = TileType.FLOOR_CONCRETE;

  fill(25, 26, 27, 26, TileType.WALL_BARS_H);
  grid[26][26] = TileType.FLOOR_CONCRETE;

  fill(29, 26, 31, 26, TileType.WALL_BARS_H);
  grid[26][30] = TileType.FLOOR_CONCRETE;

  // --- ROTUNDA PERIMETER WALLS (with wide doorways & barred viewing grates!) ---
  // North Rotunda wall (r = 10, c = 12..31)
  fill(12, 10, 31, 10, TileType.WALL_CONCRETE);
  // Wide central double doorway into North Cellblock
  fill(20, 10, 23, 10, TileType.FLOOR_ROTUNDA);
  // Barred security observation grates flanking the doorway (lets flashlight & bullets slice through!)
  fill(15, 10, 17, 10, TileType.WALL_BARS_H);
  fill(26, 10, 28, 10, TileType.WALL_BARS_H);

  // South Rotunda wall (r = 21, c = 12..31)
  fill(12, 21, 31, 21, TileType.WALL_CONCRETE);
  fill(20, 21, 23, 21, TileType.FLOOR_ROTUNDA);
  fill(15, 21, 17, 21, TileType.WALL_BARS_H);
  fill(26, 21, 28, 21, TileType.WALL_BARS_H);

  // West Rotunda wall (c = 12, r = 10..21)
  fill(12, 10, 12, 21, TileType.WALL_CONCRETE);
  // Wide doorway into West Infirmary / Showers
  fill(12, 14, 12, 17, TileType.FLOOR_ROTUNDA);
  // Vertical bar windows
  grid[12][12] = TileType.WALL_BARS_V;
  grid[19][12] = TileType.WALL_BARS_V;

  // East Rotunda wall (c = 31, r = 10..21)
  fill(31, 10, 31, 21, TileType.WALL_CONCRETE);
  // Wide doorway into East Mess Hall
  fill(31, 14, 31, 17, TileType.FLOOR_ROTUNDA);
  grid[12][31] = TileType.WALL_BARS_V;
  grid[19][31] = TileType.WALL_BARS_V;

  // Four structural guard pillars inside Central Rotunda (awesome shadow casters & kiting anchors)
  grid[13][17] = TileType.PILLAR;
  grid[13][26] = TileType.PILLAR;
  grid[18][17] = TileType.PILLAR;
  grid[18][26] = TileType.PILLAR;

  // --- WEST INFIRMARY / SHOWER WING (c = 1..11, r = 4..27) ---
  // Interior shower partition wall creating a tense loop around the HAMR armory
  fill(6, 10, 6, 13, TileType.WALL_CONCRETE);
  fill(6, 18, 6, 21, TileType.WALL_CONCRETE);
  // Low tiled sink/bench islands
  fill(3, 8, 4, 8, TileType.TABLE_LOW);
  fill(3, 23, 4, 23, TileType.TABLE_LOW);
  // Guard security bars on far west detention alcove
  grid[14][1] = TileType.WALL_CONCRETE;
  grid[17][1] = TileType.WALL_CONCRETE;

  // --- EAST MESS HALL & CONTAINMENT WING (c = 32..42, r = 4..27) ---
  // Low concrete cafeteria tables (bullets & flashlight pass over them!)
  fill(35, 9, 38, 9, TileType.TABLE_LOW);
  fill(35, 22, 38, 22, TileType.TABLE_LOW);
  fill(35, 14, 35, 17, TileType.TABLE_LOW);
  // Heavy concrete support pillars flanking the Ray Gun Containment alcove
  grid[12][39] = TileType.PILLAR;
  grid[19][39] = TileType.PILLAR;

  return grid;
}

/**
 * Extracts merged line segments for solid walls + individual thin iron bar occluders
 * so 2D raycasting casts razor-sharp shadows behind concrete walls AND striped jail-bar shadows!
 */
function extractOccluderSegments(grid: TileType[][]): Segment[] {
  const segments: Segment[] = [];

  // 1. Horizontal top/bottom edges of opaque walls (merged across adjacent columns)
  for (let r = 0; r < MAP_ROWS; r++) {
    // Top edge
    let startC = -1;
    for (let c = 0; c <= MAP_COLS; c++) {
      const needsEdge =
        c < MAP_COLS && isOpaqueWall(grid[r][c]) && (r === 0 || !isOpaqueWall(grid[r - 1][c]));
      if (needsEdge && startC === -1) startC = c;
      if (!needsEdge && startC !== -1) {
        segments.push({
          ax: startC * TILE_SIZE,
          ay: r * TILE_SIZE,
          bx: c * TILE_SIZE,
          by: r * TILE_SIZE,
          isBar: false,
        });
        startC = -1;
      }
    }
    // Bottom edge
    startC = -1;
    for (let c = 0; c <= MAP_COLS; c++) {
      const needsEdge =
        c < MAP_COLS &&
        isOpaqueWall(grid[r][c]) &&
        (r === MAP_ROWS - 1 || !isOpaqueWall(grid[r + 1][c]));
      if (needsEdge && startC === -1) startC = c;
      if (!needsEdge && startC !== -1) {
        segments.push({
          ax: startC * TILE_SIZE,
          ay: (r + 1) * TILE_SIZE,
          bx: c * TILE_SIZE,
          by: (r + 1) * TILE_SIZE,
          isBar: false,
        });
        startC = -1;
      }
    }
  }

  // 2. Vertical left/right edges of opaque walls (merged across adjacent rows)
  for (let c = 0; c < MAP_COLS; c++) {
    // Left edge
    let startR = -1;
    for (let r = 0; r <= MAP_ROWS; r++) {
      const needsEdge =
        r < MAP_ROWS && isOpaqueWall(grid[r][c]) && (c === 0 || !isOpaqueWall(grid[r][c - 1]));
      if (needsEdge && startR === -1) startR = r;
      if (!needsEdge && startR !== -1) {
        segments.push({
          ax: c * TILE_SIZE,
          ay: startR * TILE_SIZE,
          bx: c * TILE_SIZE,
          by: r * TILE_SIZE,
          isBar: false,
        });
        startR = -1;
      }
    }
    // Right edge
    startR = -1;
    for (let r = 0; r <= MAP_ROWS; r++) {
      const needsEdge =
        r < MAP_ROWS &&
        isOpaqueWall(grid[r][c]) &&
        (c === MAP_COLS - 1 || !isOpaqueWall(grid[r][c + 1]));
      if (needsEdge && startR === -1) startR = r;
      if (!needsEdge && startR !== -1) {
        segments.push({
          ax: (c + 1) * TILE_SIZE,
          ay: startR * TILE_SIZE,
          bx: (c + 1) * TILE_SIZE,
          by: r * TILE_SIZE,
          isBar: false,
        });
        startR = -1;
      }
    }
  }

  // 3. Iron cell bars: 3 thin shadow-casting posts per tile so light slices cleanly between bars!
  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      const t = grid[r][c];
      if (t === TileType.WALL_BARS_H) {
        const cy = r * TILE_SIZE + TILE_SIZE * 0.5;
        const barWidth = 5;
        for (const frac of [0.22, 0.5, 0.78]) {
          const cx = c * TILE_SIZE + TILE_SIZE * frac;
          segments.push({
            ax: cx - barWidth * 0.5,
            ay: cy,
            bx: cx + barWidth * 0.5,
            by: cy,
            isBar: true,
          });
        }
      } else if (t === TileType.WALL_BARS_V) {
        const cx = c * TILE_SIZE + TILE_SIZE * 0.5;
        const barHeight = 5;
        for (const frac of [0.22, 0.5, 0.78]) {
          const cy = r * TILE_SIZE + TILE_SIZE * frac;
          segments.push({
            ax: cx,
            ay: cy - barHeight * 0.5,
            bx: cx,
            by: cy + barHeight * 0.5,
            isBar: true,
          });
        }
      }
    }
  }

  return segments;
}

/**
 * Pre-bakes the cold, decaying abandoned prison floor & wall textures onto an offscreen canvas.
 * Textures stay clean, simple, and gritty (COD2 concrete, damp grime, stained shower tiles, rusted bars).
 */
function buildMapCanvas(grid: TileType[][]): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = MAP_WIDTH;
  canvas.height = MAP_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  const rand = mulberry32(19440606);

  // Base cold dark concrete fill
  ctx.fillStyle = '#24292e';
  ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      const t = grid[r][c];
      const x = c * TILE_SIZE;
      const y = r * TILE_SIZE;
      const jitter = (rand() - 0.5) * 10;

      // 1. Floor bases
      if (
        t === TileType.FLOOR_CONCRETE ||
        t === TileType.WALL_BARS_H ||
        t === TileType.WALL_BARS_V
      ) {
        const v = Math.round(44 + jitter);
        ctx.fillStyle = `rgb(${v}, ${v + 4}, ${v + 7})`;
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        // Simple expansion joint grid
        ctx.strokeStyle = 'rgba(10, 13, 16, 0.45)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      } else if (t === TileType.FLOOR_ROTUNDA) {
        const v = Math.round(48 + jitter * 0.8);
        ctx.fillStyle = `rgb(${v}, ${v + 4}, ${v + 6})`;
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        ctx.strokeStyle = 'rgba(15, 18, 22, 0.38)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      } else if (t === TileType.FLOOR_CELL) {
        const v = Math.round(35 + jitter * 0.7);
        ctx.fillStyle = `rgb(${v}, ${v + 3}, ${v + 5})`;
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        ctx.strokeStyle = 'rgba(8, 10, 12, 0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      } else if (t === TileType.FLOOR_SHOWER) {
        // Cold damp pale-slate hospital/shower ceramic tiles (2x2 sub-tiles)
        const sub = TILE_SIZE / 2;
        for (let sr = 0; sr < 2; sr++) {
          for (let sc = 0; sc < 2; sc++) {
            const tv = Math.round(52 + (rand() - 0.5) * 10);
            ctx.fillStyle = `rgb(${tv - 3}, ${tv + 4}, ${tv + 5})`;
            ctx.fillRect(x + sc * sub, y + sr * sub, sub, sub);
            ctx.strokeStyle = 'rgba(18, 24, 27, 0.48)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + sc * sub + 0.5, y + sr * sub + 0.5, sub - 1, sub - 1);
          }
        }
        // Occasional rusted drain grate
        if ((c === 3 && r === 13) || (c === 3 && r === 18) || (c === 8 && r === 15)) {
          ctx.fillStyle = '#15191c';
          ctx.fillRect(x + 15, y + 15, 22, 22);
          ctx.strokeStyle = '#4e3b2e';
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 15, y + 15, 22, 22);
          for (let g = 19; g <= 33; g += 4) {
            ctx.beginPath();
            ctx.moveTo(x + 17, y + g);
            ctx.lineTo(x + 35, y + g);
            ctx.stroke();
          }
        }
      } else if (t === TileType.FLOOR_MESS || t === TileType.TABLE_LOW) {
        // Checkered faded cold prison linoleum
        const checker = (c + r) % 2 === 0;
        const base = checker ? 52 : 42;
        const tv = Math.round(base + jitter * 0.6);
        ctx.fillStyle = `rgb(${tv + 2}, ${tv + 2}, ${tv - 1})`;
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        ctx.strokeStyle = 'rgba(12, 14, 16, 0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      }

      // Subtle decaying texture details on floor tiles (damp stains, hairline concrete cracks, grime specks)
      if (!isOpaqueWall(t)) {
        // Water/damp stain
        if (rand() < 0.16) {
          const stainR = 10 + rand() * 18;
          const sx = x + rand() * TILE_SIZE;
          const sy = y + rand() * TILE_SIZE;
          const grad = ctx.createRadialGradient(sx, sy, 1, sx, sy, stainR);
          grad.addColorStop(0, 'rgba(14, 18, 20, 0.28)');
          grad.addColorStop(1, 'rgba(14, 18, 20, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(sx, sy, stainR, 0, Math.PI * 2);
          ctx.fill();
        }
        // Hairline concrete crack
        if (rand() < 0.22) {
          ctx.strokeStyle = 'rgba(12, 15, 18, 0.42)';
          ctx.lineWidth = 1;
          let cx = x + 6 + rand() * (TILE_SIZE - 12);
          let cy = y + 6 + rand() * (TILE_SIZE - 12);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          const steps = 2 + Math.floor(rand() * 3);
          for (let s = 0; s < steps; s++) {
            cx += (rand() - 0.5) * 16;
            cy += (rand() - 0.5) * 16;
            ctx.lineTo(cx, cy);
          }
          ctx.stroke();
        }
        // Rust flecks / grit
        if (rand() < 0.12) {
          ctx.fillStyle = 'rgba(92, 54, 34, 0.16)';
          ctx.fillRect(x + rand() * 36, y + rand() * 36, 4 + rand() * 8, 3 + rand() * 6);
        }
      }
    }
  }

  // Painted faded yellow/grey COD2 prison sector lines & stencil markings on floor
  ctx.save();
  // Rotunda faded hazard perimeter line
  ctx.strokeStyle = 'rgba(168, 146, 86, 0.24)';
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 8]);
  ctx.strokeRect(
    14.5 * TILE_SIZE,
    11.5 * TILE_SIZE,
    14 * TILE_SIZE,
    8.5 * TILE_SIZE
  );
  ctx.setLineDash([]);

  // Central compass / block medallion in rotunda
  const rotCx = 22 * TILE_SIZE;
  const rotCy = 15.8 * TILE_SIZE;
  ctx.strokeStyle = 'rgba(142, 152, 160, 0.16)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(rotCx, rotCy, 92, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(rotCx, rotCy, 66, 0, Math.PI * 2);
  ctx.stroke();

  // Floor stencil labels (worn BO2 Agdasima / Agency FB institutional paint)
  ctx.fillStyle = 'rgba(218, 190, 158, 0.21)';
  ctx.font = '700 28px Agdasima, "Agency FB", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CELLBLOCK D · ROTUNDA', rotCx, rotCy);
  ctx.font = '700 22px Agdasima, "Agency FB", sans-serif';
  ctx.fillText('NORTH WING · BLOCK A', 22 * TILE_SIZE, 7.6 * TILE_SIZE);
  ctx.fillText('SOUTH WING · BLOCK B', 22 * TILE_SIZE, 23.8 * TILE_SIZE);
  ctx.fillText('INFIRMARY / SHOWERS', 6.5 * TILE_SIZE, 15.8 * TILE_SIZE);
  ctx.fillText('MESS HALL · CONTAINMENT', 37 * TILE_SIZE, 11.8 * TILE_SIZE);
  ctx.restore();

  // Cell interior fixtures (simple rusted metal bunk bed + toilet silhouette along back wall)
  const cellColsNorth = [12, 16, 20, 25, 29];
  for (const cc of cellColsNorth) {
    // North cell bunk
    const bx = cc * TILE_SIZE + 6;
    const by = 1 * TILE_SIZE + 6;
    ctx.fillStyle = '#252b30';
    ctx.fillRect(bx, by, 34, 62);
    ctx.strokeStyle = '#4a3d33';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, 34, 62);
    // Mattress stain
    ctx.fillStyle = '#363b3e';
    ctx.fillRect(bx + 4, by + 5, 26, 52);
    // South cell bunk
    const sby = 29 * TILE_SIZE + 6;
    ctx.fillStyle = '#252b30';
    ctx.fillRect(bx, sby, 34, 42);
    ctx.strokeStyle = '#4a3d33';
    ctx.strokeRect(bx, sby, 34, 42);
  }

  // 2. Ambient occlusion shadow fringe next to solid walls
  for (let r = 1; r < MAP_ROWS - 1; r++) {
    for (let c = 1; c < MAP_COLS - 1; c++) {
      if (isOpaqueWall(grid[r][c])) continue;
      const x = c * TILE_SIZE;
      const y = r * TILE_SIZE;
      if (isOpaqueWall(grid[r - 1][c])) {
        const g = ctx.createLinearGradient(x, y, x, y + 14);
        g.addColorStop(0, 'rgba(0,0,0,0.52)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, TILE_SIZE, 14);
      }
      if (isOpaqueWall(grid[r + 1][c])) {
        const g = ctx.createLinearGradient(x, y + TILE_SIZE, x, y + TILE_SIZE - 12);
        g.addColorStop(0, 'rgba(0,0,0,0.42)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x, y + TILE_SIZE - 12, TILE_SIZE, 12);
      }
      if (isOpaqueWall(grid[r][c - 1])) {
        const g = ctx.createLinearGradient(x, y, x + 14, y);
        g.addColorStop(0, 'rgba(0,0,0,0.48)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, 14, TILE_SIZE);
      }
      if (isOpaqueWall(grid[r][c + 1])) {
        const g = ctx.createLinearGradient(x + TILE_SIZE, y, x + TILE_SIZE - 12, y);
        g.addColorStop(0, 'rgba(0,0,0,0.4)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x + TILE_SIZE - 12, y, 12, TILE_SIZE);
      }
    }
  }

  // 3. Draw Solid Walls, Pillars, Low Tables, and Rusted Iron Cell Bars
  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      const t = grid[r][c];
      const x = c * TILE_SIZE;
      const y = r * TILE_SIZE;

      if (t === TileType.WALL_CONCRETE) {
        // Thick poured cinderblock/concrete prison wall top
        ctx.fillStyle = '#181c20';
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

        // Exposed inner wall trim where adjacent to floor
        ctx.fillStyle = '#2a3138';
        if (r < MAP_ROWS - 1 && !isOpaqueWall(grid[r + 1][c])) {
          ctx.fillRect(x, y + TILE_SIZE - 7, TILE_SIZE, 7);
        }
        if (r > 0 && !isOpaqueWall(grid[r - 1][c])) {
          ctx.fillRect(x, y, TILE_SIZE, 5);
        }
        if (c < MAP_COLS - 1 && !isOpaqueWall(grid[r][c + 1])) {
          ctx.fillRect(x + TILE_SIZE - 6, y, 6, TILE_SIZE);
        }
        if (c > 0 && !isOpaqueWall(grid[r][c - 1])) {
          ctx.fillRect(x, y, 6, TILE_SIZE);
        }
        // Subtle concrete seam lines on wall top
        ctx.strokeStyle = 'rgba(255,255,255,0.035)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 4.5, y + 4.5, TILE_SIZE - 9, TILE_SIZE - 9);
      } else if (t === TileType.PILLAR) {
        // Reinforced concrete guard pillar with rusted steel corner brackets
        ctx.fillStyle = '#1b2026';
        ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        ctx.strokeStyle = '#38414a';
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 3.5, y + 3.5, TILE_SIZE - 7, TILE_SIZE - 7);
        // Rusted iron corner bolts
        ctx.fillStyle = '#5c4332';
        ctx.fillRect(x + 4, y + 4, 6, 6);
        ctx.fillRect(x + TILE_SIZE - 10, y + 4, 6, 6);
        ctx.fillRect(x + 4, y + TILE_SIZE - 10, 6, 6);
        ctx.fillRect(x + TILE_SIZE - 10, y + TILE_SIZE - 10, 6, 6);
      } else if (t === TileType.TABLE_LOW) {
        // Concrete/steel mess hall table (low cover — bullets & flashlight pass over)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
        ctx.fillRect(x + 7, y + 9, TILE_SIZE - 8, TILE_SIZE - 8);
        ctx.fillStyle = '#363d44';
        ctx.fillRect(x + 4, y + 5, TILE_SIZE - 8, TILE_SIZE - 10);
        ctx.strokeStyle = '#525b64';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 5, y + 6, TILE_SIZE - 10, TILE_SIZE - 12);
        // Surface scratches
        ctx.strokeStyle = 'rgba(15, 18, 22, 0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 10, y + 16);
        ctx.lineTo(x + TILE_SIZE - 12, y + 20);
        ctx.stroke();
      } else if (t === TileType.WALL_BARS_H) {
        // Steel track bar on floor
        const cy = y + TILE_SIZE * 0.5;
        ctx.fillStyle = '#1c2024';
        ctx.fillRect(x, cy - 4, TILE_SIZE, 8);
        // 3 rusted vertical iron bars (viewed top-down as heavy circular posts)
        for (const frac of [0.22, 0.5, 0.78]) {
          const cx = x + TILE_SIZE * frac;
          ctx.fillStyle = '#584438';
          ctx.beginPath();
          ctx.arc(cx, cy, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#8b959e';
          ctx.beginPath();
          ctx.arc(cx - 1, cy - 1, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (t === TileType.WALL_BARS_V) {
        const cx = x + TILE_SIZE * 0.5;
        ctx.fillStyle = '#1c2024';
        ctx.fillRect(cx - 4, y, 8, TILE_SIZE);
        for (const frac of [0.22, 0.5, 0.78]) {
          const cy = y + TILE_SIZE * frac;
          ctx.fillStyle = '#584438';
          ctx.beginPath();
          ctx.arc(cx, cy, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#8b959e';
          ctx.beginPath();
          ctx.arc(cx - 1, cy - 1, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  return canvas;
}

export function createPrisonMap(): PrisonMapData {
  const grid = buildGrid();
  const segments = extractOccluderSegments(grid);
  const mapCanvas = buildMapCanvas(grid);

  const crates: CrateEntity[] = [
    {
      id: 'crate_ammo',
      kind: 'AMMO_SUPPLY',
      x: 19.5 * TILE_SIZE,
      y: 11.7 * TILE_SIZE,
      width: 44,
      height: 28,
      label: 'MUNITIONS CRATE',
      sublabel: 'Refill Active Weapon',
      cost: 450,
      accentColor: '#d9822b',
      accentRgb: [217, 130, 43],
      purchased: false,
      cooldown: 0,
    },
    {
      id: 'crate_medkit',
      kind: 'MEDKIT_CRATE',
      x: 24.5 * TILE_SIZE,
      y: 19.9 * TILE_SIZE,
      width: 40,
      height: 28,
      label: 'FIELD MEDKIT',
      sublabel: 'Restore Full Health',
      cost: 600,
      accentColor: '#c92a2a',
      accentRgb: [201, 42, 42],
      purchased: false,
      cooldown: 0,
    },
    {
      id: 'crate_hamr',
      kind: 'WEAPON_HAMR',
      x: 3.2 * TILE_SIZE,
      y: 15.8 * TILE_SIZE,
      width: 50,
      height: 30,
      label: 'ARMORY CRATE · HAMR',
      sublabel: '5.56mm Heavy LMG',
      cost: 1200,
      accentColor: '#f59e0b',
      accentRgb: [245, 158, 11],
      weaponId: 'HAMR',
      purchased: false,
      cooldown: 0,
    },
    {
      id: 'crate_raygun',
      kind: 'WEAPON_RAY_GUN',
      x: 40.5 * TILE_SIZE,
      y: 15.8 * TILE_SIZE,
      width: 52,
      height: 32,
      label: 'CONTAINMENT · RAY GUN',
      sublabel: 'Atomic Plasma Weapon',
      cost: 2500,
      accentColor: '#22e584',
      accentRgb: [34, 229, 132],
      weaponId: 'RAY_GUN',
      purchased: false,
      cooldown: 0,
    },
  ];

  const spawns: SpawnPoint[] = [
    // North Cellblock breached cells
    { x: 13.5 * TILE_SIZE, y: 2.8 * TILE_SIZE, sector: 'NORTH CELLBLOCK A' },
    { x: 17.5 * TILE_SIZE, y: 2.8 * TILE_SIZE, sector: 'NORTH CELLBLOCK A' },
    { x: 22.0 * TILE_SIZE, y: 2.8 * TILE_SIZE, sector: 'NORTH CELLBLOCK A' },
    { x: 26.5 * TILE_SIZE, y: 2.8 * TILE_SIZE, sector: 'NORTH CELLBLOCK A' },
    { x: 30.5 * TILE_SIZE, y: 2.8 * TILE_SIZE, sector: 'NORTH CELLBLOCK A' },
    // South Cellblock breached cells
    { x: 13.5 * TILE_SIZE, y: 28.8 * TILE_SIZE, sector: 'SOUTH CELLBLOCK B' },
    { x: 17.5 * TILE_SIZE, y: 28.8 * TILE_SIZE, sector: 'SOUTH CELLBLOCK B' },
    { x: 22.0 * TILE_SIZE, y: 28.8 * TILE_SIZE, sector: 'SOUTH CELLBLOCK B' },
    { x: 26.5 * TILE_SIZE, y: 28.8 * TILE_SIZE, sector: 'SOUTH CELLBLOCK B' },
    { x: 30.5 * TILE_SIZE, y: 28.8 * TILE_SIZE, sector: 'SOUTH CELLBLOCK B' },
    // West Infirmary dark corners
    { x: 2.5 * TILE_SIZE, y: 5.5 * TILE_SIZE, sector: 'WEST INFIRMARY' },
    { x: 2.5 * TILE_SIZE, y: 26.0 * TILE_SIZE, sector: 'WEST INFIRMARY' },
    // East Mess Hall breached gates
    { x: 41.0 * TILE_SIZE, y: 5.8 * TILE_SIZE, sector: 'EAST MESS HALL' },
    { x: 41.0 * TILE_SIZE, y: 25.8 * TILE_SIZE, sector: 'EAST MESS HALL' },
  ];

  const sectors: SectorZone[] = [
    {
      name: 'CENTRAL ROTUNDA',
      x: 12 * TILE_SIZE,
      y: 10 * TILE_SIZE,
      w: 19 * TILE_SIZE,
      h: 11 * TILE_SIZE,
    },
    {
      name: 'NORTH CELLBLOCK A',
      x: 11 * TILE_SIZE,
      y: 0,
      w: 22 * TILE_SIZE,
      h: 10 * TILE_SIZE,
    },
    {
      name: 'SOUTH CELLBLOCK B',
      x: 11 * TILE_SIZE,
      y: 21 * TILE_SIZE,
      w: 22 * TILE_SIZE,
      h: 11 * TILE_SIZE,
    },
    {
      name: 'INFIRMARY & SHOWERS',
      x: 0,
      y: 0,
      w: 12 * TILE_SIZE,
      h: MAP_HEIGHT,
    },
    {
      name: 'MESS HALL · CONTAINMENT',
      x: 31 * TILE_SIZE,
      y: 0,
      w: 13 * TILE_SIZE,
      h: MAP_HEIGHT,
    },
  ];

  // Smoldering ember fixtures at prison junctions
  const sparks: SparkFixture[] = [
    { x: 8.5 * TILE_SIZE, y: 15.8 * TILE_SIZE, phase: 0.4, intensity: 0.65 },
    { x: 22.0 * TILE_SIZE, y: 7.5 * TILE_SIZE, phase: 2.1, intensity: 0.55 },
    { x: 36.5 * TILE_SIZE, y: 16.0 * TILE_SIZE, phase: 4.3, intensity: 0.5 },
  ];

  // Atmospheric burning oil barrels & smoldering floor fires casting raycasted firelight
  const rawFires: FireSource[] = [
    // Central Rotunda flanking barrels & scorched debris fire
    {
      x: 16.2 * TILE_SIZE,
      y: 13.0 * TILE_SIZE,
      kind: 'BARREL',
      radius: 17,
      solidRadius: 17,
      lightRadius: 270,
      phase: 0.3,
      intensity: 0.92,
    },
    {
      x: 27.8 * TILE_SIZE,
      y: 18.6 * TILE_SIZE,
      kind: 'BARREL',
      radius: 17,
      solidRadius: 17,
      lightRadius: 270,
      phase: 2.1,
      intensity: 0.92,
    },
    {
      x: 18.6 * TILE_SIZE,
      y: 18.6 * TILE_SIZE,
      kind: 'FLOOR_FIRE',
      radius: 22,
      solidRadius: 0,
      lightRadius: 230,
      phase: 4.4,
      intensity: 0.76,
    },
    // North Cellblock A corridor
    {
      x: 15.6 * TILE_SIZE,
      y: 7.7 * TILE_SIZE,
      kind: 'BARREL',
      radius: 16,
      solidRadius: 16,
      lightRadius: 260,
      phase: 1.4,
      intensity: 0.88,
    },
    {
      x: 28.4 * TILE_SIZE,
      y: 7.8 * TILE_SIZE,
      kind: 'FLOOR_FIRE',
      radius: 20,
      solidRadius: 0,
      lightRadius: 225,
      phase: 3.7,
      intensity: 0.74,
    },
    // South Cellblock B corridor
    {
      x: 28.2 * TILE_SIZE,
      y: 23.8 * TILE_SIZE,
      kind: 'BARREL',
      radius: 16,
      solidRadius: 16,
      lightRadius: 260,
      phase: 5.1,
      intensity: 0.88,
    },
    {
      x: 15.8 * TILE_SIZE,
      y: 23.8 * TILE_SIZE,
      kind: 'FLOOR_FIRE',
      radius: 21,
      solidRadius: 0,
      lightRadius: 225,
      phase: 2.8,
      intensity: 0.74,
    },
    // West Infirmary & Showers
    {
      x: 7.2 * TILE_SIZE,
      y: 12.2 * TILE_SIZE,
      kind: 'BARREL',
      radius: 16,
      solidRadius: 16,
      lightRadius: 255,
      phase: 0.9,
      intensity: 0.85,
    },
    {
      x: 7.2 * TILE_SIZE,
      y: 19.6 * TILE_SIZE,
      kind: 'FLOOR_FIRE',
      radius: 19,
      solidRadius: 0,
      lightRadius: 220,
      phase: 4.9,
      intensity: 0.72,
    },
    // East Mess Hall & Containment
    {
      x: 35.4 * TILE_SIZE,
      y: 13.4 * TILE_SIZE,
      kind: 'BARREL',
      radius: 16,
      solidRadius: 16,
      lightRadius: 265,
      phase: 1.9,
      intensity: 0.86,
    },
    {
      x: 35.4 * TILE_SIZE,
      y: 19.2 * TILE_SIZE,
      kind: 'FLOOR_FIRE',
      radius: 20,
      solidRadius: 0,
      lightRadius: 225,
      phase: 3.3,
      intensity: 0.74,
    },
  ];

  // Guarantee no fire spawns inside a solid wall/table tile
  const fires = rawFires.filter((f) => {
    const c = Math.floor(f.x / TILE_SIZE);
    const r = Math.floor(f.y / TILE_SIZE);
    return (
      r >= 1 &&
      r < MAP_ROWS - 1 &&
      c >= 1 &&
      c < MAP_COLS - 1 &&
      !isSolidForMovement(grid[r][c])
    );
  });

  return {
    grid,
    segments,
    crates,
    spawns,
    sectors,
    sparks,
    fires,
    playerStart: { x: 22 * TILE_SIZE, y: 15.8 * TILE_SIZE },
    mapCanvas,
  };
}

export function getSectorAt(sectors: SectorZone[], x: number, y: number): string {
  for (const s of sectors) {
    if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) {
      return s.name;
    }
  }
  return 'CELLBLOCK D';
}

/**
 * Resolves circle-vs-tile collision with clean wall sliding.
 */
export function resolveMapCollision(
  grid: TileType[][],
  x: number,
  y: number,
  radius: number
): { x: number; y: number } {
  let rx = Math.max(TILE_SIZE + radius, Math.min(MAP_WIDTH - TILE_SIZE - radius, x));
  let ry = Math.max(TILE_SIZE + radius, Math.min(MAP_HEIGHT - TILE_SIZE - radius, y));

  const minC = Math.max(0, Math.floor((rx - radius - 2) / TILE_SIZE));
  const maxC = Math.min(MAP_COLS - 1, Math.floor((rx + radius + 2) / TILE_SIZE));
  const minR = Math.max(0, Math.floor((ry - radius - 2) / TILE_SIZE));
  const maxR = Math.min(MAP_ROWS - 1, Math.floor((ry + radius + 2) / TILE_SIZE));

  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      if (!isSolidForMovement(grid[r][c])) continue;
      const left = c * TILE_SIZE;
      const top = r * TILE_SIZE;
      const right = left + TILE_SIZE;
      const bottom = top + TILE_SIZE;

      const closestX = Math.max(left, Math.min(rx, right));
      const closestY = Math.max(top, Math.min(ry, bottom));
      const dx = rx - closestX;
      const dy = ry - closestY;
      const distSq = dx * dx + dy * dy;

      if (distSq < radius * radius) {
        const dist = Math.sqrt(distSq);
        if (dist > 0.0001) {
          const push = radius - dist;
          rx += (dx / dist) * push;
          ry += (dy / dist) * push;
        } else {
          // Inside tile fallback: push out along nearest axis
          const dl = Math.abs(rx - left);
          const dr = Math.abs(right - rx);
          const dt = Math.abs(ry - top);
          const db = Math.abs(bottom - ry);
          const m = Math.min(dl, dr, dt, db);
          if (m === dl) rx = left - radius;
          else if (m === dr) rx = right + radius;
          else if (m === dt) ry = top - radius;
          else ry = bottom + radius;
        }
      }
    }
  }

  return { x: rx, y: ry };
}

/**
 * Lightweight BFS distance field from player's tile so zombies smoothly navigate prison corridors.
 */
export function computeFlowField(
  grid: TileType[][],
  targetX: number,
  targetY: number,
  outDist: Int16Array
): void {
  outDist.fill(32000);
  const startC = Math.max(0, Math.min(MAP_COLS - 1, Math.floor(targetX / TILE_SIZE)));
  const startR = Math.max(0, Math.min(MAP_ROWS - 1, Math.floor(targetY / TILE_SIZE)));

  const queue = new Int32Array(MAP_COLS * MAP_ROWS);
  let head = 0;
  let tail = 0;

  const startIdx = startR * MAP_COLS + startC;
  outDist[startIdx] = 0;
  queue[tail++] = startIdx;

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  while (head < tail) {
    const idx = queue[head++];
    const r = (idx / MAP_COLS) | 0;
    const c = idx - r * MAP_COLS;
    const d = outDist[idx] + 1;

    for (let i = 0; i < 4; i++) {
      const nc = c + dirs[i][0];
      const nr = r + dirs[i][1];
      if (nc < 0 || nc >= MAP_COLS || nr < 0 || nr >= MAP_ROWS) continue;
      const nIdx = nr * MAP_COLS + nc;
      if (outDist[nIdx] <= d) continue;
      if (isSolidForMovement(grid[nr][nc])) continue;
      outDist[nIdx] = d;
      queue[tail++] = nIdx;
    }
  }
}
