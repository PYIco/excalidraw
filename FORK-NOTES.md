# Fork notes (PYIco/excalidraw)

Handoff notes for whoever picks this fork up next, human or Claude Code.
Setup steps live in [SELF-HOSTING.md](SELF-HOSTING.md).

## What this fork is

A self-hosted Excalidraw for Polish Your Image and, later, its customers, as a
free tool on a customer platform. Stock Excalidraw plus:

- **My drawings** (cloud save): `excalidraw-app/data/cloudDrawings.ts`,
  `excalidraw-app/components/CloudDrawingsPanel.tsx`, sidebar tab in
  `AppSidebar.tsx`, menu item in `AppMainMenu.tsx`, autosave hook in `App.tsx`.
- **Share links** via Supabase Storage: `excalidraw-app/data/shareLinks.ts`,
  wired into `exportToBackend` / `importFromBackend` in
  `excalidraw-app/data/index.ts` and the file loading in `App.tsx`.

Both are off unless `VITE_APP_SUPABASE_URL` and `VITE_APP_SUPABASE_ANON_KEY`
are set at build time, so without them the app behaves like stock Excalidraw.

## Where it runs

- **App:** DigitalOcean App Platform, free static site, app `excalidraw`,
  component `excalidraw2`, route `/`, public URL
  https://excalidraw-hl7m4.ondigitalocean.app. Deploys automatically on push
  to the **`cloud-drawings`** branch (not `master` yet).
- **Supabase:** project `excalidraw` (ref `kvjmexdrlqklsrrbikve`), free tier.
  SQL in `supabase/` has been run. The public key is set as a build-time env
  var on the DigitalOcean component. Auth Site URL and redirect URL point at
  the DigitalOcean URL.
- **Remotes:** `origin` = PYIco/excalidraw (this fork), `upstream` =
  excalidraw/excalidraw.

## Testing

`yarn test:typecheck` and the existing app tests cover types and stock
behavior. The cloud features were checked end to end in a real browser
against an in-memory fake of Supabase (auth, the `drawings` table and the
`share-links` bucket). That script wasn't committed; worth turning into a
Playwright test under `excalidraw-app/tests/` if this grows.

## Known gaps and next steps

1. **Live collaboration** doesn't work: excalidraw.com's collab server
   (`VITE_APP_WS_SERVER_URL`) and Firebase reject other origins. Needs our own
   [excalidraw-room](https://github.com/excalidraw/excalidraw-room) server plus
   a replacement for Firebase scene/file storage (Supabase fits). The owner
   ranked this next.
2. **Paste an indented list → mind-map tree** (MindMeister-style). Parse
   indentation, lay out a tree, create rectangles + bound arrows. Good
   upstream contribution candidate.
3. **Customer access:** sign-ups are currently open. Before customers use it,
   decide between invite-only (turn off sign-ups, invite from Supabase) and
   open sign-up.
4. **Branding:** still "Excalidraw" with Excalidraw+ promos (trial button,
   sidebar promos, menu links). Owner is deciding whether to remove them.
   Keep the MIT copyright notice when rebranding.
5. **Supabase free tier** pauses idle projects; check before relying on it
   for customers.
6. Merge `cloud-drawings` into `master` and point DigitalOcean at `master`
   once the owner is happy.
7. **Text resizing that's easier to discover.** Excalidraw already re-flows a
   standalone text element when you drag its left or right edge (width
   changes, height follows, font size stays): see `resizeSingleTextElement`
   in `packages/element/src/resizeElements.ts`. Corners and top/bottom edges
   scale the font instead. On desktop the side edges have no visible handle
   (`DEFAULT_OMIT_SIDES` in `packages/element/src/transformHandles.ts`; edge
   drags are hit-tested in `resizeTest.ts`), so users don't find it. The owner
   wants:
   - **Visible side handles on text elements** (at least `e`/`w`) so the
     width-only drag is obvious. Small change.
   - **Multi-line pastes stay one text block.** Normal paste splits text into
     one element per line (`addTextFromPaste` in
     `packages/excalidraw/components/App.clipboard.ts`, `text.split("\n")`);
     only Ctrl/Cmd+Shift+V keeps it whole. Make whole-block the default.
     Small change.
   - **Corner drags re-flow instead of scaling**, with a modifier (e.g. Shift)
     to scale. Changes core behavior, so prototype it and let the owner try it
     before committing.

   These touch `packages/*` (the editor library), so they're also candidates
   to propose upstream; open an issue there before sending a PR.
8. **Comments (account required).** Open-source Excalidraw has none; the
   speech-bubble sidebar tab (`tab="comments"` in
   `excalidraw-app/components/AppSidebar.tsx`) is just an Excalidraw+ ad.
   The owner wants real comments that only signed-in people can read and
   write, on boards shared with their team or customers. Spec:
   - **Board sharing first** (shared with live collaboration, item 1, so
     design it once): the owner invites people to a saved drawing by email
     with a role (viewer, commenter, editor). Suggested table
     `drawing_members (drawing_id, user_id, role, invited_email)`, with the
     `drawings` RLS policies extended so members can read (and editors
     update). Invites must work even if sign-ups are invite-only (item 3).
     Share links stay separate: they're frozen encrypted copies, so comments
     can't live on them.
   - **Comments table:** `comments (id, drawing_id, author_id, parent_id for
     replies, body, anchor as scene x/y or element id, resolved_at,
     created_at, updated_at)`. RLS: owner and members can read; commenters
     and editors can add; authors edit or delete their own; the owner can
     resolve or delete any.
   - **UI:** replace the Excalidraw+ comments promo tab with the real thread
     list; a comment tool that drops a pin where you click; pins drawn as an
     overlay that follows pan/zoom (and follows the element if anchored to
     one); reply, resolve, and show resolved; live updates via Supabase
     Realtime.
   - **Later:** email notifications for new comments and @mentions.

   Write the SQL as a new file in `supabase/` and ask the owner before running
   it on the live project.

Upstream bug worth reporting: `isWritableElement` in
`packages/common/src/utils.ts` doesn't treat `type="email"` (or `url`, `tel`)
inputs as writable, so typing in them fires editor shortcuts. The panel works
around it with `type="text" inputMode="email"`.
