create table if not exists public.charades_topics (
  id integer primary key,
  name text not null default '',
  prompts jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.charades_settings (
  id integer primary key,
  timer_seconds integer not null default 60,
  updated_at timestamptz not null default now()
);

alter table public.charades_topics enable row level security;
alter table public.charades_settings enable row level security;

drop policy if exists "public read charades topics" on public.charades_topics;
create policy "public read charades topics"
on public.charades_topics
for select
to anon, authenticated
using (true);

drop policy if exists "public write charades topics" on public.charades_topics;
create policy "public write charades topics"
on public.charades_topics
for insert
to anon, authenticated
with check (true);

drop policy if exists "public update charades topics" on public.charades_topics;
create policy "public update charades topics"
on public.charades_topics
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "public delete charades topics" on public.charades_topics;
create policy "public delete charades topics"
on public.charades_topics
for delete
to anon, authenticated
using (true);

drop policy if exists "public read charades settings" on public.charades_settings;
create policy "public read charades settings"
on public.charades_settings
for select
to anon, authenticated
using (true);

drop policy if exists "public write charades settings" on public.charades_settings;
create policy "public write charades settings"
on public.charades_settings
for insert
to anon, authenticated
with check (true);

drop policy if exists "public update charades settings" on public.charades_settings;
create policy "public update charades settings"
on public.charades_settings
for update
to anon, authenticated
using (true)
with check (true);

insert into public.charades_settings (id, timer_seconds)
values (1, 60)
on conflict (id) do nothing;
