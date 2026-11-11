import { Feather } from '@expo/vector-icons';
import { loginSchema } from '@finiko/contracts';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loginRequest } from '../../src/api/auth';
import { ApiClientError } from '../../src/api/client';
import { roleHome } from '../../src/lib/role-home';
import { useAuthStore } from '../../src/stores/auth.store';
import { InlineMessage } from '../../src/ui/auth';
import { colors } from '../../src/theme/tokens';

const NOTICES: Record<string, string> = {
  'password-reset': 'Mot de passe réinitialisé. Connectez-vous avec votre nouveau mot de passe.',
  'password-changed': 'Mot de passe modifié. Reconnectez-vous avec votre nouveau mot de passe.',
};

export default function LoginScreen() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const setSession = useAuthStore((state) => state.setSession);
  const params = useLocalSearchParams<{ notice?: string }>();
  const notice = typeof params.notice === 'string' ? NOTICES[params.notice] : undefined;

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (status === 'authenticated' && user) {
    return <Redirect href={roleHome(user.role)} />;
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
      router.replace(roleHome(session.user.role));
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
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <View style={styles.brandBlock}>
              <Image
                source={require('../../assets/logo.png')}
                resizeMode="contain"
                style={styles.logo}
              />
              <Text style={styles.brandName}>FINIKO</Text>
              <Text style={styles.brandSubtitle}>
                Ravi de vous revoir ! Connectez-vous à votre compte.
              </Text>
            </View>

            <View style={styles.tabs}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: true }}
                style={[styles.tab, styles.tabActive]}
              >
                <Text style={[styles.tabText, styles.tabTextActive]}>Se connecter</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/(auth)/register')}
                style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
              >
                <Text style={styles.tabText}>S&apos;inscrire</Text>
              </Pressable>
            </View>

            {notice && !error ? (
              <View style={styles.message}>
                <InlineMessage tone="success">{notice}</InlineMessage>
              </View>
            ) : null}

            <View style={styles.field}>
              <Text style={styles.label}>Numéro de téléphone ou email</Text>
              <View style={styles.inputShell}>
                <Feather color="#64748B" name="phone" size={20} />
                <TextInput
                  autoCapitalize="none"
                  autoComplete="username"
                  autoCorrect={false}
                  keyboardType="email-address"
                  onChangeText={setIdentifier}
                  placeholder="Ex: +22370000002 ou client@finiko.ml"
                  placeholderTextColor="#94A3B8"
                  style={styles.input}
                  value={identifier}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Mot de passe</Text>
              <View style={styles.inputShell}>
                <Feather color="#64748B" name="lock" size={20} />
                <TextInput
                  autoCapitalize="none"
                  autoComplete="current-password"
                  onChangeText={setPassword}
                  onSubmitEditing={() => void onSubmit()}
                  placeholder="••••••••"
                  placeholderTextColor="#94A3B8"
                  returnKeyType="go"
                  secureTextEntry={!showPassword}
                  style={styles.input}
                  value={password}
                />
                <Pressable
                  accessibilityLabel={
                    showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
                  }
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => setShowPassword((visible) => !visible)}
                >
                  <Feather color="#64748B" name={showPassword ? 'eye' : 'eye-off'} size={20} />
                </Pressable>
              </View>
            </View>

            <Pressable
              accessibilityRole="link"
              onPress={() => router.push('/(auth)/forgot-password')}
              style={({ pressed }) => [styles.forgot, pressed && styles.pressed]}
            >
              <Text style={styles.forgotText}>Mot de passe oublié ?</Text>
            </Pressable>

            {error ? (
              <View style={styles.message}>
                <InlineMessage tone="error">{error}</InlineMessage>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: loading, disabled: loading }}
              disabled={loading}
              onPress={() => void onSubmit()}
              style={({ pressed }) => [
                styles.submit,
                pressed && styles.submitPressed,
                loading && styles.submitDisabled,
              ]}
            >
              {loading ? (
                <ActivityIndicator color={colors.surface} />
              ) : (
                <Text style={styles.submitText}>Se connecter</Text>
              )}
            </Pressable>

            <View style={styles.registerRow}>
              <Text style={styles.registerPrompt}>Pas de compte ? </Text>
              <Pressable accessibilityRole="link" onPress={() => router.push('/(auth)/register')}>
                <Text style={styles.registerLink}>Créer un compte</Text>
              </Pressable>
            </View>

            <View style={styles.legal}>
              <Text style={styles.legalText}>
                En continuant, vous acceptez nos{' '}
                <Text
                  accessibilityRole="link"
                  onPress={() => router.push('/(auth)/conditions-utilisation')}
                  style={styles.legalLink}
                >
                  Conditions d&apos;utilisation
                </Text>
                .
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  content: {
    alignSelf: 'center',
    maxWidth: 460,
    width: '100%',
  },
  brandBlock: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logo: {
    height: 99,
    marginBottom: 16,
    width: 80,
  },
  brandName: {
    color: colors.neutral[900],
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 36,
  },
  brandSubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
    textAlign: 'center',
  },
  tabs: {
    backgroundColor: 'rgba(226, 232, 240, 0.8)',
    borderRadius: 16,
    flexDirection: 'row',
    marginBottom: 24,
    padding: 6,
  },
  tab: {
    alignItems: 'center',
    borderRadius: 12,
    flex: 1,
    paddingVertical: 12,
  },
  tabActive: {
    backgroundColor: colors.surface,
    elevation: 1,
    shadowColor: '#0F172A',
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  tabText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  tabTextActive: {
    color: colors.brand[600],
  },
  message: {
    marginBottom: 16,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    color: colors.neutral[700],
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.6,
    lineHeight: 16,
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  inputShell: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  input: {
    color: colors.neutral[900],
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    marginLeft: 12,
    padding: 0,
  },
  forgot: {
    alignItems: 'flex-end',
    marginBottom: 24,
  },
  forgotText: {
    color: colors.brand[600],
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  submit: {
    alignItems: 'center',
    backgroundColor: colors.brand[600],
    borderRadius: 16,
    elevation: 5,
    justifyContent: 'center',
    minHeight: 54,
    paddingVertical: 16,
    shadowColor: colors.brand[500],
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  submitPressed: {
    opacity: 0.9,
  },
  submitDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  registerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
  },
  registerPrompt: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  registerLink: {
    color: colors.brand[600],
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  legal: {
    alignItems: 'center',
    marginTop: 24,
  },
  legalText: {
    color: colors.neutral[400],
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  legalLink: {
    color: colors.brand[600],
    textDecorationLine: 'underline',
  },
  pressed: {
    opacity: 0.7,
  },
});
