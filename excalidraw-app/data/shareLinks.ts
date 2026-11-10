/**
 * Share links ("Export to link") stored in the owner's Supabase project.
 *
 * Excalidraw's own link server only accepts uploads from excalidraw.com, so a
 * self-hosted copy stores links in a public Supabase Storage bucket instead.
 * The privacy model is unchanged: the scene and its images are encrypted in
 * the browser and the key lives only in the link's #hash, which browsers
 * never send to a server. Storage only ever holds ciphertext.
 *
 * Layout in the "share-links" bucket:
 *   <link id>/scene        encrypted, compressed scene JSON
 *   <link id>/<file id>    encrypted image files
 *
 * Setup lives in /supabase/share-links.sql.
 */
import { decompressData } from "@excalidraw/excalidraw/data/encode";
import { MIME_TYPES } from "@excalidraw/common";

import type { FileId } from "@excalidraw/element/types";
import type {
  BinaryFileData,
  BinaryFileMetadata,
  DataURL,
} from "@excalidraw/excalidraw/types";

import { FILE_CACHE_MAX_AGE_SEC } from "../app_constants";

import {
  getCloudState,
  getSupabaseClient,
  getSupabaseUrl,
  isCloudConfigured,
} from "./cloudDrawings";

const BUCKET = "share-links";
const SCENE_OBJECT = "scene";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Links made by this site use UUID ids; excalidraw.com ids never contain
 * dashes, so old excalidraw.com links keep loading from excalidraw.com. */
export const isSupabaseShareLinkId = (id: string) =>
  isCloudConfigured && UUID_RE.test(id);

export const isSupabaseShareLinksEnabled = () => isCloudConfigured;

const objectUrl = (id: string, name: string) =>
  `${getSupabaseUrl()}/storage/v1/object/public/${BUCKET}/${id}/${name}`;

export const getShareLinkSceneUrl = (id: string) => objectUrl(id, SCENE_OBJECT);

export class ShareLinkSignInRequiredError extends Error {
  constructor() {
    super(
      'Sign in under "My drawings" (menu ☰) to create share links on this site.',
    );
    this.name = "ShareLinkSignInRequiredError";
  }
}

/**
 * Uploads an already-encrypted scene and its encrypted files, returning the
 * new link id. Files are uploaded first so a link never points at a scene
 * whose images are missing.
 */
export const uploadShareLink = async (
  scenePayload: Uint8Array,
  files: { id: FileId; buffer: Uint8Array }[],
): Promise<string> => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Share links aren't set up on this site.");
  }
  if (!getCloudState().session) {
    throw new ShareLinkSignInRequiredError();
  }

  const id = crypto.randomUUID();
  const bucket = supabase.storage.from(BUCKET);
  const options = {
    contentType: MIME_TYPES.binary,
    cacheControl: String(FILE_CACHE_MAX_AGE_SEC),
    upsert: false,
  };

  const fileResults = await Promise.all(
    files.map(({ id: fileId, buffer }) =>
      bucket.upload(`${id}/${fileId}`, buffer, options),
    ),
  );
  const fileError = fileResults.find((result) => result.error)?.error;
  if (fileError) {
    throw fileError;
  }

  const { error } = await bucket.upload(
    `${id}/${SCENE_OBJECT}`,
    scenePayload,
    options,
  );
  if (error) {
    throw error;
  }
  return id;
};

/** Downloads and decrypts a share link's images. Mirrors
 * loadFilesFromFirebase so the app can treat both the same way. */
export const loadShareLinkFiles = async (
  id: string,
  decryptionKey: string,
  fileIds: readonly FileId[],
) => {
  const loadedFiles: BinaryFileData[] = [];
  const erroredFiles = new Map<FileId, true>();

  await Promise.all(
    [...new Set(fileIds)].map(async (fileId) => {
      try {
        const response = await fetch(objectUrl(id, fileId));
        if (!response.ok) {
          erroredFiles.set(fileId, true);
          return;
        }
        const { data, metadata } = await decompressData<BinaryFileMetadata>(
          new Uint8Array(await response.arrayBuffer()),
          { decryptionKey },
        );
        loadedFiles.push({
          mimeType: metadata.mimeType || MIME_TYPES.binary,
          id: fileId,
          dataURL: new TextDecoder().decode(data) as DataURL,
          created: metadata?.created || Date.now(),
          lastRetrieved: metadata?.created || Date.now(),
        });
      } catch (error: any) {
        erroredFiles.set(fileId, true);
        console.error(error);
      }
    }),
  );

  return { loadedFiles, erroredFiles };
};
