import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/tokens';

export function FormSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

interface Choice<T extends string> {
  value: T;
  label: string;
}

export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<Choice<T>>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map((option) => {
        const active = option.value === value;

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            key={option.value}
            onPress={() => onChange(option.value)}
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
    </View>
  );
}

export function MultiChoiceChips<T extends string>({
  options,
  values,
  onToggle,
}: {
  options: ReadonlyArray<Choice<T>>;
  values: readonly T[];
  onToggle: (value: T) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map((option) => {
        const active = values.includes(option.value);

        return (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: active }}
            key={option.value}
            onPress={() => onToggle(option.value)}
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
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    ...typography.title,
    color: colors.text,
    fontSize: 18,
    lineHeight: 24,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexGrow: 0,
    flexShrink: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipActive: {
    backgroundColor: colors.brand[600],
    borderColor: colors.brand[600],
  },
  chipText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  chipTextActive: {
    color: colors.surface,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.8,
  },
});
