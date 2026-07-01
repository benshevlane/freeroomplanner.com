-- Shareable room plans (save & share feature).
-- Run this once on the staging Supabase project, and once on production
-- before the feature goes live.

create table if not exists public.room_plans (
  id text primary key,
  name text not null default 'My floor plan',
  data jsonb not null,
  room_type text,
  country text,
  edit_key_hash text,
  open_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Lock the table down: row-level security with no policies means the table
-- is unreachable with the public (anon) key. Only the /api/plans endpoint,
-- which uses the service-role key, can read or write plans.
alter table public.room_plans enable row level security;

-- Fire-and-forget open counter used by GET /api/plans.
create or replace function public.increment_plan_opens(plan_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.room_plans set open_count = open_count + 1 where id = plan_id;
$$;

-- The counter function must not be callable by anonymous users directly.
revoke execute on function public.increment_plan_opens(text) from anon, authenticated;
