import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
// MUI
import SettingsIcon from "@mui/icons-material/Settings";
// amplify
import { signOut } from "aws-amplify/auth";
import { fetchAuthSession } from "aws-amplify/auth";
import { fetchUserAttributes } from "aws-amplify/auth";
import { UserContext } from "../App";

const StudentHeader = () => {
  const [name, setName] = useState("");
  const [showDashboard, setShowDashboard] = useState(false);
  const { isInstructorAsStudent, setIsInstructorAsStudent } =
    useContext(UserContext);
  const navigate = useNavigate();

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
              d="M12 6v6l4 2"
            />
          </svg>
        </div>
        <div className="text-left">
          <h1 className="text-xl font-semibold text-gray-900 leading-tight">
            {showDashboard && name && `${name}'s Dashboard`}
          </h1>
          <p className="text-sm text-gray-500">Simulation training hub</p>
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
