# Ariadne Reader

Ariadne Reader turns uploaded PDFs into structured reading projects.

Tagline: "A thread through every PDF."

## Current architecture

- React + TypeScript + Vite for the frontend.
- IndexedDB, through Dexie, for local-first reading projects.
- Supabase Auth for optional accounts.
- Supabase Postgres for synced PDF project metadata, progress, deadlines, and chapters.
- Supabase Storage for synced private PDF files.
- PDF.js for in-browser PDF rendering.

The first-use flow is local-first: readers can upload and read a PDF without creating an account.
Signing in is the path to cloud sync, not a requirement for trying the product.

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a Supabase project.

3. Run the SQL in `docs/supabase-setup.sql` in the Supabase SQL editor.

4. In Supabase Auth URL Configuration, set the Site URL and allowed Redirect URLs for the
   environments you use. Password confirmation and password reset emails must return to an
   allowed URL.

   ```text
   Site URL: https://ariadne-reader.vercel.app
   Redirect URLs:
   https://ariadne-reader.vercel.app/**
   http://localhost:5173/**
   http://localhost:5174/**
   ```

5. Copy `.env.example` to `.env.local` and fill in:

   ```bash
   VITE_SUPABASE_URL=your-project-url
   VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   VITE_AUTH_REDIRECT_URL=http://localhost:5173/
   ```

   `VITE_AUTH_REDIRECT_URL` is optional in production. It is useful locally because auth emails
   should return to the Vite dev server instead of an old `localhost:3000` tab.

6. Start the app:

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
