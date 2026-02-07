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
  const requestHeadersRef = useRef(options.requestHeaders);
  const loadingRef = useRef(false);

  requestHeadersRef.current = options.requestHeaders;

  useEffect(() => {
    let mounted = true;

    const loadViewer = async () => {
      if (!options.container && !containerRef.current) {
        return;
      }

      if (!options.documentUrl && !options.instant) {
        return;
      }

      if (loadingRef.current) {
        return;
      }

      loadingRef.current = true;
      setIsLoading(true);
      setError(null);

      try {
        if (instanceRef.current && typeof instanceRef.current.unload === 'function') {
          try {
            await instanceRef.current.unload();
          } catch (unloadErr) {
            console.warn("Error unloading previous viewer instance:", unloadErr);
          }
          instanceRef.current = null;
        }

        const container = options.container || containerRef.current;
        if (!container) {
          loadingRef.current = false;
          return;
        }

        container.innerHTML = '';

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
        
        if (requestHeadersRef.current) {
          config.requestHeaders = requestHeadersRef.current;
        }

        console.log("[NutrientViewer] Loading document:", options.documentUrl || options.instant?.documentId);
        const viewerInstance = await NutrientViewer.load(config);
        console.log("[NutrientViewer] Document loaded successfully");

        if (mounted) {
          instanceRef.current = viewerInstance;
          setInstance(viewerInstance);
          setIsLoading(false);
        } else {
          if (typeof viewerInstance.unload === 'function') {
            viewerInstance.unload().catch(console.error);
          }
        }
      } catch (err) {
        console.error("Failed to load Nutrient viewer:", err);
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load viewer");
          setIsLoading(false);
        }
      } finally {
        loadingRef.current = false;
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
  }, [options.documentUrl, options.instant?.documentId, options.instant?.serverUrl, options.instant?.jwt, options.container]);

  return {
    instance,
    isLoading,
    error,
    containerRef,
    NutrientViewer,
  };
}
