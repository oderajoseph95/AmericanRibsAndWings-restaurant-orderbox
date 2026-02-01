
## Employee Portal – Phase 1 (Shell & Access)

### Overview
Create a dedicated Employee Portal where staff can log in and later view payslips, timesheets, and announcements. This phase focuses on structure, roles, and access control only.

---

### Database Changes

#### 1. Add `employee` to `app_role` enum
```sql
ALTER TYPE app_role ADD VALUE 'employee';
```

#### 2. Create `employees` table
```sql
CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  employee_id text,
  date_hired date,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id),
  UNIQUE(email)
);

-- Enable RLS
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can view all employees"
  ON public.employees FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Employees can view own record"
  ON public.employees FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Owner/Manager can insert employees"
  ON public.employees FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'manager'));

CREATE POLICY "Owner/Manager can update employees"
  ON public.employees FOR UPDATE
  USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'manager'));

CREATE POLICY "Owner/Manager can delete employees"
  ON public.employees FOR DELETE
  USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'manager'));

-- Trigger for updated_at
CREATE TRIGGER update_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

### Backend (Edge Function)

#### 3. Create `create-employee-auth` edge function
Similar pattern to `create-driver-auth`:
- Validates admin caller (owner/manager)
- Creates auth user with email/password
- Creates employee record in `employees` table
- Assigns `employee` role in `user_roles` table
- Auto-confirms email for immediate login

**File:** `supabase/functions/create-employee-auth/index.ts`

---

### Frontend Components

#### 4. Update AuthContext
Add `isEmployee` helper:
```typescript
const isEmployee = role === 'employee';
```

#### 5. Create `EmployeeProtectedRoute`
**File:** `src/components/employee/EmployeeProtectedRoute.tsx`
- Block non-employees
- Redirect admins to `/admin`
- Redirect drivers to `/driver`
- Check `is_active` status and show "inactive" message if false

#### 6. Create Employee Layout
**File:** `src/layouts/EmployeeLayout.tsx`
- Clean header with "Employee Portal" branding
- Employee name display
- Sign out button
- No bottom navigation (simple layout)

#### 7. Create Employee Dashboard (Placeholder)
**File:** `src/pages/employee/Dashboard.tsx`
- Welcome message: "Welcome, {{employee name}}"
- Employee badge
- Three placeholder cards:
  - Payslips (Coming Soon)
  - Timesheets (Coming Soon)
  - Announcements (Coming Soon)

#### 8. Create Employee Auth Page
**File:** `src/pages/employee/Auth.tsx`
- Email/password login form
- Employee-branded (Briefcase icon instead of Truck)
- Redirect to `/employee` on success
- Block admin/driver access

---

### Admin Components

#### 9. Create Admin Employees Management Page
**File:** `src/pages/admin/Employees.tsx`
Pattern mirrors Drivers.tsx:
- Table listing all employees
- Search/filter functionality
- Add Employee dialog:
  - Full Name (required)
  - Email (required)
  - Phone (optional)
  - Employee ID (optional)
  - Date Hired (optional)
  - Password (required for creation)
- Edit Employee sheet
- Toggle active/inactive status
- Password reset functionality (uses admin-user-management edge function)

#### 10. Update Admin Sidebar
Add "Employees" menu item:
```typescript
{ title: 'Employees', url: '/admin/employees', icon: UserCog, roles: ['owner', 'manager'] },
```

---

### Route Configuration

#### 11. Update App.tsx Routes
```tsx
// Employee Routes
<Route path="/employee/auth" element={<EmployeeAuth />} />
<Route
  path="/employee"
  element={
    <EmployeeProtectedRoute>
      <EmployeeLayout />
    </EmployeeProtectedRoute>
  }
>
  <Route index element={<EmployeeDashboard />} />
</Route>

// Admin Route
<Route path="employees" element={<Employees />} />
```

---

### Auth Flow Updates

#### 12. Update ProtectedRoute
Ensure employees cannot access admin routes (already handled since they don't have owner/manager/cashier role).

#### 13. Update Login Redirects
- `/auth` (admin login): Block employees, redirect to `/employee`
- `/employee/auth`: Block admins/drivers
- `/driver/auth`: Block admins/employees

---

### Files to Create

| File | Description |
|------|-------------|
| `supabase/functions/create-employee-auth/index.ts` | Edge function for creating employee auth users |
| `src/components/employee/EmployeeProtectedRoute.tsx` | Route protection for employee portal |
| `src/layouts/EmployeeLayout.tsx` | Layout wrapper for employee pages |
| `src/pages/employee/Auth.tsx` | Employee login page |
| `src/pages/employee/Dashboard.tsx` | Employee dashboard with placeholders |
| `src/pages/admin/Employees.tsx` | Admin employee management page |

### Files to Modify

| File | Changes |
|------|---------|
| `src/contexts/AuthContext.tsx` | Add `isEmployee` boolean |
| `src/components/admin/AdminSidebar.tsx` | Add Employees menu item |
| `src/App.tsx` | Add employee routes |
| `src/pages/Auth.tsx` | Block employee role, redirect to `/employee` |
| `supabase/functions/admin-user-management/index.ts` | Add employee support for password resets |

---

### Security Summary

| Route | Allowed Roles |
|-------|---------------|
| `/admin/*` | owner, manager, cashier |
| `/driver/*` | driver |
| `/employee/*` | employee |
| `/auth` | admin login only |
| `/driver/auth` | driver login only |
| `/employee/auth` | employee login only |

Employees cannot see: Orders, Customers, Reports, Drivers, Products, or other employees.

---

### What This Phase Does NOT Include

- Payroll computation
- Payslip uploads/viewing
- Timesheet logic
- Salary fields
- Attendance tracking
- Announcements system

These will be added in future phases.
