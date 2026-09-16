// One-off migration: replace placeholder seed jobs with the real jobs
// transcribed from the dispatch whiteboard photos, and set the real
// territory color key. Run once with `node scripts/import-whiteboard-jobs.mjs`.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')];
    })
);

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

// note: "verify from photo" flags carry over the OCR doc's Low-confidence
// warnings and [unclear] markers. "Marker N" preserves the circled number
// whose meaning wasn't specified on the board — kept as data, not discarded.
// job_type isn't set here — every job defaults to 'install' in the DB.
// Tag individual jobs as Maintenance from the app afterward.
const jobs = [
  // Barge #1 — Randy
  { customer_name: 'Kevin Smith', area: null, scope: 'Re-level, T.S.', note: 'Marker — · unclear, verify from photo', status: 'barge-1', assigned_to: 'Randy', sort_order: 0 },
  { customer_name: 'Alderson Family', area: 'NE', scope: 'Build cradle for (P) ski, 5-step ladder', note: 'Marker 3', status: 'barge-1', assigned_to: 'Randy', sort_order: 1 },
  { customer_name: 'Bellame', area: null, scope: '10K', note: 'Marker 2 · low confidence name, verify from photo', status: 'barge-1', assigned_to: 'Randy', sort_order: 2 },
  { customer_name: 'Craig Desimone', area: 'TI', scope: '10K lift, no existing lift', note: 'Marker 2', status: 'barge-1', assigned_to: 'Randy', sort_order: 3 },
  { customer_name: 'Diane Katsafis', area: 'M.B.', scope: 'Framing', note: 'Marker 4 · remainder unclear, verify from photo', status: 'barge-1', assigned_to: 'Randy', sort_order: 4 },

  // Barge #2 — crew not labeled on board
  { customer_name: 'Powers', area: 'NE', scope: 'Dock rebuild, decking without railings', note: 'Marker 8', status: 'barge-2', sort_order: 0 },
  { customer_name: 'Kameroff', area: 'M.B.', scope: 'Dock', note: 'Marker 10', status: 'barge-2', sort_order: 1 },
  { customer_name: 'Steven Garvey', area: 'NW', scope: "10K, 8' x 24' dock", note: 'Marker 7', status: 'barge-2', sort_order: 2 },
  { customer_name: 'Bush', area: 'Seminole', scope: "Re-deck, 20' x 4' pier + stairs", note: 'Marker 1', status: 'barge-2', sort_order: 3 },

  // Barge #3 — Josh
  { customer_name: 'Village of T.V.', area: 'T.V.', scope: 'Dock / framing', note: null, status: 'barge-3', assigned_to: 'Josh', sort_order: 0 },
  { customer_name: 'Capell', area: 'Village', scope: '13K, no demo', note: 'Marker 2', status: 'barge-3', assigned_to: 'Josh', sort_order: 1 },
  { customer_name: 'Johansen', area: 'Village', scope: '13K, no demo', note: 'Marker 2', status: 'barge-3', assigned_to: 'Josh', sort_order: 2 },
  { customer_name: 'Barry Gordon', area: "Yee's", scope: 'R&R lift poles', note: 'Marker 2 · (11) extra poles unclear, verify from photo', status: 'barge-3', assigned_to: 'Josh', sort_order: 3 },
  { customer_name: 'Cox', area: 'T.V.', scope: 'Tie hole', note: 'Marker 1', status: 'barge-3', assigned_to: 'Josh', sort_order: 4 },

  // Ready — explicitly labeled "Ready" or "Needs schedule" on Whiteboard 1
  { customer_name: 'David Morgan', area: 'M.B.', scope: 'R&R lift poles', note: 'Marker 2 · salt/electric note unclear, verify from photo', status: 'ready', sort_order: 0 },
  { customer_name: 'Steve Stringler', area: 'M.B.', scope: 'R&R (4) piles, demo (3)', note: 'Marker 5 · verify from photo', status: 'ready', sort_order: 1 },
  { customer_name: 'Reich', area: null, scope: 'Needs schedule', note: null, scheduled_date: 'Oct 16', status: 'ready', sort_order: 2 },
  { customer_name: 'Caruso', area: null, scope: 'Needs schedule', note: null, scheduled_date: 'Oct 26', status: 'ready', sort_order: 3 },
  { customer_name: 'Ron Knesenthal', area: 'TI', scope: '16K, 6 piling, no demo', note: "Marker 3 · measurements unclear (30'/25'), verify from photo", status: 'ready', sort_order: 4 },
  { customer_name: 'Eckert', area: 'M.B.', scope: '(2) 4K, catwalk', note: 'Marker 8', status: 'ready', sort_order: 5 },

  // Whiteboard 2 — no barge/status label on the board; placed in Ready
  // pending dispatch. Flag left in the note so this assumption is visible.
  { customer_name: 'Deangelis', area: 'R.B.', scope: 'R&R lift, new legs, no lift', note: 'Marker 3 · from Whiteboard 2, no barge assigned yet', status: 'ready', sort_order: 6 },
  { customer_name: 'J. Rowens', area: 'M.B.', scope: '13K, no demo', note: 'Marker 2 · from Whiteboard 2', status: 'ready', sort_order: 7 },
  { customer_name: 'Fox Builds', area: 'Bell Rch', scope: 'Demo, dock, 13K', note: 'Marker 6 · from Whiteboard 2, area unclear', status: 'ready', sort_order: 8 },
  { customer_name: 'Chris Barry', area: 'S.P.B.', scope: '(1) string lift', note: 'Marker 1 · from Whiteboard 2, unclear, verify from photo', status: 'ready', sort_order: 9 },
  { customer_name: 'Bobbitt / Boone', area: 'T.V.', scope: '10K, 8K pier', note: 'Marker 6 · from Whiteboard 2, unclear, verify from photo', status: 'ready', sort_order: 10 },
  { customer_name: 'Steve Sisson', area: 'S.P.B.', scope: 'R&R (4) piles, re-deck dock', note: 'Marker 4 · from Whiteboard 2', status: 'ready', sort_order: 11 },
  { customer_name: 'Brito', area: 'T.V.', scope: '10K, demo lift', note: 'Marker 2 · from Whiteboard 2', status: 'ready', sort_order: 12 },
  { customer_name: 'Stephen Olson', area: 'NE', scope: '10K (2 skis), ramp lift, no demo', note: 'Marker 4 · from Whiteboard 2', status: 'ready', sort_order: 13 },
  { customer_name: 'Russ Fugel', area: 'Broadwater', scope: '(1) dock pole', note: 'Marker 5 · from Whiteboard 2', status: 'ready', sort_order: 14 },
  { customer_name: 'John Traverthan', area: 'TI', scope: '10K, no demo', note: 'Marker 2 · from Whiteboard 2, verify name from photo', status: 'ready', sort_order: 15 },
  { customer_name: 'Kowalski', area: 'Village', scope: '13K, no demo', note: 'Marker 2 · from Whiteboard 2', status: 'ready', sort_order: 16 },
  { customer_name: 'Matt Adams', area: 'S.P.B.', scope: '7\'4" dock, some demo, no lift', note: 'Marker 10 · from Whiteboard 2', status: 'ready', sort_order: 17 },
  { customer_name: 'Pedro Eid', area: 'I.R.B.', scope: 'R&R lift arms, (3) tie poles', note: 'Marker 3 · from Whiteboard 2', status: 'ready', sort_order: 18 },
  { customer_name: 'Walnoos', area: 'BEACHES', scope: "10K STS, demo, 8' new dock", note: 'Marker 10 · from Whiteboard 2 (Redington Shores), verify name from photo', status: 'ready', sort_order: 19 },
  { customer_name: 'Avery Hysker', area: null, scope: 'Used lift dock, no demo', note: 'Marker 2 · from Whiteboard 2, area unclear ("S."), verify from photo', status: 'ready', sort_order: 20 },
  { customer_name: 'Steve Hesse', area: 'T.V.', scope: '(1) used lift, (5) tie poles', note: 'Marker 4 · from Whiteboard 2', status: 'ready', sort_order: 21 },
  { customer_name: 'Evan Davis', area: 'SE', scope: '12 x 5 dock, railing', note: 'Marker 4 · from Whiteboard 2', status: 'ready', sort_order: 22 },
  { customer_name: 'Debo', area: 'I.R.B.', scope: 'Demo only, dock / ramp', note: 'Marker 2 · from Whiteboard 2, "4/27" note unclear, verify from photo', status: 'ready', sort_order: 23 },
  { customer_name: 'Vimmer/Vimmerer', area: 'MAXI', scope: '13K, rear lift', note: 'Marker 3 · from Whiteboard 2, verify name from photo', status: 'ready', sort_order: 24 },
  { customer_name: 'Nick Harris', area: 'S.P.B.', scope: 'Scope of job, permit', note: 'Marker 4 · from Whiteboard 2', status: 'ready', sort_order: 25 },
  { customer_name: 'Dan Bosch', area: 'Broadwater', scope: 'Dock', note: 'Marker 7 · from Whiteboard 2, piling count unclear, verify from photo', status: 'ready', sort_order: 26 },

  // Waiting / Permits
  { customer_name: 'Young', area: 'MAXI', scope: 'Bunks', note: 'Ordered — awaiting materials', status: 'waiting-permits', sort_order: 0 },
];

const newAreaColors = {
  NW: 'blue',
  BEACHES: 'grey',
  TI: 'orange',
  SW: 'brown',
  NE: 'pink',
  SE: 'purple',
  MAXI: 'green',
};

async function main() {
  console.log(`Deleting existing placeholder jobs...`);
  const { error: delError, count } = await supabase
    .from('dockflow_jobs')
    .delete({ count: 'exact' })
    .not('id', 'is', null); // matches every row; Supabase requires an explicit filter
  if (delError) throw delError;
  console.log(`  deleted ${count} rows`);

  console.log(`Inserting ${jobs.length} jobs from the whiteboard OCR...`);
  const { error: insError, data } = await supabase.from('dockflow_jobs').insert(jobs).select('id');
  if (insError) throw insError;
  console.log(`  inserted ${data.length} rows`);

  console.log(`Updating territory color key...`);
  const { data: settingsRow, error: selError } = await supabase
    .from('dockflow_board_settings')
    .select('columns')
    .eq('id', 1)
    .maybeSingle();
  if (selError) throw selError;
  const { error: updError } = await supabase
    .from('dockflow_board_settings')
    .upsert({ id: 1, columns: settingsRow.columns, area_colors: newAreaColors });
  if (updError) throw updError;
  console.log(`  area_colors set to`, newAreaColors);

  console.log('Done.');
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
