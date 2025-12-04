import React, { useState, useEffect } from "react";
import IssueSelector from "../components/IssueSelector";
import {
  getIssue,
  getTrackers,
  getProjectMembers,
  createIssue
} from "../api/redmineApi";

export default function AddSubIssue() {
  const [parentId, setParentId] = useState("");
  const [parentIssue, setParentIssue] = useState(null);

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [trackerId, setTrackerId] = useState("");
  const [statusId, setStatusId] = useState("");
  const [priorityId, setPriorityId] = useState("2");
  const [assignedToId, setAssignedToId] = useState("");

  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [customFields, setCustomFields] = useState([]);

  const [statuses, setStatuses] = useState([]);
  const [trackers, setTrackers] = useState([]);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    async function loadData() {
      if (!parentId) return;

      const issue = await getIssue(parentId);
      setParentIssue(issue);

      setStatuses(issue.allowed_statuses || []);
      setTrackers(await getTrackers());
      setUsers(await getProjectMembers(issue.project.id));

      setCustomFields(
        issue.custom_fields.map(cf => ({
          id: cf.id,
          name: cf.name,
          value: ""
        }))
      );
    }

    loadData();
  }, [parentId]);

  const handleSubmit = async () => {
    if (!parentId) return alert("Select a parent issue.");
    if (!subject.trim()) return alert("Subject is required.");

    const payload = {
      project_id: parentIssue.project.id,
      parent_issue_id: parentId,
      subject,
      description,
      tracker_id: trackerId,
      status_id: statusId,
      priority_id: priorityId,
      assigned_to_id: assignedToId,
      start_date: startDate || null,
      due_date: dueDate || null,
      custom_fields: customFields.map(f => ({ id: f.id, value: f.value })),
    };

    const result = await createIssue(payload);

    if (result.success) {
      alert("Sub-issue created!");
      setSubject("");
      setDescription("");
      setTrackerId("");
      setStatusId("");
      setAssignedToId("");
      setStartDate("");
      setDueDate("");
    } else {
      alert("Create failed");
    }
  };

  return (
    <div style={{ padding: "20px" }}>
      <h1>Add Sub-Issue</h1>

      <IssueSelector onSelect={setParentId} />

      {parentIssue && (
        <div
          style={{
            marginTop: "20px",
            maxWidth: "700px",
            marginLeft: "auto",
            marginRight: "auto",
            padding: "20px",
            background: "#fff",
            borderRadius: "10px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
          }}
        >
          <h2 style={{ fontSize: "20px", marginBottom: "5px" }}>
            Parent: {parentIssue.subject}
          </h2>
          <p style={{ fontSize: "13px", color: "#666" }}>
            Project: {parentIssue.project.name}
          </p>

          {/* FORM */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "15px",
              marginTop: "15px",
            }}
          >

            <div style={{ gridColumn: "span 2" }}>
              <label className="field-label">Subject *</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="field-input"
                required
              />
            </div>

            <div>
              <label className="field-label">Tracker</label>
              <select
                value={trackerId}
                onChange={e => setTrackerId(e.target.value)}
                className="field-input"
              >
                <option value="">Select</option>
                {trackers.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label">Status</label>
              <select
                value={statusId}
                onChange={e => setStatusId(e.target.value)}
                className="field-input"
              >
                <option value="">Select</option>
                {statuses.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label">Priority</label>
              <select
                value={priorityId}
                onChange={e => setPriorityId(e.target.value)}
                className="field-input"
              >
                <option value="1">Low</option>
                <option value="2">Normal</option>
                <option value="3">High</option>
                <option value="4">Urgent</option>
                <option value="5">Immediate</option>
              </select>
            </div>

            <div>
              <label className="field-label">Assigned To</label>
              <select
                value={assignedToId}
                onChange={e => setAssignedToId(e.target.value)}
                className="field-input"
              >
                <option value="">Select</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            {/* NEW — Start Date */}
            <div>
              <label className="field-label">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="field-input"
              />
            </div>

            {/* NEW — Due Date */}
            <div>
              <label className="field-label">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="field-input"
              />
            </div>

          </div>

          <div style={{ marginTop: "15px" }}>
            <label className="field-label">Description</label>
            <textarea
              rows="4"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="field-input"
              style={{ resize: "vertical" }}
            />
          </div>

          {/* Custom Fields */}
          {customFields.map((cf, idx) => (
            <div key={cf.id} style={{ marginTop: "15px" }}>
              <label className="field-label">{cf.name}</label>
              <input
                type="text"
                value={cf.value}
                onChange={e => {
                  const copy = [...customFields];
                  copy[idx].value = e.target.value;
                  setCustomFields(copy);
                }}
                className="field-input"
              />
            </div>
          ))}

          <button
            onClick={handleSubmit}
            style={{
              marginTop: "20px",
              padding: "10px 20px",
              background: "green",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              width: "100%",
              fontSize: "16px",
            }}
          >
            Create Sub-Issue
          </button>
        </div>
      )}

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
  );
}
