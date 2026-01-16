import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Sidebar, { SIDEBAR_WIDTH_CONST } from "./components/Sidebar";
import Header from "./components/Header";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import MasterDashboard from "./pages/MasterDashboard";
import StateMinisterDashboard from "./pages/StateMinisterDashboard";
import HigherOfficialDashboard from "./pages/HigherOfficialDashboard";
import PersonalPlanManagement from "./pages/PersonalPlanManagement";

import ChangeStatusPage from "./pages/ChangeStatusPage";
import AssignedPage from "./pages/AssignedPage";
import ProgressPage from "./pages/ProgressPage";
import TeamLeaderDashboard from "./pages/TeamLeaderDashboard";
import LeadExecutiveDashboard from "./pages/LeadExecutiveDashboard";
import ProtectedRoute from "./components/ProtectedRoute";

function AppWrapper() {
  const location = useLocation();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check login status
    const checkAuth = () => {
      const user = localStorage.getItem("redmine_user");
      setIsLoggedIn(!!user);
      setIsLoading(false);
    };
    
    checkAuth();
    
    // Listen for storage changes
    const handleStorageChange = () => {
      checkAuth();
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // ONLY login page should NOT show sidebar/header
  const isLoginPage = location.pathname === "/" || location.pathname === "/login";
  
  // Show sidebar/header on ALL pages except login
  const showSidebarAndHeader = !isLoginPage;

  // Don't render anything while checking auth
  if (isLoading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Header - show on all pages except login */}
      {showSidebarAndHeader && <Header />}

      <div className="main-content-wrapper">
        {/* Sidebar - show on all pages except login */}
        {showSidebarAndHeader && <Sidebar />}

        {/* Main content area with proper margin */}
        <main 
          className="main-content"
          style={{ 
            marginLeft: showSidebarAndHeader ? SIDEBAR_WIDTH_CONST : 0,
            paddingTop: showSidebarAndHeader ? "70px" : "0" // Add padding only when header is visible
          }}
        >
          <div className="content-container">
            <Routes>
              {/* 🔓 Public Routes - no sidebar/header */}
              <Route path="/" element={<Login />} />
              <Route path="/login" element={<Login />} />

              {/* 🔒 All other routes - protected with sidebar/header */}
              <Route path="/dashboard" element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } />

              <Route path="/master-dashboard" element={
                <ProtectedRoute>
                  <MasterDashboard />
                </ProtectedRoute>
              } />

              <Route path="/state-minister-dashboard" element={
                <ProtectedRoute>
                  <StateMinisterDashboard />
                </ProtectedRoute>
              } />

              <Route path="/higherofficial-dashboard" element={
                <ProtectedRoute>
                  <HigherOfficialDashboard />
                </ProtectedRoute>
              } />

              <Route path="/teamleader-dashboard" element={
                <ProtectedRoute>
                  <TeamLeaderDashboard />
                </ProtectedRoute>
              } />

              <Route path="/lead-executive-dashboard" element={
                <ProtectedRoute>
                  <LeadExecutiveDashboard />
                </ProtectedRoute>
              } />

              <Route path="/personal-plan-management" element={
                <ProtectedRoute>
                  <PersonalPlanManagement />
                </ProtectedRoute>
              } />

             

              <Route path="/change-status" element={
                <ProtectedRoute>
                  <ChangeStatusPage />
                </ProtectedRoute>
              } />

              <Route path="/assigned-page" element={
                <ProtectedRoute>
                  <AssignedPage />
                </ProtectedRoute>
              } />

              <Route path="/progress-page" element={
                <ProtectedRoute>
                  <ProgressPage />
                </ProtectedRoute>
              } />

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