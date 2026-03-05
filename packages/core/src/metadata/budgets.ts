/**
 * Budgets / Pockets CRUD — encrypted at rest via StorageAdapter.
 *
 * Budgets track spending against a cap for a time period.
 * Stored in METADATA namespace with `budget:` prefix.
 */

import type { AsyncResult, BigIntString, Timestamp } from '../types/common';
import { Result, ErrorCode } from '../types/common';
import type { Budget, BudgetId, BudgetPeriod, CategoryId } from '../types/metadata';
import type { MetadataStore } from './contacts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PREFIX = 'budget:';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function budgetKey(id: BudgetId): string {
  return `${PREFIX}${id}`;
}

function generateId(randomBytes: (len: number) => Uint8Array): BudgetId {
  const bytes = randomBytes(16);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex as BudgetId;
}

/** Compute the start of the current period based on period type and original start. */
export function currentPeriodStart(period: BudgetPeriod, now: number): Timestamp {
  const d = new Date(now);
  if (period === 'DAILY') {
    d.setHours(0, 0, 0, 0);
  } else if (period === 'WEEKLY') {
    const day = d.getDay(); // 0=Sun
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
  } else {
    // MONTHLY
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
  }
  return d.getTime() as Timestamp;
}

// ---------------------------------------------------------------------------
// BudgetsManager
// ---------------------------------------------------------------------------

export interface BudgetsManager {
  create: (params: {
    name: string;
    categoryId?: CategoryId;
    capAmount: BigIntString;
    assetSymbol: string;
    period: BudgetPeriod;
  }) => AsyncResult<Budget>;

  update: (
    id: BudgetId,
    patch: Partial<Pick<Budget, 'name' | 'categoryId' | 'capAmount' | 'assetSymbol' | 'period'>>
  ) => AsyncResult<Budget>;

  delete: (id: BudgetId) => AsyncResult<void>;

  get: (id: BudgetId) => AsyncResult<Budget | null>;

  list: () => AsyncResult<ReadonlyArray<Budget>>;

  /** Record spending against a budget. Amount in smallest unit. */
  addSpending: (id: BudgetId, amount: BigIntString) => AsyncResult<Budget>;

  /** Reset spent amount (for new period rollover). */
  resetSpending: (id: BudgetId) => AsyncResult<Budget>;

  /** Check if budget is exceeded. Returns { exceeded, remaining }. */
  checkLimit: (id: BudgetId) => AsyncResult<{ exceeded: boolean; remaining: BigIntString }>;
}

export function createBudgetsManager(
  store: MetadataStore,
  randomBytes: (len: number) => Uint8Array
): BudgetsManager {
  async function create(params: {
    name: string;
    categoryId?: CategoryId;
    capAmount: BigIntString;
    assetSymbol: string;
    period: BudgetPeriod;
  }): AsyncResult<Budget> {
    const now = Date.now() as Timestamp;
    const budget: Budget = {
      id: generateId(randomBytes),
      name: params.name,
      categoryId: params.categoryId,
      capAmount: params.capAmount,
      assetSymbol: params.assetSymbol,
      spentAmount: '0' as BigIntString,
      periodStart: currentPeriodStart(params.period, now),
      period: params.period,
      createdAt: now,
      updatedAt: now,
    };

    const w = await store.set(budgetKey(budget.id), encoder.encode(JSON.stringify(budget)));
    if (!w.ok) return w as typeof w & { ok: false };
    return Result.ok(budget);
  }

  async function update(
    id: BudgetId,
    patch: Partial<Pick<Budget, 'name' | 'categoryId' | 'capAmount' | 'assetSymbol' | 'period'>>
  ): AsyncResult<Budget> {
    const existing = await get(id);
    if (!existing.ok) return existing as typeof existing & { ok: false };
    if (existing.value === null) {
      return Result.err({ code: ErrorCode.NOT_FOUND, message: `Budget ${id} not found` });
    }

    const updated: Budget = {
      ...existing.value,
      ...patch,
      updatedAt: Date.now() as Timestamp,
    };

    const w = await store.set(budgetKey(id), encoder.encode(JSON.stringify(updated)));
    if (!w.ok) return w as typeof w & { ok: false };
    return Result.ok(updated);
  }

  async function deleteBudget(id: BudgetId): AsyncResult<void> {
    return store.delete(budgetKey(id));
  }

  async function get(id: BudgetId): AsyncResult<Budget | null> {
    const raw = await store.get(budgetKey(id));
    if (!raw.ok) return raw as typeof raw & { ok: false };
    if (raw.value === null) return Result.ok(null);
    return Result.ok(JSON.parse(decoder.decode(raw.value)) as Budget);
  }

  async function list(): AsyncResult<ReadonlyArray<Budget>> {
    const keysResult = await store.keys();
    if (!keysResult.ok) return keysResult as typeof keysResult & { ok: false };

    const items: Budget[] = [];
    for (const key of keysResult.value) {
      if (!key.startsWith(PREFIX)) continue;
      const raw = await store.get(key);
      if (raw.ok && raw.value !== null) {
        items.push(JSON.parse(decoder.decode(raw.value)) as Budget);
      }
    }
    items.sort((a, b) => a.name.localeCompare(b.name));
    return Result.ok(items);
  }

  async function addSpending(id: BudgetId, amount: BigIntString): AsyncResult<Budget> {
    const existing = await get(id);
    if (!existing.ok) return existing as typeof existing & { ok: false };
    if (existing.value === null) {
      return Result.err({ code: ErrorCode.NOT_FOUND, message: `Budget ${id} not found` });
    }

    const spent = BigInt(existing.value.spentAmount) + BigInt(amount);
    const updated: Budget = {
      ...existing.value,
      spentAmount: spent.toString() as BigIntString,
      updatedAt: Date.now() as Timestamp,
    };

    const w = await store.set(budgetKey(id), encoder.encode(JSON.stringify(updated)));
    if (!w.ok) return w as typeof w & { ok: false };
    return Result.ok(updated);
  }

  async function resetSpending(id: BudgetId): AsyncResult<Budget> {
    const existing = await get(id);
    if (!existing.ok) return existing as typeof existing & { ok: false };
    if (existing.value === null) {
      return Result.err({ code: ErrorCode.NOT_FOUND, message: `Budget ${id} not found` });
    }

    const now = Date.now() as Timestamp;
    const updated: Budget = {
      ...existing.value,
      spentAmount: '0' as BigIntString,
      periodStart: currentPeriodStart(existing.value.period, now),
      updatedAt: now,
    };

    const w = await store.set(budgetKey(id), encoder.encode(JSON.stringify(updated)));
    if (!w.ok) return w as typeof w & { ok: false };
    return Result.ok(updated);
  }

  async function checkLimit(
    id: BudgetId
  ): AsyncResult<{ exceeded: boolean; remaining: BigIntString }> {
    const existing = await get(id);
    if (!existing.ok) return existing as typeof existing & { ok: false };
    if (existing.value === null) {
      return Result.err({ code: ErrorCode.NOT_FOUND, message: `Budget ${id} not found` });
    }

    const cap = BigInt(existing.value.capAmount);
    const spent = BigInt(existing.value.spentAmount);
    const remaining = cap > spent ? cap - spent : 0n;

    return Result.ok({
      exceeded: spent >= cap,
      remaining: remaining.toString() as BigIntString,
    });
  }

  return {
    create,
    update,
    delete: deleteBudget,
    get,
    list,
    addSpending,
    resetSpending,
    checkLimit,
  };
}
