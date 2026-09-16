export type JobStatus =
  | 'barge-1' | 'barge-2' | 'barge-3'
  | 'ready' | 'waiting-permits' | 'hold' | 'complete';

export type JobPriority = 'low' | 'normal' | 'high';
export type AreaColorKey = 'none' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink';

export interface Job {
  id: string;
  customerName: string;
  area?: string;
  scope?: string;
  note?: string;
  status: JobStatus;
  scheduledDate?: string;
  assignedTo?: string;
  priority?: JobPriority;
  /** Position within its column. Only meaningful relative to other jobs in the same column. */
  sortOrder?: number;
}

export const areaColorTokens: Record<AreaColorKey, { label: string; hex: string }> = {
  none:   { label: 'None',   hex: '#e5e7eb' },
  red:    { label: 'Red',    hex: '#ef4444' },
  orange: { label: 'Orange', hex: '#f97316' },
  yellow: { label: 'Yellow', hex: '#eab308' },
  green:  { label: 'Green',  hex: '#22c55e' },
  blue:   { label: 'Blue',   hex: '#3b82f6' },
  purple: { label: 'Purple', hex: '#a855f7' },
  pink:   { label: 'Pink',   hex: '#ec4899' },
};

/**
 * Fixed presentation for each column: what it's called, its dot color, and
 * whether its cards wrap into a chip row instead of a list. This never
 * changes at runtime — columns can't be renamed, added or removed.
 *
 * What CAN change at runtime (visibility, width, order) lives in the
 * `dockflow_board_settings` table instead, via ColumnLayout below, because
 * that's shared across every screen looking at the board.
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
  { id: 'complete',        label: 'Complete',               accent: '#A8B0AC', compact: true },
];

/** Per-column width (out of 12), display order, and show/hide. Editable from the board's settings panel. */
export interface ColumnLayout {
  id: JobStatus;
  span: number;
  position: number;
  visible: boolean;
}

export const defaultLayout: ColumnLayout[] = [
  { id: 'barge-1',         span: 4,  position: 0, visible: true },
  { id: 'barge-2',         span: 4,  position: 1, visible: true },
  { id: 'barge-3',         span: 4,  position: 2, visible: true },
  { id: 'ready',           span: 6,  position: 3, visible: true },
  { id: 'waiting-permits', span: 3,  position: 4, visible: true },
  { id: 'hold',            span: 3,  position: 5, visible: true },
  { id: 'complete',        span: 12, position: 6, visible: true },
];

export interface AreaColorSettings {
  [areaCode: string]: AreaColorKey;
}

export const defaultAreaColors: AreaColorSettings = {
  'TI': 'red',
  'NE': 'blue',
  'MB': 'green',
};
