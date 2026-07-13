import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import { CONFIG } from '@/shared/config';

export type CameraMode = 'orbit' | 'fps';

/**
 * Framework-agnostic Three.js scene: renderer, camera, lights, water, and a
 * render loop that drives a list of per-frame updaters. Knows nothing about
 * React. Owns both an orbit camera (overview) and pointer-lock FPS controls.
 */
export class SceneEngine {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly raycaster = new THREE.Raycaster();

  private readonly clock = new THREE.Clock();
  private readonly orbit: OrbitControls;
  private readonly fps: PointerLockControls;
  private readonly updaters: ((dt: number, elapsed: number) => void)[] = [];
  private readonly keys = new Set<string>();
  private raf = 0;
  private mode: CameraMode = 'orbit';
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    const { colors } = CONFIG;
    this.scene.background = new THREE.Color(colors.sky);
    this.scene.fog = new THREE.Fog(colors.fog, 3000, 16000);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.5, 30000);
    // Postcard view: high over the harbour looking NW across the channel to the
    // Bridge, Opera House and CBD skyline.
    this.camera.position.set(1500, 900, 1700);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // ACES tone mapping + a small exposure lift gives PBR surfaces (the ferry's
    // white superstructure, glazing and metal) a more photographic response.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    // Image-based lighting: a neutral studio environment supplies soft
    // reflections + ambient so glass, metal and painted surfaces read as real
    // materials rather than flat colours. Kept subtle so the daylit harbour
    // palette is unchanged.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;

    // Lighting: soft daylight.
    const hemi = new THREE.HemisphereLight(colors.sky, colors.waterDeep, 0.9);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff6e0, 1.1);
    sun.position.set(-800, 1400, 600);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -3000;
    sun.shadow.camera.right = 3000;
    sun.shadow.camera.top = 3000;
    sun.shadow.camera.bottom = -3000;
    sun.shadow.camera.far = 6000;
    this.scene.add(sun);

    // Orbit controls for the overview camera.
    this.orbit = new OrbitControls(this.camera, canvas);
    this.orbit.enableDamping = true;
    this.orbit.maxPolarAngle = Math.PI * 0.495;
    this.orbit.minDistance = 40;
    this.orbit.maxDistance = 9000;
    this.orbit.target.set(0, 0, -250);

    // Pointer-lock FPS controls (share the same camera).
    this.fps = new PointerLockControls(this.camera, canvas);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  addToScene(obj: THREE.Object3D): void {
    this.scene.add(obj);
  }

  onUpdate(fn: (dt: number, elapsed: number) => void): void {
    this.updaters.push(fn);
  }

  getMode(): CameraMode {
    return this.mode;
  }

  /** Enter first-person walk/fly mode from the camera's current position. */
  enterFps(): void {
    if (this.mode === 'fps') return;
    this.mode = 'fps';
    this.orbit.enabled = false;
    this.fps.lock();
  }

  /** Return to the orbiting overview camera. */
  exitFps(): void {
    if (this.mode === 'orbit') return;
    this.mode = 'orbit';
    this.fps.unlock();
    this.orbit.enabled = true;
    // Detach camera from any parent (e.g. a ferry) back to world space.
    if (this.camera.parent && this.camera.parent !== this.scene) {
      this.camera.getWorldPosition(this.camera.position);
      this.scene.add(this.camera);
    }
  }

  get fpsControls(): PointerLockControls {
    return this.fps;
  }

  start(): void {
    const tick = () => {
      if (this.disposed) return;
      const dt = Math.min(this.clock.getDelta(), 0.1);
      const elapsed = this.clock.elapsedTime;
      if (this.mode === 'fps' && this.fps.isLocked) this.moveFps(dt);
      if (this.mode === 'orbit') this.orbit.update();
      for (const u of this.updaters) u(dt, elapsed);
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.orbit.dispose();
    this.renderer.dispose();
  }

  private moveFps(dt: number): void {
    const speed = CONFIG.walkSpeed * (this.keys.has('shiftleft') ? 3 : 1) * dt;
    if (this.keys.has('keyw') || this.keys.has('arrowup')) this.fps.moveForward(speed);
    if (this.keys.has('keys') || this.keys.has('arrowdown')) this.fps.moveForward(-speed);
    if (this.keys.has('keya') || this.keys.has('arrowleft')) this.fps.moveRight(-speed);
    if (this.keys.has('keyd') || this.keys.has('arrowright')) this.fps.moveRight(speed);
    if (this.keys.has('space')) this.camera.position.y += speed;
    if (this.keys.has('keyc')) this.camera.position.y -= speed;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code.toLowerCase());
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code.toLowerCase());
  };
}
