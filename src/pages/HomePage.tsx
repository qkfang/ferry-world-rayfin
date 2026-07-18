import { useRef, useState } from 'react';

import { CesiumView, type CesiumHandle, type CesiumStatus } from '@/components/CesiumView';
import { FerryVoxelView } from '@/components/FerryVoxelView';
import { SidePanel } from '@/components/SidePanel';
import { useAuth } from '@/hooks/AuthContext';
import { connectDataInteractive } from '@/services/kustoClient';

export function HomePage() {
  const { signOut } = useAuth();
  const cesium = useRef<CesiumHandle>(null);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [status, setStatus] = useState<CesiumStatus>({
    count: 0,
    asOf: null,
    photoreal: false,
    needsAuth: false,
  });

  const updated = status.asOf ? new Date(status.asOf).toLocaleTimeString() : null;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#0a1826]">
      {/* ── App chrome ─────────────────────────────────────────────────────── */}
      <header className="z-40 flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-slate-950/80 px-4 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#00843D]/20 text-lg text-emerald-300 ring-1 ring-[#00843D]/40">
            ⚓
          </span>
          <div className="leading-tight">
            <h1 className="text-[15px] font-semibold tracking-wide text-white">Sydney Harbour</h1>
            <p className="text-[11px] text-white/45">Live Ferry Tracker</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white ring-1 ring-white/10">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px] shadow-emerald-400" />
            <span className="tabular-nums">{status.count}</span> live
            {updated && <span className="text-white/40">· {updated}</span>}
          </span>
          <span className="hidden rounded-full bg-white/[0.06] px-3 py-1.5 text-[11px] font-medium text-white/60 ring-1 ring-white/10 sm:inline">
            Cesium · {status.photoreal ? 'photoreal 3D' : 'OSM 3D'}
          </span>
          {status.needsAuth && (
            <button
              onClick={() => void connectDataInteractive()}
              className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow ring-1 ring-emerald-400/40 transition-colors hover:bg-emerald-500"
            >
              Connect live data
            </button>
          )}
          <button
            onClick={() => void signOut()}
            className="rounded-full px-3 py-1.5 text-xs font-medium text-white/55 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Sign out"
          >
            Sign out
          </button>
        </div>
      </header>
      {/* TfNSW green brand accent */}
      <div className="h-0.5 w-full shrink-0 bg-gradient-to-r from-[#00843D] via-emerald-400 to-transparent" />

      {/* ── Map canvas (framed like an app surface) ────────────────────────── */}
      <main className="relative min-h-0 flex-1 p-3">
        <div className="relative h-full w-full overflow-hidden rounded-2xl ring-1 ring-white/10 shadow-2xl">
          <CesiumView ref={cesium} onStatus={setStatus} onSelectFerry={setSelected} />
          <SidePanel onSelectFerry={(lon, lat) => cesium.current?.flyToFerry(lon, lat)} />
        </div>
      </main>

      {selected && (
        <FerryVoxelView
          vesselId={selected.id}
          vesselName={selected.name}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
