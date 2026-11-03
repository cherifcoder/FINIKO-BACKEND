import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMeRequest, logoutRequest } from '../../src/api/auth';
import { ApiClientError } from '../../src/api/client';
import { getMySubscriptionsRequest } from '../../src/api/packs';
import { formatDate, formatXOF } from '../../src/lib/format';
import { roleLabel, useAuthStore } from '../../src/stores/auth.store';
import { DangerButton, InlineMessage, SecondaryButton } from '../../src/ui/auth';
import { QuotaBar } from '../../src/ui/screen';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

const NEXT_STEPS: Record<string, string> = {
  client: 'Choisissez un pack, parcourez le catalogue et suivez votre quota en temps réel.',
  livreur: 'Les missions de ramassage et le guidage GPS arrivent au lot 5.',
  pressing: 'La réception et le traitement article par article arrivent au lot 5.',
  admin: "Le pilotage du catalogue, des comptes et du chiffre d'affaires arrive au lot 6.",
};

export default function AccueilScreen() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const clear = useAuthStore((state) => state.clear);

  const [error, setError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const subscriptionsQuery = useQuery({
    queryKey: ['subscriptions', 'me'],
    queryFn: getMySubscriptionsRequest,
    enabled: user?.role === 'client',
  });

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const refresh = async () => {
        try {
          const fresh = await getMeRequest();

          if (active) {
            setUser(fresh.user);
            setError(null);
          }
        } catch (caught) {
          if (!active) return;

          if (caught instanceof ApiClientError && caught.status === 403) {
            await clear();
            router.replace('/(auth)/login');
            return;
          }

          setError('Profil non actualisé. Vérifiez votre connexion.');
        }
      };

      void refresh();

      return () => {
        active = false;
      };
    }, [clear, setUser]),
  );

  if (!user) {
    return null;
  }

  const onLogout = async () => {
    setLoggingOut(true);
    const refreshToken = useAuthStore.getState().refreshToken;

    try {
      if (refreshToken) {
        await logoutRequest(refreshToken);
      }
    } catch {
      // La session locale est effacée même si le serveur est injoignable.
    } finally {
      await clear();
      setLoggingOut(false);
      router.replace('/(auth)/login');
    }
  };

  const initials = `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>

          <View style={styles.identityText}>
            <Text style={styles.greeting}>Bonjour</Text>
            <Text style={styles.name}>{user.fullName}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>{roleLabel(user.role)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Mon compte</Text>

          <ProfileRow label="Téléphone" value={user.phone} />
          <ProfileRow
            label="Vérification"
            value={user.phoneVerified ? 'Numéro vérifié' : 'Numéro non vérifié'}
            tone={user.phoneVerified ? 'success' : 'warning'}
          />
          <ProfileRow label="Email" value={user.email ?? 'Non renseigné'} />
          <ProfileRow label="Membre depuis" value={formatDate(user.createdAt)} />
          <ProfileRow
            label="Statut"
            value={user.status === 'actif' ? 'Compte actif' : 'Compte suspendu'}
            tone={user.status === 'actif' ? 'success' : 'danger'}
          />
        </View>

        {user.role === 'client' ? (
          <>
            {subscriptionsQuery.data?.active ? (
              <View style={[styles.card, styles.packCard]}>
                <View style={styles.packHeader}>
                  <View style={styles.packHeaderText}>
                    <Text style={styles.packEyebrow}>Mon pack</Text>
                    <Text style={styles.packName}>{subscriptionsQuery.data.active.pack.name}</Text>
                    <Text style={styles.packMeta}>
                      {formatXOF(subscriptionsQuery.data.active.pack.priceXOF)} · fin le{' '}
                      {formatDate(subscriptionsQuery.data.active.endDate)}
                    </Text>
                  </View>
                  <View style={styles.packBadge}>
                    <Text style={styles.packBadgeText}>Actif</Text>
                  </View>
                </View>

                <QuotaBar
                  used={subscriptionsQuery.data.active.quotaUsed}
                  total={subscriptionsQuery.data.active.quotaTotal}
                  reserved={subscriptionsQuery.data.active.quotaReserved}
                />

                <SecondaryButton
                  label="Voir mon abonnement"
                  onPress={() => router.push('/(app)/abonnement')}
                />
              </View>
            ) : (
              <View style={[styles.card, styles.packCard]}>
                <Text style={styles.packEyebrow}>Packs & abonnements</Text>
                <Text style={styles.packName}>Un quota mensuel pour votre linge</Text>
                <Text style={styles.packMeta}>
                  Choisissez un pack adapté à votre foyer et suivez chaque unité utilisée.
                </Text>
                <SecondaryButton
                  label="Découvrir les packs"
                  onPress={() => router.push('/(app)/packs')}
                />
              </View>
            )}

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Mes services</Text>
              <View style={styles.shortcuts}>
                <Shortcut
                  label="Packs"
                  detail="Quota mensuel"
                  onPress={() => router.push('/(app)/packs')}
                />
                <Shortcut
                  label="Catalogue"
                  detail="3 tarifs par article"
                  onPress={() => router.push('/(app)/catalogue')}
                />
                <Shortcut
                  label="Abonnement"
                  detail="Quota & historique"
                  onPress={() => router.push('/(app)/abonnement')}
                />
              </View>
            </View>
          </>
        ) : null}

        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Et maintenant ?</Text>
          <Text style={styles.noticeText}>
            {NEXT_STEPS[user.role] ?? 'Les fonctionnalités de votre espace arrivent bientôt.'}
          </Text>
        </View>

        {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}

        <SecondaryButton
          label="Changer mon mot de passe"
          onPress={() => router.push('/(app)/change-password')}
        />

        <DangerButton label="Se déconnecter" loading={loggingOut} onPress={() => void onLogout()} />

        <Text style={styles.footer}>FINIKO v2 · Bamako, Mali</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

interface ProfileRowProps {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}

function ProfileRow({ label, value, tone = 'default' }: ProfileRowProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          tone === 'success' && styles.rowValueSuccess,
          tone === 'warning' && styles.rowValueWarning,
          tone === 'danger' && styles.rowValueDanger,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function Shortcut({
  label,
  detail,
  onPress,
}: {
  label: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.shortcut, pressed && styles.shortcutPressed]}
    >
      <Text style={styles.shortcutLabel}>{label}</Text>
      <Text style={styles.shortcutDetail}>{detail}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.brand[900],
    flex: 1,
  },
  container: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    flexGrow: 1,
    gap: spacing.lg,
    padding: spacing.xl,
  },
  identity: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.lg,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.brand[600],
    borderRadius: 32,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  avatarText: {
    ...typography.title,
    color: colors.surface,
  },
  identityText: {
    flex: 1,
    gap: spacing.xs,
  },
  greeting: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  name: {
    ...typography.title,
    color: colors.text,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brand[50],
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
  },
  roleBadgeText: {
    ...typography.caption,
    color: colors.brand[700],
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  cardTitle: {
    ...typography.title,
    fontSize: 18,
    lineHeight: 24,
    color: colors.text,
  },
  packCard: {
    backgroundColor: colors.brand[50],
    borderColor: colors.brand[100],
  },
  packHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  packHeaderText: {
    flex: 1,
    gap: 2,
  },
  packEyebrow: {
    ...typography.caption,
    color: colors.brand[700],
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  packName: {
    ...typography.title,
    color: colors.brand[900],
    fontSize: 20,
    lineHeight: 26,
  },
  packMeta: {
    ...typography.caption,
    color: colors.brand[700],
  },
  packBadge: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
  },
  packBadgeText: {
    ...typography.caption,
    color: colors.success,
    fontWeight: '700',
  },
  shortcuts: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  shortcut: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'space-between',
    minHeight: 86,
    padding: spacing.md,
  },
  shortcutPressed: {
    opacity: 0.75,
  },
  shortcutLabel: {
    ...typography.body,
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  shortcutDetail: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  row: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    paddingTop: spacing.md,
  },
  rowLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  rowValue: {
    ...typography.body,
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
    textAlign: 'right',
  },
  rowValueSuccess: {
    color: colors.success,
  },
  rowValueWarning: {
    color: colors.warning,
  },
  rowValueDanger: {
    color: colors.danger,
  },
  notice: {
    backgroundColor: colors.brand[50],
    borderColor: colors.brand[100],
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  noticeTitle: {
    ...typography.title,
    fontSize: 16,
    lineHeight: 22,
    color: colors.brand[700],
  },
  noticeText: {
    ...typography.caption,
    color: colors.brand[700],
  },
  footer: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
