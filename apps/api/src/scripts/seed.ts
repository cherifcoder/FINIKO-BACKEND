/**
 * Jeu de données de démonstration FINIKO v2.
 *
 * Idempotent : peut être relancé sans créer de doublons. Les comptes de
 * démonstration sont ceux documentés dans docs/02-donnees.md § 9.
 *
 *   pnpm --filter @finiko/api seed
 */
import { randomBytes } from 'node:crypto';
import type { Types } from 'mongoose';
import type {
  CatalogPrices,
  Category,
  OrderPaymentMethod,
  OrderPaymentStatus,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  Treatment,
  UserRole,
} from '@finiko/contracts';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { logger } from '../config/logger';
import { CatalogItemModel } from '../models/catalog-item.model';
import { nextSequence } from '../models/counter.model';
import { OrderModel, type OrderItem } from '../models/order.model';
import { PackModel } from '../models/pack.model';
import { PaymentModel } from '../models/payment.model';
import {
  ClientProfileModel,
  DriverProfileModel,
  PressingProfileModel,
} from '../models/profile.model';
import { SubscriptionModel, type SubscriptionDocument } from '../models/subscription.model';
import { SubscriptionUsageModel } from '../models/subscription-usage.model';
import { UserModel, type UserDocument } from '../models/user.model';
import { hashPassword } from '../security/password';

interface DemoUser {
  role: UserRole;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
}

const DEMO_USERS: DemoUser[] = [
  {
    role: 'admin',
    firstName: 'Administrateur',
    lastName: 'FINIKO',
    email: 'admin@finiko.ml',
    phone: '+22370000000',
    password: 'Admin@2026!',
  },
  {
    role: 'livreur',
    firstName: 'Oumar',
    lastName: 'Traoré',
    email: 'livreur@finiko.ml',
    phone: '+22370000001',
    password: 'Livreur@2026!',
  },
  {
    role: 'client',
    firstName: 'Awa',
    lastName: 'Diarra',
    email: 'client@finiko.ml',
    phone: '+22370000002',
    password: 'Client@2026!',
  },
  {
    role: 'pressing',
    firstName: 'Pressing',
    lastName: 'Koulouba',
    email: 'pressing@finiko.ml',
    phone: '+22370000003',
    password: 'Pressing@2026!',
  },
];

const TREATMENTS: Treatment[] = ['lavage', 'repassage', 'lavage_repassage'];

interface DemoCatalogItem {
  code: string;
  name: string;
  description: string;
  category: Category;
  material: string;
  prices: { lavage: number; repassage: number; lavage_repassage: number };
  quotaWeight: number;
  displayOrder: number;
}

const DEMO_CATALOG: DemoCatalogItem[] = [
  {
    code: 'chemise',
    name: 'Chemise',
    description: 'Chemise en coton, col et poignets repassés.',
    category: 'homme',
    material: 'Coton',
    prices: { lavage: 800, repassage: 500, lavage_repassage: 1200 },
    quotaWeight: 1,
    displayOrder: 1,
  },
  {
    code: 'pantalon',
    name: 'Pantalon',
    description: 'Pantalon de ville ou jean, lavage doux.',
    category: 'homme',
    material: 'Coton / Jean',
    prices: { lavage: 1000, repassage: 700, lavage_repassage: 1500 },
    quotaWeight: 1,
    displayOrder: 2,
  },
  {
    code: 't_shirt',
    name: 'T-shirt',
    description: 'T-shirt ou polo, traitement rapide.',
    category: 'homme',
    material: 'Coton',
    prices: { lavage: 600, repassage: 400, lavage_repassage: 900 },
    quotaWeight: 1,
    displayOrder: 3,
  },
  {
    code: 'boubou',
    name: 'Boubou',
    description: 'Boubou brodé, lavage délicat et repassage soigné.',
    category: 'femme',
    material: 'Bazin',
    prices: { lavage: 1500, repassage: 1000, lavage_repassage: 2200 },
    quotaWeight: 2,
    displayOrder: 4,
  },
  {
    code: 'robe',
    name: 'Robe',
    description: 'Robe simple ou habillée.',
    category: 'femme',
    material: 'Coton / Synthétique',
    prices: { lavage: 1200, repassage: 800, lavage_repassage: 1800 },
    quotaWeight: 1,
    displayOrder: 5,
  },
  {
    code: 'costume',
    name: 'Costume',
    description: 'Costume deux pièces, nettoyage à sec recommandé.',
    category: 'homme',
    material: 'Laine',
    prices: { lavage: 2500, repassage: 2000, lavage_repassage: 4000 },
    quotaWeight: 3,
    displayOrder: 6,
  },
  {
    code: 'couverture',
    name: 'Couverture',
    description: 'Couverture ou plaid, lavage grande capacité.',
    category: 'maison',
    material: 'Laine / Coton',
    prices: { lavage: 2000, repassage: 1500, lavage_repassage: 3000 },
    quotaWeight: 2,
    displayOrder: 7,
  },
  {
    code: 'drap',
    name: 'Drap de lit',
    description: 'Drap, housse de couette ou taie.',
    category: 'maison',
    material: 'Coton',
    prices: { lavage: 1800, repassage: 1200, lavage_repassage: 2600 },
    quotaWeight: 2,
    displayOrder: 8,
  },
  {
    code: 'uniforme_enfant',
    name: 'Uniforme enfant',
    description: 'Uniforme scolaire, lavage et repassage express.',
    category: 'enfant',
    material: 'Coton',
    prices: { lavage: 700, repassage: 500, lavage_repassage: 1100 },
    quotaWeight: 1,
    displayOrder: 9,
  },
  {
    code: 'blanchiment_boubou',
    name: 'Blanchiment boubou',
    description: 'Blanchiment professionnel des boubous blancs.',
    category: 'blanchiment',
    material: 'Bazin',
    prices: { lavage: 2000, repassage: 1200, lavage_repassage: 2800 },
    quotaWeight: 2,
    displayOrder: 10,
  },
];

interface DemoPack {
  code: string;
  name: string;
  description: string;
  priceXOF: number;
  quotaUnits: number;
  includedTreatments: Treatment[];
  deliveryIncluded: boolean;
  deliveryDiscountPercent: number;
  features: string[];
  badge: string | null;
  color: string;
  displayOrder: number;
}

const DEMO_PACKS: DemoPack[] = [
  {
    code: 'essentiel',
    name: 'Pack Essentiel',
    description: 'Le quota de départ pour un foyer de une à deux personnes.',
    priceXOF: 6000,
    quotaUnits: 5,
    includedTreatments: TREATMENTS,
    deliveryIncluded: false,
    deliveryDiscountPercent: 0,
    features: ['5 unités de linge par mois', 'Lavage et repassage', 'Sans engagement'],
    badge: null,
    color: '#2563EB',
    displayOrder: 1,
  },
  {
    code: 'normal',
    name: 'Pack Normal',
    description: 'Le meilleur équilibre pour une famille de trois à quatre personnes.',
    priceXOF: 11000,
    quotaUnits: 10,
    includedTreatments: TREATMENTS,
    deliveryIncluded: false,
    deliveryDiscountPercent: 0,
    features: [
      '10 unités de linge par mois',
      'Les trois prestations',
      'Suivi du quota en temps réel',
    ],
    badge: 'Populaire',
    color: '#1D4ED8',
    displayOrder: 2,
  },
  {
    code: 'premium',
    name: 'Pack Premium',
    description: 'Pour un usage intensif avec livraison à moitié prix.',
    priceXOF: 20000,
    quotaUnits: 20,
    includedTreatments: TREATMENTS,
    deliveryIncluded: false,
    deliveryDiscountPercent: 50,
    features: ['20 unités de linge par mois', '-50 % sur la livraison', 'Traitement prioritaire'],
    badge: 'Meilleure valeur',
    color: '#9333EA',
    displayOrder: 3,
  },
  {
    code: 'famille',
    name: 'Pack Famille',
    description: 'Grande capacité, livraison incluse, idéal pour les familles nombreuses.',
    priceXOF: 35000,
    quotaUnits: 40,
    includedTreatments: TREATMENTS,
    deliveryIncluded: true,
    deliveryDiscountPercent: 100,
    features: ['40 unités de linge par mois', 'Livraison incluse', 'Report du quota non utilisé'],
    badge: 'Famille',
    color: '#059669',
    displayOrder: 4,
  },
];

interface DemoOrder {
  sequence: number;
  status: OrderStatus;
  paymentMethod: OrderPaymentMethod;
  paymentStatus: OrderPaymentStatus;
  provider: PaymentProvider | null;
  paymentRecordStatus: PaymentStatus | null;
  daysAgo: number;
  deliveryFee: number;
  pickupText: string;
  deliveryText: string;
  items: Array<{ code: string; treatment: Treatment; quantity: number }>;
}

const DEMO_ORDERS: DemoOrder[] = [
  {
    sequence: 1001,
    status: 'terminee',
    paymentMethod: 'orange_money',
    paymentStatus: 'paye',
    provider: 'orange_money',
    paymentRecordStatus: 'reussi',
    daysAgo: 21,
    deliveryFee: 1000,
    pickupText: 'Hamdallaye ACI, Bamako',
    deliveryText: 'Badalabougou Est, Bamako',
    items: [
      { code: 'chemise', treatment: 'lavage_repassage', quantity: 2 },
      { code: 'pantalon', treatment: 'lavage_repassage', quantity: 1 },
    ],
  },
  {
    sequence: 1002,
    status: 'livree',
    paymentMethod: 'cash',
    paymentStatus: 'paye',
    provider: 'cash',
    paymentRecordStatus: 'reussi',
    daysAgo: 14,
    deliveryFee: 1000,
    pickupText: 'ACI 2000, Bamako',
    deliveryText: 'Hamdallaye ACI, Bamako',
    items: [
      { code: 'boubou', treatment: 'lavage_repassage', quantity: 1 },
      { code: 'robe', treatment: 'lavage', quantity: 1 },
    ],
  },
  {
    sequence: 1003,
    status: 'en_traitement',
    paymentMethod: 'orange_money',
    paymentStatus: 'paye',
    provider: 'orange_money',
    paymentRecordStatus: 'reussi',
    daysAgo: 6,
    deliveryFee: 1000,
    pickupText: 'Kalaban Coura, Bamako',
    deliveryText: 'Kalaban Coura, Bamako',
    items: [
      { code: 'costume', treatment: 'lavage_repassage', quantity: 1 },
      { code: 'chemise', treatment: 'repassage', quantity: 2 },
    ],
  },
  {
    sequence: 1004,
    status: 'prete',
    paymentMethod: 'orange_money',
    paymentStatus: 'paye',
    provider: 'orange_money',
    paymentRecordStatus: 'reussi',
    daysAgo: 3,
    deliveryFee: 0,
    pickupText: 'Badalabougou Est, Bamako',
    deliveryText: 'Badalabougou Est, Bamako',
    items: [
      { code: 'couverture', treatment: 'lavage_repassage', quantity: 1 },
      { code: 'drap', treatment: 'lavage_repassage', quantity: 1 },
    ],
  },
  {
    sequence: 1005,
    status: 'confirmee',
    paymentMethod: 'orange_money',
    paymentStatus: 'en_attente',
    provider: 'orange_money',
    paymentRecordStatus: 'en_attente',
    daysAgo: 2,
    deliveryFee: 1000,
    pickupText: 'Sotuba, Bamako',
    deliveryText: 'Sotuba, Bamako',
    items: [
      { code: 't_shirt', treatment: 'lavage', quantity: 3 },
      { code: 'pantalon', treatment: 'repassage', quantity: 1 },
    ],
  },
  {
    sequence: 1006,
    status: 'en_attente_paiement',
    paymentMethod: 'orange_money',
    paymentStatus: 'en_attente',
    provider: 'orange_money',
    paymentRecordStatus: 'initie',
    daysAgo: 1,
    deliveryFee: 1000,
    pickupText: 'Lafiabougou, Bamako',
    deliveryText: 'Lafiabougou, Bamako',
    items: [{ code: 'uniforme_enfant', treatment: 'lavage_repassage', quantity: 3 }],
  },
  {
    sequence: 1007,
    status: 'annulee',
    paymentMethod: 'cash',
    paymentStatus: 'echoue',
    provider: 'cash',
    paymentRecordStatus: 'echoue',
    daysAgo: 9,
    deliveryFee: 0,
    pickupText: 'Faladie, Bamako',
    deliveryText: 'Faladie, Bamako',
    items: [{ code: 'blanchiment_boubou', treatment: 'lavage_repassage', quantity: 1 }],
  },
  {
    sequence: 1008,
    status: 'ramassage_assigne',
    paymentMethod: 'cash',
    paymentStatus: 'a_collecter',
    provider: null,
    paymentRecordStatus: null,
    daysAgo: 0,
    deliveryFee: 1000,
    pickupText: 'Djicoroni Para, Bamako',
    deliveryText: 'Djicoroni Para, Bamako',
    items: [
      { code: 't_shirt', treatment: 'lavage', quantity: 4 },
      { code: 'pantalon', treatment: 'repassage', quantity: 1 },
    ],
  },
  {
    sequence: 1009,
    status: 'litige',
    paymentMethod: 'orange_money',
    paymentStatus: 'rembourse',
    provider: 'orange_money',
    paymentRecordStatus: 'rembourse',
    daysAgo: 12,
    deliveryFee: 0,
    pickupText: 'Baco Djicoroni, Bamako',
    deliveryText: 'Baco Djicoroni, Bamako',
    items: [
      { code: 'robe', treatment: 'lavage_repassage', quantity: 1 },
      { code: 'boubou', treatment: 'lavage', quantity: 1 },
    ],
  },
  {
    sequence: 1010,
    status: 'terminee',
    paymentMethod: 'orange_money',
    paymentStatus: 'paye',
    provider: 'orange_money',
    paymentRecordStatus: 'reussi',
    daysAgo: 4,
    deliveryFee: 1000,
    pickupText: 'Hamdallaye ACI, Bamako',
    deliveryText: 'Hamdallaye ACI, Bamako',
    items: [
      { code: 'chemise', treatment: 'lavage_repassage', quantity: 1 },
      { code: 'costume', treatment: 'repassage', quantity: 1 },
    ],
  },
  {
    sequence: 1011,
    status: 'deposee_au_pressing',
    paymentMethod: 'cash',
    paymentStatus: 'a_collecter',
    provider: null,
    paymentRecordStatus: null,
    daysAgo: 5,
    deliveryFee: 1000,
    pickupText: 'Magnambougou, Bamako',
    deliveryText: 'Magnambougou, Bamako',
    items: [{ code: 'drap', treatment: 'lavage', quantity: 2 }],
  },
];

async function ensureUser(input: DemoUser): Promise<UserDocument> {
  const passwordHash = await hashPassword(input.password);
  const existing = await UserModel.findOne({ phone: input.phone });

  if (existing) {
    existing.set({
      role: input.role,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      passwordHash,
      status: 'actif',
      phoneVerifiedAt: new Date(),
      mustChangePassword: false,
      deletedAt: null,
    });
    await existing.save();
    return existing;
  }

  return UserModel.create({
    role: input.role,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    passwordHash,
    status: 'actif',
    phoneVerifiedAt: new Date(),
    mustChangePassword: false,
  });
}

async function ensureClientProfile(user: UserDocument): Promise<void> {
  const existing = await ClientProfileModel.findOne({ user: user._id });
  if (existing) return;

  await ClientProfileModel.create({
    user: user._id,
    referralCode: `FK${randomBytes(3).toString('hex').toUpperCase()}`,
  });
}

async function ensureDriverProfile(user: UserDocument): Promise<void> {
  const existing = await DriverProfileModel.findOne({ user: user._id });
  if (existing) return;

  const sequence = await nextSequence('driver');

  await DriverProfileModel.create({
    user: user._id,
    code: `FK-L-${String(sequence).padStart(3, '0')}`,
    vehicle: { type: 'moto', plate: 'ML-1234-BKO' },
    zoneCodes: ['bko_hamdallaye', 'bko_aci', 'bko_badadji'],
    status: 'disponible',
    currentLocation: { type: 'Point', coordinates: [-8.0029, 12.6392] },
    lastLocationAt: new Date(),
    capacity: 5,
  });
}

async function ensurePressingProfile(user: UserDocument): Promise<void> {
  const existing = await PressingProfileModel.findOne({ user: user._id });
  if (existing) return;

  const sequence = await nextSequence('pressing');

  await PressingProfileModel.create({
    user: user._id,
    code: `FK-P-${String(sequence).padStart(3, '0')}`,
    businessName: 'Pressing Koulouba',
    addressText: 'Hamdallaye ACI, Bamako',
    location: { type: 'Point', coordinates: [-8.0029, 12.6392] },
    capacityPerDay: 150,
    status: 'actif',
    services: TREATMENTS,
  });
}

async function seedCatalog(): Promise<void> {
  for (const item of DEMO_CATALOG) {
    await CatalogItemModel.findOneAndUpdate(
      { code: item.code },
      {
        $set: {
          name: item.name,
          description: item.description,
          category: item.category,
          material: item.material,
          prices: item.prices,
          quotaWeight: item.quotaWeight,
          availableTreatments: TREATMENTS,
          displayOrder: item.displayOrder,
          isActive: true,
          deletedAt: null,
        },
      },
      { upsert: true, runValidators: true },
    );
  }
}

async function seedPacks(): Promise<void> {
  for (const pack of DEMO_PACKS) {
    await PackModel.findOneAndUpdate(
      { code: pack.code },
      {
        $set: {
          name: pack.name,
          description: pack.description,
          priceXOF: pack.priceXOF,
          billingPeriodDays: 30,
          quotaUnits: pack.quotaUnits,
          includedTreatments: pack.includedTreatments,
          overagePolicy: 'prix_catalogue',
          deliveryIncluded: pack.deliveryIncluded,
          deliveryDiscountPercent: pack.deliveryDiscountPercent,
          maxItemsPerOrder: 50,
          rollover: {
            enabled: pack.code === 'famille',
            maxPercent: pack.code === 'famille' ? 50 : 0,
          },
          features: pack.features,
          badge: pack.badge,
          color: pack.color,
          displayOrder: pack.displayOrder,
          isActive: true,
          deletedAt: null,
        },
      },
      { upsert: true, runValidators: true },
    );
  }
}

async function seedActiveSubscription(client: UserDocument): Promise<SubscriptionDocument | null> {
  const active = await SubscriptionModel.findOne({ client: client._id, status: 'active' });
  if (active) return active;

  const pack = await PackModel.findOne({ code: 'normal', deletedAt: null });
  if (!pack) return null;

  const now = new Date();
  const startDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const endDate = new Date(startDate.getTime() + pack.billingPeriodDays * 24 * 60 * 60 * 1000);
  const quotaUsed = 2;

  const subscription = await SubscriptionModel.create({
    client: client._id,
    pack: pack._id,
    packSnapshot: {
      code: pack.code,
      name: pack.name,
      priceXOF: pack.priceXOF,
      quotaUnits: pack.quotaUnits,
      includedTreatments: [...pack.includedTreatments],
      billingPeriodDays: pack.billingPeriodDays,
      deliveryIncluded: pack.deliveryIncluded,
      deliveryDiscountPercent: pack.deliveryDiscountPercent,
      rollover: { enabled: pack.rollover.enabled, maxPercent: pack.rollover.maxPercent },
    },
    status: 'active',
    startDate,
    endDate,
    quotaTotal: pack.quotaUnits,
    quotaUsed,
    quotaReserved: 0,
    autoRenew: false,
    paymentMethod: 'cash',
    activatedAt: startDate,
  });

  await SubscriptionUsageModel.create([
    {
      subscription: subscription._id,
      client: client._id,
      order: null,
      type: 'ajustement',
      units: pack.quotaUnits,
      usedDelta: 0,
      reservedDelta: 0,
      quotaTotalDelta: pack.quotaUnits,
      quotaUsedAfter: 0,
      quotaReservedAfter: 0,
      quotaTotalAfter: pack.quotaUnits,
      reason: 'Crédit initial du pack (jeu de démonstration)',
    },
    {
      subscription: subscription._id,
      client: client._id,
      order: null,
      type: 'consommation',
      units: quotaUsed,
      usedDelta: quotaUsed,
      reservedDelta: 0,
      quotaTotalDelta: 0,
      quotaUsedAfter: quotaUsed,
      quotaReservedAfter: 0,
      quotaTotalAfter: pack.quotaUnits,
      reason: 'Commande de démonstration (2 unités)',
    },
  ]);

  return subscription;
}

async function seedSubscriptionPayment(
  subscription: SubscriptionDocument,
  client: UserDocument,
): Promise<void> {
  const createdAt = subscription.activatedAt ?? subscription.startDate;

  const payment = await PaymentModel.findOneAndUpdate(
    { reference: 'PAY-SEED-SUB-001' },
    {
      $set: {
        idempotencyKey: 'seed-subscription-active',
        purpose: 'subscription',
        client: client._id,
        order: null,
        subscription: subscription._id,
        provider: 'cash',
        amountXOF: subscription.packSnapshot.priceXOF,
        currency: 'XOF',
        status: 'reussi',
        providerTxId: 'CASH-SEED-SUB-001',
        providerStatus: 'CASH_RECEIVED',
        paidAt: createdAt,
        expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000),
        reconciledAt: createdAt,
        metadata: { seed: true },
        createdAt,
        updatedAt: createdAt,
      },
    },
    {
      upsert: true,
      returnDocument: 'after',
      runValidators: true,
      setDefaultsOnInsert: true,
      timestamps: false,
    },
  );

  if (payment) {
    await PaymentModel.collection.updateOne(
      { _id: payment._id },
      { $set: { createdAt, updatedAt: createdAt } },
    );
  }
}

interface DemoCatalogRow {
  _id: Types.ObjectId;
  code: string;
  name: string;
  category: Category;
  prices: CatalogPrices;
  quotaWeight: number;
}

function orderItemFromCatalog(
  catalogByCode: Map<string, DemoCatalogRow>,
  input: DemoOrder['items'][number],
): OrderItem {
  const catalog = catalogByCode.get(input.code);

  if (!catalog) {
    throw new Error(`Article de démonstration introuvable : ${input.code}`);
  }

  const unitPrice = catalog.prices[input.treatment];

  return {
    catalogItem: catalog._id,
    code: catalog.code,
    name: catalog.name,
    category: catalog.category,
    treatment: input.treatment,
    quantity: input.quantity,
    quotaWeight: catalog.quotaWeight,
    unitPrice,
    lineTotal: unitPrice * input.quantity,
    coveredQuantity: 0,
    billableQuantity: input.quantity,
    coveredAmount: 0,
    billableAmount: unitPrice * input.quantity,
    treatmentStatus: 'a_traiter',
    treatmentStartedAt: null,
    treatmentCompletedAt: null,
  };
}

async function seedOrders(
  client: UserDocument,
  driverUser: UserDocument,
  pressingUser: UserDocument,
): Promise<void> {
  const [catalogItems, driverProfile, pressingProfile] = await Promise.all([
    CatalogItemModel.find({
      code: { $in: DEMO_ORDERS.flatMap((order) => order.items.map((item) => item.code)) },
    })
      .select('code name category prices quotaWeight')
      .lean(),
    DriverProfileModel.findOne({ user: driverUser._id }).select('_id').lean(),
    PressingProfileModel.findOne({ user: pressingUser._id }).select('_id').lean(),
  ]);

  const catalogByCode = new Map(catalogItems.map((item) => [item.code, item] as const));
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;

  for (const demo of DEMO_ORDERS) {
    const items = demo.items.map((item) => orderItemFromCatalog(catalogByCode, item));
    const catalogSubtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const itemsCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalDue = catalogSubtotal + demo.deliveryFee;
    const isPaid = demo.paymentStatus === 'paye' || demo.paymentStatus === 'rembourse';
    const isRefunded = demo.paymentStatus === 'rembourse';
    const createdAt = new Date(
      now.getTime() - demo.daysAgo * dayMs - (demo.sequence % 24) * 60 * 60 * 1000,
    );
    const lastStatusAt = new Date(createdAt.getTime() + 2 * 60 * 60 * 1000);
    const assignedDriver =
      ['ramassage_assigne', 'ramassage_en_cours', 'prete', 'livraison_assignee'].includes(
        demo.status,
      ) && driverProfile
        ? driverProfile._id
        : null;
    const assignedPressing = pressingProfile ? pressingProfile._id : null;

    const order = await OrderModel.findOneAndUpdate(
      { orderNumber: `#FK-${demo.sequence}` },
      {
        $set: {
          client: client._id,
          pressing: assignedPressing,
          driver: assignedDriver,
          items,
          totals: {
            itemsCount,
            catalogSubtotal,
            packCoveredAmount: 0,
            supplementAmount: 0,
            deliveryFee: demo.deliveryFee,
            discountAmount: 0,
            totalDue,
            totalPaid: isPaid ? totalDue : 0,
            refundedAmount: isRefunded ? totalDue : 0,
          },
          pack: { subscription: null, coveredUnits: 0, overageUnits: 0 },
          pickup: {
            label: 'Ramassage',
            text: demo.pickupText,
            location: { type: 'Point', coordinates: [-8.0029, 12.6392] },
            contactName: `${client.firstName} ${client.lastName}`.trim(),
            contactPhone: client.phone,
            instructions: '',
          },
          delivery: {
            label: 'Livraison',
            text: demo.deliveryText,
            location: { type: 'Point', coordinates: [-8.0029, 12.6392] },
            contactName: `${client.firstName} ${client.lastName}`.trim(),
            contactPhone: client.phone,
            instructions: '',
          },
          status: demo.status,
          lastStatusAt,
          payment: {
            method: demo.paymentMethod,
            status: demo.paymentStatus,
            payment: null,
            paidAt: isPaid ? createdAt : null,
          },
          cancellation: {
            by: demo.status === 'annulee' ? client._id : null,
            reason: demo.status === 'annulee' ? 'Commande annulée par le client.' : null,
            at: demo.status === 'annulee' ? lastStatusAt : null,
            refundStatus: isRefunded ? 'effectue' : 'non_applicable',
            refundAmount: isRefunded ? totalDue : 0,
          },
          dispute: {
            reason:
              demo.status === 'litige'
                ? 'Litige de démonstration : un article n’est pas conforme.'
                : null,
            at: demo.status === 'litige' ? lastStatusAt : null,
            status: demo.status === 'litige' ? 'ouvert' : 'ferme',
          },
          createdAt,
          updatedAt: lastStatusAt,
        },
      },
      {
        upsert: true,
        returnDocument: 'after',
        runValidators: true,
        setDefaultsOnInsert: true,
        timestamps: false,
      },
    );

    if (!order) {
      throw new Error(`Impossible de créer la commande #FK-${demo.sequence}`);
    }

    // `createdAt` est immutable côté Mongoose : on force les dates de démo
    // directement dans la collection pour que les périodes financières restent
    // réalistes à chaque rejeu du seed.
    await OrderModel.collection.updateOne(
      { _id: order._id },
      { $set: { createdAt, updatedAt: lastStatusAt } },
    );

    if (demo.provider && demo.paymentRecordStatus) {
      const payment = await PaymentModel.findOneAndUpdate(
        { reference: `PAY-SEED-${demo.sequence}` },
        {
          $set: {
            idempotencyKey: `seed-order-${demo.sequence}`,
            purpose: 'order',
            client: client._id,
            order: order._id,
            subscription: null,
            provider: demo.provider,
            amountXOF: totalDue,
            currency: 'XOF',
            status: demo.paymentRecordStatus,
            providerTxId: `${demo.provider.toUpperCase()}-SEED-${demo.sequence}`,
            providerStatus:
              demo.paymentRecordStatus === 'reussi'
                ? 'SUCCESS'
                : demo.paymentRecordStatus === 'rembourse'
                  ? 'REFUNDED'
                  : demo.paymentRecordStatus.toUpperCase(),
            paidAt: isPaid ? createdAt : null,
            expiresAt: new Date(createdAt.getTime() + dayMs),
            reconciledAt: demo.paymentRecordStatus === 'reussi' ? createdAt : null,
            metadata: { seed: true, orderNumber: order.orderNumber },
            createdAt,
            updatedAt: lastStatusAt,
          },
        },
        {
          upsert: true,
          returnDocument: 'after',
          runValidators: true,
          setDefaultsOnInsert: true,
          timestamps: false,
        },
      );

      if (!payment) {
        throw new Error(`Impossible de créer le paiement de #FK-${demo.sequence}`);
      }

      await PaymentModel.collection.updateOne(
        { _id: payment._id },
        { $set: { createdAt, updatedAt: lastStatusAt } },
      );

      await OrderModel.updateOne(
        { _id: order._id },
        { $set: { 'payment.payment': payment._id, updatedAt: lastStatusAt } },
        { timestamps: false },
      );
    }
  }
}

async function main(): Promise<void> {
  await connectDatabase();
  logger.info('Seed FINIKO v2 en cours');

  const users: Partial<Record<UserRole, UserDocument>> = {};

  for (const demo of DEMO_USERS) {
    const user = await ensureUser(demo);
    users[demo.role] = user;

    if (demo.role === 'client') await ensureClientProfile(user);
    if (demo.role === 'livreur') await ensureDriverProfile(user);
    if (demo.role === 'pressing') await ensurePressingProfile(user);

    logger.info({ role: demo.role, email: demo.email, phone: demo.phone }, 'Compte prêt');
  }

  await seedCatalog();
  await seedPacks();

  const client = users.client;
  const driver = users.livreur;
  const pressing = users.pressing;

  if (client) {
    const subscription = await seedActiveSubscription(client);
    if (subscription) {
      await seedSubscriptionPayment(subscription, client);
    }
  }

  if (client && driver && pressing) {
    await seedOrders(client, driver, pressing);
  }

  logger.info(
    {
      catalog: DEMO_CATALOG.length,
      packs: DEMO_PACKS.length,
      orders: DEMO_ORDERS.length,
    },
    'Catalogue, packs, commandes et paiements prêts',
  );

  console.log('\n=== Identifiants de démonstration FINIKO v2 ===');
  for (const demo of DEMO_USERS) {
    console.log(
      `${demo.role.padEnd(8)}  ${demo.email.padEnd(20)}  ${demo.phone}  ${demo.password}`,
    );
  }
  console.log('===============================================\n');

  await disconnectDatabase();
}

main().catch(async (error: unknown) => {
  logger.fatal({ err: error }, 'Échec du seed');
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
