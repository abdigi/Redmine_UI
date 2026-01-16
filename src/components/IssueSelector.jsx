import React, { useEffect, useState } from "react";
import { getIssuesAssignedToMe } from "../api/redmineApi";

export default function IssueSelector({ onSelect }) {
  const [issues, setIssues] = useState([]);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    async function load() {
      const data = await getIssuesAssignedToMe();
      setIssues(data);
    }
    load();
  }, []);

  const handleChange = (e) => {
    setSelected(e.target.value);
    onSelect(e.target.value);
  };
 
  return (
    <div style={{ marginBottom: "20px" }}>
      <label>Select Issue:</label>
      <select value={selected} onChange={handleChange} style={{ padding: "10px", width: "100%" }}>
        <option value="">-- Select --</option>
        {issues.map((issue) => (
          <option key={issue.id} value={issue.id}>
            {issue.subject} (#{issue.id})
          </option>
        ))}
      </select>
    </div>
  );
}
