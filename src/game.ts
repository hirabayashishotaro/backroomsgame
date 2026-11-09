/** Game: wires renderer, world streaming, player, items, level transitions, audio and UI. */
import * as THREE from 'three';
import { Input } from './core/input';
import { loadSettings, saveSettings, type Action, type Settings } from './core/settings';
import { getNative } from './core/storage';
import { hashString, Rng } from './core/rng';
import { entryHash, makeGenContext, parseWorldSeed, resolveExitTarget, resolveLevel } from './levels/registry';
import type { ExitRule, GenContext, LevelDefinition, LightSampler, SpawnPoint } from './levels/levelDefinition';
import { ChunkManager } from './world/chunkManager';
import { buildChunkMesh, disposeChunkMesh, LevelMaterials } from './world/chunkMesher';
import { FloatingOrigin } from './world/floatingOrigin';
import { rayBox, toWorldBox, type WBox } from './world/collision';
import { chunkKey, type ChunkData, type PropKind, type ZoneKind } from './world/chunkData';
import { WorldDeltas } from './world/deltas';
import { buildItemMesh, buildPropMesh, buildReturnAnchor, disposeObject } from './world/objectMeshes';
import { PlayerController } from './player/controller';
import { Inventory } from './player/inventory';
import { Stats, type DeathCause } from './player/stats';
import { ITEMS, type ItemId } from './items/itemDefs';
import { AudioSystem } from './systems/audio';
import { Hallucinations } from './systems/hallucination';
import { DebugOverlay } from './ui/debugOverlay';
import { Hud } from './ui/hud';
import { Menu } from './ui/menu';
import { t } from './ui/i18n';

interface WorldItem {
  uid: string;
  id: ItemId;
  mesh: THREE.Object3D;
  x: number;
  y: number;
  z: number;
}

interface WorldProp {
  uid: string;
  kind: PropKind;
  x: number;
  z: number;
  rotY: number;
  key: string;
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
  props: WorldProp[];
  zones: WorldZone[];
  sampler: LightSampler;
  key: string;
}

/** A glowing doorway back to where the player came from (SPEC §5.4.4). */
interface Anchor {
  x: number;
  z: number;
  rotY: number;
  back: { levelId: string } & SpawnPoint;
  mesh?: THREE.Object3D;
}

type Target = { type: 'item'; item: WorldItem } | { type: 'prop'; prop: WorldProp } | { type: 'anchor'; anchor: Anchor };

interface Transition {
  levelId: string;
  /** Explicit arrival (returning) or computed from the entry hash. */
  at?: SpawnPoint;
  entry?: number;
  /** Where the anchor in the new level leads back to. Undefined = one-way. */
  back?: { levelId: string } & SpawnPoint;
  color: string;
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

const SLOT_ACTIONS: Action[] = ['slot1', 'slot2', 'slot3', 'slot4'];

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
  level!: LevelDefinition;
  private ctx!: GenContext;
  private mats!: LevelMaterials;
  private menu: Menu;
  private hud: Hud;
  private halluc: Hallucinations;
  private debug: DebugOverlay | null = null;
  private worldSeed: number;
  private rng: Rng;
  private started = false;
  private titleShown = false;
  private target: Target | null = null;
  private anchors: Record<string, Anchor[]> = {};
  /** Where the player entered the current level (respawn point). */
  private entryPoint!: SpawnPoint;
  private transition: Transition | null = null;
  private zoneKey = '';
  private zoneTime = 0;
  private pushTime = 0;
  private walkWarned = false;
  private lastWarp = 0;
  private deadTimer = 0;
  private lastStep = 0;
  private time = 0;
  private last = performance.now();
  readonly history: string[] = [];

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
      if (this.deadTimer > 0) return;
      this.menu.show(this.started);
    });
    window.addEventListener('resize', () => this.onResize());

    // Start with one bottle.
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
    if (!this.titleShown) this.showLevelTitle();
  }

  private showLevelTitle(): void {
    this.titleShown = true;
    this.hud.showTitle(this.level.title, this.level.subtitle ?? this.level.name, this.level.threatClass);
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

  /** Load a level and place the player (default spawn, or `at`). */
  enterLevel(id: string, at?: SpawnPoint): void {
    if (this.chunks) this.chunks.clear();
    this.mats?.dispose();
    this.halluc.clear();
    for (const a of Object.values(this.anchors).flat()) if (a.mesh) disposeObject(a.mesh), (a.mesh = undefined);
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

    const s = at ?? this.level.spawn;
    this.player.x = s.x;
    this.player.y = s.y;
    this.player.z = s.z;
    this.player.vy = 0;
    this.player.distanceWalked = 0;
    this.origin.update(s.x, s.z);
    this.chunks.loadAllSync(s.x, s.z, 1);
    this.player.yaw = at ? s.yaw : this.pickOpenYaw(s.yaw);
    this.entryPoint = { x: this.player.x, y: this.player.y, z: this.player.z, yaw: this.player.yaw };
    this.zoneKey = '';
    this.zoneTime = 0;
    this.pushTime = 0;
    this.walkWarned = false;
    for (const a of this.anchors[this.level.id] ?? []) this.showAnchor(a);
    if (this.history[this.history.length - 1] !== this.level.id) this.history.push(this.level.id);
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
    for (const it of data.items) {
      if (delta?.taken.includes(it.uid)) continue;
      const mesh = buildItemMesh(it.id, sampler(it.x + ox, 0.3, it.z + oz, 0, 1, 0));
      mesh.position.set(it.x, it.y, it.z);
      mesh.rotation.y = it.rot;
      group.add(mesh);
      items.set(it.uid, { uid: it.uid, id: it.id, mesh, x: it.x + ox, y: it.y, z: it.z + oz });
    }
    const props: WorldProp[] = [];
    for (const p of data.props) {
      group.add(buildPropMesh(p, sampler(p.x + ox, 1.5, p.z + oz, 0, 1, 0)));
      props.push({ uid: p.uid, kind: p.kind, x: p.x + ox, z: p.z + oz, rotY: p.rotY, key });
    }
    this.placeChunk(group);
    this.worldRoot.add(group);
    return {
      group,
      boxes: data.solids.map((b) => Object.assign(toWorldBox(b, ox, oz), { thin: b.thin })),
      items,
      props,
      zones: data.zones.map((z) => ({ kind: z.kind, x0: z.x0 + ox, z0: z.z0 + oz, x1: z.x1 + ox, z1: z.z1 + oz })),
      sampler,
      key,
    };
  }

  /** Face the most open of the four cardinal directions. */
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

  private boxesNear = (x: number, z: number, r = 1): Array<WBox & { thin?: boolean }> => {
    const S = this.level.chunkSize;
    const out: Array<WBox & { thin?: boolean }> = [];
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

  /** Horizontal ray against walls at chest height. */
  private rayWall = (x: number, z: number, dx: number, dz: number, max: number) => {
    let best: { t: number; nx: number; nz: number; box: WBox & { thin?: boolean } } | null = null;
    for (const b of this.boxesNear(x + (dx * max) / 2, z + (dz * max) / 2, max / 2 + 1)) {
      const h = rayBox(x, 1.2, z, dx, 0, dz, b, max);
      if (h && (!best || h.t < best.t)) best = { t: h.t, nx: h.nx, nz: h.nz, box: b };
    }
    return best;
  };

  /** Full 3D ray against walls and the floor. */
  private ray3(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number) {
    let best: { t: number } | null = null;
    for (const b of this.boxesNear(ox + (dx * max) / 2, oz + (dz * max) / 2, max / 2 + 1)) {
      const h = rayBox(ox, oy, oz, dx, dy, dz, b, max);
      if (h && (!best || h.t < best.t)) best = h;
    }
    return best;
  }

  private zoneAt(x: number, z: number): WorldZone | null {
    const c = this.chunkAt(x, z);
    if (!c) return null;
    for (const zn of c.zones) if (x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1) return zn;
    return null;
  }

  private eyeDir(): [number, number, number] {
    const cp = Math.cos(this.player.pitch);
    return [-Math.sin(this.player.yaw) * cp, Math.sin(this.player.pitch), -Math.cos(this.player.yaw) * cp];
  }

  /** Is the point within reach and roughly under the crosshair? Returns a score or -Infinity. */
  private aimScore(x: number, y: number, z: number, reach: number, cone: number): number {
    const ex = this.player.x;
    const ey = this.player.y + this.player.eye;
    const ez = this.player.z;
    const [dx, dy, dz] = this.eyeDir();
    const vx = x - ex;
    const vy = y - ey;
    const vz = z - ez;
    const d = Math.hypot(vx, vy, vz);
    if (d > reach || d < 1e-3) return -Infinity;
    const dot = (vx * dx + vy * dy + vz * dz) / d;
    if (dot < (d < 1.3 ? cone - 0.07 : cone)) return -Infinity;
    const wall = this.ray3(ex, ey, ez, vx / d, vy / d, vz / d, d);
    if (wall && wall.t < d - 0.2) return -Infinity;
    return dot * 2 - d * 0.2;
  }

  private findTarget(): Target | null {
    let best: Target | null = null;
    let bestScore = -Infinity;
    const S = this.level.chunkSize;
    const px = this.player.x;
    const pz = this.player.z;
    for (let cx = Math.floor((px - 3) / S); cx <= Math.floor((px + 3) / S); cx++)
      for (let cz = Math.floor((pz - 3) / S); cz <= Math.floor((pz + 3) / S); cz++) {
        const c = this.chunks.get(cx, cz);
        if (!c) continue;
        for (const it of c.handle.items.values()) {
          const sc = this.aimScore(it.x, it.y + 0.12, it.z, 2.4, 0.95);
          if (sc > bestScore) (bestScore = sc), (best = { type: 'item', item: it });
        }
        for (const p of c.handle.props) {
          // Aim at the door's centre, slightly in front of the wall.
          const fx = Math.sin(p.rotY) * 0.15;
          const fz = Math.cos(p.rotY) * 0.15;
          const sc = this.aimScore(p.x + fx, 1.1, p.z + fz, 2.6, 0.82);
          if (sc > bestScore) (bestScore = sc), (best = { type: 'prop', prop: p });
        }
      }
    for (const a of this.anchors[this.level.id] ?? []) {
      const sc = this.aimScore(a.x, 1.1, a.z, 2.8, 0.8);
      if (sc > bestScore) (bestScore = sc), (best = { type: 'anchor', anchor: a });
    }
    return best;
  }

  // ---------------------------------------------------------------------------
  // Items
  // ---------------------------------------------------------------------------

  private pickUp(it: WorldItem): void {
    if (!this.inventory.add(it.id)) {
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

  private useHeld(): void {
    const id = this.inventory.held;
    if (!id) {
      this.hud.message(t('msg.nothingHeld'));
      return;
    }
    if (this.stats.health >= 99) {
      this.hud.message(t('msg.fullHealth'));
      return;
    }
    this.inventory.take(this.inventory.selected);
    this.stats.heal(ITEMS[id].heal);
    this.audio.drink();
    this.hud.message(t('msg.drink', { name: ITEMS[id].name }));
  }

  // ---------------------------------------------------------------------------
  // Exits & transitions (SPEC §5)
  // ---------------------------------------------------------------------------

  private findExit(kind: ExitRule['kind'], filter?: (r: ExitRule) => boolean): ExitRule | undefined {
    return this.level.exits.find((r) => r.kind === kind && (!filter || filter(r)));
  }

  /** Leave through an exit. `back` is where the return anchor in the new level leads. */
  private takeExit(rule: ExitRule, exitKey: string, back: SpawnPoint, color = '#000'): void {
    const levelId = resolveExitTarget(this.worldSeed, this.level.id, rule, exitKey);
    this.startTransition({
      levelId,
      entry: entryHash(this.level.id, rule.kind + ':' + exitKey),
      back: { levelId: this.level.id, ...back },
      color,
    });
  }

  private startTransition(tr: Transition): void {
    if (this.transition) return;
    this.transition = tr;
    this.hud.fadeTo(1, 1.6, tr.color);
    this.audio.whoosh();
  }

  private finishTransition(): void {
    const tr = this.transition!;
    const next = resolveLevel(tr.levelId);
    const ctx = makeGenContext(this.worldSeed, next);
    const at = tr.at ?? next.arrival(ctx, tr.entry ?? 0);
    this.enterLevel(tr.levelId, at);
    if (!tr.at) this.player.yaw = this.pickOpenYaw(at.yaw);
    this.entryPoint = { x: this.player.x, y: this.player.y, z: this.player.z, yaw: this.player.yaw };
    if (tr.back) this.placeAnchor(tr.back);
    this.transition = null;
    this.lastWarp = 0;
    this.hud.fadeTo(0, 0.7, tr.color);
    this.showLevelTitle();
    if (tr.back) setTimeout(() => this.hud.message(t('msg.returnHere'), 4), 4500);
  }

  /** Place a return anchor behind the arrival point, against a wall if one is close. */
  private placeAnchor(back: { levelId: string } & SpawnPoint): void {
    const yaw = this.player.yaw;
    const bx = Math.sin(yaw); // backwards = -forward
    const bz = Math.cos(yaw);
    const hit = this.rayWall(this.player.x, this.player.z, bx, bz, 1.8);
    const d = hit ? Math.max(0.6, hit.t - 0.12) : 1.8;
    const a: Anchor = { x: this.player.x + bx * d, z: this.player.z + bz * d, rotY: yaw, back };
    (this.anchors[this.level.id] ??= []).push(a);
    this.showAnchor(a);
  }

  private showAnchor(a: Anchor): void {
    if (a.mesh) disposeObject(a.mesh);
    a.mesh = buildReturnAnchor();
    a.mesh.rotation.y = a.rotY;
    this.fxRoot.add(a.mesh);
  }

  private useAnchor(a: Anchor): void {
    this.audio.door();
    this.startTransition({ levelId: a.back.levelId, at: { ...a.back }, color: '#000' });
  }

  private openProp(p: WorldProp): void {
    const rule = this.findExit('door', (r) => r.prop === p.kind);
    if (!rule) return;
    this.audio.door();
    // Come back out standing in front of the door, facing away from it.
    const fx = Math.sin(p.rotY);
    const fz = Math.cos(p.rotY);
    const back: SpawnPoint = { x: p.x + fx * 1.0, y: 0, z: p.z + fz * 1.0, yaw: p.rotY };
    this.takeExit(rule, `${p.key}:${p.uid}`, back, p.kind === 'white-door' || p.kind === 'glass-door' ? '#fff' : '#000');
  }

  private updateExits(dt: number, moving: boolean, forward: number): void {
    if (this.transition) return;
    const here: SpawnPoint = { x: this.player.x, y: this.player.y, z: this.player.z, yaw: this.player.yaw + Math.PI };

    // walk: very long walks drift into the next level.
    const walk = this.findExit('walk');
    if (walk?.distance) {
      if (!this.walkWarned && this.player.distanceWalked > walk.distance * 0.85) {
        this.walkWarned = true;
        this.hud.message(t('msg.walkFar'), 4);
      }
      if (this.player.distanceWalked > walk.distance) {
        const key = `${Math.floor(this.player.x / 64)},${Math.floor(this.player.z / 64)}`;
        this.takeExit(walk, key, here);
        return;
      }
    }

    // special: staying in a zone (manila room).
    const zone = this.zoneAt(this.player.x, this.player.z);
    const zk = zone ? `${zone.kind}:${zone.x0},${zone.z0}` : '';
    if (zk !== this.zoneKey) {
      this.zoneKey = zk;
      this.zoneTime = 0;
      if (zone?.kind === 'manila') this.hud.message(t('zone.manila'), 4);
    }
    if (zone) {
      this.zoneTime += dt;
      const rule = this.findExit('special', (r) => r.zone === zone.kind);
      if (rule && this.zoneTime > (rule.seconds ?? 10)) {
        // Leaving the manila room is one-way back into the maze outside it.
        this.takeExit(rule, zk, this.entryPoint);
        return;
      }
    }

    // wall: push into a thin wall to noclip through it.
    const wall = this.findExit('wall');
    let pushing = false;
    if (wall && moving && forward > 0) {
      const hit = this.rayWall(this.player.x, this.player.z, this.player.dirX, this.player.dirZ, 0.55);
      if (hit && hit.box.thin) {
        pushing = true;
        this.pushTime += dt;
        if (this.pushTime > 0.6 && this.pushTime - dt <= 0.6) this.hud.message(t('msg.noclip'), 2);
        if (this.pushTime > (wall.push ?? 2.5)) {
          const b = hit.box;
          const key = `${Math.round(b.minX * 2)},${Math.round(b.minZ * 2)}`;
          this.takeExit(wall, key, here, '#fff');
        }
      }
    }
    if (!pushing) this.pushTime = Math.max(0, this.pushTime - dt * 2);
  }

  // ---------------------------------------------------------------------------
  // Death
  // ---------------------------------------------------------------------------

  private die(cause: DeathCause): void {
    if (this.deadTimer > 0) return;
    this.deadTimer = 3.5;
    this.inventory.loseHalf((n) => this.rng.int(0, n - 1));
    this.hud.showDeath(t('death.title'), t('death.' + cause));
    this.audio.humDip(3);
  }

  private respawn(): void {
    const s = this.entryPoint;
    this.player.x = s.x;
    this.player.y = s.y;
    this.player.z = s.z;
    this.player.vy = 0;
    this.player.yaw = s.yaw;
    this.stats.respawn();
    this.halluc.clear();
    this.chunks.loadAllSync(s.x, s.z, 1);
    this.hud.hideDeath();
  }

  // ---------------------------------------------------------------------------
  // Frame
  // ---------------------------------------------------------------------------

  private handleActions(): void {
    const inp = this.input;
    if (!this.input.locked || this.transition) return;
    SLOT_ACTIONS.forEach((a, i) => {
      if (inp.wasPressed(a)) this.inventory.select(i);
    });
    if (inp.wheel) this.inventory.select(this.inventory.selected + inp.wheel);
    if (inp.wasPressed('interact') && this.target) {
      const tg = this.target;
      if (tg.type === 'item') this.pickUp(tg.item);
      else if (tg.type === 'prop') this.openProp(tg.prop);
      else this.useAnchor(tg.anchor);
    }
    if (inp.wasPressed('use')) this.useHeld();
  }

  private frame(): void {
    const now = performance.now();
    const realDt = Math.min(0.5, (now - this.last) / 1000);
    const dt = Math.min(0.05, realDt);
    this.last = now;
    this.time += dt;
    const s = this.settings;
    const active = this.input.locked && this.deadTimer <= 0 && !this.transition;

    if (this.deadTimer > 0) {
      this.deadTimer -= realDt;
      if (this.deadTimer <= 0) this.respawn();
    }
    if (this.transition && this.hud.fadeDone) this.finishTransition();

    this.handleActions();

    let running = false;
    let moving = false;
    let forward = 0;
    if (active) {
      const k = 0.0022;
      const inv = s.invertY ? -1 : 1;
      this.player.look(this.input.mouseDX * k * s.sensitivityX, this.input.mouseDY * k * s.sensitivityY * inv);
      forward = (this.input.isDown('forward') ? 1 : 0) - (this.input.isDown('back') ? 1 : 0);
      const r = (this.input.isDown('right') ? 1 : 0) - (this.input.isDown('left') ? 1 : 0);
      moving = forward !== 0 || r !== 0;
      running = this.input.isDown('sprint') && this.stats.canRun && forward > 0;
      this.player.step(dt, { forward, strafe: r, sprint: running, crouch: this.input.isDown('crouch') }, this.boxesNear);
    }

    if (this.started && this.deadTimer <= 0 && !this.transition) {
      const cause = this.stats.update(dt, {
        running: running && this.player.speed > 1,
        drainMul: this.level.drainMul,
        difficulty: s.difficulty,
      });
      if (cause) this.die(cause);
      this.updateExits(realDt, moving, forward);
    }

    this.chunks.update(this.player.x, this.player.z, this.player.dirX, this.player.dirZ);
    if (this.origin.update(this.player.x, this.player.z)) {
      for (const c of this.chunks.chunks.values()) this.placeChunk(c.handle.group);
    }
    for (const a of this.anchors[this.level.id] ?? []) {
      if (!a.mesh) continue;
      a.mesh.position.set(this.origin.toRenderX(a.x), 0, this.origin.toRenderZ(a.z));
      const glow = a.mesh.children[3] as THREE.Mesh;
      (glow.material as THREE.MeshBasicMaterial).opacity = 0.45 + Math.sin(this.time * 2) * 0.12;
    }

    // Interaction prompt
    this.target = active ? this.findTarget() : null;
    const tg = this.target;
    this.hud.setPrompt(
      !tg
        ? null
        : tg.type === 'item'
          ? t('prompt.pickup', { name: ITEMS[tg.item.id].name })
          : tg.type === 'anchor'
            ? t('prompt.return')
            : tg.prop.kind === 'glass-door'
              ? t('prompt.glass')
              : t('prompt.door'),
    );

    // Footsteps every half bob cycle.
    const stepIdx = Math.floor(this.player.bobPhase / Math.PI);
    if (stepIdx !== this.lastStep) {
      this.lastStep = stepIdx;
      if (this.player.speed > 0.5)
        this.audio.footstep(this.player.speed > 4 ? 1.3 : this.player.speed < 2 ? 0.45 : 0.8, this.level.footstep);
    }

    // Flickering tubes: bounded rate and depth (photosensitivity, SPEC §9.3).
    const slot = Math.floor(this.time * 7);
    const fl = (Math.sin(slot * 12.9898) * 43758.5453) % 1;
    this.mats.lightFlicker.color.setHex(this.level.palette.lightColor).multiplyScalar(Math.abs(fl) > 0.3 ? 1 : 0.4);

    // Camera: low health sways the view; pushing a thin wall warps it.
    const sway = this.stats.health < 20 ? (20 - this.stats.health) * 0.0015 : 0;
    const warp = Math.min(1, this.pushTime / 2.5);
    const bob = Math.sin(this.player.bobPhase) * 0.035 * s.headBob;
    this.camera.position.set(
      this.origin.toRenderX(this.player.x),
      this.player.y + this.player.eye + bob,
      this.origin.toRenderZ(this.player.z),
    );
    this.camera.rotation.set(
      this.player.pitch + Math.sin(this.time * 1.3) * sway,
      this.player.yaw + Math.sin(this.time * 0.9) * sway,
      Math.sin(this.time * 0.7) * sway + Math.sin(this.time * 9) * warp * 0.03,
    );
    const fov = s.fov + warp * 18;
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    if (!this.transition && (warp > 0.001 || this.lastWarp > 0.001)) this.hud.fadeTo(warp * 0.45, 4, '#fff');
    this.lastWarp = warp;

    // Hallucinations grow as health drops (SPEC §17).
    if (this.started && this.deadTimer <= 0 && !this.transition) {
      this.halluc.update(dt, {
        sanity: Math.min(100, this.stats.health + 15),
        rate: this.level.hallucination,
        x: this.player.x,
        y: this.player.y,
        z: this.player.z,
        yaw: this.player.yaw,
        rayWall: this.rayWall,
        toRender: (x, z) => [this.origin.toRenderX(x), this.origin.toRenderZ(z)],
      });
    }

    this.hud.update(realDt, this.stats);
    this.renderer.render(this.scene, this.camera);

    if (this.debug) {
      const S = this.level.chunkSize;
      this.debug.update(dt, {
        level: `${this.level.id} (${this.level.subtitle ?? this.level.name})`,
        seed: this.worldSeed,
        pos: `${this.player.x.toFixed(1)}, ${this.player.y.toFixed(1)}, ${this.player.z.toFixed(1)}`,
        chunk: `${Math.floor(this.player.x / S)}, ${Math.floor(this.player.z / S)}`,
        chunks: `${this.chunks.chunks.size} / max ${this.chunks.maxChunks} (queue ${this.chunks.pending})`,
        walked: `${this.player.distanceWalked.toFixed(0)} m`,
        zone: this.zoneAt(this.player.x, this.player.z)?.kind ?? '-',
        history: this.history.slice(-6).join(' → '),
        draws: this.renderer.info.render.calls,
        geos: this.renderer.info.memory.geometries,
      });
    }
    this.input.endFrame();
  }
}
