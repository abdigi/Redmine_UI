import React, { useState, useEffect } from "react";
import { 
  getMyMainProjects, 
  getProjectMembers, 
  getProjectIssues 
} from "../api/redmineApi";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";

export default function HigherOfficialDashboard() {
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [averageProgress, setAverageProgress] = useState(null);
  const [selectedQuarter, setSelectedQuarter] = useState("Annual");
  const [mainIssuesData, setMainIssuesData] = useState([]);
  const [issuesCache, setIssuesCache] = useState({});

  useEffect(() => {
    async function loadProjects() {
      const data = await getMyMainProjects();
      setProjects(data);
    }
    loadProjects();
  }, []);

  function mapProgressToQuarter(done_ratio, quarter) {
    if (quarter === "Annual") return done_ratio;
    if (quarter === "1ኛ ሩብዓመት")
      return Math.min(Math.max(((done_ratio - 0) / 25) * 100, 0), 100);
    if (quarter === "2ኛ ሩብዓመት")
      return Math.min(Math.max(((done_ratio - 26) / (50 - 26)) * 100, 0), 100);
    if (quarter === "3ኛ ሩብዓመት")
      return Math.min(Math.max(((done_ratio - 51) / (75 - 51)) * 100, 0), 100);
    if (quarter === "4ኛ ሩብዓመት")
      return Math.min(Math.max(((done_ratio - 76) / (100 - 76)) * 100, 0), 100);
    return done_ratio;
  }

  useEffect(() => {
    if (!selectedProjectId) {
      setAverageProgress(null);
      setMainIssuesData([]);
      return;
    }

    async function loadProjectProgress() {
      try {
        let allIssues = [];

        // Get main project issues
        let mainProjectIssues = issuesCache[selectedProjectId];
        if (!mainProjectIssues) {
          mainProjectIssues = await getProjectIssues({
            project_id: Number(selectedProjectId),
            include: "custom_fields",
            status_id: "*",
          });
          setIssuesCache(prev => ({ ...prev, [selectedProjectId]: mainProjectIssues }));
        }

        // Filter only main issues (no parent)
        const mainIssues = mainProjectIssues.filter(i => !i.parent);
        allIssues.push(...mainIssues);

        // Calculate weighted average
        let totalWeight = 0;
        let weightedSum = 0;
        allIssues.forEach(issue => {
          const weightField = issue.custom_fields?.find(f => f.name === "ክብደት");
          const weight = weightField?.value ? Number(weightField.value) : 1;
          totalWeight += weight;

          const mappedProgress = mapProgressToQuarter(issue.done_ratio || 0, selectedQuarter);
          weightedSum += mappedProgress * weight;
        });
        const avgProgress = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
        setAverageProgress(avgProgress);

        // Prepare main issues chart data
        const chartData = allIssues.map(issue => ({
          name: issue.subject,
          progress: mapProgressToQuarter(issue.done_ratio || 0, selectedQuarter),
        }));
        setMainIssuesData(chartData);

      } catch (err) {
        console.log("Error loading project progress:", err);
      }
    }

    loadProjectProgress();
  }, [selectedProjectId, selectedQuarter, issuesCache]);

  if (projects.length === 0) return <div>Loading projects...</div>;

  return (
    <div style={{ padding: "20px" }}>
      <h1>Higher Official Dashboard</h1>

      <div style={{ marginBottom: "20px" }}>
        <label>
          Select Project:{" "}
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            style={{ padding: "5px" }}
          >
            <option value="">-- Select Project --</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <label>
          Select Quarter:{" "}
          <select
            value={selectedQuarter}
            onChange={(e) => setSelectedQuarter(e.target.value)}
            style={{ padding: "5px" }}
          >
            <option value="Annual">Annual</option>
            <option value="1ኛ ሩብዓመት">1ኛ ሩብዓመት</option>
            <option value="2ኛ ሩብዓመት">2ኛ ሩብዓመት</option>
            <option value="3ኛ ሩብዓመት">3ኛ ሩብዓመት</option>
            <option value="4ኛ ሩብዓመት">4ኛ ሩብዓመት</option>
          </select>
        </label>
      </div>

      {averageProgress !== null && (
        <div style={{
          marginBottom: "20px",
          width: "350px",
          padding: "15px",
          border: "1px solid #ccc",
          borderRadius: "6px",
          background: "#f5f5f5",
        }}>
          <h3 style={{ marginTop: 0 }}>
            {projects.find(p => p.id === Number(selectedProjectId))?.name}
          </h3>
          <div>
            <strong>
              {selectedQuarter === "Annual" ? "Overall Weighted Performance" : `Overall Weighted Performance (${selectedQuarter})`}:
            </strong>{" "}
            {averageProgress}%
          </div>
        </div>
      )}

      {mainIssuesData.length > 0 && (
        <div style={{ width: "100%", height: mainIssuesData.length * 50 + 50 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={mainIssuesData}
              margin={{ top: 20, right: 20, left: 20, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} />
              <YAxis type="category" dataKey="name" width={200} />
              <Tooltip />
              <Bar
                dataKey="progress"
                fill="#8884d8"
                label={({ x, y, width, height, value }) => (
                  <text
                    x={x + width / 2}
                    y={y + height / 2}
                    fill="#fff"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={12}
                  >
                    {value}%
                  </text>
                )}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
