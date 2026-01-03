import { useState } from "react";
import { Loader2, MapPin, Navigation, AlertCircle } from "lucide-react";
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

// Allowed delivery cities with their approximate center coordinates
const ALLOWED_CITIES = [
  { name: "Floridablanca", lat: 14.9725, lng: 120.5290 },
  { name: "Lubao", lat: 14.9456, lng: 120.6011 },
  { name: "Guagua", lat: 14.9667, lng: 120.6333 },
  { name: "Porac", lat: 15.0722, lng: 120.5411 },
];

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
  landmark: string;
  onLandmarkChange: (value: string) => void;
}

export function DeliveryMapPicker({
  onLocationSelect,
  onFeeCalculated,
  onCalculating,
  streetAddress,
  onStreetAddressChange,
  landmark,
  onLandmarkChange,
}: DeliveryMapPickerProps) {
  const [selectedCity, setSelectedCity] = useState<string>("");
  const [customerCoords, setCustomerCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geocodedAddress, setGeocodedAddress] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  // Initialize map when city is selected (using simple canvas-based map since we don't have Google Maps API key)
  // We'll use a simpler approach: show coordinates and calculate via edge function

  const handleCityChange = (city: string) => {
    setSelectedCity(city);
    // Reset coordinates when city changes
    setCustomerCoords(null);
    setGeocodedAddress("");
    onFeeCalculated(0, 0);
  };

  const calculateDeliveryFee = async (lat: number, lng: number) => {
    if (!selectedCity) return;

    setIsLoading(true);
    onCalculating(true);

    try {
      const { data, error } = await supabase.functions.invoke('calculate-delivery-fee', {
        body: {
          customerLat: lat,
          customerLng: lng,
          city: selectedCity,
          streetAddress: streetAddress,
          landmark: landmark,
        },
      });

      if (error) throw error;

      if (data.error) {
        console.error("Delivery fee error:", data.error);
        return;
      }

      setGeocodedAddress(`${selectedCity}, Pampanga (${lat.toFixed(5)}, ${lng.toFixed(5)})`);
      onFeeCalculated(data.deliveryFee, data.distanceKm);
      onLocationSelect({
        lat,
        lng,
        city: selectedCity,
        address: `${selectedCity}, Pampanga`,
      });
    } catch (error) {
      console.error("Error calculating delivery:", error);
    } finally {
      setIsLoading(false);
      onCalculating(false);
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    if (!selectedCity) {
      alert("Please select a city first");
      return;
    }

    setIsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setCustomerCoords({ lat: latitude, lng: longitude });
        await calculateDeliveryFee(latitude, longitude);
        setIsLoading(false);
      },
      (error) => {
        console.error("Error getting location:", error);
        alert("Could not get your location. Please enter coordinates manually or try again.");
        setIsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleManualCoordinates = async () => {
    if (!selectedCity) {
      alert("Please select a city first");
      return;
    }

    // Use city center as default
    const city = ALLOWED_CITIES.find(c => c.name === selectedCity);
    if (city) {
      setCustomerCoords({ lat: city.lat, lng: city.lng });
      await calculateDeliveryFee(city.lat, city.lng);
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
              <SelectItem key={city.name} value={city.name}>
                {city.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          We only deliver to Floridablanca, Lubao, Guagua, and Porac
        </p>
      </div>

      {/* Location Selection */}
      {selectedCity && (
        <>
          <div className="space-y-3">
            <Label>Your Location *</Label>
            
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={handleUseCurrentLocation}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Navigation className="h-4 w-4 mr-2" />
                )}
                Use My GPS Location
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={handleManualCoordinates}
                disabled={isLoading}
              >
                Use City Center
              </Button>
            </div>

            {/* Location Status */}
            {customerCoords ? (
              <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
                <MapPin className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-green-700 dark:text-green-400">Location Set</p>
                  <p className="text-green-600 dark:text-green-500">
                    {geocodedAddress || `${customerCoords.lat.toFixed(5)}, ${customerCoords.lng.toFixed(5)}`}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-amber-700 dark:text-amber-400">Location Required</p>
                  <p className="text-amber-600 dark:text-amber-500">
                    Click "Use My GPS Location" to set your delivery location
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Street Address for Rider */}
          <div className="space-y-2">
            <Label>House #/Street Address *</Label>
            <Input
              placeholder="e.g., 123 Rizal St, Purok 3, Brgy. San Jose"
              value={streetAddress}
              onChange={(e) => onStreetAddressChange(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Include your house number, street, purok, and barangay for the rider
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
        </>
      )}

      {!selectedCity && (
        <div className="flex items-center justify-center h-[120px] border-2 border-dashed rounded-lg bg-muted/30">
          <p className="text-sm text-muted-foreground">
            Select a city to continue
          </p>
        </div>
      )}
    </div>
  );
}
