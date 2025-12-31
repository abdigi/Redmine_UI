import React, { useState, useEffect } from "react";
import { getProjects, getProjectIssues } from "../api/redmineApi";
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

export default function ProjectDashboard() {
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [averageProgress, setAverageProgress] = useState(null);
  const [subProjectsProgress, setSubProjectsProgress] = useState([]);
  const [issuesCache, setIssuesCache] = useState({});
  const [selectedQuarter, setSelectedQuarter] = useState("Annual");

  // Fetch all projects
  useEffect(() => {
    async function loadProjects() {
      const data = await getProjects();
      setProjects(data);

      const defaultProject = data.find(
        (p) =>
          p.name ===
          "የ2018 ዓ.ም የኢንፎርሜሽን ኮሚኒኬሽን ቴክኖሎጅ ስራ አስፈፃሚ አመታዊ ዕቅድ"
      );
      if (defaultProject) setSelectedProjectId(defaultProject.id.toString());
    }
    loadProjects();
  }, []);

  // Map done_ratio to 0-100 based on quarter
  function mapProgressToQuarter(done_ratio, quarter) {
    if (quarter === "Annual") return done_ratio;
    if (quarter === "1ኛ ሩብዓመት") return Math.min(Math.max(((done_ratio - 0) / 25) * 100, 0), 100);
    if (quarter === "2ኛ ሩብዓመት") return Math.min(Math.max(((done_ratio - 26) / (50 - 26)) * 100, 0), 100);
    if (quarter === "3ኛ ሩብዓመት") return Math.min(Math.max(((done_ratio - 51) / (75 - 51)) * 100, 0), 100);
    if (quarter === "4ኛ ሩብዓመት") return Math.min(Math.max(((done_ratio - 76) / (100 - 76)) * 100, 0), 100);
    return done_ratio;
  }

  // Calculate subprojects progress
  useEffect(() => {
    if (!selectedProjectId) return;

    async function loadSubProjectsProgress() {
      const subs = projects.filter(
        (p) => p.parent && p.parent.id === Number(selectedProjectId)
      );

      const results = [];

      for (const sub of subs) {
        let issues = issuesCache[sub.id];
        if (!issues) {
          issues = await getProjectIssues({
            project_id: sub.id,
            include: "custom_fields",
            status_id: "*",
          });
          setIssuesCache((prev) => ({ ...prev, [sub.id]: issues }));
        }

        const mainIssues = issues.filter((i) => !i.parent);

        let totalWeight = 0;
        let weightedSum = 0;
        mainIssues.forEach((i) => {
          const weightField = i.custom_fields?.find((f) => f.name === "ክብደት");
          const weight = weightField?.value ? Number(weightField.value) : 1;
          totalWeight += weight;

          const mappedProgress = mapProgressToQuarter(i.done_ratio || 0, selectedQuarter);
          weightedSum += mappedProgress * weight;
        });

        const avgProgress = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

        results.push({
          id: sub.id,
          name: sub.name,
          progress: avgProgress,
        });
      }

      setSubProjectsProgress(results);

      const overallAvg =
        results.length > 0
          ? Math.round(results.reduce((sum, p) => sum + p.progress, 0) / results.length)
          : 0;
      setAverageProgress(overallAvg);
    }

    loadSubProjectsProgress();
  }, [selectedProjectId, projects, selectedQuarter, issuesCache]);

  if (projects.length === 0) return <div>Loading projects...</div>;

  return (
    <div style={{ padding: "20px" }}>
      <h1>Dashboard</h1>

      {/* Project Dropdown */}
      <div style={{ marginBottom: "20px" }}>
        <label>
          Select Project:{" "}
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            style={{ padding: "5px" }}
          >
            <option value="">-- Select Project --</option>
            {projects
              .filter((p) => !p.parent)
              .map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
          </select>
        </label>
      </div>

      {/* Quarter Dropdown */}
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

      {/* Weighted Average */}
      {selectedProjectId && averageProgress !== null && (
        <div
          style={{
            marginBottom: "20px",
            width: "350px",
            padding: "15px",
            border: "1px solid #ccc",
            borderRadius: "6px",
            background: "#f5f5f5",
          }}
        >
          <h3 style={{ marginTop: 0 }}>
            {projects.find((p) => p.id === Number(selectedProjectId))?.name}
          </h3>
          <div>
            <strong>
              {selectedQuarter === "Annual"
                ? "Average Progress"
                : `Average Progress (${selectedQuarter})`}
              :{" "}
            </strong>
            {averageProgress}%
          </div>
        </div>
      )}

      {/* Subproject Bar Chart */}
      {subProjectsProgress.length > 0 && (
        <div style={{ width: "100%", height: Math.max(400, subProjectsProgress.length * 60) }}>
          <h2>Subprojects Progress (from Main Issues)</h2>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={subProjectsProgress}
              margin={{ top: 50, right: 30, left: 200, bottom: 50 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} />
              <YAxis
                type="category"
                dataKey="name"
                width={200}
                tick={({ x, y, payload }) => {
                  const label =
                    payload.value.length > 30
                      ? payload.value.slice(0, 27) + "..."
                      : payload.value;
                  return (
                    <text x={x} y={y + 5} textAnchor="end" fill="#666">
                      {label}
                      <title>{payload.value}</title>
                    </text>
                  );
                }}
              />
              <Tooltip formatter={(value) => `${value}%`} />
              <Bar dataKey="progress" fill="#2196f3" barSize={40}>
                <LabelList
                  dataKey="progress"
                  position="insideRight"
                  formatter={(value) => `${value}%`}
                  style={{ fill: "#fff", fontSize: 14, fontWeight: "bold" }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
