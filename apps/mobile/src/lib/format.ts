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
