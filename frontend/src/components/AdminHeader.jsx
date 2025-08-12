import React from "react";
import { useNavigate } from "react-router-dom";
// MUI
import SettingsIcon from "@mui/icons-material/Settings";
// amplify
import { signOut } from "aws-amplify/auth";

const AdminHeader = () => {
  const navigate = useNavigate();
  const handleSignOut = (event) => {
    event.preventDefault();
    signOut()
      .then(() => {
        window.location.href = "/";
      })
      .catch((error) => {
        console.error("Error signing out: ", error);
      });
  };

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
          <SettingsIcon className="w-6 h-6 text-emerald-600" />
        </div>
        <div className="text-left">
          <h1 className="text-xl font-semibold text-gray-900 leading-tight">
            Administrator
          </h1>
          <p className="text-sm text-gray-500">System management console</p>
        </div>
      </div>
      <div className="flex items-center space-x-3">
        <button
          type="button"
          onClick={handleSignOut}
          className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors duration-200"
        >
          Sign Out
        </button>
      </div>
    </header>
  );
};

export default AdminHeader;
