import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import "./Sidebar.css";

export const SIDEBAR_WIDTH_CONST = 260;
const HEADER_HEIGHT = 60;

// Icons as React components
const Icons = {
  Dashboard: ({ active }) => (
    <svg className={`icon ${active ? 'active' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1h3a1 1 0 001-1V10" />
    </svg>
  ),
  Status: ({ active }) => (
    <svg className={`icon ${active ? 'active' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22" />
    </svg>
  ),
  Task: ({ active }) => (
    <svg className={`icon ${active ? 'active' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  ),
  Progress: ({ active }) => (
    <svg className={`icon ${active ? 'active' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 00-1.3-3.2 4.2 4.2 0 00-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 00-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 00-.1 3.2A4.6 4.6 0 004 10.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />
    </svg>
  ),
  Edit: ({ active }) => (
    <svg className={`icon ${active ? 'active' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  ),
  Logout: ({ active }) => (
    <svg className={`icon ${active ? 'active' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  ),
  Settings: ({ active }) => (
    <svg className={`icon ${active ? 'active' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
  User: ({ active }) => (
    <svg className={`icon ${active ? 'active' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Chart: ({ active }) => (
    <svg className={`icon ${active ? 'active' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 20V10M12 20V4M6 20v-6" />
    </svg>
  ),
  Briefcase: ({ active }) => (
    <svg className={`icon ${active ? 'active' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
    </svg>
  ),
  Target: ({ active }) => (
    <svg className={`icon ${active ? 'active' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),
  ChevronRight: ({ active }) => (
    <svg className={`icon chevron ${active ? 'active' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
};

export default function Sidebar() {
  const [role, setRole] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [activeItem, setActiveItem] = useState("");
  const location = useLocation();

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
      else setRole("User");
    } else {
      setRole("User");
    }
  }, []);

  // Update active item based on current route
  useEffect(() => {
    const currentPath = location.pathname;
    setActiveItem(currentPath);
  }, [location]);

  // Define menu items with icons based on role
  let menuItems = [];

  if (role === "Team Leaders") {
    menuItems = [
      { name: "Dashboard", path: "/teamleader-dashboard", icon: Icons.Dashboard },
      { name: "Personal Plan", path: "/personal-plan-management", icon: Icons.Task },
      
    ];
  } else if (role === "Executives") {
    menuItems = [
      { name: "Dashboard", path: "/master-dashboard", icon: Icons.Dashboard },
      
    ];
  } else if (role === "Chief Executives" || role === "State Ministers") {
    menuItems = [
      { name: "Dashboard", path: "/state-minister-dashboard", icon: Icons.Dashboard },
      
    ];
  } else {
    // default for other roles
    menuItems = [
      { name: "Dashboard", path: "/dashboard", icon: Icons.Dashboard },
      { name: "Personal Plan", path: "/personal-plan-management", icon: Icons.Task },
      
      { name: "Progress", path: "/progress-page", icon: Icons.Progress },
    ];
  }

  // Add logout item
  menuItems.push({ name: "Logout", path: "/logout", icon: Icons.Logout });

  const handleLogout = () => {
    localStorage.removeItem("redmine_user");
    window.location.href = "/";
  };

  const sidebarWidth = collapsed ? 80 : SIDEBAR_WIDTH_CONST;

  return (
    <div className="sidebar-container" style={{ width: sidebarWidth }}>
      <div className="sidebar">
        {/* Sidebar Header */}
        <div className="sidebar-header">
          {!collapsed && (
            <div className="user-info">
              <div className="user-avatar">
                <Icons.User active={false} />
              </div>
              <div className="user-details">
                <h3 className="user-name">{role}</h3>
                <p className="user-role">Ministry User</p>
              </div>
            </div>
          )}
          {collapsed && (
            <div className="collapsed-avatar">
              <Icons.User active={false} />
            </div>
          )}
          <button 
            className="collapse-toggle"
            onClick={() => setCollapsed(!collapsed)}
          >
            <Icons.ChevronRight active={collapsed} />
          </button>
        </div>

        {/* Navigation Menu */}
        <nav className="sidebar-nav">
          {menuItems.map((item) => {
            const isActive = activeItem === item.path;
            const IconComponent = item.icon;
            
            if (item.name === "Logout") {
              return (
                <button
                  key={item.path}
                  className={`nav-item logout-btn ${isActive ? 'active' : ''}`}
                  onClick={handleLogout}
                >
                  <div className="nav-icon">
                    <IconComponent active={isActive} />
                  </div>
                  {!collapsed && <span className="nav-label">{item.name}</span>}
                  {!collapsed && isActive && <div className="active-indicator"></div>}
                </button>
              );
            }

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setActiveItem(item.path)}
              >
                <div className="nav-icon">
                  <IconComponent active={isActive} />
                </div>
                {!collapsed && <span className="nav-label">{item.name}</span>}
                {!collapsed && isActive && <div className="active-indicator"></div>}
                {!collapsed && !isActive && (
                  <Icons.ChevronRight active={false} />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        {!collapsed && (
          <div className="sidebar-footer">
            <div className="ministry-badge">
             
              <div className="badge-text">
                <span className="ministry-name">Ministry of</span>
                <span className="ministry-dept">Agriculture</span>
              </div>
            </div>
            <div className="version-info">v2.0.1</div>
          </div>
        )}
        
        {collapsed && (
          <div className="collapsed-footer">
            
          </div>
        )}
      </div>
    </div>
  );
}