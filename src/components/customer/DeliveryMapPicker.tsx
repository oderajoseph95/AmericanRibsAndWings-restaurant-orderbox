import { useState, useEffect, useRef } from "react";
import { Loader2, MapPin, AlertCircle, Calculator } from "lucide-react";
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
import { BARANGAYS, ALLOWED_CITIES, getBarangaysByCity } from "@/data/barangays";

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
  const [calculatedAddress, setCalculatedAddress] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [routeData, setRouteData] = useState<{
    geometry: RouteGeometry | null;
    customerCoords: { lat: number; lng: number } | null;
    distanceKm: number | null;
    deliveryFee: number | null;
  }>({
    geometry: null,
    customerCoords: null,
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
    onBarangayChange(""); // Reset barangay when city changes
    setCalculatedAddress("");
    setErrorMessage("");
    setRouteData({
      geometry: null,
      customerCoords: null,
      distanceKm: null,
      deliveryFee: null,
    });
    onFeeCalculated(0, 0);
  };

  const handleBarangayChange = (brgy: string) => {
    onBarangayChange(brgy);
    setCalculatedAddress("");
    setErrorMessage("");
    setRouteData({
      geometry: null,
      customerCoords: null,
      distanceKm: null,
      deliveryFee: null,
    });
    onFeeCalculated(0, 0);
  };

  // Initialize map when route data is available
  useEffect(() => {
    if (!mapContainerRef.current || !routeData.customerCoords) return;

    // Get Mapbox token from environment
    const mapboxToken = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN;
    if (!mapboxToken) {
      console.error("Mapbox public token not configured");
      return;
    }

    mapboxgl.accessToken = mapboxToken;

    // Create map if not exists
    if (!mapRef.current) {
      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [RESTAURANT_COORDS.lng, RESTAURANT_COORDS.lat],
        zoom: 12,
      });

      mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");
    }

    const map = mapRef.current;

    // Wait for map to load
    const setupMap = () => {
      // Remove existing markers
      if (restaurantMarkerRef.current) {
        restaurantMarkerRef.current.remove();
      }
      if (customerMarkerRef.current) {
        customerMarkerRef.current.remove();
      }

      // Add restaurant marker (red)
      const restaurantEl = document.createElement("div");
      restaurantEl.className = "restaurant-marker";
      restaurantEl.innerHTML = `
        <div style="background: #ef4444; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
          🍖 American Ribs
        </div>
      `;
      restaurantMarkerRef.current = new mapboxgl.Marker({ element: restaurantEl })
        .setLngLat([RESTAURANT_COORDS.lng, RESTAURANT_COORDS.lat])
        .addTo(map);

      // Add customer marker (blue)
      const customerEl = document.createElement("div");
      customerEl.className = "customer-marker";
      customerEl.innerHTML = `
        <div style="background: #3b82f6; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
          📍 Delivery Location
        </div>
      `;
      customerMarkerRef.current = new mapboxgl.Marker({ element: customerEl })
        .setLngLat([routeData.customerCoords!.lng, routeData.customerCoords!.lat])
        .addTo(map);

      // Add route line if available
      if (routeData.geometry) {
        // Remove existing route layer and source
        if (map.getLayer("route")) {
          map.removeLayer("route");
        }
        if (map.getSource("route")) {
          map.removeSource("route");
        }

        // Add route source and layer
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
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "#3b82f6",
            "line-width": 4,
            "line-opacity": 0.8,
          },
        });
      }

      // Fit bounds to show both markers
      const bounds = new mapboxgl.LngLatBounds()
        .extend([RESTAURANT_COORDS.lng, RESTAURANT_COORDS.lat])
        .extend([routeData.customerCoords!.lng, routeData.customerCoords!.lat]);

      map.fitBounds(bounds, {
        padding: 60,
        duration: 1000,
      });
    };

    if (map.loaded()) {
      setupMap();
    } else {
      map.on("load", setupMap);
    }

    return () => {
      // Cleanup on unmount
    };
  }, [routeData.customerCoords, routeData.geometry]);

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

    if (!streetAddress.trim()) {
      toast.error("Please enter your street address");
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
          streetAddress: streetAddress.trim(),
          landmark: landmark.trim(),
        },
      });

      if (error) throw error;

      if (data.error) {
        setErrorMessage(data.error);
        toast.error(data.error);
        setRouteData({
          geometry: null,
          customerCoords: null,
          distanceKm: null,
          deliveryFee: null,
        });
        return;
      }

      setCalculatedAddress(data.geocodedAddress || `${barangay}, ${selectedCity}`);
      onFeeCalculated(data.deliveryFee, data.distanceKm);
      onLocationSelect({
        lat: data.customerCoords.lat,
        lng: data.customerCoords.lng,
        city: selectedCity,
        address: `${streetAddress}, ${barangay}, ${selectedCity}`,
      });

      // Store route data for map
      setRouteData({
        geometry: data.routeGeometry || null,
        customerCoords: data.customerCoords,
        distanceKm: data.distanceKm,
        deliveryFee: data.deliveryFee,
      });

      toast.success(`Delivery fee calculated: ₱${data.deliveryFee} (${data.distanceKm} km)`);
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
                  <SelectItem key={brgy} value={brgy}>
                    {brgy}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {availableBarangays.length} barangays in {selectedCity}
            </p>
          </div>

          {/* Street Address */}
          <div className="space-y-2">
            <Label>House #/Street Address *</Label>
            <Input
              placeholder="e.g., 123 Rizal St, Purok 3"
              value={streetAddress}
              onChange={(e) => onStreetAddressChange(e.target.value)}
            />
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
            disabled={isLoading || !barangay || !streetAddress.trim()}
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

          {/* Visual Route Map */}
          {routeData.customerCoords && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Delivery Route</Label>
                {routeData.distanceKm && routeData.deliveryFee && (
                  <span className="text-sm font-semibold text-primary">
                    {routeData.distanceKm} km · ₱{routeData.deliveryFee}
                  </span>
                )}
              </div>
              <div
                ref={mapContainerRef}
                className="w-full h-[200px] rounded-lg overflow-hidden border"
              />
            </div>
          )}

          {/* Status Display */}
          {calculatedAddress ? (
            <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
              <MapPin className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-green-700 dark:text-green-400">
                  Location Found
                </p>
                <p className="text-green-600 dark:text-green-500">{calculatedAddress}</p>
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
          ) : (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-amber-700 dark:text-amber-400">
                  Delivery Fee Required
                </p>
                <p className="text-amber-600 dark:text-amber-500">
                  Fill in your address and click "Calculate Delivery Fee"
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
