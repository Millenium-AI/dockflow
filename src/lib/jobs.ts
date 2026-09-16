import { supabase } from './supabase';
import type { Job, JobPriority, JobStatus } from '../data';

const TABLE = 'dockflow_jobs';

interface Row {
  id: string;
  customer_name: string;
  area: string | null;
  scope: string | null;
  note: string | null;
  status: JobStatus;
  scheduled_date: string | null;
  assigned_to: string | null;
  priority: JobPriority | null;
  sort_order: number | null;
}

const fromRow = (r: Row): Job => ({
  id: r.id,
  customerName: r.customer_name,
  area: r.area ?? '',
  scope: r.scope ?? '',
  note: r.note ?? '',
  status: r.status,
  scheduledDate: r.scheduled_date ?? '',
  assignedTo: r.assigned_to ?? '',
  priority: r.priority ?? 'normal',
  sortOrder: r.sort_order ?? undefined,
});

const toRow = (j: Job) => ({
  id: j.id,
  customer_name: j.customerName,
  area: j.area || null,
  scope: j.scope || null,
  note: j.note || null,
  status: j.status,
  scheduled_date: j.scheduledDate || null,
  assigned_to: j.assignedTo || null,
  priority: j.priority || 'normal',
  sort_order: typeof j.sortOrder === 'number' ? j.sortOrder : null,
});

export async function fetchJobs(): Promise<Job[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('customer_name', { ascending: true });
  if (error) throw error;
  return (data as Row[]).map(fromRow);
}

export async function saveJob(job: Job): Promise<void> {
  const { error } = await supabase.from(TABLE).upsert(toRow(job));
  if (error) throw error;
}

export async function removeJob(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

/**
 * Puts `orderedIds` into `status`, in that exact order, by writing 0..n-1
 * into sort_order for each. Used for every drag: moving within a column,
 * moving to a different column, and dropping at a specific spot in either.
 */
export async function reorderColumn(status: JobStatus, orderedIds: string[]): Promise<void> {
  await Promise.all(
    orderedIds.map((id, index) => supabase.from(TABLE).update({ status, sort_order: index }).eq('id', id))
  );
}
