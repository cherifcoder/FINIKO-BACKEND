import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  placeParts,
  reverseGeocode,
  searchAddresses,
  shortAddress,
  type PlaceSuggestion,
} from '../../src/lib/nominatim';
import { coordinatesLabel, type Coordinates } from '../../src/lib/maps';
import { useOrderAddressStore } from '../../src/stores/order-address.store';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';
import { LocationPickerMap } from '../../src/ui/map';

const SEARCH_DEBOUNCE_MS = 700;

type AddressTarget = 'pickup' | 'delivery';

export default function AddressPickerScreen() {
  const { target } = useLocalSearchParams<{ target?: string }>();
  const addressTarget: AddressTarget = target === 'delivery' ? 'delivery' : 'pickup';
  const pickup = useOrderAddressStore((state) => state.pickup);
  const delivery = useOrderAddressStore((state) => state.delivery);
  const setPickup = useOrderAddressStore((state) => state.setPickup);
  const setDelivery = useOrderAddressStore((state) => state.setDelivery);

  const initial = addressTarget === 'pickup' ? pickup : delivery;
  const [center, setCenter] = useState<Coordinates>(initial.coordinates);
  const [selectedText, setSelectedText] = useState(initial.text);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const reverseRequestRef = useRef(0);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    },
    [],
  );

  async function updateFromCoordinates(coordinates: Coordinates) {
    setCenter(coordinates);
    setMessage(null);
    setSelectedText('Recherche de l’adresse…');

    const requestId = reverseRequestRef.current + 1;
    reverseRequestRef.current = requestId;
    const displayName = await reverseGeocode(coordinates.lat, coordinates.lng);

    if (reverseRequestRef.current !== requestId) return;

    setSelectedText(
      displayName ? shortAddress(displayName, 3) : `Point ${coordinatesLabel(coordinates)}`,
    );
  }

  function handleSearchChange(value: string) {
    setSearchQuery(value);
    setMessage(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();

    if (value.trim().length < 3) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;
      setIsSearching(true);

      void searchAddresses(value, controller.signal)
        .then((places) => {
          setSuggestions(places);

          if (places.length === 0) {
            setMessage('Aucune adresse trouvée. Essayez un quartier ou un repère connu.');
          }
        })
        .catch((error: unknown) => {
          if (error instanceof Error && error.name === 'AbortError') return;
          setMessage('La recherche d’adresse est momentanément indisponible.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
  }

  function selectSuggestion(place: PlaceSuggestion) {
    const coordinates = { lat: place.lat, lng: place.lng };
    const text = shortAddress(place.displayName, 4);

    Keyboard.dismiss();
    setSuggestions([]);
    setSearchQuery(placeParts(place.displayName).title);
    setSelectedText(text);
    setCenter(coordinates);
    setMessage(null);
    reverseRequestRef.current += 1;
  }

  async function locateMe() {
    setIsLocating(true);
    setMessage(null);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();

      if (permission.status !== 'granted') {
        setMessage('Autorisez la localisation pour centrer la carte sur votre position.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      await updateFromCoordinates({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });
    } catch {
      setMessage('Votre position n’a pas pu être récupérée.');
    } finally {
      setIsLocating(false);
    }
  }

  function validateAddress() {
    const text = selectedText.trim();

    if (text.length < 5) {
      setMessage('Sélectionnez une adresse sur la carte ou dans les suggestions.');
      return;
    }

    const address = { text, coordinates: center };

    if (addressTarget === 'pickup') setPickup(address);
    else setDelivery(address);

    router.back();
  }

  const title = addressTarget === 'pickup' ? 'Adresse de ramassage' : 'Adresse de livraison';

  return (
    <View style={styles.root}>
      <LocationPickerMap
        markerTitle={title}
        onChange={(coordinates) => void updateFromCoordinates(coordinates)}
        value={center}
      />

      <SafeAreaView edges={['top', 'bottom']} pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.top}>
          <View style={styles.searchRow}>
            <Pressable
              accessibilityLabel="Retour"
              accessibilityRole="button"
              onPress={() => router.back()}
              style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
            >
              <Ionicons color={colors.text} name="arrow-back" size={21} />
            </Pressable>

            <View style={styles.searchBox}>
              <Ionicons color={colors.textMuted} name="search" size={19} />
              <TextInput
                onChangeText={handleSearchChange}
                placeholder="Rechercher une adresse à Bamako…"
                placeholderTextColor={colors.neutral[400]}
                style={styles.searchInput}
                value={searchQuery}
              />
              {isSearching ? <ActivityIndicator color={colors.brand[600]} size="small" /> : null}
              {searchQuery.length > 0 && !isSearching ? (
                <Pressable
                  accessibilityLabel="Effacer la recherche"
                  accessibilityRole="button"
                  onPress={() => {
                    setSearchQuery('');
                    setSuggestions([]);
                    setMessage(null);
                  }}
                >
                  <Ionicons color={colors.neutral[400]} name="close-circle" size={18} />
                </Pressable>
              ) : null}
            </View>

            <Pressable
              accessibilityLabel="Ma position"
              accessibilityRole="button"
              disabled={isLocating}
              onPress={() => void locateMe()}
              style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
            >
              {isLocating ? (
                <ActivityIndicator color={colors.brand[700]} size="small" />
              ) : (
                <Ionicons color={colors.brand[700]} name="locate" size={21} />
              )}
            </Pressable>
          </View>

          {suggestions.length > 0 ? (
            <View style={styles.suggestions}>
              <ScrollView keyboardShouldPersistTaps="handled">
                {suggestions.map((place) => {
                  const parts = placeParts(place.displayName);

                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={place.id}
                      onPress={() => selectSuggestion(place)}
                      style={({ pressed }) => [
                        styles.suggestionRow,
                        pressed && styles.suggestionPressed,
                      ]}
                    >
                      <Ionicons color={colors.brand[600]} name="location-outline" size={19} />
                      <View style={styles.suggestionText}>
                        <Text numberOfLines={1} style={styles.suggestionTitle}>
                          {parts.title}
                        </Text>
                        {parts.subtitle ? (
                          <Text numberOfLines={1} style={styles.suggestionSubtitle}>
                            {parts.subtitle}
                          </Text>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          {message ? (
            <View style={styles.message}>
              <Ionicons color={colors.warning} name="information-circle-outline" size={18} />
              <Text style={styles.messageText}>{message}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.bottom}>
          <View style={styles.handle} />
          <Text style={styles.eyebrow}>{title}</Text>

          <View style={styles.addressRow}>
            <View style={styles.addressDot} />
            <View style={styles.addressTextBlock}>
              <Text style={styles.addressText}>{selectedText}</Text>
              <Text style={styles.coordinates}>{coordinatesLabel(center)}</Text>
            </View>
          </View>

          <Text style={styles.hint}>
            Touchez la carte, déplacez le repère ou recherchez un lieu, comme dans Google Maps.
          </Text>

          <Pressable
            accessibilityRole="button"
            disabled={selectedText.trim().length < 5}
            onPress={validateAddress}
            style={({ pressed }) => [
              styles.validateButton,
              pressed && styles.pressed,
              selectedText.trim().length < 5 && styles.validateButtonDisabled,
            ]}
          >
            <Ionicons color={colors.surface} name="checkmark-circle" size={20} />
            <Text style={styles.validateText}>Utiliser cette adresse</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.background,
    flex: 1,
  },
  overlay: {
    bottom: 0,
    justifyContent: 'space-between',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  top: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  searchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  roundButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    width: 44,
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
  },
  searchInput: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  suggestions: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    maxHeight: 260,
    overflow: 'hidden',
  },
  suggestionRow: {
    alignItems: 'flex-start',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  suggestionPressed: {
    backgroundColor: colors.brand[50],
  },
  suggestionText: {
    flex: 1,
    gap: 2,
  },
  suggestionTitle: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '700',
  },
  suggestionSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
  },
  message: {
    alignItems: 'flex-start',
    backgroundColor: colors.warningSurface,
    borderColor: colors.warningBorder,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  messageText: {
    ...typography.caption,
    color: colors.warning,
    flex: 1,
    fontSize: 12,
  },
  bottom: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    height: 4,
    width: 48,
  },
  eyebrow: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  addressRow: {
    alignItems: 'flex-start',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  addressDot: {
    backgroundColor: colors.brand[600],
    borderRadius: radius.pill,
    height: 10,
    marginTop: 5,
    width: 10,
  },
  addressTextBlock: {
    flex: 1,
    gap: 2,
  },
  addressText: {
    ...typography.body,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  coordinates: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  validateButton: {
    alignItems: 'center',
    backgroundColor: colors.brand[600],
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 50,
  },
  validateButtonDisabled: {
    opacity: 0.45,
  },
  validateText: {
    ...typography.body,
    color: colors.surface,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.8,
  },
});
