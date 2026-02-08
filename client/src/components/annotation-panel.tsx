import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { 
  Highlighter, 
  MessageSquare, 
  Flag, 
  Minus, 
  Underline,
  Plus,
  X,
  Target,
  ChevronDown
} from "lucide-react";
import type { Annotation, AnnotationType } from "@shared/schemas";
import type { PDFProcessorAdapter } from "@/lib/adapters";
import { cn } from "@/lib/utils";

interface BBox {
  pageIndex: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

interface AnnotationPanelProps {
  adapter?: PDFProcessorAdapter | null;
  documentId: string;
  annotations: Annotation[];
  onCreateAnnotation?: (annotation: Annotation) => Promise<void>;
  onDeleteAnnotation?: (id: string) => Promise<void>;
  selectedPageIndex?: number;
  currentPage?: number;
  onStartLocationSelection?: (type: AnnotationType) => void;
  isSelectingLocation?: boolean;
}

const annotationTypeIcons = {
  highlight: Highlighter,
  comment: MessageSquare,
  flag: Flag,
  strikethrough: Minus,
  underline: Underline,
};

const annotationTypeColors = {
  highlight: "bg-yellow-100 text-yellow-800 border-yellow-300",
  comment: "bg-blue-100 text-blue-800 border-blue-300",
  flag: "bg-red-100 text-red-800 border-red-300",
  strikethrough: "bg-gray-100 text-gray-800 border-gray-300",
  underline: "bg-green-100 text-green-800 border-green-300",
};

const annotationTypeLabels: Record<AnnotationType, string> = {
  highlight: "Highlight",
  comment: "Comment",
  flag: "Flag",
  strikethrough: "Strikethrough",
  underline: "Underline",
};

export function AnnotationPanel({
  adapter,
  documentId,
  annotations,
  onCreateAnnotation,
  onDeleteAnnotation,
  selectedPageIndex,
  currentPage,
  onStartLocationSelection,
  isSelectingLocation,
}: AnnotationPanelProps) {
  const [filterType, setFilterType] = useState<AnnotationType | "all">("all");

  const filteredAnnotations = annotations.filter((ann) => {
    if (filterType !== "all" && ann.type !== filterType) return false;
    const pageIndex = currentPage !== undefined ? currentPage : selectedPageIndex;
    if (pageIndex !== undefined && ann.location.bbox?.pageIndex !== pageIndex) {
      return false;
    }
    return true;
  });

  const groupedByType = filteredAnnotations.reduce((acc, ann) => {
    if (!acc[ann.type]) acc[ann.type] = [];
    acc[ann.type].push(ann);
    return acc;
  }, {} as Record<AnnotationType, Annotation[]>);

  const handleQuickCreate = async (type: AnnotationType) => {
    if (!onCreateAnnotation) return;
    
    const pageIndex = currentPage !== undefined ? currentPage : selectedPageIndex || 0;
    // Place annotation at center of page with reasonable default size
    const annotation: Annotation = {
      id: crypto.randomUUID(),
      type,
      location: {
        bbox: {
          pageIndex,
          left: 100,
          top: 300,
          width: 200,
          height: 30,
        },
      },
      text: type === "comment" ? "New comment" : type === "flag" ? "Flagged for review" : undefined,
      created_by: "current-user",
      created_at: new Date().toISOString(),
    };
    
    await onCreateAnnotation(annotation);
  };

  const handleSelectLocation = async (type: AnnotationType) => {
    if (onStartLocationSelection) {
      onStartLocationSelection(type);
    }
    // Quick create the annotation at a default position on the current page
    await handleQuickCreate(type);
  };

  return (
    <Card className="border-2 border-[#E3DFE8] shadow-sm h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="font-display text-lg">Annotations</CardTitle>
            <CardDescription className="text-sm">
              {annotations.length} total
            </CardDescription>
          </div>
          {onCreateAnnotation && adapter && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className={cn("h-8 gap-1.5", isSelectingLocation && "border-primary bg-primary/10")}
                  disabled={isSelectingLocation}
                  data-testid="add-annotation-dropdown"
                >
                  {isSelectingLocation ? (
                    <>
                      <Target className="h-3.5 w-3.5 animate-pulse" />
                      Selecting...
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5" />
                      Add
                      <ChevronDown className="h-3 w-3 ml-0.5" />
                    </>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {(Object.keys(annotationTypeIcons) as AnnotationType[]).map((type) => {
                  const Icon = annotationTypeIcons[type];
                  return (
                    <DropdownMenuItem
                      key={type}
                      onClick={() => handleSelectLocation(type)}
                      className="gap-2 cursor-pointer"
                      data-testid={`add-annotation-${type}`}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="flex-1">{annotationTypeLabels[type]}</span>
                      <Target className="h-3 w-3 text-muted-foreground" />
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {onStartLocationSelection && (
          <p className="text-xs text-muted-foreground mt-2">
            Click "Add" and select a location on the document
          </p>
        )}
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <Tabs defaultValue="all" className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-6 h-9 mx-4 mt-2">
            <TabsTrigger value="all" className="text-xs" onClick={() => setFilterType("all")}>
              All
            </TabsTrigger>
            {Object.keys(annotationTypeIcons).map((type) => {
              const Icon = annotationTypeIcons[type as AnnotationType];
              const count = groupedByType[type as AnnotationType]?.length || 0;
              return (
                <TabsTrigger
                  key={type}
                  value={type}
                  className="text-xs flex items-center gap-1"
                  onClick={() => setFilterType(type as AnnotationType)}
                >
                  <Icon className="h-3 w-3" />
                  {count > 0 && <span className="text-[10px]">{count}</span>}
                </TabsTrigger>
              );
            })}
          </TabsList>
          <ScrollArea className="flex-1 px-4 py-2">
            <TabsContent value="all" className="mt-2 space-y-2">
              {filteredAnnotations.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No annotations found
                </div>
              ) : (
                filteredAnnotations.map((ann) => (
                  <AnnotationCard
                    key={ann.id}
                    annotation={ann}
                    onDelete={onDeleteAnnotation}
                  />
                ))
              )}
            </TabsContent>
            {Object.keys(annotationTypeIcons).map((type) => (
              <TabsContent key={type} value={type} className="mt-2 space-y-2">
                {groupedByType[type as AnnotationType]?.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    No {type} annotations
                  </div>
                ) : (
                  groupedByType[type as AnnotationType]?.map((ann) => (
                    <AnnotationCard
                      key={ann.id}
                      annotation={ann}
                      onDelete={onDeleteAnnotation}
                    />
                  ))
                )}
              </TabsContent>
            ))}
          </ScrollArea>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function AnnotationCard({
  annotation,
  onDelete,
}: {
  annotation: Annotation;
  onDelete?: (id: string) => void;
}) {
  const Icon = annotationTypeIcons[annotation.type];
  const colorClass = annotationTypeColors[annotation.type];

  return (
    <div 
      className="p-3 border border-[#E3DFE8] rounded-lg bg-white hover:bg-[#F0EDF4]/50 transition-colors"
      data-testid={`annotation-card-${annotation.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <div className={cn("p-1.5 rounded border shrink-0", colorClass)}>
            <Icon className="h-3.5 w-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="secondary" className="text-xs capitalize">
                {annotation.type}
              </Badge>
              {annotation.location.bbox && (
                <span className="text-xs text-muted-foreground">
                  Page {annotation.location.bbox.pageIndex + 1}
                </span>
              )}
            </div>
            {annotation.text && (
              <p className="text-sm text-foreground line-clamp-2">{annotation.text}</p>
            )}
            {annotation.color && (
              <div
                className="w-4 h-4 rounded border border-gray-300 mt-1"
                style={{ backgroundColor: annotation.color }}
              />
            )}
            {annotation.location.bbox && (
              <div className="text-[10px] text-muted-foreground mt-1">
                Position: ({annotation.location.bbox.left.toFixed(1)}%, {annotation.location.bbox.top.toFixed(1)}%)
              </div>
            )}
            {annotation.related_correction_id && (
              <Badge variant="outline" className="text-xs mt-1">
                Linked to correction
              </Badge>
            )}
          </div>
        </div>
        {onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => onDelete(annotation.id)}
            data-testid={`delete-annotation-${annotation.id}`}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function createAnnotationWithLocation(
  type: AnnotationType,
  bbox: BBox,
  userId: string = "current-user"
): Annotation {
  return {
    id: crypto.randomUUID(),
    type,
    location: { bbox },
    created_by: userId,
    created_at: new Date().toISOString(),
  };
}
