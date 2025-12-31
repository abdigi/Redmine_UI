import React, { useEffect, useState } from "react";
import { getIssuesAssignedToMe, updateIssue, getCurrentUser } from "../api/redmineApi";

export default function ProgressPage() {
  const [issues, setIssues] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const today = new Date();

  useEffect(() => {
    async function load() {
      const user = await getCurrentUser();
      setCurrentUser(user);

      const data = await getIssuesAssignedToMe();

      // Filter issues to only those assigned to current user's full name
      const fullName = user.firstname && user.lastname ? `${user.firstname} ${user.lastname}` : user.login;
      const filteredIssues = data.filter(
        (issue) => issue.assigned_to && issue.assigned_to.name === fullName
      );

      setIssues(filteredIssues);
    }
    load();
  }, []);

  const getCustomField = (issue, fieldName) => {
    if (!issue.custom_fields) return "";
    let field = issue.custom_fields.find((f) => f.name === fieldName);
    if (!field) {
      field = issue.custom_fields.find((f) =>
        f.name.includes(fieldName.replace(/\d/, ""))
      );
    }
    if (!field || field.value == null) return "";
    if (typeof field.value === "object") return JSON.stringify(field.value);
    return String(field.value);
  };

  const customFieldNames = [
    "የዓመቱ እቅድ",
    "1ኛ ሩብዓመት",
    "2ኛ ሩብዓመት",
    "3ኛ ሩብዓመት",
    "4ኛ ሩብዓመት",
  ];

  const getFiscalYear = (date) => {
    const d = new Date(date);
    const fyStart = new Date(`${d.getFullYear()}-07-08`);
    return d >= fyStart ? d.getFullYear() : d.getFullYear() - 1;
  };

  const getQuarterDateRange = (quarterName, fy) => {
    switch (quarterName) {
      case "1ኛ ሩብዓመት":
        return [new Date(`${fy}-07-08`), new Date(`${fy}-10-07`)];
      case "2ኛ ሩብዓመት":
        return [new Date(`${fy}-10-08`), new Date(`${fy + 1}-01-07`)];
      case "3ኛ ሩብዓመት":
        return [new Date(`${fy + 1}-01-08`), new Date(`${fy + 1}-04-07`)];
      case "4ኛ ሩብዓመት":
        return [new Date(`${fy + 1}-04-08`), new Date(`${fy + 1}-07-07`)];
      default:
        return [null, null];
    }
  };

  const isQuarterActive = (quarterName) => {
    const fy = getFiscalYear(today);
    const [qStart, qEnd] = getQuarterDateRange(quarterName, fy);
    return today >= qStart && today <= qEnd;
  };

  const getQuarterProgressRange = (quarterName) => {
    switch (quarterName) {
      case "1ኛ ሩብዓመት":
        return [0, 25];
      case "2ኛ ሩብዓመት":
        return [26, 50];
      case "3ኛ ሩብዓመት":
        return [51, 75];
      case "4ኛ ሩብዓመት":
        return [76, 100];
      default:
        return [0, 0];
    }
  };

  const getDropdownOptions = (min, max) => {
    const options = [];
    for (let p = min; p <= max; p++) options.push(p);
    return options;
  };

  const handleProgressChange = async (issueId, newValue) => {
    setIssues((prev) =>
      prev.map((i) => (i.id === issueId ? { ...i, done_ratio: newValue } : i))
    );
    await updateIssue(issueId, { done_ratio: newValue });
  };

  const mapToQuarterRange = (quarterName, value) => {
    const [min, max] = getQuarterProgressRange(quarterName);
    return Math.round(min + ((max - min) * value) / 100);
  };

  const mapFromQuarterRange = (quarterName, doneRatio) => {
    const [min, max] = getQuarterProgressRange(quarterName);
    if (max === min) return 0;
    return Math.round(((doneRatio - min) / (max - min)) * 100);
  };

  const tableStyle = {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: "0",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    borderRadius: "10px",
    overflow: "hidden",
  };

  const thStyle = {
    backgroundColor: "#4CAF50",
    color: "white",
    padding: "12px",
    textAlign: "center",
  };

  const tdStyle = {
    padding: "12px",
    textAlign: "center",
    borderBottom: "1px solid #ddd",
  };

  const trHoverStyle = {
    transition: "background 0.3s",
  };

  return (
    <div
      style={{
        padding: "30px",
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      }}
    >
      <h1 style={{ textAlign: "center", marginBottom: "25px", color: "#333" }}>
        Quarterly Progress
      </h1>

      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={{ ...thStyle, borderTopLeftRadius: "10px" }}>Subject</th>
              {customFieldNames.map((name, idx) => (
                <th
                  key={name}
                  style={{
                    ...thStyle,
                    borderTopRightRadius:
                      idx === customFieldNames.length - 1 ? "10px" : "0",
                  }}
                >
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {issues.map((issue, idx) => (
              <tr
                key={issue.id}
                style={{
                  backgroundColor: idx % 2 === 0 ? "#f9f9f9" : "#fff",
                  ...trHoverStyle,
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = "#e8f5e9")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor =
                    idx % 2 === 0 ? "#f9f9f9" : "#fff")
                }
              >
                <td style={tdStyle}>{issue.subject}</td>

                {customFieldNames.map((name) => {
                  const val = getCustomField(issue, name);
                  const editable =
                    name !== "የዓመቱ እቅድ" && val !== "" && val !== "0" && isQuarterActive(name);

                  return (
                    <td key={name} style={tdStyle}>
                      <div>{val}</div>

                      {editable ? (
                        <select
                          style={{
                            marginTop: "6px",
                            padding: "6px",
                            borderRadius: "5px",
                            border: "1px solid #ccc",
                            outline: "none",
                            cursor: "pointer",
                          }}
                          value={mapFromQuarterRange(name, issue.done_ratio || 0)}
                          onChange={(e) => {
                            const newDoneRatio = mapToQuarterRange(
                              name,
                              Number(e.target.value)
                            );
                            handleProgressChange(issue.id, newDoneRatio);
                          }}
                        >
                          {getDropdownOptions(0, 100).map((p) => (
                            <option key={p} value={p}>
                              {p}%
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
