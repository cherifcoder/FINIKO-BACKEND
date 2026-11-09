import type {
  PressingOrderDetail,
  PressingOrderListQuery,
  PressingOrderResponse,
  PressingOrdersResponse,
  PressingOrderSummary,
  PressingTransitionInput,
  PressingUpdateItemsInput,
} from '@finiko/contracts';
import { apiFetch } from './client';

export async function listPressingOrdersRequest(
  query: Partial<Pick<PressingOrderListQuery, 'status' | 'q'>> = {},
): Promise<PressingOrderSummary[]> {
  const params = new URLSearchParams({ limit: '100' });

  if (query.status) params.set('status', query.status);
  if (query.q) params.set('q', query.q);

  const data = await apiFetch<PressingOrdersResponse>(`/pressing/orders?${params.toString()}`);
  return data.orders;
}

export async function getPressingOrderRequest(id: string): Promise<PressingOrderDetail> {
  const data = await apiFetch<PressingOrderResponse>(`/pressing/orders/${encodeURIComponent(id)}`);
  return data.order;
}

export async function updatePressingItemsRequest(
  id: string,
  input: PressingUpdateItemsInput,
): Promise<PressingOrderDetail> {
  const data = await apiFetch<PressingOrderResponse>(
    `/pressing/orders/${encodeURIComponent(id)}/items`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
  return data.order;
}

export async function transitionPressingOrderRequest(
  id: string,
  input: PressingTransitionInput,
): Promise<PressingOrderDetail> {
  const data = await apiFetch<PressingOrderResponse>(
    `/pressing/orders/${encodeURIComponent(id)}/transition`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
  return data.order;
}
