/**
 * Notes CRUD — encrypted at rest via StorageAdapter.
 *
 * Notes can be attached to a transaction (via txRef) or standalone.
 * Stored in METADATA namespace with `note:` prefix.
 */

import type { AsyncResult, Timestamp, TxHash } from '../types/common';
import { Result, ErrorCode } from '../types/common';
import type { Note, NoteId } from '../types/metadata';
import type { MetadataStore } from './contacts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PREFIX = 'note:';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function noteKey(id: NoteId): string {
  return `${PREFIX}${id}`;
}

function generateId(randomBytes: (len: number) => Uint8Array): NoteId {
  const bytes = randomBytes(16);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex as NoteId;
}

// ---------------------------------------------------------------------------
// NotesManager
// ---------------------------------------------------------------------------

export interface NotesManager {
  create: (params: { content: string; txRef?: TxHash }) => AsyncResult<Note>;
  update: (id: NoteId, patch: Partial<Pick<Note, 'content' | 'txRef'>>) => AsyncResult<Note>;
  delete: (id: NoteId) => AsyncResult<void>;
  get: (id: NoteId) => AsyncResult<Note | null>;
  list: () => AsyncResult<ReadonlyArray<Note>>;
  getByTxRef: (txRef: TxHash) => AsyncResult<Note | null>;
}

export function createNotesManager(
  store: MetadataStore,
  randomBytes: (len: number) => Uint8Array
): NotesManager {
  async function create(params: { content: string; txRef?: TxHash }): AsyncResult<Note> {
    const now = Date.now() as Timestamp;
    const note: Note = {
      id: generateId(randomBytes),
      content: params.content,
      txRef: params.txRef,
      createdAt: now,
      updatedAt: now,
    };

    const w = await store.set(noteKey(note.id), encoder.encode(JSON.stringify(note)));
    if (!w.ok) return w as typeof w & { ok: false };
    return Result.ok(note);
  }

  async function update(
    id: NoteId,
    patch: Partial<Pick<Note, 'content' | 'txRef'>>
  ): AsyncResult<Note> {
    const existing = await get(id);
    if (!existing.ok) return existing as typeof existing & { ok: false };
    if (existing.value === null) {
      return Result.err({ code: ErrorCode.NOT_FOUND, message: `Note ${id} not found` });
    }

    const updated: Note = {
      ...existing.value,
      ...patch,
      updatedAt: Date.now() as Timestamp,
    };

    const w = await store.set(noteKey(id), encoder.encode(JSON.stringify(updated)));
    if (!w.ok) return w as typeof w & { ok: false };
    return Result.ok(updated);
  }

  async function deleteNote(id: NoteId): AsyncResult<void> {
    return store.delete(noteKey(id));
  }

  async function get(id: NoteId): AsyncResult<Note | null> {
    const raw = await store.get(noteKey(id));
    if (!raw.ok) return raw as typeof raw & { ok: false };
    if (raw.value === null) return Result.ok(null);
    return Result.ok(JSON.parse(decoder.decode(raw.value)) as Note);
  }

  async function list(): AsyncResult<ReadonlyArray<Note>> {
    const keysResult = await store.keys();
    if (!keysResult.ok) return keysResult as typeof keysResult & { ok: false };

    const notes: Note[] = [];
    for (const key of keysResult.value) {
      if (!key.startsWith(PREFIX)) continue;
      const raw = await store.get(key);
      if (raw.ok && raw.value !== null) {
        notes.push(JSON.parse(decoder.decode(raw.value)) as Note);
      }
    }
    notes.sort((a, b) => b.createdAt - a.createdAt);
    return Result.ok(notes);
  }

  async function getByTxRef(txRef: TxHash): AsyncResult<Note | null> {
    const all = await list();
    if (!all.ok) return all as typeof all & { ok: false };

    const lower = (txRef as string).toLowerCase();
    const match = all.value.find((n) => n.txRef && (n.txRef as string).toLowerCase() === lower);
    return Result.ok(match ?? null);
  }

  return {
    create,
    update,
    delete: deleteNote,
    get,
    list,
    getByTxRef,
  };
}
