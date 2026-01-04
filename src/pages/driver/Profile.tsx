import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { 
  Mail, 
  Phone, 
  Calendar, 
  CheckCircle,
  Package,
  Camera,
  Pencil,
  X,
  Save,
  Loader2
} from 'lucide-react';
import { format } from 'date-fns';

export default function DriverProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  // Fetch driver profile
  const { data: driver, isLoading: driverLoading } = useQuery({
    queryKey: ['driver-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('drivers')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch delivery stats
  const { data: stats } = useQuery({
    queryKey: ['driver-stats', driver?.id],
    queryFn: async () => {
      if (!driver?.id) return null;
      
      const { data, error } = await supabase
        .from('orders')
        .select('id, status, created_at')
        .eq('driver_id', driver.id);
      
      if (error) throw error;
      
      const total = data.length;
      const completed = data.filter(o => ['delivered', 'completed'].includes(o.status || '')).length;
      const today = data.filter(o => 
        ['delivered', 'completed'].includes(o.status || '') &&
        o.created_at && new Date(o.created_at).toDateString() === new Date().toDateString()
      ).length;
      
      return { total, completed, today };
    },
    enabled: !!driver?.id,
  });

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async ({ name, photoUrl }: { name: string; photoUrl?: string }) => {
      if (!driver?.id) throw new Error('Driver not found');
      
      const updateData: { name: string; profile_photo_url?: string } = { name };
      if (photoUrl) {
        updateData.profile_photo_url = photoUrl;
      }
      
      const { error } = await supabase
        .from('drivers')
        .update(updateData)
        .eq('id', driver.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-profile'] });
      toast({ title: 'Profile updated successfully' });
      setIsEditing(false);
      setPreviewPhoto(null);
      setPhotoFile(null);
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Failed to update profile', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const handleStartEdit = () => {
    setEditName(driver?.name || '');
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditName('');
    setPreviewPhoto(null);
    setPhotoFile(null);
  };

  const handlePhotoClick = () => {
    if (isEditing) {
      fileInputRef.current?.click();
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewPhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!driver?.id) return;
    
    let photoUrl: string | undefined;
    
    // Upload photo if changed
    if (photoFile) {
      const fileExt = photoFile.name.split('.').pop();
      const fileName = `${driver.id}-${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('driver-photos')
        .upload(fileName, photoFile, { upsert: true });
      
      if (uploadError) {
        toast({ 
          title: 'Failed to upload photo', 
          description: uploadError.message,
          variant: 'destructive' 
        });
        return;
      }
      
      const { data: { publicUrl } } = supabase.storage
        .from('driver-photos')
        .getPublicUrl(fileName);
      
      photoUrl = publicUrl;
    }
    
    updateProfileMutation.mutate({ name: editName, photoUrl });
  };

  if (driverLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">Driver profile not found</p>
      </div>
    );
  }

  const initials = driver.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const displayPhoto = previewPhoto || driver.profile_photo_url;

  return (
    <div className="space-y-6">
      {/* Profile Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoChange}
            />
            
            {/* Avatar with edit overlay */}
            <div 
              className={`relative ${isEditing ? 'cursor-pointer group' : ''}`}
              onClick={handlePhotoClick}
            >
              <Avatar className="h-24 w-24 mb-4">
                <AvatarImage src={displayPhoto || undefined} alt={driver.name} />
                <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
              </Avatar>
              {isEditing && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full mb-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="h-6 w-6 text-white" />
                </div>
              )}
            </div>
            
            {/* Name - editable or display */}
            {isEditing ? (
              <div className="w-full max-w-xs mb-2">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Your name"
                  className="text-center text-xl font-bold"
                />
              </div>
            ) : (
              <h2 className="text-xl font-bold">{driver.name}</h2>
            )}
            
            <Badge variant={driver.is_active ? 'default' : 'secondary'} className="mt-2">
              {driver.is_active ? 'Active' : 'Inactive'}
            </Badge>
            
            {/* Edit/Save/Cancel buttons */}
            <div className="flex gap-2 mt-4">
              {isEditing ? (
                <>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleCancelEdit}
                    disabled={updateProfileMutation.isPending}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={handleSave}
                    disabled={updateProfileMutation.isPending || !editName.trim()}
                  >
                    {updateProfileMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-1" />
                    )}
                    Save
                  </Button>
                </>
              ) : (
                <Button variant="outline" size="sm" onClick={handleStartEdit}>
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit Profile
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contact Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Contact Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="bg-muted p-2 rounded-full">
              <Mail className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium">{driver.email}</p>
            </div>
          </div>
          
          <Separator />
          
          <div className="flex items-center gap-3">
            <div className="bg-muted p-2 rounded-full">
              <Phone className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Phone</p>
              <p className="font-medium">{driver.phone}</p>
            </div>
          </div>
          
          <p className="text-xs text-muted-foreground text-center pt-2">
            Contact admin to update email or phone number
          </p>
          
          <Separator />
          
          <div className="flex items-center gap-3">
            <div className="bg-muted p-2 rounded-full">
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Member Since</p>
              <p className="font-medium">
                {driver.created_at && format(new Date(driver.created_at), 'MMMM d, yyyy')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Delivery Stats</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="bg-muted p-3 rounded-lg mb-2">
                <Package className="h-6 w-6 mx-auto text-primary" />
              </div>
              <p className="text-2xl font-bold">{stats?.total || 0}</p>
              <p className="text-xs text-muted-foreground">Total Orders</p>
            </div>
            <div>
              <div className="bg-muted p-3 rounded-lg mb-2">
                <CheckCircle className="h-6 w-6 mx-auto text-green-600" />
              </div>
              <p className="text-2xl font-bold">{stats?.completed || 0}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
            <div>
              <div className="bg-muted p-3 rounded-lg mb-2">
                <Calendar className="h-6 w-6 mx-auto text-blue-600" />
              </div>
              <p className="text-2xl font-bold">{stats?.today || 0}</p>
              <p className="text-xs text-muted-foreground">Today</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
