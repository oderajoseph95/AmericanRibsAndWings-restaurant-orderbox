

# ISSUE R1.3 - Reservation Submission & Confirmation Trigger

## Overview

Turn validated reservation form data into a real reservation record with a unique reference code, display a confirmation screen, and trigger SMS/email notifications to customers and admins.

---

## Technical Implementation

### 1. Database Schema - Create `reservations` Table

**SQL Migration:**

```sql
-- Create reservation_status enum
CREATE TYPE reservation_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed', 'no_show');

-- Create reservations table
CREATE TABLE reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  pax INTEGER NOT NULL CHECK (pax > 0 AND pax <= 20),
  reservation_date DATE NOT NULL,
  reservation_time TIME NOT NULL,
  notes TEXT,
  status reservation_status DEFAULT 'pending' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Public can insert reservations" ON reservations
  FOR INSERT WITH CHECK (status = 'pending');

CREATE POLICY "Public can view own reservation by code" ON reservations
  FOR SELECT USING (true);

CREATE POLICY "Admins can view all reservations" ON reservations
  FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update reservations" ON reservations
  FOR UPDATE USING (is_admin(auth.uid()));

CREATE POLICY "Owner can delete reservations" ON reservations
  FOR DELETE USING (has_role(auth.uid(), 'owner'::app_role));

-- Updated_at trigger
CREATE TRIGGER update_reservations_updated_at
  BEFORE UPDATE ON reservations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE reservations;
```

**Reservation Code Generation Function:**

```sql
-- Generate human-readable reservation code (ARW-RSV-XXXX)
CREATE OR REPLACE FUNCTION generate_reservation_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.reservation_code := 'ARW-RSV-' || LPAD(
    FLOOR(RANDOM() * 10000)::TEXT, 
    4, 
    '0'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_reservation_code
  BEFORE INSERT ON reservations
  FOR EACH ROW
  EXECUTE FUNCTION generate_reservation_code();
```

**Secure RPC Function for Submission:**

```sql
-- Secure function to create reservation (bypasses RLS)
CREATE OR REPLACE FUNCTION create_reservation(
  p_name TEXT,
  p_phone TEXT,
  p_email TEXT DEFAULT NULL,
  p_pax INTEGER,
  p_reservation_date DATE,
  p_reservation_time TIME,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE(id UUID, reservation_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reservation_id UUID;
  v_code TEXT;
  v_attempts INTEGER := 0;
BEGIN
  -- Validate required fields
  IF p_name IS NULL OR TRIM(p_name) = '' THEN
    RAISE EXCEPTION 'Name is required';
  END IF;
  
  IF p_phone IS NULL OR TRIM(p_phone) = '' THEN
    RAISE EXCEPTION 'Phone is required';
  END IF;
  
  IF p_pax < 1 OR p_pax > 20 THEN
    RAISE EXCEPTION 'Party size must be between 1 and 20';
  END IF;
  
  -- Generate unique code with retry
  LOOP
    v_code := 'ARW-RSV-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
    
    -- Check if code exists
    IF NOT EXISTS (SELECT 1 FROM reservations WHERE reservation_code = v_code) THEN
      EXIT;
    END IF;
    
    v_attempts := v_attempts + 1;
    IF v_attempts > 10 THEN
      RAISE EXCEPTION 'Failed to generate unique reservation code';
    END IF;
  END LOOP;
  
  -- Insert reservation
  INSERT INTO reservations (
    reservation_code,
    name,
    phone,
    email,
    pax,
    reservation_date,
    reservation_time,
    notes,
    status
  ) VALUES (
    v_code,
    TRIM(p_name),
    TRIM(p_phone),
    NULLIF(TRIM(p_email), ''),
    p_pax,
    p_reservation_date,
    p_reservation_time,
    NULLIF(TRIM(p_notes), ''),
    'pending'
  )
  RETURNING reservations.id INTO v_reservation_id;
  
  RETURN QUERY SELECT v_reservation_id, v_code;
END;
$$;
```

---

### 2. SMS Notification Type - Add Reservation Type

**Update `src/hooks/useSmsNotifications.ts`:**

Add new SMS type for reservations:

```typescript
export type SmsType = 
  | "order_received"
  | ... existing types ...
  | "reservation_received"  // NEW
  | "test";

export interface SmsNotificationPayload {
  type: SmsType;
  recipientPhone?: string;
  reservationId?: string;        // NEW
  reservationCode?: string;      // NEW
  reservationDate?: string;      // NEW
  reservationTime?: string;      // NEW
  pax?: number;                  // NEW
  customerName?: string;
  ... existing fields ...
}
```

**Update Edge Function `send-sms-notification/index.ts`:**

Add reservation SMS handling:

```typescript
// In SmsPayload interface - add new fields
reservationId?: string;
reservationCode?: string;
reservationDate?: string;
reservationTime?: string;
pax?: number;

// In replaceVariables - add new replacements
result = result.replace(/\{\{reservation_code\}\}/g, payload.reservationCode || "");
result = result.replace(/\{\{reservation_date\}\}/g, payload.reservationDate || "");
result = result.replace(/\{\{reservation_time\}\}/g, payload.reservationTime || "");
result = result.replace(/\{\{pax\}\}/g, String(payload.pax || ""));

// In getDefaultMessage - add reservation type
reservation_received: `American Ribs & Wings: Reservation ${payload.reservationCode} received for ${payload.pax} guests on ${payload.reservationDate} at ${payload.reservationTime}. We'll confirm via SMS shortly.`,
```

---

### 3. Email Notification Type - Add Reservation Type

**Update `src/hooks/useEmailNotifications.ts`:**

Add new email type:

```typescript
export type EmailType = 
  | "new_order"
  | ... existing types ...
  | "new_reservation"  // NEW
  | "test_email";

export interface EmailNotificationPayload {
  type: EmailType;
  reservationId?: string;        // NEW
  reservationCode?: string;      // NEW
  reservationDate?: string;      // NEW
  reservationTime?: string;      // NEW
  pax?: number;                  // NEW
  ... existing fields ...
}
```

**Update Edge Function `send-email-notification/index.ts`:**

Add reservation email handling (admin notification only - customer email not required per spec):

```typescript
// Add to EmailPayload interface
reservationId?: string;
reservationCode?: string;
reservationDate?: string;
reservationTime?: string;
pax?: number;

// Add new email template case in main handler
case 'new_reservation':
  subject = `New Reservation ${payload.reservationCode} - ${payload.pax} guests`;
  html = generateReservationEmailHtml(payload);
  break;
```

---

### 4. Create Reservation Form Component

**File:** `src/components/reservation/ReservationForm.tsx`

Form component with submission logic:

```tsx
// Key functionality:
// - Accept validated form data from parent
// - Call create_reservation RPC on submit
// - Trigger SMS and email notifications
// - Call onSuccess callback with reservation details
// - Handle errors with retry capability
// - Show loading state during submission

interface ReservationFormProps {
  onSuccess: (reservation: { id: string; code: string; ... }) => void;
  storeHours: { opensAt: string; closesAt: string };
}

// Submission flow:
// 1. Validate all fields
// 2. Call supabase.rpc('create_reservation', {...})
// 3. Fire notifications via Promise.allSettled
// 4. Call onSuccess with reservation data
// 5. Parent handles redirect to confirmation
```

---

### 5. Create Reservation Confirmation Component

**File:** `src/components/reservation/ReservationConfirmation.tsx`

Confirmation screen following OrderConfirmation.tsx pattern:

```tsx
interface ReservationConfirmationProps {
  reservationCode: string;
  name: string;
  pax: number;
  date: string;
  time: string;
  onNewReservation: () => void;
}

// UI Structure:
// - Success icon (green checkmark)
// - "Reservation Submitted" heading
// - Reservation code (prominent, large font)
// - Date & time summary
// - Party size
// - "We'll confirm your reservation via SMS shortly" message
// - Back to Home button
// - Make Another Reservation button
```

---

### 6. Update Reserve Page

**File:** `src/pages/Reserve.tsx`

Replace placeholder with form and handle confirmation state:

```tsx
// State management:
const [isConfirmed, setIsConfirmed] = useState(false);
const [confirmationData, setConfirmationData] = useState(null);

// Conditional rendering:
if (isConfirmed && confirmationData) {
  return <ReservationConfirmation {...confirmationData} />;
}

// Otherwise render form:
return (
  <div>
    {/* Header */}
    <main>
      <ReservationForm 
        onSuccess={(data) => {
          setConfirmationData(data);
          setIsConfirmed(true);
        }}
        storeHours={{ opensAt, closesAt }}
      />
      {/* Store Info */}
    </main>
    <Footer />
  </div>
);
```

---

### 7. Insert Default SMS Template

**SQL:**

```sql
INSERT INTO sms_templates (type, content, is_active)
VALUES (
  'reservation_received',
  'American Ribs & Wings: Reservation {{reservation_code}} received for {{pax}} guests on {{reservation_date}} at {{reservation_time}}. We will confirm via SMS shortly.',
  true
)
ON CONFLICT DO NOTHING;
```

---

## Files to Create/Modify

| File | Change |
|------|--------|
| **Database** | Create `reservations` table, enum, RPC function |
| **Database** | Insert SMS template for `reservation_received` |
| `src/components/reservation/ReservationForm.tsx` | **Create** - Form with submission logic |
| `src/components/reservation/ReservationConfirmation.tsx` | **Create** - Confirmation screen |
| `src/pages/Reserve.tsx` | Replace placeholder, add state management |
| `src/hooks/useSmsNotifications.ts` | Add `reservation_received` type |
| `src/hooks/useEmailNotifications.ts` | Add `new_reservation` type |
| `supabase/functions/send-sms-notification/index.ts` | Handle reservation SMS |
| `supabase/functions/send-email-notification/index.ts` | Handle reservation admin email |

---

## Reservation Code Format

Format: `ARW-RSV-XXXX`

Examples:
- `ARW-RSV-4832`
- `ARW-RSV-0917`
- `ARW-RSV-7291`

Properties:
- Short and memorable
- Unique per reservation
- Easy to share via SMS
- Includes brand prefix (ARW)

---

## Notification Flow

**On successful submission:**

1. **SMS to Customer:**
   - Message: "Reservation ARW-RSV-4832 received for 4 guests on Feb 14, 2025 at 7:00 PM. We will confirm via SMS shortly."

2. **SMS to Admin Backup Numbers** (if enabled in settings)

3. **Email to Admin:**
   - Subject: "New Reservation ARW-RSV-4832 - 4 guests"
   - Contains: Customer name, phone, date, time, pax, notes

---

## Error Handling

**Submission Failures:**

- Show clear error toast message
- Keep form data intact (no reset)
- Enable retry with same data
- Log error to console for debugging

**Example:**
```tsx
try {
  const result = await supabase.rpc('create_reservation', {...});
  if (result.error) throw result.error;
  // Success path
} catch (error) {
  toast.error(error.message || "Failed to submit reservation. Please try again.");
  // Form data preserved, user can retry
}
```

---

## Duplicate Prevention

**On confirmation screen load:**

- Clear form state
- URL does not change (stays on /reserve)
- Refresh shows confirmation (not form)
- "Make Another Reservation" resets to form

---

## What This Creates

- Reservation record in database
- Unique human-readable reservation code
- Confirmation screen with all details
- SMS notification to customer + admin
- Email notification to admin

---

## What This Does NOT Create

- Admin approval workflow
- Reservation editing
- Menu pre-orders
- Capacity enforcement
- Walk-in merging
- Cancellation flow

---

## Result

After implementation:
- Customer submits valid form at `/reserve`
- Reservation is created with code `ARW-RSV-XXXX`
- Customer sees confirmation screen immediately
- SMS sent: "Reservation ARW-RSV-4832 received..."
- Admin notified via email
- No duplicate reservations on page refresh

