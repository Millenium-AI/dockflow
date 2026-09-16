import { supabase } from './supabase';
import { defaultAreaColors, type AreaColorSettings } from '../data';

const TABLE = 'dockflow_board_settings';

/**
 * The board's column layout is hard-coded (see `tabGridSpecs` in data.ts),
 * not user-editable, so there's nothing to read back for it. `columns` is
 * a legacy NOT NULL field on this row from when layout was draggable —
 * every write still has to carry a value for it.
 */
const LEGACY_COLUMNS_PLACEHOLDER: never[] = [];

/** Reads area color settings. Seeds with defaults on first run. */
export async function fetchAreaColors(): Promise<AreaColorSettings> {
  const { data, error } = await supabase.from(TABLE).select('area_colors').eq('id', 1).maybeSingle();
  if (error) throw error;

  if (!data) {
    const { error: insertError } = await supabase.from(TABLE).insert({
      id: 1,
      columns: LEGACY_COLUMNS_PLACEHOLDER,
      area_colors: defaultAreaColors,
    });
    if (insertError) throw insertError;
    return defaultAreaColors;
  }

  return (data.area_colors ?? defaultAreaColors) as AreaColorSettings;
}

export async function saveAreaColors(areaColors: AreaColorSettings): Promise<void> {
  const { error } = await supabase.from(TABLE).upsert({ id: 1, columns: LEGACY_COLUMNS_PLACEHOLDER, area_colors: areaColors });
  if (error) throw error;
}

/** Reads per-area opacity (0-1 scale). Defaults to an empty map -- callers should treat a missing key as 1 (fully opaque). */
export async function fetchAreaOpacity(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from(TABLE).select('area_opacity').eq('id', 1).maybeSingle();
  if (error) throw error;
  return (data?.area_opacity ?? {}) as Record<string, number>;
}

export async function saveAreaOpacity(areaOpacity: Record<string, number>): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .upsert({ id: 1, columns: LEGACY_COLUMNS_PLACEHOLDER, area_opacity: areaOpacity });
  if (error) throw error;
}
