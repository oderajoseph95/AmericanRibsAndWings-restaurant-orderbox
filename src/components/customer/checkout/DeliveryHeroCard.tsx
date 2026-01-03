import { MapPin, Coins, Clock, Bike } from "lucide-react";

interface DeliveryHeroCardProps {
  distance: number;
  fee: number;
  eta: string;
  travelMinutes: number;
}

export function DeliveryHeroCard({
  distance,
  fee,
  eta,
  travelMinutes
}: DeliveryHeroCardProps) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary via-orange-500 to-red-500 p-5 text-white shadow-2xl animate-pulse-glow">
      {/* Animated background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent,transparent_10px,rgba(255,255,255,0.1)_10px,rgba(255,255,255,0.1)_20px)]" />
      </div>

      {/* Animated rider icon */}
      <div className="absolute right-3 top-3 animate-bounce-slow">
        <div className="relative">
          <Bike className="h-10 w-10 text-white/80" />
          <div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-white/30 rounded-full animate-pulse" />
        </div>
      </div>

      {/* Content */}
      <div className="space-y-4 relative z-10">
        {/* Distance */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <p className="text-white/70 text-xs uppercase tracking-wide">Driving Distance</p>
            <p className="text-2xl font-bold">{distance} km</p>
          </div>
        </div>

        {/* Fee */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            <Coins className="h-5 w-5" />
          </div>
          <div>
            <p className="text-white/70 text-xs uppercase tracking-wide">Delivery Fee</p>
            <p className="text-3xl font-bold">₱{fee.toFixed(0)}</p>
          </div>
        </div>

        {/* ETA */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <p className="text-white/70 text-xs uppercase tracking-wide">Estimated Delivery</p>
            <p className="text-2xl font-bold">{eta}</p>
            <p className="text-sm text-white/70">30 min prep + ~{travelMinutes} min travel</p>
          </div>
        </div>
      </div>

      {/* Bottom decorative line */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-white/0 via-white/50 to-white/0" />
    </div>
  );
}
