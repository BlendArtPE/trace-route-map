import { NextRequest, NextResponse } from "next/server";

const GOOGLE_API_BASE = "https://maps.googleapis.com/maps/api";

type LatLng = { lat: number; lng: number };

function decodePolyline(encoded: string): LatLng[] {
  const path: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    path.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return path;
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Falta NEXT_PUBLIC_GOOGLE_MAPS_API_KEY en .env.local" },
      { status: 500 },
    );
  }

  const { searchParams } = request.nextUrl;
  const origin = searchParams.get("origin");
  const destinationsRaw = searchParams.get("destinations");
  const mode = searchParams.get("mode") ?? "walking";

  if (!origin || !destinationsRaw) {
    return NextResponse.json(
      { error: "Se requieren los parámetros origin y destinations" },
      { status: 400 },
    );
  }

  const destinations = destinationsRaw.split("|").filter(Boolean);
  if (destinations.length === 0) {
    return NextResponse.json(
      { error: "destinations no puede estar vacío" },
      { status: 400 },
    );
  }

  try {
    const url = new URL(`${GOOGLE_API_BASE}/directions/json`);
    url.searchParams.set("origin", origin);
    url.searchParams.set(
      "destination",
      destinations[destinations.length - 1],
    );
    url.searchParams.set("mode", mode);
    url.searchParams.set("units", "metric");
    url.searchParams.set("language", "es");
    if (destinations.length > 1) {
      url.searchParams.set("waypoints", destinations.slice(0, -1).join("|"));
    }
    url.searchParams.set("key", apiKey);

    const res = await fetch(url);
    const data = (await res.json()) as {
      status: string;
      error_message?: string;
      routes?: {
        overview_polyline?: { points?: string };
        legs?: {
          distance?: { value?: number };
          duration?: { value?: number };
        }[];
      }[];
    };

    if (data.status !== "OK" || !data.routes?.[0]) {
      return NextResponse.json(
        {
          error:
            data.error_message ??
            `No se pudo calcular la ruta: ${data.status}`,
        },
        { status: 502 },
      );
    }

    const route = data.routes[0];
    const path = decodePolyline(route.overview_polyline?.points ?? "");
    const distanceMeters =
      route.legs?.reduce((acc, leg) => acc + (leg.distance?.value ?? 0), 0) ??
      0;
    const durationSeconds =
      route.legs?.reduce((acc, leg) => acc + (leg.duration?.value ?? 0), 0) ??
      0;

    return NextResponse.json({ path, distanceMeters, durationSeconds });
  } catch (error) {
    console.error("Error llamando a Google Directions API:", error);
    return NextResponse.json(
      { error: "Error llamando a Google Directions API" },
      { status: 500 },
    );
  }
}
