import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, MapPin, AlertCircle, Calculator, Navigation, GripVertical } from "lucide-react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
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

// Restaurant coordinates (American Ribs And Wings - Floridablanca)
const RESTAURANT_COORDS = {
  lat: 14.9747,
  lng: 120.5373,
};

interface RouteGeometry {
  type: "LineString";
  coordinates: [number, number][];
}

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
    geometry: RouteGeometry | null;
    distanceKm: number | null;
    deliveryFee: number | null;
  }>({
    geometry: null,
    distanceKm: null,
    deliveryFee: null,
  });

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const restaurantMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const customerMarkerRef = useRef<mapboxgl.Marker | null>(null);

  // Get barangays for selected city
  const availableBarangays = selectedCity ? getBarangaysByCity(selectedCity) : [];

  const handleCityChange = (city: string) => {
    setSelectedCity(city);
    onBarangayChange("");
    setCalculatedAddress("");
    setErrorMessage("");
    setCustomerCoords(null);
    setLocationMethod("barangay");
    setRouteData({ geometry: null, distanceKm: null, deliveryFee: null });
    onFeeCalculated(0, 0);
  };

  const handleBarangayChange = (brgyName: string) => {
    onBarangayChange(brgyName);
    setCalculatedAddress("");
    setErrorMessage("");
    setRouteData({ geometry: null, distanceKm: null, deliveryFee: null });
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
    // Expanded bounds for all of Pampanga province
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
        
        // Validate GPS coordinates are within Pampanga
        if (!isInPampangaArea(latitude, longitude)) {
          setIsGettingLocation(false);
          toast.error("Your GPS location is outside Pampanga. Please drag the blue pin to your delivery location.");
          return; // Keep using barangay center coordinates
        }
        
        setCustomerCoords({ lat: latitude, lng: longitude });
        setLocationMethod("gps");
        setIsGettingLocation(false);
        toast.success("Location found! You can adjust the pin if needed.");
        
        // Clear previous calculation
        setRouteData({ geometry: null, distanceKm: null, deliveryFee: null });
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
  const handleMarkerDragEnd = useCallback((lngLat: mapboxgl.LngLat) => {
    setCustomerCoords({ lat: lngLat.lat, lng: lngLat.lng });
    setLocationMethod("pin");
    // Clear previous calculation when pin is moved
    setRouteData({ geometry: null, distanceKm: null, deliveryFee: null });
    onFeeCalculated(0, 0);
    setCalculatedAddress("");
  }, [onFeeCalculated]);

  // Initialize/update map when barangay is selected or coords change
  useEffect(() => {
    if (!mapContainerRef.current || !customerCoords || !selectedCity || !barangay) return;

    const mapboxToken = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN;
    if (!mapboxToken) {
      console.error("Mapbox public token not configured");
      setErrorMessage("Map configuration error. Please contact support.");
      return;
    }

    mapboxgl.accessToken = mapboxToken;

    // Create map if not exists
    if (!mapRef.current) {
      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [customerCoords.lng, customerCoords.lat],
        zoom: 15,
      });

      mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");
    }

    const map = mapRef.current;

    const setupMap = () => {
      // Update or create restaurant marker
      if (restaurantMarkerRef.current) {
        restaurantMarkerRef.current.setLngLat([RESTAURANT_COORDS.lng, RESTAURANT_COORDS.lat]);
      } else {
        const restaurantEl = document.createElement("div");
        restaurantEl.innerHTML = `
          <div style="background: #ef4444; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
            🍖 American Ribs
          </div>
        `;
        restaurantMarkerRef.current = new mapboxgl.Marker({ element: restaurantEl })
          .setLngLat([RESTAURANT_COORDS.lng, RESTAURANT_COORDS.lat])
          .addTo(map);
      }

      // Update or create draggable customer marker
      if (customerMarkerRef.current) {
        customerMarkerRef.current.setLngLat([customerCoords.lng, customerCoords.lat]);
      } else {
        const customerEl = document.createElement("div");
        customerEl.innerHTML = `
          <div style="background: #3b82f6; color: white; padding: 6px 10px; border-radius: 6px; font-size: 12px; font-weight: bold; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.4); cursor: grab; display: flex; align-items: center; gap: 4px;">
            <span style="font-size: 14px;">📍</span>
            <span>Drag to adjust</span>
          </div>
        `;
        customerMarkerRef.current = new mapboxgl.Marker({ 
          element: customerEl,
          draggable: true,
        })
          .setLngLat([customerCoords.lng, customerCoords.lat])
          .addTo(map);

        // Add drag end listener
        customerMarkerRef.current.on("dragend", () => {
          const lngLat = customerMarkerRef.current?.getLngLat();
          if (lngLat) {
            handleMarkerDragEnd(lngLat);
          }
        });
      }

      // Draw route if available
      if (routeData.geometry) {
        if (map.getLayer("route")) map.removeLayer("route");
        if (map.getSource("route")) map.removeSource("route");

        map.addSource("route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: routeData.geometry,
          },
        });

        map.addLayer({
          id: "route",
          type: "line",
          source: "route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#3b82f6",
            "line-width": 4,
            "line-opacity": 0.8,
          },
        });
      }

      // Center map on customer location
      map.flyTo({
        center: [customerCoords.lng, customerCoords.lat],
        zoom: 15,
        duration: 1000,
      });
    };

    if (map.loaded()) {
      setupMap();
    } else {
      map.on("load", setupMap);
    }
  }, [customerCoords, barangay, selectedCity, routeData.geometry, handleMarkerDragEnd]);

  // Cleanup map on unmount
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
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
          // Send coordinates directly - bypass geocoding!
          customerLat: customerCoords.lat,
          customerLng: customerCoords.lng,
        },
      });

      if (error) throw error;

      if (data.error) {
        setErrorMessage(data.error);
        toast.error(data.error);
        setRouteData({ geometry: null, distanceKm: null, deliveryFee: null });
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
        geometry: data.routeGeometry || null,
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

          {/* Map and Location Controls - Show after barangay selection */}
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
                  className="w-full h-[250px] rounded-lg overflow-hidden border"
                />
              </div>
            </div>
          )}

          {/* Street Address (for rider reference) */}
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

          {/* Status Display */}
          {calculatedAddress ? (
            <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
              <MapPin className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-green-700 dark:text-green-400">
                  Delivery Fee Confirmed
                </p>
                <p className="text-green-600 dark:text-green-500">{calculatedAddress}</p>
                <p className="text-green-600 dark:text-green-500 font-medium">
                  ₱{routeData.deliveryFee} • {routeData.distanceKm} km
                </p>
              </div>
            </div>
          ) : errorMessage ? (
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-red-700 dark:text-red-400">Location Error</p>
                <p className="text-red-600 dark:text-red-500">{errorMessage}</p>
              </div>
            </div>
          ) : customerCoords ? (
            <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
              <MapPin className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-blue-700 dark:text-blue-400">
                  Pin Your Location
                </p>
                <p className="text-blue-600 dark:text-blue-500">
                  Drag the blue pin to your exact location, then click "Calculate Delivery Fee"
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-amber-700 dark:text-amber-400">
                  Select Your Barangay
                </p>
                <p className="text-amber-600 dark:text-amber-500">
                  Choose your barangay to see the map
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {!selectedCity && (
        <div className="flex items-center justify-center h-[120px] border-2 border-dashed rounded-lg bg-muted/30">
          <p className="text-sm text-muted-foreground">Select a city to continue</p>
        </div>
      )}
    </div>
  );
}
