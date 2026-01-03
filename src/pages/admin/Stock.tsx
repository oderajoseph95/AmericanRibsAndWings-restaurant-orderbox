import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Minus, History, Loader2, AlertTriangle, Search } from 'lucide-react';
import { format } from 'date-fns';
import type { Tables } from '@/integrations/supabase/types';

type StockWithProduct = Tables<'stock'> & {
  products: Tables<'products'> | null;
};

export default function Stock() {
  const { role, user } = useAuth();
  const canEdit = role === 'owner' || role === 'manager';
  const [search, setSearch] = useState('');
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState<StockWithProduct | null>(null);
  const [adjustType, setAdjustType] = useState<'add' | 'deduct'>('add');
  const queryClient = useQueryClient();

  const { data: stocks = [], isLoading } = useQuery({
    queryKey: ['stocks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock')
        .select('*, products(*)')
        .eq('is_enabled', true)
        .order('current_stock');
      if (error) throw error;
      return data as StockWithProduct[];
    },
  });

  const { data: adjustments = [] } = useQuery({
    queryKey: ['stock-adjustments', selectedStock?.id],
    queryFn: async () => {
      if (!selectedStock) return [];
      const { data, error } = await supabase
        .from('stock_adjustments')
        .select('*')
        .eq('stock_id', selectedStock.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedStock && historyDialogOpen,
  });

  const adjustMutation = useMutation({
    mutationFn: async ({
      stockId,
      productId,
      type,
      quantity,
      notes,
    }: {
      stockId: string;
      productId: string;
      type: 'add' | 'deduct';
      quantity: number;
      notes: string;
    }) => {
      const stock = stocks.find((s) => s.id === stockId);
      if (!stock) throw new Error('Stock not found');

      const previousQty = stock.current_stock || 0;
      const change = type === 'add' ? quantity : -quantity;
      const newQty = previousQty + change;

      if (newQty < 0) throw new Error('Cannot deduct more than current stock');

      // Update stock
      const { error: stockError } = await supabase
        .from('stock')
        .update({ current_stock: newQty })
        .eq('id', stockId);
      if (stockError) throw stockError;

      // Log adjustment
      const { error: adjustError } = await supabase.from('stock_adjustments').insert({
        stock_id: stockId,
        product_id: productId,
        adjustment_type: type === 'add' ? 'manual_add' : 'manual_deduct',
        quantity_change: change,
        previous_quantity: previousQty,
        new_quantity: newQty,
        adjusted_by: user?.id,
        notes,
      });
      if (adjustError) throw adjustError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
      toast.success('Stock adjusted');
      setAdjustDialogOpen(false);
      setSelectedStock(null);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to adjust stock');
    },
  });

  const lowStockItems = stocks.filter(
    (s) => (s.current_stock || 0) <= (s.low_stock_threshold || 10)
  );

  const filteredStocks = stocks.filter((s) =>
    s.products?.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleAdjustSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedStock) return;

    const form = new FormData(e.currentTarget);
    adjustMutation.mutate({
      stockId: selectedStock.id,
      productId: selectedStock.product_id,
      type: adjustType,
      quantity: parseInt(form.get('quantity') as string),
      notes: form.get('notes') as string,
    });
  };

  const openAdjustDialog = (stock: StockWithProduct, type: 'add' | 'deduct') => {
    setSelectedStock(stock);
    setAdjustType(type);
    setAdjustDialogOpen(true);
  };

  const openHistoryDialog = (stock: StockWithProduct) => {
    setSelectedStock(stock);
    setHistoryDialogOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Stock Management</h1>
        <p className="text-muted-foreground mt-1">
          Track and manage inventory levels
        </p>
      </div>

      {lowStockItems.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Low Stock Alert
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {lowStockItems.map((item) => (
                <Badge key={item.id} variant="destructive">
                  {item.products?.name}: {item.current_stock} left
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div>
              <CardTitle className="text-lg">Inventory</CardTitle>
              <CardDescription>
                {stocks.length} products with stock tracking enabled
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredStocks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No products with stock tracking. Enable stock tracking on products to manage inventory.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-center">Current Stock</TableHead>
                  <TableHead className="text-center">Threshold</TableHead>
                  <TableHead>Status</TableHead>
                  {canEdit && <TableHead className="w-[180px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStocks.map((stock) => {
                  const isLow = (stock.current_stock || 0) <= (stock.low_stock_threshold || 10);
                  return (
                    <TableRow key={stock.id}>
                      <TableCell className="font-medium">
                        {stock.products?.name}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={isLow ? 'text-destructive font-semibold' : ''}>
                          {stock.current_stock}
                        </span>
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground">
                        {stock.low_stock_threshold}
                      </TableCell>
                      <TableCell>
                        {isLow ? (
                          <Badge variant="destructive">Low Stock</Badge>
                        ) : (
                          <Badge variant="secondary">In Stock</Badge>
                        )}
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openAdjustDialog(stock, 'add')}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openAdjustDialog(stock, 'deduct')}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openHistoryDialog(stock)}
                            >
                              <History className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Adjust Stock Dialog */}
      <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {adjustType === 'add' ? 'Add Stock' : 'Deduct Stock'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdjustSubmit} className="space-y-4">
            <div className="p-3 bg-muted rounded-lg">
              <p className="font-medium">{selectedStock?.products?.name}</p>
              <p className="text-sm text-muted-foreground">
                Current: {selectedStock?.current_stock} units
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity *</Label>
              <Input
                id="quantity"
                name="quantity"
                type="number"
                required
                min={1}
                placeholder="Enter quantity"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Reason / Notes</Label>
              <Textarea
                id="notes"
                name="notes"
                placeholder="e.g., Received new shipment, damaged items removed"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAdjustDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant={adjustType === 'add' ? 'default' : 'destructive'}
                disabled={adjustMutation.isPending}
              >
                {adjustMutation.isPending
                  ? 'Saving...'
                  : adjustType === 'add'
                  ? 'Add Stock'
                  : 'Deduct Stock'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Stock History</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="font-medium">{selectedStock?.products?.name}</p>
            <div className="max-h-[400px] overflow-y-auto space-y-2">
              {adjustments.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4 text-center">
                  No adjustments recorded yet
                </p>
              ) : (
                adjustments.map((adj) => (
                  <div
                    key={adj.id}
                    className="flex items-center justify-between p-3 bg-muted rounded-lg"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {adj.adjustment_type?.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase())}
                      </p>
                      {adj.notes && (
                        <p className="text-xs text-muted-foreground">{adj.notes}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {adj.created_at && format(new Date(adj.created_at), 'MMM d, h:mm a')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={`font-semibold ${
                          adj.quantity_change > 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {adj.quantity_change > 0 ? '+' : ''}
                        {adj.quantity_change}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {adj.previous_quantity} → {adj.new_quantity}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
