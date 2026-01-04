import { supabase } from '@/integrations/supabase/client';

interface LogAdminActionParams {
  action: string;
  entityType: string;
  entityId?: string;
  entityName?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  details?: string;
}

export async function logAdminAction({
  action,
  entityType,
  entityId,
  entityName,
  oldValues,
  newValues,
  details,
}: LogAdminActionParams) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.error('Cannot log admin action: No authenticated user');
      return;
    }

    const { error } = await supabase.from('admin_logs').insert({
      user_id: user.id,
      user_email: user.email || 'unknown',
      action,
      entity_type: entityType,
      entity_id: entityId,
      entity_name: entityName,
      old_values: oldValues || null,
      new_values: newValues || null,
      details,
    });

    if (error) {
      console.error('Failed to log admin action:', error);
    }
  } catch (err) {
    console.error('Error logging admin action:', err);
  }
}
