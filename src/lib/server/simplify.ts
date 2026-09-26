export type SuggestedPayment = { from: string; to: string; amountPaisa: number };

export function simplifyDebts(balances: Map<string, number>): SuggestedPayment[] {
  if ([...balances.values()].reduce((sum, value) => sum + value, 0) !== 0) throw new Error('Balances must sum to zero');
  const creditors = [...balances].filter(([, value]) => value > 0).map(([id, amount]) => ({ id, amount }));
  const debtors = [...balances].filter(([, value]) => value < 0).map(([id, amount]) => ({ id, amount: -amount }));
  const compare = (a: { id: string; amount: number }, b: { id: string; amount: number }) => b.amount - a.amount || a.id.localeCompare(b.id);
  creditors.sort(compare);
  debtors.sort(compare);
  const payments: SuggestedPayment[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amountPaisa = Math.min(debtors[i].amount, creditors[j].amount);
    payments.push({ from: debtors[i].id, to: creditors[j].id, amountPaisa });
    debtors[i].amount -= amountPaisa;
    creditors[j].amount -= amountPaisa;
    if (debtors[i].amount === 0) i++;
    if (creditors[j].amount === 0) j++;
  }
  return payments;
}
