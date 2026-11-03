import { Link, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { verifyOtpSchema } from '@finiko/contracts';
import { requestOtpRequest, verifyOtpRequest } from '../../src/api/auth';
import { ApiClientError } from '../../src/api/client';
import { useAuthStore } from '../../src/stores/auth.store';
import { AuthLayout, Field, InlineMessage, PrimaryButton } from '../../src/ui/auth';
import { colors, typography } from '../../src/theme/tokens';

function retryAfterSeconds(error: ApiClientError): number | null {
  const details = error.details;

  if (typeof details !== 'object' || details === null || !('retryAfterSeconds' in details)) {
    return null;
  }

  const value = (details as { retryAfterSeconds?: unknown }).retryAfterSeconds;
  return typeof value === 'number' ? value : null;
}

export default function OtpScreen() {
  const params = useLocalSearchParams<{
    identifier?: string;
    devCode?: string;
  }>();

  const identifier = typeof params.identifier === 'string' ? params.identifier : '';
  const setSession = useAuthStore((state) => state.setSession);

  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(
    typeof params.devCode === 'string' ? params.devCode : null,
  );
  const [cooldown, setCooldown] = useState(60);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;

    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  if (!identifier) {
    return (
      <AuthLayout
        title="Vérification"
        subtitle="Aucun numéro à vérifier."
        footer={
          <Link href="/(auth)/register" style={styles.link}>
            Revenir à l'inscription
          </Link>
        }
      >
        <InlineMessage tone="error">
          Reprenez l'inscription pour recevoir un code de vérification.
        </InlineMessage>
      </AuthLayout>
    );
  }

  const onVerify = async () => {
    const parsed = verifyOtpSchema.safeParse({
      identifier,
      purpose: 'phone_verify',
      code,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Code invalide.');
      return;
    }

    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      const session = await verifyOtpRequest(parsed.data);
      setSession(session);
      router.replace('/(app)/accueil');
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'Vérification impossible. Réessayez dans un instant.',
      );
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    setError(null);
    setInfo(null);
    setResending(true);

    try {
      const challenge = await requestOtpRequest({ identifier, purpose: 'phone_verify' });

      setDevCode(challenge.devCode ?? null);
      setCooldown(60);
      setInfo(challenge.message);
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
      setResending(false);
    }
  };

  return (
    <AuthLayout
      title="Vérifiez votre téléphone"
      subtitle={`Saisissez le code à 6 chiffres envoyé au ${identifier}.`}
      footer={
        <Text style={styles.footerText}>
          Mauvais numéro ?{' '}
          <Link href="/(auth)/register" style={styles.link}>
            Reprendre l'inscription
          </Link>
        </Text>
      }
    >
      {devCode ? (
        <InlineMessage tone="info">
          Mode développement : votre code est {devCode}. Il n'est jamais affiché en production.
        </InlineMessage>
      ) : null}

      <Field
        autoComplete="one-time-code"
        autoFocus
        keyboardType="number-pad"
        label="Code de vérification"
        maxLength={6}
        onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
        placeholder="123456"
        textContentType="oneTimeCode"
        value={code}
      />

      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
      {info ? <InlineMessage tone="success">{info}</InlineMessage> : null}

      <PrimaryButton
        disabled={code.length !== 6}
        label="Vérifier mon numéro"
        loading={loading}
        onPress={() => void onVerify()}
      />

      <PrimaryButton
        disabled={cooldown > 0}
        label={cooldown > 0 ? `Renvoyer le code dans ${cooldown} s` : 'Renvoyer un nouveau code'}
        loading={resending}
        onPress={() => void onResend()}
      />

      <Text style={styles.hint}>
        Le code expire après 5 minutes. Après 5 tentatives incorrectes, demandez un nouveau code.
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
