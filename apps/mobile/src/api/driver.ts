import type {
  DriverOrderDetail,
  DriverOrderListQuery,
  DriverOrderResponse,
  DriverOrdersResponse,
  DriverOrderSummary,
  DriverTransitionInput,
} from '@finiko/contracts';
import { apiFetch } from './client';

export async function listDriverOrdersRequest(
  query: Partial<Pick<DriverOrderListQuery, 'status' | 'q'>> = {},
): Promise<DriverOrderSummary[]> {
  const params = new URLSearchParams({ limit: '100' });

  if (query.status) params.set('status', query.status);
  if (query.q) params.set('q', query.q);

  const data = await apiFetch<DriverOrdersResponse>(`/driver/orders?${params.toString()}`);
  return data.orders;
}

export async function getDriverOrderRequest(id: string): Promise<DriverOrderDetail> {
  const data = await apiFetch<DriverOrderResponse>(`/driver/orders/${encodeURIComponent(id)}`);
  return data.order;
}

export async function transitionDriverOrderRequest(
  id: string,
  input: DriverTransitionInput,
): Promise<DriverOrderDetail> {
  const data = await apiFetch<DriverOrderResponse>(
    `/driver/orders/${encodeURIComponent(id)}/transition`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
  return data.order;
}
