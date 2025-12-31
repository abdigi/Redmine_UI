import { useEffect, useState } from "react";
import {
  getProjects,
  getProjectMembers,
  getCurrentUser,
  getGroupDetails,
  getIssuesAssigned,
  getIssue,
  updateIssue
} from "../api/redmineApi";

export default function ChangeStatusPage() {
  const [projects, setProjects] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [myGroup, setMyGroup] = useState(null);
  const [myGroupUsers, setMyGroupUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [userIssues, setUserIssues] = useState([]);
  const [selectedStatusId, setSelectedStatusId] = useState(null);
  const [loading, setLoading] = useState(true);

  // 1️⃣ Load projects
  useEffect(() => {
    async function loadProjects() {
      const data = await getProjects();
      setProjects(data);
    }
    loadProjects();
  }, []);

  // 2️⃣ Load project members
  const [members, setMembers] = useState([]);
  useEffect(() => {
    async function loadMembers() {
      if (!projects.length) return;

      let allMembers = [];
      for (let project of projects) {
        const projectMembers = await getProjectMembers(project.id);
        allMembers = [...allMembers, ...projectMembers];
      }

      // Remove duplicates
      const uniqueMembers = allMembers.filter(
        (v, i, a) => a.findIndex(t => t.id === v.id) === i
      );
      setMembers(uniqueMembers);
    }
    loadMembers();
  }, [projects]);

  // 3️⃣ Load current user
  useEffect(() => {
    async function loadUser() {
      const user = await getCurrentUser();
      setCurrentUser(user);
    }
    loadUser();
  }, []);

  // 4️⃣ Find group with same name as username
  useEffect(() => {
    if (!currentUser || !members.length) return;

    const group = members.find(
      m => m.isGroup && m.name.toLowerCase() === currentUser.login.toLowerCase()
    );
    setMyGroup(group || null);
  }, [currentUser, members]);

  // 5️⃣ Load users inside that group
  useEffect(() => {
    async function loadGroupUsers() {
      if (!myGroup) {
        setMyGroupUsers([]);
        return;
      }
      const g = await getGroupDetails(myGroup.id); // returns { group: { users: [] } }
      setMyGroupUsers(g.users || []);
    }
    loadGroupUsers();
  }, [myGroup]);

  // 6️⃣ Load issues for selected user
  useEffect(() => {
    async function loadIssues() {
      if (!selectedUserId) {
        setUserIssues([]);
        return;
      }
      setLoading(true);
      try {
        const issues = await getIssuesAssigned(selectedUserId);
        const enriched = await Promise.all(
          issues.map(async (issue) => {
            const full = await getIssue(issue.id);
            return {
              ...issue,
              allowed_statuses: full.allowed_statuses || [],
              status: full.status
            };
          })
        );
        setUserIssues(enriched);
      } catch (err) {
        console.log(err);
      } finally {
        setLoading(false);
      }
    }
    loadIssues();
  }, [selectedUserId]);

  // 7️⃣ Status filters
  const availableStatuses = Array.from(
    new Map(
      userIssues
        .flatMap(i => i.allowed_statuses)
        .map(s => [s.id, s])
    ).values()
  );

  const filteredUserIssues = selectedStatusId
    ? userIssues.filter(i => i.status?.id === selectedStatusId)
    : userIssues;

  // 8️⃣ Handle status change
  const handleStatusChange = async (issueId, newStatusId) => {
    try {
      const res = await updateIssue(issueId, { status_id: newStatusId });
      if (res.success) {
        setUserIssues(prev =>
          prev.map(i =>
            i.id === issueId
              ? { ...i, status: i.allowed_statuses.find(s => s.id == newStatusId) }
              : i
          )
        );
      } else {
        alert("Failed to update status");
      }
    } catch (err) {
      console.log(err);
      alert("Failed to update status");
    }
  };

  if (loading) return <div style={{ padding: 20 }}>Loading...</div>;

  return (
    <div style={{ padding: 20 }}>
      <h2>Change Subtask Status</h2>

      {/* USER FILTER */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ marginRight: 10 }}>Filter by user:</label>
        <select
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
          style={{ padding: "6px", borderRadius: 6 }}
        >
          <option value="">Select User</option>
          {myGroupUsers.map(u => (
            <option key={u.id} value={u.id}>
              {u.firstname} {u.lastname}
            </option>
          ))}
        </select>
      </div>

      {/* STATUS BOXES */}
      {selectedUserId && (
        <>
          <div style={{ display: "flex", gap: 15, flexWrap: "wrap", marginBottom: 20 }}>
            {availableStatuses.map(status => (
              <div
                key={status.id}
                onClick={() => setSelectedStatusId(status.id)}
                style={{
                  padding: 15,
                  borderRadius: 10,
                  cursor: "pointer",
                  background: selectedStatusId === status.id ? "#4caf50" : "#eee",
                  color: selectedStatusId === status.id ? "white" : "black"
                }}
              >
                <strong>{status.name}</strong>
                <div>
                  {userIssues.filter(i => i.status?.id === status.id).length} tasks
                </div>
              </div>
            ))}
          </div>

          {/* ISSUE LIST */}
          {filteredUserIssues.map(issue => (
            <div
              key={issue.id}
              style={{
                padding: 12,
                marginBottom: 8,
                background: "#fff",
                borderRadius: 8,
                display: "flex",
                justifyContent: "space-between",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
              }}
            >
              <div>
                <strong>{issue.subject}</strong>
                <div style={{ fontSize: 12, color: "#666" }}>
                  Assigned to: {issue.assigned_to?.firstname} {issue.assigned_to?.lastname || "No one"}
                </div>
              </div>

              <select
                value={issue.status?.id || ""}
                onChange={(e) =>
                  handleStatusChange(issue.id, e.target.value)
                }
                style={{ padding: 6, borderRadius: 6 }}
              >
                {issue.allowed_statuses.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
