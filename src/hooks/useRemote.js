import { useCallback, useEffect, useState } from "react";
import { readableError } from "../services/errors";

export function useRemote(loader, key = 0) {
  const [state, setState] = useState({ data: null, loading: true, error: "" });
  const refresh = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      setState({ data: await loader(), loading: false, error: "" });
    } catch (reason) {
      setState({ data: null, loading: false, error: readableError(reason) });
    }
  }, [key]);
  useEffect(() => { refresh(); }, [refresh]);
  return { ...state, refresh };
}
