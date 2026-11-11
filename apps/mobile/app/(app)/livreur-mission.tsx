import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ClientOrderAddress,
  DriverMissionPhase,
  DriverTransitionStatus,
  OrderStatus,
} from '@finiko/contracts';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiClientError } from '../../src/api/client';
import { getDriverOrderRequest, transitionDriverOrderRequest } from '../../src/api/driver';
import { formatDateTime, formatXOF } from '../../src/lib/format';
import {
  DRIVER_MISSION_PHASE_LABELS,
  ORDER_PAYMENT_METHOD_LABELS,
  ORDER_PAYMENT_STATUS_LABELS,
  TREATMENT_LABELS,
} from '../../src/lib/labels';
import {
  coordinatesLabel,
  openGoogleMapsDirections,
  openGoogleMapsPlace,
} from '../../src/lib/maps';
import { roleHome } from '../../src/lib/role-home';
import { useAuthStore } from '../../src/stores/auth.store';
import { InlineMessage, PrimaryButton, SecondaryButton } from '../../src/ui/auth';
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

function phaseTone(phase: DriverMissionPhase): PillTone {
  if (phase === 'ramassage') return 'warning';
  if (phase === 'livraison') return 'brand';
  if (phase === 'terminee') return 'success';
  return 'neutral';
}

interface DriverAction {
  label: string;
  status: DriverTransitionStatus;
  title: string;
  message: string;
}

function nextDriverAction(status: OrderStatus): DriverAction | null {
  if (status === 'ramassage_assigne') {
    return {
      label: 'Démarrer le ramassage',
      status: 'ramassage_en_cours',
      title: 'Démarrer le ramassage',
      message: 'Vous partez récupérer le linge chez le client.',
    };
  }

  if (status === 'ramassage_en_cours') {
    return {
      label: 'Confirmer le ramassage',
      status: 'ramassee',
      title: 'Confirmer le ramassage',
      message: 'Le linge a bien été récupéré auprès du client.',
    };
  }

  if (status === 'ramassee') {
    return {
      label: 'Déposer au pressing',
      status: 'deposee_au_pressing',
      title: 'Déposer au pressing',
      message: 'Confirmez-vous le dépôt du linge au pressing ?',
    };
  }

  if (status === 'prete') {
    return {
      label: 'Prendre en charge la livraison',
      status: 'livraison_assignee',
      title: 'Prendre en charge la livraison',
      message: 'Le linge est prêt. Vous pouvez démarrer la tournée de livraison.',
    };
  }

  if (status === 'livraison_assignee') {
    return {
      label: 'Démarrer la livraison',
      status: 'livraison_en_cours',
      title: 'Démarrer la livraison',
      message: 'Vous partez livrer le linge au client.',
    };
  }

  if (status === 'livraison_en_cours') {
    return {
      label: 'Confirmer la livraison',
      status: 'livree',
      title: 'Confirmer la livraison',
      message:
        'Confirmez-vous la remise du linge au client ? Le paiement en espèces sera enregistré comme encaissé.',
    };
  }

  return null;
}

function callPhone(phone: string): void {
  const cleaned = phone.replace(/\s+/g, '');

  if (!cleaned || cleaned === '—') return;

  void Linking.openURL(`tel:${cleaned}`);
}

function AddressMissionCard({
  address,
  label,
  onDirections,
  onViewOnMap,
}: {
  address: ClientOrderAddress;
  label: string;
  onDirections: () => void;
  onViewOnMap: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.addressHeader}>
        <View style={styles.addressIcon}>
          <Ionicons color={colors.brand[700]} name="location" size={19} />
        </View>
        <View style={styles.addressTitleBlock}>
          <Text style={styles.addressLabel}>{label}</Text>
          <Text style={styles.addressText}>{address.text}</Text>
          <Text style={styles.addressCoordinates}>{coordinatesLabel(address.coordinates)}</Text>
        </View>
      </View>

      <View style={styles.contactRow}>
        <Ionicons color={colors.textMuted} name="person-outline" size={16} />
        <Text style={styles.contactText}>
          {address.contactName} · {address.contactPhone}
        </Text>
        {address.contactPhone && address.contactPhone !== '—' ? (
          <Pressable
            accessibilityLabel={`Appeler ${address.contactName}`}
            accessibilityRole="button"
            onPress={() => callPhone(address.contactPhone)}
            style={({ pressed }) => [styles.callButton, pressed && styles.pressed]}
          >
            <Ionicons color={colors.brand[700]} name="call-outline" size={16} />
            <Text style={styles.callText}>Appeler</Text>
          </Pressable>
        ) : null}
      </View>

      {address.instructions ? (
        <Text style={styles.addressNote}>Instructions : {address.instructions}</Text>
      ) : null}

      <View style={styles.addressActions}>
        <Pressable
          accessibilityRole="button"
          onPress={onViewOnMap}
          style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
        >
          <Ionicons color={colors.brand[700]} name="map-outline" size={17} />
          <Text style={styles.actionButtonText}>Voir sur Maps</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onDirections}
          style={({ pressed }) => [
            styles.actionButton,
            styles.actionButtonPrimary,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons color={colors.surface} name="navigate" size={17} />
          <Text style={[styles.actionButtonText, styles.actionButtonTextPrimary]}>Itinéraire</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function DriverMissionScreen() {
  const user = useAuthStore((state) => state.user);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const orderId = typeof id === 'string' ? id : '';
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<{
    tone: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const missionQuery = useQuery({
    queryKey: ['driver', 'orders', orderId],
    queryFn: () => getDriverOrderRequest(orderId),
    enabled: Boolean(orderId) && user?.role === 'livreur',
    refetchInterval: 10000,
  });

  const transitionMutation = useMutation({
    mutationFn: (status: DriverTransitionStatus) =>
      transitionDriverOrderRequest(orderId, { status }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['driver', 'orders', orderId], updated);
      void queryClient.invalidateQueries({ queryKey: ['driver', 'orders'] });
      setFeedback({ tone: 'success', text: 'Mission mise à jour.' });
    },
    onError: (error) => {
      setFeedback({
        tone: 'error',
        text:
          error instanceof ApiClientError
            ? error.message
            : 'Impossible de mettre à jour cette mission.',
      });
    },
  });

  if (!user) return null;
  if (user.role !== 'livreur') return <Redirect href={roleHome(user.role)} />;

  if (!orderId) {
    return (
      <Screen onBack={() => router.back()} title="Mission">
        <EmptyState title="Mission introuvable" message="Aucun identifiant de mission fourni." />
      </Screen>
    );
  }

  if (missionQuery.isLoading) {
    return (
      <Screen onBack={() => router.back()} title="Mission livreur">
        <LoadingBlock label="Chargement de la mission…" />
      </Screen>
    );
  }

  if (missionQuery.isError || !missionQuery.data) {
    return (
      <Screen onBack={() => router.back()} title="Mission livreur">
        <EmptyState
          action={<SecondaryButton label="Réessayer" onPress={() => void missionQuery.refetch()} />}
          message={
            missionQuery.error instanceof ApiClientError
              ? missionQuery.error.message
              : 'Cette mission n’est pas accessible.'
          }
          title="Mission introuvable"
        />
      </Screen>
    );
  }

  const order = missionQuery.data;
  const target = order.missionPhase === 'livraison' ? order.delivery : order.pickup;
  const targetLabel = order.missionPhase === 'livraison' ? 'la livraison' : 'le ramassage';
  const isFinished = order.missionPhase === 'terminee';
  const action = nextDriverAction(order.status);

  const runAction = () => {
    if (!action) return;

    Alert.alert(action.title, action.message, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Confirmer',
        onPress: () => {
          setFeedback(null);
          transitionMutation.mutate(action.status);
        },
      },
    ]);
  };

  return (
    <Screen
      onBack={() => router.back()}
      subtitle={`Mission ${DRIVER_MISSION_PHASE_LABELS[order.missionPhase].toLowerCase()}`}
      title={order.orderNumber}
    >
      <View style={styles.hero}>
        <View style={styles.heroHeader}>
          <View style={styles.heroText}>
            <Text style={styles.heroEyebrow}>Mission en cours</Text>
            <Text style={styles.heroTitle}>{order.statusLabel}</Text>
            <Text style={styles.heroMeta}>
              {order.itemsCount} article{order.itemsCount > 1 ? 's' : ''} ·{' '}
              {ORDER_PAYMENT_METHOD_LABELS[order.paymentMethod]}
            </Text>
          </View>
          <Pill
            label={DRIVER_MISSION_PHASE_LABELS[order.missionPhase]}
            tone={phaseTone(order.missionPhase)}
          />
        </View>

        <View style={styles.heroTotals}>
          <View>
            <Text style={styles.heroTotalLabel}>Montant</Text>
            <Text style={styles.heroTotalValue}>{formatXOF(order.totalDue)}</Text>
          </View>
          <View>
            <Text style={styles.heroTotalLabel}>Paiement</Text>
            <Text style={styles.heroTotalValue}>
              {ORDER_PAYMENT_STATUS_LABELS[order.payment.status]}
            </Text>
          </View>
        </View>
      </View>

      {order.payment.status === 'a_collecter' ? (
        <InlineMessage tone="info">
          À collecter auprès du client : {formatXOF(order.totalDue)} en espèces à la livraison.
        </InlineMessage>
      ) : null}

      {feedback ? <InlineMessage tone={feedback.tone}>{feedback.text}</InlineMessage> : null}

      {action ? (
        <PrimaryButton
          label={action.label}
          loading={transitionMutation.isPending}
          onPress={runAction}
        />
      ) : null}

      {order.status === 'livree' ? (
        <InlineMessage tone="success">
          Livraison effectuée. Le client doit confirmer la réception pour clôturer la commande.
        </InlineMessage>
      ) : null}

      {['deposee_au_pressing', 'au_pressing', 'en_traitement'].includes(order.status) ? (
        <InlineMessage tone="info">
          Le linge est chez le pressing. Vous pourrez reprendre la livraison dès que la commande
          sera prête.
        </InlineMessage>
      ) : null}

      {!isFinished ? (
        <PrimaryButton
          label={`Démarrer l’itinéraire vers ${targetLabel}`}
          onPress={() => void openGoogleMapsDirections(target.coordinates)}
        />
      ) : null}

      <SectionTitle>Adresses et contacts</SectionTitle>

      <AddressMissionCard
        address={order.pickup}
        label="Ramassage"
        onDirections={() => void openGoogleMapsDirections(order.pickup.coordinates)}
        onViewOnMap={() => void openGoogleMapsPlace(order.pickup.coordinates)}
      />

      <AddressMissionCard
        address={order.delivery}
        label="Livraison"
        onDirections={() => void openGoogleMapsDirections(order.delivery.coordinates)}
        onViewOnMap={() => void openGoogleMapsPlace(order.delivery.coordinates)}
      />

      <View style={styles.mapCard}>
        <RouteMap delivery={order.delivery} height={230} pickup={order.pickup} />
      </View>

      <SectionTitle>Client</SectionTitle>

      <View style={styles.card}>
        <View style={styles.clientRow}>
          <View style={styles.clientAvatar}>
            <Text style={styles.clientAvatarText}>
              {order.client.name
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part.charAt(0))
                .join('')
                .toUpperCase()}
            </Text>
          </View>
          <View style={styles.clientText}>
            <Text style={styles.clientName}>{order.client.name}</Text>
            <Text style={styles.clientPhone}>{order.client.phone}</Text>
          </View>
          <Pressable
            accessibilityLabel="Appeler le client"
            accessibilityRole="button"
            onPress={() => callPhone(order.client.phone)}
            style={({ pressed }) => [styles.callLarge, pressed && styles.pressed]}
          >
            <Ionicons color={colors.surface} name="call" size={18} />
          </Pressable>
        </View>
      </View>

      <SectionTitle>Linge à traiter</SectionTitle>

      <View style={styles.card}>
        {order.items.map((item, index) => (
          <View key={`${item.catalogItemId}-${item.treatment}-${index}`} style={styles.itemRow}>
            <View style={styles.itemText}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemMeta}>
                {TREATMENT_LABELS[item.treatment]} · {item.quantity} × {formatXOF(item.unitPrice)}
              </Text>
            </View>
            <Text style={styles.itemTotal}>{formatXOF(item.lineTotal)}</Text>
          </View>
        ))}

        <View style={[uiStyles.row, styles.totalRow]}>
          <Text style={styles.totalLabelStrong}>Total commande</Text>
          <Text style={styles.totalValueStrong}>{formatXOF(order.totalDue)}</Text>
        </View>
      </View>

      <SectionTitle>Suivi</SectionTitle>

      <View style={styles.card}>
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

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Ouvre Google Maps pour lancer la navigation vers {targetLabel}.
        </Text>
      </View>
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
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
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
    fontSize: 12,
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
    fontSize: 10,
  },
  heroTotalValue: {
    ...typography.title,
    color: colors.surface,
    fontSize: 17,
    lineHeight: 23,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  addressHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
  },
  addressIcon: {
    alignItems: 'center',
    backgroundColor: colors.brand[50],
    borderRadius: radius.md,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  addressTitleBlock: {
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
    lineHeight: 20,
  },
  addressCoordinates: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
  },
  addressNote: {
    ...typography.caption,
    backgroundColor: colors.warningSurface,
    borderColor: colors.warningBorder,
    borderRadius: radius.sm,
    borderWidth: 1,
    color: colors.warning,
    fontSize: 11,
    lineHeight: 16,
    padding: spacing.sm,
  },
  contactRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  contactText: {
    ...typography.caption,
    color: colors.textMuted,
    flex: 1,
    fontSize: 12,
  },
  callButton: {
    alignItems: 'center',
    backgroundColor: colors.brand[50],
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  callText: {
    ...typography.caption,
    color: colors.brand[700],
    fontSize: 11,
    fontWeight: '700',
  },
  addressActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: spacing.sm,
  },
  actionButtonPrimary: {
    backgroundColor: colors.brand[600],
    borderColor: colors.brand[600],
  },
  actionButtonText: {
    ...typography.caption,
    color: colors.brand[700],
    fontSize: 11,
    fontWeight: '700',
  },
  actionButtonTextPrimary: {
    color: colors.surface,
  },
  mapCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  clientRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  clientAvatar: {
    alignItems: 'center',
    backgroundColor: colors.brand[50],
    borderRadius: radius.pill,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  clientAvatarText: {
    ...typography.body,
    color: colors.brand[700],
    fontSize: 15,
    fontWeight: '800',
  },
  clientText: {
    flex: 1,
    gap: 2,
  },
  clientName: {
    ...typography.body,
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  clientPhone: {
    ...typography.caption,
    color: colors.textMuted,
  },
  callLarge: {
    alignItems: 'center',
    backgroundColor: colors.success,
    borderRadius: radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  itemRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
  },
  itemText: {
    flex: 1,
    gap: 1,
  },
  itemName: {
    ...typography.body,
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  itemMeta: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
  },
  itemTotal: {
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
  timelineRow: {
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 50,
  },
  timelineMarker: {
    alignItems: 'center',
    width: 22,
  },
  timelineDot: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 22,
    justifyContent: 'center',
    width: 22,
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
    fontSize: 11,
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
    paddingBottom: spacing.sm,
  },
  timelineLabel: {
    ...typography.caption,
    color: colors.textMuted,
    lineHeight: 18,
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
    fontSize: 11,
  },
  footer: {
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
  footerText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.75,
  },
});
