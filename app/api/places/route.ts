import { NextRequest, NextResponse } from "next/server";

import type { PlaceAutocompleteItem } from "@/lib/places";

const GOOGLE_API_BASE = "https://maps.googleapis.com/maps/api";

type AutocompletePrediction = {
  place_id: string;
  description: string;
};

type GeocodeResult = {
  place_id?: string;
  formatted_address?: string;
  geometry?: {
    location?: {
      lat: number;
      lng: number;
    };
  };
};

export async function GET(request: NextRequest) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Falta NEXT_PUBLIC_GOOGLE_MAPS_API_KEY en .env.local" },
      { status: 500 },
    );
  }

  const { searchParams } = request.nextUrl;
  const input = searchParams.get("input");
  const placeId = searchParams.get("place_id");
  const language = searchParams.get("language") ?? "es";

  try {
    if (placeId) {
      const url = new URL(`${GOOGLE_API_BASE}/geocode/json`);
      url.searchParams.set("place_id", placeId);
      url.searchParams.set("key", apiKey);
      url.searchParams.set("language", language);

      const res = await fetch(url);
      const data = (await res.json()) as {
        status: string;
        results?: GeocodeResult[];
        error_message?: string;
      };

      if (data.status !== "OK" || !data.results?.[0]) {
        return NextResponse.json(
          {
            error: data.error_message ?? `Geocodificación fallida: ${data.status}`,
          },
          { status: 502 },
        );
      }

      const result = data.results[0];
      const location = result.geometry?.location;
      return NextResponse.json({
        placeId: result.place_id ?? placeId,
        name: result.formatted_address,
        address: result.formatted_address,
        lat: location?.lat,
        lng: location?.lng,
      });
    }

    if (!input) {
      return NextResponse.json(
        { error: "Se requiere el parámetro input o place_id" },
        { status: 400 },
      );
    }

    const url = new URL(`${GOOGLE_API_BASE}/place/autocomplete/json`);
    url.searchParams.set("input", input);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("language", language);
    url.searchParams.set("types", "establishment|geocode");

    const res = await fetch(url);
    const data = (await res.json()) as {
      status: string;
      predictions?: AutocompletePrediction[];
      error_message?: string;
    };

    if (data.status !== "OK") {
      return NextResponse.json(
        {
          error: data.error_message ?? `Autocompletado fallido: ${data.status}`,
        },
        { status: 502 },
      );
    }

    const suggestions: PlaceAutocompleteItem[] = (data.predictions ?? []).map(
      (prediction) => ({
        placeId: prediction.place_id,
        description: prediction.description,
      }),
    );

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Error llamando a Google Maps API:", error);
    return NextResponse.json(
      { error: "Error llamando a Google Maps API" },
      { status: 500 },
    );
  }
}
