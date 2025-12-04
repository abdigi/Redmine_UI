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
} from "recharts";

export default function ProjectDashboard() {
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [averageProgress, setAverageProgress] = useState(null);
  const [issuesCache, setIssuesCache] = useState({});
  const [mainTasks, setMainTasks] = useState([]);

  // Fetch main projects
  useEffect(() => {
    async function loadProjects() {
      const data = await getProjects();
      const mainProjects = data.filter((p) => !p.parent); // only main projects
      setProjects(mainProjects);

      // Set default project if exists
      const defaultProject = mainProjects.find(
        (p) =>
          p.name ===
          "የ2018 ዓ.ም የኢንፎርሜሽን ኮሚኒኬሽን ቴክኖሎጅ ስራ አስፈፃሚ አመታዊ ዕቅድ"
      );
      if (defaultProject) setSelectedProjectId(defaultProject.id.toString());
    }
    loadProjects();
  }, []);

  // Fetch main tasks for selected project
  useEffect(() => {
    if (!selectedProjectId) return;

    async function loadProjectData() {
      let issues = issuesCache[selectedProjectId];

      if (!issues) {
        issues = await getProjectIssues({
          project_id: selectedProjectId,
          include: "custom_fields",
          status_id: "*",
        });
        setIssuesCache((prev) => ({ ...prev, [selectedProjectId]: issues }));
      }

      const main = issues.filter((i) => !i.parent); // main tasks only
      setMainTasks(main);

      // Weighted average
      let totalWeight = 0;
      let weightedSum = 0;
      main.forEach((i) => {
        const weightField = i.custom_fields?.find((f) => f.name === "ክብደት");
        const weight = weightField?.value ? Number(weightField.value) : 1;
        totalWeight += weight;
        weightedSum += (i.done_ratio || 0) * weight;
      });

      const result = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
      setAverageProgress(result);
    }

    loadProjectData();
  }, [selectedProjectId]);

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
            <option value="">
              የ2018 ዓ.ም የኢንፎርሜሽን ኮሚኒኬሽን ቴክኖሎጅ ስራ አስፈፃሚ አመታዊ ዕቅድ
            </option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
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
            <strong>Average Progress: </strong>
            {averageProgress}%
          </div>
        </div>
      )}

      {/* Horizontal Bar Chart of Main Tasks */}
      {mainTasks.length > 0 && (
        <div style={{ width: "100%", height: Math.max(400, mainTasks.length * 40) }}>
          <h2>Main Tasks Progress</h2>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={mainTasks.map((task) => ({
                name: task.subject,
                progress: task.done_ratio,
              }))}
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
              <Tooltip />
              <Bar dataKey="progress" fill="#2196f3" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
