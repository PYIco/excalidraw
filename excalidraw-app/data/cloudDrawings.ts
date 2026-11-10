/**
 * Cloud drawings: saves drawings to the owner's Supabase project so they
 * follow the user across devices.
 *
 * Enabled only when VITE_APP_SUPABASE_URL and VITE_APP_SUPABASE_ANON_KEY are
 * set. Database setup lives in /supabase/cloud-drawings.sql.
 */
import { createClient } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { serializeAsJSON, loadFromBlob } from "@excalidraw/excalidraw";

import type {
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";

import type { Session, SupabaseClient } from "@supabase/supabase-js";

// -----------------------------------------------------------------------------
// client
// -----------------------------------------------------------------------------

const SUPABASE_URL = import.meta.env.VITE_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_APP_SUPABASE_ANON_KEY;

export const isCloudConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

const supabase: SupabaseClient | null = isCloudConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

const TABLE = "drawings";
const AUTOSAVE_DELAY_MS = 1500;
const STORAGE_KEY = "excalidraw-cloud-current";

// -----------------------------------------------------------------------------
// types
// -----------------------------------------------------------------------------

export type CloudDrawingMeta = {
  id: string;
  name: string;
  updatedAt: string;
};

export type CloudSaveStatus =
  | "idle"
  | "saving"
  | "saved"
  | "error"
  // the drawing was changed on another device since we last loaded it
  | "conflict"
  // the canvas was replaced (file opened, share link, collab room), so
  // autosave stopped to avoid overwriting the cloud drawing
  | "detached";

export type CloudState = {
  session: Session | null;
  /** auth finished restoring a session (or confirmed there is none) */
  authReady: boolean;
  current: CloudDrawingMeta | null;
  status: CloudSaveStatus;
  error: string | null;
};

type PersistedCurrent = CloudDrawingMeta & { savedHash: string | null };

// -----------------------------------------------------------------------------
// tiny store (shared across components via useSyncExternalStore)
// -----------------------------------------------------------------------------

const readPersisted = (): PersistedCurrent | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedCurrent) : null;
  } catch {
    return null;
  }
};

const writePersisted = (value: PersistedCurrent | null) => {
  try {
    if (value) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // storage unavailable; autosave still works for this session
  }
};

const persisted = readPersisted();

let state: CloudState = {
  session: null,
  authReady: !isCloudConfigured,
  current: persisted
    ? { id: persisted.id, name: persisted.name, updatedAt: persisted.updatedAt }
    : null,
  status: "idle",
  error: null,
};

const listeners = new Set<() => void>();

const setState = (patch: Partial<CloudState>) => {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getCloudState = () => state;

export const useCloudState = () =>
  useSyncExternalStore(subscribe, getCloudState, getCloudState);

/** Sets the open drawing. Version info is kept in localStorage so that
 * every tab (and a reload) shares it. */
const setCurrent = (
  current: CloudDrawingMeta | null,
  savedHash: string | null = null,
) => {
  writePersisted(current ? { ...current, savedHash } : null);
  setState({ current });
};

// -----------------------------------------------------------------------------
// auth
// -----------------------------------------------------------------------------

if (supabase) {
  supabase.auth.getSession().then(({ data }) => {
    setState({ session: data.session, authReady: true });
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    setState({ session, authReady: true });
  });
}

const requireClient = () => {
  if (!supabase) {
    throw new Error("Cloud saving isn't set up on this site.");
  }
  return supabase;
};

/** Emails a one-time sign-in link that brings the user back to this site. */
export const sendSignInLink = async (email: string) => {
  const { error } = await requireClient().auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin + window.location.pathname,
    },
  });
  if (error) {
    throw error;
  }
};

export const signOut = async () => {
  cancelPendingSave();
  await requireClient().auth.signOut();
  setCurrent(null);
  setState({ status: "idle", error: null });
};

// -----------------------------------------------------------------------------
// serialization
// -----------------------------------------------------------------------------

/** cheap, stable string hash (FNV-1a) used to skip no-op saves */
const hashString = (value: string) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${value.length}:${(hash >>> 0).toString(36)}`;
};

/** Serializes the canvas, keeping only the image files it still uses. */
export const serializeScene = (api: ExcalidrawImperativeAPI) => {
  const elements = api.getSceneElements();
  const allFiles = api.getFiles();
  const files: BinaryFiles = {};
  for (const element of elements) {
    if ("fileId" in element && element.fileId && allFiles[element.fileId]) {
      files[element.fileId] = allFiles[element.fileId];
    }
  }
  return serializeAsJSON(elements, api.getAppState(), files, "local");
};

const loadSceneIntoCanvas = async (
  api: ExcalidrawImperativeAPI,
  scene: string,
  name: string,
) => {
  const data = await loadFromBlob(
    new Blob([scene], { type: "application/json" }),
    api.getAppState(),
    api.getSceneElementsIncludingDeleted(),
  );
  // the new scene must not count as an outside replacement
  knownElementIds = new Set(data.elements.map((element) => element.id));
  api.updateScene({
    elements: data.elements,
    appState: { ...data.appState, name },
  });
  const files = Object.values(data.files || {});
  if (files.length) {
    api.addFiles(files);
  }
  const visible = data.elements.filter((element) => !element.isDeleted);
  if (visible.length) {
    api.setViewport({ target: visible, fit: "scale-down", animation: false });
  }
};

// -----------------------------------------------------------------------------
// drawings CRUD
// -----------------------------------------------------------------------------

type DrawingRow = { id: string; name: string; updated_at: string };

const toMeta = (row: DrawingRow): CloudDrawingMeta => ({
  id: row.id,
  name: row.name,
  updatedAt: row.updated_at,
});

export const listDrawings = async (): Promise<CloudDrawingMeta[]> => {
  const { data, error } = await requireClient()
    .from(TABLE)
    .select("id, name, updated_at")
    .order("updated_at", { ascending: false });
  if (error) {
    throw error;
  }
  return (data as DrawingRow[]).map(toMeta);
};

/** Saves what's on the canvas as a new cloud drawing and opens it. */
export const saveCanvasAsNewDrawing = async (
  api: ExcalidrawImperativeAPI,
  name: string,
) => {
  cancelPendingSave();
  const scene = serializeScene(api);
  const { data, error } = await requireClient()
    .from(TABLE)
    .insert({ name, scene })
    .select("id, name, updated_at")
    .single();
  if (error) {
    throw error;
  }
  const meta = toMeta(data as DrawingRow);
  knownElementIds = currentElementIds(api);
  setCurrent(meta, hashString(scene));
  api.updateScene({ appState: { name } });
  setState({ status: "saved", error: null });
  return meta;
};

/** Starts a blank canvas saved as a new cloud drawing. */
export const createBlankDrawing = async (
  api: ExcalidrawImperativeAPI,
  name: string,
) => {
  cancelPendingSave();
  // detach first so clearing the canvas can't autosave over the open drawing
  setCurrent(null);
  api.resetScene();
  return saveCanvasAsNewDrawing(api, name);
};

export const openDrawing = async (api: ExcalidrawImperativeAPI, id: string) => {
  cancelPendingSave();
  const { data, error } = await requireClient()
    .from(TABLE)
    .select("id, name, updated_at, scene")
    .eq("id", id)
    .single();
  if (error) {
    throw error;
  }
  const row = data as DrawingRow & { scene: string };
  // set before loading so the load's own change events compare against it
  setCurrent(toMeta(row), hashString(row.scene));
  await loadSceneIntoCanvas(api, row.scene, row.name);
  setState({ status: "saved", error: null });
};

export const renameDrawing = async (id: string, name: string) => {
  const { data, error } = await requireClient()
    .from(TABLE)
    .update({ name })
    .eq("id", id)
    .select("id, name, updated_at")
    .single();
  if (error) {
    throw error;
  }
  const meta = toMeta(data as DrawingRow);
  // renaming bumps updated_at, so keep the open drawing's version in step
  if (state.current?.id === id) {
    setCurrent(meta, readPersisted()?.savedHash ?? null);
  }
  return meta;
};

export const deleteDrawing = async (id: string) => {
  const { error } = await requireClient().from(TABLE).delete().eq("id", id);
  if (error) {
    throw error;
  }
  if (state.current?.id === id) {
    cancelPendingSave();
    setCurrent(null);
    setState({ status: "idle", error: null });
  }
};

/** Leaves the drawing on the canvas but stops saving it to the cloud. */
export const closeCurrentDrawing = () => {
  cancelPendingSave();
  setCurrent(null);
  setState({ status: "idle", error: null });
};

// -----------------------------------------------------------------------------
// autosave
// -----------------------------------------------------------------------------

let saveTimer: number | null = null;
let pendingApi: ExcalidrawImperativeAPI | null = null;
let saveInFlight: Promise<void> | null = null;
/** element ids (including deleted ones) of the scene bound to the drawing */
let knownElementIds: Set<string> | null = null;

const currentElementIds = (api: ExcalidrawImperativeAPI) =>
  new Set(api.getSceneElementsIncludingDeleted().map((element) => element.id));

const cancelPendingSave = () => {
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
    saveTimer = null;
  }
};

/**
 * True when the canvas was replaced by unrelated content: none of the
 * elements we know about are still in the scene, deleted or not. Deleting
 * shapes keeps them in the scene as deleted, so normal editing never trips
 * this; opening a file, a share link or a collab room does.
 */
const wasCanvasReplaced = (api: ExcalidrawImperativeAPI) => {
  const ids = currentElementIds(api);
  if (!knownElementIds || knownElementIds.size === 0 || ids.size === 0) {
    knownElementIds = ids;
    return false;
  }
  for (const id of ids) {
    if (knownElementIds.has(id)) {
      knownElementIds = ids;
      return false;
    }
  }
  return true;
};

const performSave = async (api: ExcalidrawImperativeAPI) => {
  const current = readPersisted();
  if (
    !supabase ||
    !state.session ||
    !current ||
    state.status === "conflict" ||
    state.status === "detached"
  ) {
    return;
  }
  const scene = serializeScene(api);
  const hash = hashString(scene);
  if (hash === current.savedHash) {
    if (state.status !== "saved") {
      setState({ status: "saved", error: null });
    }
    return;
  }

  setState({ status: "saving", error: null });
  // only write if nobody else saved since our last load/save
  const { data, error } = await supabase
    .from(TABLE)
    .update({ scene })
    .eq("id", current.id)
    .eq("updated_at", current.updatedAt)
    .select("id, name, updated_at");

  if (error) {
    setState({ status: "error", error: error.message });
    return;
  }
  if (!data || data.length === 0) {
    setState({
      status: "conflict",
      error: "This drawing was changed somewhere else (another device or tab).",
    });
    return;
  }
  // ignore the result if the user switched drawings while this was saving
  if (state.current?.id === current.id) {
    setCurrent(toMeta(data[0] as DrawingRow), hash);
    setState({ status: "saved", error: null });
  }
};

const runSave = () => {
  saveTimer = null;
  const api = pendingApi;
  if (!api) {
    return;
  }
  if (saveInFlight) {
    // try again once the running save finishes
    saveInFlight.then(() => scheduleCloudSave(api));
    return;
  }
  saveInFlight = performSave(api)
    .catch((error: any) => {
      setState({ status: "error", error: error?.message || String(error) });
    })
    .finally(() => {
      saveInFlight = null;
    });
};

/** Call on every canvas change. Saves the open cloud drawing after a short
 * pause in editing. */
export const scheduleCloudSave = (api: ExcalidrawImperativeAPI) => {
  if (!state.current || !state.session) {
    return;
  }
  if (state.status === "conflict" || state.status === "detached") {
    return;
  }
  if (wasCanvasReplaced(api)) {
    cancelPendingSave();
    setState({
      status: "detached",
      error: "The canvas was replaced, so autosave to this drawing was paused.",
    });
    return;
  }
  pendingApi = api;
  cancelPendingSave();
  saveTimer = window.setTimeout(runSave, AUTOSAVE_DELAY_MS);
};

/** Saves immediately (e.g. when the tab is being hidden). */
export const flushCloudSave = () => {
  if (saveTimer !== null) {
    cancelPendingSave();
    runSave();
  }
};

/** Conflict / detached resolution: replace the cloud copy with the canvas. */
export const overwriteWithCanvas = async (api: ExcalidrawImperativeAPI) => {
  const current = readPersisted();
  if (!current) {
    return;
  }
  const { data, error } = await requireClient()
    .from(TABLE)
    .select("updated_at")
    .eq("id", current.id)
    .single();
  if (error) {
    throw error;
  }
  // adopt the latest version so the next save is accepted
  setCurrent(
    { ...current, updatedAt: (data as { updated_at: string }).updated_at },
    null,
  );
  knownElementIds = currentElementIds(api);
  setState({ status: "idle", error: null });
  pendingApi = api;
  runSave();
};

/** Conflict / detached resolution: discard the canvas, load the cloud copy. */
export const reloadCurrentDrawing = async (api: ExcalidrawImperativeAPI) => {
  if (state.current) {
    await openDrawing(api, state.current.id);
  }
};

// A share link or collab room replaces the canvas on load, so never let it
// autosave over the drawing that was open before. Checked at startup, before
// the app reads the link.
if (state.current && /(^|[#&])(json|room|url)=/.test(window.location.hash)) {
  state = {
    ...state,
    status: "detached",
    error: "You opened a shared drawing, so autosave was paused.",
  };
}
