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
import { rayBox, toWorldBox, type FloorRect, type WBox } from './world/collision';
import { chunkKey, type ChunkData, type PropKind, type ZoneKind } from './world/chunkData';
import { WorldDeltas } from './world/deltas';
import { buildItemMesh, buildPropMesh, buildReturnAnchor, disposeObject } from './world/objectMeshes';
import { PlayerController } from './player/controller';
import { Inventory } from './player/inventory';
import { Stats, type DeathCause } from './player/stats';
import { ITEMS, type ItemId } from './items/itemDefs';
import { AudioSystem } from './systems/audio';
import { Hallucinations } from './systems/hallucination';
import { SkyDome } from './systems/sky';
import { Journal } from './systems/journal';
import { JournalScreen } from './ui/journalScreen';
import { DebugOverlay } from './ui/debugOverlay';
import { Hud } from './ui/hud';
import { Screens } from './ui/screens';
import { SettingsScreen } from './ui/settingsScreen';
import { PostFX } from './systems/postfx';
import { readSlot, writeSlot, SAVE_VERSION, type SaveData } from './core/save';
import { LevelSelect } from './ui/levelSelect';
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
  y: number;
  z: number;
  rotY: number;
  key: string;
}

interface WorldZone {
  kind: ZoneKind;
  name?: string;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

interface ChunkHandle {
  group: THREE.Group;
  boxes: WBox[];
  floors: FloorRect[];
  items: Map<string, WorldItem>;
  props: WorldProp[];
  zones: WorldZone[];
  sampler: LightSampler;
  key: string;
}

/** A glowing doorway back to where the player came from (SPEC §5.4.4). */
interface Anchor {
  x: number;
  y: number;
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
  readonly journal = new Journal();
  private journalScreen!: JournalScreen;
  private origin = new FloatingOrigin(32);
  private chunks!: ChunkManager<ChunkHandle>;
  level!: LevelDefinition;
  private ctx!: GenContext;
  private mats!: LevelMaterials;
  private screens: Screens;
  private settingsScreen: SettingsScreen;
  private levelSelect: LevelSelect;
  private post = new PostFX();
  /** Save slot of the current run (null = not saving, e.g. developer jump from the title). */
  private slot: number | null = null;
  private playTime = 0;
  private autosaveTimer = 0;
  private paused = false;
  private journalOpen = false;
  private sprintLatched = false;
  private crouchLatched = false;
  private lastFrameAt = 0;
  private launchLevel: string;
  private hud: Hud;
  private halluc: Hallucinations;
  private sky = new SkyDome();
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
  private sinkTime = 0;
  private gateTime = 0;
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
    this.halluc.onSound = (k) => {
      if (this.settings.subtitles) this.hud.subtitle(t('sub.' + k));
    };
    if (opts.debug) {
      this.debug = new DebugOverlay(container);
      (window as unknown as { __game: Game }).__game = this; // debug/test hook
    }

    this.levelSelect = new LevelSelect(container, (id) => this.devJump(id));
    this.journalScreen = new JournalScreen(container, this.journal);
    this.settingsScreen = new SettingsScreen(container, this.settings, this.input, (st) => this.applySettings(st));
    this.screens = new Screens(container, {
      onNewGame: (slot) => this.newGame(slot),
      onLoad: (slot) => this.loadGame(slot),
      onResume: () => this.resume(),
      onToTitle: () => this.toTitle(),
      onSettings: () => this.settingsScreen.show(() => this.screens.refresh()),
      onLevelSelect: () => this.levelSelect.show(),
      onJournal: () => this.journalScreen.show(() => {}),
      onQuit: () => {
        this.saveNow();
        getNative()?.quit?.();
      },
    });

    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === this.renderer.domElement) return;
      if (this.deadTimer > 0 || !this.started || this.paused || this.journalOpen) return;
      this.pause();
    });
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('beforeunload', () => this.saveNow());

    // The title screen shows Level 0 in the background.
    this.launchLevel = opts.levelId;
    this.enterLevel(opts.levelId);
    this.applySettings(this.settings, false);
    this.screens.show('title');
    this.paused = true;
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------------------------------------------------------------------------
  // Runs, saving and loading (SPEC §10.5)
  // ---------------------------------------------------------------------------

  /** Reset everything that belongs to a run. */
  private resetRun(seed: number): void {
    this.worldSeed = seed;
    this.rng = new Rng(seed ^ 0x5eed);
    this.inventory.load({ slots: [], selected: 0 });
    this.inventory.add('almond_water');
    this.stats.load({ health: 100, stamina: 100 });
    this.deltas.load({});
    for (const a of Object.values(this.anchors).flat()) if (a.mesh) disposeObject(a.mesh);
    this.anchors = {};
    this.history.length = 0;
    this.journal.load(null);
    this.playTime = 0;
    this.autosaveTimer = 0;
  }

  private newGame(slot: number): void {
    const seedStr = this.settings.worldSeed.trim();
    this.resetRun(seedStr ? parseWorldSeed(seedStr) : hashString(String(Date.now())));
    this.slot = slot;
    this.enterLevel(this.launchLevel);
    this.titleShown = false;
    this.start();
    this.saveNow();
  }

  private loadGame(slot: number): void {
    const d = readSlot(slot);
    if (!d) return;
    this.resetRun(d.worldSeed);
    this.slot = slot;
    this.inventory.load(d.inventory);
    this.stats.load(d.stats);
    this.deltas.load(d.deltas);
    this.playTime = d.playTime;
    this.history.push(...d.history);
    this.journal.load(d.journal);
    for (const [lid, list] of Object.entries(d.anchors)) this.anchors[lid] = list.map((a) => ({ ...a, back: { ...a.back } }));
    this.enterLevel(d.levelId, d.player);
    this.player.pitch = d.player.pitch;
    this.entryPoint = { ...d.entry };
    this.titleShown = false;
    this.start();
  }

  /** Snapshot of the current run. */
  snapshot(): SaveData {
    const anchors: SaveData['anchors'] = {};
    for (const [lid, list] of Object.entries(this.anchors))
      anchors[lid] = list.map((a) => ({ x: a.x, y: a.y, z: a.z, rotY: a.rotY, back: { ...a.back } }));
    return {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      playTime: Math.round(this.playTime),
      worldSeed: this.worldSeed,
      levelId: this.level.id,
      levelTitle: this.level.title,
      levelName: this.level.subtitle ?? this.level.name,
      player: { x: this.player.x, y: this.player.y, z: this.player.z, yaw: this.player.yaw, pitch: this.player.pitch },
      entry: { ...this.entryPoint },
      stats: this.stats.toJSON(),
      inventory: this.inventory.toJSON(),
      deltas: this.deltas.toJSON(),
      anchors,
      history: this.history.slice(-50),
      journal: this.journal.toJSON(),
    };
  }

  /** Write the current run to its slot (autosave). */
  saveNow(showMessage = false): void {
    if (this.slot === null || !this.started || this.deadTimer > 0 || this.transition) return;
    writeSlot(this.slot, this.snapshot());
    this.autosaveTimer = 0;
    if (showMessage) this.hud.message(t('menu.saved'), 1.5);
    this.screens.refresh();
  }

  private start(): void {
    this.started = true;
    this.paused = false;
    this.screens.hide();
    this.audio.start();
    this.audio.applySettings(this.settings);
    this.audio.setAmbience(this.level.ambience);
    this.input.requestLock();
    if (!this.titleShown) this.showLevelTitle();
    this.recordVisit();
  }

  /** Journal: note arriving in the current level, and celebrate milestones (SPEC §12). */
  private recordVisit(): void {
    const L = this.level;
    const isNew = this.journal.visit({ id: L.id, title: L.title, name: L.subtitle ?? L.name, threat: L.threatClass, kind: L.kindLabel ?? '' });
    if (!isNew) return;
    const m = this.journal.milestone();
    if (m) setTimeout(() => this.hud.showBanner(t('journal.milestone', { n: m }), t('journal.milestoneSub')), 6500);
  }

  private openJournal(): void {
    if (document.pointerLockElement) document.exitPointerLock();
    this.journalOpen = true;
    this.journalScreen.show(() => {
      this.journalOpen = false;
      if (this.started && !this.paused) this.input.requestLock();
    });
  }

  private pause(): void {
    this.paused = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this.saveNow();
    this.screens.show('pause');
  }

  private toTitle(): void {
    this.saveNow();
    this.started = false;
    this.paused = true;
    this.screens.show('title');
  }

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------

  private resume(): void {
    this.start();
  }

  /** Developer level select: start (or jump) directly into a level. */
  private devJump(id: string): void {
    if (!this.started && this.slot === null) this.resetRun(this.worldSeed);
    this.enterLevel(id, resolveLevel(id).arrival(makeGenContext(this.worldSeed, resolveLevel(id)), 1));
    this.player.yaw = this.pickOpenYaw(this.player.yaw);
    this.entryPoint = { x: this.player.x, y: this.player.y, z: this.player.z, yaw: this.player.yaw };
    this.titleShown = false;
    this.start();
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

  private appliedDisplay = '';
  private applySettings(s: Settings, persist = true): void {
    if (persist) saveSettings(s);
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    if (this.chunks && this.chunks.radius !== s.renderDistance) this.chunks.radius = s.renderDistance;
    this.audio.applySettings(s);
    this.hud.setVisible(s.showHud);
    this.hud.setScale(s.hudScale);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5) * s.resolutionScale);
    this.post.configure({ ...s, multisample: s.quality !== 'low' });
    if (s.displayMode !== this.appliedDisplay) {
      // Leaving fullscreen is always allowed; entering needs a user gesture (settings change or start).
      if (this.appliedDisplay || s.displayMode !== 'window') this.setFullscreen(s.displayMode !== 'window');
      this.appliedDisplay = s.displayMode;
    }
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
    if (this.level.sky) {
      this.sky.set(this.level.sky);
      this.scene.add(this.sky.mesh);
    } else this.sky.mesh.removeFromParent();

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
    this.sinkTime = 0;
    this.player.grounded = true;
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
      props.push({ uid: p.uid, kind: p.kind, x: p.x + ox, y: p.y, z: p.z + oz, rotY: p.rotY, key });
    }
    this.placeChunk(group);
    this.worldRoot.add(group);
    return {
      group,
      boxes: data.solids.map((b) => Object.assign(toWorldBox(b, ox, oz), { thin: b.thin })),
      floors: data.floors.map((f) => ({ x0: f.x0 + ox, z0: f.z0 + oz, x1: f.x1 + ox, z1: f.z1 + oz, y: f.y })),
      items,
      props,
      zones: data.zones.map((z) => ({ kind: z.kind, name: z.name, x0: z.x0 + ox, z0: z.z0 + oz, x1: z.x1 + ox, z1: z.z1 + oz })),
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

  private floorsNear = (x: number, z: number): FloorRect[] => {
    const c = this.chunkAt(x, z);
    return c ? c.floors : [];
  };

  private world = { boxes: (x: number, z: number) => this.boxesNear(x, z), floors: (x: number, z: number) => this.floorsNear(x, z) };

  /** Horizontal ray against walls at chest height. */
  private rayWall = (x: number, z: number, dx: number, dz: number, max: number) => {
    let best: { t: number; nx: number; nz: number; box: WBox & { thin?: boolean } } | null = null;
    for (const b of this.boxesNear(x + (dx * max) / 2, z + (dz * max) / 2, max / 2 + 1)) {
      const h = rayBox(x, this.player.y + 1.2, z, dx, 0, dz, b, max);
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

  private zoneAt(x: number, z: number, kind?: ZoneKind): WorldZone | null {
    const c = this.chunkAt(x, z);
    if (!c) return null;
    for (const zn of c.zones)
      if ((!kind || zn.kind === kind) && x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1) return zn;
    return null;
  }

  /** Zones other than floor traps (rooms and set pieces). */
  private roomZoneAt(x: number, z: number): WorldZone | null {
    const c = this.chunkAt(x, z);
    if (!c) return null;
    for (const zn of c.zones)
      if (zn.kind !== 'thin-floor' && zn.kind !== 'gate' && x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1) return zn;
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
          const sc = this.aimScore(p.x + fx, p.y + 1.1, p.z + fz, 2.6, 0.82);
          if (sc > bestScore) (bestScore = sc), (best = { type: 'prop', prop: p });
        }
      }
    for (const a of this.anchors[this.level.id] ?? []) {
      const sc = this.aimScore(a.x, a.y + 1.1, a.z, 2.8, 0.8);
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
    this.journal.travel(this.level.id, levelId, rule.kind, rule.discovery);
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
    this.recordVisit();
    if (tr.back) setTimeout(() => this.hud.message(t('msg.returnHere'), 4), 4500);
    // Always autosave on level transitions (SPEC §10.5).
    this.saveNow();
  }

  /** Place a return anchor behind the arrival point, against a wall if one is close. */
  private placeAnchor(back: { levelId: string } & SpawnPoint): void {
    const yaw = this.player.yaw;
    const bx = Math.sin(yaw); // backwards = -forward
    const bz = Math.cos(yaw);
    const hit = this.rayWall(this.player.x, this.player.z, bx, bz, 1.8);
    const d = hit ? Math.max(0.6, hit.t - 0.12) : 1.8;
    const a: Anchor = { x: this.player.x + bx * d, y: this.player.y, z: this.player.z + bz * d, rotY: yaw, back };
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
    this.journal.travel(this.level.id, a.back.levelId, 'return', t('journal.returned'));
    this.audio.door();
    this.startTransition({ levelId: a.back.levelId, at: { ...a.back }, color: '#000' });
  }

  private doorSubtitle(): void {
    if (this.settings.subtitles) this.hud.subtitle(t('sub.door'), 2);
  }

  private openProp(p: WorldProp): void {
    const rule = this.findExit('door', (r) => r.prop === p.kind);
    if (!rule) {
      this.audio.click();
      this.hud.message(t('msg.locked'));
      return;
    }
    this.audio.door();
    this.doorSubtitle();
    // Come back out standing in front of the door, facing away from it.
    const fx = Math.sin(p.rotY);
    const fz = Math.cos(p.rotY);
    const back: SpawnPoint = { x: p.x + fx * 1.0, y: p.y, z: p.z + fz * 1.0, yaw: p.rotY };
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

    // floor: a patch that gives way, or falling into a pit.
    const floorRule = this.findExit('floor');
    const trap = this.player.grounded ? this.zoneAt(this.player.x, this.player.z, 'thin-floor') : null;
    if (trap) {
      this.sinkTime += dt;
      if (this.sinkTime > 0.25 && this.sinkTime - dt <= 0.25) {
        this.hud.message(t('msg.floorGives'), 2);
        this.audio.humDip(1);
      }
      if (this.sinkTime > 1.1 && floorRule) {
        this.takeExit(floorRule, `${Math.round(trap.x0 * 2)},${Math.round(trap.z0 * 2)}`, this.entryPoint);
        return;
      }
    } else this.sinkTime = 0;
    if (this.player.y < (this.level.fall?.killY ?? -4)) {
      if (floorRule) this.takeExit(floorRule, `fall:${Math.round(this.player.x / 8)},${Math.round(this.player.z / 8)}`, this.entryPoint);
      else this.respawnAfterFall();
      return;
    }

    // special: stepping into a gate of light (waterfall, stone circle, gantry).
    const gate = this.zoneAt(this.player.x, this.player.z, 'gate');
    if (gate) {
      this.gateTime += dt;
      const rule = this.findExit('special', (r) => r.zone === 'gate');
      if (rule && this.gateTime > (rule.seconds ?? 0.4)) {
        const back: SpawnPoint = { x: this.player.x - this.player.dirX * 2.5, y: this.player.y, z: this.player.z - this.player.dirZ * 2.5, yaw: this.player.yaw + Math.PI };
        this.takeExit(rule, `${Math.round(gate.x0)},${Math.round(gate.z0)}`, back, '#fff');
        return;
      }
    } else this.gateTime = 0;

    // special: staying in a zone (manila room).
    const zone = this.roomZoneAt(this.player.x, this.player.z);
    const zk = zone ? `${zone.kind}:${zone.x0},${zone.z0}` : '';
    if (zk !== this.zoneKey) {
      this.zoneKey = zk;
      this.zoneTime = 0;
      const pid = zone ? (zone.kind === 'piece' ? zone.name : zone.kind) : undefined;
      const sp = pid ? this.level.setPieces.find((p) => p.id === pid) : undefined;
      if (sp) {
        const isNew = this.journal.seePiece(this.level.id, sp.id);
        if (zone?.kind === 'manila') this.hud.message(t('zone.manila'), 4);
        else this.hud.message(isNew ? t('journal.newPiece', { name: sp.name }) : sp.name, 3);
      }
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

  /** Fell out of the world in a level without a floor exit: back to the entry point. */
  private respawnAfterFall(): void {
    this.stats.damage(20);
    this.player.vy = 0;
    const s = this.entryPoint;
    this.player.x = s.x;
    this.player.y = s.y;
    this.player.z = s.z;
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

  private handleActions(active: boolean): void {
    const inp = this.input;
    if (inp.wasPressed('journal')) {
      if (this.journalOpen) this.journalScreen.hide();
      else if (active) this.openJournal();
      return;
    }
    if (inp.wasPressed('pause') && this.input.padConnected && !this.input.locked) {
      // Gamepad Start: toggle pause without a mouse.
      if (this.paused && this.started && !this.settingsScreen.visible) this.start();
      else if (!this.paused && this.started) this.pause();
      return;
    }
    if (!active) return;
    SLOT_ACTIONS.forEach((a, i) => {
      if (inp.wasPressed(a)) this.inventory.select(i);
    });
    if (inp.wasPressed('prevSlot')) this.inventory.select(this.inventory.selected - 1);
    if (inp.wasPressed('nextSlot')) this.inventory.select(this.inventory.selected + 1);
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
    const s = this.settings;
    // Frame-rate cap (SPEC §10.2): skip display refreshes until the budget is used up.
    if (s.fpsLimit > 0 && now - this.lastFrameAt < 1000 / s.fpsLimit - 1) return;
    this.lastFrameAt = now;
    const realDt = Math.min(0.5, (now - this.last) / 1000);
    const dt = Math.min(0.05, realDt);
    this.last = now;
    this.time += dt;
    this.input.pollGamepad();
    const overlay = this.paused || this.settingsScreen.visible || this.journalOpen;
    const active =
      this.started && !overlay && (this.input.locked || this.input.padConnected) && this.deadTimer <= 0 && !this.transition;

    if (this.started && !overlay) {
      this.playTime += realDt;
      this.autosaveTimer += realDt;
      if (s.autosaveMinutes > 0 && this.autosaveTimer > s.autosaveMinutes * 60) this.saveNow(true);
    }

    if (this.deadTimer > 0) {
      this.deadTimer -= realDt;
      if (this.deadTimer <= 0) this.respawn();
    }
    if (this.transition && this.hud.fadeDone) this.finishTransition();

    this.handleActions(active);

    let running = false;
    let moving = false;
    let forward = 0;
    if (active) {
      const k = 0.0022;
      const inv = s.invertY ? -1 : 1;
      const pinv = s.padInvertY ? -1 : 1;
      const pk = s.padSensitivity * 1.1 * dt;
      this.player.look(
        this.input.mouseDX * k * s.sensitivityX + this.input.padLook.x * pk,
        this.input.mouseDY * k * s.sensitivityY * inv + this.input.padLook.y * pk * pinv,
      );
      forward = (this.input.isDown('forward') ? 1 : 0) - (this.input.isDown('back') ? 1 : 0) - this.input.padMove.y;
      let r = (this.input.isDown('right') ? 1 : 0) - (this.input.isDown('left') ? 1 : 0) + this.input.padMove.x;
      forward = Math.max(-1, Math.min(1, forward));
      r = Math.max(-1, Math.min(1, r));
      moving = Math.abs(forward) > 0.05 || Math.abs(r) > 0.05;
      // Hold or toggle (SPEC §10.1)
      if (s.sprintToggle) {
        if (this.input.wasPressed('sprint')) this.sprintLatched = !this.sprintLatched;
        if (forward <= 0) this.sprintLatched = false;
      }
      if (s.crouchToggle && this.input.wasPressed('crouch')) this.crouchLatched = !this.crouchLatched;
      const sprintHeld = s.sprintToggle ? this.sprintLatched : this.input.isDown('sprint');
      const crouch = s.crouchToggle ? this.crouchLatched : this.input.isDown('crouch');
      running = sprintHeld && this.stats.canRun && forward > 0;
      this.player.step(dt, { forward, strafe: r, sprint: running, crouch, jump: this.input.wasPressed('jump') }, this.world);
      // Hard landings hurt.
      if (this.player.landingSpeed < -11) {
        this.stats.damage((-this.player.landingSpeed - 11) * 6);
        this.audio.footstep(1.8, this.level.footstep);
        this.hud.message(t('msg.hardLanding'), 1.5);
      } else if (this.player.landingSpeed < -4) this.audio.footstep(1.2, this.level.footstep);
      this.player.landingSpeed = 0;
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
      a.mesh.position.set(this.origin.toRenderX(a.x), a.y, this.origin.toRenderZ(a.z));
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
              : tg.prop.kind === 'locked-door'
                ? t('prompt.locked')
                : t('prompt.door'),
    );

    // Footsteps every half bob cycle.
    const stepIdx = Math.floor(this.player.bobPhase / Math.PI);
    if (stepIdx !== this.lastStep) {
      this.lastStep = stepIdx;
      if (this.player.speed > 0.5 && this.player.grounded)
        this.audio.footstep(this.player.speed > 4 ? 1.3 : this.player.speed < 2 ? 0.45 : 0.8, this.level.footstep);
    }

    // Flickering tubes: bounded rate and depth (photosensitivity, SPEC §9.3).
    // "Reduce flicker" lowers both the rate and the depth.
    const slot = Math.floor(this.time * (s.reduceFlicker ? 2.5 : 7));
    const fl = (Math.sin(slot * 12.9898) * 43758.5453) % 1;
    this.mats.lightFlicker.color.setHex(this.level.palette.lightColor).multiplyScalar(Math.abs(fl) > 0.3 ? 1 : s.reduceFlicker ? 0.8 : 0.4);

    // Noclippable walls and floors breathe slowly so attentive players can spot them.
    const pulse = 1 + Math.sin(this.time * 2.1) * (s.reduceFlicker ? 0.04 : 0.07);
    this.mats.thinMats.forEach((m, i) => m.color.copy(this.mats.thinBase[i]).multiplyScalar(pulse));
    // A floor patch that is giving way sinks under the player.
    const sink = Math.min(0.5, this.sinkTime * 0.45);

    // Camera: low health sways the view; pushing a thin wall warps it.
    const shakeK = s.reduceShake ? 0.25 : 1;
    const sway = (this.stats.health < 20 ? (20 - this.stats.health) * 0.0015 : 0) * shakeK;
    const warp = Math.min(1, this.pushTime / 2.5);
    const bob = Math.sin(this.player.bobPhase) * 0.035 * s.headBob;
    this.camera.position.set(
      this.origin.toRenderX(this.player.x),
      this.player.y + this.player.eye + bob - sink,
      this.origin.toRenderZ(this.player.z),
    );
    this.camera.rotation.set(
      this.player.pitch + Math.sin(this.time * 1.3) * sway,
      this.player.yaw + Math.sin(this.time * 0.9) * sway,
      Math.sin(this.time * 0.7) * sway + Math.sin(this.time * 9) * warp * 0.03 * shakeK,
    );
    const fov = s.fov + warp * 18 * shakeK;
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
    if (this.level.sky) this.sky.update(this.camera, this.time);
    this.post.render(this.renderer, this.scene, this.camera, this.time);

    if (this.debug) {
      const S = this.level.chunkSize;
      this.debug.update(dt, {
        level: `${this.level.id} (${this.level.subtitle ?? this.level.name}) ${this.level.kindLabel ?? ''}`,
        seed: this.worldSeed,
        pos: `${this.player.x.toFixed(1)}, ${this.player.y.toFixed(1)}, ${this.player.z.toFixed(1)}`,
        chunk: `${Math.floor(this.player.x / S)}, ${Math.floor(this.player.z / S)}`,
        chunks: `${this.chunks.chunks.size} / max ${this.chunks.maxChunks} (queue ${this.chunks.pending})`,
        walked: `${this.player.distanceWalked.toFixed(0)} m`,
        zone: (() => {
          const z = this.roomZoneAt(this.player.x, this.player.z);
          return z ? z.name ?? z.kind : '-';
        })(),
        y: `${this.player.y.toFixed(2)} ${this.player.grounded ? 'ground' : 'air'}`,
        history: this.history.slice(-6).join(' → '),
        draws: this.renderer.info.render.calls,
        geos: this.renderer.info.memory.geometries,
      });
    }
    this.input.endFrame();
  }
}
