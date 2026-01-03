import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2, Info } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

type FlavorRule = Tables<'product_flavor_rules'> & {
  products: Tables<'products'> | null;
};

type BundleComponent = Tables<'bundle_components'> & {
  bundle_product: Tables<'products'> | null;
  component_product: Tables<'products'> | null;
};

export default function Bundles() {
  const { role } = useAuth();
  const canEdit = role === 'owner' || role === 'manager';
  const queryClient = useQueryClient();

  // Flavor Rules State
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<FlavorRule | null>(null);

  // Bundle State
  const [bundleDialogOpen, setBundleDialogOpen] = useState(false);
  const [editingBundle, setEditingBundle] = useState<BundleComponent | null>(null);
  const [selectedBundleProduct, setSelectedBundleProduct] = useState<string>('');

  // Queries
  const { data: flavorRules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ['flavor-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_flavor_rules')
        .select('*, products(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as FlavorRule[];
    },
  });

  const { data: bundleComponents = [], isLoading: bundlesLoading } = useQuery({
    queryKey: ['bundle-components'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bundle_components')
        .select('*, bundle_product:products!bundle_components_bundle_product_id_fkey(*), component_product:products!bundle_components_component_product_id_fkey(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as BundleComponent[];
    },
  });

  const { data: flavoredProducts = [] } = useQuery({
    queryKey: ['flavored-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('product_type', 'flavored')
        .is('archived_at', null)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: bundleProducts = [] } = useQuery({
    queryKey: ['bundle-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('product_type', 'bundle')
        .is('archived_at', null)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: allProducts = [] } = useQuery({
    queryKey: ['all-active-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .is('archived_at', null)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  // Flavor Rules Mutations
  const saveRuleMutation = useMutation({
    mutationFn: async (rule: {
      product_id: string;
      total_units: number;
      units_per_flavor: number;
      min_flavors?: number;
      max_flavors?: number | null;
      allow_special_flavors?: boolean;
      special_flavor_surcharge?: number;
    }) => {
      if (editingRule) {
        const { error } = await supabase
          .from('product_flavor_rules')
          .update(rule)
          .eq('id', editingRule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('product_flavor_rules').insert({
          product_id: rule.product_id,
          total_units: rule.total_units,
          units_per_flavor: rule.units_per_flavor,
          min_flavors: rule.min_flavors,
          max_flavors: rule.max_flavors,
          allow_special_flavors: rule.allow_special_flavors,
          special_flavor_surcharge: rule.special_flavor_surcharge,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flavor-rules'] });
      toast.success(editingRule ? 'Rule updated' : 'Rule created');
      setRuleDialogOpen(false);
      setEditingRule(null);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to save rule');
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('product_flavor_rules')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flavor-rules'] });
      toast.success('Rule deleted');
    },
  });

  // Bundle Mutations
  const saveBundleMutation = useMutation({
    mutationFn: async (component: {
      bundle_product_id: string;
      component_product_id: string;
      quantity?: number;
      has_flavor_selection?: boolean;
      total_units?: number | null;
      units_per_flavor?: number | null;
    }) => {
      if (editingBundle) {
        const { error } = await supabase
          .from('bundle_components')
          .update(component)
          .eq('id', editingBundle.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('bundle_components').insert({
          bundle_product_id: component.bundle_product_id,
          component_product_id: component.component_product_id,
          quantity: component.quantity,
          has_flavor_selection: component.has_flavor_selection,
          total_units: component.total_units,
          units_per_flavor: component.units_per_flavor,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bundle-components'] });
      toast.success(editingBundle ? 'Component updated' : 'Component added');
      setBundleDialogOpen(false);
      setEditingBundle(null);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to save component');
    },
  });

  const deleteBundleMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('bundle_components')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bundle-components'] });
      toast.success('Component removed');
    },
  });

  // Handlers
  const handleRuleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const totalUnits = parseInt(form.get('total_units') as string);
    const unitsPerFlavor = parseInt(form.get('units_per_flavor') as string);

    if (totalUnits % unitsPerFlavor !== 0) {
      toast.error(`Total units (${totalUnits}) must be divisible by units per flavor (${unitsPerFlavor})`);
      return;
    }

    saveRuleMutation.mutate({
      product_id: form.get('product_id') as string,
      total_units: totalUnits,
      units_per_flavor: unitsPerFlavor,
      min_flavors: parseInt(form.get('min_flavors') as string) || 1,
      max_flavors: parseInt(form.get('max_flavors') as string) || null,
      allow_special_flavors: form.get('allow_special_flavors') === 'on',
      special_flavor_surcharge: parseFloat(form.get('special_flavor_surcharge') as string) || 40,
    });
  };

  const handleBundleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    
    saveBundleMutation.mutate({
      bundle_product_id: form.get('bundle_product_id') as string,
      component_product_id: form.get('component_product_id') as string,
      quantity: parseInt(form.get('quantity') as string) || 1,
      has_flavor_selection: form.get('has_flavor_selection') === 'on',
      total_units: parseInt(form.get('total_units') as string) || null,
      units_per_flavor: parseInt(form.get('units_per_flavor') as string) || null,
    });
  };

  // Group bundle components by bundle product
  const bundleGroups = bundleProducts.map((bundle) => ({
    bundle,
    components: bundleComponents.filter((c) => c.bundle_product_id === bundle.id),
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Bundles & Rules</h1>
        <p className="text-muted-foreground mt-1">
          Configure flavor selection rules and bundle compositions
        </p>
      </div>

      <Tabs defaultValue="rules" className="space-y-6">
        <TabsList>
          <TabsTrigger value="rules">Flavor Rules</TabsTrigger>
          <TabsTrigger value="bundles">Bundle Components</TabsTrigger>
        </TabsList>

        {/* Flavor Rules Tab */}
        <TabsContent value="rules" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Flavor Selection Rules</CardTitle>
                <CardDescription>
                  Define how customers choose flavors for each product
                </CardDescription>
              </div>
              {canEdit && (
                <Button onClick={() => { setEditingRule(null); setRuleDialogOpen(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Rule
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {rulesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : flavorRules.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No flavor rules configured yet.</p>
                  <p className="text-sm">First, set products as "Flavored" type, then add rules here.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Units</TableHead>
                      <TableHead>Per Flavor</TableHead>
                      <TableHead>Required Flavors</TableHead>
                      <TableHead>Special Allowed</TableHead>
                      {canEdit && <TableHead className="w-[80px]"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {flavorRules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell className="font-medium">
                          {rule.products?.name}
                        </TableCell>
                        <TableCell>{rule.total_units}</TableCell>
                        <TableCell>{rule.units_per_flavor}</TableCell>
                        <TableCell>
                          {rule.total_units / rule.units_per_flavor}
                        </TableCell>
                        <TableCell>
                          <Badge variant={rule.allow_special_flavors ? 'default' : 'secondary'}>
                            {rule.allow_special_flavors ? `Yes (+₱${rule.special_flavor_surcharge})` : 'No'}
                          </Badge>
                        </TableCell>
                        {canEdit && (
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => { setEditingRule(rule); setRuleDialogOpen(true); }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteRuleMutation.mutate(rule.id)}
                              >
                                <Trash2 className="h-4 w-4" />
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
        </TabsContent>

        {/* Bundle Components Tab */}
        <TabsContent value="bundles" className="space-y-4">
          {bundleGroups.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No bundle products yet.</p>
                <p className="text-sm">First, set products as "Bundle" type in the Products page.</p>
              </CardContent>
            </Card>
          ) : (
            bundleGroups.map(({ bundle, components }) => (
              <Card key={bundle.id}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{bundle.name}</CardTitle>
                    <CardDescription>₱{bundle.price.toFixed(2)}</CardDescription>
                  </div>
                  {canEdit && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setEditingBundle(null);
                        setSelectedBundleProduct(bundle.id);
                        setBundleDialogOpen(true);
                      }}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Component
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {components.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No components added yet</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Component</TableHead>
                          <TableHead>Qty</TableHead>
                          <TableHead>Flavor Selection</TableHead>
                          {canEdit && <TableHead className="w-[80px]"></TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {components.map((comp) => (
                          <TableRow key={comp.id}>
                            <TableCell className="font-medium">
                              {comp.component_product?.name}
                            </TableCell>
                            <TableCell>{comp.quantity}</TableCell>
                            <TableCell>
                              {comp.has_flavor_selection ? (
                                <Badge>
                                  {comp.total_units} units, {comp.units_per_flavor} per flavor
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            {canEdit && (
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      setEditingBundle(comp);
                                      setSelectedBundleProduct(comp.bundle_product_id);
                                      setBundleDialogOpen(true);
                                    }}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => deleteBundleMutation.mutate(comp.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
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
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Flavor Rule Dialog */}
      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingRule ? 'Edit Flavor Rule' : 'New Flavor Rule'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRuleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="product_id">Product *</Label>
              <Select
                name="product_id"
                defaultValue={editingRule?.product_id || ''}
                disabled={!!editingRule}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a flavored product" />
                </SelectTrigger>
                <SelectContent>
                  {flavoredProducts
                    .filter((p) => !flavorRules.some((r) => r.product_id === p.id) || editingRule?.product_id === p.id)
                    .map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="total_units">Total Units *</Label>
                <Input
                  id="total_units"
                  name="total_units"
                  type="number"
                  defaultValue={editingRule?.total_units || 12}
                  required
                  min={1}
                />
                <p className="text-xs text-muted-foreground">e.g., 12 wings</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="units_per_flavor">Units Per Flavor *</Label>
                <Input
                  id="units_per_flavor"
                  name="units_per_flavor"
                  type="number"
                  defaultValue={editingRule?.units_per_flavor || 3}
                  required
                  min={1}
                />
                <p className="text-xs text-muted-foreground">e.g., 3 per flavor</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="min_flavors">Min Flavors</Label>
                <Input
                  id="min_flavors"
                  name="min_flavors"
                  type="number"
                  defaultValue={editingRule?.min_flavors || 1}
                  min={1}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max_flavors">Max Flavors</Label>
                <Input
                  id="max_flavors"
                  name="max_flavors"
                  type="number"
                  defaultValue={editingRule?.max_flavors || ''}
                  placeholder="Unlimited"
                />
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="allow_special_flavors"
                  name="allow_special_flavors"
                  defaultChecked={editingRule?.allow_special_flavors ?? true}
                />
                <Label htmlFor="allow_special_flavors">Allow Special Flavors</Label>
              </div>
              <div className="space-y-2">
                <Label htmlFor="special_flavor_surcharge">Special Flavor Surcharge (₱)</Label>
                <Input
                  id="special_flavor_surcharge"
                  name="special_flavor_surcharge"
                  type="number"
                  step="0.01"
                  defaultValue={editingRule?.special_flavor_surcharge || 40}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRuleDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveRuleMutation.isPending}>
                {saveRuleMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bundle Component Dialog */}
      <Dialog open={bundleDialogOpen} onOpenChange={setBundleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingBundle ? 'Edit Component' : 'Add Component'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleBundleSubmit} className="space-y-4">
            <input type="hidden" name="bundle_product_id" value={selectedBundleProduct} />
            <div className="space-y-2">
              <Label htmlFor="component_product_id">Component Product *</Label>
              <Select
                name="component_product_id"
                defaultValue={editingBundle?.component_product_id || ''}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a product" />
                </SelectTrigger>
                <SelectContent>
                  {allProducts
                    .filter((p) => p.id !== selectedBundleProduct)
                    .map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity *</Label>
              <Input
                id="quantity"
                name="quantity"
                type="number"
                defaultValue={editingBundle?.quantity || 1}
                required
                min={1}
              />
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="has_flavor_selection"
                  name="has_flavor_selection"
                  defaultChecked={editingBundle?.has_flavor_selection ?? false}
                />
                <Label htmlFor="has_flavor_selection">Has Flavor Selection</Label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="total_units">Total Units</Label>
                  <Input
                    id="total_units"
                    name="total_units"
                    type="number"
                    defaultValue={editingBundle?.total_units || ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="units_per_flavor">Units Per Flavor</Label>
                  <Input
                    id="units_per_flavor"
                    name="units_per_flavor"
                    type="number"
                    defaultValue={editingBundle?.units_per_flavor || ''}
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setBundleDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveBundleMutation.isPending}>
                {saveBundleMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
