import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "../styles.css";
import "./Login.css"; // Import the new CSS file

// 🔐 Login to Redmine using Basic Auth
async function loginToRedmine(username, password) {
  try {
    const res = await axios.get(
      "/users/current.json?include=memberships",
      {
        auth: { username, password },
      }
    );

    return { success: true, data: res.data.user };
  } catch (err) {
    console.log("Login error:", err);
    return { success: false, error: "Invalid username or password" };
  }
}

// 🔎 Role helper
function hasRole(roles, keywords) {
  return roles.some(role =>
    keywords.some(k => role.includes(k))
  );
}

export default function Login() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await loginToRedmine(username, password);

    if (!result.success) {
      setError(result.error);
      setLoading(false);
      return;
    }

    const userData = result.data;

    // 💾 Save user
    localStorage.setItem("redmine_user", JSON.stringify(userData));

    // 🧠 Extract roles
    const roleSet = new Set();
    (userData.memberships || []).forEach(m =>
      (m.roles || []).forEach(r =>
        roleSet.add(r.name.toLowerCase())
      )
    );

    const roles = Array.from(roleSet);

    // 🚦 Role-based navigation
    if (hasRole(roles, ["state minister"])) {
      navigate("/state-minister-dashboard");
    } else if (hasRole(roles, ["team leader"])) {
      navigate("/teamleader-dashboard");
    } else if (hasRole(roles, ["executive"])) {
      navigate("/lead-executive-dashboard");
    } else {
      navigate("/dashboard");
    }

    setLoading(false);
  };

  return (
    <div className="login-container">
      <div className="login-form-box">
        <div className="login-header">
          <div className="ministry-logo">
            <span className="logo-icon">🌱</span>
            <h1>Ministry of Agriculture</h1>
          </div>
          <h2>Plan & Report Tracker</h2>
        </div>

        <div className="login-card">
          <div className="login-card-header">
            <h3>Redmine Login</h3>
            <p className="login-subtitle">Sign in to access your dashboard</p>
          </div>

          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <div className="input-with-icon">
                <span className="input-icon">👤</span>
                <input
                  type="text"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  disabled={loading}
                  className="login-input"
                />
              </div>
            </div>

            <div className="form-group">
              <div className="input-with-icon">
                <span className="input-icon">🔒</span>
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="login-input"
                />
              </div>
            </div>

            {error && (
              <div className="error-message">
                <span className="error-icon">⚠</span>
                <span className="error-text">{error}</span>
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading}
              className={`login-button ${loading ? 'loading' : ''}`}
            >
              {loading ? (
                <>
                  <span className="loading-spinner"></span>
                  Logging in...
                </>
              ) : (
                'Login'
              )}
            </button>

            <div className="login-footer">
              <p className="help-text">
                Having trouble? Contact your system administrator
              </p>
              <div className="version-info">
                <span>v2.0.1</span>
                <span>•</span>
                <span>Secure Login</span>
              </div>
            </div>
          </form>
        </div>

        <div className="login-decorative">
          <div className="decorative-element decorative-1"></div>
          <div className="decorative-element decorative-2"></div>
          <div className="decorative-element decorative-3"></div>
        </div>
      </div>
    </div>
  );
}