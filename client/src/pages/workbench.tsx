import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useNutrientViewer } from "@/hooks/use-nutrient-viewer";
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
  FileCheck
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function Workbench() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedClaimId, setSelectedClaimId] = useState<string>("");
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>("");
  const [username, setUsername] = useState("operator-1");
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
  const dropZoneRef = useRef<HTMLDivElement>(null);

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
        return "text-red-600 bg-red-50 border-red-200";
      case "high":
        return "text-orange-600 bg-orange-50 border-orange-200";
      case "medium":
        return "text-yellow-600 bg-yellow-50 border-yellow-200";
      case "low":
        return "text-blue-600 bg-blue-50 border-blue-200";
      default:
        return "text-gray-600 bg-gray-50 border-gray-200";
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

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Professional Header */}
      <header className="border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between gap-6">
            {/* Left: Branding and Navigation */}
            <div className="flex items-center gap-6 min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-lg font-display font-semibold text-foreground">Claims Correction Workbench</h1>
                  <p className="text-xs text-muted-foreground hidden sm:block">Document review and correction platform</p>
                </div>
              </div>

              <Separator orientation="vertical" className="h-8" />

              {/* Document Selection */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="flex-1 min-w-0">
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Claim</Label>
                  <Select value={selectedClaimId} onValueChange={setSelectedClaimId} data-testid="select-claim">
                    <SelectTrigger className="w-full min-w-[180px]">
                      <SelectValue placeholder="Select claim..." />
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

                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-6" />

                <div className="flex-1 min-w-0">
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Document</Label>
                  <Select 
                    value={selectedDocumentId} 
                    onValueChange={setSelectedDocumentId} 
                    disabled={!selectedClaimId}
                    data-testid="select-document"
                  >
                    <SelectTrigger className="w-full min-w-[200px]">
                      <SelectValue placeholder="Select document..." />
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
                  className="mt-6"
                >
                  <FileCheck className="h-4 w-4 mr-2" />
                  Load
                </Button>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-md border bg-muted/50">
                <User className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="User ID"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="h-7 w-24 border-0 bg-transparent p-0 text-sm focus-visible:ring-0"
                  data-testid="input-user"
                />
              </div>

              <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" data-testid="button-upload" className="gap-2">
                    <Upload className="h-4 w-4" />
                    <span className="hidden sm:inline">Upload</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      Upload & Parse Document
                    </DialogTitle>
                    <DialogDescription>
                      Upload a PDF document. Our AI will automatically extract claim information from the first few pages.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-6 py-4">
                    {/* Drag and Drop Zone */}
                    <div
                      ref={dropZoneRef}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={cn(
                        "relative border-2 border-dashed rounded-lg p-8 transition-colors",
                        isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 bg-muted/30",
                        !pdfFile && "hover:border-primary/50"
                      )}
                    >
                      <div className="flex flex-col items-center justify-center text-center space-y-4">
                        <div className={cn(
                          "p-4 rounded-full transition-colors",
                          isDragging ? "bg-primary/10" : "bg-muted"
                        )}>
                          <FileUp className={cn(
                            "h-8 w-8 transition-colors",
                            isDragging ? "text-primary" : "text-muted-foreground"
                          )} />
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {pdfFile ? pdfFile.name : "Drag & drop PDF here, or click to browse"}
                          </p>
                          {!pdfFile && (
                            <p className="text-xs text-muted-foreground mt-1">
                              PDF files up to 25MB
                            </p>
                          )}
                        </div>
                        {!pdfFile && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => pdfInputRef.current?.click()}
                            className="mt-2"
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
                        <div className="absolute top-2 right-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={handleRemovePdf}
                            className="h-8 w-8"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* JSON File Upload */}
                    <div className="space-y-2">
                      <Label htmlFor="json-file" className="text-sm font-medium">Corrections JSON (Optional)</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="json-file"
                          type="file"
                          accept=".json,application/json"
                          onChange={handleJsonFileChange}
                          ref={jsonInputRef}
                          className="flex-1"
                          data-testid="input-json"
                        />
                        {jsonFile && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={handleRemoveJson}
                            className="h-9 w-9"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      {jsonFile && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {jsonFile.name} ({(jsonFile.size / 1024).toFixed(2)} KB)
                        </p>
                      )}
                    </div>

                    {/* Extracted Info */}
                    {extractedInfo && (
                      <Card className="border-primary/20 bg-primary/5">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-primary" />
                            Extracted Information
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            {Object.entries(extractedInfo).filter(([_, v]) => v).map(([key, value]) => (
                              <div key={key} className="flex flex-col">
                                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                                  {key.replace(/([A-Z])/g, " $1").trim()}
                                </span>
                                <span className={cn(
                                  "mt-0.5 font-medium",
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
                      className="w-full"
                      data-testid="button-upload-submit"
                      size="lg"
                    >
                      {uploadMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Parsing with AI...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Upload & Parse Document
                        </>
                      )}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              
              <Button onClick={handleSave} variant="outline" disabled={!instance} data-testid="button-save" className="gap-2">
                <Save className="h-4 w-4" />
                <span className="hidden sm:inline">Save</span>
              </Button>
              <Button onClick={handleDownload} variant="outline" disabled={!instance} data-testid="button-download" className="gap-2">
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Download</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Issues Sidebar */}
        <aside className="w-96 border-r bg-card flex flex-col">
          <div className="p-5 border-b bg-muted/30">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Issues</h2>
              {issueBundle && (
                <Badge variant="secondary" className="text-xs">
                  {filteredIssues.length} of {issueCounts.all}
                </Badge>
              )}
            </div>
            <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} className="w-full">
              <TabsList className="grid w-full grid-cols-4 h-9">
                <TabsTrigger value="all" className="text-xs" data-testid="filter-all">
                  All ({issueCounts.all})
                </TabsTrigger>
                <TabsTrigger value="open" className="text-xs" data-testid="filter-open">
                  Open ({issueCounts.open})
                </TabsTrigger>
                <TabsTrigger value="applied" className="text-xs" data-testid="filter-applied">
                  Applied ({issueCounts.applied})
                </TabsTrigger>
                <TabsTrigger value="rejected" className="text-xs" data-testid="filter-rejected">
                  Rejected ({issueCounts.rejected})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-3">
              {!isDocumentLoaded ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <div className="p-4 rounded-full bg-muted mb-4">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground mb-1">No document loaded</p>
                  <p className="text-xs text-muted-foreground">
                    Select a claim and document, then click Load to view issues
                  </p>
                </div>
              ) : filteredIssues.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <div className="p-4 rounded-full bg-green-50 dark:bg-green-950 mb-4">
                    <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
                  </div>
                  <p className="text-sm font-medium text-foreground mb-1">No issues found</p>
                  <p className="text-xs text-muted-foreground">
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
                        "cursor-pointer transition-all hover:shadow-md border-l-4",
                        status === "OPEN" && "border-l-primary",
                        status === "APPLIED" && "border-l-green-500",
                        status === "REJECTED" && "border-l-gray-400"
                      )}
                      onClick={() => handleIssueClick(issue)}
                      data-testid={`issue-${issue.issueId}`}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <SeverityIcon className={cn("h-4 w-4 flex-shrink-0", getSeverityColor(issue.severity).split(" ")[0])} />
                            <Badge 
                              variant={statusInfo.variant} 
                              className="text-xs flex items-center gap-1" 
                              data-testid={`status-${issue.issueId}`}
                            >
                              <StatusIcon className="h-3 w-3" />
                              {statusInfo.label}
                            </Badge>
                          </div>
                          <Badge 
                            variant={issue.severity === "critical" ? "destructive" : "outline"} 
                            className={cn("text-xs", getSeverityColor(issue.severity))}
                          >
                            {issue.severity}
                          </Badge>
                        </div>
                        <CardTitle className="text-sm mt-2 line-clamp-2">
                          {issue.label || issue.type}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0 space-y-3">
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            Page {issue.pageIndex + 1}
                          </span>
                          <span className="flex items-center gap-1">
                            <Info className="h-3 w-3" />
                            {Math.round(issue.confidence * 100)}% confidence
                          </span>
                        </div>

                        {issue.foundValue && issue.expectedValue && (
                          <div className="space-y-2 p-3 rounded-md bg-muted/50 border">
                            <div className="flex items-start gap-2">
                              <span className="text-xs text-muted-foreground min-w-[60px]">Found:</span>
                              <span className="text-xs font-mono flex-1 break-all">{issue.foundValue}</span>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="text-xs text-muted-foreground min-w-[60px]">Expected:</span>
                              <span className="text-xs font-mono flex-1 break-all text-green-600 dark:text-green-400">{issue.expectedValue}</span>
                            </div>
                          </div>
                        )}

                        {status === "OPEN" && (
                          <div className="flex gap-2 pt-2">
                            {issue.suggestedFix.strategy === "auto" && (
                              <Button
                                size="sm"
                                className="h-8 text-xs flex-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleApplySuggestedFix(issue);
                                }}
                                data-testid={`button-apply-${issue.issueId}`}
                              >
                                <CheckCircle2 className="h-3 w-3 mr-1.5" />
                                Apply Fix
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs px-3"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleManualEdit(issue);
                              }}
                              data-testid={`button-manual-${issue.issueId}`}
                            >
                              <Edit3 className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs px-3"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReject(issue);
                              }}
                              data-testid={`button-reject-${issue.issueId}`}
                            >
                              <XCircle className="h-3 w-3" />
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
        <main className="flex-1 bg-muted/20 relative">
          {viewerLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/90 backdrop-blur-sm z-10">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
                  <div className="relative p-4 rounded-full bg-primary/10">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground mb-1">Loading document viewer</p>
                  <p className="text-xs text-muted-foreground">Please wait...</p>
                </div>
              </div>
            </div>
          )}
          
          {!isDocumentLoaded ? (
            <div className="h-full flex items-center justify-center p-8">
              <div className="text-center space-y-4 max-w-md">
                <div className="p-6 rounded-full bg-muted mx-auto w-fit">
                  <FileText className="h-12 w-12 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">Ready to begin</h3>
                  <p className="text-sm text-muted-foreground">
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
