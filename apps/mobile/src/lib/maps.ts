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

/** Itinéraire voiture gratuit OpenStreetMap (moteur OSRM), sans clé API. */
export function osmDirectionsUrl(from: Coordinates, to: Coordinates): string {
  return (
    'https://www.openstreetmap.org/directions?engine=fossgis_osrm_car' +
    `&route=${from.lat}%2C${from.lng}%3B${to.lat}%2C${to.lng}`
  );
}

export function osmPlaceUrl(destination: Coordinates): string {
  return `https://www.openstreetmap.org/?mlat=${destination.lat}&mlon=${destination.lng}#map=17/${destination.lat}/${destination.lng}`;
}

/**
 * Ouvre la navigation vers une adresse : application Google Maps si elle est
 * installée (guidage vocal), sinon la version web, puis OpenStreetMap/OSRM en
 * dernier recours. Aucune clé API n'est nécessaire.
 */
export async function openGoogleMapsDirections(
  destination: Coordinates,
  origin?: Coordinates,
): Promise<void> {
  const webUrl = origin
    ? osmDirectionsUrl(origin, destination)
    : googleMapsDirectionsUrl(destination);

  if (Platform.OS === 'web') {
    await Linking.openURL(webUrl);
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
    // Google Maps n'est pas installé : on tente le web puis OSM.
  }

  try {
    await Linking.openURL(googleMapsDirectionsUrl(destination));
  } catch {
    await Linking.openURL(webUrl);
  }
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

  try {
    await Linking.openURL(googleMapsPlaceUrl(destination));
  } catch {
    await Linking.openURL(osmPlaceUrl(destination));
  }
}
