import { Link, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { registerSchema } from '@finiko/contracts';
import { registerRequest } from '../../src/api/auth';
import { ApiClientError } from '../../src/api/client';
import { AuthLayout, CheckRow, Field, InlineMessage, PrimaryButton } from '../../src/ui/auth';
import { colors, typography } from '../../src/theme/tokens';

export default function RegisterScreen() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    const parsed = registerSchema.safeParse({
      firstName,
      lastName,
      phone,
      ...(email.trim() ? { email: email.trim() } : {}),
      password,
      acceptTerms,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const result = await registerRequest(parsed.data);
      router.push({
        pathname: '/(auth)/otp',
        params: {
          identifier: parsed.data.phone,
          purpose: 'phone_verify',
          ...(result.devCode ? { devCode: result.devCode } : {}),
        },
      });
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'Création impossible. Réessayez dans un instant.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Créer un compte"
      subtitle="Inscription réservée aux clients. Votre téléphone sera vérifié par un code."
      footer={
        <Text style={styles.footerText}>
          Déjà inscrit ?{' '}
          <Link href="/(auth)/login" style={styles.link}>
            Se connecter
          </Link>
        </Text>
      }
    >
      <Field
        autoCapitalize="words"
        autoComplete="given-name"
        label="Prénom"
        onChangeText={setFirstName}
        placeholder="Awa"
        value={firstName}
      />

      <Field
        autoCapitalize="words"
        autoComplete="family-name"
        label="Nom"
        onChangeText={setLastName}
        placeholder="Traoré"
        value={lastName}
      />

      <Field
        autoComplete="tel"
        keyboardType="phone-pad"
        label="Téléphone"
        onChangeText={setPhone}
        placeholder="+223 70 00 00 02"
        value={phone}
      />

      <Field
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        label="Email (facultatif)"
        onChangeText={setEmail}
        placeholder="awa@example.com"
        value={email}
      />

      <Field
        autoCapitalize="none"
        autoComplete="new-password"
        label="Mot de passe"
        onChangeText={setPassword}
        placeholder="8 caractères, majuscule et chiffre"
        secureTextEntry
        value={password}
      />

      <CheckRow
        checked={acceptTerms}
        label="J'accepte les conditions d'utilisation et la politique de confidentialité."
        onToggle={() => setAcceptTerms((value) => !value)}
      />

      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}

      <PrimaryButton label="Créer mon compte" loading={loading} onPress={() => void onSubmit()} />
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
});
