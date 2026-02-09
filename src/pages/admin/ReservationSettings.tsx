import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Clock, Users, Bell, XCircle, UserX, ShieldX, Loader2, Info, Globe } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { logAdminAction } from '@/lib/adminLogger';

// Default values for fallback
const DEFAULT_SETTINGS = {
  store_open: '11:00',
  store_close: '21:00',
  max_pax_per_slot: 40,
  slot_duration_minutes: 30,
  reminder_first_hours: 24,
  reminder_second_hours: 3,
  reminders_enabled: true,
  cancellation_cutoff_hours: 2,
  no_show_grace_minutes: 30,
};

type ReservationSettings = typeof DEFAULT_SETTINGS;

// Generate hour options from 00:00 to 23:00
const generateTimeOptions = () => {
  const options: string[] = [];
  for (let hour = 0; hour < 24; hour++) {
    options.push(`${hour.toString().padStart(2, '0')}:00`);
  }
  return options;
};

const TIME_OPTIONS = generateTimeOptions();
const SLOT_DURATION_OPTIONS = [15, 30, 45, 60];

export default function ReservationSettings() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const isOwner = role === 'owner';
  const isManager = role === 'manager';
  const canEdit = isOwner;
  const canView = isOwner || isManager;

  const [settings, setSettings] = useState<ReservationSettings>(DEFAULT_SETTINGS);
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch current settings
  const { data: fetchedSettings, isLoading, error } = useQuery({
    queryKey: ['reservation-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'reservation_settings')
        .maybeSingle();

      if (error) throw error;
      return (data?.value as ReservationSettings) || DEFAULT_SETTINGS;
    },
    enabled: canView,
  });

  // Update local state when fetched
  useEffect(() => {
    if (fetchedSettings) {
      setSettings({ ...DEFAULT_SETTINGS, ...fetchedSettings });
      setHasChanges(false);
    }
  }, [fetchedSettings]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (newSettings: ReservationSettings) => {
      const oldSettings = fetchedSettings || DEFAULT_SETTINGS;

      // Upsert settings
      const { error } = await supabase
        .from('settings')
        .upsert({
          key: 'reservation_settings',
          value: newSettings,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' });

      if (error) throw error;

      // Log each changed setting
      const changedKeys = Object.keys(newSettings).filter(
        (key) => newSettings[key as keyof ReservationSettings] !== oldSettings[key as keyof ReservationSettings]
      );

      for (const key of changedKeys) {
        const oldValue = oldSettings[key as keyof ReservationSettings];
        const newValue = newSettings[key as keyof ReservationSettings];

        await logAdminAction({
          action: 'update',
          entityType: 'reservation_settings',
          entityName: key,
          oldValues: { [key]: oldValue },
          newValues: { [key]: newValue },
          details: `Updated ${formatSettingLabel(key)} from ${oldValue} to ${newValue}`,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservation-settings'] });
      setHasChanges(false);
      toast.success('Settings saved successfully');
    },
    onError: (error: Error) => {
      toast.error('Failed to save settings: ' + error.message);
    },
  });

  const formatSettingLabel = (key: string): string => {
    const labels: Record<string, string> = {
      store_open: 'Opening Time',
      store_close: 'Closing Time',
      max_pax_per_slot: 'Max Guests per Slot',
      slot_duration_minutes: 'Slot Duration',
      reminder_first_hours: 'First Reminder',
      reminder_second_hours: 'Second Reminder',
      reminders_enabled: 'Reminders Enabled',
      cancellation_cutoff_hours: 'Cancellation Cutoff',
      no_show_grace_minutes: 'No-Show Grace Period',
    };
    return labels[key] || key;
  };

  const handleChange = <K extends keyof ReservationSettings>(key: K, value: ReservationSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    // Validation
    if (settings.store_close <= settings.store_open) {
      toast.error('Closing time must be after opening time');
      return;
    }
    if (settings.max_pax_per_slot < 1 || settings.max_pax_per_slot > 200) {
      toast.error('Max guests per slot must be between 1 and 200');
      return;
    }
    if (settings.reminder_first_hours < 1 || settings.reminder_first_hours > 72) {
      toast.error('First reminder must be between 1 and 72 hours');
      return;
    }
    if (settings.reminder_second_hours < 1 || settings.reminder_second_hours > 24) {
      toast.error('Second reminder must be between 1 and 24 hours');
      return;
    }
    if (settings.reminder_second_hours >= settings.reminder_first_hours) {
      toast.error('Second reminder must be less than first reminder');
      return;
    }
    if (settings.cancellation_cutoff_hours < 0 || settings.cancellation_cutoff_hours > 24) {
      toast.error('Cancellation cutoff must be between 0 and 24 hours');
      return;
    }
    if (settings.no_show_grace_minutes < 5 || settings.no_show_grace_minutes > 120) {
      toast.error('No-show grace period must be between 5 and 120 minutes');
      return;
    }

    saveMutation.mutate(settings);
  };

  const handleReset = () => {
    if (fetchedSettings) {
      setSettings({ ...DEFAULT_SETTINGS, ...fetchedSettings });
    } else {
      setSettings(DEFAULT_SETTINGS);
    }
    setHasChanges(false);
  };

  // Access denied for non-owner/manager
  if (!canView) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center gap-4 text-center">
        <ShieldX className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-2xl font-bold">Access Denied</h2>
        <p className="text-muted-foreground max-w-md">
          You don't have permission to view reservation settings.
        </p>
        <Button variant="outline" asChild>
          <Link to="/admin/reservations">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Reservations
          </Link>
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>Failed to load settings. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/admin/reservations">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Reservation Settings</h1>
            <p className="text-muted-foreground">Configure reservation rules and behavior</p>
          </div>
        </div>
        {canEdit && hasChanges && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleReset} disabled={saveMutation.isPending}>
              Reset
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        )}
      </div>

      {/* View-only notice for managers */}
      {isManager && !isOwner && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            You have view-only access. Contact an owner to make changes.
          </AlertDescription>
        </Alert>
      )}

      {/* Store Hours */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Store Hours (Reservation Context)
          </CardTitle>
          <CardDescription>Set when reservations are available</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Opening Time</Label>
              <Select
                value={settings.store_open}
                onValueChange={(v) => handleChange('store_open', v)}
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Closing Time</Label>
              <Select
                value={settings.store_close}
                onValueChange={(v) => handleChange('store_close', v)}
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Globe className="h-4 w-4" />
            <span>Timezone: Asia/Manila (Philippines, UTC+8)</span>
          </div>
          <p className="text-xs text-muted-foreground">
            These hours control the time picker for reservations
          </p>
        </CardContent>
      </Card>

      {/* Capacity Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Capacity Settings
          </CardTitle>
          <CardDescription>Control how many guests can book per time slot</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Max Guests per Slot</Label>
              <Input
                type="number"
                min={1}
                max={200}
                value={settings.max_pax_per_slot}
                onChange={(e) => handleChange('max_pax_per_slot', parseInt(e.target.value) || 1)}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <Label>Time Slot Duration</Label>
              <Select
                value={settings.slot_duration_minutes.toString()}
                onValueChange={(v) => handleChange('slot_duration_minutes', parseInt(v))}
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SLOT_DURATION_OPTIONS.map((d) => (
                    <SelectItem key={d} value={d.toString()}>{d} minutes</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Reservations exceeding slot capacity will be rejected
          </p>
        </CardContent>
      </Card>

      {/* Reminder Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Reminder Settings
          </CardTitle>
          <CardDescription>When to send reminder notifications to guests</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="reminders-enabled" className="text-base">Enable Automatic Reminders</Label>
            <Switch
              id="reminders-enabled"
              checked={settings.reminders_enabled}
              onCheckedChange={(v) => handleChange('reminders_enabled', v)}
              disabled={!canEdit}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>First Reminder</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={72}
                  value={settings.reminder_first_hours}
                  onChange={(e) => handleChange('reminder_first_hours', parseInt(e.target.value) || 24)}
                  disabled={!canEdit || !settings.reminders_enabled}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">hours before reservation</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Second Reminder</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={24}
                  value={settings.reminder_second_hours}
                  onChange={(e) => handleChange('reminder_second_hours', parseInt(e.target.value) || 3)}
                  disabled={!canEdit || !settings.reminders_enabled}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">hours before reservation</span>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Changes apply to future reservations only
          </p>
        </CardContent>
      </Card>

      {/* Cancellation Policy */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5" />
            Cancellation Policy
          </CardTitle>
          <CardDescription>How close to reservation time customers can cancel</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Cancellation Cutoff</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={24}
                value={settings.cancellation_cutoff_hours}
                onChange={(e) => handleChange('cancellation_cutoff_hours', parseInt(e.target.value) || 0)}
                disabled={!canEdit}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">hours before reservation</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            After this cutoff, customers must contact the store to cancel
          </p>
        </CardContent>
      </Card>

      {/* No-Show Handling */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserX className="h-5 w-5" />
            No-Show Handling
          </CardTitle>
          <CardDescription>Grace period before marking as no-show</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Grace Period</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={5}
                max={120}
                value={settings.no_show_grace_minutes}
                onChange={(e) => handleChange('no_show_grace_minutes', parseInt(e.target.value) || 30)}
                disabled={!canEdit}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">minutes after reservation time</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Confirmed reservations not checked in will be marked as no-show after this grace period
          </p>
        </CardContent>
      </Card>

      {/* Save button at bottom for mobile */}
      {canEdit && hasChanges && (
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleReset} disabled={saveMutation.isPending}>
            Reset
          </Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
