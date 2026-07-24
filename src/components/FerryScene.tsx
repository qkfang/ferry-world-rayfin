import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

import { CONFIG } from '@/shared/config';
import { fetchFerries, fetchReferenceLocations } from '@/services/ferryService';
import { connectDataInteractive, KustoInteractionRequiredError } from '@/services/kustoClient';
import { FerryManager } from '@/three/FerryManager';
import { Harbour } from '@/three/Harbour';
import { SceneEngine } from '@/three/SceneEngine';

interface Boarded {
  id: string;
  destination: string;
}

export function FerryScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<SceneEngine | null>(null);
  const ferriesRef = useRef<FerryManager | null>(null);

  const [count, setCount] = useState(0);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [mode, setMode] = useState<'orbit' | 'fps'>('orbit');
  const [boarded, setBoarded] = useState<Boarded | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const engine = new SceneEngine(canvas);
    const harbour = new Harbour();
    const ferryMgr = new FerryManager();
    engineRef.current = engine;
    ferriesRef.current = ferryMgr;

    engine.addToScene(harbour.group);
    engine.addToScene(ferryMgr.group);
    engine.onUpdate((dt, elapsed) => {
      harbour.update(elapsed);
      ferryMgr.update(dt, elapsed);
    });
    engine.start();

    // Size to container.
    const resize = () => {
      const { clientWidth, clientHeight } = canvas.parentElement!;
      engine.resize(clientWidth, clientHeight);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    // Wharves (once).
    const abort = new AbortController();
    void fetchReferenceLocations(abort.signal).then((r) => harbour.setWharves(r.locations));

    // Poll ferries.
    let stopped = false;
    const poll = async () => {
      try {
        const feed = await fetchFerries(abort.signal);
        if (stopped) return;
        ferryMgr.ingest(feed.ferries);
        setCount(ferryMgr.count);
        setAsOf(feed.asOf);
        setError(null);
        setNeedsAuth(false);
      } catch (e) {
        if (stopped) return;
        if (e instanceof KustoInteractionRequiredError) {
          setNeedsAuth(true);
        } else {
          setError((e as Error).message);
        }
      }
    };
    void poll();
    const timer = window.setInterval(poll, CONFIG.pollMs);

    // Click-to-board (center-screen in FPS, cursor elsewhere).
    const raycaster = engine.raycaster;
    const onClick = (ev: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2();
      if (engine.getMode() === 'fps') {
        ndc.set(0, 0);
      } else {
        ndc.set(
          ((ev.clientX - rect.left) / rect.width) * 2 - 1,
          -((ev.clientY - rect.top) / rect.height) * 2 + 1,
        );
      }
      raycaster.setFromCamera(ndc, engine.camera);
      const hits = raycaster.intersectObjects(ferryMgr.boardableHulls(), false);
      if (hits.length) board(hits[0].object);
    };

    const board = (hull: THREE.Object3D) => {
      const info = ferryMgr.infoForHull(hull);
      const grp = ferryMgr.groupForHull(hull);
      if (!info || !grp) return;
      engine.enterFps();
      grp.add(engine.camera);
      engine.camera.position.set(0, 16, -2);
      engine.camera.lookAt(0, 12, 40);
      setMode('fps');
      setBoarded(info);
    };

    canvas.addEventListener('dblclick', onClick);
    const onLockChange = () => {
      if (!document.pointerLockElement && engine.getMode() === 'fps') {
        // user pressed Esc — treat as leaving walk mode
      }
    };
    document.addEventListener('pointerlockchange', onLockChange);

    return () => {
      stopped = true;
      abort.abort();
      window.clearInterval(timer);
      ro.disconnect();
      canvas.removeEventListener('dblclick', onClick);
      document.removeEventListener('pointerlockchange', onLockChange);
      engine.dispose();
    };
  }, []);

  const toggleWalk = () => {
    const engine = engineRef.current!;
    if (engine.getMode() === 'fps') {
      engine.exitFps();
      setMode('orbit');
      setBoarded(null);
    } else {
      engine.enterFps();
      setMode('fps');
    }
  };

  const disembark = () => {
    const engine = engineRef.current!;
    engine.exitFps();
    setMode('orbit');
    setBoarded(null);
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <canvas ref={canvasRef} className="block h-full w-full" />

      {/* Title / status */}
      <div className="pointer-events-none absolute left-5 top-4 select-none">
        <h1 className="text-xl font-semibold text-white drop-shadow">
          Sydney Ferries · Live Ferries
        </h1>
        <p className="mt-1 text-sm text-white/80 drop-shadow">
          {count} ferries live
          {asOf ? ` · updated ${new Date(asOf).toLocaleTimeString()}` : ''}
        </p>
        {error && (
          <p className="mt-1 max-w-md text-xs text-red-200 drop-shadow">
            Feed error: {error}
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="absolute right-5 top-4 flex flex-col items-end gap-2">
        <button
          onClick={toggleWalk}
          className="rounded-lg bg-white/90 px-3 py-1.5 text-sm font-medium text-slate-800 shadow hover:bg-white"
        >
          {mode === 'fps' ? 'Overview' : 'Walk the harbour'}
        </button>
        {boarded && (
          <button
            onClick={disembark}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-emerald-500"
          >
            Disembark
          </button>
        )}
      </div>

      {/* Boarded card */}
      {boarded && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-slate-900/80 px-4 py-2 text-center text-white shadow-lg">
          <div className="text-sm font-semibold">Aboard {boarded.id}</div>
          <div className="text-xs text-white/75">{boarded.destination || 'In service'}</div>
        </div>
      )}

      {/* Crosshair in walk mode */}
      {mode === 'fps' && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/70" />
      )}

      {/* One-time connect prompt when the Eventhouse token needs interaction. */}
      {needsAuth && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50">
          <div className="max-w-sm rounded-2xl bg-slate-900/90 px-6 py-5 text-center text-white shadow-2xl">
            <div className="text-base font-semibold">Connect live ferry data</div>
            <p className="mt-1 text-sm text-white/75">
              Sign in once to authorise access to the Eventhouse. This is only
              needed the first time.
            </p>
            <button
              onClick={() => {
                void connectDataInteractive().catch((e) =>
                  setError((e as Error).message),
                );
              }}
              className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-emerald-500"
            >
              Connect live data
            </button>
          </div>
        </div>
      )}

      {/* Help */}
      <div className="pointer-events-none absolute bottom-4 left-5 text-xs text-white/70 drop-shadow">
        {mode === 'fps' ? (
          <>WASD/Arrows move · Space/C up-down · Shift boost · click a ferry to board · Esc to release cursor</>
        ) : (
          <>Drag to orbit · scroll to zoom · double-click a ferry to board</>
        )}
      </div>
    </div>
  );
}
