import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLogout } from '../lib/use-logout';
import { colors, radius, spacing, typography } from '../theme/tokens';

export type DashboardIcon = ComponentProps<typeof Ionicons>['name'];

/** Initiales affichées dans l'avatar de l'en-tête. */
export function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

const TONES = {
  brand: { background: colors.brand[600], soft: colors.brand[50], foreground: colors.brand[700] },
  dark: { background: colors.brand[900], soft: colors.brand[50], foreground: colors.brand[900] },
  success: {
    background: colors.success,
    soft: colors.successSurface,
    foreground: colors.success,
  },
  warning: {
    background: colors.warning,
    soft: colors.warningSurface,
    foreground: colors.warning,
  },
  danger: {
    background: colors.danger,
    soft: colors.dangerSurface,
    foreground: colors.danger,
  },
  purple: { background: colors.accent.purple, soft: '#FAF5FF', foreground: colors.accent.purple },
  orange: { background: colors.accent.orange, soft: '#FFF7ED', foreground: colors.accent.orange },
  cyan: { background: colors.accent.cyan, soft: '#ECFEFF', foreground: colors.accent.cyan },
} as const;

export type DashboardTone = keyof typeof TONES;

export interface DashboardTab {
  key: string;
  label: string;
  icon: DashboardIcon;
  active: boolean;
  onPress: () => void;
}

interface DashboardShellProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  userName: string;
  initials: string;
  tabs: DashboardTab[];
  children: ReactNode;
}

/** En-tête, zone scrollable et barre d'onglets commune aux quatre espaces. */
export function DashboardShell({
  eyebrow,
  title,
  subtitle,
  userName,
  initials,
  tabs,
  children,
}: DashboardShellProps) {
  const insets = useSafeAreaInsets();
  const { logout, loggingOut } = useLogout();

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>

            <View style={styles.headerIdentity}>
              <Text style={styles.eyebrow}>{eyebrow}</Text>
              <Text style={styles.userName} numberOfLines={1}>
                {userName}
              </Text>
            </View>

            <Pressable
              accessibilityLabel="Notifications"
              accessibilityRole="button"
              onPress={() => router.push('/(app)/notifications')}
              style={({ pressed }) => [styles.logout, pressed && styles.pressed]}
            >
              <Ionicons color={colors.surface} name="notifications-outline" size={20} />
            </Pressable>

            <Pressable
              accessibilityLabel="Se déconnecter"
              accessibilityRole="button"
              disabled={loggingOut}
              onPress={() => void logout()}
              style={({ pressed }) => [styles.logout, pressed && styles.pressed]}
            >
              {loggingOut ? (
                <ActivityIndicator color={colors.surface} size="small" />
              ) : (
                <Ionicons color={colors.surface} name="log-out-outline" size={20} />
              )}
            </Pressable>
          </View>

          <Text style={styles.headerTitle}>{title}</Text>
          {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
        </View>
      </SafeAreaView>

      <View style={styles.body}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
        >
          {children}
        </ScrollView>

        <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          {tabs.map((tab) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: tab.active }}
              key={tab.key}
              onPress={tab.onPress}
              style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
            >
              <View style={[styles.tabIcon, tab.active && styles.tabIconActive]}>
                <Ionicons
                  color={tab.active ? colors.brand[700] : colors.textMuted}
                  name={tab.icon}
                  size={21}
                />
              </View>
              <Text style={[styles.tabLabel, tab.active && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

interface KpiCardProps {
  label: string;
  value: string;
  icon: DashboardIcon;
  tone?: DashboardTone;
  hint?: string;
  loading?: boolean;
  onPress?: () => void;
}

/** Grande carte KPI colorée, comme sur le dashboard v1. */
export function KpiCard({
  label,
  value,
  icon,
  tone = 'brand',
  hint,
  loading = false,
  onPress,
}: KpiCardProps) {
  const palette = TONES[tone];

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.kpi,
        { backgroundColor: palette.background },
        pressed && onPress ? styles.pressed : null,
      ]}
    >
      <View style={styles.kpiTop}>
        <Ionicons color={colors.surface} name={icon} size={22} />
        {onPress ? (
          <Ionicons color="rgba(255,255,255,0.72)" name="chevron-forward" size={16} />
        ) : null}
      </View>
      <Text style={styles.kpiValue}>{loading ? '…' : value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      {hint ? <Text style={styles.kpiHint}>{hint}</Text> : null}
    </Pressable>
  );
}

interface StatTileProps {
  label: string;
  value: string;
  icon: DashboardIcon;
  tone?: DashboardTone;
  loading?: boolean;
}

/** Petite statistique sur fond blanc. */
export function StatTile({ label, value, icon, tone = 'brand', loading = false }: StatTileProps) {
  const palette = TONES[tone];

  return (
    <View style={styles.statTile}>
      <View style={[styles.statIcon, { backgroundColor: palette.soft }]}>
        <Ionicons color={palette.foreground} name={icon} size={19} />
      </View>
      <Text style={styles.statValue}>{loading ? '…' : value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

interface MenuRowProps {
  title: string;
  subtitle: string;
  icon: DashboardIcon;
  tone?: DashboardTone;
  badge?: string;
  onPress?: () => void;
}

/** Ligne de menu de gestion avec icône colorée et chevron. */
export function MenuRow({ title, subtitle, icon, tone = 'brand', badge, onPress }: MenuRowProps) {
  const palette = TONES[tone];

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, pressed && onPress ? styles.pressed : null]}
    >
      <View style={[styles.menuIcon, { backgroundColor: palette.soft }]}>
        <Ionicons color={palette.foreground} name={icon} size={20} />
      </View>

      <View style={styles.menuText}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuSubtitle}>{subtitle}</Text>
      </View>

      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : onPress ? (
        <Ionicons color={colors.neutral[400]} name="chevron-forward" size={18} />
      ) : null}
    </Pressable>
  );
}

export function SectionHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {right}
    </View>
  );
}

/** Carte carrée de service, utilisée sur l'accueil client. */
export function ServiceCard({
  title,
  icon,
  tone = 'brand',
  onPress,
}: {
  title: string;
  icon: DashboardIcon;
  tone?: DashboardTone;
  onPress: () => void;
}) {
  const palette = TONES[tone];

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.serviceCard, pressed && styles.pressed]}
    >
      <View style={[styles.serviceIcon, { backgroundColor: palette.soft }]}>
        <Ionicons color={palette.foreground} name={icon} size={23} />
      </View>
      <Text style={styles.serviceTitle}>{title}</Text>
      <Ionicons color={colors.neutral[400]} name="arrow-forward" size={15} />
    </Pressable>
  );
}

interface FilterOption {
  key: string;
  label: string;
}

export function FilterChips({
  options,
  selected,
  onSelect,
}: {
  options: FilterOption[];
  selected: string;
  onSelect: (key: string) => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.chips}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chipsScroll}
    >
      {options.map((option) => {
        const active = option.key === selected;

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            key={option.key}
            onPress={() => onSelect(option.key)}
            style={({ pressed }) => [
              styles.chip,
              active && styles.chipActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function DashboardEmpty({
  icon,
  title,
  message,
  action,
}: {
  icon: DashboardIcon;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons color={colors.brand[700]} name={icon} size={28} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {action}
    </View>
  );
}

export function PromoCard({
  eyebrow,
  title,
  message,
  cta,
  icon,
  onPress,
}: {
  eyebrow: string;
  title: string;
  message: string;
  cta: string;
  icon: DashboardIcon;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.promo, pressed && styles.pressed]}
    >
      <View style={styles.promoText}>
        <Text style={styles.promoEyebrow}>{eyebrow}</Text>
        <Text style={styles.promoTitle}>{title}</Text>
        <Text style={styles.promoMessage}>{message}</Text>
        <View style={styles.promoCta}>
          <Text style={styles.promoCtaText}>{cta}</Text>
          <Ionicons color={colors.surface} name="arrow-forward" size={15} />
        </View>
      </View>

      <View style={styles.promoIcon}>
        <Ionicons color={colors.surface} name={icon} size={34} />
      </View>
    </Pressable>
  );
}

export function NoticeCard({
  title,
  message,
  icon = 'information-circle-outline',
}: {
  title: string;
  message: string;
  icon?: DashboardIcon;
}) {
  return (
    <View style={styles.notice}>
      <Ionicons color={colors.brand[700]} name={icon} size={20} />
      <View style={styles.noticeText}>
        <Text style={styles.noticeTitle}>{title}</Text>
        <Text style={styles.noticeMessage}>{message}</Text>
      </View>
    </View>
  );
}

export const dashboardStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
});

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.brand[900],
    flex: 1,
  },
  headerSafe: {
    backgroundColor: colors.brand[900],
  },
  header: {
    gap: spacing.sm,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  headerTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.brand[600],
    borderColor: 'rgba(255,255,255,0.24)',
    borderRadius: 24,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  avatarText: {
    ...typography.title,
    color: colors.surface,
    fontSize: 16,
    lineHeight: 20,
  },
  headerIdentity: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    ...typography.caption,
    color: colors.brand[100],
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  userName: {
    ...typography.title,
    color: colors.surface,
    fontSize: 17,
    lineHeight: 22,
  },
  logout: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  headerTitle: {
    ...typography.display,
    color: colors.surface,
    fontSize: 28,
    lineHeight: 34,
    marginTop: spacing.xs,
  },
  headerSubtitle: {
    ...typography.body,
    color: colors.brand[100],
    fontSize: 14,
    lineHeight: 20,
  },
  body: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    flex: 1,
    overflow: 'hidden',
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: spacing.lg,
    padding: spacing.xl,
  },
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  tab: {
    alignItems: 'center',
    flex: 1,
    gap: 3,
    paddingVertical: 2,
  },
  tabIcon: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 32,
    justifyContent: 'center',
    width: 48,
  },
  tabIconActive: {
    backgroundColor: colors.brand[50],
  },
  tabLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 14,
  },
  tabLabelActive: {
    color: colors.brand[700],
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.78,
  },
  kpi: {
    borderRadius: radius.lg,
    flex: 1,
    gap: 2,
    minHeight: 124,
    padding: spacing.lg,
  },
  kpiTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  kpiValue: {
    ...typography.display,
    color: colors.surface,
    fontSize: 26,
    lineHeight: 32,
    marginTop: spacing.sm,
  },
  kpiLabel: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12,
    lineHeight: 16,
  },
  kpiHint: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.62)',
    fontSize: 10,
    lineHeight: 14,
    marginTop: 2,
  },
  statTile: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flex: 1,
    gap: 2,
    minWidth: 130,
    padding: spacing.lg,
  },
  statIcon: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 36,
    justifyContent: 'center',
    marginBottom: spacing.sm,
    width: 36,
  },
  statValue: {
    ...typography.title,
    color: colors.text,
    fontSize: 22,
    lineHeight: 28,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  menuRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  menuIcon: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  menuText: {
    flex: 1,
    gap: 2,
  },
  menuTitle: {
    ...typography.body,
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  menuSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  badge: {
    backgroundColor: colors.warningSurface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeText: {
    ...typography.caption,
    color: colors.warning,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    ...typography.title,
    color: colors.text,
    fontSize: 18,
    lineHeight: 24,
  },
  serviceCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    gap: spacing.sm,
    minHeight: 112,
    padding: spacing.lg,
  },
  serviceIcon: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  serviceTitle: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  chipsScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  chips: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chip: {
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexGrow: 0,
    flexShrink: 0,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  chipActive: {
    backgroundColor: colors.brand[600],
    borderColor: colors.brand[600],
  },
  chipText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  chipTextActive: {
    color: colors.surface,
    fontWeight: '700',
  },
  empty: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.xl,
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: colors.brand[50],
    borderRadius: radius.pill,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  emptyTitle: {
    ...typography.title,
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
  },
  emptyMessage: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  promo: {
    backgroundColor: colors.brand[900],
    borderRadius: radius.lg,
    flexDirection: 'row',
    gap: spacing.md,
    overflow: 'hidden',
    padding: spacing.lg,
  },
  promoText: {
    flex: 1,
    gap: spacing.xs,
  },
  promoEyebrow: {
    ...typography.caption,
    color: colors.brand[300],
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  promoTitle: {
    ...typography.title,
    color: colors.surface,
    fontSize: 20,
    lineHeight: 26,
  },
  promoMessage: {
    ...typography.caption,
    color: colors.brand[100],
    fontSize: 12,
    lineHeight: 17,
  },
  promoCta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  promoCtaText: {
    ...typography.caption,
    color: colors.surface,
    fontSize: 12,
    fontWeight: '700',
  },
  promoIcon: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.md,
    height: 60,
    justifyContent: 'center',
    width: 60,
  },
  notice: {
    alignItems: 'flex-start',
    backgroundColor: colors.brand[50],
    borderColor: colors.brand[100],
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  noticeText: {
    flex: 1,
    gap: 2,
  },
  noticeTitle: {
    ...typography.caption,
    color: colors.brand[700],
    fontWeight: '700',
  },
  noticeMessage: {
    ...typography.caption,
    color: colors.brand[700],
    fontSize: 11,
    lineHeight: 15,
  },
});
