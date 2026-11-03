const xofFormatter = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 0,
});

/** Formate un montant entier en FCFA, ex. 3200 -> "3 200 FCFA". */
export function formatXOF(amount: number): string {
  return `${xofFormatter.format(amount)} FCFA`;
}

/** Formate un numero de commande lisible, ex. 1001 -> "#FK-1001". */
export function formatOrderNumber(sequence: number): string {
  return `#FK-${sequence}`;
}

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** Formate une date ISO en date lisible, ex. "2 novembre 2026". */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
}
