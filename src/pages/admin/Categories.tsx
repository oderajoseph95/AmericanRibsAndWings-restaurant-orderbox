import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { logAdminAction } from '@/lib/adminLogger';
import { Plus, Pencil, Archive, ArchiveRestore, GripVertical, Loader2, Upload, ImageIcon, Trash2 } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

type CategoryWithImage = Tables<'categories'> & {
  image_url?: string | null;
};

export default function Categories() {
  const { role } = useAuth();
  const canEdit = role === 'owner' || role === 'manager';
  const isOwner = role === 'owner';
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryWithImage | null>(null);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const imageInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['categories', showArchived],
    queryFn: async () => {
      let query = supabase
        .from('categories')
        .select('*')
        .order('sort_order');

      if (showArchived) {
        query = query.not('archived_at', 'is', null);
      } else {
        query = query.is('archived_at', null);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as CategoryWithImage[];
    },
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `categories/${fileName}`;

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
    mutationFn: async (category: { name: string; is_active?: boolean; image_url?: string | null }) => {
      if (editingCategory) {
        const { error } = await supabase
          .from('categories')
          .update(category)
          .eq('id', editingCategory.id);
        if (error) throw error;

        // Log update
        await logAdminAction({
          action: 'update',
          entityType: 'category',
          entityId: editingCategory.id,
          entityName: category.name,
          oldValues: { name: editingCategory.name, is_active: editingCategory.is_active },
          newValues: { name: category.name, is_active: category.is_active },
        });
      } else {
        const maxSort = categories.reduce((max, c) => Math.max(max, c.sort_order || 0), 0);
        const { data, error } = await supabase.from('categories').insert({
          name: category.name,
          is_active: category.is_active,
          sort_order: maxSort + 1,
          image_url: category.image_url,
        }).select().single();
        if (error) throw error;

        // Log create
        await logAdminAction({
          action: 'create',
          entityType: 'category',
          entityId: data.id,
          entityName: category.name,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success(editingCategory ? 'Category updated' : 'Category created');
      setDialogOpen(false);
      setEditingCategory(null);
      setImageUrl('');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to save category');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async ({ id, name, archive }: { id: string; name: string; archive: boolean }) => {
      const { error } = await supabase
        .from('categories')
        .update({ archived_at: archive ? new Date().toISOString() : null })
        .eq('id', id);
      if (error) throw error;

      await logAdminAction({
        action: archive ? 'delete' : 'update',
        entityType: 'category',
        entityId: id,
        entityName: name,
        details: archive ? 'Archived category' : 'Restored category',
      });
    },
    onSuccess: (_, { archive }) => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success(archive ? 'Category archived' : 'Category restored');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;

      await logAdminAction({
        action: 'delete',
        entityType: 'category',
        entityId: id,
        entityName: name,
        details: 'Permanently deleted category',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setSelectedIds(new Set());
      toast.success('Category deleted permanently');
    },
    onError: (error: any) => {
      if (error.message?.includes('violates foreign key constraint')) {
        toast.error('Cannot delete: Category has products. Archive instead.');
      } else {
        toast.error(error.message || 'Failed to delete category');
      }
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('categories').delete().in('id', ids);
      if (error) throw error;

      await logAdminAction({
        action: 'delete',
        entityType: 'category',
        entityId: ids.join(','),
        entityName: `${ids.length} categories`,
        details: `Permanently deleted ${ids.length} categories`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setSelectedIds(new Set());
      toast.success('Categories deleted permanently');
    },
    onError: (error: any) => {
      if (error.message?.includes('violates foreign key constraint')) {
        toast.error('Cannot delete: Some categories have products. Archive instead.');
      } else {
        toast.error(error.message || 'Failed to delete categories');
      }
    },
  });

  const toggleSelectAll = () => {
    if (selectedIds.size === categories.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(categories.map(c => c.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    saveMutation.mutate({
      name: form.get('name') as string,
      is_active: form.get('is_active') === 'on',
      image_url: imageUrl || editingCategory?.image_url || null,
    });
  };

  const openEditDialog = (category: CategoryWithImage) => {
    setEditingCategory(category);
    setImageUrl(category.image_url || '');
    setDialogOpen(true);
  };

  const openNewDialog = () => {
    setEditingCategory(null);
    setImageUrl('');
    setDialogOpen(true);
  };

  const currentImageUrl = imageUrl || editingCategory?.image_url;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Categories</h1>
          <p className="text-muted-foreground mt-1">
            Organize your menu items
          </p>
        </div>
        {canEdit && (
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              setEditingCategory(null);
              setImageUrl('');
            }
          }}>
            <DialogTrigger asChild>
              <Button onClick={openNewDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Add Category
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingCategory ? 'Edit Category' : 'New Category'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Category Image Upload */}
                <div className="space-y-2">
                  <Label>Category Image</Label>
                  <p className="text-xs text-muted-foreground">Recommended: 600×400px (landscape)</p>
                  <div className="flex items-start gap-4">
                    <div className="w-24 h-16 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center overflow-hidden bg-muted">
                      {currentImageUrl ? (
                        <img 
                          src={currentImageUrl} 
                          alt="Category" 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
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
                    defaultValue={editingCategory?.name || ''}
                    required
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="is_active"
                    name="is_active"
                    defaultChecked={editingCategory?.is_active ?? true}
                  />
                  <Label htmlFor="is_active">Active</Label>
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
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">All Categories</CardTitle>
            <div className="flex items-center gap-4">
              {isOwner && selectedIds.size > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete ({selectedIds.size})
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {selectedIds.size} category(s)?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete the selected categories. Categories with products cannot be deleted - archive them instead.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete Permanently
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
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
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No categories found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {isOwner && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedIds.size === categories.length && categories.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                  )}
                  <TableHead className="w-10"></TableHead>
                  <TableHead className="w-16">Image</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Order</TableHead>
                  {canEdit && <TableHead className="w-[120px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((category) => (
                  <TableRow key={category.id}>
                    {isOwner && (
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(category.id)}
                          onCheckedChange={() => toggleSelect(category.id)}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                    <TableCell>
                      <div className="w-12 h-8 rounded bg-muted flex items-center justify-center overflow-hidden">
                        {category.image_url ? (
                          <img 
                            src={category.image_url} 
                            alt={category.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{category.name}</TableCell>
                    <TableCell>
                      <Badge variant={category.is_active ? 'default' : 'secondary'}>
                        {category.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {category.sort_order}
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(category)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              archiveMutation.mutate({
                                id: category.id,
                                name: category.name,
                                archive: !category.archived_at,
                              })
                            }
                          >
                            {category.archived_at ? (
                              <ArchiveRestore className="h-4 w-4" />
                            ) : (
                              <Archive className="h-4 w-4" />
                            )}
                          </Button>
                          {isOwner && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete "{category.name}"?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently delete this category. Categories with products cannot be deleted - archive them instead.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteMutation.mutate({ id: category.id, name: category.name })}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
