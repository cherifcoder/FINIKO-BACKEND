import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  TREATMENTS,
  type CatalogItem,
  type Category,
  type OrderQuote,
  type QuoteRequestInput,
  type Treatment,
} from '@finiko/contracts';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { listCatalogRequest } from '../../src/api/catalog';
import { ApiClientError } from '../../src/api/client';
import { createOrderRequest, quoteOrderRequest } from '../../src/api/orders';
import { formatXOF } from '../../src/lib/format';
import { CATEGORY_LABELS, TREATMENT_LABELS } from '../../src/lib/labels';
import { coordinatesLabel } from '../../src/lib/maps';
import { roleHome } from '../../src/lib/role-home';
import { useAuthStore } from '../../src/stores/auth.store';
import { useOrderAddressStore, type SelectedAddress } from '../../src/stores/order-address.store';
import { CheckRow, Field, InlineMessage, PrimaryButton, SecondaryButton } from '../../src/ui/auth';
import { FilterChips } from '../../src/ui/dashboard';
import { FormSection } from '../../src/ui/forms';
import { RouteMap } from '../../src/ui/map';
import {
  Card,
  EmptyState,
  LoadingBlock,
  Pill,
  Screen,
  SectionTitle,
  uiStyles,
} from '../../src/ui/screen';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

type PaymentMethod = 'cash' | 'orange_money';
type CategoryFilter = 'all' | Category;
type TreatmentCounts = Partial<Record<Treatment, number>>;
type SelectionMap = Record<string, TreatmentCounts>;

interface BasketLine {
  item: CatalogItem;
  treatment: Treatment;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface ScreenMessage {
  tone: 'error' | 'success' | 'info';
  text: string;
}

const CATEGORY_FILTERS: { key: CategoryFilter; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'homme', label: 'Homme' },
  { key: 'femme', label: 'Femme' },
  { key: 'enfant', label: 'Enfant' },
  { key: 'maison', label: 'Maison' },
  { key: 'blanchiment', label: 'Blanchiment' },
];

function countFor(selection: SelectionMap, id: string, treatment: Treatment): number {
  return selection[id]?.[treatment] ?? 0;
}

function countTotal(counts: TreatmentCounts | undefined): number {
  if (!counts) return 0;

  return TREATMENTS.reduce((total, treatment) => total + (counts[treatment] ?? 0), 0);
}

function AddressCard({
  address,
  label,
  onPress,
}: {
  address: SelectedAddress;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.addressCard, pressed && styles.pressed]}
    >
      <View style={styles.addressIcon}>
        <Ionicons color={colors.brand[700]} name="location" size={20} />
      </View>

      <View style={styles.addressContent}>
        <Text style={styles.addressLabel}>{label}</Text>
        <Text style={styles.addressText}>{address.text}</Text>
        <Text style={styles.addressCoordinates}>{coordinatesLabel(address.coordinates)}</Text>
        <Text style={styles.addressAction}>Choisir sur la carte →</Text>
      </View>
    </Pressable>
  );
}

export default function CommandeScreen() {
  const user = useAuthStore((state) => state.user);
  const { itemId } = useLocalSearchParams<{ itemId?: string }>();
  const queryClient = useQueryClient();

  const pickup = useOrderAddressStore((state) => state.pickup);
  const delivery = useOrderAddressStore((state) => state.delivery);

  const [selected, setSelected] = useState<SelectionMap>({});
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');
  const [contactName, setContactName] = useState(user?.fullName ?? '');
  const [contactPhone, setContactPhone] = useState(user?.phone ?? '');
  const [instructions, setInstructions] = useState('');
  const [sameAddress, setSameAddress] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [message, setMessage] = useState<ScreenMessage | null>(null);

  const catalogQuery = useQuery({
    queryKey: ['catalog', 'all'],
    queryFn: () => listCatalogRequest(),
  });

  const catalog = catalogQuery.data ?? [];

  useEffect(() => {
    if (!itemId || catalog.length === 0) return;

    const item = catalog.find((candidate) => candidate.id === itemId);

    if (!item) return;

    const treatment = item.availableTreatments[0] ?? 'lavage';

    setSelected((current) => {
      if (countFor(current, item.id, treatment) > 0) return current;

      return {
        ...current,
        [item.id]: {
          ...current[item.id],
          [treatment]: 1,
        },
      };
    });
    setModalVisible(true);
  }, [catalog, itemId]);

  const basketLines = useMemo<BasketLine[]>(
    () =>
      catalog.flatMap((item) =>
        TREATMENTS.filter(
          (treatment) =>
            item.availableTreatments.includes(treatment) &&
            countFor(selected, item.id, treatment) > 0,
        ).map((treatment) => {
          const quantity = countFor(selected, item.id, treatment);
          const unitPrice = item.prices[treatment];

          return {
            item,
            treatment,
            quantity,
            unitPrice,
            lineTotal: unitPrice * quantity,
          };
        }),
      ),
    [catalog, selected],
  );

  const selectedCount = basketLines.reduce((total, line) => total + line.quantity, 0);
  const localTotal = basketLines.reduce((total, line) => total + line.lineTotal, 0);

  const payload = useMemo<QuoteRequestInput>(() => {
    const pickupAddress = {
      label: 'Ramassage',
      text: pickup.text.trim(),
      coordinates: pickup.coordinates,
      contactName: contactName.trim(),
      contactPhone: contactPhone.trim(),
      ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
    };

    const deliveryAddress = sameAddress
      ? { ...pickupAddress, label: 'Livraison' }
      : {
          label: 'Livraison',
          text: delivery.text.trim(),
          coordinates: delivery.coordinates,
          contactName: contactName.trim(),
          contactPhone: contactPhone.trim(),
        };

    return {
      items: basketLines.map((line) => ({
        catalogItemId: line.item.id,
        treatment: line.treatment,
        quantity: line.quantity,
      })),
      pickup: pickupAddress,
      delivery: deliveryAddress,
      useSubscription: true,
      promoCode: null,
    };
  }, [basketLines, contactName, contactPhone, delivery, instructions, pickup, sameAddress]);

  const payloadKey = JSON.stringify(payload);

  useEffect(() => {
    setQuote(null);
    setMessage(null);
  }, [payloadKey]);

  const quoteMutation = useMutation({
    mutationFn: quoteOrderRequest,
    onSuccess: (data) => {
      setQuote(data);
      setMessage(null);
    },
    onError: (error) => {
      setMessage({
        tone: 'error',
        text:
          error instanceof ApiClientError
            ? error.message
            : 'Le devis n’a pas pu être calculé. Réessayez.',
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: createOrderRequest,
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['orders', 'me'] });
      void queryClient.invalidateQueries({ queryKey: ['subscriptions', 'me'] });
      router.replace({
        pathname: '/(app)/commande-detail',
        params: { id: data.order.id },
      });
    },
    onError: (error) => {
      setMessage({
        tone: 'error',
        text:
          error instanceof ApiClientError
            ? error.message
            : 'La commande n’a pas pu être créée. Réessayez.',
      });
    },
  });

  if (!user) return null;
  if (user.role !== 'client') return <Redirect href={roleHome(user.role)} />;

  const filteredCatalog = catalog.filter((item) => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    const matchesSearch =
      normalizedQuery.length === 0 ||
      item.name.toLowerCase().includes(normalizedQuery) ||
      item.material.toLowerCase().includes(normalizedQuery) ||
      CATEGORY_LABELS[item.category].toLowerCase().includes(normalizedQuery);

    return matchesCategory && matchesSearch;
  });

  const canQuote =
    selectedCount > 0 &&
    contactName.trim().length >= 2 &&
    /^\+[1-9]\d{7,14}$/.test(contactPhone.trim()) &&
    pickup.text.trim().length >= 5 &&
    (sameAddress || delivery.text.trim().length >= 5);

  const canCreate =
    Boolean(quote) && canQuote && !quoteMutation.isPending && !createMutation.isPending;

  function changeCount(id: string, treatment: Treatment, delta: number): void {
    setSelected((current) => {
      const nextCount = Math.max(0, countFor(current, id, treatment) + delta);
      const nextCounts = { ...current[id], [treatment]: nextCount };

      if (countTotal(nextCounts) === 0) {
        const next = { ...current };
        delete next[id];
        return next;
      }

      return { ...current, [id]: nextCounts };
    });
  }

  function submitQuote(): void {
    if (!canQuote) {
      setMessage({
        tone: 'error',
        text: 'Sélectionnez au moins un article, vérifiez les adresses et renseignez un téléphone au format +223…',
      });
      return;
    }

    quoteMutation.mutate(payload);
  }

  function submitOrder(): void {
    if (!quote) return;

    createMutation.mutate({
      ...payload,
      quoteToken: quote.quoteToken,
      paymentMethod,
    });
  }

  return (
    <Screen
      title="Commander"
      subtitle="Composez votre panier de linge, choisissez les adresses sur la carte, puis validez."
      onBack={() => router.back()}
    >
      <SectionTitle>1. Mon panier de linge</SectionTitle>

      {catalogQuery.isLoading ? <LoadingBlock label="Chargement du catalogue…" /> : null}

      {catalogQuery.isError ? (
        <Card>
          <InlineMessage tone="error">
            Le catalogue n’a pas pu être chargé. Vérifiez votre connexion.
          </InlineMessage>
          <SecondaryButton label="Réessayer" onPress={() => void catalogQuery.refetch()} />
        </Card>
      ) : null}

      {!catalogQuery.isLoading && !catalogQuery.isError && basketLines.length === 0 ? (
        <Card>
          <View style={styles.emptyBasket}>
            <View style={styles.emptyBasketIcon}>
              <Ionicons color={colors.brand[700]} name="basket-outline" size={32} />
            </View>
            <Text style={styles.emptyBasketTitle}>Votre panier est vide</Text>
            <Text style={styles.emptyBasketText}>
              Sélectionnez vos vêtements et le linge de maison, puis choisissez la formule de soin
              adaptée.
            </Text>
          </View>
          <PrimaryButton label="Ajouter un vêtement" onPress={() => setModalVisible(true)} />
        </Card>
      ) : null}

      {basketLines.length > 0 ? (
        <Card>
          <View style={styles.basketHeader}>
            <View>
              <Text style={styles.basketTitle}>
                {selectedCount} article{selectedCount > 1 ? 's' : ''}
              </Text>
              <Text style={styles.basketHint}>Prix catalogue estimé</Text>
            </View>
            <Text style={styles.basketTotal}>{formatXOF(localTotal)}</Text>
          </View>

          {basketLines.map((line) => (
            <View key={`${line.item.id}-${line.treatment}`} style={styles.basketRow}>
              <View style={styles.basketLineText}>
                <Text style={styles.basketItemName}>{line.item.name}</Text>
                <Text style={styles.basketItemMeta}>
                  {TREATMENT_LABELS[line.treatment]} · {formatXOF(line.unitPrice)} / pièce
                </Text>
                <Text style={styles.basketLineTotal}>{formatXOF(line.lineTotal)}</Text>
              </View>

              <View style={styles.stepper}>
                <Pressable
                  accessibilityLabel="Diminuer la quantité"
                  accessibilityRole="button"
                  onPress={() => changeCount(line.item.id, line.treatment, -1)}
                  style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}
                >
                  <Ionicons color={colors.textMuted} name="remove" size={17} />
                </Pressable>
                <Text style={styles.quantityValue}>{line.quantity}</Text>
                <Pressable
                  accessibilityLabel="Augmenter la quantité"
                  accessibilityRole="button"
                  onPress={() => changeCount(line.item.id, line.treatment, 1)}
                  style={({ pressed }) => [
                    styles.stepperButton,
                    styles.stepperButtonAdd,
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons color={colors.surface} name="add" size={17} />
                </Pressable>
              </View>
            </View>
          ))}

          <Pressable
            accessibilityRole="button"
            onPress={() => setModalVisible(true)}
            style={({ pressed }) => [styles.addMore, pressed && styles.pressed]}
          >
            <Ionicons color={colors.brand[700]} name="add-circle-outline" size={20} />
            <Text style={styles.addMoreText}>Ajouter d’autres articles</Text>
          </Pressable>
        </Card>
      ) : null}

      <SectionTitle>2. Ramassage et livraison</SectionTitle>

      <Card>
        <FormSection
          hint="Touchez une adresse pour l’ouvrir sur la carte, rechercher un lieu ou déplacer le repère."
          title="Adresses"
        >
          <AddressCard
            address={pickup}
            label="Ramassage"
            onPress={() =>
              router.push({
                pathname: '/(app)/adresse-picker',
                params: { target: 'pickup' },
              })
            }
          />

          <CheckRow
            checked={sameAddress}
            label="La livraison se fait à la même adresse"
            onToggle={() => setSameAddress((value) => !value)}
          />

          {sameAddress ? (
            <View style={styles.sameAddressNote}>
              <Ionicons color={colors.success} name="checkmark-circle" size={18} />
              <Text style={styles.sameAddressText}>
                Le linge sera livré à l’adresse de ramassage sélectionnée.
              </Text>
            </View>
          ) : (
            <AddressCard
              address={delivery}
              label="Livraison"
              onPress={() =>
                router.push({
                  pathname: '/(app)/adresse-picker',
                  params: { target: 'delivery' },
                })
              }
            />
          )}
        </FormSection>

        <RouteMap delivery={sameAddress ? undefined : delivery} height={200} pickup={pickup} />

        <FormSection title="Contact sur place">
          <Field
            label="Nom du contact"
            onChangeText={setContactName}
            placeholder="Nom du contact"
            value={contactName}
          />
          <Field
            keyboardType="phone-pad"
            label="Téléphone"
            onChangeText={setContactPhone}
            placeholder="+223..."
            value={contactPhone}
          />
          <Field
            label="Instructions (facultatif)"
            multiline
            onChangeText={setInstructions}
            placeholder="Code portail, étage, précisions…"
            value={instructions}
          />
        </FormSection>
      </Card>

      <SectionTitle>3. Paiement</SectionTitle>

      <Card>
        <View style={styles.paymentOptions}>
          {(
            [
              {
                key: 'cash' as const,
                label: 'Paiement à la livraison',
                icon: 'cash-outline' as const,
                hint: 'Le paiement est confirmé immédiatement.',
              },
              {
                key: 'orange_money' as const,
                label: 'Orange Money',
                icon: 'phone-portrait-outline' as const,
                hint: 'La commande reste en attente de paiement.',
              },
            ] satisfies {
              key: PaymentMethod;
              label: string;
              icon: keyof typeof Ionicons.glyphMap;
              hint: string;
            }[]
          ).map((option) => {
            const active = paymentMethod === option.key;

            return (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                key={option.key}
                onPress={() => setPaymentMethod(option.key)}
                style={({ pressed }) => [
                  styles.paymentOption,
                  active && styles.paymentOptionActive,
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.paymentIcon, active && styles.paymentIconActive]}>
                  <Ionicons
                    color={active ? colors.brand[700] : colors.textMuted}
                    name={option.icon}
                    size={20}
                  />
                </View>
                <View style={styles.paymentText}>
                  <Text style={[styles.paymentLabel, active && styles.paymentLabelActive]}>
                    {option.label}
                  </Text>
                  <Text style={styles.paymentHint}>{option.hint}</Text>
                </View>
                <View style={[styles.radio, active && styles.radioActive]}>
                  {active ? <View style={styles.radioDot} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <SectionTitle>4. Devis</SectionTitle>

      {message ? <InlineMessage tone={message.tone}>{message.text}</InlineMessage> : null}

      {quote ? (
        <Card>
          <View style={uiStyles.row}>
            <Text style={styles.totalLabel}>Articles</Text>
            <Text style={styles.totalValue}>{quote.totals.itemsCount}</Text>
          </View>
          <View style={uiStyles.row}>
            <Text style={styles.totalLabel}>Prix catalogue</Text>
            <Text style={styles.totalValue}>{formatXOF(quote.totals.catalogSubtotal)}</Text>
          </View>
          <View style={uiStyles.row}>
            <Text style={styles.totalLabel}>Couvert par le pack</Text>
            <Text style={styles.totalValue}>−{formatXOF(quote.totals.packCoveredAmount)}</Text>
          </View>
          <View style={uiStyles.row}>
            <Text style={styles.totalLabel}>Supplément</Text>
            <Text style={styles.totalValue}>{formatXOF(quote.totals.supplementAmount)}</Text>
          </View>
          <View style={uiStyles.row}>
            <Text style={styles.totalLabel}>Livraison</Text>
            <Text style={styles.totalValue}>{formatXOF(quote.totals.deliveryFee)}</Text>
          </View>
          <View style={[uiStyles.row, styles.totalRow]}>
            <Text style={styles.totalLabelStrong}>Total à payer</Text>
            <Text style={styles.totalValueStrong}>{formatXOF(quote.totals.totalDue)}</Text>
          </View>

          {quote.pack ? (
            <InlineMessage tone="info">
              {quote.pack.packName} · {quote.pack.coveredUnits} unité(s) couverte(s) ·{' '}
              {quote.pack.quotaAvailableAfter} unité(s) restante(s) après commande.
            </InlineMessage>
          ) : (
            <InlineMessage tone="info">
              Aucun pack actif : le prix catalogue et la livraison sont facturés.
            </InlineMessage>
          )}

          <PrimaryButton
            disabled={!canCreate}
            label={createMutation.isPending ? 'Création…' : 'Confirmer la commande'}
            loading={createMutation.isPending}
            onPress={submitOrder}
          />
        </Card>
      ) : (
        <Card>
          <Text style={styles.hint}>
            {selectedCount > 0
              ? `${selectedCount} article(s) sélectionné(s). Calculez le devis pour voir le total.`
              : 'Ajoutez au moins un article pour continuer.'}
          </Text>
          <PrimaryButton
            disabled={!canQuote}
            label="Calculer mon devis"
            loading={quoteMutation.isPending}
            onPress={submitQuote}
          />
        </Card>
      )}

      <Modal
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
        transparent
        visible={modalVisible}
      >
        <View style={styles.modalBackdrop}>
          <SafeAreaView edges={['bottom']} style={styles.modalSheet}>
            <View style={styles.modalHandle} />

            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderText}>
                <Text style={styles.modalTitle}>Catalogue & prestations</Text>
                <Text style={styles.modalSubtitle}>
                  Choisissez la formule de soin et la quantité pour chaque linge.
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Fermer le catalogue"
                accessibilityRole="button"
                onPress={() => setModalVisible(false)}
                style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
              >
                <Ionicons color={colors.textMuted} name="close" size={22} />
              </Pressable>
            </View>

            <View style={styles.searchBox}>
              <Ionicons color={colors.textMuted} name="search-outline" size={19} />
              <TextInput
                onChangeText={setSearchQuery}
                placeholder="Rechercher un vêtement… (ex : Bazin, Rideau)"
                placeholderTextColor={colors.neutral[400]}
                style={styles.searchInput}
                value={searchQuery}
              />
              {searchQuery.length > 0 ? (
                <Pressable
                  accessibilityLabel="Effacer la recherche"
                  accessibilityRole="button"
                  onPress={() => setSearchQuery('')}
                >
                  <Ionicons color={colors.neutral[400]} name="close-circle" size={18} />
                </Pressable>
              ) : null}
            </View>

            <View style={styles.filterWrap}>
              <FilterChips
                onSelect={(key) => setSelectedCategory(key as CategoryFilter)}
                options={CATEGORY_FILTERS}
                selected={selectedCategory}
              />
            </View>

            <ScrollView
              contentContainerStyle={styles.modalList}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {catalogQuery.isLoading ? (
                <View style={styles.modalLoading}>
                  <ActivityIndicator color={colors.brand[600]} />
                  <Text style={styles.modalLoadingText}>Chargement du catalogue…</Text>
                </View>
              ) : null}

              {filteredCatalog.map((item) => (
                <View key={item.id} style={styles.catalogCard}>
                  <View style={styles.catalogHeader}>
                    <View style={styles.catalogIcon}>
                      <Ionicons color={colors.brand[700]} name="shirt-outline" size={20} />
                    </View>
                    <View style={styles.catalogTitleBlock}>
                      <Text style={styles.catalogName}>{item.name}</Text>
                      <Text style={styles.catalogMeta}>
                        {CATEGORY_LABELS[item.category]}
                        {item.material ? ` · ${item.material}` : ''}
                      </Text>
                    </View>
                    <Pill label={`${item.quotaWeight} unité`} tone="brand" />
                  </View>

                  <View style={styles.treatmentList}>
                    {item.availableTreatments.map((treatment) => {
                      const count = countFor(selected, item.id, treatment);

                      return (
                        <View key={treatment} style={styles.treatmentRow}>
                          <View style={styles.treatmentText}>
                            <Text style={styles.treatmentLabel}>{TREATMENT_LABELS[treatment]}</Text>
                            <Text style={styles.treatmentPrice}>
                              {formatXOF(item.prices[treatment])} / pièce
                            </Text>
                          </View>

                          <View style={styles.stepper}>
                            {count > 0 ? (
                              <>
                                <Pressable
                                  accessibilityLabel="Diminuer la quantité"
                                  accessibilityRole="button"
                                  onPress={() => changeCount(item.id, treatment, -1)}
                                  style={({ pressed }) => [
                                    styles.stepperButton,
                                    pressed && styles.pressed,
                                  ]}
                                >
                                  <Ionicons color={colors.textMuted} name="remove" size={16} />
                                </Pressable>
                                <Text style={styles.quantityValue}>{count}</Text>
                              </>
                            ) : null}
                            <Pressable
                              accessibilityLabel="Augmenter la quantité"
                              accessibilityRole="button"
                              onPress={() => changeCount(item.id, treatment, 1)}
                              style={({ pressed }) => [
                                styles.stepperButton,
                                styles.stepperButtonAdd,
                                pressed && styles.pressed,
                              ]}
                            >
                              <Ionicons color={colors.surface} name="add" size={16} />
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}

              {!catalogQuery.isLoading && filteredCatalog.length === 0 ? (
                <EmptyState
                  message="Essayez une autre recherche ou une autre catégorie."
                  title="Aucun article trouvé"
                />
              ) : null}
            </ScrollView>

            <View style={styles.modalFooter}>
              <View>
                <Text style={styles.modalFooterLabel}>
                  {selectedCount} article{selectedCount > 1 ? 's' : ''}
                </Text>
                <Text style={styles.modalFooterTotal}>{formatXOF(localTotal)}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => setModalVisible(false)}
                style={({ pressed }) => [styles.confirmButton, pressed && styles.pressed]}
              >
                <Text style={styles.confirmButtonText}>Valider la sélection</Text>
                <Ionicons color={colors.surface} name="arrow-forward" size={17} />
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  emptyBasket: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  emptyBasketIcon: {
    alignItems: 'center',
    backgroundColor: colors.brand[50],
    borderRadius: radius.pill,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  emptyBasketTitle: {
    ...typography.title,
    color: colors.text,
    fontSize: 18,
    lineHeight: 24,
    textAlign: 'center',
  },
  emptyBasketText: {
    ...typography.caption,
    color: colors.textMuted,
    lineHeight: 19,
    textAlign: 'center',
  },
  basketHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  basketTitle: {
    ...typography.title,
    color: colors.text,
    fontSize: 18,
    lineHeight: 24,
  },
  basketHint: {
    ...typography.caption,
    color: colors.textMuted,
  },
  basketTotal: {
    ...typography.title,
    color: colors.brand[700],
    fontSize: 20,
    lineHeight: 26,
  },
  basketRow: {
    alignItems: 'center',
    borderColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    paddingTop: spacing.md,
  },
  basketLineText: {
    flex: 1,
    gap: 1,
  },
  basketItemName: {
    ...typography.body,
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  basketItemMeta: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  basketLineTotal: {
    ...typography.caption,
    color: colors.brand[700],
    fontWeight: '700',
    marginTop: 2,
  },
  stepper: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stepperButton: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  stepperButtonAdd: {
    backgroundColor: colors.brand[600],
    borderColor: colors.brand[600],
  },
  quantityValue: {
    ...typography.body,
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    minWidth: 18,
    textAlign: 'center',
  },
  addMore: {
    alignItems: 'center',
    backgroundColor: colors.brand[50],
    borderColor: colors.brand[100],
    borderRadius: radius.md,
    borderStyle: 'dashed',
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    padding: spacing.md,
  },
  addMoreText: {
    ...typography.caption,
    color: colors.brand[700],
    fontWeight: '700',
  },
  addressCard: {
    alignItems: 'flex-start',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  addressIcon: {
    alignItems: 'center',
    backgroundColor: colors.brand[50],
    borderRadius: radius.md,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  addressContent: {
    flex: 1,
    gap: 2,
  },
  addressLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  addressText: {
    ...typography.body,
    color: colors.text,
    fontSize: 14,
    lineHeight: 19,
  },
  addressCoordinates: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
  },
  addressAction: {
    ...typography.caption,
    color: colors.brand[700],
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },
  sameAddressNote: {
    alignItems: 'center',
    backgroundColor: colors.successSurface,
    borderColor: colors.successBorder,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  sameAddressText: {
    ...typography.caption,
    color: colors.success,
    flex: 1,
    fontSize: 12,
  },
  paymentOptions: {
    gap: spacing.sm,
  },
  paymentOption: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  paymentOptionActive: {
    backgroundColor: colors.brand[50],
    borderColor: colors.brand[600],
  },
  paymentIcon: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  paymentIconActive: {
    backgroundColor: colors.surface,
  },
  paymentText: {
    flex: 1,
    gap: 1,
  },
  paymentLabel: {
    ...typography.body,
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  paymentLabelActive: {
    color: colors.brand[700],
  },
  paymentHint: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  radio: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  radioActive: {
    borderColor: colors.brand[600],
  },
  radioDot: {
    backgroundColor: colors.brand[600],
    borderRadius: radius.pill,
    height: 10,
    width: 10,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    lineHeight: 18,
  },
  totalLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  totalValue: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '700',
  },
  totalRow: {
    borderColor: colors.border,
    borderTopWidth: 1,
    paddingTop: spacing.sm,
  },
  totalLabelStrong: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
  },
  totalValueStrong: {
    ...typography.title,
    color: colors.brand[700],
    fontSize: 18,
    lineHeight: 24,
  },
  pressed: {
    opacity: 0.75,
  },
  modalBackdrop: {
    backgroundColor: 'rgba(17,24,39,0.55)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '92%',
    minHeight: '70%',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  modalHandle: {
    alignSelf: 'center',
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    height: 4,
    marginBottom: spacing.sm,
    width: 48,
  },
  modalHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  modalHeaderText: {
    flex: 1,
    gap: 2,
  },
  modalTitle: {
    ...typography.title,
    color: colors.text,
    fontSize: 20,
    lineHeight: 26,
  },
  modalSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  filterWrap: {
    flexGrow: 0,
    flexShrink: 0,
    marginBottom: spacing.sm,
  },
  modalList: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  modalLoading: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  modalLoadingText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  catalogCard: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  catalogHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  catalogIcon: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  catalogTitleBlock: {
    flex: 1,
    gap: 1,
  },
  catalogName: {
    ...typography.body,
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  catalogMeta: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  treatmentList: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
  },
  treatmentRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    minHeight: 54,
    paddingVertical: spacing.sm,
  },
  treatmentText: {
    flex: 1,
    gap: 1,
  },
  treatmentLabel: {
    ...typography.caption,
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  treatmentPrice: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 14,
  },
  modalFooter: {
    alignItems: 'center',
    borderColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
    paddingTop: spacing.md,
  },
  modalFooterLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
  },
  modalFooterTotal: {
    ...typography.title,
    color: colors.brand[700],
    fontSize: 18,
    lineHeight: 24,
  },
  confirmButton: {
    alignItems: 'center',
    backgroundColor: colors.brand[600],
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 46,
    paddingHorizontal: spacing.lg,
  },
  confirmButtonText: {
    ...typography.body,
    color: colors.surface,
    fontSize: 14,
    fontWeight: '700',
  },
});
