import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, MapPin, AlertCircle, Calculator, Navigation, GripVertical } from "lucide-react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ALLOWED_CITIES, getBarangaysByCity, findBarangay } from "@/data/barangays";

// Exact restaurant coordinates (American Ribs And Wings - Floridablanca)
const RESTAURANT_COORDS = {
  lat: 14.972683712714007,
  lng: 120.53207910676976,
};

// Pampanga bounds for autocomplete bias
const PAMPANGA_BOUNDS = {
  north: 15.3,
  south: 14.8,
  east: 120.8,
  west: 120.3,
};

interface DeliveryMapPickerProps {
  onLocationSelect: (data: {
    lat: number;
    lng: number;
    city: string;
    address: string;
  }) => void;
  onFeeCalculated: (fee: number, distance: number) => void;
  onCalculating: (calculating: boolean) => void;
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
  streetAddress,
  onStreetAddressChange,
  barangay,
  onBarangayChange,
  landmark,
  onLandmarkChange,
}: DeliveryMapPickerProps) {
  const [selectedCity, setSelectedCity] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [calculatedAddress, setCalculatedAddress] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [customerCoords, setCustomerCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationMethod, setLocationMethod] = useState<"barangay" | "gps" | "pin" | "autocomplete">("barangay");
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

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const restaurantMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const customerMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const routePolylineRef = useRef<google.maps.Polyline | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const streetInputRef = useRef<HTMLInputElement>(null);
  const mapsInitializedRef = useRef(false);

  // Get barangays for selected city
  const availableBarangays = selectedCity ? getBarangaysByCity(selectedCity) : [];

  // Initialize Google Maps API once
  useEffect(() => {
    if (mapsInitializedRef.current) return;
    
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error("VITE_GOOGLE_MAPS_API_KEY not configured in .env");
      setMapError("Map API key not configured. Please contact support.");
      return;
    }

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
  }, []);

  // Initialize Places Autocomplete when Google is loaded and input is available
  useEffect(() => {
    if (!googleLoaded || !streetInputRef.current || !selectedCity || !barangay) return;
    if (autocompleteRef.current) return; // Already initialized

    try {
      const autocomplete = new google.maps.places.Autocomplete(streetInputRef.current, {
        componentRestrictions: { country: "ph" },
        fields: ["formatted_address", "geometry", "name", "address_components"],
        bounds: new google.maps.LatLngBounds(
          { lat: PAMPANGA_BOUNDS.south, lng: PAMPANGA_BOUNDS.west },
          { lat: PAMPANGA_BOUNDS.north, lng: PAMPANGA_BOUNDS.east }
        ),
        strictBounds: false,
      });

      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        console.log("Place selected:", place);

        if (place.geometry?.location) {
          const lat = place.geometry.location.lat();
          const lng = place.geometry.location.lng();
          
          // Update coordinates
          setCustomerCoords({ lat, lng });
          setLocationMethod("autocomplete");
          
          // Update street address with the selected place
          const addressText = place.formatted_address || place.name || "";
          onStreetAddressChange(addressText);
          
          // Reset route data since location changed
          setRouteData({ encodedPolyline: null, distanceKm: null, deliveryFee: null });
          onFeeCalculated(0, 0);
          
          toast.success("Address selected! Click 'Calculate Delivery Fee' to continue.");
        } else {
          toast.error("Could not get location for this address. Please try another.");
        }
      });

      autocompleteRef.current = autocomplete;
      console.log("Places Autocomplete initialized");
    } catch (error) {
      console.error("Error initializing autocomplete:", error);
    }
  }, [googleLoaded, selectedCity, barangay, onStreetAddressChange, onFeeCalculated]);

  // Cleanup autocomplete when city/barangay changes
  useEffect(() => {
    return () => {
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
        autocompleteRef.current = null;
      }
    };
  }, [selectedCity, barangay]);

  const handleCityChange = (city: string) => {
    setSelectedCity(city);
    onBarangayChange("");
    onStreetAddressChange("");
    setCalculatedAddress("");
    setErrorMessage("");
    setCustomerCoords(null);
    setLocationMethod("barangay");
    setRouteData({ encodedPolyline: null, distanceKm: null, deliveryFee: null });
    onFeeCalculated(0, 0);
    
    // Reset autocomplete
    if (autocompleteRef.current) {
      google.maps.event.clearInstanceListeners(autocompleteRef.current);
      autocompleteRef.current = null;
    }
  };

  const handleBarangayChange = (brgyName: string) => {
    onBarangayChange(brgyName);
    onStreetAddressChange("");
    setCalculatedAddress("");
    setErrorMessage("");
    setRouteData({ encodedPolyline: null, distanceKm: null, deliveryFee: null });
    onFeeCalculated(0, 0);
    
    // Find barangay coordinates and set as initial customer coords
    const brgy = findBarangay(selectedCity, brgyName);
    if (brgy) {
      setCustomerCoords({ lat: brgy.lat, lng: brgy.lng });
      setLocationMethod("barangay");
    }
    
    // Reset autocomplete for new barangay
    if (autocompleteRef.current) {
      google.maps.event.clearInstanceListeners(autocompleteRef.current);
      autocompleteRef.current = null;
    }
  };

  // Validate coordinates are within Pampanga delivery area
  const isInPampangaArea = (lat: number, lng: number): boolean => {
    return lat >= 14.5 && lat <= 15.5 && lng >= 120.0 && lng <= 121.0;
  };

  // Get user's GPS location
  const handleGetLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }

    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        
        if (!isInPampangaArea(latitude, longitude)) {
          setIsGettingLocation(false);
          toast.error("Your GPS location is outside Pampanga. Please drag the blue pin to your delivery location.");
          return;
        }
        
        setCustomerCoords({ lat: latitude, lng: longitude });
        setLocationMethod("gps");
        setIsGettingLocation(false);
        toast.success("Location found! You can adjust the pin if needed.");
        
        setRouteData({ encodedPolyline: null, distanceKm: null, deliveryFee: null });
        onFeeCalculated(0, 0);
      },
      (error) => {
        setIsGettingLocation(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            toast.error("Location permission denied. Please drag the blue pin to your location.");
            break;
          case error.POSITION_UNAVAILABLE:
            toast.error("Location unavailable. Please drag the blue pin to your location.");
            break;
          case error.TIMEOUT:
            toast.error("Location request timed out. Please try again or drag the pin.");
            break;
          default:
            toast.error("Could not get your location. Please drag the blue pin manually.");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }, [onFeeCalculated]);

  // Handle marker drag end
  const handleMarkerDragEnd = useCallback((position: google.maps.LatLng | null) => {
    if (!position) return;
    setCustomerCoords({ lat: position.lat(), lng: position.lng() });
    setLocationMethod("pin");
    setRouteData({ encodedPolyline: null, distanceKm: null, deliveryFee: null });
    onFeeCalculated(0, 0);
    setCalculatedAddress("");
  }, [onFeeCalculated]);

  // Initialize Google Map when we have coordinates
  useEffect(() => {
    if (!googleLoaded || !mapContainerRef.current || !customerCoords || !selectedCity || !barangay) return;

    const initMap = async () => {
      try {
        // Create map if not exists
        if (!mapRef.current) {
          mapRef.current = new google.maps.Map(mapContainerRef.current!, {
            center: { lat: customerCoords.lat, lng: customerCoords.lng },
            zoom: 16,
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

        // Create or update draggable customer marker
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

      } catch (error) {
        console.error("Error initializing Google Map:", error);
        setMapError("Failed to load map. Please refresh the page.");
      }
    };

    initMap();
  }, [googleLoaded, customerCoords, barangay, selectedCity, routeData.encodedPolyline, handleMarkerDragEnd]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
      }
    };
  }, []);

  const calculateDeliveryFee = async () => {
    if (!selectedCity) {
      toast.error("Please select a city");
      return;
    }

    if (!barangay) {
      toast.error("Please select a barangay");
      return;
    }

    if (!customerCoords) {
      toast.error("Please select your location on the map or use the address search");
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
      onFeeCalculated(data.deliveryFee, data.distanceKm);
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

      toast.success(`Delivery fee: ₱${data.deliveryFee} (${data.distanceKm} km driving distance)`);
    } catch (error) {
      console.error("Error calculating delivery:", error);
      setErrorMessage("Failed to calculate delivery fee. Please try again.");
      toast.error("Failed to calculate delivery fee");
    } finally {
      setIsLoading(false);
      onCalculating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* City Selection */}
      <div className="space-y-2">
        <Label>Delivery City *</Label>
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
        <p className="text-xs text-muted-foreground">
          We deliver to Floridablanca, Lubao, Guagua, and Porac only
        </p>
      </div>

      {selectedCity && (
        <>
          {/* Barangay Dropdown */}
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

          {/* Street Address with Google Places Autocomplete */}
          {barangay && (
            <div className="space-y-2">
              <Label>Street Address (Search)</Label>
              <div className="relative">
                <input
                  ref={streetInputRef}
                  type="text"
                  value={streetAddress}
                  onChange={(e) => onStreetAddressChange(e.target.value)}
                  placeholder="Start typing your street address..."
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Type your address and select from suggestions for accurate location
              </p>
            </div>
          )}

          {/* Map and Location Controls */}
          {barangay && customerCoords && (
            <div className="space-y-3">
              {/* GPS Button */}
              <Button
                type="button"
                variant="outline"
                onClick={handleGetLocation}
                disabled={isGettingLocation}
                className="w-full"
              >
                {isGettingLocation ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Getting your location...
                  </>
                ) : (
                  <>
                    <Navigation className="h-4 w-4 mr-2" />
                    Use My Current Location (GPS)
                  </>
                )}
              </Button>

              {/* Location Method Indicator */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded-lg">
                <GripVertical className="h-3 w-3 flex-shrink-0" />
                <span>
                  {locationMethod === "gps" && "📍 Using GPS location • "}
                  {locationMethod === "pin" && "✋ Pin adjusted manually • "}
                  {locationMethod === "barangay" && "🏘️ Using barangay center • "}
                  {locationMethod === "autocomplete" && "🔍 Address from search • "}
                  You can drag the blue pin to fine-tune your exact location
                </span>
              </div>

              {/* Map Error */}
              {mapError && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{mapError}</span>
                </div>
              )}

              {/* Interactive Map */}
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
                {!googleLoaded && (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading map...
                  </div>
                )}
              </div>

              {/* Landmark Input */}
              <div className="space-y-2">
                <Label>Landmark (Optional)</Label>
                <input
                  type="text"
                  value={landmark}
                  onChange={(e) => onLandmarkChange(e.target.value)}
                  placeholder="Near school, church, store, etc."
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              {/* Calculate Button */}
              <Button
                type="button"
                onClick={calculateDeliveryFee}
                disabled={isLoading || !customerCoords}
                className="w-full"
                size="lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Calculating route...
                  </>
                ) : (
                  <>
                    <Calculator className="h-4 w-4 mr-2" />
                    Calculate Delivery Fee
                  </>
                )}
              </Button>

              {/* Error Message */}
              {errorMessage && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Success Result */}
              {calculatedAddress && routeData.deliveryFee !== null && (
                <div className="bg-primary/5 border border-primary/20 p-4 rounded-lg space-y-2">
                  <div className="flex items-start gap-2">
                    <MapPin className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Delivery Address</p>
                      <p className="text-sm text-muted-foreground">{calculatedAddress}</p>
                      {landmark && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Landmark: {landmark}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-primary/10">
                    <span className="text-sm">Driving Distance:</span>
                    <span className="font-bold">{routeData.distanceKm} km</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Delivery Fee:</span>
                    <span className="font-bold text-lg text-primary">₱{routeData.deliveryFee}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
