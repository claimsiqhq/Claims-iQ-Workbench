import React, { useEffect, useMemo, useRef as useReactRef, useCallback } from "react";

// Force full page reload on HMR to prevent hook state corruption
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    window.location.reload();
  });
}
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useNutrientViewer } from "@/hooks/use-nutrient-viewer";
import { useWorkbenchState } from "@/hooks/use-workbench-state";
import { FixEngine } from "@/lib/fix-engine";
import { PDFAdapterFactory } from "@/lib/adapters";
import type { Issue, IssueStatus, Claim, Document } from "@shared/schema";
import type { Annotation, Correction } from "@shared/schemas";
import { AnnotationPanel } from "@/components/annotation-panel";
import { CrossDocumentValidationPanel } from "@/components/cross-document-validation-panel";
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
  LogIn,
  Bell,
  Monitor,
  FileDown,
  Highlighter,
  Search,
  Type,
  Calendar,
  Phone,
  MapPin,
  Hash,
  PanelLeftClose,
  PanelLeft
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { cn } from "@/lib/utils";

function Workbench() {
  const state = useWorkbenchState();
  const {
    toast,
    queryClient,
    setLocation,
    user,
    signOut,
    isAuthConfigured,
    authLoading,
    selectedClaimId,
    setSelectedClaimId,
    selectedDocumentId,
    setSelectedDocumentId,
    username,
    issueStatuses,
    setIssueStatuses,
    issueAnnotations,
    setIssueAnnotations,
    filter,
    setFilter,
    isDocumentLoaded,
    setIsDocumentLoaded,
    uploadDialogOpen,
    setUploadDialogOpen,
    pdfFile,
    setPdfFile,
    jsonFile,
    setJsonFile,
    isDragging,
    setIsDragging,
    pdfInputRef,
    jsonInputRef,
    sessionData,
    setSessionData,
    extractedInfo,
    setExtractedInfo,
    uploadProgress,
    setUploadProgress,
    uploadStage,
    setUploadStage,
    globalDragging,
    setGlobalDragging,
    dropZoneRef,
    dragCounterRef,
    pdfAdapter,
    setPdfAdapter,
    fixEngine,
    setFixEngine,
    annotations,
    setAnnotations,
    crossDocValidations,
    setCrossDocValidations,
    showIssuesPanel,
    setShowIssuesPanel,
    showAnnotationPanel,
    setShowAnnotationPanel,
    showValidationPanel,
    setShowValidationPanel,
    currentPage,
    setCurrentPage,
    settingsDialogOpen,
    setSettingsDialogOpen,
    notifyOnApply,
    setNotifyOnApply,
    notifyOnReject,
    setNotifyOnReject,
    defaultFilter,
    setDefaultFilter,
    itemsPerPage,
    setItemsPerPage,
  } = state;

  const issuesPanelRef = useReactRef<ImperativePanelHandle>(null);

  const toggleIssuesPanel = useCallback(() => {
    const panel = issuesPanelRef.current;
    if (panel) {
      if (panel.isCollapsed()) {
        panel.expand();
        setShowIssuesPanel(true);
      } else {
        panel.collapse();
        setShowIssuesPanel(false);
      }
    }
  }, [setShowIssuesPanel]);

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
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setSelectedClaimId(data.claimId);
      setSelectedDocumentId(data.documentId);
      setIsDocumentLoaded(true);
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

  // Initialize adapter when viewer instance is ready
  useEffect(() => {
    if (instance && isDocumentLoaded) {
      PDFAdapterFactory.create("nutrient", instance)
        .then((adapter) => {
          setPdfAdapter(adapter);
          setFixEngine(new FixEngine(adapter, instance));
        })
        .catch((err) => {
          console.error("Failed to create PDF adapter:", err);
        });
    } else {
      setPdfAdapter(null);
      setFixEngine(null);
    }
  }, [instance, isDocumentLoaded]);

  // Fetch annotations when document is loaded
  const { data: fetchedAnnotations } = useQuery({
    queryKey: ["annotations", selectedDocumentId],
    queryFn: () => api.getAnnotations(selectedDocumentId),
    enabled: !!selectedDocumentId && isDocumentLoaded,
  });

  useEffect(() => {
    if (fetchedAnnotations) {
      setAnnotations(fetchedAnnotations);
    } else {
      setAnnotations([]);
    }
  }, [fetchedAnnotations]);

  // Fetch cross-document validations when claim is selected
  const { data: fetchedValidations } = useQuery({
    queryKey: ["crossDocValidations", selectedClaimId],
    queryFn: () => api.getCrossDocumentValidations(selectedClaimId),
    enabled: !!selectedClaimId,
  });

  useEffect(() => {
    if (fetchedValidations) {
      setCrossDocValidations(fetchedValidations);
    } else {
      setCrossDocValidations([]);
    }
  }, [fetchedValidations]);

  useEffect(() => {
    setIsDocumentLoaded(false);
    setSessionData(null);
    setIssueAnnotations(new Map());
    setAnnotations([]);
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
          strokeWidth: 3,
          isEditable: false,
          opacity: 0.4,
          fillColor: color,
          fillOpacity: 0.1,
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
      case "warning":
        return new instance.Color(234, 179, 8);
      case "info":
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
    if (!instance) {
      toast({
        title: "Viewer Not Ready",
        description: "PDF viewer is still initializing",
        variant: "destructive",
      });
      return;
    }

    // Set selected issue for UI highlighting
    setSelectedIssueId(issue.issueId);

    try {
      // Step 1: Navigate to the page
      await instance.setViewState((viewState: any) =>
        viewState.set("currentPageIndex", issue.pageIndex)
      );

      // Step 2: Ensure annotation exists, create if needed
      let annotationId = issueAnnotations.get(issue.issueId);
      
      if (!annotationId && issue.rect) {
        // Create the annotation if it doesn't exist
        try {
          const Annotations = await instance.Annotations;
          const Geometry = await instance.Geometry;
          const Color = await instance.Color;

          const color = getIssueColor(issue.severity);
          const annotation = new Annotations.RectangleAnnotation({
            pageIndex: issue.pageIndex,
            boundingBox: new Geometry.Rect(issue.rect),
            strokeColor: color,
            strokeWidth: 3,
            isEditable: false,
            opacity: 0.4,
            fillColor: color,
            fillOpacity: 0.1,
            customData: { issueId: issue.issueId },
          });

          const createdAnnotation = await instance.create(annotation);
          annotationId = createdAnnotation.id;
          setIssueAnnotations((prev) => new Map(prev).set(issue.issueId, annotationId!));
        } catch (annotationError) {
          console.error("Failed to create annotation:", annotationError);
        }
      }

      // Step 3: Wait a bit for page to render, then select and zoom to annotation
      if (annotationId && issue.rect) {
        // Small delay to ensure page is rendered
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Select the annotation (this will highlight it in the viewer)
        await instance.setSelectedAnnotation(annotationId);
        
        // Step 4: Try to zoom/pan to fit the annotation in view
        try {
          // Try using viewer's built-in methods if available
          if (typeof instance.zoomToAnnotation === 'function') {
            await instance.zoomToAnnotation(annotationId);
          } else if (typeof instance.fitToView === 'function') {
            const Geometry = await instance.Geometry;
            const rect = new Geometry.Rect(issue.rect);
            await instance.fitToView(rect, issue.pageIndex);
          } else {
            // Fallback: Set zoom mode to fit width which usually shows annotations better
            await instance.setViewState((viewState: any) => {
              return viewState.merge({
                currentPageIndex: issue.pageIndex,
                zoom: { zoomMode: 'FIT_TO_WIDTH' }
              });
            });
          }
        } catch (zoomError) {
          // If zoom methods aren't available, that's okay - selection still works
          console.log("Zoom to annotation not available, annotation is selected");
        }
      }
    } catch (err) {
      console.error("Failed to navigate to issue:", err);
      toast({
        title: "Navigation Error",
        description: err instanceof Error ? err.message : "Failed to navigate to issue",
        variant: "destructive",
      });
      setSelectedIssueId(null);
    }
  };

  const handleApplySuggestedFix = async (issue: Issue) => {
    if (!fixEngine) {
      toast({
        title: "Not Ready",
        description: "PDF viewer is still initializing",
        variant: "destructive",
      });
      return;
    }

    // Navigate to issue first if not already there
    if (selectedIssueId !== issue.issueId) {
      await handleIssueClick(issue);
      // Wait a moment for navigation
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    try {
      const result = await fixEngine.applyFix(issue);

      if (result.success) {
        setIssueStatuses((prev) => new Map(prev).set(issue.issueId, "APPLIED"));
        setSelectedIssueId(null); // Clear selection after applying
        
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

  const handleManualEdit = async (issue: Issue) => {
    // Navigate to issue first if not already there
    if (selectedIssueId !== issue.issueId) {
      await handleIssueClick(issue);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
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

  const handleReject = async (issue: Issue) => {
    // Navigate to issue first if not already there
    if (selectedIssueId !== issue.issueId) {
      await handleIssueClick(issue);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    setIssueStatuses((prev) => new Map(prev).set(issue.issueId, "REJECTED"));
    setSelectedIssueId(null); // Clear selection after rejecting
    
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

  const handleResetIssue = (issue: Issue) => {
    setIssueStatuses((prev) => new Map(prev).set(issue.issueId, "OPEN"));

    auditMutation.mutate({
      claimId: selectedClaimId,
      documentId: selectedDocumentId,
      issueId: issue.issueId,
      action: "reset",
      user: username,
      ts: new Date().toISOString(),
    });

    toast({
      title: "Issue Reset",
      description: "Back to open — you can now apply the suggested fix",
    });
  };

  // Annotation handlers
  const handleCreateAnnotation = async (annotation: Annotation) => {
    if (!selectedDocumentId) return;
    
    try {
      const created = await api.saveAnnotation(selectedDocumentId, annotation);
      setAnnotations((prev) => [...prev, created]);
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["annotations", selectedDocumentId] });
      
      // Also create via adapter if available
      if (pdfAdapter) {
        await pdfAdapter.createAnnotation(annotation);
      }
      
      toast({
        title: "Annotation Created",
        description: `${annotation.type} annotation added`,
      });
    } catch (error) {
      toast({
        title: "Failed to Create Annotation",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
      throw error; // Re-throw for optimistic update rollback
    }
  };

  const handleDeleteAnnotation = async (annotationId: string) => {
    const previousAnnotations = annotations;
    
    // Optimistic update
    setAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
    
    try {
      await api.deleteAnnotation(annotationId);
      queryClient.invalidateQueries({ queryKey: ["annotations", selectedDocumentId] });
      
      toast({
        title: "Annotation Deleted",
        description: "Annotation removed",
      });
    } catch (error) {
      // Rollback on error
      setAnnotations(previousAnnotations);
      toast({
        title: "Failed to Delete Annotation",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  // Cross-document validation handlers
  const handleResolveValidation = async (validationId: string, resolvedValue: string) => {
    const previousValidations = crossDocValidations;
    
    // Optimistic update
    setCrossDocValidations((prev) =>
      prev.map((v) =>
        v.id === validationId
          ? { ...v, status: "resolved" as const, resolved_value: resolvedValue }
          : v
      )
    );
    
    try {
      await api.resolveCrossDocValidation(validationId, resolvedValue);
      queryClient.invalidateQueries({ queryKey: ["crossDocValidations", selectedClaimId] });
      
      toast({
        title: "Validation Resolved",
        description: `Resolved with value: ${resolvedValue}`,
      });
    } catch (error) {
      // Rollback on error
      setCrossDocValidations(previousValidations);
      toast({
        title: "Failed to Resolve Validation",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleIgnoreValidation = async (validationId: string) => {
    const previousValidations = crossDocValidations;
    
    // Optimistic update
    setCrossDocValidations((prev) =>
      prev.map((v) =>
        v.id === validationId ? { ...v, status: "ignored" as const } : v
      )
    );
    
    try {
      await api.updateCrossDocumentValidationStatus(validationId, "ignored");
      queryClient.invalidateQueries({ queryKey: ["crossDocValidations", selectedClaimId] });
      
      toast({
        title: "Validation Ignored",
        description: "Validation marked as ignored",
      });
    } catch (error) {
      // Rollback on error
      setCrossDocValidations(previousValidations);
      toast({
        title: "Failed to Ignore Validation",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleEscalateValidation = async (validationId: string, reason: string) => {
    const previousValidations = crossDocValidations;
    
    // Optimistic update
    setCrossDocValidations((prev) =>
      prev.map((v) =>
        v.id === validationId ? { ...v, status: "escalated" as const } : v
      )
    );
    
    try {
      await api.escalateCrossDocValidation(validationId, reason);
      queryClient.invalidateQueries({ queryKey: ["crossDocValidations", selectedClaimId] });
      
      toast({
        title: "Validation Escalated",
        description: "Validation has been escalated for review",
        variant: "destructive",
      });
    } catch (error) {
      // Rollback on error
      setCrossDocValidations(previousValidations);
      toast({
        title: "Failed to Escalate Validation",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleTriggerValidation = async () => {
    if (!selectedClaimId) return;
    
    try {
      const result = await api.validateCrossDocument(selectedClaimId);
      setCrossDocValidations(result);
      queryClient.invalidateQueries({ queryKey: ["crossDocValidations", selectedClaimId] });
      
      toast({
        title: "Validation Complete",
        description: `Found ${result.length} inconsistencies`,
      });
    } catch (error) {
      toast({
        title: "Validation Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
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
      case "warning":
        return AlertCircle;
      case "info":
        return Info;
      default:
        return AlertCircle;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/30 dark:border-red-800";
      case "warning":
        return "text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/30 dark:border-amber-800";
      case "info":
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

  // Helper functions for correction type display
  const getCorrectionTypeIcon = (type: string) => {
    const icons: Record<string, typeof Type> = {
      typo: Type,
      date_error: Calendar,
      phone_format: Phone,
      name_mismatch: User,
      address_error: MapPin,
      numeric_error: Hash,
      missing_value: AlertCircle,
      format_standardization: FileText,
      data_inconsistency: AlertTriangle,
    };
    return icons[type.toLowerCase().replace(/[^a-z]/g, "")] || null;
  };

  const formatCorrectionType = (type: string): string => {
    return type
      .replace(/_/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const pendingValidationCount = crossDocValidations.filter((v) => v.status === "pending").length;
  const hasClaims = claims && claims.length > 0;
  const hasDocuments = documents && documents.length > 0;

  return (
    <div className="h-screen flex flex-col bg-background relative">
      {globalDragging && (
        <div 
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center"
          data-testid="global-drop-overlay"
        >
          <div className="bg-card border-2 border-dashed border-primary rounded-xl p-10 shadow-2xl max-w-sm mx-4">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="p-4 rounded-full bg-primary/10">
                <FileUp className="h-8 w-8 text-primary" />
              </div>
              <p className="text-lg font-semibold">Drop files here</p>
              <p className="text-sm text-muted-foreground">PDF or JSON correction files</p>
            </div>
          </div>
        </div>
      )}

      {showSchemaWarning && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-800 px-4 py-2">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span><strong>Setup required:</strong> Run <code className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded text-xs font-mono">supabase/schema.sql</code> in your Supabase SQL Editor.</span>
          </div>
        </div>
      )}
      
      <header className="border-b bg-white shadow-sm shrink-0">
        <div className="h-auto min-h-[56px] px-4 py-2 flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2.5 shrink-0">
            <img src="/claims-iq-logo.png" alt="Claims IQ" className="h-7 w-auto" />
            <div className="hidden md:block">
              <h1 className="font-display font-bold text-[#342A4F] text-sm leading-tight">Claims IQ</h1>
              <p className="text-[10px] text-[#7763B7] font-medium leading-tight">Correction Workbench</p>
            </div>
          </div>

          <Separator orientation="vertical" className="h-6 hidden md:block" />

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Select value={selectedClaimId} onValueChange={setSelectedClaimId} data-testid="select-claim">
              <SelectTrigger className="h-8 w-[140px] sm:w-[160px] text-sm" aria-label="Select claim" data-testid="trigger-claim">
                <SelectValue placeholder={hasClaims ? "Select claim..." : "No claims yet"} />
              </SelectTrigger>
              <SelectContent>
                {!hasClaims ? (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground" data-testid="text-empty-claims">
                    <Upload className="h-5 w-5 mx-auto mb-2 opacity-50" />
                    <p className="font-medium">No claims found</p>
                    <p className="text-xs mt-1">Upload a PDF to create one</p>
                  </div>
                ) : (
                  claims.map((claim) => (
                    <SelectItem key={claim.claimId} value={claim.claimId} data-testid={`claim-${claim.claimId}`}>
                      {claim.claimNumber || claim.claimId}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 hidden sm:block" />

            <Select 
              value={selectedDocumentId} 
              onValueChange={setSelectedDocumentId} 
              disabled={!selectedClaimId}
              data-testid="select-document"
            >
              <SelectTrigger className="h-8 w-[140px] sm:w-[180px] text-sm" aria-label="Select document" data-testid="trigger-document">
                <SelectValue placeholder={!selectedClaimId ? "Pick claim first" : (hasDocuments ? "Select document..." : "No documents")} />
              </SelectTrigger>
              <SelectContent>
                {!hasDocuments ? (
                  <div className="px-3 py-4 text-center text-sm text-muted-foreground" data-testid="text-empty-documents">
                    <p>No documents for this claim</p>
                  </div>
                ) : (
                  documents.map((doc) => (
                    <SelectItem key={doc.documentId} value={doc.documentId} data-testid={`document-${doc.documentId}`}>
                      {doc.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            <Button 
              onClick={handleLoadDocument} 
              disabled={!selectedClaimId || !selectedDocumentId || isDocumentLoaded}
              data-testid="button-load"
              size="sm"
              className="h-8 px-3 text-sm"
            >
              <FileCheck className="h-3.5 w-3.5 mr-1.5" />
              Load
            </Button>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant={showIssuesPanel ? "secondary" : "ghost"}
              size="sm"
              className="h-8 w-8 p-0"
              onClick={toggleIssuesPanel}
              data-testid="button-toggle-issues"
              title={showIssuesPanel ? "Hide Issues Panel" : "Show Issues Panel"}
            >
              {showIssuesPanel ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
            </Button>

            {isDocumentLoaded && selectedDocumentId && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 relative"
                onClick={() => {
                  if (!showAnnotationPanel) setShowValidationPanel(false);
                  setShowAnnotationPanel(!showAnnotationPanel);
                }}
                data-testid="button-annotations"
                title="Annotations"
              >
                <Highlighter className="h-4 w-4" />
                {annotations.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] rounded-full bg-primary text-[10px] text-white flex items-center justify-center px-0.5">
                    {annotations.length}
                  </span>
                )}
              </Button>
            )}

            {selectedClaimId && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 relative"
                onClick={() => {
                  if (!showValidationPanel) setShowAnnotationPanel(false);
                  setShowValidationPanel(!showValidationPanel);
                }}
                data-testid="button-cross-doc-validation"
                title="Cross-Document Validation"
              >
                <AlertTriangle className="h-4 w-4" />
                {pendingValidationCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] rounded-full bg-red-500 text-[10px] text-white flex items-center justify-center px-0.5">
                    {pendingValidationCount}
                  </span>
                )}
              </Button>
            )}

            <Separator orientation="vertical" className="h-5 mx-1 hidden sm:block" />

            <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-8 gap-1.5 text-sm" data-testid="button-upload">
                  <Upload className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Upload</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Upload Document
                  </DialogTitle>
                  <DialogDescription>
                    Upload a PDF and optionally a corrections JSON file.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div
                    ref={dropZoneRef}
                    data-dropzone
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={cn(
                      "relative border-2 border-dashed rounded-lg p-8 transition-colors cursor-pointer",
                      isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/20 bg-muted/20",
                      !pdfFile && "hover:border-primary/50"
                    )}
                    onClick={() => !pdfFile && pdfInputRef.current?.click()}
                  >
                    <div className="flex flex-col items-center text-center gap-3">
                      <div className={cn("p-3 rounded-full", isDragging ? "bg-primary/10" : "bg-muted")}>
                        <FileUp className={cn("h-6 w-6", isDragging ? "text-primary" : "text-muted-foreground")} />
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {pdfFile ? pdfFile.name : "Drop PDF here or click to browse"}
                        </p>
                        {!pdfFile && <p className="text-xs text-muted-foreground mt-1">Up to 25MB</p>}
                      </div>
                    </div>
                    <Input ref={pdfInputRef} type="file" accept=".pdf,application/pdf" onChange={handlePdfFileChange} className="hidden" data-testid="input-pdf" />
                    {pdfFile && (
                      <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 h-7 w-7" aria-label="Remove PDF file" data-testid="button-remove-pdf" onClick={(e) => { e.stopPropagation(); handleRemovePdf(); }}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="json-file" className="text-sm font-medium">Corrections JSON (optional)</Label>
                    <div className="flex items-center gap-2">
                      <Input id="json-file" type="file" accept=".json,application/json" onChange={handleJsonFileChange} ref={jsonInputRef} className="flex-1 h-9 text-sm" data-testid="input-json" />
                      {jsonFile && (
                        <Button type="button" variant="ghost" size="icon" aria-label="Remove JSON file" data-testid="button-remove-json" onClick={handleRemoveJson} className="h-9 w-9 shrink-0">
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    {jsonFile && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" />
                        {jsonFile.name} ({(jsonFile.size / 1024).toFixed(1)} KB)
                      </p>
                    )}
                  </div>

                  {extractedInfo && (
                    <Card className="border-primary/20 bg-primary/5">
                      <CardHeader className="py-3 px-4">
                        <CardTitle className="text-sm flex items-center gap-1.5">
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                          Extracted Info
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-3">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          {Object.entries(extractedInfo).filter(([_, v]) => v).map(([key, value]) => (
                            <div key={key}>
                              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                              <p className={cn("text-sm font-medium", key === "claimId" && "font-mono")}>{String(value)}</p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <Button onClick={handleUpload} disabled={!pdfFile || uploadMutation.isPending} className="w-full h-9" data-testid="button-upload-submit">
                    {uploadMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{uploadStage || "Processing..."}</>
                    ) : (
                      <><Sparkles className="h-4 w-4 mr-2" />Upload & Parse</>
                    )}
                  </Button>
                  
                  {uploadMutation.isPending && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{uploadStage}</span>
                        <span className="font-medium">{uploadProgress}%</span>
                      </div>
                      <Progress value={uploadProgress} className="h-1.5" />
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" data-testid="button-more-actions" title="More actions" aria-label="More actions">
                  <Settings className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-xs">Document</DropdownMenuLabel>
                <DropdownMenuItem onClick={handleSave} disabled={!instance} data-testid="button-save">
                  <Save className="h-4 w-4 mr-2" /> Save
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDownload} disabled={!instance} data-testid="button-download">
                  <Download className="h-4 w-4 mr-2" /> Download PDF
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Export</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => {
                    const logs = JSON.stringify({ exportedAt: new Date().toISOString(), claimId: selectedClaimId, documentId: selectedDocumentId, issueStatuses: Object.fromEntries(issueStatuses) }, null, 2);
                    const blob = new Blob([logs], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = url; a.download = `audit-log-${selectedClaimId || 'all'}-${new Date().toISOString().split('T')[0]}.json`; a.click(); URL.revokeObjectURL(url);
                    toast({ title: "Exported", description: "Audit log downloaded" });
                  }}
                  data-testid="button-export-audit"
                >
                  <Download className="h-4 w-4 mr-2" /> Audit Log (JSON)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    const issues = issueBundle?.issues || [];
                    const csv = [['Issue ID','Type','Severity','Status','Label','Found Value','Expected Value'].join(','), ...issues.map(issue => [issue.issueId,issue.type,issue.severity,issueStatuses.get(issue.issueId)||'OPEN',`"${(issue.label||'').replace(/"/g,'""')}"`,`"${(issue.foundValue||'').replace(/"/g,'""')}"`,`"${(issue.expectedValue||'').replace(/"/g,'""')}"`].join(','))].join('\n');
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = url; a.download = `issues-${selectedClaimId||'all'}-${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(url);
                    toast({ title: "Exported", description: "Issues report downloaded" });
                  }}
                  data-testid="button-export-report"
                >
                  <FileText className="h-4 w-4 mr-2" /> Issues Report (CSV)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Preferences</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setLocation('/settings')} data-testid="button-settings">
                  <Settings className="h-4 w-4 mr-2" /> Settings
                </DropdownMenuItem>
                {user && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-xs text-muted-foreground cursor-default" disabled>
                      <User className="h-3.5 w-3.5 mr-2" /> {user.email}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => signOut().then(() => setLocation('/login'))} data-testid="button-signout">
                      <LogOut className="h-4 w-4 mr-2" /> Sign Out
                    </DropdownMenuItem>
                  </>
                )}
                {!user && isAuthConfigured && (
                  <DropdownMenuItem onClick={() => setLocation('/login')}>
                    <LogIn className="h-4 w-4 mr-2" /> Sign In
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <ResizablePanelGroup direction="horizontal" className="flex-1 min-w-0">
        <ResizablePanel
          ref={issuesPanelRef}
          defaultSize={25}
          minSize={20}
          maxSize={45}
          collapsible
          collapsedSize={0}
          onCollapse={() => setShowIssuesPanel(false)}
          onExpand={() => setShowIssuesPanel(true)}
          className="bg-card flex flex-col overflow-hidden min-w-0"
        >
          <div className="px-3 py-2.5 border-b bg-muted/30 shrink-0 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-display font-semibold text-foreground text-sm">Issues</h2>
              {issueBundle && (
                <span className="text-xs text-muted-foreground">{filteredIssues.length}/{issueCounts.all}</span>
              )}
            </div>
            <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} className="w-full min-w-0">
              <TabsList className="grid w-full grid-cols-4 h-7 min-w-0">
                <TabsTrigger value="all" className="text-xs px-1 min-w-0 truncate" data-testid="filter-all">All {issueCounts.all > 0 && `(${issueCounts.all})`}</TabsTrigger>
                <TabsTrigger value="open" className="text-xs px-1 min-w-0 truncate" data-testid="filter-open">Open {issueCounts.open > 0 && `(${issueCounts.open})`}</TabsTrigger>
                <TabsTrigger value="applied" className="text-xs px-1 min-w-0 truncate" data-testid="filter-applied">Done {issueCounts.applied > 0 && `(${issueCounts.applied})`}</TabsTrigger>
                <TabsTrigger value="rejected" className="text-xs px-1 min-w-0 truncate" data-testid="filter-rejected">Skipped {issueCounts.rejected > 0 && `(${issueCounts.rejected})`}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2.5 space-y-2 w-full overflow-x-hidden">
              {!isDocumentLoaded ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <FileText className="h-8 w-8 text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">No document loaded</p>
                  <p className="text-xs text-muted-foreground/70 mt-1 max-w-[200px]">
                    {hasClaims
                      ? "Select a claim and document, then click Load"
                      : "Upload a PDF to get started"}
                  </p>
                  {!hasClaims && (
                    <Button size="sm" variant="outline" className="mt-4 h-7 text-xs" onClick={() => setUploadDialogOpen(true)}>
                      <Upload className="h-3 w-3 mr-1.5" /> Upload PDF
                    </Button>
                  )}
                </div>
              ) : filteredIssues.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <CheckCircle2 className="h-8 w-8 text-green-500/60 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">All clear</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    {filter === "all" ? "No issues detected" : `No ${filter} issues`}
                  </p>
                </div>
              ) : (
                filteredIssues.map((issue) => {
                  const statusInfo = getStatusBadge(issue.issueId);
                  const status = issueStatuses.get(issue.issueId) || "OPEN";
                  const SeverityIcon = getSeverityIcon(issue.severity);
                  
                  return (
                    <div 
                      key={issue.issueId} 
                      className={cn(
                        "rounded-lg border p-3 cursor-pointer transition-all hover:shadow-md",
                        "border-l-[3px]",
                        "hover:bg-accent/50",
                        selectedIssueId === issue.issueId && "ring-2 ring-primary ring-offset-2 bg-primary/5",
                        status === "OPEN" && "border-l-primary bg-card",
                        status === "APPLIED" && "border-l-green-500 bg-green-50/30 dark:bg-green-950/10",
                        status === "MANUAL" && "border-l-blue-500 bg-blue-50/30 dark:bg-blue-950/10",
                        status === "REJECTED" && "border-l-gray-300 bg-gray-50/30 dark:bg-gray-950/10 opacity-70"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleIssueClick(issue);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleIssueClick(issue);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`Issue: ${issue.label || formatCorrectionType(issue.type)} on page ${issue.pageIndex + 1}`}
                      aria-selected={selectedIssueId === issue.issueId}
                      data-testid={`issue-${issue.issueId}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5 min-w-0">
                        <div className="flex items-start gap-1.5 min-w-0 flex-1">
                          <SeverityIcon className={cn("h-4 w-4 shrink-0 mt-0.5", getSeverityColor(issue.severity).split(" ")[0])} />
                          <span className="text-sm font-medium break-words leading-snug min-w-0" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>{issue.label || formatCorrectionType(issue.type)}</span>
                        </div>
                        <Badge 
                          variant="outline" 
                          className={cn("text-[10px] px-1.5 py-0 h-5 shrink-0", getSeverityColor(issue.severity))}
                          data-testid={`status-${issue.issueId}`}
                        >
                          {issue.severity}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mb-2 flex-wrap">
                        <span>Page {issue.pageIndex + 1}</span>
                        <span>{Math.round(issue.confidence * 100)}%</span>
                        <span className="capitalize">{statusInfo.label}</span>
                      </div>

                      {issue.foundValue && issue.expectedValue && (
                        <div className="rounded bg-muted/50 border p-2 space-y-1 text-xs mb-2 min-w-0">
                          <div className="flex gap-2 min-w-0 w-full">
                            <span className="text-muted-foreground w-14 shrink-0">Found:</span>
                            <span className="font-mono text-foreground break-all min-w-0 flex-1" style={{ wordBreak: 'break-all', overflowWrap: 'anywhere' }}>{issue.foundValue}</span>
                          </div>
                          <div className="flex gap-2 min-w-0 w-full">
                            <span className="text-muted-foreground w-14 shrink-0">Fix:</span>
                            <span className="font-mono text-green-600 dark:text-green-400 break-all min-w-0 flex-1 font-medium" style={{ wordBreak: 'break-all', overflowWrap: 'anywhere' }}>{issue.expectedValue}</span>
                          </div>
                        </div>
                      )}

                      {status === "OPEN" && (
                        <div className="flex gap-1.5 flex-wrap">
                          {issue.suggestedFix.strategy === "auto" && (
                            <Button 
                              size="sm" 
                              className="h-7 text-xs flex-1 min-w-[80px]" 
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                handleApplySuggestedFix(issue); 
                              }} 
                              data-testid={`button-apply-${issue.issueId}`}
                              title="Apply suggested fix"
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1 shrink-0" /> 
                              <span className="truncate">Apply</span>
                            </Button>
                          )}
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-7 w-7 p-0 shrink-0" 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              handleManualEdit(issue); 
                            }} 
                            data-testid={`button-manual-${issue.issueId}`} 
                            title="Manual edit"
                            aria-label="Manual edit"
                          >
                            <Edit3 className="h-3 w-3" />
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-7 w-7 p-0 shrink-0" 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              handleReject(issue); 
                            }} 
                            data-testid={`button-reject-${issue.issueId}`} 
                            title="Reject as false positive"
                            aria-label="Reject"
                          >
                            <XCircle className="h-3 w-3" />
                          </Button>
                        </div>
                      )}

                      {(status === "MANUAL" || status === "APPLIED" || status === "REJECTED") && (
                        <div className="flex gap-1.5 flex-wrap">
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); handleResetIssue(issue); }} data-testid={`button-reset-${issue.issueId}`}>
                            <ChevronRight className="h-3 w-3 mr-1 rotate-180 shrink-0" /> Reset to Open
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={75} className="bg-muted/20 relative overflow-hidden">
          {viewerLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/90 backdrop-blur-sm z-10">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading viewer...</p>
              </div>
            </div>
          )}
          
          {!isDocumentLoaded ? (
            <div className="h-full flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <div className="p-5 rounded-2xl bg-muted/50 mx-auto w-fit mb-6">
                  <FileText className="h-12 w-12 text-muted-foreground/40" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Ready to review</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                  {hasClaims 
                    ? "Select a claim and document from the toolbar above, then click Load to begin reviewing."
                    : "Upload a PDF document to get started. You can also include a corrections JSON file for automated issue detection."}
                </p>
                {!hasClaims && (
                  <Button onClick={() => setUploadDialogOpen(true)} className="h-9" data-testid="button-upload-empty">
                    <Upload className="h-4 w-4 mr-2" /> Upload Document
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex">
              <div ref={containerRef} className="flex-1 h-full" data-testid="viewer-container" />
              
              {showAnnotationPanel && isDocumentLoaded && selectedDocumentId && (
                <>
                  <div className="fixed inset-0 bg-black/20 z-10 lg:hidden" onClick={() => setShowAnnotationPanel(false)} />
                  <div className="w-[300px] lg:w-[320px] fixed lg:relative inset-y-0 right-0 border-l bg-card flex flex-col shadow-lg z-20">
                    <div className="h-10 px-3 border-b flex items-center justify-between shrink-0">
                      <h3 className="font-semibold text-sm">Annotations</h3>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setShowAnnotationPanel(false)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <AnnotationPanel adapter={pdfAdapter} documentId={selectedDocumentId} annotations={annotations} onCreateAnnotation={handleCreateAnnotation} onDeleteAnnotation={handleDeleteAnnotation} currentPage={currentPage} />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>

      {showValidationPanel && selectedClaimId && (
        <>
          <div className="fixed inset-0 bg-black/20 z-10 lg:hidden" onClick={() => setShowValidationPanel(false)} />
          <div className="w-[320px] lg:w-[360px] fixed inset-y-0 right-0 border-l bg-card flex flex-col shadow-lg z-20">
            <div className="h-10 px-3 border-b flex items-center justify-between shrink-0">
              <h3 className="font-semibold text-sm">Cross-Doc Validation</h3>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={handleTriggerValidation}>
                  <Search className="h-3 w-3 mr-1" /> Validate
                </Button>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setShowValidationPanel(false)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <CrossDocumentValidationPanel claimId={selectedClaimId} validations={crossDocValidations} onResolve={handleResolveValidation} onIgnore={handleIgnoreValidation} onEscalate={handleEscalateValidation} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

Workbench.displayName = 'Workbench';
export default Workbench;
