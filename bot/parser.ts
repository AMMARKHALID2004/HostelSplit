import { categories, type Category } from '../src/lib/server/expense';

const pattern = /^expense\s+(\w+)\s+(\d+(?:\.\d{1,2})?)\s+paid\s+by\s+(.+?)\s+for\s+(all|.+)$/i;

export function parseExpenseCommand(text: string) {
  const match = text.trim().match(pattern);
  if (!match) return null;
  const [, rawCategory, amount, payerName, rawParticipants] = match;
  const category = rawCategory.toLowerCase() as Category;
  if (!categories.includes(category)) return null;
  const [whole, fractional = ''] = amount.split('.');
  const amountPaisa = Number(whole) * 100 + Number(fractional.padEnd(2, '0'));
  if (!Number.isSafeInteger(amountPaisa) || amountPaisa <= 0) return null;
  const participants = rawParticipants.trim().toLowerCase() === 'all' ? 'ALL' as const : rawParticipants.split(',').map((s) => s.trim()).filter(Boolean);
  if (participants !== 'ALL' && !participants.length) return null;
  return { category, amountPaisa, payerName: payerName.trim(), participants };
}
