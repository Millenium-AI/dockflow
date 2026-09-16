import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Plus, Search, X, Trash2, WifiOff } from 'lucide-react';
import { colorTokens, statusConfig, type ColorKey, type Job, type JobStatus } from './data';
import { fetchJobs, moveJob, removeJob, saveJob } from './lib/jobs';

const REFRESH_MS = 20_000;
const fieldClass =
  'w-full rounded-lg border border-[#dde2dc] bg-white px-3 py-2 text-sm text-[#2c3230] outline-none transition focus:border-[#5b8a9e] focus:ring-2 focus:ring-[#5b8a9e]/20';

/** Group the columns into rows of 12 spans, purely from statusConfig. */
const rows: (typeof statusConfig)[] = [];
let acc = 0;
for (const col of statusConfig) {
  if (acc === 0) rows.push([]);
  rows[rows.length - 1].push(col);
  acc = (acc + col.span) % 12;
}
const gridTemplateRows = rows
  .map((r) => (r.every((c) => c.compact) ? 'minmax(0, 0.55fr)' : 'minmax(0, 1fr)'))
  .join(' ');

export default function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Job | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<JobStatus | null>(null);

  // Don't let a background refresh yank the board out from under someone mid-edit.
  const busy = showForm || confirmDelete !== null || dragOver !== null;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  const refresh = useCallback(async () => {
    try {
      setJobs(await fetchJobs());
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

  const handleMove = (id: string, status: JobStatus) =>
    commit(
      (cur) => cur.map((j) => (j.id === id ? { ...j, status } : j)),
      () => moveJob(id, status)
    );

  const handleSave = (job: Job) => {
    setEditing(null);
    setShowForm(false);
    commit(
      (cur) => (cur.some((j) => j.id === job.id) ? cur.map((j) => (j.id === job.id ? job : j)) : [...cur, job]),
      () => saveJob(job)
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

  /** One pass instead of one filter per column. */
  const byStatus = useMemo(() => {
    const q = search.trim().toLowerCase();
    const groups = Object.fromEntries(statusConfig.map((c) => [c.id, [] as Job[]])) as Record<JobStatus, Job[]>;
    for (const j of jobs) {
      if (q && !`${j.customerName} ${j.scope} ${j.area} ${j.assignedTo} ${j.note}`.toLowerCase().includes(q)) continue;
      groups[j.status]?.push(j);
    }
    return groups;
  }, [jobs, search]);

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
              <WifiOff size="1em" /> Can’t reach the database — showing the last board we loaded
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
        ) : (
          <div className="grid h-full grid-cols-12 gap-3" style={{ gridTemplateRows }}>
            {statusConfig.map((col) => (
              <BoardColumn
                key={col.id}
                col={col}
                jobs={byStatus[col.id]}
                dragOver={dragOver}
                setDragOver={setDragOver}
                onDrop={handleMove}
                onEdit={openEdit}
              />
            ))}
          </div>
        )}
      </main>

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
            <p className="mt-1 text-sm text-[#8a928c]">It will disappear from every screen. This can’t be undone.</p>
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
  dragOver,
  setDragOver,
  onDrop,
  onEdit,
}: {
  col: (typeof statusConfig)[number];
  jobs: Job[];
  dragOver: JobStatus | null;
  setDragOver: (s: JobStatus | null) => void;
  onDrop: (id: string, status: JobStatus) => void;
  onEdit: (job: Job) => void;
}) {
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData('jobId');
    if (id) onDrop(id, col.id);
  };

  return (
    <div
      style={{ gridColumn: `span ${col.span} / span ${col.span}` }}
      className={`flex min-h-0 flex-col rounded-xl border bg-[#fafbfa] transition ${
        dragOver === col.id ? 'border-[#5b8a9e] bg-[#edf2f4]' : 'border-[#e2e6e1]'
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        if (dragOver !== col.id) setDragOver(col.id);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(null);
      }}
      onDrop={handleDrop}
    >
      <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-2.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: col.accent }} />
        <h2 className="text-base font-bold tracking-tight text-[#3a423d]">{col.label}</h2>
        <span className="text-sm font-semibold text-[#9aa29c]">{jobs.length}</span>
      </div>
      <div className={`min-h-0 flex-1 overflow-y-auto px-2 pb-2 ${col.compact ? 'flex flex-wrap gap-2' : 'space-y-2'}`}>
        {jobs.length === 0 ? (
          <div className="w-full rounded-lg border border-dashed border-[#d8ddd7] py-5 text-center">
            <p className="text-sm text-[#a8b0aa]">Nothing here</p>
          </div>
        ) : (
          jobs.map((job) => <JobCard key={job.id} job={job} onEdit={onEdit} compact={col.compact} />)
        )}
      </div>
    </div>
  );
}

function JobCard({ job, onEdit, compact }: { job: Job; onEdit: (job: Job) => void; compact?: boolean }) {
  const color = colorTokens[job.color ?? 'none'].hex;
  return (
    <div
      draggable
      onDragStart={(e: DragEvent<HTMLDivElement>) => e.dataTransfer.setData('jobId', job.id)}
      onClick={() => onEdit(job)}
      className={`relative cursor-pointer rounded-lg border border-[#e4e8e3] bg-white transition hover:border-[#cdd4ce] hover:shadow-[0_4px_12px_rgba(33,45,39,.06)] ${
        compact ? 'w-44' : ''
      }`}
    >
      <div className="absolute bottom-0 left-0 top-0 w-[3px] rounded-l-lg" style={{ background: color }} />
      <div className="px-3 py-2 pl-3.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-bold leading-tight text-[#2a312d]">{job.customerName}</h3>
          {job.area && <span className="shrink-0 font-mono text-sm font-semibold text-[#7a827c]">{job.area}</span>}
        </div>
        {job.scope && <p className="mt-1 text-sm font-medium leading-snug text-[#525a54]">{job.scope}</p>}
        {job.note && <p className="mt-0.5 text-xs leading-snug text-[#8a928c]">{job.note}</p>}
        {(job.priority === 'high' || job.assignedTo || job.scheduledDate) && (
          <div className="mt-1.5 flex items-center gap-2 text-xs text-[#9aa29c]">
            {job.priority === 'high' && (
              <span className="h-2 w-2 rounded-full bg-[#D37D63]" title="High priority" aria-label="High priority" />
            )}
            {job.assignedTo && <span>{job.assignedTo}</span>}
            {job.scheduledDate && <span className="font-mono">{job.scheduledDate}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

const labelClass = 'text-sm font-semibold text-[#8a928c]';

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
                {statusConfig.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Assigned to</label>
              <input className={`${fieldClass} mt-1`} value={draft.assignedTo ?? ''} onChange={(e) => set('assignedTo', e.target.value)} placeholder="Randy, Jordan" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Priority</label>
              <select className={`${fieldClass} mt-1`} value={draft.priority ?? 'normal'} onChange={(e) => set('priority', e.target.value as Job['priority'])}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Color label</label>
              <div className="mt-1 flex items-center gap-1.5">
                {Object.entries(colorTokens).map(([key, { hex, label }]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => set('color', key as ColorKey)}
                    className={`h-6 w-6 rounded-full border-2 transition ${
                      draft.color === key ? 'scale-110 border-[#2a312d]' : 'border-transparent hover:scale-105'
                    }`}
                    style={{ background: hex }}
                    aria-label={label}
                  />
                ))}
              </div>
            </div>
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
