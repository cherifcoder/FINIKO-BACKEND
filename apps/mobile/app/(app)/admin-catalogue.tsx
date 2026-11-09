import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CATEGORIES, type Category } from '@finiko/contracts';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  deleteAdminCatalogItemRequest,
  listAdminCatalogRequest,
  setAdminCatalogItemStatusRequest,
} from '../../src/api/admin';
import { ApiClientError } from '../../src/api/client';
import { formatXOF } from '../../src/lib/format';
import { CATEGORY_LABELS, TREATMENT_LABELS } from '../../src/lib/labels';
import { roleHome } from '../../src/lib/role-home';
import { useAuthStore } from '../../src/stores/auth.store';
import { InlineMessage, PrimaryButton, SecondaryButton } from '../../src/ui/auth';
import { FilterChips } from '../../src/ui/dashboard';
import { Card, EmptyState, LoadingBlock, Pill, Screen, uiStyles } from '../../src/ui/screen';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

type CategoryFilter = Category | 'all';

const CATEGORY_FILTERS = [
  { key: 'all', label: 'Tout' },
  ...CATEGORIES.map((category) => ({ key: category, label: CATEGORY_LABELS[category] })),
];

export default function AdminCatalogueScreen() {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const catalogQuery = useQuery({
    queryKey: ['admin', 'catalog'],
    queryFn: listAdminCatalogRequest,
  });

  const deleteItem = useMutation({
    mutationFn: deleteAdminCatalogItemRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'catalog'] });
      setMessage({ tone: 'success', text: 'Article supprimé du catalogue.' });
    },
    onError: (caught) => {
      setMessage({
        tone: 'error',
        text:
          caught instanceof ApiClientError ? caught.message : 'L’article n’a pas pu être supprimé.',
      });
    },
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      setAdminCatalogItemStatusRequest(id, isActive),
    onSuccess: async (item) => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'catalog'] });
      setMessage({
        tone: 'success',
        text: item.isActive ? 'Article activé.' : 'Article désactivé.',
      });
    },
    onError: (caught) => {
      setMessage({
        tone: 'error',
        text:
          caught instanceof ApiClientError
            ? caught.message
            : 'Le statut de l’article n’a pas pu être modifié.',
      });
    },
  });

  if (!user) return null;
  if (user.role !== 'admin') return <Redirect href={roleHome(user.role)} />;

  const items = (catalogQuery.data ?? []).filter(
    (item) => category === 'all' || item.category === category,
  );

  const confirmDelete = (id: string, name: string) => {
    Alert.alert(
      'Supprimer cet article ?',
      `${name} sera retiré du catalogue. Les commandes déjà passées ne sont pas modifiées.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => deleteItem.mutate(id),
        },
      ],
    );
  };

  return (
    <Screen
      onBack={() => router.back()}
      subtitle="Créez, modifiez, activez ou supprimez les articles du catalogue."
      title="Catalogue"
    >
      <FilterChips
        onSelect={(value) => setCategory(value as CategoryFilter)}
        options={CATEGORY_FILTERS}
        selected={category}
      />

      <PrimaryButton
        label="Nouvel article"
        onPress={() => router.push('/(app)/admin-catalogue-form')}
      />

      {message ? <InlineMessage tone={message.tone}>{message.text}</InlineMessage> : null}

      {catalogQuery.isLoading ? <LoadingBlock label="Chargement du catalogue…" /> : null}

      {catalogQuery.isError ? (
        <Card>
          <InlineMessage tone="error">
            Le catalogue n’a pas pu être chargé. Vérifiez votre connexion.
          </InlineMessage>
          <SecondaryButton label="Réessayer" onPress={() => void catalogQuery.refetch()} />
        </Card>
      ) : null}

      {catalogQuery.isSuccess && items.length === 0 ? (
        <EmptyState
          title="Aucun article"
          message="Créez un premier article ou changez de catégorie."
        />
      ) : null}

      {items.map((item) => (
        <Card key={item.id}>
          <View style={styles.heading}>
            <View style={styles.headingText}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>
                {CATEGORY_LABELS[item.category]} · {item.code}
                {item.material ? ` · ${item.material}` : ''}
              </Text>
            </View>
            <View style={styles.pills}>
              <Pill
                label={item.isActive ? 'Actif' : 'Inactif'}
                tone={item.isActive ? 'success' : 'danger'}
              />
              <Pill
                label={`${item.quotaWeight} unité${item.quotaWeight > 1 ? 's' : ''}`}
                tone="brand"
              />
            </View>
          </View>

          {item.description ? <Text style={styles.description}>{item.description}</Text> : null}

          <View style={styles.prices}>
            {item.availableTreatments.map((treatment) => (
              <View key={treatment} style={uiStyles.row}>
                <Text style={styles.priceLabel}>{TREATMENT_LABELS[treatment]}</Text>
                <Text style={styles.priceValue}>{formatXOF(item.prices[treatment])}</Text>
              </View>
            ))}
          </View>

          <View style={styles.actions}>
            <SecondaryButton
              label="Modifier"
              onPress={() => router.push(`/(app)/admin-catalogue-form?id=${item.id}`)}
            />
            <SecondaryButton
              label={item.isActive ? 'Désactiver' : 'Activer'}
              loading={toggleStatus.isPending && toggleStatus.variables?.id === item.id}
              onPress={() => toggleStatus.mutate({ id: item.id, isActive: !item.isActive })}
            />
            <SecondaryButton
              label="Supprimer"
              loading={deleteItem.isPending && deleteItem.variables === item.id}
              onPress={() => confirmDelete(item.id, item.name)}
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
  description: {
    ...typography.caption,
    color: colors.textMuted,
  },
  prices: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    gap: spacing.xs,
    padding: spacing.md,
  },
  priceLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  priceValue: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
