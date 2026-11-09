import type {
  CancelOrderInput,
  ClientOrderCancelResponse,
  ClientOrderDetail,
  ClientOrderListQuery,
  ClientOrderResponse,
  ClientOrdersResponse,
  ClientOrderSummary,
  CreateClientOrderResponse,
  CreateOrderInput,
  DisputeOrderInput,
  OrderQuote,
  QuoteRequestInput,
} from '@finiko/contracts';
import { apiFetch } from './client';

export async function quoteOrderRequest(input: QuoteRequestInput): Promise<OrderQuote> {
  return apiFetch<OrderQuote>('/orders/quote', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function createOrderRequest(
  input: CreateOrderInput,
): Promise<CreateClientOrderResponse> {
  return apiFetch<CreateClientOrderResponse>('/orders', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function listMyOrdersRequest(
  query: Partial<Pick<ClientOrderListQuery, 'status' | 'q'>> = {},
): Promise<ClientOrderSummary[]> {
  const params = new URLSearchParams({ limit: '100' });

  if (query.status) params.set('status', query.status);
  if (query.q) params.set('q', query.q);

  const data = await apiFetch<ClientOrdersResponse>(`/orders?${params.toString()}`);
  return data.orders;
}

export async function getMyOrderRequest(id: string): Promise<ClientOrderDetail> {
  const data = await apiFetch<ClientOrderResponse>(`/orders/${encodeURIComponent(id)}`);
  return data.order;
}

export async function cancelMyOrderRequest(
  id: string,
  input: CancelOrderInput,
): Promise<ClientOrderCancelResponse> {
  return apiFetch<ClientOrderCancelResponse>(`/orders/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function confirmMyOrderDeliveryRequest(id: string): Promise<ClientOrderDetail> {
  const data = await apiFetch<ClientOrderResponse>(`/orders/${encodeURIComponent(id)}/confirm`, {
    method: 'POST',
  });
  return data.order;
}

export async function disputeMyOrderRequest(
  id: string,
  input: DisputeOrderInput,
): Promise<ClientOrderDetail> {
  const data = await apiFetch<ClientOrderResponse>(`/orders/${encodeURIComponent(id)}/dispute`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.order;
}
