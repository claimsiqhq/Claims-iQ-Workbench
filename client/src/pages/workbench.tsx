import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api } from "@/lib/api";
import { useNutrientViewer } from "@/hooks/use-nutrient-viewer";
import { useAuth } from "@/hooks/use-auth";
import { FixEngine } from "@/lib/fix-engine";
import type { Issue, IssueStatus, Claim, Document, SessionData, ExtractedClaimInfo } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { 
  FileText, 
  Download, 
  Save, 
  CheckCircle2, 
  XCircle, 
  Edit3, 
  AlertCircle,
  Loader2,
  Upload,
  X,
  FileUp,
  User,
  Sparkles,
  ChevronRight,
  AlertTriangle,
  Info,
  CheckCircle,
  Clock,
  FileCheck,
  LogOut,
  Settings,
  UserCircle,
  LogIn
} from "lucide-react";
import { cn } from "@/lib/utils";
import { STORAGE_KEY_OPERATOR } from "@/lib/theme";

export default function Workbench() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { user, signOut, isConfigured: isAuthConfigured, loading: authLoading } = useAuth();
  const [selectedClaimId, setSelectedClaimId] = useState<string>("");
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>("");
  const username =
    user?.email ||
    (typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY_OPERATOR) ?? "operator-1" : "operator-1");
  const [issueStatuses, setIssueStatuses] = useState<Map<string, IssueStatus>>(new Map());
  const [issueAnnotations, setIssueAnnotations] = useState<Map<string, string>>(new Map());
  const [filter, setFilter] = useState<"all" | "open" | "applied" | "rejected">("all");
  const [isDocumentLoaded, setIsDocumentLoaded] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [extractedInfo, setExtractedInfo] = useState<ExtractedClaimInfo | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStage, setUploadStage] = useState<string>("");
  const [globalDragging, setGlobalDragging] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const dragCounterRef = useRef(0);

  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: api.getHealth,
    refetchOnWindowFocus: false,
  });

  const { data: claims } = useQuery({
    queryKey: ["claims"],
    queryFn: api.getClaims,
  });

  const { data: documents } = useQuery({
    queryKey: ["documents", selectedClaimId],
    queryFn: () => api.getDocuments(selectedClaimId),
    enabled: !!selectedClaimId,
  });

  const { data: issueBundle, refetch: refetchIssues } = useQuery({
    queryKey: ["issues", selectedClaimId, selectedDocumentId],
    queryFn: () => api.getIssues(selectedClaimId, selectedDocumentId),
    enabled: !!selectedClaimId && !!selectedDocumentId && isDocumentLoaded,
  });

  const { data: session } = useQuery({
    queryKey: ["session", selectedDocumentId],
    queryFn: () => api.getSession(selectedDocumentId),
    enabled: !!selectedDocumentId && isDocumentLoaded,
  });

  useEffect(() => {
    if (session) {
      setSessionData(session);
    }
  }, [session]);

  const auditMutation = useMutation({
    mutationFn: api.logAudit,
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ pdfFile, jsonFile }: { pdfFile: File; jsonFile?: File }) => {
      return api.uploadAndParseDocument(pdfFile, jsonFile);
    },
    onSuccess: (data) => {
      toast({
        title: "Upload Successful",
        description: `Document parsed and uploaded. Claim ID: ${data.claimId}`,
      });
      setExtractedInfo(data.extractedInfo);
      setUploadDialogOpen(false);
      setTimeout(() => {
        setPdfFile(null);
        setJsonFile(null);
        setExtractedInfo(null);
      }, 3000);
      queryClient.invalidateQueries({ queryKey: ["claims"] });
      setSelectedClaimId(data.claimId);
      setSelectedDocumentId(data.documentId);
    },
    onError: (error: Error) => {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload and parse document",
        variant: "destructive",
      });
    },
  });

  const documentUrl = useMemo(() => {
    if (!isDocumentLoaded || !selectedDocumentId) return undefined;
    if (sessionData?.instant && sessionData?.jwt && sessionData?.serverUrl) {
      return undefined;
    }
    const baseUrl = import.meta.env.VITE_API_BASE_URL || "";
    return `${baseUrl}/files/${selectedDocumentId}.pdf`;
  }, [isDocumentLoaded, selectedDocumentId, sessionData]);

  const instantConfig = useMemo(() => {
    if (!isDocumentLoaded || !selectedDocumentId || !sessionData) return undefined;
    if (sessionData.instant && sessionData.jwt && sessionData.serverUrl) {
      return {
        serverUrl: sessionData.serverUrl,
        documentId: selectedDocumentId,
        jwt: sessionData.jwt,
      };
    }
    return undefined;
  }, [isDocumentLoaded, selectedDocumentId, sessionData]);

  const { instance, isLoading: viewerLoading, containerRef } = useNutrientViewer({
    documentUrl: documentUrl,
    instant: instantConfig,
  });

  useEffect(() => {
    setIsDocumentLoaded(false);
    setSessionData(null);
    setIssueAnnotations(new Map());
  }, [selectedDocumentId]);

  useEffect(() => {
    if (issueBundle?.issues) {
      const newStatuses = new Map<string, IssueStatus>();
      issueBundle.issues.forEach((issue) => {
        if (!issueStatuses.has(issue.issueId)) {
          newStatuses.set(issue.issueId, "OPEN");
        } else {
          newStatuses.set(issue.issueId, issueStatuses.get(issue.issueId)!);
        }
      });
      setIssueStatuses(newStatuses);
    }
  }, [issueBundle]);

  useEffect(() => {
    if (instance && issueBundle?.issues && isDocumentLoaded) {
      drawIssueAnnotations();
    }
  }, [instance, issueBundle, isDocumentLoaded]);

  const drawIssueAnnotations = async () => {
    if (!instance || !issueBundle) return;

    try {
      const Annotations = await instance.Annotations;
      const Geometry = await instance.Geometry;
      const Color = await instance.Color;

      for (const issue of issueBundle.issues) {
        if (issueAnnotations.has(issue.issueId)) {
          continue;
        }

        const color = getIssueColor(issue.severity);
        const annotation = new Annotations.RectangleAnnotation({
          pageIndex: issue.pageIndex,
          boundingBox: new Geometry.Rect(issue.rect),
          strokeColor: color,
          strokeWidth: 2,
          isEditable: false,
          opacity: 0.3,
          customData: { issueId: issue.issueId },
        });

        const createdAnnotation = await instance.create(annotation);
        setIssueAnnotations((prev) => new Map(prev).set(issue.issueId, createdAnnotation.id));
      }
    } catch (err) {
      console.error("Failed to draw annotations:", err);
    }
  };

  const getIssueColor = (severity: string) => {
    if (!instance) return null;
    switch (severity) {
      case "critical":
        return new instance.Color(239, 68, 68);
      case "high":
        return new instance.Color(249, 115, 22);
      case "medium":
        return new instance.Color(234, 179, 8);
      case "low":
        return new instance.Color(59, 130, 246);
      default:
        return new instance.Color(107, 114, 128);
    }
  };

  const handleLoadDocument = () => {
    if (!selectedClaimId || !selectedDocumentId) {
      toast({
        title: "Selection Required",
        description: "Please select both a claim and a document",
        variant: "destructive",
      });
      return;
    }
    setIsDocumentLoaded(true);
    toast({
      title: "Document Loading",
      description: "Loading document and issues...",
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    const pdf = files.find(f => f.type === "application/pdf");
    const json = files.find(f => f.type === "application/json" || f.name.endsWith(".json"));
    if (pdf) setPdfFile(pdf);
    if (json) setJsonFile(json);
  };

  const handlePdfFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== "application/pdf") {
        toast({
          title: "Invalid File Type",
          description: "Please select a PDF file",
          variant: "destructive",
        });
        return;
      }
      setPdfFile(file);
    }
  };

  const handleJsonFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== "application/json" && !file.name.endsWith(".json")) {
        toast({
          title: "Invalid File Type",
          description: "Please select a JSON file",
          variant: "destructive",
        });
        return;
      }
      setJsonFile(file);
    }
  };

  const handleUpload = () => {
    if (!pdfFile) {
      toast({
        title: "PDF Required",
        description: "Please select a PDF file to upload",
        variant: "destructive",
      });
      return;
    }

    uploadMutation.mutate({
      pdfFile,
      jsonFile: jsonFile || undefined,
    });
  };

  const handleRemovePdf = () => {
    setPdfFile(null);
    if (pdfInputRef.current) {
      pdfInputRef.current.value = "";
    }
  };

  const handleRemoveJson = () => {
    setJsonFile(null);
    if (jsonInputRef.current) {
      jsonInputRef.current.value = "";
    }
  };

  const handleIssueClick = async (issue: Issue) => {
    if (!instance) return;

    try {
      await instance.setViewState((viewState: any) =>
        viewState.set("currentPageIndex", issue.pageIndex)
      );

      const annotationId = issueAnnotations.get(issue.issueId);
      if (annotationId) {
        await instance.setSelectedAnnotation(annotationId);
      }
    } catch (err) {
      console.error("Failed to navigate to issue:", err);
    }
  };

  const handleApplySuggestedFix = async (issue: Issue) => {
    if (!instance) return;

    try {
      const fixEngine = new FixEngine(instance);
      const result = await fixEngine.applyFix(issue);

      if (result.success) {
        setIssueStatuses((prev) => new Map(prev).set(issue.issueId, "APPLIED"));
        
        await auditMutation.mutateAsync({
          claimId: selectedClaimId,
          documentId: selectedDocumentId,
          issueId: issue.issueId,
          action: "applied",
          method: result.method,
          before: issue.foundValue || "",
          after: issue.expectedValue || "",
          user: username,
          ts: new Date().toISOString(),
        });

        toast({
          title: "Fix Applied",
          description: `Issue corrected using ${result.method} method`,
        });
      } else {
        toast({
          title: "Fix Failed",
          description: result.error || "Unable to apply automatic fix",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to apply fix",
        variant: "destructive",
      });
    }
  };

  const handleManualEdit = (issue: Issue) => {
    setIssueStatuses((prev) => new Map(prev).set(issue.issueId, "MANUAL"));
    
    auditMutation.mutate({
      claimId: selectedClaimId,
      documentId: selectedDocumentId,
      issueId: issue.issueId,
      action: "manual_edit",
      user: username,
      ts: new Date().toISOString(),
    });

    toast({
      title: "Manual Edit Mode",
      description: "Please edit the document manually using the viewer tools",
    });
  };

  const handleReject = (issue: Issue) => {
    setIssueStatuses((prev) => new Map(prev).set(issue.issueId, "REJECTED"));
    
    auditMutation.mutate({
      claimId: selectedClaimId,
      documentId: selectedDocumentId,
      issueId: issue.issueId,
      action: "rejected",
      user: username,
      ts: new Date().toISOString(),
    });

    toast({
      title: "Issue Rejected",
      description: "Marked as false positive",
    });
  };

  const handleSave = async () => {
    if (!instance) return;
    try {
      await instance.save();
      toast({ title: "Saved", description: "Document saved successfully" });
    } catch (err) {
      toast({ title: "Error", description: "Failed to save document", variant: "destructive" });
    }
  };

  const handleDownload = async () => {
    if (!instance) return;
    try {
      const blob = await instance.exportPDF();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `corrected-${selectedDocumentId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Downloaded", description: "PDF downloaded successfully" });
    } catch (err) {
      toast({ title: "Error", description: "Failed to download PDF", variant: "destructive" });
    }
  };

  const filteredIssues = useMemo(() => {
    if (!issueBundle?.issues) return [];
    
    return issueBundle.issues.filter((issue) => {
      const status = issueStatuses.get(issue.issueId) || "OPEN";
      if (filter === "all") return true;
      if (filter === "open") return status === "OPEN";
      if (filter === "applied") return status === "APPLIED";
      if (filter === "rejected") return status === "REJECTED";
      return true;
    });
  }, [issueBundle, issueStatuses, filter]);

  const getStatusBadge = (issueId: string) => {
    const status = issueStatuses.get(issueId) || "OPEN";
    const variants: Record<IssueStatus, { variant: any; label: string; icon: any }> = {
      OPEN: { variant: "default", label: "Open", icon: Clock },
      APPLIED: { variant: "default", label: "Applied", icon: CheckCircle },
      MANUAL: { variant: "secondary", label: "Manual", icon: Edit3 },
      REJECTED: { variant: "outline", label: "Rejected", icon: XCircle },
    };
    return variants[status];
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "critical":
        return AlertTriangle;
      case "high":
        return AlertCircle;
      case "medium":
        return Info;
      case "low":
        return Info;
      default:
        return AlertCircle;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/30 dark:border-red-800";
      case "high":
        return "text-orange-600 bg-orange-50 border-orange-200 dark:text-orange-400 dark:bg-orange-950/30 dark:border-orange-800";
      case "medium":
        return "text-yellow-600 bg-yellow-50 border-yellow-200 dark:text-yellow-400 dark:bg-yellow-950/30 dark:border-yellow-800";
      case "low":
        return "text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/30 dark:border-blue-800";
      default:
        return "text-gray-600 bg-gray-50 border-gray-200 dark:text-gray-400 dark:bg-gray-950/30 dark:border-gray-800";
    }
  };

  const issueCounts = useMemo(() => {
    if (!issueBundle?.issues) return { all: 0, open: 0, applied: 0, rejected: 0 };
    return {
      all: issueBundle.issues.length,
      open: issueBundle.issues.filter(i => (issueStatuses.get(i.issueId) || "OPEN") === "OPEN").length,
      applied: issueBundle.issues.filter(i => issueStatuses.get(i.issueId) === "APPLIED").length,
      rejected: issueBundle.issues.filter(i => issueStatuses.get(i.issueId) === "REJECTED").length,
    };
  }, [issueBundle, issueStatuses]);

  const showSchemaWarning = health?.supabase && !health?.schemaValid;

  return (
    <div className="h-screen flex flex-col bg-background relative">
      {/* Global Drop Overlay */}
      {globalDragging && (
        <div 
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center"
          data-testid="global-drop-overlay"
        >
          <div className="bg-card border-2 border-dashed border-primary rounded-2xl p-12 shadow-2xl max-w-md mx-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="p-6 rounded-full bg-primary/10 animate-pulse">
                <FileUp className="h-12 w-12 text-primary" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-foreground">Drop your file here</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  PDF documents or JSON correction files
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Schema Setup Warning */}
      {showSchemaWarning && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-800 px-6 py-3">
          <div className="flex items-center gap-3 text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span className="text-sm">
              <strong>Database setup required:</strong> Run the SQL schema in your Supabase SQL Editor. 
              Open <code className="bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 rounded text-xs font-mono">supabase/schema.sql</code> and execute it in your Supabase dashboard.
            </span>
          </div>
        </div>
      )}
      
      {/* Claims IQ Header */}
      <header className="border-b border-[#E3DFE8] bg-white shadow-sm">
        <div className="px-4 md:px-6 py-3">
          <div className="flex flex-wrap items-center gap-3 md:gap-6">
            {/* Claims IQ Brand */}
            <div className="flex items-center gap-3 shrink-0">
              <img
                src="/claims-iq-logo.png"
                alt="Claims IQ"
                className="h-8 w-auto object-contain"
              />
              <div className="hidden lg:block border-l border-[#E3DFE8] pl-3">
                <h1 className="font-display font-extrabold text-[#342A4F] tracking-tight text-base">
                  Claims IQ
                </h1>
                <p className="text-[#7763B7] font-sans text-xs font-medium">Correction Workbench</p>
              </div>
            </div>

            <Separator orientation="vertical" className="h-8 bg-[#E3DFE8] hidden md:block" />

            {/* Document Selection */}
            <div className="flex flex-wrap items-center gap-2 md:gap-3 flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <Label className="text-xs font-semibold text-[#342A4F] uppercase tracking-wider shrink-0 hidden sm:block">Claim</Label>
                <Select value={selectedClaimId} onValueChange={setSelectedClaimId} data-testid="select-claim">
                  <SelectTrigger className="h-9 w-[120px] md:w-[140px] rounded-lg border-2 border-[#E3DFE8] bg-[#F0EDF4]/50 font-sans text-sm focus:border-[#7763B7] focus:ring-[#7763B7]/20">
                    <SelectValue placeholder="Claim..." />
                  </SelectTrigger>
                  <SelectContent>
                    {claims?.map((claim) => (
                      <SelectItem key={claim.claimId} value={claim.claimId} data-testid={`claim-${claim.claimId}`}>
                        {claim.claimNumber || claim.claimId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <ChevronRight className="h-4 w-4 text-[#9D8BBF] shrink-0 hidden sm:block" />

              <div className="flex items-center gap-1.5">
                <Label className="text-xs font-semibold text-[#342A4F] uppercase tracking-wider shrink-0 hidden sm:block">Doc</Label>
                <Select 
                  value={selectedDocumentId} 
                  onValueChange={setSelectedDocumentId} 
                  disabled={!selectedClaimId}
                  data-testid="select-document"
                >
                  <SelectTrigger className="h-9 w-[120px] md:w-[160px] rounded-lg border-2 border-[#E3DFE8] bg-[#F0EDF4]/50 font-sans text-sm focus:border-[#7763B7] focus:ring-[#7763B7]/20">
                    <SelectValue placeholder="Document..." />
                  </SelectTrigger>
                  <SelectContent>
                    {documents?.map((doc) => (
                      <SelectItem key={doc.documentId} value={doc.documentId} data-testid={`document-${doc.documentId}`}>
                        {doc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button 
                onClick={handleLoadDocument} 
                disabled={!selectedClaimId || !selectedDocumentId || isDocumentLoaded}
                data-testid="button-load"
                className="h-9 px-3 md:px-4"
                size="sm"
              >
                <FileCheck className="h-4 w-4 md:mr-1.5" />
                <span className="hidden md:inline">Load</span>
              </Button>
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" data-testid="button-account-menu" aria-label="Account and settings">
                    <Settings className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {isAuthConfigured && user ? (
                    <>
                      <DropdownMenuLabel className="font-display font-semibold text-foreground">Account</DropdownMenuLabel>
                      <DropdownMenuItem disabled className="text-muted-foreground text-xs">
                        {user.email}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setLocation("/profile")} data-testid="button-profile">
                        <UserCircle className="h-4 w-4 mr-2" />
                        Profile
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setLocation("/settings")} data-testid="button-settings">
                        <Settings className="h-4 w-4 mr-2" />
                        Settings
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => signOut().then(() => setLocation('/login'))} data-testid="button-signout">
                        <LogOut className="h-4 w-4 mr-2" />
                        Sign Out
                      </DropdownMenuItem>
                    </>
                  ) : isAuthConfigured ? (
                    <>
                      <DropdownMenuLabel className="font-display font-semibold text-foreground">Account</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => setLocation('/login')} data-testid="button-login">
                        <LogIn className="h-4 w-4 mr-2" />
                        Sign In
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <>
                      <DropdownMenuLabel className="font-display font-semibold text-foreground">Operator</DropdownMenuLabel>
                      <DropdownMenuItem disabled className="text-muted-foreground text-xs">
                        Using operator: {username}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="h-9 gap-1.5 px-3" data-testid="button-upload">
                    <Upload className="h-4 w-4" />
                    <span className="hidden sm:inline">Upload</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                      <Sparkles className="h-5 w-5 text-primary" />
                      Upload & Parse Document
                    </DialogTitle>
                    <DialogDescription className="text-base">
                      Upload a PDF document. Our AI will automatically extract claim information from the first few pages.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-6 py-4">
                    {/* Drag and Drop Zone */}
                    <div
                      ref={dropZoneRef}
                      data-dropzone
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={cn(
                        "relative border-2 border-dashed rounded-lg p-12 transition-colors cursor-pointer",
                        isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 bg-muted/30",
                        !pdfFile && "hover:border-primary/50"
                      )}
                      onClick={() => !pdfFile && pdfInputRef.current?.click()}
                    >
                      <div className="flex flex-col items-center justify-center text-center space-y-4">
                        <div className={cn(
                          "p-5 rounded-full transition-colors",
                          isDragging ? "bg-primary/10" : "bg-muted"
                        )}>
                          <FileUp className={cn(
                            "h-10 w-10 transition-colors",
                            isDragging ? "text-primary" : "text-muted-foreground"
                          )} />
                        </div>
                        <div>
                          <p className="text-base font-medium">
                            {pdfFile ? pdfFile.name : "Drag & drop PDF here, or click to browse"}
                          </p>
                          {!pdfFile && (
                            <p className="text-sm text-muted-foreground mt-2">
                              PDF files up to 25MB
                            </p>
                          )}
                        </div>
                        {!pdfFile && (
                          <Button
                            type="button"
                            variant="outline"
                            className="mt-2 h-10"
                            onClick={(e) => {
                              e.stopPropagation();
                              pdfInputRef.current?.click();
                            }}
                          >
                            Browse Files
                          </Button>
                        )}
                        <Input
                          ref={pdfInputRef}
                          type="file"
                          accept=".pdf,application/pdf"
                          onChange={handlePdfFileChange}
                          className="hidden"
                          data-testid="input-pdf"
                        />
                      </div>
                      {pdfFile && (
                        <div className="absolute top-3 right-3">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemovePdf();
                            }}
                            className="h-9 w-9"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* JSON File Upload */}
                    <div className="space-y-3">
                      <Label htmlFor="json-file" className="text-base font-medium">Corrections JSON (Optional)</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="json-file"
                          type="file"
                          accept=".json,application/json"
                          onChange={handleJsonFileChange}
                          ref={jsonInputRef}
                          className="flex-1 h-10"
                          data-testid="input-json"
                        />
                        {jsonFile && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={handleRemoveJson}
                            className="h-10 w-10"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      {jsonFile && (
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          {jsonFile.name} ({(jsonFile.size / 1024).toFixed(2)} KB)
                        </p>
                      )}
                    </div>

                    {/* Extracted Info */}
                    {extractedInfo && (
                      <Card className="border-primary/20 bg-primary/5">
                        <CardHeader className="pb-4">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-primary" />
                            Extracted Information
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            {Object.entries(extractedInfo).filter(([_, v]) => v).map(([key, value]) => (
                              <div key={key} className="flex flex-col">
                                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">
                                  {key.replace(/([A-Z])/g, " $1").trim()}
                                </span>
                                <span className={cn(
                                  "font-medium text-foreground",
                                  key === "claimId" && "font-mono"
                                )}>
                                  {String(value)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    <Button
                      onClick={handleUpload}
                      disabled={!pdfFile || uploadMutation.isPending}
                      className="w-full h-11"
                      data-testid="button-upload-submit"
                    >
                      {uploadMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {uploadStage || "Processing..."}
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Upload & Parse Document
                        </>
                      )}
                    </Button>
                    
                    {uploadMutation.isPending && (
                      <div className="space-y-2 mt-4">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{uploadStage}</span>
                          <span className="font-medium">{uploadProgress}%</span>
                        </div>
                        <Progress value={uploadProgress} className="h-2" />
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
              
              <Button onClick={handleSave} variant="outline" disabled={!instance} data-testid="button-save" className="h-10 gap-2">
                <Save className="h-4 w-4" />
                Save
              </Button>
              <Button onClick={handleDownload} variant="outline" disabled={!instance} data-testid="button-download" className="h-10 gap-2">
                <Download className="h-4 w-4" />
                Download
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden bg-[#F0EDF4]">
        {/* Issues Sidebar */}
        <aside className="w-[420px] border-r border-[#E3DFE8] bg-white flex flex-col shadow-sm">
          <div className="p-6 border-b border-[#E3DFE8] bg-[#F0E6FA]/30">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display font-bold text-[#342A4F] text-lg">Issues</h2>
              {issueBundle && (
                <Badge variant="secondary" className="text-sm px-2.5 py-1">
                  {filteredIssues.length} of {issueCounts.all}
                </Badge>
              )}
            </div>
            <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} className="w-full">
              <TabsList className="grid w-full grid-cols-4 h-10">
                <TabsTrigger value="all" className="text-sm" data-testid="filter-all">
                  All ({issueCounts.all})
                </TabsTrigger>
                <TabsTrigger value="open" className="text-sm" data-testid="filter-open">
                  Open ({issueCounts.open})
                </TabsTrigger>
                <TabsTrigger value="applied" className="text-sm" data-testid="filter-applied">
                  Applied ({issueCounts.applied})
                </TabsTrigger>
                <TabsTrigger value="rejected" className="text-sm" data-testid="filter-rejected">
                  Rejected ({issueCounts.rejected})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-6 space-y-4">
              {!isDocumentLoaded ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                  <div className="p-5 rounded-full bg-muted mb-5">
                    <FileText className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <p className="text-base font-medium text-foreground mb-2">No document loaded</p>
                  <p className="text-sm text-muted-foreground">
                    Select a claim and document, then click Load to view issues
                  </p>
                </div>
              ) : filteredIssues.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                  <div className="p-5 rounded-full bg-green-50 dark:bg-green-950/30 mb-5">
                    <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
                  </div>
                  <p className="text-base font-medium text-foreground mb-2">No issues found</p>
                  <p className="text-sm text-muted-foreground">
                    {filter === "all" 
                      ? "This document has no issues to correct"
                      : `No ${filter} issues found`}
                  </p>
                </div>
              ) : (
                filteredIssues.map((issue) => {
                  const statusInfo = getStatusBadge(issue.issueId);
                  const status = issueStatuses.get(issue.issueId) || "OPEN";
                  const StatusIcon = statusInfo.icon;
                  const SeverityIcon = getSeverityIcon(issue.severity);
                  
                  return (
                    <Card 
                      key={issue.issueId} 
                      className={cn(
                        "cursor-pointer transition-all hover:shadow-lg border-l-4 shadow-sm",
                        status === "OPEN" && "border-l-primary",
                        status === "APPLIED" && "border-l-green-500",
                        status === "REJECTED" && "border-l-gray-400"
                      )}
                      onClick={() => handleIssueClick(issue)}
                      data-testid={`issue-${issue.issueId}`}
                    >
                      <CardHeader className="pb-4">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <SeverityIcon className={cn("h-5 w-5 flex-shrink-0", getSeverityColor(issue.severity).split(" ")[0])} />
                            <Badge 
                              variant={statusInfo.variant} 
                              className="text-sm flex items-center gap-1.5 px-2.5 py-1" 
                              data-testid={`status-${issue.issueId}`}
                            >
                              <StatusIcon className="h-3.5 w-3.5" />
                              {statusInfo.label}
                            </Badge>
                          </div>
                          <Badge 
                            variant={issue.severity === "critical" ? "destructive" : "outline"} 
                            className={cn("text-sm px-2.5 py-1", getSeverityColor(issue.severity))}
                          >
                            {issue.severity}
                          </Badge>
                        </div>
                        <CardTitle className="text-base leading-snug">
                          {issue.label || issue.type}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0 space-y-4">
                        <div className="flex items-center gap-5 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <FileText className="h-4 w-4" />
                            Page {issue.pageIndex + 1}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Info className="h-4 w-4" />
                            {Math.round(issue.confidence * 100)}% confidence
                          </span>
                        </div>

                        {issue.foundValue && issue.expectedValue && (
                          <div className="space-y-3 p-4 rounded-lg bg-muted/50 border">
                            <div className="flex items-start gap-3">
                              <span className="text-sm text-muted-foreground min-w-[70px] font-medium">Found:</span>
                              <span className="text-sm font-mono flex-1 break-all text-foreground">{issue.foundValue}</span>
                            </div>
                            <div className="flex items-start gap-3">
                              <span className="text-sm text-muted-foreground min-w-[70px] font-medium">Expected:</span>
                              <span className="text-sm font-mono flex-1 break-all text-green-600 dark:text-green-400 font-medium">{issue.expectedValue}</span>
                            </div>
                          </div>
                        )}

                        {status === "OPEN" && (
                          <div className="flex gap-2 pt-2">
                            {issue.suggestedFix.strategy === "auto" && (
                              <Button
                                className="h-10 text-sm flex-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleApplySuggestedFix(issue);
                                }}
                                data-testid={`button-apply-${issue.issueId}`}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Apply Fix
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-10 w-10"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleManualEdit(issue);
                              }}
                              data-testid={`button-manual-${issue.issueId}`}
                            >
                              <Edit3 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-10 w-10"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReject(issue);
                              }}
                              data-testid={`button-reject-${issue.issueId}`}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </aside>

        {/* Document Viewer */}
        <main className="flex-1 bg-[#F0E6FA]/20 relative">
          {viewerLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/95 backdrop-blur-sm z-10">
              <div className="flex flex-col items-center gap-6">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
                  <div className="relative p-5 rounded-full bg-primary/10">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-base font-semibold text-foreground mb-2">Loading document viewer</p>
                  <p className="text-sm text-muted-foreground">Please wait...</p>
                </div>
              </div>
            </div>
          )}
          
          {!isDocumentLoaded ? (
            <div className="h-full flex items-center justify-center p-12">
              <div className="text-center space-y-6 max-w-lg">
                <div className="p-8 rounded-full bg-muted mx-auto w-fit">
                  <FileText className="h-16 w-16 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-3">Ready to begin</h3>
                  <p className="text-base text-muted-foreground leading-relaxed">
                    Select a claim and document from the header, then click Load to start reviewing and correcting issues.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div 
              ref={containerRef} 
              className="h-full w-full"
              data-testid="viewer-container"
            />
          )}
        </main>
      </div>
    </div>
  );
}
