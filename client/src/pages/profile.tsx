import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft, UserCircle, Mail, Calendar } from "lucide-react";
import { useEffect } from "react";

function getInitials(email: string | undefined, name?: string | null): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  if (email) {
    const local = email.split("@")[0];
    if (local.length >= 2) return local.slice(0, 2).toUpperCase();
    return local.toUpperCase();
  }
  return "?";
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return "—";
  }
}

export default function ProfilePage() {
  const [, setLocation] = useLocation();
  const { user, session, isConfigured, loading } = useAuth();

  useEffect(() => {
    if (!loading && isConfigured && !user) {
      setLocation("/login");
    }
  }, [loading, isConfigured, user, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isConfigured && !user) {
    return null;
  }

  const displayName =
    (user?.user_metadata as { full_name?: string; name?: string } | undefined)?.full_name ??
    (user?.user_metadata as { full_name?: string; name?: string } | undefined)?.name ??
    null;
  const lastSignIn =
    (user as { last_sign_in_at?: string } | undefined)?.last_sign_in_at ??
    (session?.user as { last_sign_in_at?: string } | undefined)?.last_sign_in_at;

  return (
    <div className="min-h-screen bg-background font-sans">
      <header className="border-b border-[#E3DFE8] bg-[#342A4F] text-white h-16 flex items-center px-4 gap-4">
        <Button
          variant="ghost"
          size="sm"
          className="text-white hover:bg-white/10"
          onClick={() => setLocation("/")}
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <span className="font-display font-semibold text-lg">Profile</span>
      </header>

      <main className="max-w-xl mx-auto p-6">
        <Card className="border-2 border-[#E3DFE8] shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-4">
              <div
                className="h-16 w-16 rounded-full flex items-center justify-center text-xl font-display font-semibold text-primary-foreground bg-primary"
                data-testid="profile-avatar"
              >
                {getInitials(user?.email ?? undefined, displayName)}
              </div>
              <div>
                <CardTitle className="font-display text-xl">
                  {displayName || "Profile"}
                </CardTitle>
                <CardDescription>Your account details</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label className="text-muted-foreground flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email
              </Label>
              <Input
                readOnly
                value={user?.email ?? ""}
                className="bg-muted/50 font-mono"
                data-testid="profile-email"
              />
            </div>
            {displayName && (
              <div className="space-y-2">
                <Label className="text-muted-foreground flex items-center gap-2">
                  <UserCircle className="h-4 w-4" />
                  Display name
                </Label>
                <Input readOnly value={displayName} className="bg-muted/50" />
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Last sign-in
              </Label>
              <Input
                readOnly
                value={formatDate(lastSignIn)}
                className="bg-muted/50"
                data-testid="profile-last-signin"
              />
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
