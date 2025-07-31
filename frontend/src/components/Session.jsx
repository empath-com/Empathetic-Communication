import { useEffect, useState, useRef } from "react";
import PropTypes from "prop-types";
import { fetchAuthSession } from "aws-amplify/auth";

const Session = ({
  text,
  session,
  setSession,
  deleteSession,
  selectedSession,
  setMessages,
  setSessions,
  sessions,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [newSessionName, setNewSessionName] = useState(text);

  const inputRef = useRef(null);
  const sessionRef = useRef(null);

  // Handle clicks outside the session component
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (sessionRef.current && !sessionRef.current.contains(event.target)) {
        handleInputBlur(); // Save changes when clicking outside
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleInputBlur();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [newSessionName]);

  const isSelected =
    selectedSession && selectedSession.session_id === session.session_id;

  const handleSessionClick = () => {
    if (selectedSession && selectedSession.session_id !== session.session_id) {
      setMessages([]);
    }
    setSession(session);
  };

  const handleDeleteClick = (event) => {
    event.stopPropagation();
    deleteSession(session);
  };

  const handleDoubleClick = () => {
    setIsEditing(true);
  };

  const handleInputChange = (event) => {
    const inputValue = event.target.value;
    if (inputValue.length <= 20) {
      setNewSessionName(inputValue);
    }
  };

  const handleInputBlur = async () => {
    setIsEditing(false);
    if (newSessionName !== text) {
      updateSessionName(session.session_id, newSessionName).catch((err) => {
        console.error("Failed to update session name:", err);
      });
    }
  };

  const updateSessionName = (sessionId, newName) => {
    const updatedName = newName.trim() === "" ? "New Chat" : newName;

    setSessions((prevSessions) =>
      prevSessions.map((session) =>
        session.session_id === sessionId
          ? { ...session, session_name: updatedName }
          : session
      )
    );

    return fetchAuthSession()
      .then((authSession) => {
        const token = authSession.tokens.idToken;
        return fetch(
          `${
            import.meta.env.VITE_API_ENDPOINT
          }student/update_session_name?session_id=${encodeURIComponent(
            sessionId
          )}`,
          {
            method: "PUT",
            headers: {
              Authorization: token,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ session_name: updatedName }),
          }
        );
      })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to update session name");
        }
      })
      .catch((error) => {
        console.error("Error updating session name:", error);
      });
  };

  return (
    <div
      ref={sessionRef}
      onClick={handleSessionClick}
      className={`cursor-pointer rounded-lg flex items-center justify-between p-3 transition-all duration-200 group ${
        isSelected
          ? "bg-emerald-50 border-l-4 border-emerald-500 shadow-sm"
          : "hover:bg-gray-50 border-l-4 border-transparent"
      }`}
    >
      <div
        onDoubleClick={handleDoubleClick}
        className="flex items-center space-x-3 flex-1 min-w-0"
      >
        <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-emerald-500' : 'bg-gray-300'}`} />
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={newSessionName}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            autoFocus
            className="flex-1 bg-transparent border-none outline-none text-sm font-medium text-gray-900 min-w-0"
            maxLength={20}
          />
        ) : (
          <div className="text-sm font-medium text-gray-900 truncate">
            {text || "New Chat"}
          </div>
        )}
      </div>
      <button
        onClick={handleDeleteClick}
        className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-100 transition-all duration-200 flex-shrink-0"
      >
        <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
};

export default Session;