import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Pack } from '@finiko/contracts';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  listPacksRequest,
  createSubscriptionRequest,
  getMySubscriptionsRequest,
} from '../../src/api/packs';
import { ApiClientError } from '../../src/api/client';
import { formatDate, formatXOF } from '../../src/lib/format';
import { TREATMENT_LABELS } from '../../src/lib/labels';
import { useAuthStore } from '../../src/stores/auth.store';
import { PrimaryButton, SecondaryButton, InlineMessage } from '../../src/ui/auth';
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

export default function PacksScreen() {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const packsQuery = useQuery({ queryKey: ['packs'], queryFn: listPacksRequest });
  const subscriptionQuery = useQuery({
    queryKey: ['subscriptions', 'me'],
    queryFn: getMySubscriptionsRequest,
  });

  const subscribe = useMutation({
    mutationFn: createSubscriptionRequest,
    onSuccess: async (subscription) => {
      await queryClient.invalidateQueries({ queryKey: ['subscriptions', 'me'] });
      setMessage({
        tone: 'success',
        text:
          subscription.status === 'programmee'
            ? 'Renouvellement programmé. Il démarrera à la fin de votre pack actuel.'
            : 'Souscription enregistrée. Elle sera activée après confirmation du paiement.',
      });
    },
    onError: (error) => {
      setMessage({
        tone: 'error',
        text:
          error instanceof ApiClientError
            ? error.message
            : 'La souscription n’a pas pu être enregistrée.',
      });
    },
  });

  if (!user) return null;
  if (user.role !== 'client') return <Redirect href="/(app)/accueil" />;

  const overview = subscriptionQuery.data;
  const pending = overview?.pending ?? null;
  const scheduled = overview?.scheduled ?? null;
  const active = overview?.active ?? null;
  const canSubscribe = !pending && !scheduled;

  const onSubscribe = (pack: Pack) => {
    setMessage(null);

    Alert.alert(
      'Confirmer la souscription',
      `${pack.name}\n${formatXOF(pack.priceXOF)} · ${pack.billingPeriodDays} jours\n${pack.quotaUnits} unités de linge`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Souscrire',
          onPress: () => subscribe.mutate(pack.id),
        },
      ],
    );
  };

  return (
    <Screen
      title="Packs & abonnements"
      subtitle="Choisissez le quota mensuel adapté à votre linge."
      onBack={() => router.back()}
    >
      {active ? (
        <Card>
          <View style={uiStyles.row}>
            <View style={styles.cardHeading}>
              <Text style={styles.cardTitle}>Votre pack actuel</Text>
              <Text style={styles.cardSubtitle}>{active.pack.name}</Text>
            </View>
            <Pill label="Actif" tone="success" />
          </View>

          <QuotaBar
            used={active.quotaUsed}
            total={active.quotaTotal}
            reserved={active.quotaReserved}
          />

          <Text style={styles.meta}>
            Du {formatDate(active.startDate)} au {formatDate(active.endDate)}
          </Text>

          <SecondaryButton
            label="Gérer mon abonnement"
            onPress={() => router.push('/(app)/abonnement')}
          />
        </Card>
      ) : null}

      {pending ? (
        <Card>
          <View style={uiStyles.row}>
            <View style={styles.cardHeading}>
              <Text style={styles.cardTitle}>Souscription en attente</Text>
              <Text style={styles.cardSubtitle}>{pending.pack.name}</Text>
            </View>
            <Pill label="Paiement à confirmer" tone="warning" />
          </View>
          <Text style={styles.meta}>
            Le quota sera crédité dès la confirmation du paiement. Aucune unité n’est débitée avant
            cette étape.
          </Text>
          <SecondaryButton
            label="Voir ma souscription"
            onPress={() => router.push('/(app)/abonnement')}
          />
        </Card>
      ) : null}

      {scheduled ? (
        <Card>
          <View style={uiStyles.row}>
            <View style={styles.cardHeading}>
              <Text style={styles.cardTitle}>Renouvellement programmé</Text>
              <Text style={styles.cardSubtitle}>{scheduled.pack.name}</Text>
            </View>
            <Pill label="Programmé" tone="brand" />
          </View>
          <Text style={styles.meta}>
            Démarrage le {formatDate(scheduled.startDate)} après la fin du pack actuel.
          </Text>
        </Card>
      ) : null}

      {message ? <InlineMessage tone={message.tone}>{message.text}</InlineMessage> : null}

      <SectionTitle>Les packs disponibles</SectionTitle>

      {packsQuery.isLoading ? <LoadingBlock /> : null}

      {packsQuery.isError ? (
        <Card>
          <InlineMessage tone="error">
            Les packs n’ont pas pu être chargés. Vérifiez votre connexion.
          </InlineMessage>
          <SecondaryButton label="Réessayer" onPress={() => void packsQuery.refetch()} />
        </Card>
      ) : null}

      {packsQuery.data?.length === 0 ? (
        <EmptyState
          title="Aucun pack disponible"
          message="Les offres seront publiées prochainement. Revenez plus tard."
        />
      ) : null}

      {packsQuery.data?.map((pack) => (
        <Card key={pack.id}>
          <View style={uiStyles.row}>
            <View style={styles.cardHeading}>
              <Text style={styles.cardTitle}>{pack.name}</Text>
              <Text style={styles.price}>{formatXOF(pack.priceXOF)}</Text>
              <Text style={styles.cardSubtitle}>pour {pack.billingPeriodDays} jours</Text>
            </View>
            {pack.badge ? <Pill label={pack.badge} tone="brand" /> : null}
          </View>

          <View style={styles.quotaPitch}>
            <Text style={styles.quotaPitchValue}>{pack.quotaUnits}</Text>
            <Text style={styles.quotaPitchLabel}>unités de linge</Text>
          </View>

          <View style={styles.chips}>
            {pack.includedTreatments.map((treatment) => (
              <Pill key={treatment} label={TREATMENT_LABELS[treatment]} tone="brand" />
            ))}
            {pack.deliveryIncluded ? <Pill label="Livraison incluse" tone="success" /> : null}
            {!pack.deliveryIncluded && pack.deliveryDiscountPercent > 0 ? (
              <Pill label={`-${pack.deliveryDiscountPercent}% livraison`} tone="neutral" />
            ) : null}
          </View>

          {pack.features.length > 0 ? (
            <View style={styles.features}>
              {pack.features.map((feature) => (
                <Text key={feature} style={styles.feature}>
                  ✓ {feature}
                </Text>
              ))}
            </View>
          ) : null}

          {canSubscribe ? (
            <PrimaryButton
              label={active ? 'Programmer ce pack' : 'Souscrire'}
              loading={subscribe.isPending && subscribe.variables === pack.id}
              onPress={() => onSubscribe(pack)}
            />
          ) : pending ? (
            <SecondaryButton
              label="Paiement en attente"
              onPress={() => router.push('/(app)/abonnement')}
            />
          ) : (
            <SecondaryButton
              label="Renouvellement déjà programmé"
              onPress={() => router.push('/(app)/abonnement')}
            />
          )}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardHeading: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    ...typography.title,
    color: colors.text,
    fontSize: 18,
    lineHeight: 24,
  },
  cardSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
  },
  price: {
    ...typography.title,
    color: colors.brand[700],
    fontSize: 20,
    lineHeight: 26,
  },
  meta: {
    ...typography.caption,
    color: colors.textMuted,
  },
  quotaPitch: {
    alignItems: 'baseline',
    backgroundColor: colors.brand[50],
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  quotaPitchValue: {
    ...typography.display,
    color: colors.brand[700],
    fontSize: 30,
    lineHeight: 36,
  },
  quotaPitchLabel: {
    ...typography.caption,
    color: colors.brand[700],
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  features: {
    gap: spacing.xs,
  },
  feature: {
    ...typography.caption,
    color: colors.text,
  },
});
