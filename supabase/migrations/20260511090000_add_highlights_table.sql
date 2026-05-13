CREATE TABLE public.highlights (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.pdf_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_number INT NOT NULL,
  ranges JSONB NOT NULL,
  excerpt TEXT NOT NULL,
  color TEXT NOT NULL CHECK (color IN ('thread', 'sun', 'olive', 'wine')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX highlights_project_page_idx ON public.highlights(project_id, page_number);
CREATE INDEX highlights_user_id_idx ON public.highlights(user_id);

ALTER TABLE public.highlights ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.highlights FROM anon, public;

GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.highlights TO authenticated, service_role;

CREATE POLICY "owner_rw" ON public.highlights
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
