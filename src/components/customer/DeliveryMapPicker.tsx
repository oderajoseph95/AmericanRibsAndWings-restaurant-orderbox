import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, MapPin, AlertCircle, Calculator, GripVertical, Search } from "lucide-react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import usePlacesAutocomplete, { getGeocode, getLatLng } from "use-places-autocomplete";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ALLOWED_CITIES, getBarangaysByCity } from "@/data/barangays";
import { DeliveryHeroCard } from "./checkout/DeliveryHeroCard";

// Exact restaurant coordinates (American Ribs And Wings - Floridablanca)
const RESTAURANT_COORDS = {
  lat: 14.972683712714007,
  lng: 120.53207910676976,
};

// Pampanga center for map default
const PAMPANGA_CENTER = {
  lat: 14.97,
  lng: 120.53,
};

interface DeliveryMapPickerProps {
  onLocationSelect: (data: {
    lat: number;
    lng: number;
    city: string;
    address: string;
  }) => void;
  onFeeCalculated: (fee: number, distance: number, eta?: string, travelMinutes?: number) => void;
  onCalculating: (calculating: boolean) => void;
  onContinue?: () => void;
  streetAddress: string;
  onStreetAddressChange: (value: string) => void;
  barangay: string;
  onBarangayChange: (value: string) => void;
  landmark: string;
  onLandmarkChange: (value: string) => void;
}

// Decode Google's encoded polyline format
function decodePolyline(encoded: string): { lat: number; lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
  let index = 0, lat = 0, lng = 0;
  
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    
    shift = 0; result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

export function DeliveryMapPicker({
  onLocationSelect,
  onFeeCalculated,
  onCalculating,
  onContinue,
  streetAddress,
  onStreetAddressChange,
  barangay,
  onBarangayChange,
  landmark,
  onLandmarkChange,
}: DeliveryMapPickerProps) {
  const [selectedCity, setSelectedCity] = useState<string>("");
  const [detectedCity, setDetectedCity] = useState<string>("");
  const [isOutsideDeliveryArea, setIsOutsideDeliveryArea] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [calculatedAddress, setCalculatedAddress] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [customerCoords, setCustomerCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationMethod, setLocationMethod] = useState<"pin" | "autocomplete" | null>(null);
  const [hasAutoCalculated, setHasAutoCalculated] = useState(false);
  const [deliveryEta, setDeliveryEta] = useState<string | null>(null);
  const [travelMinutes, setTravelMinutes] = useState<number | null>(null);
  const [routeData, setRouteData] = useState<{
    encodedPolyline: string | null;
    distanceKm: number | null;
    deliveryFee: number | null;
  }>({
    encodedPolyline: null,
    distanceKm: null,
    deliveryFee: null,
  });
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string>("");
  const [googleLoaded, setGoogleLoaded] = useState(false);
  const [apiKey, setApiKey] = useState<string>("");

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const restaurantMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const customerMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const routePolylineRef = useRef<google.maps.Polyline | null>(null);
  const mapsInitializedRef = useRef(false);

  // Get barangays for selected city
  const availableBarangays = selectedCity ? getBarangaysByCity(selectedCity) : [];

  // usePlacesAutocomplete hook - initialized after Google loads
  const {
    ready,
    value,
    suggestions: { status, data },
    setValue,
    clearSuggestions,
    init,
  } = usePlacesAutocomplete({
    requestOptions: {
      locationBias: {
        center: PAMPANGA_CENTER,
        radius: 50000, // 50km radius around Pampanga
      },
      region: "ph",
    },
    debounce: 300,
    initOnMount: false, // We'll init manually after Google loads
  });

  // Fetch Google Maps API key from edge function
  useEffect(() => {
    const fetchApiKey = async () => {
      try {
        console.log("Fetching Google Maps API key from edge function...");
        const { data, error } = await supabase.functions.invoke("get-google-maps-key");
        
        if (error) {
          console.error("Error fetching API key:", error);
          setMapError("Failed to load map configuration. Please refresh.");
          return;
        }
        
        if (data?.apiKey) {
          console.log("API key retrieved successfully");
          setApiKey(data.apiKey);
        } else {
          console.error("No API key returned from edge function");
          setMapError("Map API key not configured. Please contact support.");
        }
      } catch (err) {
        console.error("Failed to fetch API key:", err);
        setMapError("Failed to load map configuration.");
      }
    };
    
    fetchApiKey();
  }, []);

  // Initialize Google Maps API once we have the key
  useEffect(() => {
    if (mapsInitializedRef.current || !apiKey) return;
    
    mapsInitializedRef.current = true;
    
    // Set API options
    setOptions({
      key: apiKey,
      v: "weekly",
      libraries: ["places", "marker"],
    });

    // Pre-load the required libraries
    Promise.all([
      importLibrary("maps"),
      importLibrary("places"),
      importLibrary("marker"),
    ]).then(() => {
      console.log("Google Maps libraries loaded successfully");
      setGoogleLoaded(true);
    }).catch((error) => {
      console.error("Failed to load Google Maps:", error);
      setMapError("Failed to load Google Maps. Please check your API key and enabled APIs.");
      mapsInitializedRef.current = false;
    });
  }, [apiKey]);

  // Initialize usePlacesAutocomplete when Google is loaded
  useEffect(() => {
    if (googleLoaded && init) {
      console.log("Initializing usePlacesAutocomplete...");
      init();
    }
  }, [googleLoaded, init]);

  // Handle address selection from autocomplete
  const handleAddressSelect = async (description: string) => {
    setValue(description, false);
    clearSuggestions();

    try {
      const results = await getGeocode({ address: description });
      const { lat, lng } = await getLatLng(results[0]);
      
      console.log("Address geocoded:", { description, lat, lng });
      
      // Pin user on map
      setCustomerCoords({ lat, lng });
      setLocationMethod("autocomplete");
      
      // Update the street address
      onStreetAddressChange(description);
      
      // Extract city from address components - check multiple component types
      const addressComponents = results[0].address_components;
      const cityComponent = addressComponents.find(
        (c) => c.types.includes("locality") || 
               c.types.includes("administrative_area_level_3") ||
               c.types.includes("administrative_area_level_2")
      );
      
      if (cityComponent) {
        const cityName = cityComponent.long_name;
        setDetectedCity(cityName);
        
        // Check if it matches allowed delivery cities
        const matchedCity = ALLOWED_CITIES.find(
          (c) => cityName.toLowerCase().includes(c.toLowerCase()) || 
                 c.toLowerCase().includes(cityName.toLowerCase())
        );
        
        if (matchedCity) {
          setSelectedCity(matchedCity);
          setIsOutsideDeliveryArea(false);
          
          // Try to auto-detect barangay for this city
          const barangaysForCity = getBarangaysByCity(matchedCity);
          const barangayComponent = addressComponents.find(
            (c) => c.types.includes("sublocality") || c.types.includes("sublocality_level_1")
          );
          if (barangayComponent) {
            const brgyName = barangayComponent.long_name;
            const matchedBarangay = barangaysForCity.find(
              (b) => b.name.toLowerCase().includes(brgyName.toLowerCase()) || 
                     brgyName.toLowerCase().includes(b.name.toLowerCase())
            );
            if (matchedBarangay) {
              onBarangayChange(matchedBarangay.name);
            }
          }
          
          toast.success("Location found! Please confirm your barangay.");
        } else {
          // City is outside delivery area
          setSelectedCity("");
          setIsOutsideDeliveryArea(true);
          onBarangayChange("");
          toast.error(`Sorry, we don't deliver to ${cityName}. You can pick up your order instead.`);
        }
      } else {
        // Could not detect city - let user select manually
        setDetectedCity("");
        setIsOutsideDeliveryArea(false);
        toast.info("Location found! Please select your city to continue.");
      }
      
      // Reset route data since location changed
      setRouteData({ encodedPolyline: null, distanceKm: null, deliveryFee: null });
      setDeliveryEta(null);
      setTravelMinutes(null);
      onFeeCalculated(0, 0);
      
    } catch (error) {
      console.error("Error geocoding address:", error);
      toast.error("Could not find that address. Please try again.");
    }
  };

  // Handle marker drag end
  const handleMarkerDragEnd = useCallback((position: google.maps.LatLng | null) => {
    if (!position) return;
    setCustomerCoords({ lat: position.lat(), lng: position.lng() });
    setLocationMethod("pin");
    setRouteData({ encodedPolyline: null, distanceKm: null, deliveryFee: null });
    setDeliveryEta(null);
    setTravelMinutes(null);
    onFeeCalculated(0, 0);
    setCalculatedAddress("");
  }, [onFeeCalculated]);

  const handleCityChange = (city: string) => {
    setSelectedCity(city);
    onBarangayChange("");
    setHasAutoCalculated(false);
    setCalculatedAddress("");
    setErrorMessage("");
    setRouteData({ encodedPolyline: null, distanceKm: null, deliveryFee: null });
    setDeliveryEta(null);
    setTravelMinutes(null);
    onFeeCalculated(0, 0);
  };

  const handleBarangayChange = (brgyName: string) => {
    onBarangayChange(brgyName);
    setCalculatedAddress("");
    setHasAutoCalculated(false);
    setErrorMessage("");
    setRouteData({ encodedPolyline: null, distanceKm: null, deliveryFee: null });
    setDeliveryEta(null);
    setTravelMinutes(null);
    onFeeCalculated(0, 0);
  };

  // Initialize Google Map - show immediately with restaurant location
  useEffect(() => {
    if (!googleLoaded || !mapContainerRef.current) return;

    const initMap = async () => {
      try {
        // Create map centered on restaurant if no customer coords
        const center = customerCoords || RESTAURANT_COORDS;
        
        if (!mapRef.current) {
          mapRef.current = new google.maps.Map(mapContainerRef.current!, {
            center,
            zoom: customerCoords ? 16 : 13,
            mapId: "DELIVERY_MAP",
            disableDefaultUI: false,
            zoomControl: true,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
          });
          setMapLoaded(true);
          console.log("Map initialized");
        }

        const map = mapRef.current;

        // Create restaurant marker
        if (!restaurantMarkerRef.current) {
          const restaurantContent = document.createElement("div");
          restaurantContent.innerHTML = `
            <div style="background: #ef4444; color: white; padding: 6px 10px; border-radius: 8px; font-size: 12px; font-weight: bold; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">
              🍖 American Ribs & Wings
            </div>
          `;
          restaurantMarkerRef.current = new google.maps.marker.AdvancedMarkerElement({
            map,
            position: RESTAURANT_COORDS,
            content: restaurantContent,
            title: "American Ribs And Wings - Floridablanca",
          });
        }

        // Create or update draggable customer marker only when we have coords
        if (customerCoords) {
          if (!customerMarkerRef.current) {
            const customerContent = document.createElement("div");
            customerContent.innerHTML = `
              <div style="background: #3b82f6; color: white; padding: 8px 12px; border-radius: 8px; font-size: 13px; font-weight: bold; white-space: nowrap; box-shadow: 0 3px 10px rgba(59,130,246,0.5); cursor: grab; display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 16px;">📍</span>
                <span>Your Location</span>
              </div>
            `;
            customerMarkerRef.current = new google.maps.marker.AdvancedMarkerElement({
              map,
              position: { lat: customerCoords.lat, lng: customerCoords.lng },
              content: customerContent,
              gmpDraggable: true,
              title: "Drag to your exact delivery location",
            });

            customerMarkerRef.current.addListener("dragend", () => {
              const pos = customerMarkerRef.current?.position;
              if (pos) {
                const latLng = new google.maps.LatLng(
                  typeof pos.lat === 'function' ? pos.lat() : pos.lat as number,
                  typeof pos.lng === 'function' ? pos.lng() : pos.lng as number
                );
                handleMarkerDragEnd(latLng);
              }
            });
          } else {
            customerMarkerRef.current.position = { lat: customerCoords.lat, lng: customerCoords.lng };
          }

          // Draw route polyline if available
          if (routeData.encodedPolyline) {
            if (routePolylineRef.current) {
              routePolylineRef.current.setMap(null);
            }
            
            const decodedPath = decodePolyline(routeData.encodedPolyline);
            routePolylineRef.current = new google.maps.Polyline({
              path: decodedPath,
              geodesic: true,
              strokeColor: "#3b82f6",
              strokeOpacity: 0.9,
              strokeWeight: 5,
              map,
            });

            // Fit bounds to show both markers and route
            const bounds = new google.maps.LatLngBounds();
            bounds.extend(RESTAURANT_COORDS);
            bounds.extend({ lat: customerCoords.lat, lng: customerCoords.lng });
            map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
          } else {
            // Pan to customer location
            map.panTo({ lat: customerCoords.lat, lng: customerCoords.lng });
            map.setZoom(16);
          }
        }

      } catch (error) {
        console.error("Error initializing Google Map:", error);
        setMapError("Failed to load map. Please refresh the page.");
      }
    };

    initMap();
  }, [googleLoaded, customerCoords, routeData.encodedPolyline, handleMarkerDragEnd]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
      }
    };
  }, []);

  // Calculate delivery fee function
  const calculateDeliveryFee = async () => {
    if (!customerCoords) {
      toast.error("Please find your location first using the search");
      return;
    }

    if (!selectedCity) {
      toast.error("Please select your delivery city");
      return;
    }

    if (!barangay) {
      toast.error("Please select your barangay");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");
    onCalculating(true);

    try {
      console.log("Calculating delivery fee for:", {
        city: selectedCity,
        barangay,
        streetAddress,
        customerCoords,
      });

      const { data, error } = await supabase.functions.invoke("calculate-delivery-fee", {
        body: {
          city: selectedCity,
          barangay: barangay,
          streetAddress: streetAddress.trim() || "N/A",
          landmark: landmark.trim(),
          customerLat: customerCoords.lat,
          customerLng: customerCoords.lng,
        },
      });

      if (error) throw error;

      if (data.error) {
        setErrorMessage(data.error);
        toast.error(data.error);
        setRouteData({ encodedPolyline: null, distanceKm: null, deliveryFee: null });
        return;
      }

      console.log("Delivery fee response:", data);

      const displayAddress = streetAddress.trim() 
        ? `${streetAddress}, ${barangay}, ${selectedCity}`
        : `${barangay}, ${selectedCity}`;
      
      setCalculatedAddress(displayAddress);
      setDeliveryEta(data.etaRange);
      setTravelMinutes(data.travelMinutes);
      onFeeCalculated(data.deliveryFee, data.distanceKm, data.etaRange, data.travelMinutes);
      onLocationSelect({
        lat: customerCoords.lat,
        lng: customerCoords.lng,
        city: selectedCity,
        address: displayAddress,
      });

      setRouteData({
        encodedPolyline: data.encodedPolyline || null,
        distanceKm: data.distanceKm,
        deliveryFee: data.deliveryFee,
      });

      // Show billable km in toast for transparency
      toast.success(`Delivery fee: ₱${data.deliveryFee} (${data.billableKm} km billed) • ETA: ${data.etaRange}`);
    } catch (error) {
      console.error("Error calculating delivery:", error);
      setErrorMessage("Failed to calculate delivery fee. Please try again.");
      toast.error("Failed to calculate delivery fee");
    } finally {
      setIsLoading(false);
      onCalculating(false);
    }
  };

  // Auto-calculate delivery fee when all required data is available
  useEffect(() => {
    if (
      customerCoords &&
      selectedCity &&
      barangay &&
      !isOutsideDeliveryArea &&
      !hasAutoCalculated &&
      !isLoading
    ) {
      console.log("Auto-calculating delivery fee...");
      setHasAutoCalculated(true);
      calculateDeliveryFee();
    }
  }, [customerCoords, selectedCity, barangay, isOutsideDeliveryArea, hasAutoCalculated, isLoading]);

  // Debounced recalculation when landmark changes
  useEffect(() => {
    if (!landmark || !customerCoords || !selectedCity || !barangay || isOutsideDeliveryArea) return;
    if (!hasAutoCalculated) return; // Only recalculate if we've already calculated once

    const timeoutId = setTimeout(() => {
      console.log("Recalculating due to landmark change...");
      calculateDeliveryFee();
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [landmark]);

  return (
    <div className="space-y-4">
      {/* STEP 1: Search Address */}
      <div className="space-y-3 p-4 bg-muted/30 rounded-lg border border-border">
        <Label className="text-base font-semibold flex items-center gap-2">
          <Search className="h-4 w-4" />
          Find Your Delivery Location
        </Label>
        
        {/* Address Search with React-controlled suggestions */}
        <div className="relative">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Type your address (e.g., 123 Main St, Floridablanca)"
            disabled={!ready}
            className="pr-10"
          />
          {!ready && googleLoaded && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
          
          {/* Clickable suggestions dropdown - INSIDE React with high z-index */}
          {status === "OK" && data.length > 0 && (
            <ul className="absolute z-[9999] w-full bg-background border border-border rounded-md shadow-lg mt-1 max-h-60 overflow-auto">
              {data.map(({ place_id, description }) => (
                <li
                  key={place_id}
                  onClick={() => handleAddressSelect(description)}
                  className="p-3 hover:bg-muted cursor-pointer text-sm border-b border-border last:border-b-0 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <span>{description}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Search your address above, then confirm your details below
        </p>
      </div>

      {/* Map Error */}
      {mapError && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{mapError}</span>
        </div>
      )}

      {/* STEP 2: City, Barangay, Landmark - Show after location is found */}
      {customerCoords && (
        <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-border">
          <Label className="text-base font-semibold">Confirm Your Area</Label>
          
          {/* Outside Delivery Area Warning */}
          {isOutsideDeliveryArea && detectedCity && (
            <div className="flex items-start gap-2 text-sm bg-destructive/10 text-destructive p-3 rounded-lg border border-destructive/20">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Cannot deliver to {detectedCity}</p>
                <p className="text-xs mt-1">We only deliver to Floridablanca, Lubao, Guagua, and Porac. You can pick up your order at our restaurant instead.</p>
              </div>
            </div>
          )}
          
          {/* City - Auto-detected or Manual Selection */}
          <div className="space-y-2">
            <Label>Delivery City *</Label>
            {detectedCity && !isOutsideDeliveryArea ? (
              // Show detected city as confirmation
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{selectedCity || detectedCity}</span>
                  <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded">Auto-detected</span>
                </div>
              </div>
            ) : !isOutsideDeliveryArea ? (
              // Manual selection if not detected
              <Select value={selectedCity} onValueChange={handleCityChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select your city" />
                </SelectTrigger>
                <SelectContent>
                  {ALLOWED_CITIES.map((city) => (
                    <SelectItem key={city} value={city}>
                      {city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {!isOutsideDeliveryArea && (
              <p className="text-xs text-muted-foreground">
                We deliver to Floridablanca, Lubao, Guagua, and Porac only
              </p>
            )}
          </div>

          {/* Barangay Dropdown */}
          {selectedCity && !isOutsideDeliveryArea && (
            <div className="space-y-2">
              <Label>Barangay *</Label>
              <Select value={barangay} onValueChange={handleBarangayChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select your barangay" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {availableBarangays.map((brgy) => (
                    <SelectItem key={brgy.name} value={brgy.name}>
                      {brgy.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {availableBarangays.length} barangays in {selectedCity}
              </p>
            </div>
          )}

          {/* Landmark Input */}
          {selectedCity && barangay && !isOutsideDeliveryArea && (
            <div className="space-y-2">
              <Label>Landmark or Additional info</Label>
              <Input
                value={landmark}
                onChange={(e) => onLandmarkChange(e.target.value)}
                placeholder="Near school, church, store, etc."
              />
            </div>
          )}

          {/* Street Address (optional) */}
          {selectedCity && barangay && !isOutsideDeliveryArea && (
            <div className="space-y-2">
              <Label>Street Address (optional)</Label>
              <Input
                value={streetAddress}
                onChange={(e) => onStreetAddressChange(e.target.value)}
                placeholder="123 Main Street"
              />
            </div>
          )}
        </div>
      )}

      {/* STEP 3: Interactive Map - Always visible once Google is loaded */}
      {googleLoaded && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Delivery Location Map</Label>
            {routeData.distanceKm && routeData.deliveryFee && (
              <span className="text-sm font-bold text-primary bg-primary/10 px-2 py-1 rounded">
                {routeData.distanceKm} km · ₱{routeData.deliveryFee}
              </span>
            )}
          </div>
          <div
            ref={mapContainerRef}
            className="w-full h-[280px] rounded-lg overflow-hidden border-2 border-border bg-muted"
            style={{ minHeight: "280px" }}
          />
          
          {/* Location Method Indicator */}
          {locationMethod && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded-lg">
              <GripVertical className="h-3 w-3 flex-shrink-0" />
              <span>
                {locationMethod === "pin" && "✋ Pin adjusted manually • "}
                {locationMethod === "autocomplete" && "🔍 Address from search • "}
                Drag the blue pin to fine-tune your exact location
              </span>
            </div>
          )}
        </div>
      )}

      {!googleLoaded && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading map...
        </div>
      )}

      {/* Loading indicator for initial calculation */}
      {customerCoords && selectedCity && barangay && !isOutsideDeliveryArea && routeData.deliveryFee === null && isLoading && (
        <div className="flex items-center justify-center gap-2 p-3 bg-muted rounded-lg">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-sm">Calculating delivery fee...</span>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* STEP 4: Delivery Hero Card - After calculation */}
      {calculatedAddress && routeData.deliveryFee !== null && routeData.distanceKm !== null && deliveryEta && (
        <DeliveryHeroCard 
          distance={routeData.distanceKm} 
          fee={routeData.deliveryFee} 
          eta={deliveryEta} 
          travelMinutes={travelMinutes || 0} 
        />
      )}

      {/* STEP 5: Action Buttons - Side by side */}
      {customerCoords && selectedCity && barangay && !isOutsideDeliveryArea && routeData.deliveryFee !== null && (
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => {
              setHasAutoCalculated(true);
              calculateDeliveryFee();
            }}
            disabled={isLoading}
            variant="outline"
            className="flex-1"
            size="sm"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Recalculating...
              </>
            ) : (
              <>
                <Calculator className="h-4 w-4 mr-2" />
                Recalculate
              </>
            )}
          </Button>
          
          {onContinue && (
            <Button
              type="button"
              onClick={onContinue}
              disabled={isLoading}
              className="flex-1"
              size="sm"
            >
              Continue
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
