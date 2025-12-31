import React, { useState } from "react";

export default function MainIssue({ issue, subIssues }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginBottom: "10px" }}>
      {/* Main Issue */}
      <div
        onClick={() => setOpen(!open)}
        style={{
          cursor: "pointer",
          padding: "8px",
          background: "#FFFDE7",
          borderRadius: "6px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>📌 {issue.subject}</span>
        <span>{issue.done_ratio}%</span>
      </div>

      {/* Sub Issues */}
      {open && (
        <div style={{ marginLeft: "20px", marginTop: "6px" }}>
          {subIssues.length === 0 && (
            <p style={{ color: "#777" }}>No sub-issues</p>
          )}

          {subIssues.map(sub => (
            <div
              key={sub.id}
              style={{
                padding: "6px",
                background: "#F1F8E9",
                borderRadius: "4px",
                marginBottom: "5px",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>↳ {sub.subject}</span>
              <span>{sub.done_ratio}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
