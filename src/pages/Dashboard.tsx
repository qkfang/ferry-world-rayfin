import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { AnchorIcon, LogOutIcon, ShipIcon } from 'lucide-react';

import { SiteList } from '@/components/SiteList';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/AuthContext';
import { useSites } from '@/hooks/useSites';

import type { TourismSite } from '../../rayfin/data/TourismSite';

// three.js is heavy; load the voxel scene as its own chunk.
const HarbourScene = lazy(() =>
  import('@/components/HarbourScene').then((m) => ({ default: m.HarbourScene }))
);

export function Dashboard() {
  const { user, signOut } = useAuth();
  const { sites, loading, error, usingFallback } = useSites();
  const [currentSiteId, setCurrentSiteId] = useState<string | null>(null);

  const handleSignOut = async () => {
    await signOut();
  };

  const handleArrive = useCallback((site: TourismSite) => {
    setCurrentSiteId(site.id);
  }, []);

  const currentSite = useMemo(
    () => sites.find((s) => s.id === currentSiteId) ?? null,
    [sites, currentSiteId]
  );

  return (
    <div className="flex min-h-screen flex-col bg-slate-900 text-white">
      <header className="border-b border-white/10 bg-slate-950/60">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <ShipIcon className="h-5 w-5 text-amber-300" />
            <span className="text-lg font-semibold">
              Sydney Harbour Ferry World
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-white/60 sm:inline">
              {user?.email}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="text-white hover:bg-white/10 hover:text-white"
            >
              <LogOutIcon className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-6 lg:flex-row">
        {/* Voxel harbour scene */}
        <section className="relative min-h-[360px] flex-1 overflow-hidden rounded-3xl border border-white/10 bg-slate-800 shadow-xl lg:min-h-0">
          {loading ? (
            <div className="flex h-full items-center justify-center text-white/60">
              Charting the harbour...
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-white/60">
                  Launching the ferry...
                </div>
              }
            >
              <HarbourScene sites={sites} onArrive={handleArrive} />
            </Suspense>
          )}

          <div className="pointer-events-none absolute left-4 top-4 rounded-2xl bg-slate-950/60 px-4 py-2 backdrop-blur">
            <p className="text-xs uppercase tracking-wide text-white/60">
              Now cruising past
            </p>
            <p className="text-lg font-bold text-amber-300">
              {currentSite ? currentSite.name : 'Setting sail...'}
            </p>
          </div>
        </section>

        {/* HUD: route + site details */}
        <aside className="w-full shrink-0 space-y-4 lg:w-80">
          <div className="rounded-3xl border border-white/10 bg-slate-800/70 p-5">
            <div className="mb-3 flex items-center gap-2">
              <AnchorIcon className="h-4 w-4 text-amber-300" />
              <h2 className="text-sm font-bold uppercase tracking-wide text-white/80">
                Ferry route
              </h2>
            </div>

            {error && usingFallback && (
              <Alert className="mb-3 border-amber-400/40 bg-amber-400/10 text-amber-100">
                <AlertDescription className="text-xs">
                  Showing the built-in harbour route. Deploy with{' '}
                  <code>rayfin up</code> to load sites from your database.
                </AlertDescription>
              </Alert>
            )}

            <SiteList sites={sites} currentSiteId={currentSiteId} />
          </div>

          <p className="px-2 text-xs leading-relaxed text-white/50">
            A voxel ferry loops Sydney Harbour, calling at {sites.length} tourism
            sites. Route and landmarks are powered by your Rayfin{' '}
            <code>TourismSite</code> data.
          </p>
        </aside>
      </main>
    </div>
  );
}
