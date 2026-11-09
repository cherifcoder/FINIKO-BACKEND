import { useQuery } from '@tanstack/react-query';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { listAdminUsersRequest } from '../../src/api/admin';
import { USER_ROLE_LABELS, USER_STATUS_LABELS } from '../../src/lib/labels';
import { roleHome } from '../../src/lib/role-home';
import { useAuthStore } from '../../src/stores/auth.store';
import { FilterChips, getInitials } from '../../src/ui/dashboard';
import { InlineMessage, PrimaryButton, SecondaryButton } from '../../src/ui/auth';
import { EmptyState, LoadingBlock, Pill, Screen } from '../../src/ui/screen';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

const ROLE_FILTERS = [
  { key: 'all', label: 'Tous' },
  { key: 'client', label: 'Clients' },
  { key: 'livreur', label: 'Livreurs' },
  { key: 'pressing', label: 'Pressings' },
  { key: 'admin', label: 'Admins' },
];

export default function AdminUsersScreen() {
  const params = useLocalSearchParams<{ role?: string }>();
  const initialRole =
    typeof params.role === 'string' && ROLE_FILTERS.some((item) => item.key === params.role)
      ? params.role
      : 'all';
  const [role, setRole] = useState(initialRole);

  const usersQuery = useQuery({ queryKey: ['admin', 'users'], queryFn: listAdminUsersRequest });
  const user = useAuthStore((state) => state.user);

  if (!user) return null;
  if (user.role !== 'admin') return <Redirect href={roleHome(user.role)} />;

  const users = usersQuery.data ?? [];
  const filtered = users.filter((user) => role === 'all' || user.role === role);
  const createRole =
    role === 'client' || role === 'pressing' || role === 'livreur' || role === 'admin'
      ? role
      : 'client';
  const createLabel =
    role === 'pressing'
      ? 'Nouveau pressing'
      : role === 'livreur'
        ? 'Nouveau livreur'
        : role === 'admin'
          ? 'Nouvel administrateur'
          : role === 'client'
            ? 'Nouveau client'
            : 'Nouveau compte';

  return (
    <Screen
      onBack={() => router.back()}
      subtitle="Créez, modifiez et supprimez les comptes de la plateforme."
      title="Utilisateurs"
    >
      <FilterChips onSelect={setRole} options={ROLE_FILTERS} selected={role} />

      <PrimaryButton
        label={createLabel}
        onPress={() => router.push(`/(app)/admin-utilisateur-form?role=${createRole}`)}
      />

      {usersQuery.isLoading ? <LoadingBlock label="Chargement des comptes…" /> : null}

      {usersQuery.isError ? (
        <>
          <InlineMessage tone="error">
            Les comptes n'ont pas pu être chargés. Vérifiez votre connexion.
          </InlineMessage>
          <SecondaryButton label="Réessayer" onPress={() => void usersQuery.refetch()} />
        </>
      ) : null}

      {!usersQuery.isLoading && !usersQuery.isError ? (
        <Text style={styles.count}>
          {filtered.length} compte{filtered.length > 1 ? 's' : ''} affiché
          {filtered.length > 1 ? 's' : ''}
        </Text>
      ) : null}

      {usersQuery.isSuccess && filtered.length === 0 ? (
        <EmptyState message="Aucun compte ne correspond à ce filtre." title="Aucun utilisateur" />
      ) : null}

      {filtered.map((account) => (
        <Pressable
          key={account.id}
          accessibilityRole="button"
          onPress={() => router.push(`/(app)/admin-utilisateur-form?id=${account.id}`)}
          style={({ pressed }) => [styles.userCard, pressed && styles.userCardPressed]}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(account.fullName)}</Text>
          </View>

          <View style={styles.userInfo}>
            <Text style={styles.userName}>{account.fullName}</Text>
            <Text style={styles.userMeta}>
              {USER_ROLE_LABELS[account.role]} · {account.phone}
            </Text>
            {account.email ? <Text style={styles.userEmail}>{account.email}</Text> : null}
          </View>

          <View style={styles.userActions}>
            <Pill
              label={USER_STATUS_LABELS[account.status]}
              tone={account.status === 'actif' ? 'success' : 'danger'}
            />
            <Text style={styles.chevron}>›</Text>
          </View>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  count: {
    ...typography.caption,
    color: colors.textMuted,
  },
  userCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  userCardPressed: {
    opacity: 0.8,
  },
  userActions: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  chevron: {
    color: colors.brand[600],
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 24,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.brand[50],
    borderRadius: radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  avatarText: {
    ...typography.caption,
    color: colors.brand[700],
    fontWeight: '800',
  },
  userInfo: {
    flex: 1,
    gap: 2,
  },
  userName: {
    ...typography.body,
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  userMeta: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  userEmail: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
});
