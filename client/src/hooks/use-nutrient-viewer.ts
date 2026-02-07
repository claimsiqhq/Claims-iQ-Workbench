import { useEffect, useRef, useState } from "react";
import NutrientViewer from "@nutrient-sdk/viewer";

export interface NutrientViewerOptions {
  documentUrl?: string;
  licenseKey?: string;
  container?: HTMLElement | null;
  requestHeaders?: Record<string, string>;
  instant?: {
    serverUrl: string;
    documentId: string;
    jwt?: string;
  };
}

export function useNutrientViewer(options: NutrientViewerOptions) {
  const [instance, setInstance] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;

    const loadViewer = async () => {
      if (!options.container && !containerRef.current) {
        return;
      }

      if (!options.documentUrl && !options.instant) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        if (instanceRef.current && typeof instanceRef.current.unload === 'function') {
          await instanceRef.current.unload();
          instanceRef.current = null;
        }

        const container = options.container || containerRef.current;
        if (!container) return;

        const config: any = {
          container,
          useCDN: true,
        };

        if (options.instant) {
          config.instant = options.instant;
        } else if (options.documentUrl) {
          config.document = options.documentUrl;
        }

        if (options.licenseKey) {
          config.licenseKey = options.licenseKey;
        }
        
        if (options.requestHeaders) {
          config.requestHeaders = options.requestHeaders;
        }

        const viewerInstance = await NutrientViewer.load(config);

        if (mounted) {
          instanceRef.current = viewerInstance;
          setInstance(viewerInstance);
          setIsLoading(false);
        }
      } catch (err) {
        if (mounted) {
          console.error("Failed to load Nutrient viewer:", err);
          setError(err instanceof Error ? err.message : "Failed to load viewer");
          setIsLoading(false);
        }
      }
    };

    loadViewer();

    return () => {
      mounted = false;
      if (instanceRef.current && typeof instanceRef.current.unload === 'function') {
        instanceRef.current.unload().catch(console.error);
        instanceRef.current = null;
      }
    };
  }, [options.documentUrl, options.instant?.documentId, options.instant?.serverUrl, options.instant?.jwt, options.container, options.requestHeaders]);

  return {
    instance,
    isLoading,
    error,
    containerRef,
    NutrientViewer, // Expose the module for direct access to Annotations/Geometry
  };
}
