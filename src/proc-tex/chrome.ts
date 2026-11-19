/** A shared reflection map for polished metal (the trophy skins and pistols). */
import * as THREE from 'three';

let envCache: THREE.CubeTexture | null = null;
/** A soft studio surrounding (bright above, dark below) for the trophies to reflect. */
export function chromeEnv(): THREE.CubeTexture {
  if (envCache) return envCache;
  // A studio with strong light and dark bands: polished metal reads by its contrast.
  const face = (bands: Array<[number, string]>, streaks: boolean) => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const gr = g.createLinearGradient(0, 0, 0, 64);
    for (const [at, col] of bands) gr.addColorStop(at, col);
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    if (streaks) {
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.fillRect(6, 14, 52, 4);
      g.fillRect(20, 40, 30, 3);
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(0, 26, 64, 6);
    }
    return c;
  };
  const side = (s: boolean) => face([[0, '#ffffff'], [0.35, '#d8d8d8'], [0.5, '#2a2a2a'], [0.6, '#9a9a9a'], [1, '#141414']], s);
  envCache = new THREE.CubeTexture([side(true), side(false), face([[0, '#ffffff'], [1, '#f0f0f0']], false), face([[0, '#2a2a2a'], [1, '#050505']], false), side(false), side(true)]);
  envCache.needsUpdate = true;
  return envCache;
}

/** A polished-metal material: `color` tints the reflection (silver, gold). */
export function chromeMaterial(color: number, dim = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(dim), envMap: chromeEnv(), reflectivity: 1, combine: THREE.MultiplyOperation });
}
