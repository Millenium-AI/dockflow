import { supabase } from './supabase';
import { defaultLayout, type ColumnLayout } from '../data';

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
