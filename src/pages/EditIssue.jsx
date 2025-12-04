import React, { useState, useEffect } from "react";
import IssueSelector from "../components/IssueSelector";
import {
  getIssue,
  updateIssue,
  getProjectMembers,
  getTrackers
  // ❌ getStatuses removed
} from "../api/redmineApi";

export default function EditIssue() {
  const [issueId, setIssueId] = useState("");
  const [issue, setIssue] = useState(null);

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [statusId, setStatusId] = useState("");
  const [priorityId] = useState(""); 
  const [assignedToId, setAssignedToId] = useState("");
  const [trackerId, setTrackerId] = useState("");
  const [customFields, setCustomFields] = useState([]);
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [users, setUsers] = useState([]);
  const [statuses, setStatuses] = useState([]); // now using allowed_statuses
  const [trackers, setTrackers] = useState([]);

  useEffect(() => {
    async function loadData() {
      if (!issueId) return;

      // Load issue (must include allowed_statuses)
      const data = await getIssue(issueId);

      if (data) {
        setIssue(data);
        setSubject(data.subject);
        setDescription(data.description || "");
        setStatusId(data.status?.id || "");
        setAssignedToId(data.assigned_to?.id || "");
        setTrackerId(data.tracker?.id || "");
        setStartDate(data.start_date || "");
        setDueDate(data.due_date || "");

        setCustomFields(
          data.custom_fields.map(cf => ({
            id: cf.id,
            name: cf.name,
            value: cf.value || ""
          }))
        );

        // 🔥 Use workflow-filtered statuses
        setStatuses(data.allowed_statuses || []);

        // Load users
        const projectUsers = await getProjectMembers(data.project.id);
        setUsers(projectUsers);
      }

      // Trackers still allowed
      setTrackers(await getTrackers());
    }

    loadData();
  }, [issueId]);

  const handleSave = async () => {
    if (!issueId) return;

    const payload = {
      subject,
      description,
      status_id: statusId,
      assigned_to_id: assignedToId,
      tracker_id: trackerId,
      start_date: startDate,
      due_date: dueDate,
      custom_fields: customFields.map(f => ({
        id: f.id,
        value: f.value
      }))
    };

    const result = await updateIssue(issueId, payload);
    if (result.success) alert("Issue updated!");
    else alert("Failed to update issue");
  };

  return (
    <div style={{ padding: "20px" }}>
      <h1>Edit Issue</h1>

      <IssueSelector onSelect={setIssueId} />

      {issue && (
        <div
          style={{
            marginTop: "20px",
            maxWidth: "700px",
            marginLeft: "auto",
            marginRight: "auto",
            padding: "20px",
            background: "#fff",
            borderRadius: "10px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.1)"
          }}
        >
          <h2 style={{ fontSize: "20px", marginBottom: "10px" }}>
            {issue.subject}
          </h2>

          {/* GRID FORM */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "15px"
            }}
          >
            {/* Subject */}
            <div style={{ gridColumn: "span 2" }}>
              <label className="field-label">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="field-input"
              />
            </div>

            {/* Tracker */}
            <div>
              <label className="field-label">Tracker</label>
              <select
                value={trackerId}
                onChange={e => setTrackerId(e.target.value)}
                className="field-input"
              >
                <option value="">Select</option>
                {trackers.map(t => (
                  <option value={t.id} key={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Status - NOW ONLY USER ALLOWED STATUSES */}
            <div>
              <label className="field-label">Status</label>
              <select
                value={statusId}
                onChange={e => setStatusId(e.target.value)}
                className="field-input"
              >
                <option value="">Select</option>
                {statuses.map(s => (
                  <option value={s.id} key={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Assigned to */}
            <div>
              <label className="field-label">Assigned To</label>
              <select
                value={assignedToId}
                onChange={e => setAssignedToId(e.target.value)}
                className="field-input"
              >
                <option value="">Select</option>
                {users.map(u => (
                  <option
                    key={u.id}
                    value={u.id}
                    style={{
                      fontWeight: u.isGroup ? "bold" : "normal",
                      color: u.isGroup ? "#0a58ca" : "#000"
                    }}
                  >
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Start Date */}
            <div>
              <label className="field-label">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="field-input"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="field-label">End Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="field-input"
              />
            </div>
          </div>

          {/* Description */}
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

          {/* Custom fields */}
          {customFields.map((cf, i) => (
            <div key={cf.id} style={{ marginTop: "15px" }}>
              <label className="field-label">{cf.name}</label>
              <input
                type="text"
                value={cf.value}
                onChange={e => {
                  const copy = [...customFields];
                  copy[i].value = e.target.value;
                  setCustomFields(copy);
                }}
                className="field-input"
              />
            </div>
          ))}

          <button
            onClick={handleSave}
            style={{
              marginTop: "20px",
              padding: "10px 20px",
              background: "green",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              width: "100%",
              fontSize: "16px"
            }}
          >
            Save Changes
          </button>

        </div>
      )}
    </div>
  );
}
