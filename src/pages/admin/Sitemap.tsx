import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { 
  Globe, 
  RefreshCw, 
  ExternalLink, 
  FileText, 
  Package, 
  FolderTree, 
  Home,
  Loader2,
  CheckCircle,
  Clock,
  History,
  Download,
  Copy,
  AlertCircle,
  Eye
} from 'lucide-react';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

type SitemapLog = {
  id: string;
  generated_at: string;
  trigger_type: string;
  triggered_by: string | null;
  total_urls: number;
  product_urls: number;
  category_urls: number;
  static_urls: number;
  sitemap_content: string | null;
  success: boolean;
  error_message: string | null;
};

export default function Sitemap() {
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);

  // Fetch sitemap logs using direct REST call since table is new and not in types yet
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['sitemap-logs'],
    queryFn: async () => {
      // Use REST API directly since sitemap_logs isn't in generated types yet
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      
      const response = await fetch(
        `${supabaseUrl}/rest/v1/sitemap_logs?select=*&order=generated_at.desc&limit=50`,
        {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
          },
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch sitemap logs');
      }
      
      return (await response.json()) as SitemapLog[];
    },
  });

  // Get current stats
  const { data: stats } = useQuery({
    queryKey: ['sitemap-stats'],
    queryFn: async () => {
      const [productsResult, categoriesResult] = await Promise.all([
        supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true)
          .is('archived_at', null),
        supabase
          .from('categories')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true)
          .is('archived_at', null),
      ]);
      
      return {
        products: productsResult.count || 0,
        categories: categoriesResult.count || 0,
        static: 2, // Homepage, Order page
      };
    },
  });

  const lastLog = logs.find(l => l.success);
  const lastSuccessfulSitemap = lastLog?.sitemap_content;
  
  // Dynamic sitemap URL (via edge function)
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const dynamicSitemapUrl = `${supabaseUrl}/functions/v1/serve-sitemap`;
  const staticSitemapUrl = `${window.location.origin}/sitemap.xml`;

  // Generate sitemap mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('generate-sitemap', {
        body: { trigger: 'manual' },
      });
      
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Generation failed');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sitemap-logs'] });
      queryClient.invalidateQueries({ queryKey: ['sitemap-stats'] });
      toast.success(`Sitemap updated with ${data?.totalUrls || 0} URLs`, {
        description: `${data?.productUrls || 0} products, ${data?.categoryUrls || 0} categories`,
      });
    },
    onError: (error) => {
      toast.error('Failed to generate sitemap: ' + (error as Error).message);
    },
  });

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      await generateMutation.mutateAsync();
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadXml = () => {
    if (!lastSuccessfulSitemap) {
      toast.error('No sitemap available. Generate one first.');
      return;
    }
    const blob = new Blob([lastSuccessfulSitemap], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sitemap.xml';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Sitemap downloaded');
  };

  const handleCopyXml = () => {
    if (!lastSuccessfulSitemap) {
      toast.error('No sitemap available. Generate one first.');
      return;
    }
    navigator.clipboard.writeText(lastSuccessfulSitemap);
    toast.success('Sitemap XML copied to clipboard');
  };

  const getTriggerBadge = (type: string) => {
    switch (type) {
      case 'manual':
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-700">Manual</Badge>;
      case 'auto_product':
        return <Badge variant="outline" className="bg-green-500/10 text-green-700">Product Update</Badge>;
      case 'auto_category':
        return <Badge variant="outline" className="bg-purple-500/10 text-purple-700">Category Update</Badge>;
      case 'auto_serve':
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700">Auto-Generated</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  const getStatusBadge = (log: SitemapLog) => {
    if (log.success) {
      return <Badge variant="outline" className="bg-green-500/10 text-green-700"><CheckCircle className="h-3 w-3 mr-1" />Success</Badge>;
    }
    return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Failed</Badge>;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Sitemap Management</h1>
          <p className="text-muted-foreground mt-1">Manage your dynamic XML sitemap for SEO</p>
        </div>
        <Button onClick={handleGenerate} disabled={isGenerating}>
          {isGenerating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Update Sitemap Now
        </Button>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Last Updated</p>
                <p className="text-lg font-semibold">
                  {lastLog 
                    ? format(new Date(lastLog.generated_at), 'MMM d, yyyy')
                    : 'Never'}
                </p>
                {lastLog && (
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(lastLog.generated_at), 'h:mm a')}
                  </p>
                )}
              </div>
              <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                {lastLog ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <Clock className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total URLs</p>
                <p className="text-2xl font-bold">
                  {lastLog?.total_urls || (stats ? stats.products + stats.categories + stats.static : 0)}
                </p>
                <p className="text-xs text-muted-foreground">In sitemap</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Globe className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Product Pages</p>
                <p className="text-2xl font-bold text-orange-600">
                  {lastLog?.product_urls || stats?.products || 0}
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                <Package className="h-5 w-5 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Category Pages</p>
                <p className="text-2xl font-bold text-purple-600">
                  {lastLog?.category_urls || stats?.categories || 0}
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                <FolderTree className="h-5 w-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sitemap URL Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Sitemap URLs
          </CardTitle>
          <CardDescription>
            Submit either URL to Google Search Console for indexing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Dynamic URL */}
          <div>
            <p className="text-sm font-medium mb-2 flex items-center gap-2">
              <Badge variant="default" className="text-xs">Recommended</Badge>
              Dynamic Sitemap (always up-to-date)
            </p>
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <code className="text-xs flex-1 font-mono break-all">{dynamicSitemapUrl}</code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(dynamicSitemapUrl);
                  toast.success('URL copied to clipboard');
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(dynamicSitemapUrl, '_blank')}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Static URL */}
          <div>
            <p className="text-sm font-medium mb-2 text-muted-foreground">Static Sitemap (fallback)</p>
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <code className="text-xs flex-1 font-mono break-all">{staticSitemapUrl}</code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(staticSitemapUrl);
                  toast.success('URL copied to clipboard');
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(staticSitemapUrl, '_blank')}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={handleDownloadXml} disabled={!lastSuccessfulSitemap}>
              <Download className="h-4 w-4 mr-2" />
              Download XML
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopyXml} disabled={!lastSuccessfulSitemap}>
              <Copy className="h-4 w-4 mr-2" />
              Copy XML
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={!lastSuccessfulSitemap}>
                  <Eye className="h-4 w-4 mr-2" />
                  Preview XML
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh]">
                <DialogHeader>
                  <DialogTitle>Sitemap XML Preview</DialogTitle>
                </DialogHeader>
                <ScrollArea className="h-[60vh]">
                  <pre className="text-xs font-mono bg-muted p-4 rounded-lg overflow-x-auto whitespace-pre-wrap">
                    {lastSuccessfulSitemap || 'No sitemap content available'}
                  </pre>
                </ScrollArea>
              </DialogContent>
            </Dialog>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Home className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Homepage (Priority 1.0)</span>
            </div>
            <div className="flex items-center gap-2">
              <FolderTree className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Categories (Priority 0.8)</span>
            </div>
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Products (Priority 0.7)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activity Log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Activity Log
          </CardTitle>
          <CardDescription>
            History of sitemap regenerations
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Globe className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No sitemap updates yet</p>
              <p className="text-sm">Click "Update Sitemap Now" to generate your first sitemap</p>
            </div>
          ) : (
            <ScrollArea className="h-[300px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Triggered By</TableHead>
                    <TableHead className="text-right">Products</TableHead>
                    <TableHead className="text-right">Categories</TableHead>
                    <TableHead className="text-right">Total URLs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">
                            {format(new Date(log.generated_at), 'MMM d, yyyy')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(log.generated_at), 'h:mm a')}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(log)}</TableCell>
                      <TableCell>{getTriggerBadge(log.trigger_type)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {log.triggered_by || 'System'}
                      </TableCell>
                      <TableCell className="text-right">{log.product_urls}</TableCell>
                      <TableCell className="text-right">{log.category_urls}</TableCell>
                      <TableCell className="text-right font-medium">{log.total_urls}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
