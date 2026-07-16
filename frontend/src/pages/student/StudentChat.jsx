import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAuthSession, fetchUserAttributes, signOut } from "aws-amplify/auth";
import { SIMULATED_ROLE } from "../../utils/conversationBuilder";

import {
  startSpokenLLM,
  stopSpokenLLM,
  stopAudioPlayback,
  initPlaybackContext,
} from "../../utils/voiceStream";

import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Button,
  Typography,
} from "@mui/material";

import MicIcon from "@mui/icons-material/Mic";
import CloseIcon from "@mui/icons-material/Close";
import EditNoteIcon from "@mui/icons-material/EditNote";

import EmpathyCoachSummary from "../../components/EmpathyCoachSummary";
import DraggableNotes from "./DraggableNotes";
import FilesPopout from "./FilesPopout";

// Hooks
import useSidebarResize from "./hooks/useSidebarResize";
import useChatSessions from "./hooks/useChatSessions";
import useChatMessages from "./hooks/useChatMessages";
import useEmpathyCoach from "./hooks/useEmpathyCoach";
import { filterUnwantedMessages } from "./hooks/chatMessageUtils";

// Sub-components
import ChatSidebar from "./ChatSidebar";
import ChatTopBar from "./ChatTopBar";
import ChatMessageArea from "./ChatMessageArea";
import ChatInput from "./ChatInput";

// Importing l-mirage animation
import { mirage } from "ldrs";
mirage.register();

const StudentChat = ({ group, patient, setPatient, setGroup }) => {
  const navigate = useNavigate();

  // =====================================================================
  // Parent-owned shared state (consumed by multiple hooks)
  // =====================================================================
  const [sessions, setSessions] = useState([]);
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [isAItyping, setIsAItyping] = useState(false);

  // =====================================================================
  // Auth cache
  // =====================================================================
  const [authCache, setAuthCache] = useState({ token: null, exp: 0, email: null });

  const getAuth = async () => {
    const now = Date.now() / 1000;
    if (authCache.token && authCache.exp - 60 > now && authCache.email) {
      return authCache;
    }
    const authSession = await fetchAuthSession();
    const token = authSession.tokens.idToken;
    const exp = authSession.tokens?.idToken?.payload?.exp || now + 300;
    const { email } = await fetchUserAttributes();
    const updated = { token, exp, email };
    setAuthCache(updated);
    return updated;
  };

  // =====================================================================
  // UI state for popouts / overlays / files
  // =====================================================================
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [isPatientInfoOpen, setIsPatientInfoOpen] = useState(false);
  const [isAnswerKeyOpen, setIsAnswerKeyOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [showVoiceOverlay, setShowVoiceOverlay] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const [patientInfoFiles, setPatientInfoFiles] = useState([]);
  const [isInfoLoading, setIsInfoLoading] = useState(false);
  const [answerKeyFiles, setAnswerKeyFiles] = useState([]);
  const [isAnswerLoading, setIsAnswerLoading] = useState(false);
  const [profilePicture, setProfilePicture] = useState(null);

  // =====================================================================
  // Ref bridge: lets useChatSessions call handleStreamingResponse from useChatMessages
  // =====================================================================
  const handleStreamingResponseRef = useRef(null);

  // =====================================================================
  // Empathy coach hook
  // =====================================================================
  const empathy = useEmpathyCoach({ group, patient, session });

  // =====================================================================
  // Chat sessions hook (called first -- uses ref for streaming)
  // =====================================================================
  const chatSessions = useChatSessions({
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
  });

  // =====================================================================
  // Chat messages hook (called second -- receives real session values)
  // =====================================================================
  const chatMessages = useChatMessages({
    group,
    patient,
    session,
    setSession,
    setSessions,
    messages,
    setMessages,
    currentSessionId,
    setCurrentSessionId,
    creatingSession: chatSessions.creatingSession,
    setCreatingSession: chatSessions.setCreatingSession,
    getAuth,
    empathyEnabled: empathy.empathyEnabled,
    setRealtimeEmpathy: empathy.setRealtimeEmpathy,
    handleNewChat: chatSessions.handleNewChat,
    handleStreamingResponseRef,
    isAItyping,
    setIsAItyping,
  });

  // Keep the sessions hook's submitting/typing refs in sync
  useEffect(() => {
    chatSessions.updateSubmittingRef(chatMessages.isSubmitting);
    // The sessions hook exposes a stable ref updater.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMessages.isSubmitting]);
  useEffect(() => {
    chatSessions.updateAItypingRef(isAItyping);
    // The sessions hook exposes a stable ref updater.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAItyping]);

  // =====================================================================
  // Sidebar resize
  // =====================================================================
  const { sidebarWidth, startResizing } = useSidebarResize(280);

  // =====================================================================
  // Restore patient/group from sessionStorage
  // =====================================================================
  useEffect(() => {
    const storedPatient = sessionStorage.getItem("patient");
    if (storedPatient) {
      setPatient(JSON.parse(storedPatient));
    }
  }, [setPatient]);

  useEffect(() => {
    const storedGroup = sessionStorage.getItem("group");
    if (storedGroup) {
      setGroup(JSON.parse(storedGroup));
    }
  }, [setGroup]);

  // =====================================================================
  // Fetch files (patient info, answer key, profile picture)
  // =====================================================================
  const fetchFiles = async () => {
    setIsInfoLoading(true);
    setIsAnswerLoading(true);
    try {
      const authSession = await fetchAuthSession();
      const token = authSession.tokens.idToken;

      const response = await fetch(
        `${import.meta.env.VITE_API_ENDPOINT}student/get_all_files?simulation_group_id=${encodeURIComponent(
          group.simulation_group_id
        )}&patient_id=${encodeURIComponent(
          patient.patient_id
        )}&patient_name=${encodeURIComponent(patient.patient_name)}`,
        {
          method: "GET",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const infoFiles = Object.entries(data.info_files).map(
          ([fileName, fileDetails]) => ({
            name: fileName,
            url: fileDetails.url,
            type: fileName.split(".").pop().toLowerCase(),
            metadata: fileDetails.metadata,
          })
        );
        const answerFiles = Object.entries(data.answer_key_files).map(
          ([fileName, fileDetails]) => ({
            name: fileName,
            url: fileDetails.url,
            type: fileName.split(".").pop().toLowerCase(),
            metadata: fileDetails.metadata,
          })
        );
        const profilePic = data.profile_picture_url;
        const profileUrl =
          typeof profilePic === "string"
            ? profilePic
            : profilePic?.url || profilePic?.profile_picture_url || null;
        setProfilePicture(profileUrl || null);
        setPatientInfoFiles(infoFiles);
        setAnswerKeyFiles(answerFiles);
      } else {
        console.error("Failed to fetch patient info files:", response.statusText);
      }
    } catch (error) {
      console.error("Error fetching patient info files:", error);
    } finally {
      setIsInfoLoading(false);
      setIsAnswerLoading(false);
    }
  };

  useEffect(() => {
    if (patient && group) {
      fetchFiles();
    }
    // fetchFiles reads the current patient/group and auth context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient, group]);

  // =====================================================================
  // Voice helpers
  // =====================================================================
  const fetchVoiceID = async () => {
    try {
      if (!patient?.patient_id) {
        console.warn("Patient ID not available, defaulting to tiffany");
        return "tiffany";
      }
      const authSession = await fetchAuthSession();
      const token = authSession.tokens.idToken;
      const response = await fetch(
        `${import.meta.env.VITE_API_ENDPOINT}student/patient_voice_id?patient_id=${encodeURIComponent(
          patient.patient_id
        )}`,
        {
          method: "GET",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        return data.voice_id;
      } else {
        console.warn("Failed to fetch voice ID, defaulting to tiffany:", response.statusText);
        return "tiffany";
      }
    } catch (error) {
      console.warn("Error fetching voice ID, defaulting to tiffany:", error);
      return "tiffany";
    }
  };

  // Shared voice-stop: waits for the final AI response (stopSpokenLLM is async),
  // then reloads messages so the DB-persisted voice turns appear in the chat.
  const handleVoiceStop = async () => {
    // Keep allowAudioRef = true while waiting so audio-chunk events from LLaMA
    // are still played back by the useChatMessages handler. Only block after done.
    stopAudioPlayback();
    setIsRecording(false);
    setShowVoiceOverlay(false);
    chatSessions.setLoading(false);
    await stopSpokenLLM();
    chatMessages.allowAudioRef.current = false;
    // Give the server's async DB writes a moment to land before reloading
    setTimeout(() => chatMessages.getMessages(), 2000);
  };

  const handleVoiceToggle = () => {
    if (isRecording) {
      handleVoiceStop();
    } else {
      // Create/resume the shared playback AudioContext NOW, while we're inside
      // the user-gesture handler — Chrome requires this for audio to play later.
      initPlaybackContext();
      chatMessages.allowAudioRef.current = true;
      setShowVoiceOverlay(true);
      fetchVoiceID().then((voice_id) => {
        startSpokenLLM(voice_id, chatSessions.setLoading, currentSessionId, {
          patient_name: patient?.patient_name,
          patient_prompt: patient?.patient_prompt,
          patient_id: patient?.patient_id || "",
          llm_completion: !!patient?.llm_completion,
          system_prompt: group?.system_prompt || "",
        });
      });
      setIsRecording(true);
      chatSessions.setLoading(true);
    }
  };

  // =====================================================================
  // Navigation / auth actions
  // =====================================================================
  const handleBack = () => {
    sessionStorage.removeItem("patient");
    navigate(-1);
  };

  const handleSignOut = async (event) => {
    event.preventDefault();
    try {
      await signOut();
      window.location.href = "/";
    } catch (error) {
      console.error("Error signing out: ", error);
    }
  };

  // Confirmation dialog for reveal
  const handleCloseConfirm = () => setIsConfirmOpen(false);
  const handleConfirmReveal = () => {
    setIsConfirmOpen(false);
    setIsAnswerKeyOpen(true);
  };

  // =====================================================================
  // Early return if patient not loaded
  // =====================================================================
  if (!patient) {
    return <div>Loading...</div>;
  }

  // =====================================================================
  // Render
  // =====================================================================
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <ChatSidebar
        patient={patient}
        sidebarWidth={sidebarWidth}
        sessions={sessions}
        session={session}
        setSession={setSession}
        setSessions={setSessions}
        creatingSession={chatSessions.creatingSession}
        setCreatingSession={chatSessions.setCreatingSession}
        handleNewChat={chatSessions.handleNewChat}
        handleDeleteSession={chatSessions.handleDeleteSession}
        setFilteredMessages={chatSessions.setFilteredMessages}
        empathyEnabled={empathy.empathyEnabled}
        isEmpathyLoading={empathy.isEmpathyLoading}
        fetchEmpathySummary={empathy.fetchEmpathySummary}
        onNotesOpen={() => setIsNotesOpen(true)}
        onPatientInfoOpen={() => setIsPatientInfoOpen(true)}
        handleBack={handleBack}
      />

      {/* Sidebar Resize Handle */}
      <div
        onMouseDown={startResizing}
        className="w-1 bg-gray-200 hover:bg-emerald-300 cursor-col-resize transition-colors duration-200"
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-white min-w-0">
        <ChatTopBar handleSignOut={handleSignOut} />

        <ChatMessageArea
          messages={messages}
          isAItyping={isAItyping}
          patient={patient}
          profilePicture={profilePicture}
          messagesEndRef={chatMessages.messagesEndRef}
          getMostRecentStudentMessageIndex={chatMessages.getMostRecentStudentMessageIndex}
          hasAiMessageAfter={chatMessages.hasAiMessageAfter}
          handleDeleteMessage={chatMessages.handleDeleteMessage}
        />

        <ChatInput
          textareaRef={chatMessages.textareaRef}
          messageInput={chatMessages.messageInput}
          setMessageInput={chatMessages.setMessageInput}
          handleKeyDown={chatMessages.handleKeyDown}
          handleSubmit={chatMessages.handleSubmit}
          isSubmitting={chatMessages.isSubmitting}
          isAItyping={isAItyping}
          creatingSession={chatSessions.creatingSession}
          voiceEnabled={empathy.voiceEnabled}
          isRecording={isRecording}
          onVoiceToggle={handleVoiceToggle}
        />
      </div>

      {/* Draggable Notes */}
      {isNotesOpen && (
        <DraggableNotes
          isOpen={isNotesOpen}
          sessionId={session?.session_id}
          onClose={() => setIsNotesOpen(false)}
          zIndex={50}
        />
      )}

      <FilesPopout
        open={isPatientInfoOpen}
        onClose={() => setIsPatientInfoOpen(false)}
        files={patientInfoFiles}
        isLoading={isInfoLoading}
      />

      <FilesPopout
        open={isAnswerKeyOpen}
        onClose={() => setIsAnswerKeyOpen(false)}
        files={answerKeyFiles}
        isLoading={isAnswerLoading}
      />

      {/* Empathy Coach Dialog */}
      <Dialog
        open={empathy.isEmpathyCoachOpen}
        onClose={() => empathy.setIsEmpathyCoachOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: "16px",
            padding: "8px",
          },
        }}
      >
        <DialogTitle
          sx={{
            fontSize: "1.25rem",
            fontWeight: 600,
            color: "#111827",
            borderBottom: "1px solid #f3f4f6",
            pb: 2,
          }}
        >
          Empathy Coach Summary
          {patient && ` - ${patient.patient_name}`}
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          {empathy.isEmpathyLoading ? (
            <div className="flex items-center space-x-3 py-8">
              <l-mirage size="32" speed="2.5" color="#10b981"></l-mirage>
              <Typography className="text-gray-600">
                Loading empathy summary...
              </Typography>
            </div>
          ) : (
            <EmpathyCoachSummary empathyData={empathy.empathySummary} />
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 2 }}>
          <Button
            onClick={() => empathy.setIsEmpathyCoachOpen(false)}
            sx={{
              backgroundColor: "#f3f4f6",
              color: "#374151",
              "&:hover": { backgroundColor: "#e5e7eb" },
              borderRadius: "8px",
              textTransform: "none",
              fontWeight: 500,
            }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirmation Dialog for Reveal */}
      <Dialog
        open={isConfirmOpen}
        onClose={handleCloseConfirm}
        PaperProps={{
          sx: {
            borderRadius: "16px",
            padding: "8px",
          },
        }}
      >
        <DialogTitle
          sx={{
            fontSize: "1.25rem",
            fontWeight: 600,
            color: "#111827",
            borderBottom: "1px solid #f3f4f6",
            pb: 2,
          }}
        >
          Confirm Reveal
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <DialogContentText sx={{ color: "#6b7280", lineHeight: 1.6 }}>
            Are you sure you want to reveal the Patient&apos;s Diagnosis? This action
            will show the entire answer.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 2, gap: 1 }}>
          <Button
            onClick={handleCloseConfirm}
            sx={{
              backgroundColor: "#f3f4f6",
              color: "#374151",
              "&:hover": { backgroundColor: "#e5e7eb" },
              borderRadius: "8px",
              textTransform: "none",
              fontWeight: 500,
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmReveal}
            sx={{
              backgroundColor: "#ef4444",
              color: "white",
              "&:hover": { backgroundColor: "#dc2626" },
              borderRadius: "8px",
              textTransform: "none",
              fontWeight: 500,
            }}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      {/* Loading screen (not shown when voice panel is handling its own loading state) */}
      {chatSessions.loading && !showVoiceOverlay && (
        <div className="fixed inset-0 bg-white bg-opacity-95 backdrop-blur-sm z-[2000] flex flex-col items-center justify-center">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 flex flex-col items-center space-y-4">
            <l-mirage size="48" speed="2.5" color="#10b981" />
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Starting conversation...
              </h3>
              <p className="text-sm text-gray-500">Connecting to AI patient</p>
            </div>
          </div>
        </div>
      )}

      {/* Voice Side Panel */}
      {showVoiceOverlay && (
        <div className="w-72 flex-shrink-0 flex flex-col bg-white border-l border-gray-200">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center space-x-2">
              <MicIcon className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-semibold text-gray-800">Voice Mode</span>
            </div>
            <button
              onClick={handleVoiceStop}
              aria-label="Close voice panel"
              className="w-7 h-7 rounded-full bg-red-100 hover:bg-red-200 flex items-center justify-center transition-colors duration-200"
            >
              <CloseIcon className="w-4 h-4 text-red-600" />
            </button>
          </div>

          {/* Panel body */}
          <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 space-y-5">
            {/* Loading state while mic initializes */}
            {chatSessions.loading ? (
              <div className="flex flex-col items-center space-y-3">
                <l-mirage size="36" speed="2.5" color="#10b981" />
                <p className="text-sm text-gray-500 text-center">Preparing microphone...</p>
              </div>
            ) : (
              <>
                {/* Profile picture */}
                <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center overflow-hidden shadow-md">
                  {profilePicture ? (
                    <img
                      src={profilePicture}
                      alt={patient?.patient_name}
                      className="w-24 h-24 object-cover"
                      onError={() => setProfilePicture(null)}
                    />
                  ) : (
                    <MicIcon className="w-12 h-12 text-emerald-600" />
                  )}
                </div>

                <div className="text-center">
                  <p className="text-sm font-medium text-gray-800">Voice Mode Active</p>
                  <p className="text-xs text-gray-500 mt-1">Speak naturally to the AI {SIMULATED_ROLE}</p>
                </div>

                {/* Animated voice waves */}
                <div className="flex justify-center items-end space-x-1 h-10">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="w-1.5 bg-emerald-500 rounded-full animate-pulse"
                      style={{
                        height: [24, 32, 40, 28, 20][i] + "px",
                        animationDelay: i * 0.1 + "s",
                      }}
                    />
                  ))}
                </div>

                {/* Notes button */}
                <button
                  onClick={() => setIsNotesOpen((prev) => !prev)}
                  aria-label={isNotesOpen ? "Close notes" : "Open notes"}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg border text-sm transition-colors duration-200 ${
                    isNotesOpen
                      ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                      : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <EditNoteIcon className="w-4 h-4" />
                  <span>{isNotesOpen ? "Close Notes" : "Open Notes"}</span>
                </button>
              </>
            )}
          </div>

          {/* Visualizer canvas (visible during voice mode for diagnostics) */}
          <canvas 
            id="audio-visualizer" 
            width={300} 
            height={300} 
            className={`rounded-lg border-2 transition-all ${
              isRecording 
                ? "border-emerald-400 bg-gray-900 opacity-100" 
                : "border-transparent bg-transparent opacity-0 pointer-events-none"
            }`}
            style={{ maxWidth: "100%", margin: "8px 0" }}
          />
        </div>
      )}
    </div>
  );
};

export default StudentChat;
