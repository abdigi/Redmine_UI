import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";

export const SIDEBAR_WIDTH_CONST = 200;
const HEADER_HEIGHT = 60; // same as header

export default function Sidebar() {
  const [role, setRole] = useState("");

  useEffect(() => {
    // Get logged-in user data from localStorage
    const user = JSON.parse(localStorage.getItem("redmine_user"));
    if (user && user.memberships && user.memberships.length > 0) {
      const roleSet = new Set();

      // Collect all roles from all memberships
      user.memberships.forEach((membership) => {
        membership.roles.forEach((r) => roleSet.add(r.name));
      });

      const roles = Array.from(roleSet);

      // Determine main role for sidebar based on priority
      if (roles.includes("Team Leaders")) setRole("Team Leaders");
      else if (roles.includes("Executives")) setRole("Executives");
      else if (roles.includes("Chief Executives")) setRole("Chief Executives");
      else if (roles.includes("State Ministers")) setRole("State Ministers");
      else setRole("Other");
    } else {
      setRole("Other");
    }
  }, []);

  // Define menu items based on role
  let menuItems = [];

  if (role === "Team Leaders") {
    menuItems = [
      { name: "Dashboard", path: "/master-dashboard" },
      { name: "Change Status", path: "/change-status" },
      { name: "Assign Subtask", path: "/assigned-page" },
    ];
  } else if (role === "Executives") {
    menuItems = [
      { name: "Dashboard", path: "/master-dashboard" },
      { name: "Change Status", path: "/change-status" },
    ];
  } else if (role === "Chief Executives" || role === "State Ministers") {
    menuItems = [
      
      { name: "Change Status", path: "/change-status" },
    ];
  } else {
    // default for other roles
    menuItems = [
      { name: "Dashboard", path: "/dashboard" },
      { name: "Add Subtask", path: "/add-sub-issue" },
      { name: "Edit Issue", path: "/edit-issue" },
      { name: "Progress", path: "/progress-page" },
    ];
  }

  return (
    <div
      style={{
        width: SIDEBAR_WIDTH_CONST,
        height: `calc(100vh - ${HEADER_HEIGHT}px)`,
        background: "#2E7D32",
        color: "#fff",
        padding: "20px",
        position: "fixed",
        top: HEADER_HEIGHT,
        left: 0,
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        overflowY: "auto",
      }}
    >
      <h2 style={{ marginBottom: "30px" }}>Menu</h2>

      {menuItems.map((item) => (
        <Link key={item.path} to={item.path} style={linkStyle}>
          {item.name}
        </Link>
      ))}
    </div>
  );
}

const linkStyle = {
  color: "#fff",
  textDecoration: "none",
  marginBottom: "15px",
};
