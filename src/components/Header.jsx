import React from "react";
import { useNavigate, useLocation } from "react-router-dom";

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();

  // Check if user is logged in
  const isLoggedIn = !!localStorage.getItem("redmine_user");

  const handleLogout = () => {
    localStorage.removeItem("redmine_user");
    navigate("/login"); // redirect to login page
  };

  const handleLogin = () => {
    navigate("/login"); // redirect to login page
  };

  const handleDashboard = () => {
    navigate("/"); // redirect to dashboard
  };

  return (
    <div
      style={{
        height: "60px",
        width: "100%",
        background: "#fff",
        color: "#2E7D32",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0 20px",
        boxSizing: "border-box",
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 1000,
        borderBottom: "1px solid #ccc",
      }}
    >
      <h2 style={{ margin: 0, fontSize: "18px" }}>
        Ministry of Agriculture Plan & Report Tracker
      </h2>

      {isLoggedIn ? (
        <button
          onClick={handleLogout}
          style={{
            background: "#fafafa",
            color: "#2E7D32",
            border: "1px solid #ccc",
            padding: "4px 8px",
            borderRadius: "3px",
            fontSize: "12px",
            cursor: "pointer",
            width: "70px",
            textAlign: "center",
          }}
        >
          Logout
        </button>
      ) : location.pathname === "/login" ? (
        <button
          onClick={handleDashboard}
          style={{
            background: "#fafafa",
            color: "#2E7D32",
            border: "1px solid #ccc",
            padding: "4px 8px",
            borderRadius: "3px",
            fontSize: "12px",
            cursor: "pointer",
            width: "90px",
            textAlign: "center",
          }}
        >
          Dashboard
        </button>
      ) : (
        <button
          onClick={handleLogin}
          style={{
            background: "#fafafa",
            color: "#2E7D32",
            border: "1px solid #ccc",
            padding: "4px 8px",
            borderRadius: "3px",
            fontSize: "12px",
            cursor: "pointer",
            width: "70px",
            textAlign: "center",
          }}
        >
          Login
        </button>
      )}
    </div>
  );
}
