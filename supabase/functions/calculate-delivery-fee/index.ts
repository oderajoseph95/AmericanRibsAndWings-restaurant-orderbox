import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Restaurant location: American Ribs And Wings - Floridablanca (exact coordinates)
const RESTAURANT_COORDS = {
  lat: 14.972683712714007,
  lng: 120.53207910676976,
};

// Delivery fee pricing structure
const BASE_FEE = 39;           // ₱39 for first 3km
const FREE_KM = 3;             // First 3km included in base fee
const ADDITIONAL_RATE = 15;    // ₱15 per additional km beyond 3km
const MAX_DELIVERY_DISTANCE_KM = 25; // Maximum delivery radius

// Allowed delivery cities
const ALLOWED_CITIES = ['Floridablanca', 'Lubao', 'Guagua', 'Porac'];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY');
    
    if (!GOOGLE_MAPS_API_KEY) {
      console.error('GOOGLE_MAPS_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Google Maps API not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { streetAddress, barangay, city, landmark, customerLat, customerLng } = body;
    
    console.log('Calculating delivery fee:', { 
      streetAddress, 
      barangay, 
      city, 
      landmark,
      customerLat,
      customerLng,
      hasDirectCoords: !!(customerLat && customerLng)
    });

    // Validate required fields
    if (!city) {
      return new Response(
        JSON.stringify({ error: 'Please select a city' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!barangay?.trim()) {
      return new Response(
        JSON.stringify({ error: 'Please select a barangay' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate city is in allowed list
    if (!ALLOWED_CITIES.some(c => c.toLowerCase() === city.toLowerCase())) {
      return new Response(
        JSON.stringify({ 
          error: `We only deliver to ${ALLOWED_CITIES.join(', ')}. Please select a valid city.` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use direct coordinates if provided (from GPS or pin drag)
    let finalLat: number;
    let finalLng: number;

    if (customerLat && customerLng) {
      finalLat = customerLat;
      finalLng = customerLng;
      console.log('Using direct coordinates:', { lat: finalLat, lng: finalLng });
    } else {
      return new Response(
        JSON.stringify({ error: 'Please select your location on the map' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get driving distance using Google Routes API
    console.log('Getting driving distance from Google Routes API...');
    
    const routesResponse = await fetch(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
          'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
        },
        body: JSON.stringify({
          origin: {
            location: {
              latLng: {
                latitude: RESTAURANT_COORDS.lat,
                longitude: RESTAURANT_COORDS.lng,
              },
            },
          },
          destination: {
            location: {
              latLng: {
                latitude: finalLat,
                longitude: finalLng,
              },
            },
          },
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_AWARE',
        }),
      }
    );

    const routesData = await routesResponse.json();
    console.log('Google Routes API response:', JSON.stringify(routesData));

    if (!routesData.routes || routesData.routes.length === 0) {
      console.error('No route found from Google Routes API:', routesData);
      return new Response(
        JSON.stringify({ 
          error: 'Unable to calculate route to your location. Please try adjusting the pin.',
          customerCoords: { lat: finalLat, lng: finalLng }
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const distanceMeters = routesData.routes[0].distanceMeters;
    const distanceKm = distanceMeters / 1000;
    const encodedPolyline = routesData.routes[0].polyline?.encodedPolyline;

    // Check maximum delivery distance
    if (distanceKm > MAX_DELIVERY_DISTANCE_KM) {
      console.log('Distance exceeds maximum:', distanceKm);
      return new Response(
        JSON.stringify({ 
          error: `Sorry, this location is ${distanceKm.toFixed(1)} km away. We only deliver within ${MAX_DELIVERY_DISTANCE_KM} km of our restaurant.`,
          distanceKm: parseFloat(distanceKm.toFixed(1)),
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Calculate fee: ₱39 for first 3km, then ₱15 per additional km (rounded up)
    let deliveryFee: number;
    let additionalKm = 0;

    if (distanceKm <= FREE_KM) {
      // Within 3km = flat ₱39
      deliveryFee = BASE_FEE;
    } else {
      // Beyond 3km = ₱39 + ₱15 per additional km (rounded up)
      additionalKm = Math.ceil(distanceKm - FREE_KM);
      deliveryFee = BASE_FEE + (additionalKm * ADDITIONAL_RATE);
    }

    console.log('Delivery fee calculation:', { 
      distanceKm: distanceKm.toFixed(1),
      baseKm: FREE_KM,
      additionalKm,
      baseFee: BASE_FEE,
      additionalFee: additionalKm * ADDITIONAL_RATE,
      totalFee: deliveryFee,
      restaurantCoords: RESTAURANT_COORDS,
      customerCoords: { lat: finalLat, lng: finalLng },
      barangay,
      city,
    });

    return new Response(
      JSON.stringify({
        distanceKm: parseFloat(distanceKm.toFixed(1)),
        deliveryFee,
        customerCoords: { lat: finalLat, lng: finalLng },
        restaurantCoords: RESTAURANT_COORDS,
        encodedPolyline, // Google's encoded polyline (can be decoded on frontend if needed)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error calculating delivery fee:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to calculate delivery fee';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
