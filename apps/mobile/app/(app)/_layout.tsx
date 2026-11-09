import { Redirect, Stack, usePathname } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuthStore } from '../../src/stores/auth.store';
import { colors } from '../../src/theme/tokens';

export default function AppLayout() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const pathname = usePathname();

  if (status === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.brand[600]} />
      </View>
    );
  }

  if (status === 'anonymous') {
    return <Redirect href="/(auth)/login" />;
  }

  const onPasswordScreen = pathname.endsWith('/change-password');
  const mustChangePassword = Boolean(user?.mustChangePassword) && user?.role !== 'admin';

  if (mustChangePassword && !onPasswordScreen) {
    return <Redirect href="/(app)/change-password" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
  },
});
