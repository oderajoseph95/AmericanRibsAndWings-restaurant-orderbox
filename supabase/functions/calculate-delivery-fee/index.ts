import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Restaurant location: American Ribs And Wings - Floridablanca
const RESTAURANT_COORDS = {
  lat: 14.9747,
  lng: 120.5373,
};

const RATE_PER_KM = 20; // ₱20 per km
const MINIMUM_FEE = 20; // Minimum ₱20 delivery fee
const MAX_DELIVERY_DISTANCE_KM = 25; // Maximum delivery radius

// Allowed delivery cities
const ALLOWED_CITIES = ['Floridablanca', 'Lubao', 'Guagua', 'Porac'];

// Note: We no longer validate Pampanga bounds here
// The MAX_DELIVERY_DISTANCE check will catch locations that are too far
// Frontend handles GPS validation before sending

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const MAPBOX_TOKEN = Deno.env.get('MAPBOX_ACCESS_TOKEN');
    
    if (!MAPBOX_TOKEN) {
      console.error('MAPBOX_ACCESS_TOKEN not configured');
      return new Response(
        JSON.stringify({ error: 'Mapbox API not configured' }),
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
      // Direct coordinates provided - skip geocoding!
      finalLat = customerLat;
      finalLng = customerLng;
      console.log('Using direct coordinates:', { lat: finalLat, lng: finalLng });
    } else {
      // Fallback: No coordinates provided - return error
      // (In the new flow, coordinates should always be provided)
      return new Response(
        JSON.stringify({ error: 'Please select your location on the map' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Note: We skip strict Pampanga validation here
    // The MAX_DELIVERY_DISTANCE check (25km) will catch locations that are too far
    // Frontend handles GPS validation before sending coords
    console.log('Coordinates received:', { lat: finalLat, lng: finalLng });

    // Get driving distance using Mapbox Directions API
    const directionsUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${RESTAURANT_COORDS.lng},${RESTAURANT_COORDS.lat};${finalLng},${finalLat}?access_token=${MAPBOX_TOKEN}&overview=full&geometries=geojson`;
    
    console.log('Getting driving distance...');
    const directionsResponse = await fetch(directionsUrl);
    const directionsData = await directionsResponse.json();

    if (!directionsData.routes || directionsData.routes.length === 0) {
      console.error('No route found');
      return new Response(
        JSON.stringify({ 
          error: 'Unable to calculate route to your location. Please try adjusting the pin.',
          customerCoords: { lat: finalLat, lng: finalLng }
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const distanceMeters = directionsData.routes[0].distance;
    const distanceKm = distanceMeters / 1000;
    const routeGeometry = directionsData.routes[0].geometry;

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
    
    // Calculate fee (round up km for pricing, with minimum fee)
    const calculatedFee = Math.ceil(distanceKm) * RATE_PER_KM;
    const deliveryFee = Math.max(calculatedFee, MINIMUM_FEE);

    console.log('Delivery calculation:', { 
      distanceKm: distanceKm.toFixed(1), 
      deliveryFee,
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
        routeGeometry,
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
