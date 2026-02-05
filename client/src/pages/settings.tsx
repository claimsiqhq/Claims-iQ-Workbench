import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, Palette, User, FileJson, Upload, Trash2, CheckCircle, AlertCircle, Eye, EyeOff } from "lucide-react";
import { useSyncTheme, type Theme, STORAGE_KEY_OPERATOR } from "@/lib/theme";

export { STORAGE_KEY_OPERATOR };

interface SchemaInfo {
  version: string;
  title: string;
  schema: any;
  hasCustomSchema: boolean;
}

function SchemaManagementCard() {
  const [schemaInfo, setSchemaInfo] = useState<SchemaInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchSchema = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/schema", { credentials: "include" });
      if (res.ok) {
        const json = await res.json();
        setSchemaInfo(json.data || json);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchema();
  }, [fetchSchema]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!parsed || typeof parsed !== "object") {
        setMessage({ type: "error", text: "File must contain a valid JSON object" });
        return;
      }

      const res = await fetch("/api/schema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(parsed),
      });

      if (res.ok) {
        const json = await res.json();
        setMessage({ type: "success", text: `Schema updated: ${json.data?.title || "Custom Schema"} v${json.data?.version || "?"}` });
        fetchSchema();
      } else {
        const err = await res.json().catch(() => ({}));
        setMessage({ type: "error", text: err.error?.message || "Failed to upload schema" });
      }
    } catch (err) {
      setMessage({ type: "error", text: err instanceof SyntaxError ? "File is not valid JSON" : "Upload failed" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleReset = async () => {
    setMessage(null);
    try {
      const res = await fetch("/api/schema", {
        method: "DELETE",
        credentials: "include",
      });

      if (res.ok) {
        setMessage({ type: "success", text: "Reverted to default schema" });
        fetchSchema();
      } else {
        setMessage({ type: "error", text: "Failed to reset schema" });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to reset schema" });
    }
  };

  return (
    <Card className="border-2 border-[#E3DFE8] shadow-sm">
      <CardHeader>
        <CardTitle className="font-display flex items-center gap-2">
          <FileJson className="h-5 w-5" />
          Correction Schema
        </CardTitle>
        <CardDescription>
          Manage the JSON Schema used to validate incoming correction payloads.
          Upload a new schema when your document formats change.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading schema info...</div>
        ) : schemaInfo ? (
          <>
            <div className="rounded-lg border p-3 bg-muted/30 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{schemaInfo.title}</span>
                {schemaInfo.hasCustomSchema && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Custom</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">Version: {schemaInfo.version}</div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleUpload}
                  className="hidden"
                  data-testid="input-schema-file"
                />
                <Button
                  variant="outline"
                  className="w-full h-10 sm:h-9"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  data-testid="button-upload-schema"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {uploading ? "Uploading..." : "Upload New Schema"}
                </Button>
              </div>

              {schemaInfo.hasCustomSchema && (
                <Button
                  variant="outline"
                  className="h-10 sm:h-9 text-destructive hover:bg-destructive/10"
                  onClick={handleReset}
                  data-testid="button-reset-schema"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Reset to Default
                </Button>
              )}
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => setShowPreview(!showPreview)}
              data-testid="button-toggle-preview"
            >
              {showPreview ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
              {showPreview ? "Hide" : "Preview"} Schema
            </Button>

            {showPreview && schemaInfo.schema && (
              <pre className="rounded-lg border bg-muted/50 p-3 text-xs overflow-auto max-h-64 font-mono" data-testid="text-schema-preview">
                {JSON.stringify(schemaInfo.schema, null, 2)}
              </pre>
            )}
          </>
        ) : (
          <div className="text-sm text-muted-foreground">No schema configured</div>
        )}

        {message && (
          <div
            className={`flex items-center gap-2 text-sm rounded-lg p-2 ${
              message.type === "success"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
            data-testid={`text-schema-${message.type}`}
          >
            {message.type === "success" ? (
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
            )}
            {message.text}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

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
    }
    window.dispatchEvent(new Event("storage"));
  };

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
        <span className="font-display font-semibold text-base sm:text-lg">Settings</span>
      </header>

      <main className="max-w-xl mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
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

        <SchemaManagementCard />

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
