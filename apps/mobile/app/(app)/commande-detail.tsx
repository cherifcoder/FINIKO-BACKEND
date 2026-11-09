import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ItemTreatmentStatus, OrderStatus } from '@finiko/contracts';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiClientError } from '../../src/api/client';
import {
  cancelMyOrderRequest,
  confirmMyOrderDeliveryRequest,
  disputeMyOrderRequest,
  getMyOrderRequest,
} from '../../src/api/orders';
import { formatDate, formatDateTime, formatXOF } from '../../src/lib/format';
import { openGoogleMapsDirections } from '../../src/lib/maps';
import {
  ORDER_PAYMENT_METHOD_LABELS,
  ORDER_PAYMENT_STATUS_LABELS,
  TREATMENT_LABELS,
} from '../../src/lib/labels';
import { roleHome } from '../../src/lib/role-home';
import { useAuthStore } from '../../src/stores/auth.store';
import { DangerButton, InlineMessage, PrimaryButton, SecondaryButton } from '../../src/ui/auth';
import { RouteMap } from '../../src/ui/map';
import {
  EmptyState,
  LoadingBlock,
  Pill,
  Screen,
  SectionTitle,
  uiStyles,
} from '../../src/ui/screen';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

type PillTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';

const ITEM_STATUS_LABELS: Record<ItemTreatmentStatus, string> = {
  a_traiter: 'À traiter',
  en_cours: 'En cours',
  termine: 'Terminé',
};

const DISPUTE_STATUS_LABELS = {
  ouvert: 'Ouvert',
  en_examen: 'En examen',
  resolu: 'Résolu',
  ferme: 'Fermé',
} as const;

function statusTone(status: OrderStatus): PillTone {
  if (status === 'annulee') return 'danger';
  if (status === 'litige') return 'warning';
  if (status === 'terminee' || status === 'livree') return 'success';
  if (status === 'en_attente_paiement') return 'warning';
  return 'brand';
}

function itemStatusTone(status: ItemTreatmentStatus): PillTone {
  if (status === 'termine') return 'success';
  if (status === 'en_cours') return 'warning';
  return 'neutral';
}

export default function CommandeDetailScreen() {
  const user = useAuthStore((state) => state.user);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const orderId = typeof id === 'string' ? id : '';
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');

  const orderQuery = useQuery({
    queryKey: ['orders', 'me', orderId],
    queryFn: () => getMyOrderRequest(orderId),
    enabled: Boolean(orderId),
  });

  const cancelMutation = useMutation({
    mutationFn: () =>
      cancelMyOrderRequest(orderId, { reason: 'Annulation demandée par le client' }),
    onSuccess: (data) => {
      queryClient.setQueryData(['orders', 'me', orderId], data.order);
      void queryClient.invalidateQueries({ queryKey: ['orders', 'me'] });
      void queryClient.invalidateQueries({ queryKey: ['subscriptions', 'me'] });
      setMessage({
        tone: 'success',
        text: data.quotaReleased
          ? 'Commande annulée. Le quota réservé a été libéré.'
          : 'Commande annulée.',
      });
    },
    onError: (error) => {
      setMessage({
        tone: 'error',
        text:
          error instanceof ApiClientError
            ? error.message
            : 'La commande n’a pas pu être annulée. Réessayez.',
      });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: () => confirmMyOrderDeliveryRequest(orderId),
    onSuccess: (updated) => {
      queryClient.setQueryData(['orders', 'me', orderId], updated);
      void queryClient.invalidateQueries({ queryKey: ['orders', 'me'] });
      setMessage({ tone: 'success', text: 'Réception confirmée. Merci d’avoir utilisé FINIKO.' });
    },
    onError: (error) => {
      setMessage({
        tone: 'error',
        text:
          error instanceof ApiClientError
            ? error.message
            : 'La réception n’a pas pu être confirmée. Réessayez.',
      });
    },
  });

  const disputeMutation = useMutation({
    mutationFn: (reason: string) => disputeMyOrderRequest(orderId, { reason }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['orders', 'me', orderId], updated);
      void queryClient.invalidateQueries({ queryKey: ['orders', 'me'] });
      setDisputeOpen(false);
      setDisputeReason('');
      setMessage({
        tone: 'success',
        text: 'Litige enregistré. Notre équipe vous contactera rapidement.',
      });
    },
    onError: (error) => {
      setMessage({
        tone: 'error',
        text:
          error instanceof ApiClientError
            ? error.message
            : 'Le litige n’a pas pu être enregistré. Réessayez.',
      });
    },
  });

  if (!user) return null;
  if (user.role !== 'client') return <Redirect href={roleHome(user.role)} />;

  const order = orderQuery.data;

  function confirmCancel(): void {
    Alert.alert(
      'Annuler la commande',
      'Le ramassage ne sera pas effectué. Le quota réservé sera libéré.',
      [
        { text: 'Retour', style: 'cancel' },
        {
          text: 'Annuler la commande',
          style: 'destructive',
          onPress: () => cancelMutation.mutate(),
        },
      ],
    );
  }

  function confirmDelivery(): void {
    Alert.alert(
      'Confirmer la réception',
      'Confirmez-vous avoir bien reçu votre linge et que tout est conforme ?',
      [
        { text: 'Pas encore', style: 'cancel' },
        {
          text: 'Oui, confirmer',
          onPress: () => confirmMutation.mutate(),
        },
      ],
    );
  }

  function submitDispute(): void {
    const reason = disputeReason.trim();

    if (reason.length < 3) {
      setMessage({ tone: 'error', text: 'Précisez le motif du litige (3 caractères minimum).' });
      return;
    }

    disputeMutation.mutate(reason);
  }

  if (!orderId) {
    return (
      <Screen title="Commande" onBack={() => router.back()}>
        <EmptyState title="Commande introuvable" message="Aucun identifiant de commande fourni." />
      </Screen>
    );
  }

  if (orderQuery.isLoading) {
    return (
      <Screen title="Suivi de commande" onBack={() => router.back()}>
        <LoadingBlock label="Chargement du suivi…" />
      </Screen>
    );
  }

  if (orderQuery.isError || !order) {
    return (
      <Screen title="Suivi de commande" onBack={() => router.back()}>
        <EmptyState
          title="Commande introuvable"
          message="Cette commande n’existe pas ou n’est plus accessible."
          action={<SecondaryButton label="Réessayer" onPress={() => void orderQuery.refetch()} />}
        />
      </Screen>
    );
  }

  return (
    <Screen
      title={order.orderNumber}
      subtitle={`Passée le ${formatDate(order.createdAt)}`}
      onBack={() => router.back()}
    >
      {message ? <InlineMessage tone={message.tone}>{message.text}</InlineMessage> : null}

      {order.status === 'annulee' ? (
        <InlineMessage tone="error">
          Commande annulée
          {order.cancellation.reason ? ` · ${order.cancellation.reason}` : ''}.
        </InlineMessage>
      ) : null}

      {order.status === 'litige' ? (
        <InlineMessage tone="info">
          Un litige est en cours sur cette commande. L’équipe FINIKO vous contacte si nécessaire.
        </InlineMessage>
      ) : null}

      <View style={styles.hero}>
        <View style={styles.heroHeader}>
          <View style={styles.heroText}>
            <Text style={styles.heroEyebrow}>Statut actuel</Text>
            <Text style={styles.heroTitle}>{order.statusLabel}</Text>
            <Text style={styles.heroMeta}>
              {order.itemsCount} article{order.itemsCount > 1 ? 's' : ''} ·{' '}
              {ORDER_PAYMENT_METHOD_LABELS[order.paymentMethod]}
            </Text>
          </View>
          <Pill label={order.statusLabel} tone={statusTone(order.status)} />
        </View>
        <View style={styles.heroTotals}>
          <View>
            <Text style={styles.heroTotalLabel}>Total dû</Text>
            <Text style={styles.heroTotalValue}>{formatXOF(order.totalDue)}</Text>
          </View>
          <View>
            <Text style={styles.heroTotalLabel}>Déjà payé</Text>
            <Text style={styles.heroTotalValue}>{formatXOF(order.totalPaid)}</Text>
          </View>
        </View>
      </View>

      <SectionTitle>Suivi du linge</SectionTitle>

      <View style={styles.timelineCard}>
        {order.timeline.map((entry, index) => (
          <View key={entry.key} style={styles.timelineRow}>
            <View style={styles.timelineMarker}>
              <View
                style={[
                  styles.timelineDot,
                  entry.reached && styles.timelineDotReached,
                  entry.current && styles.timelineDotCurrent,
                ]}
              >
                {entry.reached ? <Text style={styles.timelineCheck}>✓</Text> : null}
              </View>
              {index < order.timeline.length - 1 ? (
                <View style={[styles.timelineLine, entry.reached && styles.timelineLineReached]} />
              ) : null}
            </View>
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
              {entry.at ? (
                <Text style={styles.timelineDate}>{formatDateTime(entry.at)}</Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>

      <SectionTitle>Mes articles</SectionTitle>

      {order.items.map((item, index) => (
        <View key={`${item.catalogItemId}-${item.treatment}-${index}`} style={styles.card}>
          <View style={styles.itemHeader}>
            <View style={styles.itemHeaderText}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemMeta}>
                {TREATMENT_LABELS[item.treatment]} · {item.quantity} × {formatXOF(item.unitPrice)}
              </Text>
            </View>
            <Pill
              label={ITEM_STATUS_LABELS[item.treatmentStatus]}
              tone={itemStatusTone(item.treatmentStatus)}
            />
          </View>

          <View style={uiStyles.row}>
            <Text style={styles.rowLabel}>Total ligne</Text>
            <Text style={styles.rowValue}>{formatXOF(item.lineTotal)}</Text>
          </View>

          {item.coveredQuantity > 0 ? (
            <Text style={styles.coverage}>
              {item.coveredQuantity} article(s) couvert(s) par le pack ·{' '}
              {formatXOF(item.coveredAmount)}
            </Text>
          ) : null}

          {item.billableQuantity > 0 ? (
            <Text style={styles.coverage}>
              {item.billableQuantity} article(s) facturé(s) · {formatXOF(item.billableAmount)}
            </Text>
          ) : null}
        </View>
      ))}

      <SectionTitle>Récapitulatif</SectionTitle>

      <View style={styles.card}>
        <View style={uiStyles.row}>
          <Text style={styles.rowLabel}>Prix catalogue</Text>
          <Text style={styles.rowValue}>{formatXOF(order.totals.catalogSubtotal)}</Text>
        </View>
        <View style={uiStyles.row}>
          <Text style={styles.rowLabel}>Couvert par le pack</Text>
          <Text style={styles.rowValue}>−{formatXOF(order.totals.packCoveredAmount)}</Text>
        </View>
        <View style={uiStyles.row}>
          <Text style={styles.rowLabel}>Supplément</Text>
          <Text style={styles.rowValue}>{formatXOF(order.totals.supplementAmount)}</Text>
        </View>
        <View style={uiStyles.row}>
          <Text style={styles.rowLabel}>Livraison</Text>
          <Text style={styles.rowValue}>{formatXOF(order.totals.deliveryFee)}</Text>
        </View>
        <View style={[uiStyles.row, styles.totalRow]}>
          <Text style={styles.rowLabelStrong}>Total à payer</Text>
          <Text style={styles.rowValueStrong}>{formatXOF(order.totals.totalDue)}</Text>
        </View>

        {order.pack ? (
          <Text style={styles.coverage}>
            {order.pack.packName ?? 'Pack'} · {order.pack.coveredUnits} unité(s) couverte(s) ·{' '}
            {order.pack.overageUnits} unité(s) hors quota.
          </Text>
        ) : null}
      </View>

      <SectionTitle>Adresses</SectionTitle>

      <View style={styles.card}>
        <View style={styles.addressBlock}>
          <Text style={styles.addressLabel}>Ramassage</Text>
          <Text style={styles.addressText}>{order.pickup.text}</Text>
          <Text style={styles.addressContact}>
            {order.pickup.contactName} · {order.pickup.contactPhone}
          </Text>
          {order.pickup.instructions ? (
            <Text style={styles.addressNote}>{order.pickup.instructions}</Text>
          ) : null}
        </View>
        <View style={styles.addressDivider} />
        <View style={styles.addressBlock}>
          <Text style={styles.addressLabel}>Livraison</Text>
          <Text style={styles.addressText}>{order.delivery.text}</Text>
          <Text style={styles.addressContact}>
            {order.delivery.contactName} · {order.delivery.contactPhone}
          </Text>
          {order.delivery.instructions ? (
            <Text style={styles.addressNote}>{order.delivery.instructions}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.mapCard}>
        <RouteMap delivery={order.delivery} height={220} pickup={order.pickup} />
      </View>

      <View style={styles.mapActions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => void openGoogleMapsDirections(order.pickup.coordinates)}
          style={({ pressed }) => [styles.mapButton, pressed && styles.pressed]}
        >
          <Ionicons color={colors.brand[700]} name="navigate-outline" size={18} />
          <Text style={styles.mapButtonText}>Itinéraire ramassage</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => void openGoogleMapsDirections(order.delivery.coordinates)}
          style={({ pressed }) => [styles.mapButton, pressed && styles.pressed]}
        >
          <Ionicons color={colors.brand[700]} name="navigate-outline" size={18} />
          <Text style={styles.mapButtonText}>Itinéraire livraison</Text>
        </Pressable>
      </View>

      <Text style={styles.mapHint}>
        Les boutons ouvrent Google Maps avec l’adresse et l’itinéraire de conduite.
      </Text>

      <SectionTitle>Paiement</SectionTitle>

      <View style={styles.card}>
        <View style={uiStyles.row}>
          <Text style={styles.rowLabel}>Moyen</Text>
          <Text style={styles.rowValue}>{ORDER_PAYMENT_METHOD_LABELS[order.payment.method]}</Text>
        </View>
        <View style={uiStyles.row}>
          <Text style={styles.rowLabel}>Statut</Text>
          <Text style={styles.rowValue}>{ORDER_PAYMENT_STATUS_LABELS[order.payment.status]}</Text>
        </View>
        <View style={uiStyles.row}>
          <Text style={styles.rowLabel}>Payé le</Text>
          <Text style={styles.rowValue}>
            {order.payment.paidAt ? formatDate(order.payment.paidAt) : '—'}
          </Text>
        </View>
      </View>

      {order.driver || order.pressing ? (
        <>
          <SectionTitle>Votre équipe</SectionTitle>
          <View style={styles.card}>
            {order.driver ? (
              <View style={styles.contactRow}>
                <Text style={styles.contactName}>{order.driver.name}</Text>
                <Text style={styles.contactMeta}>
                  Livreur{order.driver.vehicle ? ` · ${order.driver.vehicle}` : ''} ·{' '}
                  {order.driver.phone}
                </Text>
              </View>
            ) : null}
            {order.pressing ? (
              <View style={styles.contactRow}>
                <Text style={styles.contactName}>{order.pressing.name}</Text>
                <Text style={styles.contactMeta}>
                  Pressing{order.pressing.addressText ? ` · ${order.pressing.addressText}` : ''} ·{' '}
                  {order.pressing.phone}
                </Text>
              </View>
            ) : null}
          </View>
        </>
      ) : null}

      {order.dispute.reason ? (
        <>
          <SectionTitle>Litige</SectionTitle>
          <View style={styles.disputeNotice}>
            <View style={uiStyles.row}>
              <Text style={styles.disputeNoticeTitle}>Signalement client</Text>
              <Pill
                label={DISPUTE_STATUS_LABELS[order.dispute.status]}
                tone={order.dispute.status === 'ouvert' ? 'warning' : 'success'}
              />
            </View>
            <Text style={styles.disputeNoticeText}>{order.dispute.reason}</Text>
            {order.dispute.at ? (
              <Text style={styles.disputeNoticeDate}>
                Signalé le {formatDateTime(order.dispute.at)}
              </Text>
            ) : null}
          </View>
        </>
      ) : null}

      {order.actions.canConfirmDelivery ? (
        <View style={styles.actionBlock}>
          <PrimaryButton
            label="Confirmer la réception"
            loading={confirmMutation.isPending}
            onPress={confirmDelivery}
          />
          <Text style={styles.actionHint}>
            Confirmez la réception une fois le linge livré et vérifié.
          </Text>
        </View>
      ) : null}

      {order.actions.canDispute ? (
        <View style={styles.actionBlock}>
          {!disputeOpen ? (
            <SecondaryButton
              label="Signaler un litige"
              onPress={() => {
                setMessage(null);
                setDisputeOpen(true);
              }}
            />
          ) : (
            <View style={styles.disputeCard}>
              <Text style={styles.disputeTitle}>Décrivez le problème</Text>
              <TextInput
                multiline
                onChangeText={setDisputeReason}
                placeholder="Ex : un article manque ou n’est pas conforme…"
                placeholderTextColor={colors.neutral[400]}
                style={styles.disputeInput}
                value={disputeReason}
              />
              <View style={styles.disputeActions}>
                <View style={styles.disputeActionItem}>
                  <SecondaryButton
                    label="Annuler"
                    onPress={() => {
                      setDisputeOpen(false);
                      setDisputeReason('');
                    }}
                  />
                </View>
                <View style={styles.disputeActionItem}>
                  <PrimaryButton
                    label="Envoyer le litige"
                    loading={disputeMutation.isPending}
                    onPress={submitDispute}
                  />
                </View>
              </View>
            </View>
          )}
          <Text style={styles.actionHint}>
            Un litige peut être signalé après la livraison si un article manque ou n’est pas
            conforme.
          </Text>
        </View>
      ) : null}

      {order.actions.canCancel ? (
        <View style={styles.cancelBlock}>
          <DangerButton
            label={cancelMutation.isPending ? 'Annulation…' : 'Annuler cette commande'}
            loading={cancelMutation.isPending}
            onPress={confirmCancel}
          />
          <Text style={styles.cancelHint}>
            L’annulation est possible tant que le ramassage n’a pas commencé.
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.brand[900],
    borderRadius: radius.lg,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  heroHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  heroText: {
    flex: 1,
    gap: 2,
  },
  heroEyebrow: {
    ...typography.caption,
    color: colors.brand[300],
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  heroTitle: {
    ...typography.title,
    color: colors.surface,
    fontSize: 22,
    lineHeight: 28,
  },
  heroMeta: {
    ...typography.caption,
    color: colors.brand[100],
  },
  heroTotals: {
    borderColor: 'rgba(255,255,255,0.18)',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing.xl,
    paddingTop: spacing.md,
  },
  heroTotalLabel: {
    ...typography.caption,
    color: colors.brand[300],
    fontSize: 11,
  },
  heroTotalValue: {
    ...typography.title,
    color: colors.surface,
    fontSize: 18,
    lineHeight: 24,
  },
  timelineCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 54,
  },
  timelineMarker: {
    alignItems: 'center',
    width: 24,
  },
  timelineDot: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  timelineDotReached: {
    backgroundColor: colors.brand[600],
    borderColor: colors.brand[600],
  },
  timelineDotCurrent: {
    borderColor: colors.brand[900],
    borderWidth: 3,
  },
  timelineCheck: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: '700',
  },
  timelineLine: {
    backgroundColor: colors.border,
    flex: 1,
    marginVertical: 3,
    width: 2,
  },
  timelineLineReached: {
    backgroundColor: colors.brand[300],
  },
  timelineText: {
    flex: 1,
    paddingBottom: spacing.md,
  },
  timelineLabel: {
    ...typography.body,
    color: colors.textMuted,
    lineHeight: 20,
  },
  timelineLabelReached: {
    color: colors.text,
  },
  timelineLabelCurrent: {
    fontWeight: '700',
  },
  timelineDate: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  itemHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  itemHeaderText: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    ...typography.title,
    color: colors.text,
    fontSize: 17,
    lineHeight: 22,
  },
  itemMeta: {
    ...typography.caption,
    color: colors.textMuted,
  },
  rowLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  rowValue: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '700',
  },
  rowLabelStrong: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
  },
  rowValueStrong: {
    ...typography.title,
    color: colors.brand[700],
    fontSize: 18,
    lineHeight: 24,
  },
  totalRow: {
    borderColor: colors.border,
    borderTopWidth: 1,
    paddingTop: spacing.sm,
  },
  coverage: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  addressBlock: {
    gap: 2,
  },
  addressLabel: {
    ...typography.caption,
    color: colors.brand[700],
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  addressText: {
    ...typography.body,
    color: colors.text,
    lineHeight: 20,
  },
  addressContact: {
    ...typography.caption,
    color: colors.textMuted,
  },
  addressNote: {
    ...typography.caption,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  addressDivider: {
    backgroundColor: colors.border,
    height: 1,
  },
  mapCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  mapActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  mapButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.brand[600],
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  mapButtonText: {
    ...typography.caption,
    color: colors.brand[700],
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  mapHint: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.75,
  },
  contactRow: {
    gap: 2,
  },
  contactName: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
  },
  contactMeta: {
    ...typography.caption,
    color: colors.textMuted,
  },
  actionBlock: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  actionHint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  disputeNotice: {
    backgroundColor: colors.warningSurface,
    borderColor: colors.warning,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  disputeNoticeTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
  },
  disputeNoticeText: {
    ...typography.caption,
    color: colors.text,
  },
  disputeNoticeDate: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
  },
  disputeCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  disputeTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
  },
  disputeInput: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    minHeight: 90,
    padding: spacing.md,
    textAlignVertical: 'top',
  },
  disputeActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  disputeActionItem: {
    flex: 1,
  },
  cancelBlock: {
    gap: spacing.sm,
  },
  cancelHint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
