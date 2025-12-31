import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./Header.css";

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [currentTime, setCurrentTime] = useState("");

  // Check if user is logged in
  useEffect(() => {
    const userData = localStorage.getItem("redmine_user");
    if (userData) {
      try {
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
      } catch (error) {
        console.error("Error parsing user data:", error);
      }
    }

    // Update time every minute
    const updateTime = () => {
      const now = new Date();
      const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      };
      setCurrentTime(now.toLocaleDateString('en-US', options));
    };

    updateTime();
    const intervalId = setInterval(updateTime, 60000);

    return () => clearInterval(intervalId);
  }, []);

  const getUserInitials = () => {
    if (!user || !user.firstname || !user.lastname) return "U";
    return `${user.firstname.charAt(0)}${user.lastname.charAt(0)}`.toUpperCase();
  };

  const getUserFullName = () => {
    if (!user || !user.firstname || !user.lastname) return "User";
    return `${user.firstname} ${user.lastname}`;
  };

  const getUserRole = () => {
    if (!user || !user.memberships) return "Ministry Staff";
    
    const roles = new Set();
    user.memberships.forEach((membership) => {
      membership.roles.forEach((role) => roles.add(role.name));
    });

    const roleArray = Array.from(roles);
    if (roleArray.length > 0) {
      if (roleArray.includes("State Ministers")) return "State Minister";
      if (roleArray.includes("Chief Executives")) return "Chief Executive";
      if (roleArray.includes("Executives")) return "Executive";
      if (roleArray.includes("Team Leaders")) return "Team Leader";
      return roleArray[0];
    }
    
    return "Ministry Staff";
  };

  return (
    <header className="header-container">
      {/* Left Section: Logo and Title */}
      <div className="header-left">
        <div className="ministry-logo-static">
          <span className="logo-icon">🌱</span>
          <div className="logo-text">
            <h1 className="ministry-title">Ministry of Agriculture</h1>
            <p className="ministry-subtitle">Plan & Report Tracker</p>
          </div>
        </div>
      </div>

      {/* Center Section: Current Time and Page Indicator */}
      <div className="header-center">
        <div className="current-time">
          <span className="time-icon">🕐</span>
          <span className="time-text">{currentTime}</span>
        </div>
        {location.pathname !== "/" && location.pathname !== "/login" && (
          <div className="page-indicator">
            <span className="page-name">
              {location.pathname.split('/').pop().replace(/-/g, ' ').toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Right Section: User Info Only */}
      <div className="header-right">
        {user && (
          <div className="user-info-static">
            <div className="user-avatar-static">
              <span className="avatar-initials">{getUserInitials()}</span>
            </div>
            <div className="user-details-static">
              <span className="user-name-static">{getUserFullName()}</span>
              <span className="user-role-static">{getUserRole()}</span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}