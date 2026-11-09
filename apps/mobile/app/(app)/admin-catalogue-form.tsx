import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CATEGORIES,
  TREATMENTS,
  catalogItemInputSchema,
  catalogItemUpdateSchema,
  type Category,
  type CatalogItemUpdateInput,
  type Treatment,
} from '@finiko/contracts';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import {
  createAdminCatalogItemRequest,
  deleteAdminCatalogItemRequest,
  getAdminCatalogItemRequest,
  updateAdminCatalogItemRequest,
} from '../../src/api/admin';
import { ApiClientError } from '../../src/api/client';
import { CATEGORY_LABELS, TREATMENT_LABELS } from '../../src/lib/labels';
import { roleHome } from '../../src/lib/role-home';
import { useAuthStore } from '../../src/stores/auth.store';
import {
  CheckRow,
  DangerButton,
  Field,
  InlineMessage,
  PrimaryButton,
  SecondaryButton,
} from '../../src/ui/auth';
import { ChoiceChips, FormSection, MultiChoiceChips } from '../../src/ui/forms';
import { Card, LoadingBlock, Screen } from '../../src/ui/screen';
import { colors, typography } from '../../src/theme/tokens';

const CATEGORY_OPTIONS: ReadonlyArray<{ value: Category; label: string }> = CATEGORIES.map(
  (category) => ({ value: category, label: CATEGORY_LABELS[category] }),
);

const TREATMENT_OPTIONS: ReadonlyArray<{ value: Treatment; label: string }> = TREATMENTS.map(
  (treatment) => ({ value: treatment, label: TREATMENT_LABELS[treatment] }),
);

function parseNumber(value: string, label: string): number {
  const parsed = Number(value.replace(',', '.'));

  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} invalide.`);
  }

  return parsed;
}

function parseIntValue(value: string, label: string): number {
  const parsed = parseNumber(value, label);

  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} doit être un nombre entier.`);
  }

  return parsed;
}

export default function AdminCatalogueFormScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const itemId = typeof params.id === 'string' ? params.id : undefined;
  const isEdit = Boolean(itemId);
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('homme');
  const [material, setMaterial] = useState('');
  const [priceLavage, setPriceLavage] = useState('1000');
  const [priceRepassage, setPriceRepassage] = useState('1000');
  const [priceBoth, setPriceBoth] = useState('1500');
  const [quotaWeight, setQuotaWeight] = useState('1');
  const [treatments, setTreatments] = useState<Treatment[]>([...TREATMENTS]);
  const [imageUrl, setImageUrl] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [displayOrder, setDisplayOrder] = useState('0');
  const [error, setError] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ['admin', 'catalog', itemId],
    queryFn: () => getAdminCatalogItemRequest(itemId!),
    enabled: Boolean(itemId),
  });

  useEffect(() => {
    const item = detailQuery.data;
    if (!item) return;

    setCode(item.code);
    setName(item.name);
    setDescription(item.description);
    setCategory(item.category);
    setMaterial(item.material);
    setPriceLavage(String(item.prices.lavage));
    setPriceRepassage(String(item.prices.repassage));
    setPriceBoth(String(item.prices.lavage_repassage));
    setQuotaWeight(String(item.quotaWeight));
    setTreatments([...item.availableTreatments]);
    setImageUrl(item.imageUrl ?? '');
    setIsActive(item.isActive);
    setDisplayOrder(String(item.displayOrder));
  }, [detailQuery.data]);

  const invalidateAndBack = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'catalog'] }),
      queryClient.invalidateQueries({ queryKey: ['catalog'] }),
    ]);
    router.back();
  };

  const createMutation = useMutation({
    mutationFn: createAdminCatalogItemRequest,
    onSuccess: invalidateAndBack,
    onError: (caught) => {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'L’article n’a pas pu être créé. Réessayez.',
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: CatalogItemUpdateInput }) =>
      updateAdminCatalogItemRequest(id, input),
    onSuccess: invalidateAndBack,
    onError: (caught) => {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'L’article n’a pas pu être mis à jour. Réessayez.',
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAdminCatalogItemRequest,
    onSuccess: invalidateAndBack,
    onError: (caught) => {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'L’article n’a pas pu être supprimé. Réessayez.',
      );
    },
  });

  if (!currentUser) return null;
  if (currentUser.role !== 'admin') return <Redirect href={roleHome(currentUser.role)} />;

  const buildBase = () => ({
    name: name.trim(),
    description: description.trim(),
    category,
    material: material.trim(),
    prices: {
      lavage: parseIntValue(priceLavage, 'Prix lavage'),
      repassage: parseIntValue(priceRepassage, 'Prix repassage'),
      lavage_repassage: parseIntValue(priceBoth, 'Prix lavage + repassage'),
    },
    quotaWeight: parseIntValue(quotaWeight, 'Poids quota'),
    availableTreatments: treatments,
    imageUrl: imageUrl.trim() ? imageUrl.trim() : null,
    isActive,
    displayOrder: parseIntValue(displayOrder, 'Ordre d’affichage'),
  });

  const onSubmit = () => {
    setError(null);

    try {
      if (itemId) {
        const parsed = catalogItemUpdateSchema.safeParse(buildBase());

        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
          return;
        }

        updateMutation.mutate({ id: itemId, input: parsed.data });
        return;
      }

      const parsed = catalogItemInputSchema.safeParse({
        code: code.trim().toLowerCase(),
        ...buildBase(),
      });

      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
        return;
      }

      createMutation.mutate(parsed.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Formulaire invalide.');
    }
  };

  const toggleTreatment = (treatment: Treatment) => {
    setTreatments((current) =>
      current.includes(treatment)
        ? current.filter((entry) => entry !== treatment)
        : [...current, treatment],
    );
  };

  const confirmDelete = () => {
    if (!itemId) return;

    Alert.alert(
      'Supprimer cet article ?',
      'L’article sera retiré du catalogue. Les commandes déjà passées ne sont pas modifiées.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(itemId),
        },
      ],
    );
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  if (isEdit && detailQuery.isLoading) {
    return (
      <Screen onBack={() => router.back()} title="Modifier l’article">
        <LoadingBlock label="Chargement de l’article…" />
      </Screen>
    );
  }

  if (isEdit && detailQuery.isError) {
    return (
      <Screen onBack={() => router.back()} title="Modifier l’article">
        <Card>
          <InlineMessage tone="error">
            L’article n’a pas pu être chargé. Vérifiez votre connexion.
          </InlineMessage>
          <SecondaryButton label="Réessayer" onPress={() => void detailQuery.refetch()} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      onBack={() => router.back()}
      subtitle={
        isEdit
          ? 'Modifiez les tarifs, la catégorie ou la disponibilité de l’article.'
          : 'Ajoutez un nouvel article au catalogue FINIKO.'
      }
      title={isEdit ? 'Modifier l’article' : 'Nouvel article'}
    >
      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}

      <Card>
        <FormSection title="Identification">
          <Field
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isEdit}
            label="Code article"
            onChangeText={setCode}
            placeholder="chemise_homme"
            value={code}
          />
          {isEdit ? <Text style={styles.hint}>Le code est immuable après la création.</Text> : null}
          <Field
            autoCapitalize="words"
            label="Nom"
            onChangeText={setName}
            placeholder="Chemise homme"
            value={name}
          />
          <Field
            autoCapitalize="sentences"
            label="Description"
            onChangeText={setDescription}
            placeholder="Chemise en coton, col classique"
            value={description}
          />
          <Field
            autoCapitalize="words"
            label="Matière"
            onChangeText={setMaterial}
            placeholder="Coton"
            value={material}
          />
          <Field
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            label="Image (URL, optionnel)"
            onChangeText={setImageUrl}
            placeholder="https://…"
            value={imageUrl}
          />
        </FormSection>
      </Card>

      <Card>
        <FormSection title="Catégorie">
          <ChoiceChips onChange={setCategory} options={CATEGORY_OPTIONS} value={category} />
        </FormSection>
      </Card>

      <Card>
        <FormSection
          hint="Les trois tarifs sont obligatoires, même si une prestation n’est pas proposée."
          title="Tarifs"
        >
          <Field
            keyboardType="numeric"
            label="Lavage (FCFA)"
            onChangeText={setPriceLavage}
            placeholder="1000"
            value={priceLavage}
          />
          <Field
            keyboardType="numeric"
            label="Repassage (FCFA)"
            onChangeText={setPriceRepassage}
            placeholder="1000"
            value={priceRepassage}
          />
          <Field
            keyboardType="numeric"
            label="Lavage + repassage (FCFA)"
            onChangeText={setPriceBoth}
            placeholder="1500"
            value={priceBoth}
          />
        </FormSection>
      </Card>

      <Card>
        <FormSection title="Prestations et quota">
          <Text style={styles.fieldLabel}>Prestations proposées</Text>
          <MultiChoiceChips
            onToggle={toggleTreatment}
            options={TREATMENT_OPTIONS}
            values={treatments}
          />
          <Field
            keyboardType="numeric"
            label="Poids quota (unités)"
            onChangeText={setQuotaWeight}
            placeholder="1"
            value={quotaWeight}
          />
          <Field
            keyboardType="numeric"
            label="Ordre d’affichage"
            onChangeText={setDisplayOrder}
            placeholder="0"
            value={displayOrder}
          />
          <CheckRow
            checked={isActive}
            label="Article actif et visible par les clients"
            onToggle={() => setIsActive((value) => !value)}
          />
        </FormSection>
      </Card>

      <Card>
        <FormSection title="Actions">
          <PrimaryButton
            label={isEdit ? 'Enregistrer les modifications' : 'Créer l’article'}
            loading={saving}
            onPress={onSubmit}
          />
          {isEdit ? (
            <DangerButton
              label="Supprimer l’article"
              loading={deleteMutation.isPending}
              onPress={confirmDelete}
            />
          ) : null}
        </FormSection>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: {
    ...typography.caption,
    color: colors.textMuted,
  },
  fieldLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
});
