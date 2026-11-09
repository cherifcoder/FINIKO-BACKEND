import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import type { OrderStatus, PressingOrderSummary } from '@finiko/contracts';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { listPressingOrdersRequest } from '../../src/api/pressing';
import { formatDate, formatXOF } from '../../src/lib/format';
import { ORDER_PAYMENT_METHOD_LABELS, ORDER_PAYMENT_STATUS_LABELS } from '../../src/lib/labels';
import { roleHome } from '../../src/lib/role-home';
import { useAuthStore } from '../../src/stores/auth.store';
import { InlineMessage, SecondaryButton } from '../../src/ui/auth';
import {
  DashboardEmpty,
  DashboardShell,
  FilterChips,
  KpiCard,
  NoticeCard,
  SectionHeader,
  dashboardStyles,
  getInitials,
} from '../../src/ui/dashboard';
import { LoadingBlock, Pill } from '../../src/ui/screen';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

type PressingView = 'file' | 'historique';
type PressingFilter = 'all' | 'a_receptionner' | 'au_pressing' | 'en_traitement' | 'prets';
type PillTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';

const FILTERS = [
  { key: 'all', label: 'Tous' },
  { key: 'a_receptionner', label: 'À réceptionner' },
  { key: 'au_pressing', label: 'Au pressing' },
  { key: 'en_traitement', label: 'En traitement' },
  { key: 'prets', label: 'Prêts' },
];

const ACTIVE_STATUSES: readonly OrderStatus[] = [
  'deposee_au_pressing',
  'au_pressing',
  'en_traitement',
  'prete',
];

function statusTone(status: OrderStatus): PillTone {
  if (status === 'prete' || status === 'terminee' || status === 'livree') return 'success';
  if (status === 'litige' || status === 'annulee') return 'danger';
  if (status === 'deposee_au_pressing' || status === 'en_traitement') return 'warning';
  return 'brand';
}

function matchesFilter(order: PressingOrderSummary, filter: PressingFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'a_receptionner') return order.status === 'deposee_au_pressing';
  if (filter === 'au_pressing') return order.status === 'au_pressing';
  if (filter === 'en_traitement') return order.status === 'en_traitement';
  return order.status === 'prete';
}

function PressingOrderCard({ order }: { order: PressingOrderSummary }) {
  const progress = order.itemsCount > 0 ? order.completedItems / order.itemsCount : 0;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({
          pathname: '/(app)/pressing-commande',
          params: { id: order.id },
        })
      }
      style={({ pressed }) => [styles.orderCard, pressed && styles.pressed]}
    >
      <View style={styles.orderHeader}>
        <View style={styles.orderHeading}>
          <Text style={styles.orderNumber}>{order.orderNumber}</Text>
          <Text style={styles.date}>Mise à jour le {formatDate(order.lastStatusAt)}</Text>
        </View>
        <Pill label={order.statusLabel} tone={statusTone(order.status)} />
      </View>

      <View style={styles.clientRow}>
        <View style={styles.clientIcon}>
          <Ionicons color={colors.brand[700]} name="person-outline" size={16} />
        </View>
        <View style={styles.clientTextBlock}>
          <Text numberOfLines={1} style={styles.clientName}>
            {order.clientName}
          </Text>
          <Text style={styles.clientPhone}>{order.clientPhone}</Text>
        </View>
        <Text style={styles.amount}>{formatXOF(order.totalDue)}</Text>
      </View>

      <View style={styles.progressBlock}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>
            {order.completedItems}/{order.itemsCount} articles terminés
          </Text>
          <Text style={styles.progressPercent}>{Math.round(progress * 100)}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.max(progress * 100, 2)}%` }]} />
        </View>
        <View style={styles.countsRow}>
          <Text style={styles.countText}>À traiter : {order.pendingItems}</Text>
          <Text style={styles.countText}>En cours : {order.inProgressItems}</Text>
          <Text style={styles.countText}>Terminés : {order.completedItems}</Text>
        </View>
      </View>

      <View style={styles.orderFooter}>
        <Text numberOfLines={1} style={styles.address}>
          {order.pickupText} → {order.deliveryText}
        </Text>
        <View style={styles.paymentBlock}>
          <Text style={styles.paymentText}>
            {ORDER_PAYMENT_METHOD_LABELS[order.paymentMethod]} ·{' '}
            {ORDER_PAYMENT_STATUS_LABELS[order.paymentStatus]}
          </Text>
          <Ionicons color={colors.brand[700]} name="chevron-forward" size={17} />
        </View>
      </View>
    </Pressable>
  );
}

export default function PressingDashboardScreen() {
  const user = useAuthStore((state) => state.user);
  const [view, setView] = useState<PressingView>('file');
  const [filter, setFilter] = useState<PressingFilter>('all');

  const ordersQuery = useQuery({
    queryKey: ['pressing', 'orders'],
    queryFn: () => listPressingOrdersRequest(),
    enabled: user?.role === 'pressing',
    refetchInterval: 30000,
  });

  if (!user) return null;
  if (user.role !== 'pressing') return <Redirect href={roleHome(user.role)} />;

  const orders = ordersQuery.data ?? [];
  const activeOrders = orders.filter((order) => ACTIVE_STATUSES.includes(order.status));
  const toReceive = orders.filter((order) => order.status === 'deposee_au_pressing').length;
  const inTreatment = orders.filter(
    (order) => order.status === 'au_pressing' || order.status === 'en_traitement',
  ).length;
  const ready = orders.filter((order) => order.status === 'prete').length;
  const pendingArticles = activeOrders.reduce((total, order) => total + order.pendingItems, 0);

  const visibleOrders =
    view === 'historique'
      ? orders.filter((order) => !ACTIVE_STATUSES.includes(order.status))
      : activeOrders.filter((order) => matchesFilter(order, filter));

  return (
    <DashboardShell
      eyebrow="Espace pressing"
      initials={getInitials(user.fullName)}
      subtitle="Réception, traitement et remise du linge."
      tabs={[
        {
          key: 'file',
          label: 'File',
          icon: 'shirt-outline',
          active: view === 'file',
          onPress: () => setView('file'),
        },
        {
          key: 'history',
          label: 'Historique',
          icon: 'time-outline',
          active: view === 'historique',
          onPress: () => setView('historique'),
        },
        {
          key: 'account',
          label: 'Compte',
          icon: 'person-outline',
          active: false,
          onPress: () => router.push('/(app)/accueil'),
        },
      ]}
      title="Mon pressing"
      userName={user.fullName}
    >
      <View style={dashboardStyles.row}>
        <KpiCard
          icon="download-outline"
          label="À réceptionner"
          loading={ordersQuery.isLoading}
          tone="warning"
          value={String(toReceive)}
        />
        <KpiCard
          icon="water-outline"
          label="En traitement"
          loading={ordersQuery.isLoading}
          tone="brand"
          value={String(inTreatment)}
        />
      </View>

      <View style={dashboardStyles.row}>
        <KpiCard
          icon="checkmark-done-outline"
          label="Prêts"
          loading={ordersQuery.isLoading}
          tone="success"
          value={String(ready)}
        />
        <KpiCard
          hint={`${activeOrders.length} commande${activeOrders.length > 1 ? 's' : ''} active${activeOrders.length > 1 ? 's' : ''}`}
          icon="layers-outline"
          label="Articles à traiter"
          loading={ordersQuery.isLoading}
          tone="dark"
          value={String(pendingArticles)}
        />
      </View>

      {view === 'file' ? (
        <>
          <SectionHeader title="File de traitement" />
          <FilterChips
            onSelect={(key) => setFilter(key as PressingFilter)}
            options={FILTERS}
            selected={filter}
          />

          {ordersQuery.isLoading ? <LoadingBlock label="Chargement des commandes…" /> : null}

          {ordersQuery.isError ? (
            <View style={styles.errorCard}>
              <InlineMessage tone="error">
                Les commandes pressing n’ont pas pu être chargées. Vérifiez votre connexion.
              </InlineMessage>
              <SecondaryButton label="Réessayer" onPress={() => void ordersQuery.refetch()} />
            </View>
          ) : null}

          {!ordersQuery.isLoading && !ordersQuery.isError && visibleOrders.length === 0 ? (
            <DashboardEmpty
              icon="shirt-outline"
              message={
                activeOrders.length === 0
                  ? 'Les commandes déposées par les livreurs apparaîtront ici.'
                  : 'Aucune commande dans ce filtre. Essayez un autre statut.'
              }
              title="Aucune commande dans la file"
            />
          ) : null}

          {visibleOrders.map((order) => (
            <PressingOrderCard key={order.id} order={order} />
          ))}
        </>
      ) : (
        <>
          <SectionHeader title="Historique" />

          {ordersQuery.isLoading ? <LoadingBlock label="Chargement de l’historique…" /> : null}

          {!ordersQuery.isLoading && visibleOrders.length === 0 ? (
            <DashboardEmpty
              icon="time-outline"
              message="Les commandes remises au livreur et les commandes terminées apparaîtront ici."
              title="Aucune commande archivée"
            />
          ) : null}

          {visibleOrders.map((order) => (
            <PressingOrderCard key={order.id} order={order} />
          ))}
        </>
      )}

      <NoticeCard
        icon="shirt-outline"
        message="Ouvrez une commande pour réceptionner le linge, suivre chaque article et prévenir le livreur lorsqu’elle est prête."
        title="Traitement article par article"
      />

      <View style={styles.footer}>
        <Text style={styles.footerText}>FINIKO v2 · Espace pressing</Text>
      </View>
    </DashboardShell>
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
  orderCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  orderHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  orderHeading: {
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
  },
  clientRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  clientIcon: {
    alignItems: 'center',
    backgroundColor: colors.brand[50],
    borderRadius: radius.pill,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  clientTextBlock: {
    flex: 1,
    gap: 1,
  },
  clientName: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
  },
  clientPhone: {
    ...typography.caption,
    color: colors.textMuted,
  },
  amount: {
    ...typography.body,
    color: colors.brand[700],
    fontWeight: '700',
  },
  progressBlock: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    gap: spacing.sm,
    padding: spacing.md,
  },
  progressHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressLabel: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '700',
  },
  progressPercent: {
    ...typography.caption,
    color: colors.brand[700],
    fontWeight: '700',
  },
  progressTrack: {
    backgroundColor: colors.neutral[200],
    borderRadius: radius.pill,
    height: 7,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: colors.brand[600],
    borderRadius: radius.pill,
    height: '100%',
  },
  countsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  countText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
  },
  orderFooter: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  address: {
    ...typography.caption,
    color: colors.textMuted,
  },
  paymentBlock: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  paymentText: {
    ...typography.caption,
    color: colors.textMuted,
    flex: 1,
  },
  footer: {
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  footerText: {
    ...typography.caption,
    color: colors.neutral[400],
  },
  pressed: {
    opacity: 0.75,
  },
});
