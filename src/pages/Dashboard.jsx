import React, { useEffect, useState } from "react";
import { getIssuesAssignedToMe } from "../api/redmineApi";

export default function Dashboard() {
  const [issues, setIssues] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState("Yearly");

  useEffect(() => {
    async function loadIssues() {
      const data = await getIssuesAssignedToMe();
      setIssues(data);
    }
    loadIssues();
  }, []);

  // Map progress depending on period (Yearly = raw 0-100)
  const mapProgress = (done, period) => {
    if (period === "Yearly") return done; // ✔ Return original progress

    switch (period) {
      case "1ኛ ሩብዓመት":
        return done <= 25 ? Math.round((done / 25) * 100) : 100;
      case "2ኛ ሩብዓመት":
        return done >= 26 && done <= 50 ? Math.round(((done - 26) / 24) * 100) : done > 50 ? 100 : 0;
      case "3ኛ ሩብዓመት":
        return done >= 51 && done <= 75 ? Math.round(((done - 51) / 24) * 100) : done > 75 ? 100 : 0;
      case "4ኛ ሩብዓመት":
        return done >= 76 && done <= 100 ? Math.round(((done - 76) / 24) * 100) : done === 100 ? 100 : 0;
      default:
        return 0;
    }
  };

  // Filter issues based on selected period
  const filteredIssues = issues.filter((issue) => {
    if (selectedPeriod === "Yearly") return true; // ✔ Show all tasks
    const val = issue.custom_fields?.find(f => f.name === selectedPeriod)?.value;
    return val && val !== "0" && val !== "";
  });

  // Calculate weighted overall performance
  const overallProgress = (() => {
    let totalWeight = 0;
    let weightedProgress = 0;

    filteredIssues.forEach((issue) => {
      const weight = Number(issue.custom_fields?.find(f => f.name === "ክብደት")?.value) || 1;
      const doneRatio = Number(issue.done_ratio) || 0;

      const progress = mapProgress(doneRatio, selectedPeriod);

      totalWeight += weight;
      weightedProgress += progress * weight;
    });

    return totalWeight > 0 ? Math.round(weightedProgress / totalWeight) : 0;
  })();

  return (
    <div style={{ padding: "20px" }}>
      <h1>My Issues Dashboard</h1>

      {/* Overall Progress */}
      <div style={{ marginBottom: "30px" }}>
        <h2>Overall Performance — {overallProgress}%</h2>

        <div
          style={{
            width: "100%",
            height: "25px",
            background: "#e0e0e0",
            borderRadius: "12px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${overallProgress}%`,
              height: "100%",
              background: "#4caf50",
              transition: "width 0.3s",
            }}
          ></div>
        </div>
      </div>

      {/* Select Period */}
      <div style={{ marginBottom: "20px" }}>
        <label>
          Select Period:{" "}
          <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}>
            <option value="Yearly">Yearly (Annual)</option>
            <option>1ኛ ሩብዓመት</option>
            <option>2ኛ ሩብዓመት</option>
            <option>3ኛ ሩብዓመት</option>
            <option>4ኛ ሩብዓመት</option>
          </select>
        </label>
      </div>

      {/* Task Cards */}
      <div
        style={{
          display: "grid",
          gap: "15px",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        }}
      >
        {filteredIssues.map((issue) => {
          const doneRatio = Number(issue.done_ratio) || 0;
          const progress = mapProgress(doneRatio, selectedPeriod);

          return (
            <div
              key={issue.id}
              style={{
                border: "1px solid #ccc",
                borderRadius: "8px",
                padding: "12px",
                background: "#fafafa",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                display: "flex",
                flexDirection: "column",
                minHeight: "130px",
              }}
            >
              <div style={{ flexGrow: 1 }}>
                <h3 style={{ fontSize: "16px", margin: "0 0 5px", wordBreak: "break-word" }}>
                  {issue.subject}
                </h3>

                <p style={{ fontSize: "12px", margin: "0 0 5px", color: "#555" }}>
                  Status: {issue.status?.name}
                </p>

                {selectedPeriod === "Yearly" && (
                  <p style={{ fontSize: "12px", color: "#333" }}>
                    Annual Progress: {doneRatio}%
                  </p>
                )}
              </div>

              {/* Progress Bar */}
              <div>
                <div
                  style={{
                    width: "100%",
                    height: "12px",
                    background: "#e0e0e0",
                    borderRadius: "6px",
                    overflow: "hidden",
                    marginTop: "5px",
                  }}
                >
                  <div
                    style={{
                      width: `${progress}%`,
                      height: "100%",
                      background: "#4caf50",
                      transition: "width 0.3s",
                    }}
                  ></div>
                </div>

                <p style={{ textAlign: "right", marginTop: "5px", fontSize: "12px" }}>
                  {progress}%
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
