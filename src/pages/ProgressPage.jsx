import React, { useEffect, useState } from "react";
import { 
  getIssuesCreatedByUser, 
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
  const [calculatedPercent, setCalculatedPercent] = useState(0);
  const [newDoneRatio, setNewDoneRatio] = useState(0);
  
  const today = new Date();

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const user = await getCurrentUser();
        setCurrentUser(user);
        
        if (!user) return;
        
        const createdIssues = await getIssuesCreatedByUser(user.id);
        const filteredIssues = [];
        
        for (const issue of createdIssues) {
          try {
            if (issue.parent && issue.parent.id) {
              const directParent = await getIssue(issue.parent.id);
              
              if (directParent && directParent.parent && directParent.parent.id) {
                const grandparent = await getIssue(directParent.parent.id);
                
                if (grandparent && !grandparent.parent) {
                  const fullIssue = await getIssue(issue.id);
                  filteredIssues.push(fullIssue);
                }
              }
            }
          } catch (err) {
            console.error(`Error checking hierarchy for issue ${issue.id}:`, err);
          }
        }
        
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

  const handleProgressChange = async (issueId, newDoneRatio) => {
    setIssues((prev) =>
      prev.map((i) => (i.id === issueId ? { ...i, done_ratio: newDoneRatio } : i))
    );
    await updateIssue(issueId, { done_ratio: newDoneRatio });
  };

  const mapFromQuarterRange = (quarterName, doneRatio) => {
    const [min, max] = getQuarterProgressRange(quarterName);
    if (max === min) return 0;
    return Math.round(((doneRatio - min) / (max - min)) * 100);
  };

  const handlePerformanceClick = (issue, quarterName) => {
    setSelectedIssue(issue);
    setSelectedQuarter(quarterName);
    setQuarterValue("");
    setCalculatedPercent(0);
    setNewDoneRatio(0);
    setShowPopup(true);
  };

  const calculatePerformance = () => {
    if (!quarterValue || !selectedIssue) return;
    
    // Parse quarter value - allow 0
    const quarterTargetStr = quarterValue.toString().replace(/[^\d.-]/g, '');
    const quarterTarget = parseFloat(quarterTargetStr);
    const annualPlan = getCustomFieldAsNumber(selectedIssue, "የዓመቱ እቅድ");
    
    console.log("Calculation values:", {
      quarterTarget,
      annualPlan,
      quarterValueInput: quarterValue,
      isQuarterTargetZero: quarterTarget === 0
    });
    
    // Allow 0 as valid input
    if (annualPlan > 0 && !isNaN(quarterTarget)) {
      // Formula: (quarter_input_value × 100) / annual_plan
      const quarterPercent = (quarterTarget * 100) / annualPlan;
      console.log("Quarter percent calculated:", quarterPercent);
      
      // Simply use the calculated percentage as the new done ratio
      setCalculatedPercent(quarterPercent);
      setNewDoneRatio(Math.min(Math.round(quarterPercent), 100));
    } else {
      // Reset if invalid values (annual plan must be > 0)
      setCalculatedPercent(0);
      setNewDoneRatio(0);
    }
  };

  // Add a useEffect to recalculate when quarterValue changes
  useEffect(() => {
    if (selectedIssue && quarterValue !== "") {
      calculatePerformance();
    }
  }, [quarterValue, selectedIssue]);

  const handleSavePerformance = () => {
    // Allow saving even if newDoneRatio is 0
    if (!selectedIssue || !selectedQuarter || quarterValue === "" || newDoneRatio === undefined) return;
    
    handleProgressChange(selectedIssue.id, newDoneRatio);
    
    setShowPopup(false);
    setSelectedIssue(null);
    setSelectedQuarter("");
    setQuarterValue("");
    setCalculatedPercent(0);
    setNewDoneRatio(0);
  };

  const isPerformanceButtonActive = (issue, quarterName) => {
    const quarterVal = getCustomField(issue, quarterName);
    const currentQuarter = getCurrentQuarter();
    
    const isJan8_2026 = today.toLocaleDateString() === "1/8/2026";
    const isQ2 = quarterName === "2ኛ ሩብዓመት";
    const showQ2Button = isJan8_2026 && isQ2 && quarterVal !== "" && quarterVal !== "0";
    
    return (
      quarterName !== "የዓመቱ እቅድ" && 
      quarterVal !== "" && 
      quarterVal !== "0" &&
      (quarterName === currentQuarter || showQ2Button)
    );
  };

  const getCurrentQuarterProgress = (doneRatio, quarterName) => {
    return mapFromQuarterRange(quarterName, doneRatio);
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
        padding: "30px", 
        display: "flex", 
        justifyContent: "center", 
        alignItems: "center",
        height: "200px" 
      }}>
        <div>Loading progress data...</div>
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
        <div style={{ fontWeight: "bold", color: currentQuarter ? "#2E7D32" : (isJan8_2026 ? "#EF6C00" : "#d32f2f") }}>
          Ethiopian Fiscal Year Information
        </div>
        <div>Current Date: {today.toLocaleDateString()}</div>
        <div>Fiscal Year: {fiscalYearStart}-{fiscalYearEnd}</div>
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
          <div style={{ fontWeight: "bold", marginBottom: "5px" }}>
            Quarter Dates for Fiscal Year {fiscalYearStart}-{fiscalYearEnd}:
          </div>
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
      </div>

      {issues.length === 0 ? (
        <div style={{ 
          textAlign: "center", 
          padding: "40px",
          color: "#888",
          fontSize: "16px"
        }}>
          No hierarchical issues found that were created by you.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...thStyle, borderTopLeftRadius: "10px" }}>Subject</th>
                <th style={thStyle}>Current %</th>
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
                  </td>
                  
                  <td style={tdStyle}>
                    <div style={{ 
                      fontWeight: "bold", 
                      color: issue.done_ratio > 50 ? "#4CAF50" : "#2196F3" 
                    }}>
                      {issue.done_ratio || 0}%
                    </div>
                  </td>

                  {customFieldNames.map((name) => {
                    const val = getCustomField(issue, name);
                    const isActive = isPerformanceButtonActive(issue, name);
                    const currentQuarterProgress = getCurrentQuarterProgress(issue.done_ratio || 0, name);
                    const isCurrentQuarter = name === currentQuarter;
                    const isQ2 = name === "2ኛ ሩብዓመት";
                    const showQ2Button = isJan8_2026 && isQ2 && val !== "" && val !== "0";
                    
                    return (
                      <td key={name} style={tdStyle}>
                        <div style={{ marginBottom: "8px", position: "relative" }}>
                          <div>{val || "(empty)"}</div>
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
                        
                        {(isActive || showQ2Button) ? (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "5px" }}>
                            <div style={{ fontSize: "12px", color: "#666" }}>
                              Current Progress: {issue.done_ratio || 0}%
                            </div>
                            <button
                              onClick={() => handlePerformanceClick(issue, name)}
                              style={{
                                padding: "8px 16px",
                                backgroundColor: showQ2Button ? "#FF5722" : "#FF9800",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                cursor: "pointer",
                                fontSize: "14px",
                                fontWeight: "bold",
                                transition: "background-color 0.3s",
                                boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = showQ2Button ? "#E64A19" : "#F57C00"}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = showQ2Button ? "#FF5722" : "#FF9800"}
                            >
                              {showQ2Button ? "Add Performance (Last Day)" : "Add Performance"}
                            </button>
                          </div>
                        ) : name !== "የዓመቱ እቅድ" && val !== "" && val !== "0" && !isCurrentQuarter ? (
                          <div style={{ fontSize: "12px", color: "#757575", fontStyle: "italic" }}>
                            Quarter not active
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
          top: 0,
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
            width: "450px",
            maxWidth: "90%",
          }}>
            <h3 style={{ marginBottom: "20px", color: "#333" }}>
              Add Performance Achievement
            </h3>
            
            <div style={{ marginBottom: "15px" }}>
              <strong>Issue:</strong> {selectedIssue.subject}
            </div>
            
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
            </div>
            
            <div style={{ 
              marginBottom: "20px", 
              padding: "15px", 
              backgroundColor: "#f0f8ff",
              borderRadius: "5px",
              borderLeft: "4px solid #2196F3"
            }}>
              <div><strong>Annual Plan:</strong> {getCustomField(selectedIssue, "የዓመቱ እቅድ")} (Value: {getCustomFieldAsNumber(selectedIssue, "የዓመቱ እቅድ")})</div>
              <div><strong>Current Done Ratio:</strong> {selectedIssue.done_ratio || 0}%</div>
            </div>
            
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
              <div style={{ fontSize: "12px", color: "#666", marginTop: "5px" }}>
                Enter numeric value (e.g., 0, 1000, or 1000.50)
              </div>
            </div>
            
            {quarterValue !== "" && !isNaN(parseFloat(quarterValue.replace(/[^\d.-]/g, ''))) && (
              <div style={{
                marginBottom: "20px",
                padding: "15px",
                backgroundColor: "#f5f5f5",
                borderRadius: "5px",
                border: "1px solid #ddd",
              }}>
                <div style={{ marginBottom: "10px", fontWeight: "bold", color: "#2196F3" }}>
                  Performance Calculation
                </div>
                <div style={{ fontSize: "14px", color: "#666", marginBottom: "5px" }}>
                  <div>Quarter Achievement: {quarterValue}</div>
                  <div>Annual Plan: {getCustomFieldAsNumber(selectedIssue, "የዓመቱ እቅድ")}</div>
                  {getCustomFieldAsNumber(selectedIssue, "የዓመቱ እቅድ") > 0 ? (
                    <div style={{ margin: "5px 0" }}>
                      ({quarterValue} × 100) ÷ {getCustomFieldAsNumber(selectedIssue, "የዓመቱ እቅድ")} = <strong>{calculatedPercent.toFixed(2)}%</strong>
                    </div>
                  ) : (
                    <div style={{ margin: "5px 0", color: "#f44336" }}>
                      Cannot calculate: Annual plan must be greater than 0
                    </div>
                  )}
                </div>
                
                <div style={{ 
                  marginTop: "10px", 
                  paddingTop: "10px", 
                  borderTop: "1px dashed #ddd" 
                }}>
                  <div style={{ fontSize: "14px", marginBottom: "5px" }}>
                    <strong>Setting New Done Ratio:</strong>
                  </div>
                  <div style={{ fontSize: "14px", color: "#666" }}>
                    Calculated: {calculatedPercent.toFixed(2)}% → Rounded: {newDoneRatio}%
                  </div>
                  <div style={{ 
                    fontSize: "14px", 
                    color: newDoneRatio === 0 ? "#666" : "#4CAF50",
                    fontWeight: "bold",
                    marginTop: "5px"
                  }}>
                    New Done Ratio: {newDoneRatio}%
                  </div>
                  <div style={{ 
                    fontSize: "12px", 
                    color: "#666",
                    fontStyle: "italic",
                    marginTop: "5px"
                  }}>
                    {newDoneRatio === 0 ? 
                      "(This will set done ratio to 0%)" : 
                      `(This will replace the current done ratio of ${selectedIssue.done_ratio || 0}%)`}
                  </div>
                </div>
              </div>
            )}
            
            {quarterValue !== "" && (isNaN(parseFloat(quarterValue.replace(/[^\d.-]/g, ''))) || getCustomFieldAsNumber(selectedIssue, "የዓመቱ እቅድ") <= 0) && (
              <div style={{
                marginBottom: "20px",
                padding: "15px",
                backgroundColor: "#fff8e1",
                borderRadius: "5px",
                border: "1px solid #ffd54f",
              }}>
                <div style={{ color: "#ff6f00", fontWeight: "bold" }}>
                  Cannot Calculate
                </div>
                <div style={{ fontSize: "14px", color: "#666", marginTop: "5px" }}>
                  Please check if:
                  <ul style={{ marginLeft: "20px", marginTop: "5px" }}>
                    <li>Quarter achievement value is valid number</li>
                    <li>Annual plan value is greater than 0</li>
                  </ul>
                </div>
              </div>
            )}
            
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
              <button
                onClick={() => {
                  setShowPopup(false);
                  setSelectedIssue(null);
                  setSelectedQuarter("");
                  setQuarterValue("");
                  setCalculatedPercent(0);
                  setNewDoneRatio(0);
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
                {newDoneRatio === 0 ? 
                  `Set to 0% (from ${selectedIssue.done_ratio || 0}%)` : 
                  `Save Performance (${selectedIssue.done_ratio || 0}% → ${newDoneRatio}%)`}
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
          <div>Showing {issues.length} issue(s) with grandparent → parent → child hierarchy</div>
          <div style={{ marginTop: "5px", fontWeight: "bold", color: currentQuarter ? "#2E7D32" : "#EF6C00" }}>
            {currentQuarter 
              ? `Performance buttons enabled for current quarter (${currentQuarter})`
              : isJan8_2026
                ? "January 8, 2026 is the last day of Q2. Special button shown for Q2."
                : `No active quarter detected for ${today.toLocaleDateString()}`}
          </div>
          <div style={{ marginTop: "5px", fontSize: "11px", color: "#888" }}>
            Fiscal Year {fiscalYearStart}-{fiscalYearEnd} (Q1 starts May 9, {fiscalYearStart})
          </div>
        </div>
      )}
    </div>
  );
}