/** Game: wires renderer, world streaming, player, items, level transitions, audio and UI. */
import * as THREE from 'three';
import { Input } from './core/input';
import { loadSettings, saveSettings, type Action, type Settings } from './core/settings';
import { getNative } from './core/storage';
import { hash01, hashString, Rng } from './core/rng';
import { entryHash, makeGenContext, parseWorldSeed, resolveExitTarget, resolveLevel } from './levels/registry';
import type { ExitRule, GenContext, LevelDefinition, LightSampler, SpawnPoint } from './levels/levelDefinition';
import { ChunkManager } from './world/chunkManager';
import { arraysToGroup, buildChunkMesh, disposeChunkMesh, LevelMaterials } from './world/chunkMesher';
import { ChunkWorkerPool, type ChunkResult } from './world/chunkWorkerPool';
import type { ChunkArrays } from './world/chunkGeometry';
import { FloatingOrigin } from './world/floatingOrigin';
import { groundHeight, rayBox, toWorldBox, type FloorRect, type WBox } from './world/collision';
import { chunkKey, type ChunkData, type Prop, type PropKind, type ZoneKind } from './world/chunkData';
import { WorldDeltas } from './world/deltas';
import { sampleTerrain, type TerrainGrid } from './world/terrain';
import { buildItemMesh, buildPropMesh, buildReturnAnchor, disposeObject } from './world/objectMeshes';
import { PlayerController } from './player/controller';
import { Inventory } from './player/inventory';
import { Stats, type DeathCause } from './player/stats';
import { ITEMS, type ItemId } from './items/itemDefs';
import { AudioSystem } from './systems/audio';
import { Hallucinations } from './systems/hallucination';
import { SkyDome } from './systems/sky';
import { waterTime } from './systems/water';
import { ENDING_LEVEL, ESCAPE_GOALS, EscapeProgress, type EscapeStage } from './systems/escape';
import { Crowd } from './world/crowd';
import { missingMat } from './entities/models';
import { Journal } from './systems/journal';
import { JournalScreen } from './ui/journalScreen';
import { DebugOverlay } from './ui/debugOverlay';
import { Arsenal } from './weapons/weaponLogic';
import { AMMO_MAX, AMMO_PICKUP, WEAPONS, type WeaponId } from './weapons/weaponDefs';
import { ViewModel } from './weapons/viewmodel';
import { EntitySystem } from './entities/entitySystem';
import { Director, entityTableFor } from './entities/director';
import { ALL_ENTITIES, ENTITIES, type EntityKind } from './entities/entityDefs';
import { augmentLoot } from './items/weaponLoot';
import { isWeapon } from './items/itemDefs';
import { buildCorpse } from './world/objectMeshes';
import { DIFFICULTY } from './player/stats';
import { Hud } from './ui/hud';
import { Screens } from './ui/screens';
import { SettingsScreen } from './ui/settingsScreen';
import { PostFX } from './systems/postfx';
import { readSlot, writeSlot, SAVE_VERSION, type SaveData } from './core/save';
import { LevelSelect } from './ui/levelSelect';
import { CombatLab } from './ui/combatLab';
import { ARENA_HALF, ARENA_ID, arenaBlocked } from './levels/hand/arena';
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
  ceilings: FloorRect[];
  terrain?: TerrainGrid;
  ox: number;
  oz: number;
  items: Map<string, WorldItem>;
  props: WorldProp[];
  zones: WorldZone[];
  sampler: LightSampler;
  key: string;
}

/**
 * A free-standing door on open floor in this chunk (local coordinates), clear of
 * walls, chosen deterministically - or null if the chunk has no room for one.
 */
function homeDoorFor(data: ChunkData, seed: number): Prop | null {
  const S = data.size;
  for (let k = 0; k < 24; k++) {
    const x = 2 + hash01(seed, 9101, data.cx, data.cz, k) * (S - 4);
    const z = 2 + hash01(seed, 9102, data.cx, data.cz, k) * (S - 4);
    const onFloor = data.floors.some((f) => f.y === 0 && x > f.x0 + 1 && x < f.x1 - 1 && z > f.z0 + 1 && z < f.z1 - 1);
    if (!onFloor) continue;
    const clear = data.solids.every((b) => b.minY > 2.3 || b.maxY < 0.05 || x < b.minX - 1.3 || x > b.maxX + 1.3 || z < b.minZ - 1.3 || z > b.maxZ + 1.3);
    if (!clear) continue;
    return { uid: 'home-door', kind: 'plain-door', x, y: 0, z, rotY: Math.floor(hash01(seed, 9103, data.cx, data.cz) * 4) * (Math.PI / 2) };
  }
  return null;
}

/** Something drifting ashore on the eternal island: a door on a raft or a wormhole. */
interface Drifter {
  kind: 'door' | 'wormhole';
  angle: number;
  age: number;
  x: number;
  z: number;
  mesh: THREE.Object3D;
  prop?: WorldProp;
  n: number;
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


/** Chance that a defeated witch drops its staff. */
const STAFF_DROP_P = 0.05;
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
  private lab: CombatLab;
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
  /** Game mode (SPEC §1.1) and escape-mode progress. */
  private mode: 'endless' | 'escape' = 'endless';
  /** Escape-mode progress (conditions, the Bug, the way home). */
  private escape = new EscapeProgress();
  private bugT = 5;
  /** The staff's circle while the button is held. */
  private staffTarget: [number, number, number] | null = null;
  private arrivedStage: EscapeStage | null = null;
  private crowd: Crowd | null = null;
  private endingTimer = -1;
  private creditsShown = false;
  private hud: Hud;
  private halluc: Hallucinations;
  private sky = new SkyDome();
  private drifters: Drifter[] = [];
  readonly arsenal = new Arsenal();
  private viewmodel!: ViewModel;
  readonly ents!: EntitySystem;
  private director!: Director;
  private entityTable: EntityKind[] = [];
  /** 0 = hip, 1 = aimed (smoothed). */
  private adsT = 0;
  private meleePending = -1;
  private heldPrev: string | null = null;
  private lastLookDY = 0;
  private lastLookDX = 0;
  private flickerT = 0;
  private drifterClock = 30;
  private drifterCount = 0;
  private pool = new URLSearchParams(location.search).get('noworker') === '1' ? null : ChunkWorkerPool.create();
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
  /** Smoothed view height (feet). */
  private camY = 0;
  private safeTimer = 0;
  private lastSafe: SpawnPoint = { x: 0, y: 0, z: 0, yaw: 0 };
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
    this.viewmodel = new ViewModel(this.camera);
    this.director = new Director(this.worldSeed);
    (this as { ents: EntitySystem }).ents = new EntitySystem({
      fx: this.fxRoot,
      toRender: (x, z) => [this.origin.toRenderX(x), this.origin.toRenderZ(z)],
      world: this.world,
      rayWorld: (ox, oy, oz, dx, dy, dz, max) => this.rayWorld(ox, oy, oz, dx, dy, dz, max),
      player: this.player,
      audio: this.audio,
      isSafe: (x, z) => this.isSafeSpot(x, z),
      onPlayerHit: (kind, dmg) => this.onEntityHit(kind, dmg),
      onSelfBlast: () => {
        this.blastAirborne = true;
        this.blastT = 0;
      },
      onRangedHit: (_kind, dmg) => {
        const k = this.settings.difficulty === 'easy' ? 0.7 : this.settings.difficulty === 'hard' ? 1.3 : 1;
        this.stats.damage(dmg * k);
        this.audio.hurt();
        this.hud.hurtFlash();
      },
      onSeen: (kind) => {
        const lv = this.journal.data.levels[this.level.id];
        if (lv && !lv.entities.includes(kind)) {
          lv.entities.push(kind);
          this.hud.message(t('entity.seen', { name: ENTITIES[kind].name }), 2.5);
        }
      },
      onKilled: (kind, at) => {
        this.hud.message(t('entity.killed', { name: ENTITIES[kind].name }), 2);
        // Now and then a witch leaves its staff behind (5%).
        if (kind === 'witch' && this.rng.float() < STAFF_DROP_P) this.spawnItemAt('staff', at.x, at.y, at.z);
        if (this.mode === 'escape') {
          if (this.escape.recordKill(kind) === 'return') {
            // A door appears where the Bug fell: the first way home.
            this.spawnDoorAt(at.x, at.y, at.z, Math.atan2(this.player.x - at.x, this.player.z - at.z));
            this.hud.showBanner(t('escape.returnBanner'), t('escape.returnSub'));
            this.updateRealityAudio();
          } else if (this.escape.check(this.journal.data.order) === 'bug') this.onBugStage();
          this.updateObjective();
        }
        this.director.encounterOver({ rate: DIFFICULTY[this.settings.difficulty].entity, maxActive: 1 });
      },
      onHit: (head, kill) => {
        this.hud.hitMarker(head, kill);
        this.audio.hitTick(head, kill);
      },
    });
    this.halluc.onSound = (k) => {
      if (this.settings.subtitles) this.hud.subtitle(t('sub.' + k));
    };
    if (opts.debug) {
      this.debug = new DebugOverlay(container);
      (window as unknown as { __game: Game }).__game = this; // debug/test hook
    }

    this.levelSelect = new LevelSelect(container, (id) => this.devJump(id));
    this.lab = new CombatLab(container, {
      inArena: () => this.started && this.level.id === ARENA_ID,
      enterArena: () => this.enterArena(),
      spawn: (kind) => this.labSpawn(kind),
      clearEntities: () => this.ents.clear(),
      refillWeapons: () => this.labRefill(),
      resume: () => this.start(),
      optionsChanged: (o) => {
        // A new endless setup replaces the current enemies right away.
        const key = o.endless + ':' + (o.endlessKind ?? '');
        if (key !== this.labEndlessKey) {
          this.labEndlessKey = key;
          if (this.inArena) {
            this.ents.clear();
            this.labRefillT = 0;
          }
        }
        this.ents.aiStopped = this.started && this.inArena && o.aiStopped;
        if (o.god && this.inArena) this.stats.health = 100;
      },
    });
    this.journalScreen = new JournalScreen(container, this.journal);
    this.settingsScreen = new SettingsScreen(container, this.settings, this.input, (st) => this.applySettings(st));
    this.screens = new Screens(container, {
      onNewGame: (slot, mode) => this.newGame(slot, mode),
      onLoad: (slot) => this.loadGame(slot),
      onResume: () => this.resume(),
      onToTitle: () => this.toTitle(),
      onSettings: () => this.settingsScreen.show(() => this.screens.refresh()),
      onLevelSelect: () => this.levelSelect.show(),
      onCombatLab: () => this.lab.show(),
      onEndingTest: () => this.startEndingTest(),
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
    this.arsenal.load(undefined);
    this.ents?.clear();
    this.inventory.add('almond_water');
    this.stats.load({ health: 100, stamina: 100 });
    this.deltas.load({});
    for (const a of Object.values(this.anchors).flat()) if (a.mesh) disposeObject(a.mesh);
    this.anchors = {};
    this.history.length = 0;
    this.journal.load(null);
    this.mode = 'endless';
    this.escape.reset();
    this.endingTimer = -1;
    this.hud.hideCredits();
    this.playTime = 0;
    this.autosaveTimer = 0;
  }

  private newGame(slot: number, mode: 'endless' | 'escape' = 'endless'): void {
    const seedStr = this.settings.worldSeed.trim();
    this.resetRun(seedStr ? parseWorldSeed(seedStr) : hashString(String(Date.now())));
    this.slot = slot;
    this.mode = mode;
    this.escape.reset();
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
    this.mode = d.mode ?? 'endless';
    this.escape.load(d.escape);
    this.inventory.load(d.inventory);
    this.arsenal.load(d.arsenal);
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
      mode: this.mode,
      arsenal: this.arsenal.toJSON(),
      escape: this.mode === 'escape' ? this.escape.toJSON() : undefined,
    };
  }

  /** Write the current run to its slot (autosave). */
  saveNow(showMessage = false): void {
    if (this.slot === null || this.inArena || !this.started || this.deadTimer > 0 || this.transition) return;
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
    this.onArrive();
  }

  /** Island drifters (Level 808): spawn, drift in, wait, drift away. */
  private updateDrifters(dt: number): void {
    const cfg = this.level.drifters;
    if (!cfg) return;
    this.drifterClock -= dt;
    if (this.drifterClock <= 0) {
      this.drifterClock = 40;
      const n = this.drifterCount++;
      const kind: Drifter['kind'] = n % 2 === 0 ? 'door' : 'wormhole';
      const angle = this.rng.float() * Math.PI * 2;
      const g = new THREE.Group();
      if (kind === 'door') {
        const raft = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 2.4), new THREE.MeshBasicMaterial({ color: 0x5a4028 }));
        raft.position.y = 0.1;
        g.add(raft, buildPropMesh({ uid: 'drift', kind: 'plain-door', x: 0, y: 0.25, z: 0, rotY: 0, color: 0x8a6a4a }, 1));
      } else {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.14, 8, 24), new THREE.MeshBasicMaterial({ color: 0xc87aff }));
        const disc = new THREE.Mesh(new THREE.CircleGeometry(1.0, 24), new THREE.MeshBasicMaterial({ color: 0x1a0830, side: THREE.DoubleSide }));
        ring.position.y = disc.position.y = 1.3;
        g.add(ring, disc);
      }
      this.fxRoot.add(g);
      this.drifters.push({ kind, angle, age: 0, x: 0, z: 0, mesh: g, n });
      this.hud.message(t('msg.drifter'), 3);
    }
    for (let i = this.drifters.length - 1; i >= 0; i--) {
      const d = this.drifters[i];
      d.age += dt;
      // 0-18s drift in, 18-55s wait near the shore, 55-73s drift away
      const far = 70;
      const near = cfg.radius;
      const r = d.age < 18 ? far + (near - far) * (d.age / 18) : d.age < 55 ? near : near + (far - near) * ((d.age - 55) / 18);
      const a = d.angle + Math.sin(d.age * 0.3) * 0.02;
      d.x = Math.cos(a) * r;
      d.z = Math.sin(a) * r;
      d.mesh.position.set(this.origin.toRenderX(d.x), Math.sin(d.age * 1.4) * 0.08, this.origin.toRenderZ(d.z));
      d.mesh.rotation.y = -a + Math.PI / 2;
      if (d.kind === 'wormhole') d.mesh.children[0].rotation.z += dt;
      d.prop = d.kind === 'door' ? { uid: 'drift' + d.n, kind: 'plain-door', x: d.x, y: 0.25, z: d.z, rotY: -a + Math.PI / 2, key: 'drift' } : undefined;
      if (d.kind === 'wormhole' && Math.hypot(this.player.x - d.x, this.player.z - d.z) < 1.4 && !this.transition) {
        const rule = this.findExit('special', (r) => r.zone === 'gate');
        if (rule) this.takeExit(rule, 'wormhole' + d.n, { ...this.entryPoint }, '#fff');
      }
      if (d.age > 73) {
        disposeObject(d.mesh);
        this.drifters.splice(i, 1);
      }
    }
  }

  /** Escape-mode bookkeeping and the ending trigger. */
  private onArrive(): void {
    if (this.mode === 'escape') {
      const changed = this.arrivedStage ?? this.escape.arrive(this.level.id);
      this.arrivedStage = null;
      if (changed === 'home') setTimeout(() => this.hud.message(t('escape.home'), 6), 2500);
      if (this.escape.check(this.journal.data.order) === 'bug') this.onBugStage();
    }
    this.updateObjective();
    this.updateRealityAudio();
    if (this.level.id === ENDING_LEVEL && this.endingTimer < 0) {
      this.endingTimer = 0;
      this.creditsShown = false;
    }
  }

  /** HUD line for escape mode: what is left to do. */
  private updateObjective(): void {
    if (this.mode !== 'escape') return this.hud.setObjective('');
    const st = this.escape.status(this.journal.data.order);
    const stage = this.escape.stage;
    if (stage === 'collect')
      this.hud.setObjective(
        t('escape.collect', {
          levels: Math.min(st.levels, ESCAPE_GOALS.levels),
          goal: ESCAPE_GOALS.levels,
          void: st.voidSeen ? '済' : '未',
          kills: Math.min(st.kills, ESCAPE_GOALS.kills),
          killGoal: ESCAPE_GOALS.kills,
          kinds: st.kinds,
          kindsTotal: st.kindsTotal,
        }),
      );
    else this.hud.setObjective(t('escape.stage.' + stage));
  }

  /** The conditions are met: the Bug starts to appear. */
  private onBugStage(): void {
    this.bugT = 4;
    this.hud.showBanner(t('escape.bugBanner'), t('escape.bugSub'));
    this.updateObjective();
  }

  private updateRealityAudio(): void {
    const level = this.level.id === ENDING_LEVEL ? 1 : this.mode === 'escape' && this.escape.realityLeaking(this.level.id) ? 0.4 : 0;
    this.audio.setReality(level);
  }

  /** Journal: note arriving in the current level, and celebrate milestones (SPEC §12). */
  private recordVisit(): void {
    const L = this.level;
    if (L.id === ARENA_ID) return;
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
    const L = resolveLevel(id);
    this.enterLevel(id, L.arrival(makeGenContext(this.worldSeed, L), 1));
    if (L.topology !== 'closed') this.player.yaw = this.pickOpenYaw(this.player.yaw);
    this.entryPoint = { x: this.player.x, y: this.player.y, z: this.player.z, yaw: this.player.yaw };
    this.titleShown = false;
    this.start();
  }

  // ---------------------------------------------------------------------------
  // Developer mode 2: combat lab
  // ---------------------------------------------------------------------------

  private get inArena(): boolean {
    return this.level.id === ARENA_ID;
  }

  /** Drop an item into the world (e.g. a witch's staff). */
  private spawnItemAt(id: ItemId, x: number, y: number, z: number): void {
    const S = this.level.chunkSize;
    const c = this.chunks.column(Math.floor(x / S), Math.floor(z / S), this.chunks.slabCoord(y)).map((h) => h.handle)[0];
    if (!c) return;
    const uid = 'drop' + this.dropCount++;
    const mesh = buildItemMesh(id, c.sampler(x, y + 0.3, z, 0, 1, 0));
    mesh.position.set(x - c.ox, y, z - c.oz);
    c.group.add(mesh);
    c.items.set(uid, { uid, id, mesh, x, y, z });
    this.hud.message(t('msg.dropped', { name: ITEMS[id].name }), 3);
  }
  private dropCount = 0;

  /** Stand a door in the world at (x, y, z), its front facing `rotY` (added to the chunk there). */
  private spawnDoorAt(x: number, y: number, z: number, rotY: number): void {
    const S = this.level.chunkSize;
    const cx = Math.floor(x / S);
    const cz = Math.floor(z / S);
    const c = this.chunks.column(cx, cz, this.chunks.slabCoord(y)).map((h) => h.handle)[0];
    if (!c) return;
    const prop: Prop = { uid: 'bug-door', kind: 'plain-door', x: x - c.ox, y, z: z - c.oz, rotY, color: 0x8a8f94 };
    const mesh = buildPropMesh(prop, c.sampler(x, y + 1.5, z, 0, 1, 0));
    c.group.add(mesh);
    c.props.push({ uid: prop.uid, kind: prop.kind, x, y, z, rotY, key: c.key });
    this.audio.door();
  }

  /** Developer mode 3: an escape run already at the Bug stage, in Level 0, armed. */
  private startEndingTest(): void {
    this.resetRun(this.worldSeed || hashString(String(Date.now())));
    this.slot = null;
    this.mode = 'escape';
    this.escape.reset('bug');
    this.enterLevel('0');
    this.labRefill();
    this.bugT = 3;
    this.titleShown = false;
    this.start();
    this.hud.showBanner(t('escape.bugBanner'), t('escape.bugSub'));
  }

  private enterArena(): void {
    this.devJump(ARENA_ID);
    this.ents.clear();
    this.labRefill();
    this.labRefillT = 0;
    this.stats.health = 100;
    this.stats.stamina = 100;
    this.player.kx = this.player.kz = 0;
  }

  /** Every weapon with a full magazine and full reserves; hold the pistol. */
  private labRefill(): void {
    for (const id of ['pistol', 'magnum', 'shotgun', 'kunai', 'rocket', 'staff', 'axe'] as const) {
      if (!this.inventory.has(id)) {
        if (!this.inventory.add(id)) continue;
        this.arsenal.gainWeapon(id, false);
      }
      const def = WEAPONS[id];
      if (def.mag > 0) this.arsenal.mags[id] = def.mag;
    }
    for (const a of ['pistol', 'magnum', 'kunai', 'rocket', 'shotgun'] as const) this.arsenal.reserve[a] = AMMO_MAX[a];
    this.arsenal.cancelReload();
    const i = this.inventory.slots.indexOf('pistol');
    if (i >= 0) this.inventory.select(i);
  }

  /** Spawn an entity the chosen distance ahead (kept inside the hall). */
  private labSpawn(kind: EntityKind): void {
    const d = this.lab.options.distance;
    const lim = ARENA_HALF - 1.5;
    const x = Math.max(-lim, Math.min(lim, this.player.x + this.player.dirX * d));
    const z = Math.max(-lim, Math.min(lim, this.player.z + this.player.dirZ * d));
    this.ents.spawnAt(kind, x, 0, z);
  }

  /** Thrown by your own rocket: no fall damage until you land. */
  private blastAirborne = false;
  private blastT = 0;
  private labRefillT = 0;
  private labEndlessKey = '3:';

  /** Endless mode: keep N entities alive, topping up one at a time. */
  private labEndless(dt: number): void {
    const want = this.lab.options.endless;
    if (want <= 0 || this.deadTimer > 0) return;
    const alive = this.ents.entities.filter((e) => e.brain.hp > 0 && e.brain.mode !== 'flee' && e.brain.mode !== 'fade').length;
    if (alive >= want) {
      this.labRefillT = Math.min(this.labRefillT, 1);
      return;
    }
    this.labRefillT -= dt;
    if (this.labRefillT > 0) return;
    this.labRefillT = 0.6;
    const kind = this.lab.options.endlessKind ?? ALL_ENTITIES[Math.floor(this.rng.float() * ALL_ENTITIES.length)];
    // Somewhere in the hall 12-30 m away, clear of pillars and walls.
    for (let k = 0; k < 40; k++) {
      const a = this.rng.float() * Math.PI * 2;
      const d = 12 + this.rng.float() * 18;
      const x = this.player.x + Math.cos(a) * d;
      const z = this.player.z + Math.sin(a) * d;
      if (arenaBlocked(x, z, kind === 'giant' ? 2 : 1)) continue;
      this.ents.spawnAt(kind, x, 0, z);
      return;
    }
  }

  private updateLab(dt: number): void {
    const on = this.started && this.inArena;
    if (on && !this.paused) this.labEndless(dt);
    this.ents.aiStopped = on && this.lab.options.aiStopped;
    if (on && this.lab.options.infiniteAmmo) for (const a of ['pistol', 'magnum', 'kunai', 'rocket', 'shotgun'] as const) this.arsenal.reserve[a] = AMMO_MAX[a];
    this.lab.updateInfo(
      on
        ? this.ents.entities.map((e) => ({
            kind: e.kind,
            mode: e.brain.mode,
            hp: e.brain.hp,
            maxHp: ENTITIES[e.kind].hp,
            dist: Math.hypot(e.body.x - this.player.x, e.body.z - this.player.z),
            alpha: e.brain.alpha,
          }))
        : null,
    );
  }

  private showLevelTitle(): void {
    this.titleShown = true;
    this.hud.showTitle(this.level.title, this.level.subtitle ?? this.level.name, this.level.threatClass, !!this.level.glitch);
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
    if (this.chunks && this.chunks.radius !== this.horizontalRadius()) this.chunks.radius = this.horizontalRadius();
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

  /** Horizontal load radius: vertical levels are narrow, so they load fewer columns. */
  private horizontalRadius(): number {
    const v = this.level?.vertical;
    return v ? Math.min(this.settings.renderDistance, v.hRadius) : this.settings.renderDistance;
  }

  /** Load a level and place the player (default spawn, or `at`). */
  enterLevel(id: string, at?: SpawnPoint): void {
    if (this.chunks) this.chunks.clear();
    this.mats?.dispose();
    this.halluc.clear();
    this.ents?.clear();
    for (const d of this.drifters) disposeObject(d.mesh);
    this.drifters = [];
    this.drifterClock = 25;
    for (const a of Object.values(this.anchors).flat()) if (a.mesh) disposeObject(a.mesh), (a.mesh = undefined);
    this.level = resolveLevel(id);
    this.ctx = makeGenContext(this.worldSeed, this.level);
    this.crowd?.dispose();
    this.crowd = null;
    if (id === ENDING_LEVEL) {
      this.crowd = new Crowd();
      this.scene.add(this.crowd.root);
    }
    // The ending is a quiet walk: no weapon in hand, no gauges.
    this.viewmodel.root.visible = id !== ENDING_LEVEL;
    this.hud.setVisible(id !== ENDING_LEVEL && this.settings.showHud);
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
      radius: this.horizontalRadius(),
      budgetMs: 4,
      vRadius: this.level.vertical?.radius ?? 0,
      slab: this.level.vertical?.slab,
      generate: (cx, cz, cy) => this.level.generator(ctx, cx, cz, cy),
      build: (data) => this.buildChunk(data),
      dispose: (h) => disposeChunkMesh(h.group),
      // Off-thread generation + geometry (Phase 10); the first chunks still load synchronously.
      async: this.pool
        ? {
            maxInFlight: this.pool.size * 2,
            request: (cx, cz, cy) => this.pool!.request({ levelId: this.level.id, worldSeed: this.worldSeed, epoch: this.ctx.epoch ?? 0, cx, cz, cy }),
            build: (r) => {
              const res = r as ChunkResult;
              return { data: res.data, handle: this.buildChunk(res.data, res.arrays) };
            },
          }
        : undefined,
    });

    const s = at ?? this.level.spawn;
    this.player.x = s.x;
    this.player.y = s.y;
    this.player.z = s.z;
    this.player.vy = 0;
    this.player.distanceWalked = 0;
    this.origin.update(s.x, s.z);
    this.chunks.loadAllSync(s.x, s.z, 1, s.y);
    this.player.yaw = at ? s.yaw : this.pickOpenYaw(s.yaw);
    this.entryPoint = { x: this.player.x, y: this.player.y, z: this.player.z, yaw: this.player.yaw };
    this.lastSafe = { ...this.entryPoint };
    this.zoneKey = '';
    this.zoneTime = 0;
    this.pushTime = 0;
    this.sinkTime = 0;
    this.player.grounded = true;
    this.walkWarned = false;
    for (const a of this.anchors[this.level.id] ?? []) this.showAnchor(a);
    this.entityTable = entityTableFor(this.level.id, { dark: this.level.palette.ambient < 0.12, safe: this.level.id === 'frontrooms', open: this.level.environment === 'open-sky' || this.level.ceilingHeight >= 9 });
    this.director?.reset(this.entityTable.length > 0);
    if (this.history[this.history.length - 1] !== this.level.id) this.history.push(this.level.id);
    if (this.started) this.audio.setAmbience(this.level.ambience);
  }

  private buildChunk(data: ChunkData, arrays?: ChunkArrays): ChunkHandle {
    const ctx = this.ctx;
    const sampler = this.level.lightSampler(ctx, data.cx, data.cz, data.cy ?? 0);
    const group = arrays ? arraysToGroup(data, arrays, this.mats) : buildChunkMesh(data, this.mats, sampler);
    const ox = data.cx * data.size;
    const oz = data.cz * data.size;
    const key = chunkKey(data.cx, data.cz, data.cy ?? 0);
    const delta = this.deltas.get(this.level.id, key);
    const items = new Map<string, WorldItem>();
    // Rare weapons with fallen survey-team members, and loose ammunition.
    const corpses = augmentLoot(data, ctx.levelSeed, this.level.id === 'frontrooms');
    for (const c of corpses) {
      const m = buildCorpse(sampler(c.x + ox, 0.3, c.z + oz, 0, 1, 0));
      m.position.set(c.x - Math.cos(c.rot) * 0.55, c.y, c.z - Math.sin(c.rot) * 0.55);
      m.rotation.y = -c.rot;
      group.add(m);
    }
    for (const it of data.items) {
      if (delta?.taken.includes(it.uid)) continue;
      const mesh = buildItemMesh(it.id, sampler(it.x + ox, 0.3, it.z + oz, 0, 1, 0));
      mesh.position.set(it.x, it.y, it.z);
      mesh.rotation.y = it.rot;
      group.add(mesh);
      items.set(it.uid, { uid: it.uid, id: it.id, mesh, x: it.x + ox, y: it.y, z: it.z + oz });
    }
    const props: WorldProp[] = [];
    const glitchDoors = this.mode === 'escape' && this.escape.realityLeaking(this.level.id);
    // Home again: Level 0 has doors everywhere now, standing in the open (one per chunk).
    if (glitchDoors) {
      const extra = homeDoorFor(data, ctx.levelSeed);
      if (extra) data.props = [...data.props, extra];
    }
    for (const p of data.props) {
      const pm = buildPropMesh(p, sampler(p.x + ox, 1.5, p.z + oz, 0, 1, 0));
      // Home again: every door in Level 0 shows the missing-texture checkerboard.
      if (glitchDoors) pm.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).material = missingMat(3)) : undefined));
      group.add(pm);
      props.push({ uid: p.uid, kind: p.kind, x: p.x + ox, y: p.y, z: p.z + oz, rotY: p.rotY, key });
    }
    this.placeChunk(group);
    this.worldRoot.add(group);
    return {
      group,
      boxes: data.solids.map((b) => Object.assign(toWorldBox(b, ox, oz), { thin: b.thin })),
      floors: data.floors.map((f) => ({ x0: f.x0 + ox, z0: f.z0 + oz, x1: f.x1 + ox, z1: f.z1 + oz, y: f.y })),
      ceilings: data.ceilings.map((f) => ({ x0: f.x0 + ox, z0: f.z0 + oz, x1: f.x1 + ox, z1: f.z1 + oz, y: f.y })),
      terrain: data.terrain,
      ox,
      oz,
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

  /** The chunk containing a point (vertical levels pick the slab by height). */
  private chunkAt(x: number, z: number, y = this.player.y): ChunkHandle | undefined {
    const S = this.level.chunkSize;
    const cy = this.chunks.slabCoord(y);
    return this.chunks.get(Math.floor(x / S), Math.floor(z / S), cy)?.handle;
  }

  /** All loaded chunks of the column containing (x, z). */
  private columnAt(x: number, z: number): ChunkHandle[] {
    const S = this.level.chunkSize;
    return this.chunks.column(Math.floor(x / S), Math.floor(z / S), this.chunks.slabCoord(this.player.y)).map((c) => c.handle);
  }

  private boxesNear = (x: number, z: number, r = 1): Array<WBox & { thin?: boolean }> => {
    const S = this.level.chunkSize;
    const out: Array<WBox & { thin?: boolean }> = [];
    for (let cx = Math.floor((x - r) / S); cx <= Math.floor((x + r) / S); cx++)
      for (let cz = Math.floor((z - r) / S); cz <= Math.floor((z + r) / S); cz++)
        for (const c of this.chunks.column(cx, cz, this.chunks.slabCoord(this.player.y)))
          for (const b of c.handle.boxes) {
            if (b.maxX < x - r || b.minX > x + r || b.maxZ < z - r || b.minZ > z + r) continue;
            out.push(b);
          }
    return out;
  };

  private floorsNear = (x: number, z: number): FloorRect[] => {
    const col = this.columnAt(x, z);
    return col.length === 1 ? col[0].floors : col.flatMap((c) => c.floors);
  };

  private ceilingsNear = (x: number, z: number): FloorRect[] => {
    const col = this.columnAt(x, z);
    return col.length === 1 ? col[0].ceilings : col.flatMap((c) => c.ceilings);
  };

  /** Smooth terrain height at a world point (flat-topology levels only). */
  private terrainAt = (x: number, z: number): number | null => {
    const S = this.level.chunkSize;
    const c = this.chunks.get(Math.floor(x / S), Math.floor(z / S))?.handle;
    return c?.terrain ? sampleTerrain(c.terrain, x - c.ox, z - c.oz) : null;
  };

  private world = {
    boxes: (x: number, z: number) => this.boxesNear(x, z),
    floors: (x: number, z: number) => this.floorsNear(x, z),
    terrain: (x: number, z: number) => this.terrainAt(x, z),
    ceilings: (x: number, z: number) => this.ceilingsNear(x, z),
  };

  /**
   * Keep the ground under and just ahead of the player generated
   * synchronously (vertical levels also the slabs above and below), so a
   * chunk still waiting in the background never becomes a hole.
   */
  private ensureGround(): void {
    const S = this.level.chunkSize;
    const p = this.player;
    const pts: Array<[number, number]> = [
      [p.x, p.z],
      [p.x + p.dirX * 3, p.z + p.dirZ * 3],
      [p.x + 1.5, p.z],
      [p.x - 1.5, p.z],
      [p.x, p.z + 1.5],
      [p.x, p.z - 1.5],
    ];
    const vertical = !!this.level.vertical;
    const cy = this.chunks.slabCoord(p.y);
    const done = new Set<string>();
    for (const [x, z] of pts) {
      const cx = Math.floor(x / S);
      const cz = Math.floor(z / S);
      for (const dy of vertical ? [0, -1, 1] : [0]) {
        const k = cx + ',' + cz + ',' + (cy + dy);
        if (done.has(k)) continue;
        done.add(k);
        this.chunks.ensure(cx, cz, vertical ? cy + dy : 0);
      }
    }
  }

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
      for (let cz = Math.floor((pz - 3) / S); cz <= Math.floor((pz + 3) / S); cz++)
        for (const c of this.chunks.column(cx, cz, this.chunks.slabCoord(this.player.y))) {
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
    for (const d of this.drifters) {
      if (!d.prop) continue;
      const sc = this.aimScore(d.prop.x, 1.3, d.prop.z, 3.2, 0.75);
      if (sc > bestScore) (bestScore = sc), (best = { type: 'prop', prop: d.prop });
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
    const def = ITEMS[it.id];
    let msg: string;
    if (def.kind === 'ammo') {
      const n = this.arsenal.addAmmo(def.ammo!, AMMO_PICKUP[def.ammo!]);
      if (n <= 0) {
        this.hud.message(t('msg.ammoFull'));
        return;
      }
      msg = t('msg.pickAmmo', { name: def.name, n });
    } else if (def.kind === 'weapon') {
      const owned = this.inventory.has(it.id);
      if (!owned && !this.inventory.add(it.id)) {
        this.hud.message(t('msg.full'));
        return;
      }
      this.arsenal.gainWeapon(def.weapon!, owned);
      msg = owned ? t('msg.pickAmmo', { name: def.name, n: def.weapon === 'kunai' ? 10 : WEAPONS[def.weapon!].mag }) : t('msg.pickWeapon', { name: def.name });
      // Switch to a newly found weapon.
      if (!owned) this.inventory.select(this.inventory.slots.indexOf(it.id));
    } else {
      if (!this.inventory.add(it.id)) {
        this.hud.message(t('msg.full'));
        return;
      }
      msg = t('msg.pickup', { name: def.name });
    }
    const c = this.chunkAt(it.x, it.z, it.y);
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
    this.hud.message(msg);
  }

  /** Q: drink almond water (the held bottle, or the first one in the bar). */
  private useHeld(): void {
    const slot = this.inventory.held === 'almond_water' ? this.inventory.selected : this.inventory.slots.indexOf('almond_water');
    if (slot < 0) {
      this.hud.message(t('msg.nothingHeld'));
      return;
    }
    if (this.stats.health >= 99 && this.stats.stamina >= 99) {
      this.hud.message(t('msg.fullHealth'));
      return;
    }
    const id = this.inventory.take(slot)!;
    this.stats.heal(ITEMS[id].heal);
    this.stats.stamina = 100; // also refills the dash gauge
    this.audio.drink();
    this.hud.message(t('msg.drink', { name: ITEMS[id].name }));
  }

  // ---------------------------------------------------------------------------
  // Weapons
  // ---------------------------------------------------------------------------

  /** World ray (walls, floors, terrain), marching in short segments so long rays stay cheap. */
  private rayWorld(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): number | null {
    const seg = 6;
    for (let s0 = 0; s0 < max; s0 += seg) {
      const len = Math.min(seg, max - s0);
      const sx = ox + dx * s0;
      const sy = oy + dy * s0;
      const sz = oz + dz * s0;
      let best = Infinity;
      for (const b of this.boxesNear(sx + (dx * len) / 2, sz + (dz * len) / 2, len / 2 + 0.6)) {
        const h = rayBox(sx, sy, sz, dx, dy, dz, b, len);
        if (h && h.t < best) best = h.t;
      }
      if (Math.abs(dy) > 1e-5)
        for (const f of [...this.floorsNear(sx + (dx * len) / 2, sz + (dz * len) / 2), ...this.ceilingsNear(sx + (dx * len) / 2, sz + (dz * len) / 2)]) {
          const tt = (f.y - sy) / dy;
          if (tt < 0 || tt > len || tt >= best) continue;
          const x = sx + dx * tt;
          const z = sz + dz * tt;
          if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1) best = tt;
        }
      // Terrain: sample along the segment.
      if (this.level.chunkSize && best === Infinity)
        for (let u = 0.25; u <= len; u += 0.25) {
          const th = this.terrainAt(sx + dx * u, sz + dz * u);
          if (th !== null && sy + dy * u < th) {
            best = u;
            break;
          }
        }
      if (best < Infinity) return s0 + best;
    }
    return null;
  }

  private isSafeSpot(x: number, z: number): boolean {
    if (this.inArena) return false;
    for (const a of this.anchors[this.level.id] ?? []) if (Math.hypot(a.x - x, a.z - z) < 5) return true;
    return false;
  }

  private heldWeapon(): WeaponId | null {
    const h = this.inventory.held;
    return isWeapon(h) ? ITEMS[h].weapon! : null;
  }

  private aimDir(spread: number): [number, number, number] {
    let yaw = this.player.yaw;
    let pitch = this.player.pitch;
    if (spread > 0) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * spread;
      yaw += Math.cos(a) * r;
      pitch += Math.sin(a) * r;
    }
    const cp = Math.cos(pitch);
    return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
  }

  /** Current spread (radians): hip vs aimed, worse while moving or airborne. */
  private currentSpread(id: WeaponId): number {
    const def = WEAPONS[id];
    const base = def.hipSpread + (def.adsSpread - def.hipSpread) * this.adsT;
    const move = Math.min(1, this.player.speed / 6) * 0.01 * (1 - this.adsT) + (this.player.grounded ? 0 : 0.02);
    return base + (def.kind === 'melee' ? 0 : move);
  }

  private fireWeapon(id: WeaponId): void {
    const r = this.arsenal.fire(id);
    if (r === null) return;
    const def = WEAPONS[id];
    if (r === 'empty') {
      this.audio.dryFire();
      if (this.arsenal.startReload(id)) this.beginReloadFx(id);
      else if (def.kind === 'thrown') this.hud.message(t('msg.noAmmo'), 1.2);
      return;
    }
    // Magnum: the reticle returns before this shot, then kicks up again.
    this.player.pitch -= r.returnPitch;
    const spread = this.currentSpread(id);
    const d = this.aimDir(spread);
    const o: [number, number, number] = [this.player.x, this.player.y + this.player.eye, this.player.z];
    if (def.kind === 'hitscan' && def.pellets) {
      // Shotgun: a cone of pellets, each its own hitscan ray.
      for (let k = 0; k < def.pellets; k++) this.ents.hitscan(def, o, k === 0 ? this.aimDir(spread * 0.3) : this.aimDir(spread));
      this.audio.gunshot('magnum');
      this.audio.gunshot('pistol');
    } else if (def.kind === 'hitscan') {
      this.ents.hitscan(def, o, d);
      this.audio.gunshot('pistol');
    } else if (def.kind === 'projectile') {
      this.ents.launch(def, o, d, this.viewmodel.muzzleWorld);
      if (def.explosive) this.audio.rocketLaunch();
      else this.audio.gunshot('magnum');
    } else if (def.kind === 'thrown') {
      this.ents.launch(def, o, d, this.viewmodel.muzzleWorld);
      this.audio.throwWhoosh();
    } else {
      this.meleePending = 0.18; // the blade lands a moment into the swing
      this.audio.swing();
    }
    this.player.pitch = Math.min(1.55, this.player.pitch + r.kick);
    this.viewmodel.fire(def.kind, def.explosive ? 2.4 : def.pellets ? 2 : def.kind === 'projectile' ? 1.6 : 0.6);
    // Auto-reload an emptied magazine.
    if (def.mag > 0 && this.arsenal.loaded(id) === 0 && this.arsenal.startReload(id)) this.beginReloadFx(id);
  }

  private beginReloadFx(id: WeaponId): void {
    const def = WEAPONS[id];
    this.audio.reloadSound(id === 'magnum' ? 'magnum' : 'pistol', def.reloadTime);
    this.viewmodel.reload(def.reloadTime);
  }

  /**
   * The staff: hold to steer a magic circle across the ground, release to call
   * the lightning down on it. Unlimited uses, but a cooldown between casts.
   */
  private updateStaff(def: (typeof WEAPONS)['staff']): void {
    const down = this.input.isDown('attack');
    if (down && this.arsenal.cooldown <= 0) {
      this.staffTarget = this.spellTarget(def.range);
      this.ents.showSpellCircle(this.staffTarget, def.spell!.radius);
    } else if (!down && this.staffTarget) {
      const at = this.staffTarget;
      this.staffTarget = null;
      this.ents.showSpellCircle(null);
      const r = this.arsenal.fire('staff');
      if (r && r !== 'empty') {
        this.ents.castPlayerStrike(def, at);
        this.viewmodel.fire('spell', 1);
      }
    }
  }

  /** Where the aim meets the ground (up to `range` m), dropped to the floor below. */
  private spellTarget(range: number): [number, number, number] {
    const p = this.player;
    const d = this.aimDir(0);
    const ey = p.y + p.eye;
    const t = this.rayWorld(p.x, ey, p.z, d[0], d[1], d[2], range) ?? range;
    const x = p.x + d[0] * Math.max(0, t - 0.1);
    const z = p.z + d[2] * Math.max(0, t - 0.1);
    const y = ey + d[1] * t;
    let g = groundHeight(x, z, 0.2, y + 0.3, this.floorsNear(x, z), this.boxesNear(x, z));
    const th = this.terrainAt(x, z);
    if (th !== null && th <= y + 0.3 && th > g) g = th;
    return [x, Number.isFinite(g) ? g : p.y, z];
  }

  private updateWeapons(dt: number, active: boolean): void {
    const id = this.heldWeapon();
    const held = this.inventory.held;
    if ((!active || id !== 'staff') && this.staffTarget) {
      this.staffTarget = null;
      this.ents.showSpellCircle(null);
    }
    this.hud.setCooldown(id === 'staff' ? 1 - Math.max(0, this.arsenal.cooldown) / WEAPONS.staff.interval : null);
    if (held !== this.heldPrev) {
      this.heldPrev = held;
      this.arsenal.cancelReload();
      this.viewmodel.set(held);
      this.meleePending = -1;
    }
    this.arsenal.update(dt);
    const aiming = active && !!id && this.input.isDown('aim') && WEAPONS[id].kind !== 'melee';
    this.adsT += ((aiming ? 1 : 0) - this.adsT) * Math.min(1, dt * 14);
    if (active) {
      if (id) {
        if (WEAPONS[id].kind === 'spell') this.updateStaff(WEAPONS[id]);
        // Kunai keep flying while the button is held (when there are any left).
        else if (this.input.wasPressed('attack') || (WEAPONS[id].auto && this.input.isDown('attack') && this.arsenal.loaded(id) > 0)) this.fireWeapon(id);
        if (this.input.wasPressed('reload') && this.arsenal.startReload(id)) this.beginReloadFx(id);
      } else if (held === 'almond_water' && this.input.wasPressed('attack')) this.useHeld();
    }
    if (this.meleePending >= 0) {
      this.meleePending -= dt;
      if (this.meleePending < 0 && id === 'axe') this.ents.melee(WEAPONS.axe);
    }
    // Walk over thrown kunai to collect them.
    const got = this.ents.collectKunai();
    if (got) {
      this.arsenal.addAmmo('kunai', got);
      if (!this.inventory.has('kunai')) this.inventory.add('kunai');
      this.hud.message(t('msg.kunaiBack'), 1.2);
      this.audio.pickup();
    }
    this.viewmodel.update(dt, { aiming: this.adsT > 0.5 || aiming, bob: this.player.bobPhase, speed: this.player.speed, lookDX: this.lastLookDX, lookDY: this.lastLookDY });
    // HUD: reticle and ammo
    const s = this.settings;
    if (id) {
      const def = WEAPONS[id];
      const spread = this.currentSpread(id);
      const gap = (Math.tan(spread) / Math.tan(((this.camera.fov * Math.PI) / 180) / 2)) * (window.innerHeight / 2);
      this.hud.setCrosshair(gap, def.kind !== 'melee', s.crosshairSize, s.crosshairColor, s.crosshairDot, this.adsT);
      const loaded = this.arsenal.loaded(id);
      if (def.kind === 'melee' || def.kind === 'spell') this.hud.setAmmo(def.name, '', '', false);
      else if (def.mag === 0) this.hud.setAmmo(def.name, String(loaded), '', false);
      else this.hud.setAmmo(def.name, String(loaded), String(this.arsenal.reserve[def.ammo!]), !!this.arsenal.reloading);
    } else {
      this.hud.setCrosshair(0, true, s.crosshairSize * 0.6, s.crosshairColor, s.crosshairDot, 0);
      this.hud.setAmmo(null, '', '', false);
    }
  }

  // ---------------------------------------------------------------------------
  // Entities
  // ---------------------------------------------------------------------------

  private onEntityHit(kind: EntityKind, dmg: number): void {
    const k = this.settings.difficulty === 'easy' ? 0.7 : this.settings.difficulty === 'hard' ? 1.3 : 1;
    this.stats.damage(dmg * k);
    this.hud.jumpscare(this.settings.jumpscare, kind === 'smiler' ? '#f0f0e8' : kind === 'faceling' ? '#d8cfc4' : '#c8b8a8');
    this.audio.sting(this.settings.jumpscare === 'full' ? 1 : this.settings.jumpscare === 'mild' ? 0.5 : 0);
    this.audio.hurt();
    this.hud.message(t('msg.caught', { name: ENTITIES[kind].name }), 2);
    this.flickerT = 1.2;
    this.director.encounterOver({ rate: DIFFICULTY[this.settings.difficulty].entity, maxActive: 1 });
  }

  private updateEntities(dt: number): void {
    const tune = { rate: DIFFICULTY[this.settings.difficulty].entity, maxActive: this.settings.difficulty === 'hard' ? 4 : this.settings.difficulty === 'easy' ? 2 : 3 };
    const safe = this.isSafeSpot(this.player.x, this.player.z) || !!this.transition;
    const ev = this.director.update(dt, this.entityTable, this.ents.active, tune, safe);
    if (ev?.type === 'omen') {
      // Always a warning first (SPEC §7.1): a sound, flickering lights, the hum faltering.
      this.flickerT = 3;
      this.audio.humDip(2.5);
      const voice = ev.kind === 'hound' ? 'growl' : ev.kind === 'smiler' ? 'giggle' : ev.kind === 'skinstealer' ? 'help' : ev.kind === 'giant' ? 'stomp' : ev.kind === 'gunman' ? 'shot' : ev.kind === 'witch' ? 'zap' : ev.kind === 'bomber' ? 'hiss' : 'hum';
      this.audio.entityVoice(voice, (this.rng.float() - 0.5) * 2, 40);
      this.hud.subtitle(t('omen.' + ev.kind), 3.5);
    } else if (ev?.type === 'spawn') {
      if (!this.ents.trySpawn(ev.kind, () => this.rng.float())) this.director.retrySoon();
    }
    // Escape mode: once the conditions are met, the Bug keeps turning up (one at a time).
    if (this.mode === 'escape' && this.escape.stage === 'bug' && !this.transition && !this.inArena) {
      const alive = this.ents.entities.some((e) => e.kind === 'bug' && e.brain.hp > 0);
      if (!alive) {
        this.bugT -= dt;
        if (this.bugT <= 0) {
          if (this.ents.trySpawn('bug', () => this.rng.float())) {
            this.bugT = 10;
            this.audio.entityVoice('glitch', 0, 20);
            this.hud.subtitle(t('escape.bugNear'), 3.5);
          } else this.bugT = 2;
        }
      }
    }
    this.ents.update(dt);
  }

  // ---------------------------------------------------------------------------
  // Exits & transitions (SPEC §5)
  // ---------------------------------------------------------------------------

  private findExit(kind: ExitRule['kind'], filter?: (r: ExitRule) => boolean): ExitRule | undefined {
    return this.level.exits.find((r) => r.kind === kind && (!filter || filter(r)));
  }

  /** Leave through an exit. `back` is where the return anchor in the new level leads. */
  private takeExit(rule: ExitRule, exitKey: string, back: SpawnPoint, color = '#000'): void {
    let levelId = resolveExitTarget(this.worldSeed, this.level.id, rule, exitKey);
    // Escape mode: after the Bug, every way out leads home; from home, a door leads out.
    if (this.mode === 'escape') levelId = this.escape.overrideTarget(this.level.id, rule.kind) ?? levelId;
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
    // Falls, return doorways and the like also lead home once the Bug is gone.
    if (this.mode === 'escape' && tr.levelId !== ENDING_LEVEL) tr.levelId = this.escape.overrideTarget(this.level.id, 'other') ?? tr.levelId;
    if (tr.levelId === ENDING_LEVEL) tr.color = '#fff';
    this.transition = tr;
    this.hud.fadeTo(1, 1.6, tr.color);
    this.audio.whoosh();
  }

  private finishTransition(): void {
    const tr = this.transition!;
    const next = resolveLevel(tr.levelId);
    const ctx = makeGenContext(this.worldSeed, next);
    // Advance the escape stage before the level is built, so Level 0 is built "home" (glitched doors).
    this.arrivedStage = this.mode === 'escape' ? this.escape.arrive(tr.levelId) : null;
    const at = tr.at ?? next.arrival(ctx, tr.entry ?? 0);
    this.enterLevel(tr.levelId, at);
    if (!tr.at && next.topology !== 'closed') this.player.yaw = this.pickOpenYaw(at.yaw);
    this.entryPoint = { x: this.player.x, y: this.player.y, z: this.player.z, yaw: this.player.yaw };
    const ending = tr.levelId === ENDING_LEVEL;
    if (tr.back && !ending) this.placeAnchor(tr.back);
    this.transition = null;
    this.lastWarp = 0;
    this.hud.fadeTo(0, ending ? 2.5 : 0.7, tr.color);
    if (!ending) this.showLevelTitle();
    this.recordVisit();
    this.onArrive();
    if (tr.back && !ending) setTimeout(() => this.hud.message(t('msg.returnHere'), 4), 4500);
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
    // After the Bug every door opens: it leads home, and from home (Level 0) out into the real world.
    const forced = this.mode === 'escape' ? this.escape.doorTarget(this.level.id) : null;
    const rule: ExitRule | undefined = forced
      ? { kind: 'door', prop: p.kind, targets: [{ levelId: forced, weight: 1 }], discovery: forced === ENDING_LEVEL ? t('escape.discovery') : t('escape.doorHome') }
      : this.findExit('door', (r) => r.prop === p.kind);
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

    // depth: climbing or descending far enough (vertical worlds).
    const depthRule = this.findExit('depth');
    if (depthRule?.depth && Math.abs(this.player.y - this.entryPoint.y) > depthRule.depth) {
      this.takeExit(depthRule, `${Math.round(this.player.y / 20)}`, here);
      return;
    }

    // lava: burns and puts you back on the last safe ground.
    const lava = this.level.lava;
    if (lava && this.player.y < lava.y + 0.15) {
      this.stats.damage(lava.damage);
      this.hud.message(t('msg.lava'), 2);
      this.audio.noiseScratch();
      this.player.x = this.lastSafe.x;
      this.player.y = this.lastSafe.y;
      this.player.z = this.lastSafe.z;
      this.player.vy = 0;
      return;
    }
    if (this.player.grounded && (!lava || this.player.y > lava.y + 0.3)) {
      this.safeTimer += dt;
      if (this.safeTimer > 0.4) {
        this.safeTimer = 0;
        this.lastSafe = { x: this.player.x, y: this.player.y, z: this.player.z, yaw: this.player.yaw };
      }
    }

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
    const killY = this.level.fall?.killY ?? (this.level.vertical || this.level.topology === 'diagonal' ? -Infinity : -4);
    if (this.player.y < killY) {
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
    this.ents.clear();
    this.director.reset(this.entityTable.length > 0);
    this.chunks.loadAllSync(s.x, s.z, 1, s.y);
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

    if (this.endingTimer >= 0 && this.started && !overlay) {
      this.endingTimer += realDt;
      if (this.endingTimer > 12 && !this.creditsShown) {
        this.creditsShown = true;
        this.hud.showCredits(t('credits.roll'));
      }
      if (this.endingTimer > 44) {
        this.endingTimer = -1;
        this.hud.hideCredits();
        this.hud.message(t('escape.end'), 4);
        this.toTitle();
      }
    }
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
      // While aiming, sensitivity scales with the zoom (so the same flick covers the same on-screen distance)
      // times the player's ADS multiplier.
      const zoom = this.camera.fov / s.fov;
      const adsK = 1 + (s.adsSensitivity * zoom - 1) * this.adsT;
      const lookDX = (this.input.mouseDX * k * s.sensitivityX + this.input.padLook.x * pk) * adsK;
      const lookDY = (this.input.mouseDY * k * s.sensitivityY * inv + this.input.padLook.y * pk * pinv) * adsK;
      this.player.look(lookDX, lookDY);
      this.arsenal.aimedDown(lookDY); // pulling down pays off magnum kick
      this.lastLookDX = this.input.mouseDX;
      this.lastLookDY = this.input.mouseDY;
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
      this.ensureGround();
      this.player.step(dt, { forward, strafe: r, sprint: running, crouch, jump: this.input.wasPressed('jump') }, this.world);
      // Hard landings hurt (water breaks the fall).
      const inWater = this.player.landingSpeed < -4 && this.zoneAt(this.player.x, this.player.z, 'water');
      if (inWater) {
        this.audio.drink();
        this.player.landingSpeed = 0;
      }
      this.blastT += dt;
      if (this.blastAirborne && this.player.landingSpeed < -4) this.player.landingSpeed = -4.01; // rocket jump: no fall damage
      if (this.blastAirborne && this.player.grounded && this.blastT > 0.25) this.blastAirborne = false;
      if (this.player.landingSpeed < -11) {
        this.stats.damage((-this.player.landingSpeed - 11) * 6);
        this.audio.footstep(1.8, this.level.footstep);
        this.hud.message(t('msg.hardLanding'), 1.5);
      } else if (this.player.landingSpeed < -4) this.audio.footstep(1.2, this.level.footstep);
      this.player.landingSpeed = 0;
    }

    if (this.started && this.inArena && this.lab.options.god) this.stats.health = 100;
    this.updateLab(dt);
    if (this.started && this.deadTimer <= 0 && !this.transition) {
      const cause = this.stats.update(dt, {
        running: running && this.player.speed > 1,
        drainMul: this.level.drainMul,
        difficulty: s.difficulty,
      });
      if (cause) this.die(cause);
      this.updateExits(realDt, moving, forward);
      this.updateDrifters(realDt);
      this.updateEntities(dt);
    }

    // Level 0 slowly rearranges itself behind you (SPEC §3.4): chunks generated
    // after every ~350m of walking use a new epoch.
    if (this.level.id === '0') this.ctx.epoch = s.nonEuclidean ? Math.floor(this.player.distanceWalked / 350) : 0;
    this.chunks.update(this.player.x, this.player.z, this.player.dirX, this.player.dirZ, this.player.y);
    if (this.origin.update(this.player.x, this.player.z)) {
      for (const c of this.chunks.chunks.values()) this.placeChunk(c.handle.group);
    }
    for (const a of this.anchors[this.level.id] ?? []) {
      if (!a.mesh) continue;
      a.mesh.position.set(this.origin.toRenderX(a.x), a.y, this.origin.toRenderZ(a.z));
      const glow = a.mesh.children[3] as THREE.Mesh;
      (glow.material as THREE.MeshBasicMaterial).opacity = 0.45 + Math.sin(this.time * 2) * 0.12;
    }

    this.updateWeapons(dt, active && this.level.id !== ENDING_LEVEL);

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
    // An entity is near: every tube stutters for a moment.
    if (this.flickerT > 0) {
      this.flickerT -= realDt;
      const on = Math.sin(this.time * (s.reduceFlicker ? 6 : 22)) > -0.2;
      this.mats.lightOn.color.setHex(this.level.palette.lightColor).multiplyScalar(on ? 1 : s.reduceFlicker ? 0.7 : 0.25);
    } else this.mats.lightOn.color.setHex(this.level.palette.lightColor);

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
    // Smooth the view height over steps and slopes; follow jumps and falls exactly.
    const dyCam = this.player.y - this.camY;
    if (!this.player.grounded || Math.abs(dyCam) > 1.5) this.camY = this.player.y;
    else {
      this.camY += dyCam * (1 - Math.exp(-realDt * 12));
      // Never lag far behind (keeps the eye out of the floor on fast climbs).
      this.camY = Math.max(this.player.y - 0.7, Math.min(this.player.y + 0.7, this.camY));
    }
    this.camera.position.set(
      this.origin.toRenderX(this.player.x),
      this.camY + this.player.eye + bob - sink,
      this.origin.toRenderZ(this.player.z),
    );
    this.camera.rotation.set(
      this.player.pitch + Math.sin(this.time * 1.3) * sway,
      this.player.yaw + Math.sin(this.time * 0.9) * sway,
      Math.sin(this.time * 0.7) * sway + Math.sin(this.time * 9) * warp * 0.03 * shakeK,
    );
    const wid = this.heldWeapon();
    const zoomK = wid ? 1 + (WEAPONS[wid].adsZoom - 1) * this.adsT : 1;
    const fov = s.fov * zoomK + warp * 18 * shakeK;
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
    this.crowd?.update(realDt, this.player, (x, z) => [this.origin.toRenderX(x), this.origin.toRenderZ(z)]);
    this.audio.updateReality(realDt);
    if (this.level.sky) this.sky.update(this.camera, this.time);
    waterTime.value = this.time;
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
