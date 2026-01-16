import React, { useState } from "react";
import { getProjectIssues } from "../api/redmineApi";
import MainIssue from "./MainIssue";

export default function Goal({ project }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mainIssues, setMainIssues] = useState([]);
  const [subIssuesMap, setSubIssuesMap] = useState({});

  const loadIssues = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }

    setLoading(true);

    try {
      const issues = await getProjectIssues({ project_id: project.id });

      const mains = [];
      const subs = {};

      issues.forEach((issue) => {
        const trackerName = issue.tracker?.name?.toLowerCase() || "";

        // ✅ FILTER: only top-level, no version, no roadmap/milestone/version
        if (
          issue.parent ||
          issue.fixed_version ||
          ["version", "milestone", "release", "roadmap"].includes(trackerName)
        )
          return;

        mains.push(issue);
      });

      // collect sub-issues (optional)
      issues.forEach((issue) => {
        if (issue.parent) {
          if (!subs[issue.parent.id]) subs[issue.parent.id] = [];
          subs[issue.parent.id].push(issue);
        }
      });

      setMainIssues(mains);
      setSubIssuesMap(subs);
      setExpanded(true);
    } catch (err) {
      console.log("Goal load error:", err);
    }

    setLoading(false);
  };

  return (
    <div style={{ marginLeft: "40px", marginTop: "10px" }}>
      <div
        onClick={loadIssues}
        style={{
          cursor: "pointer",
          padding: "8px",
          background: "#E8F5E9",
          borderRadius: "6px",
          fontWeight: "bold",
        }}
      >
        🎯 Goal: {project.name}
        {loading && " (Loading...)"}
      </div>

      {expanded && (
        <div style={{ marginTop: "10px", marginLeft: "20px" }}>
          {mainIssues.length === 0 && (
            <p style={{ color: "#777", fontStyle: "italic" }}>No main issues found.</p>
          )}
          {mainIssues.map((issue) => (
            <MainIssue key={issue.id} issue={issue} subIssues={subIssuesMap[issue.id] || []} />
          ))}
        </div>
      )}
    </div>
  );
}
