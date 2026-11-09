/** Game: wires renderer, world streaming, player, audio and UI together. */
import * as THREE from 'three';
import { Input } from './core/input';
import { loadSettings, saveSettings, type Settings } from './core/settings';
import { getNative } from './core/storage';
import { hashString } from './core/rng';
import { makeGenContext, parseWorldSeed, resolveLevel } from './levels/registry';
import type { GenContext, LevelDefinition } from './levels/levelDefinition';
import { ChunkManager } from './world/chunkManager';
import { buildChunkMesh, disposeChunkMesh, LevelMaterials } from './world/chunkMesher';
import { FloatingOrigin } from './world/floatingOrigin';
import { toWorldBox, type WBox } from './world/collision';
import { PlayerController } from './player/controller';
import { AudioSystem } from './systems/audio';
import { DebugOverlay } from './ui/debugOverlay';
import { Menu } from './ui/menu';

interface ChunkHandle {
  group: THREE.Group;
  boxes: WBox[];
}

export interface LaunchOptions {
  debug: boolean;
  levelId: string;
  seed?: string;
}

export function readLaunchOptions(): LaunchOptions {
  const q = new URLSearchParams(location.search);
  const args = getNative()?.args ?? [];
  const arg = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  return {
    debug: q.get('debug') === '1' || args.includes('--dev'),
    levelId: q.get('level') ?? arg('level') ?? '0',
    seed: q.get('seed') ?? arg('seed') ?? undefined,
  };
}

export class Game {
  readonly settings: Settings;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private worldRoot = new THREE.Group();
  private input: Input;
  private audio = new AudioSystem();
  readonly player = new PlayerController();
  private origin = new FloatingOrigin(32);
  private chunks!: ChunkManager<ChunkHandle>;
  private level!: LevelDefinition;
  private ctx!: GenContext;
  private mats!: LevelMaterials;
  private menu: Menu;
  private debug: DebugOverlay | null = null;
  private worldSeed: number;
  private started = false;
  private lastStep = 0;
  private time = 0;
  private last = performance.now();

  constructor(container: HTMLElement, opts: LaunchOptions) {
    this.settings = loadSettings();
    const seedStr = opts.seed ?? this.settings.worldSeed;
    // A random world seed is allowed here (it is not world generation itself).
    this.worldSeed = seedStr ? parseWorldSeed(seedStr) : hashString(String(Date.now()));

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, window.innerWidth / window.innerHeight, 0.05, 400);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.worldRoot);
    this.scene.add(this.camera);

    this.input = new Input(this.renderer.domElement, () => this.settings);
    if (opts.debug) {
      this.debug = new DebugOverlay(container);
      (window as unknown as { __game: Game }).__game = this; // debug/test hook
    }

    this.menu = new Menu(container, this.settings, {
      onResume: () => this.resume(),
      onChange: (s) => this.applySettings(s),
      onFullscreen: (on) => this.setFullscreen(on),
    });
    this.menu.show(false);

    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== this.renderer.domElement) this.menu.show(this.started);
    });
    window.addEventListener('resize', () => this.onResize());

    this.enterLevel(opts.levelId);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private resume(): void {
    this.started = true;
    this.audio.start();
    this.audio.applySettings(this.settings);
    this.audio.setAmbience(this.level.ambience);
    this.menu.hide();
    this.input.requestLock();
  }

  private setFullscreen(on: boolean): void {
    const native = getNative();
    if (native?.setFullscreen) native.setFullscreen(on);
    else if (on) void document.documentElement.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) void document.exitFullscreen();
  }

  private applySettings(s: Settings): void {
    saveSettings(s);
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    if (this.chunks && this.chunks.radius !== s.renderDistance) this.chunks.radius = s.renderDistance;
    this.audio.applySettings(s);
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  enterLevel(id: string): void {
    if (this.chunks) this.chunks.clear();
    this.mats?.dispose();
    this.level = resolveLevel(id);
    this.ctx = makeGenContext(this.worldSeed, this.level);
    this.mats = new LevelMaterials(this.ctx);
    this.origin.reset(this.level.chunkSize);
    const p = this.level.palette;
    this.scene.background = new THREE.Color(p.fogColor);
    this.scene.fog = new THREE.FogExp2(p.fogColor, p.fogDensity);

    const ctx = this.ctx;
    this.chunks = new ChunkManager<ChunkHandle>({
      chunkSize: this.level.chunkSize,
      radius: this.settings.renderDistance,
      budgetMs: 4,
      generate: (cx, cz) => this.level.generator(ctx, cx, cz),
      build: (data) => {
        const sampler = this.level.lightSampler(ctx, data.cx, data.cz);
        const group = buildChunkMesh(data, this.mats, sampler);
        this.placeChunk(group);
        this.worldRoot.add(group);
        const ox = data.cx * data.size;
        const oz = data.cz * data.size;
        return { group, boxes: data.solids.map((b) => toWorldBox(b, ox, oz)) };
      },
      dispose: (h) => disposeChunkMesh(h.group),
    });

    const s = this.level.spawn;
    this.player.x = s.x;
    this.player.y = s.y;
    this.player.z = s.z;
    this.player.yaw = s.yaw;
    this.player.distanceWalked = 0;
    this.chunks.loadAllSync(s.x, s.z, 1);
    this.player.yaw = this.pickOpenYaw(s.yaw);
    if (this.started) this.audio.setAmbience(this.level.ambience);
  }

  /** Face the most open of the four cardinal directions from the spawn point. */
  private pickOpenYaw(preferred: number): number {
    let best = preferred;
    let bestDist = -1;
    for (let k = 0; k < 4; k++) {
      const yaw = preferred + (k * Math.PI) / 2;
      const dx = -Math.sin(yaw);
      const dz = -Math.cos(yaw);
      let d = 0;
      for (; d < 24; d += 0.25) {
        const x = this.player.x + dx * d;
        const z = this.player.z + dz * d;
        if (this.boxesNear(x, z).some((b) => b.minY < 1.5 && x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ)) break;
      }
      if (d > bestDist) {
        bestDist = d;
        best = yaw;
      }
    }
    return best;
  }

  private placeChunk(group: THREE.Group): void {
    const S = this.level.chunkSize;
    group.position.set(group.userData.cx * S - this.origin.offsetX, 0, group.userData.cz * S - this.origin.offsetZ);
  }

  private boxesNear = (x: number, z: number): WBox[] => {
    const S = this.level.chunkSize;
    const out: WBox[] = [];
    const cx0 = Math.floor((x - 1) / S);
    const cx1 = Math.floor((x + 1) / S);
    const cz0 = Math.floor((z - 1) / S);
    const cz1 = Math.floor((z + 1) / S);
    for (let cx = cx0; cx <= cx1; cx++)
      for (let cz = cz0; cz <= cz1; cz++) {
        const c = this.chunks.get(cx, cz);
        if (!c) continue;
        for (const b of c.handle.boxes) {
          if (b.maxX < x - 1 || b.minX > x + 1 || b.maxZ < z - 1 || b.minZ > z + 1) continue;
          out.push(b);
        }
      }
    return out;
  };

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    const s = this.settings;
    const active = this.input.locked;

    if (active) {
      const k = 0.0022;
      const inv = s.invertY ? -1 : 1;
      this.player.look(this.input.mouseDX * k * s.sensitivityX, this.input.mouseDY * k * s.sensitivityY * inv);
      const f = (this.input.isDown('forward') ? 1 : 0) - (this.input.isDown('back') ? 1 : 0);
      const r = (this.input.isDown('right') ? 1 : 0) - (this.input.isDown('left') ? 1 : 0);
      this.player.step(dt, { forward: f, strafe: r, sprint: this.input.isDown('sprint'), crouch: this.input.isDown('crouch') }, this.boxesNear);
    }

    this.chunks.update(this.player.x, this.player.z, this.player.dirX, this.player.dirZ);
    if (this.origin.update(this.player.x, this.player.z)) {
      for (const c of this.chunks.chunks.values()) this.placeChunk(c.handle.group);
    }

    // Footsteps every half bob cycle.
    const stepIdx = Math.floor(this.player.bobPhase / Math.PI);
    if (stepIdx !== this.lastStep) {
      this.lastStep = stepIdx;
      if (this.player.speed > 0.5) this.audio.footstep(this.player.speed > 4 ? 1.3 : 0.8);
    }

    // Flickering tubes: bounded rate and depth (photosensitivity, SPEC §9.3).
    const slot = Math.floor(this.time * 7);
    const fl = (Math.sin(slot * 12.9898) * 43758.5453) % 1;
    this.mats.lightFlicker.color.setHex(this.level.palette.lightColor).multiplyScalar(Math.abs(fl) > 0.3 ? 1 : 0.4);

    const bob = Math.sin(this.player.bobPhase) * 0.035 * s.headBob;
    this.camera.position.set(
      this.origin.toRenderX(this.player.x),
      this.player.y + this.player.eye + bob,
      this.origin.toRenderZ(this.player.z),
    );
    this.camera.rotation.set(this.player.pitch, this.player.yaw, 0);
    this.renderer.render(this.scene, this.camera);

    if (this.debug) {
      const S = this.level.chunkSize;
      this.debug.update(dt, {
        level: `${this.level.id} (${this.level.subtitle ?? this.level.name})`,
        seed: this.worldSeed,
        pos: `${this.player.x.toFixed(1)}, ${this.player.y.toFixed(1)}, ${this.player.z.toFixed(1)}`,
        chunk: `${Math.floor(this.player.x / S)}, ${Math.floor(this.player.z / S)}`,
        chunks: `${this.chunks.chunks.size} / max ${this.chunks.maxChunks} (queue ${this.chunks.pending})`,
        origin: `${this.origin.offsetX}, ${this.origin.offsetZ}`,
        walked: `${this.player.distanceWalked.toFixed(0)} m`,
        draws: this.renderer.info.render.calls,
        geos: this.renderer.info.memory.geometries,
      });
    }
    this.input.endFrame();
  }
}
