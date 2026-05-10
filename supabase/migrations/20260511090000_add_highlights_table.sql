CREATE TABLE highlights (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES pdf_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_number INT NOT NULL,
  ranges JSONB NOT NULL,
  excerpt TEXT NOT NULL,
  color TEXT NOT NULL CHECK (color IN ('thread', 'sun', 'olive', 'wine')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX highlights_project_page_idx ON highlights(project_id, page_number);

ALTER TABLE highlights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_rw" ON highlights
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
