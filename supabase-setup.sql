-- DockFlow Job Board — one table, run this once in the Supabase SQL editor.

create table if not exists public.dockflow_jobs (
  id             uuid primary key default gen_random_uuid(),
  customer_name  text not null,
  area           text,
  scope          text,
  note           text,
  status         text not null default 'ready'
                 check (status in ('barge-1','barge-2','barge-3','ready','waiting-permits','hold','complete')),
  scheduled_date text,
  assigned_to    text,
  color          text default 'none'
                 check (color in ('none','coral','ocean','sage','sand','slate')),
  priority       text default 'normal'
                 check (priority in ('low','normal','high')),
  sort_order     int,
  updated_at     timestamptz not null default now()
);

create index if not exists dockflow_jobs_status_idx on public.dockflow_jobs (status);

-- Keep updated_at honest.
create or replace function public.dockflow_touch() returns trigger
  language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists dockflow_jobs_touch on public.dockflow_jobs;
create trigger dockflow_jobs_touch before update on public.dockflow_jobs
  for each row execute function public.dockflow_touch();

-- ---------------------------------------------------------------------------
-- ACCESS. Read this bit.
--
-- This policy lets anyone holding the public anon key read and write this
-- table. That is what makes the board work with no login, which is what you
-- want for a screen on a wall. It also means anyone who gets the site's URL
-- can see and edit the job list. Customer names and areas are in there.
--
-- If that's fine (internal URL, nobody hunting for it), leave as is.
-- If it isn't, say so and we'll put a single shared passcode in front of it.
-- ---------------------------------------------------------------------------
alter table public.dockflow_jobs enable row level security;

drop policy if exists dockflow_jobs_open on public.dockflow_jobs;
create policy dockflow_jobs_open on public.dockflow_jobs
  for all to anon, authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Starting jobs, carried over from the old hard-coded list.
-- ---------------------------------------------------------------------------
insert into public.dockflow_jobs
  (customer_name, area, scope, note, status, scheduled_date, assigned_to, color, priority, sort_order)
values
  ('Kevin Smith',      'TI',         '13K lift / new lift',                  'Assigned to Randy',    'barge-1', null,     'Randy',  'coral', 'high',   1),
  ('Alderson',         'NE',         'Framing, bull cable, step ladder',     null,                   'barge-1', null,     'Randy',  'ocean', 'normal', 2),
  ('Bellaire',         'MB',         '10K lift',                             null,                   'barge-1', null,     'Randy',  'coral', 'normal', 3),
  ('Craig Desmone',    'TI',         '10K lift, no existing lift',           null,                   'barge-1', null,     'Randy',  'coral', 'normal', 4),
  ('Diane Kotsafis',   'HP',         'Framing, cleats, caps',                null,                   'barge-1', null,     'Randy',  'ocean', 'low',    5),
  ('Powers',           'NE',         'Dock rebuild, decking & lift framing', null,                   'barge-2', null,     'Jordan', 'ocean', 'high',   1),
  ('Cameronoff',       'MB',         'Dock',                                 null,                   'barge-2', null,     'Jordan', 'ocean', 'normal', 2),
  ('Steven Garvey',    'NW',         '10K lift, 8'' x 24'' dock',            null,                   'barge-2', null,     'Jordan', 'coral', 'normal', 3),
  ('Bush',             'Seminole',   'Redeck, finger, stairs',               null,                   'barge-2', null,     'Jordan', 'ocean', 'low',    4),
  ('Capell',           'Village',    '13K lift, no demo',                    null,                   'barge-3', null,     'Mason',  'coral', 'normal', 1),
  ('Johansen',         'Village',    '13K lift, no demo',                    null,                   'barge-3', null,     'Mason',  'coral', 'normal', 2),
  ('Barry Gordon',     'Yee''s',     'R&R lift poles, extra pile',           null,                   'barge-3', null,     'Mason',  'sage',  'high',   3),
  ('Cox',              'TV',         'Tie pole',                             null,                   'barge-3', null,     'Mason',  'sage',  'low',    4),
  ('David Morgan',     'NPB',        'R&R lift poles, salt-elastic mod',     null,                   'ready',   null,     null,     'coral', 'high',   1),
  ('Steve Stringler',  'MB',         'R&R lift poles, demo',                 null,                   'ready',   null,     null,     'coral', 'normal', 2),
  ('Reich',            null,         'Needs schedule',                       'Oct 16',               'ready',   'Oct 16', null,     'sand',  'normal', 3),
  ('Caruso',           null,         'Needs schedule',                       'Oct 26',               'ready',   'Oct 26', null,     'sand',  'low',    4),
  ('Young',            'Gulfport',   'Bunks ordered',                        'Waiting on materials', 'waiting-permits', null, null, 'coral', 'normal', 1),
  ('Ron Korenstal',    'TI',         '16K / 6 piling, no demo',              'Waiting on permit',    'waiting-permits', null, null, 'sage',  'high',   2),
  ('Nick Harris',      'SIB',        'Scope of demolition',                  'Waiting on survey',    'waiting-permits', null, null, 'slate', 'normal', 3),
  ('Dana Beach',       'Broadwater', 'Dock, 4 concrete pilings',             'Waiting on permit',    'waiting-permits', null, null, 'sage',  'high',   4),
  ('Permit Pending',   'NE',         'Permit submitted',                     'Waiting on approval',  'waiting-permits', null, null, 'sand',  'normal', 5);

-- ---------------------------------------------------------------------------
-- Board settings — one shared row holding column visibility, width and
-- order, so every screen looking at the board sees the same layout. Added
-- when column customization (hide/show, resize, reorder) shipped.
--
-- area_colors: maps area codes to colors, supports edit/delete operations
-- area_opacity: maps area codes to opacity values (0.0 to 1.0)
-- ---------------------------------------------------------------------------
create table if not exists public.dockflow_board_settings (
  id           int primary key default 1 check (id = 1),
  columns      jsonb not null,
  area_colors  jsonb default '{"TI":"red","NE":"blue","MB":"green"}'::jsonb,
  area_opacity jsonb default '{"TI":1.0,"NE":1.0,"MB":1.0}'::jsonb,
  updated_at   timestamptz not null default now()
);

create or replace function public.dockflow_settings_touch() returns trigger
  language plpgsql
  set search_path = public
  as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists dockflow_board_settings_touch on public.dockflow_board_settings;
create trigger dockflow_board_settings_touch before update on public.dockflow_board_settings
  for each row execute function public.dockflow_settings_touch();

alter table public.dockflow_board_settings enable row level security;

drop policy if exists dockflow_board_settings_open on public.dockflow_board_settings;
create policy dockflow_board_settings_open on public.dockflow_board_settings
  for all to anon, authenticated using (true) with check (true);

alter table public.dockflow_jobs add column if not exists sort_order int;
alter table public.dockflow_board_settings add column if not exists area_colors jsonb default '{"TI":"red","NE":"blue","MB":"green"}'::jsonb;
alter table public.dockflow_board_settings add column if not exists area_opacity jsonb default '{"TI":1.0,"NE":1.0,"MB":1.0}'::jsonb;
