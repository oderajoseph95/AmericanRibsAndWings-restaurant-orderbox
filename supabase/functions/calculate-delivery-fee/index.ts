import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Restaurant location: American Ribs And Wings - Floridablanca (verified from Google Maps)
const RESTAURANT_COORDS = {
  lat: 14.9747,
  lng: 120.5373,
};

// Allowed delivery cities
const ALLOWED_CITIES = ['Floridablanca', 'Lubao', 'Guagua', 'Porac'];

const RATE_PER_KM = 20; // ₱20 per km
const MAX_DELIVERY_DISTANCE_KM = 25; // Maximum delivery radius

// Validate coordinates are within Philippines bounds
const isInPhilippines = (lat: number, lng: number): boolean => {
  return lat >= 4 && lat <= 22 && lng >= 116 && lng <= 127;
};

serve(async (req) => {
  // Handle CORS preflight requests
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
    const { streetAddress, barangay, city, landmark } = body;
    
    console.log('Calculating delivery fee for:', { streetAddress, barangay, city, landmark });

    // Validate required fields
    if (!city) {
      return new Response(
        JSON.stringify({ error: 'Please select a city' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!barangay?.trim()) {
      return new Response(
        JSON.stringify({ error: 'Please enter your barangay' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!streetAddress?.trim()) {
      return new Response(
        JSON.stringify({ error: 'Please enter your street address' }),
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

    // Build full address for geocoding (include barangay for better accuracy)
    const fullAddress = `${streetAddress}, ${barangay}, ${city}, Pampanga, Philippines`;
    const encodedAddress = encodeURIComponent(fullAddress);

    console.log('Geocoding address:', fullAddress);
    
    // Geocode with proximity bias toward restaurant for better results in the area
    const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${MAPBOX_TOKEN}&country=PH&proximity=${RESTAURANT_COORDS.lng},${RESTAURANT_COORDS.lat}&limit=1`;
    
    const geocodeResponse = await fetch(geocodeUrl);
    const geocodeData = await geocodeResponse.json();

    if (!geocodeData.features || geocodeData.features.length === 0) {
      console.error('Address not found:', fullAddress);
      return new Response(
        JSON.stringify({ 
          error: 'Could not find your address. Please check your barangay and street address.',
          address: fullAddress 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const customerCoords: [number, number] = geocodeData.features[0].center; // [lng, lat]
    const geocodedLat = customerCoords[1];
    const geocodedLng = customerCoords[0];
    
    console.log('Geocoded coordinates:', { lat: geocodedLat, lng: geocodedLng });

    // Validate geocoded coordinates are in Philippines
    if (!isInPhilippines(geocodedLat, geocodedLng)) {
      console.error('Geocoded location outside Philippines:', { lat: geocodedLat, lng: geocodedLng });
      return new Response(
        JSON.stringify({ 
          error: 'The address could not be located in the Philippines. Please check your address details.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get driving distance using Mapbox Directions API
    const directionsUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${RESTAURANT_COORDS.lng},${RESTAURANT_COORDS.lat};${geocodedLng},${geocodedLat}?access_token=${MAPBOX_TOKEN}&overview=false`;
    
    console.log('Getting driving distance...');
    const directionsResponse = await fetch(directionsUrl);
    const directionsData = await directionsResponse.json();

    if (!directionsData.routes || directionsData.routes.length === 0) {
      console.error('No route found');
      return new Response(
        JSON.stringify({ 
          error: 'Unable to calculate route to your address. Please verify your address is correct.',
          customerCoords: { lat: geocodedLat, lng: geocodedLng }
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Distance in meters, convert to km
    const distanceMeters = directionsData.routes[0].distance;
    const distanceKm = distanceMeters / 1000;

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
    
    // Calculate fee (round up km for pricing)
    const deliveryFee = Math.ceil(distanceKm) * RATE_PER_KM;

    console.log('Delivery calculation:', { 
      distanceKm: distanceKm.toFixed(1), 
      deliveryFee,
      restaurantCoords: RESTAURANT_COORDS,
      customerCoords: { lat: geocodedLat, lng: geocodedLng },
      geocodedAddress: geocodeData.features[0].place_name
    });

    return new Response(
      JSON.stringify({
        distanceKm: parseFloat(distanceKm.toFixed(1)),
        deliveryFee,
        customerCoords: {
          lat: geocodedLat,
          lng: geocodedLng,
        },
        restaurantCoords: RESTAURANT_COORDS,
        geocodedAddress: geocodeData.features[0].place_name,
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
