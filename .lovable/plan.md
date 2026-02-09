
# ISSUE R3.1 — Reservation Confirmation Code Generation

## Overview

Add a `confirmation_code` field to reservations that is ONLY generated when status transitions from `pending` to `confirmed`. This code serves as a human-readable, immutable reference for customer communication, tracking, and support.

---

## Key Distinction

The reservations table already has:
- `reservation_code` (e.g., `ARW-RSV-1234`) - Generated on creation, used internally

This issue adds:
- `confirmation_code` (e.g., `ARW-RES-48321`) - Generated ONLY on confirmation, used for customer communication

---

## Technical Implementation

### 1. Database Migration - Add confirmation_code Column

```sql
-- Add confirmation_code field (nullable, unique)
ALTER TABLE reservations 
ADD COLUMN IF NOT EXISTS confirmation_code TEXT;

-- Create unique index for confirmation codes
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_confirmation_code 
ON reservations(confirmation_code) 
WHERE confirmation_code IS NOT NULL;
```

**Design decisions:**
- Nullable by default (only filled on confirmation)
- Unique constraint with partial index (allows multiple NULLs)
- No foreign key references

---

### 2. Code Generation Function

Create a helper function to generate unique confirmation codes:

```typescript
// In ReservationDetail.tsx or a utility file
const generateConfirmationCode = async (): Promise<string> => {
  const maxAttempts = 10;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Generate code: ARW-RES-XXXXX (5 digits)
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    const code = `ARW-RES-${randomNum}`;
    
    // Check if code already exists
    const { data, error } = await supabase
      .from('reservations')
      .select('id')
      .eq('confirmation_code', code)
      .maybeSingle();
    
    if (error) throw error;
    
    // If no existing reservation with this code, it's unique
    if (!data) {
      return code;
    }
  }
  
  throw new Error('Failed to generate unique confirmation code after maximum attempts');
};
```

---

### 3. Update Status Mutation

Modify the `updateStatusMutation` in `ReservationDetail.tsx`:

**Before:**
```typescript
const { error } = await supabase
  .from('reservations')
  .update({ 
    status: newStatus,
    status_changed_at: new Date().toISOString(),
    status_changed_by: user?.id || null,
  })
  .eq('id', id!);
```

**After:**
```typescript
// Only generate confirmation code for pending → confirmed transition
let confirmationCode: string | undefined;
if (reservation?.status === 'pending' && newStatus === 'confirmed') {
  confirmationCode = await generateConfirmationCode();
}

const updateData: Record<string, unknown> = {
  status: newStatus,
  status_changed_at: new Date().toISOString(),
  status_changed_by: user?.id || null,
};

// Only include confirmation_code if we generated one
if (confirmationCode) {
  updateData.confirmation_code = confirmationCode;
}

const { error } = await supabase
  .from('reservations')
  .update(updateData)
  .eq('id', id!);
```

---

### 4. Display Confirmation Code in Admin Detail View

Add confirmation code display in the Reservation Summary card (only when code exists):

```tsx
{reservation.confirmation_code && (
  <div className="flex items-center gap-3">
    <Ticket className="h-4 w-4 text-muted-foreground" />
    <div>
      <p className="text-sm text-muted-foreground">Confirmation Code</p>
      <p className="font-medium font-mono">{reservation.confirmation_code}</p>
    </div>
  </div>
)}
```

---

## Files to Modify

| File | Change |
|------|--------|
| **Database** | Add `confirmation_code` column with unique constraint |
| `src/pages/admin/ReservationDetail.tsx` | Add code generation logic to status mutation, display confirmation code |

---

## Code Format

| Element | Value |
|---------|-------|
| Prefix | `ARW-RES-` |
| Suffix | 5-digit number (10000-99999) |
| Example | `ARW-RES-48321` |
| Character set | Uppercase + numbers |
| URL-safe | Yes |
| Case-insensitive resolution | Yes (stored uppercase) |

---

## Trigger Rules

| Transition | Generate Code? |
|------------|----------------|
| Creation (pending) | NO |
| pending → confirmed | YES |
| pending → cancelled | NO |
| confirmed → completed | NO |
| confirmed → no_show | NO |

---

## Failure Handling

```text
Admin clicks "Confirm Reservation"
     ↓
Generate confirmation code (with retry loop)
     ↓
[Success?]───NO──→ Show error toast, remain pending
     ↓ YES
Update reservation with status + code
     ↓
[DB Error?]───YES──→ Show error toast, remain pending
     ↓ NO
Success: Show toast, UI updates
```

If code generation fails:
- Status update is blocked
- Reservation remains `pending`
- Admin sees clear error message
- Retry is possible

---

## What This Creates

- `confirmation_code` column in reservations table
- Unique constraint on confirmation codes
- Code generation on `pending → confirmed` only
- Display in admin detail view (read-only)
- Error handling for generation failures

---

## What This Does NOT Create

- Emails or SMS
- Tracking pages
- Customer-facing views
- Resend functionality
- Edit/regenerate functionality

---

## Verification Checklist

After implementation:
- [ ] Create a new reservation → No confirmation code
- [ ] Confirm reservation → Confirmation code generated (ARW-RES-XXXXX format)
- [ ] Confirmation code visible in admin detail
- [ ] Reject a pending reservation → No confirmation code
- [ ] Complete a confirmed reservation → Confirmation code unchanged
- [ ] Mark no-show → Confirmation code unchanged
- [ ] Confirmation code is read-only (no edit UI)
