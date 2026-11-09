/**
 * Smooth heightfield terrain (pure). A chunk's terrain is a grid of heights
 * with a one-vertex apron (for normals). Rendering and collision use the
 * same triangulation, so what you see is exactly what you stand on.
 */
export interface TerrainGrid {
  /** Metres between vertices. */
  step: number;
  /** Cells per side (vertices per side = n + 1). */
  n: number;
  /** Heights incl. apron: (n + 3)^2 values, index (i + 1) * (n + 3) + (j + 1); i along x, j along z. */
  h: number[];
  /** Material for gentle and steep slopes; steepAt = slope (rise/run) where `steep` starts. */
  flat: string;
  steep: string;
  steepAt: number;
}

/** Build a grid from a world-space height function (chunk origin ox, oz). */
export function makeTerrain(ox: number, oz: number, size: number, step: number, h: (x: number, z: number) => number, mats: Pick<TerrainGrid, 'flat' | 'steep' | 'steepAt'>): TerrainGrid {
  const n = Math.round(size / step);
  const w = n + 3;
  const arr = new Array<number>(w * w);
  for (let i = -1; i <= n + 1; i++) for (let j = -1; j <= n + 1; j++) arr[(i + 1) * w + (j + 1)] = h(ox + i * step, oz + j * step);
  return { step, n, h: arr, ...mats };
}

export function terrainAt(t: TerrainGrid, i: number, j: number): number {
  return t.h[(i + 1) * (t.n + 3) + (j + 1)];
}

/**
 * Height at a chunk-local point, on the same triangles as the mesh:
 * each cell is split along the (0,0)-(1,1) diagonal. Null outside the grid.
 */
export function sampleTerrain(t: TerrainGrid, lx: number, lz: number): number | null {
  const fx0 = lx / t.step;
  const fz0 = lz / t.step;
  if (fx0 < 0 || fz0 < 0 || fx0 > t.n || fz0 > t.n) return null;
  const i = Math.min(t.n - 1, Math.floor(fx0));
  const j = Math.min(t.n - 1, Math.floor(fz0));
  const fx = fx0 - i;
  const fz = fz0 - j;
  const h00 = terrainAt(t, i, j);
  const h10 = terrainAt(t, i + 1, j);
  const h01 = terrainAt(t, i, j + 1);
  const h11 = terrainAt(t, i + 1, j + 1);
  return fx >= fz ? h00 + (h10 - h00) * fx + (h11 - h10) * fz : h00 + (h11 - h01) * fx + (h01 - h00) * fz;
}
