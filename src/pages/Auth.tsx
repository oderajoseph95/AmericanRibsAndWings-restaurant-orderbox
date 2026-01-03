import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Flame, Loader2, Copy, CheckCircle } from 'lucide-react';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [signupComplete, setSignupComplete] = useState(false);
  const [newUserId, setNewUserId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { signIn, signUp, user, role, loading } = useAuth();
  const navigate = useNavigate();

  // Redirect to admin once user and role are loaded
  useEffect(() => {
    if (!loading && user && role) {
      navigate('/admin');
    }
  }, [user, role, loading, navigate]);

  // Show loading while checking auth state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          toast({
            title: 'Login failed',
            description: error.message,
            variant: 'destructive',
          });
        } else {
          toast({ title: 'Welcome back!' });
          // Navigation handled by useEffect when role loads
        }
      } else {
        const { error, data } = await signUp(email, password);
        if (error) {
          if (error.message.includes('already registered')) {
            toast({
              title: 'Account exists',
              description: 'This email is already registered. Please sign in instead.',
              variant: 'destructive',
            });
          } else {
            toast({
              title: 'Sign up failed',
              description: error.message,
              variant: 'destructive',
            });
          }
        } else {
          // Show success with User ID
          setNewUserId(data?.user?.id || null);
          setSignupComplete(true);
          toast({
            title: 'Account created!',
            description: 'Share your email with the owner to get your role assigned.',
          });
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyUserId = () => {
    if (newUserId) {
      navigator.clipboard.writeText(newUserId);
      setCopied(true);
      toast({ title: 'User ID copied!' });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleBackToLogin = () => {
    setSignupComplete(false);
    setNewUserId(null);
    setIsLogin(true);
    setEmail('');
    setPassword('');
  };

  // Show signup success screen
  if (signupComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-background p-4">
        <Card className="w-full max-w-md shadow-2xl border-primary/10">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-green-500 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-white" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-green-600">Account Created!</CardTitle>
              <CardDescription className="text-base mt-2">
                Contact the owner to assign your admin role
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted p-4 rounded-lg space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Your Email (share with owner)</Label>
                <p className="font-medium">{email}</p>
              </div>
              
              {newUserId && (
                <div>
                  <Label className="text-xs text-muted-foreground">Your User ID (backup)</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="flex-1 text-xs bg-background p-2 rounded border font-mono overflow-x-auto">
                      {newUserId}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyUserId}
                      className="shrink-0"
                    >
                      {copied ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
            
            <div className="text-sm text-muted-foreground text-center">
              <p>The owner can now add you using your <strong>email address</strong>.</p>
              <p className="mt-1">Once assigned, sign in to access the admin panel.</p>
            </div>

            <Button onClick={handleBackToLogin} className="w-full">
              Go to Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-background p-4">
      <Card className="w-full max-w-md shadow-2xl border-primary/10">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary rounded-full flex items-center justify-center">
            <Flame className="w-8 h-8 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">American Ribs & Wings</CardTitle>
            <CardDescription className="text-base mt-1">
              {isLogin ? 'Sign in to admin panel' : 'Create your account'}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-primary hover:underline"
            >
              {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
