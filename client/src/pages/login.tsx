import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { signIn, signUp, isConfigured, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error } = isSignUp 
        ? await signUp(email, password)
        : await signIn(email, password);

      if (error) {
        setError(error.message);
      } else {
        setLocation('/');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm shadow-lg">
          <CardHeader className="text-center pb-4">
            <div className="flex justify-center mb-3">
              <div className="p-2.5 bg-amber-100 rounded-full">
                <AlertCircle className="h-6 w-6 text-amber-600" />
              </div>
            </div>
            <CardTitle className="text-lg">Setup Required</CardTitle>
            <CardDescription className="text-sm">
              Add these environment variables to enable authentication:
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="bg-muted p-3 rounded-md font-mono text-xs space-y-1">
              <p>VITE_SUPABASE_URL</p>
              <p>VITE_SUPABASE_ANON_KEY</p>
              <p>SUPABASE_URL</p>
              <p>SUPABASE_SERVICE_ROLE_KEY</p>
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              variant="outline" 
              className="w-full h-9 text-sm"
              onClick={() => setLocation('/')}
              data-testid="button-continue-without-auth"
            >
              Continue without Auth
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <img src="/claims-iq-logo.png" alt="Claims IQ" className="h-10 mx-auto mb-3" />
          <h1 className="font-display font-bold text-xl text-foreground">Claims IQ</h1>
          <p className="text-sm text-muted-foreground mt-1">Correction Workbench</p>
        </div>

        <Card className="shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{isSignUp ? 'Create Account' : 'Sign In'}</CardTitle>
            <CardDescription className="text-sm">
              {isSignUp 
                ? 'Create an account to get started' 
                : 'Enter your credentials to continue'}
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-3 pb-4">
              {error && (
                <Alert variant="destructive" className="py-2">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <AlertDescription className="text-sm">{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-9"
                  data-testid="input-email"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="h-9"
                  data-testid="input-password"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3 pt-0">
              <Button 
                type="submit" 
                className="w-full h-9" 
                disabled={loading}
                data-testid="button-submit"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSignUp ? 'Create Account' : 'Sign In'}
              </Button>
              <Button
                type="button"
                variant="link"
                className="text-xs h-auto p-0"
                onClick={() => setIsSignUp(!isSignUp)}
                data-testid="button-toggle-mode"
              >
                {isSignUp 
                  ? 'Already have an account? Sign in' 
                  : "Don't have an account? Sign up"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
