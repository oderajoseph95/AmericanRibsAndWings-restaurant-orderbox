import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2, Users } from "lucide-react";
import { format, addDays, isAfter, isBefore, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { DEFAULT_RESERVATION_SETTINGS } from "@/hooks/useReservationSettings";

interface ReservationFormProps {
  onSuccess: (reservation: {
    id: string;
    reservationCode: string;
    name: string;
    phone: string;
    email: string | null;
    pax: number;
    date: string;
    time: string;
    notes: string | null;
  }) => void;
  storeHours: {
    opensAt: string | null;
    closesAt: string | null;
  };
}

// Generate time slots based on store hours and slot duration
function generateTimeSlots(opensAt: string | null, closesAt: string | null, slotDurationMinutes: number = 30): string[] {
  const slots: string[] = [];
  
  // Default to 10 AM - 9 PM if no store hours
  let startHour = 10;
  let startMinute = 0;
  let endHour = 21;
  let endMinute = 0;
  
  if (opensAt) {
    const match = opensAt.match(/(\d+):?(\d*)\s*(AM|PM)?/i);
    if (match) {
      let hour = parseInt(match[1], 10);
      const minute = parseInt(match[2] || '0', 10);
      const isPM = match[3]?.toUpperCase() === 'PM';
      if (isPM && hour !== 12) hour += 12;
      if (!isPM && hour === 12) hour = 0;
      startHour = hour;
      startMinute = minute;
    }
  }
  
  if (closesAt) {
    const match = closesAt.match(/(\d+):?(\d*)\s*(AM|PM)?/i);
    if (match) {
      let hour = parseInt(match[1], 10);
      const minute = parseInt(match[2] || '0', 10);
      const isPM = match[3]?.toUpperCase() === 'PM';
      if (isPM && hour !== 12) hour += 12;
      if (!isPM && hour === 12) hour = 0;
      endHour = hour;
      endMinute = minute;
    }
  }
  
  // Convert to total minutes for easier calculation
  const startTotalMinutes = startHour * 60 + startMinute;
  const endTotalMinutes = endHour * 60 + endMinute;
  
  // Generate slots based on slot duration
  for (let totalMinutes = startTotalMinutes; totalMinutes < endTotalMinutes; totalMinutes += slotDurationMinutes) {
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    const period = hour >= 12 ? 'PM' : 'AM';
    const minuteStr = minute.toString().padStart(2, '0');
    slots.push(`${displayHour}:${minuteStr} ${period}`);
  }
  
  return slots;
}

// Normalize phone number to standard format
function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, "");
  
  if (cleaned.startsWith("63") && cleaned.length === 12) {
    return cleaned;
  }
  if (cleaned.startsWith("0") && cleaned.length === 11) {
    return "63" + cleaned.substring(1);
  }
  if (cleaned.startsWith("9") && cleaned.length === 10) {
    return "63" + cleaned;
  }
  
  return cleaned;
}

// Validate phone number (Philippine format)
function isValidPhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, "");
  
  // Accept 09XXXXXXXXX, 9XXXXXXXXX, or 63XXXXXXXXX
  if (cleaned.startsWith("09") && cleaned.length === 11) return true;
  if (cleaned.startsWith("9") && cleaned.length === 10) return true;
  if (cleaned.startsWith("63") && cleaned.length === 12) return true;
  
  return false;
}

// Parse time string to 24h format for database
function parseTimeToDbFormat(timeStr: string): string {
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return "12:00:00";
  
  let hour = parseInt(match[1], 10);
  const minute = match[2];
  const period = match[3].toUpperCase();
  
  if (period === 'PM' && hour !== 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;
  
  return `${hour.toString().padStart(2, '0')}:${minute}:00`;
}

export function ReservationForm({ onSuccess, storeHours }: ReservationFormProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pax, setPax] = useState<number>(2);
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dateOpen, setDateOpen] = useState(false);

  // Fetch reservation settings for slot duration
  const { data: reservationSettings } = useQuery({
    queryKey: ['reservation-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'reservation_settings')
        .maybeSingle();

      if (error) throw error;
      return { ...DEFAULT_RESERVATION_SETTINGS, ...(data?.value as Partial<typeof DEFAULT_RESERVATION_SETTINGS> || {}) };
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const slotDuration = reservationSettings?.slot_duration_minutes ?? DEFAULT_RESERVATION_SETTINGS.slot_duration_minutes;
  const timeSlots = generateTimeSlots(storeHours.opensAt, storeHours.closesAt, slotDuration);
  
  // Date constraints: today (if before 11 PM) to 30 days from now
  const now = new Date();
  const currentHour = now.getHours();
  const minDate = currentHour < 23 ? startOfDay(now) : addDays(startOfDay(now), 1);
  const maxDate = addDays(startOfDay(now), 30);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!name.trim()) {
      newErrors.name = "Name is required";
    }
    
    if (!phone.trim()) {
      newErrors.phone = "Phone number is required";
    } else if (!isValidPhone(phone)) {
      newErrors.phone = "Please enter a valid Philippine phone number";
    }
    
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = "Please enter a valid email address";
    }
    
    if (pax < 1 || pax > 20) {
      newErrors.pax = "Party size must be between 1 and 20";
    }
    
    if (!date) {
      newErrors.date = "Please select a date";
    } else if (isBefore(date, minDate) || isAfter(date, maxDate)) {
      newErrors.date = "Please select a date within the next 30 days";
    }
    
    if (!time) {
      newErrors.time = "Please select a time";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;
    
    setIsSubmitting(true);
    
    try {
      // Format date for database (YYYY-MM-DD)
      const dateStr = format(date!, "yyyy-MM-dd");
      const displayDate = format(date!, "MMMM d, yyyy");
      const timeDbFormat = parseTimeToDbFormat(time);
      
      // Call the RPC function to create reservation
      const { data, error } = await supabase.rpc("create_reservation", {
        p_name: name.trim(),
        p_phone: normalizePhone(phone),
        p_email: email.trim() || null,
        p_pax: pax,
        p_reservation_date: dateStr,
        p_reservation_time: timeDbFormat,
        p_notes: notes.trim() || null,
      });
      
      if (error) {
        throw new Error(error.message);
      }
      
      if (!data || data.length === 0) {
        throw new Error("Failed to create reservation");
      }
      
      const reservation = data[0];
      console.log("Reservation created:", reservation);
      
      // Send notifications (fire and forget - don't block UI)
      // SMS notification to customer
      supabase.functions.invoke("send-sms-notification", {
        body: {
          type: "reservation_received",
          recipientPhone: normalizePhone(phone),
          reservationCode: reservation.reservation_code,
          customerName: name.trim(),
          reservationDate: displayDate,
          reservationTime: time,
          pax: pax,
        },
      }).then(res => {
        if (res.error) console.error("SMS notification error:", res.error);
        else console.log("Reservation SMS sent");
      }).catch(err => console.error("SMS notification failed:", err));
      
      // Email notification if customer provided email
      if (email.trim()) {
        supabase.functions.invoke("send-email-notification", {
          body: {
            type: "new_reservation",
            recipientEmail: email.trim(),
            reservationCode: reservation.reservation_code,
            customerName: name.trim(),
            reservationDate: displayDate,
            reservationTime: time,
            pax: pax,
          },
        }).then(res => {
          if (res.error) console.error("Email notification error:", res.error);
          else console.log("Reservation email sent");
        }).catch(err => console.error("Email notification failed:", err));
      }
      
      // Call success callback with all details
      onSuccess({
        id: reservation.reservation_id,
        reservationCode: reservation.reservation_code,
        name: name.trim(),
        phone: normalizePhone(phone),
        email: email.trim() || null,
        pax: pax,
        date: displayDate,
        time: time,
        notes: notes.trim() || null,
      });
      
    } catch (error: any) {
      console.error("Reservation submission error:", error);
      toast({
        title: "Submission Failed",
        description: error.message || "Failed to submit reservation. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              placeholder="Your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
              className={errors.name ? "border-destructive" : ""}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number *</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="09171234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isSubmitting}
              className={errors.phone ? "border-destructive" : ""}
            />
            {errors.phone && (
              <p className="text-xs text-destructive">{errors.phone}</p>
            )}
            <p className="text-xs text-muted-foreground">
              We'll send confirmation to this number
            </p>
          </div>

          {/* Email (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="email">Email (Optional)</Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
              className={errors.email ? "border-destructive" : ""}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email}</p>
            )}
          </div>

          {/* Party Size */}
          <div className="space-y-2">
            <Label htmlFor="pax">Number of Guests *</Label>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <Select
                value={pax.toString()}
                onValueChange={(v) => setPax(parseInt(v, 10))}
                disabled={isSubmitting}
              >
                <SelectTrigger className={cn("w-full", errors.pax ? "border-destructive" : "")}>
                  <SelectValue placeholder="Select party size" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                    <SelectItem key={n} value={n.toString()}>
                      {n} {n === 1 ? "guest" : "guests"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {errors.pax && (
              <p className="text-xs text-destructive">{errors.pax}</p>
            )}
          </div>

          {/* Date */}
          <div className="space-y-2">
            <Label>Reservation Date *</Label>
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !date && "text-muted-foreground",
                    errors.date && "border-destructive"
                  )}
                  disabled={isSubmitting}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "MMMM d, yyyy") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => { setDate(d); setDateOpen(false); }}
                  disabled={(d) => isBefore(d, minDate) || isAfter(d, maxDate)}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            {errors.date && (
              <p className="text-xs text-destructive">{errors.date}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Reservations can be made up to 30 days in advance
            </p>
          </div>

          {/* Time */}
          <div className="space-y-2">
            <Label htmlFor="time">Reservation Time *</Label>
            <Select
              value={time}
              onValueChange={setTime}
              disabled={isSubmitting}
            >
              <SelectTrigger className={cn("w-full", errors.time ? "border-destructive" : "")}>
                <SelectValue placeholder="Select a time" />
              </SelectTrigger>
              <SelectContent>
                {timeSlots.map((slot) => (
                  <SelectItem key={slot} value={slot}>
                    {slot}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.time && (
              <p className="text-xs text-destructive">{errors.time}</p>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Special Requests (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="Any special requests or notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isSubmitting}
              rows={3}
            />
          </div>

          {/* Submit */}
          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              "Confirm Reservation"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
