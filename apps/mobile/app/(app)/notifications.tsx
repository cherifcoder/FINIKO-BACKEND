import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import type { ComponentProps } from 'react';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { OrderStatus } from '@finiko/contracts';
import { listAdminOrdersRequest } from '../../src/api/admin';
import { listDriverOrdersRequest } from '../../src/api/driver';
import { listMyOrdersRequest } from '../../src/api/orders';
import { listPressingOrdersRequest } from '../../src/api/pressing';
import { formatDateTime } from '../../src/lib/format';
import {
  DRIVER_MISSION_PHASE_LABELS,
  ORDER_PAYMENT_METHOD_LABELS,
  ORDER_PAYMENT_STATUS_LABELS,
  ORDER_STATUS_LABELS,
} from '../../src/lib/labels';
import { useAuthStore } from '../../src/stores/auth.store';
import { InlineMessage, SecondaryButton } from '../../src/ui/auth';
import { FilterChips } from '../../src/ui/dashboard';
import { EmptyState, LoadingBlock, Pill, Screen } from '../../src/ui/screen';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

type FeedTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';
type FeedIcon = ComponentProps<typeof Ionicons>['name'];
type FeedFilter = 'all' | 'active' | 'done';

interface FeedItem {
  id: string;
  title: string;
  message: string;
  at: string;
  tone: FeedTone;
  icon: FeedIcon;
  status: OrderStatus;
  statusLabel: string;
  onPress: () => void;
}

const TONES: Record<FeedTone, { background: string; foreground: string }> = {
  brand: { background: colors.brand[50], foreground: colors.brand[700] },
  success: { background: colors.successSurface, foreground: colors.success },
  warning: { background: colors.warningSurface, foreground: colors.warning },
  danger: { background: colors.dangerSurface, foreground: colors.danger },
  neutral: { background: colors.background, foreground: colors.textMuted },
};

const FILTERS = [
  { key: 'all', label: 'Toutes' },
  { key: 'active', label: 'À suivre' },
  { key: 'done', label: 'Terminées' },
];

const DONE_STATUSES: readonly OrderStatus[] = ['terminee', 'annulee'];

function statusTone(status: OrderStatus): FeedTone {
  if (status === 'terminee' || status === 'livree') return 'success';
  if (status === 'annulee' || status === 'litige') return 'danger';
  if (
    status === 'en_attente_paiement' ||
    status === 'ramassage_assigne' ||
    status === 'ramassage_en_cours' ||
    status === 'en_traitement'
  ) {
    return 'warning';
  }
  return 'brand';
}

function FeedCard({ item }: { item: FeedItem }) {
  const palette = TONES[item.tone];

  return (
    <Pressable
      accessibilityRole="button"
      onPress={item.onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={[styles.icon, { backgroundColor: palette.background }]}>
        <Ionicons color={palette.foreground} name={item.icon} size={19} />
      </View>
      <View style={styles.cardText}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Pill label={item.statusLabel} tone={item.tone} />
        </View>
        <Text style={styles.cardMessage}>{item.message}</Text>
        <Text style={styles.cardDate}>{formatDateTime(item.at)}</Text>
      </View>
      <Ionicons color={colors.neutral[400]} name="chevron-forward" size={17} />
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const user = useAuthStore((state) => state.user);
  const [filter, setFilter] = useState<FeedFilter>('all');

  const feedQuery = useQuery({
    queryKey: ['notifications', user?.role],
    queryFn: async (): Promise<FeedItem[]> => {
      if (!user) return [];

      if (user.role === 'client') {
        const orders = await listMyOrdersRequest();

        return orders.map((order) => ({
          id: order.id,
          title: `Commande ${order.orderNumber}`,
          message: `${order.statusLabel} · ${order.itemsCount} article${order.itemsCount > 1 ? 's' : ''} · ${order.pickupText}`,
          at: order.lastStatusAt,
          tone: statusTone(order.status),
          icon: 'shirt-outline',
          status: order.status,
          statusLabel: order.statusLabel,
          onPress: () =>
            router.push({
              pathname: '/(app)/commande-detail',
              params: { id: order.id },
            }),
        }));
      }

      if (user.role === 'livreur') {
        const missions = await listDriverOrdersRequest();

        return missions.map((mission) => ({
          id: mission.id,
          title: `Mission ${mission.orderNumber}`,
          message: `${mission.statusLabel} · ${mission.clientName} · ${DRIVER_MISSION_PHASE_LABELS[mission.missionPhase]}`,
          at: mission.lastStatusAt,
          tone: statusTone(mission.status),
          icon: 'bicycle-outline',
          status: mission.status,
          statusLabel: mission.statusLabel,
          onPress: () =>
            router.push({
              pathname: '/(app)/livreur-mission',
              params: { id: mission.id },
            }),
        }));
      }

      if (user.role === 'pressing') {
        const orders = await listPressingOrdersRequest();

        return orders.map((order) => ({
          id: order.id,
          title: `Commande ${order.orderNumber}`,
          message: `${order.statusLabel} · ${order.clientName} · ${order.pendingItems} article${order.pendingItems > 1 ? 's' : ''} à traiter`,
          at: order.lastStatusAt,
          tone: statusTone(order.status),
          icon: 'shirt-outline',
          status: order.status,
          statusLabel: order.statusLabel,
          onPress: () =>
            router.push({
              pathname: '/(app)/pressing-commande',
              params: { id: order.id },
            }),
        }));
      }

      const orders = await listAdminOrdersRequest();

      return orders.map((order) => ({
        id: order.id,
        title: `Commande ${order.orderNumber}`,
        message: `${ORDER_STATUS_LABELS[order.status]} · ${order.client.fullName} · ${ORDER_PAYMENT_METHOD_LABELS[order.paymentMethod]} ${ORDER_PAYMENT_STATUS_LABELS[order.paymentStatus]}`,
        at: order.updatedAt,
        tone: statusTone(order.status),
        icon: 'receipt-outline',
        status: order.status,
        statusLabel: ORDER_STATUS_LABELS[order.status],
        onPress: () => router.push('/(app)/admin-commandes'),
      }));
    },
    enabled: Boolean(user),
    refetchInterval: 30000,
  });

  const items = useMemo(() => {
    const sorted = [...(feedQuery.data ?? [])].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );

    if (filter === 'active') {
      return sorted.filter((item) => !DONE_STATUSES.includes(item.status));
    }

    if (filter === 'done') {
      return sorted.filter((item) => DONE_STATUSES.includes(item.status));
    }

    return sorted;
  }, [feedQuery.data, filter]);

  return (
    <Screen
      onBack={() => router.back()}
      subtitle="Suivi des commandes et alertes de votre compte."
      title="Suivi & alertes"
    >
      <FilterChips
        onSelect={(key) => setFilter(key as FeedFilter)}
        options={FILTERS}
        selected={filter}
      />

      {feedQuery.isLoading ? <LoadingBlock label="Chargement des alertes…" /> : null}

      {feedQuery.isError ? (
        <View style={styles.errorCard}>
          <InlineMessage tone="error">
            Les alertes n’ont pas pu être chargées. Vérifiez votre connexion.
          </InlineMessage>
          <SecondaryButton label="Réessayer" onPress={() => void feedQuery.refetch()} />
        </View>
      ) : null}

      {!feedQuery.isLoading && !feedQuery.isError && items.length === 0 ? (
        <EmptyState
          message={
            filter === 'all'
              ? 'Les mises à jour de vos commandes et missions apparaîtront ici.'
              : 'Aucune alerte ne correspond à ce filtre.'
          }
          title="Aucune alerte pour le moment"
        />
      ) : null}

      {items.map((item) => (
        <FeedCard item={item} key={`${item.id}-${item.at}`} />
      ))}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Les alertes sont actualisées automatiquement toutes les 30 secondes.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  icon: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  cardText: {
    flex: 1,
    gap: 3,
  },
  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  cardTitle: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    fontWeight: '700',
  },
  cardMessage: {
    ...typography.caption,
    color: colors.textMuted,
  },
  cardDate: {
    ...typography.caption,
    color: colors.neutral[400],
    fontSize: 11,
  },
  errorCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  footer: {
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  footerText: {
    ...typography.caption,
    color: colors.neutral[400],
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.75,
  },
});
