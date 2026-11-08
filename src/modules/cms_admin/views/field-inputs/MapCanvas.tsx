"use client";

import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";

export type MapGeometryType =
  | "Point"
  | "LineString"
  | "Polygon"
  | "MultiPoint"
  | "MultiLineString";

type Position = [number, number];

interface MapCanvasProps {
  provider: "google" | "openstreetmap";
  apiKey: string;
  geometryType: MapGeometryType;
  coordinates: unknown;
  center: { lat: number; lng: number };
  zoom: number;
  height: number;
  disabled: boolean;
  onMapClick: (position: Position) => void;
}

function toPosition(value: unknown): Position | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lng = Number(value[0]);
  const lat = Number(value[1]);
  if (
    !Number.isFinite(lng) ||
    !Number.isFinite(lat) ||
    lng < -180 ||
    lng > 180 ||
    lat < -90 ||
    lat > 90
  ) {
    return null;
  }
  return [lng, lat];
}

function asPositions(value: unknown): Position[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(toPosition)
    .filter((position): position is Position => position !== null);
}

function allPositions(type: MapGeometryType, value: unknown): Position[] {
  if (type === "Point") {
    const position = toPosition(value);
    return position ? [position] : [];
  }
  if (type === "MultiPoint" || type === "LineString" || type === "Polygon") {
    return asPositions(type === "Polygon" && Array.isArray(value) ? value[0] : value);
  }
  if (type === "MultiLineString" && Array.isArray(value)) {
    return value.flatMap(asPositions);
  }
  return [];
}

declare global {
  interface Window {
    etercGoogleMapsCallback?: () => void;
  }
}

let googleMapsPromise: Promise<void> | null = null;

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof google !== "undefined" && google.maps) return Promise.resolve();
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve, reject) => {
    window.etercGoogleMapsCallback = () => {
      delete window.etercGoogleMapsCallback;
      resolve();
    };
    const script = document.createElement("script");
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      "&callback=etercGoogleMapsCallback&v=weekly";
    script.async = true;
    script.onerror = () => {
      googleMapsPromise = null;
      delete window.etercGoogleMapsCallback;
      reject(new Error("Google Maps failed to load. Check the API key and its restrictions."));
    };
    document.head.appendChild(script);
  });
  return googleMapsPromise;
}

function OpenStreetMapCanvas({
  geometryType,
  coordinates,
  center,
  zoom,
  disabled,
  onMapClick,
}: Omit<MapCanvasProps, "provider" | "apiKey" | "height">) {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const drawnRef = useRef<Leaflet.LayerGroup | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const clickRef = useRef(onMapClick);
  const centerRef = useRef(center);
  const zoomRef = useRef(zoom);
  const disabledRef = useRef(disabled);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    clickRef.current = onMapClick;
    centerRef.current = center;
    zoomRef.current = zoom;
    disabledRef.current = disabled;
  });

  useEffect(() => {
    let active = true;
    let map: Leaflet.Map | null = null;
    void import("leaflet").then((L) => {
      if (!active || !elementRef.current) return;
      leafletRef.current = L;
      map = L.map(elementRef.current).setView(
        [centerRef.current.lat, centerRef.current.lng],
        zoomRef.current,
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
      drawnRef.current = L.layerGroup().addTo(map);
      map.on("click", (event) => {
        if (!disabledRef.current) {
          clickRef.current([event.latlng.lng, event.latlng.lat]);
        }
      });
      mapRef.current = map;
      setReady(true);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason));
    });

    return () => {
      active = false;
      map?.remove();
      mapRef.current = null;
      drawnRef.current = null;
      leafletRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = drawnRef.current;
    if (!ready || !L || !map || !layer) return;

    layer.clearLayers();
    const brandColor =
      getComputedStyle(document.documentElement).getPropertyValue("--brand").trim() || "navy";
    const points = allPositions(geometryType, coordinates);
    const latLngs = points.map(([lng, lat]) => [lat, lng] as [number, number]);
    if (geometryType === "Point" && latLngs[0]) {
      L.circleMarker(latLngs[0], { radius: 8, color: brandColor, fillOpacity: 0.9 }).addTo(layer);
    } else if (geometryType === "MultiPoint") {
      for (const point of latLngs) {
        L.circleMarker(point, { radius: 7, color: brandColor, fillOpacity: 0.9 }).addTo(layer);
      }
    } else if (geometryType === "LineString" && latLngs.length > 0) {
      L.polyline(latLngs, { color: brandColor, weight: 4 }).addTo(layer);
    } else if (geometryType === "Polygon" && latLngs.length > 0) {
      L.polygon(latLngs, { color: brandColor, fillOpacity: 0.2 }).addTo(layer);
    } else if (geometryType === "MultiLineString" && Array.isArray(coordinates)) {
      for (const line of coordinates) {
        const linePoints = asPositions(line).map(([lng, lat]) => [lat, lng] as [number, number]);
        if (linePoints.length > 0) {
          L.polyline(linePoints, { color: brandColor, weight: 4 }).addTo(layer);
        }
      }
    }

    const bounds = points.map(([lng, lat]) => [lat, lng] as [number, number]);
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [24, 24], maxZoom: zoom });
    else if (bounds.length === 1) map.setView(bounds[0], zoom);
  }, [coordinates, geometryType, ready, zoom]);

  if (error) {
    return (
      <div className="grid h-full place-items-center px-4 text-center text-xs text-destructive">
        OpenStreetMap failed to load: {error}
      </div>
    );
  }
  return <div ref={elementRef} className="h-full w-full" aria-label="OpenStreetMap map" />;
}

function GoogleMapsCanvas({
  apiKey,
  geometryType,
  coordinates,
  center,
  zoom,
  disabled,
  onMapClick,
}: Omit<MapCanvasProps, "provider" | "height">) {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<google.maps.MVCObject[]>([]);
  const clickRef = useRef(onMapClick);
  const centerRef = useRef(center);
  const zoomRef = useRef(zoom);
  const disabledRef = useRef(disabled);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    clickRef.current = onMapClick;
    centerRef.current = center;
    zoomRef.current = zoom;
    disabledRef.current = disabled;
  });

  useEffect(() => {
    let active = true;
    let clickListener: google.maps.MapsEventListener | null = null;
    void loadGoogleMaps(apiKey)
      .then(() => {
        if (!active || !elementRef.current) return;
        const map = new google.maps.Map(elementRef.current, {
          center: centerRef.current,
          zoom: zoomRef.current,
          clickableIcons: false,
          gestureHandling: "cooperative",
        });
        clickListener = map.addListener("click", (event: google.maps.MapMouseEvent) => {
          if (!disabledRef.current && event.latLng) {
            clickRef.current([event.latLng.lng(), event.latLng.lat()]);
          }
        });
        mapRef.current = map;
        setReady(true);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      });

    return () => {
      active = false;
      clickListener?.remove();
      for (const overlay of overlaysRef.current) {
        if ("setMap" in overlay && typeof overlay.setMap === "function") overlay.setMap(null);
      }
      overlaysRef.current = [];
      mapRef.current = null;
    };
  }, [apiKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    for (const overlay of overlaysRef.current) {
      if ("setMap" in overlay && typeof overlay.setMap === "function") overlay.setMap(null);
    }
    overlaysRef.current = [];

    const brandColor =
      getComputedStyle(document.documentElement).getPropertyValue("--brand").trim() || "navy";
    const points = allPositions(geometryType, coordinates);
    const path = points.map(([lng, lat]) => ({ lat, lng }));
    if (geometryType === "Point" && path[0]) {
      overlaysRef.current.push(new google.maps.Marker({ map, position: path[0] }));
    } else if (geometryType === "MultiPoint") {
      for (const position of path) {
        overlaysRef.current.push(new google.maps.Marker({ map, position }));
      }
    } else if (geometryType === "LineString" && path.length > 0) {
      overlaysRef.current.push(new google.maps.Polyline({ map, path, strokeColor: brandColor }));
    } else if (geometryType === "Polygon" && path.length > 0) {
      overlaysRef.current.push(
        new google.maps.Polygon({
          map,
          paths: path,
          strokeColor: brandColor,
          fillColor: brandColor,
          fillOpacity: 0.2,
        }),
      );
    } else if (geometryType === "MultiLineString" && Array.isArray(coordinates)) {
      for (const line of coordinates) {
        const linePath = asPositions(line).map(([lng, lat]) => ({ lat, lng }));
        if (linePath.length > 0) {
          overlaysRef.current.push(
            new google.maps.Polyline({ map, path: linePath, strokeColor: brandColor }),
          );
        }
      }
    }
    if (path.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      for (const position of path) bounds.extend(position);
      map.fitBounds(bounds);
    } else if (path.length === 1) {
      map.setCenter(path[0]);
    }
  }, [coordinates, geometryType, ready]);

  if (error) {
    return (
      <div className="grid h-full place-items-center px-4 text-center text-xs text-destructive">
        {error}
      </div>
    );
  }
  return <div ref={elementRef} className="h-full w-full" aria-label="Google Maps map" />;
}

export function MapCanvas(props: MapCanvasProps) {
  const { provider, apiKey, height } = props;
  if (provider === "google" && !apiKey) {
    return (
      <div
        className="grid place-items-center rounded-lg border border-border bg-surface-subtle px-5 text-center text-sm text-muted-foreground"
        style={{ height: `${Math.max(120, height)}px` }}
      >
        Add a Google Maps API key in Eterc Desktop Settings to use Google Maps.
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-lg border border-border bg-surface-subtle"
      style={{ height: `${Math.max(120, height)}px` }}
    >
      {provider === "google" ? (
        <GoogleMapsCanvas {...props} />
      ) : (
        <OpenStreetMapCanvas {...props} />
      )}
    </div>
  );
}
