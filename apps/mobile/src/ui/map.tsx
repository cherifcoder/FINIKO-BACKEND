/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import type { Coordinates } from '../lib/maps';
import { colors, radius, spacing, typography } from '../theme/tokens';

/**
 * react-native-maps est un module natif : chargement conditionnel obligatoire.
 * Sur Android, le SDK Google Maps exige une clé API (android.config.googleMaps.apiKey
 * dans app.json). Sans clé, l'instanciation de MapView fait crasher l'app en natif
 * (IllegalStateException "API key not found") : on affiche donc un fallback tant
 * qu'aucune clé n'est configurée.
 */
const googleMapsApiKey: string | undefined =
  Platform.OS === 'android'
    ? (Constants.expoConfig as any)?.android?.config?.googleMaps?.apiKey
    : undefined;

const mapsAvailable = Platform.OS !== 'web' && (Platform.OS === 'ios' || Boolean(googleMapsApiKey));

let MapView: any = null;
let Marker: any = null;
let Polyline: any = null;

if (mapsAvailable) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const maps = require('react-native-maps');
  MapView = maps.default;
  Marker = maps.Marker;
  Polyline = maps.Polyline;
}

const DEFAULT_DELTA = 0.012;

function toRegion(coordinates: Coordinates, delta = DEFAULT_DELTA) {
  return {
    latitude: coordinates.lat,
    longitude: coordinates.lng,
    latitudeDelta: delta,
    longitudeDelta: delta,
  };
}

function WebMapFallback({ message }: { message: string }) {
  return (
    <View style={styles.fallback}>
      <Text style={styles.fallbackIcon}>🗺️</Text>
      <Text style={styles.fallbackText}>{message}</Text>
    </View>
  );
}

interface RouteMapProps {
  pickup: { text?: string; coordinates: Coordinates };
  delivery?: { text?: string; coordinates: Coordinates };
  height?: number;
}

/** Carte de prévisualisation avec les points de ramassage et de livraison. */
export function RouteMap({ pickup, delivery, height = 220 }: RouteMapProps) {
  const mapRef = useRef<any>(null);
  const points = [pickup.coordinates, ...(delivery ? [delivery.coordinates] : [])];

  useEffect(() => {
    if (!mapRef.current) return;

    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(
        points.map((point) => ({ latitude: point.lat, longitude: point.lng })),
        {
          animated: true,
          edgePadding: { bottom: 48, left: 48, right: 48, top: 48 },
        },
      );
    }, 250);

    return () => clearTimeout(timer);
  }, [
    pickup.coordinates.lat,
    pickup.coordinates.lng,
    delivery?.coordinates.lat,
    delivery?.coordinates.lng,
  ]);

  if (!MapView) {
    return (
      <View style={[styles.container, { height }]}>
        <WebMapFallback message="La carte interactive est disponible sur l’application mobile. Les coordonnées GPS sont bien enregistrées." />
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]}>
      <MapView
        initialRegion={toRegion(pickup.coordinates, delivery ? 0.03 : DEFAULT_DELTA)}
        ref={mapRef}
        showsCompass={false}
        showsUserLocation={false}
        style={StyleSheet.absoluteFill}
        toolbarEnabled={false}
      >
        {delivery ? (
          <Polyline
            coordinates={[
              { latitude: pickup.coordinates.lat, longitude: pickup.coordinates.lng },
              { latitude: delivery.coordinates.lat, longitude: delivery.coordinates.lng },
            ]}
            lineColor={colors.brand[600]}
            lineDashPattern={[8, 6]}
            lineWidth={3}
          />
        ) : null}

        <Marker
          coordinate={{ latitude: pickup.coordinates.lat, longitude: pickup.coordinates.lng }}
          description={pickup.text}
          pinColor={colors.brand[600]}
          title="Ramassage"
        />

        {delivery ? (
          <Marker
            coordinate={{ latitude: delivery.coordinates.lat, longitude: delivery.coordinates.lng }}
            description={delivery.text}
            pinColor={colors.success}
            title="Livraison"
          />
        ) : null}
      </MapView>
    </View>
  );
}

interface LocationPickerMapProps {
  value: Coordinates;
  onChange: (coordinates: Coordinates) => void;
  height?: number;
  markerTitle?: string;
}

/** Carte plein écran utilisée pour choisir une adresse au doigt. */
export function LocationPickerMap({
  value,
  onChange,
  height,
  markerTitle = 'Adresse sélectionnée',
}: LocationPickerMapProps) {
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    mapRef.current.animateToRegion(toRegion(value, 0.008), 350);
  }, [value.lat, value.lng]);

  if (!MapView) {
    return (
      <View style={[styles.container, height ? { height } : styles.fill]}>
        <WebMapFallback message="La carte interactive est disponible sur mobile. Utilisez la recherche d’adresse pour sélectionner un point." />
      </View>
    );
  }

  return (
    <View style={[styles.container, height ? { height } : styles.fill]}>
      <MapView
        initialRegion={toRegion(value)}
        onPress={(event: { nativeEvent: { coordinate: Coordinates } }) =>
          onChange(event.nativeEvent.coordinate)
        }
        ref={mapRef}
        showsCompass
        showsMyLocationButton={false}
        showsUserLocation
        style={StyleSheet.absoluteFill}
        toolbarEnabled={false}
      >
        <Marker
          coordinate={{ latitude: value.lat, longitude: value.lng }}
          draggable
          onDragEnd={(event: { nativeEvent: { coordinate: Coordinates } }) =>
            onChange(event.nativeEvent.coordinate)
          }
          pinColor={colors.brand[600]}
          title={markerTitle}
        />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  fill: {
    flex: 1,
  },
  fallback: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  fallbackIcon: {
    fontSize: 30,
  },
  fallbackText: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
