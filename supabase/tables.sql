-- 이미 적용됨 (기록용)
create table public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 1 and 20),
  created_at timestamptz not null default now()
);
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  played_on date not null,
  team_a uuid[] not null,
  team_b uuid[] not null,
  sets jsonb not null,
  entered_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);
create index matches_played_on_idx on public.matches (played_on desc);
create index matches_entered_by_idx on public.matches (entered_by);
create table public.league_settings (
  id int primary key default 1 check (id = 1),
  win_points int not null default 3 check (win_points between 0 and 10),
  loss_points int not null default 1 check (loss_points between 0 and 10)
);
insert into public.league_settings (id) values (1);
alter table public.members enable row level security;
alter table public.matches enable row level security;
alter table public.league_settings enable row level security;
create policy "public read members" on public.members for select to anon, authenticated using (true);
create policy "public read matches" on public.matches for select to anon, authenticated using (true);
create policy "public read settings" on public.league_settings for select to anon, authenticated using (true);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.club_secret (id int primary key default 1 check (id = 1), pin_hash text not null);
create table private.pin_failures (at timestamptz not null default now());
