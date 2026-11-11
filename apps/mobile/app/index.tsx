import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { roleHome } from '../src/lib/role-home';
import { useAuthStore } from '../src/stores/auth.store';
import { colors, typography } from '../src/theme/tokens';

/** Durée d'affichage du splash avant la redirection (ms). */
const SPLASH_DURATION_MS = 1700;

/**
 * Splash d'ouverture : le logo FINIKO apparaît avec une courte animation
 * (fondu + zoom), puis l'utilisateur est dirigé vers la page de connexion —
 * ou directement vers son espace s'il est déjà authentifié.
 */
export default function SplashScreen() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);

  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.55)).current;
  const wordmarkOpacity = useRef(new Animated.Value(0)).current;
  const wordmarkTranslate = useRef(new Animated.Value(10)).current;
  const hasNavigated = useRef(false);

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 450,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(logoScale, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.back(1.7)),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(wordmarkOpacity, {
          toValue: 1,
          duration: 320,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(wordmarkTranslate, {
          toValue: 0,
          duration: 320,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [logoOpacity, logoScale, wordmarkOpacity, wordmarkTranslate]);

  useEffect(() => {
    if (status === 'loading') return;

    const timer = setTimeout(() => {
      if (hasNavigated.current) return;
      hasNavigated.current = true;

      if (status === 'authenticated' && user) {
        router.replace(roleHome(user.role));
      } else {
        router.replace('/(auth)/login');
      }
    }, SPLASH_DURATION_MS);

    return () => clearTimeout(timer);
  }, [status, user]);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <Animated.Image
        source={require('../assets/logo.png')}
        resizeMode="contain"
        style={[styles.logo, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}
      />
      <Animated.View
        style={[
          styles.wordmark,
          { opacity: wordmarkOpacity, transform: [{ translateY: wordmarkTranslate }] },
        ]}
      >
        <Text style={styles.title}>FINIKO</Text>
        <Text style={styles.subtitle}>Votre linge, notre métier.</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
  },
  logo: {
    height: 164,
    marginBottom: 24,
    width: 132,
  },
  wordmark: {
    alignItems: 'center',
  },
  title: {
    color: colors.neutral[900],
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 3,
    lineHeight: 38,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 6,
  },
});
