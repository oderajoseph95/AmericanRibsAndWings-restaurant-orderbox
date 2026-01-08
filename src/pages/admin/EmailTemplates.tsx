import { useState, useMemo } from 'react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Mail, Loader2, Edit, Eye, Copy, RefreshCw, Info, History, CheckCircle, XCircle, AlertCircle, Clock, Users, ShieldCheck, ChevronLeft, ChevronRight, Search, Send, TestTube, BarChart3 } from 'lucide-react';
import { format } from 'date-fns';
import { sendTestEmail } from '@/hooks/useEmailNotifications';

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
  customer_name: string | null;
  order_number: string | null;
  email_subject: string | null;
  trigger_event: string | null;
  recipient_type: string | null;
  is_test: boolean | null;
};

const variablesList = [
  { variable: '{{order_number}}', description: 'Order number (e.g., ORD-20260108-1234)', category: 'Order' },
  { variable: '{{order_type}}', description: 'Delivery or Pickup', category: 'Order' },
  { variable: '{{order_items}}', description: 'Full HTML table of all order items with flavors', category: 'Order' },
  { variable: '{{order_summary}}', description: 'Subtotal, delivery fee, and total summary block', category: 'Order' },
  { variable: '{{total_amount}}', description: 'Grand total (formatted with commas)', category: 'Order' },
  { variable: '{{subtotal}}', description: 'Subtotal before delivery fee', category: 'Order' },
  { variable: '{{delivery_fee}}', description: 'Delivery fee amount', category: 'Order' },
  { variable: '{{delivery_distance}}', description: 'Delivery distance in km', category: 'Order' },
  { variable: '{{payment_method}}', description: 'Cash, GCash, or Bank', category: 'Order' },
  { variable: '{{pickup_date}}', description: 'Pickup date (for pickup orders)', category: 'Order' },
  { variable: '{{pickup_time}}', description: 'Pickup time (for pickup orders)', category: 'Order' },
  { variable: '{{notes}}', description: 'Customer order notes', category: 'Order' },
  { variable: '{{customer_name}}', description: 'Customer\'s full name', category: 'Customer' },
  { variable: '{{customer_phone}}', description: 'Customer\'s phone number', category: 'Customer' },
  { variable: '{{customer_email}}', description: 'Customer\'s email address', category: 'Customer' },
  { variable: '{{customer_info}}', description: 'Full customer info block (name, phone, email)', category: 'Customer' },
  { variable: '{{delivery_address}}', description: 'Full delivery address', category: 'Delivery' },
  { variable: '{{landmark}}', description: 'Delivery landmark', category: 'Delivery' },
  { variable: '{{driver_name}}', description: 'Assigned driver\'s name', category: 'Driver' },
  { variable: '{{driver_phone}}', description: 'Driver\'s phone number', category: 'Driver' },
  { variable: '{{reason}}', description: 'Rejection/cancellation reason', category: 'Status' },
  { variable: '{{payout_amount}}', description: 'Driver payout amount (formatted)', category: 'Payout' },
  { variable: '{{business_name}}', description: 'American Ribs & Wings', category: 'Business' },
  { variable: '{{business_address}}', description: 'Business address in Floridablanca', category: 'Business' },
];

const conditionalHelp = [
  { syntax: '{{#if variable}}...{{/if}}', description: 'Show content only if variable exists' },
  { syntax: '{{#if delivery_address}}...{{/if}}', description: 'Show delivery info only for delivery orders' },
  { syntax: '{{#if driver_name}}...{{/if}}', description: 'Show driver info only when assigned' },
];

const ITEMS_PER_PAGE = 10;

export default function EmailTemplates() {
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editContent, setEditContent] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('templates');
  const [emailSubTab, setEmailSubTab] = useState<'customer' | 'admin'>('customer');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [logsPage, setLogsPage] = useState(1);
  const [logsSearch, setLogsSearch] = useState('');
  
  // Test email dialog
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [templateToTest, setTemplateToTest] = useState<EmailTemplate | null>(null);
  const [isSendingTest, setIsSendingTest] = useState(false);

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

  // Separate customer and admin templates
  const { customerTemplates, adminTemplates } = useMemo(() => {
    const customer = templates.filter(t => t.type.endsWith('_customer'));
    const admin = templates.filter(t => t.type.endsWith('_admin'));
    return { customerTemplates: customer, adminTemplates: admin };
  }, [templates]);

  // Filter and paginate templates
  const filteredTemplates = useMemo(() => {
    const sourceTemplates = emailSubTab === 'customer' ? customerTemplates : adminTemplates;
    if (!searchQuery.trim()) return sourceTemplates;
    const query = searchQuery.toLowerCase();
    return sourceTemplates.filter(t => 
      t.name.toLowerCase().includes(query) || 
      t.type.toLowerCase().includes(query) ||
      t.subject.toLowerCase().includes(query)
    );
  }, [emailSubTab, customerTemplates, adminTemplates, searchQuery]);

  const paginatedTemplates = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredTemplates.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredTemplates, currentPage]);

  const totalPages = Math.ceil(filteredTemplates.length / ITEMS_PER_PAGE);

  const handleSubTabChange = (tab: 'customer' | 'admin') => {
    setEmailSubTab(tab);
    setCurrentPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  // Fetch email logs
  const { data: emailLogs = [], isLoading: isLoadingLogs, refetch: refetchLogs } = useQuery({
    queryKey: ['email-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as EmailLog[];
    },
  });

  // Filter and paginate logs
  const filteredLogs = useMemo(() => {
    if (!logsSearch.trim()) return emailLogs;
    const query = logsSearch.toLowerCase();
    return emailLogs.filter(log => 
      log.recipient_email?.toLowerCase().includes(query) ||
      log.customer_name?.toLowerCase().includes(query) ||
      log.order_number?.toLowerCase().includes(query) ||
      log.trigger_event?.toLowerCase().includes(query) ||
      log.email_subject?.toLowerCase().includes(query)
    );
  }, [emailLogs, logsSearch]);

  const paginatedLogs = useMemo(() => {
    const start = (logsPage - 1) * ITEMS_PER_PAGE;
    return filteredLogs.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredLogs, logsPage]);

  const totalLogsPages = Math.ceil(filteredLogs.length / ITEMS_PER_PAGE);

  // Analytics
  const analytics = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recentLogs = emailLogs.filter(log => new Date(log.created_at) >= sevenDaysAgo);
    
    const total = recentLogs.length;
    const sent = recentLogs.filter(l => l.status === 'sent').length;
    const delivered = recentLogs.filter(l => l.status === 'delivered').length;
    const opened = recentLogs.filter(l => l.status === 'opened').length;
    const bounced = recentLogs.filter(l => l.status === 'bounced').length;
    const testEmails = recentLogs.filter(l => l.is_test).length;
    
    return {
      total,
      sent,
      delivered,
      opened,
      bounced,
      testEmails,
      deliveryRate: total > 0 ? Math.round((delivered / total) * 100) : 0,
      openRate: delivered > 0 ? Math.round((opened / delivered) * 100) : 0,
      bounceRate: total > 0 ? Math.round((bounced / total) * 100) : 0,
    };
  }, [emailLogs]);

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
    await queryClient.invalidateQueries({ queryKey: ['email-logs'] });
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleOpenTestDialog = (template: EmailTemplate) => {
    setTemplateToTest(template);
    setTestEmailRecipient('');
    setShowTestDialog(true);
  };

  const handleSendTestEmail = async () => {
    if (!templateToTest || !testEmailRecipient) return;
    
    setIsSendingTest(true);
    try {
      const result = await sendTestEmail(templateToTest.type, testEmailRecipient);
      if (result.success) {
        toast.success(`Test email sent to ${testEmailRecipient}`);
        setShowTestDialog(false);
        refetchLogs();
      } else {
        toast.error(result.error || 'Failed to send test email');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to send test email');
    } finally {
      setIsSendingTest(false);
    }
  };

  // Generate preview by replacing variables with sample data
  const getPreviewHtml = () => {
    let preview = editContent;
    const sampleData: Record<string, string> = {
      '{{order_number}}': 'ORD-20260108-XYZ789',
      '{{customer_name}}': 'Juan Dela Cruz',
      '{{customer_phone}}': '09171234567',
      '{{customer_email}}': 'juan@email.com',
      '{{customer_info}}': '<strong>Name:</strong> Juan Dela Cruz<br><strong>Phone:</strong> 09171234567<br><strong>Email:</strong> juan@email.com',
      '{{total_amount}}': '1,625.00',
      '{{subtotal}}': '1,550.00',
      '{{delivery_fee}}': '75.00',
      '{{delivery_distance}}': '5.2',
      '{{payment_method}}': 'GCash',
      '{{pickup_date}}': 'January 8, 2026',
      '{{pickup_time}}': '2:00 PM',
      '{{notes}}': 'Extra sauce please',
      '{{landmark}}': 'Near the church',
      '{{delivery_address}}': '123 Sample Street, Brgy. San Jose, Floridablanca, Pampanga',
      '{{order_type}}': 'Delivery',
      '{{order_items}}': '<table style="width:100%;border-collapse:collapse;"><tr style="background:#f5f5f5;"><th style="padding:8px;text-align:left;border-bottom:1px solid #ddd;">Item</th><th style="padding:8px;text-align:center;">Qty</th><th style="padding:8px;text-align:right;">Price</th></tr><tr><td style="padding:8px;">BBQ Ribs Full Rack<br><small style="color:#666;">Original (2), Spicy (2)</small></td><td style="text-align:center;padding:8px;">1</td><td style="text-align:right;padding:8px;">₱850.00</td></tr></table>',
      '{{order_summary}}': '<table style="width:100%;"><tr><td>Subtotal:</td><td style="text-align:right;">₱1,550.00</td></tr><tr><td>Delivery Fee:</td><td style="text-align:right;">₱75.00</td></tr><tr style="font-weight:bold;"><td>Total:</td><td style="text-align:right;">₱1,625.00</td></tr></table>',
      '{{driver_name}}': 'Pedro Santos',
      '{{driver_phone}}': '09181234567',
      '{{payout_amount}}': '500.00',
      '{{reason}}': 'Customer not reachable',
      '{{business_name}}': 'American Ribs & Wings',
      '{{business_address}}': 'Floridablanca, Pampanga',
    };

    Object.entries(sampleData).forEach(([variable, value]) => {
      preview = preview.replace(new RegExp(variable.replace(/[{}]/g, '\\$&'), 'g'), value);
    });

    preview = preview.replace(/\{\{#if \w+\}\}/g, '');
    preview = preview.replace(/\{\{\/if\}\}/g, '');

    return preview;
  };

  const getEmailTypeLabel = (type: string) => {
    const baseType = type.replace(/_customer$/, '').replace(/_admin$/, '');
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
    return labels[baseType] || { label: baseType, color: 'bg-muted' };
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

  const Pagination = ({ current, total, onChange }: { current: number; total: number; onChange: (page: number) => void }) => {
    if (total <= 1) return null;
    return (
      <div className="flex items-center justify-between px-2 py-4 border-t">
        <p className="text-sm text-muted-foreground">
          Page {current} of {total}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onChange(current - 1)} disabled={current <= 1}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <Button variant="outline" size="sm" onClick={() => onChange(current + 1)} disabled={current >= total}>
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Email Templates</h1>
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
            <Badge variant="secondary" className="ml-1 text-xs">{templates.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <History className="h-4 w-4" />
            Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="mt-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex gap-2">
              <Button
                variant={emailSubTab === 'customer' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleSubTabChange('customer')}
                className="gap-2"
              >
                <Users className="h-4 w-4" />
                Customer
                <Badge variant="secondary" className="ml-1">{customerTemplates.length}</Badge>
              </Button>
              <Button
                variant={emailSubTab === 'admin' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleSubTabChange('admin')}
                className="gap-2"
              >
                <ShieldCheck className="h-4 w-4" />
                Admin
                <Badge variant="secondary" className="ml-1">{adminTemplates.length}</Badge>
              </Button>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {emailSubTab === 'customer' ? <Users className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
                {emailSubTab === 'customer' ? 'Customer Email Templates' : 'Admin Email Templates'}
              </CardTitle>
              <CardDescription>
                {emailSubTab === 'customer' 
                  ? 'Emails sent to customers for order confirmations and updates.'
                  : 'Notification emails sent to admins and owners for order alerts.'
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : paginatedTemplates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>{searchQuery ? 'No templates match your search' : 'No templates found'}</p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Template</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="hidden md:table-cell">Subject</TableHead>
                        <TableHead>Active</TableHead>
                        <TableHead className="w-[120px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedTemplates.map((template) => {
                        const typeInfo = getEmailTypeLabel(template.type);
                        return (
                          <TableRow key={template.id}>
                            <TableCell className="font-medium">{template.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={typeInfo.color}>
                                {typeInfo.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden md:table-cell max-w-[250px] truncate text-sm text-muted-foreground">
                              {template.subject}
                            </TableCell>
                            <TableCell>
                              <Switch
                                checked={template.is_active}
                                onCheckedChange={() => handleToggleActive(template)}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="sm" onClick={() => handleEditTemplate(template)}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => handleOpenTestDialog(template)} title="Send Test Email">
                                  <TestTube className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  <Pagination current={currentPage} total={totalPages} onChange={setCurrentPage} />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="mt-4 space-y-4">
          {/* Analytics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-blue-600" />
                  <span className="text-sm text-muted-foreground">Sent (7d)</span>
                </div>
                <p className="text-2xl font-bold mt-1">{analytics.total}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-muted-foreground">Delivered</span>
                </div>
                <p className="text-2xl font-bold mt-1">{analytics.deliveryRate}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-purple-600" />
                  <span className="text-sm text-muted-foreground">Open Rate</span>
                </div>
                <p className="text-2xl font-bold mt-1">{analytics.openRate}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <span className="text-sm text-muted-foreground">Bounce Rate</span>
                </div>
                <p className="text-2xl font-bold mt-1">{analytics.bounceRate}%</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <History className="h-5 w-5" />
                    Email Delivery Logs
                  </CardTitle>
                  <CardDescription>Track all sent emails and their delivery status</CardDescription>
                </div>
                <div className="flex gap-2">
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search logs..."
                      value={logsSearch}
                      onChange={(e) => { setLogsSearch(e.target.value); setLogsPage(1); }}
                      className="pl-9"
                    />
                  </div>
                  <Button variant="outline" size="icon" onClick={() => refetchLogs()}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingLogs ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No email logs found</p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Recipient</TableHead>
                        <TableHead>Trigger</TableHead>
                        <TableHead className="hidden md:table-cell">Type</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-sm whitespace-nowrap">
                            {format(new Date(log.created_at), 'MMM d, h:mm a')}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium truncate max-w-[180px]">{log.recipient_email}</span>
                              {log.customer_name && (
                                <span className="text-xs text-muted-foreground">{log.customer_name}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <span className="text-sm">{log.trigger_event || log.email_type || '-'}</span>
                              {log.order_number && (
                                <span className="text-xs text-muted-foreground">#{log.order_number}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <Badge variant="outline" className={log.recipient_type === 'admin' ? 'bg-purple-500/20 text-purple-700' : 'bg-blue-500/20 text-blue-700'}>
                              {log.recipient_type === 'admin' ? 'Admin' : 'Customer'}
                            </Badge>
                            {log.is_test && (
                              <Badge variant="outline" className="ml-1 bg-yellow-500/20 text-yellow-700">Test</Badge>
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
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Pagination current={logsPage} total={totalLogsPages} onChange={setLogsPage} />
                </>
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
                  {selectedTemplate.type.endsWith('_customer') ? 'Sent to customers.' : 'Sent to admins.'}
                </SheetDescription>
              </SheetHeader>
              <ScrollArea className="h-[calc(100vh-200px)] mt-6 pr-4">
                <div className="space-y-6">
                  <div className="flex gap-2">
                    {selectedTemplate.type.endsWith('_customer') ? (
                      <Badge className="bg-blue-500/20 text-blue-700"><Users className="h-3 w-3 mr-1" />Customer</Badge>
                    ) : (
                      <Badge className="bg-purple-500/20 text-purple-700"><ShieldCheck className="h-3 w-3 mr-1" />Admin</Badge>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="subject">Subject Line</Label>
                    <Input id="subject" value={editSubject} onChange={(e) => setEditSubject(e.target.value)} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="content">Email Content (HTML)</Label>
                    <Textarea
                      id="content"
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="min-h-[300px] font-mono text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Info className="h-4 w-4 text-muted-foreground" />
                      <Label>Available Variables</Label>
                    </div>
                    <div className="bg-muted rounded-lg p-3 space-y-1 max-h-[150px] overflow-y-auto">
                      {variablesList.map((v) => (
                        <div key={v.variable} className="flex items-center justify-between text-sm">
                          <button onClick={() => copyToClipboard(v.variable)} className="font-mono text-primary hover:underline flex items-center gap-1">
                            {v.variable}<Copy className="h-3 w-3" />
                          </button>
                          <span className="text-muted-foreground text-xs">{v.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-4 border-t">
                    <Button variant="outline" onClick={() => setShowPreview(true)} className="flex-1">
                      <Eye className="h-4 w-4 mr-2" />Preview
                    </Button>
                    <Button variant="outline" onClick={() => handleOpenTestDialog(selectedTemplate)}>
                      <TestTube className="h-4 w-4 mr-2" />Test
                    </Button>
                    <Button onClick={handleSaveTemplate} disabled={updateMutation.isPending} className="flex-1">
                      {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Save
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
              <p className="text-sm">{editSubject.replace(/\{\{order_number\}\}/g, 'ORD-20260108-XYZ789')}</p>
            </div>
            <div className="border rounded-lg p-4 bg-white">
              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: getPreviewHtml() }} />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Test Email Dialog */}
      <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TestTube className="h-5 w-5" />
              Send Test Email
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Send a test email for "<strong>{templateToTest?.name}</strong>" with dummy data. The subject will be prefixed with [TEST].
            </p>
            <div className="space-y-2">
              <Label htmlFor="test-email">Recipient Email</Label>
              <Input
                id="test-email"
                type="email"
                placeholder="your@email.com"
                value={testEmailRecipient}
                onChange={(e) => setTestEmailRecipient(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTestDialog(false)}>Cancel</Button>
            <Button onClick={handleSendTestEmail} disabled={isSendingTest || !testEmailRecipient}>
              {isSendingTest ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Send Test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
