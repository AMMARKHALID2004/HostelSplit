import { describe, expect, it } from 'vitest';
import { calculateBalances } from './balances';
import { splitAmount } from './expense';
import { simplifyDebts } from './simplify';

describe('paisa accounting', () => {
  it('distributes the remainder by sorted user ID and stays zero sum', () => {
    const splits = splitAmount(100, ['c', 'a', 'b']);
    expect(splits).toEqual([
      { userId: 'a', sharePaisa: 34 }, { userId: 'b', sharePaisa: 33 }, { userId: 'c', sharePaisa: 33 }
    ]);
    const balances = calculateBalances(['a', 'b', 'c'], [
      { id: 'e', paidBy: 'c', amountPaisa: 100, status: 'active' }
    ], splits.map((s) => ({ ...s, expenseId: 'e', status: 'confirmed' })), []);
    expect([...balances.values()].reduce((a, b) => a + b, 0)).toBe(0);
    expect(balances.get('c')).toBe(67);
  });

  it('excludes pending and voided expenses and unconfirmed settlements', () => {
    const result = calculateBalances(['a', 'b'], [
      { id: 'pending', paidBy: 'a', amountPaisa: 100, status: 'pending_approval' },
      { id: 'voided', paidBy: 'a', amountPaisa: 100, status: 'voided' }
    ], [{ expenseId: 'pending', userId: 'b', sharePaisa: 100, status: 'pending' }], [
      { payerId: 'b', payeeId: 'a', amountPaisa: 100, status: 'pending_confirmation' }
    ]);
    expect([...result.values()]).toEqual([0, 0]);
  });

  it('folds in confirmed settlements and simplifies a chain', () => {
    const result = calculateBalances(['a', 'b', 'c'], [
      { id: 'ab', paidBy: 'b', amountPaisa: 50000, status: 'active' },
      { id: 'bc', paidBy: 'c', amountPaisa: 50000, status: 'active' }
    ], [
      { expenseId: 'ab', userId: 'a', sharePaisa: 50000, status: 'confirmed' },
      { expenseId: 'bc', userId: 'b', sharePaisa: 50000, status: 'confirmed' }
    ], []);
    expect(simplifyDebts(result)).toEqual([{ from: 'a', to: 'c', amountPaisa: 50000 }]);
    const settled = calculateBalances(['a', 'b', 'c'], [
      { id: 'ab', paidBy: 'b', amountPaisa: 50000, status: 'active' },
      { id: 'bc', paidBy: 'c', amountPaisa: 50000, status: 'active' }
    ], [
      { expenseId: 'ab', userId: 'a', sharePaisa: 50000, status: 'confirmed' },
      { expenseId: 'bc', userId: 'b', sharePaisa: 50000, status: 'confirmed' }
    ], [{ payerId: 'a', payeeId: 'c', amountPaisa: 50000, status: 'confirmed' }]);
    expect([...settled.values()]).toEqual([0, 0, 0]);
  });
});
