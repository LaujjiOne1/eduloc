import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../components/ui/Toast';

export interface Loaded<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** Charge des données à chaque changement de `deps` ; une réponse tardive d'une requête périmée est ignorée. */
export function useAsync<T>(fetcher: () => Promise<T>, deps: unknown[]): Loaded<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null, error: null, loading: true,
  });
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let stale = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetcherRef.current().then(
      (data) => { if (!stale) setState({ data, error: null, loading: false }); },
      (e: unknown) => { if (!stale) setState((s) => ({ data: s.data, error: e instanceof Error ? e.message : String(e), loading: false })); },
    );
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

/**
 * Exécute une action d'écriture : notification de succès ou d'erreur (message du serveur), indicateur d'occupation,
 * résultat `true`/`false` pour que l'appelant ferme sa fenêtre seulement en cas de succès.
 */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (action: () => Promise<unknown>, success: string | ((result: unknown) => string)): Promise<boolean> => {
    setBusy(true);
    try {
      const result = await action();
      toast.success(typeof success === 'function' ? success(result) : success);
      return true;
    } catch (e) {
      toast.error('Action impossible', e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, [toast]);

  return { run, busy };
}
