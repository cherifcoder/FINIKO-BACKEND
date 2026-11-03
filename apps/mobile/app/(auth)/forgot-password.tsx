import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { forgotPasswordSchema, resetPasswordSchema } from '@finiko/contracts';
import { forgotPasswordRequest, resetPasswordRequest } from '../../src/api/auth';
import { ApiClientError } from '../../src/api/client';
import {
  AuthLayout,
  Field,
  InlineMessage,
  PrimaryButton,
  SecondaryButton,
} from '../../src/ui/auth';
import { colors, typography } from '../../src/theme/tokens';

type Step = 'request' | 'reset' | 'done';

function retryAfterSeconds(error: ApiClientError): number | null {
  const details = error.details;

  if (typeof details !== 'object' || details === null || !('retryAfterSeconds' in details)) {
    return null;
  }

  const value = (details as { retryAfterSeconds?: unknown }).retryAfterSeconds;
  return typeof value === 'number' ? value : null;
}

export default function ForgotPasswordScreen() {
  const [step, setStep] = useState<Step>('request');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;

    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const onRequest = async () => {
    const parsed = forgotPasswordSchema.safeParse({ identifier });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Identifiant invalide.');
      return;
    }

    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      const challenge = await forgotPasswordRequest(parsed.data);

      setIdentifier(parsed.data.identifier);
      setDevCode(challenge.devCode ?? null);
      setInfo(challenge.message);
      setCooldown(60);
      setStep('reset');
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'Demande impossible. Réessayez dans un instant.',
      );
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      const challenge = await forgotPasswordRequest({ identifier });

      setDevCode(challenge.devCode ?? null);
      setInfo(challenge.message);
      setCooldown(60);
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        const retryAfter = retryAfterSeconds(caught);

        if (retryAfter !== null) {
          setCooldown(Math.max(1, retryAfter));
        }

        setError(caught.message);
      } else {
        setError("Impossible d'envoyer un nouveau code.");
      }
    } finally {
      setLoading(false);
    }
  };

  const onReset = async () => {
    const parsed = resetPasswordSchema.safeParse({ identifier, code, password });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }

    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      const result = await resetPasswordRequest(parsed.data);

      setInfo(result.message);
      setStep('done');
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'Réinitialisation impossible. Réessayez dans un instant.',
      );
    } finally {
      setLoading(false);
    }
  };

  if (step === 'done') {
    return (
      <AuthLayout
        title="Mot de passe réinitialisé"
        subtitle="Toutes vos sessions ont été déconnectées par sécurité."
        footer={
          <Link href="/(auth)/login?notice=password-reset" style={styles.link}>
            Se connecter avec le nouveau mot de passe
          </Link>
        }
      >
        {info ? <InlineMessage tone="success">{info}</InlineMessage> : null}
        <Text style={styles.hint}>
          Utilisez votre nouveau mot de passe pour ouvrir votre espace.
        </Text>
      </AuthLayout>
    );
  }

  if (step === 'reset') {
    return (
      <AuthLayout
        title="Nouveau mot de passe"
        subtitle={`Saisissez le code reçu pour ${identifier}, puis choisissez un nouveau mot de passe.`}
        footer={
          <Text style={styles.footerText}>
            <Text style={styles.link} onPress={() => setStep('request')}>
              Changer d'identifiant
            </Text>
          </Text>
        }
      >
        {devCode ? (
          <InlineMessage tone="info">
            Mode développement : votre code est {devCode}. Il n'est jamais affiché en production.
          </InlineMessage>
        ) : info ? (
          <InlineMessage tone="info">{info}</InlineMessage>
        ) : null}

        <Field
          autoComplete="one-time-code"
          keyboardType="number-pad"
          label="Code de réinitialisation"
          maxLength={6}
          onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
          placeholder="123456"
          textContentType="oneTimeCode"
          value={code}
        />

        <Field
          autoCapitalize="none"
          autoComplete="new-password"
          label="Nouveau mot de passe"
          onChangeText={setPassword}
          placeholder="8 caractères, majuscule et chiffre"
          secureTextEntry
          value={password}
        />

        <Field
          autoCapitalize="none"
          autoComplete="new-password"
          label="Confirmer le mot de passe"
          onChangeText={setConfirmPassword}
          placeholder="Répétez le mot de passe"
          secureTextEntry
          value={confirmPassword}
        />

        {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}

        <PrimaryButton
          disabled={code.length !== 6}
          label="Réinitialiser le mot de passe"
          loading={loading}
          onPress={() => void onReset()}
        />

        <SecondaryButton
          disabled={cooldown > 0 || loading}
          label={cooldown > 0 ? `Renvoyer le code dans ${cooldown} s` : 'Renvoyer un code'}
          onPress={() => void onResend()}
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Mot de passe oublié"
      subtitle="Recevez un code par SMS ou email, puis choisissez un nouveau mot de passe."
      footer={
        <Text style={styles.footerText}>
          Vous vous en souvenez ?{' '}
          <Link href="/(auth)/login" style={styles.link}>
            Se connecter
          </Link>
        </Text>
      }
    >
      <Field
        autoCapitalize="none"
        autoComplete="username"
        keyboardType="email-address"
        label="Email ou téléphone"
        onChangeText={setIdentifier}
        placeholder="client@finiko.ml ou +22370000002"
        value={identifier}
      />

      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}

      <PrimaryButton label="Recevoir un code" loading={loading} onPress={() => void onRequest()} />

      <Text style={styles.hint}>
        Pour la sécurité de votre compte, le message affiché reste identique que le compte existe ou
        non.
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
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
