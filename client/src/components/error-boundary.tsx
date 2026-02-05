import React, { Component, ErrorInfo, ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    // Check for HMR-related hook errors and trigger refresh
    const errorMsg = error?.message || error?.toString() || '';
    if (errorMsg.includes("Invalid hook call") || 
        errorMsg.includes("Rendered fewer hooks") ||
        errorMsg.includes("Rendered more hooks")) {
      // Schedule immediate page refresh for HMR issues
      if (typeof window !== 'undefined') {
        console.log("Detected HMR hook error in getDerivedStateFromError, scheduling refresh...");
        setTimeout(() => window.location.reload(), 0);
      }
    }
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    
    // Auto-refresh on HMR-related hook errors to provide seamless recovery
    if (error.message?.includes("Invalid hook call") || 
        error.message?.includes("Rendered fewer hooks") ||
        error.message?.includes("Rendered more hooks")) {
      console.log("Detected HMR hook error, auto-refreshing page...");
      window.location.reload();
      return;
    }
    
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-[#F0E6FA]/20">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <CardTitle>Something went wrong</CardTitle>
              </div>
              <CardDescription>
                An unexpected error occurred. Please try refreshing the page.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {this.state.error && (
                <div className="text-sm text-muted-foreground">
                  <p className="font-semibold mb-1">Error:</p>
                  <pre className="bg-muted p-2 rounded text-xs overflow-auto">
                    {this.state.error.toString()}
                  </pre>
                </div>
              )}
              <div className="flex gap-2">
                <Button onClick={this.handleReset} variant="outline">
                  Try Again
                </Button>
                <Button
                  onClick={() => window.location.reload()}
                  variant="default"
                >
                  Reload Page
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
