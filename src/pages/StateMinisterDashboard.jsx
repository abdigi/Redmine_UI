import React, { useEffect, useState, useCallback, useMemo } from "react";
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
// PERIOD DEFINITIONS (Date-based only)
// ============================

// Define fiscal year periods
const PERIOD_DATES = {
  YEARLY: {
    start: new Date("2025-07-08"),
    end: new Date("2026-07-07"),
    name: "Yearly",
    label: "Yearly (Fiscal Year 2025-26)",
    color: "#2E7D32"
  },
  Q1: {
    start: new Date("2025-07-08"),
    end: new Date("2025-10-10"),
    name: "1ኛ ሩብዓመት",
    label: "Q1 (Jul 8, 2025 - Oct 10, 2025)",
    color: "#1976d2"
  },
  Q2: {
    start: new Date("2025-10-11"),
    end: new Date("2026-01-08"),
    name: "2ኛ ሩብዓመት",
    label: "Q2 (Oct 11, 2025 - Jan 8, 2026)",
    color: "#1976d2"
  },
  Q3: {
    start: new Date("2026-01-09"),
    end: new Date("2026-04-08"),
    name: "3ኛ ሩብዓመት",
    label: "Q3 (Jan 9, 2026 - Apr 8, 2026)",
    color: "#1976d2"
  },
  Q4: {
    start: new Date("2026-04-09"),
    end: new Date("2026-07-07"),
    name: "4ኛ ሩብዓመት",
    label: "Q4 (Apr 9, 2026 - Jul 7, 2026)",
    color: "#1976d2"
  },
  "6_MONTHS": {
    start: new Date("2025-07-08"),
    end: new Date("2026-01-08"),
    name: "6 Months",
    label: "6 Months (Jul 8, 2025 - Jan 8, 2026)",
    color: "#f57c00"
  },
  "9_MONTHS": {
    start: new Date("2025-07-08"),
    end: new Date("2026-04-08"),
    name: "9 Months",
    label: "9 Months (Jul 8, 2025 - Apr 8, 2026)",
    color: "#f57c00"
  }
};

// Helper function to check if date is valid
const isValidDate = (dateString) => {
  if (!dateString) return false;
  const date = new Date(dateString);
  return !isNaN(date.getTime());
};

// Helper function to calculate date overlap percentage
const calculateDateOverlap = (startDate, dueDate, periodName) => {
  if (!isValidDate(startDate) || !isValidDate(dueDate)) return 0;
  
  const start = new Date(startDate);
  const due = new Date(dueDate);
  
  // Find period
  let periodData;
  if (periodName === "Yearly") {
    periodData = PERIOD_DATES.YEARLY;
  } else if (periodName === "6 Months") {
    periodData = PERIOD_DATES["6_MONTHS"];
  } else if (periodName === "9 Months") {
    periodData = PERIOD_DATES["9_MONTHS"];
  } else {
    // Find quarterly period
    periodData = Object.values(PERIOD_DATES).find(p => p.name === periodName);
  }
  
  if (!periodData) return 0;
  
  // If issue is completely outside period
  if (due < periodData.start || start > periodData.end) return 0;
  
  // Calculate overlapping days
  const overlapStart = start < periodData.start ? periodData.start : start;
  const overlapEnd = due > periodData.end ? periodData.end : due;
  
  const totalIssueDays = (due - start) / (1000 * 60 * 60 * 24);
  const overlapDays = (overlapEnd - overlapStart) / (1000 * 60 * 60 * 24);
  
  // Return percentage of issue that falls within period
  return totalIssueDays > 0 ? (overlapDays / totalIssueDays) * 100 : 100; // If same day, consider 100%
};

// Helper function to filter issues without parent
const filterTopLevelIssues = (issues) => {
  return issues.filter(issue => !issue.parent_id && !issue.parent);
};

// Filter issues by selected period based on date overlap
const filterIssuesByPeriod = (issues, period) => {
  return issues.filter(issue => {
    if (!issue.start_date || !issue.due_date) return false;
    
    const overlap = calculateDateOverlap(issue.start_date, issue.due_date, period);
    return overlap > 0;
  });
};

// Calculate progress based on date overlap
const mapProgress = (done, period, issue = null) => {
  if (!done) done = 0;
  
  // If we have issue with dates, calculate date-based progress
  if (issue && issue.start_date && issue.due_date) {
    const overlapPercentage = calculateDateOverlap(issue.start_date, issue.due_date, period);
    
    // If no overlap, return 0
    if (overlapPercentage <= 0) return 0;
    
    // Calculate adjusted progress based on overlap
    // Progress is proportional to both completion percentage and date overlap
    const adjustedProgress = (done * overlapPercentage) / 100;
    return Math.min(100, Math.round(adjustedProgress));
  }
  
  // Fallback for issues without dates (use simple logic)
  return done;
};

// Get weight - default to 1 since we removed custom field
const getWeight = (issue) => {
  return 1; // All issues have equal weight without custom field
};

// ============================
// TARGET VALUE FUNCTIONS (Simplified - using only dates)
// ============================

// Get target value - simplified since we don't have custom field targets
// We'll use a default target of 100 for all issues, adjusted by date overlap
const getTargetValue = (issue, period) => {
  if (!issue) return "100"; // Default target
  
  if (!issue.start_date || !issue.due_date) return "100";
  
  const overlapPercentage = calculateDateOverlap(issue.start_date, issue.due_date, period);
  
  // Target is proportional to date overlap
  const target = (100 * overlapPercentage) / 100; // Base target of 100, adjusted by overlap
  return target.toFixed(2);
};

// Calculate actual value
const calculateActualValue = (achievement, targetValue) => {
  if (!achievement || !targetValue) return 0;
  
  const achievementNum = parseFloat(achievement.toString().trim());
  const targetNum = parseFloat(targetValue.toString().trim());
  
  if (isNaN(achievementNum) || isNaN(targetNum) || targetNum === 0) return 0;
  
  return (achievementNum / 100) * targetNum;
};

// Check if target value is valid (always true for date-based system)
const isValidTargetValue = (targetValue) => {
  if (!targetValue) return false;
  const numValue = parseFloat(targetValue.toString().trim());
  return !isNaN(numValue) && numValue > 0;
};

// Helper function to truncate text
const truncateText = (text, maxLength = 20) => {
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
};

// Get progress color based on percentage
const getProgressColor = (percentage) => {
  if (percentage >= 90) return "#2e7d32";
  if (percentage >= 75) return "#4caf50";
  if (percentage >= 60) return "#ff9800";
  if (percentage >= 40) return "#6a1b9a";
  return "#d32f2f";
};

// ============================
// PERIOD OPTIONS
// ============================

const PERIOD_OPTIONS = [
  { value: "Yearly", label: "Yearly", color: "#2E7D32" },
  { value: "1ኛ ሩብዓመት", label: "Q1", color: "#1976d2" },
  { value: "2ኛ ሩብዓመት", label: "Q2", color: "#1976d2" },
  { value: "3ኛ ሩብዓመት", label: "Q3", color: "#1976d2" },
  { value: "4ኛ ሩብዓመት", label: "Q4", color: "#1976d2" },
  { value: "6 Months", label: "6 Months", color: "#f57c00" },
  { value: "9 Months", label: "9 Months", color: "#f57c00" },
];

// Status configuration
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

// Get contrasting text color
const getContrastColor = (hexColor) => {
  const r = parseInt(hexColor.substr(1, 2), 16);
  const g = parseInt(hexColor.substr(3, 2), 16);
  const b = parseInt(hexColor.substr(5, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#000000" : "#ffffff";
};

// Icons as text
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
  const [goalViewTab, setGoalViewTab] = useState("chart");
  const [showPeriodChangeNotification, setShowPeriodChangeNotification] = useState(false);
  const [periodChangeMessage, setPeriodChangeMessage] = useState("");
  const [rawDepartments, setRawDepartments] = useState([]);

  // Memoized progress calculation
  const calculateProgress = useCallback((issue, period) => {
    return mapProgress(issue.done_ratio || 0, period, issue);
  }, []);

  // Memoized status determination
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
    
    return {
      ...status,
      textColor: getContrastColor(status.color)
    };
  }, []);

  // Load data - ONLY on initial mount - FIXED: No duplicate issues
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

      const departmentPromises = mainProjects.map(async (dep, index) => {
        try {
          // IMPORTANT FIX: Do NOT fetch issues from department projects
          // Department projects should only serve as containers for goals
          // Issues should only come from goal projects (subprojects)
          
          // Fetch department goals (subprojects)
          const goals = await getSubprojects(dep.id).catch(() => []);

          // Fetch and process issues for each goal ONLY
          const goalsWithIssues = await Promise.all(
            goals.map(async (goal, goalIndex) => {
              try {
                // Fetch all issues for the goal project
                const issuesRaw = await getProjectIssues({ 
                  project_id: goal.id, 
                  status_id: "*" 
                }).catch(() => []);
                
                // Filter for top-level issues only
                const topLevelIssues = filterTopLevelIssues(issuesRaw);
                
                return { 
                  ...goal, 
                  // Store both raw and filtered issues
                  allIssues: issuesRaw,
                  topLevelIssues: topLevelIssues,
                  displayName: `${String.fromCharCode(65 + goalIndex)}. ${goal.name}`
                };
              } catch (err) {
                console.error(`Error loading issues for goal ${goal.name}:`, err);
                return {
                  ...goal,
                  allIssues: [],
                  topLevelIssues: [],
                  displayName: `${String.fromCharCode(65 + goalIndex)}. ${goal.name}`
                };
              }
            })
          );

          return {
            ...dep,
            displayName: `${index + 1}. ${dep.name}`,
            goals: goalsWithIssues,
            // IMPORTANT: Do NOT fetch issues from department project itself
            // Only goals should have issues
            directTopLevelIssues: [], // Empty array for department-level issues
          };
        } catch (err) {
          console.error(`Error loading department ${dep.name}:`, err);
          return { 
            ...dep, 
            displayName: `${index + 1}. ${dep.name}`,
            goals: [], 
            directTopLevelIssues: [] // Empty array
          };
        }
      });

      const allDepartmentData = await Promise.all(departmentPromises);
      setRawDepartments(allDepartmentData);
      // Apply the current period filter to the loaded data
      updateFilteredData(allDepartmentData, selectedPeriod);
      
    } catch (err) {
      console.error("Error loading dashboard data:", err);
      setError("Failed to load dashboard data. Please try again.");
      setRawDepartments([]);
      setDepartments([]);
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod]);

  // Filter and calculate data based on selected period - FIXED: No duplicate counting
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

    const processedDepartments = rawData.map((dep) => {
      // No direct department issues - all issues come from goals
      // So we skip filtering direct department issues
      
      // Process goals
      const goalsWithProgress = dep.goals.map((goal, goalIndex) => {
        // Filter goal's top-level issues by period
        const filteredGoalIssues = filterIssuesByPeriod(goal.topLevelIssues || [], period);
        
        let totalProgress = 0;
        
        if (filteredGoalIssues.length > 0) {
          filteredGoalIssues.forEach(issue => {
            const progress = calculateProgress(issue, period);
            totalProgress += progress;
          });
          totalProgress = Math.round(totalProgress / filteredGoalIssues.length);
        }
        
        const status = getGoalStatus(totalProgress);
        
        return { 
          ...goal, 
          progress: totalProgress, 
          issues: filteredGoalIssues, // Only top-level, period-filtered issues
          status,
          displayName: `${String.fromCharCode(65 + goalIndex)}. ${goal.name}`,
          validIssuesCount: filteredGoalIssues.length
        };
      });

      let depTotalProgress = 0;
      let depIssueCount = 0;
      
      // FIXED: Only count issues from goals, NOT from department itself
      goalsWithProgress.forEach(goal => {
        goal.issues.forEach(issue => {
          const progress = calculateProgress(issue, period);
          depTotalProgress += progress;
          depIssueCount++;
        });
      });
      
      const depProgress = depIssueCount > 0 ? Math.round(depTotalProgress / depIssueCount) : 0;
      const totalValidIssues = goalsWithProgress.reduce((sum, goal) => sum + goal.validIssuesCount, 0);

      return {
        ...dep,
        goals: goalsWithProgress,
        avgProgress: depProgress,
        directIssues: [], // Empty - no direct department issues
        validIssuesCount: totalValidIssues,
        hasValidData: totalValidIssues > 0 && depProgress > 0
      };
    });

    const validDepartments = processedDepartments.filter(dep => dep.hasValidData);
    const sortedDepartments = [...validDepartments].sort((a, b) => b.avgProgress - a.avgProgress);

    // FIXED: Collect all issues from goals only
    const allGoals = validDepartments.flatMap(dep => dep.goals);
    const allIssues = validDepartments.flatMap(dep => 
      dep.goals.flatMap(goal => goal.issues)
    );

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
    setFilteredDepartments([]);
    setFilterCategory(null);
  }, [calculateProgress, getGoalStatus]);

  // Load data ONLY on initial mount
  useEffect(() => {
    loadData();
  }, []); // Empty dependency array means this runs only once on mount

  // Update when period changes - ONLY filter existing data
  useEffect(() => {
    if (rawDepartments.length > 0) {
      updateFilteredData(rawDepartments, selectedPeriod);
    }
  }, [selectedPeriod, rawDepartments, updateFilteredData]);

  // Handlers
  const handleCategoryClick = useCallback((category) => {
    let filtered = [];
    
    switch(category) {
      case 'total': filtered = departments; break;
      case 'active': filtered = departments.filter(d => d.avgProgress > 0 && d.avgProgress < 100); break;
      case 'completed': filtered = departments.filter(d => d.avgProgress >= 95); break;
      case 'struggling': filtered = departments.filter(d => d.avgProgress < 50); break;
      case 'excellent': filtered = departments.filter(d => d.avgProgress >= 90); break;
      case 'good': filtered = departments.filter(d => d.avgProgress >= 75 && d.avgProgress < 90); break;
      case 'average': filtered = departments.filter(d => d.avgProgress >= 60 && d.avgProgress < 75); break;
      case 'poor': filtered = departments.filter(d => d.avgProgress >= 40 && d.avgProgress < 60); break;
      case 'critical': filtered = departments.filter(d => d.avgProgress < 40); break;
      default: filtered = departments;
    }
    
    setFilteredDepartments(filtered);
    setFilterCategory(category);
  }, [departments]);

  const clearFilter = useCallback(() => {
    setFilteredDepartments([]);
    setFilterCategory(null);
  }, []);

  const handleDepartmentClick = useCallback((dep) => {
    setSelectedDepartmentId(dep.id);
    setSelectedGoalId(null);
    setGoalIssues([]);
    setActiveTab(0);
    setGoalViewTab("chart");
  }, []);

  const handleGoalClick = useCallback((goal, departmentId = null) => {
    if (departmentId && departmentId !== selectedDepartmentId) {
      // If clicking from department list view, set department first
      setSelectedDepartmentId(departmentId);
      
      // Use setTimeout to ensure department is set before selecting goal
      setTimeout(() => {
        setSelectedGoalId(goal.id);
        setGoalIssues(goal.issues || []);
        setGoalViewTab("chart");
      }, 50);
    } else {
      // If already in department view, just select the goal
      setSelectedGoalId(goal.id);
      setGoalIssues(goal.issues || []);
      setGoalViewTab("chart");
    }
  }, [selectedDepartmentId]);

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

  const handlePeriodChange = useCallback((newPeriod) => {
    setSelectedPeriod(newPeriod);
    setActiveTab(0);
    setGoalViewTab("chart");
    // Just update the period, the useEffect above will handle filtering
  }, []);

  // Memoized data
  const selectedDepartment = useMemo(() => 
    departments.find(dep => dep.id === selectedDepartmentId),
    [departments, selectedDepartmentId]
  );

  const selectedGoal = useMemo(() => 
    selectedDepartment?.goals.find(g => g.id === selectedGoalId),
    [selectedDepartment, selectedGoalId]
  );

  // Analysis table data for selected goal
  const goalAnalysisTableData = useMemo(() => {
    if (!selectedGoal || !selectedGoal.issues || selectedGoal.issues.length === 0) return [];
    
    const data = selectedGoal.issues.map(issue => {
      const targetValue = getTargetValue(issue, selectedPeriod);
      const achievement = mapProgress(issue.done_ratio || 0, selectedPeriod, issue);
      const actual = calculateActualValue(achievement, targetValue);
      
      return {
        id: issue.id,
        subject: issue.subject,
        startDate: issue.start_date || "No start date",
        dueDate: issue.due_date || "No due date",
        targetValue: targetValue,
        achievement: achievement,
        actual: actual,
        status: issue.status?.name || "Unknown",
        hasValidTarget: isValidTargetValue(targetValue),
        dateOverlap: calculateDateOverlap(issue.start_date, issue.due_date, selectedPeriod).toFixed(1),
        isTopLevel: !issue.parent_id && !issue.parent
      };
    });
    
    // Only include top-level issues in analysis table
    return data.filter(row => row.isTopLevel && row.hasValidTarget);
  }, [selectedGoal, selectedPeriod]);

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

  // Check if current selection has data for new period
  useEffect(() => {
    if (!selectedDepartmentId) return;
    
    const currentDept = departments.find(dep => dep.id === selectedDepartmentId);
    
    if (!currentDept) {
      setPeriodChangeMessage(`The selected department has no valid data for ${selectedPeriod}. Returning to department list.`);
      setShowPeriodChangeNotification(true);
      
      const timer = setTimeout(() => {
        setSelectedDepartmentId(null);
        setSelectedGoalId(null);
        setGoalIssues([]);
        setShowPeriodChangeNotification(false);
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [departments, selectedDepartmentId, selectedPeriod]);

  useEffect(() => {
    if (!selectedGoalId || !selectedDepartment) return;
    
    const currentGoal = selectedDepartment.goals?.find(g => g.id === selectedGoalId);
    
    if (!currentGoal) {
      setPeriodChangeMessage(`The selected goal has no valid data for ${selectedPeriod}. Returning to department view.`);
      setShowPeriodChangeNotification(true);
      
      const timer = setTimeout(() => {
        setSelectedGoalId(null);
        setGoalIssues([]);
        setShowPeriodChangeNotification(false);
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [selectedGoalId, selectedDepartment, selectedPeriod]);

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="custom-tooltip">
          <p className="tooltip-label"><strong>{label}</strong></p>
          <p className="tooltip-value">Progress: {payload[0].value}%</p>
          <p className="tooltip-period">Period: {selectedPeriod}</p>
          {data.validIssuesCount !== undefined && (
            <p className="tooltip-issues">Valid Issues: {data.validIssuesCount}</p>
          )}
          <p className="tooltip-note">Showing top-level issues only</p>
        </div>
      );
    }
    return null;
  };

  const IssueTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const dateOverlap = calculateDateOverlap(data.start_date, data.due_date, selectedPeriod);
      
      return (
        <div className="custom-tooltip">
          <p className="tooltip-label"><strong>{data.subject}</strong></p>
          <p className="tooltip-value">Progress: {payload[0].value}%</p>
          <p className="tooltip-period">Period: {selectedPeriod}</p>
          <p className="tooltip-dates">
            Dates: {data.start_date ? new Date(data.start_date).toLocaleDateString() : "No start"} - 
            {data.due_date ? new Date(data.due_date).toLocaleDateString() : "No due"}
          </p>
          <p className="tooltip-overlap">Date Overlap: {dateOverlap.toFixed(1)}%</p>
          <p className="tooltip-note">Top-level issue (no parent)</p>
        </div>
      );
    }
    return null;
  };

  // Prepare data for bar chart with progress colors
  const getBarCellColor = (progress) => {
    return getProgressColor(progress);
  };

  // Render Analysis Table component (only for goals now)
  const renderAnalysisTable = (tableData, title, showGoalColumn = false) => {
    return (
      <div className="analysis-table-container">
        <h3>{title} ({selectedPeriod})</h3>
        <div className="table-note">
          <span className="note-icon">ℹ️</span>
          Showing only top-level issues (issues without parent issues)
        </div>
        
        {tableData.length === 0 ? (
          <div className="no-data-message">
            <p>No top-level issues with valid date ranges for {selectedPeriod}</p>
            <p className="hint">
              Issues must have both start and due dates that overlap with the selected period and be top-level (no parent issues)
            </p>
          </div>
        ) : (
          <div className="analysis-table-wrapper">
            <table className="analysis-table">
              <thead>
                <tr>
                  <th>Issue</th>
                  <th>Start Date</th>
                  <th>Due Date</th>
                  {showGoalColumn && <th>Goal</th>}
                  <th>Target Value</th>
                  <th>Achievement (%)</th>
                  <th>Actual Value</th>
                  <th>Date Overlap</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {tableData.map((row, index) => (
                  <tr key={row.id}>
                    <td className="subject-cell" title={row.subject}>
                      {truncateText(row.subject, 40)}
                    </td>
                    <td>{row.startDate}</td>
                    <td>{row.dueDate}</td>
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
                    <td className="overlap-cell">
                      {row.dateOverlap}%
                    </td>
                    <td>
                      <span className="status-badge">{row.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="table-footer">
                  <td colSpan={showGoalColumn ? 4 : 3} className="footer-label">
                    <strong>Total/Average</strong>
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
                      {tableData.length > 0 
                        ? (tableData.reduce((sum, row) => sum + parseFloat(row.dateOverlap), 0) / tableData.length).toFixed(1)
                        : 0}%
                    </strong>
                  </td>
                  <td className="footer-count">
                    <strong>{tableData.length} top-level issues</strong>
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
        <p>No departments with valid top-level issue data for {selectedPeriod}. Try selecting a different period.</p>
        <div className="period-note">
          <p><strong>Note:</strong> Only top-level issues (no parent) with both start and due dates overlapping the selected period are shown</p>
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
      {/* Header - Simplified */}
      <div className="dashboard-header">
        <div className="header-left">
          <h1>Minister Dashboard</h1>
          <p className="subtitle">Overview of departmental performance based on top-level issue dates</p>
          <div className="period-info">
            <span className="period-badge" style={{ backgroundColor: PERIOD_OPTIONS.find(p => p.value === selectedPeriod)?.color }}>
              {selectedPeriod}
            </span>
            <span className="valid-departments">
              Showing {departments.length} of {rawDepartments.length} departments with valid top-level issues
            </span>
          </div>
        </div>
        <div className="header-controls">
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

      {/* Statistics Cards */}
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
            <div className="stat-subtext">with top-level issues</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Weighted Progress</div>
            <div className="stat-value progress">{stats.avgProgress}%</div>
            <div className="stat-subtext">Overall average</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Top-Level Issues</div>
            <div className="stat-value issues">{stats.totalIssues}</div>
            <div className="stat-subtext">no parent issues</div>
          </div>
        </div>
      )}

      {/* Main Content Tabs */}
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
              <div className="chart-header-with-period">
                <h3>Department Performance ({selectedPeriod})</h3>
                <div className="tab-period-selector">
                  <label>View for period:</label>
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
              
              {/* Best Performer Inside Department Progress Tab */}
              {bestDepartment && (
                <div className="best-performer-in-tab">
                  <div className="best-performer-content">
                    <div className="best-performer-left">
                      <h3><span className="trophy">🏆</span> Best Performing Department</h3>
                      <h2>{bestDepartment.displayName}</h2>
                      <p>Date-based Progress: <strong>{bestDepartment.avgProgress}%</strong></p>
                      <p className="best-performer-subtext">
                        Based on {bestDepartment.validIssuesCount} top-level issues
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
                    <p>No departments have top-level issues overlapping with {selectedPeriod}</p>
                    <p className="hint">Try selecting a different period</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 1 && (
            <div className="chart-card">
              <div className="chart-header-with-period">
                <h3>Goal Status Distribution ({selectedPeriod})</h3>
                <div className="tab-period-selector">
                  <label>View for period:</label>
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
                          onClick={(e) => {
                            e.stopPropagation();
                            handleGoalClick(goal, department.id);
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
                <span className="department-stat">Date-based Progress: <strong>{selectedDepartment.avgProgress}%</strong></span>
                <span className="department-stat">Valid Goals: <strong>{selectedDepartment.goals?.length || 0}</strong></span>
                <span className="department-stat">Top-Level Issues: <strong>{selectedDepartment.validIssuesCount}</strong></span>
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
                          onClick={() => handleGoalClick(goal, selectedDepartment.id)}
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
                    onClick={(data) => handleGoalClick(data, selectedDepartment.id)}
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
              <p>No goals with top-level issues overlapping {selectedPeriod}.</p>
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
                  Date-based Progress: {selectedGoal.progress}%
                </span>
                <span className="goal-issues-count">
                  Top-Level Issues: {selectedGoal.issues.length}
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
              <Icons.Target /> Date-based Analysis Table
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
                  <p>No top-level issues with date overlaps for this goal ({selectedPeriod}).</p>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Goal Analysis Table */}
              {renderAnalysisTable(
                goalAnalysisTableData, 
                `${selectedGoal.displayName} - Top-Level Issues Analysis`,
                false
              )}
            </>
          )}
        </div>
      )}

      {/* Department Performance Summary Box */}
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
          Showing only top-level issues (no parent issues) with valid date overlaps
        </p>
      </div>
    </div>
  );
}