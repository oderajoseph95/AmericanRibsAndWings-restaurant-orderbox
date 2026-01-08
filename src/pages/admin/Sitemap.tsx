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
  History
} from 'lucide-react';
import { format } from 'date-fns';

type SitemapLog = {
  id: string;
  generated_at: string;
  trigger_type: string;
  triggered_by: string | null;
  total_urls: number;
  product_urls: number;
  category_urls: number;
  static_urls: number;
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

  const lastLog = logs[0];
  const sitemapUrl = `${window.location.origin}/sitemap.xml`;

  // Generate sitemap mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('generate-sitemap', {
        body: { trigger: 'manual' },
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sitemap-logs'] });
      toast.success(`Sitemap updated with ${data?.totalUrls || 0} URLs`);
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

  const getTriggerBadge = (type: string) => {
    switch (type) {
      case 'manual':
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-700">Manual</Badge>;
      case 'auto_product':
        return <Badge variant="outline" className="bg-green-500/10 text-green-700">Product Update</Badge>;
      case 'auto_category':
        return <Badge variant="outline" className="bg-purple-500/10 text-purple-700">Category Update</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
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
            Sitemap URL
          </CardTitle>
          <CardDescription>
            Submit this URL to Google Search Console for indexing
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <code className="text-sm flex-1 font-mono">{sitemapUrl}</code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(sitemapUrl);
                toast.success('URL copied to clipboard');
              }}
            >
              Copy
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(sitemapUrl, '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View
            </Button>
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
