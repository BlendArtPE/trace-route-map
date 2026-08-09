"use client";

/// <reference types="google.maps" />

import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { getCategory, type PlacePoint } from "@/lib/places";

const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_ID_KEY;

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
  routeCircles?: {
    center: google.maps.LatLngLiteral;
    radii: number[];
  } | null;
  hideLabels?: boolean;
  myPosition?: google.maps.LatLngLiteral | null;
  locatingMe?: boolean;
  onLocateMe?: () => void;
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
    glyphText: String(index + 1),
    glyphColor: "#ffffff",
    scale: active || route ? 1.15 : 1,
  });
}

function computeCirclePaths(
  center: google.maps.LatLngLiteral,
  radii: number[]
): google.maps.LatLngLiteral[][] {
  return radii.map((radius) => {
    const metersPerDegree = 111320;
    const latRadius = radius / metersPerDegree;
    const lngRadius =
      radius /
      (metersPerDegree *
        Math.max(Math.cos((center.lat * Math.PI) / 180), 0.01));
    const points: google.maps.LatLngLiteral[] = [];
    const steps = 64;
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * 2 * Math.PI;
      points.push({
        lat: center.lat + latRadius * Math.sin(angle),
        lng: center.lng + lngRadius * Math.cos(angle),
      });
    }
    return points;
  });
}

const LOCATE_ICON_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" x2="5" y1="12" y2="12"/><line x1="19" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="5"/><line x1="12" x2="12" y1="19" y2="22"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/></svg>`;

const LOCATE_SPINNER_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" class="animate-spin"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" opacity="0.25"/><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`;

function createLocateButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", "Ir a mi ubicación");
  button.setAttribute("title", "Ir a mi ubicación");
  Object.assign(button.style, {
    width: "40px",
    height: "40px",
    borderRadius: "10px",
    backgroundColor: "#ffffff",
    border: "none",
    boxShadow: "0 1px 6px rgba(0, 0, 0, 0.3)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0",
    margin: "10px",
    color: "#444746",
    transition: "transform 0.1s ease",
  });
  button.innerHTML = LOCATE_ICON_SVG;
  button.addEventListener("pointerdown", (e) => {
    if (e.button === 0) button.style.transform = "scale(0.92)";
  });
  button.addEventListener("pointerup", () => {
    button.style.transform = "";
  });
  button.addEventListener("pointerleave", () => {
    button.style.transform = "";
  });
  return button;
}

function createMyLocationDot(): HTMLElement {
  const root = document.createElement("div");
  Object.assign(root.style, {
    position: "relative",
    width: "18px",
    height: "18px",
  });
  const pulse = document.createElement("div");
  Object.assign(pulse.style, {
    position: "absolute",
    inset: "0",
    borderRadius: "9999px",
    backgroundColor: "rgba(26, 115, 232, 0.35)",
    animation: "my-location-pulse 2s ease-out infinite",
  });
  const dot = document.createElement("div");
  Object.assign(dot.style, {
    position: "absolute",
    inset: "0",
    borderRadius: "9999px",
    backgroundColor: "#1a73e8",
    border: "2px solid #ffffff",
    boxShadow: "0 1px 4px rgba(0, 0, 0, 0.3)",
  });
  root.append(pulse, dot);
  return root;
}

export function GoogleMap({
  points,
  selectedId,
  onSelect,
  routePath = null,
  routePointIds = [],
  routeCircles = null,
  hideLabels = false,
  myPosition = null,
  locatingMe = false,
  onLocateMe,
}: GoogleMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<
    Map<string, google.maps.marker.AdvancedMarkerElement>
  >(new Map());
  const routePolylineRef = useRef<google.maps.Polyline | null>(null);
  const routeCirclesRef = useRef<google.maps.Polygon[] | null>(null);
  const fittedRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  const onLocateMeRef = useRef(onLocateMe);
  const myLocationButtonRef = useRef<HTMLButtonElement | null>(null);
  const myLocationMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(
    null,
  );
  const pendingLocateRef = useRef(false);

  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    onSelectRef.current = onSelect;
    onLocateMeRef.current = onLocateMe;
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
          mapId: mapId,
          gestureHandling: "greedy",
          zoomControlOptions: {
            position: google.maps.ControlPosition.RIGHT_TOP,
          },
          fullscreenControlOptions: {
            position: google.maps.ControlPosition.TOP_RIGHT,
          },
          streetViewControl: false,
          mapTypeControl: false,
        });
        mapRef.current = map;

        const locateButton = createLocateButton();
        locateButton.addEventListener("click", () => {
          pendingLocateRef.current = true;
          onLocateMeRef.current?.();
        });
        myLocationButtonRef.current = locateButton;
        const position =
          window.matchMedia("(min-width: 768px)").matches === false
            ? google.maps.ControlPosition.RIGHT_TOP
            : google.maps.ControlPosition.RIGHT_BOTTOM;
        map.controls[position].push(locateButton);

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
          gmpClickable: true,
          content: pinContent(point, index, active, inRoute),
        });
        marker.addEventListener("gmp-click", () => {
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
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    if (!routeCircles || routeCircles.radii.length === 0) {
      if (routeCirclesRef.current) {
        for (const circle of routeCirclesRef.current) circle.setMap(null);
        routeCirclesRef.current = null;
      }
      return;
    }

    const existing = routeCirclesRef.current ?? [];
    const paths = computeCirclePaths(routeCircles.center, routeCircles.radii);
    const polygons: google.maps.Polygon[] = [];

    paths.forEach((path, index) => {
      if (existing[index]) {
        existing[index].setPath(path);
        polygons.push(existing[index]);
      } else {
        polygons.push(
          new google.maps.Polygon({
            map,
            paths: path,
            strokeColor: "#16a34a",
            strokeOpacity: 0.6,
            strokeWeight: 1.5,
            fillColor: "#16a34a",
            fillOpacity: 0.12,
            clickable: false,
          })
        );
      }
    });

    for (let i = paths.length; i < existing.length; i++) {
      existing[i].setMap(null);
    }
    routeCirclesRef.current = polygons;

    const bounds = new google.maps.LatLngBounds();
    bounds.extend(routeCircles.center);
    for (const path of paths) {
      for (const point of path) bounds.extend(point);
    }
    map.fitBounds(bounds, 60);
  }, [mapReady, routeCircles]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || mapId) return;
    mapRef.current.setOptions({
      styles: hideLabels
        ? [
            {
              featureType: "poi",
              elementType: "labels",
              stylers: [{ visibility: "off" }],
            },
            {
              featureType: "transit",
              elementType: "labels",
              stylers: [{ visibility: "off" }],
            },
          ]
        : [],
    });
  }, [mapReady, hideLabels]);

  useEffect(() => {
    const button = myLocationButtonRef.current;
    if (!button) return;
    button.disabled = locatingMe;
    button.style.opacity = locatingMe ? "0.7" : "1";
    button.innerHTML = locatingMe ? LOCATE_SPINNER_SVG : LOCATE_ICON_SVG;
  }, [locatingMe]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    if (!myPosition) {
      if (myLocationMarkerRef.current) {
        myLocationMarkerRef.current.map = null;
        myLocationMarkerRef.current = null;
      }
      return;
    }
    if (!myLocationMarkerRef.current) {
      myLocationMarkerRef.current = new google.maps.marker.AdvancedMarkerElement(
        {
          map,
          position: myPosition,
          content: createMyLocationDot(),
          zIndex: 300,
        },
      );
    } else {
      myLocationMarkerRef.current.position = myPosition;
    }
  }, [mapReady, myPosition]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !myPosition) return;
    if (!pendingLocateRef.current) return;
    pendingLocateRef.current = false;
    const map = mapRef.current;
    map.panTo(myPosition);
    if ((map.getZoom() ?? 12) < 15) map.setZoom(15);
  }, [mapReady, myPosition]);

  useEffect(() => {
    if (!locatingMe && !myPosition) pendingLocateRef.current = false;
  }, [locatingMe, myPosition]);

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
