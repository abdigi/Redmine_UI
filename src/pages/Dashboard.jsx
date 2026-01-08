import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { 
  getCurrentUser, 
  getIssuesCreatedByUser,
  getIssue
} from "../api/redmineApi";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LabelList,
  Cell
} from "recharts";

// Cache for already fetched issues to avoid duplicate API calls
const issueCache = new Map();

// Utility functions
const getProgressColor = (percentage) => {
  if (percentage === 100) return "#2e7d32";
  if (percentage >= 75) return "#4caf50";
  if (percentage >= 50) return "#ff9800";
  if (percentage > 0) return "#ff5722";
  return "#f44336";
};

const truncateText = (text, maxLength = 20) => {
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
};

// ============================
// PERIOD FILTERING FUNCTIONS
// ============================

// Helper function to check if a quarterly field has a valid value
const hasValidQuarterValue = (issue, quarter) => {
  const value = getField(issue, quarter);
  return value && value !== "0" && value !== "" && value !== "0.0" && value !== "0.00";
};

// Get which specific quarters have valid values
const getValidQuartersList = (issue) => {
  const quarters = ["1ኛ ሩብዓመት", "2ኛ ሩብዓመት", "3ኛ ሩብዓመት", "4ኛ ሩብዓመት"];
  return quarters.filter(quarter => hasValidQuarterValue(issue, quarter));
};

// Count how many quarters have valid values for an issue
const countValidQuarters = (issue) => {
  return getValidQuartersList(issue).length;
};

// Get quarter ranges based on which specific quarters are valid
const getQuarterRanges = (validQuartersList, targetQuarter) => {
  const validQuartersCount = validQuartersList.length;
  
  if (validQuartersCount === 4) {
    // All 4 quarters valid - equal 25% each
    const ranges = {
      "1ኛ ሩብዓመት": { start: 0, end: 25 },
      "2ኛ ሩብዓመት": { start: 25, end: 50 },
      "3ኛ ሩብዓመት": { start: 50, end: 75 },
      "4ኛ ሩብዓመት": { start: 75, end: 100 }
    };
    return ranges[targetQuarter] || { start: 0, end: 100 };
  }
  
  if (validQuartersCount === 3) {
    // 3 quarters valid - equal 33.33% each
    const segment = 100 / 3;
    
    // Map each valid quarter to a range based on its position in the list
    const ranges = {};
    validQuartersList.forEach((quarter, index) => {
      ranges[quarter] = {
        start: index * segment,
        end: (index + 1) * segment
      };
    });
    
    return ranges[targetQuarter] || { start: 0, end: 100 };
  }
  
  if (validQuartersCount === 2) {
    // 2 quarters valid - equal 50% each
    const segment = 100 / 2;
    
    // Map each valid quarter to a range based on its position in the list
    const ranges = {};
    validQuartersList.forEach((quarter, index) => {
      ranges[quarter] = {
        start: index * segment,
        end: (index + 1) * segment
      };
    });
    
    return ranges[targetQuarter] || { start: 0, end: 100 };
  }
  
  if (validQuartersCount === 1) {
    // 1 quarter valid - use full range
    return { start: 0, end: 100 };
  }
  
  // Default fallback
  return { start: 0, end: 100 };
};

// Helper function to get quarter distribution info
const getQuarterDistributionInfo = (issue, period) => {
  if (!period.includes("ሩብዓመት")) return null;
  
  const validQuartersList = getValidQuartersList(issue);
  const validQuartersCount = validQuartersList.length;
  const range = getQuarterRanges(validQuartersList, period);
  
  return {
    validQuartersCount,
    validQuartersList,
    range,
    hasValidValue: hasValidQuarterValue(issue, period)
  };
};

// Map progress based on selected period and quarterly distribution
const mapProgress = (done, period, issue = null) => {
  if (!done && done !== 0) return 0;
  
  // For non-quarterly periods, use existing logic
  if (period === "Yearly") return done;
  
  if (period === "6 Months") {
    // For 6 months, target is 50% of yearly
    return done <= 50 ? Math.round((done / 50) * 100) : 100;
  }
  
  if (period === "9 Months") {
    // For 9 months, target is 75% of yearly
    return done <= 75 ? Math.round((done / 75) * 100) : 100;
  }

  // Handle quarterly periods with dynamic distribution
  if (period.includes("ሩብዓመት")) {
    // If no issue provided, use old logic as fallback
    if (!issue) {
      switch (period) {
        case "1ኛ ሩብዓመት":
          return done <= 25 ? Math.round((done / 25) * 100) : 100;
        case "2ኛ ሩብዓመት":
          return done >= 26 && done <= 50
            ? Math.round(((done - 26) / 24) * 100)
            : done > 50
            ? 100
            : 0;
        case "3ኛ ሩብዓመት":
          return done >= 51 && done <= 75
            ? Math.round(((done - 51) / 24) * 100)
            : done > 75
            ? 100
            : 0;
        case "4ኛ ሩብዓመት":
          return done >= 76 && done <= 100
            ? Math.round(((done - 76) / 24) * 100)
            : done === 100
            ? 100
            : 0;
        default:
          return 0;
      }
    }
    
    // Check if this specific quarter has a valid value
    const hasValidValue = hasValidQuarterValue(issue, period);
    
    // If this quarter doesn't have a valid value, return 0
    if (!hasValidValue) return 0;
    
    // Get which specific quarters are valid
    const validQuartersList = getValidQuartersList(issue);
    
    // Get the range for this quarter based on which quarters are valid
    const range = getQuarterRanges(validQuartersList, period);
    
    // Calculate progress within this quarter's range
    if (done <= range.start) {
      return 0;
    } else if (done >= range.end) {
      return 100;
    } else {
      // Map done percentage to 0-100 within this quarter's range
      const progressInRange = ((done - range.start) / (range.end - range.start)) * 100;
      return Math.round(progressInRange);
    }
  }
  
  return 0;
};

// Get custom field value from issue
const getField = (issue, fieldName) => {
  const field = issue.custom_fields?.find((f) => f.name === fieldName);
  return field?.value;
};

// Helper function to get weight with default value
const getWeight = (issue) => {
  const weightValue = getField(issue, "ክብደት");
  if (!weightValue || weightValue === "0" || weightValue === "") {
    return 1; // Default weight
  }
  return Number(weightValue) || 1;
};

// Helper function to check if target value is valid
const isValidTargetValue = (targetValue, period) => {
  if (!targetValue) return false;
  
  const trimmed = targetValue.toString().trim();
  
  // Check for empty string or various zero representations
  if (trimmed === "" || 
      trimmed === "0" || 
      trimmed === "0.0" || 
      trimmed === "0.00" ||
      trimmed === "0.000" ||
      trimmed.toLowerCase() === "null" ||
      trimmed.toLowerCase() === "undefined" ||
      trimmed.toLowerCase() === "nan") {
    return false;
  }
  
  // Try to parse as a number
  const numValue = parseFloat(trimmed);
  
  // Check if it's a valid number and greater than 0
  if (isNaN(numValue) || numValue <= 0) {
    return false;
  }
  
  return true;
};

// Filter issues by selected period - STRICT VERSION
const filterIssuesByPeriod = (issues, period) => {
  if (period === "Yearly") {
    // For yearly, only include issues with valid "የዓመቱ እቅድ" value
    return issues.filter(issue => {
      const yearlyValue = getField(issue, "የዓመቱ እቅድ");
      return isValidTargetValue(yearlyValue, period);
    });
  }

  if (period === "6 Months") {
    // For 6 months, include issues where either Q1 OR Q2 has a valid value
    return issues.filter(issue => {
      const q1 = getField(issue, "1ኛ ሩብዓመት");
      const q2 = getField(issue, "2ኛ ሩብዓመት");
      
      // Check if either quarter has a valid value
      const hasQ1 = isValidTargetValue(q1, "1ኛ ሩብዓመት");
      const hasQ2 = isValidTargetValue(q2, "2ኛ ሩብዓመት");
      
      return hasQ1 || hasQ2;
    });
  }

  if (period === "9 Months") {
    // For 9 months, include issues where Q1, Q2, OR Q3 has a valid value
    return issues.filter(issue => {
      const q1 = getField(issue, "1ኛ ሩብዓመት");
      const q2 = getField(issue, "2ኛ ሩብዓመት");
      const q3 = getField(issue, "3ኛ ሩብዓመት");
      
      // Check if any quarter has a valid value
      const hasQ1 = isValidTargetValue(q1, "1ኛ ሩብዓመት");
      const hasQ2 = isValidTargetValue(q2, "2ኛ ሩብዓመት");
      const hasQ3 = isValidTargetValue(q3, "3ኛ ሩብዓመት");
      
      return hasQ1 || hasQ2 || hasQ3;
    });
  }

  // For quarterly periods - only include issues with valid value for this specific quarter
  return issues.filter(issue => {
    const quarterValue = getField(issue, period);
    return isValidTargetValue(quarterValue, period);
  });
};

// Get target value based on selected period
const getTargetValue = (issue, period) => {
  if (!issue) return "0";
  
  if (period === "Yearly") {
    return getField(issue, "የዓመቱ እቅድ") || "0";
  }
  
  if (period === "6 Months") {
    const q1 = parseFloat(getField(issue, "1ኛ ሩብዓመት") || "0") || 0;
    const q2 = parseFloat(getField(issue, "2ኛ ሩብዓመት") || "0") || 0;
    const sum = q1 + q2;
    return sum > 0 ? sum.toString() : "0";
  }
  
  if (period === "9 Months") {
    const q1 = parseFloat(getField(issue, "1ኛ ሩብዓመት") || "0") || 0;
    const q2 = parseFloat(getField(issue, "2ኛ ሩብዓመት") || "0") || 0;
    const q3 = parseFloat(getField(issue, "3ኛ ሩብዓመት") || "0") || 0;
    const sum = q1 + q2 + q3;
    return sum > 0 ? sum.toString() : "0";
  }
  
  // For quarterly periods
  return getField(issue, period) || "0";
};

// Cache wrapper for getIssue with timeout
const cachedGetIssue = async (issueId) => {
  if (issueCache.has(issueId)) {
    return issueCache.get(issueId);
  }
  
  try {
    const issue = await getIssue(issueId);
    issueCache.set(issueId, issue);
    
    // Cache for 5 minutes
    setTimeout(() => {
      issueCache.delete(issueId);
    }, 5 * 60 * 1000);
    
    return issue;
  } catch (error) {
    console.error(`Error fetching issue ${issueId}:`, error);
    return null;
  }
};

// Process single issue efficiently
const processSingleIssue = async (issue) => {
  // Check if we already processed this issue
  const cacheKey = `issue-${issue.id}`;
  if (issueCache.has(cacheKey)) {
    return issueCache.get(cacheKey);
  }
  
  // Quick check: if no parent, skip hierarchy check
  if (!issue.parent || !issue.parent.id) {
    return null;
  }
  
  try {
    // Fetch parent issue
    const parentIssue = await cachedGetIssue(issue.parent.id);
    if (!parentIssue) return null;
    
    // If parent has no parent, this is only 2-level, skip
    if (!parentIssue.parent || !parentIssue.parent.id) {
      return null;
    }
    
    // Fetch grandparent issue
    const grandParentIssue = await cachedGetIssue(parentIssue.parent.id);
    if (!grandParentIssue) return null;
    
    // Check if grandparent has no parent (true 3-level hierarchy)
    if (!grandParentIssue.parent) {
      const result = { ...issue, hierarchyValidated: true };
      issueCache.set(cacheKey, result);
      return result;
    }
    
    return null;
  } catch (error) {
    console.error(`Error processing issue ${issue.id}:`, error);
    return null;
  }
};

// Batch process issues to minimize API calls
const batchProcessIssues = async (issues, batchSize = 5) => {
  const results = [];
  
  for (let i = 0; i < issues.length; i += batchSize) {
    const batch = issues.slice(i, i + batchSize);
    const batchPromises = batch.map(issue => processSingleIssue(issue));
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults.filter(Boolean));
  }
  
  return results;
};

const Dashboard = () => {
  const [issues, setIssues] = useState([]);
  const [user, setUser] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState("Yearly");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [filterStatus, setFilterStatus] = useState("all");
  const [activeTab, setActiveTab] = useState("performance");

  // Use refs to avoid unnecessary re-renders
  const abortControllerRef = useRef(null);
  const isMountedRef = useRef(true);

  const periodOptions = [
    "Yearly",
    "1ኛ ሩብዓመት",
    "2ኛ ሩብዓመት", 
    "3ኛ ሩብዓመት",
    "4ኛ ሩብዓመት",
    "6 Months",
    "9 Months"
  ];

  // Simplified load function without progress tracking
  const loadIssues = useCallback(async (userId) => {
    if (!isMountedRef.current) return [];
    
    try {
      // Get all issues
      const allIssues = await getIssuesCreatedByUser(userId);
      
      if (allIssues.length === 0) return [];
      
      // Process all issues in batches
      const validIssues = await batchProcessIssues(allIssues, 5);
      
      return validIssues;
    } catch (error) {
      console.error("Error loading issues:", error);
      throw error;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    abortControllerRef.current = new AbortController();

    async function loadDashboardData() {
      if (!isMountedRef.current) return;
      
      setLoading(true);
      setError(null);
      
      try {
        // 1. Load current user
        const currentUser = await getCurrentUser();
        if (!currentUser) {
          setError("Failed to load user data");
          setLoading(false);
          return;
        }

        setUser(currentUser);
        
        // 2. Load issues
        const validIssues = await loadIssues(currentUser.id);
        
        if (!isMountedRef.current) return;
        
        // 3. Extract unique statuses
        const uniqueStatuses = Array.from(
          new Map(
            validIssues
              .filter(issue => issue.status)
              .map(issue => [issue.status.id, issue.status])
          ).values()
        );
        
        setStatuses(uniqueStatuses);
        setIssues(validIssues);
        
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error("Error loading dashboard:", error);
          setError(error.message || "Failed to load dashboard data");
        }
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    }

    loadDashboardData();

    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [loadIssues]);

  // Memoized filtered issues - IMPORTANT: This should only include issues with valid targets
  const filteredIssues = useMemo(() => {
    let filtered = filterIssuesByPeriod(issues, selectedPeriod);
    
    if (filterStatus !== "all") {
      filtered = filtered.filter(issue => {
        const matchesStatus = filterStatus === "all" || 
          issue.status?.id?.toString() === filterStatus;
        
        return matchesStatus;
      });
    }
    
    return filtered;
  }, [issues, selectedPeriod, filterStatus]);

  // Calculate overall progress using the new mapProgress with issue parameter
  const overallProgress = useMemo(() => {
    if (filteredIssues.length === 0) return 0;
    
    let totalWeight = 0;
    let weightedProgress = 0;

    filteredIssues.forEach((issue) => {
      const weight = getWeight(issue);
      const progress = mapProgress(issue.done_ratio || 0, selectedPeriod, issue);
      totalWeight += weight;
      weightedProgress += progress * weight;
    });

    return totalWeight > 0 ? Math.round(weightedProgress / totalWeight) : 0;
  }, [filteredIssues, selectedPeriod]);

  // Prepare chart data - ONLY include issues with valid targets
  const chartData = useMemo(() => {
    const chartDataMap = new Map();
    
    filteredIssues.forEach((issue) => {
      // Double-check that this issue has a valid target for the selected period
      const targetValue = getTargetValue(issue, selectedPeriod);
      if (!isValidTargetValue(targetValue, selectedPeriod)) {
        // Skip this issue if it doesn't have a valid target
        return;
      }
      
      if (!chartDataMap.has(issue.id)) {
        const assignedTo = issue.assigned_to?.name || "Unassigned";
        const projectName = issue.project?.name || "No Project";
        const validQuartersList = getValidQuartersList(issue);
        const validQuartersCount = validQuartersList.length;
        
        const displayText = `#${issue.id}: ${issue.subject}`;
        const truncatedDisplay = displayText.length > 60 
          ? displayText.substring(0, 57) + "..." 
          : displayText;
        
        const progress = mapProgress(issue.done_ratio || 0, selectedPeriod, issue);
        
        chartDataMap.set(issue.id, {
          id: issue.id,
          name: truncatedDisplay,
          fullName: issue.subject,
          progress: progress,
          status: issue.status?.name,
          assignedTo: assignedTo,
          project: projectName,
          tracker: issue.tracker?.name || "Unknown",
          doneRatio: issue.done_ratio || 0,
          parentId: issue.parent?.id,
          color: getProgressColor(progress),
          validQuartersCount: validQuartersCount,
          validQuartersList: validQuartersList,
          targetValue: targetValue,
          quarterDistribution: getQuarterDistributionInfo(issue, selectedPeriod)
        });
      }
    });

    const data = Array.from(chartDataMap.values());
    return data.sort((a, b) => b.progress - a.progress);
  }, [filteredIssues, selectedPeriod]);

  // Dynamic chart height
  const chartHeight = Math.max(400, chartData.length * 60);

  // Prepare table data - ONLY include issues with valid targets (same as chart)
  const tableData = useMemo(() => {
    // Filter issues to ensure they have valid targets (same logic as chart)
    const validIssues = filteredIssues.filter(issue => {
      const targetValue = getTargetValue(issue, selectedPeriod);
      return isValidTargetValue(targetValue, selectedPeriod);
    });
    
    return validIssues.map(issue => {
      const targetValue = getTargetValue(issue, selectedPeriod);
      const achievement = mapProgress(issue.done_ratio || 0, selectedPeriod, issue);
      const weight = getWeight(issue);
      
      return {
        id: issue.id,
        subject: issue.subject,
        status: issue.status?.name || "Unknown",
        assignedTo: issue.assigned_to?.name || "Unassigned",
        targetValue: targetValue,
        progress: achievement,
        weight: weight,
        doneRatio: issue.done_ratio || 0,
        tracker: issue.tracker?.name || "Unknown",
        hasValidTarget: true
      };
    });
  }, [filteredIssues, selectedPeriod]);

  const handleRefresh = async () => {
    // Clear caches
    issueCache.clear();
    
    setLoading(true);
    setIssues([]); // Clear existing issues
    
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) return;
      
      setUser(currentUser);
      const validIssues = await loadIssues(currentUser.id);
      setIssues(validIssues);
      
      // Update statuses
      const uniqueStatuses = Array.from(
        new Map(
          validIssues
            .filter(issue => issue.status)
            .map(issue => [issue.status.id, issue.status])
        ).values()
      );
      setStatuses(uniqueStatuses);
      
    } catch (error) {
      console.error("Error refreshing:", error);
      setError("Failed to refresh data");
    } finally {
      setLoading(false);
    }
  };

  // Tab navigation component
  const TabNavigation = () => (
    <div style={{
      display: 'flex',
      borderBottom: '1px solid #e0e0e0',
      marginBottom: '30px',
      backgroundColor: '#fff',
      borderRadius: '8px 8px 0 0',
      overflow: 'hidden'
    }}>
      <button
        onClick={() => setActiveTab('performance')}
        style={{
          padding: '15px 30px',
          backgroundColor: activeTab === 'performance' ? '#1976d2' : '#f8f9fa',
          color: activeTab === 'performance' ? 'white' : '#333',
          border: 'none',
          cursor: 'pointer',
          fontSize: '16px',
          fontWeight: 'bold',
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          transition: 'all 0.3s ease',
          borderRight: '1px solid #e0e0e0'
        }}
      >
        <span style={{ fontSize: '20px' }}>📊</span>
        Performance Overview
      </button>
      <button
        onClick={() => setActiveTab('analysis')}
        style={{
          padding: '15px 30px',
          backgroundColor: activeTab === 'analysis' ? '#1976d2' : '#f8f9fa',
          color: activeTab === 'analysis' ? 'white' : '#333',
          border: 'none',
          cursor: 'pointer',
          fontSize: '16px',
          fontWeight: 'bold',
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          transition: 'all 0.3s ease'
        }}
      >
        <span style={{ fontSize: '20px' }}>🔍</span>
        Detailed Analysis
      </button>
    </div>
  );

  // Filter Controls Component
  const FilterControls = () => (
    <div style={{
      display: 'flex',
      gap: '15px',
      alignItems: 'center',
      flexWrap: 'wrap',
      marginBottom: '25px',
      padding: '15px',
      backgroundColor: '#f8f9fa',
      borderRadius: '8px',
      border: '1px solid #e0e0e0'
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: '200px' }}>
        <label style={{ fontSize: '12px', color: '#666', marginBottom: '5px', fontWeight: 'bold' }}>
          Period Filter
        </label>
        <select
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value)}
          style={{
            padding: '10px',
            borderRadius: '6px',
            border: '2px solid #ddd',
            backgroundColor: '#fff',
            fontWeight: 'bold',
            fontSize: '14px'
          }}
        >
          {periodOptions.map(period => (
            <option key={period} value={period}>{period}</option>
          ))}
        </select>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: '200px' }}>
        <label style={{ fontSize: '12px', color: '#666', marginBottom: '5px', fontWeight: 'bold' }}>
          Status Filter
        </label>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{
            padding: '10px',
            borderRadius: '6px',
            border: '2px solid #ddd',
            backgroundColor: '#fff',
            fontSize: '14px'
          }}
        >
          <option value="all">All Statuses</option>
          {statuses.map(status => (
            <option key={status.id} value={status.id}>
              {status.name}
            </option>
          ))}
        </select>
      </div>
      
      <div style={{ marginLeft: 'auto' }}>
        <button
          onClick={handleRefresh}
          style={{
            padding: '10px 20px',
            backgroundColor: '#f5f5f5',
            border: '1px solid #ddd',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: 'bold',
            fontSize: '14px'
          }}
        >
          🔄 Refresh Data
        </button>
      </div>
    </div>
  );

  // Simplified loading component
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '80vh',
        flexDirection: 'column'
      }}>
        <div style={{
          width: '50px',
          height: '50px',
          border: '5px solid #f3f3f3',
          borderTop: '5px solid #3498db',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '20px'
        }}></div>
        <p style={{ fontSize: '18px', color: '#666' }}>
          Loading dashboard data...
        </p>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (error && issues.length === 0) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '80vh',
        flexDirection: 'column',
        textAlign: 'center',
        padding: '20px'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>⚠️</div>
        <h2 style={{ color: '#d32f2f', marginBottom: '10px' }}>Error Loading Dashboard</h2>
        <p style={{ marginBottom: '20px', color: '#666' }}>{error}</p>
        <button
          onClick={handleRefresh}
          style={{
            padding: '10px 20px',
            backgroundColor: '#1976d2',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '16px'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", fontFamily: "Arial, sans-serif", padding: "20px", maxWidth: "1400px", margin: "0 auto" }}>
      
      {/* Header - Simplified */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '30px',
        flexWrap: 'wrap',
        gap: '20px'
      }}>
        <h1 style={{ margin: 0, color: '#333' }}>My Issues Dashboard</h1>
        <div style={{ 
          fontSize: '14px', 
          color: '#666', 
          backgroundColor: '#f0f7ff',
          padding: '8px 16px',
          borderRadius: '20px',
          fontWeight: '500'
        }}>
          {user && `${user.firstname} ${user.lastname}`}
        </div>
      </div>

      {/* Period Info Banner */}
      <div style={{
        backgroundColor: '#e3f2fd',
        padding: '10px 15px',
        borderRadius: '8px',
        marginBottom: '20px',
        borderLeft: '4px solid #1976d2'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong>Active Period:</strong> {selectedPeriod}
            {selectedPeriod === "Yearly" && " (የዓመቱ እቅድ)"}
            {selectedPeriod === "6 Months" && " (1ኛ ሩብዓመት + 2ኛ ሩብዓመት)"}
            {selectedPeriod === "9 Months" && " (1ኛ ሩብዓመት + 2ኛ ሩብዓመት + 3ኛ ሩብዓመት)"}
            {selectedPeriod.includes("ሩብዓመት") && " • Smart quarter mapping active"}
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            {issues.length} total issues • {filteredIssues.length} with valid {selectedPeriod} targets
          </div>
        </div>
      </div>

      {/* Debug Info - Shows filtering criteria */}
      <div style={{
        backgroundColor: '#f0f7ff',
        padding: '10px 15px',
        borderRadius: '8px',
        marginBottom: '20px',
        borderLeft: '4px solid #1976d2',
        fontSize: '12px',
        color: '#333'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong>Filtering Criteria:</strong> 
            {selectedPeriod === "Yearly" && " Showing ONLY issues with valid 'የዓመቱ እቅድ' value"}
            {selectedPeriod === "6 Months" && " Showing ONLY issues with valid Q1 OR Q2 value"}
            {selectedPeriod === "9 Months" && " Showing ONLY issues with valid Q1 OR Q2 OR Q3 value"}
            {selectedPeriod.includes("ሩብዓመት") && ` Showing ONLY issues with valid '${selectedPeriod}' value`}
          </div>
          <div style={{ fontSize: '11px', color: '#666' }}>
            Chart: {chartData.length} issues • Table: {tableData.length} issues
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '20px',
        marginBottom: '30px'
      }}>
        <div style={{
          padding: '20px',
          backgroundColor: '#fff',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          borderLeft: '4px solid #2196F3'
        }}>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>Total Issues</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#2196F3' }}>{issues.length}</div>
          <div style={{ fontSize: '11px', color: '#888', marginTop: '5px' }}>All created issues</div>
        </div>

        <div style={{
          padding: '20px',
          backgroundColor: '#fff',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          borderLeft: '4px solid #9C27B0'
        }}>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>Filtered Issues</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#9C27B0' }}>{filteredIssues.length}</div>
          <div style={{ fontSize: '11px', color: '#888', marginTop: '5px' }}>For {selectedPeriod}</div>
        </div>

        <div style={{
          padding: '20px',
          backgroundColor: '#fff',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          borderLeft: '4px solid #4CAF50'
        }}>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>Overall Progress</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: getProgressColor(overallProgress) }}>
            {overallProgress}%
          </div>
          <div style={{ fontSize: '11px', color: '#888', marginTop: '5px' }}>Weighted average</div>
        </div>
      </div>

      {/* Tab Navigation */}
      <TabNavigation />

      {/* Tab Content */}
      {activeTab === 'performance' ? (
        /* PERFORMANCE TAB CONTENT */
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0 0 8px 8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          padding: '30px',
          marginBottom: '30px'
        }}>
          <h2 style={{ 
            color: '#1976d2', 
            marginBottom: '25px', 
            paddingBottom: '15px',
            borderBottom: '2px solid #f0f0f0',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <span style={{ fontSize: '24px' }}>📊</span>
            Weighted Overall Performance
          </h2>
          
          {/* Filter Controls in Performance Tab */}
          <FilterControls />
          
          {/* Overall Progress Bar - Enhanced */}
          <div style={{ marginBottom: '40px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <div style={{ fontWeight: "bold", fontSize: "20px", color: '#333' }}>
                Performance Score: {overallProgress}%
              </div>
              <div style={{ 
                fontSize: '14px', 
                color: '#666', 
                backgroundColor: '#f0f7ff',
                padding: '5px 10px',
                borderRadius: '20px',
                fontWeight: '500'
              }}>
                Based on {filteredIssues.length} issues with weights
              </div>
            </div>
            
            <div style={{
              width: "100%",
              backgroundColor: "#f0f0f0",
              borderRadius: "12px",
              overflow: "hidden",
              height: "35px",
              position: 'relative',
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <div
                style={{
                  width: `${overallProgress || 0}%`,
                  backgroundColor: getProgressColor(overallProgress),
                  height: "100%",
                  textAlign: "center",
                  color: "#fff",
                  fontWeight: "bold",
                  lineHeight: "35px",
                  transition: 'width 0.8s ease',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                <div style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontWeight: 'bold',
                  fontSize: '14px'
                }}>
                  {overallProgress}%
                </div>
              </div>
            </div>
            
            {/* Progress Indicators */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: '10px',
              padding: '0 5px'
            }}>
              <span style={{ fontSize: '12px', color: '#666' }}>0%</span>
              <span style={{ fontSize: '12px', color: '#666' }}>25%</span>
              <span style={{ fontSize: '12px', color: '#666' }}>50%</span>
              <span style={{ fontSize: '12px', color: '#666' }}>75%</span>
              <span style={{ fontSize: '12px', color: '#666' }}>100%</span>
            </div>
          </div>

          {/* Performance Summary */}
          <div style={{
            backgroundColor: '#f8f9fa',
            padding: '20px',
            borderRadius: '8px',
            marginBottom: '30px',
            borderLeft: '4px solid #4CAF50'
          }}>
            <h3 style={{ color: '#333', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>📈</span>
              Performance Summary
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>Target Period</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1976d2' }}>{selectedPeriod}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>Weighted Issues</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#9C27B0' }}>
                  {tableData.reduce((sum, row) => sum + row.weight, 0)}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>Avg Target Value</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#2196F3' }}>
                  {tableData.length > 0 
                    ? (tableData
                        .reduce((sum, row) => sum + parseFloat(row.targetValue || 0), 0) / 
                      tableData.length).toFixed(2)
                    : '0'}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>Performance Grade</div>
                <div style={{ 
                  fontSize: '18px', 
                  fontWeight: 'bold', 
                  color: overallProgress >= 75 ? '#4CAF50' : 
                         overallProgress >= 50 ? '#FF9800' : '#F44336'
                }}>
                  {overallProgress >= 75 ? 'Excellent' : 
                   overallProgress >= 50 ? 'Good' : 
                   overallProgress > 0 ? 'Needs Improvement' : 'Not Started'}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '20px'
          }}>
            <div style={{
              padding: '20px',
              backgroundColor: '#fff',
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
              border: '1px solid #e0e0e0'
            }}>
              <h4 style={{ color: '#333', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '18px' }}>⚡</span>
                Quick Stats
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
                  <span style={{ color: '#666' }}>Total Weight:</span>
                  <span style={{ fontWeight: 'bold' }}>{tableData.reduce((sum, row) => sum + row.weight, 0)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
                  <span style={{ color: '#666' }}>Average Progress:</span>
                  <span style={{ fontWeight: 'bold', color: getProgressColor(overallProgress) }}>
                    {overallProgress}%
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
                  <span style={{ color: '#666' }}>Completion Rate:</span>
                  <span style={{ fontWeight: 'bold', color: getProgressColor(overallProgress) }}>
                    {overallProgress}%
                  </span>
                </div>
              </div>
            </div>

            <div style={{
              padding: '20px',
              backgroundColor: '#fff',
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
              border: '1px solid #e0e0e0'
            }}>
              <h4 style={{ color: '#333', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '18px' }}>🎯</span>
                Period Targets
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
                  <span style={{ color: '#666' }}>Selected Period:</span>
                  <span style={{ fontWeight: 'bold', color: '#1976d2' }}>{selectedPeriod}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
                  <span style={{ color: '#666' }}>Filtered Issues:</span>
                  <span style={{ fontWeight: 'bold' }}>{filteredIssues.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
                  <span style={{ color: '#666' }}>Valid Targets:</span>
                  <span style={{ fontWeight: 'bold' }}>
                    {tableData.length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ANALYSIS TAB CONTENT */
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0 0 8px 8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          padding: '30px',
          marginBottom: '30px'
        }}>
          <h2 style={{ 
            color: '#1976d2', 
            marginBottom: '25px', 
            paddingBottom: '15px',
            borderBottom: '2px solid #f0f0f0',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <span style={{ fontSize: '24px' }}>🔍</span>
            Detailed Analysis
          </h2>

          {/* Filter Controls in Analysis Tab */}
          <FilterControls />

          {/* Chart Section - UPDATED VERTICAL BAR CHART */}
          {chartData.length === 0 ? (
            <div style={{ 
              textAlign: "center", 
              padding: "40px", 
              color: "#666",
              backgroundColor: "#f9f9f9",
              borderRadius: "8px",
              border: "1px dashed #ddd",
              marginBottom: '30px'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '20px' }}>📊</div>
              <h3>No Issues Match the Selected Criteria</h3>
              <p>Try changing the period or status filter to see your issues.</p>
            </div>
          ) : (
            <div style={{ marginBottom: '40px' }}>
              <h3 style={{ 
                marginBottom: '20px', 
                color: '#333', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '10px',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '20px' }}>📊</span>
                  Issues Progress ({selectedPeriod})
                </div>
                <span style={{ 
                  fontSize: '14px', 
                  color: '#666', 
                  fontWeight: 'normal',
                  backgroundColor: '#f0f7ff',
                  padding: '5px 10px',
                  borderRadius: '20px'
                }}>
                  Showing {chartData.length} issues with valid targets • Sorted by progress
                </span>
              </h3>
              
              {/* Container with better spacing for vertical chart */}
              <div style={{ 
                height: chartHeight,
                backgroundColor: 'white',
                borderRadius: '8px',
                border: '1px solid #e0e0e0',
                padding: '20px',
                position: 'relative'
              }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={chartData} 
                    layout="vertical" 
                    margin={{ top: 20, right: 120, left: 20, bottom: 20 }}
                  >
                    <CartesianGrid 
                      strokeDasharray="3 3" 
                      stroke="#f0f0f0" 
                      horizontal={true} 
                      vertical={false} 
                    />
                    
                    {/* YAxis for issue names (on the left side) */}
                    <YAxis 
                      type="category" 
                      dataKey="name" 
                      width={200} 
                      tick={{ fontSize: 12, fill: '#333' }}
                      axisLine={{ stroke: '#ddd' }}
                      tickLine={{ stroke: '#ddd' }}
                      tickFormatter={(value) => {
                        // Clean up the truncated text for display
                        if (value.includes("...")) {
                          return value;
                        }
                        return value.length > 40 ? `${value.substring(0, 37)}...` : value;
                      }}
                    />
                    
                    {/* XAxis for percentages */}
                    <XAxis 
                      type="number" 
                      domain={[0, 100]} 
                      tickFormatter={(v) => v + "%"}
                      axisLine={{ stroke: '#ddd' }}
                      tickLine={{ stroke: '#ddd' }}
                      label={{ 
                        value: 'Progress (%)', 
                        position: 'insideBottom', 
                        offset: -5,
                        style: { fill: '#666', fontSize: 12 }
                      }}
                    />
                    
                    {/* Tooltip with enhanced information */}
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          const quarterInfo = data.quarterDistribution;
                          
                          return (
                            <div style={{
                              backgroundColor: 'white',
                              padding: '15px',
                              border: '1px solid #ccc',
                              borderRadius: '8px',
                              boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                              minWidth: '350px',
                              maxWidth: '500px'
                            }}>
                              <div style={{ 
                                fontWeight: 'bold', 
                                fontSize: '14px', 
                                borderBottom: '1px solid #eee', 
                                paddingBottom: '8px', 
                                marginBottom: '10px',
                                color: '#1976d2'
                              }}>
                                Issue #{data.id}
                              </div>
                              <div style={{ 
                                fontSize: '13px', 
                                marginBottom: '8px',
                                wordBreak: 'break-word'
                              }}>
                                <strong>Subject:</strong> {data.fullName}
                              </div>
                              
                              <div style={{ 
                                display: 'grid', 
                                gap: '8px', 
                                fontSize: '13px',
                                gridTemplateColumns: 'repeat(2, 1fr)'
                              }}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ color: '#666', fontSize: '12px' }}>Progress</span>
                                  <span style={{ 
                                    fontWeight: 'bold', 
                                    color: getProgressColor(data.progress),
                                    fontSize: '16px'
                                  }}>
                                    {data.progress}%
                                  </span>
                                </div>
                                
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ color: '#666', fontSize: '12px' }}>Target ({selectedPeriod})</span>
                                  <span style={{ 
                                    fontWeight: 'bold', 
                                    color: '#1976d2',
                                    fontSize: '16px'
                                  }}>
                                    {data.targetValue}
                                  </span>
                                </div>
                                
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ color: '#666', fontSize: '12px' }}>Status</span>
                                  <span style={{ 
                                    fontWeight: 'bold',
                                    backgroundColor: data.status === 'New' ? '#e3f2fd' : 
                                                  data.status === 'In Progress' ? '#e8f5e9' : '#fff3e0',
                                    color: data.status === 'New' ? '#1565c0' : 
                                          data.status === 'In Progress' ? '#2e7d32' : '#f57c00',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    display: 'inline-block',
                                    width: 'fit-content'
                                  }}>
                                    {data.status}
                                  </span>
                                </div>
                                
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ color: '#666', fontSize: '12px' }}>Assigned To</span>
                                  <span style={{ fontSize: '12px' }}>{data.assignedTo}</span>
                                </div>
                                
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ color: '#666', fontSize: '12px' }}>Done Ratio</span>
                                  <span style={{ fontSize: '12px' }}>{data.doneRatio}%</span>
                                </div>
                                
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ color: '#666', fontSize: '12px' }}>Tracker</span>
                                  <span style={{ fontSize: '12px' }}>{data.tracker}</span>
                                </div>
                              </div>
                              
                              {/* Quarter Distribution Info */}
                              {quarterInfo && quarterInfo.hasValidValue && (
                                <div style={{
                                  marginTop: '15px',
                                  padding: '10px',
                                  backgroundColor: '#f0f7ff',
                                  borderRadius: '6px',
                                  fontSize: '12px',
                                  borderLeft: '3px solid #1976d2'
                                }}>
                                  <div style={{ fontWeight: 'bold', color: '#1976d2', marginBottom: '5px' }}>
                                    <span style={{ fontSize: '14px', marginRight: '5px' }}>📅</span>
                                    Smart Quarter Mapping
                                  </div>
                                  <div style={{ fontSize: '11px', color: '#555' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                                      <span>Valid Quarters:</span>
                                      <span style={{ fontWeight: 'bold' }}>{quarterInfo.validQuartersCount}/4</span>
                                    </div>
                                    <div style={{ marginBottom: '3px' }}>
                                      <span style={{ color: '#777' }}>List: </span>
                                      <span>{quarterInfo.validQuartersList.join(', ')}</span>
                                    </div>
                                    <div>
                                      <span style={{ color: '#777' }}>Range: </span>
                                      <span style={{ fontWeight: 'bold' }}>
                                        {quarterInfo.range.start.toFixed(1)}% - {quarterInfo.range.end.toFixed(1)}%
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    
                    {/* Bar with gradient effect and better styling */}
                    <Bar 
                      dataKey="progress" 
                      barSize={25}
                      name="Progress"
                      radius={[0, 6, 6, 0]}
                      animationDuration={1500}
                    >
                      {chartData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.color}
                          stroke="#fff"
                          strokeWidth={1}
                          style={{ 
                            filter: 'drop-shadow(0px 2px 3px rgba(0,0,0,0.1))',
                            transition: 'all 0.3s ease'
                          }}
                        />
                      ))}
                      
                      {/* Custom LabelList for inside-bar labels */}
                      <LabelList 
                        dataKey="progress" 
                        position="right" 
                        offset={10}
                        formatter={(value) => `${value}%`} 
                        style={{ 
                          fill: "#333", 
                          fontSize: 11, 
                          fontWeight: "bold",
                          textShadow: '1px 1px 1px rgba(255,255,255,0.8)'
                        }} 
                      />
                      
                      {/* Optional: Add second label for issue IDs */}
                      <LabelList 
                        dataKey="id" 
                        position="insideLeft" 
                        offset={5}
                        formatter={(value) => `#${value}`} 
                        style={{ 
                          fill: "#fff", 
                          fontSize: 10, 
                          fontWeight: "bold",
                          textShadow: '1px 1px 2px rgba(0,0,0,0.3)'
                        }} 
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                
                {/* Legend/Instructions */}
                <div style={{
                  position: 'absolute',
                  top: '20px',
                  right: '20px',
                  backgroundColor: 'rgba(255,255,255,0.9)',
                  padding: '10px 15px',
                  borderRadius: '6px',
                  border: '1px solid #e0e0e0',
                  fontSize: '11px',
                  color: '#666',
                  zIndex: 10,
                  maxWidth: '150px'
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '5px', color: '#333' }}>
                    Color Guide:
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '3px' }}>
                    <div style={{ 
                      width: '12px', 
                      height: '12px', 
                      backgroundColor: '#2e7d32', 
                      marginRight: '5px',
                      borderRadius: '2px'
                    }}></div>
                    <span>100%</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '3px' }}>
                    <div style={{ 
                      width: '12px', 
                      height: '12px', 
                      backgroundColor: '#4caf50', 
                      marginRight: '5px',
                      borderRadius: '2px'
                    }}></div>
                    <span>75-99%</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '3px' }}>
                    <div style={{ 
                      width: '12px', 
                      height: '12px', 
                      backgroundColor: '#ff9800', 
                      marginRight: '5px',
                      borderRadius: '2px'
                    }}></div>
                    <span>50-74%</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '3px' }}>
                    <div style={{ 
                      width: '12px', 
                      height: '12px', 
                      backgroundColor: '#ff5722', 
                      marginRight: '5px',
                      borderRadius: '2px'
                    }}></div>
                    <span>1-49%</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{ 
                      width: '12px', 
                      height: '12px', 
                      backgroundColor: '#f44336', 
                      marginRight: '5px',
                      borderRadius: '2px'
                    }}></div>
                    <span>0%</span>
                  </div>
                </div>
              </div>
              
              {/* Chart Summary */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '15px',
                padding: '10px 15px',
                backgroundColor: '#f8f9fa',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#666'
              }}>
                <div>
                  <strong>Chart Summary:</strong> Hover over bars for detailed information
                </div>
                <div style={{ display: 'flex', gap: '20px' }}>
                  <div>
                    <span style={{ color: '#666' }}>Highest Progress: </span>
                    <span style={{ fontWeight: 'bold', color: getProgressColor(chartData[0]?.progress || 0) }}>
                      {chartData[0]?.progress || 0}%
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#666' }}>Average: </span>
                    <span style={{ fontWeight: 'bold', color: getProgressColor(overallProgress) }}>
                      {overallProgress}%
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#666' }}>Lowest Progress: </span>
                    <span style={{ fontWeight: 'bold', color: getProgressColor(chartData[chartData.length-1]?.progress || 0) }}>
                      {chartData[chartData.length-1]?.progress || 0}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Issues List - UPDATED TABLE (shows ALL data, not just first 10) */}
          {tableData.length > 0 ? (
            <div style={{ marginBottom: '40px' }}>
              <h3 style={{ marginBottom: '20px', color: '#333', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>📋</span>
                Issues Details ({selectedPeriod})
              </h3>
              
              <div style={{
                overflowX: 'auto',
                backgroundColor: 'white',
                borderRadius: '8px',
                border: '1px solid #e0e0e0',
                maxHeight: '600px', // Added max height with vertical scroll
                overflowY: 'auto'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8f9fa', position: 'sticky', top: 0, zIndex: 1 }}>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>Subject</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>Status</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>Assigned To</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>{selectedPeriod} Target</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>Progress</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.map((issue, index) => ( // CHANGED: Removed .slice(0, 10) to show ALL data
                      <tr key={issue.id} style={{ 
                        borderBottom: '1px solid #dee2e6',
                        backgroundColor: index % 2 === 0 ? '#fff' : '#f8f9fa',
                        transition: 'background-color 0.2s ease'
                      }}>
                        <td style={{ padding: '12px', maxWidth: '350px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {truncateText(issue.subject, 70)}
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span style={{
                            backgroundColor: issue.status === 'New' ? '#e3f2fd' : 
                                           issue.status === 'In Progress' ? '#e8f5e9' : '#fff3e0',
                            color: issue.status === 'New' ? '#1565c0' : 
                                  issue.status === 'In Progress' ? '#2e7d32' : '#f57c00',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 'bold'
                          }}>
                            {issue.status}
                          </span>
                        </td>
                        <td style={{ padding: '12px' }}>{truncateText(issue.assignedTo, 20)}</td>
                        <td style={{ padding: '12px', fontWeight: 'bold', color: '#1976d2' }}>
                          {issue.targetValue}
                        </td>
                        <td style={{ padding: '12px' }}>
                          <div style={{ 
                            display: 'inline-block',
                            backgroundColor: getProgressColor(issue.progress),
                            color: 'white',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontWeight: 'bold',
                            minWidth: '60px',
                            textAlign: 'center'
                          }}>
                            {issue.progress}%
                          </div>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold' }}>
                          {issue.weight}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ backgroundColor: '#e3f2fd', position: 'sticky', bottom: 0, zIndex: 1 }}>
                      <td style={{ padding: '12px', fontWeight: 'bold' }} colSpan="3">Average / Total</td>
                      <td style={{ padding: '12px', fontWeight: 'bold', color: '#1976d2' }}>
                        {tableData.length > 0 
                          ? (tableData
                              .reduce((sum, row) => sum + parseFloat(row.targetValue || 0), 0) / 
                            tableData.length).toFixed(2)
                          : '0'}
                      </td>
                      <td style={{ padding: '12px', fontWeight: 'bold', color: getProgressColor(overallProgress) }}>
                        {overallProgress}%
                      </td>
                      <td style={{ padding: '12px', fontWeight: 'bold' }}>
                        {tableData.reduce((sum, row) => sum + row.weight, 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              
              {/* Table Summary - Shows total count */}
              <div style={{
                marginTop: '15px',
                padding: '10px 15px',
                backgroundColor: '#f8f9fa',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#666',
                textAlign: 'center'
              }}>
                Showing all {tableData.length} issues with valid {selectedPeriod} targets
              </div>
            </div>
          ) : (
            <div style={{ 
              textAlign: "center", 
              padding: "40px", 
              color: "#666",
              backgroundColor: "#f9f9f9",
              borderRadius: "8px",
              border: "1px dashed #ddd",
              marginBottom: '30px'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '20px' }}>📋</div>
              <h3>No Issues with Valid {selectedPeriod} Targets</h3>
              <p>None of your issues have a valid target value for the selected period ({selectedPeriod}).</p>
              <div style={{ marginTop: '15px', fontSize: '14px', color: '#888' }}>
                Try selecting a different period or check if your issues have the correct target values set.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer Stats */}
      <div style={{
        marginTop: '40px',
        paddingTop: '20px',
        borderTop: '1px solid #eee',
        fontSize: '12px',
        color: '#666',
        textAlign: 'center'
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <span>Total Issues Created: {issues.length}</span>
          <span>•</span>
          <span>Filtered Issues ({selectedPeriod}): {filteredIssues.length}</span>
          <span>•</span>
          <span>Overall Progress: {overallProgress}%</span>
          <span>•</span>
          <span>Active Tab: {activeTab === 'performance' ? 'Performance' : 'Analysis'}</span>
          <span>•</span>
          <span>Last Updated: {new Date().toLocaleTimeString()}</span>
        </div>
        <div style={{ marginTop: '10px', fontSize: '11px', color: '#888' }}>
          *Showing only issues with valid {selectedPeriod} target values
          {selectedPeriod === "Yearly" && " (የዓመቱ እቅድ)"}
          {selectedPeriod === "6 Months" && " (1ኛ ሩብዓመት + 2ኛ ሩብዓመት)"}
          {selectedPeriod === "9 Months" && " (1ኛ ሩብዓመት + 2ኛ ሩብዓመት + 3ኛ ሩብዓመት)"}
          {selectedPeriod.includes("ሩብዓመት") && " • Smart quarter mapping active"}
          {user && ` • User: ${user.firstname} ${user.lastname} (${user.login})`}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;