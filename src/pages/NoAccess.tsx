import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldX } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function NoAccess() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
            <ShieldX className="w-8 h-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Access Denied</CardTitle>
          <CardDescription>
            {user
              ? 'Your account does not have a role assigned. Please contact an administrator.'
              : 'You need to sign in to access this page.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {user ? (
            <Button variant="outline" onClick={signOut}>
              Sign Out
            </Button>
          ) : (
            <Button asChild>
              <Link to="/auth">Sign In</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
