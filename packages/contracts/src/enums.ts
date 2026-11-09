/**
 * Enums partages entre l'API, le mobile et les tests.
 * Source de verite : docs/02-donnees.md § 4.
 */

export const USER_ROLES = ['client', 'livreur', 'pressing', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['actif', 'suspendu', 'supprime'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const CATEGORIES = ['homme', 'femme', 'enfant', 'maison', 'blanchiment'] as const;
export type Category = (typeof CATEGORIES)[number];

export const TREATMENTS = ['lavage', 'repassage', 'lavage_repassage'] as const;
export type Treatment = (typeof TREATMENTS)[number];

export const SUBSCRIPTION_STATUSES = [
  'en_attente_paiement',
  'programmee',
  'active',
  'expiree',
  'annulee',
  'suspendue',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const ORDER_STATUSES = [
  'en_attente_paiement',
  'confirmee',
  'ramassage_assigne',
  'ramassage_en_cours',
  'ramassee',
  'deposee_au_pressing',
  'au_pressing',
  'en_traitement',
  'prete',
  'livraison_assignee',
  'livraison_en_cours',
  'livree',
  'terminee',
  'annulee',
  'litige',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_TERMINAL_STATUSES = ['terminee', 'annulee'] as const;
export type OrderTerminalStatus = (typeof ORDER_TERMINAL_STATUSES)[number];

export const ORDER_PAYMENT_STATUSES = [
  'non_requis',
  'en_attente',
  'a_collecter',
  'paye',
  'rembourse',
  'echoue',
] as const;
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUSES)[number];

export const ORDER_PAYMENT_METHODS = ['pack', 'orange_money', 'cash', 'wallet'] as const;
export type OrderPaymentMethod = (typeof ORDER_PAYMENT_METHODS)[number];

/**
 * Transitions autorisees. Toute transition absente est refusee avec INVALID_TRANSITION.
 * Les annulations et litiges restent possibles sur les etats non terminaux.
 */
export const ORDER_TRANSITIONS = {
  en_attente_paiement: ['confirmee', 'annulee'],
  confirmee: ['ramassage_assigne', 'annulee'],
  ramassage_assigne: ['ramassage_en_cours', 'confirmee', 'annulee'],
  ramassage_en_cours: ['ramassee', 'litige', 'annulee'],
  ramassee: ['deposee_au_pressing', 'litige', 'annulee'],
  deposee_au_pressing: ['au_pressing', 'litige', 'annulee'],
  au_pressing: ['en_traitement', 'litige', 'annulee'],
  en_traitement: ['prete', 'litige', 'annulee'],
  prete: ['livraison_assignee', 'litige', 'annulee'],
  livraison_assignee: ['livraison_en_cours', 'litige', 'annulee'],
  livraison_en_cours: ['livree', 'litige', 'annulee'],
  livree: ['terminee', 'litige', 'annulee'],
  terminee: [],
  annulee: [],
  litige: ['en_traitement', 'annulee', 'terminee'],
} as const satisfies Record<OrderStatus, readonly OrderStatus[]>;

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return (ORDER_TRANSITIONS[from] as readonly OrderStatus[]).includes(to);
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  en_attente_paiement: 'En attente de paiement',
  confirmee: 'Confirmee',
  ramassage_assigne: 'Ramassage assigne',
  ramassage_en_cours: 'Ramassage en cours',
  ramassee: 'Ramassage effectue',
  deposee_au_pressing: 'Deposee au pressing',
  au_pressing: 'Au pressing',
  en_traitement: 'En traitement',
  prete: 'Prete',
  livraison_assignee: 'Livraison assignee',
  livraison_en_cours: 'Livraison en cours',
  livree: 'Livree',
  terminee: 'Terminee',
  annulee: 'Annulee',
  litige: 'Litige',
};

export const ITEM_TREATMENT_STATUSES = ['a_traiter', 'en_cours', 'termine'] as const;
export type ItemTreatmentStatus = (typeof ITEM_TREATMENT_STATUSES)[number];

export const CONFORMITY_STATUSES = ['a_verifier', 'conforme', 'non_conforme'] as const;
export type ConformityStatus = (typeof CONFORMITY_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'initie',
  'en_attente',
  'reussi',
  'echoue',
  'annule',
  'expire',
  'rembourse',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_PROVIDERS = ['orange_money', 'cash', 'wallet', 'system'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export const PAYMENT_PURPOSES = ['order', 'subscription', 'wallet_topup'] as const;
export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number];

export const REFUND_STATUSES = ['demande', 'en_cours', 'effectue', 'refuse'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const DISPUTE_STATUSES = ['ouvert', 'en_examen', 'resolu', 'ferme'] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export const USAGE_TYPES = [
  'reservation',
  'consommation',
  'liberation',
  'remboursement',
  'ajustement',
  'expiration',
] as const;
export type UsageType = (typeof USAGE_TYPES)[number];
