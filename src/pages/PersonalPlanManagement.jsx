import React, { useState, useEffect } from "react";
import {
  getCurrentUser,
  getIssuesAssignedToMe,
  getIssuesCreatedByUser,
  getIssue,
  getTrackers,
  getProjectMembers,
  createIssue,
  updateIssue,
  deleteIssue
} from "../api/redmineApi";

export default function AddSubIssue() {
  const [currentUser, setCurrentUser] = useState(null);
  const [issues, setIssues] = useState([]);
  const [parentIssues, setParentIssues] = useState([]);
  const [childIssuesWithSubIssues, setChildIssuesWithSubIssues] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingIssue, setEditingIssue] = useState(null);
  const [editFormData, setEditFormData] = useState({
    subject: "",
    description: "",
    status_id: "",
    priority_id: "",
    assigned_to_id: "",
    start_date: "",
    due_date: ""
  });
  
  const [parentId, setParentId] = useState("");
  const [parentIssue, setParentIssue] = useState(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [trackerId, setTrackerId] = useState("");
  const [statusId, setStatusId] = useState("");
  const [priorityId, setPriorityId] = useState("2");
  const [assignedToId, setAssignedToId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [customFields, setCustomFields] = useState([]);
  const [editCustomFields, setEditCustomFields] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [deleting, setDeleting] = useState(false);

  // Fields to exclude from custom fields
  const excludedFields = [
    "የአፈጻጸም አመልካች",
    "የእድገት ሪፖርት ማጠቃለያ",
    "የጠናቀቀ መረጃ",
    "Supporters",
    "1ኛ ሩብዓመት_አፈጻጸም",
    "2ኛ ሩብዓመት_አፈጻጸም",
    "3ኛ ሩብዓመት_አፈጻጸም",
    "4ኛ ሩብዓመት_አፈጻጸም"

    
  ];

  // Load current user FIRST
  useEffect(() => {
    async function loadCurrentUser() {
      try {
        const user = await getCurrentUser();
        setCurrentUser(user);
        if (user) {
          // Auto-assign to current user
          setAssignedToId(user.id || "");
        }
      } catch (error) {
        console.error("Error loading current user:", error);
      }
    }
    loadCurrentUser();
  }, []);

  // Then load issues AFTER currentUser is available
  useEffect(() => {
    async function loadUserAndIssues() {
      if (!currentUser) return;
      
      setLoading(true);
      try {
        // Get all issues assigned to current user
        const allIssues = await getIssuesAssignedToMe();
        
        // Separate parent and child issues
        const parentMap = new Map();
        const childIssueIds = new Set();
        
        // First, collect all parent issues
        allIssues.forEach(issue => {
          if (!issue.parent) {
            parentMap.set(issue.id, { ...issue, children: [] });
          } else {
            childIssueIds.add(issue.id);
          }
        });
        
        // Then, add child issues to their parents
        allIssues.forEach(issue => {
          if (issue.parent && parentMap.has(issue.parent.id)) {
            parentMap.get(issue.parent.id).children.push(issue);
          }
        });
        
        // Load sub-issues ASSIGNED TO current user for each child issue
        const childWithSubIssuesMap = new Map();
        
        if (childIssueIds.size > 0) {
          // CHANGED: Use getIssuesAssignedToMe instead of getIssuesCreatedByUser
          const assignedIssues = await getIssuesAssignedToMe();
          
          // Filter sub-issues for each child issue
          for (const childId of childIssueIds) {
            const childSubIssues = assignedIssues.filter(issue => 
              issue.parent && issue.parent.id === childId
            );
            
            if (childSubIssues.length > 0) {
              childWithSubIssuesMap.set(childId, childSubIssues);
            }
          }
        }
        
        setParentIssues(Array.from(parentMap.values()));
        setChildIssuesWithSubIssues(childWithSubIssuesMap);
        setIssues(allIssues);
        
      } catch (error) {
        console.error("Error loading user issues:", error);
      } finally {
        setLoading(false);
      }
    }
    
    loadUserAndIssues();
  }, [currentUser]);

  // Load parent issue data when parent is selected
  const loadParentData = async (issueId) => {
    try {
      const issue = await getIssue(issueId);
      setParentIssue(issue);
      
      // Set tracker ID from parent issue
      if (issue.tracker && issue.tracker.id) {
        setTrackerId(issue.tracker.id.toString());
      }
      
      setStatuses(issue.allowed_statuses || []);

      // Filter out excluded fields from custom fields
      const filteredCustomFields = (issue.custom_fields || [])
        .filter(cf => !excludedFields.includes(cf.name))
        .map(cf => ({
          id: cf.id,
          name: cf.name,
          value: ""
        }));

      setCustomFields(filteredCustomFields);
    } catch (error) {
      console.error("Error loading parent data:", error);
    }
  };

  const handleCreateClick = async (issueId) => {
    setParentId(issueId);
    await loadParentData(issueId);
    setShowCreateModal(true);
  };

  const handleEditClick = async (issue) => {
    setEditingIssue(issue);
    
    // Set edit form data
    setEditFormData({
      subject: issue.subject || "",
      description: issue.description || "",
      status_id: issue.status?.id?.toString() || "",
      priority_id: issue.priority?.id?.toString() || "2",
      assigned_to_id: currentUser?.id || "",
      start_date: issue.start_date || "",
      due_date: issue.due_date || ""
    });
    
    // Load tracker if available
    if (issue.tracker && issue.tracker.id) {
      setTrackerId(issue.tracker.id.toString());
    }
    
    // First, load the parent issue data to get all available fields
    if (issue.parent && issue.parent.id) {
      try {
        const parentIssueData = await getIssue(issue.parent.id);
        setParentIssue(parentIssueData);
        setStatuses(parentIssueData.allowed_statuses || []);
        
        // Filter out excluded fields from custom fields
        const parentCustomFields = (parentIssueData.custom_fields || [])
          .filter(cf => !excludedFields.includes(cf.name));
        
        const issueCustomFields = issue.custom_fields || [];
        
        const mappedCustomFields = parentCustomFields.map(cf => ({
          id: cf.id,
          name: cf.name,
          value: issueCustomFields.find(f => f.id === cf.id)?.value || ""
        }));
        
        setEditCustomFields(mappedCustomFields);
        
      } catch (error) {
        console.error("Error loading parent data for edit:", error);
      }
    }
    
    setShowEditModal(true);
  };

  const handleSubmit = async () => {
    if (!parentId) return alert("Select a parent issue.");
    if (!subject.trim()) return alert("Subject is required.");

    const payload = {
      project_id: parentIssue.project.id,
      parent_issue_id: parentId,
      subject,
      description,
      tracker_id: trackerId, // Inherited from parent
      status_id: statusId,
      priority_id: priorityId,
      assigned_to_id: currentUser?.id, // Auto-assign to current user
      start_date: startDate || null,
      due_date: dueDate || null,
      custom_fields: customFields.map(f => ({ id: f.id, value: f.value })),
    };

    const result = await createIssue(payload);

    if (result.success) {
      alert("Sub-issue created!");
      await refreshData();
      resetCreateForm();
      setShowCreateModal(false);
    } else {
      alert("Create failed");
    }
  };

  const handleEditSubmit = async () => {
    if (!editingIssue) return;

    const payload = {
      ...editFormData,
      assigned_to_id: currentUser?.id, // Auto-assign to current user
      custom_fields: editCustomFields.map(f => ({ id: f.id, value: f.value }))
    };

    const result = await updateIssue(editingIssue.id, payload);
    
    if (result.success) {
      alert("Issue updated successfully!");
      setShowEditModal(false);
      setEditingIssue(null);
      await refreshData();
    } else {
      alert("Update failed");
    }
  };

  const handleDelete = async (issueId) => {
    if (!window.confirm("Are you sure you want to delete this issue? This action cannot be undone.")) {
      return;
    }
    
    setDeleting(true);
    try {
      const result = await deleteIssue(issueId);
      
      if (result.success) {
        alert("Issue deleted successfully!");
        await refreshData();
      } else {
        alert(`Delete failed: ${result.message || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Delete error:", error);
      alert("Delete failed: " + (error.message || "Network error"));
    } finally {
      setDeleting(false);
    }
  };

  const refreshData = async () => {
    if (!currentUser) return;
    
    setLoading(true);
    try {
      const allIssues = await getIssuesAssignedToMe();
      const parentMap = new Map();
      const childIssueIds = new Set();
      
      allIssues.forEach(issue => {
        if (!issue.parent) {
          parentMap.set(issue.id, { ...issue, children: [] });
        } else {
          childIssueIds.add(issue.id);
        }
      });
      
      allIssues.forEach(issue => {
        if (issue.parent && parentMap.has(issue.parent.id)) {
          parentMap.get(issue.parent.id).children.push(issue);
        }
      });
      
      // Load sub-issues ASSIGNED TO current user for each child issue
      const childWithSubIssuesMap = new Map();
      
      if (childIssueIds.size > 0) {
        // CHANGED: Use getIssuesAssignedToMe instead of getIssuesCreatedByUser
        const assignedIssues = await getIssuesAssignedToMe();
        
        for (const childId of childIssueIds) {
          const childSubIssues = assignedIssues.filter(issue => 
            issue.parent && issue.parent.id === childId
          );
          
          if (childSubIssues.length > 0) {
            childWithSubIssuesMap.set(childId, childSubIssues);
          }
        }
      }
      
      setParentIssues(Array.from(parentMap.values()));
      setChildIssuesWithSubIssues(childWithSubIssuesMap);
      setIssues(allIssues);
    } catch (error) {
      console.error("Error refreshing data:", error);
    } finally {
      setLoading(false);
    }
  };

  const resetCreateForm = () => {
    setSubject("");
    setDescription("");
    setStatusId("");
    setPriorityId("2");
    setStartDate("");
    setDueDate("");
    setParentId("");
    setParentIssue(null);
    setTrackerId("");
    setCustomFields([]);
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      return new Date(dateString).toLocaleDateString();
    } catch (error) {
      return "Invalid Date";
    }
  };

  // CSS for loading spinner
  const spinnerStyles = {
    spinnerContainer: {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '300px',
      width: '100%'
    },
    spinner: {
      width: '50px',
      height: '50px',
      border: '4px solid rgba(76, 175, 80, 0.2)',
      borderTop: '4px solid #4caf50',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite'
    },
    overlaySpinner: {
      width: '40px',
      height: '40px',
      border: '3px solid rgba(255, 255, 255, 0.3)',
      borderTop: '3px solid white',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite'
    }
  };

  // Add CSS animation for spinner
  const spinnerCSS = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;

  if (!currentUser && loading) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <style>{spinnerCSS}</style>
        <h1 style={{ color: "#2e7d32", marginBottom: "30px" }}>Loading User Information</h1>
        <div style={spinnerStyles.spinnerContainer}>
          <div style={spinnerStyles.spinner}></div>
        </div>
        <p style={{ color: "#666", marginTop: "20px", fontSize: "14px" }}>Please wait while we load your user information...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <style>{spinnerCSS}</style>
      <h1 style={{ color: "#2e7d32", marginBottom: "20px" }}>Add የግል እቅድ</h1>
      
      <div style={{ 
        marginBottom: "30px",
        padding: "20px",
        background: "white",
        borderRadius: "8px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
      }}>
        
        {loading ? (
          <div style={{ 
            textAlign: "center", 
            padding: "60px 20px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <div style={spinnerStyles.spinner}></div>
            <p style={{ 
              marginTop: "20px", 
              color: "#4caf50",
              fontSize: "16px",
              fontWeight: "600"
            }}>
              Loading your issues...
            </p>
            <p style={{ 
              marginTop: "10px", 
              color: "#666",
              fontSize: "14px"
            }}>
              Please wait while we fetch your assigned tasks
            </p>
          </div>
        ) : parentIssues.length === 0 ? (
          <div style={{ 
            textAlign: "center", 
            padding: "40px 20px",
            background: "#f9f9f9",
            borderRadius: "8px"
          }}>
            <div style={{
              width: "80px",
              height: "80px",
              margin: "0 auto 20px",
              background: "#e8f5e9",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <span style={{ 
                fontSize: "40px", 
                color: "#4caf50" 
              }}>
                📋
              </span>
            </div>
            <h3 style={{ 
              color: "#2e7d32", 
              marginBottom: "10px" 
            }}>
              No Issues Assigned
            </h3>
            <p style={{ 
              color: "#666", 
              fontSize: "14px",
              maxWidth: "400px",
              margin: "0 auto"
            }}>
              You don't have any issues assigned to you at the moment.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ 
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "14px"
            }}>
              <thead>
                <tr style={{ background: "#f1f8e9" }}>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "2px solid #c8e6c9", width: "15%" }}>Type</th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "2px solid #c8e6c9", width: "45%" }}>Subject</th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "2px solid #c8e6c9", width: "15%" }}>Start Date</th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "2px solid #c8e6c9", width: "15%" }}>Due Date</th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "2px solid #c8e6c9", width: "10%" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {parentIssues.map(parent => (
                  <React.Fragment key={parent.id}>
                    {/* Parent Issue Row */}
                    <tr style={{ 
                      background: "#e8f5e9",
                      borderBottom: "2px solid #c8e6c9"
                    }}>
                      <td style={{ padding: "12px" }}>
                       
                        ዋና ተግባር
                      </td>
                      <td style={{ padding: "12px", fontWeight: "bold" }}>
                        {parent.subject}
                      </td>
                      <td style={{ padding: "12px" }}>{formatDate(parent.start_date)}</td>
                      <td style={{ padding: "12px" }}>{formatDate(parent.due_date)}</td>
                      <td style={{ padding: "12px" }}>
                        {/* Empty cell for parent rows - no button */}
                      </td>
                    </tr>
                    
                    {/* Child Issues */}
                    {parent.children.map(child => (
                      <React.Fragment key={child.id}>
                        <tr style={{ 
                          background: "#f9f9f9",
                          borderLeft: "4px solid #81c784"
                        }}>
                          <td style={{ padding: "12px", paddingLeft: "30px" }}>
                          
                            ዝርዝር ተግባር
                          </td>
                          <td style={{ padding: "12px", paddingLeft: "30px" }}>
                             {child.subject}
                          </td>
                          <td style={{ padding: "12px" }}>{formatDate(child.start_date)}</td>
                          <td style={{ padding: "12px" }}>{formatDate(child.due_date)}</td>
                          <td style={{ padding: "12px" }}>
                            <button
                              onClick={() => handleCreateClick(child.id)}
                              style={{
                                padding: "8px 15px",
                                background: "#4caf50",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                cursor: "pointer",
                                fontSize: "13px",
                                display: "block",
                                width: "100%",
                                transition: "all 0.3s ease"
                              }}
                              onMouseEnter={(e) => {
                                e.target.style.background = "#388e3c";
                              }}
                              onMouseLeave={(e) => {
                                e.target.style.background = "#4caf50";
                              }}
                            >
                              Add የግል እቅድ
                            </button>
                          </td>
                        </tr>
                        
                        {/* Sub-Issues ASSIGNED TO current user */}
                        {childIssuesWithSubIssues.has(child.id) && (
                          childIssuesWithSubIssues.get(child.id).map(subIssue => (
                            <tr key={subIssue.id} style={{ 
                              background: "#f1f8e9",
                              borderLeft: "8px solid #a5d6a7"
                            }}>
                              <td style={{ padding: "12px", paddingLeft: "50px" }}>
                             
                                የግል እቅድ
                              </td>
                              <td style={{ padding: "12px", paddingLeft: "50px" }}>
                                {subIssue.subject}
                              </td>
                              <td style={{ padding: "12px" }}>{formatDate(subIssue.start_date)}</td>
                              <td style={{ padding: "12px" }}>{formatDate(subIssue.due_date)}</td>
                              <td style={{ padding: "12px" }}>
                                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                  <button
                                    onClick={() => handleEditClick(subIssue)}
                                    style={{
                                      padding: "8px 15px",
                                      background: "#81c784",
                                      color: "white",
                                      border: "none",
                                      borderRadius: "4px",
                                      cursor: "pointer",
                                      fontSize: "13px",
                                      width: "100%",
                                      transition: "all 0.3s ease"
                                    }}
                                    onMouseEnter={(e) => {
                                      e.target.style.background = "#66bb6a";
                                    }}
                                    onMouseLeave={(e) => {
                                      e.target.style.background = "#81c784";
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDelete(subIssue.id)}
                                    disabled={deleting}
                                    style={{
                                      padding: "8px 15px",
                                      background: deleting ? "#ffa726" : "#ef5350",
                                      color: "white",
                                      border: "none",
                                      borderRadius: "4px",
                                      cursor: deleting ? "not-allowed" : "pointer",
                                      fontSize: "13px",
                                      width: "100%",
                                      transition: "all 0.3s ease"
                                    }}
                                    onMouseEnter={(e) => {
                                      if (!deleting) {
                                        e.target.style.background = "#e53935";
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      if (!deleting) {
                                        e.target.style.background = "#ef5350";
                                      }
                                    }}
                                  >
                                    {deleting ? (
                                      <div style={{ 
                                        display: "flex", 
                                        alignItems: "center", 
                                        justifyContent: "center",
                                        gap: "5px"
                                      }}>
                                        <div style={{
                                          width: "12px",
                                          height: "12px",
                                          border: "2px solid rgba(255, 255, 255, 0.3)",
                                          borderTop: "2px solid white",
                                          borderRadius: "50%",
                                          animation: "spin 1s linear infinite"
                                        }}></div>
                                        Deleting...
                                      </div>
                                    ) : "Delete"}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </React.Fragment>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Sub-Issue Modal */}
      {showCreateModal && parentIssue && (
        <div style={{
          position: "fixed",
          top: 90,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.5)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 1000
        }}>
          <div style={{
            background: "white",
            borderRadius: "8px",
            width: "600px",
            maxWidth: "95%",
            maxHeight: "90vh",
            overflowY: "auto",
            boxShadow: "0 4px 20px rgba(0,0,0,0.2)"
          }}>
            <div style={{ 
              background: "#4caf50", 
              color: "white", 
              padding: "20px",
              borderTopLeftRadius: "8px",
              borderTopRightRadius: "8px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "20px" }}>Create የግል እቅድ</h2>
                <p style={{ margin: "5px 0 0 0", fontSize: "14px", opacity: 0.9 }}>
                  Parent: #{parentIssue.id} - {parentIssue.subject}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetCreateForm();
                }}
                style={{
                  background: "transparent",
                  color: "white",
                  border: "none",
                  fontSize: "24px",
                  cursor: "pointer",
                  width: "30px",
                  height: "30px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: "25px" }}>
              {/* Inherited Tracker Info */}
              {parentIssue.tracker && (
                <div style={{
                  background: "#f1f8e9",
                  padding: "15px",
                  borderRadius: "6px",
                  marginBottom: "20px",
                  borderLeft: "4px solid #81c784"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{
                      width: "30px",
                      height: "30px",
                      borderRadius: "50%",
                      background: "#81c784",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "white",
                      fontWeight: "bold"
                    }}>
                      T
                    </div>
                    <div>
                      <div style={{ fontSize: "14px", color: "#2e7d32", fontWeight: "bold" }}>
                        Tracker (Inherited from Parent)
                      </div>
                      <div style={{ fontSize: "16px", color: "#1b5e20", fontWeight: "bold" }}>
                        {parentIssue.tracker.name}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Auto-assign to current user info */}
              {currentUser && (
                <div style={{
                  background: "#e8f5e9",
                  padding: "15px",
                  borderRadius: "6px",
                  marginBottom: "20px",
                  borderLeft: "4px solid #4caf50"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{
                      width: "30px",
                      height: "30px",
                      borderRadius: "50%",
                      background: "#4caf50",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "white",
                      fontWeight: "bold"
                    }}>
                      👤
                    </div>
                    <div>
                      <div style={{ fontSize: "14px", color: "#2e7d32", fontWeight: "bold" }}>
                        Auto-assigned to
                      </div>
                      <div style={{ fontSize: "16px", color: "#1b5e20", fontWeight: "bold" }}>
                        {currentUser.firstname} {currentUser.lastname}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* FORM */}
              <div style={{ marginBottom: "20px" }}>
                <label style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "600",
                  color: "#2e7d32",
                  fontSize: "14px"
                }}>
                  Subject *
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px",
                    border: "1px solid #c8e6c9",
                    borderRadius: "4px",
                    fontSize: "14px",
                    boxSizing: "border-box"
                  }}
                  required
                  placeholder="Enter sub-issue subject..."
                />
              </div>

              <div style={{ 
                display: "grid", 
                gridTemplateColumns: "1fr 1fr", 
                gap: "15px",
                marginBottom: "20px"
              }}>
                <div>
                  <label style={{
                    display: "block",
                    marginBottom: "8px",
                    fontWeight: "600",
                    color: "#2e7d32",
                    fontSize: "14px"
                  }}>
                    Status
                  </label>
                  <select
                    value={statusId}
                    onChange={e => setStatusId(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "1px solid #c8e6c9",
                      borderRadius: "4px",
                      fontSize: "14px",
                      boxSizing: "border-box",
                      background: "white"
                    }}
                  >
                    <option value="">Select Status</option>
                    {statuses.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{
                    display: "block",
                    marginBottom: "8px",
                    fontWeight: "600",
                    color: "#2e7d32",
                    fontSize: "14px"
                  }}>
                    Priority
                  </label>
                  <select
                    value={priorityId}
                    onChange={e => setPriorityId(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "1px solid #c8e6c9",
                      borderRadius: "4px",
                      fontSize: "14px",
                      boxSizing: "border-box",
                      background: "white"
                    }}
                  >
                    <option value="1">Low</option>
                    <option value="2">Normal</option>
                    <option value="3">High</option>
                    <option value="4">Urgent</option>
                    <option value="5">Immediate</option>
                  </select>
                </div>

                <div>
                  <label style={{
                    display: "block",
                    marginBottom: "8px",
                    fontWeight: "600",
                    color: "#2e7d32",
                    fontSize: "14px"
                  }}>
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "1px solid #c8e6c9",
                      borderRadius: "4px",
                      fontSize: "14px",
                      boxSizing: "border-box"
                    }}
                  />
                </div>

                <div>
                  <label style={{
                    display: "block",
                    marginBottom: "8px",
                    fontWeight: "600",
                    color: "#2e7d32",
                    fontSize: "14px"
                  }}>
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "1px solid #c8e6c9",
                      borderRadius: "4px",
                      fontSize: "14px",
                      boxSizing: "border-box"
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: "20px" }}>
                <label style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "600",
                  color: "#2e7d32",
                  fontSize: "14px"
                }}>
                  Description
                </label>
                <textarea
                  rows="4"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px",
                    border: "1px solid #c8e6c9",
                    borderRadius: "4px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                    resize: "vertical"
                  }}
                  placeholder="Enter detailed description..."
                />
              </div>

              {/* Custom Fields (excluding specified fields) */}
              {customFields.length > 0 && (
                <div style={{ marginBottom: "20px" }}>
                  <h3 style={{ 
                    fontSize: "16px", 
                    color: "#2e7d32", 
                    marginBottom: "15px", 
                    borderBottom: "2px solid #e8f5e9", 
                    paddingBottom: "5px" 
                  }}>
                    Additional Fields
                  </h3>
                  {customFields.map((cf, idx) => (
                    <div key={cf.id} style={{ marginBottom: "15px" }}>
                      <label style={{
                        display: "block",
                        marginBottom: "8px",
                        fontWeight: "600",
                        color: "#2e7d32",
                        fontSize: "14px"
                      }}>
                        {cf.name}
                      </label>
                      <input
                        type="text"
                        value={cf.value}
                        onChange={e => {
                          const copy = [...customFields];
                          copy[idx].value = e.target.value;
                          setCustomFields(copy);
                        }}
                        style={{
                          width: "100%",
                          padding: "12px",
                          border: "1px solid #c8e6c9",
                          borderRadius: "4px",
                          fontSize: "14px",
                          boxSizing: "border-box"
                        }}
                        placeholder={`Enter ${cf.name.toLowerCase()}...`}
                      />
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", gap: "15px", marginTop: "25px" }}>
                <button
                  onClick={handleSubmit}
                  style={{
                    flex: 1,
                    padding: "14px 20px",
                    background: "#4caf50",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "16px",
                    fontWeight: "bold",
                    transition: "all 0.3s ease"
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = "#388e3c";
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = "#4caf50";
                  }}
                >
                  Create የግል እቅድ
                </button>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    resetCreateForm();
                  }}
                  style={{
                    flex: 1,
                    padding: "14px 20px",
                    background: "#81c784",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "16px",
                    fontWeight: "bold",
                    transition: "all 0.3s ease"
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = "#66bb6a";
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = "#81c784";
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Sub-Issue Modal */}
      {showEditModal && editingIssue && parentIssue && (
        <div style={{
          position: "fixed",
          top: 90,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.5)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 1000
        }}>
          <div style={{
            background: "white",
            borderRadius: "8px",
            width: "600px",
            maxWidth: "95%",
            maxHeight: "90vh",
            overflowY: "auto",
            boxShadow: "0 4px 20px rgba(0,0,0,0.2)"
          }}>
            <div style={{ 
              background: "#81c784", 
              color: "white", 
              padding: "20px",
              borderTopLeftRadius: "8px",
              borderTopRightRadius: "8px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "20px" }}>Edit የግል እቅድ</h2>
                <p style={{ margin: "5px 0 0 0", fontSize: "14px", opacity: 0.9 }}>
                  Editing: #{editingIssue.id} - {editingIssue.subject}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingIssue(null);
                  setParentIssue(null);
                }}
                style={{
                  background: "transparent",
                  color: "white",
                  border: "none",
                  fontSize: "24px",
                  cursor: "pointer",
                  width: "30px",
                  height: "30px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: "25px" }}>
              {/* Inherited Tracker Info */}
              {trackerId && parentIssue.tracker && (
                <div style={{
                  background: "#f1f8e9",
                  padding: "15px",
                  borderRadius: "6px",
                  marginBottom: "20px",
                  borderLeft: "4px solid #81c784"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{
                      width: "30px",
                      height: "30px",
                      borderRadius: "50%",
                      background: "#81c784",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "white",
                      fontWeight: "bold"
                    }}>
                      T
                    </div>
                    <div>
                      <div style={{ fontSize: "14px", color: "#2e7d32", fontWeight: "bold" }}>
                        Tracker (Inherited from Parent)
                      </div>
                      <div style={{ fontSize: "16px", color: "#1b5e20", fontWeight: "bold" }}>
                        {parentIssue.tracker.name}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Auto-assign to current user info */}
              {currentUser && (
                <div style={{
                  background: "#e8f5e9",
                  padding: "15px",
                  borderRadius: "6px",
                  marginBottom: "20px",
                  borderLeft: "4px solid #4caf50"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{
                      width: "30px",
                      height: "30px",
                      borderRadius: "50%",
                      background: "#4caf50",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "white",
                      fontWeight: "bold"
                    }}>
                      👤
                    </div>
                    <div>
                      <div style={{ fontSize: "14px", color: "#2e7d32", fontWeight: "bold" }}>
                        Auto-assigned to
                      </div>
                      <div style={{ fontSize: "16px", color: "#1b5e20", fontWeight: "bold" }}>
                        {currentUser.firstname} {currentUser.lastname}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* EDIT FORM */}
              <div style={{ marginBottom: "20px" }}>
                <label style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "600",
                  color: "#2e7d32",
                  fontSize: "14px"
                }}>
                  Subject *
                </label>
                <input
                  type="text"
                  value={editFormData.subject}
                  onChange={e => setEditFormData({...editFormData, subject: e.target.value})}
                  style={{
                    width: "100%",
                    padding: "12px",
                    border: "1px solid #c8e6c9",
                    borderRadius: "4px",
                    fontSize: "14px",
                    boxSizing: "border-box"
                  }}
                  required
                  placeholder="Enter sub-issue subject..."
                />
              </div>

              <div style={{ 
                display: "grid", 
                gridTemplateColumns: "1fr 1fr", 
                gap: "15px",
                marginBottom: "20px"
              }}>
                <div>
                  <label style={{
                    display: "block",
                    marginBottom: "8px",
                    fontWeight: "600",
                    color: "#2e7d32",
                    fontSize: "14px"
                  }}>
                    Status
                  </label>
                  <select
                    value={editFormData.status_id}
                    onChange={e => setEditFormData({...editFormData, status_id: e.target.value})}
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "1px solid #c8e6c9",
                      borderRadius: "4px",
                      fontSize: "14px",
                      boxSizing: "border-box",
                      background: "white"
                    }}
                  >
                    <option value="">Select Status</option>
                    {statuses.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{
                    display: "block",
                    marginBottom: "8px",
                    fontWeight: "600",
                    color: "#2e7d32",
                    fontSize: "14px"
                  }}>
                    Priority
                  </label>
                  <select
                    value={editFormData.priority_id}
                    onChange={e => setEditFormData({...editFormData, priority_id: e.target.value})}
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "1px solid #c8e6c9",
                      borderRadius: "4px",
                      fontSize: "14px",
                      boxSizing: "border-box",
                      background: "white"
                    }}
                  >
                    <option value="1">Low</option>
                    <option value="2">Normal</option>
                    <option value="3">High</option>
                    <option value="4">Urgent</option>
                    <option value="5">Immediate</option>
                  </select>
                </div>

                <div>
                  <label style={{
                    display: "block",
                    marginBottom: "8px",
                    fontWeight: "600",
                    color: "#2e7d32",
                    fontSize: "14px"
                  }}>
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={editFormData.start_date}
                    onChange={e => setEditFormData({...editFormData, start_date: e.target.value})}
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "1px solid #c8e6c9",
                      borderRadius: "4px",
                      fontSize: "14px",
                      boxSizing: "border-box"
                    }}
                  />
                </div>

                <div>
                  <label style={{
                    display: "block",
                    marginBottom: "8px",
                    fontWeight: "600",
                    color: "#2e7d32",
                    fontSize: "14px"
                  }}>
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={editFormData.due_date}
                    onChange={e => setEditFormData({...editFormData, due_date: e.target.value})}
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "1px solid #c8e6c9",
                      borderRadius: "4px",
                      fontSize: "14px",
                      boxSizing: "border-box"
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: "20px" }}>
                <label style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "600",
                  color: "#2e7d32",
                  fontSize: "14px"
                }}>
                  Description
                </label>
                <textarea
                  rows="4"
                  value={editFormData.description}
                  onChange={e => setEditFormData({...editFormData, description: e.target.value})}
                  style={{
                    width: "100%",
                    padding: "12px",
                    border: "1px solid #c8e6c9",
                    borderRadius: "4px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                    resize: "vertical"
                  }}
                  placeholder="Enter detailed description..."
                />
              </div>

              {/* Custom Fields (excluding specified fields) */}
              {editCustomFields.length > 0 && (
                <div style={{ marginBottom: "20px" }}>
                  <h3 style={{ 
                    fontSize: "16px", 
                    color: "#2e7d32", 
                    marginBottom: "15px", 
                    borderBottom: "2px solid #e8f5e9", 
                    paddingBottom: "5px" 
                  }}>
                    Additional Fields
                  </h3>
                  {editCustomFields.map((cf, idx) => (
                    <div key={cf.id} style={{ marginBottom: "15px" }}>
                      <label style={{
                        display: "block",
                        marginBottom: "8px",
                        fontWeight: "600",
                        color: "#2e7d32",
                        fontSize: "14px"
                      }}>
                        {cf.name}
                      </label>
                      <input
                        type="text"
                        value={cf.value}
                        onChange={e => {
                          const copy = [...editCustomFields];
                          copy[idx].value = e.target.value;
                          setEditCustomFields(copy);
                        }}
                        style={{
                          width: "100%",
                          padding: "12px",
                          border: "1px solid #c8e6c9",
                          borderRadius: "4px",
                          fontSize: "14px",
                          boxSizing: "border-box"
                        }}
                        placeholder={`Enter ${cf.name.toLowerCase()}...`}
                      />
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", gap: "15px", marginTop: "25px" }}>
                <button
                  onClick={handleEditSubmit}
                  style={{
                    flex: 1,
                    padding: "14px 20px",
                    background: "#81c784",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "16px",
                    fontWeight: "bold",
                    transition: "all 0.3s ease"
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = "#66bb6a";
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = "#81c784";
                  }}
                >
                  Save Changes
                </button>
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingIssue(null);
                    setParentIssue(null);
                  }}
                  style={{
                    flex: 1,
                    padding: "14px 20px",
                    background: "#4caf50",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "16px",
                    fontWeight: "bold",
                    transition: "all 0.3s ease"
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = "#388e3c";
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = "#4caf50";
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}