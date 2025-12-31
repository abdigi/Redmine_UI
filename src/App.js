import React from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Sidebar, { SIDEBAR_WIDTH_CONST } from "./components/Sidebar";
import Header from "./components/Header";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import MasterDashboard from "./pages/MasterDashboard";
import StateMinisterDashboard from "./pages/StateMinisterDashboard";
import HigherOfficialDashboard from "./pages/HigherOfficialDashboard";
import ProjectDashboard from "./pages/ProjectDashboard";
import AddSubIssue from "./pages/AddSubIssue";
import EditIssue from "./pages/EditIssue";
import ChangeStatusPage from "./pages/ChangeStatusPage";
import AssignedPage from "./pages/AssignedPage";
import ProgressPage from "./pages/ProgressPage";
import TeamLeaderDashboard from "./pages/TeamLeaderDashboard";
import LeadExecutiveDashboard from "./pages/LeadExecutiveDashboard";
import ProtectedRoute from "./components/ProtectedRoute";

function AppWrapper() {
  const location = useLocation();
  const isLoggedIn = !!localStorage.getItem("redmine_user");

  // Show sidebar only after login and NOT on login page
  const showSidebar = isLoggedIn && location.pathname !== "/login";

  return (
    <div className="app-container">
      {/* Header always visible with high z-index */}
      <Header />

      <div className="main-content-wrapper">
        {/* Fixed sidebar positioning */}
        {showSidebar && <Sidebar />}

        {/* Main content area with proper margin */}
        <main 
          className="main-content"
          style={{ 
            marginLeft: showSidebar ? SIDEBAR_WIDTH_CONST : 0,
            paddingTop: "70px" // Add padding for fixed header
          }}
        >
          <div className="content-container">
            <Routes>
  {/* 🔓 Public Routes */}
  <Route path="/login" element={<Login />} />
  <Route path="/" element={<Login />} />

  {/* 🔒 Protected Routes */}
  <Route
    path="/dashboard"
    element={
      <ProtectedRoute>
        <Dashboard />
      </ProtectedRoute>
    }
  />

  <Route
    path="/master-dashboard"
    element={
      <ProtectedRoute>
        <MasterDashboard />
      </ProtectedRoute>
    }
  />

  <Route
    path="/state-minister-dashboard"
    element={
      <ProtectedRoute>
        <StateMinisterDashboard />
      </ProtectedRoute>
    }
  />

  <Route
    path="/higherofficial-dashboard"
    element={
      <ProtectedRoute>
        <HigherOfficialDashboard />
      </ProtectedRoute>
    }
  />

  <Route
    path="/teamleader-dashboard"
    element={
      <ProtectedRoute>
        <TeamLeaderDashboard />
      </ProtectedRoute>
    }
  />

  <Route
    path="/lead-executive-dashboard"
    element={
      <ProtectedRoute>
        <LeadExecutiveDashboard />
      </ProtectedRoute>
    }
  />

  <Route
    path="/add-sub-issue"
    element={
      <ProtectedRoute>
        <AddSubIssue />
      </ProtectedRoute>
    }
  />

  <Route
    path="/edit-issue"
    element={
      <ProtectedRoute>
        <EditIssue />
      </ProtectedRoute>
    }
  />

  <Route
    path="/change-status"
    element={
      <ProtectedRoute>
        <ChangeStatusPage />
      </ProtectedRoute>
    }
  />

  <Route
    path="/assigned-page"
    element={
      <ProtectedRoute>
        <AssignedPage />
      </ProtectedRoute>
    }
  />

  <Route
    path="/progress-page"
    element={
      <ProtectedRoute>
        <ProgressPage />
      </ProtectedRoute>
    }
  />

  {/* ❌ Fallback */}
  <Route path="*" element={<p>Page Not Found</p>} />
</Routes>

          </div>
        </main>
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