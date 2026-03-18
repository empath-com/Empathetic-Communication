import Session from "../../components/Session";
import { titleCase } from "../../utils/textFormatting";
import DescriptionIcon from "@mui/icons-material/Description";
import InfoIcon from "@mui/icons-material/Info";
import PsychologyIcon from "@mui/icons-material/Psychology";

/**
 * Sidebar containing patient header, new-chat button, session list, and action buttons.
 */
const ChatSidebar = ({
  patient,
  sidebarWidth,
  sessions,
  session,
  setSession,
  setSessions,
  creatingSession,
  setCreatingSession,
  handleNewChat,
  handleDeleteSession,
  setFilteredMessages,
  empathyEnabled,
  isEmpathyLoading,
  fetchEmpathySummary,
  onNotesOpen,
  onPatientInfoOpen,
  handleBack,
}) => {
  return (
    <div
      className="flex flex-col bg-white border-r border-gray-200 shadow-sm"
      style={{
        width: sidebarWidth,
        minWidth: sidebarWidth <= 160 ? "120px" : "280px",
      }}
    >
      {/* Header Section */}
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center space-x-3">
          <button
            onClick={handleBack}
            className="p-2 rounded-lg bg-[rgba(0,0,0,0)] hover:bg-gray-100 transition-colors duration-200 flex-shrink-0"
          >
            <svg
              className="w-5 h-5 text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          {sidebarWidth > 160 && (
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-gray-900 truncate">
                {titleCase(patient.patient_name)}
              </h2>
              <p className="text-sm text-gray-500">
                {patient.patient_gender}, {patient.patient_age} years old
              </p>
            </div>
          )}
        </div>
      </div>

      {/* New Chat Button */}
      <div className="p-4">
        <button
          onClick={() => {
            if (!creatingSession) {
              setCreatingSession(true);
              handleNewChat();
            }
          }}
          disabled={creatingSession}
          className="w-full bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg py-3 px-4 font-medium transition-colors duration-200 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          {sidebarWidth > 160 && <span>New Chat</span>}
        </button>
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="space-y-2">
          {sessions
            .slice()
            .reverse()
            .map((iSession) => (
              <Session
                key={iSession.session_id}
                text={sidebarWidth > 160 ? iSession.session_name : ""}
                session={iSession}
                setSession={setSession}
                deleteSession={handleDeleteSession}
                selectedSession={session}
                setMessages={setFilteredMessages}
                setSessions={setSessions}
                sessions={sessions}
              />
            ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="p-4 border-t border-gray-100 space-y-3">
        {/* Empathy Coach Button */}
        {empathyEnabled && (
          <button
            onClick={fetchEmpathySummary}
            disabled={isEmpathyLoading}
            className="w-full bg-white border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 text-gray-700 hover:text-emerald-700 rounded-lg py-3 px-4 font-medium transition-all duration-200 flex items-center justify-start space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PsychologyIcon className="w-5 h-5" />
            {sidebarWidth > 160 && <span>Empathy Coach</span>}
          </button>
        )}

        {/* Notes Button */}
        <button
          onClick={onNotesOpen}
          className="w-full bg-white border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 text-gray-700 hover:text-emerald-700 rounded-lg py-3 px-4 font-medium transition-all duration-200 flex items-center justify-start space-x-2"
        >
          <DescriptionIcon className="w-5 h-5" />
          {sidebarWidth > 160 && <span>Notes</span>}
        </button>

        {/* Patient Info Button */}
        <button
          onClick={onPatientInfoOpen}
          className="w-full bg-white border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 text-gray-700 hover:text-emerald-700 rounded-lg py-3 px-4 font-medium transition-all duration-200 flex items-center justify-start space-x-2"
        >
          <InfoIcon className="w-5 h-5" />
          {sidebarWidth > 160 && <span>Patient Info</span>}
        </button>

        {/* Reveal Answer Button (commented out in original)
        <button
          onClick={handleOpenConfirm}
          className="w-full bg-white border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 text-gray-700 hover:text-emerald-700 rounded-lg py-3 px-4 font-medium transition-all duration-200 flex items-center justify-start space-x-2"
        >
          <KeyIcon className="w-5 h-5" />
          {sidebarWidth > 160 && <span>Reveal Answer</span>}
        </button>
        */}
      </div>
    </div>
  );
};

export default ChatSidebar;
