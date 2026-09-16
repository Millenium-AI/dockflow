import { supabase } from './supabase';
import type { ColorKey, Job, JobPriority, JobStatus } from '../data';

const TABLE = 'dockflow_jobs';

/** Postgres uses snake_case; the app uses camelCase. These two functions are the only bridge. */
interface Row {
  id: string;
  customer_name: string;
  area: string | null;
  scope: string | null;
  note: string | null;
  status: JobStatus;
  scheduled_date: string | null;
  assigned_to: string | null;
  color: ColorKey | null;
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
  color: r.color ?? 'none',
  priority: r.priority ?? 'normal',
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
  color: j.color || 'none',
  priority: j.priority || 'normal',
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

export async function moveJob(id: string, status: JobStatus): Promise<void> {
  const { error } = await supabase.from(TABLE).update({ status }).eq('id', id);
  if (error) throw error;
}

export async function removeJob(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}
