const SIMULATED_ROLE = import.meta.env.VITE_SIMULATED_ROLE || "patient";

const ChatTopBar = ({ handleSignOut }) => {
  const roleLabel = SIMULATED_ROLE.charAt(0).toUpperCase() + SIMULATED_ROLE.slice(1);
  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
          <svg
            className="w-6 h-6 text-emerald-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </div>
        <div style={{ textAlign: "left" }} className="flex flex-col">
          <h1 className="text-xl font-semibold text-gray-900">AI {roleLabel}</h1>
          <p className="text-sm text-gray-500">Interactive simulation...</p>
        </div>
      </div>

      <button
        onClick={handleSignOut}
        className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors duration-200"
      >
        Sign Out
      </button>
    </div>
  );
};

export default ChatTopBar;
