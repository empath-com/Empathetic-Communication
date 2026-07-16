import MicIcon from "@mui/icons-material/Mic";

/**
 * Text input area with optional voice button and send button.
 */
const ChatInput = ({
  textareaRef,
  messageInput,
  setMessageInput,
  handleKeyDown,
  handleSubmit,
  isSubmitting,
  isAItyping,
  creatingSession,
  voiceEnabled,
  isRecording,
  onVoiceToggle,
}) => {
  return (
    <div className="border-t border-gray-200 p-6">
      <div className="bg-gray-50 border border-gray-200 rounded-2xl flex items-end space-x-3 p-4 focus-within:border-emerald-300 focus-within:bg-white transition-all duration-200">
        {/* Voice Button */}
        {voiceEnabled && (
          <button
            onClick={onVoiceToggle}
            className={`p-2 rounded-lg transition-colors duration-200 flex-shrink-0 ${
              isRecording
                ? "bg-red-100 text-red-600 hover:bg-red-200"
                : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
            }`}
          >
            <MicIcon className="w-5 h-5" />
          </button>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={messageInput}
          onChange={(e) => setMessageInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message..."
          className="flex-1 bg-transparent text-gray-900 placeholder-gray-500 resize-none outline-none max-h-32 py-1"
          style={{ maxHeight: "2.4rem" }}
          maxLength={2096}
        />

        {/* Send Button */}
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || isAItyping || creatingSession}
          className="p-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors duration-200 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default ChatInput;
