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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { 
  MessageSquare, 
  Loader2, 
  Edit, 
  Copy, 
  RefreshCw, 
  Info, 
  History, 
  CheckCircle, 
  XCircle, 
  Send,
  Phone,
  AlertCircle,
  Users
} from 'lucide-react';
import { format } from 'date-fns';

type SmsTemplate = {
  id: string;
  type: string;
  name: string;
  content: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type SmsLog = {
  id: string;
  recipient_phone: string;
  sms_type: string | null;
  message: string;
  status: string | null;
  message_id: string | null;
  order_id: string | null;
  network: string | null;
  created_at: string | null;
  metadata: any;
};

const smsVariables = [
  { variable: '{{order_number}}', description: 'Order number (e.g., ORD-20260108-1234)' },
  { variable: '{{customer_name}}', description: 'Customer\'s name' },
  { variable: '{{total_amount}}', description: 'Order total (e.g., 1,250.00)' },
  { variable: '{{driver_name}}', description: 'Assigned driver\'s name' },
  { variable: '{{driver_phone}}', description: 'Driver\'s phone number' },
  { variable: '{{delivery_address}}', description: 'Delivery address' },
  { variable: '{{reason}}', description: 'Rejection/cancellation reason' },
];

const SMS_CHAR_LIMIT = 160;

export default function Sms() {
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState<SmsTemplate | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('templates');
  
  // Test SMS state
  const [testPhone, setTestPhone] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Fetch SMS templates
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['sms-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sms_templates')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as SmsTemplate[];
    },
  });

  // Fetch SMS logs
  const { data: smsLogs = [], isLoading: isLoadingLogs, refetch: refetchLogs } = useQuery({
    queryKey: ['sms-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sms_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as SmsLog[];
    },
  });

  // Update SMS template mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, content, is_active }: { id: string; content?: string; is_active?: boolean }) => {
      const updates: Partial<SmsTemplate> = {};
      if (content !== undefined) updates.content = content;
      if (is_active !== undefined) updates.is_active = is_active;
      
      const { error } = await supabase
        .from('sms_templates')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sms-templates'] });
      toast.success('SMS template saved');
      setSelectedTemplate(null);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to save template');
    },
  });

  const handleEditTemplate = (template: SmsTemplate) => {
    setSelectedTemplate(template);
    setEditContent(template.content);
  };

  const handleSaveTemplate = () => {
    if (!selectedTemplate) return;
    updateMutation.mutate({
      id: selectedTemplate.id,
      content: editContent,
    });
  };

  const handleToggleActive = (template: SmsTemplate) => {
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
    await queryClient.invalidateQueries({ queryKey: ['sms-templates'] });
    await queryClient.invalidateQueries({ queryKey: ['sms-logs'] });
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleSendTestSms = async () => {
    if (!testPhone || testPhone.length < 11) {
      toast.error('Please enter a valid phone number');
      return;
    }
    
    setIsSendingTest(true);
    setTestResult(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('send-sms-notification', {
        body: { 
          type: 'test',
          recipientPhone: testPhone,
        },
      });
      
      if (error) {
        setTestResult({ success: false, message: error.message });
        toast.error('Test SMS failed: ' + error.message);
      } else if (data?.success) {
        setTestResult({ success: true, message: `SMS sent successfully! Sent to ${data.sentCount || 1} recipient(s).` });
        toast.success('Test SMS sent successfully!');
        refetchLogs();
      } else {
        setTestResult({ success: false, message: data?.error || 'Unknown error' });
        toast.error('Test SMS failed');
      }
    } catch (error: any) {
      setTestResult({ success: false, message: error.message || 'Failed to send' });
      toast.error('Failed to send test SMS');
    } finally {
      setIsSendingTest(false);
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, { label: string; color: string }> = {
      order_received: { label: 'Order Received', color: 'bg-blue-500/20 text-blue-700' },
      payment_verified: { label: 'Payment Verified', color: 'bg-green-500/20 text-green-700' },
      order_rejected: { label: 'Rejected', color: 'bg-red-500/20 text-red-700' },
      order_cancelled: { label: 'Cancelled', color: 'bg-gray-500/20 text-gray-700' },
      order_preparing: { label: 'Preparing', color: 'bg-orange-500/20 text-orange-700' },
      order_ready_for_pickup: { label: 'Ready for Pickup', color: 'bg-emerald-500/20 text-emerald-700' },
      driver_assigned: { label: 'Driver Assigned', color: 'bg-purple-500/20 text-purple-700' },
      order_out_for_delivery: { label: 'Out for Delivery', color: 'bg-indigo-500/20 text-indigo-700' },
      order_delivered: { label: 'Delivered', color: 'bg-green-500/20 text-green-700' },
      order_completed: { label: 'Completed', color: 'bg-emerald-500/20 text-emerald-700' },
      test: { label: 'Test', color: 'bg-gray-500/20 text-gray-700' },
    };
    return labels[type] || { label: type, color: 'bg-muted' };
  };

  const getStatusBadge = (status: string | null) => {
    if (status === 'sent') return 'bg-green-500/20 text-green-700';
    if (status === 'failed') return 'bg-red-500/20 text-red-700';
    return 'bg-muted text-muted-foreground';
  };

  // Calculate character count and SMS segments
  const charCount = editContent.length;
  const smsSegments = Math.ceil(charCount / SMS_CHAR_LIMIT) || 1;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">SMS Management</h1>
          <p className="text-muted-foreground mt-1">Manage SMS templates, view logs, and send test messages</p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Recipients Info Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" />
            SMS Recipients
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="flex items-start gap-2">
            <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-500/30">Customer</Badge>
            <span className="text-muted-foreground">The customer's phone number (always required at checkout)</span>
          </div>
          <div className="flex items-start gap-2">
            <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30">Admin Backup</Badge>
            <span className="text-muted-foreground">+63 921 408 0286, +63 956 966 9710 (receives all SMS copies)</span>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="templates" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Templates
            <Badge variant="secondary" className="ml-1 text-xs">{templates.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <History className="h-4 w-4" />
            Logs
            {smsLogs.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{smsLogs.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="test" className="gap-2">
            <Send className="h-4 w-4" />
            Test SMS
          </TabsTrigger>
        </TabsList>

        {/* Templates Tab */}
        <TabsContent value="templates" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                SMS Templates
              </CardTitle>
              <CardDescription>
                Edit content for each SMS type. Use variables like {"{{order_number}}"} to insert dynamic data. Max 160 characters per SMS segment.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No SMS templates found</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Template</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Content Preview</TableHead>
                      <TableHead>Chars</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templates.map((template) => {
                      const typeInfo = getTypeLabel(template.type);
                      return (
                        <TableRow key={template.id}>
                          <TableCell className="font-medium">{template.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={typeInfo.color}>
                              {typeInfo.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[300px] truncate text-sm text-muted-foreground">
                            {template.content}
                          </TableCell>
                          <TableCell>
                            <span className={template.content.length > SMS_CHAR_LIMIT ? 'text-amber-600' : 'text-muted-foreground'}>
                              {template.content.length}
                            </span>
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

          {/* Variables Reference */}
          <Card className="mt-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Info className="h-4 w-4" />
                Available Variables
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {smsVariables.map((v) => (
                  <div key={v.variable} className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
                    <div>
                      <code className="text-xs font-mono bg-background px-1.5 py-0.5 rounded">{v.variable}</code>
                      <p className="text-xs text-muted-foreground mt-0.5">{v.description}</p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6"
                      onClick={() => copyToClipboard(v.variable)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <History className="h-5 w-5" />
                    SMS Delivery Logs
                  </CardTitle>
                  <CardDescription>
                    Track all SMS sent via Semaphore API
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetchLogs()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingLogs ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : smsLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No SMS logs yet</p>
                  <p className="text-sm mt-1">SMS will appear here once they are sent</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Recipient</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Network</TableHead>
                        <TableHead>Message ID</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {smsLogs.map((log) => {
                        const typeInfo = getTypeLabel(log.sms_type || 'unknown');
                        return (
                          <TableRow key={log.id}>
                            <TableCell className="text-sm">
                              {log.created_at ? format(new Date(log.created_at), 'MMM d, h:mm a') : '-'}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {log.recipient_phone}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={typeInfo.color}>
                                {typeInfo.label}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                {log.status === 'sent' ? (
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-red-600" />
                                )}
                                <Badge variant="outline" className={getStatusBadge(log.status)}>
                                  {log.status || 'unknown'}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {log.network || '-'}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {log.message_id ? log.message_id.substring(0, 12) + '...' : '-'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Test SMS Tab */}
        <TabsContent value="test" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Send Test SMS
              </CardTitle>
              <CardDescription>
                Send a test SMS to verify your Semaphore integration is working correctly
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="test-phone">Phone Number</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="test-phone"
                      placeholder="09171234567"
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Button 
                    onClick={handleSendTestSms} 
                    disabled={isSendingTest || !testPhone}
                  >
                    {isSendingTest ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Send Test
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Enter a Philippine phone number (e.g., 09171234567 or +639171234567)
                </p>
              </div>

              {testResult && (
                <Alert className={testResult.success ? 'border-green-500/50 bg-green-500/10' : 'border-red-500/50 bg-red-500/10'}>
                  {testResult.success ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-600" />
                  )}
                  <AlertDescription className={testResult.success ? 'text-green-700' : 'text-red-700'}>
                    {testResult.message}
                  </AlertDescription>
                </Alert>
              )}

              <div className="rounded-lg border bg-muted/30 p-4">
                <h4 className="font-medium text-sm mb-2">Test Message Preview</h4>
                <p className="text-sm text-muted-foreground italic">
                  "American Ribs & Wings: This is a test SMS. If you received this, SMS notifications are working!"
                </p>
              </div>
            </CardContent>
          </Card>

          {/* SMS Events Reference */}
          <Card className="mt-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Info className="h-4 w-4" />
                When SMS Notifications Are Sent
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-3 p-2 rounded-md bg-muted/50">
                  <Badge className="bg-blue-500/20 text-blue-700">Order Received</Badge>
                  <span className="text-muted-foreground">When customer places an order at checkout</span>
                </div>
                <div className="flex items-center gap-3 p-2 rounded-md bg-muted/50">
                  <Badge className="bg-green-500/20 text-green-700">Payment Verified</Badge>
                  <span className="text-muted-foreground">When admin approves payment (status → approved)</span>
                </div>
                <div className="flex items-center gap-3 p-2 rounded-md bg-muted/50">
                  <Badge className="bg-purple-500/20 text-purple-700">Driver Assigned</Badge>
                  <span className="text-muted-foreground">When a driver is assigned to delivery order</span>
                </div>
                <div className="flex items-center gap-3 p-2 rounded-md bg-muted/50">
                  <Badge className="bg-orange-500/20 text-orange-700">Out for Delivery</Badge>
                  <span className="text-muted-foreground">When driver picks up order (picked_up/in_transit)</span>
                </div>
                <div className="flex items-center gap-3 p-2 rounded-md bg-muted/50">
                  <Badge className="bg-emerald-500/20 text-emerald-700">Delivered</Badge>
                  <span className="text-muted-foreground">When order is marked as delivered</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Template Sheet */}
      <Sheet open={!!selectedTemplate} onOpenChange={() => setSelectedTemplate(null)}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Edit SMS Template</SheetTitle>
            <SheetDescription>
              {selectedTemplate?.name} - {getTypeLabel(selectedTemplate?.type || '').label}
            </SheetDescription>
          </SheetHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="sms-content">Message Content</Label>
                <div className="flex items-center gap-2 text-xs">
                  <span className={charCount > SMS_CHAR_LIMIT ? 'text-amber-600 font-medium' : 'text-muted-foreground'}>
                    {charCount} / {SMS_CHAR_LIMIT}
                  </span>
                  {smsSegments > 1 && (
                    <Badge variant="outline" className="text-xs">
                      {smsSegments} SMS segments
                    </Badge>
                  )}
                </div>
              </div>
              <Textarea
                id="sms-content"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={6}
                className="font-mono text-sm"
              />
              {charCount > SMS_CHAR_LIMIT && (
                <p className="text-xs text-amber-600">
                  Message exceeds 160 characters and will be sent as {smsSegments} SMS segments (may incur additional charges)
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Quick Insert Variables</Label>
              <div className="flex flex-wrap gap-1">
                {smsVariables.map((v) => (
                  <Button
                    key={v.variable}
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setEditContent(prev => prev + v.variable)}
                  >
                    {v.variable}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <SheetFooter>
            <Button variant="outline" onClick={() => setSelectedTemplate(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTemplate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Template'
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
