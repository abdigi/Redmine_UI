import React, { useEffect, useState } from "react";
import { getCurrentUser, getIssuesAssignedToMe } from "../api/redmineApi";
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

export default function Dashboard() {
  const [issues, setIssues] = useState([]);
  const [userFullName, setUserFullName] = useState("");
  const [selectedPeriod, setSelectedPeriod] = useState("Yearly");

  useEffect(() => {
    async function loadIssues() {
      const user = await getCurrentUser();
      if (!user) return;

      const fullName = `${user.firstname} ${user.lastname}`;
      setUserFullName(fullName);

      const allIssues = await getIssuesAssignedToMe();
      const filteredByName = allIssues.filter(
        (issue) => issue.assigned_to?.name === fullName
      );

      setIssues(filteredByName);
    }

    loadIssues();
  }, []);

  const mapProgress = (done, period) => {
    if (period === "Yearly") return done;
    if (period === "6 Months") return done <= 50 ? Math.round((done / 50) * 100) : 100;
    if (period === "9 Months") return done <= 75 ? Math.round((done / 75) * 100) : 100;

    switch (period) {
      case "1ኛ ሩብዓመት": return done <= 25 ? Math.round((done / 25) * 100) : 100;
      case "2ኛ ሩብዓመት": return done >= 26 && done <= 50 ? Math.round(((done - 26) / 24) * 100) : done > 50 ? 100 : 0;
      case "3ኛ ሩብዓመት": return done >= 51 && done <= 75 ? Math.round(((done - 51) / 24) * 100) : done > 75 ? 100 : 0;
      case "4ኛ ሩብዓመት": return done >= 76 && done <= 100 ? Math.round(((done - 76) / 24) * 100) : done === 100 ? 100 : 0;
      default: return 0;
    }
  };

  const filteredIssues = issues.filter((issue) => {
    if (selectedPeriod === "Yearly") return true;

    const getField = (q) => issue.custom_fields?.find((f) => f.name === q)?.value;

    if (selectedPeriod === "6 Months") return getField("1ኛ ሩብዓመት") || getField("2ኛ ሩብዓመት");
    if (selectedPeriod === "9 Months") return getField("1ኛ ሩብዓመት") || getField("2ኛ ሩብዓመት") || getField("3ኛ ሩብዓመት");

    const val = getField(selectedPeriod);
    return val && val !== "0" && val !== "";
  });

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

  const chartData = filteredIssues.map((issue) => ({
    name: issue.subject,
    progress: mapProgress(issue.done_ratio, selectedPeriod),
    status: issue.status?.name,
  }));

  // Dynamic chart height (70px per issue)
  const chartHeight = Math.max(300, filteredIssues.length * 70);

  return (
    <div style={{ padding: "20px" }}>
      <h1>My Issues Dashboard</h1>

      <div style={{ marginBottom: "15px", fontWeight: "bold" }}>
        Logged in as: {userFullName} <br />
        Total Issues: {filteredIssues.length}
      </div>

      <div style={{ marginBottom: "30px" }}>
        <h2>Overall Performance — {overallProgress}%</h2>
        <div style={{ width: "100%", height: "25px", background: "#e0e0e0", borderRadius: "12px", overflow: "hidden" }}>
          <div style={{ width: `${overallProgress}%`, height: "100%", background: "#4CAF50" }}></div>
        </div>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <label>
          Select Period:{" "}
          <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}>
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

      <div style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ top: 20, right: 40, left: 250, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <YAxis 
              type="category" 
              dataKey="name" 
              width={250} 
              tick={{ fontSize: 12, fontWeight: "bold" }}
              tickFormatter={(name) => name.length > 30 ? name.slice(0, 27) + "..." : name}
            />
            <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => v + "%"} />
            <Tooltip formatter={(value, name, props) => [`${value}% — Status: ${props.payload.status}`, "Progress"]} />
            <Bar dataKey="progress" fill="#4CAF50" barSize={25}>
              <LabelList dataKey="progress" position="right" formatter={(v) => `${v}%`} style={{ fill: "#000", fontSize: 12, fontWeight: "bold" }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
