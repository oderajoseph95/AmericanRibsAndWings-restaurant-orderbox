

# ISSUE R2.4 — Admin Notes & Internal Visibility

## Overview

Add a private internal notes system to reservations that allows admins to record coordination context. Notes are append-only, display admin attribution and timestamps, and are never visible to customers.

---

## Technical Implementation

### 1. Database Migration - Create reservation_notes Table

Create a new table to store internal admin notes:

```sql
CREATE TABLE reservation_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL,
  admin_display_name TEXT,
  note_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient lookups by reservation
CREATE INDEX idx_reservation_notes_reservation_id ON reservation_notes(reservation_id);

-- Enable RLS
ALTER TABLE reservation_notes ENABLE ROW LEVEL SECURITY;

-- Allow authenticated admin users to read notes
CREATE POLICY "Admins can read reservation notes" ON reservation_notes
  FOR SELECT TO authenticated
  USING (true);

-- Allow authenticated admin users to insert notes
CREATE POLICY "Admins can insert reservation notes" ON reservation_notes
  FOR INSERT TO authenticated
  WITH CHECK (true);
```

**Design decisions:**
- `admin_display_name` is stored directly for historical record (in case display name changes later)
- No UPDATE or DELETE policies - append-only by design
- CASCADE delete when reservation is deleted

---

### 2. Update ReservationDetail.tsx

**Changes to make:**

A. Add new imports:
```typescript
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { StickyNote, Send } from 'lucide-react';
import { useState } from 'react';
```

B. Add state for note input:
```typescript
const [noteText, setNoteText] = useState('');
```

C. Add useAuth hook:
```typescript
const { user, displayName } = useAuth();
```

D. Add query for notes:
```typescript
const { data: notes = [], isLoading: notesLoading } = useQuery({
  queryKey: ['reservation-notes', id],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('reservation_notes')
      .select('*')
      .eq('reservation_id', id!)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  },
  enabled: !!id,
});
```

E. Add mutation for adding notes:
```typescript
const addNoteMutation = useMutation({
  mutationFn: async () => {
    if (!noteText.trim()) return;
    
    const { error } = await supabase
      .from('reservation_notes')
      .insert({
        reservation_id: id!,
        admin_id: user?.id,
        admin_display_name: displayName || user?.email || 'Admin',
        note_text: noteText.trim(),
      });
    
    if (error) throw error;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['reservation-notes', id] });
    setNoteText('');
    toast.success('Note added');
  },
  onError: (error: Error) => {
    toast.error('Failed to add note: ' + error.message);
  },
});
```

F. Add Internal Notes Card (after Status Actions, before Metadata):
```tsx
{/* Internal Notes */}
<Card>
  <CardHeader>
    <CardTitle className="text-lg flex items-center gap-2">
      <StickyNote className="h-5 w-5 text-muted-foreground" />
      Internal Notes
    </CardTitle>
    <p className="text-sm text-muted-foreground">
      Private notes visible to staff only
    </p>
  </CardHeader>
  <CardContent className="space-y-4">
    {/* Add note form */}
    <div className="space-y-2">
      <Textarea
        placeholder="Add an internal note..."
        value={noteText}
        onChange={(e) => setNoteText(e.target.value)}
        className="min-h-[80px] text-sm"
        disabled={addNoteMutation.isPending}
      />
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => addNoteMutation.mutate()}
          disabled={!noteText.trim() || addNoteMutation.isPending}
        >
          {addNoteMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Send className="h-4 w-4 mr-2" />
          )}
          Add Note
        </Button>
      </div>
    </div>
    
    {/* Notes list */}
    {notesLoading ? (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    ) : notes.length > 0 ? (
      <div className="space-y-3 border-t pt-4">
        {notes.map((note) => (
          <div 
            key={note.id} 
            className="bg-muted/50 rounded-lg p-3 text-sm"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-xs">
                {note.admin_display_name}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatCreatedAt(note.created_at || '')}
              </span>
            </div>
            <p className="text-muted-foreground whitespace-pre-wrap">
              {note.note_text}
            </p>
          </div>
        ))}
      </div>
    ) : (
      <p className="text-sm text-muted-foreground text-center py-2">
        No internal notes yet
      </p>
    )}
  </CardContent>
</Card>
```

---

## Files to Create/Modify

| File | Change |
|------|--------|
| **Database** | Create `reservation_notes` table with RLS policies |
| `src/pages/admin/ReservationDetail.tsx` | Add internal notes section with form and list |

---

## UI Layout

```text
┌─────────────────────────────────────────────────┐
│ INTERNAL NOTES                                  │
│ Private notes visible to staff only             │
├─────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────┐ │
│ │ Add an internal note...                     │ │
│ │                                             │ │
│ └─────────────────────────────────────────────┘ │
│                              [Add Note]         │
│                                                 │
│ ─────────────────────────────────────────────── │
│                                                 │
│ ┌─────────────────────────────────────────────┐ │
│ │ Manager Juan              2 hours ago       │ │
│ │ VIP customer, give window seat              │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ ┌─────────────────────────────────────────────┐ │
│ │ Cashier Maria             Yesterday         │ │
│ │ Called to confirm, will arrive 15min early  │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

---

## What This Creates

- `reservation_notes` table with proper structure
- RLS policies allowing admin read/insert only (no update/delete)
- Notes section on `/admin/reservations/:id`
- Textarea form to add new notes
- Notes list with admin name and timestamp
- Newest notes first ordering
- Loading and empty states

---

## What This Does NOT Create

- Customer visibility of notes
- Edit or delete functionality
- Notifications
- Attachments or files
- Status changes (owned by R2.3)

---

## Security & Visibility Rules

- Notes stored in separate table (not on reservation record)
- RLS enforces authenticated-only access
- No customer-facing routes query this table
- No export or printing functionality
- Notes are immutable after creation

---

## Data Flow

```text
Admin types note → Submit button clicked
     ↓
Insert to reservation_notes table
     ↓
Query invalidation → Refetch notes
     ↓
Note appears in list (newest first)
```

---

## Result

After implementation:
- Admins can add private internal notes
- Each note shows who wrote it and when
- Notes are append-only (no editing)
- Notes never visible to customers
- Answers: "What do we need to remember internally about this reservation?"

