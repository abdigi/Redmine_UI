import React, { useEffect, useState } from "react";
import { getProjects, getProjectIssues, getProjectMembers } from "../api/redmineApi";

export default function SubIssueSelector({ onSelect }) {
  const [subtasks, setSubtasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSubtasks = async () => {
      try {
        const userData = JSON.parse(localStorage.getItem("redmine_user"));
        if (!userData) return;

        const allProjects = await getProjects();
        const userProjects = [];

        for (const project of allProjects) {
          const members = await getProjectMembers(project.id);
          if (members.some(m => m.id === userData.id)) {
            userProjects.push(project);
          }
        }

        let allSubtasks = [];
        for (const project of userProjects) {
          const issues = await getProjectIssues({ project_id: project.id });
          const subtasksOnly = issues.filter(issue => issue.parent);
          allSubtasks = [...allSubtasks, ...subtasksOnly];
        }

        setSubtasks(allSubtasks);
      } catch (err) {
        console.error("Failed to load subtasks:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSubtasks();
  }, []);

  const handleChange = (e) => {
    onSelect(e.target.value);
  };

  if (loading) return <p>Loading subtasks...</p>;

  return (
    <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
      <select
        onChange={handleChange}
        className="subtask-select-box"
      >
        <option value="">-- Select Subtask --</option>

        {subtasks.map(task => (
          <option key={task.id} value={task.id}>
            [{task.project?.name}] {task.subject}
          </option>
        ))}
      </select>

      <style>
        {`
          .subtask-select-box {
            width: 90%;              /* Equal margin left/right */
            max-width: 500px;        /* Controls how large it gets */
            padding: 10px;
            font-size: 14px;
            border-radius: 6px;
            border: 1px solid #ccc;
            background: #fff;
            cursor: pointer;
          }

          /* Dropdown items match width */
          .subtask-select-box option {
            width: 100%;
          }
        `}
      </style>
    </div>
  );
}
