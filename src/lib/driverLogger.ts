import { supabase } from '@/integrations/supabase/client';

interface LogDriverActionParams {
  driverId: string;
  driverName: string;
  action: string;
  entityType: string;
  entityId?: string;
  entityName?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  details?: string;
}

export async function logDriverAction({
  driverId,
  driverName,
  action,
  entityType,
  entityId,
  entityName,
  oldValues,
  newValues,
  details,
}: LogDriverActionParams) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.error('Cannot log driver action: No authenticated user');
      return;
    }

    const { error } = await supabase.from('admin_logs').insert({
      user_id: user.id,
      user_email: `driver:${driverName}`,
      action,
      entity_type: entityType,
      entity_id: entityId,
      entity_name: entityName,
      old_values: oldValues || null,
      new_values: newValues || null,
      details: `[Driver: ${driverName}] ${details || ''}`,
    });

    if (error) {
      console.error('Failed to log driver action:', error);
    }
  } catch (err) {
    console.error('Error logging driver action:', err);
  }
}
