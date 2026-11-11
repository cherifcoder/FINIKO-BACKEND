import type { Coordinates } from './maps';

export interface DrivingRoute {
  /** Tracé de l'itinéraire (points ordonnés). */
  points: Coordinates[];
  distanceMeters: number;
  durationSeconds: number;
}

/**
 * Itinéraires routiers gratuits via le serveur de démonstration OSRM
 * (Open Source Routing Machine) : aucune clé API, aucun abonnement.
 *
 * Le serveur public est prévu pour un usage raisonnable (démonstration) ;
 * en cas d'indisponibilité on retombe proprement sur une ligne directe.
 */
const OSRM_BASE = 'https://router.project-osrm.org';
const REQUEST_TIMEOUT_MS = 9000;

export async function fetchDrivingRoute(
  from: Coordinates,
  to: Coordinates,
  signal?: AbortSignal,
): Promise<DrivingRoute | null> {
  const url =
    `${OSRM_BASE}/route/v1/driving/` +
    `${from.lng},${from.lat};${to.lng},${to.lat}` +
    '?overview=full&geometries=geojson&steps=false';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort);

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as {
      code?: string;
      routes?: Array<{
        distance?: number;
        duration?: number;
        geometry?: { coordinates?: Array<[number, number]> };
      }>;
    };

    const route = payload.routes?.[0];
    const coordinates = route?.geometry?.coordinates;

    if (payload.code !== 'Ok' || !route || !Array.isArray(coordinates) || coordinates.length < 2) {
      return null;
    }

    return {
      points: coordinates.map(([lng, lat]) => ({ lat, lng })),
      distanceMeters: route.distance ?? 0,
      durationSeconds: route.duration ?? 0,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

export function formatRouteDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;

  const kilometers = meters / 1000;

  return `${kilometers < 10 ? kilometers.toFixed(1).replace('.', ',') : Math.round(kilometers)} km`;
}

export function formatRouteDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';

  const minutes = Math.round(seconds / 60);

  if (minutes < 60) return `${Math.max(minutes, 1)} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest > 0 ? `${hours} h ${rest}` : `${hours} h`;
}
