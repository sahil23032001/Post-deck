-- Run this once in Supabase: SQL Editor > New query > paste > Run

create table if not exists profile (
  id int primary key default 1,
  about text not null default '',
  rules text not null default '',
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);

create table if not exists moments (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  hook text not null default '',
  body text not null default '',
  pillar text not null default 'Story',
  status text not null default 'idea' check (status in ('idea','drafting','scheduled','posted')),
  scheduled_for date,
  impressions int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists patterns (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'Pattern',
  name text not null,
  how text not null,
  example text not null default '',
  created_at timestamptz not null default now()
);

-- Only the server (service role key) talks to these tables.
alter table profile enable row level security;
alter table moments enable row level security;
alter table posts enable row level security;
alter table patterns enable row level security;
