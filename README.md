# Ariadne Reader

Ariadne Reader turns uploaded PDFs into structured reading projects.

Tagline: "A thread through every PDF."

## Current architecture

- React + TypeScript + Vite for the frontend.
- Supabase Auth for accounts.
- Supabase Postgres for PDF project metadata, progress, deadlines, and chapters.
- Supabase Storage for private PDF files.
- IndexedDB, through Dexie, as a local cache.
- PDF.js for in-browser PDF rendering.

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a Supabase project.

3. Run the SQL in `docs/supabase-setup.sql` in the Supabase SQL editor.

4. Copy `.env.example` to `.env.local` and fill in:

   ```bash
   VITE_SUPABASE_URL=your-project-url
   VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   ```

5. Start the app:

   ```bash
   npm run dev
   ```

## GitHub status

The intended public repository name is `ariadne-reader`.

If GitHub CLI auth expires, run:

```bash
gh auth login -h github.com
```

Then the local repository can be pushed to GitHub.
