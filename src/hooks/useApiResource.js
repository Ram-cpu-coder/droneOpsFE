import { useCallback, useEffect, useRef, useState } from "react";

const resourceCache = new Map();

export const clearApiResourceCache = (cacheKey) => {
  if (cacheKey) {
    resourceCache.delete(cacheKey);
    return;
  }

  resourceCache.clear();
};

export const useApiResource = (loader, fallbackData = [], options = {}) => {
  const { cacheKey, staleMs = 0, enabled = true } = options;
  const cachedEntry = cacheKey ? resourceCache.get(cacheKey) : null;
  const isCacheFresh = Boolean(cachedEntry && staleMs > 0 && Date.now() - cachedEntry.timestamp < staleMs);
  const [data, setData] = useState(() => (isCacheFresh ? cachedEntry.data : (Array.isArray(fallbackData) ? [] : null)));
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(() => enabled && !isCacheFresh);
  const [isFallback, setIsFallback] = useState(false);
  const fallbackRef = useRef(fallbackData);

  const loadWithColdStartRetry = async () => {
    try {
      return await loader();
    } catch (error) {
      const message = error.message?.toLowerCase() ?? "";
      const looksLikeColdStart = message.includes("failed to fetch") || message.includes("networkerror") || message.includes("load failed");

      if (!looksLikeColdStart) throw error;

      await new Promise((resolve) => window.setTimeout(resolve, 800));
      return loader();
    }
  };

  useEffect(() => {
    fallbackRef.current = fallbackData;
  }, [fallbackData]);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const result = await loadWithColdStartRetry();
      const nextData = result ?? fallbackRef.current;
      setData(nextData);
      if (cacheKey) {
        resourceCache.set(cacheKey, { data: nextData, timestamp: Date.now() });
      }
      setIsFallback(false);
    } catch (requestError) {
      if (cachedEntry) {
        setData(cachedEntry.data);
      } else {
        setData(fallbackRef.current);
      }
      setIsFallback(true);
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }, [cacheKey, cachedEntry, enabled, loader]);

  useEffect(() => {
    if (isCacheFresh) return;
    refresh();
  }, [isCacheFresh, refresh]);

  return { data, error, isLoading, isFallback, refresh, setData };
};
