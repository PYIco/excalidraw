import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";
import { openConfirmModal } from "@excalidraw/excalidraw/components/OverwriteConfirm/OverwriteConfirmState";
import { useCallback, useEffect, useState } from "react";

import {
  closeCurrentDrawing,
  createBlankDrawing,
  deleteDrawing,
  isCloudConfigured,
  listDrawings,
  openDrawing,
  overwriteWithCanvas,
  reloadCurrentDrawing,
  renameDrawing,
  saveCanvasAsNewDrawing,
  sendSignInLink,
  signOut,
  useCloudState,
} from "../data/cloudDrawings";

import "./CloudDrawingsPanel.scss";

import type { CloudDrawingMeta, CloudState } from "../data/cloudDrawings";

const formatUpdated = (iso: string) => {
  const date = new Date(iso);
  const diffMin = Math.round((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) {
    return "just now";
  }
  if (diffMin < 60) {
    return `${diffMin} min ago`;
  }
  if (diffMin < 60 * 24) {
    return `${Math.round(diffMin / 60)} hr ago`;
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
};

const errorMessage = (error: any) =>
  error?.message || "Something went wrong. Please try again.";

// -----------------------------------------------------------------------------

const SignIn = () => {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sent) {
    return (
      <div className="cloud-drawings__message">
        <p>
          Check <strong>{email}</strong> for a sign-in link. Open it on this
          device and you'll land back here, signed in.
        </p>
        <button
          type="button"
          className="cloud-drawings__link"
          onClick={() => setSent(false)}
        >
          Use a different email
        </button>
      </div>
    );
  }

  const send = async () => {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    try {
      await sendSignInLink(email.trim());
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <form
      className="cloud-drawings__signin"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <p>Sign in to save drawings to your cloud and open them anywhere.</p>
      {/* type="text", not "email": the editor only ignores keystrokes from
          text-like inputs, so an email input would trigger tool shortcuts */}
      <input
        className="cloud-drawings__input"
        type="text"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="you@example.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <FilledButton fullWidth label="Email me a sign-in link" onClick={send} />
      {error && <p className="cloud-drawings__error">{error}</p>}
    </form>
  );
};

// -----------------------------------------------------------------------------

const statusLabel = (status: CloudState["status"]) => {
  switch (status) {
    case "saving":
      return "Saving…";
    case "saved":
      return "Saved to cloud";
    case "error":
      return "Couldn't save";
    case "conflict":
      return "Changed elsewhere";
    case "detached":
      return "Autosave paused";
    default:
      return "Autosave on";
  }
};

const CurrentDrawing = ({ cloud }: { cloud: CloudState }) => {
  const api = useExcalidrawAPI();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!cloud.current || !api) {
    return null;
  }

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const needsDecision =
    cloud.status === "conflict" || cloud.status === "detached";

  return (
    <div
      className={`cloud-drawings__current cloud-drawings__current--${cloud.status}`}
    >
      <div className="cloud-drawings__current-row">
        <div
          className="cloud-drawings__current-name"
          title={cloud.current.name}
        >
          {cloud.current.name}
        </div>
        <div className="cloud-drawings__status">
          {statusLabel(cloud.status)}
        </div>
      </div>
      {cloud.error && <p className="cloud-drawings__hint">{cloud.error}</p>}
      {needsDecision && (
        <div className="cloud-drawings__actions">
          <FilledButton
            size="medium"
            variant="outlined"
            label="Load cloud version"
            status={busy ? "loading" : null}
            onClick={() => run(() => reloadCurrentDrawing(api))}
          />
          <FilledButton
            size="medium"
            color="warning"
            label="Save canvas over it"
            status={busy ? "loading" : null}
            onClick={async () => {
              const ok = await openConfirmModal({
                title: "Replace the cloud copy?",
                description: `The saved version of "${cloud.current?.name}" will be replaced with what's on your canvas now.`,
                actionLabel: "Replace",
                color: "warning",
              });
              if (ok) {
                await run(() => overwriteWithCanvas(api));
              }
            }}
          />
          {cloud.status === "detached" && (
            <button
              type="button"
              className="cloud-drawings__link"
              onClick={() => closeCurrentDrawing()}
            >
              Keep canvas unsaved
            </button>
          )}
        </div>
      )}
      {cloud.status === "error" && (
        <button
          type="button"
          className="cloud-drawings__link"
          onClick={() => run(() => overwriteWithCanvas(api))}
        >
          Retry
        </button>
      )}
      {error && <p className="cloud-drawings__error">{error}</p>}
    </div>
  );
};

// -----------------------------------------------------------------------------

const DrawingItem = ({
  drawing,
  isCurrent,
  onOpen,
  onRenamed,
  onDeleted,
  onError,
}: {
  drawing: CloudDrawingMeta;
  isCurrent: boolean;
  onOpen: () => void;
  onRenamed: (meta: CloudDrawingMeta) => void;
  onDeleted: () => void;
  onError: (message: string) => void;
}) => {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(drawing.name);

  const commitRename = async () => {
    setEditing(false);
    const trimmed = name.trim();
    if (!trimmed || trimmed === drawing.name) {
      setName(drawing.name);
      return;
    }
    try {
      onRenamed(await renameDrawing(drawing.id, trimmed));
    } catch (err) {
      setName(drawing.name);
      onError(errorMessage(err));
    }
  };

  return (
    <li
      className={`cloud-drawings__item${
        isCurrent ? " cloud-drawings__item--current" : ""
      }`}
    >
      {editing ? (
        <input
          className="cloud-drawings__input cloud-drawings__rename"
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={commitRename}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            } else if (event.key === "Escape") {
              setName(drawing.name);
              setEditing(false);
            }
            event.stopPropagation();
          }}
        />
      ) : (
        <button
          type="button"
          className="cloud-drawings__open"
          onClick={onOpen}
          title={isCurrent ? "Open now" : `Open "${drawing.name}"`}
        >
          <span className="cloud-drawings__item-name">{drawing.name}</span>
          <span className="cloud-drawings__item-date">
            {isCurrent ? "Open now" : formatUpdated(drawing.updatedAt)}
          </span>
        </button>
      )}
      {!editing && (
        <div className="cloud-drawings__item-actions">
          <button
            type="button"
            className="cloud-drawings__icon-button"
            title="Rename"
            aria-label={`Rename "${drawing.name}"`}
            onClick={() => setEditing(true)}
          >
            ✎
          </button>
          <button
            type="button"
            className="cloud-drawings__icon-button cloud-drawings__icon-button--danger"
            title="Delete"
            aria-label={`Delete "${drawing.name}"`}
            onClick={async () => {
              const ok = await openConfirmModal({
                title: "Delete drawing?",
                description: `"${drawing.name}" will be permanently deleted from your cloud. This can't be undone.`,
                actionLabel: "Delete",
                color: "danger",
              });
              if (!ok) {
                return;
              }
              try {
                await deleteDrawing(drawing.id);
                onDeleted();
              } catch (err) {
                onError(errorMessage(err));
              }
            }}
          >
            ×
          </button>
        </div>
      )}
    </li>
  );
};

// -----------------------------------------------------------------------------

const DrawingsList = ({ cloud }: { cloud: CloudState }) => {
  const api = useExcalidrawAPI();
  const [drawings, setDrawings] = useState<CloudDrawingMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setDrawings(await listDrawings());
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  // reload the list when the open drawing changes or finishes saving
  const currentId = cloud.current?.id;
  const currentUpdatedAt = cloud.current?.updatedAt;
  useEffect(() => {
    refresh();
  }, [refresh, currentId, currentUpdatedAt]);

  if (!api) {
    return null;
  }

  const defaultName = () => {
    const name = api.getName()?.trim();
    // skip Excalidraw's automatic "Untitled-2026-11-10-1449" style names
    if (name && !/^Untitled-\d{4}-\d{2}-\d{2}/.test(name)) {
      return name;
    }
    return `Drawing ${new Date().toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    })}`;
  };

  const confirmLeaveUnsaved = async () => {
    if (cloud.current || !api.getSceneElements().length) {
      return true;
    }
    return openConfirmModal({
      title: "Replace your canvas?",
      description:
        "What's on your canvas now isn't saved to the cloud. Save it first with \"Save canvas\", or continue to replace it.",
      actionLabel: "Replace canvas",
      color: "warning",
    });
  };

  return (
    <>
      <div className="cloud-drawings__actions">
        {!cloud.current && (
          <FilledButton
            label="Save canvas"
            onClick={async () => {
              if (!api.getSceneElements().length) {
                setError("Draw something first, then save it.");
                return;
              }
              try {
                await saveCanvasAsNewDrawing(api, defaultName());
              } catch (err) {
                setError(errorMessage(err));
              }
            }}
          />
        )}
        <FilledButton
          variant="outlined"
          label="New drawing"
          onClick={async () => {
            if (!(await confirmLeaveUnsaved())) {
              return;
            }
            try {
              await createBlankDrawing(api, "Untitled");
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        />
      </div>

      {error && <p className="cloud-drawings__error">{error}</p>}

      {drawings === null ? (
        <p className="cloud-drawings__hint">Loading your drawings…</p>
      ) : drawings.length === 0 ? (
        <p className="cloud-drawings__hint">
          No saved drawings yet. Draw something and click "Save canvas".
        </p>
      ) : (
        <ul className="cloud-drawings__list">
          {drawings.map((drawing) => (
            <DrawingItem
              key={drawing.id}
              drawing={drawing}
              isCurrent={drawing.id === currentId}
              onOpen={async () => {
                if (drawing.id === currentId) {
                  return;
                }
                if (!(await confirmLeaveUnsaved())) {
                  return;
                }
                try {
                  await openDrawing(api, drawing.id);
                } catch (err) {
                  setError(errorMessage(err));
                }
              }}
              onRenamed={(meta) => {
                setDrawings(
                  (prev) =>
                    prev?.map((d) => (d.id === meta.id ? meta : d)) ?? null,
                );
                if (meta.id === currentId) {
                  api.updateScene({ appState: { name: meta.name } });
                }
              }}
              onDeleted={() =>
                setDrawings(
                  (prev) => prev?.filter((d) => d.id !== drawing.id) ?? null,
                )
              }
              onError={setError}
            />
          ))}
        </ul>
      )}
    </>
  );
};

// -----------------------------------------------------------------------------

export const CloudDrawingsPanel = () => {
  const cloud = useCloudState();

  if (!isCloudConfigured) {
    return (
      <div className="cloud-drawings">
        <p className="cloud-drawings__hint">
          Cloud saving isn't set up yet. Add your Supabase project URL and anon
          key to this site's settings to turn it on.
        </p>
      </div>
    );
  }

  if (!cloud.authReady) {
    return (
      <div className="cloud-drawings">
        <p className="cloud-drawings__hint">Loading…</p>
      </div>
    );
  }

  if (!cloud.session) {
    return (
      <div className="cloud-drawings">
        <SignIn />
      </div>
    );
  }

  return (
    <div className="cloud-drawings">
      <div className="cloud-drawings__account">
        <span title={cloud.session.user.email}>{cloud.session.user.email}</span>
        <button
          type="button"
          className="cloud-drawings__link"
          onClick={() => signOut()}
        >
          Sign out
        </button>
      </div>
      <CurrentDrawing cloud={cloud} />
      <DrawingsList cloud={cloud} />
    </div>
  );
};
