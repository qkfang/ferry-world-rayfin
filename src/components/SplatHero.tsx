import { useEffect, useRef } from 'react';

/**
 * "Dive-in" hero view: a Babylon.js scene that renders a Gaussian Splat
 * environment (loaded from a URL — a public sample by default, or your own
 * OneLake capture via VITE_SPLAT_URL) with a low-poly ferry model and a slow
 * chase/orbit camera. Babylon is loaded lazily so it never weighs down the map.
 *
 * Gaussian Splatting is native to Babylon.js (Microsoft's 3D engine) — the same
 * capability Icon Map for Fabric surfaces in Power BI, but here inside a custom
 * Rayfin app alongside the live ferry telemetry.
 */

export interface HeroFerry {
  id: string;
  name: string;
  destination: string;
  headingDeg?: number;
  speedKn?: number;
  lastSeenMs?: number;
}

const SPLAT_URL =
  import.meta.env.VITE_SPLAT_URL || 'https://assets.babylonjs.com/splats/gs_Skull.splat';

function ageLabel(lastSeenMs?: number): string {
  if (!lastSeenMs) return '—';
  const s = Math.max(0, Math.round((Date.now() - lastSeenMs) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

export function SplatHero({ ferry, onClose }: { ferry: HeroFerry | null; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!ferry) return;
    const canvas = canvasRef.current!;
    let dispose: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      const BABYLON = await import('@babylonjs/core');
      if (cancelled) return;

      const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
      const scene = new BABYLON.Scene(engine);
      scene.clearColor = new BABYLON.Color4(0.04, 0.09, 0.15, 1);

      const camera = new BABYLON.ArcRotateCamera(
        'cam',
        Math.PI / 3,
        Math.PI / 2.6,
        14,
        BABYLON.Vector3.Zero(),
        scene,
      );
      camera.attachControl(canvas, true);
      camera.lowerRadiusLimit = 4;
      camera.upperRadiusLimit = 60;
      camera.wheelDeltaPercentage = 0.02;
      camera.useAutoRotationBehavior = true;
      if (camera.autoRotationBehavior) camera.autoRotationBehavior.idleRotationSpeed = 0.25;

      new BABYLON.HemisphericLight('h', new BABYLON.Vector3(0, 1, 0), scene).intensity = 1.1;
      const sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-1, -2, -1), scene);
      sun.intensity = 1.2;

      // ── Gaussian Splat environment ─────────────────────────────────────────
      try {
        const gs = new BABYLON.GaussianSplattingMesh('splat', null, scene);
        await gs.loadFileAsync(SPLAT_URL);
        if (cancelled) {
          engine.dispose();
          return;
        }
        gs.position = new BABYLON.Vector3(7, 0, 0);
        gs.scaling = new BABYLON.Vector3(2, 2, 2);
      } catch {
        /* splat optional — ferry still renders */
      }

      // ── Low-poly TfNSW ferry model ─────────────────────────────────────────
      const ferryNode = new BABYLON.TransformNode('ferry', scene);
      const white = new BABYLON.StandardMaterial('white', scene);
      white.diffuseColor = new BABYLON.Color3(0.95, 0.96, 0.97);
      const green = new BABYLON.StandardMaterial('green', scene);
      green.diffuseColor = new BABYLON.Color3(0.04, 0.49, 0.25);
      const yellow = new BABYLON.StandardMaterial('yellow', scene);
      yellow.diffuseColor = new BABYLON.Color3(0.95, 0.75, 0);
      const dark = new BABYLON.StandardMaterial('dark', scene);
      dark.diffuseColor = new BABYLON.Color3(0.14, 0.2, 0.24);

      const hull = BABYLON.MeshBuilder.CreateBox('hull', { width: 2.2, height: 0.9, depth: 5.2 }, scene);
      hull.material = green;
      hull.parent = ferryNode;
      const band = BABYLON.MeshBuilder.CreateBox('band', { width: 2.3, height: 0.35, depth: 5.3 }, scene);
      band.position.y = -0.35;
      band.material = yellow;
      band.parent = ferryNode;
      const deck = BABYLON.MeshBuilder.CreateBox('deck', { width: 1.8, height: 0.9, depth: 3.6 }, scene);
      deck.position.y = 0.9;
      deck.material = white;
      deck.parent = ferryNode;
      const windows = BABYLON.MeshBuilder.CreateBox('win', { width: 1.85, height: 0.4, depth: 3.65 }, scene);
      windows.position.y = 0.95;
      windows.material = dark;
      windows.parent = ferryNode;
      const cabin = BABYLON.MeshBuilder.CreateBox('cabin', { width: 1.4, height: 0.7, depth: 2 }, scene);
      cabin.position.y = 1.7;
      cabin.material = white;
      cabin.parent = ferryNode;
      const bow = BABYLON.MeshBuilder.CreateCylinder('bow', { diameterTop: 0, diameterBottom: 2.2, height: 1.6, tessellation: 4 }, scene);
      bow.rotation.x = Math.PI / 2;
      bow.rotation.y = Math.PI / 4;
      bow.position.z = 3.4;
      bow.material = green;
      bow.parent = ferryNode;

      // Gentle bob.
      let t = 0;
      engine.runRenderLoop(() => {
        t += engine.getDeltaTime() / 1000;
        ferryNode.position.y = Math.sin(t * 1.2) * 0.15;
        ferryNode.rotation.z = Math.sin(t * 0.9) * 0.03;
        scene.render();
      });

      const onResize = () => engine.resize();
      window.addEventListener('resize', onResize);

      dispose = () => {
        window.removeEventListener('resize', onResize);
        engine.stopRenderLoop();
        scene.dispose();
        engine.dispose();
      };
    })();

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [ferry]);

  if (!ferry) return null;

  const usingSample = !import.meta.env.VITE_SPLAT_URL;

  return (
    <div className="absolute inset-0 z-[1000] flex flex-col bg-[#0a1826]">
      <canvas ref={canvasRef} className="h-full w-full outline-none" />

      {/* Detail panel */}
      <div className="pointer-events-none absolute left-5 top-5 w-72 rounded-xl bg-slate-900/85 p-4 text-white shadow-2xl backdrop-blur">
        <div className="text-xs uppercase tracking-wide text-emerald-400">Now boarding</div>
        <div className="mt-0.5 text-xl font-semibold">{ferry.name}</div>
        <div className="mt-0.5 text-sm text-white/70">{ferry.destination || 'In service'}</div>
        <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-white/50">Speed</dt>
          <dd>{ferry.speedKn != null ? `${ferry.speedKn.toFixed(1)} kn` : '—'}</dd>
          <dt className="text-white/50">Heading</dt>
          <dd>{ferry.headingDeg != null ? `${Math.round(ferry.headingDeg)}°` : '—'}</dd>
          <dt className="text-white/50">Last seen</dt>
          <dd>{ageLabel(ferry.lastSeenMs)}</dd>
        </dl>
        {usingSample && (
          <p className="mt-3 text-[11px] leading-snug text-amber-300/90">
            Sample Gaussian splat. Point <code>VITE_SPLAT_URL</code> at your OneLake capture to
            replace it.
          </p>
        )}
      </div>

      <button
        onClick={onClose}
        className="absolute right-5 top-5 rounded-lg bg-white/90 px-3 py-1.5 text-sm font-medium text-slate-800 shadow hover:bg-white"
      >
        ← Back to map
      </button>

      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/60">
        Drag to orbit · scroll to zoom · Babylon.js Gaussian Splatting
      </div>
    </div>
  );
}
