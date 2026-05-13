import AIMessage from "../../components/AIMessage";
import StudentMessage from "../../components/StudentMessage";
import { titleCase } from "../../utils/textFormatting";

// TypingIndicator using l-mirage
const TypingIndicator = ({ patientName }) => (
  <div className="flex items-center justify-center py-4">
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-6 py-4 flex items-center space-x-3">
      <l-mirage size="24" speed="2.5" color="#10b981"></l-mirage>
      <span className="text-gray-600 font-medium text-sm">
        {patientName ? `${titleCase(patientName)} is thinking...` : "Thinking..."}
      </span>
    </div>
  </div>
);

/**
 * Scrollable message list with typing indicator and scroll-to-bottom anchor.
 */
const ChatMessageArea = ({
  messages,
  isAItyping,
  patient,
  profilePicture,
  messagesEndRef,
  getMostRecentStudentMessageIndex,
  hasAiMessageAfter,
  handleDeleteMessage,
}) => {
  return (
    <div className="flex-grow overflow-y-auto p-4 h-full flex flex-col">
      {messages.map((message, index) =>
        message.student_sent ? (
          <StudentMessage
            key={message.message_id}
            message={message.message_content}
            isMostRecent={getMostRecentStudentMessageIndex() === index}
            onDelete={() => handleDeleteMessage(message)}
            hasAiMessageAfter={() =>
              hasAiMessageAfter(messages, getMostRecentStudentMessageIndex())
            }
            isPreview={message._preview === true}
          />
        ) : (
          <AIMessage
            key={message.message_id}
            message={message.message_content}
            profilePicture={profilePicture}
            name={patient?.patient_name}
            isStreaming={message._streaming === true}
          />
        )
      )}

      {isAItyping && <TypingIndicator patientName={patient?.patient_name} />}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default ChatMessageArea;
