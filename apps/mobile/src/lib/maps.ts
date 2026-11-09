import { Linking, Platform } from 'react-native';

export interface Coordinates {
  lat: number;
  lng: number;
}

export const BAMAKO_DEFAULT: Coordinates = { lat: 12.6392, lng: -8.0029 };

export const DEFAULT_PICKUP = {
  text: 'Hamdallaye ACI 2000, Bamako',
  coordinates: BAMAKO_DEFAULT,
} as const;

export const DEFAULT_DELIVERY = {
  text: 'Badalabougou Est, Bamako',
  coordinates: { lat: 12.6322, lng: -7.9941 },
} as const;

export function coordinatesLabel(coordinates: Coordinates): string {
  return `${coordinates.lat.toFixed(5)}, ${coordinates.lng.toFixed(5)}`;
}

export function googleMapsDirectionsUrl(destination: Coordinates): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${destination.lat},${destination.lng}&travelmode=driving`;
}

export function googleMapsPlaceUrl(destination: Coordinates): string {
  return `https://www.google.com/maps/search/?api=1&query=${destination.lat},${destination.lng}`;
}

/**
 * Ouvre l'application Google Maps si elle est installée, puis retombe sur la
 * version web. Le livreur peut ainsi lancer l'itinéraire en un seul geste.
 */
export async function openGoogleMapsDirections(destination: Coordinates): Promise<void> {
  if (Platform.OS === 'web') {
    await Linking.openURL(googleMapsDirectionsUrl(destination));
    return;
  }

  const nativeUrl =
    Platform.OS === 'android'
      ? `google.navigation:q=${destination.lat},${destination.lng}`
      : `comgooglemaps://?daddr=${destination.lat},${destination.lng}&directionsmode=driving`;

  try {
    await Linking.openURL(nativeUrl);
    return;
  } catch {
    // Google Maps n'est pas installé : on ouvre l'itinéraire dans le navigateur.
  }

  await Linking.openURL(googleMapsDirectionsUrl(destination));
}

export async function openGoogleMapsPlace(destination: Coordinates): Promise<void> {
  if (Platform.OS === 'web') {
    await Linking.openURL(googleMapsPlaceUrl(destination));
    return;
  }

  const nativeUrl =
    Platform.OS === 'android'
      ? `geo:${destination.lat},${destination.lng}?q=${destination.lat},${destination.lng}`
      : `comgooglemaps://?q=${destination.lat},${destination.lng}`;

  try {
    await Linking.openURL(nativeUrl);
    return;
  } catch {
    // Repli web ci-dessous.
  }

  await Linking.openURL(googleMapsPlaceUrl(destination));
}
