import React, { useEffect, useState } from "react";
import { 
  getIssuesAssignedToMe,
  updateIssue, 
  getCurrentUser,
  getIssue 
} from "../api/redmineApi";

export default function ProgressPage() {
  const [issues, setIssues] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPopup, setShowPopup] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [selectedQuarter, setSelectedQuarter] = useState("");
  const [quarterValue, setQuarterValue] = useState("");
  const [loadingDots, setLoadingDots] = useState("");
  
  const today = new Date();

  // Animation for loading dots
  useEffect(() => {
    if (loading) {
      const interval = setInterval(() => {
        setLoadingDots(prev => {
          if (prev.length >= 3) return "";
          return prev + ".";
        });
      }, 500);
      return () => clearInterval(interval);
    }
  }, [loading]);

  // Load data
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const user = await getCurrentUser();
        setCurrentUser(user);
        
        if (!user) {
          setLoading(false);
          return;
        }
        
        const assignedIssues = await getIssuesAssignedToMe();
        console.log(`Found ${assignedIssues.length} issues assigned to current user`);
        
        const filteredIssues = [];
        
        // Process issues to find exactly 2 parent levels
        for (const issue of assignedIssues) {
          try {
            // Skip if no parent (level 1 issues)
            if (!issue.parent || !issue.parent.id) continue;
            
            // Get parent issue
            const directParent = await getIssue(issue.parent.id);
            if (!directParent) continue;
            
            // Check if parent has a parent (grandparent)
            if (directParent.parent && directParent.parent.id) {
              const grandparent = await getIssue(directParent.parent.id);
              
              // Only include if grandparent exists and has NO parent
              if (grandparent && !grandparent.parent) {
                // Get full issue with all details
                const fullIssue = await getIssue(issue.id);
                if (fullIssue) {
                  // Store parent reference for later use
                  fullIssue._parent = directParent;
                  filteredIssues.push(fullIssue);
                }
              }
            }
          } catch (err) {
            console.error(`Error processing issue ${issue.id}:`, err);
          }
        }
        
        console.log(`Filtered to ${filteredIssues.length} issues with exactly 2 parent levels`);
        setIssues(filteredIssues);
      } catch (err) {
        console.error("Error loading progress data:", err);
      } finally {
        setLoading(false);
      }
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

  const getCustomFieldAsNumber = (issue, fieldName) => {
    const value = getCustomField(issue, fieldName);
    if (!value) return 0;
    
    // Remove any non-numeric characters except decimal point and minus sign
    const cleaned = value.replace(/[^\d.-]/g, '');
    const result = parseFloat(cleaned);
    return isNaN(result) ? 0 : result;
  };

  const customFieldNames = [
    "የዓመቱ እቅድ",
    "1ኛ ሩብዓመት",
    "2ኛ ሩብዓመት",
    "3ኛ ሩብዓመት",
    "4ኛ ሩብዓመት",
  ];

  const performanceFieldNames = [
    "1ኛ ሩብዓመት_አፈጻጸም",
    "2ኛ ሩብዓመት_አፈጻጸም",
    "3ኛ ሩብዓመት_አፈጻጸም",
    "4ኛ ሩብዓመት_አፈጻጸም",
  ];

  // Get performance field name based on quarter name
  const getPerformanceFieldName = (quarterName) => {
    switch(quarterName) {
      case "1ኛ ሩብዓመት":
        return "1ኛ ሩብዓመት_አፈጻጸም";
      case "2ኛ ሩብዓመት":
        return "2ኛ ሩብዓመት_አፈጻጸም";
      case "3ኛ ሩብዓመት":
        return "3ኛ ሩብዓመት_አፈጻጸም";
      case "4ኛ ሩብዓመት":
        return "4ኛ ሩብዓመት_አፈጻጸም";
      default:
        return "";
    }
  };

  const getFiscalYear = (date) => {
    const d = new Date(date);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    
    if (month > 5 || (month === 5 && day >= 9)) {
      return d.getFullYear();
    } else {
      return d.getFullYear() - 1;
    }
  };

  const getQuarterDateRange = (quarterName, fy) => {
    switch (quarterName) {
      case "1ኛ ሩብዓመት":
        return [
          new Date(`${fy}-05-09`),
          new Date(`${fy}-10-10`)
        ];
        
      case "2ኛ ሩብዓመት":
        return [
          new Date(`${fy}-10-11`),
          new Date(`${fy + 1}-01-08`)
        ];
        
      case "3ኛ ሩብዓመት":
        return [
          new Date(`${fy + 1}-01-09`),
          new Date(`${fy + 1}-04-08`)
        ];
        
      case "4ኛ ሩብዓመት":
        return [
          new Date(`${fy + 1}-04-09`),
          new Date(`${fy + 1}-07-07`)
        ];
        
      default:
        return [null, null];
    }
  };

  const isQuarterActive = (quarterName) => {
    const fy = getFiscalYear(today);
    const [qStart, qEnd] = getQuarterDateRange(quarterName, fy);
    
    if (!qStart || !qEnd) return false;
    
    const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startDateOnly = new Date(qStart.getFullYear(), qStart.getMonth(), qStart.getDate());
    const endDateOnly = new Date(qEnd.getFullYear(), qEnd.getMonth(), qEnd.getDate());
    
    return todayDateOnly >= startDateOnly && todayDateOnly <= endDateOnly;
  };

  const getCurrentQuarter = () => {
    const fy = getFiscalYear(today);
    const quarters = ["1ኛ ሩብዓመት", "2ኛ ሩብዓመት", "3ኛ ሩብዓመት", "4ኛ ሩብዓመት"];
    
    for (const quarter of quarters) {
      if (isQuarterActive(quarter)) {
        return quarter;
      }
    }
    
    return null;
  };

  const handlePerformanceClick = (issue, quarterName) => {
    setSelectedIssue(issue);
    setSelectedQuarter(quarterName);
    setQuarterValue("");
    setShowPopup(true);
  };

  // Get all quarter names (excluding annual plan)
  const getQuarterNames = () => {
    return customFieldNames.filter(name => name !== "የዓመቱ እቅድ");
  };

  const calculatePerformance = () => {
    if (quarterValue === "" || !selectedIssue || !selectedQuarter) return 0;
    
    // Parse quarter value (allow 0)
    const quarterTargetStr = quarterValue.toString().replace(/[^\d.-]/g, '');
    const quarterTarget = parseFloat(quarterTargetStr);
    return isNaN(quarterTarget) ? 0 : quarterTarget;
  };

  // Helper function to get custom field ID
  const getCustomFieldId = (issue, fieldName) => {
    if (!issue.custom_fields) return null;
    const field = issue.custom_fields.find((f) => f.name === fieldName);
    return field ? field.id : null;
  };

  // Helper function to update custom field value
  const updateCustomFieldValue = (issue, fieldName, newValue) => {
    const updatedIssue = { ...issue };
    if (!updatedIssue.custom_fields) {
      updatedIssue.custom_fields = [];
    }
    
    const fieldId = getCustomFieldId(updatedIssue, fieldName);
    const fieldIndex = updatedIssue.custom_fields.findIndex(f => 
      f.name === fieldName
    );
    
    if (fieldIndex >= 0) {
      updatedIssue.custom_fields[fieldIndex].value = newValue.toString();
    } else {
      updatedIssue.custom_fields.push({
        id: fieldId,
        name: fieldName,
        value: newValue.toString()
      });
    }
    
    return updatedIssue;
  };

  // Calculate new parent performance: parent_current - child_old + child_new
  const calculateParentPerformance = (parentIssue, performanceFieldName, childOldValue, childNewValue) => {
    const currentParentValue = getCustomFieldAsNumber(parentIssue, performanceFieldName);
    const childOldNum = parseFloat(childOldValue) || 0;
    const childNewNum = parseFloat(childNewValue) || 0;
    
    // Formula: parent_current - child_old + child_new
    const newParentValue = currentParentValue - childOldNum + childNewNum;
    
    // Ensure value is not negative (minimum 0)
    return Math.max(0, newParentValue);
  };

  const handleSavePerformance = async () => {
    if (!selectedIssue || !selectedQuarter || quarterValue === "") return;
    
    // Get the performance value from input
    const performanceValue = calculatePerformance();
    
    // Get the performance field name
    const performanceFieldName = getPerformanceFieldName(selectedQuarter);
    
    if (!performanceFieldName) {
      console.error("No performance field name found for quarter:", selectedQuarter);
      return;
    }
    
    try {
      // Get the old performance value before saving
      const oldPerformanceValue = getCustomField(selectedIssue, performanceFieldName);
      const oldPerformanceNum = parseFloat(oldPerformanceValue) || 0;
      const newPerformanceNum = parseFloat(performanceValue) || 0;
      
      // Update the child issue first
      const fieldId = getCustomFieldId(selectedIssue, performanceFieldName);
      const updateData = {
        custom_fields: [{
          id: fieldId,
          name: performanceFieldName,
          value: performanceValue.toString()
        }]
      };
      
      await updateIssue(selectedIssue.id, updateData);
      
      // Now update the parent issue if it exists
      let parentUpdateSuccess = false;
      if (selectedIssue._parent) {
        try {
          // Get fresh parent data to ensure we have latest values
          const freshParent = await getIssue(selectedIssue._parent.id);
          
          if (freshParent) {
            // Calculate new parent performance value
            const newParentPerformance = calculateParentPerformance(
              freshParent,
              performanceFieldName,
              oldPerformanceValue,
              performanceValue.toString()
            );
            
            // Update parent issue
            const parentFieldId = getCustomFieldId(freshParent, performanceFieldName);
            const parentUpdateData = {
              custom_fields: [{
                id: parentFieldId,
                name: performanceFieldName,
                value: newParentPerformance.toString()
              }]
            };
            
            await updateIssue(freshParent.id, parentUpdateData);
            parentUpdateSuccess = true;
            
            console.log(`Parent issue ${freshParent.id} updated: ${performanceFieldName} = ${newParentPerformance}`);
          }
        } catch (parentErr) {
          console.error("Error updating parent issue:", parentErr);
          // Continue even if parent update fails
        }
      }
      
      // Update local state for child issue
      setIssues(prev => prev.map(issue => {
        if (issue.id === selectedIssue.id) {
          return updateCustomFieldValue(issue, performanceFieldName, performanceValue.toString());
        }
        return issue;
      }));
      
      // If parent was updated, refresh parent data in the issues array
      if (parentUpdateSuccess && selectedIssue._parent) {
        setIssues(prev => prev.map(issue => {
          // Check if this issue has the same parent ID
          if (issue._parent && issue._parent.id === selectedIssue._parent.id) {
            // Update the stored parent data
            const updatedIssue = { ...issue };
            updatedIssue._parent = updateCustomFieldValue(
              updatedIssue._parent,
              performanceFieldName,
              calculateParentPerformance(
                updatedIssue._parent,
                performanceFieldName,
                oldPerformanceValue,
                performanceValue.toString()
              ).toString()
            );
            return updatedIssue;
          }
          return issue;
        }));
      }
      
      setShowPopup(false);
      setSelectedIssue(null);
      setSelectedQuarter("");
      setQuarterValue("");
      
      // Show success message
      alert(`Performance saved successfully!${parentUpdateSuccess ? ' Parent issue also updated.' : ''}`);
      
    } catch (err) {
      console.error("Error saving performance:", err);
      alert("Failed to save performance. Please try again.");
    }
  };

  // Check if performance button should be shown for ANY quarter (not just active)
  const isPerformanceButtonVisible = (issue, quarterName) => {
    const quarterVal = getCustomField(issue, quarterName);
    
    // Show button for any quarter that has a target value (not empty or zero)
    return (
      quarterName !== "የዓመቱ እቅድ" && 
      quarterVal !== "" && 
      quarterVal !== "0"
    );
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

  if (loading) {
    return (
      <div style={{ 
        display: "flex", 
        flexDirection: "column",
        justifyContent: "center", 
        alignItems: "center",
        height: "100vh",
        backgroundColor: "#f5f5f5"
      }}>
        {/* Loading Spinner */}
        <div style={{
          width: "50px",
          height: "50px",
          border: "5px solid #f3f3f3",
          borderTop: "5px solid #4CAF50",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
          marginBottom: "20px"
        }}></div>
        
        {/* Loading Text */}
        <div style={{
          fontSize: "18px",
          color: "#555",
          fontWeight: "500",
          marginBottom: "10px"
        }}>
          Loading Progress Data{loadingDots}
        </div>
        
        {/* Subtext */}
        <div style={{
          fontSize: "14px",
          color: "#777",
          textAlign: "center",
          maxWidth: "400px",
          lineHeight: "1.5"
        }}>
          Fetching issues and analyzing hierarchy structure...
        </div>

        {/* CSS for spinner animation */}
        <style>
          {`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>
    );
  }

  const currentQuarter = getCurrentQuarter();
  const fiscalYearStart = getFiscalYear(today);
  const fiscalYearEnd = fiscalYearStart + 1;
  const isJan8_2026 = today.toLocaleDateString() === "1/8/2026";

  return (
    <div
      style={{
        padding: "30px",
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        position: "relative",
      }}
    >
      <h1 style={{ textAlign: "center", marginBottom: "25px", color: "#333" }}>
        Quarterly Progress 
      </h1>

      {/* Current Quarter Info */}
      <div style={{ 
        textAlign: "center", 
        marginBottom: "20px",
        padding: "15px",
        backgroundColor: currentQuarter ? "#e8f5e9" : (isJan8_2026 ? "#fff3e0" : "#ffebee"),
        borderRadius: "5px",
        border: `1px solid ${currentQuarter ? "#4CAF50" : (isJan8_2026 ? "#FF9800" : "#f44336")}`
      }}>
        
        <div>
          <strong>Current Quarter: {currentQuarter || "No active quarter"}</strong>
        </div>
        
        {isJan8_2026 && !currentQuarter && (
          <div style={{ marginTop: "10px", padding: "10px", backgroundColor: "#fff8e1", borderRadius: "5px" }}>
            <div style={{ color: "#EF6C00", fontWeight: "bold" }}>
              Today is the last day of Q2 (2ኛ ሩብዓመት)
            </div>
            <div style={{ fontSize: "12px", color: "#666", marginTop: "5px" }}>
              Q3 starts tomorrow (January 9, 2026)
            </div>
          </div>
        )}
        
        {/* Display quarter dates */}
        <div style={{ 
          marginTop: "15px", 
          padding: "10px", 
          backgroundColor: "#f5f5f5", 
          borderRadius: "5px",
          fontSize: "12px",
          textAlign: "left"
        }}>
        
          {customFieldNames.filter(name => name !== "የዓመቱ እቅድ").map(name => {
            const [start, end] = getQuarterDateRange(name, fiscalYearStart);
            const isActive = isQuarterActive(name);
            
            return (
              <div key={name} style={{ 
                color: isActive ? "#4CAF50" : "#666",
                marginBottom: "3px",
                padding: "3px",
                backgroundColor: isActive ? "#f0fff0" : "transparent",
                borderRadius: "3px",
                borderLeft: isActive ? "3px solid #4CAF50" : "none"
              }}>
                <strong>{name}:</strong> {start?.toLocaleDateString()} - {end?.toLocaleDateString()}
                {isActive && <span style={{ fontWeight: "bold", marginLeft: "10px" }}>✓ ACTIVE</span>}
              </div>
            );
          })}
        </div>
        
        <div style={{ marginTop: "15px", fontSize: "12px", color: "#666" }}>
          Fiscal Year starts with Q1 on May 9, {fiscalYearStart}
        </div>
        
        {/* New note about all quarters being open */}
        <div style={{ 
          marginTop: "15px", 
          padding: "10px", 
          backgroundColor: "#2196F3",
          color: "white",
          borderRadius: "5px",
          fontSize: "14px",
          fontWeight: "bold"
        }}>
          ℹ️ All quarters with target values are now open for performance entry
        </div>
        
        {/* Note about parent-child relationship */}
        <div style={{ 
          marginTop: "15px", 
          padding: "10px", 
          backgroundColor: "#4CAF50",
          color: "white",
          borderRadius: "5px",
          fontSize: "12px",
          fontWeight: "bold"
        }}>
          📊 When you update a child issue's performance, its parent issue's performance will be automatically recalculated
        </div>
      </div>

      {issues.length === 0 ? (
        <div style={{ 
          textAlign: "center", 
          padding: "40px",
          color: "#888",
          fontSize: "16px"
        }}>
          No hierarchical issues found that are assigned to you.
          <div style={{ marginTop: "10px", fontSize: "14px" }}>
            Looking for issues with exactly 2 parent levels (grandparent → parent → child)
          </div>
        </div>
      ) : (
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
                    transition: "background 0.3s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = "#e8f5e9")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor =
                      idx % 2 === 0 ? "#f9f9f9" : "#fff")
                  }
                >
                  <td style={tdStyle}>
                    <div>{issue.subject}</div>
                    {issue._parent && (
                      <div style={{ fontSize: "11px", color: "#666", marginTop: "3px" }}>
                        Parent: {issue._parent.subject}
                      </div>
                    )}
                  </td>

                  {customFieldNames.map((name) => {
                    const val = getCustomField(issue, name);
                    const isVisible = isPerformanceButtonVisible(issue, name);
                    const isCurrentQuarter = name === currentQuarter;
                    const isQ2 = name === "2ኛ ሩብዓመት";
                    const showQ2Button = isJan8_2026 && isQ2 && val !== "" && val !== "0";
                    
                    // Get performance value for this quarter
                    const performanceFieldName = getPerformanceFieldName(name);
                    const performanceValue = performanceFieldName ? 
                      getCustomField(issue, performanceFieldName) : "";
                    
                    return (
                      <td key={name} style={tdStyle}>
                        <div style={{ marginBottom: "8px", position: "relative" }}>
                          <div>
                            {val || "(empty)"}
                          </div>
                          {isCurrentQuarter && (
                            <div style={{
                              position: "absolute",
                              top: "-8px",
                              right: "-8px",
                              backgroundColor: "#FF9800",
                              color: "white",
                              fontSize: "10px",
                              padding: "2px 6px",
                              borderRadius: "3px",
                              fontWeight: "bold"
                            }}>
                              CURRENT
                            </div>
                          )}
                          {showQ2Button && !isCurrentQuarter && (
                            <div style={{
                              position: "absolute",
                              top: "-8px",
                              right: "-8px",
                              backgroundColor: "#FF5722",
                              color: "white",
                              fontSize: "10px",
                              padding: "2px 6px",
                              borderRadius: "3px",
                              fontWeight: "bold"
                            }}>
                              LAST DAY
                            </div>
                          )}
                        </div>
                        
                        {/* Show performance value if it exists */}
                        {performanceValue && (
                          <div style={{
                            fontSize: "12px",
                            color: "#2196F3",
                            fontWeight: "bold",
                            marginBottom: "5px",
                            padding: "3px 8px",
                            backgroundColor: "#E3F2FD",
                            borderRadius: "3px",
                            display: "inline-block"
                          }}>
                            Performance: {performanceValue}
                          </div>
                        )}
                        
                        {isVisible ? (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "5px" }}>
                            <button
                              onClick={() => handlePerformanceClick(issue, name)}
                              style={{
                                padding: "8px 16px",
                                backgroundColor: showQ2Button ? "#FF5722" : 
                                             isCurrentQuarter ? "#FF9800" : "#2196F3",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                cursor: "pointer",
                                fontSize: "14px",
                                fontWeight: "bold",
                                transition: "background-color 0.3s",
                                boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 
                                showQ2Button ? "#E64A19" : 
                                isCurrentQuarter ? "#F57C00" : "#1976D2"}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 
                                showQ2Button ? "#FF5722" : 
                                isCurrentQuarter ? "#FF9800" : "#2196F3"}
                            >
                              {showQ2Button ? "Add Performance (Last Day)" : 
                               isCurrentQuarter ? "Add Performance (Active)" : "Add Performance"}
                            </button>
                            {!isCurrentQuarter && name !== "የዓመቱ እቅድ" && (
                              <div style={{ fontSize: "11px", color: "#666", fontStyle: "italic" }}>
                                Quarter {isQuarterActive(name) ? "active" : "not active"}
                              </div>
                            )}
                          </div>
                        ) : name !== "የዓመቱ እቅድ" ? (
                          <div style={{ fontSize: "12px", color: "#757575", fontStyle: "italic" }}>
                            No target value
                          </div>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Performance Popup */}
      {showPopup && selectedIssue && (
        <div style={{
          position: "fixed",
          top: 70,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: "white",
            padding: "30px",
            borderRadius: "10px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
            width: "500px",
            maxWidth: "90%",
          }}>
            
            <div style={{ marginBottom: "15px" }}>
              <strong>Issue:</strong> {selectedIssue.subject}
            </div>
            
            {selectedIssue._parent && (
              <div style={{ 
                marginBottom: "15px", 
                padding: "10px", 
                backgroundColor: "#f0f8ff",
                borderRadius: "5px",
                borderLeft: "4px solid #4CAF50"
              }}>
                <strong>Parent Issue:</strong> {selectedIssue._parent.subject}
                <div style={{ fontSize: "12px", color: "#666", marginTop: "5px" }}>
                  Parent's performance will be updated automatically
                </div>
              </div>
            )}
            
            <div style={{ marginBottom: "15px" }}>
              <strong>Quarter:</strong> {selectedQuarter}
              {selectedQuarter === currentQuarter && (
                <span style={{ 
                  backgroundColor: "#FF9800", 
                  color: "white", 
                  padding: "2px 8px", 
                  borderRadius: "3px",
                  fontSize: "12px",
                  marginLeft: "10px"
                }}>
                  CURRENT QUARTER
                </span>
              )}
              {selectedQuarter === "2ኛ ሩብዓመት" && isJan8_2026 && (
                <span style={{ 
                  backgroundColor: "#FF5722", 
                  color: "white", 
                  padding: "2px 8px", 
                  borderRadius: "3px",
                  fontSize: "12px",
                  marginLeft: "10px"
                }}>
                  LAST DAY OF Q2
                </span>
              )}
              {selectedQuarter !== currentQuarter && !(selectedQuarter === "2ኛ ሩብዓመት" && isJan8_2026) && (
                <span style={{ 
                  backgroundColor: "#2196F3", 
                  color: "white", 
                  padding: "2px 8px", 
                  borderRadius: "3px",
                  fontSize: "12px",
                  marginLeft: "10px"
                }}>
                  NON-ACTIVE QUARTER
                </span>
              )}
            </div>
            
            <div style={{ 
              marginBottom: "20px", 
              padding: "15px", 
              backgroundColor: "#f0f8ff",
              borderRadius: "5px",
              borderLeft: "4px solid #2196F3"
            }}>
              <div><strong>Quarter Target:</strong> {getCustomField(selectedIssue, selectedQuarter)}</div>
              
              {/* Show current performance value if it exists */}
              {(() => {
                const performanceFieldName = getPerformanceFieldName(selectedQuarter);
                const currentPerformance = performanceFieldName ? 
                  getCustomField(selectedIssue, performanceFieldName) : "";
                
                if (currentPerformance) {
                  return (
                    <div style={{ marginTop: "5px" }}>
                      <strong>Current Performance:</strong> {currentPerformance}
                      <div style={{ fontSize: "12px", color: "#666", marginTop: "3px" }}>
                        Old value that will be subtracted from parent
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
            
            {selectedIssue._parent && (() => {
              const performanceFieldName = getPerformanceFieldName(selectedQuarter);
              const parentCurrentPerformance = performanceFieldName ? 
                getCustomField(selectedIssue._parent, performanceFieldName) : "";
              
              if (parentCurrentPerformance) {
                return (
                  <div style={{ 
                    marginBottom: "15px", 
                    padding: "10px", 
                    backgroundColor: "#e8f5e9",
                    borderRadius: "5px",
                    borderLeft: "4px solid #4CAF50"
                  }}>
                    <div><strong>Parent Current Performance:</strong> {parentCurrentPerformance}</div>
                    <div style={{ fontSize: "12px", color: "#666", marginTop: "3px" }}>
                      Will be updated: parent_current - child_old + child_new
                    </div>
                  </div>
                );
              }
              return null;
            })()}
            
            <div style={{ marginBottom: "15px" }}>
              <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
                Quarter Achievement Value:
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={quarterValue}
                onChange={(e) => {
                  // Allow only numbers and decimal point
                  const input = e.target.value;
                  // Replace comma with dot for decimal separator
                  const normalized = input.replace(/,/g, '.');
                  // Allow numbers, dots, and minus signs
                  if (/^[-]?\d*\.?\d*$/.test(normalized)) {
                    setQuarterValue(normalized);
                  }
                }}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "4px",
                  border: "1px solid #ccc",
                  fontSize: "16px",
                  boxSizing: "border-box",
                }}
                placeholder="Enter achievement value for this quarter (0 is allowed)"
              />
            </div>
            
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
              <button
                onClick={() => {
                  setShowPopup(false);
                  setSelectedIssue(null);
                  setSelectedQuarter("");
                  setQuarterValue("");
                }}
                style={{
                  padding: "10px 20px",
                  backgroundColor: "#f5f5f5",
                  color: "#333",
                  border: "1px solid #ccc",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                Cancel
              </button>
              
              <button
                onClick={handleSavePerformance}
                disabled={quarterValue === "" || isNaN(parseFloat(quarterValue.replace(/[^\d.-]/g, '')))}
                style={{
                  padding: "10px 20px",
                  backgroundColor: quarterValue !== "" ? "#4CAF50" : "#ccc",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: quarterValue !== "" ? "pointer" : "not-allowed",
                  opacity: quarterValue !== "" ? 1 : 0.6,
                  fontSize: "14px",
                  fontWeight: "bold",
                }}
              >
                {quarterValue === "0" ? 
                  "Set Performance to 0" : 
                  `Save Performance as ${quarterValue}`}
                {selectedIssue._parent && " (Update Parent)"}
              </button>
            </div>
          </div>
        </div>
      )}

      {issues.length > 0 && (
        <div style={{ 
          marginTop: "20px", 
          fontSize: "12px", 
          color: "#666",
          textAlign: "center" 
        }}>
          
          <div style={{ marginTop: "5px", fontWeight: "bold", color: "#2196F3" }}>
            ✓ All quarters with target values are enabled for performance entry
          </div>
          <div style={{ marginTop: "5px", fontWeight: "bold", color: "#4CAF50" }}>
            ✓ Parent issues are automatically updated when child performance changes
          </div>
          <div style={{ marginTop: "5px", fontSize: "11px", color: "#888" }}>
            Formula: Parent_new = Parent_current - Child_old + Child_new
          </div>
          <div style={{ marginTop: "5px", fontSize: "11px", color: "#888" }}>
            Fiscal Year {fiscalYearStart}-{fiscalYearEnd} (Q1 starts May 9, {fiscalYearStart})
          </div>
          <div style={{ marginTop: "5px", fontSize: "10px", color: "#999" }}>
            • Blue buttons: Non-active quarters • Orange buttons: Active quarters • Red buttons: Last day of Q2
          </div>
        </div>
      )}
    </div>
  );
}
