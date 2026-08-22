import { useCallback, useEffect, useState } from "react";
import { getConsole, getMission } from "@/daemon/fns";
import type { ConsoleView } from "@/daemon/types";

export function useConsole(missionId?: string) {
  const [data, setData] = useState<ConsoleView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = missionId ? await getMission({ data: missionId }) : await getConsole();
      setData(next as ConsoleView);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Daemon unavailable");
    }
  }, [missionId]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 2500);
    return () => window.clearInterval(id);
  }, [refresh]);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await fn();
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Command failed");
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  return { data, error, busy, refresh, run };
}
