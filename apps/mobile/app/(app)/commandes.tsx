import { useQuery } from '@tanstack/react-query';
import type { ClientOrderSummary, OrderStatus } from '@finiko/contracts';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { listMyOrdersRequest } from '../../src/api/orders';
import { formatDate, formatXOF } from '../../src/lib/format';
import { ORDER_PAYMENT_METHOD_LABELS } from '../../src/lib/labels';
import { roleHome } from '../../src/lib/role-home';
import { useAuthStore } from '../../src/stores/auth.store';
import { InlineMessage, PrimaryButton, SecondaryButton } from '../../src/ui/auth';
import { FilterChips } from '../../src/ui/dashboard';
import { EmptyState, LoadingBlock, Pill, Screen } from '../../src/ui/screen';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

type OrderFilter = 'all' | 'active' | 'terminee' | 'annulee' | 'litige';
type PillTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';

const ACTIVE_STATUSES: readonly OrderStatus[] = [
  'en_attente_paiement',
  'confirmee',
  'ramassage_assigne',
  'ramassage_en_cours',
  'ramassee',
  'deposee_au_pressing',
  'au_pressing',
  'en_traitement',
  'prete',
  'livraison_assignee',
  'livraison_en_cours',
];

const PROGRESS_BY_STATUS: Partial<Record<OrderStatus, number>> = {
  en_attente_paiement: 0,
  confirmee: 1,
  ramassage_assigne: 2,
  ramassage_en_cours: 2,
  ramassee: 3,
  deposee_au_pressing: 4,
  au_pressing: 4,
  en_traitement: 5,
  prete: 6,
  livraison_assignee: 7,
  livraison_en_cours: 7,
  livree: 8,
  terminee: 8,
};

function statusTone(status: OrderStatus): PillTone {
  if (status === 'annulee') return 'danger';
  if (status === 'litige') return 'warning';
  if (status === 'terminee' || status === 'livree') return 'success';
  if (status === 'en_attente_paiement') return 'warning';
  return 'brand';
}

function matchesFilter(order: ClientOrderSummary, filter: OrderFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'active') return ACTIVE_STATUSES.includes(order.status);
  if (filter === 'terminee') return order.status === 'terminee' || order.status === 'livree';
  return order.status === filter;
}

export default function CommandesScreen() {
  const user = useAuthStore((state) => state.user);
  const [filter, setFilter] = useState<OrderFilter>('all');

  const ordersQuery = useQuery({
    queryKey: ['orders', 'me'],
    queryFn: () => listMyOrdersRequest(),
    refetchInterval: 10000,
  });

  if (!user) return null;
  if (user.role !== 'client') return <Redirect href={roleHome(user.role)} />;

  const orders = ordersQuery.data ?? [];
  const filtered = orders.filter((order) => matchesFilter(order, filter));

  return (
    <Screen
      title="Mes commandes"
      subtitle="Suivez l’état de votre linge et retrouvez votre historique."
      onBack={() => router.back()}
    >
      <PrimaryButton
        label="Passer une nouvelle commande"
        onPress={() => router.push('/(app)/commande')}
      />

      <FilterChips
        onSelect={(key) => setFilter(key as OrderFilter)}
        options={[
          { key: 'all', label: 'Toutes' },
          { key: 'active', label: 'En cours' },
          { key: 'terminee', label: 'Livrées' },
          { key: 'annulee', label: 'Annulées' },
          { key: 'litige', label: 'Litiges' },
        ]}
        selected={filter}
      />

      {ordersQuery.isLoading ? <LoadingBlock label="Chargement de vos commandes…" /> : null}

      {ordersQuery.isError ? (
        <View style={styles.errorCard}>
          <InlineMessage tone="error">
            Vos commandes n’ont pas pu être chargées. Vérifiez votre connexion.
          </InlineMessage>
          <SecondaryButton label="Réessayer" onPress={() => void ordersQuery.refetch()} />
        </View>
      ) : null}

      {!ordersQuery.isLoading && !ordersQuery.isError && filtered.length === 0 ? (
        <EmptyState
          title={orders.length === 0 ? 'Aucune commande' : 'Aucune commande dans ce filtre'}
          message={
            orders.length === 0
              ? 'Composez votre première commande : nous ramassons, lavons et livrons votre linge.'
              : 'Essayez un autre filtre pour retrouver votre commande.'
          }
          action={
            orders.length === 0 ? (
              <PrimaryButton
                label="Commander maintenant"
                onPress={() => router.push('/(app)/commande')}
              />
            ) : undefined
          }
        />
      ) : null}

      {filtered.map((order) => {
        const progress = PROGRESS_BY_STATUS[order.status] ?? 0;

        return (
          <Pressable
            accessibilityRole="button"
            key={order.id}
            onPress={() =>
              router.push({ pathname: '/(app)/commande-detail', params: { id: order.id } })
            }
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <View style={styles.cardHeader}>
              <View style={styles.cardHeading}>
                <Text style={styles.orderNumber}>{order.orderNumber}</Text>
                <Text style={styles.date}>{formatDate(order.createdAt)}</Text>
              </View>
              <Pill label={order.statusLabel} tone={statusTone(order.status)} />
            </View>

            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  order.status === 'annulee' && styles.progressCancelled,
                  { width: `${Math.min(100, (progress / 8) * 100)}%` },
                ]}
              />
            </View>

            <View style={styles.cardMeta}>
              <Text style={styles.metaText}>
                {order.itemsCount} article{order.itemsCount > 1 ? 's' : ''} ·{' '}
                {ORDER_PAYMENT_METHOD_LABELS[order.paymentMethod]}
              </Text>
              <Text style={styles.amount}>{formatXOF(order.totalDue)}</Text>
            </View>

            <Text numberOfLines={2} style={styles.address}>
              Ramassage : {order.pickupText}
            </Text>

            <View style={styles.cardFooter}>
              <Text style={styles.footerLink}>Voir le suivi</Text>
              <Text style={styles.footerArrow}>→</Text>
            </View>
          </Pressable>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  errorCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  cardHeading: {
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
  },
  progressTrack: {
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    height: 7,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: colors.brand[600],
    height: '100%',
  },
  progressCancelled: {
    backgroundColor: colors.danger,
  },
  cardMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  amount: {
    ...typography.body,
    color: colors.brand[700],
    fontWeight: '700',
  },
  address: {
    ...typography.caption,
    color: colors.textMuted,
    lineHeight: 18,
  },
  cardFooter: {
    alignItems: 'center',
    borderColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
  },
  footerLink: {
    ...typography.caption,
    color: colors.brand[700],
    fontWeight: '700',
  },
  footerArrow: {
    color: colors.brand[700],
    fontSize: 18,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.8,
  },
});
