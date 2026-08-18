import { useEffect, useRef } from "react";

const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_HEARTBEAT_SECONDS = 120;

export default function useSessionActivity({ session, group, getAuth, studentApi }) {
  const lastActivityAtRef = useRef(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    if (!session?.session_id || !group?.simulation_group_id) return undefined;

    const isFocused = () =>
      document.visibilityState === "visible" && document.hasFocus();

    const flushActivity = async (force = false) => {
      if (sendingRef.current || (!force && !isFocused())) return;

      const now = Date.now();
      const lastActivityAt = lastActivityAtRef.current;
      lastActivityAtRef.current = now;

      if (!lastActivityAt) return;

      const activeSeconds = Math.min(
        Math.floor((now - lastActivityAt) / 1000),
        MAX_HEARTBEAT_SECONDS
      );
      if (activeSeconds < 1) return;

      sendingRef.current = true;
      try {
        const { email } = await getAuth();
        await studentApi.recordSessionActivity({
          sessionId: session.session_id,
          studentEmail: email,
          simulationGroupId: group.simulation_group_id,
          activeSeconds,
        });
      } catch (error) {
        console.error("Failed to record session activity:", error);
      } finally {
        sendingRef.current = false;
      }
    };

    const resumeActivity = () => {
      if (isFocused()) {
        lastActivityAtRef.current = Date.now();
      }
    };

    const pauseActivity = () => {
      flushActivity(true);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        resumeActivity();
      } else {
        pauseActivity();
      }
    };

    resumeActivity();
    const intervalId = window.setInterval(flushActivity, HEARTBEAT_INTERVAL_MS);
    window.addEventListener("focus", resumeActivity);
    window.addEventListener("blur", pauseActivity);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", resumeActivity);
      window.removeEventListener("blur", pauseActivity);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      lastActivityAtRef.current = null;
    };
  }, [getAuth, group?.simulation_group_id, session?.session_id, studentApi]);
}