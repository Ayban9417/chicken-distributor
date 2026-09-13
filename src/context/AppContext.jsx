import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { loadAccess, onAuthChange, restoreSession, signIn, signOut } from "../services/authService";
import { readableError } from "../services/errors";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [session, setSession] = useState(null);
  const [access, setAccess] = useState({ profile: null, membership: null, organization: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function resolve(nextSession) {
      if (!active) return;
      setSession(nextSession);
      setError("");
      if (!nextSession?.user) {
        setAccess({ profile: null, membership: null, organization: null });
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        setAccess(await loadAccess(nextSession.user.id));
      } catch (reason) {
        setError(readableError(reason, "Unable to load your organization access."));
      } finally {
        if (active) setLoading(false);
      }
    }
    restoreSession().then(resolve).catch((reason) => {
      if (active) {
        setError(readableError(reason, "Unable to restore the session."));
        setLoading(false);
      }
    });
    const subscription = onAuthChange(resolve);
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user || null,
      ...access,
      role: access.membership?.role || null,
      loading,
      error,
      signIn,
      signOut,
      refreshAccess: async () => setAccess(await loadAccess(session.user.id)),
    }),
    [session, access, loading, error],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useAppContext must be used within AppProvider");
  return value;
}
