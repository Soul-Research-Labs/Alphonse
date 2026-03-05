/**
 * Contacts CRUD — encrypted at rest via StorageAdapter.
 *
 * Each Contact is serialized as JSON, stored as Uint8Array in the
 * METADATA namespace with key prefix `contact:`.
 */

import type { AsyncResult, Address, Timestamp } from '../types/common';
import { Result, ErrorCode } from '../types/common';
import type { Contact, ContactId, PrivateReceiveId } from '../types/metadata';

// ---------------------------------------------------------------------------
// Storage contract (injected — no import of @alphonse/storage here)
// ---------------------------------------------------------------------------

export interface MetadataStore {
  get: (key: string) => AsyncResult<Uint8Array | null>;
  set: (key: string, value: Uint8Array) => AsyncResult<void>;
  delete: (key: string) => AsyncResult<void>;
  keys: () => AsyncResult<string[]>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PREFIX = 'contact:';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function contactKey(id: ContactId): string {
  return `${PREFIX}${id}`;
}

function serialize(contact: Contact): Uint8Array {
  return encoder.encode(JSON.stringify(contact));
}

function deserialize(bytes: Uint8Array): Contact {
  return JSON.parse(decoder.decode(bytes)) as Contact;
}

function generateId(randomBytes: (len: number) => Uint8Array): ContactId {
  const bytes = randomBytes(16);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex as ContactId;
}

// ---------------------------------------------------------------------------
// ContactsManager
// ---------------------------------------------------------------------------

export interface ContactsManager {
  create: (params: {
    name: string;
    addresses: ReadonlyArray<Address>;
    privateReceiveId?: PrivateReceiveId;
  }) => AsyncResult<Contact>;

  update: (
    id: ContactId,
    patch: Partial<Pick<Contact, 'name' | 'addresses' | 'privateReceiveId'>>
  ) => AsyncResult<Contact>;

  delete: (id: ContactId) => AsyncResult<void>;

  get: (id: ContactId) => AsyncResult<Contact | null>;

  list: () => AsyncResult<ReadonlyArray<Contact>>;

  findByAddress: (address: Address) => AsyncResult<Contact | null>;

  findByPrivateReceiveId: (prId: PrivateReceiveId) => AsyncResult<Contact | null>;
}

export function createContactsManager(
  store: MetadataStore,
  randomBytes: (len: number) => Uint8Array
): ContactsManager {
  async function create(params: {
    name: string;
    addresses: ReadonlyArray<Address>;
    privateReceiveId?: PrivateReceiveId;
  }): AsyncResult<Contact> {
    const now = Date.now() as Timestamp;
    const contact: Contact = {
      id: generateId(randomBytes),
      name: params.name,
      addresses: params.addresses,
      privateReceiveId: params.privateReceiveId,
      createdAt: now,
      updatedAt: now,
    };

    const writeResult = await store.set(contactKey(contact.id), serialize(contact));
    if (!writeResult.ok) return writeResult as typeof writeResult & { ok: false };

    return Result.ok(contact);
  }

  async function update(
    id: ContactId,
    patch: Partial<Pick<Contact, 'name' | 'addresses' | 'privateReceiveId'>>
  ): AsyncResult<Contact> {
    const existing = await get(id);
    if (!existing.ok) return existing as typeof existing & { ok: false };
    if (existing.value === null) {
      return Result.err({ code: ErrorCode.NOT_FOUND, message: `Contact ${id} not found` });
    }

    const updated: Contact = {
      ...existing.value,
      ...patch,
      updatedAt: Date.now() as Timestamp,
    };

    const writeResult = await store.set(contactKey(id), serialize(updated));
    if (!writeResult.ok) return writeResult as typeof writeResult & { ok: false };

    return Result.ok(updated);
  }

  async function deleteContact(id: ContactId): AsyncResult<void> {
    return store.delete(contactKey(id));
  }

  async function get(id: ContactId): AsyncResult<Contact | null> {
    const raw = await store.get(contactKey(id));
    if (!raw.ok) return raw as typeof raw & { ok: false };
    if (raw.value === null) return Result.ok(null);
    return Result.ok(deserialize(raw.value));
  }

  async function list(): AsyncResult<ReadonlyArray<Contact>> {
    const keysResult = await store.keys();
    if (!keysResult.ok) return keysResult as typeof keysResult & { ok: false };

    const contacts: Contact[] = [];
    for (const key of keysResult.value) {
      if (!key.startsWith(PREFIX)) continue;
      const raw = await store.get(key);
      if (raw.ok && raw.value !== null) {
        contacts.push(deserialize(raw.value));
      }
    }

    contacts.sort((a, b) => a.name.localeCompare(b.name));
    return Result.ok(contacts);
  }

  async function findByAddress(address: Address): AsyncResult<Contact | null> {
    const all = await list();
    if (!all.ok) return all as typeof all & { ok: false };

    const lower = (address as string).toLowerCase();
    const match = all.value.find((c) =>
      c.addresses.some((a) => (a as string).toLowerCase() === lower)
    );
    return Result.ok(match ?? null);
  }

  async function findByPrivateReceiveId(prId: PrivateReceiveId): AsyncResult<Contact | null> {
    const all = await list();
    if (!all.ok) return all as typeof all & { ok: false };

    const match = all.value.find((c) => c.privateReceiveId === prId);
    return Result.ok(match ?? null);
  }

  return {
    create,
    update,
    delete: deleteContact,
    get,
    list,
    findByAddress,
    findByPrivateReceiveId,
  };
}
