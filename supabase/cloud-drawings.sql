-- Cloud drawings for this Excalidraw fork.
-- Run once in your Supabase project: SQL Editor -> New query -> paste -> Run.
-- Safe to re-run.

create table if not exists public.drawings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  name text not null default 'Untitled' check (char_length(name) <= 200),
  -- the serialized .excalidraw scene (JSON text, images included)
  scene text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists drawings_owner_updated_idx
  on public.drawings (owner_id, updated_at desc);

-- updated_at changes on every write; the app uses it to detect edits made on
-- another device so one copy never silently overwrites the other
create or replace function public.drawings_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists drawings_set_updated_at on public.drawings;
create trigger drawings_set_updated_at
  before update on public.drawings
  for each row execute function public.drawings_set_updated_at();

-- Only the signed-in owner can see or change their drawings.
alter table public.drawings enable row level security;

drop policy if exists "Owners can read their drawings" on public.drawings;
create policy "Owners can read their drawings"
  on public.drawings for select
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists "Owners can add drawings" on public.drawings;
create policy "Owners can add drawings"
  on public.drawings for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "Owners can update their drawings" on public.drawings;
create policy "Owners can update their drawings"
  on public.drawings for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "Owners can delete their drawings" on public.drawings;
create policy "Owners can delete their drawings"
  on public.drawings for delete
  to authenticated
  using (owner_id = auth.uid());
