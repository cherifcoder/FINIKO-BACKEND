import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../theme/tokens';

interface ScreenProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function Screen({ title, subtitle, onBack, children, footer }: ScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          {onBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retour"
              onPress={onBack}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            >
              <Text style={styles.backText}>←</Text>
            </Pressable>
          ) : null}

          <View style={styles.headerText}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        </View>

        {children}
        {footer}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

type PillTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: PillTone }) {
  return (
    <View
      style={[
        styles.pill,
        tone === 'brand' && styles.pillBrand,
        tone === 'success' && styles.pillSuccess,
        tone === 'warning' && styles.pillWarning,
        tone === 'danger' && styles.pillDanger,
      ]}
    >
      <Text
        style={[
          styles.pillText,
          tone === 'brand' && styles.pillTextBrand,
          tone === 'success' && styles.pillTextSuccess,
          tone === 'warning' && styles.pillTextWarning,
          tone === 'danger' && styles.pillTextDanger,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

interface QuotaBarProps {
  used: number;
  total: number;
  reserved?: number;
}

export function QuotaBar({ used, total, reserved = 0 }: QuotaBarProps) {
  const safeTotal = Math.max(total, 1);
  const usedPercent = Math.min(100, Math.max(0, (used / safeTotal) * 100));
  const reservedPercent = Math.min(100 - usedPercent, Math.max(0, (reserved / safeTotal) * 100));
  const available = Math.max(0, total - used - reserved);

  return (
    <View style={styles.quota}>
      <View style={styles.quotaHeader}>
        <Text style={styles.quotaLabel}>Quota du pack</Text>
        <Text style={styles.quotaValue}>
          {used} / {total} unités
        </Text>
      </View>

      <View style={styles.quotaTrack}>
        <View style={[styles.quotaUsed, { width: `${usedPercent}%` }]} />
        <View style={[styles.quotaReserved, { width: `${reservedPercent}%` }]} />
      </View>

      <Text style={styles.quotaHint}>
        {available} unité{available > 1 ? 's' : ''} disponible{available > 1 ? 's' : ''}
        {reserved > 0 ? ` · ${reserved} réservée${reserved > 1 ? 's' : ''}` : ''}
      </Text>
    </View>
  );
}

export function LoadingBlock({ label = 'Chargement…' }: { label?: string }) {
  return (
    <View style={styles.state}>
      <ActivityIndicator color={colors.brand[600]} />
      <Text style={styles.stateText}>{label}</Text>
    </View>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.state}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.stateText}>{message}</Text>
      {action}
    </View>
  );
}

export const uiStyles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
  },
  value: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '700',
    textAlign: 'right',
  },
});

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.brand[900],
    flex: 1,
  },
  container: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    flexGrow: 1,
    gap: spacing.lg,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: colors.brand[50],
    borderRadius: radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  backText: {
    color: colors.brand[700],
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 24,
  },
  pressed: {
    opacity: 0.75,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    ...typography.display,
    fontSize: 26,
    lineHeight: 32,
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
    gap: spacing.md,
    padding: spacing.lg,
  },
  sectionTitle: {
    ...typography.title,
    color: colors.text,
    fontSize: 18,
    lineHeight: 24,
  },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.background,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  pillBrand: {
    backgroundColor: colors.brand[50],
  },
  pillSuccess: {
    backgroundColor: colors.successSurface,
  },
  pillWarning: {
    backgroundColor: colors.warningSurface,
  },
  pillDanger: {
    backgroundColor: colors.dangerSurface,
  },
  pillText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  pillTextBrand: {
    color: colors.brand[700],
  },
  pillTextSuccess: {
    color: colors.success,
  },
  pillTextWarning: {
    color: colors.warning,
  },
  pillTextDanger: {
    color: colors.danger,
  },
  quota: {
    gap: spacing.sm,
  },
  quotaHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quotaLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  quotaValue: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '700',
  },
  quotaTrack: {
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    flexDirection: 'row',
    height: 10,
    overflow: 'hidden',
  },
  quotaUsed: {
    backgroundColor: colors.brand[600],
    height: '100%',
  },
  quotaReserved: {
    backgroundColor: colors.warning,
    height: '100%',
  },
  quotaHint: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 12,
  },
  state: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  stateText: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  emptyTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
    textAlign: 'center',
  },
});
