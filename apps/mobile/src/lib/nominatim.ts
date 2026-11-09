export interface PlaceSuggestion {
  id: string;
  displayName: string;
  lat: number;
  lng: number;
}

interface NominatimPlace {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const REQUEST_HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'fr',
  'User-Agent': 'FinikoApp/1.0',
};

function toSuggestion(place: NominatimPlace): PlaceSuggestion | null {
  const lat = Number.parseFloat(place.lat);
  const lng = Number.parseFloat(place.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    id: String(place.place_id),
    displayName: place.display_name,
    lat,
    lng,
  };
}

async function fetchPlaces(url: string, signal?: AbortSignal): Promise<NominatimPlace[]> {
  const response = await fetch(url, { headers: REQUEST_HEADERS, signal });

  if (!response.ok) return [];

  const payload: unknown = await response.json();

  return Array.isArray(payload) ? (payload as NominatimPlace[]) : [];
}

export async function searchAddresses(
  query: string,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const text = query.trim();

  if (text.length < 3) return [];

  const primaryUrl =
    `${NOMINATIM_BASE}/search?format=jsonv2&addressdetails=1&countrycodes=ml` +
    `&limit=8&q=${encodeURIComponent(text)}`;

  let places = await fetchPlaces(primaryUrl, signal);

  if (places.length === 0) {
    const fallbackUrl =
      `${NOMINATIM_BASE}/search?format=jsonv2&addressdetails=1` +
      `&limit=8&q=${encodeURIComponent(`${text} Mali`)}`;
    places = await fetchPlaces(fallbackUrl, signal);
  }

  return places
    .map(toSuggestion)
    .filter((place): place is PlaceSuggestion => place !== null)
    .slice(0, 8);
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const response = await fetch(`${NOMINATIM_BASE}/reverse?format=jsonv2&lat=${lat}&lon=${lng}`, {
      headers: REQUEST_HEADERS,
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as { display_name?: string };

    return payload.display_name ?? null;
  } catch {
    return null;
  }
}

export function shortAddress(displayName: string, maxParts = 3): string {
  return displayName
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, maxParts)
    .join(', ');
}

export function placeParts(displayName: string): { title: string; subtitle: string } {
  const parts = displayName
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    title: parts[0] ?? displayName,
    subtitle: parts.slice(1).join(', '),
  };
}
