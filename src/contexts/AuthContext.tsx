import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type AppRole = 'owner' | 'manager' | 'cashier' | 'driver' | 'employee';

interface UserRoleData {
  role: AppRole;
  username: string | null;
  display_name: string | null;
  is_super_owner: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  username: string | null;
  displayName: string | null;
  isSuperOwner: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithUsername: (username: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null; data: { user: User | null } | null }>;
  signOut: () => Promise<void>;
  isOwner: boolean;
  isManager: boolean;
  isCashier: boolean;
  isDriver: boolean;
  isEmployee: boolean;
  canManageProducts: boolean;
  canManageSettings: boolean;
  canManageUsers: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [isSuperOwner, setIsSuperOwner] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchUserRole = async (userId: string): Promise<UserRoleData | null> => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role, username, display_name, is_super_owner')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (error) {
      console.error('Error fetching role:', error);
      return null;
    }
    
    return data ? {
      role: data.role as AppRole,
      username: data.username,
      display_name: data.display_name,
      is_super_owner: data.is_super_owner || false,
    } : null;
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Defer role fetch with setTimeout to avoid deadlock
        if (session?.user) {
          setLoading(true); // Set loading while fetching role
          setTimeout(() => {
            fetchUserRole(session.user.id).then((fetchedData) => {
              setRole(fetchedData?.role || null);
              setUsername(fetchedData?.username || null);
              setDisplayName(fetchedData?.display_name || null);
              setIsSuperOwner(fetchedData?.is_super_owner || false);
              setLoading(false);
            });
          }, 0);
        } else {
          setRole(null);
          setUsername(null);
          setDisplayName(null);
          setIsSuperOwner(false);
          setLoading(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchUserRole(session.user.id).then((fetchedData) => {
          setRole(fetchedData?.role || null);
          setUsername(fetchedData?.username || null);
          setDisplayName(fetchedData?.display_name || null);
          setIsSuperOwner(fetchedData?.is_super_owner || false);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signInWithUsername = async (username: string, password: string) => {
    try {
      const response = await supabase.functions.invoke('auth-by-username', {
        body: { username, password }
      });

      if (response.error) {
        return { error: new Error(response.error.message || 'Login failed') };
      }

      if (response.data?.error) {
        return { error: new Error(response.data.error) };
      }

      if (response.data?.session) {
        // Set the session from the edge function response
        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: response.data.session.access_token,
          refresh_token: response.data.session.refresh_token,
        });

        if (setSessionError) {
          return { error: setSessionError as Error };
        }
      }

      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl
      }
    });
    return { error: error as Error | null, data: data ? { user: data.user } : null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setRole(null);
    setUsername(null);
    setDisplayName(null);
    setIsSuperOwner(false);
  };

  const isOwner = role === 'owner';
  const isManager = role === 'manager';
  const isCashier = role === 'cashier';
  const isDriver = role === 'driver';
  const isEmployee = role === 'employee';
  const canManageProducts = isOwner || isManager;
  const canManageSettings = isOwner;
  const canManageUsers = isSuperOwner; // Only super owner can manage users now

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        role,
        username,
        displayName,
        isSuperOwner,
        loading,
        signIn,
        signInWithUsername,
        signUp,
        signOut,
        isOwner,
        isManager,
        isCashier,
        isDriver,
        isEmployee,
        canManageProducts,
        canManageSettings,
        canManageUsers,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
