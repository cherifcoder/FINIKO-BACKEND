import type { UserRole } from '@finiko/contracts';

/**
 * Table de redirection par rôle, alignée sur les espaces de FINIKO v1.
 * Les routes pointent vers les tableaux de bord dédiés du groupe authentifié.
 */
export function roleHome(role: UserRole): string {
  switch (role) {
    case 'admin':
      return '/(app)/admin';
    case 'livreur':
      return '/(app)/livreur';
    case 'pressing':
      return '/(app)/pressing';
    case 'client':
      return '/(app)/client';
  }
}
