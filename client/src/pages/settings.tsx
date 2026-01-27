import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect } from "react";
import { ArrowLeft, Palette, User } from "lucide-react";
import { useSyncTheme, type Theme, STORAGE_KEY_OPERATOR } from "@/lib/theme";

export { STORAGE_KEY_OPERATOR };

export default function SettingsPage() {
  const [, setLocation] = useLocation();
  const { isConfigured } = useAuth();
  const [theme, setTheme] = useSyncTheme();

  const [operatorId, setOperatorId] = useState(() =>
    typeof window !== "undefined"
      ? localStorage.getItem(STORAGE_KEY_OPERATOR) ?? "operator-1"
      : "operator-1"
  );

  useEffect(() => {
    const handler = () =>
      setOperatorId(localStorage.getItem(STORAGE_KEY_OPERATOR) ?? "operator-1");
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const onOperatorChange = (v: string) => {
    const next = v || "operator-1";
    setOperatorId(next);
    try {
      localStorage.setItem(STORAGE_KEY_OPERATOR, next);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event("storage"));
  };

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
        <span className="font-display font-semibold text-lg">Settings</span>
      </header>

      <main className="max-w-xl mx-auto p-6 space-y-6">
        <Card className="border-2 border-[#E3DFE8] shadow-sm">
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Appearance
            </CardTitle>
            <CardDescription>Choose how Claims IQ looks for you.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>Theme</Label>
              <Select value={theme} onValueChange={(v) => setTheme(v as Theme)} data-testid="select-theme">
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue placeholder="Theme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {!isConfigured && (
          <Card className="border-2 border-[#E3DFE8] shadow-sm">
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <User className="h-5 w-5" />
                Operator
              </CardTitle>
              <CardDescription>
                Default operator ID when signing in is not configured.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="operator-id">Default operator ID</Label>
                <Input
                  id="operator-id"
                  value={operatorId}
                  onChange={(e) => onOperatorChange(e.target.value)}
                  placeholder="operator-1"
                  className="max-w-xs font-mono"
                  data-testid="input-operator-id"
                />
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
