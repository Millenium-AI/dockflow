export type JobStatus =
  | 'barge-1' | 'barge-2' | 'barge-3'
  | 'ready' | 'waiting-permits' | 'hold' | 'complete';

export type JobPriority = 'low' | 'normal' | 'high';
export type ColorKey = 'none' | 'coral' | 'ocean' | 'sage' | 'sand' | 'slate';

export interface Job {
  id: string;
  customerName: string;
  area?: string;
  scope?: string;
  note?: string;
  status: JobStatus;
  scheduledDate?: string;
  assignedTo?: string;
  color?: ColorKey;
  priority?: JobPriority;
}

export const colorTokens: Record<ColorKey, { label: string; hex: string }> = {
  none:  { label: 'None',  hex: '#c8ccc8' },
  coral: { label: 'Coral', hex: '#D88972' },
  ocean: { label: 'Ocean', hex: '#6D8FA8' },
  sage:  { label: 'Sage',  hex: '#739B7B' },
  sand:  { label: 'Sand',  hex: '#C8A15A' },
  slate: { label: 'Slate', hex: '#8B9291' },
};

/**
 * The board layout lives here and nowhere else.
 * `span` is out of 12 columns. Each row must add up to 12, and the rows
 * fill top to bottom in this order. To add, remove or resize a column,
 * edit this list — App.tsx does not need to change.
 *
 *   barge-1 (4) + barge-2 (4) + barge-3 (4)          = 12
 *   ready   (6) + waiting  (3) + hold    (3)         = 12
 *   complete (12)                                    = 12
 */
export const statusConfig: {
  id: JobStatus;
  label: string;
  accent: string;
  span: number;
  compact?: boolean;
}[] = [
  { id: 'barge-1',         label: 'Barge #1',               accent: '#6D8FA8', span: 4 },
  { id: 'barge-2',         label: 'Barge #2',               accent: '#739B7B', span: 4 },
  { id: 'barge-3',         label: 'Barge #3',               accent: '#C8A15A', span: 4 },
  { id: 'ready',           label: 'Ready',                  accent: '#5B6E65', span: 6 },
  { id: 'waiting-permits', label: 'Waiting / Permits',      accent: '#B27D6A', span: 3 },
  { id: 'hold',            label: 'Hold / Needs Attention', accent: '#8B9291', span: 3 },
  { id: 'complete',        label: 'Complete',               accent: '#A8B0AC', span: 12, compact: true },
];
