import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useNutrientViewer } from "@/hooks/use-nutrient-viewer";
import { FixEngine } from "@/lib/fix-engine";
import type { Issue, IssueStatus, Claim, Document } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { 
  FileText, 
  Download, 
  Save, 
  CheckCircle2, 
  XCircle, 
  Edit3, 
  AlertCircle,
  Loader2
} from "lucide-react";

export default function Workbench() {
  const { toast } = useToast();
  const [selectedClaimId, setSelectedClaimId] = useState<string>("");
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>("");
  const [username, setUsername] = useState("operator-1");
  const [issueStatuses, setIssueStatuses] = useState<Map<string, IssueStatus>>(new Map());
  const [issueAnnotations, setIssueAnnotations] = useState<Map<string, string>>(new Map());
  const [filter, setFilter] = useState<"all" | "open" | "applied" | "rejected">("all");
  const [isDocumentLoaded, setIsDocumentLoaded] = useState(false);

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

  const auditMutation = useMutation({
    mutationFn: api.logAudit,
  });

  const { instance, isLoading: viewerLoading, containerRef } = useNutrientViewer({
    documentUrl: isDocumentLoaded && selectedDocumentId 
      ? `https://example.com/demo.pdf` 
      : undefined,
  });

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
    switch (severity) {
      case "critical":
        return new instance.Color(255, 0, 0);
      case "high":
        return new instance.Color(255, 165, 0);
      case "medium":
        return new instance.Color(255, 215, 0);
      case "low":
        return new instance.Color(100, 149, 237);
      default:
        return new instance.Color(128, 128, 128);
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
    const variants: Record<IssueStatus, { variant: any; label: string }> = {
      OPEN: { variant: "default", label: "Open" },
      APPLIED: { variant: "default", label: "Applied" },
      MANUAL: { variant: "secondary", label: "Manual" },
      REJECTED: { variant: "outline", label: "Rejected" },
    };
    return variants[status];
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <div className="border-b bg-card px-6 py-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-display font-semibold">Claims File Correction Workbench</h1>
          </div>
          
          <Separator orientation="vertical" className="h-8" />
          
          <Select value={selectedClaimId} onValueChange={setSelectedClaimId} data-testid="select-claim">
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select Claim" />
            </SelectTrigger>
            <SelectContent>
              {claims?.map((claim) => (
                <SelectItem key={claim.claimId} value={claim.claimId} data-testid={`claim-${claim.claimId}`}>
                  {claim.claimNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select 
            value={selectedDocumentId} 
            onValueChange={setSelectedDocumentId} 
            disabled={!selectedClaimId}
            data-testid="select-document"
          >
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Select Document" />
            </SelectTrigger>
            <SelectContent>
              {documents?.map((doc) => (
                <SelectItem key={doc.documentId} value={doc.documentId} data-testid={`document-${doc.documentId}`}>
                  {doc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button 
            onClick={handleLoadDocument} 
            disabled={!selectedClaimId || !selectedDocumentId || isDocumentLoaded}
            data-testid="button-load"
          >
            Load Document
          </Button>

          <Separator orientation="vertical" className="h-8" />

          <Input
            placeholder="User ID"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-[140px]"
            data-testid="input-user"
          />

          <div className="ml-auto flex gap-2">
            <Button onClick={handleSave} variant="outline" disabled={!instance} data-testid="button-save">
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
            <Button onClick={handleDownload} variant="outline" disabled={!instance} data-testid="button-download">
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-80 border-r bg-card flex flex-col">
          <div className="p-4 border-b">
            <h2 className="font-semibold mb-3">Issues</h2>
            <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="all" className="text-xs" data-testid="filter-all">All</TabsTrigger>
                <TabsTrigger value="open" className="text-xs" data-testid="filter-open">Open</TabsTrigger>
                <TabsTrigger value="applied" className="text-xs" data-testid="filter-applied">Applied</TabsTrigger>
                <TabsTrigger value="rejected" className="text-xs" data-testid="filter-rejected">Rejected</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-3">
              {!isDocumentLoaded ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Load a document to view issues
                </p>
              ) : filteredIssues.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No issues found
                </p>
              ) : (
                filteredIssues.map((issue) => {
                  const statusInfo = getStatusBadge(issue.issueId);
                  const status = issueStatuses.get(issue.issueId) || "OPEN";
                  
                  return (
                    <Card 
                      key={issue.issueId} 
                      className="p-3 cursor-pointer hover:bg-accent transition-colors"
                      onClick={() => handleIssueClick(issue)}
                      data-testid={`issue-${issue.issueId}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <Badge variant={statusInfo.variant} className="text-xs" data-testid={`status-${issue.issueId}`}>
                          {statusInfo.label}
                        </Badge>
                        <Badge variant={issue.severity === "critical" ? "destructive" : "outline"} className="text-xs">
                          {issue.severity}
                        </Badge>
                      </div>
                      
                      <h3 className="font-medium text-sm mb-1">{issue.label || issue.type}</h3>
                      <p className="text-xs text-muted-foreground mb-2">
                        Page {issue.pageIndex + 1} • {Math.round(issue.confidence * 100)}% confidence
                      </p>

                      {issue.foundValue && issue.expectedValue && (
                        <div className="text-xs space-y-1 mb-3">
                          <div className="flex gap-1">
                            <span className="text-muted-foreground">Found:</span>
                            <span className="font-mono">{issue.foundValue}</span>
                          </div>
                          <div className="flex gap-1">
                            <span className="text-muted-foreground">Expected:</span>
                            <span className="font-mono">{issue.expectedValue}</span>
                          </div>
                        </div>
                      )}

                      {status === "OPEN" && (
                        <div className="flex gap-1 mt-2">
                          {issue.suggestedFix.strategy === "auto" && (
                            <Button
                              size="sm"
                              className="h-7 text-xs flex-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleApplySuggestedFix(issue);
                              }}
                              data-testid={`button-apply-${issue.issueId}`}
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Apply Fix
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
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
                            className="h-7 text-xs"
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
                    </Card>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="flex-1 bg-muted/30 relative">
          {viewerLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading document viewer...</p>
              </div>
            </div>
          )}
          
          {!isDocumentLoaded ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center space-y-2">
                <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto" />
                <p className="text-muted-foreground">Select a claim and document to begin</p>
              </div>
            </div>
          ) : (
            <div 
              ref={containerRef} 
              className="h-full w-full"
              data-testid="viewer-container"
            />
          )}
        </div>
      </div>
    </div>
  );
}
