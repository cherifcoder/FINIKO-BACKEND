import { useQuery } from '@tanstack/react-query';
import type { PaymentStatus } from '@finiko/contracts';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getAdminFinanceSummaryRequest } from '../../src/api/admin';
import { formatDate, formatXOF } from '../../src/lib/format';
import {
  PAYMENT_PROVIDER_LABELS,
  PAYMENT_PURPOSE_LABELS,
  PAYMENT_STATUS_LABELS,
} from '../../src/lib/labels';
import { roleHome } from '../../src/lib/role-home';
import { useAuthStore } from '../../src/stores/auth.store';
import { InlineMessage, SecondaryButton } from '../../src/ui/auth';
import {
  FilterChips,
  KpiCard,
  SectionHeader,
  StatTile,
  dashboardStyles,
} from '../../src/ui/dashboard';
import { EmptyState, LoadingBlock, Pill, Screen } from '../../src/ui/screen';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

type PillTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';

const PERIODS = [
  { key: '7', label: '7 jours' },
  { key: '30', label: '30 jours' },
  { key: '90', label: '90 jours' },
];

function paymentStatusTone(status: PaymentStatus): PillTone {
  if (status === 'reussi') return 'success';
  if (status === 'rembourse') return 'warning';
  if (status === 'echoue' || status === 'annule' || status === 'expire') return 'danger';
  return 'brand';
}

export default function AdminFinancesScreen() {
  const [period, setPeriod] = useState('30');
  const user = useAuthStore((state) => state.user);
  const days = Number(period);
  const financeQuery = useQuery({
    queryKey: ['admin', 'finances', days],
    queryFn: () => getAdminFinanceSummaryRequest(days),
  });

  if (!user) return null;
  if (user.role !== 'admin') return <Redirect href={roleHome(user.role)} />;

  const summary = financeQuery.data;

  return (
    <Screen
      onBack={() => router.back()}
      subtitle="Encaissements, packs et réconciliation."
      title="Finances"
    >
      <FilterChips onSelect={setPeriod} options={PERIODS} selected={period} />

      {financeQuery.isLoading ? <LoadingBlock label="Calcul des finances…" /> : null}

      {financeQuery.isError ? (
        <>
          <InlineMessage tone="error">
            Les finances n'ont pas pu être chargées. Vérifiez votre connexion.
          </InlineMessage>
          <SecondaryButton label="Réessayer" onPress={() => void financeQuery.refetch()} />
        </>
      ) : null}

      {summary ? (
        <>
          <Text style={styles.period}>
            Du {formatDate(summary.period.from)} au {formatDate(summary.period.to)}
          </Text>

          <View style={dashboardStyles.row}>
            <KpiCard
              hint="Commandes et abonnements"
              icon="wallet-outline"
              label="Encaissé"
              tone="success"
              value={formatXOF(summary.totals.collected)}
            />
            <KpiCard
              hint={`${summary.payments.pending} paiement${summary.payments.pending > 1 ? 's' : ''}`}
              icon="time-outline"
              label="En attente"
              tone="warning"
              value={formatXOF(summary.totals.pending)}
            />
          </View>

          <View style={dashboardStyles.row}>
            <StatTile
              icon="bag-handle-outline"
              label="Commandes"
              tone="brand"
              value={String(summary.orders.total)}
            />
            <StatTile
              icon="cart-outline"
              label="Panier moyen"
              tone="purple"
              value={formatXOF(summary.orders.averageBasket)}
            />
          </View>

          <View style={dashboardStyles.row}>
            <StatTile
              icon="arrow-undo-outline"
              label="Remboursé"
              tone="danger"
              value={formatXOF(summary.totals.refunded)}
            />
            <StatTile
              icon="trending-up-outline"
              label="Net"
              tone="success"
              value={formatXOF(summary.totals.net)}
            />
          </View>

          <SectionHeader title="Encaissements par moyen" />

          {summary.providers.length === 0 ? (
            <EmptyState
              message="Aucun paiement réussi sur cette période."
              title="Pas encore d'encaissement"
            />
          ) : (
            summary.providers.map((provider) => {
              const percent =
                summary.totals.collected > 0
                  ? Math.round((provider.amountXOF / summary.totals.collected) * 100)
                  : 0;

              return (
                <View key={provider.provider} style={styles.providerCard}>
                  <View style={styles.providerHeader}>
                    <Text style={styles.providerName}>
                      {PAYMENT_PROVIDER_LABELS[provider.provider]}
                    </Text>
                    <Text style={styles.providerAmount}>{formatXOF(provider.amountXOF)}</Text>
                  </View>
                  <View style={styles.providerTrack}>
                    <View style={[styles.providerFill, { width: `${percent}%` }]} />
                  </View>
                  <Text style={styles.providerMeta}>
                    {provider.count} paiement{provider.count > 1 ? 's' : ''} · {percent}%
                  </Text>
                </View>
              );
            })
          )}

          <SectionHeader title="Dernières transactions" />

          {summary.recentTransactions.length === 0 ? (
            <EmptyState
              message="Les paiements apparaîtront ici dès qu'une transaction sera enregistrée."
              title="Aucune transaction"
            />
          ) : (
            summary.recentTransactions.map((transaction) => (
              <View key={transaction.id} style={styles.transactionCard}>
                <View style={styles.transactionTop}>
                  <View style={styles.transactionInfo}>
                    <Text style={styles.reference}>{transaction.reference}</Text>
                    <Text style={styles.transactionMeta}>
                      {transaction.clientName}
                      {transaction.orderNumber ? ` · ${transaction.orderNumber}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.transactionAmount}>{formatXOF(transaction.amountXOF)}</Text>
                </View>

                <View style={styles.transactionBottom}>
                  <Pill
                    label={`${PAYMENT_PURPOSE_LABELS[transaction.purpose]} · ${
                      PAYMENT_STATUS_LABELS[transaction.status]
                    }`}
                    tone={paymentStatusTone(transaction.status)}
                  />
                  <Text style={styles.transactionDate}>
                    {formatDate(transaction.paidAt ?? transaction.createdAt)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  period: {
    ...typography.caption,
    color: colors.textMuted,
  },
  providerCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  providerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  providerName: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  providerAmount: {
    ...typography.title,
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
  },
  providerTrack: {
    backgroundColor: colors.background,
    borderRadius: radius.pill,
    height: 8,
    overflow: 'hidden',
  },
  providerFill: {
    backgroundColor: colors.brand[600],
    borderRadius: radius.pill,
    height: '100%',
  },
  providerMeta: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  transactionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  transactionTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  transactionInfo: {
    flex: 1,
    gap: 2,
  },
  reference: {
    ...typography.body,
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  transactionMeta: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  transactionAmount: {
    ...typography.title,
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
  },
  transactionBottom: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  transactionDate: {
    ...typography.caption,
    color: colors.textMuted,
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'right',
  },
});
