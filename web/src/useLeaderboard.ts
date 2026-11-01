import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { Board } from './types';

/** Sıralamayı belirli aralıklarla çeker; sekme arka plandayken durur. */
export function useLeaderboard(intervalMs = 15_000) {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setBoard(await api.leaderboard());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, intervalMs);
    const onVis = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load, intervalMs]);

  return { board, error, reload: load };
}
