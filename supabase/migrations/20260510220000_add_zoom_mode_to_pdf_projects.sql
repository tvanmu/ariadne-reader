alter table public.pdf_projects
add column zoom_mode text not null default 'manual'
check (zoom_mode in ('manual', 'fit-width'));
