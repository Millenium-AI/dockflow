import { supabase } from './supabase';
import type { Job, JobFile, JobPriority, JobStatus, JobType, AreaColorKey } from '../data';

const TABLE = 'dockflow_jobs';
const FILES_BUCKET = 'job-files';

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
  job_type: JobType | null;
  sort_order: number | null;
  files: JobFile[] | null;
  completed_at: string | null;
  price: number | null;
  days_of_work: number | null;
  subarea: string | null;
  subarea_color: string | null;
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
  jobType: r.job_type ?? 'install',
  sortOrder: r.sort_order ?? undefined,
  files: r.files ?? [],
  completedAt: r.completed_at ?? undefined,
  price: r.price ?? undefined,
  daysOfWork: r.days_of_work ?? undefined,
  subarea: r.subarea ?? undefined,
  subareaColor: (r.subarea_color as AreaColorKey) ?? undefined,
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
  job_type: j.jobType || 'install',
  sort_order: typeof j.sortOrder === 'number' ? j.sortOrder : null,
  files: j.files && j.files.length > 0 ? j.files : null,
  completed_at: j.completedAt || null,
  price: typeof j.price === 'number' ? j.price : null,
  days_of_work: typeof j.daysOfWork === 'number' ? j.daysOfWork : null,
  subarea: j.subarea || null,
  subarea_color: j.subareaColor || null,
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
 * If moving to 'complete', sets completed_at to now.
 */
export async function reorderColumn(status: JobStatus, orderedIds: string[]): Promise<void> {
  const update = status === 'complete'
    ? { status, sort_order: null as any, completed_at: new Date().toISOString() }
    : { status, sort_order: null as any };

  await Promise.all(
    orderedIds.map((id, index) => {
      const finalUpdate = { ...update, sort_order: index };
      return supabase.from(TABLE).update(finalUpdate).eq('id', id);
    })
  );
}

/** Upload a file to a job. Updates job.files array. */
export async function uploadJobFile(jobId: string, file: File, currentFiles: JobFile[]): Promise<JobFile[]> {
  const timestamp = new Date().toISOString();
  const path = `${jobId}/${timestamp}-${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from(FILES_BUCKET)
    .upload(path, file);
  if (uploadError) throw uploadError;

  const newFile: JobFile = {
    name: file.name,
    size: file.size,
    uploadedAt: timestamp,
    path,
  };

  return [...currentFiles, newFile];
}

/** Delete a file from a job. Updates job.files array. */
export async function deleteJobFile(jobId: string, filePath: string, currentFiles: JobFile[]): Promise<JobFile[]> {
  const { error: deleteError } = await supabase.storage
    .from(FILES_BUCKET)
    .remove([filePath]);
  if (deleteError) throw deleteError;

  return currentFiles.filter((f) => f.path !== filePath);
}

/** Get a download URL for a file. */
export async function getJobFileUrl(jobId: string, filePath: string): Promise<string> {
  const { data } = await supabase.storage
    .from(FILES_BUCKET)
    .createSignedUrl(filePath, 3600); // 1 hour expiry
  if (!data?.signedUrl) throw new Error('Failed to generate download URL');
  return data.signedUrl;
}
