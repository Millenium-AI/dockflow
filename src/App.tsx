import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, closestCorners, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { LogOut, Plus, Search, Settings, Trash2, Wrench, WifiOff, X } from 'lucide-react';
import {
  areaColorTokens, columnDefaults, jobTypeTokens, tabGridSpecs, tabLayoutSpecs,
  type AreaColorKey, type AreaColorSettings, type ColumnDefaults,
  type Job, type JobStatus, type JobType, type ViewTab,
} from './data';
import { getSession, login, logout } from './lib/auth';
import { fetchJobs, reorderColumn, removeJob, saveJob } from './lib/jobs';
import { fetchAreaColors, saveAreaColors, fetchAreaOpacity, saveAreaOpacity, fetchHideOldCompleted, saveHideOldCompleted, fetchColumnTechs, saveColumnTechs } from './lib/settings';

const REFRESH_MS = 20_000;
const fieldClass =
  'w-full rounded-lg border border-[#e8dcc8] bg-white px-3 py-2 text-sm text-[#2c3230] outline-none transition focus:border-[#6B1919] focus:ring-2 focus:ring-[#6B1919]/20';
const labelClass = 'text-sm font-semibold text-[#8a928c]';

type RenderColumn = ColumnDefaults;

export default function App() {
  const [sessionEmail, setSessionEmail] = useState<string | null>(() => getSession());

  if (!sessionEmail) {
    return <LoginScreen onLoggedIn={setSessionEmail} />;
  }

  return (
    <BoardApp
      email={sessionEmail}
      onLogout={() => {
        logout();
        setSessionEmail(null);
      }}
    />
  );
}

function LoginScreen({ onLoggedIn }: { onLoggedIn: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const ok = await login(email, password);
      if (ok) {
        onLoggedIn(email.trim().toLowerCase());
      } else {
        setError('Wrong email or password.');
      }
    } catch {
      setError("Can't reach the database — try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-[#faf8f3]">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-[#e8dcc8] bg-white p-6 shadow-xl"
      >
        <div className="flex items-center gap-3 mb-2">
          <img src="/dockflow.png" alt="SMC" className="h-8 w-8" />
          <h1 className="text-lg font-bold text-[#6B1919]">Job Board</h1>
        </div>
        <p className="mt-1 text-sm text-[#8a928c]">Sign in to continue.</p>
        <div className="mt-4 space-y-3">
          <div>
            <label className={labelClass}>Email</label>
            <input
              className={`${fieldClass} mt-1`}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div>
            <label className={labelClass}>Password</label>
            <input
              className={`${fieldClass} mt-1`}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        </div>
        {error && <p className="mt-3 text-sm font-medium text-[#b04a36]">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="mt-4 w-full rounded-lg bg-[#6B1919] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#521212] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

function BoardApp({ email, onLogout }: { email: string; onLogout: () => void }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [areaColors, setAreaColors] = useState<AreaColorSettings>({});
  const [areaOpacity, setAreaOpacity] = useState<Record<string, number>>({});
  const [hideOldCompleted, setHideOldCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Job | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showAreaSettings, setShowAreaSettings] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState<ViewTab>('barges');
  const [columnTechs, setColumnTechs] = useState<Record<string, string>>({});
  const [fontSize, setFontSize] = useState<'sm' | 'md' | 'lg' | 'xl'>(() => {
    const saved = localStorage.getItem('dockflow_font_size');
    return (saved as 'sm' | 'md' | 'lg' | 'xl') ?? 'md';
  });

  const fontSizeMap = { sm: '13px', md: '16px', lg: '20px', xl: '24px' };

  // dnd-kit: id of the job card currently being dragged, if any.
  const [activeId, setActiveId] = useState<string | null>(null);
  // A short movement threshold before a drag "activates" — this is what lets
  // a plain click still open the edit form instead of every click starting a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const busy = showForm || showAreaSettings || confirmDelete !== null || activeId !== null;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  const refresh = useCallback(async () => {
    // Jobs are the core data — if this fails, show the offline banner.
    try {
      const [jobRows, techs] = await Promise.all([
        fetchJobs(),
        fetchColumnTechs(),
      ]);
      setJobs(jobRows);
      setColumnTechs(techs);
      setOffline(false);
    } catch (err) {
      console.error('Failed to load jobs or techs:', err);
      setOffline(true);
    } finally {
      setLoading(false);
    }

    // Area colors are a secondary setting — a failure here shouldn't take
    // the whole board offline or discard jobs that loaded fine.
    try {
      setAreaColors(await fetchAreaColors());
    } catch (err) {
      console.error('Failed to load area colors:', err);
    }

    try {
      setAreaOpacity(await fetchAreaOpacity());
    } catch (err) {
      console.error('Failed to load area opacity:', err);
    }

    try {
      setHideOldCompleted(await fetchHideOldCompleted());
    } catch (err) {
      console.error('Failed to load hide old completed setting:', err);
    }
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--font-size', fontSizeMap[fontSize]);
    localStorage.setItem('dockflow_font_size', fontSize);
  }, [fontSize]);

  const updateColumnTech = (colId: string, tech: string) => {
    const updated = { ...columnTechs, [colId]: tech };
    setColumnTechs(updated);
    saveColumnTechs(updated)
      .then(() => setOffline(false))
      .catch((err) => {
        console.error('Failed to save column tech:', err);
        setOffline(true);
      });
  };

  useEffect(() => {
    refresh();
    const t = setInterval(() => {
      setNow(new Date());
      if (!busyRef.current) refresh();
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh]);

  /** Apply a change locally right away, then write it. If the write fails, reload the truth. */
  const commit = async (optimistic: (cur: Job[]) => Job[], write: () => Promise<void>) => {
    setJobs(optimistic);
    try {
      await write();
      setOffline(false);
    } catch {
      setOffline(true);
      refresh();
    }
  };

  const handleSave = async (job: Job) => {
    const isNew = !jobs.some((j) => j.id === job.id);
    const statusChanged = editing && editing.status !== job.status;
    let finalJob =
      isNew || statusChanged
        ? { ...job, sortOrder: jobs.filter((j) => j.status === job.status && j.id !== job.id).length }
        : job;

    if ((isNew || statusChanged) && job.status === 'complete') {
      finalJob = { ...finalJob, completedAt: new Date().toISOString() };
    }

    setEditing(null);
    setShowForm(false);

    commit(
      (cur) => (cur.some((j) => j.id === finalJob.id) ? cur.map((j) => (j.id === finalJob.id ? finalJob : j)) : [...cur, finalJob]),
      async () => {
        // Files are already in metadata, just save the job
        await saveJob(finalJob);
      }
    );
  };

  const handleDelete = (id: string) => {
    setConfirmDelete(null);
    setEditing(null);
    setShowForm(false);
    commit(
      (cur) => cur.filter((j) => j.id !== id),
      () => removeJob(id)
    );
  };

  /** Resolves a dnd-kit droppable/sortable id to the column it belongs to — either a column itself (dropped on an empty column) or the status of the job with that id. */
  const findContainer = (id: string): JobStatus | undefined => {
    if (columnDefaults.some((c) => c.id === id)) return id as JobStatus;
    return jobs.find((j) => j.id === id)?.status;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  /** Live-moves the dragged card into the column it's currently hovering, so the board reflows as you drag. Only touches state — nothing is persisted here. */
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;
    if (activeId === overId) return;

    const activeContainer = findContainer(activeId);
    const overContainer = findContainer(overId);
    if (!activeContainer || !overContainer || activeContainer === overContainer) return;

    setJobs((prev) => {
      const activeJob = prev.find((j) => j.id === activeId);
      if (!activeJob) return prev;

      const overItems = prev.filter((j) => j.status === overContainer);
      const overIndex = overItems.findIndex((j) => j.id === overId);
      const insertAt = overIndex >= 0 ? overIndex : overItems.length;

      const moved = { ...activeJob, status: overContainer };
      const newOverItems = [...overItems];
      newOverItems.splice(insertAt, 0, moved);

      const rest = prev.filter((j) => j.id !== activeId && j.status !== overContainer);
      return [...rest, ...newOverItems];
    });
  };

  /** Finalizes the drop: settles the dragged card's position within its final column and persists that column's order (and the card's new status/sort_order) to the database. */
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;
    const container = findContainer(overId) ?? findContainer(activeId);
    if (!container) return;

    const containerItems = jobs.filter((j) => j.status === container);
    const activeIndex = containerItems.findIndex((j) => j.id === activeId);
    const overIndex = containerItems.findIndex((j) => j.id === overId);

    let reordered = containerItems;
    if (activeIndex !== -1 && overIndex !== -1 && activeIndex !== overIndex) {
      reordered = arrayMove(containerItems, activeIndex, overIndex);
      const others = jobs.filter((j) => j.status !== container);
      setJobs([...others, ...reordered]);
    }

    reorderColumn(
      container,
      reordered.map((j) => j.id)
    ).catch(() => {
      setOffline(true);
      refresh();
    });
  };

  const setAreaColor = (areaCode: string, color: AreaColorKey) => {
    const updated = { ...areaColors, [areaCode]: color };
    setAreaColors(updated);
    saveAreaColors(updated)
      .then(() => setOffline(false))
      .catch((err) => {
        console.error('Failed to save area colors:', err);
        setOffline(true);
      });
  };

  const deleteAreaColor = (areaCode: string) => {
    const updated = { ...areaColors };
    delete updated[areaCode];
    setAreaColors(updated);
    saveAreaColors(updated)
      .then(() => setOffline(false))
      .catch((err) => {
        console.error('Failed to delete area color:', err);
        setOffline(true);
      });

    if (areaCode in areaOpacity) {
      const updatedOpacity = { ...areaOpacity };
      delete updatedOpacity[areaCode];
      setAreaOpacity(updatedOpacity);
      saveAreaOpacity(updatedOpacity).catch((err) => {
        console.error('Failed to clean up area opacity:', err);
      });
    }
  };

  const setAreaOpacityValue = (areaCode: string, opacity: number) => {
    const updated = { ...areaOpacity, [areaCode]: opacity };
    setAreaOpacity(updated);
    saveAreaOpacity(updated)
      .then(() => setOffline(false))
      .catch((err) => {
        console.error('Failed to save area opacity:', err);
        setOffline(true);
      });
  };

  const byStatus = useMemo(() => {
    const q = search.trim().toLowerCase();
    const groups: Record<string, Job[]> = {};
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    for (const j of jobs) {
      if (q && !`${j.customerName} ${j.scope} ${j.area} ${j.assignedTo} ${j.note}`.toLowerCase().includes(q)) continue;

      if (hideOldCompleted && j.status === 'complete' && j.completedAt) {
        const completedDate = new Date(j.completedAt);
        if (completedDate < thirtyDaysAgo) continue;
      }

      (groups[j.status] ??= []).push(j);
    }
    return groups;
  }, [jobs, search, hideOldCompleted, now]);

  const layoutSpec = viewTab === 'reporting' ? null : tabLayoutSpecs[viewTab];
  const visibleColumns: RenderColumn[] = useMemo(
    () => layoutSpec ? layoutSpec.items.map((id) => columnDefaults.find((d) => d.id === id)!) : [],
    [layoutSpec]
  );
  const gridSpec = viewTab === 'reporting' ? null : tabGridSpecs[viewTab];

  const openEdit = (job: Job) => {
    setEditing(job);
    setShowForm(true);
  };

  const activeJob = activeId ? jobs.find((j) => j.id === activeId) ?? null : null;
  const activeCompact = activeJob ? visibleColumns.find((c) => c.id === activeJob.status)?.compact : false;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#faf8f3] text-[#232826]">
      <header className="flex items-center justify-between gap-4 border-b border-[#e8dcc8] px-5 py-3 bg-white">
        <div className="flex items-baseline gap-3">
          <img src="/dockflow.png" alt="SMC" className="h-8 w-8" />
          <h1 className="text-xl font-bold tracking-tight text-[#6B1919]">Job Board</h1>
          <div className="flex items-center gap-1 rounded-lg border border-[#e8dcc8] bg-[#fffef9] p-1">
            <button
              onClick={() => setViewTab('barges')}
              className={`px-3 py-1.5 text-sm font-semibold rounded transition ${
                viewTab === 'barges'
                  ? 'bg-[#6B1919] text-white'
                  : 'text-[#3a423d] hover:bg-[#f5f1e8]'
              }`}
            >
              Barges
            </button>
            <button
              onClick={() => setViewTab('other')}
              className={`px-3 py-1.5 text-sm font-semibold rounded transition ${
                viewTab === 'other'
                  ? 'bg-[#6B1919] text-white'
                  : 'text-[#3a423d] hover:bg-[#f5f1e8]'
              }`}
            >
              Status
            </button>
            <button
              onClick={() => setViewTab('reporting')}
              className={`px-3 py-1.5 text-sm font-semibold rounded transition ${
                viewTab === 'reporting'
                  ? 'bg-[#6B1919] text-white'
                  : 'text-[#3a423d] hover:bg-[#f5f1e8]'
              }`}
            >
              Reporting
            </button>
          </div>
          <span className="text-sm text-[#9aa29c]">
            {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
          {offline && (
            <span className="flex items-center gap-1.5 rounded-md bg-[#fbf0ee] px-2 py-1 text-xs font-semibold text-[#b04a36]">
              <WifiOff size="1em" /> Can't reach the database — showing the last board we loaded
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-[#e8dcc8] bg-[#fffef9] p-1">
            {(['sm', 'md', 'lg', 'xl'] as const).map((size) => (
              <button
                key={size}
                onClick={() => setFontSize(size)}
                className={`px-2 py-1 text-xs font-semibold rounded transition ${
                  fontSize === size
                    ? 'bg-[#6B1919] text-white'
                    : 'text-[#3a423d] hover:bg-[#f5f1e8]'
                }`}
                title={`Size: ${size.toUpperCase()}`}
              >
                {size.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size="1em" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9aa29c]" />
            <input
              className="w-40 rounded-lg border border-[#e8dcc8] bg-[#fffef9] py-1.5 pl-8 pr-3 text-sm outline-none transition focus:border-[#6B1919] focus:ring-2 focus:ring-[#bf9f21]/20"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowAreaSettings(true)}
            className="flex items-center gap-1.5 rounded-lg border border-[#e8dcc8] bg-[#fffef9] px-3 py-1.5 text-sm font-semibold text-[#3a423d] transition hover:bg-[#f5f1e8]"
            aria-label="Area colors"
          >
            <Settings size="1em" /> Settings
          </button>
          <button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-[#6B1919] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#521212]"
          >
            <Plus size="1em" /> Add job
          </button>
          <div className="ml-1 flex items-center gap-2 border-l border-[#e8dcc8] pl-3">
            <span className="text-xs text-[#9aa29c]">{email}</span>
            <button
              onClick={onLogout}
              className="rounded-lg p-1.5 text-[#8a928c] hover:bg-[#f5f1e8]"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size="1em" />
            </button>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden p-4">
        {loading ? (
          <p className="text-sm text-[#9aa29c]">Loading the board…</p>
        ) : viewTab === 'reporting' ? (
          <ReportingTab jobs={jobs} now={now} />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            {layoutSpec.type === 'grid' ? (
              <div
                className="grid h-full w-full gap-3"
                style={{
                  gridTemplateColumns: `repeat(${gridSpec.cols}, 1fr)`,
                  gridTemplateRows: `repeat(${gridSpec.rows}, minmax(0, 1fr))`,
                }}
              >
                {visibleColumns.map((col, i) => (
                  <div
                    key={col.id}
                    style={{ gridColumn: gridSpec.items[i].gridColumn, gridRow: gridSpec.items[i].gridRow }}
                    className="h-full w-full min-h-0 overflow-hidden"
                  >
                    <BoardColumn col={col} jobs={byStatus[col.id] ?? []} onEdit={openEdit} areaColors={areaColors} areaOpacity={areaOpacity} tech={columnTechs[col.id] ?? ''} onTechChange={updateColumnTech} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-full w-full gap-3">
                {/* Left: Ready (50%) */}
                <div className="min-h-0 w-1/2 overflow-hidden">
                  <BoardColumn col={visibleColumns[0]} jobs={byStatus[visibleColumns[0].id] ?? []} onEdit={openEdit} areaColors={areaColors} areaOpacity={areaOpacity} tech={columnTechs[visibleColumns[0].id] ?? ''} onTechChange={updateColumnTech} />
                </div>
                {/* Right: Waiting (top 50%), Hold|Complete (bottom 50%) */}
                <div className="flex min-h-0 w-1/2 flex-col gap-3 overflow-hidden">
                  <div className="min-h-0 flex-1 w-full overflow-hidden">
                    <BoardColumn col={visibleColumns[1]} jobs={byStatus[visibleColumns[1].id] ?? []} onEdit={openEdit} areaColors={areaColors} areaOpacity={areaOpacity} tech={columnTechs[visibleColumns[1].id] ?? ''} onTechChange={updateColumnTech} />
                  </div>
                  <div className="flex min-h-0 flex-1 w-full gap-3 overflow-hidden">
                    <div className="min-h-0 flex-1 w-full overflow-hidden">
                      <BoardColumn col={visibleColumns[2]} jobs={byStatus[visibleColumns[2].id] ?? []} onEdit={openEdit} areaColors={areaColors} areaOpacity={areaOpacity} tech={columnTechs[visibleColumns[2].id] ?? ''} onTechChange={updateColumnTech} />
                    </div>
                    <div className="min-h-0 flex-1 w-full overflow-hidden">
                      <BoardColumn col={visibleColumns[3]} jobs={byStatus[visibleColumns[3].id] ?? []} onEdit={openEdit} areaColors={areaColors} areaOpacity={areaOpacity} tech={columnTechs[visibleColumns[3].id] ?? ''} onTechChange={updateColumnTech} />
                    </div>
                  </div>
                </div>
              </div>
            )}
            <DragOverlay>
              {activeJob ? (
                <div className="rotate-2 shadow-xl">
                  <JobCardView
                    job={activeJob}
                    areaColor={areaColors[activeJob.area ?? ''] ?? 'none'}
                    opacity={areaOpacity[activeJob.area ?? ''] ?? 1}
                    compact={activeCompact}
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </main>

      {showAreaSettings && (
        <AreaColorSettingsPanel
          areaColors={areaColors}
          areaOpacity={areaOpacity}
          hideOldCompleted={hideOldCompleted}
          onClose={() => setShowAreaSettings(false)}
          onSetColor={setAreaColor}
          onDeleteColor={deleteAreaColor}
          onSetOpacity={setAreaOpacityValue}
          onSetHideOldCompleted={(val) => {
            setHideOldCompleted(val);
            saveHideOldCompleted(val)
              .then(() => setOffline(false))
              .catch((err) => {
                console.error('Failed to save hide old completed setting:', err);
                setOffline(true);
              });
          }}
        />
      )}

      {showForm && (
        <JobForm
          job={editing}
          areaColors={areaColors}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSave={handleSave}
          onDelete={editing ? (id) => setConfirmDelete(id) : undefined}
        />
      )}

      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1f2926]/25 fade-in"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="pop-in rounded-xl border border-[#e8dcc8] bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-semibold">Delete this job?</p>
            <p className="mt-1 text-sm text-[#8a928c]">It will disappear from every screen. This can't be undone.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-[#6a726c] hover:bg-[#f0f3ef]"
              >
                Keep it
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="flex items-center gap-1.5 rounded-lg bg-[#b04a36] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#9a3f2d]"
              >
                <Trash2 size="1em" /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BoardColumn({
  col,
  jobs,
  onEdit,
  areaColors,
  areaOpacity,
  tech,
  onTechChange,
}: {
  col: RenderColumn;
  jobs: Job[];
  onEdit: (job: Job) => void;
  areaColors: AreaColorSettings;
  areaOpacity: Record<string, number>;
  tech?: string;
  onTechChange?: (colId: string, tech: string) => void;
}) {
  const [editingTech, setEditingTech] = useState(false);
  const [techValue, setTechValue] = useState(tech ?? '');
  const isBarge = col.id.startsWith('barge-');

  // Registers this column as a drop target in its own right, so dropping on
  // an empty (or mostly-empty) column still works even with no cards to land on.
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  const jobIds = useMemo(() => jobs.map((j) => j.id), [jobs]);

  const handleTechSave = () => {
    if (onTechChange) {
      onTechChange(col.id, techValue);
    }
    setEditingTech(false);
  };

  return (
    <div
      className={`flex h-full min-h-0 flex-col rounded-xl border bg-white transition ${
        isOver ? 'border-[#bf9f21] bg-[#fffbf0]' : 'border-[#e8dcc8]'
      }`}
    >
      <div className="flex shrink-0 flex-col gap-2 px-3 pb-2 pt-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: col.accent }} />
            <h2 className="text-base font-bold tracking-tight text-[#3a423d] truncate">{col.label}</h2>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-1">
              <span className="text-xs font-semibold text-[#9aa29c]">Total Jobs</span>
              <span className="text-sm font-semibold text-[#3a423d]">{jobs.length}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs font-semibold text-[#9aa29c]">Total Days</span>
              <span className="text-sm font-semibold text-[#3a423d]">{jobs.reduce((sum, j) => sum + (j.daysOfWork ?? 0), 0).toFixed(1)}</span>
            </div>
            {(() => {
              const columnRevenue = jobs.reduce((sum, j) => sum + (j.price ?? 0), 0);
              return columnRevenue > 0 ? (
                <div className="flex items-center gap-1">
                  <span className="text-xs font-semibold text-[#9aa29c]">Total Revenue</span>
                  <span className="text-sm font-semibold text-[#3a423d]">${columnRevenue.toLocaleString()}</span>
                </div>
              ) : null;
            })()}
          </div>
        </div>
        {isBarge && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-[#8a928c] shrink-0">Tech:</label>
            {editingTech ? (
              <input
                autoFocus
                className="flex-1 rounded border border-[#e8dcc8] px-2 py-1 text-sm outline-none focus:border-[#6B1919]"
                value={techValue}
                onChange={(e) => setTechValue(e.target.value)}
                onBlur={handleTechSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleTechSave();
                  if (e.key === 'Escape') setEditingTech(false);
                }}
              />
            ) : (
              <button
                onClick={() => setEditingTech(true)}
                className="flex-1 text-left rounded px-2 py-1 text-sm font-medium text-[#3a423d] hover:bg-[#f5f1e8] transition"
              >
                {techValue || <span className="text-[#9aa29c]">Add tech name</span>}
              </button>
            )}
          </div>
        )}
      </div>
      <div
        ref={setNodeRef}
        className={`min-h-0 flex-1 overflow-y-auto px-2 pb-2 ${col.compact ? 'flex flex-wrap items-start gap-2' : 'space-y-2'}`}
      >
        <SortableContext items={jobIds} strategy={col.compact ? rectSortingStrategy : verticalListSortingStrategy}>
          {jobs.length === 0 && (
            <div className="w-full rounded-lg border border-dashed border-[#e8dcc8] py-5 text-center">
              <p className="text-sm text-[#a8b0aa]">Nothing here</p>
            </div>
          )}
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onEdit={onEdit}
              compact={col.compact}
              areaColor={areaColors[job.area ?? ''] ?? 'none'}
              opacity={areaOpacity[job.area ?? ''] ?? 1}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

/** Converts a hex color plus a 0–1 opacity into an rgba() string for backgrounds. */
function hexToRgba(hex: string, opacity: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/** Pure visual rendering of a job card — shared by the sortable card and the drag overlay preview. */
function JobCardView({
  job,
  areaColor,
  compact,
  opacity = 1,
}: {
  job: Job;
  areaColor: AreaColorKey;
  compact?: boolean;
  opacity?: number;
}) {
  const areaHex = areaColorTokens[areaColor].hex;
  const isNone = areaColor === 'none';
  const bgColor = hexToRgba(areaHex, opacity);
  return (
    <div
      className={`relative rounded-lg border-2 select-none ${compact ? 'w-44' : ''} ${
        job.priority === 'high'
          ? 'border-[#ef4444]'
          : isNone
            ? 'border-[#e8dcc8] bg-white'
            : 'border-transparent'
      }`}
      style={!isNone && job.priority !== 'high' ? { backgroundColor: bgColor, borderColor: areaHex } : job.priority === 'high' ? { backgroundColor: bgColor, borderColor: '#ef4444' } : undefined}
    >
      {job.jobType === 'maintenance' && (
        <span
          className="absolute -top-1.5 -right-1.5 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white shadow"
          style={{ background: jobTypeTokens.maintenance.hex }}
          title="Maintenance"
        >
          <Wrench size="0.8em" /> MAINT
        </span>
      )}
      <div className={`px-3 py-2 pl-3.5 flex flex-col h-full ${isNone ? 'text-[#2a312d]' : 'text-white'}`}>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-bold leading-tight">{job.customerName}</h3>
          {(job.subarea || job.area) && <span className="shrink-0 font-mono text-sm font-semibold opacity-90">{job.subarea || job.area}</span>}
        </div>
        {job.address && <p className="mt-0.5 text-xs leading-snug opacity-85">{job.address}</p>}
        {job.scope && <p className="mt-1 text-sm font-medium leading-snug opacity-90">{job.scope}</p>}
        {job.note && <p className="mt-0.5 text-xs leading-snug opacity-85">{job.note}</p>}
        {(job.priority === 'high' || job.scheduledDate) && (
          <div className="mt-1.5 flex items-center gap-2 text-xs opacity-90">
            {job.priority === 'high' && (
              <span className="h-2 w-2 rounded-full bg-white" title="High priority" aria-label="High priority" />
            )}
            {job.scheduledDate && <span className="font-mono">{job.scheduledDate}</span>}
          </div>
        )}
        <div className="mt-auto flex items-end justify-end gap-2">
          {job.price !== undefined && <span className="shrink-0 font-mono text-sm font-semibold opacity-90">${job.price.toLocaleString()}</span>}
          {job.daysOfWork !== undefined && <span className="shrink-0 font-mono text-sm font-semibold opacity-90">{job.daysOfWork}d</span>}
        </div>
      </div>
    </div>
  );
}

function JobCard({
  job,
  onEdit,
  compact,
  areaColor,
  opacity,
}: {
  job: Job;
  onEdit: (job: Job) => void;
  compact?: boolean;
  areaColor: AreaColorKey;
  opacity?: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: job.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onEdit(job)}
      // touch-none stops the browser from treating a drag as a page scroll on touch devices.
      className={`touch-none cursor-grab rounded-lg transition-shadow hover:shadow-[0_4px_12px_rgba(33,45,39,.06)] active:cursor-grabbing ${
        compact ? 'w-44' : ''
      }`}
    >
      <JobCardView job={job} areaColor={areaColor} compact={compact} opacity={opacity} />
    </div>
  );
}

function AttachmentsSection({
  files,
  jobId,
  onFilesChange,
}: {
  files: any[];
  jobId: string;
  onFilesChange: (files: any[]) => void;
}) {
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const { supabase } = await import('./lib/supabase');
      const timestamp = new Date().toISOString();
      const path = `${jobId}/${timestamp}-${file.name}`;

      const { error } = await supabase.storage.from('job-files').upload(path, file);
      if (error) throw error;

      const newFile = {
        name: file.name,
        size: file.size,
        uploadedAt: timestamp,
        path,
      };
      onFilesChange([...files, newFile]);
    } catch (err) {
      console.error('File upload failed:', err);
      alert('Failed to upload file. Check console for details.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDownload = async (file: any) => {
    try {
      const { supabase } = await import('./lib/supabase');
      const { data } = await supabase.storage.from('job-files').createSignedUrl(file.path, 3600);
      if (data?.signedUrl) {
        const a = document.createElement('a');
        a.href = data.signedUrl;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error('Download failed:', err);
      alert('Failed to download file');
    }
  };

  const handleDelete = async (file: any) => {
    try {
      const { supabase } = await import('./lib/supabase');
      await supabase.storage.from('job-files').remove([file.path]);
      onFilesChange(files.filter((f) => f.path !== file.path));
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Failed to delete file');
    }
  };

  return (
    <div className="space-y-2 border-t border-[#e8dcc8] pt-3">
      <label className={labelClass}>Attachments</label>
      <div className="flex flex-col gap-2">
        <input
          type="file"
          disabled={uploading}
          onChange={handleFileSelect}
          className="rounded-lg border border-[#e8dcc8] bg-[#fffef9] px-3 py-2 text-sm cursor-pointer disabled:opacity-50 file:mr-3 file:rounded file:border-0 file:bg-[#6B1919] file:px-3 file:py-1 file:text-xs file:font-semibold file:text-white hover:file:bg-[#521212]"
          accept="*/*"
        />
        {uploading && <p className="text-xs text-[#9aa29c]">Uploading...</p>}
        {files.length > 0 && (
          <div className="space-y-1 rounded-lg bg-[#faf8f3] p-2">
            {files.map((file) => (
              <div key={file.path} className="flex items-center gap-2 rounded px-2 py-1.5 bg-white border border-[#e8dcc8] text-sm">
                <button
                  type="button"
                  onClick={() => handleDelete(file)}
                  className="rounded p-1 text-[#ef4444] hover:bg-[#fbf0ee] hover:text-[#b04a36] shrink-0"
                  aria-label="Remove file"
                  title="Delete"
                >
                  <X size="1.2em" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-[#3a423d] truncate">{file.name}</p>
                  <p className="text-xs text-[#9aa29c]">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDownload(file)}
                  className="flex items-center gap-1 rounded-lg bg-[#5a8aa8] text-white px-2.5 py-1.5 text-sm font-semibold hover:bg-[#4a7a98] shrink-0"
                  aria-label="Download file"
                  title="Download"
                >
                  ↓ Download
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function JobForm({
  job,
  areaColors,
  onClose,
  onSave,
  onDelete,
}: {
  job: Job | null;
  areaColors: AreaColorSettings;
  onClose: () => void;
  onSave: (job: Job) => void;
  onDelete?: (id: string) => void;
}) {
  const [draft, setDraft] = useState<Job>(
    job ?? { id: crypto.randomUUID(), customerName: '', status: 'ready', priority: 'normal', files: [] }
  );
  const set = <K extends keyof Job>(key: K, value: Job[K]) => setDraft((cur) => ({ ...cur, [key]: value }));
  const knownAreas = Object.keys(areaColors).sort();

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-[#1f2926]/25 fade-in overflow-y-auto" onClick={onClose}>
      <div
        className="pop-in mt-[6vh] w-full max-w-2xl rounded-xl border border-[#e8dcc8] bg-white shadow-xl flex flex-col max-h-[85vh] mb-[6vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#e8dcc8] px-5 py-3 shrink-0">
          <h2 className="text-lg font-bold text-[#6B1919]">{job ? 'Edit job' : 'Add job'}</h2>
          <button onClick={onClose} className="rounded p-1 text-[#8a928c] hover:bg-[#f5f1e8]" aria-label="Close">
            <X size="1em" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4 overflow-y-auto flex-1 min-h-0">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Customer or job name</label>
              <input
                className={`${fieldClass} mt-1`}
                value={draft.customerName}
                onChange={(e) => set('customerName', e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className={labelClass}>Customer address</label>
              <input className={`${fieldClass} mt-1`} value={draft.address ?? ''} onChange={(e) => set('address', e.target.value)} placeholder="Street address, city, state" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Area or route</label>
              <input className={`${fieldClass} mt-1`} value={draft.area ?? ''} onChange={(e) => set('area', e.target.value)} placeholder="TI, NE, MB" />
              {knownAreas.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {knownAreas.map((area) => {
                    const active = draft.area === area;
                    const hex = areaColorTokens[areaColors[area]].hex;
                    return (
                      <button
                        key={area}
                        type="button"
                        onClick={() => set('area', active ? '' : area)}
                        className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold transition ${
                          active ? 'border-transparent text-white' : 'border-[#e8dcc8] text-[#5a625c] hover:border-[#d8cbb5]'
                        }`}
                        style={active ? { background: hex } : undefined}
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: active ? '#fff' : hex }} />
                        {area}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div>
              <label className={labelClass}>Sub-area</label>
              <input className={`${fieldClass} mt-1`} value={draft.subarea ?? ''} onChange={(e) => set('subarea', e.target.value)} placeholder="Specific location within area" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Scheduled date</label>
              <input className={`${fieldClass} mt-1`} value={draft.scheduledDate ?? ''} onChange={(e) => set('scheduledDate', e.target.value)} placeholder="Oct 16" />
            </div>
            <div>
              <label className={labelClass}>Job Status</label>
              <select className={`${fieldClass} mt-1`} value={draft.status} onChange={(e) => set('status', e.target.value as JobStatus)}>
                {columnDefaults.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>Work scope</label>
            <textarea className={`${fieldClass} mt-1 resize-none`} value={draft.scope ?? ''} onChange={(e) => set('scope', e.target.value)} placeholder="13K lift, dock rebuild" rows={3} />
          </div>
          <div>
            <label className={labelClass}>Short note</label>
            <textarea className={`${fieldClass} mt-1 resize-none`} value={draft.note ?? ''} onChange={(e) => set('note', e.target.value)} placeholder="No demo, needs permit" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Price ($)</label>
              <input className={`${fieldClass} mt-1`} type="number" value={draft.price ?? ''} onChange={(e) => set('price', e.target.value ? Number(e.target.value) : undefined)} placeholder="0.00" min="0" step="0.01" />
            </div>
            <div>
              <label className={labelClass}>Days of work</label>
              <input className={`${fieldClass} mt-1`} type="number" value={draft.daysOfWork ?? ''} onChange={(e) => set('daysOfWork', e.target.value ? Number(e.target.value) : undefined)} placeholder="0" min="0" step="0.5" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Priority</label>
              <select className={`${fieldClass} mt-1`} value={draft.priority ?? 'normal'} onChange={(e) => set('priority', e.target.value as Job['priority'])}>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Job type</label>
              <select className={`${fieldClass} mt-1`} value={draft.jobType ?? 'install'} onChange={(e) => set('jobType', e.target.value as JobType)}>
                <option value="install">Install</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
          </div>

          {/* Attachments Section */}
          <AttachmentsSection files={draft.files ?? []} jobId={draft.id} onFilesChange={(files) => set('files', files)} />

        </div>

        <div className="flex items-center justify-between border-t border-[#e8dcc8] px-5 py-3 shrink-0">
          <div>
            {onDelete && job && (
              <button
                onClick={() => onDelete(job.id)}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-[#b04a36] hover:bg-[#fbf0ee]"
              >
                <Trash2 size="1em" /> Delete
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm font-medium text-[#6a726c] hover:bg-[#f5f1e8]">
              Cancel
            </button>
            <button
              onClick={() => draft.customerName.trim() && onSave(draft)}
              disabled={!draft.customerName.trim()}
              className="rounded-lg bg-[#6B1919] px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-[#521212] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AreaColorSettingsPanel({
  areaColors,
  areaOpacity,
  hideOldCompleted,
  onClose,
  onSetColor,
  onDeleteColor,
  onSetOpacity,
  onSetHideOldCompleted,
}: {
  areaColors: AreaColorSettings;
  areaOpacity: Record<string, number>;
  hideOldCompleted: boolean;
  onClose: () => void;
  onSetColor: (areaCode: string, color: AreaColorKey) => void;
  onDeleteColor: (areaCode: string) => void;
  onSetOpacity: (areaCode: string, opacity: number) => void;
  onSetHideOldCompleted: (val: boolean) => void;
}) {
  const [newArea, setNewArea] = useState('');
  const [editingArea, setEditingArea] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const allAreas = Object.keys(areaColors).sort();

  const handleRename = (oldName: string, newName: string) => {
    if (newName && newName !== oldName && !allAreas.includes(newName)) {
      const updated = { ...areaColors };
      delete updated[oldName];
      updated[newName] = areaColors[oldName];
      onSetColor(newName, updated[newName]);
      setEditingArea(null);
      setEditValue('');
    }
  };

  const handleDelete = (area: string) => {
    onDeleteColor(area);
  };

  const handleAdd = () => {
    if (newArea && !allAreas.includes(newArea)) {
      onSetColor(newArea, 'red');
      setNewArea('');
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#1f2926]/25 fade-in" onClick={onClose}>
      <div
        className="pop-in w-full max-w-md max-h-[85vh] rounded-xl border border-[#e8dcc8] bg-white shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#e8dcc8] px-5 py-3 shrink-0">
          <h2 className="text-lg font-bold text-[#6B1919]">Area Colors</h2>
          <button onClick={onClose} className="rounded p-1 text-[#8a928c] hover:bg-[#f5f1e8]" aria-label="Close">
            <X size="1em" />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4 shrink-0 border-b border-[#e8dcc8]">
          <div>
            <label className={labelClass}>Add new area</label>
            <div className="mt-2 flex gap-2">
              <input
                className={`${fieldClass} flex-1`}
                value={newArea}
                onChange={(e) => setNewArea(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                placeholder="e.g., TI, Downtown, North Side"
                maxLength={24}
              />
              <button
                onClick={handleAdd}
                disabled={!newArea || allAreas.includes(newArea)}
                className="rounded-lg bg-[#6B1919] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#521212] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
              >
                <Plus size="1.2em" />
              </button>
            </div>
          </div>

          <div className="border-t border-[#e8dcc8] pt-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={hideOldCompleted}
                onChange={(e) => onSetHideOldCompleted(e.target.checked)}
                className="w-4 h-4 accent-[#6B1919]"
              />
              <span className={labelClass}>Hide completed jobs older than 30 days</span>
            </label>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4">
          {allAreas.length === 0 ? (
            <p className="text-sm text-[#8a928c] text-center py-8">Add an area to get started</p>
          ) : (
            <div className="space-y-2">
              {allAreas.map((area) => (
                <div key={area} className="rounded-lg border border-[#e8dcc8] p-2.5 bg-[#fffef9] space-y-2">
                  <div className="flex items-center gap-2">
                    {editingArea === area ? (
                      <input
                        className={`${fieldClass} flex-1 py-1`}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value.toUpperCase())}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(area, editValue);
                          if (e.key === 'Escape') setEditingArea(null);
                        }}
                        maxLength={24}
                        autoFocus
                      />
                    ) : (
                      <button
                        onClick={() => {
                          setEditingArea(area);
                          setEditValue(area);
                        }}
                        className="font-mono font-bold text-[#3a423d] hover:text-[#6B1919] hover:underline text-left text-sm flex-1 truncate"
                        title="Click to edit"
                      >
                        {area}
                      </button>
                    )}
                    <div className="flex items-center gap-1 shrink-0">
                      {Object.entries(areaColorTokens).map(([key, { hex, label }]) => (
                        <button
                          key={key}
                          onClick={() => onSetColor(area, key as AreaColorKey)}
                          className={`h-5 w-5 rounded-full border-2 transition shrink-0 ${
                            areaColors[area] === key ? 'scale-110 border-[#6B1919]' : 'border-transparent hover:scale-105'
                          }`}
                          style={{ background: hex }}
                          title={label}
                          aria-label={label}
                        />
                      ))}
                    </div>
                    <button
                      onClick={() => handleDelete(area)}
                      className="rounded p-1 text-[#8a928c] hover:bg-[#fbf0ee] hover:text-[#b04a36] shrink-0"
                      aria-label={`Delete ${area}`}
                      title="Delete"
                    >
                      <Trash2 size="0.9em" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] font-semibold text-[#8a928c] shrink-0 w-12">Opacity</label>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={Math.round((areaOpacity[area] ?? 1) * 100)}
                      onChange={(e) => onSetOpacity(area, Number(e.target.value) / 100)}
                      className="flex-1 h-1.5 bg-[#e8dcc8] rounded-lg appearance-none cursor-pointer accent-[#6B1919]"
                    />
                    <span className="text-[11px] font-semibold text-[#8a928c] shrink-0 w-8 text-right">
                      {Math.round((areaOpacity[area] ?? 1) * 100)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-[#e8dcc8] px-5 py-3 flex justify-end shrink-0 gap-2">
          <button
            onClick={onClose}
            className="rounded-lg bg-[#6B1919] px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-[#521212]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function ReportingTab({ jobs, now }: { jobs: Job[]; now: Date }) {
  const activeJobs = jobs.filter((j) => j.status !== 'complete' && j.status !== 'hold');
  const completedJobs = jobs.filter((j) => j.status === 'complete');
  const highPriorityJobs = jobs.filter((j) => j.priority === 'high');

  const totalPrice = activeJobs.reduce((sum, j) => sum + (j.price ?? 0), 0);
  const totalDays = activeJobs.reduce((sum, j) => sum + (j.daysOfWork ?? 0), 0);
  const totalWeeks = (totalDays / 5).toFixed(1);

  const getCompletedInRange = (daysAgo: number) => {
    const cutoff = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    return completedJobs.filter((j) => j.completedAt && new Date(j.completedAt) >= cutoff);
  };

  const ranges = [
    { label: 'Last 30 days', days: 30 },
    { label: 'Last 60 days', days: 60 },
    { label: 'Last 90 days', days: 90 },
    { label: 'Last 180 days', days: 180 },
    { label: 'Last 1 year', days: 365 },
  ];

  const getJobsByArea = () => {
    const byArea: Record<string, number> = {};
    for (const job of jobs) {
      const area = job.area || 'Unassigned';
      byArea[area] = (byArea[area] ?? 0) + 1;
    }
    return byArea;
  };

  const getJobsByStatus = () => {
    const byStatus: Record<string, number> = {};
    for (const job of jobs) {
      byStatus[job.status] = (byStatus[job.status] ?? 0) + 1;
    }
    return byStatus;
  };

  const jobsByArea = getJobsByArea();
  const jobsByStatus = getJobsByStatus();
  const inProgressCount = (jobsByStatus['barge-1'] ?? 0) + (jobsByStatus['barge-2'] ?? 0) + (jobsByStatus['barge-3'] ?? 0);

  return (
    <div className="h-full overflow-y-auto bg-[#faf8f3]">
      <div className="space-y-6 pb-8 px-6">
        {/* Page Title */}
        <div className="pt-4">
          <h1 className="text-4xl font-bold text-[#6B1919]">Job Reports</h1>
        </div>

        {/* Overview & Pipeline */}
        <div className="bg-white rounded-xl border-2 border-[#e8dcc8] p-8">
          <h2 className="text-2xl font-bold text-[#6B1919] mb-6">Overview</h2>
          <div className="grid grid-cols-3 gap-6">
            {/* Left: Active */}
            <div className="rounded-lg bg-gradient-to-br from-[#faf8f3] to-[#f0ede6] p-6 text-center border border-[#e8dcc8]">
              <p className="text-sm text-[#8a928c] font-semibold mb-2">Active</p>
              <p className="text-4xl font-bold text-[#3a423d]">{activeJobs.length}</p>
            </div>
            {/* Right: Pipeline metrics (if data exists) */}
            {(totalPrice > 0 || totalDays > 0) ? (
              <>
                <div className="rounded-lg bg-gradient-to-br from-[#faf8f3] to-[#f0ede6] p-6 text-center border border-[#e8dcc8]">
                  <p className="text-sm text-[#8a928c] font-semibold mb-2">Total Revenue</p>
                  <p className="text-4xl font-bold text-[#3a423d]">${totalPrice.toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-gradient-to-br from-[#faf8f3] to-[#f0ede6] p-6 text-center border border-[#e8dcc8]">
                  <p className="text-sm text-[#8a928c] font-semibold mb-2">Total Days / Weeks</p>
                  <p className="text-4xl font-bold text-[#3a423d]">{totalDays.toFixed(0)}d / {totalWeeks}w</p>
                </div>
              </>
            ) : null}
          </div>
        </div>

        {/* 2 Column Grid */}
        <div className="grid grid-cols-2 gap-6">
          {/* Jobs by Status */}
          <div className="bg-white rounded-xl border-2 border-[#e8dcc8] p-8">
            <h2 className="text-2xl font-bold text-[#6B1919] mb-6">Jobs by Status</h2>
            <div className="space-y-3">
              {/* In Progress (combined barges) */}
              <div className="flex items-center justify-between rounded-lg bg-[#faf8f3] px-4 py-3 border-l-4" style={{ borderLeftColor: '#6D8FA8' }}>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: '#6D8FA8' }} />
                  <span className="font-semibold text-[#3a423d]">In Progress</span>
                </div>
                <span className="text-xl font-bold text-[#6B1919]">{inProgressCount}</span>
              </div>
              {/* Other statuses */}
              {columnDefaults.filter((col) => !col.id.startsWith('barge-')).map((col) => {
                const count = jobsByStatus[col.id] ?? 0;
                return (
                  <div key={col.id} className="flex items-center justify-between rounded-lg bg-[#faf8f3] px-4 py-3 border-l-4" style={{ borderLeftColor: col.accent }}>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ background: col.accent }} />
                      <span className="font-semibold text-[#3a423d]">{col.label}</span>
                    </div>
                    <span className="text-xl font-bold text-[#6B1919]">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Jobs by Area */}
          <div className="bg-white rounded-xl border-2 border-[#e8dcc8] p-8">
            <h2 className="text-2xl font-bold text-[#6B1919] mb-6">Jobs by Area</h2>
            <div className="space-y-3">
              {Object.entries(jobsByArea)
                .sort((a, b) => b[1] - a[1])
                .map(([area, count]) => (
                  <div key={area} className="flex items-center justify-between rounded-lg bg-[#faf8f3] px-4 py-3 border border-[#e8dcc8]">
                    <span className="font-mono font-bold text-[#3a423d]">{area}</span>
                    <span className="text-xl font-bold text-[#6B1919]">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* Completed Jobs by Time Range */}
        <div className="bg-white rounded-xl border-2 border-[#e8dcc8] p-8">
          <h2 className="text-2xl font-bold text-[#6B1919] mb-6">Completed Work History</h2>
          <div className="space-y-3">
            {ranges.map((range) => {
              const jobsInRange = getCompletedInRange(range.days);
              const priceInRange = jobsInRange.reduce((sum, j) => sum + (j.price ?? 0), 0);
              const daysInRange = jobsInRange.reduce((sum, j) => sum + (j.daysOfWork ?? 0), 0);
              return (
                <div key={range.days} className="rounded-lg bg-[#faf8f3] px-6 py-4 border-2 border-[#e8dcc8]">
                  <p className="font-bold text-[#3a423d] text-lg mb-3">{range.label}</p>
                  <div className="grid grid-cols-4 gap-4 text-center">
                    <div>
                      <p className="text-sm text-[#8a928c] font-semibold mb-1">Jobs</p>
                      <p className="text-2xl font-bold text-[#3a423d]">{jobsInRange.length}</p>
                    </div>
                    <div>
                      <p className="text-sm text-[#8a928c] font-semibold mb-1">Total Value</p>
                      <p className="text-2xl font-bold text-[#3a423d]">${priceInRange.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-sm text-[#8a928c] font-semibold mb-1">Days Worked</p>
                      <p className="text-2xl font-bold text-[#3a423d]">{daysInRange.toFixed(0)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-[#8a928c] font-semibold mb-1">Weeks</p>
                      <p className="text-2xl font-bold text-[#3a423d]">{(daysInRange / 5).toFixed(1)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
