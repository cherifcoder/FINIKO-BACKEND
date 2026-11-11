import { useQuery } from '@tanstack/react-query';
import type { OrderStatus } from '@finiko/contracts';
import { Redirect, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { listMyOrdersRequest } from '../../src/api/orders';
import { getMySubscriptionsRequest } from '../../src/api/packs';
import { formatDate, formatXOF } from '../../src/lib/format';
import { roleHome } from '../../src/lib/role-home';
import { useAuthStore } from '../../src/stores/auth.store';
import { SecondaryButton } from '../../src/ui/auth';
import {
  DashboardShell,
  NoticeCard,
  PromoCard,
  SectionHeader,
  ServiceCard,
  StatTile,
  dashboardStyles,
  getInitials,
} from '../../src/ui/dashboard';
import { Pill, QuotaBar } from '../../src/ui/screen';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

type PillTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';

const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = [
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

function orderTone(status: OrderStatus): PillTone {
  if (status === 'annulee') return 'danger';
  if (status === 'litige') return 'warning';
  if (status === 'terminee' || status === 'livree') return 'success';
  if (status === 'en_attente_paiement') return 'warning';
  return 'brand';
}

export default function ClientDashboardScreen() {
  const user = useAuthStore((state) => state.user);

  const subscriptionsQuery = useQuery({
    queryKey: ['subscriptions', 'me'],
    queryFn: getMySubscriptionsRequest,
  });
  const ordersQuery = useQuery({
    queryKey: ['orders', 'me'],
    queryFn: () => listMyOrdersRequest(),
    refetchInterval: 10000,
  });

  if (!user) return null;
  if (user.role !== 'client') return <Redirect href={roleHome(user.role)} />;

  const active = subscriptionsQuery.data?.active ?? null;
  const pending = subscriptionsQuery.data?.pending ?? null;
  const orders = ordersQuery.data ?? [];
  const latestOrder = orders[0] ?? null;
  const activeOrders = orders.filter((order) =>
    ACTIVE_ORDER_STATUSES.includes(order.status),
  ).length;

  return (
    <DashboardShell
      eyebrow="Espace client"
      initials={getInitials(user.fullName)}
      subtitle="Votre linge, lavé et livré sans effort."
      tabs={[
        {
          key: 'home',
          label: 'Accueil',
          icon: 'home-outline',
          active: true,
          onPress: () => undefined,
        },
        {
          key: 'packs',
          label: 'Packs',
          icon: 'pricetags-outline',
          active: false,
          onPress: () => router.push('/(app)/packs'),
        },
        {
          key: 'catalog',
          label: 'Catalogue',
          icon: 'shirt-outline',
          active: false,
          onPress: () => router.push('/(app)/catalogue'),
        },
        {
          key: 'orders',
          label: 'Commandes',
          icon: 'receipt-outline',
          active: false,
          onPress: () => router.push('/(app)/commandes'),
        },
        {
          key: 'account',
          label: 'Compte',
          icon: 'person-outline',
          active: false,
          onPress: () => router.push('/(app)/accueil'),
        },
      ]}
      title={`Bonjour ${user.firstName}`}
      userName={user.fullName}
    >
      <PromoCard
        cta="Commander maintenant"
        eyebrow="Lavage & pressing"
        icon="bag-handle-outline"
        message="Composez votre panier, choisissez le ramassage et suivez chaque étape jusqu’à la livraison."
        onPress={() => router.push('/(app)/commande')}
        title="Votre linge, pris en charge"
      />

      <View style={dashboardStyles.row}>
        <StatTile
          icon="layers-outline"
          label="Quota disponible"
          loading={subscriptionsQuery.isLoading}
          tone="brand"
          value={active ? `${active.quotaAvailable} unités` : '—'}
        />
        <StatTile
          icon="receipt-outline"
          label="Commandes en cours"
          loading={ordersQuery.isLoading}
          tone="success"
          value={String(activeOrders)}
        />
      </View>

      <SectionHeader title="Mon abonnement" />

      {active ? (
        <View style={styles.packCard}>
          <View style={styles.packHeader}>
            <View style={styles.packHeading}>
              <Text style={styles.packEyebrow}>Pack actif</Text>
              <Text style={styles.packName}>{active.pack.name}</Text>
              <Text style={styles.packMeta}>
                {formatXOF(active.pack.priceXOF)} · fin le {formatDate(active.endDate)}
              </Text>
            </View>
            <View style={styles.packBadge}>
              <Text style={styles.packBadgeText}>Actif</Text>
            </View>
          </View>

          <QuotaBar
            reserved={active.quotaReserved}
            total={active.quotaTotal}
            used={active.quotaUsed}
          />

          <SecondaryButton
            label="Gérer mon abonnement"
            onPress={() => router.push('/(app)/abonnement')}
          />
        </View>
      ) : (
        <View style={styles.packCard}>
          <Text style={styles.packEyebrow}>Packs & abonnements</Text>
          <Text style={styles.packName}>Un quota mensuel pour votre linge</Text>
          <Text style={styles.packMeta}>
            Choisissez un pack adapté à votre foyer et suivez chaque unité utilisée.
          </Text>
          <SecondaryButton
            label="Découvrir les packs"
            onPress={() => router.push('/(app)/packs')}
          />
        </View>
      )}

      {pending ? (
        <NoticeCard
          icon="time-outline"
          message={`${pending.pack.name} sera activé dès la confirmation du paiement.`}
          title="Souscription en attente"
        />
      ) : null}

      <SectionHeader
        right={
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/(app)/commandes')}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Text style={styles.sectionLink}>Tout voir</Text>
          </Pressable>
        }
        title="Dernière commande"
      />

      {latestOrder ? (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({ pathname: '/(app)/commande-detail', params: { id: latestOrder.id } })
          }
          style={({ pressed }) => [styles.orderCard, pressed && styles.pressed]}
        >
          <View style={styles.orderHeader}>
            <View style={styles.orderHeading}>
              <Text style={styles.orderNumber}>{latestOrder.orderNumber}</Text>
              <Text style={styles.orderDate}>{formatDate(latestOrder.createdAt)}</Text>
            </View>
            <Pill label={latestOrder.statusLabel} tone={orderTone(latestOrder.status)} />
          </View>

          <Text numberOfLines={2} style={styles.orderAddress}>
            Ramassage : {latestOrder.pickupText}
          </Text>

          <View style={styles.orderFooter}>
            <Text style={styles.orderMeta}>
              {latestOrder.itemsCount} article{latestOrder.itemsCount > 1 ? 's' : ''} ·{' '}
              {formatXOF(latestOrder.totalDue)}
            </Text>
            <Text style={styles.orderLink}>Suivre →</Text>
          </View>
        </Pressable>
      ) : (
        <View style={styles.emptyOrderCard}>
          <Text style={styles.emptyOrderTitle}>Aucune commande pour le moment</Text>
          <Text style={styles.emptyOrderText}>
            Composez votre première commande : ramassage, lavage, repassage et livraison.
          </Text>
          <SecondaryButton
            label="Passer une commande"
            onPress={() => router.push('/(app)/commande')}
          />
        </View>
      )}

      <SectionHeader title="Mes services" />
      <View style={dashboardStyles.grid}>
        <ServiceCard
          icon="bag-handle-outline"
          onPress={() => router.push('/(app)/commande')}
          title="Commander"
          tone="brand"
        />
        <ServiceCard
          icon="receipt-outline"
          onPress={() => router.push('/(app)/commandes')}
          title="Mes commandes"
          tone="purple"
        />
        <ServiceCard
          icon="pricetags-outline"
          onPress={() => router.push('/(app)/packs')}
          title="Packs & tarifs"
          tone="success"
        />
        <ServiceCard
          icon="shirt-outline"
          onPress={() => router.push('/(app)/catalogue')}
          title="Catalogue"
          tone="orange"
        />
        <ServiceCard
          icon="card-outline"
          onPress={() => router.push('/(app)/abonnement')}
          title="Mon abonnement"
          tone="cyan"
        />
        <ServiceCard
          icon="notifications-outline"
          onPress={() => router.push('/(app)/notifications')}
          title="Notifications"
          tone="warning"
        />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>FINIKO v2 · Espace client</Text>
      </View>
    </DashboardShell>
  );
}

const styles = StyleSheet.create({
  packCard: {
    backgroundColor: colors.brand[50],
    borderColor: colors.brand[100],
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  packHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  packHeading: {
    flex: 1,
    gap: 2,
  },
  packEyebrow: {
    ...typography.caption,
    color: colors.brand[700],
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  packName: {
    ...typography.title,
    color: colors.brand[900],
    fontSize: 20,
    lineHeight: 26,
  },
  packMeta: {
    ...typography.caption,
    color: colors.brand[700],
    fontSize: 12,
    lineHeight: 17,
  },
  packBadge: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
  },
  packBadgeText: {
    ...typography.caption,
    color: colors.success,
    fontSize: 11,
    fontWeight: '700',
  },
  sectionLink: {
    ...typography.caption,
    color: colors.brand[700],
    fontWeight: '700',
  },
  orderCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
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
  orderDate: {
    ...typography.caption,
    color: colors.textMuted,
  },
  orderAddress: {
    ...typography.caption,
    color: colors.textMuted,
    lineHeight: 18,
  },
  orderFooter: {
    alignItems: 'center',
    borderColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
  },
  orderMeta: {
    ...typography.caption,
    color: colors.textMuted,
  },
  orderLink: {
    ...typography.caption,
    color: colors.brand[700],
    fontWeight: '700',
  },
  emptyOrderCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  emptyOrderTitle: {
    ...typography.title,
    color: colors.text,
    fontSize: 17,
    lineHeight: 22,
  },
  emptyOrderText: {
    ...typography.caption,
    color: colors.textMuted,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.8,
  },
  footer: {
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  footerText: {
    ...typography.caption,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: colors.textMuted,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
});
