export function parseRupees(value: string): number {
  const text = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text)) throw new Error('Enter a valid rupee amount with up to 2 decimal places.');
  const [whole, fraction = ''] = text.split('.');
  const paisa = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(paisa)) throw new Error('Amount is too large.');
  return paisa;
}

export function buildSplits(amountPaisa: number, participants: string[], custom?: { userId: string; sharePaisa: number }[]) {
  if (!Number.isSafeInteger(amountPaisa) || amountPaisa <= 0) throw new Error('Total must be greater than zero.');
  const ids = [...new Set(participants)].sort();
  if (!ids.length || ids.length !== participants.length) throw new Error('Choose at least one participant, with no duplicates.');
  if (custom) {
    if (custom.length !== ids.length || new Set(custom.map(s => s.userId)).size !== ids.length || custom.some(s => !ids.includes(s.userId))) throw new Error('Enter one amount for every selected participant.');
    if (custom.some(s => !Number.isSafeInteger(s.sharePaisa) || s.sharePaisa < 0)) throw new Error('Each share must be a non-negative amount in paisa.');
    const total = custom.reduce((sum, s) => sum + s.sharePaisa, 0);
    if (!Number.isSafeInteger(total) || total !== amountPaisa) throw new Error('Individual amounts must add up to the expense total.');
    return ids.map(userId => ({ userId, sharePaisa: custom.find(s => s.userId === userId)!.sharePaisa }));
  }
  return ids.map((userId, index) => ({ userId, sharePaisa: Math.floor(amountPaisa / ids.length) + (index < amountPaisa % ids.length ? 1 : 0) }));
}
