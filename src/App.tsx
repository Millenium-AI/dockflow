import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  ChevronDown, ChevronUp, Eye, EyeOff, Minus, Plus, Search, Settings, Trash2, WifiOff, X,
} from 'lucide-react';
import {
  areaColorTokens, columnDefaults, defaultLayout, type AreaColorKey, type AreaColorSettings, type ColumnDefaults,
  type ColumnLayout, type Job, type JobStatus,
} from './data';
import { fetchJobs, reorderColumn, removeJob, saveJob } from './lib/jobs';
import { fetchAreaColors, fetchLayout, saveAreaColors, saveLayout } from './lib/settings';

const REFRESH_MS = 20_000;
const fieldClass =
  'w-full rounded-lg border border-[#dde2dc] bg-white px-3 py-2 text-sm text-[#2c3230] outline-none transition focus:border-[#5b8a9e] focus:ring-2 focus:ring-[#5b8a9e]/20';
const labelClass = 'text-sm font-semibold text-[#8a928c]';

type RenderColumn = ColumnDefaults & ColumnLayout;

export default function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [layout, setLayout] = useState<ColumnLayout[]>(defaultLayout);
  const [areaColors, setAreaColors] = useState<AreaColorSettings>({});
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Job | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAreaSettings, setShowAreaSettings] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Drag state for free-position job reordering.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ status: JobStatus; index: number } | null>(null);

  const busy = showForm || showSettings || showAreaSettings || confirmDelete !== null || draggingId !== null;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  const refresh = useCallback(async () => {
    try {
      const [jobRows, layoutRows, areaColorsData] = await Promise.all([fetchJobs(), fetchLayout(), fetchAreaColors()]);
      setJobs(jobRows);
      setLayout(layoutRows);
      setAreaColors(areaColorsData);
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, []);

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

  const commitLayout = async (next: ColumnLayout[]) => {
    setLayout(next);
    try {
      await saveLayout(next);
      setOffline(false);
    } catch {
      setOffline(true);
      refresh();
    }
  };

  const handleSave = (job: Job) => {
    const isNew = !jobs.some((j) => j.id === job.id);
    const statusChanged = editing && editing.status !== job.status;
    const finalJob =
      isNew || statusChanged
        ? { ...job, sortOrder: jobs.filter((j) => j.status === job.status && j.id !== job.id).length }
        : job;
    setEditing(null);
    setShowForm(false);
    commit(
      (cur) => (cur.some((j) => j.id === finalJob.id) ? cur.map((j) => (j.id === finalJob.id ? finalJob : j)) : [...cur, finalJob]),
      () => saveJob(finalJob)
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

  /** Drops job `jobId` into `destStatus` at position `targetIndex` among that column's other jobs. */
  const handleReorder = (jobId: string, destStatus: JobStatus, targetIndex: number) => {
    const moving = jobs.find((j) => j.id === jobId);
    if (!moving) return;
    const destItems = jobs.filter((j) => j.status === destStatus && j.id !== jobId);
    const clamped = Math.max(0, Math.min(targetIndex, destItems.length));
    const newDest = [...destItems];
    newDest.splice(clamped, 0, { ...moving, status: destStatus });
    const orderedIds = newDest.map((j) => j.id);

    commit(
      (cur) => {
        const others = cur.filter((j) => j.status !== destStatus && j.id !== jobId);
        return [...others, ...newDest];
      },
      () => reorderColumn(destStatus, orderedIds)
    );
  };

  const toggleVisible = (id: JobStatus) =>
    commitLayout(layout.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c)));

  const changeSpan = (id: JobStatus, delta: number) =>
    commitLayout(
      layout.map((c) => (c.id === id ? { ...c, span: Math.max(1, Math.min(12, c.span + delta)) } : c))
    );

  const moveColumn = (id: JobStatus, direction: -1 | 1) => {
    const sorted = [...layout].sort((a, b) => a.position - b.position);
    const idx = sorted.findIndex((c) => c.id === id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[swapIdx];
    commitLayout(
      layout.map((c) => (c.id === a.id ? { ...c, position: b.position } : c.id === b.id ? { ...c, position: a.position } : c))
    );
  };

  const setAreaColor = (areaCode: string, color: AreaColorKey) => {
    const updated = { ...areaColors, [areaCode]: color };
    setAreaColors(updated);
    saveAreaColors(updated).catch(() => setOffline(true));
  };

  const deleteAreaColor = (areaCode: string) => {
    const updated = { ...areaColors };
    delete updated[areaCode];
    setAreaColors(updated);
    saveAreaColors(updated).catch(() => setOffline(true));
  };

  const byStatus = useMemo(() => {
    const q = search.trim().toLowerCase();
    const groups: Record<string, Job[]> = {};
    for (const j of jobs) {
      if (q && !`${j.customerName} ${j.scope} ${j.area} ${j.assignedTo} ${j.note}`.toLowerCase().includes(q)) continue;
      (groups[j.status] ??= []).push(j);
    }
    return groups;
  }, [jobs, search]);

  const visibleColumns: RenderColumn[] = useMemo(
    () =>
      layout
        .filter((c) => c.visible)
        .sort((a, b) => a.position - b.position)
        .map((c) => ({ ...columnDefaults.find((d) => d.id === c.id)!, ...c })),
    [layout]
  );

  const openEdit = (job: Job) => {
    setEditing(job);
    setShowForm(true);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#f5f6f3] text-[#232826]">
      <header className="flex items-center justify-between gap-4 border-b border-[#e2e6e1] px-5 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-bold tracking-tight">Job Board</h1>
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
          <div className="relative">
            <Search size="1em" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9aa29c]" />
            <input
              className="w-40 rounded-lg border border-[#dde2dc] bg-white py-1.5 pl-8 pr-3 text-sm outline-none transition focus:border-[#5b8a9e]"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-1.5 rounded-lg border border-[#dde2dc] bg-white px-3 py-1.5 text-sm font-semibold text-[#3a423d] transition hover:bg-[#f0f3ef]"
            aria-label="Board settings"
          >
            <Settings size="1em" /> Columns
          </button>
          <button
            onClick={() => setShowAreaSettings(true)}
            className="flex items-center gap-1.5 rounded-lg border border-[#dde2dc] bg-white px-3 py-1.5 text-sm font-semibold text-[#3a423d] transition hover:bg-[#f0f3ef]"
            aria-label="Area colors"
          >
            <Settings size="1em" /> Areas
          </button>
          <button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-[#2f5260] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#24414c]"
          >
            <Plus size="1em" /> Add job
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 p-4">
        {loading ? (
          <p className="text-sm text-[#9aa29c]">Loading the board…</p>
        ) : visibleColumns.length === 0 ? (
          <p className="text-sm text-[#9aa29c]">Every column is hidden. Open Columns to bring one back.</p>
        ) : (
          <div className="grid h-full gap-3" style={{ gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gridAutoRows: 'minmax(0, 1fr)' }}>
            {visibleColumns.map((col) => (
              <BoardColumn
                key={col.id}
                col={col}
                jobs={byStatus[col.id] ?? []}
                draggingId={draggingId}
                setDraggingId={setDraggingId}
                dropTarget={dropTarget}
                setDropTarget={setDropTarget}
                onReorder={handleReorder}
                onEdit={openEdit}
                areaColors={areaColors}
              />
            ))}
          </div>
        )}
      </main>

      {showSettings && (
        <SettingsPanel
          layout={layout}
          onClose={() => setShowSettings(false)}
          onToggleVisible={toggleVisible}
          onChangeSpan={changeSpan}
          onMove={moveColumn}
        />
      )}

      {showAreaSettings && (
        <AreaColorSettingsPanel
          areaColors={areaColors}
          onClose={() => setShowAreaSettings(false)}
          onSetColor={setAreaColor}
          onDeleteColor={deleteAreaColor}
        />
      )}

      {showForm && (
        <JobForm
          job={editing}
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
            className="pop-in rounded-xl border border-[#e0e4de] bg-white p-5 shadow-xl"
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

function SettingsPanel({
  layout,
  onClose,
  onToggleVisible,
  onChangeSpan,
  onMove,
}: {
  layout: ColumnLayout[];
  onClose: () => void;
  onToggleVisible: (id: JobStatus) => void;
  onChangeSpan: (id: JobStatus, delta: number) => void;
  onMove: (id: JobStatus, direction: -1 | 1) => void;
}) {
  const sorted = [...layout].sort((a, b) => a.position - b.position);
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-[#1f2926]/25 fade-in" onClick={onClose}>
      <div
        className="pop-in mt-[6vh] w-full max-w-lg rounded-xl border border-[#e0e4de] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#ecefed] px-5 py-3">
          <h2 className="text-lg font-bold">Columns</h2>
          <button onClick={onClose} className="rounded p-1 text-[#8a928c] hover:bg-[#f0f3ef]" aria-label="Close">
            <X size="1em" />
          </button>
        </div>
        <div className="max-h-[60vh] space-y-1.5 overflow-y-auto px-4 py-4">
          {sorted.map((col, i) => {
            const meta = columnDefaults.find((d) => d.id === col.id)!;
            return (
              <div
                key={col.id}
                className={`flex items-center gap-2 rounded-lg border border-[#e4e8e3] px-3 py-2 ${
                  col.visible ? 'bg-white' : 'bg-[#f5f6f3] opacity-60'
                }`}
              >
                <div className="flex flex-col">
                  <button
                    onClick={() => onMove(col.id, -1)}
                    disabled={i === 0}
                    className="rounded p-0.5 text-[#8a928c] hover:bg-[#f0f3ef] disabled:opacity-25"
                    aria-label={`Move ${meta.label} up`}
                  >
                    <ChevronUp size="1em" />
                  </button>
                  <button
                    onClick={() => onMove(col.id, 1)}
                    disabled={i === sorted.length - 1}
                    className="rounded p-0.5 text-[#8a928c] hover:bg-[#f0f3ef] disabled:opacity-25"
                    aria-label={`Move ${meta.label} down`}
                  >
                    <ChevronDown size="1em" />
                  </button>
                </div>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: meta.accent }} />
                <span className="flex-1 truncate text-sm font-semibold text-[#3a423d]">{meta.label}</span>
                <div className="flex items-center gap-1 text-sm text-[#6a726c]">
                  <button
                    onClick={() => onChangeSpan(col.id, -1)}
                    disabled={col.span <= 1}
                    className="rounded p-1 hover:bg-[#f0f3ef] disabled:opacity-25"
                    aria-label={`Narrower ${meta.label}`}
                  >
                    <Minus size="0.9em" />
                  </button>
                  <span className="w-10 text-center font-mono text-xs">{col.span}/12</span>
                  <button
                    onClick={() => onChangeSpan(col.id, 1)}
                    disabled={col.span >= 12}
                    className="rounded p-1 hover:bg-[#f0f3ef] disabled:opacity-25"
                    aria-label={`Wider ${meta.label}`}
                  >
                    <Plus size="0.9em" />
                  </button>
                </div>
                <button
                  onClick={() => onToggleVisible(col.id)}
                  className="rounded p-1.5 text-[#6a726c] hover:bg-[#f0f3ef]"
                  aria-label={col.visible ? `Hide ${meta.label}` : `Show ${meta.label}`}
                >
                  {col.visible ? <Eye size="1em" /> : <EyeOff size="1em" />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="border-t border-[#ecefed] px-5 py-3 text-xs text-[#8a928c]">
          Width is out of 12 per row — columns wrap to a new row once a row fills up. Hiding a column keeps its jobs; they reappear when you show it again.
        </div>
      </div>
    </div>
  );
}

function BoardColumn({
  col,
  jobs,
  draggingId,
  setDraggingId,
  dropTarget,
  setDropTarget,
  onReorder,
  onEdit,
  areaColors,
}: {
  col: RenderColumn;
  jobs: Job[];
  draggingId: string | null;
  setDraggingId: (id: string | null) => void;
  dropTarget: { status: JobStatus; index: number } | null;
  setDropTarget: (t: { status: JobStatus; index: number } | null) => void;
  onReorder: (jobId: string, destStatus: JobStatus, index: number) => void;
  onEdit: (job: Job) => void;
  areaColors: AreaColorSettings;
}) {
  const displayJobs = draggingId ? jobs.filter((j) => j.id !== draggingId) : jobs;
  const isDropHere = dropTarget?.status === col.id;

  const finishDrop = (index: number) => {
    if (draggingId) onReorder(draggingId, col.id, index);
    setDraggingId(null);
    setDropTarget(null);
  };

  return (
    <div
      style={{ gridColumn: `span ${col.span} / span ${col.span}` }}
      className={`flex min-h-0 flex-col rounded-xl border bg-[#fafbfa] transition ${
        isDropHere ? 'border-[#5b8a9e] bg-[#edf2f4]' : 'border-[#e2e6e1]'
      }`}
      onDragOver={(e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!isDropHere || dropTarget?.index !== displayJobs.length) {
          setDropTarget({ status: col.id, index: displayJobs.length });
        }
      }}
      onDragLeave={(e: React.DragEvent<HTMLDivElement>) => {
        if (e.currentTarget === e.target) setDropTarget(null);
      }}
      onDrop={(e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        finishDrop(displayJobs.length);
      }}
    >
      <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-2.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: col.accent }} />
        <h2 className="text-base font-bold tracking-tight text-[#3a423d]">{col.label}</h2>
        <span className="text-sm font-semibold text-[#9aa29c]">{jobs.length}</span>
      </div>
      <div className={`min-h-0 flex-1 overflow-y-auto px-2 pb-2 ${col.compact ? 'flex flex-wrap items-start gap-2' : 'space-y-2'}`}>
        {displayJobs.length === 0 && !isDropHere && (
          <div className="w-full rounded-lg border border-dashed border-[#d8ddd7] py-5 text-center">
            <p className="text-sm text-[#a8b0aa]">Nothing here</p>
          </div>
        )}
        {displayJobs.map((job, i) => (
          <div key={job.id} className={col.compact ? 'contents' : undefined}>
            {isDropHere && dropTarget?.index === i && <DropLine compact={col.compact} />}
            <JobCard
              job={job}
              onEdit={onEdit}
              compact={col.compact}
              areaColor={areaColors[job.area ?? ''] ?? 'none'}
              onDragStartCard={() => setDraggingId(job.id)}
              onDragEndCard={() => {
                setDraggingId(null);
                setDropTarget(null);
              }}
              onDragOverCard={(e: React.DragEvent<HTMLDivElement>) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const rect = e.currentTarget.getBoundingClientRect();
                const before = col.compact
                  ? e.clientX - rect.left < rect.width / 2
                  : e.clientY - rect.top < rect.height / 2;
                const idx = before ? i : i + 1;
                if (!isDropHere || dropTarget?.index !== idx) setDropTarget({ status: col.id, index: idx });
              }}
              onDropCard={(e: React.DragEvent<HTMLDivElement>) => {
                e.preventDefault();
                e.stopPropagation();
                finishDrop(dropTarget?.status === col.id ? dropTarget.index : i);
              }}
            />
          </div>
        ))}
        {isDropHere && dropTarget?.index === displayJobs.length && <DropLine compact={col.compact} />}
      </div>
    </div>
  );
}

function DropLine({ compact }: { compact?: boolean }) {
  return compact ? (
    <div className="my-1 h-9 w-1 shrink-0 rounded-full bg-[#5b8a9e]" />
  ) : (
    <div className="h-1 rounded-full bg-[#5b8a9e]" />
  );
}

function JobCard({
  job,
  onEdit,
  compact,
  areaColor,
  onDragStartCard,
  onDragEndCard,
  onDragOverCard,
  onDropCard,
}: {
  job: Job;
  onEdit: (job: Job) => void;
  compact?: boolean;
  areaColor: AreaColorKey;
  onDragStartCard: () => void;
  onDragEndCard: () => void;
  onDragOverCard: (e: React.DragEvent<HTMLDivElement>) => void;
  onDropCard: (e: React.DragEvent<HTMLDivElement>) => void;
}) {
  const areaHex = areaColorTokens[areaColor].hex;
  const isNone = areaColor === 'none';

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', job.id);
    const dragImage = new Image();
    e.dataTransfer.setDragImage(dragImage, 0, 0);
    onDragStartCard();
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    onDragEndCard();
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={onDragOverCard}
      onDrop={onDropCard}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        if (target.closest('button, input')) return;
      }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button, input')) return;
        onEdit(job);
      }}
      className={`relative rounded-lg border transition hover:shadow-[0_4px_12px_rgba(33,45,39,.06)] select-none ${
        compact ? 'w-44' : ''
      } ${isNone ? 'border-[#e4e8e3] bg-white' : 'border-transparent'} cursor-grab active:cursor-grabbing`}
      style={!isNone ? { backgroundColor: areaHex, borderColor: areaHex } : undefined}
    >
      <div className={`px-3 py-2 pl-3.5 ${isNone ? 'text-[#2a312d]' : 'text-white'}`}>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-bold leading-tight">{job.customerName}</h3>
          {job.area && <span className="shrink-0 font-mono text-sm font-semibold opacity-90">{job.area}</span>}
        </div>
        {job.scope && <p className="mt-1 text-sm font-medium leading-snug opacity-90">{job.scope}</p>}
        {job.note && <p className="mt-0.5 text-xs leading-snug opacity-85">{job.note}</p>}
        {(job.priority === 'high' || job.assignedTo || job.scheduledDate) && (
          <div className="mt-1.5 flex items-center gap-2 text-xs opacity-90">
            {job.priority === 'high' && (
              <span className="h-2 w-2 rounded-full bg-white" title="High priority" aria-label="High priority" />
            )}
            {job.assignedTo && <span>{job.assignedTo}</span>}
            {job.scheduledDate && <span className="font-mono">{job.scheduledDate}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function JobForm({
  job,
  onClose,
  onSave,
  onDelete,
}: {
  job: Job | null;
  onClose: () => void;
  onSave: (job: Job) => void;
  onDelete?: (id: string) => void;
}) {
  const [draft, setDraft] = useState<Job>(
    job ?? { id: crypto.randomUUID(), customerName: '', status: 'ready', priority: 'normal', color: 'none' }
  );
  const set = <K extends keyof Job>(key: K, value: Job[K]) => setDraft((cur) => ({ ...cur, [key]: value }));

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-[#1f2926]/25 fade-in" onClick={onClose}>
      <div
        className="pop-in mt-[6vh] w-full max-w-lg rounded-xl border border-[#e0e4de] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#ecefed] px-5 py-3">
          <h2 className="text-lg font-bold">{job ? 'Edit job' : 'Add job'}</h2>
          <button onClick={onClose} className="rounded p-1 text-[#8a928c] hover:bg-[#f0f3ef]" aria-label="Close">
            <X size="1em" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div>
            <label className={labelClass}>Customer or job name</label>
            <input
              className={`${fieldClass} mt-1`}
              value={draft.customerName}
              onChange={(e) => set('customerName', e.target.value)}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Area or route</label>
              <input className={`${fieldClass} mt-1`} value={draft.area ?? ''} onChange={(e) => set('area', e.target.value)} placeholder="TI, NE, MB" />
            </div>
            <div>
              <label className={labelClass}>Scheduled date</label>
              <input className={`${fieldClass} mt-1`} value={draft.scheduledDate ?? ''} onChange={(e) => set('scheduledDate', e.target.value)} placeholder="Oct 16" />
            </div>
          </div>
          <div>
            <label className={labelClass}>Work scope</label>
            <input className={`${fieldClass} mt-1`} value={draft.scope ?? ''} onChange={(e) => set('scope', e.target.value)} placeholder="13K lift, dock rebuild" />
          </div>
          <div>
            <label className={labelClass}>Short note</label>
            <input className={`${fieldClass} mt-1`} value={draft.note ?? ''} onChange={(e) => set('note', e.target.value)} placeholder="No demo, needs permit" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Column</label>
              <select className={`${fieldClass} mt-1`} value={draft.status} onChange={(e) => set('status', e.target.value as JobStatus)}>
                {columnDefaults.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Assigned to</label>
              <input className={`${fieldClass} mt-1`} value={draft.assignedTo ?? ''} onChange={(e) => set('assignedTo', e.target.value)} placeholder="Randy, Jordan" />
            </div>
          </div>
          <div>
            <label className={labelClass}>Priority</label>
            <select className={`${fieldClass} mt-1`} value={draft.priority ?? 'normal'} onChange={(e) => set('priority', e.target.value as Job['priority'])}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-[#ecefed] px-5 py-3">
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
            <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm font-medium text-[#6a726c] hover:bg-[#f0f3ef]">
              Cancel
            </button>
            <button
              onClick={() => draft.customerName.trim() && onSave(draft)}
              disabled={!draft.customerName.trim()}
              className="rounded-lg bg-[#2f5260] px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-[#24414c] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {job ? 'Save' : 'Add job'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AreaColorSettingsPanel({
  areaColors,
  onClose,
  onSetColor,
}: {
  areaColors: AreaColorSettings;
  onClose: () => void;
  onSetColor: (areaCode: string, color: AreaColorKey) => void;
  onDeleteColor: (areaCode: string) => void;
}) {
  const [newArea, setNewArea] = useState('');
  const [editingArea, setEditingArea] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [areaOpacity, setAreaOpacity] = useState<Record<string, number>>(() => {
    const opacities: Record<string, number> = {};
    Object.keys(areaColors).forEach(key => {
      opacities[key] = 1.0;
    });
    return opacities;
  });

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
    setAreaOpacity(prev => {
      const updated = { ...prev };
      delete updated[area];
      return updated;
    });
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
        className="pop-in w-full max-w-md max-h-[85vh] rounded-xl border border-[#e0e4de] bg-white shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#ecefed] px-5 py-3 shrink-0">
          <h2 className="text-lg font-bold">Area Colors</h2>
          <button onClick={onClose} className="rounded p-1 text-[#8a928c] hover:bg-[#f0f3ef]" aria-label="Close">
            <X size="1em" />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4 shrink-0 border-b border-[#ecefed]">
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
                className="rounded-lg bg-[#2f5260] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#24414c] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
              >
                <Plus size="1.2em" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4">
          {allAreas.length === 0 ? (
            <p className="text-sm text-[#8a928c] text-center py-8">Add an area to get started</p>
          ) : (
            <div className="space-y-3">
              {allAreas.map((area) => (
                <div key={area} className="rounded-lg border border-[#e4e8e3] p-3 bg-[#fafbfa] space-y-2.5">
                  <div className="flex items-center gap-2">
                    {editingArea === area ? (
                      <input
                        className={`${fieldClass} flex-1`}
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
                        className="font-mono font-bold text-[#3a423d] hover:text-[#2f5260] hover:underline text-left text-sm"
                        title="Click to edit"
                      >
                        {area}
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(area)}
                      className="rounded p-1 text-[#8a928c] hover:bg-[#fbf0ee] hover:text-[#b04a36] shrink-0"
                      aria-label={`Delete ${area}`}
                      title="Delete"
                    >
                      <Trash2 size="1em" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 px-1 flex-wrap">
                    {Object.entries(areaColorTokens).map(([key, { hex, label }]) => (
                      <button
                        key={key}
                        onClick={() => onSetColor(area, key as AreaColorKey)}
                        className={`h-8 w-8 rounded-full border-2 transition shrink-0 ${
                          areaColors[area] === key ? 'scale-110 border-[#2a312d]' : 'border-transparent hover:scale-105'
                        }`}
                        style={{ background: hex }}
                        title={label}
                        aria-label={label}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-3 px-1">
                    <label className="text-xs font-semibold text-[#8a928c] shrink-0">Opacity:</label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={(areaOpacity[area] ?? 1.0) * 100}
                      onChange={(e) => setAreaOpacity(prev => ({ ...prev, [area]: parseInt(e.target.value) / 100 }))}
                      className="flex-1 h-2 bg-[#dde2dc] rounded-lg appearance-none cursor-pointer accent-[#2f5260]"
                    />
                    <span className="text-xs font-semibold text-[#8a928c] shrink-0 w-8 text-right">
                      {Math.round((areaOpacity[area] ?? 1.0) * 100)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-[#ecefed] px-5 py-3 flex justify-end shrink-0 gap-2">
          <button
            onClick={onClose}
            className="rounded-lg bg-[#2f5260] px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-[#24414c]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
