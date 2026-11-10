/** The item in your hands: hip/ADS poses, kick, reload, swing, throw and muzzle flash. */
import * as THREE from 'three';
import type { ItemId } from '../items/itemDefs';
import { ITEMS } from '../items/itemDefs';
import { buildWeaponModel } from './weaponModels';
import { buildItemMesh } from '../world/objectMeshes';

interface Pose {
  hip: THREE.Vector3;
  ads: THREE.Vector3;
  rot: THREE.Euler;
}

const POSES: Record<string, Pose> = {
  pistol: { hip: new THREE.Vector3(0.17, -0.16, -0.36), ads: new THREE.Vector3(0, -0.1, -0.36), rot: new THREE.Euler(0, 0, 0) },
  magnum: { hip: new THREE.Vector3(0.17, -0.17, -0.36), ads: new THREE.Vector3(0, -0.13, -0.4), rot: new THREE.Euler(0, 0, 0) },
  kunai: { hip: new THREE.Vector3(0.2, -0.17, -0.34), ads: new THREE.Vector3(0.14, -0.16, -0.34), rot: new THREE.Euler(0.1, 0.25, 0.4) },
  rocket: { hip: new THREE.Vector3(0.26, -0.22, -0.5), ads: new THREE.Vector3(0.13, -0.2, -0.5), rot: new THREE.Euler(0, 0.05, 0) },
  shotgun: { hip: new THREE.Vector3(0.18, -0.17, -0.34), ads: new THREE.Vector3(0, -0.12, -0.36), rot: new THREE.Euler(0, 0, 0) },
  staff: { hip: new THREE.Vector3(0.22, -0.2, -0.36), ads: new THREE.Vector3(0.16, -0.18, -0.36), rot: new THREE.Euler(0.35, 0.1, 0.15) },
  axe: { hip: new THREE.Vector3(0.24, -0.22, -0.25), ads: new THREE.Vector3(0.2, -0.2, -0.25), rot: new THREE.Euler(0.5, 0.15, 0.25) },
  almond_water: { hip: new THREE.Vector3(0.2, -0.24, -0.38), ads: new THREE.Vector3(0.2, -0.24, -0.38), rot: new THREE.Euler(0, 0, 0) },
};

export class ViewModel {
  readonly root = new THREE.Group();
  private holder = new THREE.Group();
  private model: THREE.Object3D | null = null;
  private current: ItemId | null = null;
  private flash: THREE.Mesh;
  private flashT = 0;
  private kickT = 0;
  private kickAmt = 0;
  private swingT = -1;
  private throwT = -1;
  private raiseT = 1;
  private reloadT = -1;
  private reloadDur = 1;
  /** 0 = hip, 1 = fully aimed. */
  ads = 0;

  constructor(camera: THREE.Camera) {
    camera.add(this.root);
    this.root.add(this.holder);
    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xffd890, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.flash.renderOrder = 10;
  }

  set(id: ItemId | null): void {
    if (id === this.current) return;
    this.current = id;
    if (this.model) {
      this.model.removeFromParent();
      this.model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && !m.userData.sharedGeo) m.geometry.dispose();
      });
    }
    this.model = null;
    this.reloadT = -1;
    if (!id) return;
    const def = ITEMS[id];
    if (def.kind === 'weapon') this.model = buildWeaponModel(def.weapon!, 0.95);
    else if (id === 'almond_water') this.model = buildItemMesh(id, 0.9);
    if (!this.model) return;
    this.holder.add(this.model);
    const muzzle = this.model.getObjectByName('muzzle');
    if (muzzle) muzzle.add(this.flash);
    this.raiseT = 0;
  }

  /** Fired: visual kick (and flash for guns). */
  fire(kind: 'hitscan' | 'projectile' | 'thrown' | 'melee' | 'spell', strength: number): void {
    if (kind === 'melee') this.swingT = 0;
    else if (kind === 'thrown' || kind === 'spell') this.throwT = 0;
    else {
      this.kickT = 0;
      this.kickAmt = strength;
      this.flashT = 0.05;
      this.flash.rotation.z = Math.random() * Math.PI;
    }
  }

  reload(duration: number): void {
    this.reloadT = 0;
    this.reloadDur = duration;
  }

  update(dt: number, opts: { aiming: boolean; bob: number; speed: number; lookDX: number; lookDY: number }): void {
    const pose = POSES[this.current ?? 'pistol'] ?? POSES.pistol;
    this.ads += ((opts.aiming ? 1 : 0) - this.ads) * Math.min(1, dt * 14);
    const p = pose.hip.clone().lerp(pose.ads, this.ads);
    // Sway and bob (smaller while aiming)
    const k = 1 - this.ads * 0.85;
    p.x += Math.sin(opts.bob) * 0.008 * k * Math.min(1, opts.speed / 3) - opts.lookDX * 0.0004 * k;
    p.y += Math.abs(Math.cos(opts.bob)) * 0.008 * k * Math.min(1, opts.speed / 3) + opts.lookDY * 0.0004 * k;
    // Raise when switching
    this.raiseT = Math.min(1, this.raiseT + dt * 4);
    p.y -= (1 - this.raiseT) * 0.25;
    const rot = pose.rot.clone();
    rot.x *= 1 - this.ads;
    rot.y *= 1 - this.ads;
    rot.z *= 1 - this.ads;
    // Kick: snap back, pitch up, recover
    if (this.kickT >= 0) {
      this.kickT += dt;
      const e = Math.exp(-this.kickT * 18);
      p.z += 0.05 * this.kickAmt * e;
      rot.x += 0.25 * this.kickAmt * e;
      if (this.kickT > 0.5) this.kickT = -1;
    }
    // Reload: dip and roll
    if (this.reloadT >= 0) {
      this.reloadT += dt;
      const t = Math.min(1, this.reloadT / this.reloadDur);
      const d = Math.sin(t * Math.PI);
      p.y -= 0.12 * d;
      rot.z += 0.6 * d;
      rot.x += 0.3 * d;
      if (t >= 1) this.reloadT = -1;
    }
    // Axe swing: wind up, chop down across
    if (this.swingT >= 0) {
      this.swingT += dt;
      const t = this.swingT / 0.45;
      const a = t < 0.3 ? -t / 0.3 : t < 0.6 ? -1 + ((t - 0.3) / 0.3) * 2.2 : 1.2 - (t - 0.6) * 3;
      rot.x += a * 1.1;
      rot.y -= a * 0.4;
      p.x -= a * 0.08;
      if (t > 1) this.swingT = -1;
    }
    // Kunai throw: arm forward
    if (this.throwT >= 0) {
      this.throwT += dt;
      const t = this.throwT / 0.3;
      const a = Math.sin(Math.min(1, t) * Math.PI);
      p.z -= 0.15 * a;
      rot.x -= 0.5 * a;
      if (t > 1) this.throwT = -1;
    }
    this.holder.position.copy(p);
    this.holder.rotation.copy(rot);
    // Muzzle flash
    this.flashT -= dt;
    (this.flash.material as THREE.MeshBasicMaterial).opacity = this.flashT > 0 ? 0.95 : 0;
    this.flash.scale.setScalar(this.flashT > 0 ? 1 + Math.random() * 0.6 : 1);
  }

  get muzzleWorld(): THREE.Vector3 {
    const m = this.model?.getObjectByName('muzzle');
    return m ? m.getWorldPosition(new THREE.Vector3()) : this.root.getWorldPosition(new THREE.Vector3());
  }
}
