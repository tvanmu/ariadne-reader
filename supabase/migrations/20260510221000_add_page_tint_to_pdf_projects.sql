alter table public.pdf_projects
add column page_tint text not null default 'paper'
check (page_tint in ('paper', 'sepia', 'night'));
