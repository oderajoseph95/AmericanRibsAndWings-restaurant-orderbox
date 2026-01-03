import { useState } from "react";
import { Loader2, MapPin, AlertCircle, Calculator } from "lucide-react";
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

// Allowed delivery cities
const ALLOWED_CITIES = ["Floridablanca", "Lubao", "Guagua", "Porac"];

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

  const handleCityChange = (city: string) => {
    setSelectedCity(city);
    setCalculatedAddress("");
    setErrorMessage("");
    onFeeCalculated(0, 0);
  };

  const calculateDeliveryFee = async () => {
    if (!selectedCity) {
      toast.error("Please select a city");
      return;
    }

    if (!barangay.trim()) {
      toast.error("Please enter your barangay");
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
      const { data, error } = await supabase.functions.invoke('calculate-delivery-fee', {
        body: {
          city: selectedCity,
          barangay: barangay.trim(),
          streetAddress: streetAddress.trim(),
          landmark: landmark.trim(),
        },
      });

      if (error) throw error;

      if (data.error) {
        setErrorMessage(data.error);
        toast.error(data.error);
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
          {/* Barangay */}
          <div className="space-y-2">
            <Label>Barangay *</Label>
            <Input
              placeholder="e.g., Brgy. San Jose, Brgy. Mawacat"
              value={barangay}
              onChange={(e) => onBarangayChange(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Enter your barangay for accurate location
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
            disabled={isLoading || !barangay.trim() || !streetAddress.trim()}
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
                <p className="font-medium text-green-700 dark:text-green-400">Location Found</p>
                <p className="text-green-600 dark:text-green-500">
                  {calculatedAddress}
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
          ) : (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-amber-700 dark:text-amber-400">Delivery Fee Required</p>
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
          <p className="text-sm text-muted-foreground">
            Select a city to continue
          </p>
        </div>
      )}
    </div>
  );
}
