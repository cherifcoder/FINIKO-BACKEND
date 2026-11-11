import { describe, expect, it } from 'vitest';
import {
  adminCreateUserSchema,
  canTransitionOrder,
  catalogItemInputSchema,
  catalogItemUpdateSchema,
  changePasswordSchema,
  loginSchema,
  packInputSchema,
  packUpdateSchema,
  phoneSchema,
  quoteRequestSchema,
  registerSchema,
  subscriptionAdjustQuotaSchema,
  subscriptionCreateSchema,
  updateProfileSchema,
} from './index';

const CATALOG_ITEM_ID = '507f1f77bcf86cd799439011';

describe('phoneSchema', () => {
  it('accepte un numero E.164 malien', () => {
    expect(phoneSchema.parse('+22370000002')).toBe('+22370000002');
  });

  it('refuse un numero local sans indicatif', () => {
    expect(phoneSchema.safeParse('70000002').success).toBe(false);
  });
});

const registerPayload = {
  firstName: 'Awa',
  lastName: 'Traore',
  phone: '+22370000002',
  password: 'Client@2026',
  acceptTerms: true as const,
};

describe('registerSchema', () => {
  it('accepte une inscription client avec telephone seul', () => {
    expect(registerSchema.safeParse(registerPayload).success).toBe(true);
  });

  it('refuse une inscription sans telephone', () => {
    const { phone: _phone, ...withoutPhone } = registerPayload;
    expect(registerSchema.safeParse(withoutPhone).success).toBe(false);
  });

  it('accepte un mot de passe simple (au moins 6 caracteres)', () => {
    expect(registerSchema.safeParse({ ...registerPayload, password: 'soleil' }).success).toBe(true);
  });

  it('refuse un mot de passe trop court', () => {
    expect(registerSchema.safeParse({ ...registerPayload, password: 'abc12' }).success).toBe(false);
  });
});

describe('updateProfileSchema', () => {
  it('accepte un email nul pour le supprimer', () => {
    expect(updateProfileSchema.safeParse({ email: null }).success).toBe(true);
  });

  it('refuse un objet vide', () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
  });
});

describe('changePasswordSchema', () => {
  it('refuse un nouveau mot de passe identique', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'Client@2026',
      newPassword: 'Client@2026',
    });

    expect(result.success).toBe(false);
  });
});

describe('adminCreateUserSchema', () => {
  it('exige le profil pressing pour un compte pressing', () => {
    const result = adminCreateUserSchema.safeParse({
      role: 'pressing',
      firstName: 'Moussa',
      lastName: 'Keita',
      phone: '+22370000003',
      password: 'Pressing@2026',
    });

    expect(result.success).toBe(false);
  });

  it('accepte un livreur sans profil detaille (defauts appliques par le service)', () => {
    const result = adminCreateUserSchema.safeParse({
      role: 'livreur',
      firstName: 'Moussa',
      lastName: 'Keita',
      phone: '+22370000003',
      password: 'Livreur@2026',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mustChangePassword).toBe(true);
      expect(result.data.driver).toBeUndefined();
    }
  });

  it('accepte un client sans profil metier', () => {
    const result = adminCreateUserSchema.safeParse({
      role: 'client',
      firstName: 'Awa',
      lastName: 'Traore',
      phone: '+22370000004',
      password: 'Client@2026',
    });

    expect(result.success).toBe(true);
  });

  it('applique les valeurs par defaut du profil livreur fourni', () => {
    const result = adminCreateUserSchema.safeParse({
      role: 'livreur',
      firstName: 'Moussa',
      lastName: 'Keita',
      phone: '+22370000003',
      password: 'Livreur@2026',
      driver: {},
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.driver?.vehicleType).toBe('moto');
      expect(result.data.driver?.zoneCodes).toEqual([]);
    }
  });
});

describe('loginSchema', () => {
  it('accepte un email ou un telephone comme identifiant', () => {
    expect(loginSchema.safeParse({ identifier: 'client@finiko.ml', password: 'x' }).success).toBe(
      true,
    );
    expect(loginSchema.safeParse({ identifier: '+22370000002', password: 'x' }).success).toBe(true);
  });
});

describe('quoteRequestSchema', () => {
  const pickup = {
    text: 'Hamdallaye ACI 2000, rue 123',
    coordinates: { lat: 12.6392, lng: -8.0029 },
    contactName: 'Awa Traore',
    contactPhone: '+22370000002',
  };

  it('accepte un panier avec plusieurs prestations', () => {
    const result = quoteRequestSchema.safeParse({
      items: [
        { catalogItemId: CATALOG_ITEM_ID, treatment: 'lavage_repassage', quantity: 8 },
        { catalogItemId: CATALOG_ITEM_ID, treatment: 'repassage', quantity: 2 },
      ],
      pickup,
      delivery: pickup,
    });

    expect(result.success).toBe(true);
  });

  it('refuse un panier vide', () => {
    const result = quoteRequestSchema.safeParse({ items: [], pickup, delivery: pickup });
    expect(result.success).toBe(false);
  });
});

describe('contrats catalogue et packs', () => {
  const catalogPayload = {
    code: 'boubou',
    name: 'Boubou',
    category: 'femme',
    prices: { lavage: 1500, repassage: 1000, lavage_repassage: 2200 },
    quotaWeight: 2,
  };

  it('exige les trois prix du catalogue', () => {
    expect(catalogItemInputSchema.safeParse(catalogPayload).success).toBe(true);
    expect(
      catalogItemInputSchema.safeParse({
        ...catalogPayload,
        prices: { lavage: 1500, repassage: 1000 },
      }).success,
    ).toBe(false);
  });

  it('applique les valeurs par defaut et refuse un patch vide', () => {
    const parsed = catalogItemInputSchema.parse(catalogPayload);
    expect(parsed.availableTreatments).toEqual(['lavage', 'repassage', 'lavage_repassage']);
    expect(parsed.quotaWeight).toBe(2);
    expect(catalogItemUpdateSchema.safeParse({}).success).toBe(false);
  });

  it('ne réapplique aucun défaut lors d’un patch partiel', () => {
    expect(
      catalogItemUpdateSchema.parse({
        prices: { lavage: 2000, repassage: 1200, lavage_repassage: 2800 },
      }),
    ).toEqual({ prices: { lavage: 2000, repassage: 1200, lavage_repassage: 2800 } });

    expect(packUpdateSchema.parse({ priceXOF: 12_000 })).toEqual({ priceXOF: 12_000 });
  });

  it('refuse un poids de quota hors bornes', () => {
    expect(catalogItemInputSchema.safeParse({ ...catalogPayload, quotaWeight: 11 }).success).toBe(
      false,
    );
  });

  it('applique les defauts d’un pack', () => {
    const parsed = packInputSchema.parse({
      code: 'normal',
      name: 'Pack Normal',
      priceXOF: 10_000,
      quotaUnits: 10,
    });

    expect(parsed.billingPeriodDays).toBe(30);
    expect(parsed.deliveryIncluded).toBe(false);
    expect(parsed.includedTreatments).toHaveLength(3);
    expect(parsed.rollover).toEqual({ enabled: false, maxPercent: 0 });
  });

  it('valide la souscription et l’ajustement signe', () => {
    expect(subscriptionCreateSchema.parse({ packId: CATALOG_ITEM_ID }).paymentMethod).toBe(
      'orange_money',
    );
    expect(
      subscriptionAdjustQuotaSchema.safeParse({ units: -2, reason: 'Correction' }).success,
    ).toBe(true);
    expect(
      subscriptionAdjustQuotaSchema.safeParse({ units: 0, reason: 'Correction' }).success,
    ).toBe(false);
  });
});

describe('machine a etats', () => {
  it('autorise le chemin nominal', () => {
    expect(canTransitionOrder('confirmee', 'ramassage_assigne')).toBe(true);
    expect(canTransitionOrder('prete', 'livraison_assignee')).toBe(true);
  });

  it('refuse un saut de statut', () => {
    expect(canTransitionOrder('confirmee', 'livree')).toBe(false);
    expect(canTransitionOrder('terminee', 'annulee')).toBe(false);
  });
});
