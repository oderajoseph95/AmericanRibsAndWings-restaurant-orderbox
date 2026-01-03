import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Restaurant location: Floridablanca, Pampanga
const RESTAURANT_COORDS = {
  lat: 14.9968,
  lng: 120.4843,
};

const RATE_PER_KM = 20; // ₱20 per km

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

    const { streetAddress, barangay, city, landmark } = await req.json();
    
    console.log('Calculating delivery fee for:', { streetAddress, barangay, city, landmark });

    // Build full address for geocoding
    const fullAddress = `${streetAddress}, ${barangay}, ${city}, Pampanga, Philippines`;
    const encodedAddress = encodeURIComponent(fullAddress);

    // Step 1: Geocode customer address
    const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${MAPBOX_TOKEN}&country=PH&limit=1`;
    
    console.log('Geocoding address...');
    const geocodeResponse = await fetch(geocodeUrl);
    const geocodeData = await geocodeResponse.json();

    if (!geocodeData.features || geocodeData.features.length === 0) {
      console.error('Address not found:', fullAddress);
      return new Response(
        JSON.stringify({ 
          error: 'Address not found. Please check your address details.',
          address: fullAddress 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const customerCoords = geocodeData.features[0].center; // [lng, lat]
    console.log('Customer coordinates:', customerCoords);

    // Step 2: Get driving distance using Mapbox Directions API
    const directionsUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${RESTAURANT_COORDS.lng},${RESTAURANT_COORDS.lat};${customerCoords[0]},${customerCoords[1]}?access_token=${MAPBOX_TOKEN}&overview=false`;
    
    console.log('Getting driving distance...');
    const directionsResponse = await fetch(directionsUrl);
    const directionsData = await directionsResponse.json();

    if (!directionsData.routes || directionsData.routes.length === 0) {
      console.error('No route found');
      return new Response(
        JSON.stringify({ 
          error: 'Unable to calculate route to your address.',
          customerCoords 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Distance in meters, convert to km
    const distanceMeters = directionsData.routes[0].distance;
    const distanceKm = distanceMeters / 1000;
    
    // Calculate fee (round up km for pricing)
    const deliveryFee = Math.ceil(distanceKm) * RATE_PER_KM;

    console.log('Delivery calculation:', { distanceKm, deliveryFee });

    return new Response(
      JSON.stringify({
        distanceKm: parseFloat(distanceKm.toFixed(1)),
        deliveryFee,
        customerCoords: {
          lat: customerCoords[1],
          lng: customerCoords[0],
        },
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
