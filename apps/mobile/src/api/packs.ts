import type {
  Pack,
  PacksResponse,
  Subscription,
  SubscriptionOverview,
  SubscriptionUsage,
  SubscriptionUsagesResponse,
} from '@finiko/contracts';
import { apiFetch } from './client';

export async function listPacksRequest(): Promise<Pack[]> {
  const data = await apiFetch<PacksResponse>('/packs', { auth: false });
  return data.packs;
}

export async function getPackRequest(id: string): Promise<Pack> {
  const data = await apiFetch<{ pack: Pack }>(`/packs/${id}`, { auth: false });
  return data.pack;
}

export async function getMySubscriptionsRequest(): Promise<SubscriptionOverview> {
  return apiFetch<SubscriptionOverview>('/subscriptions/me');
}

export async function createSubscriptionRequest(packId: string): Promise<Subscription> {
  const data = await apiFetch<{ subscription: Subscription }>('/subscriptions', {
    method: 'POST',
    body: JSON.stringify({ packId, paymentMethod: 'orange_money' }),
  });

  return data.subscription;
}

export async function cancelSubscriptionRequest(
  subscriptionId: string,
  reason: string,
): Promise<{ subscription: Subscription; renewalCancelled: boolean }> {
  return apiFetch<{ subscription: Subscription; renewalCancelled: boolean }>(
    `/subscriptions/${subscriptionId}/cancel`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    },
  );
}

export async function listMyUsagesRequest(
  subscriptionId?: string,
  limit = 40,
): Promise<SubscriptionUsage[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (subscriptionId) params.set('subscriptionId', subscriptionId);

  const data = await apiFetch<SubscriptionUsagesResponse>(
    `/subscriptions/me/usage?${params.toString()}`,
  );

  return data.usages;
}
