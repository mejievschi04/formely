import { useEffect, useRef } from 'react';

export function usePoll(callback, ms = 15000) {
  const saved = useRef(callback);
  saved.current = callback;

  useEffect(() => {
    if (!ms) return undefined;
    const id = setInterval(() => {
      saved.current();
    }, ms);
    return () => clearInterval(id);
  }, [ms]);
}
