import { expect, it } from 'vitest';
import { parseExpenseCommand } from './parser';

it('parses a whitespace tolerant expense command in exact paisa', () => {
  expect(parseExpenseCommand(' EXPENSE Chai 350.05 paid by Ali for Sara, Bilal ')).toEqual({
    category: 'chai', amountPaisa: 35005, payerName: 'Ali', participants: ['Sara', 'Bilal']
  });
  expect(parseExpenseCommand('expense chai 0 paid by Ali for all')).toBeNull();
  expect(parseExpenseCommand('expense mess 1.234 paid by Ali for all')).toBeNull();
  expect(parseExpenseCommand('expense mess 100 paid by Ali Raza for Sara Khan')).toMatchObject({ payerName: 'Ali Raza', participants: ['Sara Khan'] });
});
