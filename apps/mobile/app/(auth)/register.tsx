import { Feather } from '@expo/vector-icons';
import { registerSchema } from '@finiko/contracts';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
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
import { registerRequest } from '../../src/api/auth';
import { ApiClientError } from '../../src/api/client';
import { roleHome } from '../../src/lib/role-home';
import { useAuthStore } from '../../src/stores/auth.store';
import { InlineMessage } from '../../src/ui/auth';
import { colors } from '../../src/theme/tokens';

export default function RegisterScreen() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (status === 'authenticated' && user) {
    return <Redirect href={roleHome(user.role)} />;
  }

  const onSubmit = async () => {
    if (password !== confirmPassword) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }

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
              <View style={styles.logo}>
                <Feather color={colors.surface} name="truck" size={38} />
              </View>
              <Text style={styles.brandName}>FINIKO</Text>
              <Text style={styles.brandSubtitle}>
                Créez votre compte et laissez-nous prendre soin de votre linge.
              </Text>
            </View>

            <View style={styles.tabs}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/(auth)/login')}
                style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
              >
                <Text style={styles.tabText}>Se connecter</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: true }}
                style={[styles.tab, styles.tabActive]}
              >
                <Text style={[styles.tabText, styles.tabTextActive]}>S&apos;inscrire</Text>
              </Pressable>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Prénom</Text>
              <View style={styles.inputShell}>
                <Feather color="#64748B" name="user" size={20} />
                <TextInput
                  autoCapitalize="words"
                  autoComplete="given-name"
                  onChangeText={setFirstName}
                  placeholder="Awa"
                  placeholderTextColor="#94A3B8"
                  style={styles.input}
                  value={firstName}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Nom</Text>
              <View style={styles.inputShell}>
                <Feather color="#64748B" name="user" size={20} />
                <TextInput
                  autoCapitalize="words"
                  autoComplete="family-name"
                  onChangeText={setLastName}
                  placeholder="Traoré"
                  placeholderTextColor="#94A3B8"
                  style={styles.input}
                  value={lastName}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Téléphone</Text>
              <View style={styles.inputShell}>
                <Feather color="#64748B" name="phone" size={20} />
                <TextInput
                  autoComplete="tel"
                  keyboardType="phone-pad"
                  onChangeText={setPhone}
                  placeholder="+223 70 00 00 02"
                  placeholderTextColor="#94A3B8"
                  style={styles.input}
                  value={phone}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Email (facultatif)</Text>
              <View style={styles.inputShell}>
                <Feather color="#64748B" name="mail" size={20} />
                <TextInput
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  keyboardType="email-address"
                  onChangeText={setEmail}
                  placeholder="awa@example.com"
                  placeholderTextColor="#94A3B8"
                  style={styles.input}
                  value={email}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Mot de passe</Text>
              <View style={styles.inputShell}>
                <Feather color="#64748B" name="lock" size={20} />
                <TextInput
                  autoCapitalize="none"
                  autoComplete="new-password"
                  onChangeText={setPassword}
                  placeholder="8 caractères, majuscule et chiffre"
                  placeholderTextColor="#94A3B8"
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

            <View style={styles.field}>
              <Text style={styles.label}>Confirmer le mot de passe</Text>
              <View style={styles.inputShell}>
                <Feather color="#64748B" name="lock" size={20} />
                <TextInput
                  autoCapitalize="none"
                  autoComplete="new-password"
                  onChangeText={setConfirmPassword}
                  onSubmitEditing={() => void onSubmit()}
                  placeholder="••••••••"
                  placeholderTextColor="#94A3B8"
                  returnKeyType="go"
                  secureTextEntry={!showPassword}
                  style={styles.input}
                  value={confirmPassword}
                />
              </View>
            </View>

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: acceptTerms }}
              onPress={() => setAcceptTerms((value) => !value)}
              style={({ pressed }) => [styles.termsRow, pressed && styles.pressed]}
            >
              <View style={[styles.checkbox, acceptTerms && styles.checkboxChecked]}>
                {acceptTerms ? <Feather color={colors.surface} name="check" size={14} /> : null}
              </View>
              <Text style={styles.termsText}>
                J&apos;accepte les{' '}
                <Text style={styles.termsLink}>conditions d&apos;utilisation</Text> et la{' '}
                <Text style={styles.termsLink}>politique de confidentialité</Text>.
              </Text>
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
                <Text style={styles.submitText}>Créer mon compte</Text>
              )}
            </Pressable>

            <View style={styles.loginRow}>
              <Text style={styles.loginPrompt}>Déjà un compte ? </Text>
              <Pressable accessibilityRole="link" onPress={() => router.push('/(auth)/login')}>
                <Text style={styles.loginLink}>Se connecter</Text>
              </Pressable>
            </View>

            <View style={styles.legal}>
              <Text style={styles.legalText}>
                Votre numéro sera vérifié par un code SMS. Vos données restent protégées.
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
    marginBottom: 28,
  },
  logo: {
    alignItems: 'center',
    backgroundColor: colors.brand[600],
    borderRadius: 24,
    elevation: 6,
    height: 80,
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: colors.brand[500],
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
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
  termsRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    marginBottom: 20,
    marginTop: 2,
    paddingHorizontal: 4,
  },
  checkbox: {
    alignItems: 'center',
    borderColor: colors.neutral[400],
    borderRadius: 6,
    borderWidth: 1.5,
    height: 22,
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 1,
    width: 22,
  },
  checkboxChecked: {
    backgroundColor: colors.brand[600],
    borderColor: colors.brand[600],
  },
  termsText: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
  },
  termsLink: {
    color: colors.brand[600],
    fontWeight: '600',
  },
  message: {
    marginBottom: 16,
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
  loginRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 28,
  },
  loginPrompt: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  loginLink: {
    color: colors.brand[600],
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  legal: {
    alignItems: 'center',
    marginTop: 20,
  },
  legalText: {
    color: colors.neutral[400],
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
