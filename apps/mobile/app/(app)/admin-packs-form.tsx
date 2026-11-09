import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  TREATMENTS,
  packInputSchema,
  packUpdateSchema,
  type PackUpdateInput,
  type Treatment,
} from '@finiko/contracts';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import {
  createAdminPackRequest,
  deleteAdminPackRequest,
  getAdminPackRequest,
  updateAdminPackRequest,
} from '../../src/api/admin';
import { ApiClientError } from '../../src/api/client';
import { TREATMENT_LABELS } from '../../src/lib/labels';
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
import { FormSection, MultiChoiceChips } from '../../src/ui/forms';
import { Card, LoadingBlock, Screen } from '../../src/ui/screen';
import { colors, typography } from '../../src/theme/tokens';

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

function parseDate(value: string, label: string): string | null {
  if (!value.trim()) return null;

  const date = new Date(value.trim());

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} invalide (format AAAA-MM-JJ).`);
  }

  return date.toISOString();
}

function toDateInput(value: string | null): string {
  return value ? value.slice(0, 10) : '';
}

export default function AdminPacksFormScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const packId = typeof params.id === 'string' ? params.id : undefined;
  const isEdit = Boolean(packId);
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priceXOF, setPriceXOF] = useState('10000');
  const [billingPeriodDays, setBillingPeriodDays] = useState('30');
  const [quotaUnits, setQuotaUnits] = useState('20');
  const [includedTreatments, setIncludedTreatments] = useState<Treatment[]>([...TREATMENTS]);
  const [deliveryIncluded, setDeliveryIncluded] = useState(false);
  const [deliveryDiscountPercent, setDeliveryDiscountPercent] = useState('0');
  const [maxItemsPerOrder, setMaxItemsPerOrder] = useState('50');
  const [featuresText, setFeaturesText] = useState('');
  const [badge, setBadge] = useState('');
  const [color, setColor] = useState('#2563EB');
  const [displayOrder, setDisplayOrder] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [rolloverEnabled, setRolloverEnabled] = useState(false);
  const [rolloverMaxPercent, setRolloverMaxPercent] = useState('0');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ['admin', 'packs', packId],
    queryFn: () => getAdminPackRequest(packId!),
    enabled: Boolean(packId),
  });

  useEffect(() => {
    const pack = detailQuery.data;
    if (!pack) return;

    setCode(pack.code);
    setName(pack.name);
    setDescription(pack.description);
    setPriceXOF(String(pack.priceXOF));
    setBillingPeriodDays(String(pack.billingPeriodDays));
    setQuotaUnits(String(pack.quotaUnits));
    setIncludedTreatments([...pack.includedTreatments]);
    setDeliveryIncluded(pack.deliveryIncluded);
    setDeliveryDiscountPercent(String(pack.deliveryDiscountPercent));
    setMaxItemsPerOrder(String(pack.maxItemsPerOrder));
    setFeaturesText(pack.features.join('\n'));
    setBadge(pack.badge ?? '');
    setColor(pack.color);
    setDisplayOrder(String(pack.displayOrder));
    setIsActive(pack.isActive);
    setRolloverEnabled(pack.rollover.enabled);
    setRolloverMaxPercent(String(pack.rollover.maxPercent));
    setValidFrom(toDateInput(pack.validFrom));
    setValidTo(toDateInput(pack.validTo));
  }, [detailQuery.data]);

  const invalidateAndBack = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'packs'] }),
      queryClient.invalidateQueries({ queryKey: ['packs'] }),
    ]);
    router.back();
  };

  const createMutation = useMutation({
    mutationFn: createAdminPackRequest,
    onSuccess: invalidateAndBack,
    onError: (caught) => {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'Le pack n’a pas pu être créé. Réessayez.',
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: PackUpdateInput }) =>
      updateAdminPackRequest(id, input),
    onSuccess: invalidateAndBack,
    onError: (caught) => {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'Le pack n’a pas pu être mis à jour. Réessayez.',
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAdminPackRequest,
    onSuccess: invalidateAndBack,
    onError: (caught) => {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'Le pack n’a pas pu être supprimé. Réessayez.',
      );
    },
  });

  if (!currentUser) return null;
  if (currentUser.role !== 'admin') return <Redirect href={roleHome(currentUser.role)} />;

  const buildBase = () => ({
    name: name.trim(),
    description: description.trim(),
    priceXOF: parseIntValue(priceXOF, 'Prix'),
    billingPeriodDays: parseIntValue(billingPeriodDays, 'Durée'),
    quotaUnits: parseIntValue(quotaUnits, 'Quota'),
    includedTreatments,
    overagePolicy: 'prix_catalogue' as const,
    deliveryIncluded,
    deliveryDiscountPercent: parseIntValue(deliveryDiscountPercent, 'Remise livraison'),
    maxItemsPerOrder: parseIntValue(maxItemsPerOrder, 'Articles par commande'),
    rollover: {
      enabled: rolloverEnabled,
      maxPercent: parseIntValue(rolloverMaxPercent, 'Report maximal'),
    },
    features: featuresText
      .split('\n')
      .map((feature) => feature.trim())
      .filter(Boolean),
    badge: badge.trim() ? badge.trim() : null,
    color: color.trim(),
    displayOrder: parseIntValue(displayOrder, 'Ordre d’affichage'),
    isActive,
    validFrom: parseDate(validFrom, 'Début de validité'),
    validTo: parseDate(validTo, 'Fin de validité'),
  });

  const onSubmit = () => {
    setError(null);

    try {
      if (packId) {
        const parsed = packUpdateSchema.safeParse(buildBase());

        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
          return;
        }

        updateMutation.mutate({ id: packId, input: parsed.data });
        return;
      }

      const parsed = packInputSchema.safeParse({
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
    setIncludedTreatments((current) =>
      current.includes(treatment)
        ? current.filter((entry) => entry !== treatment)
        : [...current, treatment],
    );
  };

  const confirmDelete = () => {
    if (!packId) return;

    Alert.alert(
      'Supprimer ce pack ?',
      'Le pack sera retiré de la vente. Les abonnements en cours ne sont pas modifiés.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(packId),
        },
      ],
    );
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  if (isEdit && detailQuery.isLoading) {
    return (
      <Screen onBack={() => router.back()} title="Modifier le pack">
        <LoadingBlock label="Chargement du pack…" />
      </Screen>
    );
  }

  if (isEdit && detailQuery.isError) {
    return (
      <Screen onBack={() => router.back()} title="Modifier le pack">
        <Card>
          <InlineMessage tone="error">
            Le pack n’a pas pu être chargé. Vérifiez votre connexion.
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
          ? 'Modifiez les tarifs, le quota ou la disponibilité du pack.'
          : 'Créez une nouvelle offre d’abonnement FINIKO.'
      }
      title={isEdit ? 'Modifier le pack' : 'Nouveau pack'}
    >
      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}

      <Card>
        <FormSection title="Identification">
          <Field
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isEdit}
            label="Code pack"
            onChangeText={setCode}
            placeholder="pack_famille"
            value={code}
          />
          {isEdit ? <Text style={styles.hint}>Le code est immuable après la création.</Text> : null}
          <Field
            autoCapitalize="words"
            label="Nom"
            onChangeText={setName}
            placeholder="Pack Famille"
            value={name}
          />
          <Field
            autoCapitalize="sentences"
            label="Description"
            onChangeText={setDescription}
            placeholder="Le quota idéal pour toute la famille"
            value={description}
          />
          <Field
            autoCapitalize="sentences"
            label="Badge (optionnel)"
            onChangeText={setBadge}
            placeholder="Le plus populaire"
            value={badge}
          />
          <Field
            autoCapitalize="none"
            autoCorrect={false}
            label="Couleur (hexadécimal)"
            onChangeText={setColor}
            placeholder="#2563EB"
            value={color}
          />
          <Field
            keyboardType="numeric"
            label="Ordre d’affichage"
            onChangeText={setDisplayOrder}
            placeholder="0"
            value={displayOrder}
          />
        </FormSection>
      </Card>

      <Card>
        <FormSection title="Tarif et durée">
          <Field
            keyboardType="numeric"
            label="Prix (FCFA)"
            onChangeText={setPriceXOF}
            placeholder="10000"
            value={priceXOF}
          />
          <Field
            keyboardType="numeric"
            label="Durée (jours)"
            onChangeText={setBillingPeriodDays}
            placeholder="30"
            value={billingPeriodDays}
          />
          <Field
            keyboardType="numeric"
            label="Quota (unités de linge)"
            onChangeText={setQuotaUnits}
            placeholder="20"
            value={quotaUnits}
          />
          <Field
            keyboardType="numeric"
            label="Articles max par commande"
            onChangeText={setMaxItemsPerOrder}
            placeholder="50"
            value={maxItemsPerOrder}
          />
        </FormSection>
      </Card>

      <Card>
        <FormSection title="Prestations incluses">
          <MultiChoiceChips
            onToggle={toggleTreatment}
            options={TREATMENT_OPTIONS}
            values={includedTreatments}
          />
        </FormSection>
      </Card>

      <Card>
        <FormSection title="Livraison">
          <CheckRow
            checked={deliveryIncluded}
            label="Livraison incluse dans le pack"
            onToggle={() => setDeliveryIncluded((value) => !value)}
          />
          <Field
            keyboardType="numeric"
            label="Remise livraison (%)"
            onChangeText={setDeliveryDiscountPercent}
            placeholder="0"
            value={deliveryDiscountPercent}
          />
        </FormSection>
      </Card>

      <Card>
        <FormSection title="Report de quota">
          <CheckRow
            checked={rolloverEnabled}
            label="Autoriser le report du quota non utilisé"
            onToggle={() => setRolloverEnabled((value) => !value)}
          />
          {rolloverEnabled ? (
            <Field
              keyboardType="numeric"
              label="Report maximal (%)"
              onChangeText={setRolloverMaxPercent}
              placeholder="20"
              value={rolloverMaxPercent}
            />
          ) : null}
        </FormSection>
      </Card>

      <Card>
        <FormSection hint="Une ligne par avantage affiché sur la fiche du pack." title="Avantages">
          <Field
            autoCapitalize="sentences"
            label="Avantages"
            multiline
            numberOfLines={4}
            onChangeText={setFeaturesText}
            placeholder={'Livraison prioritaire\nSuivi en temps réel'}
            value={featuresText}
          />
        </FormSection>
      </Card>

      <Card>
        <FormSection title="Validité et statut">
          <Field
            autoCapitalize="none"
            label="Début de validité (AAAA-MM-JJ)"
            onChangeText={setValidFrom}
            placeholder="2026-01-01"
            value={validFrom}
          />
          <Field
            autoCapitalize="none"
            label="Fin de validité (AAAA-MM-JJ)"
            onChangeText={setValidTo}
            placeholder="2026-12-31"
            value={validTo}
          />
          <CheckRow
            checked={isActive}
            label="Pack actif et visible par les clients"
            onToggle={() => setIsActive((value) => !value)}
          />
        </FormSection>
      </Card>

      <Card>
        <FormSection title="Actions">
          <PrimaryButton
            label={isEdit ? 'Enregistrer les modifications' : 'Créer le pack'}
            loading={saving}
            onPress={onSubmit}
          />
          {isEdit ? (
            <DangerButton
              label="Supprimer le pack"
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
});
