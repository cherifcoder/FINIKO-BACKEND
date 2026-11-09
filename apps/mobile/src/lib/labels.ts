import type {
  Category,
  DriverMissionPhase,
  OrderPaymentMethod,
  OrderPaymentStatus,
  OrderStatus,
  PaymentProvider,
  PaymentPurpose,
  PaymentStatus,
  SubscriptionStatus,
  SubscriptionUsageType,
  Treatment,
  UserRole,
  UserStatus,
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

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  client: 'Client',
  livreur: 'Livreur',
  pressing: 'Pressing',
  admin: 'Administrateur',
};

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  actif: 'Actif',
  suspendu: 'Suspendu',
  supprime: 'Supprimé',
};

export const USAGE_TYPE_LABELS: Record<SubscriptionUsageType, string> = {
  reservation: 'Réservation',
  consommation: 'Consommation',
  liberation: 'Libération',
  remboursement: 'Remboursement',
  ajustement: 'Ajustement admin',
  expiration: 'Expiration',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  en_attente_paiement: 'En attente de paiement',
  confirmee: 'Confirmée',
  ramassage_assigne: 'Ramassage assigné',
  ramassage_en_cours: 'Ramassage en cours',
  ramassee: 'Ramassée',
  deposee_au_pressing: 'Déposée au pressing',
  au_pressing: 'Au pressing',
  en_traitement: 'En traitement',
  prete: 'Prête',
  livraison_assignee: 'Livraison assignée',
  livraison_en_cours: 'Livraison en cours',
  livree: 'Livrée',
  terminee: 'Terminée',
  annulee: 'Annulée',
  litige: 'Litige',
};

export const DRIVER_MISSION_PHASE_LABELS: Record<DriverMissionPhase, string> = {
  ramassage: 'Ramassage',
  livraison: 'Livraison',
  terminee: 'Terminée',
  autre: 'Suivi',
};

export const ORDER_PAYMENT_STATUS_LABELS: Record<OrderPaymentStatus, string> = {
  non_requis: 'Non requis',
  en_attente: 'En attente',
  a_collecter: 'À collecter',
  paye: 'Payé',
  rembourse: 'Remboursé',
  echoue: 'Échoué',
};

export const ORDER_PAYMENT_METHOD_LABELS: Record<OrderPaymentMethod, string> = {
  pack: 'Pack',
  orange_money: 'Orange Money',
  cash: 'Espèces',
  wallet: 'Portefeuille',
};

export const PAYMENT_PROVIDER_LABELS: Record<PaymentProvider, string> = {
  orange_money: 'Orange Money',
  cash: 'Espèces',
  wallet: 'Portefeuille',
  system: 'Système',
};

export const PAYMENT_PURPOSE_LABELS: Record<PaymentPurpose, string> = {
  order: 'Commande',
  subscription: 'Abonnement',
  wallet_topup: 'Rechargement',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  initie: 'Initié',
  en_attente: 'En attente',
  reussi: 'Réussi',
  echoue: 'Échoué',
  annule: 'Annulé',
  expire: 'Expiré',
  rembourse: 'Remboursé',
};
