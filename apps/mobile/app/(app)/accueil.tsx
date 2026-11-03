import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMeRequest, logoutRequest } from '../../src/api/auth';
import { ApiClientError } from '../../src/api/client';
import { formatDate } from '../../src/lib/format';
import { roleLabel, useAuthStore } from '../../src/stores/auth.store';
import { DangerButton, InlineMessage, SecondaryButton } from '../../src/ui/auth';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

const NEXT_STEPS: Record<string, string> = {
  client: 'Le catalogue, les packs et la commande en ligne arrivent au lot 2.',
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
