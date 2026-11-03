/**
 * Normalise un numéro saisi par l'utilisateur vers E.164 (Mali par défaut).
 * Retourne null si le format n'est pas reconnu.
 */
export function normalizePhone(raw: string): string | null {
  const compact = raw.replace(/[\s.-]/g, '');

  if (/^\+[1-9]\d{7,14}$/.test(compact)) return compact;
  if (/^00[1-9]\d{7,14}$/.test(compact)) return `+${compact.slice(2)}`;
  if (/^\d{8}$/.test(compact)) return `+223${compact}`;
  if (/^223\d{8}$/.test(compact)) return `+${compact}`;

  return null;
}

export function isEmailIdentifier(identifier: string): boolean {
  return identifier.includes('@');
}

/** Identifiant de connexion : email minuscule ou téléphone E.164. */
export function normalizeIdentifier(raw: string): string {
  const trimmed = raw.trim();

  if (isEmailIdentifier(trimmed)) {
    return trimmed.toLowerCase();
  }

  return normalizePhone(trimmed) ?? trimmed;
}
