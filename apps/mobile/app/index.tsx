import { Link, Redirect } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../src/stores/auth.store';
import { colors, radius, spacing, typography } from '../src/theme/tokens';

const roles = [
  {
    name: 'Client',
    description: 'Commander, suivre, payer avec un pack ou Orange Money.',
  },
  {
    name: 'Livreur',
    description: 'Ramasser, contrôler la conformité, livrer.',
  },
  {
    name: 'Pressing',
    description: 'Réceptionner et traiter chaque article.',
  },
  {
    name: 'Administrateur',
    description: "Piloter le catalogue, les comptes et le chiffre d'affaires.",
  },
];

export default function HomeScreen() {
  const status = useAuthStore((state) => state.status);

  if (status === 'authenticated') {
    return <Redirect href="/(app)/accueil" />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Lot 1 · Authentification</Text>
        </View>

        <Text style={styles.title}>FINIKO</Text>
        <Text style={styles.subtitle}>
          Blanchisserie et pressing à Bamako. Quatre espaces, une seule plateforme.
        </Text>

        <View style={styles.actions}>
          <Link href="/(auth)/register" style={styles.primaryCta}>
            Créer un compte client
          </Link>
          <Link href="/(auth)/login" style={styles.secondaryCta}>
            J'ai déjà un compte
          </Link>
        </View>

        <View style={styles.roles}>
          {roles.map((role) => (
            <View key={role.name} style={styles.roleCard}>
              <Text style={styles.roleName}>{role.name}</Text>
              <Text style={styles.roleDescription}>{role.description}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.note}>
          L'inscription est ouverte aux clients. Les comptes livreur, pressing et administrateur
          sont créés par un administrateur, puis protégés par un changement de mot de passe à la
          première connexion.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.brand[900],
  },
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brand[50],
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  badgeText: {
    ...typography.caption,
    color: colors.brand[700],
  },
  title: {
    ...typography.display,
    color: colors.brand[900],
    letterSpacing: 1,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
  },
  actions: {
    gap: spacing.sm,
  },
  primaryCta: {
    backgroundColor: colors.brand[600],
    borderRadius: radius.md,
    color: colors.surface,
    fontSize: 16,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    textAlign: 'center',
  },
  secondaryCta: {
    backgroundColor: colors.surface,
    borderColor: colors.brand[600],
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.brand[700],
    fontSize: 16,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    textAlign: 'center',
  },
  roles: {
    gap: spacing.sm,
  },
  roleCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  roleName: {
    ...typography.title,
    fontSize: 18,
    lineHeight: 24,
    color: colors.text,
  },
  roleDescription: {
    ...typography.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
  },
  note: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
