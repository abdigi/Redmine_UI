import React from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Sidebar, { SIDEBAR_WIDTH_CONST } from "./components/Sidebar";
import Header from "./components/Header";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import AddSubIssue from "./pages/AddSubIssue";
import EditIssue from "./pages/EditIssue";
import MasterDashboard from "./pages/MasterDashboard";
import ProjectDashboard from "./pages/ProjectDashboard";    
import ChangeStatusPage from "./pages/ChangeStatusPage";
import AssignedPage from "./pages/AssignedPage";
import ProgressPage from "./pages/ProgressPage";
function AppWrapper() {
  const location = useLocation();
  const isLoggedIn = !!localStorage.getItem("redmine_user");

  // Show sidebar & header only after login and not on login page
  const showSidebar = isLoggedIn && location.pathname !== "/";
  const showHeader = true;

  return (
    <div>
      {showHeader && <Header />}

      <div style={{ display: "flex", marginTop: showHeader ? "60px" : 0 }}>
        {showSidebar && <Sidebar />}

        <div
          style={{
            marginLeft: showSidebar ? SIDEBAR_WIDTH_CONST : 0,
            padding: "20px",
            flex: 1,
          }}
        >
          <Routes>
            <Route path="/" element={<ProjectDashboard />} />
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/master-dashboard" element={<MasterDashboard/>} />
            <Route path="/add-sub-issue" element={<AddSubIssue />} />
            <Route path="/edit-issue" element={<EditIssue />} />
            
             <Route path="/change-status" element={<ChangeStatusPage />} />
             <Route path="/assigned-page" element={<AssignedPage />} />
              <Route path="/progress-page" element={<ProgressPage/>} />
            <Route path="*" element={<p>Page Not Found</p>} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppWrapper />
    </BrowserRouter>
  );
}
