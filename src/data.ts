export type JobStatus =
  | 'barge-1' | 'barge-2' | 'barge-3'
  | 'ready' | 'waiting-permits' | 'hold' | 'complete';

export type JobPriority = 'low' | 'normal' | 'high';
export type JobType = 'install' | 'maintenance';
export type AreaColorKey = 'none' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'grey' | 'brown';

export interface JobFile {
  name: string;
  size: number;
  uploadedAt: string;
  path: string;
}

export interface Job {
  id: string;
  customerName: string;
  area?: string;
  scope?: string;
  note?: string;
  status: JobStatus;
  scheduledDate?: string;
  priority?: JobPriority;
  /** Independent of status/area — flags the kind of work, e.g. a repair vs a new install. */
  jobType?: JobType;
  /** Position within its column. Only meaningful relative to other jobs in the same column. */
  sortOrder?: number;
  /** Attached files and documents. */
  files?: JobFile[];
  /** Timestamp when the job was moved to 'complete' status. */
  completedAt?: string;
  /** Price in dollars. */
  price?: number;
  /** Estimated days of work to complete the job. */
  daysOfWork?: number;
  /** Sub-area or more specific location within the main area. */
  subarea?: string;
  /** Color key for the sub-area. */
  subareaColor?: AreaColorKey;
}

export const jobTypeTokens: Record<JobType, { label: string; hex: string }> = {
  install: { label: 'Install', hex: '#5b8a9e' },
  maintenance: { label: 'Maintenance', hex: '#c8862b' },
};

export const areaColorTokens: Record<AreaColorKey, { label: string; hex: string }> = {
  none:   { label: 'None',   hex: '#e5e7eb' },
  red:    { label: 'Red',    hex: '#ef4444' },
  orange: { label: 'Orange', hex: '#f97316' },
  yellow: { label: 'Yellow', hex: '#eab308' },
  green:  { label: 'Green',  hex: '#22c55e' },
  blue:   { label: 'Blue',   hex: '#3b82f6' },
  purple: { label: 'Purple', hex: '#a855f7' },
  pink:   { label: 'Pink',   hex: '#ec4899' },
  grey:   { label: 'Grey',   hex: '#6b7280' },
  brown:  { label: 'Brown',  hex: '#92400e' },
};

/**
 * Fixed presentation for each column: what it's called, its dot color, and
 * whether its cards wrap into a chip row instead of a list. This never
 * changes at runtime — columns can't be renamed, added, removed, resized,
 * or moved.
 */
export interface ColumnDefaults {
  id: JobStatus;
  label: string;
  accent: string;
  compact?: boolean;
}

export const columnDefaults: ColumnDefaults[] = [
  { id: 'barge-1',         label: 'Barge #1',               accent: '#6D8FA8' },
  { id: 'barge-2',         label: 'Barge #2',               accent: '#739B7B' },
  { id: 'barge-3',         label: 'Barge #3',               accent: '#C8A15A' },
  { id: 'ready',           label: 'Ready',                  accent: '#5B6E65' },
  { id: 'waiting-permits', label: 'Waiting / Permits',      accent: '#B27D6A' },
  { id: 'hold',            label: 'Hold / Needs Attention', accent: '#8B9291' },
  { id: 'complete',        label: 'Complete',               accent: '#A8B0AC' },
];

export type ViewTab = 'barges' | 'other' | 'reporting';

interface TabGridSpec {
  cols: number;
  rows: number;
  items: { id: JobStatus; gridColumn: string; gridRow: string }[];
}

/**
 * Hard-coded layout per tab — no drag/resize, this is the whole layout.
 * Barges: three equal columns. Status: a flex row with Ready (50%) on left,
 * and a flex column (50%) on right with Waiting (top 50%) and Hold|Complete
 * (bottom 50%, themselves split 50/50).
 */
export type LayoutType = 'grid' | 'flex-grid';

export const tabLayoutSpecs: Record<ViewTab, { type: LayoutType; items: JobStatus[] }> = {
  barges: {
    type: 'grid',
    items: ['barge-1', 'barge-2', 'barge-3'],
  },
  other: {
    type: 'flex-grid',
    items: ['ready', 'waiting-permits', 'hold', 'complete'],
  },
};

/** Legacy — kept for backward compat but not used. */
export const tabGridSpecs: Record<ViewTab, TabGridSpec> = {
  barges: {
    cols: 3,
    rows: 1,
    items: [
      { id: 'barge-1', gridColumn: '1 / span 1', gridRow: '1 / span 1' },
      { id: 'barge-2', gridColumn: '2 / span 1', gridRow: '1 / span 1' },
      { id: 'barge-3', gridColumn: '3 / span 1', gridRow: '1 / span 1' },
    ],
  },
  other: {
    cols: 4,
    rows: 2,
    items: [
      { id: 'ready',           gridColumn: '1 / span 2', gridRow: '1 / span 2' },
      { id: 'waiting-permits', gridColumn: '3 / span 2', gridRow: '1 / span 1' },
      { id: 'hold',            gridColumn: '3 / span 1', gridRow: '2 / span 1' },
      { id: 'complete',        gridColumn: '4 / span 1', gridRow: '2 / span 1' },
    ],
  },
};

export interface AreaColorSettings {
  [areaCode: string]: AreaColorKey;
}

/** Territory color key, transcribed from the dispatch whiteboards. */
export const defaultAreaColors: AreaColorSettings = {
  NW: 'blue',       // North of Park / Beaches / Park
  BEACHES: 'grey',
  TI: 'orange',     // Treasure Island: Top to Pasadena
  SW: 'brown',      // Pasadena to T.Y.
  NE: 'pink',       // Gandy to Crisp
  SE: 'purple',     // Crisp to Laguna
  MAXI: 'green',    // Gulfport / Maximo
};
