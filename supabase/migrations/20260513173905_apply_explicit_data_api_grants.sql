-- Supabase Data API explicit grants for Ariadne Reader.
-- These tables are user-owned app data, so the frontend should access them only
-- after sign-in via the authenticated role. The service_role grant is for trusted
-- server-side maintenance paths only; never expose a service role key in the browser.

alter table public.pdf_projects enable row level security;
alter table public.chapters enable row level security;
alter table public.highlights enable row level security;
alter table public.reading_sessions enable row level security;

revoke all on public.pdf_projects from anon, public;
revoke all on public.chapters from anon, public;
revoke all on public.highlights from anon, public;
revoke all on public.reading_sessions from anon, public;

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on public.pdf_projects to authenticated, service_role;
grant select, insert, update, delete on public.chapters to authenticated, service_role;
grant select, insert, update, delete on public.highlights to authenticated, service_role;
grant select, insert, update, delete on public.reading_sessions to authenticated, service_role;
