-- Share links ("Export to link") for this Excalidraw fork.
-- Run once in your Supabase project: SQL Editor -> New query -> paste -> Run.
-- Safe to re-run.
--
-- Shared drawings are encrypted in the browser before upload and the key
-- stays in the link's #hash, so this bucket only ever holds ciphertext.
-- Anyone with a link can download its files (that's what a share link is);
-- only signed-in users can create links, and nobody can list the bucket.

insert into storage.buckets (id, name, public, file_size_limit)
values ('share-links', 'share-links', true, 10485760) -- 10 MB per file
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

-- Signed-in users can upload new links. No select/update/delete policies:
-- links can't be listed, changed or removed through the API. Public download
-- works through the bucket's public URL, which needs no policy.
drop policy if exists "Signed-in users can create share links" on storage.objects;
create policy "Signed-in users can create share links"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'share-links');
