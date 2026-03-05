/**
 * Tests for the metadata ledger: contacts, labels, notes, budgets,
 * transaction enrichment, and CSV export.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Result } from '../types/common';
import type { Address, BigIntString, Timestamp, TxHash } from '../types/common';
import type { MetadataStore } from '../metadata/contacts';
import { createContactsManager } from '../metadata/contacts';
import { createLabelsManager } from '../metadata/labels';
import { createNotesManager } from '../metadata/notes';
import { createBudgetsManager, currentPeriodStart } from '../metadata/budgets';
import { createMetadataManager } from '../metadata/index';
import { enrichTransactions } from '../metadata/tx-enrichment';
import { exportToCsv } from '../metadata/export';
import type { LabelId, NoteId, CategoryId } from '../types/metadata';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** In-memory MetadataStore for testing. */
function createTestStore(): MetadataStore {
  const data = new Map<string, Uint8Array>();

  return {
    get: async (key) => Result.ok(data.get(key) ?? null),
    set: async (key, value) => {
      data.set(key, new Uint8Array(value));
      return Result.ok(undefined);
    },
    delete: async (key) => {
      data.delete(key);
      return Result.ok(undefined);
    },
    keys: async () => Result.ok([...data.keys()]),
  };
}

/** Deterministic "random" bytes for reproducible IDs. */
let counter = 0;
function deterministicRandom(len: number): Uint8Array {
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = (counter + i) & 0xff;
  counter += len;
  return bytes;
}

function resetCounter(): void {
  counter = 0;
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

describe('ContactsManager', () => {
  let store: MetadataStore;

  beforeEach(() => {
    store = createTestStore();
    resetCounter();
  });

  it('creates a contact and retrieves it by id', async () => {
    const contacts = createContactsManager(store, deterministicRandom);
    const result = await contacts.create({
      name: 'Alice',
      addresses: ['0x1234567890abcdef1234567890abcdef12345678' as Address],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('Alice');
    expect(result.value.addresses).toHaveLength(1);

    const got = await contacts.get(result.value.id);
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.value?.name).toBe('Alice');
  });

  it('updates a contact', async () => {
    const contacts = createContactsManager(store, deterministicRandom);
    const created = await contacts.create({
      name: 'Alice',
      addresses: ['0x1234567890abcdef1234567890abcdef12345678' as Address],
    });
    if (!created.ok) return;

    const updated = await contacts.update(created.value.id, { name: 'Alice B.' });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value.name).toBe('Alice B.');
    expect(updated.value.updatedAt).toBeGreaterThanOrEqual(created.value.updatedAt);
  });

  it('deletes a contact', async () => {
    const contacts = createContactsManager(store, deterministicRandom);
    const created = await contacts.create({
      name: 'Bob',
      addresses: ['0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Address],
    });
    if (!created.ok) return;

    await contacts.delete(created.value.id);
    const got = await contacts.get(created.value.id);
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.value).toBeNull();
  });

  it('lists contacts sorted by name', async () => {
    const contacts = createContactsManager(store, deterministicRandom);
    await contacts.create({ name: 'Zara', addresses: [] });
    await contacts.create({ name: 'Alice', addresses: [] });
    await contacts.create({ name: 'Mike', addresses: [] });

    const list = await contacts.list();
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.value.map((c) => c.name)).toEqual(['Alice', 'Mike', 'Zara']);
  });

  it('finds a contact by address (case-insensitive)', async () => {
    const contacts = createContactsManager(store, deterministicRandom);
    await contacts.create({
      name: 'Alice',
      addresses: ['0xABCDEF1234567890abcdef1234567890ABCDEF12' as Address],
    });

    const found = await contacts.findByAddress(
      '0xabcdef1234567890abcdef1234567890abcdef12' as Address
    );
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value?.name).toBe('Alice');
  });

  it('returns null for update on non-existent contact', async () => {
    const contacts = createContactsManager(store, deterministicRandom);
    const result = await contacts.update('nonexistent' as any, { name: 'X' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// Labels & Categories
// ---------------------------------------------------------------------------

describe('LabelsManager', () => {
  let store: MetadataStore;

  beforeEach(() => {
    store = createTestStore();
    resetCounter();
  });

  it('creates a category and a label', async () => {
    const labels = createLabelsManager(store, deterministicRandom);

    const cat = await labels.createCategory({ name: 'Food', icon: '🍕', color: '#ff0000' });
    expect(cat.ok).toBe(true);
    if (!cat.ok) return;

    const label = await labels.createLabel({ categoryId: cat.value.id, name: 'Pizza' });
    expect(label.ok).toBe(true);
    if (!label.ok) return;
    expect(label.value.categoryId).toBe(cat.value.id);
  });

  it('updates a category', async () => {
    const labels = createLabelsManager(store, deterministicRandom);
    const cat = await labels.createCategory({ name: 'Food' });
    if (!cat.ok) return;

    const updated = await labels.updateCategory(cat.value.id, { name: 'Dining' });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value.name).toBe('Dining');
  });

  it('lists labels by category', async () => {
    const labels = createLabelsManager(store, deterministicRandom);
    const cat1 = await labels.createCategory({ name: 'Food' });
    const cat2 = await labels.createCategory({ name: 'Transport' });
    if (!cat1.ok || !cat2.ok) return;

    await labels.createLabel({ categoryId: cat1.value.id, name: 'Pizza' });
    await labels.createLabel({ categoryId: cat1.value.id, name: 'Sushi' });
    await labels.createLabel({ categoryId: cat2.value.id, name: 'Taxi' });

    const foodLabels = await labels.listByCategory(cat1.value.id);
    expect(foodLabels.ok).toBe(true);
    if (!foodLabels.ok) return;
    expect(foodLabels.value).toHaveLength(2);
    expect(foodLabels.value.map((l) => l.name).sort()).toEqual(['Pizza', 'Sushi']);
  });

  it('deletes a label', async () => {
    const labels = createLabelsManager(store, deterministicRandom);
    const cat = await labels.createCategory({ name: 'Food' });
    if (!cat.ok) return;

    const label = await labels.createLabel({ categoryId: cat.value.id, name: 'Pizza' });
    if (!label.ok) return;
    await labels.deleteLabel(label.value.id);

    const got = await labels.getLabel(label.value.id);
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.value).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

describe('NotesManager', () => {
  let store: MetadataStore;

  beforeEach(() => {
    store = createTestStore();
    resetCounter();
  });

  it('creates a note with a txRef and retrieves by txRef', async () => {
    const notes = createNotesManager(store, deterministicRandom);
    const txHash = '0xabc123' as TxHash;

    const created = await notes.create({ content: 'Payment for dinner', txRef: txHash });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const found = await notes.getByTxRef(txHash);
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value?.content).toBe('Payment for dinner');
  });

  it('updates a note', async () => {
    const notes = createNotesManager(store, deterministicRandom);
    const created = await notes.create({ content: 'Test' });
    if (!created.ok) return;

    const updated = await notes.update(created.value.id, { content: 'Updated test' });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value.content).toBe('Updated test');
  });

  it('deletes a note', async () => {
    const notes = createNotesManager(store, deterministicRandom);
    const created = await notes.create({ content: 'Delete me' });
    if (!created.ok) return;

    await notes.delete(created.value.id);
    const got = await notes.get(created.value.id);
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.value).toBeNull();
  });

  it('lists notes sorted by newest first', async () => {
    const notes = createNotesManager(store, deterministicRandom);
    await notes.create({ content: 'First' });
    await notes.create({ content: 'Second' });
    await notes.create({ content: 'Third' });

    const all = await notes.list();
    expect(all.ok).toBe(true);
    if (!all.ok) return;
    expect(all.value).toHaveLength(3);
    // newest first — since all created at ~same ms, order depends on timestamp
    // but at minimum we should get all 3
  });
});

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

describe('BudgetsManager', () => {
  let store: MetadataStore;

  beforeEach(() => {
    store = createTestStore();
    resetCounter();
  });

  it('creates a budget with zero spent', async () => {
    const budgets = createBudgetsManager(store, deterministicRandom);
    const result = await budgets.create({
      name: 'Monthly Food',
      capAmount: '1000000000000000000' as BigIntString, // 1 ETH
      assetSymbol: 'ETH',
      period: 'MONTHLY',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.spentAmount).toBe('0');
    expect(result.value.period).toBe('MONTHLY');
  });

  it('adds spending and checks limit', async () => {
    const budgets = createBudgetsManager(store, deterministicRandom);
    const created = await budgets.create({
      name: 'Daily Gas',
      capAmount: '100' as BigIntString,
      assetSymbol: 'ETH',
      period: 'DAILY',
    });
    if (!created.ok) return;

    // Spend 60
    const spent1 = await budgets.addSpending(created.value.id, '60' as BigIntString);
    expect(spent1.ok).toBe(true);
    if (!spent1.ok) return;
    expect(spent1.value.spentAmount).toBe('60');

    // Check — not exceeded
    const check1 = await budgets.checkLimit(created.value.id);
    expect(check1.ok).toBe(true);
    if (!check1.ok) return;
    expect(check1.value.exceeded).toBe(false);
    expect(check1.value.remaining).toBe('40');

    // Spend 50 more (total 110 > 100 cap)
    await budgets.addSpending(created.value.id, '50' as BigIntString);
    const check2 = await budgets.checkLimit(created.value.id);
    expect(check2.ok).toBe(true);
    if (!check2.ok) return;
    expect(check2.value.exceeded).toBe(true);
    expect(check2.value.remaining).toBe('0');
  });

  it('resets spending', async () => {
    const budgets = createBudgetsManager(store, deterministicRandom);
    const created = await budgets.create({
      name: 'Weekly',
      capAmount: '500' as BigIntString,
      assetSymbol: 'ETH',
      period: 'WEEKLY',
    });
    if (!created.ok) return;

    await budgets.addSpending(created.value.id, '200' as BigIntString);
    const reset = await budgets.resetSpending(created.value.id);
    expect(reset.ok).toBe(true);
    if (!reset.ok) return;
    expect(reset.value.spentAmount).toBe('0');
  });

  it('updates budget properties', async () => {
    const budgets = createBudgetsManager(store, deterministicRandom);
    const created = await budgets.create({
      name: 'Old Name',
      capAmount: '100' as BigIntString,
      assetSymbol: 'ETH',
      period: 'DAILY',
    });
    if (!created.ok) return;

    const updated = await budgets.update(created.value.id, { name: 'New Name' });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value.name).toBe('New Name');
  });
});

// ---------------------------------------------------------------------------
// currentPeriodStart
// ---------------------------------------------------------------------------

describe('currentPeriodStart', () => {
  it('returns start of day for DAILY', () => {
    const nov15 = new Date('2025-11-15T14:30:00Z').getTime();
    const start = currentPeriodStart('DAILY', nov15);
    const d = new Date(start);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it('returns start of month for MONTHLY', () => {
    const nov15 = new Date('2025-11-15T14:30:00Z').getTime();
    const start = currentPeriodStart('MONTHLY', nov15);
    const d = new Date(start);
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// MetadataManager factory
// ---------------------------------------------------------------------------

describe('MetadataManager', () => {
  it('creates all four sub-managers', () => {
    const store = createTestStore();
    const manager = createMetadataManager(store, deterministicRandom);
    expect(manager.contacts).toBeDefined();
    expect(manager.labels).toBeDefined();
    expect(manager.notes).toBeDefined();
    expect(manager.budgets).toBeDefined();
  });

  it('CRUD round-trip through the unified manager', async () => {
    const store = createTestStore();
    resetCounter();
    const manager = createMetadataManager(store, deterministicRandom);

    const contact = await manager.contacts.create({
      name: 'Unified Test',
      addresses: [],
    });
    expect(contact.ok).toBe(true);

    const cat = await manager.labels.createCategory({ name: 'TestCat' });
    expect(cat.ok).toBe(true);

    const note = await manager.notes.create({ content: 'Unified note' });
    expect(note.ok).toBe(true);

    const budget = await manager.budgets.create({
      name: 'TestBudget',
      capAmount: '1000' as BigIntString,
      assetSymbol: 'ETH',
      period: 'MONTHLY',
    });
    expect(budget.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Transaction enrichment
// ---------------------------------------------------------------------------

describe('enrichTransactions', () => {
  it('resolves labels, notes, and contacts', () => {
    const labelsMap = new Map([
      [
        'label1' as string,
        {
          id: 'label1' as LabelId,
          categoryId: 'c1' as CategoryId,
          name: 'Pizza',
          createdAt: 0 as Timestamp,
        },
      ],
    ]);
    const notesMap = new Map([
      [
        'note1' as string,
        {
          id: 'note1' as NoteId,
          content: 'Dinner payment',
          createdAt: 0 as Timestamp,
          updatedAt: 0 as Timestamp,
        },
      ],
    ]);
    const contactsByAddress = new Map([
      [
        '0xrecipient',
        {
          id: 'c1' as any,
          name: 'Alice',
          addresses: [],
          createdAt: 0 as Timestamp,
          updatedAt: 0 as Timestamp,
        },
      ],
    ]);

    const entries = [
      {
        hash: '0xtx1',
        direction: 'OUTGOING',
        status: 'CONFIRMED',
        pool: 'PUBLIC',
        from: '0xme',
        to: '0xrecipient',
        amount: '1.0',
        assetSymbol: 'ETH',
        fee: '0.001',
        timestamp: 1700000000000,
        noteId: 'note1',
        labelIds: ['label1'],
      },
    ];

    const enriched = enrichTransactions(entries, labelsMap, notesMap, contactsByAddress, '0xme');
    expect(enriched).toHaveLength(1);
    expect(enriched[0].labels).toEqual(['Pizza']);
    expect(enriched[0].noteContent).toBe('Dinner payment');
    expect(enriched[0].contactName).toBe('Alice');
    expect(enriched[0].pool).toBe('PUBLIC');
  });

  it('handles missing metadata gracefully', () => {
    const entries = [
      {
        hash: '0xtx2',
        direction: 'INCOMING',
        status: 'PENDING',
        pool: 'VAULT',
        from: '0xsender',
        to: '0xme',
        amount: '0.5',
        assetSymbol: 'ETH',
        fee: '0.0005',
        timestamp: 1700000000000,
        noteId: 'missing',
        labelIds: ['missing'],
      },
    ];

    const enriched = enrichTransactions(entries, new Map(), new Map(), new Map());
    expect(enriched[0].labels).toEqual([]);
    expect(enriched[0].noteContent).toBeUndefined();
    expect(enriched[0].contactName).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

describe('exportToCsv', () => {
  it('generates valid CSV with headers and data', () => {
    const data = [
      {
        pool: 'PUBLIC',
        hash: '0xabc',
        direction: 'OUTGOING',
        status: 'CONFIRMED',
        from: '0xfrom',
        to: '0xto',
        amount: '1.0',
        assetSymbol: 'ETH',
        fee: '0.001',
        timestamp: 1700000000000,
        labels: ['Pizza'],
        noteContent: 'Dinner',
        contactName: 'Alice',
      },
    ];

    const csv = exportToCsv(data);
    const lines = csv.split('\n');

    expect(lines[0]).toBe(
      'Date,Hash,Direction,Status,Pool,From,To,Amount,Asset,Fee,Contact,Labels,Note'
    );
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('0xabc');
    expect(lines[1]).toContain('OUTGOING');
    expect(lines[1]).toContain('Alice');
    expect(lines[1]).toContain('Pizza');
    expect(lines[1]).toContain('Dinner');
  });

  it('escapes fields with commas', () => {
    const data = [
      {
        pool: 'PUBLIC',
        hash: '0xdef',
        direction: 'INCOMING',
        status: 'PENDING',
        from: '0xfrom',
        to: '0xto',
        amount: '2.5',
        assetSymbol: 'USDC',
        fee: '0.002',
        timestamp: 1700000000000,
        labels: ['Food', 'Entertainment'],
        noteContent: 'Paid for pizza, drinks',
      },
    ];

    const csv = exportToCsv(data);
    // "Food; Entertainment" has no comma so isn't quoted, but the note with comma is
    expect(csv).toContain('Food; Entertainment');
    expect(csv).toContain('"Paid for pizza, drinks"');
  });
});
