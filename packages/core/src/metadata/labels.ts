/**
 * Labels & Categories CRUD — encrypted at rest via StorageAdapter.
 *
 * Categories group labels. Labels attach to transactions.
 * Stored in METADATA namespace with `category:` and `label:` prefixes.
 */

import type { AsyncResult, Timestamp } from '../types/common';
import { Result, ErrorCode } from '../types/common';
import type { Category, CategoryId, Label, LabelId } from '../types/metadata';
import type { MetadataStore } from './contacts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CAT_PREFIX = 'category:';
const LABEL_PREFIX = 'label:';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function catKey(id: CategoryId): string {
  return `${CAT_PREFIX}${id}`;
}
function labelKey(id: LabelId): string {
  return `${LABEL_PREFIX}${id}`;
}

function generateId(randomBytes: (len: number) => Uint8Array): string {
  const bytes = randomBytes(16);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

// ---------------------------------------------------------------------------
// LabelsManager
// ---------------------------------------------------------------------------

export interface LabelsManager {
  // Categories
  createCategory: (params: {
    name: string;
    icon?: string;
    color?: string;
  }) => AsyncResult<Category>;
  updateCategory: (
    id: CategoryId,
    patch: Partial<Pick<Category, 'name' | 'icon' | 'color'>>
  ) => AsyncResult<Category>;
  deleteCategory: (id: CategoryId) => AsyncResult<void>;
  getCategory: (id: CategoryId) => AsyncResult<Category | null>;
  listCategories: () => AsyncResult<ReadonlyArray<Category>>;

  // Labels
  createLabel: (params: { categoryId: CategoryId; name: string }) => AsyncResult<Label>;
  deleteLabel: (id: LabelId) => AsyncResult<void>;
  getLabel: (id: LabelId) => AsyncResult<Label | null>;
  listLabels: () => AsyncResult<ReadonlyArray<Label>>;
  listByCategory: (categoryId: CategoryId) => AsyncResult<ReadonlyArray<Label>>;
}

export function createLabelsManager(
  store: MetadataStore,
  randomBytes: (len: number) => Uint8Array
): LabelsManager {
  // --- Categories ---

  async function createCategory(params: {
    name: string;
    icon?: string;
    color?: string;
  }): AsyncResult<Category> {
    const category: Category = {
      id: generateId(randomBytes) as CategoryId,
      name: params.name,
      icon: params.icon,
      color: params.color,
    };

    const w = await store.set(catKey(category.id), encoder.encode(JSON.stringify(category)));
    if (!w.ok) return w as typeof w & { ok: false };
    return Result.ok(category);
  }

  async function updateCategory(
    id: CategoryId,
    patch: Partial<Pick<Category, 'name' | 'icon' | 'color'>>
  ): AsyncResult<Category> {
    const existing = await getCategory(id);
    if (!existing.ok) return existing as typeof existing & { ok: false };
    if (existing.value === null) {
      return Result.err({ code: ErrorCode.NOT_FOUND, message: `Category ${id} not found` });
    }

    const updated: Category = { ...existing.value, ...patch };
    const w = await store.set(catKey(id), encoder.encode(JSON.stringify(updated)));
    if (!w.ok) return w as typeof w & { ok: false };
    return Result.ok(updated);
  }

  async function deleteCategory(id: CategoryId): AsyncResult<void> {
    return store.delete(catKey(id));
  }

  async function getCategory(id: CategoryId): AsyncResult<Category | null> {
    const raw = await store.get(catKey(id));
    if (!raw.ok) return raw as typeof raw & { ok: false };
    if (raw.value === null) return Result.ok(null);
    return Result.ok(JSON.parse(decoder.decode(raw.value)) as Category);
  }

  async function listCategories(): AsyncResult<ReadonlyArray<Category>> {
    const keysResult = await store.keys();
    if (!keysResult.ok) return keysResult as typeof keysResult & { ok: false };

    const items: Category[] = [];
    for (const key of keysResult.value) {
      if (!key.startsWith(CAT_PREFIX)) continue;
      const raw = await store.get(key);
      if (raw.ok && raw.value !== null) {
        items.push(JSON.parse(decoder.decode(raw.value)) as Category);
      }
    }
    items.sort((a, b) => a.name.localeCompare(b.name));
    return Result.ok(items);
  }

  // --- Labels ---

  async function createLabel(params: { categoryId: CategoryId; name: string }): AsyncResult<Label> {
    const label: Label = {
      id: generateId(randomBytes) as LabelId,
      categoryId: params.categoryId,
      name: params.name,
      createdAt: Date.now() as Timestamp,
    };

    const w = await store.set(labelKey(label.id), encoder.encode(JSON.stringify(label)));
    if (!w.ok) return w as typeof w & { ok: false };
    return Result.ok(label);
  }

  async function deleteLabel(id: LabelId): AsyncResult<void> {
    return store.delete(labelKey(id));
  }

  async function getLabel(id: LabelId): AsyncResult<Label | null> {
    const raw = await store.get(labelKey(id));
    if (!raw.ok) return raw as typeof raw & { ok: false };
    if (raw.value === null) return Result.ok(null);
    return Result.ok(JSON.parse(decoder.decode(raw.value)) as Label);
  }

  async function listLabels(): AsyncResult<ReadonlyArray<Label>> {
    const keysResult = await store.keys();
    if (!keysResult.ok) return keysResult as typeof keysResult & { ok: false };

    const items: Label[] = [];
    for (const key of keysResult.value) {
      if (!key.startsWith(LABEL_PREFIX)) continue;
      const raw = await store.get(key);
      if (raw.ok && raw.value !== null) {
        items.push(JSON.parse(decoder.decode(raw.value)) as Label);
      }
    }
    items.sort((a, b) => a.name.localeCompare(b.name));
    return Result.ok(items);
  }

  async function listByCategory(categoryId: CategoryId): AsyncResult<ReadonlyArray<Label>> {
    const all = await listLabels();
    if (!all.ok) return all as typeof all & { ok: false };
    return Result.ok(all.value.filter((l) => l.categoryId === categoryId));
  }

  return {
    createCategory,
    updateCategory,
    deleteCategory,
    getCategory,
    listCategories,
    createLabel,
    deleteLabel,
    getLabel,
    listLabels,
    listByCategory,
  };
}
