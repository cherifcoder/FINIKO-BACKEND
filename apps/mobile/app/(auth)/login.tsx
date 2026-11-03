import { Link, Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { loginSchema } from '@finiko/contracts';
import { loginRequest } from '../../src/api/auth';
import { ApiClientError } from '../../src/api/client';
import { useAuthStore } from '../../src/stores/auth.store';
import { AuthLayout, Field, InlineMessage, PrimaryButton } from '../../src/ui/auth';
import { colors, typography } from '../../src/theme/tokens';

const NOTICES: Record<string, string> = {
  'password-reset': 'Mot de passe réinitialisé. Connectez-vous avec votre nouveau mot de passe.',
  'password-changed': 'Mot de passe modifié. Reconnectez-vous avec votre nouveau mot de passe.',
};

export default function LoginScreen() {
  const status = useAuthStore((state) => state.status);
  const setSession = useAuthStore((state) => state.setSession);
  const params = useLocalSearchParams<{ notice?: string }>();
  const notice = typeof params.notice === 'string' ? NOTICES[params.notice] : undefined;

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (status === 'authenticated') {
    return <Redirect href="/(app)/accueil" />;
  }

  const onSubmit = async () => {
    const parsed = loginSchema.safeParse({ identifier, password });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Identifiants invalides.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const session = await loginRequest(parsed.data);
      setSession(session);
      router.replace('/(app)/accueil');
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'Connexion impossible. Réessayez dans un instant.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Connexion"
      subtitle="Email ou téléphone, puis votre mot de passe."
      footer={
        <Text style={styles.footerText}>
          Pas encore de compte ?{' '}
          <Link href="/(auth)/register" style={styles.link}>
            Créer un compte client
          </Link>
        </Text>
      }
    >
      {notice && !error ? <InlineMessage tone="success">{notice}</InlineMessage> : null}

      <Field
        autoCapitalize="none"
        autoComplete="username"
        keyboardType="email-address"
        label="Email ou téléphone"
        onChangeText={setIdentifier}
        placeholder="client@finiko.ml ou +22370000002"
        value={identifier}
      />

      <Field
        autoCapitalize="none"
        autoComplete="current-password"
        label="Mot de passe"
        onChangeText={setPassword}
        placeholder="Votre mot de passe"
        secureTextEntry
        value={password}
      />

      <Link href="/(auth)/forgot-password" style={styles.forgotLink}>
        Mot de passe oublié ?
      </Link>

      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}

      <PrimaryButton label="Se connecter" loading={loading} onPress={() => void onSubmit()} />

      <Text style={styles.hint}>
        Les comptes livreur, pressing et administrateur sont créés par un administrateur.
      </Text>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  footerText: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  link: {
    color: colors.brand[600],
    fontWeight: '700',
  },
  forgotLink: {
    ...typography.caption,
    color: colors.brand[600],
    fontWeight: '700',
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
