"use client";

/// <reference types="google.maps" />

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Castle,
  Church,
  Crosshair,
  Goal,
  Landmark,
  Layers,
  Loader2,
  MapPin,
  Navigation,
  PawPrint,
  Plane,
  Radar,
  Route as RouteIcon,
  Search,
  ShoppingBasket,
  TrainFront,
  Trash2,
  Trophy,
  Waves,
  X,
  type LucideIcon,
} from "lucide-react";

import { GoogleMap } from "@/components/google-map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getCategory,
  initialPoints,
  PLACE_CATEGORIES,
  type PlaceAutocompleteItem,
  type PlaceCategoryId,
  type PlacePoint,
} from "@/lib/places";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS: Record<PlaceCategoryId, LucideIcon> = {
  aeropuerto: Plane,
  tren: TrainFront,
  animales: PawPrint,
  cultural: Landmark,
  monumento: Castle,
  religiones: Church,
  playa: Waves,
  mercados: ShoppingBasket,
  deportes: Trophy,
  barca: Goal,
};

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatKm(km: number) {
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

function formatDuration(seconds: number) {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

type TabButtonProps = {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
};

function TabButton({ icon: Icon, label, active, onClick }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 rounded-md py-2 text-xs font-medium transition-colors",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

type LabeledSwitchProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

function LabeledSwitch({ label, checked, onChange }: LabeledSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-2 text-left text-xs text-muted-foreground mt-2"
    >
      <span className="min-w-0">{label}</span>
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-input",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform",
            checked && "translate-x-4",
          )}
        />
      </span>
    </button>
  );
}

type PlaceListItemProps = {
  point: PlacePoint;
  index: number;
  selected: boolean;
  onSelect: (point: PlacePoint) => void;
  onRemove: (id: string) => void;
  onCenter: (point: PlacePoint) => void;
};

function PlaceListItem({
  point,
  index,
  selected,
  onSelect,
  onRemove,
  onCenter,
}: PlaceListItemProps) {
  const category = getCategory(point.category);
  const CategoryIcon = CATEGORY_ICONS[point.category];
  return (
    <div
      onClick={() => onSelect(point)}
      className={cn(
        "group flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition-colors",
        selected
          ? "border-primary/40 bg-accent"
          : "border-transparent hover:bg-muted",
      )}
    >
      <div
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
        style={{ backgroundColor: category.color }}
      >
        {index + 1}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{point.nameEs}</p>
        <p className="truncate text-xs text-muted-foreground">{point.nameCa}</p>
        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground/70">
          <CategoryIcon className="size-3 shrink-0" style={{ color: category.color }} />
          {category.label}
          {point.address ? ` · ${point.address}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Centrar ${point.nameEs}`}
          onClick={(e) => {
            e.stopPropagation();
            onCenter(point);
          }}
        >
          <Crosshair className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Eliminar ${point.nameEs}`}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(point.id);
          }}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function Home() {
  const [points, setPoints] = useState<PlacePoint[]>(initialPoints);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceAutocompleteItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"ubicaciones" | "categorias" | "rutas">(
    "ubicaciones",
  );
  const [categoryFilter, setCategoryFilter] = useState<PlaceCategoryId | null>(
    null,
  );

  const [routeSubMode, setRouteSubMode] = useState<"cercania" | "trayecto">(
    "cercania",
  );
  const [hideOthers, setHideOthers] = useState(false);
  const [hideLabels, setHideLabels] = useState(false);
  const [routeStartId, setRouteStartId] = useState<string | null>(null);
  const [routeCount, setRouteCount] = useState(5);
  const [routePath, setRoutePath] = useState<google.maps.LatLngLiteral[] | null>(
    null,
  );
  const [routeSummary, setRouteSummary] = useState<{
    distanceMeters: number;
    durationSeconds: number;
  } | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [myPosition, setMyPosition] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [locatingMe, setLocatingMe] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const PEEK_SHEET_HEIGHT = 96;
  const SHEET_MAX_GAP = 16;

  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const sheetRef = useRef<HTMLElement | null>(null);
  const dragStartRef = useRef<{
    startY: number;
    baseHeight: number;
  } | null>(null);
  const dragHeightRef = useRef<number | null>(null);
  const didDragRef = useRef(false);

  const isMobileViewport = () =>
    typeof window !== "undefined" &&
    !window.matchMedia("(min-width: 768px)").matches;

  const startSheetDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isMobileViewport()) return;
    const baseHeight = sheetRef.current?.offsetHeight ?? PEEK_SHEET_HEIGHT;
    dragStartRef.current = { startY: e.clientY, baseHeight };
    dragHeightRef.current = baseHeight;
    setDragHeight(baseHeight);
    didDragRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onSheetDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragStartRef.current;
    if (!drag) return;
    const delta = drag.startY - e.clientY;
    const maxHeight = window.innerHeight - SHEET_MAX_GAP;
    const height = Math.min(
      Math.max(drag.baseHeight + delta, PEEK_SHEET_HEIGHT),
      maxHeight,
    );
    dragHeightRef.current = height;
    setDragHeight(height);
    if (Math.abs(delta) > 4) didDragRef.current = true;
  };

  const endSheetDrag = () => {
    if (!dragStartRef.current) return;
    const finalHeight = dragHeightRef.current ?? PEEK_SHEET_HEIGHT;
    const maxHeight = window.innerHeight - SHEET_MAX_GAP;
    dragStartRef.current = null;
    dragHeightRef.current = null;
    setDragHeight(null);
    setSheetExpanded(finalHeight > (PEEK_SHEET_HEIGHT + maxHeight) / 2);
  };

  const onSheetHandleClick = () => {
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    setSheetExpanded((prev) => !prev);
  };

  const onSheetHandleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSheetExpanded((prev) => !prev);
    }
  };

  useEffect(
    () => () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    },
    [],
  );

  const requestMyLocation = useCallback(
    (onError?: () => void) => {
      if (!("geolocation" in navigator)) {
        setLocationError("Tu navegador no soporta geolocalización");
        onError?.();
        return;
      }
      setLocatingMe(true);
      setLocationError(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setMyPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLocatingMe(false);
        },
        () => {
          setLocatingMe(false);
          setLocationError("No se pudo obtener tu ubicación");
          onError?.();
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
      );
    },
    [],
  );

  const filteredPoints = useMemo(() => {
    const q = query.trim().toLowerCase();
    return points.filter(
      (point) =>
        (!categoryFilter || point.category === categoryFilter) &&
        (!q ||
          point.nameEs.toLowerCase().includes(q) ||
          point.nameCa.toLowerCase().includes(q)),
    );
  }, [points, query, categoryFilter]);

  const categoryCounts = useMemo(() => {
    const counts = {} as Record<PlaceCategoryId, number>;
    for (const category of PLACE_CATEGORIES) counts[category.id] = 0;
    for (const point of points) {
      counts[point.category] = (counts[point.category] ?? 0) + 1;
    }
    return counts;
  }, [points]);

  const routeData = useMemo(() => {
    if (!routeStartId || routeCount < 2) return null;
    const start =
      routeStartId === "me"
        ? myPosition
          ? {
              id: "me",
              category: "cultural" as PlaceCategoryId,
              nameEs: "Mi ubicación",
              nameCa: "La meva ubicació",
              address: "Tu posición actual",
              lat: myPosition.lat,
              lng: myPosition.lng,
            }
          : null
        : points.find((point) => point.id === routeStartId);
    if (!start) return null;

    if (routeSubMode === "cercania") {
      const nearest = points
        .filter((point) => point.id !== start.id)
        .map((point) => ({ point, distKm: haversineKm(start, point) }))
        .sort((a, b) => a.distKm - b.distKm)
        .slice(0, routeCount);
      return { start, nearest };
    }

    const chain: { point: PlacePoint; distKm: number }[] = [];
    const remaining = new Set(points.map((point) => point.id));
    remaining.delete(start.id);
    let current = start;
    for (let i = 0; i < routeCount; i++) {
      let best: { point: PlacePoint; distKm: number } | null = null;
      for (const point of points) {
        if (!remaining.has(point.id)) continue;
        const distKm = haversineKm(current, point);
        if (!best || distKm < best.distKm) best = { point, distKm };
      }
      if (!best) break;
      chain.push(best);
      remaining.delete(best.point.id);
      current = best.point;
    }
    return { start, nearest: chain };
  }, [routeStartId, routeCount, routeSubMode, points, myPosition]);

  const routeLoading =
    routeSubMode === "trayecto" && routeData !== null && !routePath && !routeError;

  const routePointIds = useMemo(() => {
    if (!routeData) return [];
    return [
      routeData.start.id,
      ...routeData.nearest.map((item) => item.point.id),
    ];
  }, [routeData]);

  const routeCircles = useMemo(() => {
    if (routeSubMode !== "cercania" || !routeData) return null;
    if (routeData.nearest.length === 0) return null;
    const distances = routeData.nearest.map((item) => item.distKm);
    const nearestKm = Math.min(...distances);
    const farthestKm = Math.max(...distances);
    return {
      center: { lat: routeData.start.lat, lng: routeData.start.lng },
      radii: [nearestKm * 1000, farthestKm * 1000],
    };
  }, [routeSubMode, routeData]);

  const mapPoints = useMemo(() => {
    if (activeTab === "ubicaciones" && hideOthers && selectedId) {
      const selected = filteredPoints.find((point) => point.id === selectedId);
      if (selected) return [selected];
    }
    if (activeTab === "rutas" && routeData) {
      return [
        routeData.start,
        ...routeData.nearest.map((item) => item.point),
      ];
    }
    return filteredPoints;
  }, [activeTab, hideOthers, selectedId, filteredPoints, routeData]);

  useEffect(() => {
    if (routeSubMode !== "trayecto" || !routeData) return;
    const { start, nearest } = routeData;
    let cancelled = false;

    const straightPath = [
      { lat: start.lat, lng: start.lng },
      ...nearest.map((item) => ({
        lat: item.point.lat,
        lng: item.point.lng,
      })),
    ];

    const destinations = nearest
      .map((item) => `${item.point.lat},${item.point.lng}`)
      .join("|");

    (async () => {
      try {
        const res = await fetch(
          `/api/directions?origin=${start.lat},${start.lng}&destinations=${encodeURIComponent(destinations)}`,
        );
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.path) {
          setRoutePath(straightPath);
          setRouteSummary(null);
          setRouteError(
            "Directions API no disponible; mostrando línea recta entre los puntos.",
          );
          return;
        }
        setRoutePath(data.path);
        setRouteSummary({
          distanceMeters: data.distanceMeters,
          durationSeconds: data.durationSeconds,
        });
        setRouteError(null);
      } catch {
        if (cancelled) return;
        setRoutePath(straightPath);
        setRouteSummary(null);
        setRouteError("No se pudo calcular la ruta por calles; mostrando línea recta.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [routeData, routeSubMode]);

  const handleSearchChange = (value: string) => {
    setQuery(value);
    const q = value.trim();
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (q.length < 2) {
      setSuggestions([]);
      setSearching(false);
      setShowSuggestions(false);
      return;
    }
    setSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places?input=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Error al buscar lugares");
        }
        setSuggestions(data.suggestions ?? []);
        setShowSuggestions(true);
        setSearchError(null);
      } catch (err) {
        setSuggestions([]);
        setSearchError(
          err instanceof Error ? err.message : "Error al buscar lugares",
        );
      } finally {
        setSearching(false);
      }
    }, 350);
  };

  const focusPoint = useCallback((point: PlacePoint) => {
    setSelectedId(point.id);
  }, []);

  const handleItemSelect = (point: PlacePoint) => {
    setSelectedId(point.id);
    if (activeTab === "rutas") {
      setRouteStartId(point.id);
      setRoutePath(null);
      setRouteSummary(null);
      setRouteError(null);
    }
  };

  const addPoint = async (suggestion: PlaceAutocompleteItem) => {
    setAddingId(suggestion.placeId);
    setSearchError(null);
    try {
      const res = await fetch(
        `/api/places?place_id=${encodeURIComponent(suggestion.placeId)}`,
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Error al obtener las coordenadas");
      }
      const point: PlacePoint = {
        id: crypto.randomUUID(),
        category: "cultural",
        nameEs: data.name,
        nameCa: data.name,
        address: data.address,
        lat: data.lat,
        lng: data.lng,
        placeId: data.placeId,
      };
      setPoints((prev) => [...prev, point]);
      setQuery("");
      setSuggestions([]);
      setSelectedId(point.id);
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : "Error al agregar el punto",
      );
    } finally {
      setAddingId(null);
    }
  };

  const removePoint = (id: string) => {
    setPoints((prev) => prev.filter((point) => point.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
    setRouteStartId((prev) => (prev === id ? null : prev));
    setRoutePath(null);
    setRouteSummary(null);
    setRouteError(null);
  };

  const handleMapSelect = (point: PlacePoint) => {
    setSelectedId(point.id);
    if (activeTab === "rutas") {
      setRouteStartId(point.id);
      setRoutePath(null);
      setRouteSummary(null);
      setRouteError(null);
    }
  };

  const switchRouteSubMode = (mode: "cercania" | "trayecto") => {
    setRouteSubMode(mode);
    setRoutePath(null);
    setRouteSummary(null);
    setRouteError(null);
  };

  const handleStartChange = (value: string) => {
    setRoutePath(null);
    setRouteSummary(null);
    setRouteError(null);
    if (value !== "me") {
      setRouteStartId(value || null);
      return;
    }
    if (myPosition) {
      setRouteStartId("me");
      return;
    }
    setRouteStartId("me");
    requestMyLocation(() => setRouteStartId(null));
  };

  const handleTabChange = (
    tab: "ubicaciones" | "categorias" | "rutas",
  ) => {
    setActiveTab(tab);
    if (tab !== "rutas") {
      setRouteStartId(null);
      setRoutePath(null);
      setRouteSummary(null);
      setRouteError(null);
    }
    if (tab !== "categorias") setCategoryFilter(null);
    if (isMobileViewport()) setSheetExpanded(true);
  };

  const clearAll = () => {
    setPoints([]);
    setQuery("");
    setSuggestions([]);
    setSelectedId(null);
    setHideOthers(false);
    setHideLabels(false);
    setRouteStartId(null);
    setRoutePath(null);
    setRouteSummary(null);
    setRouteError(null);
  };

  const toggleCategory = (id: PlaceCategoryId) => {
    setCategoryFilter((prev) => (prev === id ? null : id));
  };

  const activeCategory = categoryFilter ? getCategory(categoryFilter) : null;

  const hideLabelsSupported = !process.env.NEXT_PUBLIC_GOOGLE_MAPS_ID_KEY;

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-background md:flex-row">
      <aside
        ref={sheetRef}
        className={cn(
          "absolute inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden rounded-t-2xl border-t bg-card shadow-2xl",
          "md:static md:z-auto md:h-full md:w-[26rem] md:shrink-0 md:rounded-none md:border-r md:border-t-0 md:shadow-none",
          dragHeight == null && "transition-[height] duration-300 ease-in-out",
          dragHeight == null &&
            (sheetExpanded ? "h-[calc(100dvh_-_1.5rem)]" : "h-24"),
        )}
        style={dragHeight != null ? { height: dragHeight } : undefined}
      >
        <div
          role="button"
          tabIndex={0}
          aria-expanded={sheetExpanded}
          aria-label="Desplegar u ocultar el panel"
          onPointerDown={startSheetDrag}
          onPointerMove={onSheetDragMove}
          onPointerUp={endSheetDrag}
          onPointerCancel={endSheetDrag}
          onClick={onSheetHandleClick}
          onKeyDown={onSheetHandleKeyDown}
          className="flex shrink-0 cursor-grab touch-none select-none items-center justify-center py-2 active:cursor-grabbing md:hidden"
        >
          <span className="h-1 w-10 rounded-full bg-muted-foreground/40" />
        </div>

        <div
          className={cn(
            "border-b px-4 py-3",
            sheetExpanded ? "block" : "hidden md:block",
          )}
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-sm font-semibold">Puntos de ruta</h1>
              <p className="text-xs text-muted-foreground">
                Barcelona · lugares turísticos
              </p>
            </div>
            <Badge variant="secondary">{points.length}</Badge>
          </div>
          <div className="mt-2">
            {hideLabelsSupported && (
              <LabeledSwitch
                label="Ocultar nombres de otros lugares"
                checked={hideLabels}
                onChange={setHideLabels}
              />
            )}
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-3 gap-1 border-b p-2">
          <TabButton
            icon={MapPin}
            label="Ubicaciones"
            active={activeTab === "ubicaciones"}
            onClick={() => handleTabChange("ubicaciones")}
          />
          <TabButton
            icon={Layers}
            label="Categorías"
            active={activeTab === "categorias"}
            onClick={() => handleTabChange("categorias")}
          />
          <TabButton
            icon={RouteIcon}
            label="Rutas"
            active={activeTab === "rutas"}
            onClick={() => handleTabChange("rutas")}
          />
        </div>

        {activeTab === "ubicaciones" && (
          <div
            className={cn(
              "border-b p-3",
              sheetExpanded ? "block" : "hidden md:block",
            )}
          >
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Buscar lugar (mín. 2 caracteres)..."
                className="pr-8 pl-8"
                aria-label="Buscar lugar"
              />
              {searching && (
                <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>

            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-20 mt-1 w-[calc(100%-1.5rem)] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg">
                <ul className="py-1">
                  {suggestions.map((suggestion) => (
                    <li key={suggestion.placeId}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => addPoint(suggestion)}
                        disabled={addingId === suggestion.placeId}
                        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-60"
                      >
                        <MapPin className="size-4 shrink-0 text-muted-foreground" />
                        <span className="line-clamp-2">
                          {suggestion.description}
                        </span>
                        {addingId === suggestion.placeId && (
                          <Loader2 className="ml-auto size-4 shrink-0 animate-spin" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <LabeledSwitch
              label="Ocultar los demás puntos al seleccionar"
              checked={hideOthers}
              onChange={setHideOthers}
            />

            {searchError && (
              <p className="mt-2 text-xs text-destructive">{searchError}</p>
            )}

            {activeCategory && (
              <div className="mt-2 flex items-center gap-2">
                <Badge
                  className="text-white"
                  style={{ backgroundColor: activeCategory.color }}
                >
                  {activeCategory.label}
                </Badge>
                <button
                  type="button"
                  onClick={() => setCategoryFilter(null)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                  Quitar filtro
                </button>
              </div>
            )}
          </div>
        )}

        <ScrollArea
          className={cn(
            "min-h-0 flex-1",
            sheetExpanded ? "block" : "hidden md:block",
          )}
        >
          {activeTab === "ubicaciones" && (
            <div className="flex flex-col gap-1 p-3">
              {points.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                  <MapPin className="size-8" />
                  <p className="text-sm">Sin puntos todavía</p>
                  <p className="text-xs">Busca un lugar arriba para agregarlo</p>
                </div>
              ) : filteredPoints.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Sin resultados
                </p>
              ) : (
                filteredPoints.map((point, index) => (
                  <PlaceListItem
                    key={point.id}
                    point={point}
                    index={index}
                    selected={selectedId === point.id}
                    onSelect={handleItemSelect}
                    onRemove={removePoint}
                    onCenter={focusPoint}
                  />
                ))
              )}
            </div>
          )}

          {activeTab === "categorias" && (
            <div className="flex flex-col gap-3 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Agrupa los lugares por categoría
                </p>
                {categoryFilter && (
                  <button
                    type="button"
                    onClick={() => setCategoryFilter(null)}
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <X className="size-3" />
                    Todas
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-1.5">
                {PLACE_CATEGORIES.map((category) => {
                  const Icon = CATEGORY_ICONS[category.id];
                  const selected = categoryFilter === category.id;
                  const count = categoryCounts[category.id] ?? 0;
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => toggleCategory(category.id)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors",
                        selected
                          ? "border-primary/50 bg-accent"
                          : "border-transparent hover:bg-muted",
                      )}
                    >
                      <span
                        className="flex size-7 shrink-0 items-center justify-center rounded-full text-white"
                        style={{ backgroundColor: category.color }}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {category.label}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {category.description}
                        </span>
                      </span>
                      <Badge variant="secondary">{count}</Badge>
                    </button>
                  );
                })}
              </div>

              {activeCategory ? (
                <div className="flex flex-col gap-1 border-t pt-3">
                  <p className="pb-1 text-xs font-medium">
                    Lugares de{" "}
                    <span style={{ color: activeCategory.color }}>
                      {activeCategory.label}
                    </span>
                  </p>
                  {points
                    .filter((point) => point.category === categoryFilter)
                    .map((point, index) => (
                      <PlaceListItem
                        key={point.id}
                        point={point}
                        index={index}
                        selected={selectedId === point.id}
                        onSelect={handleItemSelect}
                        onRemove={removePoint}
                        onCenter={focusPoint}
                      />
                    ))}
                </div>
              ) : (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Selecciona una categoría para ver sus lugares
                </p>
              )}
            </div>
          )}

          {activeTab === "rutas" && (
            <div className="flex flex-col gap-3 p-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium">Tipo de ruta</span>
                <div className="grid grid-cols-2 gap-1.5">
                  <Button
                    type="button"
                    variant={routeSubMode === "cercania" ? "default" : "outline"}
                    onClick={() => switchRouteSubMode("cercania")}
                    className={
                      routeSubMode === "cercania"
                        ? "bg-emerald-600 hover:bg-emerald-700"
                        : ""
                    }
                  >
                    <Radar className="size-4" />
                    Cercanía
                  </Button>
                  <Button
                    type="button"
                    variant={routeSubMode === "trayecto" ? "default" : "outline"}
                    onClick={() => switchRouteSubMode("trayecto")}
                    className={
                      routeSubMode === "trayecto"
                        ? "bg-emerald-600 hover:bg-emerald-700"
                        : ""
                    }
                  >
                    <Navigation className="size-4" />
                    Trayecto
                  </Button>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {routeSubMode === "cercania"
                  ? "Elige un punto de inicio: se dibujarán dos círculos en el mapa, uno al punto más cercano y otro al más alejado de los que elijas."
                  : "Elige un punto de inicio: la ruta saltará al punto más cercano de cada uno (N saltos) y la línea seguirá las calles."}
              </p>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium">Punto de inicio</span>
                <select
                  value={routeStartId ?? ""}
                  onChange={(e) => handleStartChange(e.target.value)}
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">Selecciona un punto...</option>
                  <option value="me">
                    {locatingMe ? "Obteniendo tu ubicación..." : "Yo (mi ubicación)"}
                  </option>
                  {points.map((point) => (
                    <option key={point.id} value={point.id}>
                      {point.nameEs}
                    </option>
                  ))}
                </select>
              </label>

              {locationError && (
                <p className="text-xs text-destructive">{locationError}</p>
              )}

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium">
                  {routeSubMode === "cercania"
                    ? "Número de lugares cercanos"
                    : "Número de saltos"}
                </span>
                <select
                  value={routeCount}
                  onChange={(e) => {
                    setRouteCount(Number(e.target.value));
                    setRoutePath(null);
                    setRouteSummary(null);
                    setRouteError(null);
                  }}
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                >
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>

              {routeLoading && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Calculando ruta...
                </p>
              )}

              {routeError && (
                <p className="text-xs text-destructive">{routeError}</p>
              )}

              {!routeStartId && !routeLoading && (
                <p className="text-xs text-muted-foreground">
                  También puedes hacer clic en un punto de la lista o del mapa
                  para usarlo como inicio.
                </p>
              )}

              {routeData && (
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium">
                    Desde{" "}
                    <span className="text-emerald-600">
                      {routeData.start.nameEs}
                    </span>
                    {routeSubMode === "cercania"
                      ? `, los ${routeData.nearest.length} más cercanos:`
                      : `, saltando al más cercano de cada punto (${routeData.nearest.length}):`}
                  </p>
                  {routeData.nearest.map((item, index) => (
                    <div
                      key={item.point.id}
                      onClick={() => {
                        setSelectedId(item.point.id);
                      }}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-lg border p-2 transition-colors",
                        selectedId === item.point.id
                          ? "border-primary/40 bg-accent"
                          : "border-transparent hover:bg-muted",
                      )}
                    >
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-semibold text-white">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">
                          {item.point.nameEs}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {item.point.nameCa}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatKm(item.distKm)}
                      </span>
                    </div>
                  ))}

                  {routeSubMode === "cercania" && (
                    <div className="mt-1 flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-xs">
                      <span className="text-muted-foreground">
                        Círculos:{" "}
                        {routeData.nearest[0]
                          ? formatKm(routeData.nearest[0].distKm)
                          : "—"}{" "}
                        al más cercano ·{" "}
                        {routeData.nearest[routeData.nearest.length - 1]
                          ? formatKm(
                              routeData.nearest[routeData.nearest.length - 1]
                                .distKm,
                            )
                          : "—"}{" "}
                        al más alejado
                      </span>
                    </div>
                  )}

                  {routeSubMode === "trayecto" && routeSummary && (
                    <div className="mt-1 flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-xs">
                      <span className="text-muted-foreground">
                        Ruta andando (por calles)
                      </span>
                      <span className="font-medium">
                        {(routeSummary.distanceMeters / 1000).toFixed(1)} km
                        {" · "}
                        {formatDuration(routeSummary.durationSeconds)}
                      </span>
                    </div>
                  )}

                  <p className="mt-1 text-[11px] text-muted-foreground/70">
                    {routeSubMode === "cercania"
                      ? "Las distancias de la lista son en línea recta; los círculos del mapa usan esos radios."
                      : "Las distancias de la lista son en línea recta; la línea del mapa sigue las calles."}
                  </p>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <div
          className={cn(
            "items-center justify-between border-t px-4 py-2",
            sheetExpanded ? "flex" : "hidden md:flex",
          )}
        >
          <p className="text-xs text-muted-foreground">
            {activeTab === "rutas"
              ? "Haz clic en un punto para usarlo como inicio"
              : "Haz clic en un punto para centrarlo"}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={points.length === 0}
            onClick={clearAll}
          >
            Limpiar
          </Button>
        </div>
      </aside>

      <main className="relative min-h-0 w-full flex-1">
        <GoogleMap
          points={mapPoints}
          selectedId={selectedId}
          onSelect={handleMapSelect}
          routePath={routeSubMode === "trayecto" ? routePath : null}
          routePointIds={routePointIds}
          routeCircles={routeCircles}
          hideLabels={hideLabels}
          myPosition={myPosition}
          locatingMe={locatingMe}
          onLocateMe={requestMyLocation}
        />
      </main>
    </div>
  );
}
