/** Game: wires renderer, world streaming, player, items, audio and UI together. */
import * as THREE from 'three';
import { Input } from './core/input';
import { loadSettings, saveSettings, type Action, type Settings } from './core/settings';
import { getNative } from './core/storage';
import { hashString, Rng } from './core/rng';
import { makeGenContext, parseWorldSeed, resolveLevel } from './levels/registry';
import type { GenContext, LevelDefinition, LightSampler } from './levels/levelDefinition';
import { ChunkManager } from './world/chunkManager';
import { buildChunkMesh, disposeChunkMesh, LevelMaterials } from './world/chunkMesher';
import { FloatingOrigin } from './world/floatingOrigin';
import { rayBox, toWorldBox, type WBox } from './world/collision';
import { chunkKey, type ChunkData, type ZoneKind } from './world/chunkData';
import { WorldDeltas, type ChalkMark } from './world/deltas';
import { buildChalkMark, buildItemMesh, buildPropMesh } from './world/objectMeshes';
import { PlayerController } from './player/controller';
import { Inventory } from './player/inventory';
import { Stats, type DeathCause } from './player/stats';
import { ITEMS, type ItemId } from './items/itemDefs';
import { AudioSystem } from './systems/audio';
import { dynamicLights, MAX_POINT_LIGHTS } from './systems/lighting';
import { Hallucinations } from './systems/hallucination';
import { DebugOverlay } from './ui/debugOverlay';
import { Hud } from './ui/hud';
import { Menu } from './ui/menu';
import { t } from './ui/i18n';

interface WorldItem {
  uid: string;
  id: ItemId;
  meta?: number;
  mesh: THREE.Object3D;
  /** World coordinates. */
  x: number;
  y: number;
  z: number;
}

interface WorldZone {
  kind: ZoneKind;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

interface ChunkHandle {
  group: THREE.Group;
  boxes: WBox[];
  items: Map<string, WorldItem>;
  zones: WorldZone[];
  sampler: LightSampler;
  key: string;
}

interface Glowstick {
  x: number;
  y: number;
  z: number;
  ttl: number;
  mesh: THREE.Mesh;
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

const SLOT_ACTIONS: Action[] = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6', 'slot7', 'slot8'];

export class Game {
  readonly settings: Settings;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private worldRoot = new THREE.Group();
  private fxRoot = new THREE.Group();
  private input: Input;
  private audio = new AudioSystem();
  readonly player = new PlayerController();
  readonly inventory = new Inventory();
  readonly stats = new Stats();
  readonly deltas = new WorldDeltas();
  private origin = new FloatingOrigin(32);
  private chunks!: ChunkManager<ChunkHandle>;
  private level!: LevelDefinition;
  private ctx!: GenContext;
  private mats!: LevelMaterials;
  private menu: Menu;
  private hud: Hud;
  private halluc: Hallucinations;
  private debug: DebugOverlay | null = null;
  private worldSeed: number;
  private rng: Rng;
  private started = false;
  private flashlightOn = false;
  private glowsticks: Glowstick[] = [];
  private target: WorldItem | null = null;
  private zoneKey = '';
  private deadTimer = 0;
  private lastStep = 0;
  private time = 0;
  private last = performance.now();

  constructor(container: HTMLElement, opts: LaunchOptions) {
    this.settings = loadSettings();
    const seedStr = opts.seed ?? this.settings.worldSeed;
    // A random world seed is allowed here (it is not world generation itself).
    this.worldSeed = seedStr ? parseWorldSeed(seedStr) : hashString(String(Date.now()));
    this.rng = new Rng(this.worldSeed ^ 0x5eed);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, window.innerWidth / window.innerHeight, 0.05, 400);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.worldRoot, this.fxRoot, this.camera);

    this.input = new Input(this.renderer.domElement, () => this.settings);
    this.hud = new Hud(container, this.inventory);
    this.hud.setVisible(this.settings.showHud);
    this.halluc = new Hallucinations(this.fxRoot, this.audio);
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
      if (document.pointerLockElement === this.renderer.domElement) return;
      if (this.hud.inventoryOpen || this.deadTimer > 0) return;
      this.hud.closeNote();
      this.menu.show(this.started);
    });
    window.addEventListener('resize', () => this.onResize());

    // Starting kit: one bottle so the first minutes are not a death march.
    this.inventory.add('almond_water');
    this.enterLevel(opts.levelId);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------

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
    this.hud.setVisible(s.showHud);
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  enterLevel(id: string): void {
    if (this.chunks) this.chunks.clear();
    this.mats?.dispose();
    this.halluc.clear();
    this.clearGlowsticks();
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
      build: (data) => this.buildChunk(data),
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

  private buildChunk(data: ChunkData): ChunkHandle {
    const ctx = this.ctx;
    const sampler = this.level.lightSampler(ctx, data.cx, data.cz);
    const group = buildChunkMesh(data, this.mats, sampler);
    const ox = data.cx * data.size;
    const oz = data.cz * data.size;
    const key = chunkKey(data.cx, data.cz);
    const delta = this.deltas.get(this.level.id, key);
    const items = new Map<string, WorldItem>();
    const addItem = (uid: string, id: ItemId, x: number, y: number, z: number, rot: number, meta?: number) => {
      const light = sampler(x + ox, 0.3, z + oz, 0, 1, 0);
      const mesh = buildItemMesh(id, light);
      mesh.position.set(x, y, z);
      mesh.rotation.y = rot;
      group.add(mesh);
      items.set(uid, { uid, id, meta, mesh, x: x + ox, y, z: z + oz });
    };
    for (const it of data.items) {
      if (delta?.taken.includes(it.uid)) continue;
      addItem(it.uid, it.id, it.x, it.y, it.z, it.rot, it.meta);
    }
    for (const d of delta?.dropped ?? []) addItem(d.uid, d.id, d.x, d.y, d.z, 0, d.meta);
    for (const m of delta?.marks ?? []) group.add(buildChalkMark(m));
    for (const p of data.props) group.add(buildPropMesh(p, sampler(p.x + ox, 1.5, p.z + oz, 0, 1, 0)));

    this.placeChunk(group);
    this.worldRoot.add(group);
    return {
      group,
      boxes: data.solids.map((b) => toWorldBox(b, ox, oz)),
      items,
      zones: data.zones.map((z) => ({ kind: z.kind, x0: z.x0 + ox, z0: z.z0 + oz, x1: z.x1 + ox, z1: z.z1 + oz })),
      sampler,
      key,
    };
  }

  /** Face the most open of the four cardinal directions from the spawn point. */
  private pickOpenYaw(preferred: number): number {
    let best = preferred;
    let bestDist = -1;
    for (let k = 0; k < 4; k++) {
      const yaw = preferred + (k * Math.PI) / 2;
      const hit = this.rayWall(this.player.x, this.player.z, -Math.sin(yaw), -Math.cos(yaw), 24);
      const d = hit ? hit.t : 24;
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

  // ---------------------------------------------------------------------------
  // World queries
  // ---------------------------------------------------------------------------

  private chunkAt(x: number, z: number): ChunkHandle | undefined {
    const S = this.level.chunkSize;
    return this.chunks.get(Math.floor(x / S), Math.floor(z / S))?.handle;
  }

  private boxesNear = (x: number, z: number, r = 1): WBox[] => {
    const S = this.level.chunkSize;
    const out: WBox[] = [];
    for (let cx = Math.floor((x - r) / S); cx <= Math.floor((x + r) / S); cx++)
      for (let cz = Math.floor((z - r) / S); cz <= Math.floor((z + r) / S); cz++) {
        const c = this.chunks.get(cx, cz);
        if (!c) continue;
        for (const b of c.handle.boxes) {
          if (b.maxX < x - r || b.minX > x + r || b.maxZ < z - r || b.minZ > z + r) continue;
          out.push(b);
        }
      }
    return out;
  };

  /** Horizontal ray against walls (at chest height). */
  private rayWall = (x: number, z: number, dx: number, dz: number, max: number) => {
    let best: { t: number; nx: number; nz: number } | null = null;
    const boxes = this.boxesNear(x + (dx * max) / 2, z + (dz * max) / 2, max / 2 + 1);
    for (const b of boxes) {
      const h = rayBox(x, 1.2, z, dx, 0, dz, b, max);
      if (h && (!best || h.t < best.t)) best = { t: h.t, nx: h.nx, nz: h.nz };
    }
    return best;
  };

  /** Full 3D ray against walls, floor and ceiling. */
  private ray3(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number) {
    let best: { t: number; nx: number; ny: number; nz: number } | null = null;
    for (const b of this.boxesNear(ox + (dx * max) / 2, oz + (dz * max) / 2, max / 2 + 1)) {
      const h = rayBox(ox, oy, oz, dx, dy, dz, b, max);
      if (h && (!best || h.t < best.t)) best = h;
    }
    if (dy < -1e-4) {
      const tf = -oy / dy;
      if (tf > 0 && tf < max && (!best || tf < best.t)) best = { t: tf, nx: 0, ny: 1, nz: 0 };
    }
    return best;
  }

  /** Baked light level at the player's position. */
  private lightAtPlayer(): number {
    const c = this.chunkAt(this.player.x, this.player.z);
    if (!c) return 0.5;
    return c.sampler(this.player.x, 1.0, this.player.z, 0, 1, 0);
  }

  private zoneAt(x: number, z: number): WorldZone | null {
    const c = this.chunkAt(x, z);
    if (!c) return null;
    for (const zn of c.zones) if (x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1) return zn;
    return null;
  }

  // ---------------------------------------------------------------------------
  // Items
  // ---------------------------------------------------------------------------

  private eyeDir(): [number, number, number] {
    const cp = Math.cos(this.player.pitch);
    return [-Math.sin(this.player.yaw) * cp, Math.sin(this.player.pitch), -Math.cos(this.player.yaw) * cp];
  }

  private findTarget(): WorldItem | null {
    const ex = this.player.x;
    const ey = this.player.y + this.player.eye;
    const ez = this.player.z;
    const [dx, dy, dz] = this.eyeDir();
    let best: WorldItem | null = null;
    let bestScore = -Infinity;
    const S = this.level.chunkSize;
    for (let cx = Math.floor((ex - 3) / S); cx <= Math.floor((ex + 3) / S); cx++)
      for (let cz = Math.floor((ez - 3) / S); cz <= Math.floor((ez + 3) / S); cz++) {
        const c = this.chunks.get(cx, cz);
        if (!c) continue;
        for (const it of c.handle.items.values()) {
          const vx = it.x - ex;
          const vy = it.y + 0.08 - ey;
          const vz = it.z - ez;
          const d = Math.hypot(vx, vy, vz);
          if (d > 2.4) continue;
          const dot = (vx * dx + vy * dy + vz * dz) / d;
          const need = d < 1.3 ? 0.88 : 0.95;
          if (dot < need) continue;
          const wall = this.ray3(ex, ey, ez, vx / d, vy / d, vz / d, d);
          if (wall && wall.t < d - 0.15) continue;
          const score = dot * 2 - d * 0.2;
          if (score > bestScore) {
            bestScore = score;
            best = it;
          }
        }
      }
    return best;
  }

  private pickUp(it: WorldItem): void {
    if (!this.inventory.add(it.id, it.meta)) {
      this.hud.message(t('msg.full'));
      return;
    }
    const c = this.chunkAt(it.x, it.z);
    if (c) {
      this.deltas.take(this.level.id, c.key, it.uid);
      c.items.delete(it.uid);
      it.mesh.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.userData.ownMat) (m.material as THREE.Material).dispose();
      });
      it.mesh.removeFromParent();
    }
    this.audio.pickup();
    this.hud.message(t('msg.pickup', { name: ITEMS[it.id].name }));
  }

  private dropHeld(): void {
    const sel = this.inventory.selected;
    const s = this.inventory.held;
    if (!s) {
      this.hud.message(t('msg.nothingHeld'));
      return;
    }
    const fx = -Math.sin(this.player.yaw);
    const fz = -Math.cos(this.player.yaw);
    let dist = 0.8;
    const hit = this.rayWall(this.player.x, this.player.z, fx, fz, 1.2);
    if (hit) dist = Math.max(0.2, hit.t - 0.35);
    const wx = this.player.x + fx * dist;
    const wz = this.player.z + fz * dist;
    const c = this.chunkAt(wx, wz);
    if (!c) return;
    const one = this.inventory.takeOne(sel)!;
    const S = this.level.chunkSize;
    const [cx, cz] = c.key.split(',').map(Number);
    const lx = wx - cx * S;
    const lz = wz - cz * S;
    const d = this.deltas.drop(this.level.id, c.key, { id: one.id, meta: one.meta, x: lx, y: 0, z: lz });
    const mesh = buildItemMesh(one.id, c.sampler(wx, 0.3, wz, 0, 1, 0));
    mesh.position.set(lx, 0, lz);
    c.group.add(mesh);
    c.items.set(d.uid, { uid: d.uid, id: one.id, meta: one.meta, mesh, x: wx, y: 0, z: wz });
    if (one.id === 'flashlight' && !this.inventory.has('flashlight')) this.flashlightOn = false;
    this.hud.message(t('msg.drop', { name: ITEMS[one.id].name }));
  }

  private useHeld(): void {
    const sel = this.inventory.selected;
    const s = this.inventory.held;
    if (!s) {
      this.hud.message(t('msg.nothingHeld'));
      return;
    }
    const st = this.stats;
    const name = ITEMS[s.id].name;
    const consume = () => this.inventory.takeOne(sel);
    switch (s.id) {
      case 'almond_water':
        st.hydration += 30;
        st.sanity += 5;
        break;
      case 'almond_water_blue':
        st.hydration += 15;
        st.sanity += 35;
        break;
      case 'aero_water':
        st.hydration += 40;
        st.sanity += 10;
        break;
      case 'warm_tea':
        st.hydration += 10;
        st.sanity += 15;
        break;
      case 'expired_water':
        consume();
        this.audio.drink();
        st.hydration -= 25;
        st.sanity -= 12;
        st.nausea = 90;
        st.clamp();
        this.hud.message(t('msg.expired'), 3.5);
        if (this.rng.chance(0.08)) this.die('poison');
        return;
      case 'canned_food':
        st.hunger += 40;
        break;
      case 'energy_bar':
        st.hunger += 20;
        st.stamina += 30;
        break;
      case 'battery':
        if (!this.inventory.has('flashlight')) {
          this.hud.message(t('msg.noFlashlight'));
          return;
        }
        consume();
        st.battery = 100;
        this.audio.click();
        this.hud.message(t('msg.battery'));
        return;
      case 'first_aid':
        consume();
        st.nausea = 0;
        st.sanity += 15;
        st.clamp();
        this.audio.pickup();
        this.hud.message(t('msg.firstAid'));
        return;
      case 'chalk':
        this.useChalk(sel);
        return;
      case 'glowstick':
        consume();
        this.placeGlowstick();
        this.hud.message(t('msg.glowstick'));
        return;
      case 'note':
        this.hud.showNote(s.meta ?? 0);
        return;
      case 'flashlight':
        this.toggleFlashlight();
        return;
      case 'compass':
        this.hud.message(t('msg.compass'));
        return;
      default:
        this.hud.message(t('msg.cantUse'));
        return;
    }
    // Drinks and food fall through to here.
    consume();
    st.clamp();
    const def = ITEMS[s.id];
    if (def.shape === 'bottle' || s.id === 'warm_tea') {
      this.audio.drink();
      this.hud.message(t('msg.drink', { name }));
    } else {
      this.audio.blip(300, 0.1, 0.1);
      this.hud.message(t('msg.eat', { name }));
    }
  }

  private useChalk(sel: number): void {
    const ex = this.player.x;
    const ey = this.player.y + this.player.eye;
    const ez = this.player.z;
    const [dx, dy, dz] = this.eyeDir();
    const hit = this.ray3(ex, ey, ez, dx, dy, dz, 3);
    if (!hit) {
      this.hud.message(t('msg.chalkFail'));
      return;
    }
    const wx = ex + dx * hit.t;
    const wy = ey + dy * hit.t;
    const wz = ez + dz * hit.t;
    const c = this.chunkAt(wx - hit.nx * 0.05, wz - hit.nz * 0.05) ?? this.chunkAt(wx, wz);
    if (!c) return;
    const S = this.level.chunkSize;
    const [cx, cz] = c.key.split(',').map(Number);
    const mark: ChalkMark = {
      x: wx - cx * S,
      y: wy,
      z: wz - cz * S,
      nx: hit.nx,
      ny: hit.ny,
      nz: hit.nz,
      kind: this.rng.int(0, 2),
      // Arrows point the way the player is facing (on floors) or upward-ish on walls.
      rot: hit.ny > 0.5 ? -this.player.yaw - Math.PI / 2 : 0,
    };
    this.deltas.mark(this.level.id, c.key, mark);
    c.group.add(buildChalkMark(mark));
    const s = this.inventory.slots[sel]!;
    s.meta = (s.meta ?? 20) - 1;
    this.audio.noiseScratch();
    if (s.meta <= 0) {
      this.inventory.slots[sel] = null;
      this.hud.message(t('msg.chalkEmpty'));
    } else this.hud.message(t('msg.chalk'));
  }

  private placeGlowstick(): void {
    const fx = -Math.sin(this.player.yaw);
    const fz = -Math.cos(this.player.yaw);
    const x = this.player.x + fx * 0.6;
    const z = this.player.z + fz * 0.6;
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.17, 8),
      new THREE.MeshBasicMaterial({ color: 0x9dff8a }),
    );
    mesh.rotation.z = Math.PI / 2;
    mesh.rotation.y = this.player.yaw;
    this.fxRoot.add(mesh);
    this.glowsticks.push({ x, y: 0.02, z, ttl: 240, mesh });
    if (this.glowsticks.length > MAX_POINT_LIGHTS) this.removeGlowstick(0);
  }

  private removeGlowstick(i: number): void {
    const g = this.glowsticks[i];
    g.mesh.geometry.dispose();
    (g.mesh.material as THREE.Material).dispose();
    g.mesh.removeFromParent();
    this.glowsticks.splice(i, 1);
  }

  private clearGlowsticks(): void {
    while (this.glowsticks.length) this.removeGlowstick(0);
  }

  private toggleFlashlight(): void {
    if (!this.inventory.has('flashlight')) {
      this.hud.message(t('msg.noFlashlight'));
      return;
    }
    if (!this.flashlightOn && this.stats.battery <= 0) {
      this.hud.message(t('msg.noBattery'));
      return;
    }
    this.flashlightOn = !this.flashlightOn;
    this.audio.click();
  }

  // ---------------------------------------------------------------------------
  // Death
  // ---------------------------------------------------------------------------

  private die(cause: DeathCause): void {
    if (this.deadTimer > 0) return;
    this.deadTimer = 3.5;
    this.flashlightOn = false;
    this.inventory.loseHalf((n) => this.rng.int(0, n - 1));
    this.hud.showDeath(t('death.title'), t('death.' + cause));
    this.audio.humDip(3);
  }

  private respawn(): void {
    const s = this.level.spawn;
    this.player.x = s.x;
    this.player.y = s.y;
    this.player.z = s.z;
    this.player.vy = 0;
    this.stats.respawn();
    this.halluc.clear();
    this.chunks.loadAllSync(s.x, s.z, 1);
    this.player.yaw = this.pickOpenYaw(s.yaw);
    this.hud.hideDeath();
  }

  // ---------------------------------------------------------------------------
  // Frame
  // ---------------------------------------------------------------------------

  private handleActions(): void {
    const inp = this.input;
    if (inp.wasPressed('inventory')) {
      if (this.hud.inventoryOpen) {
        this.hud.closeInventory();
        this.input.requestLock();
      } else if (this.input.locked) {
        this.hud.openInventory();
        document.exitPointerLock();
      }
    }
    if (this.hud.inventoryOpen && inp.wasPressed('pause')) {
      this.hud.closeInventory();
      this.menu.show(true);
    }
    if (!this.input.locked) return;
    if (this.hud.noteOpen) {
      if (inp.wasPressed('use') || inp.wasPressed('interact')) this.hud.closeNote();
      return;
    }
    SLOT_ACTIONS.forEach((a, i) => {
      if (inp.wasPressed(a)) this.inventory.select(i);
    });
    if (inp.wheel) this.inventory.select(this.inventory.selected + inp.wheel);
    if (inp.wasPressed('interact') && this.target) this.pickUp(this.target);
    if (inp.wasPressed('use')) this.useHeld();
    if (inp.wasPressed('drop')) this.dropHeld();
    if (inp.wasPressed('flashlight')) this.toggleFlashlight();
  }

  private frame(): void {
    const now = performance.now();
    const realDt = Math.min(0.5, (now - this.last) / 1000);
    const dt = Math.min(0.05, realDt);
    this.last = now;
    this.time += dt;
    const s = this.settings;
    const active = this.input.locked && this.deadTimer <= 0;

    if (this.deadTimer > 0) {
      this.deadTimer -= realDt;
      if (this.deadTimer <= 0) this.respawn();
    }

    this.handleActions();

    let running = false;
    let moving = false;
    if (active && !this.hud.noteOpen) {
      const k = 0.0022;
      const inv = s.invertY ? -1 : 1;
      // Low sanity: slight erratic drift in the view (SPEC §6.1 誤操作ノイズ).
      const jitter = this.stats.sanity < 15 ? (15 - this.stats.sanity) * 0.00004 : 0;
      this.player.look(
        this.input.mouseDX * k * s.sensitivityX + Math.sin(this.time * 1.7) * jitter,
        this.input.mouseDY * k * s.sensitivityY * inv + Math.sin(this.time * 2.3) * jitter,
      );
      const f = (this.input.isDown('forward') ? 1 : 0) - (this.input.isDown('back') ? 1 : 0);
      const r = (this.input.isDown('right') ? 1 : 0) - (this.input.isDown('left') ? 1 : 0);
      moving = f !== 0 || r !== 0;
      running = this.input.isDown('sprint') && this.stats.canRun && f > 0;
      this.player.step(dt, { forward: f, strafe: r, sprint: running, crouch: this.input.isDown('crouch') }, this.boxesNear);
    }

    // Stats
    if (this.started && this.deadTimer <= 0) {
      if (this.flashlightOn && (this.stats.battery <= 0 || !this.inventory.has('flashlight'))) this.flashlightOn = false;
      const light = this.lightAtPlayer() + (this.flashlightOn ? 0.6 : 0) + this.glowLightAtPlayer();
      const mods = this.level.statModifiers;
      const zone = this.zoneAt(this.player.x, this.player.z);
      const cause = this.stats.update(dt, {
        running: running && this.player.speed > 1,
        moving,
        light,
        flashlightOn: this.flashlightOn,
        hydrationMul: mods.hydrationMul,
        sanityDrain: mods.sanityDrain + (zone?.kind === 'manila' ? 0.25 : 0),
        staminaRegenMul: mods.staminaRegenMul,
        difficulty: s.difficulty,
      });
      if (cause) this.die(cause);
      // Zone entry messages.
      const zk = zone ? `${zone.kind}:${zone.x0},${zone.z0}` : '';
      if (zk !== this.zoneKey) {
        this.zoneKey = zk;
        if (zone) this.hud.message(t('zone.' + zone.kind), 3.5);
      }
    }

    this.chunks.update(this.player.x, this.player.z, this.player.dirX, this.player.dirZ);
    if (this.origin.update(this.player.x, this.player.z)) {
      for (const c of this.chunks.chunks.values()) this.placeChunk(c.handle.group);
    }

    // Interaction prompt
    this.target = active ? this.findTarget() : null;
    this.hud.setPrompt(this.target ? t('prompt.pickup', { name: ITEMS[this.target.id].name }) : null);
    const held = this.inventory.held;
    this.hud.setCompass(held?.id === 'compass' ? this.spinCompass() : null);

    // Footsteps every half bob cycle.
    const stepIdx = Math.floor(this.player.bobPhase / Math.PI);
    if (stepIdx !== this.lastStep) {
      this.lastStep = stepIdx;
      if (this.player.speed > 0.5) this.audio.footstep(this.player.speed > 4 ? 1.3 : this.player.speed < 2 ? 0.45 : 0.8);
    }

    // Flickering tubes: bounded rate and depth (photosensitivity, SPEC §9.3).
    const slot = Math.floor(this.time * 7);
    const fl = (Math.sin(slot * 12.9898) * 43758.5453) % 1;
    this.mats.lightFlicker.color.setHex(this.level.palette.lightColor).multiplyScalar(Math.abs(fl) > 0.3 ? 1 : 0.4);

    // Camera (nausea / dehydration sway).
    const sway =
      (this.stats.nausea > 0 ? 0.03 : 0) + (this.stats.hydration <= 0 ? 0.025 : 0) + (this.stats.sanity < 20 ? 0.01 : 0);
    const bob = Math.sin(this.player.bobPhase) * 0.035 * s.headBob;
    this.camera.position.set(
      this.origin.toRenderX(this.player.x),
      this.player.y + this.player.eye + bob,
      this.origin.toRenderZ(this.player.z),
    );
    this.camera.rotation.set(
      this.player.pitch + Math.sin(this.time * 1.3) * sway,
      this.player.yaw + Math.sin(this.time * 0.9) * sway,
      Math.sin(this.time * 0.7) * sway,
    );

    this.updateDynamicLights(dt);

    // Hallucinations
    if (this.started && this.deadTimer <= 0) {
      this.halluc.update(dt, {
        sanity: this.stats.sanity,
        rate: this.level.hallucination,
        x: this.player.x,
        y: this.player.y,
        z: this.player.z,
        yaw: this.player.yaw,
        rayWall: this.rayWall,
        toRender: (x, z) => [this.origin.toRenderX(x), this.origin.toRenderZ(z)],
      });
    }

    this.hud.update(dt, this.stats, this.flashlightOn);
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
        light: this.lightAtPlayer().toFixed(2),
        zone: this.zoneAt(this.player.x, this.player.z)?.kind ?? '-',
        draws: this.renderer.info.render.calls,
        geos: this.renderer.info.memory.geometries,
      });
    }
    this.input.endFrame();
  }

  private compassAngle = 0;
  private spinCompass(): string {
    // Level 0: the needle never settles (SPEC §8.1).
    this.compassAngle += (Math.sin(this.time * 0.8) + Math.sin(this.time * 2.9)) * 0.08;
    const dirs = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
    const i = ((Math.round(this.compassAngle / (Math.PI / 4)) % 8) + 8) % 8;
    return '◇ ' + dirs[i] + ' ◇';
  }

  private glowLightAtPlayer(): number {
    let sum = 0;
    for (const g of this.glowsticks) {
      const d = Math.hypot(g.x - this.player.x, g.z - this.player.z);
      sum += Math.max(0, 1 - d / 6) * 0.5;
    }
    return sum;
  }

  private updateDynamicLights(dt: number): void {
    const u = dynamicLights;
    u.uFlashOn.value = this.flashlightOn ? Math.min(1, 0.4 + this.stats.battery / 25) : 0;
    u.uFlashPos.value.copy(this.camera.position);
    this.camera.getWorldDirection(u.uFlashDir.value);
    for (let i = this.glowsticks.length - 1; i >= 0; i--) {
      this.glowsticks[i].ttl -= dt;
      if (this.glowsticks[i].ttl <= 0) this.removeGlowstick(i);
    }
    for (let i = 0; i < MAX_POINT_LIGHTS; i++) {
      const g = this.glowsticks[i];
      if (g) {
        const rx = this.origin.toRenderX(g.x);
        const rz = this.origin.toRenderZ(g.z);
        g.mesh.position.set(rx, g.y, rz);
        u.uPointPos.value[i].set(rx, 0.3, rz);
        const fade = Math.min(1, g.ttl / 30);
        u.uPointColor.value[i].setRGB(0.35 * fade, 0.9 * fade, 0.3 * fade);
        u.uPointRange.value[i] = 7;
      } else u.uPointColor.value[i].setRGB(0, 0, 0);
    }
  }
}
