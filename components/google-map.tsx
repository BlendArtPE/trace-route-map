"use client";

import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { getCategory, type PlacePoint } from "@/lib/places";

const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

const BARCELONA_CENTER: google.maps.LatLngLiteral = {
  lat: 41.3874,
  lng: 2.1686,
};

let optionsInitialized = false;

function initLoaderOptions(key: string) {
  if (optionsInitialized) return;
  optionsInitialized = true;
  setOptions({ key, v: "weekly", language: "es", region: "ES" });
}

type GoogleMapProps = {
  points: PlacePoint[];
  selectedId: string | null;
  onSelect?: (point: PlacePoint) => void;
  routePath?: google.maps.LatLngLiteral[] | null;
  routePointIds?: string[];
};

function pinContent(
  point: PlacePoint,
  index: number,
  active: boolean,
  route: boolean,
) {
  const base = getCategory(point.category).color;
  const background = active ? "#0f172a" : route ? "#16a34a" : base;
  return new google.maps.marker.PinElement({
    background,
    borderColor: "#ffffff",
    glyph: String(index + 1),
    glyphColor: "#ffffff",
    scale: active || route ? 1.15 : 1,
  }).element;
}

export function GoogleMap({
  points,
  selectedId,
  onSelect,
  routePath = null,
  routePointIds = [],
}: GoogleMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<
    Map<string, google.maps.marker.AdvancedMarkerElement>
  >(new Map());
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const routePolylineRef = useRef<google.maps.Polyline | null>(null);
  const fittedRef = useRef(false);
  const onSelectRef = useRef(onSelect);

  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    if (!containerRef.current || !apiKey) return;
    let cancelled = false;

    initLoaderOptions(apiKey);

    Promise.all([importLibrary("maps"), importLibrary("marker")])
      .then(([mapsLib]) => {
        if (cancelled || !containerRef.current) return;
        const map = new mapsLib.Map(containerRef.current, {
          center: BARCELONA_CENTER,
          zoom: 13,
          mapId: "DEMO_MAP_ID",
          gestureHandling: "greedy",
          mapTypeControl: true,
          fullscreenControl: true,
          streetViewControl: true,
        });
        mapRef.current = map;
        setMapReady(true);
      })
      .catch((error: unknown) => {
        setLoadError(
          error instanceof Error
            ? error.message
            : "Error al cargar Google Maps",
        );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const markers = markersRef.current;
    const seen = new Set<string>();
    const routeIds = new Set(routePointIds);

    for (const [index, point] of points.entries()) {
      seen.add(point.id);
      const position = { lat: point.lat, lng: point.lng };
      const active = selectedId === point.id;
      const inRoute = routeIds.has(point.id);
      const existing = markers.get(point.id);
      if (existing) {
        existing.position = position;
        existing.title = point.nameEs;
        existing.zIndex = active ? 100 : 1;
        existing.content = pinContent(point, index, active, inRoute);
      } else {
        const marker = new google.maps.marker.AdvancedMarkerElement({
          map,
          position,
          title: point.nameEs,
          zIndex: active ? 100 : 1,
          content: pinContent(point, index, active, inRoute),
        });
        marker.addListener("click", () => {
          onSelectRef.current?.(point);
        });
        markers.set(point.id, marker);
      }
    }

    for (const [id, marker] of markers) {
      if (!seen.has(id)) {
        marker.map = null;
        markers.delete(id);
      }
    }
  }, [mapReady, points, selectedId, routePointIds]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    if (routePath && routePath.length > 0) return;

    const path = points.map((point) => ({ lat: point.lat, lng: point.lng }));
    if (path.length >= 2) {
      if (polylineRef.current) {
        polylineRef.current.setPath(path);
      } else {
        polylineRef.current = new google.maps.Polyline({
          path,
          map,
          strokeColor: "#3b82f6",
          strokeOpacity: 0.8,
          strokeWeight: 3,
        });
      }
    } else if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }
  }, [mapReady, points, routePath]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const routePoly = routePolylineRef.current;

    if (!routePath || routePath.length === 0) {
      if (routePoly) {
        routePoly.setMap(null);
        routePolylineRef.current = null;
      }
      return;
    }

    const path = routePath;
    if (routePoly) {
      routePoly.setPath(path);
    } else {
      routePolylineRef.current = new google.maps.Polyline({
        path,
        map,
        strokeColor: "#16a34a",
        strokeOpacity: 0.9,
        strokeWeight: 4,
      });
    }

    const bounds = new google.maps.LatLngBounds();
    for (const p of path) bounds.extend(p);
    map.fitBounds(bounds, 60);
  }, [mapReady, routePath]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || fittedRef.current) return;
    fittedRef.current = true;
    if (points.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    for (const point of points) {
      bounds.extend({ lat: point.lat, lng: point.lng });
    }
    mapRef.current.fitBounds(bounds, 60);
  }, [mapReady, points]);

  useEffect(() => {
    if (!mapReady || !selectedId) return;
    const map = mapRef.current;
    if (!map) return;
    const point = points.find((item) => item.id === selectedId);
    if (!point) return;
    map.panTo({ lat: point.lat, lng: point.lng });
    if ((map.getZoom() ?? 12) < 13) map.setZoom(13);
  }, [mapReady, points, selectedId]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {!apiKey ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 p-4">
          <p className="max-w-sm text-center text-sm text-muted-foreground">
            Configura{" "}
            <code className="font-mono text-xs">
              NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
            </code>{" "}
            en <code className="font-mono text-xs">.env.local</code> para ver el
            mapa.
          </p>
        </div>
      ) : !mapReady && !loadError ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/80">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Cargando mapa...</p>
        </div>
      ) : loadError ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 p-4">
          <p className="max-w-sm text-center text-sm text-destructive">
            {loadError}
          </p>
        </div>
      ) : null}
    </div>
  );
}
