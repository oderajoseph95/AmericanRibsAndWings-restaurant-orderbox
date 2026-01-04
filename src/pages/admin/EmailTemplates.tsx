import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Mail, Loader2, Edit, Eye, Copy, RefreshCw, Info, History, CheckCircle, XCircle, AlertCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';

type EmailTemplate = {
  id: string;
  type: string;
  name: string;
  subject: string;
  content: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type EmailLog = {
  id: string;
  recipient_email: string;
  email_type: string | null;
  status: string;
  event_type: string | null;
  email_id: string | null;
  order_id: string | null;
  event_data: any;
  created_at: string;
};

const variablesList = [
  { variable: '{{order_number}}', description: 'Order number (e.g., ORD-20260104-ABC123)' },
  { variable: '{{customer_name}}', description: 'Customer\'s full name' },
  { variable: '{{customer_phone}}', description: 'Customer\'s phone number' },
  { variable: '{{customer_email}}', description: 'Customer\'s email address' },
  { variable: '{{total_amount}}', description: 'Order total (formatted with commas)' },
  { variable: '{{delivery_address}}', description: 'Full delivery address' },
  { variable: '{{order_type}}', description: 'Delivery or Pickup' },
  { variable: '{{driver_name}}', description: 'Assigned driver\'s name' },
  { variable: '{{driver_phone}}', description: 'Driver\'s phone number' },
  { variable: '{{payout_amount}}', description: 'Payout amount (formatted)' },
  { variable: '{{reason}}', description: 'Rejection/cancellation reason' },
  { variable: '{{business_name}}', description: 'Business name (American Ribs & Wings)' },
  { variable: '{{business_address}}', description: 'Business address' },
];

const conditionalHelp = [
  { syntax: '{{#if variable}}...{{/if}}', description: 'Show content only if variable exists' },
];

export default function EmailTemplates() {
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editContent, setEditContent] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('templates');

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['email-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as EmailTemplate[];
    },
  });

  // Fetch email logs from webhook events
  const { data: emailLogs = [], isLoading: isLoadingLogs, refetch: refetchLogs } = useQuery({
    queryKey: ['email-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as EmailLog[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, subject, content, is_active }: { id: string; subject?: string; content?: string; is_active?: boolean }) => {
      const updates: Partial<EmailTemplate> = {};
      if (subject !== undefined) updates.subject = subject;
      if (content !== undefined) updates.content = content;
      if (is_active !== undefined) updates.is_active = is_active;
      
      const { error } = await supabase
        .from('email_templates')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast.success('Template saved successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to save template');
    },
  });

  const handleEditTemplate = (template: EmailTemplate) => {
    setSelectedTemplate(template);
    setEditSubject(template.subject);
    setEditContent(template.content);
  };

  const handleSaveTemplate = () => {
    if (!selectedTemplate) return;
    updateMutation.mutate({
      id: selectedTemplate.id,
      subject: editSubject,
      content: editContent,
    });
  };

  const handleToggleActive = (template: EmailTemplate) => {
    updateMutation.mutate({
      id: template.id,
      is_active: !template.is_active,
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['email-templates'] });
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Generate preview by replacing variables with sample data
  const getPreviewHtml = () => {
    let preview = editContent;
    const sampleData: Record<string, string> = {
      '{{order_number}}': 'ORD-20260104-XYZ789',
      '{{customer_name}}': 'Juan Dela Cruz',
      '{{customer_phone}}': '09171234567',
      '{{customer_email}}': 'juan@email.com',
      '{{total_amount}}': '1,250.00',
      '{{delivery_address}}': '123 Sample Street, Floridablanca, Pampanga',
      '{{order_type}}': 'Delivery',
      '{{driver_name}}': 'Pedro Santos',
      '{{driver_phone}}': '09181234567',
      '{{payout_amount}}': '500.00',
      '{{reason}}': 'Item out of stock',
      '{{business_name}}': 'American Ribs & Wings',
      '{{business_address}}': 'Floridablanca, Pampanga',
    };

    // Replace variables
    Object.entries(sampleData).forEach(([variable, value]) => {
      preview = preview.replace(new RegExp(variable.replace(/[{}]/g, '\\$&'), 'g'), value);
    });

    // Handle conditionals - show content for demo
    preview = preview.replace(/\{\{#if \w+\}\}/g, '');
    preview = preview.replace(/\{\{\/if\}\}/g, '');

    return preview;
  };

  const getEmailTypeLabel = (type: string) => {
    const labels: Record<string, { label: string; color: string }> = {
      new_order: { label: 'New Order', color: 'bg-blue-500/20 text-blue-700' },
      order_pending: { label: 'Pending', color: 'bg-yellow-500/20 text-yellow-700' },
      order_for_verification: { label: 'Verification', color: 'bg-orange-500/20 text-orange-700' },
      order_approved: { label: 'Approved', color: 'bg-green-500/20 text-green-700' },
      order_rejected: { label: 'Rejected', color: 'bg-red-500/20 text-red-700' },
      order_cancelled: { label: 'Cancelled', color: 'bg-gray-500/20 text-gray-700' },
      order_preparing: { label: 'Preparing', color: 'bg-orange-500/20 text-orange-700' },
      order_ready_for_pickup: { label: 'Ready', color: 'bg-emerald-500/20 text-emerald-700' },
      order_waiting_for_rider: { label: 'Waiting Driver', color: 'bg-amber-500/20 text-amber-700' },
      order_picked_up: { label: 'Picked Up', color: 'bg-indigo-500/20 text-indigo-700' },
      order_in_transit: { label: 'In Transit', color: 'bg-blue-500/20 text-blue-700' },
      order_delivered: { label: 'Delivered', color: 'bg-green-500/20 text-green-700' },
      order_completed: { label: 'Completed', color: 'bg-emerald-500/20 text-emerald-700' },
      order_returned: { label: 'Returned', color: 'bg-amber-500/20 text-amber-700' },
      driver_assigned: { label: 'Driver', color: 'bg-purple-500/20 text-purple-700' },
      payout_requested: { label: 'Payout', color: 'bg-yellow-500/20 text-yellow-700' },
      payout_approved: { label: 'Payout', color: 'bg-green-500/20 text-green-700' },
      payout_rejected: { label: 'Payout', color: 'bg-red-500/20 text-red-700' },
    };
    return labels[type] || { label: type, color: 'bg-muted' };
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'delivered':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'sent':
        return <Clock className="h-4 w-4 text-blue-600" />;
      case 'bounced':
      case 'complained':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'opened':
      case 'clicked':
        return <Eye className="h-4 w-4 text-purple-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      sent: 'bg-blue-500/20 text-blue-700',
      delivered: 'bg-green-500/20 text-green-700',
      bounced: 'bg-red-500/20 text-red-700',
      complained: 'bg-red-500/20 text-red-700',
      opened: 'bg-purple-500/20 text-purple-700',
      clicked: 'bg-indigo-500/20 text-indigo-700',
    };
    return colors[status] || 'bg-muted text-muted-foreground';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Email Management</h1>
          <p className="text-muted-foreground mt-1">Manage email templates and view delivery logs</p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="templates" className="gap-2">
            <Mail className="h-4 w-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <History className="h-4 w-4" />
            Email Logs
            {emailLogs.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{emailLogs.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Email Templates
              </CardTitle>
              <CardDescription>
                Edit subject lines and content for each email type. Use variables like {"{{order_number}}"} to insert dynamic data.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No email templates found</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Template</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templates.map((template) => {
                      const typeInfo = getEmailTypeLabel(template.type);
                      return (
                        <TableRow key={template.id}>
                          <TableCell className="font-medium">{template.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={typeInfo.color}>
                              {typeInfo.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[300px] truncate text-sm text-muted-foreground">
                            {template.subject}
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={template.is_active}
                              onCheckedChange={() => handleToggleActive(template)}
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditTemplate(template)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <History className="h-5 w-5" />
                    Email Delivery Logs
                  </CardTitle>
                  <CardDescription>
                    Track email delivery status from Resend webhooks
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetchLogs()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Logs
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingLogs ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : emailLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No email logs yet</p>
                  <p className="text-xs mt-1">Logs will appear here when emails are sent and webhooks are received</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Event</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {emailLogs.map((log) => {
                      const typeInfo = log.email_type ? getEmailTypeLabel(log.email_type) : null;
                      return (
                        <TableRow key={log.id}>
                          <TableCell className="text-sm">
                            {format(new Date(log.created_at), 'MMM d, h:mm a')}
                          </TableCell>
                          <TableCell className="font-medium truncate max-w-[200px]">
                            {log.recipient_email}
                          </TableCell>
                          <TableCell>
                            {typeInfo ? (
                              <Badge variant="outline" className={typeInfo.color}>
                                {typeInfo.label}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getStatusIcon(log.status)}
                              <Badge variant="outline" className={getStatusBadge(log.status)}>
                                {log.status}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {log.event_type || '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Template Sheet */}
      <Sheet open={!!selectedTemplate} onOpenChange={() => setSelectedTemplate(null)}>
        <SheetContent className="w-full sm:max-w-2xl">
          {selectedTemplate && (
            <>
              <SheetHeader>
                <SheetTitle>Edit: {selectedTemplate.name}</SheetTitle>
                <SheetDescription>
                  Customize the email subject and content. Use variables to insert dynamic data.
                </SheetDescription>
              </SheetHeader>
              <ScrollArea className="h-[calc(100vh-200px)] mt-6 pr-4">
                <div className="space-y-6">
                  {/* Subject Line */}
                  <div className="space-y-2">
                    <Label htmlFor="subject">Subject Line</Label>
                    <Input
                      id="subject"
                      value={editSubject}
                      onChange={(e) => setEditSubject(e.target.value)}
                      placeholder="Email subject..."
                    />
                  </div>

                  {/* Content */}
                  <div className="space-y-2">
                    <Label htmlFor="content">Email Content (HTML)</Label>
                    <Textarea
                      id="content"
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      placeholder="Email HTML content..."
                      className="min-h-[300px] font-mono text-sm"
                    />
                  </div>

                  {/* Variables Reference */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Info className="h-4 w-4 text-muted-foreground" />
                      <Label>Available Variables</Label>
                    </div>
                    <div className="bg-muted rounded-lg p-3 space-y-1">
                      {variablesList.map((v) => (
                        <div key={v.variable} className="flex items-center justify-between text-sm">
                          <button
                            onClick={() => copyToClipboard(v.variable)}
                            className="font-mono text-primary hover:underline flex items-center gap-1"
                          >
                            {v.variable}
                            <Copy className="h-3 w-3" />
                          </button>
                          <span className="text-muted-foreground text-xs">{v.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Conditionals Help */}
                  <div className="space-y-2">
                    <Label>Conditional Syntax</Label>
                    <div className="bg-muted rounded-lg p-3">
                      {conditionalHelp.map((c) => (
                        <div key={c.syntax} className="text-sm">
                          <code className="font-mono text-primary">{c.syntax}</code>
                          <span className="text-muted-foreground ml-2">- {c.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-4 border-t">
                    <Button
                      variant="outline"
                      onClick={() => setShowPreview(true)}
                      className="flex-1"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Preview
                    </Button>
                    <Button
                      onClick={handleSaveTemplate}
                      disabled={updateMutation.isPending}
                      className="flex-1"
                    >
                      {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Save Template
                    </Button>
                  </div>
                </div>
              </ScrollArea>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted rounded-lg p-3">
              <p className="text-sm font-medium">Subject:</p>
              <p className="text-sm">{editSubject.replace(/\{\{order_number\}\}/g, 'ORD-20260104-XYZ789')}</p>
            </div>
            <div className="border rounded-lg p-4 bg-white">
              <div 
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: getPreviewHtml() }}
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              This is a preview with sample data. Actual emails will contain real order information.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
