/**
 * A small 3D turntable for menus (skin selection, the bestiary): its own
 * canvas and renderer, the model spinning slowly, drag to turn it yourself.
 * Models use unlit (basic) materials, so no lights are needed.
 */
import * as THREE from 'three';

export class ModelViewer {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 0.05, 200);
  private holder = new THREE.Group();
  private model: THREE.Object3D | null = null;
  private yaw = 0.5;
  private pitch = 0.12;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private idle = 0;
  private raf = 0;
  private running = false;
  private lastT = 0;
  /** Called when a model is removed (dispose its geometries/materials). */
  private dispose: ((o: THREE.Object3D) => void) | null = null;

  constructor(width: number, height: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.cssText = `width:${width}px;height:${height}px;max-width:100%;cursor:grab;touch-action:none;display:block;background:radial-gradient(circle at 50% 40%, #3a3418, #0d0c06);border:1px solid #4d4420;`;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.scene.add(this.holder);
    // A floor disc so the model stands on something.
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0x2a2614 }));
    disc.rotation.x = -Math.PI / 2;
    disc.name = 'floor';
    this.scene.add(disc);
    this.canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.canvas.setPointerCapture(e.pointerId);
      this.canvas.style.cursor = 'grabbing';
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.yaw += (e.clientX - this.lastX) * 0.012;
      this.pitch = Math.max(-0.4, Math.min(1.1, this.pitch + (e.clientY - this.lastY) * 0.008));
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.idle = 0;
    });
    const up = () => {
      this.dragging = false;
      this.canvas.style.cursor = 'grab';
    };
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', up);
  }

  /** Show a model (feet at y = 0). `dispose` frees the previous one. */
  show(model: THREE.Object3D, dispose: (o: THREE.Object3D) => void): void {
    if (this.model) this.dispose?.(this.model);
    this.dispose = dispose;
    this.model = model;
    this.holder.add(model);
    // Fit the camera to the model's size.
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const h = Math.max(0.5, size.y, size.x * 0.9, size.z * 0.9);
    this.fitH = h;
    this.centerY = box.min.y + size.y / 2;
    const disc = this.scene.getObjectByName('floor')!;
    disc.scale.setScalar(Math.max(0.7, Math.max(size.x, size.z) * 0.75));
    this.idle = 0;
  }

  private fitH = 1.8;
  private centerY = 0.9;

  start(): void {
    if (this.running) return;
    if (!this.renderer) {
      try {
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(this.canvas.width, this.canvas.height, false);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      } catch {
        return; // no WebGL for a second context: the menu still works without the preview
      }
    }
    this.running = true;
    this.lastT = performance.now();
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.1, (now - this.lastT) / 1000);
      this.lastT = now;
      // Spin slowly unless the player is turning it.
      this.idle += dt;
      if (!this.dragging && this.idle > 1.5) this.yaw += dt * 0.6;
      const dist = this.fitH * 1.9 + 0.6;
      const cp = Math.cos(this.pitch);
      this.camera.position.set(Math.sin(this.yaw) * cp * dist, this.centerY + Math.sin(this.pitch) * dist, Math.cos(this.yaw) * cp * dist);
      this.camera.lookAt(0, this.centerY, 0);
      this.renderer!.render(this.scene, this.camera);
    };
    loop();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
