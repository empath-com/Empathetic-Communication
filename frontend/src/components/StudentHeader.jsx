import { useState, useEffect, useContext } from "react";
// MUI
// amplify
import { signOut } from "aws-amplify/auth";
import { fetchAuthSession } from "aws-amplify/auth";
import { fetchUserAttributes } from "aws-amplify/auth";
import { UserContext } from "../UserContext";

const StudentHeader = () => {
  const [name, setName] = useState("");
  const [showDashboard, setShowDashboard] = useState(false);
  const { isInstructorAsStudent, setIsInstructorAsStudent } =
    useContext(UserContext);

  useEffect(() => {
    const fetchName = () => {
      fetchAuthSession()
        .then((session) => {
          return fetchUserAttributes().then((userAttributes) => {
            const token = session.tokens.idToken;
            const email = userAttributes.email;
            return fetch(
              `${
                import.meta.env.VITE_API_ENDPOINT
              }student/get_name?user_email=${encodeURIComponent(email)}`,
              {
                method: "GET",
                headers: {
                  Authorization: token,
                  "Content-Type": "application/json",
                },
              }
            );
          });
        })
        .then((response) => response.json())
        .then((data) => {
          setName(data.name);
        })
        .catch((error) => {
          console.error("Error fetching name:", error);
        });
    };

    fetchName();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowDashboard(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [name]);

  const handleSignOut = async (event) => {
    event.preventDefault();
    signOut()
      .then(() => {
        window.location.href = "/";
      })
      .catch((error) => {
        console.error("Error signing out: ", error);
      });
  };

  const handleSwitchToInstructor = () => {
    setIsInstructorAsStudent(false);
  };

  return (
    <header
      className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between"
      style={{ paddingLeft: "15px", paddingRight: "40px" }}
    >
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
          {/* Person icon (head & shoulders) */}
          <svg
            className="w-6 h-6 text-emerald-600"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="8" r="3" />
            <path d="M6 20v-1a6 6 0 0 1 12 0v1" />
          </svg>
        </div>
        <div className="text-left">
          <h1 className="text-xl font-semibold text-gray-900 leading-tight">
            {showDashboard && name && `${name}'s Dashboard`}
          </h1>
          <p className="text-sm text-gray-500">Simulation group view</p>
        </div>
      </div>
      <div className="flex items-center space-x-3">
        {isInstructorAsStudent && (
          <button
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium transition-colors duration-200"
            onClick={handleSwitchToInstructor}
          >
            Instructor View
          </button>
        )}
        <button
          className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors duration-200"
          onClick={handleSignOut}
        >
          Sign Out
        </button>
      </div>
    </header>
  );
};

export default StudentHeader;
