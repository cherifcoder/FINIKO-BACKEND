import { useQuery } from '@tanstack/react-query';
import { CATEGORIES, type Category } from '@finiko/contracts';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { listCatalogRequest } from '../../src/api/catalog';
import { formatXOF } from '../../src/lib/format';
import { CATEGORY_LABELS, TREATMENT_LABELS } from '../../src/lib/labels';
import { useAuthStore } from '../../src/stores/auth.store';
import { InlineMessage, SecondaryButton } from '../../src/ui/auth';
import { Card, EmptyState, LoadingBlock, Pill, Screen, uiStyles } from '../../src/ui/screen';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

type CategoryFilter = Category | 'all';

export default function CatalogueScreen() {
  const user = useAuthStore((state) => state.user);
  const [category, setCategory] = useState<CategoryFilter>('all');

  const catalogQuery = useQuery({
    queryKey: ['catalog', category],
    queryFn: () => listCatalogRequest(category === 'all' ? undefined : category),
  });

  if (!user) return null;
  if (user.role !== 'client') return <Redirect href="/(app)/accueil" />;

  return (
    <Screen
      title="Catalogue"
      subtitle="Chaque article a trois tarifs : lavage, repassage ou les deux."
      onBack={() => router.back()}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        <FilterChip label="Tout" selected={category === 'all'} onPress={() => setCategory('all')} />
        {CATEGORIES.map((value) => (
          <FilterChip
            key={value}
            label={CATEGORY_LABELS[value]}
            selected={category === value}
            onPress={() => setCategory(value)}
          />
        ))}
      </ScrollView>

      {catalogQuery.isLoading ? <LoadingBlock label="Chargement du catalogue…" /> : null}

      {catalogQuery.isError ? (
        <Card>
          <InlineMessage tone="error">
            Le catalogue n’a pas pu être chargé. Vérifiez votre connexion.
          </InlineMessage>
          <SecondaryButton label="Réessayer" onPress={() => void catalogQuery.refetch()} />
        </Card>
      ) : null}

      {catalogQuery.data?.length === 0 ? (
        <EmptyState
          title="Aucun article dans cette catégorie"
          message="Changez de catégorie ou revenez plus tard."
        />
      ) : null}

      {catalogQuery.data?.map((item) => (
        <Card key={item.id}>
          <View style={styles.heading}>
            <View style={styles.headingText}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>
                {CATEGORY_LABELS[item.category]}
                {item.material ? ` · ${item.material}` : ''}
              </Text>
            </View>
            <Pill
              label={`${item.quotaWeight} unité${item.quotaWeight > 1 ? 's' : ''}`}
              tone="brand"
            />
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
        </Card>
      ))}

      <View style={styles.note}>
        <Text style={styles.noteText}>
          La sélection d’articles et la commande en ligne arrivent à la prochaine étape.
        </Text>
      </View>
    </Screen>
  );
}

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.chipPressed,
      ]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  filters: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  chipSelected: {
    backgroundColor: colors.brand[600],
    borderColor: colors.brand[600],
  },
  chipPressed: {
    opacity: 0.8,
  },
  chipText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  chipTextSelected: {
    color: colors.surface,
    fontWeight: '700',
  },
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
  note: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  noteText: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
