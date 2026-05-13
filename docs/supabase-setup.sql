-- Ariadne Reader Supabase setup.
-- Run this in the Supabase SQL editor for the project backing the app.
-- This file is intentionally a setup script, not a generated Supabase CLI migration.

create extension if not exists pgcrypto;

create schema if not exists private;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.pdf_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  file_name text not null,
  file_hash text,
  total_pages integer not null check (total_pages > 0),
  current_page integer not null default 1 check (current_page > 0),
  scroll_offset numeric not null default 0,
  zoom numeric not null default 1 check (zoom > 0),
  zoom_mode text not null default 'manual' check (zoom_mode in ('manual', 'fit-width')),
  page_tint text not null default 'paper' check (page_tint in ('paper', 'sepia', 'night')),
  storage_path text not null,
  uploaded_at timestamptz not null default now(),
  last_opened_at timestamptz,
  deadline date,
  total_reading_seconds integer not null default 0 check (total_reading_seconds >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint current_page_within_document check (current_page <= total_pages)
);

create table if not exists public.chapters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.pdf_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  start_page integer not null check (start_page > 0),
  end_page integer not null check (end_page > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chapter_range_order check (start_page <= end_page)
);

create table if not exists public.highlights (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.pdf_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  page_number integer not null check (page_number > 0),
  ranges jsonb not null,
  excerpt text not null,
  color text not null default 'thread' check (color in ('thread', 'sun', 'olive', 'wine')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reading_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.pdf_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  seconds integer not null default 0 check (seconds >= 0),
  pages_read integer not null default 0 check (pages_read >= 0),
  unique (project_id, date)
);

-- Keep older Ariadne databases compatible when this setup file is re-run.
alter table public.pdf_projects
  add column if not exists zoom_mode text not null default 'manual',
  add column if not exists page_tint text not null default 'paper',
  add column if not exists total_reading_seconds integer not null default 0;

create index if not exists pdf_projects_user_id_idx on public.pdf_projects(user_id);
create index if not exists pdf_projects_last_opened_at_idx on public.pdf_projects(last_opened_at desc);
create index if not exists chapters_project_id_idx on public.chapters(project_id);
create index if not exists chapters_user_id_idx on public.chapters(user_id);
create index if not exists highlights_project_page_idx on public.highlights(project_id, page_number);
create index if not exists highlights_user_id_idx on public.highlights(user_id);
create index if not exists reading_sessions_user_id_idx on public.reading_sessions(user_id);

drop trigger if exists set_pdf_projects_updated_at on public.pdf_projects;
create trigger set_pdf_projects_updated_at
before update on public.pdf_projects
for each row execute function private.set_updated_at();

drop trigger if exists set_chapters_updated_at on public.chapters;
create trigger set_chapters_updated_at
before update on public.chapters
for each row execute function private.set_updated_at();

drop trigger if exists set_highlights_updated_at on public.highlights;
create trigger set_highlights_updated_at
before update on public.highlights
for each row execute function private.set_updated_at();

alter table public.pdf_projects enable row level security;
alter table public.chapters enable row level security;
alter table public.highlights enable row level security;
alter table public.reading_sessions enable row level security;

-- Supabase Data API access must be explicit. These tables are only for
-- signed-in users and trusted server-side code, not anonymous visitors.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from public;

revoke all on public.pdf_projects from anon, public;
revoke all on public.chapters from anon, public;
revoke all on public.highlights from anon, public;
revoke all on public.reading_sessions from anon, public;

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on public.pdf_projects to authenticated, service_role;
grant select, insert, update, delete on public.chapters to authenticated, service_role;
grant select, insert, update, delete on public.highlights to authenticated, service_role;
grant select, insert, update, delete on public.reading_sessions to authenticated, service_role;

drop policy if exists "Users can read their own projects" on public.pdf_projects;
create policy "Users can read their own projects"
on public.pdf_projects
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own projects" on public.pdf_projects;
create policy "Users can create their own projects"
on public.pdf_projects
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own projects" on public.pdf_projects;
create policy "Users can update their own projects"
on public.pdf_projects
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own projects" on public.pdf_projects;
create policy "Users can delete their own projects"
on public.pdf_projects
for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own chapters" on public.chapters;
create policy "Users can read their own chapters"
on public.chapters
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own chapters" on public.chapters;
create policy "Users can create their own chapters"
on public.chapters
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own chapters" on public.chapters;
create policy "Users can update their own chapters"
on public.chapters
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own chapters" on public.chapters;
create policy "Users can delete their own chapters"
on public.chapters
for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own highlights" on public.highlights;
create policy "Users can read their own highlights"
on public.highlights
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own highlights" on public.highlights;
create policy "Users can create their own highlights"
on public.highlights
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own highlights" on public.highlights;
create policy "Users can update their own highlights"
on public.highlights
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own highlights" on public.highlights;
create policy "Users can delete their own highlights"
on public.highlights
for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own reading sessions" on public.reading_sessions;
create policy "Users can read their own reading sessions"
on public.reading_sessions
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own reading sessions" on public.reading_sessions;
create policy "Users can create their own reading sessions"
on public.reading_sessions
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own reading sessions" on public.reading_sessions;
create policy "Users can update their own reading sessions"
on public.reading_sessions
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own reading sessions" on public.reading_sessions;
create policy "Users can delete their own reading sessions"
on public.reading_sessions
for delete
to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pdfs', 'pdfs', false, 104857600, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read own pdf files" on storage.objects;
create policy "Users can read own pdf files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'pdfs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can upload own pdf files" on storage.objects;
create policy "Users can upload own pdf files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'pdfs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can update own pdf files" on storage.objects;
create policy "Users can update own pdf files"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'pdfs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'pdfs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can delete own pdf files" on storage.objects;
create policy "Users can delete own pdf files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'pdfs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
