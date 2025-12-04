import { useEffect, useState } from "react";
import { 
  getProjects, 
  getProjectIssues, 
  getIssue, 
  updateIssue 
} from "../api/redmineApi";

export default function ChangeStatusPage() {
  const [subtasks, setSubtasks] = useState([]);
  const [selectedStatusId, setSelectedStatusId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const projects = await getProjects();
        const projectIds = projects.map(p => p.id);

        let allTasks = [];

        // Load subtasks for all projects
        for (const pid of projectIds) {
          const issues = await getProjectIssues({ project_id: pid });
          const subtasks = issues.filter(issue => issue.parent);

          // Fetch full issue info for allowed statuses and current status
          const enriched = await Promise.all(
            subtasks.map(async st => {
              const fullIssue = await getIssue(st.id); // must include allowed_statuses
              return {
                ...st,
                allowed_statuses: fullIssue.allowed_statuses || [],
                status: fullIssue.status, // <-- add current status
              };
            })
          );

          allTasks = [...allTasks, ...enriched];
        }

        // Deduplicate subtasks by ID
        const uniqueTasks = Array.from(
          new Map(allTasks.map(t => [t.id, t])).values()
        );

        setSubtasks(uniqueTasks);
      } catch (error) {
        console.error("Failed to fetch subtasks:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleStatusChange = async (issueId, newStatusId) => {
    const res = await updateIssue(issueId, { status_id: newStatusId });

    if (res.success) {
      setSubtasks(prev =>
        prev.map(t =>
          t.id === issueId
            ? {
                ...t,
                status: t.allowed_statuses.find(s => s.id == newStatusId),
              }
            : t
        )
      );
    } else {
      alert("Failed to update status");
    }
  };

  // Build unique list of allowed statuses from subtasks
  const allAllowedStatuses = Array.from(
    new Map(subtasks.flatMap(s => s.allowed_statuses).map(st => [st.id, st])).values()
  );

  const subtasksByStatus = allAllowedStatuses.map(s => ({
    ...s,
    count: subtasks.filter(t => t.status?.id === s.id).length,
    tasks: subtasks.filter(t => t.status?.id === s.id),
  }));

  if (loading) return <div style={{ padding: "20px" }}>Loading subtasks...</div>;

  return (
    <div style={{ padding: "20px" }}>
      <h2 style={{ fontSize: "20px", marginBottom: "15px" }}>
        Change Subtask Status
      </h2>

      {/* STATUS SELECT BOXES */}
      <div style={{
        display: "flex",
        gap: "20px",
        flexWrap: "wrap",
        marginBottom: "20px",
      }}>
        {subtasksByStatus.map(s => (
          <div
            key={s.id}
            onClick={() => setSelectedStatusId(s.id)}
            style={{
              cursor: "pointer",
              padding: "20px",
              background: selectedStatusId === s.id ? "#4caf50" : "#f0f0f0",
              color: selectedStatusId === s.id ? "#fff" : "#333",
              borderRadius: "12px",
              minWidth: "150px",
              textAlign: "center",
              boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
              transition: "0.3s",
              flex: "1 1 150px",
            }}
          >
            <div style={{ fontWeight: "600", fontSize: "16px" }}>{s.name}</div>
            <div style={{ fontSize: "14px", marginTop: "5px" }}>{s.count} tasks</div>
          </div>
        ))}
      </div>

      {/* SUBTASK LIST */}
      {selectedStatusId && (
        <div style={{ marginTop: "10px" }}>
          <h3 style={{ marginBottom: "10px" }}>
            Subtasks in "{allAllowedStatuses.find(s => s.id === selectedStatusId)?.name}"
          </h3>

          {subtasks
            .filter(t => t.status?.id === selectedStatusId)
            .map(task => (
              <div
                key={task.id}
                style={{
                  marginBottom: "10px",
                  padding: "10px",
                  background: "#fff",
                  borderRadius: "8px",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <strong>{task.subject}</strong>
                  <div style={{ fontSize: "12px", color: "#666" }}>
                    Project: {task.project?.name}
                  </div>
                </div>

                <div>
                  <select
                    value={task.status.id}
                    onChange={e => handleStatusChange(task.id, e.target.value)}
                    style={{
                      padding: "5px 8px",
                      fontSize: "14px",
                      borderRadius: "6px",
                      border: "1px solid #ccc"
                    }}
                  >
                    {task.allowed_statuses.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
