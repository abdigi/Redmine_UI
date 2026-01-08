import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  getCurrentUser,
  getMyMainProjects,
  getSubprojects,
  getProjectIssues,
} from "../api/redmineApi";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  LabelList,
  Cell,
  Legend,
  PieChart,
  Pie,
} from "recharts";
import "./StateMinisterDashboard.css";

// ============================
// UPDATED PERIOD FILTERING FUNCTIONS (from Team Leader Dashboard)
// ============================

// Helper function to check if a quarterly field has a valid value
const hasValidQuarterValue = (issue, quarter) => {
  const value = getField(issue, quarter);
  return value && value !== "0" && value !== "" && value !== "0.0" && value !== "0.00";
};

// Count how many quarters have valid values for an issue
const countValidQuarters = (issue) => {
  const quarters = ["1ኛ ሩብዓመት", "2ኛ ሩብዓመት", "3ኛ ሩብዓመት", "4ኛ ሩብዓመት"];
  return quarters.filter(quarter => hasValidQuarterValue(issue, quarter)).length;
};

// Get the index of a quarter (1-4) for mapping
const getQuarterIndex = (quarter) => {
  switch(quarter) {
    case "1ኛ ሩብዓመት": return 1;
    case "2ኛ ሩብዓመት": return 2;
    case "3ኛ ሩብዓመት": return 3;
    case "4ኛ ሩብዓመት": return 4;
    default: return 0;
  }
};

// Get quarter ranges based on number of valid quarters and target quarter index
const getQuarterRanges = (validQuartersCount, targetQuarterIndex) => {
  if (validQuartersCount === 4) {
    // All 4 quarters valid - equal 25% each
    const ranges = [
      { start: 0, end: 25 },    // Q1: 0-25%
      { start: 25, end: 50 },   // Q2: 25-50%
      { start: 50, end: 75 },   // Q3: 50-75%
      { start: 75, end: 100 }   // Q4: 75-100%
    ];
    return ranges[targetQuarterIndex - 1] || { start: 0, end: 100 };
  }
  
  if (validQuartersCount === 3) {
    // 3 quarters valid - equal 33.33% each
    const segment = 100 / 3;
    const ranges = [];
    let currentStart = 0;
    
    // Create ranges for first 3 quarters
    for (let i = 0; i < 3; i++) {
      ranges.push({
        start: currentStart,
        end: currentStart + segment
      });
      currentStart += segment;
    }
    
    // Find which quarter index maps to which range
    // This is simplified - assuming the first 3 quarters are valid
    return targetQuarterIndex <= 3 ? ranges[targetQuarterIndex - 1] : { start: 0, end: 100 };
  }
  
  if (validQuartersCount === 2) {
    // 2 quarters valid - equal 50% each
    const ranges = [
      { start: 0, end: 50 },    // First valid quarter
      { start: 50, end: 100 }   // Second valid quarter
    ];
    
    // Determine which range to use based on quarter index
    if (targetQuarterIndex === 1 || targetQuarterIndex === 2) return ranges[0];
    if (targetQuarterIndex === 3 || targetQuarterIndex === 4) return ranges[1];
    return { start: 0, end: 100 };
  }
  
  if (validQuartersCount === 1) {
    // 1 quarter valid - use full range
    return { start: 0, end: 100 };
  }
  
  // Default fallback
  return { start: 0, end: 100 };
};

// UPDATED: Map progress based on selected period and quarterly distribution
const mapProgress = (done, period, issue = null) => {
  if (!done) done = 0;
  
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
    // If no issue provided, use old logic
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
    
    // Count how many quarterly fields have valid values
    const validQuartersCount = countValidQuarters(issue);
    const targetQuarterIndex = getQuarterIndex(period);
    
    // Get the specific quarter's value
    const hasValidValue = hasValidQuarterValue(issue, period);
    
    // If this quarter doesn't have a valid value, return 0
    if (!hasValidValue) return 0;
    
    // If only one quarter has value, use done percentage as is
    if (validQuartersCount === 1) {
      return done;
    }
    
    // Get the range for this quarter based on valid quarters count
    const range = getQuarterRanges(validQuartersCount, targetQuarterIndex);
    
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

// Filter issues by selected period
const filterIssuesByPeriod = (issues, period) => {
  if (period === "Yearly") {
    return issues.filter(issue => {
      const yearlyValue = getField(issue, "የዓመቱ እቅድ");
      return yearlyValue && yearlyValue !== "0" && yearlyValue !== "";
    });
  }

  if (period === "6 Months") {
    return issues.filter(issue => {
      const q1 = getField(issue, "1ኛ ሩብዓመት");
      const q2 = getField(issue, "2ኛ ሩብዓመት");
      // Include if either quarter has a valid value
      return (q1 && q1 !== "0" && q1 !== "") || (q2 && q2 !== "0" && q2 !== "");
    });
  }

  if (period === "9 Months") {
    return issues.filter(issue => {
      const q1 = getField(issue, "1ኛ ሩብዓመት");
      const q2 = getField(issue, "2ኛ ሩብዓመት");
      const q3 = getField(issue, "3ኛ ሩብዓመት");
      // Include if any of the quarters has a valid value
      return (q1 && q1 !== "0" && q1 !== "") || 
             (q2 && q2 !== "0" && q2 !== "") || 
             (q3 && q3 !== "0" && q3 !== "");
    });
  }

  // Quarterly filtering
  return issues.filter(issue => {
    const val = getField(issue, period);
    return val && val !== "0" && val !== "";
  });
};

// Helper function to get weight with default value
const getWeight = (issue) => {
  const weightValue = getField(issue, "ክብደት");
  if (!weightValue || weightValue === "0" || weightValue === "") {
    return 1; // Default weight
  }
  return Number(weightValue) || 1;
};

// ============================
// NEW: TARGET VALUE FUNCTIONS for ዋና ተግባራት Analysis Table
// ============================

// Get target value based on selected period
const getTargetValue = (issue, period) => {
  if (!issue) return "0";
  
  if (period === "Yearly") {
    // For yearly, use "የዓመቱ እቅድ" custom field
    return getField(issue, "የዓመቱ እቅድ") || "0";
  }
  
  if (period === "6 Months") {
    // For 6 months, sum Q1 and Q2 values
    const q1 = getField(issue, "1ኛ ሩብዓመት") || "0";
    const q2 = getField(issue, "2ኛ ሩብዓመት") || "0";
    
    // Convert to numbers and sum
    const q1Num = parseFloat(q1.toString().trim()) || 0;
    const q2Num = parseFloat(q2.toString().trim()) || 0;
    
    const total = q1Num + q2Num;
    return total > 0 ? total.toString() : "0";
  }
  
  if (period === "9 Months") {
    // For 9 months, sum Q1, Q2, and Q3 values
    const q1 = getField(issue, "1ኛ ሩብዓመት") || "0";
    const q2 = getField(issue, "2ኛ ሩብዓመት") || "0";
    const q3 = getField(issue, "3ኛ ሩብዓመት") || "0";
    
    // Convert to numbers and sum
    const q1Num = parseFloat(q1.toString().trim()) || 0;
    const q2Num = parseFloat(q2.toString().trim()) || 0;
    const q3Num = parseFloat(q3.toString().trim()) || 0;
    
    const total = q1Num + q2Num + q3Num;
    return total > 0 ? total.toString() : "0";
  }
  
  // For quarterly periods, use the period name as custom field
  return getField(issue, period) || "0";
};

// Calculate actual value (achievement/100 * target value)
const calculateActualValue = (achievement, targetValue, period) => {
  if (!achievement || !targetValue) return 0;
  
  // Convert to numbers
  const achievementNum = parseFloat(achievement.toString().trim());
  const targetNum = parseFloat(targetValue.toString().trim());
  
  if (isNaN(achievementNum) || isNaN(targetNum) || targetNum === 0) return 0;
  
  // Calculate actual value
  return (achievementNum / 100) * targetNum;
};

// Helper function to check if target value is valid
const isValidTargetValue = (targetValue, period) => {
  if (!targetValue) return false;
  
  // For 6 Months and 9 Months, check if the sum is greater than 0
  if (period === "6 Months" || period === "9 Months") {
    const numValue = parseFloat(targetValue.toString().trim());
    return !isNaN(numValue) && numValue > 0;
  }
  
  // For other periods, check if not empty or 0
  const trimmed = targetValue.toString().trim();
  return trimmed !== "" && trimmed !== "0" && trimmed !== "0.0" && trimmed !== "0.00";
};

// Helper function to truncate text
const truncateText = (text, maxLength = 20) => {
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
};

// Get progress color based on percentage
const getProgressColor = (percentage) => {
  if (percentage >= 90) return "#2e7d32"; // Green for excellent
  if (percentage >= 75) return "#4caf50"; // Light green for good
  if (percentage >= 60) return "#ff9800"; // Orange for average
  if (percentage >= 40) return "#6a1b9a"; // Purple for needs attention
  return "#d32f2f"; // Red for critical
};

// ============================
// REST OF YOUR EXISTING CODE
// ============================

// Period options with labels and descriptions
const PERIOD_OPTIONS = [
  { value: "Yearly", label: "Yearly", color: "#2E7D32" },
  { value: "1ኛ ሩብዓመት", label: "Q1", color: "#1976d2" },
  { value: "2ኛ ሩብዓመት", label: "Q2", color: "#1976d2" },
  { value: "3ኛ ሩብዓመት", label: "Q3", color: "#1976d2" },
  { value: "4ኛ ሩብዓመት", label: "Q4", color: "#1976d2" },
  { value: "6 Months", label: "6 Months", color: "#f57c00" },
  { value: "9 Months", label: "9 Months", color: "#f57c00" },
];

// Status configuration with better contrast colors
const STATUS_CONFIG = {
  ACHIEVED: { 
    label: "Achieved", 
    color: "#2E7D32", 
    textColor: "#ffffff",
    icon: "✓", 
    threshold: 95 
  },
  ON_TRACK: { 
    label: "On Track", 
    color: "#1976d2", 
    textColor: "#ffffff",
    icon: "↗", 
    threshold: 85 
  },
  IN_PROGRESS: { 
    label: "In Progress", 
    color: "#f57c00", 
    textColor: "#000000",
    icon: "⏳", 
    threshold: 65 
  },
  WEAK: { 
    label: "Weak Performance", 
    color: "#6a1b9a", 
    textColor: "#ffffff",
    icon: "⚠", 
    threshold: 50 
  },
  INTERVENTION: { 
    label: "Requires Intervention", 
    color: "#d32f2f", 
    textColor: "#ffffff",
    icon: "🚨", 
    threshold: 0 
  },
};

// Helper function to get contrasting text color
const getContrastColor = (hexColor) => {
  // Convert hex to RGB
  const r = parseInt(hexColor.substr(1, 2), 16);
  const g = parseInt(hexColor.substr(3, 2), 16);
  const b = parseInt(hexColor.substr(5, 2), 16);
  
  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // Return black for light colors, white for dark colors
  return luminance > 0.5 ? "#000000" : "#ffffff";
};

// Icons as text for no Material-UI
const Icons = {
  ArrowBack: () => <span className="icon">←</span>,
  Download: () => <span className="icon">📥</span>,
  Refresh: () => <span className="icon">🔄</span>,
  TrendingUp: () => <span className="icon">📈</span>,
  Warning: () => <span className="icon">⚠</span>,
  CheckCircle: () => <span className="icon">✓</span>,
  Schedule: () => <span className="icon">⏰</span>,
  Error: () => <span className="icon">❌</span>,
  Timeline: () => <span className="icon">📊</span>,
  FilterList: () => <span className="icon">☰</span>,
  ExpandMore: () => <span className="icon">▼</span>,
  Calendar: () => <span className="icon">📅</span>,
  Target: () => <span className="icon">🎯</span>,
  ChartLine: () => <span className="icon">📉</span>,
  Building: () => <span className="icon">🏢</span>,
  Trophy: () => <span className="icon">🏆</span>,
  Alert: () => <span className="icon">🔴</span>,
  Sector: () => <span className="icon">🏛️</span>,
  Department: () => <span className="icon">📋</span>,
  Organization: () => <span className="icon">🏢</span>,
  Team: () => <span className="icon">👥</span>,
};

export default function MinisterDashboard() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(null);
  const [selectedGoalId, setSelectedGoalId] = useState(null);
  const [goalIssues, setGoalIssues] = useState([]);
  const [bestDepartment, setBestDepartment] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState("Yearly");
  const [activeTab, setActiveTab] = useState(0);
  const [stats, setStats] = useState({
    totalGoals: 0,
    completedGoals: 0,
    totalIssues: 0,
    avgProgress: 0,
    statusDistribution: {},
  });
  const [error, setError] = useState(null);
  const [collapsedDepartments, setCollapsedDepartments] = useState(new Set());
  const [filteredDepartments, setFilteredDepartments] = useState([]);
  const [filterCategory, setFilterCategory] = useState(null);
  // NEW STATE for analysis table tab within goal view
  const [goalViewTab, setGoalViewTab] = useState("chart");
  // NEW STATE for showing period change notification
  const [showPeriodChangeNotification, setShowPeriodChangeNotification] = useState(false);
  const [periodChangeMessage, setPeriodChangeMessage] = useState("");

  // Store raw data
  const [rawDepartments, setRawDepartments] = useState([]);

  // UPDATED: Memoized progress calculation with issue parameter
  const calculateProgress = useCallback((issue, period) => {
    return mapProgress(issue.done_ratio || 0, period, issue);
  }, []);

  // Memoized status determination with text color
  const getGoalStatus = useCallback((progress) => {
    let status;
    if (progress >= STATUS_CONFIG.ACHIEVED.threshold) {
      status = STATUS_CONFIG.ACHIEVED;
    } else if (progress >= STATUS_CONFIG.ON_TRACK.threshold) {
      status = STATUS_CONFIG.ON_TRACK;
    } else if (progress >= STATUS_CONFIG.IN_PROGRESS.threshold) {
      status = STATUS_CONFIG.IN_PROGRESS;
    } else if (progress >= STATUS_CONFIG.WEAK.threshold) {
      status = STATUS_CONFIG.WEAK;
    } else {
      status = STATUS_CONFIG.INTERVENTION;
    }
    
    // Ensure text color has good contrast
    return {
      ...status,
      textColor: getContrastColor(status.color)
    };
  }, []);

  // Load data only once
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const user = await getCurrentUser();
      if (!user) {
        setError("User not authenticated");
        setLoading(false);
        return;
      }

      const mainProjects = await getMyMainProjects();

      // Process departments in parallel
      const departmentPromises = mainProjects.map(async (dep, index) => {
        try {
          const [goals, depIssues] = await Promise.all([
            getSubprojects(dep.id).catch(() => []),
            getProjectIssues({ project_id: dep.id, status_id: "*" }).catch(() => []),
          ]);

          // Process goals in parallel
          const goalsWithAllIssues = await Promise.all(
            goals.map(async (goal, goalIndex) => {
              const issues = await getProjectIssues({ 
                project_id: goal.id, 
                status_id: "*" 
              }).catch(() => []);
              
              return { 
                ...goal, 
                allIssues: issues, // Store ALL issues for each goal
                displayName: `${String.fromCharCode(65 + goalIndex)}. ${goal.name}`
              };
            })
          );

          return {
            ...dep,
            displayName: `${index + 1}. ${dep.name}`,
            goals: goalsWithAllIssues,
            allDirectIssues: depIssues, // Store ALL department issues
          };
        } catch (err) {
          console.error(`Error loading department ${dep.name}:`, err);
          return { 
            ...dep, 
            displayName: `${index + 1}. ${dep.name}`,
            goals: [], 
            allDirectIssues: []
          };
        }
      });

      const allDepartmentData = await Promise.all(departmentPromises);
      setRawDepartments(allDepartmentData);
      
      // Apply initial period filter
      updateFilteredData(allDepartmentData, selectedPeriod);
      
    } catch (err) {
      console.error("Error loading dashboard data:", err);
      setError("Failed to load dashboard data. Please try again.");
      setRawDepartments([]);
      setDepartments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Function to filter and calculate data based on selected period
  const updateFilteredData = useCallback((rawData, period) => {
    if (!rawData.length) {
      setDepartments([]);
      setStats({
        totalGoals: 0,
        completedGoals: 0,
        totalIssues: 0,
        avgProgress: 0,
        statusDistribution: {},
        validDepartmentsCount: 0,
        totalDepartmentsCount: rawData.length
      });
      setBestDepartment(null);
      return;
    }

    // Process each department for the selected period
    const processedDepartments = rawData.map((dep) => {
      // Filter department issues by period
      const filteredDepIssues = filterIssuesByPeriod(dep.allDirectIssues || [], period);
      const depTopIssues = filteredDepIssues.filter((i) => !i.parent);
      
      // Process goals for this period
      const goalsWithProgress = dep.goals.map((goal, goalIndex) => {
        // Filter goal issues by period
        const filteredGoalIssues = filterIssuesByPeriod(goal.allIssues || [], period);
        const topIssues = filteredGoalIssues.filter((i) => !i.parent);
        
        // Calculate weighted progress
        let totalWeightedProgress = 0;
        let totalWeight = 0;
        
        if (topIssues.length > 0) {
          topIssues.forEach(issue => {
            const weight = getWeight(issue);
            const progress = calculateProgress(issue, period);
            totalWeightedProgress += progress * weight;
            totalWeight += weight;
          });
        }
        
        const progress = totalWeight > 0 ? Math.round(totalWeightedProgress / totalWeight) : 0;
        const status = getGoalStatus(progress);
        
        return { 
          ...goal, 
          progress, 
          issues: topIssues, 
          status,
          displayName: `${String.fromCharCode(65 + goalIndex)}. ${goal.name}`,
          validIssuesCount: topIssues.length
        };
      });

      // Calculate department progress with weighted average
      let depWeightedProgress = 0;
      let depTotalWeight = 0;
      
      if (depTopIssues.length > 0) {
        depTopIssues.forEach(issue => {
          const weight = getWeight(issue);
          const progress = calculateProgress(issue, period);
          depWeightedProgress += progress * weight;
          depTotalWeight += weight;
        });
      }
      
      // Add goal issues to department calculation
      goalsWithProgress.forEach(goal => {
        goal.issues.forEach(issue => {
          const weight = getWeight(issue);
          const progress = calculateProgress(issue, period);
          depWeightedProgress += progress * weight;
          depTotalWeight += weight;
        });
      });
      
      const depProgress = depTotalWeight > 0 ? Math.round(depWeightedProgress / depTotalWeight) : 0;
      
      const totalValidIssues = depTopIssues.length + goalsWithProgress.reduce((sum, goal) => sum + goal.validIssuesCount, 0);

      return {
        ...dep,
        goals: goalsWithProgress,
        avgProgress: depProgress,
        directIssues: depTopIssues,
        validIssuesCount: totalValidIssues,
        hasValidData: totalValidIssues > 0
      };
    });

    // Filter out departments with no valid data for the selected period
    const validDepartments = processedDepartments.filter(dep => dep.hasValidData);

    // Sort departments by progress
    const sortedDepartments = [...validDepartments].sort(
      (a, b) => b.avgProgress - a.avgProgress
    );

    // Calculate overall statistics using only valid departments
    const allGoals = validDepartments.flatMap(dep => dep.goals);
    const allIssues = validDepartments.flatMap(dep => [
      ...dep.directIssues,
      ...dep.goals.flatMap(goal => goal.issues)
    ]);

    const statusDistribution = allGoals.reduce((acc, goal) => {
      const status = goal.status.label;
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    const totalProgress = validDepartments.reduce((sum, dep) => sum + dep.avgProgress, 0);
    const avgProgress = validDepartments.length > 0 
      ? Math.round(totalProgress / validDepartments.length) 
      : 0;

    setStats({
      totalGoals: allGoals.length,
      completedGoals: allGoals.filter(g => g.progress >= 95).length,
      totalIssues: allIssues.length,
      avgProgress,
      statusDistribution,
      validDepartmentsCount: validDepartments.length,
      totalDepartmentsCount: rawData.length
    });

    setBestDepartment(sortedDepartments[0] || null);
    setDepartments(sortedDepartments);
    
    // Clear any existing filters
    setFilteredDepartments([]);
    setFilterCategory(null);
  }, [calculateProgress, getGoalStatus]);

  // Load data on mount only
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Update filtered data when period changes
  useEffect(() => {
    if (rawDepartments.length > 0) {
      updateFilteredData(rawDepartments, selectedPeriod);
    }
  }, [selectedPeriod, rawDepartments, updateFilteredData]);

  // Add function to handle category click
  const handleCategoryClick = useCallback((category) => {
    let filtered = [];
    
    switch(category) {
      case 'total':
        filtered = departments;
        break;
      case 'active':
        filtered = departments.filter(d => d.avgProgress > 0 && d.avgProgress < 100);
        break;
      case 'completed':
        filtered = departments.filter(d => d.avgProgress >= 95);
        break;
      case 'struggling':
        filtered = departments.filter(d => d.avgProgress < 50);
        break;
      case 'excellent':
        filtered = departments.filter(d => d.avgProgress >= 90);
        break;
      case 'good':
        filtered = departments.filter(d => d.avgProgress >= 75 && d.avgProgress < 90);
        break;
      case 'average':
        filtered = departments.filter(d => d.avgProgress >= 60 && d.avgProgress < 75);
        break;
      case 'poor':
        filtered = departments.filter(d => d.avgProgress >= 40 && d.avgProgress < 60);
        break;
      case 'critical':
        filtered = departments.filter(d => d.avgProgress < 40);
        break;
      default:
        filtered = departments;
    }
    
    setFilteredDepartments(filtered);
    setFilterCategory(category);
  }, [departments]);

  // Add function to clear filter
  const clearFilter = useCallback(() => {
    setFilteredDepartments([]);
    setFilterCategory(null);
  }, []);

  // Memoized handlers
  const handleDepartmentClick = useCallback((dep) => {
    setSelectedDepartmentId(dep.id);
    setSelectedGoalId(null);
    setGoalIssues([]);
    setActiveTab(0);
    setGoalViewTab("chart");
  }, []);

  const handleGoalClick = useCallback((goal) => {
    setSelectedGoalId(goal.id);
    setGoalIssues(goal.issues || []);
    setGoalViewTab("chart"); // Reset to chart view when clicking a goal
  }, []);

  const handleBackToDepartments = useCallback(() => {
    setSelectedDepartmentId(null);
    setSelectedGoalId(null);
    setGoalIssues([]);
    setGoalViewTab("chart");
  }, []);

  const handleBackToGoals = useCallback(() => {
    setSelectedGoalId(null);
    setGoalIssues([]);
    setGoalViewTab("chart");
  }, []);

  const toggleDepartmentCollapse = useCallback((departmentId) => {
    setCollapsedDepartments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(departmentId)) {
        newSet.delete(departmentId);
      } else {
        newSet.add(departmentId);
      }
      return newSet;
    });
  }, []);

  // UPDATED: Handle period change - preserve current view
  const handlePeriodChange = useCallback((newPeriod) => {
    setSelectedPeriod(newPeriod);
    // DO NOT reset selectedDepartmentId and selectedGoalId here
    // They will be cleared by the useEffect if no data exists
    setActiveTab(0);
    setGoalViewTab("chart");
  }, []);

  // Memoized data transformations
  const selectedDepartment = useMemo(() => 
    departments.find(dep => dep.id === selectedDepartmentId),
    [departments, selectedDepartmentId]
  );

  const selectedGoal = useMemo(() => 
    selectedDepartment?.goals.find(g => g.id === selectedGoalId),
    [selectedDepartment, selectedGoalId]
  );

  // NEW: ዋና ተግባራት Analysis Table Data for selected goal
  const goalAnalysisTableData = useMemo(() => {
    if (!selectedGoal || !selectedGoal.issues || selectedGoal.issues.length === 0) return [];
    
    const data = selectedGoal.issues.map(issue => {
      const measurement = getField(issue, "መለኪያ") || "N/A";
      const targetValue = getTargetValue(issue, selectedPeriod);
      const achievement = mapProgress(issue.done_ratio || 0, selectedPeriod, issue);
      const actual = calculateActualValue(achievement, targetValue, selectedPeriod);
      
      return {
        id: issue.id,
        subject: issue.subject,
        measurement: measurement,
        targetValue: targetValue,
        achievement: achievement,
        actual: actual,
        status: issue.status?.name || "Unknown",
        
        hasValidTarget: isValidTargetValue(targetValue, selectedPeriod),
        weight: getWeight(issue)
      };
    });
    
    // Filter out issues with invalid target values
    return data.filter(row => row.hasValidTarget);
  }, [selectedGoal, selectedPeriod]);

  // NEW: ዋና ተግባራት Analysis Table Data for selected department
  const departmentAnalysisTableData = useMemo(() => {
    if (!selectedDepartment) return [];
    
    // Combine department direct issues and all goal issues
    const allIssues = [
      ...(selectedDepartment.directIssues || []),
      ...(selectedDepartment.goals?.flatMap(goal => goal.issues) || [])
    ];
    
    if (allIssues.length === 0) return [];
    
    const data = allIssues.map(issue => {
      const measurement = getField(issue, "መለኪያ") || "N/A";
      const targetValue = getTargetValue(issue, selectedPeriod);
      const achievement = mapProgress(issue.done_ratio || 0, selectedPeriod, issue);
      const actual = calculateActualValue(achievement, targetValue, selectedPeriod);
      const goal = selectedDepartment.goals?.find(g => 
        g.issues?.some(i => i.id === issue.id)
      );
      
      return {
        id: issue.id,
        subject: issue.subject,
        measurement: measurement,
        targetValue: targetValue,
        achievement: achievement,
        actual: actual,
        status: issue.status?.name || "Unknown",
        
        goalName: goal?.displayName || "Direct Department Issue",
        hasValidTarget: isValidTargetValue(targetValue, selectedPeriod),
        weight: getWeight(issue)
      };
    });
    
    // Filter out issues with invalid target values
    return data.filter(row => row.hasValidTarget);
  }, [selectedDepartment, selectedPeriod]);

  const statusChartData = useMemo(() => 
    Object.entries(stats.statusDistribution).map(([name, value]) => {
      const status = Object.values(STATUS_CONFIG).find(s => s.label === name);
      return {
        name,
        value,
        color: status?.color || "#cccccc",
        textColor: getContrastColor(status?.color || "#cccccc")
      };
    }),
    [stats.statusDistribution]
  );

  // Calculate department performance categories
  const departmentPerformance = useMemo(() => {
    if (!departments.length) return { excellent: 0, good: 0, average: 0, poor: 0, critical: 0 };
    
    return {
      excellent: departments.filter(d => d.avgProgress >= 90).length,
      good: departments.filter(d => d.avgProgress >= 75 && d.avgProgress < 90).length,
      average: departments.filter(d => d.avgProgress >= 60 && d.avgProgress < 75).length,
      poor: departments.filter(d => d.avgProgress >= 40 && d.avgProgress < 60).length,
      critical: departments.filter(d => d.avgProgress < 40).length,
    };
  }, [departments]);

  // Check if current selected department/goal has data for new period
  useEffect(() => {
    if (!selectedDepartmentId) return;
    
    // Find the selected department in the updated departments list
    const currentDept = departments.find(dep => dep.id === selectedDepartmentId);
    
    if (!currentDept) {
      // Department doesn't have valid data for this period
      setPeriodChangeMessage(`The selected department has no valid data for ${selectedPeriod}. Returning to department list.`);
      setShowPeriodChangeNotification(true);
      
      // Clear selection after a delay
      const timer = setTimeout(() => {
        setSelectedDepartmentId(null);
        setSelectedGoalId(null);
        setGoalIssues([]);
        setShowPeriodChangeNotification(false);
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [departments, selectedDepartmentId, selectedPeriod]);

  // FIXED: This useEffect needs to check if selectedDepartment exists first
  useEffect(() => {
    if (!selectedGoalId || !selectedDepartment) return;
    
    // Find the selected goal in the updated department's goals
    const currentGoal = selectedDepartment.goals?.find(g => g.id === selectedGoalId);
    
    if (!currentGoal) {
      // Goal doesn't have valid data for this period
      setPeriodChangeMessage(`The selected goal has no valid data for ${selectedPeriod}. Returning to department view.`);
      setShowPeriodChangeNotification(true);
      
      // Clear selection after a delay
      const timer = setTimeout(() => {
        setSelectedGoalId(null);
        setGoalIssues([]);
        setShowPeriodChangeNotification(false);
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [selectedGoalId, selectedDepartment, selectedPeriod]);

  // Custom tooltip component with period info
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="custom-tooltip">
          <p className="tooltip-label"><strong>{label}</strong></p>
          <p className="tooltip-value">Progress: {payload[0].value}%</p>
          <p className="tooltip-period">Period: {selectedPeriod}</p>
          {data.validIssuesCount !== undefined && (
            <p className="tooltip-issues">Valid ዋና ተግባራት: {data.validIssuesCount}</p>
          )}
        </div>
      );
    }
    return null;
  };

  // Custom tooltip for issues
  const IssueTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const validQuartersCount = countValidQuarters(data);
      
      return (
        <div className="custom-tooltip">
          <p className="tooltip-label"><strong>{data.subject}</strong></p>
          <p className="tooltip-value">Progress: {payload[0].value}%</p>
          <p className="tooltip-period">Period: {selectedPeriod}</p>
          {selectedPeriod.includes("ሩብዓመት") && validQuartersCount > 0 && (
            <p className="tooltip-quarter-info">
              Quarter Distribution: {validQuartersCount} valid quarter(s)
            </p>
          )}
          {data.weight && (
            <p className="tooltip-weight">Weight: {data.weight}</p>
          )}
        </div>
      );
    }
    return null;
  };

  // Prepare data for bar chart with progress colors
  const getBarCellColor = (progress) => {
    return getProgressColor(progress);
  };

  // Render ዋና ተግባራት Analysis Table component
  const renderAnalysisTable = (tableData, title, showGoalColumn = false) => {
    return (
      <div className="analysis-table-container">
        <h3>{title} ({selectedPeriod})</h3>
        
        {tableData.length === 0 ? (
          <div className="no-data-message">
            <p>No ዋና ተግባራት with valid target values for {selectedPeriod}</p>
            <p className="hint">
              {selectedPeriod === "6 Months" 
                ? "Issues must have valid values in either '1ኛ ሩብዓመት' or '2ኛ ሩብዓመት'"
                : selectedPeriod === "9 Months"
                ? "Issues must have valid values in either '1ኛ ሩብዓመት', '2ኛ ሩብዓመት', or '3ኛ ሩብዓመት'"
                : "Issues with empty or 0 target values are not shown in this table"}
            </p>
          </div>
        ) : (
          <div className="analysis-table-wrapper">
            <table className="analysis-table">
              <thead>
                <tr>
                  <th>ዋና ተግባራት</th>
                  <th>መለኪያ</th>
                  {showGoalColumn && <th>Goal</th>}
                  <th>
                    {selectedPeriod === "Yearly" ? "የዓመቱ እቅድ" : selectedPeriod} Target
                    {selectedPeriod === "6 Months" && <div className="table-subtitle">(Sum of Q1 + Q2)</div>}
                    {selectedPeriod === "9 Months" && <div className="table-subtitle">(Sum of Q1 + Q2 + Q3)</div>}
                  </th>
                  <th>Achievement (%)</th>
                  <th>Actual Value</th>
                  <th>Weight</th>
                 
                 
                </tr>
              </thead>
              <tbody>
                {tableData.map((row, index) => (
                  <tr key={row.id}>
                    <td className="subject-cell" title={row.subject}>
                      {truncateText(row.subject, 40)}
                    </td>
                    <td>{row.measurement}</td>
                    {showGoalColumn && <td>{truncateText(row.goalName, 20)}</td>}
                    <td className="target-cell">
                      {row.targetValue}
                    </td>
                    <td>
                      <div 
                        className="achievement-badge"
                        style={{ backgroundColor: getProgressColor(row.achievement) }}
                      >
                        {row.achievement}%
                      </div>
                    </td>
                    <td className="actual-cell">
                      {row.actual.toFixed(2)}
                    </td>
                    <td className="weight-cell">
                      {row.weight}
                    </td>
                   
                    
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="table-footer">
                  <td colSpan={showGoalColumn ? 3 : 2} className="footer-label">
                    <strong>Total</strong>
                  </td>
                  <td className="footer-value">
                    <strong>
                      {tableData
                        .reduce((sum, row) => sum + parseFloat(row.targetValue || 0), 0)
                        .toFixed(2)}
                    </strong>
                  </td>
                  <td className="footer-value">
                    <strong>
                      {tableData.length > 0 
                        ? (tableData.reduce((sum, row) => sum + row.achievement, 0) / tableData.length).toFixed(1)
                        : 0}%
                    </strong>
                  </td>
                  <td className="footer-value actual">
                    <strong>
                      {tableData.reduce((sum, row) => sum + row.actual, 0).toFixed(2)}
                    </strong>
                  </td>
                  <td className="footer-value">
                    <strong>
                      {tableData.reduce((sum, row) => sum + row.weight, 0)}
                    </strong>
                  </td>
                  <td colSpan={2} className="footer-count">
                    <strong>{tableData.length} ዋና </strong>
                  </td>
                </tr>
              </tfoot>
            </table>
            
          
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading Minister Dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-alert">
        <div className="error-content">
          <span className="error-icon">⚠</span>
          <p>{error}</p>
          <button onClick={loadData} className="retry-button">
            <Icons.Refresh /> Retry
          </button>
        </div>
      </div>
    );
  }

  if (departments.length === 0 && rawDepartments.length > 0) {
    return (
      <div className="info-alert">
        <p>No departments with valid data for {selectedPeriod}. Try selecting a different period.</p>
        <div className="period-note">
          <p><strong>Note:</strong> Showing 0 of {rawDepartments.length} departments with valid {selectedPeriod === "Yearly" ? "የዓመቱ እቅድ" : selectedPeriod} values</p>
        </div>
        <div className="period-selector-container">
          <label>Change Period:</label>
          <select
            value={selectedPeriod}
            onChange={(e) => handlePeriodChange(e.target.value)}
            className="period-select"
          >
            {PERIOD_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-left">
          <h1>Minister Dashboard</h1>
          <p className="subtitle">Overview of departmental performance and goal progress</p>
          <div className="period-info">
            <span className="period-badge" style={{ backgroundColor: PERIOD_OPTIONS.find(p => p.value === selectedPeriod)?.color }}>
              {selectedPeriod}
            </span>
            <span className="valid-departments">
              Showing {departments.length} of {rawDepartments.length} departments with valid data
            </span>
          </div>
        </div>
        <div className="header-controls">
          <div className="period-selector">
            <label>Period:</label>
            <select
              value={selectedPeriod}
              onChange={(e) => handlePeriodChange(e.target.value)}
              className="period-select"
            >
              {PERIOD_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button className="refresh-button" onClick={loadData}>
            <Icons.Refresh /> Refresh Data
          </button>
        </div>
      </div>

      {/* Period Change Notification */}
      {showPeriodChangeNotification && (
        <div className="period-change-notification">
          <div className="notification-content">
            <span className="notification-icon">⚠</span>
            <span className="notification-text">{periodChangeMessage}</span>
            <button 
              className="notification-close"
              onClick={() => setShowPeriodChangeNotification(false)}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Period Info Banner */}
      <div className="period-info-banner">
        <div className="period-info-content">
          <div>
            <strong>Selected Period:</strong> {selectedPeriod}
            {selectedPeriod === "Yearly" && " (የዓመቱ እቅድ)"}
            {selectedPeriod === "6 Months" && " (1ኛ ሩብዓመት + 2ኛ ሩብዓመት)"}
            {selectedPeriod === "9 Months" && " (1ኛ ሩብዓመት + 2ኛ ሩብዓመት + 3ኛ ሩብዓመት)"}
          </div>
          <div className="current-view-info">
            {selectedDepartment && (
              <span className="current-view">
                Viewing: {selectedDepartment.displayName}
                {selectedGoal && ` > ${selectedGoal.displayName}`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Statistics Cards - Show only when not viewing department/goal details */}
      {!selectedDepartmentId && !selectedGoalId && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Valid Departments</div>
            <div className="stat-value">{departments.length}</div>
            <div className="stat-subtext">of {rawDepartments.length} total</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Valid Goals</div>
            <div className="stat-value">{stats.totalGoals}</div>
            <div className="stat-subtext">with period data</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Weighted Progress</div>
            <div className="stat-value progress">{stats.avgProgress}%</div>
            <div className="stat-subtext">Overall average</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Valid ዋና ተግባራት</div>
            <div className="stat-value issues">{stats.totalIssues}</div>
            <div className="stat-subtext">with period values</div>
          </div>
        </div>
      )}

      {/* Best Performer - Show only when not viewing department/goal details */}
      {bestDepartment && !selectedDepartmentId && !selectedGoalId && (
        <div className="best-performer">
          <div className="best-performer-content">
            <div className="best-performer-left">
              <h3><span className="trophy">🏆</span> Best Performing Department ({selectedPeriod})</h3>
              <h2>{bestDepartment.displayName}</h2>
              <p>Weighted Progress: <strong>{bestDepartment.avgProgress}%</strong></p>
              <p className="best-performer-subtext">
                
              </p>
            </div>
            <button 
              className="view-details-button"
              onClick={() => handleDepartmentClick(bestDepartment)}
            >
              View Details
            </button>
          </div>
        </div>
      )}

      {/* Main Content Tabs - Show only when not viewing department/goal details */}
      {!selectedDepartmentId && !selectedGoalId && (
        <>
          <div className="tabs">
            <button 
              className={`tab ${activeTab === 0 ? 'active' : ''}`}
              onClick={() => setActiveTab(0)}
            >
              <Icons.Timeline /> Department Progress
            </button>
            <button 
              className={`tab ${activeTab === 1 ? 'active' : ''}`}
              onClick={() => setActiveTab(1)}
            >
              <Icons.FilterList /> Goal Status Overview
            </button>
          </div>

          {activeTab === 0 && (
            <div className="chart-card">
              <h3>Department Performance ({selectedPeriod})</h3>
              <div className="chart-container">
                {departments.length > 0 ? (
                  <ResponsiveContainer width="100%" height={500}>
                    <BarChart
                      layout="vertical"
                      data={departments}
                      margin={{ top: 20, right: 30, left: 220, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" domain={[0, 100]} />
                      <YAxis
                        type="category"
                        dataKey="displayName"
                        width={220}
                        tick={({ x, y, payload }) => {
                          const dep = departments.find((d) => d.displayName === payload.value);
                          if (!dep) return null;
                          return (
                            <text
                              x={x - 10}
                              y={y + 5}
                              textAnchor="end"
                              className="chart-yaxis-label"
                              onClick={() => handleDepartmentClick(dep)}
                            >
                              {payload.value.length > 30
                                ? payload.value.substring(0, 27) + "..."
                                : payload.value}
                            </text>
                          );
                        }}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar
                        dataKey="avgProgress"
                        cursor="pointer"
                        onClick={(data) => handleDepartmentClick(data)}
                        radius={[4, 4, 0, 0]}
                        stroke="#ffffff"
                        strokeWidth={1}
                      >
                        {departments.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={getBarCellColor(entry.avgProgress)}
                            stroke="#ffffff"
                            strokeWidth={1}
                          />
                        ))}
                        <LabelList
                          dataKey="avgProgress"
                          position="right"
                          formatter={(v) => `${v}%`}
                          fill="#ffffff"
                          fontSize={12}
                          fontWeight="bold"
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="no-data-message">
                    <p>No departments have valid data for {selectedPeriod}</p>
                    <p className="hint">Try selecting a different period</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 1 && (
            <div className="chart-card">
              <h3>Goal Status Distribution ({selectedPeriod})</h3>
              <div className="status-grid">
                <div className="pie-chart-container">
                  {statusChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={statusChartData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {statusChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="no-data-message">
                      <p>No goal status data for {selectedPeriod}</p>
                    </div>
                  )}
                </div>
                <div className="department-list">
                  {departments.map((department) => (
                    <div key={department.id} className="department-card">
                      <div 
                        className="department-header"
                        onClick={() => handleDepartmentClick(department)}
                      >
                        <h4>{department.displayName}</h4>
                        <button 
                          className="collapse-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleDepartmentCollapse(department.id);
                          }}
                        >
                          <span className={`icon ${collapsedDepartments.has(department.id) ? 'collapsed' : ''}`}>
                            ▼
                          </span>
                        </button>
                      </div>
                      
                      {!collapsedDepartments.has(department.id) && department.goals.map((goal) => (
                        <div 
                          key={goal.id}
                          className="goal-item"
                          onClick={() => {
                            handleDepartmentClick(department);
                            setTimeout(() => handleGoalClick(goal), 100);
                          }}
                        >
                          <span className="goal-name">
                            {goal.displayName.length > 40 
                              ? `${goal.displayName.substring(0, 37)}...` 
                              : goal.displayName}
                          </span>
                          <span 
                            className="goal-status"
                            style={{ 
                              backgroundColor: goal.status.color,
                              color: goal.status.textColor || '#ffffff'
                            }}
                          >
                            {goal.status.label}
                          </span>
                          <span className="goal-progress">
                            {goal.progress}%
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Department Details View */}
      {selectedDepartment && !selectedGoalId && (
        <div className="chart-card">
          <div className="department-detail-header">
            <button className="back-button" onClick={handleBackToDepartments}>
              <Icons.ArrowBack /> Back
            </button>
            <div className="department-title">
              <h2>{selectedDepartment.displayName}</h2>
              <p>Department Goals and Progress ({selectedPeriod})</p>
              <div className="department-stats">
                <span className="department-stat">Weighted Progress: <strong>{selectedDepartment.avgProgress}%</strong></span>
                <span className="department-stat">Valid Goals: <strong>{selectedDepartment.goals?.length || 0}</strong></span>
                <span className="department-stat">Valid Issues: <strong>{selectedDepartment.validIssuesCount}</strong></span>
              </div>
            </div>
          </div>

          {selectedDepartment.goals.length > 0 ? (
            <div className="goals-chart-container">
              <div style={{ minWidth: selectedDepartment.goals.length * 200 }}>
                <BarChart
                  layout="horizontal"
                  data={selectedDepartment.goals}
                  width={selectedDepartment.goals.length * 200}
                  height={400}
                  margin={{ top: 20, right: 30, left: 20, bottom: 100 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <YAxis type="number" domain={[0, 100]} />
                  <XAxis
                    type="category"
                    dataKey="displayName"
                    height={100}
                    interval={0}
                    tick={({ x, y, payload }) => {
                      const goal = selectedDepartment.goals.find(
                        (g) => g.displayName === payload.value
                      );
                      if (!goal) return null;
                      return (
                        <text
                          x={x}
                          y={y + 15}
                          transform={`rotate(-45, ${x}, ${y + 15})`}
                          textAnchor="end"
                          className="chart-xaxis-label"
                          onClick={() => handleGoalClick(goal)}
                        >
                          {payload.value.length > 25
                            ? payload.value.substring(0, 22) + "..."
                            : payload.value}
                        </text>
                      );
                    }}
                  />
                  <Tooltip formatter={(value) => [`${value}%`, 'Progress']} />
                  <Bar
                    dataKey="progress"
                    cursor="pointer"
                    onClick={(data) => handleGoalClick(data)}
                    radius={[4, 4, 0, 0]}
                    stroke="#ffffff"
                    strokeWidth={1}
                  >
                    {selectedDepartment.goals.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={getBarCellColor(entry.progress)}
                        stroke="#ffffff"
                        strokeWidth={1}
                      />
                    ))}
                    <LabelList
                      dataKey="progress"
                      position="top"
                      formatter={(v) => `${v}%`}
                      fill="#ffffff"
                      fontSize={12}
                      fontWeight="bold"
                    />
                  </Bar>
                </BarChart>
              </div>
            </div>
          ) : (
            <div className="no-data">
              <p>No goals with valid data for {selectedPeriod}.</p>
            </div>
          )}

          {/* Department ዋና ተግባራት Analysis Table */}
          {selectedDepartment && (
            <div className="analysis-table-section">
              {renderAnalysisTable(
                departmentAnalysisTableData, 
                `${selectedDepartment.displayName} - ዋና ተግባራት Analysis`,
                true // Show goal column for department view
              )}
            </div>
          )}
        </div>
      )}

      {/* Goal Issues View */}
      {selectedGoal && (
        <div className="chart-card">
          <div className="goal-detail-header">
            <button className="back-button" onClick={handleBackToGoals}>
              <Icons.ArrowBack /> Back
            </button>
            <div className="goal-title">
              <h2>{selectedGoal.displayName}</h2>
              <div className="goal-metadata">
                <span 
                  className="goal-status-badge"
                  style={{ 
                    backgroundColor: selectedGoal.status.color,
                    color: selectedGoal.status.textColor || '#ffffff'
                  }}
                >
                  <span className="status-icon">{selectedGoal.status.icon}</span>
                  {selectedGoal.status.label}
                </span>
                <span className="goal-progress-text">
                  Weighted Progress: {selectedGoal.progress}%
                </span>
                <span className="goal-issues-count">
                  Valid Issues: {selectedGoal.issues.length}
                </span>
              </div>
            </div>
          </div>

          {/* Goal View Tabs */}
          <div className="goal-view-tabs">
            <button 
              className={`goal-tab ${goalViewTab === 'chart' ? 'active' : ''}`}
              onClick={() => setGoalViewTab('chart')}
            >
              <Icons.Timeline /> Progress Chart
            </button>
            <button 
              className={`goal-tab ${goalViewTab === 'table' ? 'active' : ''}`}
              onClick={() => setGoalViewTab('table')}
            >
              <Icons.Target /> ዋና ተግባራት Analysis Table
            </button>
          </div>

          {goalViewTab === 'chart' ? (
            <>
              {goalIssues.length > 0 ? (
                <div className="issues-chart-container">
                  <ResponsiveContainer width="100%" height={Math.max(400, goalIssues.length * 40)}>
                    <BarChart
                      layout="vertical"
                      data={goalIssues.map((issue) => ({
                        ...issue,
                        progress: calculateProgress(issue, selectedPeriod),
                        weight: getWeight(issue),
                      }))}
                      margin={{ top: 20, right: 30, left: 250, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" domain={[0, 100]} />
                      <YAxis
                        type="category"
                        dataKey="subject"
                        width={250}
                        tick={({ x, y, payload }) => {
                          const text =
                            payload.value.length > 40
                              ? payload.value.substring(0, 37) + "..."
                              : payload.value;
                          return (
                            <text
                              x={x - 10}
                              y={y + 5}
                              textAnchor="end"
                              className="chart-yaxis-label"
                            >
                              {text}
                            </text>
                          );
                        }}
                      />
                      <Tooltip content={<IssueTooltip />} />
                      <Bar 
                        dataKey="progress" 
                        barSize={25}
                        radius={[4, 4, 0, 0]}
                        stroke="#ffffff"
                        strokeWidth={1}
                      >
                        {goalIssues.map((entry, index) => {
                          const progress = calculateProgress(entry, selectedPeriod);
                          return (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={getBarCellColor(progress)}
                              stroke="#ffffff"
                              strokeWidth={1}
                            />
                          );
                        })}
                        <LabelList
                          dataKey="progress"
                          position="right"
                          formatter={(v) => `${v}%`}
                          fill="#ffffff"
                          fontSize={12}
                          fontWeight="bold"
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="no-data">
                  <p>No valid ዋና ተግባራት found for this goal ({selectedPeriod}).</p>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Goal ዋና ተግባራት Analysis Table */}
              {renderAnalysisTable(
                goalAnalysisTableData, 
                `${selectedGoal.displayName} - ዋና ተግባራት Analysis`,
                false // Don't show goal column for goal view
              )}
            </>
          )}
        </div>
      )}

      {/* Filtered Departments Modal */}
      {filteredDepartments.length > 0 && (
        <div className="filtered-departments-modal">
          <div className="modal-header">
            <h3>
              {filterCategory === 'total' && 'All Departments'}
              {filterCategory === 'active' && 'Active Departments'}
              {filterCategory === 'completed' && 'Completed Departments'}
              {filterCategory === 'struggling' && 'Departments Needing Help'}
              {filterCategory === 'excellent' && 'Excellent Departments (≥90%)'}
              {filterCategory === 'good' && 'Good Departments (75-89%)'}
              {filterCategory === 'average' && 'Average Departments (60-74%)'}
              {filterCategory === 'poor' && 'Departments Needing Attention (40-59%)'}
              {filterCategory === 'critical' && 'Critical Departments (<40%)'}
              <span className="department-count"> ({filteredDepartments.length})</span>
            </h3>
            <button className="close-button" onClick={clearFilter}>
              × Close
            </button>
          </div>
          <div className="filtered-departments-list">
            {filteredDepartments.map(department => (
              <div 
                key={department.id}
                className="filtered-department-item"
                onClick={() => handleDepartmentClick(department)}
              >
                <div className="department-info">
                  <h4>{department.displayName}</h4>
                  <p className="department-progress-text">
                    Weighted Progress: <strong>{department.avgProgress}%</strong>
                  </p>
                  
                </div>
                <div className="department-status">
                  <span 
                    className="status-badge"
                    style={{ 
                      backgroundColor: getGoalStatus(department.avgProgress).color,
                      color: getGoalStatus(department.avgProgress).textColor
                    }}
                  >
                    {getGoalStatus(department.avgProgress).label}
                  </span>
                  <span className="arrow-icon">→</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Department Performance Summary Box - Show only when not viewing department/goal details */}
      {!selectedDepartmentId && !selectedGoalId && departments.length > 0 && (
        <div className="department-summary-box">
          <div className="summary-header">
            <h3><Icons.Building /> Department Performance Summary ({selectedPeriod})</h3>
            <div className="total-departments">
              <span className="total-count">{departments.length}</span>
              <span className="total-label">Valid Departments</span>
              <span className="period-indicator">{selectedPeriod}</span>
            </div>
          </div>
          
          <div className="performance-categories">
            <div 
              className="category-card excellent"
              onClick={() => handleCategoryClick('excellent')}
            >
              <div className="category-header">
                <span className="category-icon">🏆</span>
                <h4>Excellent</h4>
              </div>
              <div className="category-count">{departmentPerformance.excellent}</div>
              <div className="category-range">≥ 90% Progress</div>
              <div className="category-percentage">
                {Math.round((departmentPerformance.excellent / departments.length) * 100)}%
              </div>
            </div>
            
            <div 
              className="category-card good"
              onClick={() => handleCategoryClick('good')}
            >
              <div className="category-header">
                <span className="category-icon">👍</span>
                <h4>Good</h4>
              </div>
              <div className="category-count">{departmentPerformance.good}</div>
              <div className="category-range">75-89% Progress</div>
              <div className="category-percentage">
                {Math.round((departmentPerformance.good / departments.length) * 100)}%
              </div>
            </div>
            
            <div 
              className="category-card average"
              onClick={() => handleCategoryClick('average')}
            >
              <div className="category-header">
                <span className="category-icon">📊</span>
                <h4>Average</h4>
              </div>
              <div className="category-count">{departmentPerformance.average}</div>
              <div className="category-range">60-74% Progress</div>
              <div className="category-percentage">
                {Math.round((departmentPerformance.average / departments.length) * 100)}%
              </div>
            </div>
            
            <div 
              className="category-card poor"
              onClick={() => handleCategoryClick('poor')}
            >
              <div className="category-header">
                <span className="category-icon">⚠️</span>
                <h4>Needs Attention</h4>
              </div>
              <div className="category-count">{departmentPerformance.poor}</div>
              <div className="category-range">40-59% Progress</div>
              <div className="category-percentage">
                {Math.round((departmentPerformance.poor / departments.length) * 100)}%
              </div>
            </div>
            
            <div 
              className="category-card critical"
              onClick={() => handleCategoryClick('critical')}
            >
              <div className="category-header">
                <span className="category-icon">🔴</span>
                <h4>Critical</h4>
              </div>
              <div className="category-count">{departmentPerformance.critical}</div>
              <div className="category-range">&lt; 40% Progress</div>
              <div className="category-percentage">
                {Math.round((departmentPerformance.critical / departments.length) * 100)}%
              </div>
            </div>
          </div>
          
          <div className="summary-footer">
            <div className="summary-stats">
              <div className="stat-item">
                <span className="stat-label">Highest Progress:</span>
                <span className="stat-value">{bestDepartment ? `${bestDepartment.avgProgress}%` : 'N/A'}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Lowest Progress:</span>
                <span className="stat-value">
                  {departments.length > 0 ? `${departments[departments.length - 1].avgProgress}%` : 'N/A'}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Median Progress:</span>
                <span className="stat-value">
                  {departments.length > 0 ? 
                    `${departments[Math.floor(departments.length / 2)].avgProgress}%` : 'N/A'
                  }
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Period:</span>
                <span className="stat-value period">{selectedPeriod}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="dashboard-footer">
        <p>
          Last updated: {new Date().toLocaleString()} • Data period: {selectedPeriod} • 
          
        </p>
      </div>
    </div>
  );
}