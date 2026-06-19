import { useState, useEffect, useRef } from 'react';

export default function useDelayedLoading(loading, minDuration = 3000) {
  const [delayedLoading, setDelayedLoading] = useState(loading);
  const loadingStartTimeRef = useRef(null);
  const timeoutIdRef = useRef(null);

  useEffect(() => {
    if (loading) {
      // Clear any pending timeouts
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
      loadingStartTimeRef.current = Date.now();
      setDelayedLoading(true);
    } else {
      if (loadingStartTimeRef.current) {
        const elapsed = Date.now() - loadingStartTimeRef.current;
        const remaining = minDuration - elapsed;

        if (remaining > 0) {
          timeoutIdRef.current = setTimeout(() => {
            setDelayedLoading(false);
            loadingStartTimeRef.current = null;
            timeoutIdRef.current = null;
          }, remaining);
        } else {
          setDelayedLoading(false);
          loadingStartTimeRef.current = null;
        }
      } else {
        setDelayedLoading(false);
      }
    }

    return () => {
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
      }
    };
  }, [loading, minDuration]);

  return delayedLoading;
}
