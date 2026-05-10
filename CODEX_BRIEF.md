# Ariadne Reader — Engineering Brief

You are working on **Ariadne Reader**, a goal-oriented PDF reader (React 18 + TypeScript + Vite, pdf.js, Dexie/IndexedDB, Supabase). The product's identity is *deliberate reading of long, dense documents*: deadlines, chapters, reading-time tracking, resume state. Do **not** turn it into a generic Adobe-style viewer; every change should reinforce the "thread through the labyrinth" positioning.

This brief is split into four phases. Work them in order. After each phase, run `npm run build`, manually exercise the changed surfaces in both **local** and **signed-in cloud** modes, and commit before moving on. Do not bundle phases into one commit.

---

## 0. Architecture you must respect

- `src/types.ts` is the single source of truth for shared types. Any new persistent field on `PDFProject`, `Chapter`, or new domain entity must go here first.
- Storage has two parallel implementations with identical surface area:
  - `src/services/projects.ts` — Supabase (cloud)
  - `src/services/localProjects.ts` — Dexie (local)
  - `src/storage/indexedDb.ts` — Dexie schema + low-level helpers used by both
  
  Any new persisted field requires touching all three. The Supabase side also needs SQL migrations (see §Manual steps).
- Dexie schema bumps require `this.version(N).stores(...)` chained onto the existing version, not replacing it. Schema is in `indexedDb.ts:17`.
- The PDF rendering lives in `src/components/PdfReader.tsx`. The `PdfPage` subcomponent owns canvas lifecycle. Don't rewrite it from scratch unless a phase explicitly says so — extend it.
- Styling is hand-rolled CSS in `src/styles.css`. No Tailwind. New components match the existing class naming (`panel-heading`, `reader-panel`, `small-button`, `icon-button`, `reader-side`).
- Icons are Lucide React. Pick icons consistent with the existing aesthetic (line, ~16–18px, `strokeWidth=1.8` where shown).
- The Ariadne theme is committed (labyrinth mark, statue backdrop, "Thread" panel name, "Opening the archive" loader). Match the tone — copywriting in new UI should be quiet, mythic-adjacent, never marketing-y.

### Self-verification protocol (run after every phase)
1. `npm run build` — must pass with no TS errors.
2. Open a multi-hundred-page PDF. Confirm scroll, zoom, page-jump, save indicator, deadline edit, chapter add, sign-out/sign-in still work.
3. Test both storage modes: refresh anonymous (local), then sign in (cloud).
4. Hard-reload mid-read; confirm scroll position is restored within 1s.

---

## Phase 1 — Bug fixes (do first, ship as one commit per fix)

### 1.1 Inverted DPR scaling
**File:** `src/components/PdfReader.tsx:548–553`  
**Current:** `Math.min(Math.max(devicePixelRatio || 1, 2.5), 3)` — this raises the floor to 2.5×, so non-retina displays get 2.5× canvases for no visual gain (large memory cost).  
**Fix:** `Math.min(Math.max(devicePixelRatio || 1, 1), 3)` — let DPR drive, cap at 3.  
Also rename `MIN_CANVAS_OUTPUT_SCALE` to `BASELINE_CANVAS_OUTPUT_SCALE` and set to 1.  
**Acceptance:** On a 1× display, canvas `width` should equal display width; on a 2× retina, 2×; on a 3×+ phone, 3 (capped).

### 1.2 Save-debounce starvation during continuous scroll
**File:** `src/components/PdfReader.tsx:236–289`  
**Current:** `setTimeout(900)` resets on every `scrollOffset` change. Continuous scroll → never saves.  
**Fix:** Convert to a *throttle* with both leading and trailing edges. Implementation:
- Track `lastSavedAt` (timestamp) in a ref.
- On dependency change: if `Date.now() - lastSavedAt > 4000`, save immediately and update `lastSavedAt`. Always also schedule a trailing save at 1200ms after last change.
- Cancel trailing save on unmount.

**Acceptance:** Scroll for 30s straight; save indicator should flip to "saved" within 5s of starting and again within 2s of stopping.

### 1.3 File-hash dedup
**File:** `src/components/Dashboard.tsx:110–122`  
**Current:** Dedup matches on `fileName + totalPages`. Hash is computed but unused.  
**Fix:** Match on `fileHash` first; fall back to `fileName + totalPages` only if hash is missing on the existing project (legacy rows).  
**Acceptance:** Re-uploading the exact same file (any rename) should trigger the duplicate notice.

### 1.4 `crypto.randomUUID` polyfill
**Files:** `src/components/ChapterPanel.tsx:56`, `src/services/projects.ts:91`, `src/services/localProjects.ts:40`, anywhere else `crypto.randomUUID()` is called.  
**Fix:** Add `src/utils/uuid.ts` exporting `uuid()` that uses `crypto.randomUUID` when available and falls back to a `crypto.getRandomValues`-based v4 generator. Replace all call sites.  
**Acceptance:** Build a non-HTTPS preview (`npm run preview` over `http://`) and confirm chapter creation still works.

### 1.5 Redundant zoom-reset controls
**File:** `src/components/PdfToolbar.tsx:113–121`  
**Current:** The `zoom-pill` and the `RotateCcw` icon button both reset zoom.  
**Fix:** Remove the `RotateCcw` button. Repurpose `zoom-pill` to cycle: 100% → fit-width → 100%. (Fit-width comes in Phase 3; until then it just resets to 100%.)  
**Acceptance:** Toolbar has one clear zoom-percent control.

### 1.6 `setProject` overwrite races
**Files:** `src/components/PdfReader.tsx:340, 352` (deadline & chapters save); same pattern in `Dashboard.tsx`.  
**Current:** `setProject(updatedProject)` replaces the whole object. If the user scrolled during the network round-trip, `currentPage`/`scrollOffset` regress.  
**Fix:** Use functional updates that merge only the fields the call actually changed:
```ts
setProject((current) => current ? { ...current, deadline: updatedProject.deadline } : current);
```
**Acceptance:** While a chapter save is in flight, scrolling and observing the right rail's progress %, the % must not jump backwards when the save resolves.

### 1.7 Reading-time loss on hard close
**File:** `src/components/PdfReader.tsx:174–217`  
**Current:** Flushes every 15s and on unmount; closing the tab loses up to 14s.  
**Fix:** Add `visibilitychange` listener (flush on `hidden`) and `pagehide` listener (flush synchronously via `navigator.sendBeacon` for cloud, or a synchronous Dexie write for local). Use `pagehide` not `beforeunload` (Safari/iOS).  
**Acceptance:** Read for 10s, close the tab. Reopen the project — `Total reading time` reflects ≥10s.

---

## Phase 2 — Rendering performance

### 2.1 Replace `getBoundingClientRect` sweep with IntersectionObserver
**File:** `src/components/PdfReader.tsx:301–329` (`handleScroll`)  
**Current:** Every scroll event measures every page wrapper. O(N) per scroll, drops frames on long PDFs.  
**Fix:** 
- Maintain an `IntersectionObserver` keyed on the viewer (`root: viewerRef.current`, `rootMargin: '-35% 0px -55% 0px'`) that tracks which page wrappers cross the reading line.
- Keep a `Set<number>` of currently-intersecting pages. The "current page" is the smallest in the set (top-most visible).
- Re-create the observer when `pdfDocument` changes; disconnect on unmount.
- `handleScroll` now only updates `scrollOffset` (cheap).
- `pageRefs` registration callback also calls `observer.observe(node)` / `unobserve` on cleanup.

**Acceptance:** Scroll a 600-page PDF — Chrome DevTools Performance recording shows no scripting work > 4ms per scroll event.

### 2.2 Lazy `readPageSizes`
**File:** `src/components/PdfReader.tsx:527–546`  
**Current:** Awaits `getPage()` for every page before rendering anything. On 500 pages this is multi-second cold-start.  
**Fix:**
- Render with `DEFAULT_PAGE_SIZE` immediately for unmeasured pages.
- Measure pages in batches of 25 via `requestIdleCallback` (fallback `setTimeout(0)`), updating `pageSizes` incrementally.
- Cancel the queue on unmount.

**Acceptance:** First page paints within 500ms of opening a 500-page PDF, even cold (no IndexedDB cache).

### 2.3 Viewport-driven render radius
**File:** `src/components/PdfReader.tsx:82–96` (`renderedPageNumbers`)  
**Current:** Renders pages within `PAGE_RENDER_RADIUS` of `currentPage`. Fast scroll → blank pages until current-page tracker catches up.  
**Fix:** Drive the rendered set from the IntersectionObserver from §2.1. Render any page that is currently intersecting *plus* a buffer of 2 above and 2 below.  
**Acceptance:** Fling-scroll through a long PDF; no white placeholders sit in view for more than ~150ms at moderate scroll speed.

### 2.4 Avoid 1Hz re-renders of the right rail
**Files:** `src/components/PdfReader.tsx`, `src/components/ProgressPanel.tsx`, `src/components/ReadingStats.tsx`  
**Current:** `setSessionSeconds` ticks every 1s and re-renders the entire reader subtree.  
**Fix:** Move the second-counter into a small leaf component (`<SessionClock />`) that subscribes to a `useSyncExternalStore` over a singleton ticker (or a context with a separate provider). Parent components receive `sessionSeconds` only when they render organically, not every second.  
Acceptance criterion: React DevTools Profiler — a 1s tick should re-render only `SessionClock`, not `PdfReader` or `ProgressPanel`.

---

## Phase 3 — Core missing features

### 3.1 Selectable text layer
pdf.js renders text via a separate text layer overlaid on the canvas. Add it.
- New file `src/components/PdfTextLayer.tsx`. Use `pdfjsLib.renderTextLayer({...})` (v4 API: `new pdfjsLib.TextLayer(...)` if v4.10+; check the installed version's API).
- Render the text layer inside `PdfPage`'s `pdf-page-shell`, absolutely positioned over the canvas with `pointer-events: auto` and `user-select: text`.
- Use the same `viewport` you pass to `page.render`. Match z-index so highlights (Phase 4) can sit between canvas and text layer.
- Cancel the text-layer task in the same `cancelled` cleanup as the canvas render.

**Acceptance:** Click-and-drag selects text. `Ctrl+C` copies it. Text alignment matches the visible rendered glyphs at all zoom levels.

### 3.2 In-document search
- New component `src/components/SearchBar.tsx` — toolbar overlay opened with `Ctrl+F`/`Cmd+F` (preventDefault).
- Implement search by walking pages with `page.getTextContent()` (cache results per-document in a `Map<number, string>`), running a case-insensitive substring match, jumping to the page of the next match, and visually highlighting matches via a CSS class on text-layer spans.
- Show "Match 3 of 17" counter, prev/next buttons, Enter = next, Shift+Enter = prev, Esc closes.
- For very long documents, build the index lazily as the user types (debounce 200ms) and stream results.

**Acceptance:** On a 300-page PDF, typing a word that appears 20 times shows the first match within 1s and lets the user step through all matches with `Enter`.

### 3.3 Fit-to-width zoom mode
- Add a `zoomMode: 'manual' | 'fit-width'` piece of state. When `fit-width`, recompute `zoom` from `viewerRef.current.clientWidth / pageSizes[currentPage].width / PDF_BASE_SCALE` (account for padding).
- Recompute on `ResizeObserver` over the viewer.
- The zoom-pill (Phase 1.5) cycles 100% → fit-width → 100%; pill label shows "Fit" in fit-width mode.
- Persist `zoomMode` on `PDFProject` (extend `types.ts`, both services, both DB schemas, SQL migration).

**Acceptance:** Resizing the window in fit-width mode re-fits the page; manual zoom in/out flips back to `manual` mode.

### 3.4 Keyboard shortcuts
Single `useEffect` in `PdfReader.tsx` registering a window keydown listener (skip when target is `input`/`textarea`/`contenteditable`).
- `j` / `↓` / `Space` — next page
- `k` / `↑` — previous page
- `g` then `g` — go to first page
- `G` — go to last page
- `+` / `=` — zoom in
- `-` — zoom out
- `0` — reset to 100%
- `f` — toggle fit-width
- `[` — toggle left rail
- `]` — toggle right rail
- `/` — focus search (3.2)
- `?` — open shortcut cheatsheet modal

**Acceptance:** All shortcuts work. Cheatsheet modal listing them lives in the reader.

### 3.5 Auto-import PDF outline as chapters
pdf.js exposes the document outline via `pdfDocument.getOutline()`. Each entry has `dest` which resolves to a page index via `pdfDocument.getDestination` / `getPageIndex`.
- New service `src/services/pdfOutline.ts` exporting `extractChaptersFromOutline(pdfDocument): Promise<Chapter[]>`.
- Flatten only top-level outline entries (sub-chapters are noise for the daily-pages math). Compute `endPage` of each as `nextChapter.startPage - 1`, with the last chapter ending at `totalPages`.
- In `ChapterPanel`, when `chapters.length === 0` and an outline is available, show a quiet "Import N chapters from this PDF" button below the empty-state note. On click, validate, then save.
- Pass `pdfDocument` into `ChapterPanel` (currently it doesn't have access — extend the props or hoist the import action up to `PdfReader.tsx`).

**Acceptance:** Open a textbook PDF with an embedded TOC. The "Import N chapters" button appears. Clicking populates chapters with correct page ranges.

### 3.6 Sepia / dark page tint
Pages are currently locked to white (`fillStyle = '#ffffff'` in `PdfPage`).
- Add a `pageTint: 'paper' | 'sepia' | 'night'` setting persisted on `PDFProject`.
- Sepia: render canvas normally, overlay a `mix-blend-mode: multiply` layer with `#fbf1d9`.
- Night: render canvas normally, overlay `mix-blend-mode: difference` with `#ffffff` (cheap CSS invert) — confirm text remains readable. Alternative: post-process canvas with `filter: invert(1) hue-rotate(180deg)` on the page-shell.
- Toolbar gets a small tint toggle (icon: `Sun` / `Moon` / book glyph).

**Acceptance:** Tint persists across reloads. Switching tints does not require re-rendering canvases.

---

## Phase 4 — Differentiating features (the actual moat)

### 4.1 Highlights & notes
This is the headline feature. Highlights anchor to selection ranges in the text layer; notes attach to highlights or to bare pages.

**Schema (add to `types.ts`):**
```ts
export interface Highlight {
  id: string;
  projectId: string;
  pageNumber: number;
  // pdf.js text layer anchors: array of { itemIndex, startOffset, endOffset } per text item
  ranges: HighlightRange[];
  excerpt: string;       // the selected text, for display in the notes panel
  color: 'thread' | 'sun' | 'olive' | 'wine'; // limited palette matching theme
  note: string | null;   // markdown-light, ≤ 2000 chars
  createdAt: string;
  updatedAt: string;
}

export interface HighlightRange {
  itemIndex: number;
  startOffset: number;
  endOffset: number;
}
```

**Storage:**
- Cloud: new `highlights` table (see §Manual steps for SQL).
- Local: new Dexie store `highlights` with index on `projectId, pageNumber`. Bump Dexie version.
- Both services get `fetchHighlights(projectId)`, `createHighlight`, `updateHighlight`, `deleteHighlight`.

**UI:**
- Selection in the text layer reveals a floating mini-toolbar (color swatches + "Add note"). Pressing a swatch creates the highlight; "Add note" creates and opens the note editor.
- Highlights render as colored `<span>`s injected into the text layer (not on the canvas — keeps zoom-independent).
- Right-rail gets a new "Marginalia" panel (`src/components/MarginaliaPanel.tsx`) below `ReadingStats`, listing highlights sorted by page. Each row shows excerpt + note; clicking jumps to the page.
- Match the existing `reader-panel` / `panel-heading` styling. Icon: `Highlighter` from Lucide.

**Acceptance:** Highlight a sentence on page 42, add a note. Reload the project. Marginalia panel shows it. Click the row, viewer jumps to page 42 and the highlight is visible.

### 4.2 Reading-time payoff: pace chart + behind-schedule nudge
Today reading time is collected but never *narrated*. Make the data work.
- Add per-day reading-seconds tracking. New table/store: `reading_sessions` with `{ id, projectId, date (YYYY-MM-DD local), seconds, pagesRead }`. Aggregated daily by upserting on `date`.
- New component `src/components/PaceChart.tsx` — a tiny inline SVG sparkline (no Chart.js dependency; build it by hand, ~80 lines) showing the last 14 days of pages-read with a horizontal target line at `dailyTarget`.
- Replace the static "Reading Time" panel content with: total time, this session, average pace (pages/hour), and the sparkline.
- If `pagesRead` over the last 3 days < 60% of `dailyTarget × 3`, render a single quiet sentence in the Thread panel: *"You're a thread's length behind your pace."* Match Ariadne tone.

**Acceptance:** Read 10 pages today, observe sparkline shows a bar for today. Set a deadline that requires 50/day, leave the project untouched for 3 days (mock by changing system date or seeding data), reopen — the nudge sentence appears.

### 4.3 End-of-session summary
When the user clicks "Library" (back to dashboard) and the session was ≥ 60s:
- Show an interstitial card before the dashboard renders: pages read, time spent, average pace, current chapter, days remaining to deadline, today's pages remaining vs target.
- Tone: "Today's thread: 14 pages, 22 minutes. 36 to go."
- Single "Continue" button dismisses to dashboard.
- Implement by hoisting a `lastSession` ref into `App.tsx` or by passing a callback through `onBack`.

**Acceptance:** Read for 2 minutes, hit Library, see the summary, click Continue, land on dashboard.

### 4.4 Outline TOC navigation (left rail)
Now that you've extracted the outline (3.5), let the user *navigate* via it even without converting to chapters.
- Add a tab control in the left rail: "Chapters" | "Contents".
- "Contents" shows the full hierarchical outline (sub-entries indented). Click → jump to page.
- If no outline exists, hide the tab.

**Acceptance:** Open a PDF with a deep outline. Switch to Contents. Click a third-level entry. Viewer jumps.

---

## Out of scope (do not build)
- Printing, form filling, signing, redaction.
- Mobile/touch redesign (the desktop layout is the product right now).
- Multi-user collaboration or shared annotations.
- Citation export, EPUB conversion, AI summarization.
- Replacing pdf.js with another renderer.

---

## Manual steps for the human (Tres) — Codex cannot do these

After Phase 3 and Phase 4 you'll need to run SQL migrations against Supabase. Codex should write these as `supabase/migrations/NNNN_description.sql` files and tell Tres to apply them.

### Phase 3.3 — `zoom_mode` column
```sql
ALTER TABLE pdf_projects ADD COLUMN zoom_mode TEXT NOT NULL DEFAULT 'manual'
  CHECK (zoom_mode IN ('manual', 'fit-width'));
```

### Phase 3.6 — `page_tint` column
```sql
ALTER TABLE pdf_projects ADD COLUMN page_tint TEXT NOT NULL DEFAULT 'paper'
  CHECK (page_tint IN ('paper', 'sepia', 'night'));
```

### Phase 4.1 — `highlights` table
```sql
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
CREATE POLICY "owner_rw" ON highlights FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

### Phase 4.2 — `reading_sessions` table
```sql
CREATE TABLE reading_sessions (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES pdf_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  seconds INT NOT NULL DEFAULT 0,
  pages_read INT NOT NULL DEFAULT 0,
  UNIQUE (project_id, date)
);
ALTER TABLE reading_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_rw" ON reading_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

---

## Working agreement

- **Commit per task**, not per phase. Conventional commits welcome (`fix:`, `perf:`, `feat:`).
- If a task as specified turns out to conflict with something in the codebase, **stop and explain** rather than improvising silently.
- If you find additional bugs while working, log them at the bottom of this file under `## Discovered during implementation` rather than fixing them inline (keeps PRs reviewable).
- Do not add new dependencies in Phase 1–3 except: nothing. Phase 4.2 may not add a chart library — build the sparkline by hand.
- Match existing TS style: `function` declarations for top-level helpers, `const`/arrow for inline, no `any`, prefer `??` over `||` for nullish defaults.
- Match existing copy tone. Quiet, direct, occasionally mythic. Never cheerful, never marketing.

Begin with Phase 1.1.
