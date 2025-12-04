import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "../styles.css";

async function loginToRedmine(username, password) {
  try {
    const res = await axios.get(
      "/users/current.json?include=memberships",
      { auth: { username, password } }
    );
    return { success: true, data: res.data.user };
  } catch (err) {
    console.log("Login error:", err);
    return { success: false, error: "Invalid username or password" };
  }
}

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();

    const result = await loginToRedmine(username, password);

    if (!result.success) {
      setError(result.error);
      return;
    }

    const userData = result.data;

    // Save user data (optional)
    localStorage.setItem("redmine_user", JSON.stringify(userData));

    // Extract all roles
    const memberships = userData.memberships || [];
    let roleNames = new Set();
    memberships.forEach((membership) => {
      membership.roles.forEach((role) => roleNames.add(role.name));
    });
    const roles = Array.from(roleNames);

    // Routing
    if (roles.includes("Team Leaders") || roles.includes("Executives")) {
      navigate("/master-dashboard");
    }  else {
      navigate("/dashboard");
    }
  };

  const inputStyle = {
    display: "block",
    margin: "10px auto",
    padding: "10px",
    width: "80%",
    fontSize: "14px",
    borderRadius: "6px",
    border: "1px solid #ccc",
    textAlign: "center",
  };

  return (
    <div className="container">
      <div className="form-box">
        <h1 style={{ textAlign: "center", marginBottom: "20px", color: "#2E7D32" }}>
          Ministry of Agriculture Plan & Report Tracker
        </h1>
        <h2 style={{ textAlign: "center", marginBottom: "20px" }}>Redmine Login</h2>

        <form onSubmit={handleLogin} autoComplete="on">
          <input
            type="text"
            name="username"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            style={inputStyle}
            autoComplete="username"
          />
          <input
            type="password"
            name="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={inputStyle}
            autoComplete="current-password"
          />

          {error && <p className="error" style={{ textAlign: "center" }}>{error}</p>}

          <button
            type="submit"
            style={{
              display: "block",
              margin: "20px auto 0 auto",
              padding: "10px 30px",
              backgroundColor: "#2E7D32",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "16px",
              width: "150px",
            }}
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );
}
