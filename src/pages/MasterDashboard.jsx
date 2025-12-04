import React, { useState, useEffect } from "react";
import { getProjectMembers, getIssuesAssigned, getProjects } from "../api/redmineApi";

export default function MasterDashboard() {
  const [members, setMembers] = useState([]);
  const [issues, setIssues] = useState([]);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [projects, setProjects] = useState([]);

  // Load projects on mount
  useEffect(() => {
    async function loadProjects() {
      const data = await getProjects();
      setProjects(data);
    }
    loadProjects();
  }, []);

  // Load members (users + groups)
  useEffect(() => {
    async function loadMembers() {
      if (!projects.length) return;

      let allMembers = [];

      for (let project of projects) {
        const projectMembers = await getProjectMembers(project.id);
        allMembers = [...allMembers, ...projectMembers];
      }

      // Remove duplicates by ID + type (user/group)
      const uniqueMembers = allMembers.filter(
        (v, i, a) =>
          a.findIndex((t) => t.id === v.id && t.isGroup === v.isGroup) === i
      );

      setMembers(uniqueMembers);
    }

    loadMembers();
  }, [projects]);

  // Load issues when selected member changes
  useEffect(() => {
    async function loadIssues() {
      if (!selectedMemberId) {
        setIssues([]);
        return;
      }

      const data = await getIssuesAssigned(selectedMemberId);
      setIssues(data);
    }

    loadIssues();
  }, [selectedMemberId]);

  // Split users and groups
  const users = members.filter((m) => !m.isGroup);
  const groups = members.filter((m) => m.isGroup);

  return (
    <div style={{ padding: "20px" }}>
      <h1>My Dashboard</h1>

      {/* User + Group filter */}
      <div style={{ marginBottom: "20px" }}>
        <label>
          Select User / Group:{" "}
          <select
            value={selectedMemberId}
            onChange={(e) => setSelectedMemberId(e.target.value)}
            style={{ padding: "5px" }}
          >
            <option value="">-- All Users / Groups --</option>

            {users.length > 0 && (
              <optgroup label="Users">
                {users.map((user) => (
                  <option key={`u-${user.id}`} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </optgroup>
            )}

            {groups.length > 0 && (
              <optgroup label="Groups">
                {groups.map((group) => (
                  <option key={`g-${group.id}`} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
      </div>

      {/* Total issues for selected member */}
      {selectedMemberId && (
        <div style={{ marginBottom: "15px", fontWeight: "bold", fontSize: "16px" }}>
          Total Issues: {issues.length}
        </div>
      )}

      {/* Issues display */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "15px" }}>
        {issues.map((issue) => (
          <div
            key={`${issue.project?.id}-${issue.id}`}
            style={{
              width: "250px",
              minHeight: "160px",
              border: "1px solid #ccc",
              borderRadius: "6px",
              padding: "10px",
              background: "#f5f5f5",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            {/* Top: title & description */}
            <div>
              <h4 style={{ margin: "0 0 10px 0" }}>{issue.subject}</h4>
              <p>{issue.description?.slice(0, 50)}...</p>
            </div>

            {/* Bottom: status & progress */}
            <div>
              <p style={{ margin: "5px 0", fontWeight: "bold" }}>
                Status: {issue.status?.name}
              </p>

              {/* Progress Bar */}
              <div style={{ margin: "5px 0" }}>
                <div
                  style={{
                    height: "12px",
                    width: "100%",
                    backgroundColor: "#ddd",
                    borderRadius: "6px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${issue.done_ratio}%`,
                      backgroundColor:
                        issue.done_ratio === 100 ? "#4caf50" : "#2196f3",
                      transition: "width 0.3s ease-in-out",
                    }}
                  />
                </div>
                <small>{issue.done_ratio}% Complete</small>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
