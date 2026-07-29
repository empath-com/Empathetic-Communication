import { useEffect, useRef, useState } from "react";

/**
 * Manages chat session CRUD: listing, creating, deleting, and switching sessions.
 *
 * Shared state (sessions, session, messages, currentSessionId) is owned by the parent
 * and passed in as params so both this hook and useChatMessages can coordinate.
 *
 * @param {object} params
 * @param {object|null} params.group - Current simulation group.
 * @param {object|null} params.patient - Current patient.
 * @param {Function} params.getAuth - Cached auth helper.
 * @param {React.MutableRefObject} params.handleStreamingResponseRef - Ref to the streaming handler (set by useChatMessages).
 * @param {Function} params.setIsAItyping - Setter for the AI-typing indicator.
 * @param {[object]} params.sessions - Sessions array (parent-owned).
 * @param {Function} params.setSessions - Setter for sessions.
 * @param {object|null} params.session - Active session (parent-owned).
 * @param {Function} params.setSession - Setter for active session.
 * @param {Function} params.setMessages - Setter for messages.
 * @param {Function} params.setCurrentSessionId - Setter for currentSessionId.
 * @param {Function} params.filterUnwantedMessages - Filter helper.
 */
export default function useChatSessions({
  group,
  patient,
  getAuth,
  studentApi,
  handleStreamingResponseRef,
  setIsAItyping,
  sessions,
  setSessions,
  session,
  setSession,
  setMessages,
  setCurrentSessionId,
  filterUnwantedMessages,
}) {
  const [creatingSession, setCreatingSession] = useState(false);
  const [loading, setLoading] = useState(true);

  // --- Fetch sessions on group/patient change ---
  useEffect(() => {
    const fetchPatient = async () => {
      setLoading(true);
      if (!group || !patient) {
        return;
      }

      try {
        const { email } = await getAuth();
        const data = await studentApi.getPatientSessions({
          email,
          simulationGroupId: group.simulation_group_id,
          patientId: patient.patient_id,
        });
        setSessions(data);
        const latestSession = data[data.length - 1];
        setSession(latestSession);
        if (latestSession) {
          setCurrentSessionId(latestSession.session_id);
        }
      } catch (error) {
        console.error("Error fetching patient:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPatient();
  }, [group, patient, getAuth, studentApi, setCurrentSessionId, setSession, setSessions]);

  // --- Refs to read fresh submitting/typing state without dep-array issues ---
  const isSubmittingRef = useRef(false);
  const isAItypingRef = useRef(false);

  const updateSubmittingRef = (v) => {
    isSubmittingRef.current = v;
  };
  const updateAItypingRef = (v) => {
    isAItypingRef.current = v;
  };

  // --- Auto-create first session when there are none ---
  useEffect(() => {
    if (
      !loading &&
      !creatingSession &&
      !isSubmittingRef.current &&
      !isAItypingRef.current &&
      sessions.length === 0
    ) {
      setCreatingSession(true);
      handleNewChat();
    }
    // handleNewChat is intentionally invoked only when the session list is empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, creatingSession]);

  // --- Create new chat session ---
  const handleNewChat = () => {
    let sessionData;

    setTimeout(() => setIsAItyping(true), 775);
    return getAuth()
      .then(({ email }) => {
        const session_name = "New chat";
        return studentApi.createSession({
          email,
          simulationGroupId: group.simulation_group_id,
          patientId: patient.patient_id,
          sessionName: session_name,
        });
      })
      .then((data) => {
        sessionData = data[0];
        console.log("New session created:", sessionData.session_id);
        setCurrentSessionId(sessionData.session_id);
        setSessions((prevItems) => [...prevItems, sessionData]);
        setSession(sessionData);
        setCreatingSession(false);

        // Use the ref to call handleStreamingResponse from useChatMessages
        if (handleStreamingResponseRef.current) {
          return handleStreamingResponseRef.current(
            {
              simulationGroupId: group.simulation_group_id,
              sessionId: sessionData.session_id,
              patientId: patient.patient_id,
              sessionName: "New chat",
            },
            sessionData.session_id
          );
        }
      })
      .then(() => {
        return sessionData;
      })
      .catch((error) => {
        console.error("Error creating new chat:", error);
        setCreatingSession(false);
        setIsAItyping(false);
      });
  };

  // --- Delete session ---
  const handleDeleteSession = async (sessionDelete) => {
    try {
      const { email } = await getAuth();
      await studentApi.deleteSession({
        email,
        simulationGroupId: group.simulation_group_id,
        patientId: patient.patient_id,
        sessionId: sessionDelete.session_id,
      });
      setSessions((prevSessions) =>
        prevSessions.filter(
          (isession) => isession.session_id !== sessionDelete.session_id
        )
      );
      if (sessionDelete.session_id === session?.session_id) {
        setSession(null);
        setMessages([]);
      }
    } catch (error) {
      console.error("Error deleting session:", error);
    }
  };

  // --- Helper: set filtered messages (wraps filterUnwantedMessages) ---
  const setFilteredMessages = (messagesOrUpdater) => {
    if (typeof messagesOrUpdater === "function") {
      setMessages((prevMessages) =>
        filterUnwantedMessages(messagesOrUpdater(prevMessages))
      );
    } else {
      setMessages(filterUnwantedMessages(messagesOrUpdater));
    }
  };

  return {
    creatingSession,
    setCreatingSession,
    loading,
    setLoading,
    handleNewChat,
    handleDeleteSession,
    setFilteredMessages,
    updateSubmittingRef,
    updateAItypingRef,
  };
}
