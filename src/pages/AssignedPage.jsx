import React, { useState, useEffect } from "react";
import SubIssueSelector from "../components/SubIssueSelector";
import { getIssue, updateIssue, getProjectMembers } from "../api/redmineApi";

export default function EditSubtaskAssignment() {
  const [issueId, setIssueId] = useState("");
  const [issue, setIssue] = useState(null);
  const [assignedToId, setAssignedToId] = useState("");
  const [users, setUsers] = useState([]);

  useEffect(() => {
    async function loadData() {
      if (!issueId) return;

      const data = await getIssue(issueId);
      if (data) {
        setIssue(data);
        setAssignedToId(data.assigned_to?.id || "");

        const projectUsers = await getProjectMembers(data.project.id);
        setUsers(projectUsers);
      }
    }

    loadData();
  }, [issueId]);

  const handleSave = async () => {
    if (!issueId) return;

    const result = await updateIssue(issueId, { assigned_to_id: assignedToId });
    if (result.success) alert("Assignment updated!");
    else alert("Failed to update assignment");
  };

  return (
    <div style={{ padding: "20px" }}>

      <h2 style={{ textAlign: "center", marginBottom: "20px" }}>
        Edit Subtask Assignment
      </h2>

      {/* MAIN LAYOUT: LEFT selector + RIGHT form */}
      <div style={{ display: "flex", gap: "20px" }}>

        {/* LEFT SIDE: SubIssueSelector */}
        <div style={{ flex: "1", maxWidth: "250px" }}>
          <SubIssueSelector onSelect={setIssueId} />
        </div>

        {/* RIGHT SIDE: Form */}
        <div style={{ flex: "2" }}>
          {issue && (
            <div
              style={{
                padding: "15px",
                background: "#fff",
                borderRadius: "8px",
                boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
              }}
            >
              {/* Subject (read-only) */}
              <div style={{ marginBottom: "15px" }}>
                <label className="field-label">Subtask Subject</label>
                <input
                  type="text"
                  value={issue.subject}
                  readOnly
                  className="field-input"
                />
              </div>

              {/* Assigned To Dropdown */}
              <div style={{ marginBottom: "15px" }}>
                <label className="field-label">Assigned To</label>
                <select
                  value={assignedToId || ""}
                  onChange={(e) => setAssignedToId(e.target.value)}
                  className="field-input"
                >
                  <option value="">Select</option>
                  {users.map((u) => (
                    <option
                      key={u.id}
                      value={u.id}
                      style={{
                        fontWeight: u.isGroup ? "bold" : "normal",
                        color: u.isGroup ? "#0a58ca" : "#000",
                      }}
                    >
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleSave}
                style={{
                  padding: "10px 20px",
                  background: "green",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  width: "100%",
                  fontSize: "15px",
                }}
              >
                Save
              </button>

             <style>
        {`
          .field-label {
            font-size: 13px;
            font-weight: 600;
            display: block;
            margin-bottom: 4px;
            color: #444;
          }
          .field-input {
            width: 100%;
            padding: 6px 8px;
            font-size: 13px;
            border: 1px solid #ccc;
            border-radius: 6px;
            background: #fafafa;
          }
          .field-input:focus {
            border-color: #4caf50;
            outline: none;
            background: #fff;
          }
        `}
      </style>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
