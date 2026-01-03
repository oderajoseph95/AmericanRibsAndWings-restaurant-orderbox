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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Archive, ArchiveRestore, Loader2 } from 'lucide-react';
import type { Tables, Enums } from '@/integrations/supabase/types';

export default function Flavors() {
  const { role } = useAuth();
  const canEdit = role === 'owner' || role === 'manager';
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFlavor, setEditingFlavor] = useState<Tables<'flavors'> | null>(null);
  const queryClient = useQueryClient();

  const { data: flavors = [], isLoading } = useQuery({
    queryKey: ['flavors', showArchived],
    queryFn: async () => {
      let query = supabase.from('flavors').select('*').order('name');

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
    mutationFn: async (flavor: { name: string; flavor_type?: Enums<'flavor_type'>; surcharge?: number; is_active?: boolean }) => {
      if (editingFlavor) {
        const { error } = await supabase
          .from('flavors')
          .update(flavor)
          .eq('id', editingFlavor.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('flavors').insert({
          name: flavor.name,
          flavor_type: flavor.flavor_type,
          surcharge: flavor.surcharge,
          is_active: flavor.is_active,
        });
        if (error) throw error;
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

  const archiveMutation = useMutation({
    mutationFn: async ({ id, archive }: { id: string; archive: boolean }) => {
      const { error } = await supabase
        .from('flavors')
        .update({ archived_at: archive ? new Date().toISOString() : null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, { archive }) => {
      queryClient.invalidateQueries({ queryKey: ['flavors'] });
      toast.success(archive ? 'Flavor archived' : 'Flavor restored');
    },
  });

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
          ) : flavors.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No flavors yet. Add your first flavor!
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Surcharge</TableHead>
                  <TableHead>Status</TableHead>
                  {canEdit && <TableHead className="w-[100px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {flavors.map((flavor) => (
                  <TableRow key={flavor.id}>
                    <TableCell className="font-medium">{flavor.name}</TableCell>
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
