import { useEffect, useRef, useState, useCallback } from "react";
import { generateClient } from "aws-amplify/api";
import { getSocket } from "../../../utils/socket";
import { titleCase } from "../../../utils/textFormatting";
import {
  dedupeAndNormalizeMessages,
  filterUnwantedMessages,
  normalizeEmpathyData,
} from "./chatMessageUtils";
import useVoiceSocketMessages from "./useVoiceSocketMessages";

const gqlClient = generateClient();

const ON_TEXT_STREAM = /* GraphQL */ `
  subscription OnTextStream($sessionId: String!) {
    onTextStream(sessionId: $sessionId) {
      sessionId
      data
    }
  }
`;

const STREAMING_TEMP_ID = "STREAMING_TEMP_ID";

/**
 * Manages message state, sending, streaming (AppSync), socket listeners for voice,
 * and message CRUD.
 *
 * Shared state (session, sessions, messages, currentSessionId) is owned by the parent.
 *
 * @param {object} params
 * @param {object|null} params.group - Simulation group.
 * @param {object|null} params.patient - Current patient.
 * @param {object|null} params.session - Active session (parent-owned).
 * @param {Function} params.setSession - Setter for active session.
 * @param {Function} params.setSessions - Setter for sessions list.
 * @param {[object]} params.messages - Messages array (parent-owned).
 * @param {Function} params.setMessages - Setter for messages.
 * @param {string|null} params.currentSessionId - Currently viewed session ID (parent-owned).
 * @param {Function} params.setCurrentSessionId - Setter for currentSessionId.
 * @param {boolean} params.creatingSession - Whether a new session is being created.
 * @param {Function} params.setCreatingSession - Setter for creatingSession.
 * @param {Function} params.getAuth - Cached auth helper.
 * @param {boolean} params.empathyEnabled - Whether empathy evaluation is on.
 * @param {Function} params.setRealtimeEmpathy - Setter for real-time empathy chunks.
 * @param {Function} params.handleNewChat - Creates a new session (from useChatSessions).
 * @param {React.MutableRefObject} params.handleStreamingResponseRef - Ref that this hook populates with handleStreamingResponse.
 * @param {boolean} params.isAItyping - Whether the AI is currently typing (parent-owned).
 * @param {Function} params.setIsAItyping - Setter for isAItyping (parent-owned).
 */
export default function useChatMessages({
  group,
  patient,
  session,
  setSession,
  setSessions,
  messages,
  setMessages,
  currentSessionId,
  setCurrentSessionId,
  creatingSession,
  setCreatingSession,
  getAuth,
  studentApi,
  empathyEnabled,
  setRealtimeEmpathy,
  handleNewChat,
  handleStreamingResponseRef,
  isAItyping,
  setIsAItyping,
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newMessage, setNewMessage] = useState(null);
  const [messageInput, setMessageInput] = useState("");

  // Refs to always read fresh cross-hook values in handlers (avoids stale closures)
  const creatingSessionRef = useRef(creatingSession);
  const setCreatingSessionRef = useRef(setCreatingSession);
  const handleNewChatRef = useRef(handleNewChat);

  useEffect(() => { creatingSessionRef.current = creatingSession; }, [creatingSession]);
  useEffect(() => { setCreatingSessionRef.current = setCreatingSession; }, [setCreatingSession]);
  useEffect(() => { handleNewChatRef.current = handleNewChat; }, [handleNewChat]);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const messagesRef = useRef(messages);

  // AppSync streaming refs
  const streamSubRef = useRef(null);
  const streamSessionIdRef = useRef(null);
  const fullResponseRef = useRef("");
  const lastLoadedSessionIdRef = useRef(null);

  // Refs to avoid stale closures in subscription callbacks
  const empathyEnabledRef = useRef(false);
  const pendingEmpathyRef = useRef(null);

  // Voice refs
  const allowAudioRef = useRef(false);
  const diagnosisCompletedRef = useRef(false);
  const pendingDiagnosisCompleteRef = useRef(null);
  const lastVoiceAudioChunkAtRef = useRef(0);
  const completionTimerRef = useRef(null);
  const COMPLETION_AUDIO_DRAIN_MS = 7000;

  // Stable refs so socket listeners (set up once) always see fresh values
  const patientRef = useRef(patient);
  const groupRef = useRef(group);
  const sessionRef = useRef(session);
  const callEmpathyEvaluationRef = useRef(null);

  const hasAtLeastOneFullTurn = useCallback(() => {
    const currentMessages = Array.isArray(messagesRef.current) ? messagesRef.current : [];
    const hasStudentMessage = currentMessages.some((m) => m?.student_sent === true);
    const hasAssistantMessage = currentMessages.some((m) => m?.student_sent === false);
    return hasStudentMessage && hasAssistantMessage;
  }, []);

  const updatePatientScore = useCallback(
    async (llmVerdict) => {
      if (!patientRef.current || !groupRef.current) return;
      try {
        const { email } = await getAuth();
        await studentApi.updatePatientScore({
          patientId: patientRef.current.patient_id,
          studentEmail: email,
          simulationGroupId: groupRef.current.simulation_group_id,
          llmVerdict,
        });
      } catch (e) {
        console.error("Failed to update patient score:", e);
      }
    },
    [getAuth, studentApi]
  );

  const applyCompletionEffects = useCallback(async () => {
    if (diagnosisCompletedRef.current) return;
    if (!hasAtLeastOneFullTurn()) return;

    diagnosisCompletedRef.current = true;
    pendingDiagnosisCompleteRef.current = null;

    await updatePatientScore(true);

    alert("Session completed successfully!");
  }, [hasAtLeastOneFullTurn, updatePatientScore]);

  const scheduleCompletionCheck = useCallback(() => {
    if (diagnosisCompletedRef.current || !pendingDiagnosisCompleteRef.current) return;

    if (completionTimerRef.current) {
      clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }

    const lastAudioAt = lastVoiceAudioChunkAtRef.current;
    const elapsed = lastAudioAt ? Date.now() - lastAudioAt : 0;
    const waitMs = Math.max(COMPLETION_AUDIO_DRAIN_MS - elapsed, 250);

    completionTimerRef.current = setTimeout(() => {
      completionTimerRef.current = null;
      applyCompletionEffects();
    }, waitMs);
  }, [applyCompletionEffects]);

  // --- Voice socket listeners (extracted to keep this file under 400 lines) ---
  useVoiceSocketMessages({
    allowAudioRef,
    diagnosisCompletedRef,
    lastVoiceAudioChunkAtRef,
    pendingDiagnosisCompleteRef,
    scheduleCompletionCheck,
    patientRef,
    groupRef,
    sessionRef,
    empathyEnabledRef,
    callEmpathyEvaluationRef,
    setMessages,
    setRealtimeEmpathy,
  });

  useEffect(() => {
    if (pendingDiagnosisCompleteRef.current) {
      scheduleCompletionCheck();
    }
    return () => {
      if (completionTimerRef.current) {
        clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }
    };
  }, [messages, scheduleCompletionCheck]);

  // Keep empathyEnabledRef in sync
  useEffect(() => {
    empathyEnabledRef.current = empathyEnabled;
  }, [empathyEnabled]);

  useEffect(() => { patientRef.current = patient; }, [patient]);
  useEffect(() => { groupRef.current = group; }, [group]);
  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // --- Scroll to bottom on new messages ---
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // --- New message deduplication & insertion ---
  useEffect(() => {
    if (newMessage !== null) {
      if (currentSessionId === session?.session_id) {
        const contentKey = `${newMessage.student_sent ? "student" : "ai"}-${newMessage.message_content.trim()}`;

        const messageExists = messages.some(
          (msg) =>
            msg.message_id === newMessage.message_id ||
            `${msg.student_sent ? "student" : "ai"}-${msg.message_content.trim()}` === contentKey
        );

        if (!messageExists) {
          setMessages((prevItems) => {
            const isDuplicate = prevItems.some(
              (msg) =>
                msg.message_id === newMessage.message_id ||
                `${msg.student_sent ? "student" : "ai"}-${msg.message_content.trim()}` === contentKey
            );

            if (isDuplicate) {
              console.log("Prevented duplicate message from being added");
              return prevItems;
            } else {
              console.log("Adding new message to chat");
              return [...prevItems, newMessage];
            }
          });
        } else {
          console.log("Message already exists in chat, not adding duplicate");
        }
      }
      setNewMessage(null);
    }
  }, [session, newMessage, currentSessionId, messages, setMessages]);

  // --- Streaming bubble helpers ---
  const startStreamingBubble = () => {
    setMessages((prev) => [
      ...prev,
      {
        message_id: STREAMING_TEMP_ID,
        student_sent: false,
        message_content: "",
        _streaming: true,
      },
    ]);
  };

  const appendStreamingChunk = (text) => {
    setIsAItyping(false);
    setMessages((prev) =>
      prev.map((m) =>
        m.message_id === STREAMING_TEMP_ID
          ? {
              ...m,
              message_content: (m.message_content === " " ? "" : m.message_content) + text,
            }
          : m
      )
    );
  };

  const finalizeStreamingBubble = async (finalText) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.message_id === STREAMING_TEMP_ID
          ? {
              ...m,
              message_id: `ai_${Date.now()}`,
              message_content: finalText,
              _streaming: false,
            }
          : m
      )
    );
  };

  // --- Empathy evaluation after AI response ---
  const callEmpathyEvaluation = async (pending, sessionId) => {
    try {
      const data = await studentApi.evaluateEmpathy({
        sessionId,
        patientId: pending.patientId,
        simulationGroupId: pending.groupId,
        messageId: pending.messageId,
        messageContent: pending.messageContent,
      });
      const empathyData = data.empathy_evaluation;
      if (!empathyData) return;

      const transformedData = normalizeEmpathyData(empathyData);
      setRealtimeEmpathy((prev) => [...prev, transformedData]);
    } catch (e) {
      console.error("Empathy evaluation failed:", e);
    }
  };

  // Keep callEmpathyEvaluationRef pointing at the latest closure
  useEffect(() => { callEmpathyEvaluationRef.current = callEmpathyEvaluation; });

  // --- AppSync subscription ---
  const subscribeToStream = (sessionId) => {
    if (!sessionId) return null;

    if (streamSubRef.current) {
      streamSubRef.current.unsubscribe();
      streamSubRef.current = null;
    }

    streamSubRef.current = gqlClient
      .graphql({
        query: ON_TEXT_STREAM,
        variables: { sessionId },
      })
      .subscribe({
        next: async ({ data }) => {
          try {
            const streamData = JSON.parse(data.onTextStream.data);
            const t = streamData?.type;
            const content = streamData?.content || "";

            if (t === "debug_prompt") {
              console.log(
                "%c[LLM FULL SYSTEM PROMPT]%c\n" + content,
                "color: #7c3aed; font-weight: bold",
                "color: inherit"
              );
            } else if (t === "empathy") {
              try {
                const empathyData = JSON.parse(content);
                const transformedData = normalizeEmpathyData(empathyData);
                setRealtimeEmpathy((prev) => [...prev, transformedData]);
              } catch (e) {
                console.error("Failed to parse empathy JSON:", e);
              }
            } else if (t === "start") {
              fullResponseRef.current = "";
              startStreamingBubble();
            } else if (t === "chunk") {
              fullResponseRef.current += content;
              appendStreamingChunk(content);
            } else if (t === "end") {
              await finalizeStreamingBubble(fullResponseRef.current);

              if (streamData.session_name) {
                setSession((prev) => ({ ...prev, session_name: streamData.session_name }));
                setSessions((prev) =>
                  prev.map((s) =>
                    s.session_id === sessionId
                      ? { ...s, session_name: titleCase(streamData.session_name) }
                      : s
                  )
                );
              }

              if (streamData.llm_verdict !== undefined) {
                try {
                  await updatePatientScore(streamData.llm_verdict);
                } catch (e) {
                  console.error("Failed to update patient score:", e);
                }
              }

              if (empathyEnabledRef.current && pendingEmpathyRef.current) {
                const pending = pendingEmpathyRef.current;
                pendingEmpathyRef.current = null;
                callEmpathyEvaluation(pending, sessionId);
              }
            } else if (t === "error") {
              setMessages((prev) => prev.filter((m) => m.message_id !== STREAMING_TEMP_ID));
            }
          } catch (err) {
            console.error("Error processing stream data:", err);
          }
        },
        error: (error) => {
          console.error("AppSync subscription error:", error);
          setMessages((prev) => prev.filter((m) => m.message_id !== STREAMING_TEMP_ID));
        },
      });

    streamSessionIdRef.current = sessionId;
    return streamSubRef.current;
  };

  // Keep a warm subscription for the active session
  useEffect(() => {
    if (session?.session_id) {
      subscribeToStream(session.session_id);
    }

    return () => {
      streamSubRef.current?.unsubscribe();
      streamSubRef.current = null;
      streamSessionIdRef.current = null;
    };
    // Keep one AppSync subscription per session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.session_id]);

  // --- handleStreamingResponse: POST to text_generation, relies on AppSync subscription ---
  const handleStreamingResponse = async (requestPayload, overrideSessionId = null) => {
    try {
      const sid = overrideSessionId || session?.session_id;
      if (!sid) throw new Error("No session ID available for streaming");

      if (!streamSubRef.current || streamSessionIdRef.current !== sid) {
        console.log("Warming AppSync subscription for session:", sid);
        subscribeToStream(sid);
      }

      return await studentApi.textGenerationStream({
        simulationGroupId: requestPayload.simulationGroupId,
        sessionId: sid,
        patientId: requestPayload.patientId,
        sessionName: requestPayload.sessionName,
        messageId: requestPayload.messageId,
        messageContent: requestPayload.messageContent,
      });
    } catch (error) {
      console.error("AppSync streaming error:", error);
      setMessages((prev) => prev.filter((m) => m.message_id !== STREAMING_TEMP_ID));
      throw error;
    }
  };

  // Populate the ref so useChatSessions can call handleStreamingResponse
  useEffect(() => {
    if (handleStreamingResponseRef) {
      handleStreamingResponseRef.current = handleStreamingResponse;
    }
  });

  // --- Submit a student message ---
  const handleSubmit = () => {
    if (isSubmitting || isAItyping || creatingSessionRef.current) return;
    setIsSubmitting(true);
    let newSessionObj;
    let userEmail;
    let messageContent = messageInput.trim();

    console.log("Submitting message:", messageContent);

    if (!messageContent) {
      console.warn("Message content is empty or contains only spaces.");
      setIsSubmitting(false);
      return;
    }

    let getSession;
    if (session) {
      getSession = Promise.resolve(session);
    } else {
      if (!creatingSessionRef.current) {
        setCreatingSessionRef.current(true);
        handleNewChatRef.current();
      }
      setIsSubmitting(false);
      return;
    }

    getSession
      .then((retrievedSession) => {
        newSessionObj = retrievedSession;
        setCurrentSessionId(newSessionObj.session_id);
        return getAuth();
      })
      .then(({ email }) => {
        userEmail = email;
        return studentApi.createMessage({
          sessionId: newSessionObj.session_id,
          email: userEmail,
          simulationGroupId: group.simulation_group_id,
          patientId: patient.patient_id,
          messageContent,
        });
      })
      .then((messageData) => {
        setNewMessage(messageData[0]);
        setIsAItyping(true);
        setMessageInput("");

        const message = messageData[0].message_content;
        const messageId = messageData[0].message_id;

        if (empathyEnabled) {
          pendingEmpathyRef.current = {
            messageContent: message,
            patientId: patient.patient_id,
            groupId: group.simulation_group_id,
            messageId,
          };
        }
        return handleStreamingResponse(
          {
            simulationGroupId: group.simulation_group_id,
            sessionId: newSessionObj.session_id,
            patientId: patient.patient_id,
            sessionName: newSessionObj.session_name,
            messageId,
            messageContent: message,
          },
          newSessionObj.session_id
        );
      })
      .catch((error) => {
        setIsSubmitting(false);
        setIsAItyping(false);
        console.error("Error:", error);
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

  // --- Delete last message pair ---
  const handleDeleteMessage = async () => {
    try {
      await studentApi.deleteLastMessage(session.session_id);
      setMessages((prevMessages) => {
        if (prevMessages.length >= 2) {
          return prevMessages.slice(0, -2);
        } else {
          return [];
        }
      });
    } catch (error) {
      console.error("Error deleting message:", error);
    }
  };

  // --- Fetch messages for a session (getMessages) ---
  const getMessages = async () => {
    try {
      if (!session?.session_id) {
        console.warn("[getMessages] Cannot fetch messages: session or session_id is undefined");
        return;
      }

      const result = await studentApi.getMessages(session.session_id);
      const data = Array.isArray(result) ? result : result?.data?.listMessagesBySession || [];

      const uniqueMessages = dedupeAndNormalizeMessages(data);

      console.log(`[getMessages] Filtered ${data.length} messages to ${uniqueMessages.length} unique messages`);
      setMessages(filterUnwantedMessages(uniqueMessages));
    } catch (error) {
      console.error("[getMessages] Error fetching messages:", error);
      setMessages([]);
    }
  };

  // Load messages when session changes
  useEffect(() => {
    if (session?.session_id && session.session_id !== lastLoadedSessionIdRef.current) {
      setCurrentSessionId(session.session_id);
      lastLoadedSessionIdRef.current = session.session_id;
      getMessages();
    }
    // getMessages is intentionally kept out of the dependency list because it
    // is a request helper recreated by this hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.session_id, setCurrentSessionId]);

  // Voice-started event
  const [voiceStarted, setVoiceStarted] = useState(false);
  useEffect(() => {
    let socket;
    let disposed = false;
    const handleVoiceStarted = () => {
      console.log("Voice backend ready in StudentChat!");
      diagnosisCompletedRef.current = false;
      setVoiceStarted(true);
    };

    const setupSocket = async () => {
      socket = await getSocket();
      if (disposed) return;
      socket.on("voice-started", handleVoiceStarted);
      socket.on("nova-started", handleVoiceStarted);
    };
    setupSocket();
    return () => {
      disposed = true;
      if (socket) {
        socket.off("voice-started", handleVoiceStarted);
        socket.off("nova-started", handleVoiceStarted);
      }
    };
  }, []);

  // --- Textarea auto-resize ---
  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSubmit();
      }
    },
    // handleSubmit closes over these state values and is intentionally omitted
    // to avoid recreating this DOM listener for the function identity alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isSubmitting, isAItyping, creatingSession, messageInput, session]
  );

  useEffect(() => {
    const handleResize = () => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.style.height = "auto";
        textarea.style.height = `${textarea.scrollHeight}px`;
        if (textarea.scrollHeight > parseInt(textarea.style.maxHeight)) {
          textarea.style.overflowY = "auto";
        } else {
          textarea.style.overflowY = "hidden";
        }
      }
    };

    handleResize();
    const textarea = textareaRef.current;

    if (textarea) {
      textarea.addEventListener("input", handleResize);
      textarea.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      if (textarea) {
        textarea.removeEventListener("input", handleResize);
        textarea.removeEventListener("keydown", handleKeyDown);
      }
    };
  }, [handleKeyDown]);

  // --- Message helper functions ---
  const getMostRecentStudentMessageIndex = () => {
    const studentMessages = messages
      .map((message, index) => ({ ...message, index }))
      .filter((message) => message.student_sent);
    return studentMessages.length > 0
      ? studentMessages[studentMessages.length - 1].index
      : -1;
  };

  const hasAiMessageAfter = (msgs, recentStudentMessageIndex) => {
    return msgs.slice(recentStudentMessageIndex + 1).some((message) => !message.student_sent);
  };

  return {
    isSubmitting,
    setIsSubmitting,
    messageInput,
    setMessageInput,
    voiceStarted,
    messagesEndRef,
    textareaRef,
    allowAudioRef,
    handleSubmit,
    handleKeyDown,
    handleDeleteMessage,
    handleStreamingResponse,
    getMessages,
    getMostRecentStudentMessageIndex,
    hasAiMessageAfter,
    pendingEmpathyRef,
  };
}
