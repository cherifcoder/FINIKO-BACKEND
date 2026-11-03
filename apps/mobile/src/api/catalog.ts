import type { CatalogItem, CatalogItemsResponse, Category } from '@finiko/contracts';
import { apiFetch } from './client';

export async function listCatalogRequest(category?: Category): Promise<CatalogItem[]> {
  const query = category ? `?category=${encodeURIComponent(category)}` : '';
  const data = await apiFetch<CatalogItemsResponse>(`/catalog/items${query}`, { auth: false });
  return data.items;
}
