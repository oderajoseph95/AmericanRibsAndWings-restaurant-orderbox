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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BARANGAYS, ALLOWED_CITIES, getBarangaysByCity, findBarangay, type Barangay } from "@/data/barangays";

// Exact restaurant coordinates (American Ribs And Wings - Floridablanca)
const RESTAURANT_COORDS = {
  lat: 14.972683712714007,
  lng: 120.53207910676976,
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
  const [locationMethod, setLocationMethod] = useState<"barangay" | "gps" | "pin">("barangay");
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

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const restaurantMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const customerMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const routePolylineRef = useRef<google.maps.Polyline | null>(null);
  const mapsInitializedRef = useRef(false);

  // Get barangays for selected city
  const availableBarangays = selectedCity ? getBarangaysByCity(selectedCity) : [];

  const handleCityChange = (city: string) => {
    setSelectedCity(city);
    onBarangayChange("");
    setCalculatedAddress("");
    setErrorMessage("");
    setCustomerCoords(null);
    setLocationMethod("barangay");
    setRouteData({ encodedPolyline: null, distanceKm: null, deliveryFee: null });
    onFeeCalculated(0, 0);
  };

  const handleBarangayChange = (brgyName: string) => {
    onBarangayChange(brgyName);
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

  // Initialize Google Maps
  useEffect(() => {
    if (!mapContainerRef.current || !customerCoords || !selectedCity || !barangay) return;

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error("Google Maps API key not configured");
      setMapError("Map configuration error. Please contact support.");
      return;
    }

    const initMap = async () => {
      try {
        // Initialize Google Maps API only once
        if (!mapsInitializedRef.current) {
          setOptions({
            key: apiKey,
            v: "weekly",
            libraries: ["marker"],
          });
          mapsInitializedRef.current = true;
        }

        // Import required libraries
        await importLibrary("maps");
        await importLibrary("marker");

        // Create map if not exists
        if (!mapRef.current) {
          mapRef.current = new google.maps.Map(mapContainerRef.current!, {
            center: { lat: customerCoords.lat, lng: customerCoords.lng },
            zoom: 15,
            mapId: "DELIVERY_MAP",
            disableDefaultUI: false,
            zoomControl: true,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
          });
          setMapLoaded(true);
        }

        const map = mapRef.current;

        // Create restaurant marker
        if (!restaurantMarkerRef.current) {
          const restaurantContent = document.createElement("div");
          restaurantContent.innerHTML = `
            <div style="background: #ef4444; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
              🍖 American Ribs
            </div>
          `;
          restaurantMarkerRef.current = new google.maps.marker.AdvancedMarkerElement({
            map,
            position: RESTAURANT_COORDS,
            content: restaurantContent,
            title: "American Ribs And Wings",
          });
        }

        // Create or update draggable customer marker
        if (!customerMarkerRef.current) {
          const customerContent = document.createElement("div");
          customerContent.innerHTML = `
            <div style="background: #3b82f6; color: white; padding: 6px 10px; border-radius: 6px; font-size: 12px; font-weight: bold; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.4); cursor: grab; display: flex; align-items: center; gap: 4px;">
              <span style="font-size: 14px;">📍</span>
              <span>Drag to adjust</span>
            </div>
          `;
          customerMarkerRef.current = new google.maps.marker.AdvancedMarkerElement({
            map,
            position: { lat: customerCoords.lat, lng: customerCoords.lng },
            content: customerContent,
            gmpDraggable: true,
            title: "Your delivery location",
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
            strokeOpacity: 0.8,
            strokeWeight: 4,
            map,
          });
        }

        // Pan to customer location
        map.panTo({ lat: customerCoords.lat, lng: customerCoords.lng });

      } catch (error) {
        console.error("Error initializing Google Maps:", error);
        setMapError("Failed to load map. Please refresh the page.");
      }
    };

    initMap();
  }, [customerCoords, barangay, selectedCity, routeData.encodedPolyline, handleMarkerDragEnd]);

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
      toast.error("Please select your location on the map");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");
    onCalculating(true);

    try {
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

      toast.success(`Delivery fee: ₱${data.deliveryFee} (${data.distanceKm} km)`);
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
                    Use My Location (GPS)
                  </>
                )}
              </Button>

              {/* Location Method Indicator */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <GripVertical className="h-3 w-3" />
                <span>
                  {locationMethod === "gps" && "Using GPS location • "}
                  {locationMethod === "pin" && "Pin adjusted manually • "}
                  {locationMethod === "barangay" && "Using barangay center • "}
                  Drag the blue pin to your exact location
                </span>
              </div>

              {/* Map Error */}
              {mapError && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                  <AlertCircle className="h-4 w-4" />
                  {mapError}
                </div>
              )}

              {/* Interactive Map */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Your Location</Label>
                  {routeData.distanceKm && routeData.deliveryFee && (
                    <span className="text-sm font-semibold text-primary">
                      {routeData.distanceKm} km · ₱{routeData.deliveryFee}
                    </span>
                  )}
                </div>
                <div
                  ref={mapContainerRef}
                  className="w-full h-[250px] rounded-lg overflow-hidden border bg-muted"
                />
              </div>
            </div>
          )}

          {/* Street Address */}
          <div className="space-y-2">
            <Label>House #/Street Address (for rider)</Label>
            <Input
              placeholder="e.g., 123 Rizal St, Purok 3"
              value={streetAddress}
              onChange={(e) => onStreetAddressChange(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              This helps the rider find you. Distance is based on pin location.
            </p>
          </div>

          {/* Landmark */}
          <div className="space-y-2">
            <Label>Landmark (optional)</Label>
            <Input
              placeholder="Near school, beside sari-sari store, etc."
              value={landmark}
              onChange={(e) => onLandmarkChange(e.target.value)}
            />
          </div>

          {/* Calculate Button */}
          <Button
            type="button"
            onClick={calculateDeliveryFee}
            disabled={isLoading || !barangay || !customerCoords}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Calculating...
              </>
            ) : (
              <>
                <Calculator className="h-4 w-4 mr-2" />
                Calculate Delivery Fee
              </>
            )}
          </Button>

          {/* Status Messages */}
          {calculatedAddress && routeData.deliveryFee && (
            <div className="flex items-start gap-2 text-sm text-green-600 bg-green-50 p-3 rounded-lg">
              <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Delivery fee confirmed: ₱{routeData.deliveryFee}</p>
                <p className="text-xs text-green-600/80">{calculatedAddress} ({routeData.distanceKm} km)</p>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p>{errorMessage}</p>
            </div>
          )}

          {!calculatedAddress && !errorMessage && customerCoords && (
            <p className="text-xs text-muted-foreground text-center">
              Adjust pin if needed, then click "Calculate Delivery Fee"
            </p>
          )}

          {!customerCoords && barangay && (
            <p className="text-xs text-amber-600 text-center">
              Select a barangay to see the map
            </p>
          )}
        </>
      )}
    </div>
  );
}
