import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../theme/tokens';

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>

          <View style={styles.card}>{children}</View>

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.textMuted} style={styles.input} {...props} />
    </View>
  );
}

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export function PrimaryButton({ label, onPress, loading, disabled }: PrimaryButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.buttonPressed,
        isDisabled && styles.buttonDisabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.surface} />
      ) : (
        <Text style={styles.buttonText}>{label}</Text>
      )}
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, loading, disabled }: PrimaryButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles.buttonSecondary,
        pressed && styles.buttonPressed,
        isDisabled && styles.buttonDisabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.brand[700]} />
      ) : (
        <Text style={styles.buttonSecondaryText}>{label}</Text>
      )}
    </Pressable>
  );
}

export function DangerButton({ label, onPress, loading, disabled }: PrimaryButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles.buttonDanger,
        pressed && styles.buttonPressed,
        isDisabled && styles.buttonDisabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.danger} />
      ) : (
        <Text style={styles.buttonDangerText}>{label}</Text>
      )}
    </Pressable>
  );
}

interface InlineMessageProps {
  tone?: 'error' | 'success' | 'info';
  children: ReactNode;
}

export function InlineMessage({ tone = 'info', children }: InlineMessageProps) {
  return (
    <View
      style={[
        styles.message,
        tone === 'error' && styles.messageError,
        tone === 'success' && styles.messageSuccess,
        tone === 'info' && styles.messageInfo,
      ]}
    >
      <Text
        style={[
          styles.messageText,
          tone === 'error' && styles.messageTextError,
          tone === 'success' && styles.messageTextSuccess,
          tone === 'info' && styles.messageTextInfo,
        ]}
      >
        {children}
      </Text>
    </View>
  );
}

interface CheckRowProps {
  checked: boolean;
  onToggle: () => void;
  label: string;
}

export function CheckRow({ checked, onToggle, label }: CheckRowProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onToggle}
      style={styles.checkRow}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked ? <Text style={styles.checkmark}>✓</Text> : null}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </Pressable>
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
    flexGrow: 1,
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
  card: {
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
    alignItems: 'center',
    backgroundColor: colors.brand[600],
    borderRadius: radius.md,
    minHeight: 48,
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    ...typography.body,
    color: colors.surface,
    fontWeight: '700',
  },
  buttonSecondary: {
    backgroundColor: colors.surface,
    borderColor: colors.brand[600],
    borderWidth: 1,
  },
  buttonSecondaryText: {
    ...typography.body,
    color: colors.brand[700],
    fontWeight: '700',
  },
  buttonDanger: {
    backgroundColor: colors.surface,
    borderColor: colors.danger,
    borderWidth: 1,
  },
  buttonDangerText: {
    ...typography.body,
    color: colors.danger,
    fontWeight: '700',
  },
  message: {
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  messageError: {
    backgroundColor: '#FDECEA',
    borderColor: '#F5C6C0',
  },
  messageSuccess: {
    backgroundColor: '#E8F5EE',
    borderColor: '#BDE3CC',
  },
  messageInfo: {
    backgroundColor: colors.brand[50],
    borderColor: colors.brand[100],
  },
  messageText: {
    ...typography.caption,
  },
  messageTextError: {
    color: colors.danger,
  },
  messageTextSuccess: {
    color: colors.success,
  },
  messageTextInfo: {
    color: colors.brand[700],
  },
  checkRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  checkbox: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 4,
    borderWidth: 1,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  checkboxChecked: {
    backgroundColor: colors.brand[600],
    borderColor: colors.brand[600],
  },
  checkmark: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '700',
  },
  checkLabel: {
    ...typography.caption,
    color: colors.textMuted,
    flex: 1,
  },
  footer: {
    alignItems: 'center',
  },
});
