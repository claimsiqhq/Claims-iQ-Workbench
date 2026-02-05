import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, X, Check, Move } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnnotationType } from "@shared/schemas";

interface BBox {
  pageIndex: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

interface AnnotationLocationSelectorProps {
  isSelecting: boolean;
  annotationType: AnnotationType | null;
  currentPage: number;
  onLocationSelected: (bbox: BBox) => void;
  onCancel: () => void;
  containerRef?: React.RefObject<HTMLDivElement>;
}

export function AnnotationLocationSelector({
  isSelecting,
  annotationType,
  currentPage,
  onLocationSelected,
  onCancel,
  containerRef,
}: AnnotationLocationSelectorProps) {
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentPoint, setCurrentPoint] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const getRelativeCoordinates = useCallback((e: React.MouseEvent | MouseEvent): { x: number; y: number } => {
    const container = containerRef?.current || overlayRef.current?.parentElement;
    if (!container) return { x: 0, y: 0 };
    
    const rect = container.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, [containerRef]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isSelecting) return;
    e.preventDefault();
    e.stopPropagation();
    
    const coords = getRelativeCoordinates(e);
    setStartPoint(coords);
    setCurrentPoint(coords);
    setIsDragging(true);
  }, [isSelecting, getRelativeCoordinates]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !startPoint) return;
    e.preventDefault();
    
    const coords = getRelativeCoordinates(e);
    setCurrentPoint(coords);
  }, [isDragging, startPoint, getRelativeCoordinates]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !startPoint || !currentPoint) return;
    e.preventDefault();
    
    const container = containerRef?.current || overlayRef.current?.parentElement;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    
    const minX = Math.min(startPoint.x, currentPoint.x);
    const minY = Math.min(startPoint.y, currentPoint.y);
    const maxX = Math.max(startPoint.x, currentPoint.x);
    const maxY = Math.max(startPoint.y, currentPoint.y);
    
    const width = maxX - minX;
    const height = maxY - minY;
    
    if (width > 10 && height > 10) {
      const bbox: BBox = {
        pageIndex: currentPage,
        left: (minX / rect.width) * 100,
        top: (minY / rect.height) * 100,
        width: (width / rect.width) * 100,
        height: (height / rect.height) * 100,
      };
      
      onLocationSelected(bbox);
    }
    
    setStartPoint(null);
    setCurrentPoint(null);
    setIsDragging(false);
  }, [isDragging, startPoint, currentPoint, currentPage, onLocationSelected, containerRef]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isSelecting) {
        onCancel();
        setStartPoint(null);
        setCurrentPoint(null);
        setIsDragging(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSelecting, onCancel]);

  const getSelectionStyle = () => {
    if (!startPoint || !currentPoint) return {};
    
    const left = Math.min(startPoint.x, currentPoint.x);
    const top = Math.min(startPoint.y, currentPoint.y);
    const width = Math.abs(currentPoint.x - startPoint.x);
    const height = Math.abs(currentPoint.y - startPoint.y);
    
    return {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
    };
  };

  if (!isSelecting) return null;

  return (
    <div
      ref={overlayRef}
      data-testid="annotation-location-overlay"
      className="absolute inset-0 z-50 cursor-crosshair"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.1)" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-60">
        <Card className="px-4 py-2 flex items-center gap-3 bg-white shadow-lg border-2 border-primary">
          <Target className="h-4 w-4 text-primary animate-pulse" />
          <span className="text-sm font-medium">
            Click and drag to select {annotationType || "annotation"} location
          </span>
          <Badge variant="secondary" className="text-xs">
            Page {currentPage + 1}
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
            data-testid="cancel-location-selection"
          >
            <X className="h-4 w-4" />
          </Button>
        </Card>
      </div>
      
      {isDragging && startPoint && currentPoint && (
        <div
          data-testid="selection-rectangle"
          className="absolute border-2 border-dashed border-primary bg-primary/20 pointer-events-none"
          style={getSelectionStyle()}
        >
          <div className="absolute -top-6 left-0 text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">
            {Math.abs(currentPoint.x - startPoint.x).toFixed(0)} x {Math.abs(currentPoint.y - startPoint.y).toFixed(0)}
          </div>
        </div>
      )}
      
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
        <Card className="px-4 py-2 bg-white/90 shadow text-xs text-muted-foreground flex items-center gap-2">
          <Move className="h-3 w-3" />
          Drag to select area • Press ESC to cancel
        </Card>
      </div>
    </div>
  );
}
