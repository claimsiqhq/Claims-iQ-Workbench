import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  ArrowRight,
} from "lucide-react";
import type { CrossDocumentValidation, ValidatedField } from "@shared/schemas";
import { cn } from "@/lib/utils";

interface CrossDocumentValidationPanelProps {
  validations: CrossDocumentValidation[];
  onResolve?: (validationId: string, resolvedValue: string) => void;
  onIgnore?: (validationId: string) => void;
}

const severityColors = {
  critical: "bg-red-100 text-red-800 border-red-300",
  warning: "bg-amber-100 text-amber-800 border-amber-300",
  info: "bg-blue-100 text-blue-800 border-blue-300",
};

const severityIcons = {
  critical: AlertTriangle,
  warning: AlertTriangle,
  info: CheckCircle2,
};

export function CrossDocumentValidationPanel({
  validations,
  onResolve,
  onIgnore,
}: CrossDocumentValidationPanelProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const pendingValidations = validations.filter((v) => v.status === "pending");
  const resolvedValidations = validations.filter((v) => v.status === "resolved");
  const ignoredValidations = validations.filter((v) => v.status === "ignored");

  return (
    <Card className="border-2 border-[#E3DFE8] shadow-sm h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-lg">Cross-Document Validation</CardTitle>
        <CardDescription className="text-sm">
          {pendingValidations.length} pending, {resolvedValidations.length} resolved, {ignoredValidations.length} ignored
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full px-4 py-2">
          {pendingValidations.length === 0 && resolvedValidations.length === 0 && ignoredValidations.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No cross-document validations found
            </div>
          ) : (
            <div className="space-y-3">
              {pendingValidations.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2">Pending</h3>
                  <div className="space-y-2">
                    {pendingValidations.map((validation) => (
                      <ValidationCard
                        key={validation.id}
                        validation={validation}
                        expanded={expandedIds.has(validation.id)}
                        onToggleExpand={() => toggleExpand(validation.id)}
                        onResolve={onResolve}
                        onIgnore={onIgnore}
                      />
                    ))}
                  </div>
                </div>
              )}
              {resolvedValidations.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2">Resolved</h3>
                  <div className="space-y-2">
                    {resolvedValidations.map((validation) => (
                      <ValidationCard
                        key={validation.id}
                        validation={validation}
                        expanded={expandedIds.has(validation.id)}
                        onToggleExpand={() => toggleExpand(validation.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function ValidationCard({
  validation,
  expanded,
  onToggleExpand,
  onResolve,
  onIgnore,
}: {
  validation: CrossDocumentValidation;
  expanded: boolean;
  onToggleExpand: () => void;
  onResolve?: (validationId: string, resolvedValue: string) => void;
  onIgnore?: (validationId: string) => void;
}) {
  const SeverityIcon = severityIcons[validation.severity];
  const colorClass = severityColors[validation.severity];

  const uniqueValues = Array.from(
    new Set(validation.documents.map((d) => d.found_value))
  );

  return (
    <div className="border border-[#E3DFE8] rounded-lg bg-white">
      <div
        className="p-3 cursor-pointer hover:bg-[#F0EDF4]/50 transition-colors"
        onClick={onToggleExpand}
      >
        <div className="flex items-start gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className={cn("p-1 rounded border shrink-0", colorClass)}>
                <SeverityIcon className="h-3.5 w-3.5" />
              </div>
              <Badge variant="secondary" className="text-xs capitalize">
                {validation.field.replace(/_/g, " ")}
              </Badge>
              <Badge className={cn("text-xs", colorClass)}>
                {validation.severity}
              </Badge>
              {validation.status === "resolved" && (
                <Badge variant="outline" className="text-xs">
                  Resolved
                </Badge>
              )}
            </div>
            <p className="text-sm font-medium text-foreground">
              {validation.documents.length} documents have different values
            </p>
            {validation.expected_value && (
              <p className="text-xs text-muted-foreground mt-1">
                Expected: {validation.expected_value}
              </p>
            )}
          </div>
        </div>
      </div>
      {expanded && (
        <div className="px-3 pb-3 border-t border-[#E3DFE8] pt-3 space-y-3">
          <Alert className={cn("text-sm", colorClass)}>
            <AlertDescription>{validation.reasoning}</AlertDescription>
          </Alert>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Found Values:
            </p>
            {validation.documents.map((doc, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 p-2 bg-[#F0EDF4]/30 rounded text-sm"
              >
                <span className="font-medium text-foreground min-w-[120px]">
                  {doc.document_name}:
                </span>
                <span className="text-foreground">{doc.found_value}</span>
                <Badge variant="outline" className="text-xs ml-auto">
                  {Math.round(doc.confidence * 100)}% confidence
                </Badge>
              </div>
            ))}
          </div>
          {validation.recommended_action && (
            <div className="pt-2 border-t border-[#E3DFE8]">
              <p className="text-xs font-semibold text-muted-foreground mb-1">
                Recommended Action:
              </p>
              <Badge
                variant={
                  validation.recommended_action === "escalate"
                    ? "destructive"
                    : validation.recommended_action === "auto_correct"
                    ? "default"
                    : "secondary"
                }
                className="text-xs"
              >
                {validation.recommended_action.replace(/_/g, " ")}
              </Badge>
            </div>
          )}
          {validation.status === "pending" && (
            <div className="flex gap-2 pt-2">
              {onResolve && validation.expected_value && (
                <Button
                  size="sm"
                  variant="default"
                  className="h-8 text-xs"
                  onClick={() => onResolve(validation.id, validation.expected_value!)}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  Resolve with Expected Value
                </Button>
              )}
              {onIgnore && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => onIgnore(validation.id)}
                >
                  <XCircle className="h-3.5 w-3.5 mr-1" />
                  Ignore
                </Button>
              )}
            </div>
          )}
          {validation.status === "resolved" && validation.resolved_value && (
            <div className="pt-2 border-t border-[#E3DFE8]">
              <p className="text-xs text-muted-foreground">
                Resolved with: <span className="font-medium text-foreground">{validation.resolved_value}</span>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
