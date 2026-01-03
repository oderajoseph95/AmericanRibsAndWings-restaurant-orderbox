import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Restaurant location: American Ribs And Wings - Floridablanca (from Google Maps)
const RESTAURANT_COORDS = {
  lat: 14.972486785559141,
  lng: 120.52905357511342,
};

// Allowed delivery cities
const ALLOWED_CITIES = ['Floridablanca', 'Lubao', 'Guagua', 'Porac'];

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

    const body = await req.json();
    const { streetAddress, barangay, city, landmark, customerLat, customerLng } = body;
    
    console.log('Calculating delivery fee for:', body);

    // Validate city is in allowed list
    if (city && !ALLOWED_CITIES.some(c => c.toLowerCase() === city.toLowerCase())) {
      return new Response(
        JSON.stringify({ 
          error: `We only deliver to ${ALLOWED_CITIES.join(', ')}. Please select a valid city.` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let customerCoords: [number, number]; // [lng, lat]

    // If customer coordinates are provided directly (from pin drop), use them
    if (customerLat && customerLng) {
      customerCoords = [customerLng, customerLat];
      console.log('Using provided coordinates:', customerCoords);
    } else {
      // Fallback: Geocode customer address
      const fullAddress = `${streetAddress}, ${barangay}, ${city}, Pampanga, Philippines`;
      const encodedAddress = encodeURIComponent(fullAddress);

      console.log('Geocoding address:', fullAddress);
      const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${MAPBOX_TOKEN}&country=PH&limit=1`;
      
      const geocodeResponse = await fetch(geocodeUrl);
      const geocodeData = await geocodeResponse.json();

      if (!geocodeData.features || geocodeData.features.length === 0) {
        console.error('Address not found:', fullAddress);
        return new Response(
          JSON.stringify({ 
            error: 'Address not found. Please check your address details or use the pin drop feature.',
            address: fullAddress 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      customerCoords = geocodeData.features[0].center; // [lng, lat]
      console.log('Geocoded coordinates:', customerCoords);
    }

    // Get driving distance using Mapbox Directions API
    const directionsUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${RESTAURANT_COORDS.lng},${RESTAURANT_COORDS.lat};${customerCoords[0]},${customerCoords[1]}?access_token=${MAPBOX_TOKEN}&overview=false`;
    
    console.log('Getting driving distance...');
    const directionsResponse = await fetch(directionsUrl);
    const directionsData = await directionsResponse.json();

    if (!directionsData.routes || directionsData.routes.length === 0) {
      console.error('No route found');
      return new Response(
        JSON.stringify({ 
          error: 'Unable to calculate route to your address. Please try a different location.',
          customerCoords: { lat: customerCoords[1], lng: customerCoords[0] }
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Distance in meters, convert to km
    const distanceMeters = directionsData.routes[0].distance;
    const distanceKm = distanceMeters / 1000;
    
    // Calculate fee (round up km for pricing)
    const deliveryFee = Math.ceil(distanceKm) * RATE_PER_KM;

    console.log('Delivery calculation:', { 
      distanceKm: distanceKm.toFixed(1), 
      deliveryFee,
      restaurantCoords: RESTAURANT_COORDS,
      customerCoords: { lat: customerCoords[1], lng: customerCoords[0] }
    });

    return new Response(
      JSON.stringify({
        distanceKm: parseFloat(distanceKm.toFixed(1)),
        deliveryFee,
        customerCoords: {
          lat: customerCoords[1],
          lng: customerCoords[0],
        },
        restaurantCoords: RESTAURANT_COORDS,
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
