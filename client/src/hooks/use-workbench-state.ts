import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { FixEngine } from "@/lib/fix-engine";
import { PDFAdapterFactory } from "@/lib/adapters";
import type { PDFProcessorAdapter } from "@/lib/adapters";
import type { IssueStatus, SessionData, ExtractedClaimInfo } from "@shared/schema";
import type { Annotation, CrossDocumentValidation } from "@shared/schemas";
import { STORAGE_KEY_OPERATOR } from "@/lib/theme";

export function useWorkbenchState() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { user, session, signOut, isConfigured: isAuthConfigured, loading: authLoading } = useAuth();
  
  useEffect(() => {
    if (!authLoading && isAuthConfigured && !user) {
      setLocation('/login');
    }
  }, [authLoading, isAuthConfigured, user, setLocation]);

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
  const [pdfAdapter, setPdfAdapter] = useState<PDFProcessorAdapter | null>(null);
  const [fixEngine, setFixEngine] = useState<FixEngine | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [crossDocValidations, setCrossDocValidations] = useState<CrossDocumentValidation[]>([]);
  const [showIssuesPanel, setShowIssuesPanel] = useState(true);
  const [showAnnotationPanel, setShowAnnotationPanel] = useState(false);
  const [showValidationPanel, setShowValidationPanel] = useState(false);
  const [currentPage, setCurrentPage] = useState<number>(0);
  
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [notifyOnApply, setNotifyOnApply] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('settings_notify_apply') === 'true';
    }
    return false;
  });
  const [notifyOnReject, setNotifyOnReject] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('settings_notify_reject') === 'true';
    }
    return false;
  });
  const [defaultFilter, setDefaultFilter] = useState<"all" | "open" | "applied" | "rejected">(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('settings_default_filter') as any) || 'all';
    }
    return 'all';
  });
  const [itemsPerPage, setItemsPerPage] = useState(() => {
    if (typeof window !== 'undefined') {
      return parseInt(localStorage.getItem('settings_items_per_page') || '25', 10);
    }
    return 25;
  });

  return {
    toast,
    queryClient,
    setLocation,
    user,
    session,
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
  };
}
