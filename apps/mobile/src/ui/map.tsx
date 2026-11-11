import { Ionicons } from '@expo/vector-icons';
import { type ComponentRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { Coordinates } from '../lib/maps';
import {
  fetchDrivingRoute,
  formatRouteDistance,
  formatRouteDuration,
  type DrivingRoute,
} from '../lib/osrm';
import { colors, radius, spacing, typography } from '../theme/tokens';

/**
 * Cartes gratuites et sans clé API : fond de carte OpenStreetMap (tuiles
 * raster) affiché par Leaflet dans une WebView, itinéraires calculés par le
 * serveur public OSRM. react-native-webview est inclus dans Expo Go, donc
 * aucune compilation native n'est nécessaire pour les testeurs.
 *
 * Le rendu est identique sur Android et iOS, contrairement à react-native-maps
 * qui exige une clé Google Maps sur Android (et affichait un fallback).
 */
const LEAFLET_CSS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const MAP_BACKGROUND = colors.background;

interface MapMarker {
  lat: number;
  lng: number;
  color: string;
  label: string;
}

function htmlShell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>${title}</title>
  <link rel="stylesheet" href="${LEAFLET_CSS}" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; background: ${MAP_BACKGROUND}; }
    .leaflet-container { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .leaflet-control-attribution { font-size: 9px; }
    .leaflet-tooltip { font-size: 11px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="${LEAFLET_JS}"></script>
  <script>
${body}
  </script>
</body>
</html>`;
}

function pickerHtml(lat: number, lng: number, markerTitle: string): string {
  return htmlShell(
    'Choix de position',
    `    (function () {
      var map = L.map('map', { zoomControl: true }).setView([${lat}, ${lng}], 16);
      L.tileLayer('${OSM_TILES}', { maxZoom: 19, attribution: '${OSM_ATTRIBUTION}' }).addTo(map);

      var marker = L.marker([${lat}, ${lng}], { draggable: true }).addTo(map);
      marker.bindTooltip(${JSON.stringify(markerTitle)}, { direction: 'top', offset: [0, -14] });

      function post(latlng) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(
            JSON.stringify({ type: 'pick', lat: latlng.lat, lng: latlng.lng })
          );
        }
      }

      map.on('click', function (event) {
        marker.setLatLng(event.latlng);
        post(event.latlng);
      });

      marker.on('dragend', function () {
        post(marker.getLatLng());
      });

      window.__setPosition = function (nextLat, nextLng) {
        marker.setLatLng([nextLat, nextLng]);
        map.setView([nextLat, nextLng], map.getZoom(), { animate: true });
      };
    })();`,
  );
}

function routeHtml(markers: MapMarker[], center: Coordinates): string {
  const markersJson = JSON.stringify(markers);

  return htmlShell(
    'Itinéraire',
    `    (function () {
      var map = L.map('map', {
        zoomControl: false,
        attributionControl: true,
        dragging: false,
        touchZoom: false,
        doubleClickZoom: false,
        scrollWheelZoom: false,
        boxZoom: false,
        keyboard: false,
        tap: false
      }).setView([${center.lat}, ${center.lng}], 13);
      L.tileLayer('${OSM_TILES}', { maxZoom: 19, attribution: '${OSM_ATTRIBUTION}' }).addTo(map);

      var line = null;
      var markers = [];

      function fit(coords) {
        if (coords.length > 1) {
          map.fitBounds(L.latLngBounds(coords), { padding: [36, 36], maxZoom: 16 });
        } else if (coords.length === 1) {
          map.setView(coords[0], 15);
        }
      }

      function drawMarkers(points) {
        markers.forEach(function (marker) { map.removeLayer(marker); });
        markers = points.map(function (point) {
          return L.circleMarker([point.lat, point.lng], {
            radius: 8,
            color: '#FFFFFF',
            weight: 3,
            fillColor: point.color,
            fillOpacity: 1
          }).addTo(map).bindTooltip(point.label);
        });
      }

      function drawLine(coords, dashed) {
        if (line) { map.removeLayer(line); }
        line = L.polyline(coords, {
          color: '${colors.brand[600]}',
          weight: dashed ? 3 : 5,
          opacity: dashed ? 0.7 : 0.92,
          dashArray: dashed ? '8 8' : null
        }).addTo(map);
        fit(coords);
      }

      window.__setMarkers = function (points) {
        drawMarkers(points);
        fit(points.map(function (point) { return [point.lat, point.lng]; }));
      };
      window.__setRoute = function (coords) { drawLine(coords, false); };
      window.__setFallback = function (coords) { drawLine(coords, true); };

      drawMarkers(${markersJson});
      fit(${markersJson}.map(function (point) { return [point.lat, point.lng]; }));
    })();`,
  );
}

function WebMapFallback({ message }: { message: string }) {
  return (
    <View style={styles.fallback}>
      <Text style={styles.fallbackIcon}>🗺️</Text>
      <Text style={styles.fallbackText}>{message}</Text>
    </View>
  );
}

function MapLoading() {
  return (
    <View style={styles.mapLoading}>
      <ActivityIndicator color={colors.brand[600]} size="small" />
      <Text style={styles.mapLoadingText}>Chargement de la carte…</Text>
    </View>
  );
}

interface RouteMapProps {
  pickup: { text?: string; coordinates: Coordinates };
  delivery?: { text?: string; coordinates: Coordinates };
  /** Position actuelle du livreur : l'itinéraire part de là quand elle est connue. */
  origin?: Coordinates;
  height?: number;
}

/** Carte d'itinéraire : tracé routier OSRM entre les points de la mission. */
export function RouteMap({ pickup, delivery, origin, height = 220 }: RouteMapProps) {
  const webRef = useRef<ComponentRef<typeof WebView>>(null);
  const readyRef = useRef(false);
  const pendingRef = useRef<string[]>([]);

  const [route, setRoute] = useState<DrivingRoute | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');

  const originLat = origin?.lat;
  const originLng = origin?.lng;
  const pickupLat = pickup.coordinates.lat;
  const pickupLng = pickup.coordinates.lng;
  const pickupLabel = pickup.text;
  const deliveryLat = delivery?.coordinates.lat;
  const deliveryLng = delivery?.coordinates.lng;
  const deliveryLabel = delivery?.text;

  const initialMarkers = useRef<MapMarker[]>([
    {
      lat: pickup.coordinates.lat,
      lng: pickup.coordinates.lng,
      color: colors.brand[600],
      label: 'Ramassage',
    },
    ...(delivery
      ? [
          {
            lat: delivery.coordinates.lat,
            lng: delivery.coordinates.lng,
            color: colors.success,
            label: 'Livraison',
          },
        ]
      : []),
  ]);
  const initialCenter = useRef(pickup.coordinates);
  const html = useMemo(
    () => routeHtml(initialMarkers.current, initialCenter.current),
    [initialCenter, initialMarkers],
  );

  const inject = useCallback((script: string) => {
    const web = webRef.current;

    if (!readyRef.current || !web) {
      pendingRef.current.push(script);
      return;
    }

    web.injectJavaScript(script);
  }, []);

  const handleLoadEnd = useCallback(() => {
    readyRef.current = true;

    if (pendingRef.current.length > 0) {
      pendingRef.current.forEach((script) => webRef.current?.injectJavaScript(script));
      pendingRef.current = [];
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let cancelled = false;
    const controller = new AbortController();

    setStatus('loading');

    const from: Coordinates =
      originLat !== undefined && originLng !== undefined
        ? { lat: originLat, lng: originLng }
        : { lat: pickupLat, lng: pickupLng };
    const to: Coordinates =
      deliveryLat !== undefined && deliveryLng !== undefined
        ? { lat: deliveryLat, lng: deliveryLng }
        : { lat: pickupLat, lng: pickupLng };

    const markers: MapMarker[] = [];

    if (originLat !== undefined && originLng !== undefined) {
      markers.push({
        lat: originLat,
        lng: originLng,
        color: colors.brand[900],
        label: 'Ma position',
      });
    }
    markers.push({
      lat: pickupLat,
      lng: pickupLng,
      color: colors.brand[600],
      label: pickupLabel ?? 'Ramassage',
    });
    if (deliveryLat !== undefined && deliveryLng !== undefined) {
      markers.push({
        lat: deliveryLat,
        lng: deliveryLng,
        color: colors.success,
        label: deliveryLabel ?? 'Livraison',
      });
    }

    inject(`window.__setMarkers && window.__setMarkers(${JSON.stringify(markers)}); true;`);

    void fetchDrivingRoute(from, to, controller.signal).then((result) => {
      if (cancelled) return;

      setRoute(result);
      setStatus(result ? 'ready' : 'failed');

      const points = result ? result.points : [from, to];
      const payload = JSON.stringify(points.map((point) => [point.lat, point.lng]));

      inject(
        `window.${result ? '__setRoute' : '__setFallback'} && window.${
          result ? '__setRoute' : '__setFallback'
        }(${payload}); true;`,
      );
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    deliveryLat,
    deliveryLng,
    deliveryLabel,
    inject,
    originLat,
    originLng,
    pickupLabel,
    pickupLat,
    pickupLng,
  ]);

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, { height }]}>
        <WebMapFallback message="La carte interactive est disponible sur l’application mobile. Les coordonnées GPS sont bien enregistrées." />
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        androidLayerType="hardware"
        domStorageEnabled
        javaScriptEnabled
        nestedScrollEnabled
        onLoadEnd={handleLoadEnd}
        originWhitelist={['*']}
        overScrollMode="never"
        ref={webRef}
        renderLoading={MapLoading}
        scrollEnabled={false}
        setSupportMultipleWindows={false}
        source={{ html }}
        startInLoadingState
        style={styles.webview}
      />

      {status === 'loading' ? (
        <View pointerEvents="none" style={styles.chip}>
          <ActivityIndicator color={colors.brand[700]} size="small" />
          <Text style={styles.chipText}>Calcul de l’itinéraire…</Text>
        </View>
      ) : route ? (
        <View pointerEvents="none" style={styles.chip}>
          <Ionicons color={colors.brand[700]} name="car" size={14} />
          <Text style={styles.chipText}>
            {formatRouteDistance(route.distanceMeters)} ·{' '}
            {formatRouteDuration(route.durationSeconds)}
          </Text>
          <Text style={styles.chipSource}>OSRM</Text>
        </View>
      ) : (
        <View pointerEvents="none" style={styles.chip}>
          <Text style={styles.chipText}>Trajet direct (itinéraire indisponible)</Text>
        </View>
      )}
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
  const webRef = useRef<ComponentRef<typeof WebView>>(null);
  const readyRef = useRef(false);
  const pendingRef = useRef<string[]>([]);
  const initialRef = useRef({ value, markerTitle });

  const html = useMemo(
    () =>
      pickerHtml(
        initialRef.current.value.lat,
        initialRef.current.value.lng,
        initialRef.current.markerTitle,
      ),
    [],
  );

  const handleLoadEnd = useCallback(() => {
    readyRef.current = true;

    if (pendingRef.current.length > 0) {
      pendingRef.current.forEach((script) => webRef.current?.injectJavaScript(script));
      pendingRef.current = [];
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const script = `window.__setPosition && window.__setPosition(${value.lat}, ${value.lng}); true;`;
    const web = webRef.current;

    if (!readyRef.current || !web) {
      pendingRef.current.push(script);
      return;
    }

    web.injectJavaScript(script);
  }, [value.lat, value.lng]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const payload = JSON.parse(event.nativeEvent.data) as {
          type?: string;
          lat?: number;
          lng?: number;
        };

        if (
          payload.type === 'pick' &&
          typeof payload.lat === 'number' &&
          typeof payload.lng === 'number'
        ) {
          onChange({ lat: payload.lat, lng: payload.lng });
        }
      } catch {
        // Message non JSON : ignoré.
      }
    },
    [onChange],
  );

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, height ? { height } : styles.fill]}>
        <WebMapFallback message="La carte interactive est disponible sur mobile. Utilisez la recherche d’adresse pour sélectionner un point." />
      </View>
    );
  }

  return (
    <View style={[styles.container, height ? { height } : styles.fill]}>
      <WebView
        androidLayerType="hardware"
        domStorageEnabled
        javaScriptEnabled
        onLoadEnd={handleLoadEnd}
        onMessage={handleMessage}
        originWhitelist={['*']}
        overScrollMode="never"
        ref={webRef}
        renderLoading={MapLoading}
        scrollEnabled={false}
        setSupportMultipleWindows={false}
        source={{ html }}
        startInLoadingState
        style={styles.webview}
      />
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
  webview: {
    backgroundColor: colors.background,
    flex: 1,
  },
  chip: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    bottom: spacing.sm,
    flexDirection: 'row',
    gap: spacing.xs,
    left: spacing.sm,
    maxWidth: '82%',
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    position: 'absolute',
  },
  chipText: {
    ...typography.caption,
    color: colors.text,
    fontSize: 11,
    fontWeight: '700',
  },
  chipSource: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
  },
  mapLoading: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
  },
  mapLoadingText: {
    ...typography.caption,
    color: colors.textMuted,
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
