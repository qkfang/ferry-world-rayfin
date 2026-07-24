import { useEffect, useMemo, useState } from 'react';

import { fetchFerries } from '@/services/ferryService';
import { createVesselCheck, fetchVesselChecks } from '@/services/checklistService';
import { CATEGORIES, STATUSES, categoryLabel, statusMeta, timeAgo } from '@/shared/checks';
import type { CheckCategory, CheckStatus, VesselCheck } from '@/shared/contract';

/**
 * Right-docked panel where a ferry operator logs pre-departure / in-service
 * checks per vessel and reviews any open issues. Data is persisted through the
 * Rayfin backend inside the Fabric portal, or localStorage in local dev.
 */
export function ChecklistPanel() {
  const [ferries, setFerries] = useState<string[]>([]);
  const [checks, setChecks] = useState<VesselCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issuesOnly, setIssuesOnly] = useState(false);

  const [ferryName, setFerryName] = useState('');
  const [category, setCategory] = useState<CheckCategory>('vessel');
  const [item, setItem] = useState('');
  const [status, setStatus] = useState<CheckStatus>('ok');
  const [notes, setNotes] = useState('');
  const [inspector, setInspector] = useState('');

  const reload = async () => {
    try {
      const rows = await fetchVesselChecks();
      setChecks(rows);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let disposed = false;
    const abort = new AbortController();
    void (async () => {
      try {
        const feed = await fetchFerries(abort.signal);
        if (!disposed) {
          const names = [...new Set(feed.ferries.map((f) => f.name))].sort();
          setFerries(names);
          if (names.length) setFerryName((n) => n || names[0]);
        }
      } catch {
        // Ferry list is optional — the vessel can still be typed in.
      }
    })();
    void reload();
    return () => {
      disposed = true;
      abort.abort();
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ferryName.trim() || !item.trim()) return;
    setSaving(true);
    try {
      await createVesselCheck({
        ferryName: ferryName.trim(),
        category,
        item: item.trim(),
        status,
        notes: notes.trim() || undefined,
        inspector: inspector.trim() || undefined,
      });
      setItem('');
      setNotes('');
      setStatus('ok');
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const visible = useMemo(
    () => (issuesOnly ? checks.filter((c) => c.status === 'issue') : checks),
    [checks, issuesOnly],
  );
  const issueCount = useMemo(() => checks.filter((c) => c.status === 'issue').length, [checks]);

  const inputCls =
    'w-full rounded-md bg-white/[0.06] px-2.5 py-1.5 text-[12px] text-white ring-1 ring-white/10 placeholder:text-white/30 focus:outline-none focus:ring-emerald-400/50';

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between px-4 pb-3 pt-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#00843D]/20 text-emerald-300 ring-1 ring-[#00843D]/40">
            ✓
          </span>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold tracking-wide text-white">Vessel Checks</div>
            <div className="text-[11px] text-white/45">Pre-departure log</div>
          </div>
        </div>
        {issueCount > 0 && (
          <span className="flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-300 ring-1 ring-red-500/30 tabular-nums">
            {issueCount} issue{issueCount === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/* Log form */}
      <form onSubmit={submit} className="mx-3 mb-3 space-y-2 rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/10">
        {ferries.length ? (
          <select
            value={ferryName}
            onChange={(e) => setFerryName(e.target.value)}
            className={inputCls}
          >
            {ferries.map((n) => (
              <option key={n} value={n} className="bg-slate-900">
                {n}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={ferryName}
            onChange={(e) => setFerryName(e.target.value)}
            placeholder="Vessel name"
            className={inputCls}
          />
        )}

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as CheckCategory)}
          className={inputCls}
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value} className="bg-slate-900">
              {c.label}
            </option>
          ))}
        </select>

        <input
          value={item}
          onChange={(e) => setItem(e.target.value)}
          placeholder="Check item (e.g. Bilge pumps operational)"
          className={inputCls}
        />

        <div className="grid grid-cols-3 gap-1 rounded-lg bg-white/[0.06] p-1">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setStatus(s.value)}
              className={`rounded-md py-1 text-[12px] font-medium transition-colors ${
                status === s.value ? 'text-white' : 'text-white/50 hover:text-white'
              }`}
              style={status === s.value ? { backgroundColor: s.color } : undefined}
            >
              {s.label}
            </button>
          ))}
        </div>

        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className={inputCls}
        />
        <input
          value={inspector}
          onChange={(e) => setInspector(e.target.value)}
          placeholder="Inspector (optional)"
          className={inputCls}
        />

        <button
          type="submit"
          disabled={saving || !ferryName.trim() || !item.trim()}
          className="w-full rounded-md bg-[#00843D] py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Log check'}
        </button>
      </form>

      {/* Issues-only toggle */}
      <div className="mx-3 mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-white/40">
          {visible.length} logged
        </span>
        <button
          onClick={() => setIssuesOnly((v) => !v)}
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
            issuesOnly ? 'bg-red-500/20 text-red-300 ring-1 ring-red-500/30' : 'text-white/50 hover:text-white'
          }`}
        >
          Issues only
        </button>
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
        {loading && <div className="px-1 py-4 text-[12px] text-white/40">Loading…</div>}
        {error && !loading && (
          <div className="rounded-md bg-red-500/10 px-2.5 py-2 text-[12px] text-red-300 ring-1 ring-red-500/20">
            {error}
          </div>
        )}
        {!loading && !error && visible.length === 0 && (
          <div className="px-1 py-4 text-[12px] text-white/40">No checks logged yet.</div>
        )}
        {visible.map((c) => {
          const sm = statusMeta(c.status);
          return (
            <div
              key={c.id}
              className="rounded-lg bg-white/[0.04] p-2.5 ring-1 ring-white/10"
              style={c.status === 'issue' ? { boxShadow: 'inset 3px 0 0 #dc2626' } : undefined}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[12px] font-semibold text-white">{c.ferryName}</span>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                  style={{ backgroundColor: sm.color }}
                >
                  {sm.label}
                </span>
              </div>
              <div className="mt-0.5 text-[12px] text-white/70">{c.item}</div>
              <div className="mt-1 flex items-center gap-2 text-[10px] text-white/40">
                <span>{categoryLabel(c.category)}</span>
                <span>·</span>
                <span>{timeAgo(c.ts)}</span>
                {c.inspector && (
                  <>
                    <span>·</span>
                    <span className="truncate">{c.inspector}</span>
                  </>
                )}
              </div>
              {c.notes && <div className="mt-1 text-[11px] text-white/50">{c.notes}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
