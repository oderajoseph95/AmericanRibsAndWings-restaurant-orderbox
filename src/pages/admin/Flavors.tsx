import { useState } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { logAdminAction } from '@/lib/adminLogger';
import { Plus, Pencil, Archive, ArchiveRestore, Loader2, Trash2 } from 'lucide-react';
import type { Tables, Enums } from '@/integrations/supabase/types';

export default function Flavors() {
  const { role } = useAuth();
  const canEdit = role === 'owner' || role === 'manager';
  const isOwner = role === 'owner';
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFlavor, setEditingFlavor] = useState<Tables<'flavors'> | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const { data: flavors = [], isLoading } = useQuery({
    queryKey: ['flavors', showArchived],
    queryFn: async () => {
      let query = supabase.from('flavors').select('*').order('sort_order');

      if (showArchived) {
        query = query.not('archived_at', 'is', null);
      } else {
        query = query.is('archived_at', null);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (flavor: { name: string; flavor_type?: Enums<'flavor_type'>; surcharge?: number; is_active?: boolean; is_available?: boolean }) => {
      if (editingFlavor) {
        const { error } = await supabase
          .from('flavors')
          .update(flavor)
          .eq('id', editingFlavor.id);
        if (error) throw error;

        // Log update
        await logAdminAction({
          action: 'update',
          entityType: 'flavor',
          entityId: editingFlavor.id,
          entityName: flavor.name,
          oldValues: { name: editingFlavor.name, flavor_type: editingFlavor.flavor_type, is_active: editingFlavor.is_active },
          newValues: { name: flavor.name, flavor_type: flavor.flavor_type, is_active: flavor.is_active },
        });
      } else {
        const { data, error } = await supabase.from('flavors').insert({
          name: flavor.name,
          flavor_type: flavor.flavor_type,
          surcharge: flavor.surcharge,
          is_active: flavor.is_active,
          is_available: flavor.is_available ?? true,
        }).select().single();
        if (error) throw error;

        // Log create
        await logAdminAction({
          action: 'create',
          entityType: 'flavor',
          entityId: data.id,
          entityName: flavor.name,
          newValues: { flavor_type: flavor.flavor_type, surcharge: flavor.surcharge },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flavors'] });
      toast.success(editingFlavor ? 'Flavor updated' : 'Flavor created');
      setDialogOpen(false);
      setEditingFlavor(null);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to save flavor');
    },
  });

  const toggleAvailabilityMutation = useMutation({
    mutationFn: async ({ id, name, is_available }: { id: string; name: string; is_available: boolean }) => {
      const { error } = await supabase
        .from('flavors')
        .update({ is_available })
        .eq('id', id);
      if (error) throw error;

      // Log toggle
      await logAdminAction({
        action: 'toggle',
        entityType: 'flavor',
        entityId: id,
        entityName: name,
        newValues: { is_available },
        details: is_available ? 'Set to available' : 'Set to out of stock',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flavors'] });
      toast.success('Availability updated');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update availability');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async ({ id, name, archive }: { id: string; name: string; archive: boolean }) => {
      const { error } = await supabase
        .from('flavors')
        .update({ archived_at: archive ? new Date().toISOString() : null })
        .eq('id', id);
      if (error) throw error;

      await logAdminAction({
        action: archive ? 'delete' : 'update',
        entityType: 'flavor',
        entityId: id,
        entityName: name,
        details: archive ? 'Archived flavor' : 'Restored flavor',
      });
    },
    onSuccess: (_, { archive }) => {
      queryClient.invalidateQueries({ queryKey: ['flavors'] });
      toast.success(archive ? 'Flavor archived' : 'Flavor restored');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('flavors').delete().eq('id', id);
      if (error) throw error;

      await logAdminAction({
        action: 'delete',
        entityType: 'flavor',
        entityId: id,
        entityName: name,
        details: 'Permanently deleted flavor',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flavors'] });
      setSelectedIds(new Set());
      toast.success('Flavor deleted permanently');
    },
    onError: (error: any) => {
      if (error.message?.includes('violates foreign key constraint')) {
        toast.error('Cannot delete: Flavor is used in orders. Archive instead.');
      } else {
        toast.error(error.message || 'Failed to delete flavor');
      }
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('flavors').delete().in('id', ids);
      if (error) throw error;

      await logAdminAction({
        action: 'delete',
        entityType: 'flavor',
        entityId: ids.join(','),
        entityName: `${ids.length} flavors`,
        details: `Permanently deleted ${ids.length} flavors`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flavors'] });
      setSelectedIds(new Set());
      toast.success('Flavors deleted permanently');
    },
    onError: (error: any) => {
      if (error.message?.includes('violates foreign key constraint')) {
        toast.error('Cannot delete: Some flavors are used in orders. Archive instead.');
      } else {
        toast.error(error.message || 'Failed to delete flavors');
      }
    },
  });

  const toggleSelectAll = () => {
    if (selectedIds.size === flavors.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(flavors.map(f => f.id)));
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
    const flavorType = form.get('flavor_type') as Enums<'flavor_type'>;
    saveMutation.mutate({
      name: form.get('name') as string,
      flavor_type: flavorType,
      surcharge: flavorType === 'special' ? parseFloat(form.get('surcharge') as string) || 40 : 0,
      is_active: form.get('is_active') === 'on',
    });
  };

  const openEditDialog = (flavor: Tables<'flavors'>) => {
    setEditingFlavor(flavor);
    setDialogOpen(true);
  };

  const openNewDialog = () => {
    setEditingFlavor(null);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Flavors</h1>
          <p className="text-muted-foreground mt-1">
            Wing sauces and fry seasonings
          </p>
        </div>
        {canEdit && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNewDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Add Flavor
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingFlavor ? 'Edit Flavor' : 'New Flavor'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    defaultValue={editingFlavor?.name || ''}
                    placeholder="e.g., Buffalo Hot"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="flavor_type">Type</Label>
                    <Select
                      name="flavor_type"
                      defaultValue={editingFlavor?.flavor_type || 'all_time'}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all_time">All-Time</SelectItem>
                        <SelectItem value="special">Special</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="surcharge">Surcharge (₱)</Label>
                    <Input
                      id="surcharge"
                      name="surcharge"
                      type="number"
                      step="0.01"
                      defaultValue={editingFlavor?.surcharge || 40}
                      placeholder="40"
                    />
                    <p className="text-xs text-muted-foreground">
                      Applied only for special flavors
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="is_active"
                    name="is_active"
                    defaultChecked={editingFlavor?.is_active ?? true}
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
            <CardTitle className="text-lg">All Flavors</CardTitle>
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
                      <AlertDialogTitle>Delete {selectedIds.size} flavor(s)?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete the selected flavors. Flavors used in orders cannot be deleted - archive them instead.
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
          ) : flavors.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No flavors yet. Add your first flavor!
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {isOwner && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedIds.size === flavors.length && flavors.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                  )}
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Surcharge</TableHead>
                  <TableHead>Availability</TableHead>
                  <TableHead>Status</TableHead>
                  {canEdit && <TableHead className="w-[120px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {flavors.map((flavor) => (
                  <TableRow key={flavor.id}>
                    {isOwner && (
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(flavor.id)}
                          onCheckedChange={() => toggleSelect(flavor.id)}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">{flavor.name}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          (flavor as any).flavor_category === 'fries'
                            ? 'bg-orange-500/20 text-orange-700 border-orange-500/30'
                            : (flavor as any).flavor_category === 'drinks'
                            ? 'bg-cyan-500/20 text-cyan-700 border-cyan-500/30'
                            : 'bg-purple-500/20 text-purple-700 border-purple-500/30'
                        }
                      >
                        {((flavor as any).flavor_category || 'wings').charAt(0).toUpperCase() + ((flavor as any).flavor_category || 'wings').slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          flavor.flavor_type === 'special'
                            ? 'bg-amber-500/20 text-amber-700 border-amber-500/30'
                            : 'bg-blue-500/20 text-blue-700 border-blue-500/30'
                        }
                      >
                        {flavor.flavor_type === 'special' ? 'Special' : 'All-Time'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {flavor.flavor_type === 'special' && flavor.surcharge
                        ? `₱${flavor.surcharge}`
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {canEdit && !flavor.archived_at ? (
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={(flavor as any).is_available ?? true}
                            onCheckedChange={(checked) =>
                              toggleAvailabilityMutation.mutate({ id: flavor.id, name: flavor.name, is_available: checked })
                            }
                          />
                          <Badge 
                            variant="outline" 
                            className={(flavor as any).is_available !== false
                              ? 'bg-green-500/20 text-green-700 border-green-500/30'
                              : 'bg-red-500/20 text-red-700 border-red-500/30'
                            }
                          >
                            {(flavor as any).is_available !== false ? 'In Stock' : 'Out of Stock'}
                          </Badge>
                        </div>
                      ) : (
                        <Badge 
                          variant="outline" 
                          className={(flavor as any).is_available !== false
                            ? 'bg-green-500/20 text-green-700 border-green-500/30'
                            : 'bg-red-500/20 text-red-700 border-red-500/30'
                          }
                        >
                          {(flavor as any).is_available !== false ? 'In Stock' : 'Out of Stock'}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={flavor.is_active ? 'default' : 'secondary'}>
                        {flavor.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(flavor)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              archiveMutation.mutate({
                                id: flavor.id,
                                name: flavor.name,
                                archive: !flavor.archived_at,
                              })
                            }
                          >
                            {flavor.archived_at ? (
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
                                  <AlertDialogTitle>Delete "{flavor.name}"?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently delete this flavor. Flavors used in orders cannot be deleted - archive them instead.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteMutation.mutate({ id: flavor.id, name: flavor.name })}
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
