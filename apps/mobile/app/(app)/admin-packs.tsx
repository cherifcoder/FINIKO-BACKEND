import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  deleteAdminPackRequest,
  listAdminPacksRequest,
  setAdminPackStatusRequest,
} from '../../src/api/admin';
import { ApiClientError } from '../../src/api/client';
import { formatXOF } from '../../src/lib/format';
import { TREATMENT_LABELS } from '../../src/lib/labels';
import { roleHome } from '../../src/lib/role-home';
import { useAuthStore } from '../../src/stores/auth.store';
import { InlineMessage, PrimaryButton, SecondaryButton } from '../../src/ui/auth';
import { Card, EmptyState, LoadingBlock, Pill, Screen } from '../../src/ui/screen';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

export default function AdminPacksScreen() {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const packsQuery = useQuery({
    queryKey: ['admin', 'packs'],
    queryFn: listAdminPacksRequest,
  });

  const deletePack = useMutation({
    mutationFn: deleteAdminPackRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'packs'] });
      setMessage({ tone: 'success', text: 'Pack supprimé.' });
    },
    onError: (caught) => {
      setMessage({
        tone: 'error',
        text:
          caught instanceof ApiClientError ? caught.message : 'Le pack n’a pas pu être supprimé.',
      });
    },
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      setAdminPackStatusRequest(id, isActive),
    onSuccess: async (pack) => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'packs'] });
      setMessage({
        tone: 'success',
        text: pack.isActive ? 'Pack activé.' : 'Pack désactivé.',
      });
    },
    onError: (caught) => {
      setMessage({
        tone: 'error',
        text:
          caught instanceof ApiClientError
            ? caught.message
            : 'Le statut du pack n’a pas pu être modifié.',
      });
    },
  });

  if (!user) return null;
  if (user.role !== 'admin') return <Redirect href={roleHome(user.role)} />;

  const packs = packsQuery.data ?? [];

  const confirmDelete = (id: string, name: string) => {
    Alert.alert(
      'Supprimer ce pack ?',
      `${name} sera retiré de la vente. Les abonnements en cours ne sont pas modifiés.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => deletePack.mutate(id),
        },
      ],
    );
  };

  return (
    <Screen
      onBack={() => router.back()}
      subtitle="Créez, modifiez, activez ou supprimez les offres d’abonnement."
      title="Packs & forfaits"
    >
      <PrimaryButton label="Nouveau pack" onPress={() => router.push('/(app)/admin-packs-form')} />

      {message ? <InlineMessage tone={message.tone}>{message.text}</InlineMessage> : null}

      {packsQuery.isLoading ? <LoadingBlock label="Chargement des packs…" /> : null}

      {packsQuery.isError ? (
        <Card>
          <InlineMessage tone="error">
            Les packs n’ont pas pu être chargés. Vérifiez votre connexion.
          </InlineMessage>
          <SecondaryButton label="Réessayer" onPress={() => void packsQuery.refetch()} />
        </Card>
      ) : null}

      {packsQuery.isSuccess && packs.length === 0 ? (
        <EmptyState title="Aucun pack" message="Créez une première offre d’abonnement." />
      ) : null}

      {packs.map((pack) => (
        <Card key={pack.id}>
          <View style={styles.heading}>
            <View style={styles.headingText}>
              <Text style={styles.name}>{pack.name}</Text>
              <Text style={styles.meta}>
                {pack.code} · {pack.billingPeriodDays} jours · {pack.quotaUnits} unités
              </Text>
            </View>
            <View style={styles.pills}>
              <Pill
                label={pack.isActive ? 'Actif' : 'Inactif'}
                tone={pack.isActive ? 'success' : 'danger'}
              />
              {pack.badge ? <Pill label={pack.badge} tone="brand" /> : null}
            </View>
          </View>

          <Text style={styles.price}>{formatXOF(pack.priceXOF)}</Text>
          {pack.description ? <Text style={styles.description}>{pack.description}</Text> : null}

          <View style={styles.chips}>
            {pack.includedTreatments.map((treatment) => (
              <Pill key={treatment} label={TREATMENT_LABELS[treatment]} tone="brand" />
            ))}
            {pack.deliveryIncluded ? <Pill label="Livraison incluse" tone="success" /> : null}
          </View>

          <View style={styles.features}>
            <Text style={styles.feature}>Quota : {pack.quotaUnits} unités</Text>
            <Text style={styles.feature}>Articles max / commande : {pack.maxItemsPerOrder}</Text>
            <Text style={styles.feature}>Ordre d’affichage : {pack.displayOrder}</Text>
            {pack.rollover.enabled ? (
              <Text style={styles.feature}>Report du quota : {pack.rollover.maxPercent}%</Text>
            ) : null}
          </View>

          <View style={styles.actions}>
            <SecondaryButton
              label="Modifier"
              onPress={() => router.push(`/(app)/admin-packs-form?id=${pack.id}`)}
            />
            <SecondaryButton
              label={pack.isActive ? 'Désactiver' : 'Activer'}
              loading={toggleStatus.isPending && toggleStatus.variables?.id === pack.id}
              onPress={() => toggleStatus.mutate({ id: pack.id, isActive: !pack.isActive })}
            />
            <SecondaryButton
              label="Supprimer"
              loading={deletePack.isPending && deletePack.variables === pack.id}
              onPress={() => confirmDelete(pack.id, pack.name)}
            />
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  headingText: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typography.title,
    color: colors.text,
    fontSize: 18,
    lineHeight: 24,
  },
  meta: {
    ...typography.caption,
    color: colors.textMuted,
  },
  pills: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  price: {
    ...typography.title,
    color: colors.brand[700],
    fontSize: 22,
    lineHeight: 28,
  },
  description: {
    ...typography.caption,
    color: colors.textMuted,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  features: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    gap: spacing.xs,
    padding: spacing.md,
  },
  feature: {
    ...typography.caption,
    color: colors.text,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
