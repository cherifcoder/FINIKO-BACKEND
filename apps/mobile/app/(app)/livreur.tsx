import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import type { DriverMissionPhase, DriverOrderSummary } from '@finiko/contracts';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { listDriverOrdersRequest } from '../../src/api/driver';
import { formatDate, formatXOF } from '../../src/lib/format';
import {
  DRIVER_MISSION_PHASE_LABELS,
  ORDER_PAYMENT_METHOD_LABELS,
  ORDER_PAYMENT_STATUS_LABELS,
} from '../../src/lib/labels';
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

type DriverView = 'missions' | 'historique';
type DriverFilter = 'all' | 'ramassage' | 'livraison' | 'terminee';
type PillTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';

const FILTERS = [
  { key: 'all', label: 'Toutes' },
  { key: 'ramassage', label: 'À ramasser' },
  { key: 'livraison', label: 'À livrer' },
  { key: 'terminee', label: 'Terminées' },
];

function phaseTone(phase: DriverMissionPhase): PillTone {
  if (phase === 'ramassage') return 'warning';
  if (phase === 'livraison') return 'brand';
  if (phase === 'terminee') return 'success';
  return 'neutral';
}

function matchesFilter(order: DriverOrderSummary, filter: DriverFilter): boolean {
  if (filter === 'all') return true;
  return order.missionPhase === filter;
}

function MissionCard({ order }: { order: DriverOrderSummary }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({
          pathname: '/(app)/livreur-mission',
          params: { id: order.id },
        })
      }
      style={({ pressed }) => [styles.missionCard, pressed && styles.pressed]}
    >
      <View style={styles.missionHeader}>
        <View style={styles.missionHeading}>
          <Text style={styles.orderNumber}>{order.orderNumber}</Text>
          <Text style={styles.date}>Mise à jour le {formatDate(order.lastStatusAt)}</Text>
        </View>
        <Pill
          label={DRIVER_MISSION_PHASE_LABELS[order.missionPhase]}
          tone={phaseTone(order.missionPhase)}
        />
      </View>

      <View style={styles.missionStatusRow}>
        <Text style={styles.statusLabel}>{order.statusLabel}</Text>
        <Text style={styles.amount}>{formatXOF(order.totalDue)}</Text>
      </View>

      <View style={styles.routeBlock}>
        <View style={styles.routeRow}>
          <View style={[styles.routeDot, styles.routeDotPickup]} />
          <Text numberOfLines={1} style={styles.routeText}>
            {order.pickupText}
          </Text>
        </View>
        <View style={styles.routeLine} />
        <View style={styles.routeRow}>
          <View style={[styles.routeDot, styles.routeDotDelivery]} />
          <Text numberOfLines={1} style={styles.routeText}>
            {order.deliveryText}
          </Text>
        </View>
      </View>

      <View style={styles.missionFooter}>
        <View style={styles.clientBlock}>
          <Ionicons color={colors.textMuted} name="person-outline" size={15} />
          <Text numberOfLines={1} style={styles.clientText}>
            {order.clientName} · {order.clientPhone}
          </Text>
        </View>
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

export default function DriverDashboardScreen() {
  const user = useAuthStore((state) => state.user);
  const [view, setView] = useState<DriverView>('missions');
  const [filter, setFilter] = useState<DriverFilter>('all');

  const missionsQuery = useQuery({
    queryKey: ['driver', 'orders'],
    queryFn: () => listDriverOrdersRequest(),
    enabled: user?.role === 'livreur',
    refetchInterval: 30000,
  });

  if (!user) return null;
  if (user.role !== 'livreur') return <Redirect href={roleHome(user.role)} />;

  const missions = missionsQuery.data ?? [];
  const pickupCount = missions.filter((mission) => mission.missionPhase === 'ramassage').length;
  const deliveryCount = missions.filter((mission) => mission.missionPhase === 'livraison').length;
  const completedCount = missions.filter((mission) => mission.missionPhase === 'terminee').length;
  const cashToCollect = missions
    .filter((mission) => mission.paymentStatus === 'a_collecter')
    .reduce((total, mission) => total + mission.totalDue, 0);

  const visibleMissions =
    view === 'historique'
      ? missions.filter((mission) => mission.missionPhase === 'terminee')
      : missions.filter((mission) => matchesFilter(mission, filter));

  return (
    <DashboardShell
      eyebrow="Espace livreur"
      initials={getInitials(user.fullName)}
      subtitle="Ramassages, livraisons et tournées du jour."
      tabs={[
        {
          key: 'missions',
          label: 'Missions',
          icon: 'bicycle-outline',
          active: view === 'missions',
          onPress: () => setView('missions'),
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
      title="Mes missions"
      userName={user.fullName}
    >
      <View style={dashboardStyles.row}>
        <KpiCard
          icon="bicycle-outline"
          label="Missions assignées"
          loading={missionsQuery.isLoading}
          tone="brand"
          value={String(missions.length)}
        />
        <KpiCard
          icon="cube-outline"
          label="Ramassages"
          loading={missionsQuery.isLoading}
          tone="warning"
          value={String(pickupCount)}
        />
      </View>

      <View style={dashboardStyles.row}>
        <KpiCard
          icon="checkmark-done-outline"
          label="Livraisons"
          loading={missionsQuery.isLoading}
          tone="success"
          value={String(deliveryCount)}
        />
        <KpiCard
          hint={`${completedCount} terminée${completedCount > 1 ? 's' : ''}`}
          icon="cash-outline"
          label="À encaisser"
          loading={missionsQuery.isLoading}
          tone="dark"
          value={formatXOF(cashToCollect)}
        />
      </View>

      {view === 'missions' ? (
        <>
          <SectionHeader title="File de missions" />
          <FilterChips
            onSelect={(key) => setFilter(key as DriverFilter)}
            options={FILTERS}
            selected={filter}
          />

          {missionsQuery.isLoading ? <LoadingBlock label="Chargement des missions…" /> : null}

          {missionsQuery.isError ? (
            <View style={styles.errorCard}>
              <InlineMessage tone="error">
                Les missions n’ont pas pu être chargées. Vérifiez votre connexion.
              </InlineMessage>
              <SecondaryButton label="Réessayer" onPress={() => void missionsQuery.refetch()} />
            </View>
          ) : null}

          {!missionsQuery.isLoading && !missionsQuery.isError && visibleMissions.length === 0 ? (
            <DashboardEmpty
              icon="bicycle-outline"
              message={
                missions.length === 0
                  ? 'Les missions de ramassage et de livraison qui vous sont assignées apparaîtront ici.'
                  : 'Aucune mission dans ce filtre. Essayez un autre statut.'
              }
              title="Aucune mission pour le moment"
            />
          ) : null}

          {visibleMissions.map((mission) => (
            <MissionCard key={mission.id} order={mission} />
          ))}
        </>
      ) : (
        <>
          <SectionHeader title="Historique" />

          {missionsQuery.isLoading ? <LoadingBlock label="Chargement de l’historique…" /> : null}

          {!missionsQuery.isLoading && visibleMissions.length === 0 ? (
            <DashboardEmpty
              icon="time-outline"
              message="Les missions terminées et les preuves de livraison apparaîtront ici."
              title="Aucune mission terminée"
            />
          ) : null}

          {visibleMissions.map((mission) => (
            <MissionCard key={mission.id} order={mission} />
          ))}
        </>
      )}

      <NoticeCard
        icon="navigate-outline"
        message="Touchez une mission pour voir les adresses sur la carte, appeler le client et ouvrir l’itinéraire dans Google Maps."
        title="Guidage GPS disponible"
      />

      <View style={styles.footer}>
        <Text style={styles.footerText}>FINIKO v2 · Espace livreur</Text>
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
  missionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  missionHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  missionHeading: {
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
  missionStatusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '700',
  },
  amount: {
    ...typography.body,
    color: colors.brand[700],
    fontWeight: '700',
  },
  routeBlock: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  routeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  routeDot: {
    borderRadius: radius.pill,
    height: 9,
    width: 9,
  },
  routeDotPickup: {
    backgroundColor: colors.brand[600],
  },
  routeDotDelivery: {
    backgroundColor: colors.success,
  },
  routeLine: {
    backgroundColor: colors.border,
    height: 14,
    marginLeft: 4,
    width: 1,
  },
  routeText: {
    ...typography.caption,
    color: colors.text,
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  missionFooter: {
    borderColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  clientBlock: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  clientText: {
    ...typography.caption,
    color: colors.textMuted,
    flex: 1,
    fontSize: 11,
  },
  paymentBlock: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'space-between',
  },
  paymentText: {
    ...typography.caption,
    color: colors.brand[700],
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
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
  pressed: {
    opacity: 0.78,
  },
});
