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
import { Search, Loader2, Filter, FileText, RefreshCcw } from 'lucide-react';
import { format } from 'date-fns';

type AdminLog = {
  id: string;
  user_id: string;
  user_email: string;
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
};

const entityTypes = ['all', 'payout', 'order', 'driver', 'product', 'category', 'flavor', 'user', 'setting', 'stock'];
const actions = ['all', 'approve', 'reject', 'complete', 'create', 'update', 'delete', 'assign', 'status_change', 'toggle', 'upload'];

export default function Logs() {
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [selectedLog, setSelectedLog] = useState<AdminLog | null>(null);

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['admin-logs', entityFilter, actionFilter],
    queryFn: async () => {
      let query = supabase
        .from('admin_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

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

  const filteredLogs = logs.filter(
    (log) =>
      log.user_email.toLowerCase().includes(search.toLowerCase()) ||
      log.entity_name?.toLowerCase().includes(search.toLowerCase()) ||
      log.details?.toLowerCase().includes(search.toLowerCase())
  );

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
              <Select value={entityFilter} onValueChange={setEntityFilter}>
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
              <Select value={actionFilter} onValueChange={setActionFilter}>
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
                {filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm">
                      {format(new Date(log.created_at), 'MMM d, h:mm a')}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm truncate max-w-[200px] block">
                        {log.user_email}
                      </span>
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
                        {log.details || '-'}
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
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Log Detail Sheet */}
      <Sheet open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <SheetContent className="w-full sm:max-w-lg">
          {selectedLog && (
            <>
              <SheetHeader>
                <SheetTitle>Activity Details</SheetTitle>
              </SheetHeader>
              <ScrollArea className="h-[calc(100vh-100px)] mt-6">
                <div className="space-y-6 pr-4">
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Date & Time</p>
                      <p className="font-medium">
                        {format(new Date(selectedLog.created_at), 'PPpp')}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Admin</p>
                      <p className="font-medium">{selectedLog.user_email}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Action</p>
                      <Badge 
                        variant="outline" 
                        className={actionColors[selectedLog.action] || 'bg-muted'}
                      >
                        {selectedLog.action.replace('_', ' ')}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Entity Type</p>
                      <p className="font-medium capitalize">{selectedLog.entity_type}</p>
                    </div>
                    {selectedLog.entity_name && (
                      <div>
                        <p className="text-xs text-muted-foreground">Entity Name</p>
                        <p className="font-medium">{selectedLog.entity_name}</p>
                      </div>
                    )}
                    {selectedLog.details && (
                      <div>
                        <p className="text-xs text-muted-foreground">Details</p>
                        <p className="text-sm">{selectedLog.details}</p>
                      </div>
                    )}
                  </div>

                  {selectedLog.old_values && Object.keys(selectedLog.old_values).length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Previous Values</p>
                      <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">
                        {JSON.stringify(selectedLog.old_values, null, 2)}
                      </pre>
                    </div>
                  )}

                  {selectedLog.new_values && Object.keys(selectedLog.new_values).length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">New Values</p>
                      <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">
                        {JSON.stringify(selectedLog.new_values, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
