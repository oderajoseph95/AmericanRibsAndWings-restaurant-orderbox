import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { logAdminAction } from '@/lib/adminLogger';
import { Plus, Pencil, Archive, ArchiveRestore, Search, Loader2, Upload, ImageIcon } from 'lucide-react';
import type { Tables, Enums } from '@/integrations/supabase/types';

type Product = Tables<'products'> & {
  categories: Tables<'categories'> | null;
};

const productTypeLabels: Record<Enums<'product_type'>, string> = {
  simple: 'Simple',
  flavored: 'Flavored',
  bundle: 'Bundle',
  unlimited: 'Unlimited',
};

const productTypeBadgeColors: Record<Enums<'product_type'>, string> = {
  simple: 'bg-gray-500/20 text-gray-700',
  flavored: 'bg-orange-500/20 text-orange-700',
  bundle: 'bg-purple-500/20 text-purple-700',
  unlimited: 'bg-green-500/20 text-green-700',
};

export default function Products() {
  const { role } = useAuth();
  const canEdit = role === 'owner' || role === 'manager';
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;
  const imageInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', showArchived],
    queryFn: async () => {
      let query = supabase
        .from('products')
        .select('*, categories(*)')
        .order('name');

      if (showArchived) {
        query = query.not('archived_at', 'is', null);
      } else {
        query = query.is('archived_at', null);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Product[];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .is('archived_at', null)
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `products/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      setImageUrl(publicUrl);
      toast.success('Image uploaded');
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload image');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async (product: Partial<Tables<'products'>> & { name: string }) => {
      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update(product)
          .eq('id', editingProduct.id);
        if (error) throw error;

        // Log update
        await logAdminAction({
          action: 'update',
          entityType: 'product',
          entityId: editingProduct.id,
          entityName: product.name,
          oldValues: { name: editingProduct.name, price: editingProduct.price, is_active: editingProduct.is_active },
          newValues: { name: product.name, price: product.price, is_active: product.is_active },
        });
      } else {
        const { data, error } = await supabase.from('products').insert({
          name: product.name,
          sku: product.sku,
          description: product.description,
          price: product.price ?? 0,
          category_id: product.category_id,
          product_type: product.product_type,
          is_active: product.is_active,
          stock_enabled: product.stock_enabled,
          image_url: product.image_url,
        }).select().single();
        if (error) throw error;

        // Log create
        await logAdminAction({
          action: 'create',
          entityType: 'product',
          entityId: data.id,
          entityName: product.name,
          newValues: { name: product.name, price: product.price, product_type: product.product_type },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(editingProduct ? 'Product updated' : 'Product created');
      setDialogOpen(false);
      setEditingProduct(null);
      setImageUrl('');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to save product');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async ({ id, name, archive }: { id: string; name: string; archive: boolean }) => {
      const { error } = await supabase
        .from('products')
        .update({ archived_at: archive ? new Date().toISOString() : null })
        .eq('id', id);
      if (error) throw error;

      // Log archive/restore
      await logAdminAction({
        action: archive ? 'delete' : 'update',
        entityType: 'product',
        entityId: id,
        entityName: name,
        details: archive ? 'Archived product' : 'Restored product',
      });
    },
    onSuccess: (_, { archive }) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(archive ? 'Product archived' : 'Product restored');
    },
  });

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku?.toLowerCase().includes(search.toLowerCase())
  );

  // Paginate filtered results
  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, showArchived]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const productType = form.get('product_type') as Enums<'product_type'>;
    
    saveMutation.mutate({
      name: form.get('name') as string,
      sku: form.get('sku') as string,
      description: form.get('description') as string,
      price: parseFloat(form.get('price') as string) || 0,
      category_id: form.get('category_id') as string || null,
      product_type: productType,
      is_active: form.get('is_active') === 'on',
      stock_enabled: productType !== 'unlimited' && form.get('stock_enabled') === 'on',
      image_url: imageUrl || editingProduct?.image_url || null,
    });
  };

  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    setImageUrl(product.image_url || '');
    setDialogOpen(true);
  };

  const openNewDialog = () => {
    setEditingProduct(null);
    setImageUrl('');
    setDialogOpen(true);
  };

  const currentImageUrl = imageUrl || editingProduct?.image_url;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Products</h1>
          <p className="text-muted-foreground mt-1">
            {products.length} products {showArchived ? '(archived)' : ''}
          </p>
        </div>
        {canEdit && (
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              setEditingProduct(null);
              setImageUrl('');
            }
          }}>
            <DialogTrigger asChild>
              <Button onClick={openNewDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Add Product
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingProduct ? 'Edit Product' : 'New Product'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4">
                  {/* Product Image Upload */}
                  <div className="space-y-2">
                    <Label>Product Image</Label>
                    <p className="text-xs text-muted-foreground">Recommended: 400×400px (square)</p>
                    <div className="flex items-start gap-4">
                      <div className="w-24 h-24 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center overflow-hidden bg-muted">
                        {currentImageUrl ? (
                          <img 
                            src={currentImageUrl} 
                            alt="Product" 
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
                        )}
                      </div>
                      <div className="flex-1">
                        <input
                          ref={imageInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="hidden"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => imageInputRef.current?.click()}
                          disabled={isUploadingImage}
                        >
                          {isUploadingImage ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4 mr-2" />
                          )}
                          {currentImageUrl ? 'Change Image' : 'Upload Image'}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="name">Name *</Label>
                    <Input
                      id="name"
                      name="name"
                      defaultValue={editingProduct?.name || ''}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="sku">SKU</Label>
                      <Input
                        id="sku"
                        name="sku"
                        defaultValue={editingProduct?.sku || ''}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="price">Price (₱) *</Label>
                      <Input
                        id="price"
                        name="price"
                        type="number"
                        step="0.01"
                        defaultValue={editingProduct?.price || 0}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      name="description"
                      defaultValue={editingProduct?.description || ''}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="category_id">Category</Label>
                      <Select
                        name="category_id"
                        defaultValue={editingProduct?.category_id || ''}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="product_type">Product Type</Label>
                      <Select
                        name="product_type"
                        defaultValue={editingProduct?.product_type || 'simple'}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="simple">Simple</SelectItem>
                          <SelectItem value="flavored">Flavored</SelectItem>
                          <SelectItem value="bundle">Bundle</SelectItem>
                          <SelectItem value="unlimited">Unlimited</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="is_active"
                        name="is_active"
                        defaultChecked={editingProduct?.is_active ?? true}
                      />
                      <Label htmlFor="is_active">Active</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="stock_enabled"
                        name="stock_enabled"
                        defaultChecked={editingProduct?.stock_enabled ?? false}
                      />
                      <Label htmlFor="stock_enabled">Track Stock</Label>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="show-archived"
                checked={showArchived}
                onCheckedChange={setShowArchived}
              />
              <Label htmlFor="show-archived" className="text-sm">
                Show Archived
              </Label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No products found
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Image</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead>Status</TableHead>
                      {canEdit && <TableHead className="w-[100px]"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedProducts.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell>
                          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center overflow-hidden">
                            {product.image_url ? (
                              <img 
                                src={product.image_url} 
                                alt={product.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <ImageIcon className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {product.sku}
                        </TableCell>
                        <TableCell>{product.categories?.name || '-'}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={productTypeBadgeColors[product.product_type || 'simple']}
                          >
                            {productTypeLabels[product.product_type || 'simple']}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          ₱{product.price.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={product.is_active ? 'default' : 'secondary'}>
                            {product.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        {canEdit && (
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditDialog(product)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  archiveMutation.mutate({
                                    id: product.id,
                                    name: product.name,
                                    archive: !product.archived_at,
                                  })
                                }
                              >
                                {product.archived_at ? (
                                  <ArchiveRestore className="h-4 w-4" />
                                ) : (
                                  <Archive className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t mt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredProducts.length)} of {filteredProducts.length} products
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <span className="text-sm px-2">Page {currentPage} of {totalPages}</span>
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
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
