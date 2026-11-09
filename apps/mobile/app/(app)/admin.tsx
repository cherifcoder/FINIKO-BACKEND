import { useQuery } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import {
  getAdminFinanceSummaryRequest,
  listAdminCatalogRequest,
  listAdminOrdersRequest,
  listAdminPacksRequest,
  listAdminSubscriptionsRequest,
  listAdminUsersRequest,
} from '../../src/api/admin';
import { formatXOF } from '../../src/lib/format';
import { roleHome } from '../../src/lib/role-home';
import { useAuthStore } from '../../src/stores/auth.store';
import {
  DashboardShell,
  KpiCard,
  MenuRow,
  NoticeCard,
  SectionHeader,
  StatTile,
  dashboardStyles,
  getInitials,
} from '../../src/ui/dashboard';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

export default function AdminDashboardScreen() {
  const user = useAuthStore((state) => state.user);

  const usersQuery = useQuery({ queryKey: ['admin', 'users'], queryFn: listAdminUsersRequest });
  const packsQuery = useQuery({ queryKey: ['admin', 'packs'], queryFn: listAdminPacksRequest });
  const catalogQuery = useQuery({
    queryKey: ['admin', 'catalog'],
    queryFn: listAdminCatalogRequest,
  });
  const subscriptionsQuery = useQuery({
    queryKey: ['admin', 'subscriptions'],
    queryFn: listAdminSubscriptionsRequest,
  });
  const ordersQuery = useQuery({ queryKey: ['admin', 'orders'], queryFn: listAdminOrdersRequest });
  const financeQuery = useQuery({
    queryKey: ['admin', 'finances', 30],
    queryFn: () => getAdminFinanceSummaryRequest(30),
  });

  if (!user) return null;
  if (user.role !== 'admin') return <Redirect href={roleHome(user.role)} />;

  const users = usersQuery.data ?? [];
  const packs = packsQuery.data ?? [];
  const items = catalogQuery.data ?? [];
  const subscriptions = subscriptionsQuery.data ?? [];
  const orders = ordersQuery.data ?? [];
  const finance = financeQuery.data;

  const activePacks = packs.filter((pack) => pack.isActive).length;
  const activeItems = items.filter((item) => item.isActive).length;
  const activeSubscriptions = subscriptions.filter(
    (subscription) => subscription.status === 'active',
  ).length;
  const clientCount = users.filter((account) => account.role === 'client').length;
  const pendingSubscriptions = subscriptions.filter(
    (subscription) => subscription.status === 'en_attente_paiement',
  ).length;
  const activeOrders = orders.filter(
    (order) => order.status !== 'terminee' && order.status !== 'annulee',
  ).length;

  const loading =
    usersQuery.isLoading ||
    packsQuery.isLoading ||
    catalogQuery.isLoading ||
    subscriptionsQuery.isLoading ||
    ordersQuery.isLoading ||
    financeQuery.isLoading;
  const hasError =
    usersQuery.isError ||
    packsQuery.isError ||
    catalogQuery.isError ||
    subscriptionsQuery.isError ||
    ordersQuery.isError ||
    financeQuery.isError;

  return (
    <DashboardShell
      eyebrow="Administration"
      initials={getInitials(user.fullName)}
      subtitle="Vue d'ensemble de la plateforme FINIKO"
      tabs={[
        {
          key: 'dashboard',
          label: 'Dashboard',
          icon: 'grid-outline',
          active: true,
          onPress: () => undefined,
        },
        {
          key: 'users',
          label: 'Utilisateurs',
          icon: 'people-outline',
          active: false,
          onPress: () => router.push('/(app)/admin-utilisateurs'),
        },
        {
          key: 'catalog',
          label: 'Catalogue',
          icon: 'shirt-outline',
          active: false,
          onPress: () => router.push('/(app)/admin-catalogue'),
        },
        {
          key: 'account',
          label: 'Compte',
          icon: 'person-outline',
          active: false,
          onPress: () => router.push('/(app)/accueil'),
        },
      ]}
      title="Pilotage FINIKO"
      userName={user.fullName}
    >
      {hasError ? (
        <NoticeCard
          icon="alert-circle-outline"
          message="Certaines statistiques n'ont pas pu être chargées. Vérifiez la connexion à l'API."
          title="Données partielles"
        />
      ) : null}

      <View style={dashboardStyles.row}>
        <KpiCard
          hint={`${clientCount} client${clientCount > 1 ? 's' : ''}`}
          icon="people-outline"
          label="Utilisateurs"
          loading={loading}
          onPress={() => router.push('/(app)/admin-utilisateurs')}
          tone="brand"
          value={String(users.length)}
        />
        <KpiCard
          hint={`${pendingSubscriptions} en attente`}
          icon="card-outline"
          label="Abonnements actifs"
          loading={loading}
          tone="success"
          value={String(activeSubscriptions)}
        />
      </View>

      <View style={dashboardStyles.row}>
        <KpiCard
          icon="cube-outline"
          label="Packs actifs"
          loading={loading}
          onPress={() => router.push('/(app)/admin-packs')}
          tone="warning"
          value={String(activePacks)}
        />
        <KpiCard
          icon="shirt-outline"
          label="Articles actifs"
          loading={loading}
          onPress={() => router.push('/(app)/admin-catalogue')}
          tone="purple"
          value={String(activeItems)}
        />
      </View>

      <SectionHeader title="Vue d'ensemble" />
      <View style={dashboardStyles.row}>
        <StatTile
          icon="wallet-outline"
          label="Chiffre d'affaires"
          loading={loading}
          tone="success"
          value={finance ? formatXOF(finance.totals.collected) : '—'}
        />
        <StatTile
          icon="bag-handle-outline"
          label="Commandes actives"
          loading={loading}
          tone="orange"
          value={String(activeOrders)}
        />
      </View>

      <SectionHeader title="Gestion du système" />

      <MenuRow
        icon="cart-outline"
        onPress={() => router.push('/(app)/admin-commandes')}
        subtitle="Suivi et paiements de toutes les commandes"
        title="Toutes les commandes"
        tone="brand"
      />
      <MenuRow
        icon="shirt-outline"
        onPress={() => router.push('/(app)/admin-catalogue')}
        subtitle="Créer des articles et gérer les prix"
        title="Catalogue articles"
        tone="purple"
      />
      <MenuRow
        icon="cube-outline"
        onPress={() => router.push('/(app)/admin-packs')}
        subtitle="Créer et modifier les forfaits"
        title="Packs & forfaits"
        tone="warning"
      />
      <MenuRow
        icon="people-outline"
        onPress={() => router.push('/(app)/admin-utilisateurs')}
        subtitle="Clients, livreurs et administrateurs"
        title="Utilisateurs & livreurs"
        tone="success"
      />
      <MenuRow
        icon="business-outline"
        onPress={() => router.push('/(app)/admin-utilisateurs?role=pressing')}
        subtitle="Partenaires et comptes pressing"
        title="Suivi pressing"
        tone="purple"
      />
      <MenuRow
        icon="wallet-outline"
        onPress={() => router.push('/(app)/admin-finances')}
        subtitle="Encaissements, packs et réconciliation"
        title="Finances"
        tone="success"
      />

      <View style={styles.footer}>
        <Text style={styles.footerText}>FINIKO v2 · Administration</Text>
      </View>
    </DashboardShell>
  );
}

const styles = StyleSheet.create({
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
