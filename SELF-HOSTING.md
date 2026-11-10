# Self-hosting this Excalidraw fork

This fork adds **My drawings** (sign in by email and your drawings save to
your own Supabase project, so they open on any device) and **share links**
that work on a self-hosted site. Everything below runs on free tiers.

- **App hosting:** DigitalOcean App Platform (free static site)
- **Drawing storage and login:** Supabase (free project)

## 1. Create the Supabase project

1. Sign up at [supabase.com](https://supabase.com) and create a new project.
2. Open **SQL Editor**, choose **New query**, paste the contents of
   [`supabase/cloud-drawings.sql`](supabase/cloud-drawings.sql), and click
   **Run**. This creates the `drawings` table and locks it so each person only
   ever sees their own drawings.
3. Do the same with [`supabase/share-links.sql`](supabase/share-links.sql).
   This creates the storage for share links.
4. Copy the **Project URL** (looks like `https://abcd1234.supabase.co`) and the
   public browser key from **Project Settings → API Keys**: the
   **publishable** key (`sb_publishable_...`), or on older projects the
   **anon public** key. Either goes in `VITE_APP_SUPABASE_ANON_KEY`.

   Never use a secret or `service_role` key in the app. They bypass all
   security rules.

## 2. Deploy to DigitalOcean

1. Fork this repository to your GitHub account (if you haven't already).
2. Edit [`.do/app.yaml`](.do/app.yaml): replace the Supabase URL and the
   public key. Commit and push.
3. In DigitalOcean, go to **Apps → Create App**, connect GitHub, and pick the
   repository. When asked, choose to use the app spec from the repo, or paste
   `.do/app.yaml` under **Settings → App Spec**. Make sure the component is a
   **Static Site** so it stays on the free tier, and that its route is `/`.
   (If DigitalOcean auto-detects components instead, it may suggest paid web
   services and a route like `/excalidraw2`. Delete the extras, switch the one
   you keep to Static Site, and set the build command, output directory and
   route to match `.do/app.yaml`.)
4. Wait for the first build (about 3 to 5 minutes). DigitalOcean gives you a
   URL like `https://excalidraw-xxxxx.ondigitalocean.app`. You can add your own
   domain under **Settings → Domains**.

Every push to `master` redeploys automatically.

## 3. Point Supabase sign-in links at your site

In Supabase, open **Authentication → URL Configuration**:

- **Site URL:** your app's URL from step 2
- **Redirect URLs:** add the same URL (and your custom domain, if any)

Without this, sign-in emails link to the wrong place.

## 4. Sign in and lock down sign-ups

1. Open your site, click the menu (☰) → **My drawings**, enter your email,
   and click the link in the email you receive.
2. Then, in Supabase, open **Authentication → Sign In / Providers** and turn
   off **Allow new users to sign up**. Otherwise anyone who finds your site
   could create an account and use your storage. You can invite specific
   people later under **Authentication → Users**.

## How saving works

- **Save canvas** stores what's on the canvas as a new drawing. After that,
  changes save automatically about 1.5 seconds after you stop editing.
- **New drawing** starts a blank canvas that's saved to the cloud.
- **Click a drawing** in the list to open it. Rename and delete appear when
  you hover over one.
- **Two devices editing the same drawing:** if a drawing changed somewhere
  else since you opened it, autosave pauses instead of overwriting. You choose
  **Load cloud version** or **Save canvas over it**.
- **Opening a file, share link, or collaboration room** replaces the canvas,
  so autosave pauses to protect the open drawing. The panel shows what
  happened and lets you decide.
- Drawings are also kept in your browser like regular Excalidraw, so a
  network hiccup never loses work on the device you're using.

## How share links work

Excalidraw's own link server only accepts uploads from excalidraw.com, so this
fork stores links in the `share-links` bucket of your Supabase project.

- **Menu → Save to… → Export to Link** creates the link. You must be signed in
  under My drawings.
- The drawing and its images are **encrypted in the browser** first. The key
  is only in the link (after the `#`), which browsers never send to a server,
  so Supabase only ever stores unreadable data.
- Anyone with the link can open it, without an account. Links can't be listed,
  edited, or deleted through the app.
- Old excalidraw.com links (`#json=...` without dashes) still open from
  excalidraw.com.

Live collaboration still uses excalidraw.com's server, which refuses other
sites, so it doesn't work on a self-hosted copy yet.

## Running locally

```bash
yarn
touch .env.local
# add your Supabase values to .env.local:
#   VITE_APP_SUPABASE_URL=https://abcd1234.supabase.co
#   VITE_APP_SUPABASE_ANON_KEY=...
yarn start
```

Add `http://localhost:3001` to the Supabase redirect URLs to sign in locally.
Without the two Supabase values, the app works like stock Excalidraw and the
My drawings panel says cloud saving isn't set up.
