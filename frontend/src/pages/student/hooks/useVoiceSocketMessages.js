import { useEffect } from "react";
import { getSocket } from "../../../utils/socket";
import { playAudio } from "../../../utils/voiceStream";
import { normalizeVoiceLine, normalizeEmpathyData } from "./chatMessageUtils";

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
 * Registers all Socket.IO listeners for voice mode.
 *
 * Extracted from useChatMessages so that the main hook stays under ~400 lines.
 * All mutable state is communicated through refs passed in as params.
 */
export default function useVoiceSocketMessages({
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
}) {
  useEffect(() => {
    const setupSocketListeners = async () => {
      const socket = await getSocket();
      if (!socket.connected) socket.connect();

      // DIAGNOSTIC: log every socket event so we can tell if audio-chunk arrives at all
      socket.onAny((event, ...args) => {
        if (event === "audio-chunk") {
          console.log(
            `[${new Date().toLocaleTimeString()}] 📡 SOCKET EVENT: audio-chunk`,
            { dataLen: args[0]?.data?.length, allowAudio: allowAudioRef.current }
          );
        }
      });

      const handleAudio = (data) => {
        console.log(
          `[${new Date().toLocaleTimeString()}] 📡 audio-chunk handler called`,
          { hasData: !!data?.data, allowAudio: allowAudioRef.current }
        );
        if (!allowAudioRef.current || !data.data) return;
        lastVoiceAudioChunkAtRef.current = Date.now();
        playAudio(data.data);
        scheduleCompletionCheck();
      };

      const handleTextMessage = (data) => {
        console.log(
          `[${new Date().toLocaleTimeString()}] Voice text message received:`,
          data.text
        );
        const normalized = normalizeVoiceLine(data.text);
        if (!normalized) return;

        const isStudent = Object.prototype.hasOwnProperty.call(normalized, "student_sent")
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
            return [...prev.slice(0, -1), { ...last, message_content: merged }];
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
          setRealtimeEmpathy((prev) => [
            ...prev,
            { content: data.content, timestamp: Date.now() },
          ]);
        }
      };

      const handleEmpathyData = (data) => {
        setRealtimeEmpathy((prev) => [...prev, normalizeEmpathyData(data)]);
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
            m.message_id === VOICE_PREVIEW_ID ? { ...m, message_content: data.text } : m
          )
        );
      };

      socket.on("audio-chunk", handleAudio);
      socket.on("text-message", handleTextMessage);
      socket.on("empathy-feedback", handleEmpathyFeedback);
      socket.on("empathy-data", handleEmpathyData);
      socket.on("diagnosis-complete", handleDiagnosisComplete);
      const handleNovaDebug = (data) =>
        console.log(`[${new Date().toLocaleTimeString()}] 🐞 NOVA:`, data.message);
      socket.on("nova-debug", handleNovaDebug);
      socket.on("voice-user-message", handleVoiceUserMessage);
      socket.on("voice-transcript-partial", handleTranscriptPartial);
      socket.on("voice-transcript-final", handleTranscriptFinal);

      return () => {
        socket.off("audio-chunk", handleAudio);
        socket.off("text-message", handleTextMessage);
        socket.off("empathy-feedback", handleEmpathyFeedback);
        socket.off("empathy-data", handleEmpathyData);
        socket.off("diagnosis-complete", handleDiagnosisComplete);
        socket.off("nova-debug", handleNovaDebug);
        socket.off("voice-user-message", handleVoiceUserMessage);
        socket.off("voice-transcript-partial", handleTranscriptPartial);
        socket.off("voice-transcript-final", handleTranscriptFinal);
      };
    };

    let disposed = false;
    let cleanup;
    setupSocketListeners().then((listenerCleanup) => {
      if (disposed) {
        listenerCleanup?.();
      } else {
        cleanup = listenerCleanup;
      }
    });
    // Socket handlers use refs so they can be registered once.
    return () => {
      disposed = true;
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
