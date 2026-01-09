import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Search, 
  Loader2, 
  Filter, 
  FileText, 
  RefreshCcw, 
  Calendar, 
  User, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Camera, 
  Mail, 
  Truck, 
  Package, 
  ChevronDown,
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';

type AdminLog = {
  id: string;
  user_id: string;
  user_email: string;
  username: string | null;
  display_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  details: string | null;
  created_at: string;
};

const actionColors: Record<string, string> = {
  approve: 'bg-green-500/20 text-green-700 border-green-500/30',
  reject: 'bg-red-500/20 text-red-700 border-red-500/30',
  complete: 'bg-emerald-500/20 text-emerald-700 border-emerald-500/30',
  create: 'bg-blue-500/20 text-blue-700 border-blue-500/30',
  update: 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30',
  delete: 'bg-red-500/20 text-red-700 border-red-500/30',
  assign: 'bg-purple-500/20 text-purple-700 border-purple-500/30',
  status_change: 'bg-orange-500/20 text-orange-700 border-orange-500/30',
  toggle: 'bg-cyan-500/20 text-cyan-700 border-cyan-500/30',
  upload: 'bg-indigo-500/20 text-indigo-700 border-indigo-500/30',
  photo_upload: 'bg-pink-500/20 text-pink-700 border-pink-500/30',
  return: 'bg-amber-500/20 text-amber-700 border-amber-500/30',
  email_sent: 'bg-cyan-500/20 text-cyan-700 border-cyan-500/30',
  payout_request: 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30',
};

const entityTypes = ['all', 'order', 'email', 'delivery_photo', 'payout', 'driver', 'product', 'category', 'flavor', 'user', 'setting', 'stock', 'customer'];
const actions = ['all', 'create', 'status_change', 'email_sent', 'photo_upload', 'approve', 'reject', 'complete', 'update', 'delete', 'assign', 'toggle', 'upload', 'return', 'payout_request'];

const ITEMS_PER_PAGE = 50;

// Format status for display
function formatStatus(status: string | undefined): string {
  if (!status) return 'Unknown';
  return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

// Get icon for action type
function getActionIcon(action: string) {
  switch (action) {
    case 'status_change':
      return Package;
    case 'photo_upload':
      return Camera;
    case 'email_sent':
      return Mail;
    case 'assign':
      return Truck;
    case 'approve':
      return CheckCircle;
    case 'reject':
      return XCircle;
    default:
      return FileText;
  }
}

// Translate log to human-readable event
function translateEvent(log: AdminLog): {
  headline: string;
  description: string;
  icon: React.ElementType;
  warnings: string[];
  missingActions: string[];
  isAdminOverride: boolean;
} {
  const { action, entity_type, entity_name, old_values, new_values, user_email, details } = log;
  const warnings: string[] = [];
  const missingActions: string[] = [];
  const isDriverAction = user_email?.startsWith('driver:');
  let isAdminOverride = false;

  // Order status changes
  if (entity_type === 'order' && action === 'status_change') {
    const oldStatus = old_values?.status;
    const newStatus = new_values?.status;
    
    // Check for admin override on driver-specific actions
    const driverStatuses = ['picked_up', 'in_transit', 'delivered'];
    if (driverStatuses.includes(newStatus) && !isDriverAction) {
      isAdminOverride = true;
      warnings.push('Admin Override: This status was changed by admin, not by driver');
      
      if (newStatus === 'picked_up') {
        missingActions.push('Driver pickup photo was NOT uploaded (bypassed by admin)');
      }
      if (newStatus === 'delivered') {
        missingActions.push('Driver delivery photo was NOT uploaded (bypassed by admin)');
      }
    }

    return {
      headline: `Order ${entity_name || ''} status changed`,
      description: `from "${formatStatus(oldStatus)}" → "${formatStatus(newStatus)}"`,
      icon: Package,
      warnings,
      missingActions,
      isAdminOverride,
    };
  }

  // Driver assignment
  if (action === 'assign' && entity_type === 'order') {
    return {
      headline: `Driver assigned to Order ${entity_name || ''}`,
      description: new_values?.driver_name 
        ? `${new_values.driver_name} was assigned to handle delivery`
        : 'A driver was assigned to this order',
      icon: Truck,
      warnings,
      missingActions,
      isAdminOverride: false,
    };
  }

  // Photo upload
  if (action === 'photo_upload') {
    const photoType = new_values?.photo_type || details || 'photo';
    return {
      headline: `Driver photo uploaded`,
      description: `${formatStatus(photoType)} photo for Order ${entity_name || ''}`,
      icon: Camera,
      warnings,
      missingActions,
      isAdminOverride: false,
    };
  }

  // Email sent
  if (action === 'email_sent') {
    return {
      headline: `Email notification sent`,
      description: new_values?.email_type 
        ? `${formatStatus(new_values.email_type)} email to ${new_values?.recipient || 'customer'}`
        : details || `Email sent for ${entity_name || 'order'}`,
      icon: Mail,
      warnings,
      missingActions,
      isAdminOverride: false,
    };
  }

  // Approve/Reject
  if (action === 'approve') {
    return {
      headline: `${formatStatus(entity_type)} approved`,
      description: entity_name ? `${entity_name} was approved` : 'Item was approved',
      icon: CheckCircle,
      warnings,
      missingActions,
      isAdminOverride: false,
    };
  }

  if (action === 'reject') {
    const reason = new_values?.reason || new_values?.rejection_reason;
    return {
      headline: `${formatStatus(entity_type)} rejected`,
      description: reason 
        ? `${entity_name || 'Item'} was rejected: ${reason}`
        : `${entity_name || 'Item'} was rejected`,
      icon: XCircle,
      warnings,
      missingActions,
      isAdminOverride: false,
    };
  }

  // Create action
  if (action === 'create') {
    return {
      headline: `New ${entity_type} created`,
      description: entity_name || `A new ${entity_type} was created`,
      icon: FileText,
      warnings,
      missingActions,
      isAdminOverride: false,
    };
  }

  // Update action
  if (action === 'update') {
    const changedFields = new_values ? Object.keys(new_values).join(', ') : '';
    return {
      headline: `${formatStatus(entity_type)} updated`,
      description: changedFields 
        ? `${entity_name || 'Item'} - Changed: ${changedFields}`
        : details || `${entity_name || 'Item'} was updated`,
      icon: FileText,
      warnings,
      missingActions,
      isAdminOverride: false,
    };
  }

  // Default fallback
  return {
    headline: `${formatStatus(action)} ${entity_type}`,
    description: details || entity_name || '',
    icon: FileText,
    warnings,
    missingActions,
    isAdminOverride: false,
  };
}

export default function Logs() {
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [selectedLog, setSelectedLog] = useState<AdminLog | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [showRawData, setShowRawData] = useState(false);

  // Fetch total count for pagination
  const { data: totalCount = 0 } = useQuery({
    queryKey: ['admin-logs-count', entityFilter, actionFilter],
    queryFn: async () => {
      let query = supabase
        .from('admin_logs')
        .select('*', { count: 'exact', head: true });

      if (entityFilter !== 'all') {
        query = query.eq('entity_type', entityFilter);
      }
      if (actionFilter !== 'all') {
        query = query.eq('action', actionFilter);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
  });

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['admin-logs', entityFilter, actionFilter, currentPage],
    queryFn: async () => {
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      let query = supabase
        .from('admin_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (entityFilter !== 'all') {
        query = query.eq('entity_type', entityFilter);
      }
      if (actionFilter !== 'all') {
        query = query.eq('action', actionFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as AdminLog[];
    },
  });

  // Fetch order timeline when viewing order-related log
  const { data: orderTimeline = [] } = useQuery({
    queryKey: ['order-timeline', selectedLog?.entity_id],
    queryFn: async () => {
      if (!selectedLog?.entity_id || selectedLog.entity_type !== 'order') return [];
      
      const { data, error } = await supabase
        .from('admin_logs')
        .select('*')
        .eq('entity_id', selectedLog.entity_id)
        .eq('entity_type', 'order')
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data as AdminLog[];
    },
    enabled: !!selectedLog?.entity_id && selectedLog?.entity_type === 'order',
  });

  // Reset page when filters change
  const handleFilterChange = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setCurrentPage(1);
  };

  const filteredLogs = logs.filter(
    (log) =>
      log.user_email.toLowerCase().includes(search.toLowerCase()) ||
      log.entity_name?.toLowerCase().includes(search.toLowerCase()) ||
      log.details?.toLowerCase().includes(search.toLowerCase())
  );

  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('ellipsis');
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
        pages.push(i);
      }
      if (currentPage < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  };

  // Get translated event for selected log
  const translatedEvent = selectedLog ? translateEvent(selectedLog) : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Activity Logs</h1>
          <p className="text-muted-foreground mt-1">Audit trail of all admin actions</p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCcw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by email, entity, or details..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Select value={entityFilter} onValueChange={handleFilterChange(setEntityFilter)}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Entity" />
                </SelectTrigger>
                <SelectContent>
                  {entityTypes.map((type) => (
                    <SelectItem key={type} value={type} className="capitalize">
                      {type === 'all' ? 'All Entities' : type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={actionFilter} onValueChange={handleFilterChange(setActionFilter)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Action" />
                </SelectTrigger>
                <SelectContent>
                  {actions.map((action) => (
                    <SelectItem key={action} value={action} className="capitalize">
                      {action === 'all' ? 'All Actions' : action.replace('_', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No activity logs found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => {
                  const event = translateEvent(log);
                  return (
                    <TableRow key={log.id} className={event.isAdminOverride ? 'bg-amber-500/5' : ''}>
                      <TableCell className="text-sm">
                        {format(new Date(log.created_at), 'MMM d, h:mm a')}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            {log.user_email.startsWith('driver:') && (
                              <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30 text-xs">
                                Driver
                              </Badge>
                            )}
                            {event.isAdminOverride && (
                              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-xs">
                                Override
                              </Badge>
                            )}
                            <span className="text-sm font-medium truncate max-w-[180px] block">
                              {log.display_name || log.username || log.user_email.replace('driver:', '')}
                            </span>
                          </div>
                          {(log.display_name || log.username) && (
                            <span className="text-xs text-muted-foreground truncate max-w-[180px] block">
                              {log.user_email.replace('driver:', '')}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline" 
                          className={actionColors[log.action] || 'bg-muted'}
                        >
                          {log.action.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="text-xs text-muted-foreground capitalize">
                            {log.entity_type}
                          </span>
                          {log.entity_name && (
                            <p className="text-sm font-medium truncate max-w-[200px]">
                              {log.entity_name}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground truncate max-w-[200px] block">
                          {event.description || log.details || '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedLog(log)}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, totalCount)} of {totalCount} logs
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                {getPageNumbers().map((page, idx) => (
                  page === 'ellipsis' ? (
                    <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">...</span>
                  ) : (
                    <Button
                      key={page}
                      variant={page === currentPage ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(page)}
                      className="min-w-[32px]"
                    >
                      {page}
                    </Button>
                  )
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enhanced Log Detail Sheet */}
      <Sheet open={!!selectedLog} onOpenChange={() => { setSelectedLog(null); setShowRawData(false); }}>
        <SheetContent className="w-full sm:max-w-lg">
          {selectedLog && translatedEvent && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <translatedEvent.icon className="h-5 w-5" />
                  Activity Details
                </SheetTitle>
              </SheetHeader>
              <ScrollArea className="h-[calc(100vh-100px)] mt-6">
                <div className="space-y-6 pr-4">
                  {/* Date and Admin */}
                  <div className="flex items-start gap-4 p-3 bg-muted/50 rounded-lg">
                    <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium">
                        {format(new Date(selectedLog.created_at), 'MMMM d, yyyy')} at {format(new Date(selectedLog.created_at), 'h:mm:ss a')}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          {selectedLog.user_email.startsWith('driver:') ? (
                            <>
                              <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30 text-xs mr-1">
                                Driver
                              </Badge>
                              {selectedLog.user_email.replace('driver:', '')}
                            </>
                          ) : (
                            selectedLog.user_email
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* What Happened - Human Readable */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      What Happened
                    </h3>
                    <div className="p-4 border rounded-lg space-y-2">
                      <div className="flex items-start gap-3">
                        <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                        <div>
                          <p className="font-medium">{translatedEvent.headline}</p>
                          <p className="text-sm text-muted-foreground">{translatedEvent.description}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Warnings */}
                  {translatedEvent.warnings.length > 0 && (
                    <div className="space-y-2">
                      {translatedEvent.warnings.map((warning, idx) => (
                        <Alert key={idx} className="border-amber-500/50 bg-amber-500/10">
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                          <AlertDescription className="text-amber-700">
                            {warning}
                          </AlertDescription>
                        </Alert>
                      ))}
                    </div>
                  )}

                  {/* Missing Actions */}
                  {translatedEvent.missingActions.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-red-600 flex items-center gap-2">
                        <XCircle className="h-4 w-4" />
                        Missing Expected Actions
                      </h3>
                      {translatedEvent.missingActions.map((missing, idx) => (
                        <Alert key={idx} className="border-red-500/50 bg-red-500/10">
                          <XCircle className="h-4 w-4 text-red-600" />
                          <AlertDescription className="text-red-700">
                            {missing}
                          </AlertDescription>
                        </Alert>
                      ))}
                    </div>
                  )}

                  {/* Order Timeline */}
                  {selectedLog.entity_type === 'order' && orderTimeline.length > 1 && (
                    <>
                      <Separator />
                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                          Order Timeline
                        </h3>
                        <div className="space-y-0">
                          {orderTimeline.map((event, idx) => {
                            const eventTranslation = translateEvent(event);
                            const isCurrent = event.id === selectedLog.id;
                            return (
                              <div 
                                key={event.id} 
                                className={`flex items-start gap-3 py-2 ${isCurrent ? 'bg-primary/5 -mx-2 px-2 rounded-md' : ''}`}
                              >
                                <div className="flex flex-col items-center">
                                  <div className={`h-2 w-2 rounded-full ${isCurrent ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
                                  {idx < orderTimeline.length - 1 && (
                                    <div className="w-0.5 h-8 bg-muted-foreground/20" />
                                  )}
                                </div>
                                <div className="flex-1 -mt-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">
                                      {format(new Date(event.created_at), 'h:mm a')}
                                    </span>
                                    {eventTranslation.isAdminOverride && (
                                      <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-[10px] px-1 py-0">
                                        Override
                                      </Badge>
                                    )}
                                    {isCurrent && (
                                      <Badge variant="default" className="text-[10px] px-1 py-0">
                                        Current
                                      </Badge>
                                    )}
                                  </div>
                                  <p className={`text-sm ${isCurrent ? 'font-medium' : ''}`}>
                                    {eventTranslation.headline}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}

                  <Separator />

                  {/* Raw Data (Collapsible) */}
                  <Collapsible open={showRawData} onOpenChange={setShowRawData}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
                        <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                          Technical Details
                        </span>
                        {showRawData ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-4 pt-3">
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Action</p>
                            <Badge variant="outline" className={actionColors[selectedLog.action] || 'bg-muted'}>
                              {selectedLog.action.replace('_', ' ')}
                            </Badge>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Entity Type</p>
                            <p className="capitalize">{selectedLog.entity_type}</p>
                          </div>
                          {selectedLog.entity_id && (
                            <div className="col-span-2">
                              <p className="text-xs text-muted-foreground">Entity ID</p>
                              <p className="font-mono text-xs truncate">{selectedLog.entity_id}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {selectedLog.old_values && Object.keys(selectedLog.old_values).length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-2">Previous Values</p>
                          <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto max-h-[200px]">
                            {JSON.stringify(selectedLog.old_values, null, 2)}
                          </pre>
                        </div>
                      )}

                      {selectedLog.new_values && Object.keys(selectedLog.new_values).length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-2">New Values</p>
                          <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto max-h-[200px]">
                            {JSON.stringify(selectedLog.new_values, null, 2)}
                          </pre>
                        </div>
                      )}

                      {selectedLog.details && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-2">Additional Details</p>
                          <p className="text-sm bg-muted p-3 rounded-lg">{selectedLog.details}</p>
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </ScrollArea>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
