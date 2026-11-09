import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Subscription, SubscriptionStatus, SubscriptionUsage } from '@finiko/contracts';
import { Redirect, router } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  cancelSubscriptionRequest,
  getMySubscriptionsRequest,
  listMyUsagesRequest,
} from '../../src/api/packs';
import { ApiClientError } from '../../src/api/client';
import { formatDate, formatXOF } from '../../src/lib/format';
import { roleHome } from '../../src/lib/role-home';
import { SUBSCRIPTION_STATUS_LABELS, USAGE_TYPE_LABELS } from '../../src/lib/labels';
import { useAuthStore } from '../../src/stores/auth.store';
import { DangerButton, InlineMessage, SecondaryButton } from '../../src/ui/auth';
import {
  Card,
  EmptyState,
  LoadingBlock,
  Pill,
  QuotaBar,
  Screen,
  SectionTitle,
  uiStyles,
} from '../../src/ui/screen';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

function statusTone(status: SubscriptionStatus): 'brand' | 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'active':
      return 'success';
    case 'programmee':
      return 'brand';
    case 'en_attente_paiement':
      return 'warning';
    case 'annulee':
    case 'expiree':
    case 'suspendue':
      return 'danger';
  }
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export default function SubscriptionScreen() {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();

  const overviewQuery = useQuery({
    queryKey: ['subscriptions', 'me'],
    queryFn: getMySubscriptionsRequest,
  });

  const active = overviewQuery.data?.active ?? null;
  const pending = overviewQuery.data?.pending ?? null;
  const scheduled = overviewQuery.data?.scheduled ?? null;

  const usagesQuery = useQuery({
    queryKey: ['subscriptions', 'usage', active?.id],
    queryFn: () => listMyUsagesRequest(active?.id, 40),
    enabled: Boolean(active),
  });

  const cancel = useMutation({
    mutationFn: ({ subscriptionId, reason }: { subscriptionId: string; reason: string }) =>
      cancelSubscriptionRequest(subscriptionId, reason),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['subscriptions', 'me'] }),
        queryClient.invalidateQueries({ queryKey: ['subscriptions', 'usage'] }),
      ]);
    },
  });

  if (!user) return null;
  if (user.role !== 'client') return <Redirect href={roleHome(user.role)} />;

  const onCancel = (subscription: Subscription) => {
    const renewalOnly = subscription.status === 'active';

    Alert.alert(
      renewalOnly ? 'Annuler le renouvellement ?' : 'Annuler cette souscription ?',
      renewalOnly
        ? 'Le quota restant reste utilisable jusqu’à la fin de la période. Aucun prélèvement futur ne sera effectué.'
        : 'Cette souscription n’a pas encore été activée. Elle sera annulée.',
      [
        { text: 'Conserver', style: 'cancel' },
        {
          text: 'Annuler',
          style: 'destructive',
          onPress: () =>
            cancel.mutate({
              subscriptionId: subscription.id,
              reason: renewalOnly ? 'Annulation du renouvellement' : 'Annulation client',
            }),
        },
      ],
    );
  };

  if (overviewQuery.isLoading) {
    return (
      <Screen title="Mon abonnement" onBack={() => router.back()}>
        <LoadingBlock label="Chargement de votre abonnement…" />
      </Screen>
    );
  }

  if (overviewQuery.isError) {
    return (
      <Screen title="Mon abonnement" onBack={() => router.back()}>
        <Card>
          <InlineMessage tone="error">
            Votre abonnement n’a pas pu être chargé. Vérifiez votre connexion.
          </InlineMessage>
          <SecondaryButton label="Réessayer" onPress={() => void overviewQuery.refetch()} />
        </Card>
      </Screen>
    );
  }

  const hasSubscription = Boolean(active || pending || scheduled);

  return (
    <Screen
      title="Mon abonnement"
      subtitle="Suivez votre quota et l’historique de chaque mouvement."
      onBack={() => router.back()}
    >
      {cancel.isError ? (
        <InlineMessage tone="error">
          {cancel.error instanceof ApiClientError
            ? cancel.error.message
            : 'L’annulation n’a pas pu être effectuée.'}
        </InlineMessage>
      ) : null}

      {!hasSubscription ? (
        <EmptyState
          title="Aucun abonnement"
          message="Souscrivez à un pack pour bénéficier d’un quota mensuel et de tarifs avantageux."
          action={
            <SecondaryButton label="Voir les packs" onPress={() => router.push('/(app)/packs')} />
          }
        />
      ) : null}

      {active ? (
        <Card>
          <View style={uiStyles.row}>
            <View style={styles.heading}>
              <Text style={styles.title}>{active.pack.name}</Text>
              <Text style={styles.meta}>Abonnement actif</Text>
            </View>
            <Pill
              label={SUBSCRIPTION_STATUS_LABELS[active.status]}
              tone={statusTone(active.status)}
            />
          </View>

          <QuotaBar
            used={active.quotaUsed}
            total={active.quotaTotal}
            reserved={active.quotaReserved}
          />

          <View style={styles.details}>
            <DetailRow label="Début" value={formatDate(active.startDate)} />
            <DetailRow label="Fin" value={formatDate(active.endDate)} />
            <DetailRow label="Renouvellement" value={active.autoRenew ? 'Automatique' : 'Manuel'} />
            {active.cancelledAt ? (
              <DetailRow label="Renouvellement annulé le" value={formatDate(active.cancelledAt)} />
            ) : null}
          </View>

          <View style={styles.actions}>
            {!active.cancelledAt ? (
              <DangerButton
                label="Annuler le renouvellement"
                loading={cancel.isPending}
                onPress={() => onCancel(active)}
              />
            ) : null}
            <SecondaryButton label="Changer de pack" onPress={() => router.push('/(app)/packs')} />
          </View>
        </Card>
      ) : null}

      {pending ? (
        <Card>
          <View style={uiStyles.row}>
            <View style={styles.heading}>
              <Text style={styles.title}>{pending.pack.name}</Text>
              <Text style={styles.meta}>{formatXOF(pending.pack.priceXOF)}</Text>
            </View>
            <Pill label="En attente de paiement" tone="warning" />
          </View>
          <Text style={styles.notice}>
            Le quota sera crédité après confirmation du paiement. Vous pouvez encore annuler cette
            souscription.
          </Text>
          <DangerButton
            label="Annuler la souscription"
            loading={cancel.isPending}
            onPress={() => onCancel(pending)}
          />
        </Card>
      ) : null}

      {scheduled ? (
        <Card>
          <View style={uiStyles.row}>
            <View style={styles.heading}>
              <Text style={styles.title}>{scheduled.pack.name}</Text>
              <Text style={styles.meta}>{formatXOF(scheduled.pack.priceXOF)}</Text>
            </View>
            <Pill label="Programmé" tone="brand" />
          </View>
          <Text style={styles.notice}>
            Ce pack démarrera le {formatDate(scheduled.startDate)} et se terminera le{' '}
            {formatDate(scheduled.endDate)}.
          </Text>
          <DangerButton
            label="Annuler le renouvellement"
            loading={cancel.isPending}
            onPress={() => onCancel(scheduled)}
          />
        </Card>
      ) : null}

      {active ? (
        <>
          <SectionTitle>Historique du quota</SectionTitle>

          {usagesQuery.isLoading ? <LoadingBlock label="Chargement de l’historique…" /> : null}

          {usagesQuery.isError ? (
            <Card>
              <InlineMessage tone="error">L’historique n’a pas pu être chargé.</InlineMessage>
              <SecondaryButton label="Réessayer" onPress={() => void usagesQuery.refetch()} />
            </Card>
          ) : null}

          {usagesQuery.data?.length === 0 ? (
            <EmptyState
              title="Aucun mouvement"
              message="Les réservations, consommations et ajustements apparaîtront ici."
            />
          ) : null}

          {usagesQuery.data?.map((usage) => (
            <UsageRow key={usage.id} usage={usage} />
          ))}
        </>
      ) : null}
    </Screen>
  );
}

function UsageRow({ usage }: { usage: SubscriptionUsage }) {
  const delta =
    usage.quotaTotalDelta !== 0
      ? `${signed(usage.quotaTotalDelta)} quota total`
      : usage.usedDelta !== 0
        ? `${signed(usage.usedDelta)} utilisé`
        : usage.reservedDelta !== 0
          ? `${signed(usage.reservedDelta)} réservé`
          : '—';

  return (
    <View style={styles.usageRow}>
      <View style={styles.usageMain}>
        <Text style={styles.usageType}>{USAGE_TYPE_LABELS[usage.type]}</Text>
        <Text style={styles.usageMeta}>
          {formatDate(usage.createdAt)}
          {usage.reason ? ` · ${usage.reason}` : ''}
        </Text>
      </View>
      <View style={styles.usageNumbers}>
        <Text style={styles.usageDelta}>{delta}</Text>
        <Text style={styles.usageAfter}>
          {usage.quotaUsedAfter} utilisés · {usage.quotaReservedAfter} réservés
        </Text>
      </View>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={uiStyles.row}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.title,
    color: colors.text,
    fontSize: 18,
    lineHeight: 24,
  },
  meta: {
    ...typography.caption,
    color: colors.textMuted,
  },
  details: {
    gap: spacing.xs,
  },
  detailLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  detailValue: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '700',
  },
  actions: {
    gap: spacing.sm,
  },
  notice: {
    ...typography.caption,
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    color: colors.textMuted,
    padding: spacing.md,
  },
  usageRow: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  usageMain: {
    flex: 1,
    gap: 2,
  },
  usageType: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '700',
  },
  usageMeta: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  usageNumbers: {
    alignItems: 'flex-end',
    gap: 2,
  },
  usageDelta: {
    ...typography.caption,
    color: colors.brand[700],
    fontWeight: '700',
  },
  usageAfter: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
});
