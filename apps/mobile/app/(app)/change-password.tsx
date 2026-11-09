import { Link, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { changePasswordSchema } from '@finiko/contracts';
import { changePasswordRequest } from '../../src/api/auth';
import { ApiClientError } from '../../src/api/client';
import { roleHome } from '../../src/lib/role-home';
import { useAuthStore } from '../../src/stores/auth.store';
import { AuthLayout, Field, InlineMessage, PrimaryButton } from '../../src/ui/auth';
import { colors, typography } from '../../src/theme/tokens';

export default function ChangePasswordScreen() {
  const mustChangePassword = useAuthStore((state) => state.user?.mustChangePassword ?? false);
  const user = useAuthStore((state) => state.user);
  const clear = useAuthStore((state) => state.clear);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await changePasswordRequest(parsed.data);
      await clear();
      router.replace('/(auth)/login?notice=password-changed');
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'Modification impossible. Réessayez dans un instant.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title={mustChangePassword ? 'Première connexion' : 'Changer mon mot de passe'}
      subtitle={
        mustChangePassword
          ? 'Votre compte a été créé par un administrateur. Choisissez un mot de passe personnel avant de continuer.'
          : 'Choisissez un mot de passe solide. Toutes vos sessions seront déconnectées.'
      }
      footer={
        mustChangePassword ? undefined : (
          <Link href={user ? roleHome(user.role) : '/(app)/accueil'} style={styles.link}>
            Retour à mon espace
          </Link>
        )
      }
    >
      {mustChangePassword ? (
        <InlineMessage tone="info">
          Le mot de passe temporaire ne peut pas être réutilisé comme mot de passe définitif.
        </InlineMessage>
      ) : null}

      <Field
        autoCapitalize="none"
        autoComplete="current-password"
        label="Mot de passe actuel"
        onChangeText={setCurrentPassword}
        placeholder="Mot de passe actuel ou temporaire"
        secureTextEntry
        value={currentPassword}
      />

      <Field
        autoCapitalize="none"
        autoComplete="new-password"
        label="Nouveau mot de passe"
        onChangeText={setNewPassword}
        placeholder="8 caractères minimum"
        secureTextEntry
        value={newPassword}
      />

      <Field
        autoCapitalize="none"
        autoComplete="new-password"
        label="Confirmer le nouveau mot de passe"
        onChangeText={setConfirmPassword}
        placeholder="Répétez le nouveau mot de passe"
        secureTextEntry
        value={confirmPassword}
      />

      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}

      <PrimaryButton
        label="Enregistrer le nouveau mot de passe"
        loading={loading}
        onPress={() => void onSubmit()}
      />

      <Text style={styles.hint}>
        Au moins 8 caractères, une minuscule, une majuscule et un chiffre. Vous serez invité à vous
        reconnecter.
      </Text>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  link: {
    ...typography.caption,
    color: colors.brand[600],
    fontWeight: '700',
    textAlign: 'center',
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
