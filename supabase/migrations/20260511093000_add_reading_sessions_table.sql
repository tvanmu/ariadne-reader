CREATE TABLE public.reading_sessions (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.pdf_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  seconds INT NOT NULL DEFAULT 0 CHECK (seconds >= 0),
  pages_read INT NOT NULL DEFAULT 0 CHECK (pages_read >= 0),
  UNIQUE (project_id, date)
);

CREATE INDEX reading_sessions_user_id_idx ON public.reading_sessions(user_id);

ALTER TABLE public.reading_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.reading_sessions FROM anon, public;

GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reading_sessions TO authenticated, service_role;

CREATE POLICY "owner_rw" ON public.reading_sessions
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
