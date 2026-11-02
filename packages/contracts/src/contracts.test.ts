import { describe, expect, it } from 'vitest';
import {
  canTransitionOrder,
  loginSchema,
  phoneSchema,
  quoteRequestSchema,
  registerSchema,
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

describe('registerSchema', () => {
  it('accepte une inscription par telephone', () => {
    const result = registerSchema.safeParse({
      fullName: 'Awa Traore',
      phone: '+22370000002',
      password: 'Client@2026',
      acceptTerms: true,
    });

    expect(result.success).toBe(true);
  });

  it('refuse une inscription sans email ni telephone', () => {
    const result = registerSchema.safeParse({
      fullName: 'Awa Traore',
      password: 'Client@2026',
      acceptTerms: true,
    });

    expect(result.success).toBe(false);
  });

  it('refuse un mot de passe trop simple', () => {
    const result = registerSchema.safeParse({
      fullName: 'Awa Traore',
      phone: '+22370000002',
      password: 'motdepasse',
      acceptTerms: true,
    });

    expect(result.success).toBe(false);
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
