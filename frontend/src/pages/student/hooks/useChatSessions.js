import { useEffect, useRef, useState } from "react";
import { fetchUserAttributes } from "aws-amplify/auth";
import { apiGet, apiDelete } from "../../../utils/apiClient";

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
        const { email } = await fetchUserAttributes();
        const data = await apiGet("student/patient", {
          email,
          simulation_group_id: group.simulation_group_id,
          patient_id: patient.patient_id,
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
  }, [group, patient, setCurrentSessionId, setSession, setSessions]);

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
    let authToken;

    setTimeout(() => setIsAItyping(true), 775);
    return getAuth()
      .then(({ token, email }) => {
        authToken = token;
        const session_name = "New chat";
        const url = `${import.meta.env.VITE_API_ENDPOINT}student/create_session?email=${encodeURIComponent(
          email
        )}&simulation_group_id=${encodeURIComponent(
          group.simulation_group_id
        )}&patient_id=${encodeURIComponent(
          patient.patient_id
        )}&session_name=${encodeURIComponent(session_name)}`;

        return fetch(url, {
          method: "POST",
          headers: {
            Authorization: authToken,
            "Content-Type": "application/json",
          },
        });
      })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to create session: ${response.statusText}`);
        }
        return response.json();
      })
      .then((data) => {
        sessionData = data[0];
        console.log("New session created:", sessionData.session_id);
        setCurrentSessionId(sessionData.session_id);
        setSessions((prevItems) => [...prevItems, sessionData]);
        setSession(sessionData);
        setCreatingSession(false);

        const textGenUrl = `${import.meta.env.VITE_API_ENDPOINT}student/text_generation?simulation_group_id=${encodeURIComponent(
          group.simulation_group_id
        )}&session_id=${encodeURIComponent(
          sessionData.session_id
        )}&patient_id=${encodeURIComponent(
          patient.patient_id
        )}&session_name=${encodeURIComponent("New chat")}&stream=true`;

        // Use the ref to call handleStreamingResponse from useChatMessages
        if (handleStreamingResponseRef.current) {
          return handleStreamingResponseRef.current(
            textGenUrl,
            authToken,
            "",
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
      const { email } = await fetchUserAttributes();
      await apiDelete("student/delete_session", {
        email,
        simulation_group_id: group.simulation_group_id,
        patient_id: patient.patient_id,
        session_id: sessionDelete.session_id,
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
