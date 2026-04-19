"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { startTransition, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type TouchEvent } from "react";
import { leadsBodyLabelStyle, leadsSectionTitleStyle } from "@/components/app/LeadsPagePrimitives";
import { Button } from "@/components/ui/button";
import { ibmPlexSans } from "@/lib/fonts";
import styles from "../client-detail.module.css";
import { createClientNote, deleteClientNote, reorderClientNotes, updateClientNote } from "./actions";

type ClientNoteEntry = {
  id: string;
  title: string;
  body: string;
  at: string;
  href: string;
  authorName: string;
  sortOrder: number;
};

type NotesBoardNote = ClientNoteEntry & {
  isDraft?: boolean;
};

type NotesBoardProps = {
  clientId: string;
  currentAuthorName: string;
  notes: ClientNoteEntry[];
};

type SortableNoteCardProps = {
  note: NotesBoardNote;
  isEditing: boolean;
  isSaving: boolean;
  draftValue: string;
  error?: string;
  onBeginEdit: (note: NotesBoardNote) => void;
  onRemove: (note: NotesBoardNote) => void;
  onCancel: (note: NotesBoardNote) => void;
  onSave: (note: NotesBoardNote) => void;
  onChangeDraft: (noteId: string, value: string) => void;
};

function buildDraftNote(currentAuthorName: string): NotesBoardNote {
  return {
    id: `draft-${Date.now()}`,
    title: currentAuthorName,
    body: "",
    at: new Date().toISOString(),
    href: "",
    authorName: currentAuthorName,
    sortOrder: -1,
    isDraft: true,
  };
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function SortableNoteCard({
  note,
  isEditing,
  isSaving,
  draftValue,
  error,
  onBeginEdit,
  onRemove,
  onCancel,
  onSave,
  onChangeDraft,
}: SortableNoteCardProps) {
  const dragDisabled = note.isDraft || isEditing || isSaving;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: note.id,
    disabled: dragDisabled,
  });

  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    listeners?.onPointerDown?.(event);
  };

  const handleMouseDown = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  const handleTouchStart = (event: TouchEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    listeners?.onKeyDown?.(event);
  };

  return (
    <article
      ref={setNodeRef}
      style={dragStyle}
      className={`${styles.card} ${styles.noteBoardCard} ${isEditing ? styles.noteBoardCardEditing : styles.noteBoardCardInteractive} ${isDragging ? styles.noteBoardCardDragging : ""}`}
    >
      <div className={styles.noteBoardCardBody}>
        <div className={styles.noteBoardCardHeader}>
          <div className={styles.noteBoardCardHeaderActions}>
            {!isEditing ? (
              <button
                ref={setActivatorNodeRef}
                type="button"
                onPointerDown={handlePointerDown}
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
                onClick={handleClick}
                onKeyDown={handleKeyDown}
                className={styles.noteBoardDragHandle}
                aria-label="Drag to reorder note"
                disabled={dragDisabled}
                {...attributes}
              >
                <GripVertical className="h-4 w-4" strokeWidth={2.1} />
              </button>
            ) : null}
            {!isEditing ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(note);
                }}
                className={styles.noteBoardEditButton}
                aria-label="Delete note"
                disabled={isSaving}
              >
                <Trash2 className="h-4 w-4" strokeWidth={2.1} />
              </button>
            ) : null}
          </div>
        </div>

        {isEditing ? (
          <div className={styles.noteBoardContentSurface}>
            <textarea
              value={draftValue}
              onChange={(event) => onChangeDraft(note.id, event.target.value)}
              autoFocus
              placeholder="Write note..."
              className={styles.noteBoardTextarea}
              disabled={isSaving}
            />
          </div>
        ) : (
          <div
            className={styles.noteBoardContentSurface}
            onClick={() => onBeginEdit(note)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onBeginEdit(note);
              }
            }}
            tabIndex={0}
            role="button"
            aria-label="Edit note"
          >
            <p className={styles.noteBoardCardText}>{note.body}</p>
          </div>
        )}

        {error ? <p className={styles.noteComposerStatusError}>{error}</p> : null}

        <div className={styles.noteBoardCardFooter}>
          <div className={styles.noteBoardCardFooterMeta}>
            <span className={styles.noteBoardCardAuthor} style={leadsBodyLabelStyle}>
              {note.authorName}
            </span>
            <span className={styles.noteBoardCardStamp} style={leadsBodyLabelStyle}>
              {note.isDraft ? "Not saved yet" : formatDateTime(note.at)}
            </span>
          </div>
          {isEditing ? (
            <div className={styles.noteBoardCardActions}>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onCancel(note);
                }}
                disabled={isSaving}
                className={`${ibmPlexSans.className} ${styles.noteBoardSecondaryButton}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onSave(note);
                }}
                disabled={isSaving}
                className={`${ibmPlexSans.className} ${styles.noteBoardPrimaryButton}`}
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function NotesBoard({ clientId, currentAuthorName, notes }: NotesBoardProps) {
  const [noteItems, setNoteItems] = useState<NotesBoardNote[]>(notes);
  const [editingIds, setEditingIds] = useState<Record<string, boolean>>({});
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});
  const [errorById, setErrorById] = useState<Record<string, string>>({});
  const [boardError, setBoardError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const hasDraft = noteItems.some((note) => note.isDraft);

  const beginCreateNote = () => {
    if (hasDraft) {
      return;
    }
    const draftNote = buildDraftNote(currentAuthorName);
    setBoardError(null);
    setNoteItems((current) => [draftNote, ...current]);
    setEditingIds((current) => ({ ...current, [draftNote.id]: true }));
    setDraftValues((current) => ({ ...current, [draftNote.id]: "" }));
    setErrorById((current) => ({ ...current, [draftNote.id]: "" }));
  };

  const beginEditNote = (note: NotesBoardNote) => {
    setBoardError(null);
    setEditingIds((current) => ({ ...current, [note.id]: true }));
    setDraftValues((current) => ({ ...current, [note.id]: note.body }));
    setErrorById((current) => ({ ...current, [note.id]: "" }));
  };

  const cancelEdit = (note: NotesBoardNote) => {
    if (note.isDraft) {
      setNoteItems((current) => current.filter((item) => item.id !== note.id));
    }

    setEditingIds((current) => {
      const next = { ...current };
      delete next[note.id];
      return next;
    });
    setDraftValues((current) => {
      const next = { ...current };
      delete next[note.id];
      return next;
    });
    setErrorById((current) => {
      const next = { ...current };
      delete next[note.id];
      return next;
    });
  };

  const saveNote = (note: NotesBoardNote, bodyOverride?: string) => {
    const body = (bodyOverride ?? draftValues[note.id] ?? note.body).trim();
    if (!body) {
      setErrorById((current) => ({ ...current, [note.id]: "Please enter a note before saving." }));
      return;
    }

    setSavingIds((current) => ({ ...current, [note.id]: true }));
    setErrorById((current) => ({ ...current, [note.id]: "" }));
    setBoardError(null);

    startTransition(async () => {
      const result = note.isDraft
        ? await createClientNote({ clientId, body })
        : await updateClientNote({ clientId, noteId: note.id, body });

      setSavingIds((current) => ({ ...current, [note.id]: false }));

      if (!result.ok) {
        setErrorById((current) => ({ ...current, [note.id]: result.error }));
        return;
      }

      setNoteItems((current) =>
        current.map((item) =>
          item.id === note.id
            ? {
                ...item,
                id: result.note.id,
                body: result.note.body,
                authorName: result.note.authorName,
                title: result.note.authorName,
                at: result.note.at,
                sortOrder: result.note.sortOrder,
                isDraft: false,
              }
            : item
        )
      );

      setEditingIds((current) => {
        const next = { ...current };
        delete next[note.id];
        if (note.isDraft && note.id !== result.note.id) {
          delete next[result.note.id];
        }
        return next;
      });

      setDraftValues((current) => {
        const next = { ...current };
        delete next[note.id];
        return next;
      });

      setErrorById((current) => {
        const next = { ...current };
        delete next[note.id];
        return next;
      });
    });
  };

  const removeNote = (note: NotesBoardNote) => {
    if (note.isDraft) {
      cancelEdit(note);
      return;
    }

    setSavingIds((current) => ({ ...current, [note.id]: true }));
    setErrorById((current) => ({ ...current, [note.id]: "" }));
    setBoardError(null);

    startTransition(async () => {
      const result = await deleteClientNote({ clientId, noteId: note.id });

      setSavingIds((current) => ({ ...current, [note.id]: false }));

      if (!result.ok) {
        setErrorById((current) => ({ ...current, [note.id]: result.error }));
        return;
      }

      setNoteItems((current) => current.filter((item) => item.id !== note.id));
      setEditingIds((current) => {
        const next = { ...current };
        delete next[note.id];
        return next;
      });
      setDraftValues((current) => {
        const next = { ...current };
        delete next[note.id];
        return next;
      });
      setErrorById((current) => {
        const next = { ...current };
        delete next[note.id];
        return next;
      });
    });
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) {
      return;
    }

    const previousItems = noteItems;
    const activeIndex = noteItems.findIndex((note) => note.id === active.id);
    const overIndex = noteItems.findIndex((note) => note.id === over.id);

    if (activeIndex < 0 || overIndex < 0) {
      return;
    }

    const activeNote = noteItems[activeIndex];
    const overNote = noteItems[overIndex];
    if (!activeNote || !overNote) {
      return;
    }

    if (activeNote.isDraft || overNote.isDraft || editingIds[activeNote.id] || editingIds[overNote.id]) {
      return;
    }

    const nextItems = arrayMove(noteItems, activeIndex, overIndex).map((note, index) => ({
      ...note,
      sortOrder: note.isDraft ? note.sortOrder : index,
    }));

    setBoardError(null);
    setNoteItems(nextItems);

    const orderedIds = nextItems.filter((note) => !note.isDraft).map((note) => note.id);

    startTransition(async () => {
      const result = await reorderClientNotes({ clientId, orderedIds });
      if (!result.ok) {
        setNoteItems(previousItems);
        setBoardError(result.error);
      }
    });
  };

  return (
    <section className={styles.notesBoardSection}>
      <div className={styles.notesBoardHeaderRow}>
        <h2 className={styles.notesBoardTitle} style={leadsSectionTitleStyle}>Notes</h2>
        <Button
          type="button"
          onClick={beginCreateNote}
          disabled={hasDraft}
          className={`${ibmPlexSans.className} ${styles.notesBoardAddButton}`}
        >
          <Plus className="h-4 w-4" strokeWidth={2.2} />
          Add note
        </Button>
      </div>

      {boardError ? <p className={styles.noteComposerStatusError}>{boardError}</p> : null}

      {noteItems.length === 0 ? (
        <div className={`${styles.card} ${styles.notesBoardEmptyCard}`}>
          <p className={styles.emptyState}>No notes yet. Add the first note to start this board.</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={noteItems.map((note) => note.id)} strategy={rectSortingStrategy}>
            <div className={styles.notesGrid}>
              {noteItems.map((note) => (
                <SortableNoteCard
                  key={note.id}
                  note={note}
                  isEditing={Boolean(editingIds[note.id])}
                  isSaving={Boolean(savingIds[note.id])}
                  draftValue={draftValues[note.id] ?? note.body}
                  error={errorById[note.id]}
                  onBeginEdit={beginEditNote}
                  onRemove={removeNote}
                  onCancel={cancelEdit}
                  onSave={saveNote}
                  onChangeDraft={(noteId, value) =>
                    setDraftValues((current) => ({
                      ...current,
                      [noteId]: value,
                    }))
                  }
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}
