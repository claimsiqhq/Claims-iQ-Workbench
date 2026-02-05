import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft, UserCircle, Mail, Calendar, Save, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";

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
  const { user, session, isConfigured, loading, refreshUser } = useAuth();
  const { toast } = useToast();
  
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState("");

  const displayName =
    (user?.user_metadata as { full_name?: string; name?: string } | undefined)?.full_name ??
    (user?.user_metadata as { full_name?: string; name?: string } | undefined)?.name ??
    null;

  useEffect(() => {
    if (!loading && isConfigured && !user) {
      setLocation("/login");
    }
  }, [loading, isConfigured, user, setLocation]);

  useEffect(() => {
    if (displayName) {
      setDisplayNameInput(displayName);
    }
  }, [displayName]);

  const handleSave = async () => {
    if (!supabase) {
      toast({ title: "Error", description: "Authentication not configured", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: displayNameInput.trim() }
      });

      if (error) throw error;

      // Refresh user data
      if (refreshUser) {
        await refreshUser();
      }

      toast({ title: "Profile Updated", description: "Your display name has been saved." });
      setIsEditing(false);
    } catch (err: any) {
      toast({ 
        title: "Error", 
        description: err.message || "Failed to update profile", 
        variant: "destructive" 
      });
    } finally {
      setIsSaving(false);
    }
  };

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

  const lastSignIn =
    (user as { last_sign_in_at?: string } | undefined)?.last_sign_in_at ??
    (session?.user as { last_sign_in_at?: string } | undefined)?.last_sign_in_at;

  return (
    <div className="min-h-screen bg-background font-sans">
      <header className="border-b border-[#E3DFE8] bg-[#342A4F] text-white h-14 sm:h-16 flex items-center px-3 sm:px-4 gap-3 sm:gap-4">
        <Button
          variant="ghost"
          size="sm"
          className="text-white hover:bg-white/10 h-8 sm:h-9 px-2 sm:px-3"
          onClick={() => setLocation("/")}
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">Back</span>
        </Button>
        <span className="font-display font-semibold text-base sm:text-lg">Profile</span>
      </header>

      <main className="max-w-xl mx-auto p-4 sm:p-6">
        <Card className="border-2 border-[#E3DFE8] shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
              <div
                className="h-14 w-14 sm:h-16 sm:w-16 rounded-full flex items-center justify-center text-lg sm:text-xl font-display font-semibold text-primary-foreground bg-primary shrink-0"
                data-testid="profile-avatar"
              >
                {getInitials(user?.email ?? undefined, displayName)}
              </div>
              <div className="flex-1 min-w-0">
                <CardTitle className="font-display text-lg sm:text-xl truncate">
                  {displayName || "Profile"}
                </CardTitle>
                <CardDescription>Your account details</CardDescription>
              </div>
              {!isEditing && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  data-testid="button-edit-profile"
                  className="self-start sm:self-auto"
                >
                  <Pencil className="h-4 w-4 sm:mr-1" />
                  <span className="hidden sm:inline">Edit</span>
                </Button>
              )}
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
              <p className="text-xs text-muted-foreground">Email cannot be changed</p>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground flex items-center gap-2">
                <UserCircle className="h-4 w-4" />
                Display Name
              </Label>
              {isEditing ? (
                <div className="space-y-3">
                  <Input
                    value={displayNameInput}
                    onChange={(e) => setDisplayNameInput(e.target.value)}
                    placeholder="Enter your display name"
                    data-testid="input-display-name"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={isSaving}
                      data-testid="button-save-profile"
                    >
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-1" />
                      )}
                      Save
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsEditing(false);
                        setDisplayNameInput(displayName || "");
                      }}
                      disabled={isSaving}
                      data-testid="button-cancel-edit"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Input
                  readOnly
                  value={displayName || "Not set"}
                  className="bg-muted/50"
                  data-testid="profile-display-name"
                />
              )}
            </div>

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
