import { supabase } from './supabase';
import { defaultLayout, defaultAreaColors, type ColumnLayout, type AreaColorSettings } from '../data';

const TABLE = 'dockflow_board_settings';

/** Reads the shared column layout. On the very first run (no row yet), seeds it with the defaults. */
export async function fetchLayout(): Promise<ColumnLayout[]> {
  const { data, error } = await supabase.from(TABLE).select('columns').eq('id', 1).maybeSingle();
  if (error) throw error;
  if (!data) {
    const { error: insertError } = await supabase.from(TABLE).insert({ id: 1, columns: defaultLayout });
    if (insertError) throw insertError;
    return defaultLayout;
  }
  return data.columns as ColumnLayout[];
}

export async function saveLayout(columns: ColumnLayout[]): Promise<void> {
  const { error } = await supabase.from(TABLE).upsert({ id: 1, columns });
  if (error) throw error;
}

/** Reads area color settings. Seeds with defaults on first run. */
export async function fetchAreaColors(): Promise<AreaColorSettings> {
  const { data, error } = await supabase.from(TABLE).select('area_colors').eq('id', 1).maybeSingle();
  if (error) throw error;

  if (!data) {
    const { error: insertError } = await supabase.from(TABLE).insert({
      id: 1,
      columns: defaultLayout,
      area_colors: defaultAreaColors
    });
    if (insertError) throw insertError;
    return defaultAreaColors;
  }

  return (data.area_colors ?? defaultAreaColors) as AreaColorSettings;
}

/**
 * Upserts only area_colors. Postgres validates NOT NULL columns against the
 * insert tuple before ON CONFLICT resolution runs, so a partial upsert like
 * `{ id, area_colors }` fails on `columns` even when a matching row already
 * exists. Read the current columns first so every upsert carries a
 * complete, valid row.
 */
export async function saveAreaColors(areaColors: AreaColorSettings): Promise<void> {
  const columns = await fetchLayout();
  const { error } = await supabase.from(TABLE).upsert({ id: 1, columns, area_colors: areaColors });
  if (error) throw error;
}
