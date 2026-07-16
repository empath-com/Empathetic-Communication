import { useEffect, useRef, useState, useCallback } from "react";
import { fetchAuthSession, fetchUserAttributes } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/api";
import { getSocket } from "../../../utils/socket";
import { playAudio } from "../../../utils/voiceStream";
import { titleCase } from "../../../utils/textFormatting";

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
 * Normalise a raw voice-mode line, stripping prefixes and returning role info.
 */
export function normalizeVoiceLine(rawText) {
  const text = (rawText ?? "").trim();
  if (!text) return null;

  if (text.startsWith("[VOICE_TRANSCRIPT]")) {
    const content = text.replace(/^\[VOICE_TRANSCRIPT\]/, "").trim();
    if (!content) return null;
    return { student_sent: true, message_content: content };
  }

  if (text.startsWith("User:")) {
    return { student_sent: true, message_content: text.replace(/^User:\s*/, "").trim() };
  }
  if (text.startsWith("Assistant:")) {
    return { student_sent: false, message_content: text.replace(/^Assistant:\s*/, "").trim() };
  }
  return { message_content: text };
}

/**
 * Merge streaming/cumulative voice chunks without duplicating previously seen text.
 */
function mergeVoiceText(existing = "", incoming = "") {
  const a = (existing || "").trim();
  const b = (incoming || "").trim();

  if (!a) return b;
  if (!b) return a;

  if (a === b) return a;
  if (a.endsWith(b)) return a;
  if (b.startsWith(a)) return b;
  if (a.includes(b)) return a;

  const maxOverlap = Math.min(a.length, b.length);
  for (let i = maxOverlap; i > 0; i--) {
    if (a.slice(-i) === b.slice(0, i)) {
      return `${a}${b.slice(i)}`;
    }
  }

  return `${a} ${b}`;
}

/**
 * Filter out unwanted messages (voice transcript blocks, initial prompts, etc.).
 */
export function filterUnwantedMessages(messagesArray) {
  if (!Array.isArray(messagesArray)) {
    return messagesArray;
  }

  const out = [];
  for (const m of messagesArray) {
    const n = normalizeVoiceLine(m?.message_content);
    if (!n) continue;

    if ((m.message_content || "").includes("Begin the conversation as the")) continue;

    // The backend saves a [VOICE_TRANSCRIPT] message that concatenates all user
    // speech for the whole session into one blob (used for empathy evaluation).
    // The individual per-turn user messages are already stored separately, so
    // skip this combined record to avoid a duplicate wall-of-text at the end.
    if ((m.message_content || "").startsWith("[VOICE_TRANSCRIPT]")) continue;

    out.push({
      ...m,
      student_sent: Object.prototype.hasOwnProperty.call(n, "student_sent")
        ? n.student_sent
        : m.student_sent,
      message_content: n.message_content,
    });
  }

  return out;
}

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
        const { token, email } = await getAuth();
        const scoreUrl =
          `${import.meta.env.VITE_API_ENDPOINT}student/update_patient_score` +
          `?patient_id=${encodeURIComponent(patientRef.current.patient_id)}` +
          `&student_email=${encodeURIComponent(email)}` +
          `&simulation_group_id=${encodeURIComponent(groupRef.current.simulation_group_id)}` +
          `&llm_verdict=${encodeURIComponent(Boolean(llmVerdict))}`;
        fetch(scoreUrl, { method: "POST", headers: { Authorization: token } });
      } catch (e) {
        console.error("Failed to update patient score:", e);
      }
    },
    [getAuth]
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
  }, [session, newMessage, currentSessionId, messages]);

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
      const { token } = await getAuth();
      let url =
        `${import.meta.env.VITE_API_ENDPOINT}student/empathy_evaluation` +
        `?session_id=${encodeURIComponent(sessionId)}` +
        `&patient_id=${encodeURIComponent(pending.patientId)}` +
        `&simulation_group_id=${encodeURIComponent(pending.groupId)}`;
      if (pending.messageId) url += `&message_id=${encodeURIComponent(pending.messageId)}`;

      const response = await fetch(url, {
        method: "POST",
        headers: { Authorization: token, "Content-Type": "application/json" },
        body: JSON.stringify({ message_content: pending.messageContent }),
      });
      if (!response.ok) return;

      const data = await response.json();
      const empathyData = data.empathy_evaluation;
      if (!empathyData) return;

      const feedback = empathyData.feedback || {};
      const criteriaHits = [
        'making_feel_at_ease', 'letting_tell_story', 'really_listening',
        'interested_in_whole_person', 'understanding_concerns', 'showing_care_compassion',
        'being_positive', 'explaining_clearly', 'helping_take_control', 'making_plan_of_action',
      ].reduce((sum, k) => sum + (empathyData[k] === 1 ? 1 : 0), 0);

      const transformedData = {
        overall_score: criteriaHits,
        total_messages_evaluated: 1,
        total_criteria_hits: criteriaHits,
        making_feel_at_ease: empathyData.making_feel_at_ease || 0,
        letting_tell_story: empathyData.letting_tell_story || 0,
        really_listening: empathyData.really_listening || 0,
        interested_in_whole_person: empathyData.interested_in_whole_person || 0,
        understanding_concerns: empathyData.understanding_concerns || 0,
        showing_care_compassion: empathyData.showing_care_compassion || 0,
        being_positive: empathyData.being_positive || 0,
        explaining_clearly: empathyData.explaining_clearly || 0,
        helping_take_control: empathyData.helping_take_control || 0,
        making_plan_of_action: empathyData.making_plan_of_action || 0,
        summary: empathyData.judge_reasoning?.overall_assessment || "",
        strengths: feedback.strengths || [],
        recommendations: feedback.improvement_suggestions || [],
        forward_target: feedback.forward_target || "",
        timestamp: Date.now(),
      };
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
                const transformedData = {
                  overall_score: empathyData.empathy_score || 3,
                  avg_perspective_taking: empathyData.perspective_taking || 3,
                  avg_emotional_resonance: empathyData.emotional_resonance || 3,
                  avg_acknowledgment: empathyData.acknowledgment || 3,
                  avg_language_communication: empathyData.language_communication || 3,
                  avg_cognitive_empathy: empathyData.cognitive_empathy || 3,
                  avg_affective_empathy: empathyData.affective_empathy || 3,
                  realism_assessment:
                    empathyData.realism_flag === "realistic"
                      ? "Your responses are generally realistic.."
                      : "Your response is unrealistic...",
                  realism_explanation: empathyData.judge_reasoning?.realism_justification || "",
                  coach_assessment: empathyData.judge_reasoning?.overall_assessment || "",
                  strengths: empathyData.feedback?.strengths || [],
                  areas_for_improvement: empathyData.feedback?.areas_for_improvement || [],
                  recommendations: empathyData.feedback?.improvement_suggestions || [],
                  recommended_approach: empathyData.feedback?.alternative_phrasing || "",
                  timestamp: Date.now(),
                };
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
  }, [session?.session_id]);

  // --- handleStreamingResponse: POST to text_generation, relies on AppSync subscription ---
  const handleStreamingResponse = async (url, authToken, message, overrideSessionId = null) => {
    try {
      const sid = overrideSessionId || session?.session_id;
      if (!sid) throw new Error("No session ID available for streaming");

      if (!streamSubRef.current || streamSessionIdRef.current !== sid) {
        console.log("Warming AppSync subscription for session:", sid);
        subscribeToStream(sid);
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: authToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message_content: message }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
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
    let authToken;
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
      .then(({ token, email }) => {
        authToken = token;
        userEmail = email;
        const messageUrl = `${import.meta.env.VITE_API_ENDPOINT}student/create_message?session_id=${encodeURIComponent(
          newSessionObj.session_id
        )}&email=${encodeURIComponent(userEmail)}&simulation_group_id=${encodeURIComponent(
          group.simulation_group_id
        )}&patient_id=${encodeURIComponent(patient.patient_id)}`;

        return fetch(messageUrl, {
          method: "POST",
          headers: {
            Authorization: authToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message_content: messageContent }),
        });
      })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to create message: ${response.statusText}`);
        }
        return response.json();
      })
      .then((messageData) => {
        setNewMessage(messageData[0]);
        setIsAItyping(true);
        setMessageInput("");

        const message = messageData[0].message_content;
        const messageId = messageData[0].message_id;

        const textGenUrl = `${import.meta.env.VITE_API_ENDPOINT}student/text_generation?simulation_group_id=${encodeURIComponent(
          group.simulation_group_id
        )}&session_id=${encodeURIComponent(
          newSessionObj.session_id
        )}&patient_id=${encodeURIComponent(
          patient.patient_id
        )}&session_name=${encodeURIComponent(
          newSessionObj.session_name
        )}&message_id=${encodeURIComponent(messageId)}&stream=true`;

        if (empathyEnabled) {
          pendingEmpathyRef.current = {
            messageContent: message,
            patientId: patient.patient_id,
            groupId: group.simulation_group_id,
          };
        }
        return handleStreamingResponse(textGenUrl, authToken, message, newSessionObj.session_id);
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
    const authSession = await fetchAuthSession();
    const token = authSession.tokens.idToken;
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_ENDPOINT}student/delete_last_message?session_id=${encodeURIComponent(
          session.session_id
        )}`,
        {
          method: "DELETE",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.ok) {
        await response.json();
        setMessages((prevMessages) => {
          if (prevMessages.length >= 2) {
            return prevMessages.slice(0, -2);
          } else {
            return [];
          }
        });
      } else {
        console.error("Failed to delete message:", response.statusText);
      }
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

      if (!import.meta.env.VITE_APPSYNC_GRAPHQL_URL) {
        console.error("VITE_APPSYNC_GRAPHQL_URL is not configured");
        return;
      }

      const apiUrl = `${import.meta.env.VITE_API_ENDPOINT}student/get_messages?session_id=${encodeURIComponent(session.session_id)}`;

      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: (await fetchAuthSession()).tokens.idToken,
        },
      });

      if (response.ok) {
        const result = await response.json();
        const data = Array.isArray(result) ? result : (result.data?.listMessagesBySession || []);

        const uniqueMessages = [];
        const messageIds = new Set();
        const messageContentMap = new Map();

        const sortedData = [...data].sort((a, b) => new Date(a.time_sent) - new Date(b.time_sent));

        sortedData.forEach((message) => {
          if (
            message.message_content.trim() === "introduce yourself briefly" ||
            message.message_content.includes("Begin the conversation as the")
          ) {
            return;
          }

          let normalizedMsg = { ...message };
          const n = normalizeVoiceLine(normalizedMsg.message_content);
          if (!n) return;

          normalizedMsg.message_content = n.message_content;
          normalizedMsg.student_sent = Object.prototype.hasOwnProperty.call(
            n,
            "student_sent"
          )
            ? n.student_sent
            : message.student_sent;

          const contentKey = `${normalizedMsg.student_sent ? "student" : "ai"}-${normalizedMsg.message_content.trim()}`;

          if (!messageIds.has(normalizedMsg.message_id) && !messageContentMap.has(contentKey)) {
            messageIds.add(normalizedMsg.message_id);
            messageContentMap.set(contentKey, true);
            uniqueMessages.push(normalizedMsg);
          } else {
            console.log("Filtered out duplicate message:", normalizedMsg.message_content.substring(0, 30) + "...");
          }
        });

        console.log(`[getMessages] Filtered ${data.length} messages to ${uniqueMessages.length} unique messages`);
        setMessages(filterUnwantedMessages(uniqueMessages));
      } else {
        const errorText = await response.text();
        console.error("[getMessages] Failed to retrieve messages - Status:", response.status, response.statusText, "Body:", errorText);
        setMessages([]);
      }
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
  }, [session?.session_id]);

  // --- Socket listeners for voice mode ---
  useEffect(() => {
    const setupSocketListeners = async () => {
      const socket = await getSocket();
      if (!socket.connected) socket.connect();

      // DIAGNOSTIC: log every socket event so we can tell if audio-chunk arrives at all
      socket.onAny((event, ...args) => {
        if (event === "audio-chunk") {
          console.log(`[${new Date().toLocaleTimeString()}] 📡 SOCKET EVENT: audio-chunk`, { dataLen: args[0]?.data?.length, allowAudio: allowAudioRef.current });
        }
      });

      const handleAudio = (data) => {
        console.log(`[${new Date().toLocaleTimeString()}] 📡 audio-chunk handler called`, { hasData: !!data?.data, allowAudio: allowAudioRef.current });
        if (!allowAudioRef.current || !data.data) return;
        lastVoiceAudioChunkAtRef.current = Date.now();
        playAudio(data.data);
        scheduleCompletionCheck();
      };

      const handleTextMessage = (data) => {
        console.log(`[${new Date().toLocaleTimeString()}] Voice text message received:`, data.text);
        const normalized = normalizeVoiceLine(data.text);
        if (!normalized) return;

        const isStudent = Object.prototype.hasOwnProperty.call(
          normalized,
          "student_sent"
        )
          ? normalized.student_sent
          : false;

        // Student utterances arrive via the dedicated `voice-user-message` event;
        // skip them here to avoid showing a duplicate bubble.
        if (isStudent) return;

        setMessages((prev) => {
          const last = prev[prev.length - 1];
          // Merge consecutive AI voice messages: if the last message is also an
          // AI voice turn (no student message in between), append rather than
          // creating a new bubble.
          if (
            !isStudent &&
            last &&
            last.student_sent === false &&
            typeof last.message_id === "string" &&
            last.message_id.startsWith("voice_")
          ) {
            const merged = mergeVoiceText(last.message_content, normalized.message_content);
            return [
              ...prev.slice(0, -1),
              { ...last, message_content: merged },
            ];
          }
          return [
            ...prev,
            {
              message_id: `voice_${Date.now()}`,
              student_sent: isStudent,
              message_content: normalized.message_content,
              time_sent: new Date().toISOString(),
            },
          ];
        });
      };

      const handleEmpathyFeedback = (data) => {
        if (data.content) {
          setRealtimeEmpathy((prev) => [...prev, { content: data.content, timestamp: Date.now() }]);
        }
      };

      const handleDiagnosisComplete = (payload) => {
        if (diagnosisCompletedRef.current) return;

        const isCompletedPayload = payload?.completed === true;
        const hasCompletionMessage =
          typeof payload?.message === "string" &&
          payload.message.toLowerCase().includes("completed");
        if (!isCompletedPayload && !hasCompletionMessage) return;

        pendingDiagnosisCompleteRef.current = payload;
        scheduleCompletionCheck();
      };

      const VOICE_PREVIEW_ID_USER = "VOICE_TRANSCRIPT_PREVIEW";

      const handleVoiceUserMessage = (data) => {
        const { text, message_id } = data;
        if (!text) return;

        // Replace the live transcript preview bubble with the confirmed message.
        setMessages((prev) => {
          const withoutPreview = prev.filter((m) => m.message_id !== VOICE_PREVIEW_ID_USER);
          return [
            ...withoutPreview,
            {
              message_id: message_id || `voice_user_${Date.now()}`,
              student_sent: true,
              message_content: text,
              time_sent: new Date().toISOString(),
            },
          ];
        });

        // Trigger empathy evaluation via the REST endpoint (mirrors text-chat flow).
        // Pass message_id so the Lambda can persist the result to this specific row.
        const sid = sessionRef.current?.session_id;
        if (empathyEnabledRef.current && patientRef.current && groupRef.current && sid) {
          callEmpathyEvaluationRef.current(
            {
              messageContent: text,
              patientId: patientRef.current.patient_id,
              groupId: groupRef.current.simulation_group_id,
              messageId: message_id || null,
            },
            sid
          );
        }
      };

      // Ephemeral preview bubble shown while the user is speaking.
      // Replaced by the real message when voice-user-message arrives.
      const VOICE_PREVIEW_ID = "VOICE_TRANSCRIPT_PREVIEW";

      const handleTranscriptPartial = (data) => {
        if (!data.text) return;
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.message_id === VOICE_PREVIEW_ID);
          if (idx !== -1) {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], message_content: data.text };
            return updated;
          }
          return [
            ...prev,
            {
              message_id: VOICE_PREVIEW_ID,
              student_sent: true,
              message_content: data.text,
              time_sent: new Date().toISOString(),
              _preview: true,
            },
          ];
        });
      };

      const handleTranscriptFinal = (data) => {
        if (!data.text) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.message_id === VOICE_PREVIEW_ID
              ? { ...m, message_content: data.text }
              : m
          )
        );
      };

      socket.off("audio-chunk");
      socket.off("text-message");
      socket.off("empathy-feedback");
      socket.off("diagnosis-complete");
      socket.off("nova-debug");
      socket.off("voice-started");
      socket.off("voice-user-message");
      socket.off("voice-transcript-partial");
      socket.off("voice-transcript-final");

      socket.on("audio-chunk", handleAudio);
      socket.on("text-message", handleTextMessage);
      socket.on("empathy-feedback", handleEmpathyFeedback);
      socket.on("diagnosis-complete", handleDiagnosisComplete);
      socket.on("nova-debug", (data) => console.log(`[${new Date().toLocaleTimeString()}] 🐞 NOVA:`, data.message));
      socket.on("voice-user-message", handleVoiceUserMessage);
      socket.on("voice-transcript-partial", handleTranscriptPartial);
      socket.on("voice-transcript-final", handleTranscriptFinal);
    };
    setupSocketListeners();
  }, []);

  // Voice-started event
  const [voiceStarted, setVoiceStarted] = useState(false);
  useEffect(() => {
    const setupSocket = async () => {
      const socket = await getSocket();
      socket.off("voice-started");
      socket.off("nova-started");
      const handleVoiceStarted = () => {
        console.log("Voice backend ready in StudentChat!");
        diagnosisCompletedRef.current = false;
        setVoiceStarted(true);
      };
      socket.on("voice-started", handleVoiceStarted);
      socket.on("nova-started", handleVoiceStarted);
    };
    setupSocket();
  }, []);

  // --- Textarea auto-resize ---
  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSubmit();
      }
    },
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
  }, [textareaRef.current, handleKeyDown]);

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
