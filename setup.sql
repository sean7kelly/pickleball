-- Sunday Pickleball Scheduler — Supabase setup / migration
-- Run this entire script in Supabase SQL Editor.
-- Safe to re-run — uses IF NOT EXISTS / ON CONFLICT DO NOTHING.

-- Unified contacts table (replaces separate players + contacts)
create table if not exists contacts (
  id             bigint primary key,
  name           text not null,
  phone          text not null default '',
  invited        boolean not null default true,
  is_player      boolean not null default false,
  gender         text not null default 'M',
  dupr           numeric(4,2) not null default 3.5,
  dupr_url       text,
  dupr_updated   timestamptz,
  wins           int not null default 0,
  losses         int not null default 0,
  partner_stats  jsonb default '{}'::jsonb,
  created_at     timestamptz default now()
);

-- Schedules table
create table if not exists schedules (
  id         bigint primary key,
  name       text not null default 'Sunday Schedule',
  date       text not null default '',
  selected   jsonb default '[]'::jsonb,
  matches    jsonb default '[]'::jsonb,
  generated  boolean default false,
  rounds     int default 10,
  mode       text default 'auto',
  rsvps      jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Settings table
create table if not exists settings (
  id         int primary key default 1,
  pin_hash   text default '',
  invite_msg text default 'Hey everyone! Pickleball this Sunday — who''s in? Reply YES to be added to the schedule, NO if you can''t make it. See you there! 🏓',
  updated_at timestamptz default now()
);

insert into settings (id) values (1) on conflict (id) do nothing;

-- RLS
alter table contacts  enable row level security;
alter table schedules enable row level security;
alter table settings  enable row level security;

drop policy if exists "service full access" on contacts;
drop policy if exists "service full access" on schedules;
drop policy if exists "service full access" on settings;

create policy "service full access" on contacts  for all using (true) with check (true);
create policy "service full access" on schedules for all using (true) with check (true);
create policy "service full access" on settings  for all using (true) with check (true);

-- Migration: copy any existing players into contacts (safe to run even if already done)
insert into contacts (id, name, phone, is_player, gender, dupr, dupr_url, dupr_updated, wins, losses, partner_stats)
select p.id, p.name, '', true, p.gender, p.dupr, p.dupr_url, p.dupr_updated, p.wins, p.losses, p.partner_stats
from players p
where not exists (select 1 from contacts c where c.id = p.id)
on conflict (id) do update set
  is_player = true,
  gender = excluded.gender,
  dupr = excluded.dupr,
  dupr_url = excluded.dupr_url,
  wins = excluded.wins,
  losses = excluded.losses,
  partner_stats = excluded.partner_stats;
