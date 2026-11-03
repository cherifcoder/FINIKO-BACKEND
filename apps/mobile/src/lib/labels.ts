import type {
  Category,
  SubscriptionStatus,
  SubscriptionUsageType,
  Treatment,
} from '@finiko/contracts';

export const TREATMENT_LABELS: Record<Treatment, string> = {
  lavage: 'Lavage seul',
  repassage: 'Repassage seul',
  lavage_repassage: 'Lavage + repassage',
};

export const CATEGORY_LABELS: Record<Category, string> = {
  homme: 'Homme',
  femme: 'Femme',
  enfant: 'Enfant',
  maison: 'Maison',
  blanchiment: 'Blanchiment',
};

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  en_attente_paiement: 'En attente de paiement',
  programmee: 'Programmé',
  active: 'Actif',
  expiree: 'Expiré',
  annulee: 'Annulé',
  suspendue: 'Suspendu',
};

export const USAGE_TYPE_LABELS: Record<SubscriptionUsageType, string> = {
  reservation: 'Réservation',
  consommation: 'Consommation',
  liberation: 'Libération',
  remboursement: 'Remboursement',
  ajustement: 'Ajustement admin',
  expiration: 'Expiration',
};
