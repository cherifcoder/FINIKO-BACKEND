import { loginSchema } from '@finiko/contracts';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

export default function LoginScreen() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = () => {
    const parsed = loginSchema.safeParse({ identifier, password });

    if (!parsed.success) {
      setSubmitted(false);
      setError(parsed.error.issues[0]?.message ?? 'Identifiants invalides.');
      return;
    }

    setError(null);
    setSubmitted(true);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Connexion</Text>
            <Text style={styles.subtitle}>
              Email ou téléphone, puis votre mot de passe. L'API sera branchée au lot 1.
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Email ou téléphone</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="username"
                keyboardType="email-address"
                onChangeText={setIdentifier}
                placeholder="client@finiko.ml ou +22370000002"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                value={identifier}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Mot de passe</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="current-password"
                onChangeText={setPassword}
                placeholder="Votre mot de passe"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                style={styles.input}
                value={password}
              />
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {submitted ? (
              <Text style={styles.success}>
                Formulaire validé par les contrats partagés. Branchement API à venir.
              </Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              onPress={onSubmit}
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            >
              <Text style={styles.buttonText}>Se connecter</Text>
            </Pressable>
          </View>

          <Text style={styles.hint}>
            Inscription ouverte aux clients uniquement. Les comptes livreur, pressing et admin sont
            créés par un administrateur.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: spacing.xl,
    gap: spacing.xl,
  },
  header: {
    gap: spacing.sm,
  },
  title: {
    ...typography.display,
    fontSize: 28,
    lineHeight: 34,
    color: colors.text,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
  },
  form: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  input: {
    ...typography.body,
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  button: {
    backgroundColor: colors.brand[600],
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    ...typography.body,
    color: colors.surface,
    fontWeight: '700',
    textAlign: 'center',
  },
  error: {
    ...typography.caption,
    color: colors.danger,
  },
  success: {
    ...typography.caption,
    color: colors.success,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
