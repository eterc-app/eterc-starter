"use client";

import { useEffect, useRef, useState } from "react";
import { LocateFixed, Map, MapPinPlus, Maximize, Minus, Plus, Trash2 } from "lucide-react";
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
  pointSelected: boolean;
  onClearPoint: () => void;
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
  pointSelected,
  onClearPoint,
  onMapClick,
}: Omit<MapCanvasProps, "provider" | "apiKey" | "height">) {
  const containerRef = useRef<HTMLDivElement>(null);
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const drawnRef = useRef<Leaflet.LayerGroup | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const clickRef = useRef(onMapClick);
  const centerRef = useRef(center);
  const zoomRef = useRef(zoom);
  const disabledRef = useRef(disabled);
  const geometryTypeRef = useRef(geometryType);
  const pointPlacementRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [controlError, setControlError] = useState<string | null>(null);
  const [placingPoint, setPlacingPoint] = useState(false);

  useEffect(() => {
    clickRef.current = onMapClick;
    centerRef.current = center;
    zoomRef.current = zoom;
    disabledRef.current = disabled;
    geometryTypeRef.current = geometryType;
  });

  useEffect(() => {
    let active = true;
    let map: Leaflet.Map | null = null;
    void import("leaflet").then((L) => {
      if (!active || !elementRef.current) return;
      leafletRef.current = L;
      map = L.map(elementRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView(
        [centerRef.current.lat, centerRef.current.lng],
        zoomRef.current,
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
      drawnRef.current = L.layerGroup().addTo(map);
      map.on("click", (event) => {
        if (disabledRef.current) return;
        if (geometryTypeRef.current === "Point") {
          if (!pointPlacementRef.current) return;
          pointPlacementRef.current = false;
          setPlacingPoint(false);
        }
        clickRef.current([event.latlng.lng, event.latlng.lat]);
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
    pointPlacementRef.current = placingPoint;
    const map = mapRef.current;
    if (map) map.getContainer().style.cursor = placingPoint ? "crosshair" : "";
  }, [placingPoint, ready]);

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
      L.circleMarker(latLngs[0], { radius: 6, color: brandColor, fillOpacity: 0.9 }).addTo(layer);
    } else if (geometryType === "MultiPoint") {
      for (const point of latLngs) {
        L.circleMarker(point, { radius: 5, color: brandColor, fillOpacity: 0.9 }).addTo(layer);
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
    else if (bounds.length === 1) map.panTo(bounds[0]);
  }, [coordinates, geometryType, ready, zoom]);

  useEffect(() => {
    if (!ready) return;
    const updateSize = () => {
      window.requestAnimationFrame(() => mapRef.current?.invalidateSize());
    };
    document.addEventListener("fullscreenchange", updateSize);
    return () => document.removeEventListener("fullscreenchange", updateSize);
  }, [ready]);

  if (error) {
    return (
      <div className="grid h-full place-items-center rounded-xl border border-foreground bg-surface-subtle px-4 text-center text-xs text-destructive shadow-[0_3px_10px_rgb(0_0_0/0.18)]">
        OpenStreetMap failed to load: {error}
      </div>
    );
  }
  const zoomIn = () => mapRef.current?.zoomIn();
  const zoomOut = () => mapRef.current?.zoomOut();
  const recenter = () => {
    const map = mapRef.current;
    if (map) map.setView([centerRef.current.lat, centerRef.current.lng], map.getZoom());
  };
  const addCenterPoint = () => {
    const map = mapRef.current;
    if (!map) return;
    const center = map.getCenter();
    clickRef.current([center.lng, center.lat]);
  };
  const togglePointSelection = () => {
    if (pointSelected) {
      pointPlacementRef.current = false;
      setPlacingPoint(false);
      onClearPoint();
      return;
    }
    const nextPlacement = !pointPlacementRef.current;
    pointPlacementRef.current = nextPlacement;
    setPlacingPoint(nextPlacement);
  };
  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;
    setControlError(null);
    const action =
      document.fullscreenElement === container
        ? document.exitFullscreen()
        : container.requestFullscreen();
    void action.catch((reason: unknown) => {
      setControlError(reason instanceof Error ? reason.message : String(reason));
    });
  };
  const controlClassName =
    "grid size-10 place-items-center bg-card text-foreground transition-colors hover:bg-accent focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden rounded-xl border border-foreground bg-surface-subtle shadow-[0_3px_10px_rgb(0_0_0/0.18)]"
    >
      <div ref={elementRef} className="h-full w-full" aria-label="OpenStreetMap map" />
      <div className="absolute left-3 top-3 z-[1000] flex flex-col gap-2">
        <div className="overflow-hidden rounded-md border border-border bg-card shadow-[0_2px_8px_rgb(0_0_0/0.18)]">
          <button
            type="button"
            className={controlClassName}
            aria-label="Zoom in"
            title="Zoom in"
            onClick={zoomIn}
          >
            <Plus className="size-5" aria-hidden="true" />
          </button>
          <div className="h-px bg-border" />
          <button
            type="button"
            className={controlClassName}
            aria-label="Zoom out"
            title="Zoom out"
            onClick={zoomOut}
          >
            <Minus className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="overflow-hidden rounded-md border border-border bg-card shadow-[0_2px_8px_rgb(0_0_0/0.18)]">
          <button
            type="button"
            className={controlClassName}
            aria-label="Center map on selected location"
            title="Center map on selected location"
            onClick={recenter}
          >
            <LocateFixed className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="overflow-hidden rounded-md border border-border bg-card shadow-[0_2px_8px_rgb(0_0_0/0.18)]">
          <button
            type="button"
            className={controlClassName}
            aria-label="Toggle fullscreen"
            title="Toggle fullscreen"
            onClick={toggleFullscreen}
          >
            <Maximize className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="overflow-hidden rounded-md border border-border bg-card shadow-[0_2px_8px_rgb(0_0_0/0.18)]">
          <button
            type="button"
            className={`${controlClassName} ${
              placingPoint && !pointSelected
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : ""
            }`}
            aria-pressed={placingPoint && !pointSelected}
            aria-label={
              pointSelected
                ? "Delete selected point"
                : placingPoint
                  ? "Cancel point selection"
                  : "Pick a point on the map"
            }
            title={
              pointSelected
                ? "Delete selected point"
                : placingPoint
                  ? "Cancel point selection"
                  : "Pick a point on the map"
            }
            disabled={disabled}
            onClick={geometryType === "Point" ? togglePointSelection : addCenterPoint}
          >
            {pointSelected ? (
              <Trash2 className="size-5" aria-hidden="true" />
            ) : (
              <MapPinPlus className="size-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
      <a
        className="absolute bottom-0 left-0 z-[1000] rounded-tr-md bg-card/90 px-2 py-1 text-xs leading-none text-foreground hover:underline"
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
      >
        © OpenStreetMap contributors
      </a>
      <a
        className="absolute bottom-3 right-3 z-[1000] flex h-11 items-center gap-2 rounded-2xl border border-border bg-card/95 px-4 text-sm font-medium text-foreground shadow-[0_2px_8px_rgb(0_0_0/0.18)] transition-colors hover:bg-accent"
        href="https://www.openstreetmap.org/"
        target="_blank"
        rel="noreferrer"
      >
        <Map className="size-5 text-muted-foreground" aria-hidden="true" />
        OpenStreetMap
      </a>
      {controlError ? (
        <div
          role="alert"
          className="absolute bottom-14 left-1/2 z-[1000] max-w-[80%] -translate-x-1/2 rounded-md bg-destructive px-3 py-2 text-center text-xs text-destructive-foreground shadow-[0_2px_8px_rgb(0_0_0/0.18)]"
        >
          Fullscreen could not be changed: {controlError}
        </div>
      ) : null}
    </div>
  );
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
      className="overflow-hidden rounded-xl border border-foreground bg-surface-subtle shadow-[0_3px_10px_rgb(0_0_0/0.18)]"
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
