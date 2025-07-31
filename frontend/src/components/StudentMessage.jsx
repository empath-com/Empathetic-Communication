import { useState, useMemo } from "react";
import AccountBoxIcon from "@mui/icons-material/AccountBox";
import { FaTrashAlt } from "react-icons/fa"; 
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { dracula } from "react-syntax-highlighter/dist/cjs/styles/prism";

const StudentMessage = ({ message, isMostRecent, onDelete, hasAiMessageAfter }) => {
  const [isHovered, setIsHovered] = useState(false);

  // Process the message to remove duplicated content
  const processedMessage = useMemo(() => {
    if (!message) return "";
    
    // Check if the message starts with "user "
    if (message.trim().startsWith("user ")) {
      return message.trim().substring(5).trim();
    }
    
    // Check for duplicated content
    const lines = message.split('\n');
    const uniqueLines = [];
    const seenLines = new Set();
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      // Skip empty lines or very short lines
      if (trimmedLine.length < 5) {
        uniqueLines.push(line);
        continue;
      }
      
      if (!seenLines.has(trimmedLine)) {
        seenLines.add(trimmedLine);
        uniqueLines.push(line);
      }
    }
    
    return uniqueLines.join('\n');
  }, [message]);

  const renderCodeBlock = (code, language) => {
    return (
      <SyntaxHighlighter
        language={language.toLowerCase()}
        style={dracula}
        customStyle={{
          fontSize: "0.85em",
        }}
      >
        {code}
      </SyntaxHighlighter>
    );
  };

  return (
    <div
      className="flex justify-end mb-4"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-end space-x-2 max-w-[70%]">
        {/* Conditional render for delete icon */}
        {isHovered && isMostRecent && hasAiMessageAfter && (
          <button
            onClick={onDelete}
            className="mb-2 p-2 hover:bg-red-100 rounded-lg transition-colors duration-200"
            title="Delete this message and all that follow"
          >
            <FaTrashAlt className="w-4 h-4 text-red-500" />
          </button>
        )}
        
        {/* Chat Bubble for Student Message */}
        <div className="bg-emerald-500 text-white rounded-2xl rounded-br-lg px-4 py-3 shadow-sm">
          <div className="text-sm font-medium leading-relaxed">
            {processedMessage.split("```").map((part, index) => {
              if (index % 2 === 1) {
                const [language, ...codeLines] = part.split("\n");
                const code = codeLines.join("\n");
                return (
                  <div key={index} className="my-2">
                    {renderCodeBlock(code, language.trim())}
                  </div>
                );
              }
              return <span key={index}>{part}</span>;
            })}
          </div>
        </div>
        
        {/* User Avatar */}
        <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0 mb-2">
          <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
      </div>
    </div>
  );
};

export default StudentMessage;
