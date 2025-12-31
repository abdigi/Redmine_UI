import React, { useState, useEffect } from "react";
import {
  getProjects,
  getCurrentUser,
  getUsersInGroup,
  getIssuesAssigned,
} from "../api/redmineApi";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LabelList,
} from "recharts";

export default function MasterDashboard() {
  const [projects, setProjects] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [myGroupUsers, setMyGroupUsers] = useState([]);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [issues, setIssues] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState("Yearly");

  // Load projects (optional)
  useEffect(() => {
    async function loadProjects() {
      const data = await getProjects();
      setProjects(data);
    }
    loadProjects();
  }, []);

  // Load current user
  useEffect(() => {
    async function loadUser() {
      const user = await getCurrentUser();
      setCurrentUser(user);
    }
    loadUser();
  }, []);

  // Load all users in the group that matches current username
  useEffect(() => {
    async function loadGroupUsers() {
      if (!currentUser) return;
      const users = await getUsersInGroup(currentUser.login);
      setMyGroupUsers(users || []);
    }
    loadGroupUsers();
  }, [currentUser]);

  // Load issues for selected member
  useEffect(() => {
    async function loadIssues() {
      if (!selectedMemberId) {
        setIssues([]);
        return;
      }
      const data = await getIssuesAssigned(selectedMemberId);
      setIssues(data || []);
    }
    loadIssues();
  }, [selectedMemberId]);

  // Map progress by period
  const mapProgress = (done, period) => {
    if (period === "Yearly") return done;
    if (period === "6 Months") return done <= 50 ? Math.round((done / 50) * 100) : 100;
    if (period === "9 Months") return done <= 75 ? Math.round((done / 75) * 100) : 100;

    switch (period) {
      case "1ኛ ሩብዓመት":
        return done <= 25 ? Math.round((done / 25) * 100) : 100;
      case "2ኛ ሩብዓመት":
        return done >= 26 && done <= 50
          ? Math.round(((done - 26) / 24) * 100)
          : done > 50
          ? 100
          : 0;
      case "3ኛ ሩብዓመት":
        return done >= 51 && done <= 75
          ? Math.round(((done - 51) / 24) * 100)
          : done > 75
          ? 100
          : 0;
      case "4ኛ ሩብዓመት":
        return done >= 76 && done <= 100
          ? Math.round(((done - 76) / 24) * 100)
          : done === 100
          ? 100
          : 0;
      default:
        return 0;
    }
  };

  // Filter issues by period
  const filteredIssues = issues.filter((issue) => {
    if (selectedPeriod === "Yearly") return true;

    const getField = (q) => issue.custom_fields?.find((f) => f.name === q)?.value;

    if (selectedPeriod === "6 Months") {
      return getField("1ኛ ሩብዓመት") || getField("2ኛ ሩብዓመት");
    }

    if (selectedPeriod === "9 Months") {
      return getField("1ኛ ሩብዓመት") || getField("2ኛ ሩብዓመት") || getField("3ኛ ሩብዓመት");
    }

    const val = getField(selectedPeriod);
    return val && val !== "0" && val !== "";
  });

  // Weighted overall progress
  const overallProgress = (() => {
    let totalWeight = 0;
    let weightedProgress = 0;

    filteredIssues.forEach((issue) => {
      const weight = Number(issue.custom_fields?.find((f) => f.name === "ክብደት")?.value) || 1;
      const progress = mapProgress(issue.done_ratio, selectedPeriod);
      totalWeight += weight;
      weightedProgress += progress * weight;
    });

    return totalWeight > 0 ? Math.round(weightedProgress / totalWeight) : 0;
  })();

  // Chart data for individual issues
  const chartData = filteredIssues.map((issue) => ({
    name: issue.subject,
    progress: mapProgress(issue.done_ratio, selectedPeriod),
    status: issue.status?.name,
  }));

  return (
    <div style={{ padding: "20px" }}>
      <h1>My Dashboard</h1>

      {/* User Filter */}
      <div style={{ marginBottom: "20px" }}>
        <label>
          Select User:{" "}
          <select
            value={selectedMemberId}
            onChange={(e) => setSelectedMemberId(e.target.value)}
            style={{ padding: "5px" }}
          >
            <option value="">-- Select User --</option>
            {myGroupUsers.map((user) => {
              const displayName = user.firstname && user.lastname
                ? `${user.firstname} ${user.lastname}`
                : user.name || user.login || `User ${user.id}`;
              return (
                <option key={user.id} value={user.id}>
                  {displayName}
                </option>
              );
            })}
          </select>
        </label>
      </div>

      {/* Period Filter */}
      <div style={{ marginBottom: "20px" }}>
        <label>
          Select Period:{" "}
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
          >
            <option value="Yearly">Yearly</option>
            <option>1ኛ ሩብዓመት</option>
            <option>2ኛ ሩብዓመት</option>
            <option>3ኛ ሩብዓመት</option>
            <option>4ኛ ሩብዓመት</option>
            <option value="6 Months">6 Months</option>
            <option value="9 Months">9 Months</option>
          </select>
        </label>
      </div>

      {/* Weighted Overall Performance */}
      {selectedMemberId && (
        <div style={{ marginBottom: "20px" }}>
          <div style={{ fontWeight: "bold", fontSize: "16px", marginBottom: "10px" }}>
            Total Issues: {issues.length} — Weighted Overall Performance: {overallProgress}%
          </div>

          <div
            style={{
              width: "100%",
              backgroundColor: "#e0e0e0",
              borderRadius: "8px",
              overflow: "hidden",
              height: "25px",
            }}
          >
            <div
              style={{
                width: `${overallProgress}%`,
                backgroundColor: "#4CAF50",
                height: "100%",
                textAlign: "center",
                color: "#fff",
                fontWeight: "bold",
                lineHeight: "25px",
              }}
            >
              {overallProgress}%
            </div>
          </div>
        </div>
      )}

      {/* Per-Issue Chart */}
      <div style={{ height: Math.max(300, filteredIssues.length * 55), marginBottom: "20px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 20, right: 40, left: 250, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <YAxis
              type="category"
              dataKey="name"
              width={250}
              tick={({ x, y, payload }) => {
                const text = payload.value.length > 30 ? payload.value.slice(0, 27) + "..." : payload.value;
                return (
                  <text x={x} y={y + 5} textAnchor="end" fontSize={12} fontWeight="bold">
                    {text}
                  </text>
                );
              }}
            />
            <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => v + "%"} />
            <Tooltip
              formatter={(value, name, props) => [
                `${value}% — Status: ${props.payload.status}`,
                "Progress",
              ]}
            />
            <Bar dataKey="progress" fill="#4CAF50" barSize={25}>
              <LabelList
                dataKey="progress"
                position="right"
                formatter={(v) => `${v}%`}
                style={{ fill: "#000", fontSize: 12, fontWeight: "bold" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
