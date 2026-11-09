import type {
  AdminCreateUserInput,
  AdminFinanceSummary,
  AdminOrdersResponse,
  AdminOrderSummary,
  AdminUpdateUserInput,
  AdminUserDetail,
  CatalogItem,
  CatalogItemInput,
  CatalogItemUpdateInput,
  CatalogItemsResponse,
  Pack,
  PackInput,
  PackUpdateInput,
  PacksResponse,
  PublicUser,
  Subscription,
  SubscriptionsResponse,
  UserStatus,
} from '@finiko/contracts';
import { apiFetch } from './client';

/** Liste des comptes, réservée aux administrateurs. */
export async function listAdminUsersRequest(): Promise<PublicUser[]> {
  const data = await apiFetch<{ users: PublicUser[] }>('/admin/users?limit=100');
  return data.users;
}

/** Packs actifs et inactifs pour le pilotage administrateur. */
export async function listAdminPacksRequest(): Promise<Pack[]> {
  const data = await apiFetch<PacksResponse>('/packs?includeInactive=true&limit=100');
  return data.packs;
}

/** Articles actifs et inactifs pour le pilotage administrateur. */
export async function listAdminCatalogRequest(): Promise<CatalogItem[]> {
  const data = await apiFetch<CatalogItemsResponse>(
    '/catalog/items?includeInactive=true&limit=100',
  );
  return data.items;
}

/** Tous les abonnements, tous clients confondus. */
export async function listAdminSubscriptionsRequest(): Promise<Subscription[]> {
  const data = await apiFetch<SubscriptionsResponse>('/subscriptions?limit=100');
  return data.subscriptions;
}

/** Toutes les commandes de la plateforme. */
export async function listAdminOrdersRequest(): Promise<AdminOrderSummary[]> {
  const data = await apiFetch<AdminOrdersResponse>('/admin/orders?limit=100');
  return data.orders;
}

/** Synthèse financière sur une fenêtre glissante de `days` jours. */
export async function getAdminFinanceSummaryRequest(days = 30): Promise<AdminFinanceSummary> {
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  return apiFetch<AdminFinanceSummary>(`/admin/finances?from=${encodeURIComponent(from)}`);
}

/** Fiche complète d'un compte, avec son profil livreur ou pressing. */
export async function getAdminUserRequest(id: string): Promise<AdminUserDetail> {
  const data = await apiFetch<{ user: AdminUserDetail }>(`/admin/users/${id}`);
  return data.user;
}

export async function createAdminUserRequest(input: AdminCreateUserInput): Promise<PublicUser> {
  const data = await apiFetch<{ user: PublicUser }>('/admin/users', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.user;
}

export async function updateAdminUserRequest(
  id: string,
  input: AdminUpdateUserInput,
): Promise<AdminUserDetail> {
  const data = await apiFetch<{ user: AdminUserDetail }>(`/admin/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return data.user;
}

export async function deleteAdminUserRequest(id: string): Promise<PublicUser> {
  const data = await apiFetch<{ user: PublicUser }>(`/admin/users/${id}`, {
    method: 'DELETE',
  });
  return data.user;
}

export async function updateAdminUserStatusRequest(
  id: string,
  status: Extract<UserStatus, 'actif' | 'suspendu'>,
): Promise<PublicUser> {
  const data = await apiFetch<{ user: PublicUser }>(`/admin/users/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  return data.user;
}

export async function getAdminCatalogItemRequest(id: string): Promise<CatalogItem> {
  const data = await apiFetch<{ item: CatalogItem }>(`/catalog/items/${id}`);
  return data.item;
}

export async function createAdminCatalogItemRequest(input: CatalogItemInput): Promise<CatalogItem> {
  const data = await apiFetch<{ item: CatalogItem }>('/catalog/items', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.item;
}

export async function updateAdminCatalogItemRequest(
  id: string,
  input: CatalogItemUpdateInput,
): Promise<CatalogItem> {
  const data = await apiFetch<{ item: CatalogItem }>(`/catalog/items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return data.item;
}

export async function deleteAdminCatalogItemRequest(id: string): Promise<CatalogItem> {
  const data = await apiFetch<{ item: CatalogItem }>(`/catalog/items/${id}`, {
    method: 'DELETE',
  });
  return data.item;
}

export async function setAdminCatalogItemStatusRequest(
  id: string,
  isActive: boolean,
): Promise<CatalogItem> {
  const data = await apiFetch<{ item: CatalogItem }>(`/catalog/items/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  });
  return data.item;
}

export async function getAdminPackRequest(id: string): Promise<Pack> {
  const data = await apiFetch<{ pack: Pack }>(`/packs/${id}`);
  return data.pack;
}

export async function createAdminPackRequest(input: PackInput): Promise<Pack> {
  const data = await apiFetch<{ pack: Pack }>('/packs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.pack;
}

export async function updateAdminPackRequest(id: string, input: PackUpdateInput): Promise<Pack> {
  const data = await apiFetch<{ pack: Pack }>(`/packs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return data.pack;
}

export async function deleteAdminPackRequest(id: string): Promise<Pack> {
  const data = await apiFetch<{ pack: Pack }>(`/packs/${id}`, {
    method: 'DELETE',
  });
  return data.pack;
}

export async function setAdminPackStatusRequest(id: string, isActive: boolean): Promise<Pack> {
  const data = await apiFetch<{ pack: Pack }>(`/packs/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  });
  return data.pack;
}
