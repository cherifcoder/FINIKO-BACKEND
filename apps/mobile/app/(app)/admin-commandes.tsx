import { useQuery } from '@tanstack/react-query';
import type { AdminOrderSummary, OrderPaymentStatus, OrderStatus } from '@finiko/contracts';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { listAdminOrdersRequest } from '../../src/api/admin';
import { formatDate, formatXOF } from '../../src/lib/format';
import {
  ORDER_PAYMENT_METHOD_LABELS,
  ORDER_PAYMENT_STATUS_LABELS,
  ORDER_STATUS_LABELS,
} from '../../src/lib/labels';
import { roleHome } from '../../src/lib/role-home';
import { useAuthStore } from '../../src/stores/auth.store';
import { InlineMessage, SecondaryButton } from '../../src/ui/auth';
import { FilterChips, getInitials } from '../../src/ui/dashboard';
import { EmptyState, LoadingBlock, Pill, Screen } from '../../src/ui/screen';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

type OrderFilter = 'all' | 'active' | 'terminee' | 'annulee' | 'litige';
type PillTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';

const ORDER_FILTERS: Array<{ key: OrderFilter; label: string }> = [
  { key: 'all', label: 'Toutes' },
  { key: 'active', label: 'En cours' },
  { key: 'terminee', label: 'Terminées' },
  { key: 'annulee', label: 'Annulées' },
  { key: 'litige', label: 'Litiges' },
];

const CLOSED_STATUSES: OrderStatus[] = ['terminee', 'livree', 'annulee', 'litige'];

function matchesFilter(order: AdminOrderSummary, filter: OrderFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'active') return !CLOSED_STATUSES.includes(order.status);
  if (filter === 'terminee') return order.status === 'terminee' || order.status === 'livree';
  return order.status === filter;
}

function orderTone(status: OrderStatus): PillTone {
  if (status === 'terminee' || status === 'livree') return 'success';
  if (status === 'annulee') return 'danger';
  if (status === 'litige' || status === 'en_attente_paiement') return 'warning';
  return 'brand';
}

function paymentTone(status: OrderPaymentStatus): PillTone {
  if (status === 'paye') return 'success';
  if (status === 'echoue') return 'danger';
  if (status === 'rembourse' || status === 'a_collecter' || status === 'en_attente') {
    return 'warning';
  }
  return 'neutral';
}

export default function AdminOrdersScreen() {
  const [filter, setFilter] = useState<OrderFilter>('all');
  const user = useAuthStore((state) => state.user);
  const ordersQuery = useQuery({
    queryKey: ['admin', 'orders'],
    queryFn: listAdminOrdersRequest,
  });

  if (!user) return null;
  if (user.role !== 'admin') return <Redirect href={roleHome(user.role)} />;

  const orders = ordersQuery.data ?? [];
  const filtered = orders.filter((order) => matchesFilter(order, filter));
  const activeCount = orders.filter((order) => matchesFilter(order, 'active')).length;

  return (
    <Screen
      onBack={() => router.back()}
      subtitle="Suivi et paiements des commandes de la plateforme."
      title="Toutes les commandes"
    >
      <FilterChips
        onSelect={(key) => setFilter(key as OrderFilter)}
        options={ORDER_FILTERS}
        selected={filter}
      />

      {ordersQuery.isLoading ? <LoadingBlock label="Chargement des commandes…" /> : null}

      {ordersQuery.isError ? (
        <>
          <InlineMessage tone="error">
            Les commandes n'ont pas pu être chargées. Vérifiez votre connexion.
          </InlineMessage>
          <SecondaryButton label="Réessayer" onPress={() => void ordersQuery.refetch()} />
        </>
      ) : null}

      {ordersQuery.isSuccess ? (
        <Text style={styles.count}>
          {filtered.length} commande{filtered.length > 1 ? 's' : ''} affichée
          {filtered.length > 1 ? 's' : ''} · {activeCount} en cours
        </Text>
      ) : null}

      {ordersQuery.isSuccess && filtered.length === 0 ? (
        <EmptyState message="Aucune commande ne correspond à ce filtre." title="Aucune commande" />
      ) : null}

      {filtered.map((order) => (
        <View key={order.id} style={styles.card}>
          <View style={styles.topRow}>
            <View style={styles.identity}>
              <Text style={styles.orderNumber}>{order.orderNumber}</Text>
              <Text style={styles.date}>{formatDate(order.createdAt)}</Text>
            </View>
            <Pill label={ORDER_STATUS_LABELS[order.status]} tone={orderTone(order.status)} />
          </View>

          <View style={styles.clientRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getInitials(order.client.fullName)}</Text>
            </View>
            <View style={styles.clientInfo}>
              <Text style={styles.clientName}>{order.client.fullName}</Text>
              <Text style={styles.clientPhone}>{order.client.phone}</Text>
            </View>
            <Text style={styles.amount}>{formatXOF(order.totalDue)}</Text>
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.meta}>
              {order.itemsCount} article{order.itemsCount > 1 ? 's' : ''}
            </Text>
            <Text style={styles.meta}>{ORDER_PAYMENT_METHOD_LABELS[order.paymentMethod]}</Text>
            <Text style={styles.meta} numberOfLines={1}>
              {order.pressingName ?? order.driverCode ?? 'Non assigné'}
            </Text>
          </View>

          <View style={styles.locationRow}>
            <Text style={styles.locationLabel}>Ramassage</Text>
            <Text numberOfLines={1} style={styles.locationValue}>
              {order.pickupText}
            </Text>
          </View>

          <View style={styles.paymentRow}>
            <Pill
              label={`Paiement · ${ORDER_PAYMENT_STATUS_LABELS[order.paymentStatus]}`}
              tone={paymentTone(order.paymentStatus)}
            />
            <Text style={styles.paid}>
              {order.totalPaid > 0 ? `${formatXOF(order.totalPaid)} encaissés` : 'Non encaissé'}
            </Text>
          </View>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  count: {
    ...typography.caption,
    color: colors.textMuted,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  topRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  identity: {
    flex: 1,
    gap: 2,
  },
  orderNumber: {
    ...typography.title,
    color: colors.text,
    fontSize: 17,
    lineHeight: 22,
  },
  date: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  clientRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.brand[50],
    borderRadius: radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  avatarText: {
    ...typography.caption,
    color: colors.brand[700],
    fontWeight: '800',
  },
  clientInfo: {
    flex: 1,
    gap: 2,
  },
  clientName: {
    ...typography.body,
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  clientPhone: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  amount: {
    ...typography.title,
    color: colors.text,
    fontSize: 16,
    lineHeight: 21,
  },
  metaRow: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  meta: {
    ...typography.caption,
    color: colors.textMuted,
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 15,
  },
  locationRow: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    gap: 2,
    padding: spacing.sm,
  },
  locationLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    lineHeight: 14,
    textTransform: 'uppercase',
  },
  locationValue: {
    ...typography.caption,
    color: colors.text,
    fontSize: 12,
    lineHeight: 16,
  },
  paymentRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  paid: {
    ...typography.caption,
    color: colors.textMuted,
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'right',
  },
});
