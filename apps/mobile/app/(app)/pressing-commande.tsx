import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClientOrderItem, PressingTransitionStatus } from '@finiko/contracts';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiClientError } from '../../src/api/client';
import {
  getPressingOrderRequest,
  transitionPressingOrderRequest,
  updatePressingItemsRequest,
} from '../../src/api/pressing';
import { formatDateTime, formatXOF } from '../../src/lib/format';
import {
  ORDER_PAYMENT_METHOD_LABELS,
  ORDER_PAYMENT_STATUS_LABELS,
  TREATMENT_LABELS,
} from '../../src/lib/labels';
import { roleHome } from '../../src/lib/role-home';
import { useAuthStore } from '../../src/stores/auth.store';
import { InlineMessage, PrimaryButton, SecondaryButton } from '../../src/ui/auth';
import { EmptyState, LoadingBlock, Pill, Screen } from '../../src/ui/screen';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

type PillTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';
type Feedback = { tone: 'success' | 'error' | 'info'; text: string } | null;

function statusTone(status: string): PillTone {
  if (status === 'prete' || status === 'terminee' || status === 'livree') return 'success';
  if (status === 'litige' || status === 'annulee') return 'danger';
  if (status === 'deposee_au_pressing' || status === 'en_traitement') return 'warning';
  return 'brand';
}

function itemTone(status: ClientOrderItem['treatmentStatus']): PillTone {
  if (status === 'termine') return 'success';
  if (status === 'en_cours') return 'warning';
  return 'neutral';
}

function itemStatusLabel(status: ClientOrderItem['treatmentStatus']): string {
  if (status === 'termine') return 'Terminé';
  if (status === 'en_cours') return 'En cours';
  return 'À traiter';
}

function nextItemStatus(
  status: ClientOrderItem['treatmentStatus'],
): ClientOrderItem['treatmentStatus'] {
  if (status === 'a_traiter') return 'en_cours';
  if (status === 'en_cours') return 'termine';
  return 'a_traiter';
}

function nextItemAction(status: ClientOrderItem['treatmentStatus']): string {
  if (status === 'a_traiter') return 'Commencer';
  if (status === 'en_cours') return 'Terminer';
  return 'Reprendre';
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export default function PressingOrderScreen() {
  const user = useAuthStore((state) => state.user);
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<Feedback>(null);

  const orderQuery = useQuery({
    queryKey: ['pressing', 'order', id],
    queryFn: () => getPressingOrderRequest(id),
    enabled: user?.role === 'pressing' && Boolean(id),
    refetchInterval: 10000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['pressing', 'orders'] });
  };

  const transitionMutation = useMutation({
    mutationFn: (status: PressingTransitionStatus) =>
      transitionPressingOrderRequest(id, { status }),
    onSuccess: (order) => {
      queryClient.setQueryData(['pressing', 'order', id], order);
      invalidate();
      setFeedback({ tone: 'success', text: 'Statut de la commande mis à jour.' });
    },
    onError: (error) => {
      setFeedback({
        tone: 'error',
        text:
          error instanceof ApiClientError
            ? error.message
            : 'Impossible de mettre à jour le statut de la commande.',
      });
    },
  });

  const itemsMutation = useMutation({
    mutationFn: (payload: { index: number; status: ClientOrderItem['treatmentStatus'] }) =>
      updatePressingItemsRequest(id, { items: [payload] }),
    onSuccess: (order) => {
      queryClient.setQueryData(['pressing', 'order', id], order);
      invalidate();
      setFeedback({ tone: 'success', text: 'Article mis à jour.' });
    },
    onError: (error) => {
      setFeedback({
        tone: 'error',
        text:
          error instanceof ApiClientError
            ? error.message
            : 'Impossible de mettre à jour cet article.',
      });
    },
  });

  if (!user) return null;
  if (user.role !== 'pressing') return <Redirect href={roleHome(user.role)} />;

  const order = orderQuery.data;

  const callClient = () => {
    if (!order) return;
    void Linking.openURL(`tel:${order.client.phone.replace(/\s/g, '')}`);
  };

  const confirmTransition = (status: PressingTransitionStatus, title: string, message: string) => {
    Alert.alert(title, message, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Confirmer',
        onPress: () => {
          setFeedback(null);
          transitionMutation.mutate(status);
        },
      },
    ]);
  };

  const allItemsCompleted =
    order?.items.every((item) => item.treatmentStatus === 'termine') ?? false;
  const canEditItems = order?.status === 'au_pressing' || order?.status === 'en_traitement';

  return (
    <Screen
      onBack={() => router.back()}
      subtitle={order ? order.statusLabel : 'Chargement de la commande'}
      title={order ? `Commande ${order.orderNumber}` : 'Commande pressing'}
    >
      {orderQuery.isLoading ? <LoadingBlock label="Chargement de la commande…" /> : null}

      {orderQuery.isError ? (
        <View style={styles.errorCard}>
          <InlineMessage tone="error">
            Cette commande n’a pas pu être chargée. Vérifiez votre connexion.
          </InlineMessage>
          <SecondaryButton label="Réessayer" onPress={() => void orderQuery.refetch()} />
        </View>
      ) : null}

      {!orderQuery.isLoading && !orderQuery.isError && !order ? (
        <EmptyState
          message="Cette commande n’est plus disponible dans votre file pressing."
          title="Commande introuvable"
        />
      ) : null}

      {order ? (
        <>
          <View style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View style={styles.heroIdentity}>
                <Text style={styles.heroClient}>{order.client.name}</Text>
                <Text style={styles.heroPhone}>{order.client.phone}</Text>
              </View>
              <Pill label={order.statusLabel} tone={statusTone(order.status)} />
            </View>

            <View style={styles.heroStats}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>{order.itemsCount}</Text>
                <Text style={styles.heroStatLabel}>Articles</Text>
              </View>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>{order.completedItems}</Text>
                <Text style={styles.heroStatLabel}>Terminés</Text>
              </View>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>{order.pendingItems}</Text>
                <Text style={styles.heroStatLabel}>À traiter</Text>
              </View>
            </View>

            <View style={styles.heroActions}>
              <Pressable
                accessibilityRole="button"
                onPress={callClient}
                style={({ pressed }) => [styles.callButton, pressed && styles.pressed]}
              >
                <Ionicons color={colors.brand[700]} name="call-outline" size={17} />
                <Text style={styles.callButtonText}>Appeler le client</Text>
              </Pressable>
              <Text style={styles.heroAmount}>{formatXOF(order.totalDue)}</Text>
            </View>
          </View>

          {feedback ? (
            <View style={styles.feedback}>
              <InlineMessage tone={feedback.tone}>{feedback.text}</InlineMessage>
            </View>
          ) : null}

          <SectionTitle>Actions pressing</SectionTitle>

          <View style={styles.actionCard}>
            {order.status === 'deposee_au_pressing' ? (
              <PrimaryButton
                label="Réceptionner la commande"
                loading={transitionMutation.isPending}
                onPress={() =>
                  confirmTransition(
                    'au_pressing',
                    'Réceptionner la commande',
                    'Confirmez-vous la réception du linge au pressing ?',
                  )
                }
              />
            ) : null}

            {order.status === 'au_pressing' ? (
              <PrimaryButton
                label="Démarrer le traitement"
                loading={transitionMutation.isPending}
                onPress={() =>
                  confirmTransition(
                    'en_traitement',
                    'Démarrer le traitement',
                    'Le linge est prêt à être traité article par article.',
                  )
                }
              />
            ) : null}

            {order.status === 'en_traitement' ? (
              <>
                {allItemsCompleted ? (
                  <PrimaryButton
                    label="Marquer la commande prête"
                    loading={transitionMutation.isPending}
                    onPress={() =>
                      confirmTransition(
                        'prete',
                        'Marquer comme prête',
                        'Tous les articles sont terminés. Le livreur pourra prendre en charge la livraison.',
                      )
                    }
                  />
                ) : (
                  <InlineMessage tone="info">
                    Terminez tous les articles ci-dessous pour pouvoir marquer la commande prête.
                  </InlineMessage>
                )}
              </>
            ) : null}

            {order.status === 'prete' ? (
              <InlineMessage tone="success">
                Cette commande est prête. Elle attend la prise en charge par le livreur.
              </InlineMessage>
            ) : null}

            {!['deposee_au_pressing', 'au_pressing', 'en_traitement', 'prete'].includes(
              order.status,
            ) ? (
              <InlineMessage tone="info">
                Cette commande est sortie de la file pressing. Consultez l’historique pour la
                retrouver.
              </InlineMessage>
            ) : null}
          </View>

          <SectionTitle>Articles à traiter</SectionTitle>

          <View style={styles.itemsCard}>
            {order.items.map((item, index) => {
              const busy = itemsMutation.isPending && itemsMutation.variables?.index === index;

              return (
                <View key={`${item.catalogItemId}-${index}`} style={styles.itemRow}>
                  <View style={styles.itemText}>
                    <View style={styles.itemTitleRow}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Pill
                        label={itemStatusLabel(item.treatmentStatus)}
                        tone={itemTone(item.treatmentStatus)}
                      />
                    </View>
                    <Text style={styles.itemMeta}>
                      {item.quantity} × {TREATMENT_LABELS[item.treatment]} ·{' '}
                      {formatXOF(item.lineTotal)}
                    </Text>
                    {item.treatmentCompletedAt ? (
                      <Text style={styles.itemDate}>
                        Terminé le {formatDateTime(item.treatmentCompletedAt)}
                      </Text>
                    ) : null}
                  </View>

                  {canEditItems ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={itemsMutation.isPending}
                      onPress={() => {
                        setFeedback(null);
                        itemsMutation.mutate({
                          index,
                          status: nextItemStatus(item.treatmentStatus),
                        });
                      }}
                      style={({ pressed }) => [
                        styles.itemAction,
                        item.treatmentStatus === 'en_cours' && styles.itemActionSuccess,
                        item.treatmentStatus === 'termine' && styles.itemActionNeutral,
                        pressed && styles.pressed,
                        itemsMutation.isPending && styles.disabled,
                      ]}
                    >
                      {busy ? (
                        <ActivityIndicator color={colors.brand[700]} size="small" />
                      ) : (
                        <Text
                          style={[
                            styles.itemActionText,
                            item.treatmentStatus === 'en_cours' && styles.itemActionTextLight,
                          ]}
                        >
                          {nextItemAction(item.treatmentStatus)}
                        </Text>
                      )}
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>

          <SectionTitle>Adresses</SectionTitle>

          <View style={styles.addressCard}>
            <View style={styles.addressRow}>
              <View style={[styles.addressDot, styles.addressDotPickup]} />
              <View style={styles.addressTextBlock}>
                <Text style={styles.addressLabel}>Ramassage</Text>
                <Text style={styles.addressText}>{order.pickup.text}</Text>
                <Text style={styles.addressContact}>
                  {order.pickup.contactName} · {order.pickup.contactPhone}
                </Text>
              </View>
            </View>
            <View style={styles.addressSeparator} />
            <View style={styles.addressRow}>
              <View style={[styles.addressDot, styles.addressDotDelivery]} />
              <View style={styles.addressTextBlock}>
                <Text style={styles.addressLabel}>Livraison</Text>
                <Text style={styles.addressText}>{order.delivery.text}</Text>
                <Text style={styles.addressContact}>
                  {order.delivery.contactName} · {order.delivery.contactPhone}
                </Text>
              </View>
            </View>
          </View>

          <SectionTitle>Paiement</SectionTitle>

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Moyen</Text>
              <Text style={styles.infoValue}>
                {ORDER_PAYMENT_METHOD_LABELS[order.payment.method]}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Statut</Text>
              <Text style={styles.infoValue}>
                {ORDER_PAYMENT_STATUS_LABELS[order.payment.status]}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Total</Text>
              <Text style={styles.infoValue}>{formatXOF(order.totalDue)}</Text>
            </View>
          </View>

          <SectionTitle>Suivi</SectionTitle>

          <View style={styles.infoCard}>
            {order.timeline.map((entry) => (
              <View key={entry.key} style={styles.timelineRow}>
                <View
                  style={[
                    styles.timelineDot,
                    entry.reached && styles.timelineDotReached,
                    entry.current && styles.timelineDotCurrent,
                  ]}
                />
                <View style={styles.timelineText}>
                  <Text
                    style={[
                      styles.timelineLabel,
                      entry.reached && styles.timelineLabelReached,
                      entry.current && styles.timelineLabelCurrent,
                    ]}
                  >
                    {entry.label}
                  </Text>
                  <Text style={styles.timelineDate}>
                    {entry.at ? formatDateTime(entry.at) : 'En attente'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </Screen>
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
  heroCard: {
    backgroundColor: colors.brand[900],
    borderRadius: radius.lg,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  heroTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  heroIdentity: {
    flex: 1,
    gap: 2,
  },
  heroClient: {
    ...typography.title,
    color: colors.surface,
    fontSize: 19,
    lineHeight: 24,
  },
  heroPhone: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.72)',
  },
  heroStats: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  heroStat: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.md,
    flex: 1,
    gap: 2,
    padding: spacing.md,
  },
  heroStatValue: {
    ...typography.title,
    color: colors.surface,
    fontSize: 20,
    lineHeight: 24,
  },
  heroStatLabel: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.72)',
    fontSize: 11,
  },
  heroActions: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  callButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  callButtonText: {
    ...typography.caption,
    color: colors.brand[700],
    fontWeight: '700',
  },
  heroAmount: {
    ...typography.title,
    color: colors.surface,
    fontSize: 18,
  },
  feedback: {
    marginTop: spacing.md,
  },
  sectionTitle: {
    ...typography.title,
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    marginBottom: spacing.sm,
    marginTop: spacing.xl,
  },
  actionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  itemsCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  itemRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  itemText: {
    flex: 1,
    gap: 3,
  },
  itemTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  itemName: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
  },
  itemMeta: {
    ...typography.caption,
    color: colors.textMuted,
  },
  itemDate: {
    ...typography.caption,
    color: colors.success,
    fontSize: 11,
  },
  itemAction: {
    alignItems: 'center',
    backgroundColor: colors.brand[50],
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 82,
    paddingHorizontal: spacing.md,
  },
  itemActionSuccess: {
    backgroundColor: colors.success,
  },
  itemActionNeutral: {
    backgroundColor: colors.background,
  },
  itemActionText: {
    ...typography.caption,
    color: colors.brand[700],
    fontWeight: '700',
  },
  itemActionTextLight: {
    color: colors.surface,
  },
  addressCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  addressRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
  },
  addressDot: {
    borderRadius: radius.pill,
    height: 10,
    marginTop: 4,
    width: 10,
  },
  addressDotPickup: {
    backgroundColor: colors.brand[600],
  },
  addressDotDelivery: {
    backgroundColor: colors.success,
  },
  addressTextBlock: {
    flex: 1,
    gap: 2,
  },
  addressLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  addressText: {
    ...typography.body,
    color: colors.text,
  },
  addressContact: {
    ...typography.caption,
    color: colors.textMuted,
  },
  addressSeparator: {
    backgroundColor: colors.border,
    height: 1,
    marginVertical: spacing.md,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  infoRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  infoLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  infoValue: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '700',
  },
  timelineRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  timelineDot: {
    backgroundColor: colors.neutral[200],
    borderRadius: radius.pill,
    height: 10,
    marginTop: 3,
    width: 10,
  },
  timelineDotReached: {
    backgroundColor: colors.brand[500],
  },
  timelineDotCurrent: {
    backgroundColor: colors.brand[700],
    transform: [{ scale: 1.25 }],
  },
  timelineText: {
    flex: 1,
    gap: 1,
  },
  timelineLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  timelineLabelReached: {
    color: colors.text,
    fontWeight: '600',
  },
  timelineLabelCurrent: {
    color: colors.brand[700],
    fontWeight: '700',
  },
  timelineDate: {
    ...typography.caption,
    color: colors.neutral[400],
    fontSize: 11,
  },
  pressed: {
    opacity: 0.75,
  },
  disabled: {
    opacity: 0.55,
  },
});
