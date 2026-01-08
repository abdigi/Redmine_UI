import { useEffect, useState, useCallback, useMemo, useRef } from "react";
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
  Sector
} from "recharts";
import {
  getWatchedOneLevelIssues,
  getCurrentUser,
  getUsersInGroup,
  getProjectMembers,
  getGroupDetails
} from "../api/redmineApi";

// Utility functions (these can stay outside since they don't use component state)
const formatDate = (dateString) => {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString();
};

const truncateText = (text, maxLength = 20) => {
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
};

const getProgressColor = (percentage) => {
  if (percentage === 100) return "#2e7d32"; // Green
  if (percentage >= 75) return "#4caf50";   // Light green
  if (percentage >= 50) return "#ff9800";   // Orange
  if (percentage > 0) return "#ff5722";     // Dark orange
  return "#f44336";                         // Red
};

// ============================
// PERIOD FILTERING FUNCTIONS
// ============================

// Get custom field value from issue
const getField = (issue, fieldName) => {
  const field = issue.custom_fields?.find((f) => f.name === fieldName);
  return field?.value;
};

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
const getQuarterRanges = (validQuartersCount, targetQuarterIndex, issue = null) => {
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
    
    if (!issue) {
      // If no issue provided, assume first 3 quarters
      const ranges = [
        { start: 0, end: segment },
        { start: segment, end: segment * 2 },
        { start: segment * 2, end: 100 }
      ];
      return targetQuarterIndex <= 3 ? ranges[targetQuarterIndex - 1] : { start: 0, end: 100 };
    }
    
    // Determine which specific quarters are valid and map them
    const quarters = ["1ኛ ሩብዓመት", "2ኛ ሩብዓመት", "3ኛ ሩብዓመት", "4ኛ ሩብዓመት"];
    const validQuarters = quarters.filter(q => hasValidQuarterValue(issue, q));
    
    // Create ranges for valid quarters
    const ranges = [];
    let currentStart = 0;
    const segmentSize = 100 / validQuarters.length;
    
    validQuarters.forEach((quarter, index) => {
      const quarterIdx = getQuarterIndex(quarter);
      ranges[quarterIdx - 1] = {
        start: currentStart,
        end: currentStart + segmentSize
      };
      currentStart += segmentSize;
    });
    
    return ranges[targetQuarterIndex - 1] || { start: 0, end: 100 };
  }
  
  if (validQuartersCount === 2) {
    // 2 quarters valid - equal 50% each
    if (!issue) {
      // If no issue provided, assume Q1 and Q2
      const ranges = [
        { start: 0, end: 50 },    // First valid quarter
        { start: 50, end: 100 }   // Second valid quarter
      ];
      
      // Determine which range to use based on quarter index
      if (targetQuarterIndex === 1 || targetQuarterIndex === 2) return ranges[0];
      if (targetQuarterIndex === 3 || targetQuarterIndex === 4) return ranges[1];
      return { start: 0, end: 100 };
    }
    
    // Determine which specific quarters are valid
    const quarters = ["1ኛ ሩብዓመት", "2ኛ ሩብዓመት", "3ኛ ሩብዓመት", "4ኛ ሩብዓመት"];
    const validQuarters = quarters.filter(q => hasValidQuarterValue(issue, q));
    
    if (validQuarters.length !== 2) {
      return { start: 0, end: 100 };
    }
    
    // Create ranges for the specific valid quarters
    const ranges = {};
    const segmentSize = 100 / validQuarters.length;
    let currentStart = 0;
    
    validQuarters.forEach((quarter, index) => {
      const quarterIdx = getQuarterIndex(quarter);
      ranges[quarterIdx] = {
        start: currentStart,
        end: currentStart + segmentSize
      };
      currentStart += segmentSize;
    });
    
    // Return the range for the target quarter
    return ranges[targetQuarterIndex] || { start: 0, end: 100 };
  }
  
  if (validQuartersCount === 1) {
    // 1 quarter valid - use full range
    return { start: 0, end: 100 };
  }
  
  // Default fallback
  return { start: 0, end: 100 };
};

// Helper function to check if a specific quarter has valid value
const hasQuarterValue = (issue, quarter) => {
  const value = getField(issue, quarter);
  return value && value !== "0" && value !== "" && value !== "0.0" && value !== "0.00";
};

// Map progress based on selected period and quarterly distribution
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
    // If no issue provided, use old simple logic
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
    const hasThisQuarterValue = hasQuarterValue(issue, period);
    
    // If this quarter doesn't have a value, return 0
    if (!hasThisQuarterValue) {
      return 0;
    }
    
    // Count how many quarterly fields have valid values
    const validQuartersCount = countValidQuarters(issue);
    const targetQuarterIndex = getQuarterIndex(period);
    
    // Get the range for this quarter based on valid quarters count
    const range = getQuarterRanges(validQuartersCount, targetQuarterIndex, issue);
    
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

// Helper function to get weight with default value
const getWeight = (issue) => {
  const weightValue = getField(issue, "ክብደት");
  if (!weightValue || weightValue === "0" || weightValue === "") {
    return 1; // Default weight
  }
  return Number(weightValue) || 1;
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

// Calculate weighted progress for a user - UPDATED to use mapProgress with issue
const calculateWeightedProgress = (userIssues, period) => {
  let totalWeight = 0;
  let weightedProgress = 0;

  userIssues.forEach((issue) => {
    const weight = getWeight(issue);
    const progress = mapProgress(issue.done_ratio || 0, period, issue);
    totalWeight += weight;
    weightedProgress += progress * weight;
  });

  return totalWeight > 0 ? Math.round(weightedProgress / totalWeight) : 0;
};

// Filter sub-issues by period based on their OWN custom field values
const filterSubIssuesByPeriod = (subIssues, period) => {
  if (period === "Yearly") {
    return subIssues.filter(subIssue => {
      const yearlyValue = getField(subIssue, "የዓመቱ እቅድ");
      return yearlyValue && yearlyValue !== "0" && yearlyValue !== "";
    });
  }

  if (period === "6 Months") {
    return subIssues.filter(subIssue => {
      const q1 = getField(subIssue, "1ኛ ሩብዓመት");
      const q2 = getField(subIssue, "2ኛ ሩብዓመት");
      // Include if either quarter has a valid value
      return (q1 && q1 !== "0" && q1 !== "") || (q2 && q2 !== "0" && q2 !== "");
    });
  }

  if (period === "9 Months") {
    return subIssues.filter(subIssue => {
      const q1 = getField(subIssue, "1ኛ ሩብዓመት");
      const q2 = getField(subIssue, "2ኛ ሩብዓመት");
      const q3 = getField(subIssue, "3ኛ ሩብዓመት");
      // Include if any of the quarters has a valid value
      return (q1 && q1 !== "0" && q1 !== "") || 
             (q2 && q2 !== "0" && q2 !== "") || 
             (q3 && q3 !== "0" && q3 !== "");
    });
  }

  // Quarterly filtering
  return subIssues.filter(subIssue => {
    const val = getField(subIssue, period);
    return val && val !== "0" && val !== "";
  });
};

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

// ============================
// GROUP FUNCTIONS
// ============================

// Update the normalizeGroupName function to handle more cases:
const normalizeGroupName = (groupName) => {
  if (!groupName) return "";
  
  // Remove [Group] suffix and any extra spaces
  let normalized = groupName.toString()
    .replace(/\[Group\]/gi, '')
    .replace(/\[group\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Also remove any parentheses that might contain "Group"
  normalized = normalized.replace(/\s*\(.*?\)\s*/g, ' ').trim();
  
  return normalized;
};

// Also update the isGroupAssignment function to be more inclusive:
const isGroupAssignment = (assignedTo) => {
  if (!assignedTo) return false;
  
  // Check type field
  if (assignedTo.type === "Group" || assignedTo.type === "group") return true;
  
  // Check name for [Group] suffix or (Group) or similar
  if (assignedTo.name) {
    const name = assignedTo.name.toLowerCase();
    if (name.includes('[group]') || 
        name.includes('(group)') || 
        name.includes(' group') ||
        name.endsWith(' group')) {
      return true;
    }
  }
  
  // If it has an ID but no user details, might be a group
  if (assignedTo.id && !assignedTo.firstname && !assignedTo.lastname) {
    return true;
  }
  
  return false;
};

// Function to extract clean group name from assigned_to
const extractGroupName = (assignedTo) => {
  if (!assignedTo || !assignedTo.name) return "";
  
  let groupName = assignedTo.name;
  
  // If it's already marked as a group in name, use as-is
  if (groupName.includes('[Group]') || 
      groupName.includes('(Group)') ||
      assignedTo.type === 'Group') {
    return normalizeGroupName(groupName);
  }
  
  // Check if this might be a group by looking at the structure
  // Groups often don't have firstname/lastname fields
  if (!assignedTo.firstname && !assignedTo.lastname && assignedTo.id) {
    // This might be a group, not a user
    return normalizeGroupName(groupName);
  }
  
  return normalizeGroupName(groupName);
};

// Custom active shape for pie chart
const renderActiveShape = (props) => {
  const RADIAN = Math.PI / 180;
  const { cx, cy, midAngle, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;
  const sin = Math.sin(-RADIAN * midAngle);
  const cos = Math.cos(-RADIAN * midAngle);
  const sx = cx + (outerRadius + 10) * cos;
  const sy = cy + (outerRadius + 10) * sin;
  const mx = cx + (outerRadius + 30) * cos;
  const my = cy + (outerRadius + 30) * sin;
  const ex = mx + (cos >= 0 ? 1 : -1) * 22;
  const ey = my;
  const textAnchor = cos >= 0 ? 'start' : 'end';

  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx}
        cy={cy}
        startAngle={startAngle}
        endAngle={endAngle}
        innerRadius={outerRadius + 6}
        outerRadius={outerRadius + 10}
        fill={fill}
      />
      <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} fill="none" />
      <circle cx={ex} cy={ey} r={2} fill={fill} stroke="none" />
      <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} textAnchor={textAnchor} fill="#333">
        {`${payload.name}: ${value}%`}
      </text>
      <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} dy={18} textAnchor={textAnchor} fill="#999">
        {`(${(percent * 100).toFixed(2)}%)`}
      </text>
    </g>
  );
};

function TeamLeaderDashboard() {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewList, setViewList] = useState(null);
  const [groupUsers, setGroupUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [userPerformanceData, setUserPerformanceData] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedUserIssues, setSelectedUserIssues] = useState([]);
  const [bestPerformer, setBestPerformer] = useState({
    name: "None",
    performance: 0,
    rawPerformance: 0,
    maxWeight: 0,
    completedIssues: 0,
    totalIssues: 0,
    id: null,
    login: "",
    issues: [],
    color: "#f44336",
    isMultiple: false,
    count: 1
  });
  const [statuses, setStatuses] = useState([]);
  const [activeTab, setActiveTab] = useState("performance");
  const [searchTerm, setSearchTerm] = useState("");
  
  // ========== PERIOD FILTER STATE ==========
  // Default period for Performance tab
  const [selectedPeriod, setSelectedPeriod] = useState("Yearly");
  const periodOptions = [
    "Yearly",
    "1ኛ ሩብዓመት",
    "2ኛ ሩብዓመት", 
    "3ኛ ሩብዓመት",
    "4ኛ ሩብዓመት",
    "6 Months",
    "9 Months"
  ];
  
  // Status filter state for Performance and Analytics tabs only
  const [filterStatus, setFilterStatus] = useState("all");
  // ==============================================
  
  const [projectMembers, setProjectMembers] = useState({}); // projectId -> {groups: {}, users: []}
  
  // ========== NEW STATE FOR CATEGORIZATION ==========
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [categoryIssues, setCategoryIssues] = useState([]);
  // ==================================================
  
  // ========== NEW STATE FOR PERSONAL PLAN TRACK ==========
  const [selectedGroupMember, setSelectedGroupMember] = useState(null);
  const [groupMemberIssues, setGroupMemberIssues] = useState([]);
  const [groupMemberFilter, setGroupMemberFilter] = useState("all"); // "all", "direct", "group"
  // ======================================================
  
  // ========== NEW STATE FOR PERSONAL PLAN CATEGORIZATION ==========
  const [selectedPersonalCategory, setSelectedPersonalCategory] = useState(null);
  const [personalCategoryIssues, setPersonalCategoryIssues] = useState([]);
  // =================================================================

  // ========== NEW STATE FOR PERSONAL PLAN SUB-ISSUES ==========
  const [selectedPersonalSubIssues, setSelectedPersonalSubIssues] = useState([]);
  const [selectedMainIssue, setSelectedMainIssue] = useState(null);
  // ===========================================================
  
  // ========== PIE CHART STATE ==========
  const [activePieIndex, setActivePieIndex] = useState(0);
  // =====================================
  
  const groupDetailsCache = useRef({});

  // ========== FILTERED ISSUES LOGIC ==========
  // For Performance and Analytics tabs, apply period and status filters
  // For other tabs, show all issues without period filtering
  const filteredIssues = useMemo(() => {
    let filtered = issues;
    
    // Only apply period and status filters for Performance and Analytics tabs
    if (activeTab === "performance" || activeTab === "analytics") {
      // Apply period filter first
      filtered = filterIssuesByPeriod(filtered, selectedPeriod);
      
      // Apply search and status filters
      if (searchTerm || filterStatus !== "all") {
        filtered = filtered.filter(issue => {
          const matchesSearch = searchTerm ? 
            issue.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
            issue.project?.name?.toLowerCase().includes(searchTerm.toLowerCase()) : true;
          
          const matchesStatus = filterStatus === "all" || 
            issue.status?.id?.toString() === filterStatus;
          
          return matchesSearch && matchesStatus;
        });
      }
    } else {
      // For Issues and Personal Plan tabs, only apply search filter (no period or status filter)
      if (searchTerm) {
        filtered = filtered.filter(issue => 
          issue.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
          issue.project?.name?.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }
    }
    
    return filtered;
  }, [issues, selectedPeriod, searchTerm, filterStatus, activeTab]);

  const assignedIssues = useMemo(() => 
    filteredIssues.filter(issue => issue.assigned_to), 
  [filteredIssues]);

  const notAssignedIssues = useMemo(() => 
    filteredIssues.filter(issue => !issue.assigned_to), 
  [filteredIssues]);

  const listToShow = useMemo(() => {
    if (viewList === "assigned") return assignedIssues;
    else if (viewList === "notAssigned") return notAssignedIssues;
    else if (viewList === "all") return filteredIssues;
    return [];
  }, [viewList, assignedIssues, notAssignedIssues, filteredIssues]);

  // Calculate performance data - COMPLETELY UPDATED to properly calculate personal performance
  const calculatePerformanceData = useCallback((usersData, issuesData, period) => {
    return usersData.map((user) => {
      let userWeight = 0;
      let userMaxWeight = 0;
      const userSubIssues = [];
      let completedIssues = 0;

      // First, collect all sub-issues for this user
      issuesData.forEach((issue) => {
        if (issue.children?.length) {
          const userSubs = issue.children.filter(sub => sub.author?.id === user.id);
          userSubIssues.push(...userSubs);
        }
      });

      // Then filter sub-issues by period based on THEIR OWN values
      const filteredUserSubIssues = filterSubIssuesByPeriod(userSubIssues, period);

      // Calculate performance using only filtered sub-issues with proper progress mapping
      filteredUserSubIssues.forEach((sub) => {
        const weight = getWeight(sub);
        // Use the updated mapProgress function that handles quarterly distribution
        const progress = mapProgress(sub.done_ratio || 0, period, sub);
        
        // Add to total weighted progress (weight * progress/100)
        userWeight += (weight * progress) / 100;
        userMaxWeight += weight;
        
        if (progress === 100) completedIssues++;
      });

      // Calculate final performance percentage
      const performance = userMaxWeight > 0 ? Math.round((userWeight / userMaxWeight) * 100) : 0;

      return {
        id: user.id || 0,
        name: user.name || "Unknown User",
        login: user.login || "",
        performance: performance,
        rawPerformance: userWeight || 0,
        maxWeight: userMaxWeight || 0,
        issues: filteredUserSubIssues, // Store already filtered sub-issues
        completedIssues: completedIssues || 0,
        totalIssues: filteredUserSubIssues.length || 0,
        color: getProgressColor(performance)
      };
    });
  }, []);

  // Calculate user performance data based on selected period
  const currentPerformanceData = useMemo(() => {
    return calculatePerformanceData(groupUsers, issues, selectedPeriod);
  }, [groupUsers, issues, selectedPeriod, calculatePerformanceData]);

  // Prepare data for pie chart
  const pieChartData = useMemo(() => {
    return currentPerformanceData
      .filter(user => user.performance > 0) // Only include users with performance > 0
      .map(user => ({
        name: truncateText(user.name, 12),
        value: user.performance,
        color: user.color,
        fullName: user.name,
        completedIssues: user.completedIssues,
        totalIssues: user.totalIssues,
        rawPerformance: user.rawPerformance,
        maxWeight: user.maxWeight
      }))
      .sort((a, b) => b.value - a.value); // Sort by performance descending
  }, [currentPerformanceData]);

  // Calculate best performer based on currentPerformanceData
  useEffect(() => {
    if (currentPerformanceData.length > 0) {
      // Find the highest performance value
      const maxPerformance = Math.max(...currentPerformanceData.map(user => user.performance || 0));
      
      // Get ALL users with the highest performance value
      const bestPerformers = currentPerformanceData.filter(user => (user.performance || 0) === maxPerformance);
      
      // Create a composite best performer object showing all names
      if (bestPerformers.length > 0) {
        const compositeBestPerformer = {
          name: bestPerformers.length === 1 
            ? bestPerformers[0].name 
            : bestPerformers.map(u => u.name).join(', '),
          performance: maxPerformance,
          rawPerformance: bestPerformers.reduce((sum, user) => sum + (user.rawPerformance || 0), 0) / bestPerformers.length,
          maxWeight: bestPerformers.reduce((sum, user) => sum + (user.maxWeight || 0), 0) / bestPerformers.length,
          completedIssues: bestPerformers.reduce((sum, user) => sum + (user.completedIssues || 0), 0),
          totalIssues: bestPerformers.reduce((sum, user) => sum + (user.totalIssues || 0), 0),
          isMultiple: bestPerformers.length > 1,
          count: bestPerformers.length,
          id: null,
          login: "",
          issues: [],
          color: bestPerformers.length === 1 ? getProgressColor(maxPerformance) : "#2e7d32"
        };
        setBestPerformer(compositeBestPerformer);
      } else {
        // Reset if no data
        setBestPerformer({
          name: "None",
          performance: 0,
          rawPerformance: 0,
          maxWeight: 0,
          completedIssues: 0,
          totalIssues: 0,
          id: null,
          login: "",
          issues: [],
          color: "#f44336",
          isMultiple: false,
          count: 1
        });
      }
    } else {
      // Reset if no performance data
      setBestPerformer({
        name: "None",
        performance: 0,
        rawPerformance: 0,
        maxWeight: 0,
        completedIssues: 0,
        totalIssues: 0,
        id: null,
        login: "",
        issues: [],
        color: "#f44336",
        isMultiple: false,
        count: 1
      });
    }
  }, [currentPerformanceData]);

  const chartData = useMemo(() => 
    filteredIssues.map(issue => ({
      id: issue.id,
      name: truncateText(issue.subject, 15),
      done_ratio: mapProgress(issue.done_ratio || 0, selectedPeriod, issue), // Pass issue to mapProgress
      start_date: formatDate(issue.start_date),
      due_date: formatDate(issue.due_date),
      status: issue.status?.name,
      priority: issue.priority?.name,
      project: issue.project?.name,
      color: getProgressColor(mapProgress(issue.done_ratio || 0, selectedPeriod, issue))
    })), 
  [filteredIssues, selectedPeriod]);

  // Table data for selected user - UPDATED to pass issue to mapProgress
  const selectedUserTableData = useMemo(() => {
    if (!selectedUser || !selectedUser.issues || selectedUser.issues.length === 0) return [];
    
    const data = selectedUser.issues.map(issue => {
      const measurement = getField(issue, "መለኪያ") || "N/A";
      const targetValue = getTargetValue(issue, selectedPeriod);
      const achievement = mapProgress(issue.done_ratio || 0, selectedPeriod, issue); // Pass issue to mapProgress
      const actual = calculateActualValue(achievement, targetValue, selectedPeriod);
      
      return {
        id: issue.id,
        subject: issue.subject,
        measurement: measurement,
        targetValue: targetValue,
        achievement: achievement,
        actual: actual,
        status: issue.status?.name || "Unknown",
        project: issue.project?.name || "N/A",
        hasValidTarget: isValidTargetValue(targetValue, selectedPeriod)
      };
    });
    
    // Filter out issues with invalid target values
    return data.filter(row => row.hasValidTarget);
  }, [selectedUser, selectedPeriod]);

  // Table data for analytics dashboard - UPDATED to pass issue to mapProgress
  const analyticsTableData = useMemo(() => {
    if (filteredIssues.length === 0) return [];
    
    const data = filteredIssues.map(issue => {
      const measurement = getField(issue, "መለኪያ") || "N/A";
      const targetValue = getTargetValue(issue, selectedPeriod);
      const achievement = mapProgress(issue.done_ratio || 0, selectedPeriod, issue); // Pass issue to mapProgress
      const actual = calculateActualValue(achievement, targetValue, selectedPeriod);
      
      return {
        id: issue.id,
        subject: issue.subject,
        measurement: measurement,
        targetValue: targetValue,
        achievement: achievement,
        actual: actual,
        status: issue.status?.name || "Unknown",
        project: issue.project?.name || "N/A",
        assignedTo: issue.assigned_to?.name || "Unassigned",
        hasValidTarget: isValidTargetValue(targetValue, selectedPeriod)
      };
    });
    
    // Filter out issues with invalid target values
    return data.filter(row => row.hasValidTarget);
  }, [filteredIssues, selectedPeriod]);

  // Calculate statistics for the cards
  const totalPersonalTasks = useMemo(() => {
    // Count all sub-issues created by all team members
    let count = 0;
    issues.forEach(issue => {
      if (issue.children?.length) {
        count += issue.children.length;
      }
    });
    return count;
  }, [issues]);

  const totalIssuesWithPersonalTasks = useMemo(() => {
    // Count main issues that have at least one sub-issue
    return issues.filter(issue => issue.children?.length > 0).length;
  }, [issues]);

  const getCachedGroupDetails = useCallback(async (groupId) => {
    if (groupDetailsCache.current[groupId]) {
      return groupDetailsCache.current[groupId];
    }
    
    try {
      const groupDetails = await getGroupDetails(groupId);
      groupDetailsCache.current[groupId] = groupDetails;
      return groupDetails;
    } catch (error) {
      console.error(`Failed to fetch group ${groupId} details:`, error);
      return { users: [], name: `Group ${groupId}` };
    }
  }, []);

  const isUserInGroupByName = useCallback((userId, groupName, projectId = null) => {
    if (!groupName || !userId) {
      return false;
    }
    
    const userIdNum = Number(userId);
    const normalizedGroupName = normalizeGroupName(groupName);
    const searchName = normalizedGroupName.toLowerCase().trim();
    
    // First check specific project if provided
    if (projectId && projectMembers[projectId]) {
      const projectData = projectMembers[projectId];
      
      for (const [groupId, groupInfo] of Object.entries(projectData.groups || {})) {
        const normalizedInfoName = normalizeGroupName(groupInfo.name).toLowerCase().trim();
        
        // Use fuzzy matching instead of exact match
        if (normalizedInfoName.includes(searchName) || searchName.includes(normalizedInfoName)) {
          const numericUserIds = groupInfo.userIds.map(id => Number(id));
          if (numericUserIds.includes(userIdNum)) return true;
        }
      }
    }
    
    // Check all projects
    for (const pid in projectMembers) {
      const projectData = projectMembers[pid];
      
      for (const [groupId, groupInfo] of Object.entries(projectData.groups || {})) {
        const normalizedInfoName = normalizeGroupName(groupInfo.name).toLowerCase().trim();
        
        // Use fuzzy matching
        if (normalizedInfoName.includes(searchName) || searchName.includes(normalizedInfoName)) {
          const numericUserIds = groupInfo.userIds.map(id => Number(id));
          if (numericUserIds.includes(userIdNum)) {
            return true;
          }
        }
      }
    }
    
    return false;
  }, [projectMembers]);

  const isUserInGroupGlobalByName = useCallback((userId, groupName) => {
    const userIdNum = Number(userId);
    const normalizedGroupName = normalizeGroupName(groupName);
    const searchName = normalizedGroupName.toLowerCase().trim();
    
    for (const projectId in projectMembers) {
      const projectData = projectMembers[projectId];
      for (const [groupId, groupInfo] of Object.entries(projectData.groups || {})) {
        const normalizedInfoName = normalizeGroupName(groupInfo.name).toLowerCase().trim();
        if (normalizedInfoName.includes(searchName) || searchName.includes(normalizedInfoName)) {
          const numericUserIds = groupInfo.userIds.map(id => Number(id));
          if (numericUserIds.includes(userIdNum)) {
            return true;
          }
        }
      }
    }
    return false;
  }, [projectMembers]);

  const getAllAssignedIssues = useCallback(() => {
    if (!selectedUser) {
      return [];
    }
    
    const result = [];
    
    for (const issue of issues) {
      if (!issue.assigned_to) continue;
      
      // Check direct assignment
      if (issue.assigned_to.id === selectedUser.id) {
        result.push(issue);
        continue;
      }
      
      // Check group assignment
      if (issue.assigned_to.name) {
        const groupName = extractGroupName(issue.assigned_to);
        const isGroup = isGroupAssignment(issue.assigned_to) || groupName !== "";
        
        if (isGroup && groupName) {
          // Check if user is in this group
          let isMember = false;
          
          // First check in the issue's project
          if (issue.project?.id) {
            isMember = isUserInGroupByName(selectedUser.id, groupName, issue.project.id);
          }
          
          // If not found, check globally
          if (!isMember) {
            isMember = isUserInGroupGlobalByName(selectedUser.id, groupName);
          }
          
          if (isMember) {
            result.push(issue);
          }
        }
      }
    }
    
    // Apply period filter
    const filteredResult = filterIssuesByPeriod(result, selectedPeriod);
    
    return filteredResult;
  }, [selectedUser, issues, selectedPeriod, isUserInGroupByName, isUserInGroupGlobalByName]);

  const getWatchedAssignedIssues = useCallback(() => {
    if (!selectedUser || !currentUser) return [];
    
    let result = issues.filter(issue => {
      // Check direct assignment
      const assignedDirectly = issue.assigned_to?.id === selectedUser.id;
      
      // Check if assigned to a group that contains the user
      let assignedViaGroup = false;
      if (issue.assigned_to && issue.assigned_to.name) {
        const groupName = extractGroupName(issue.assigned_to);
        const isGroup = isGroupAssignment(issue.assigned_to) || groupName !== "";
        
        if (isGroup && groupName) {
          // Check if user is in this group (check all projects)
          assignedViaGroup = isUserInGroupGlobalByName(selectedUser.id, groupName);
          
          // If not found globally, check in the issue's project
          if (!assignedViaGroup && issue.project?.id) {
            assignedViaGroup = isUserInGroupByName(selectedUser.id, groupName, issue.project.id);
          }
        }
      }
      
      return assignedDirectly || assignedViaGroup;
    });
    
    // Apply period filter
    result = filterIssuesByPeriod(result, selectedPeriod);
    
    return result;
  }, [selectedUser, currentUser, issues, selectedPeriod, isUserInGroupByName, isUserInGroupGlobalByName]);

  // Function to get issues assigned to a specific group member - MODIFIED: NO PERIOD FILTERING
  const getGroupMemberIssues = useCallback((memberId, filterType = "all") => {
    if (!memberId) return [];
    
    const memberIdNum = Number(memberId);
    let result = [];
    
    for (const issue of issues) {
      if (!issue.assigned_to) continue;
      
      let includeIssue = false;
      
      // Check direct assignment
      if (issue.assigned_to.id === memberIdNum) {
        if (filterType === "all" || filterType === "direct") {
          includeIssue = true;
        }
      }
      
      // Check group assignment if not already included
      if (!includeIssue && issue.assigned_to.name) {
        const groupName = extractGroupName(issue.assigned_to);
        const isGroup = isGroupAssignment(issue.assigned_to) || groupName !== "";
        
        if (isGroup && groupName) {
          // Check if member is in this group
          let isMember = false;
          
          // First check in the issue's project
          if (issue.project?.id) {
            isMember = isUserInGroupByName(memberIdNum, groupName, issue.project.id);
          }
          
          // If not found, check globally
          if (!isMember) {
            isMember = isUserInGroupGlobalByName(memberIdNum, groupName);
          }
          
          if (isMember && (filterType === "all" || filterType === "group")) {
            includeIssue = true;
          }
        }
      }
      
      if (includeIssue) {
        result.push(issue);
      }
    }
    
    // NO PERIOD FILTERING - Show all issues including those with empty or 0 period values
    return result;
  }, [issues, isUserInGroupByName, isUserInGroupGlobalByName]); // Removed selectedPeriod dependency

  // Handle group member selection for personal plan track
  const handleGroupMemberSelect = useCallback((member) => {
    setSelectedGroupMember(member);
    const issues = getGroupMemberIssues(member.id, groupMemberFilter);
    setGroupMemberIssues(issues);
    // Reset personal category when selecting a new member
    setSelectedPersonalCategory(null);
    setPersonalCategoryIssues([]);
    // Reset sub-issues state
    setSelectedMainIssue(null);
    setSelectedPersonalSubIssues([]);
  }, [getGroupMemberIssues, groupMemberFilter]);

  // Handle group member filter change
  const handleGroupMemberFilterChange = useCallback((filterType) => {
    setGroupMemberFilter(filterType);
    if (selectedGroupMember) {
      const issues = getGroupMemberIssues(selectedGroupMember.id, filterType);
      setGroupMemberIssues(issues);
      // Reset personal category when filter changes
      setSelectedPersonalCategory(null);
      setPersonalCategoryIssues([]);
      // Reset sub-issues state
      setSelectedMainIssue(null);
      setSelectedPersonalSubIssues([]);
    }
  }, [selectedGroupMember, getGroupMemberIssues]);

  // Categorize watched & assigned issues
  const categorizedIssues = useMemo(() => {
    const watchedAssignedIssues = getWatchedAssignedIssues();
    const withSubIssues = [];
    const withoutSubIssues = [];
    
    watchedAssignedIssues.forEach(issue => {
      if (issue.children && issue.children.length > 0) {
        withSubIssues.push(issue);
      } else {
        withoutSubIssues.push(issue);
      }
    });
    
    return { withSubIssues, withoutSubIssues };
  }, [getWatchedAssignedIssues]);

  // Categorize personal plan track issues - UPDATED to check if user has created sub-issues
  const personalPlanCategorizedIssues = useMemo(() => {
    const withSubIssues = [];
    const withoutSubIssues = [];
    
    groupMemberIssues.forEach(issue => {
      // Check if this specific user has created sub-issues within this issue
      const userSubIssues = (issue.children || []).filter(sub => 
        sub.author?.id === selectedGroupMember?.id
      );
      
      if (userSubIssues.length > 0) {
        withSubIssues.push(issue);
      } else {
        withoutSubIssues.push(issue);
      }
    });
    
    return { withSubIssues, withoutSubIssues };
  }, [groupMemberIssues, selectedGroupMember]);

  // Handle category selection for performance tab
  const handleCategorySelect = useCallback((category) => {
    setSelectedCategory(category);
    if (category === 'withSubIssues') {
      setCategoryIssues(categorizedIssues.withSubIssues);
    } else if (category === 'withoutSubIssues') {
      setCategoryIssues(categorizedIssues.withoutSubIssues);
    }
  }, [categorizedIssues]);

  // Handle category selection for personal plan track
  const handlePersonalCategorySelect = useCallback((category) => {
    setSelectedPersonalCategory(category);
    if (category === 'withSubIssues') {
      setPersonalCategoryIssues(personalPlanCategorizedIssues.withSubIssues);
    } else if (category === 'withoutSubIssues') {
      setPersonalCategoryIssues(personalPlanCategorizedIssues.withoutSubIssues);
    }
    // Reset sub-issues state
    setSelectedMainIssue(null);
    setSelectedPersonalSubIssues([]);
  }, [personalPlanCategorizedIssues]);

  // Handle back from category view in performance tab
  const handleBackFromCategory = useCallback(() => {
    setSelectedCategory(null);
    setCategoryIssues([]);
  }, []);

  // Handle back from category view in personal plan track
  const handleBackFromPersonalCategory = useCallback(() => {
    setSelectedPersonalCategory(null);
    setPersonalCategoryIssues([]);
    // Reset sub-issues state
    setSelectedMainIssue(null);
    setSelectedPersonalSubIssues([]);
  }, []);

  // Handle main issue selection to show its sub-issues
  const handleMainIssueSelect = useCallback((issue) => {
    setSelectedMainIssue(issue);
    // Filter sub-issues that belong to this user
    const userSubIssues = (issue.children || []).filter(sub => 
      sub.author?.id === selectedGroupMember.id
    );
    setSelectedPersonalSubIssues(userSubIssues);
  }, [selectedGroupMember]);

  // Handle back from sub-issues view
  const handleBackFromSubIssues = useCallback(() => {
    setSelectedMainIssue(null);
    setSelectedPersonalSubIssues([]);
  }, []);

  // Handle pie chart interaction
  const onPieEnter = useCallback((_, index) => {
    setActivePieIndex(index);
  }, []);

  // Load data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      groupDetailsCache.current = {};

      // Get current user
      const currentUserData = await getCurrentUser();
      if (!currentUserData || !currentUserData.id) {
        throw new Error("Failed to load user data");
      }
      
      setCurrentUser(currentUserData);

      // Get group users (team members)
      let groupUsersData = [];
      try {
        if (currentUserData.login) {
          groupUsersData = await getUsersInGroup(currentUserData.login);
        }
      } catch (groupError) {
        console.error("Failed to get group users:", groupError);
      }

      // Get watched issues
      let issuesData = [];
      try {
        issuesData = await getWatchedOneLevelIssues();
        
        // Collect unique project IDs from issues
        const projectIds = [...new Set(
          issuesData
            .map(issue => issue.project?.id)
            .filter(Boolean)
        )];
        
        // Fetch members for each project
        const projectMembersData = {};
        
        for (const projectId of projectIds) {
          try {
            const members = await getProjectMembers(projectId);
            
            const projectData = {
              groups: {},
              users: []
            };
            
            // Organize members by type
            for (const member of members) {
              if (member.isGroup && member.id) {
                try {
                  const groupDetails = await getCachedGroupDetails(member.id);
                  
                  const userIds = groupDetails.users?.map(user => user.id) || [];
                  const groupName = groupDetails.name || `Group ${member.id}`;
                  
                  projectData.groups[member.id] = {
                    name: groupName,
                    userIds: userIds
                  };
                  
                } catch (groupErr) {
                  console.error(`Failed to fetch group ${member.id} details:`, groupErr);
                  projectData.groups[member.id] = {
                    name: `Group ${member.id}`,
                    userIds: []
                  };
                }
              } else if (!member.isGroup && member.id) {
                projectData.users.push({
                  id: member.id,
                  name: member.name
                });
              }
            }
            
            projectMembersData[projectId] = projectData;
            
          } catch (err) {
            console.error(`Failed to load project ${projectId} members:`, err);
            projectMembersData[projectId] = { groups: {}, users: [] };
          }
        }
        
        setProjectMembers(projectMembersData);
        
      } catch (issuesError) {
        console.error("Failed to get Team ዝርዝር :", issuesError);
        issuesData = [];
      }

      setIssues(issuesData);
      setGroupUsers(groupUsersData);

      // Extract unique statuses
      const uniqueStatuses = Array.from(
        new Map(
          issuesData
            .filter(issue => issue.status)
            .map(issue => [issue.status.id, issue.status])
        ).values()
      );
      setStatuses(uniqueStatuses);

      // Calculate initial performance with selectedPeriod
      const performance = calculatePerformanceData(groupUsersData, issuesData, selectedPeriod);
      setUserPerformanceData(performance);

    } catch (err) {
      console.error("Failed to load dashboard data:", err);
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, [getCachedGroupDetails, calculatePerformanceData]);

  // Load data only once on component mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle period change without reloading
  const handlePeriodChange = useCallback((newPeriod) => {
    setSelectedPeriod(newPeriod);
  }, []);

  // Handle refresh - reloads all data
  const handleRefresh = useCallback(async () => {
    setLoading(true);
    try {
      // Clear cache and reload
      groupDetailsCache.current = {};
      await loadData();
    } finally {
      setLoading(false);
    }
  }, [loadData]);

  // Calculate weighted overall progress for selected user - UPDATED to use the same calculation as performance data
  const userWeightedProgress = useMemo(() => {
    if (!selectedUser) return 0;
    
    // Get the user's performance data from currentPerformanceData
    const userPerformance = currentPerformanceData.find(u => u.id === selectedUser.id);
    if (userPerformance) {
      return userPerformance.performance || 0;
    }
    
    // Fallback calculation if user not found in performance data
    const userIssues = getAllAssignedIssues();
    
    let totalWeight = 0;
    let weightedProgress = 0;

    userIssues.forEach((issue) => {
      const weight = getWeight(issue);
      const progress = mapProgress(issue.done_ratio || 0, selectedPeriod, issue);
      totalWeight += weight;
      weightedProgress += progress * weight;
    });

    return totalWeight > 0 ? Math.round(weightedProgress / totalWeight) : 0;
  }, [selectedUser, currentPerformanceData, getAllAssignedIssues, selectedPeriod]);

  const watchedAssignedIssues = getWatchedAssignedIssues();
  const allAssignedIssues = getAllAssignedIssues();

  // Handle user selection
  const handleUserSelect = useCallback((user) => {
    // Filter user's sub-issues by selected period based on their own values
    const filteredIssues = filterSubIssuesByPeriod(user.issues || [], selectedPeriod);
    setSelectedUser(user);
    setSelectedUserIssues(filteredIssues);
    // Reset category when selecting a new user
    setSelectedCategory(null);
    setCategoryIssues([]);
  }, [selectedPeriod]);

  // Update selected user when performance data changes
  useEffect(() => {
    if (selectedUser && currentPerformanceData.length > 0) {
      const updatedUser = currentPerformanceData.find(u => u.id === selectedUser.id);
      if (updatedUser) {
        // Filter issues by selected period based on their own values
        const filteredIssues = filterSubIssuesByPeriod(updatedUser.issues || [], selectedPeriod);
        setSelectedUser(updatedUser);
        setSelectedUserIssues(filteredIssues);
      }
    }
  }, [currentPerformanceData, selectedUser, selectedPeriod]);

  // Update selected user issues when period changes
  useEffect(() => {
    if (selectedUser && selectedUser.issues) {
      const filteredIssues = filterSubIssuesByPeriod(selectedUser.issues, selectedPeriod);
      setSelectedUserIssues(filteredIssues);
    }
  }, [selectedPeriod, selectedUser]);

  // Calculate chart data for sub-issues based on selected period - UPDATED to pass issue to mapProgress
  const subIssuesChartData = useMemo(() => 
    selectedUserIssues.map(issue => ({
      id: issue.id,
      name: truncateText(issue.subject, 15),
      done_ratio: mapProgress(issue.done_ratio || 0, selectedPeriod, issue), // Pass issue to mapProgress
      
      status: issue.status?.name,
      priority: issue.priority?.name,
      project: issue.project?.name,
      color: getProgressColor(mapProgress(issue.done_ratio || 0, selectedPeriod, issue))
    })), 
  [selectedUserIssues, selectedPeriod]);

  // Update group member issues when period changes - MODIFIED: No period dependency
  useEffect(() => {
    if (selectedGroupMember) {
      const issues = getGroupMemberIssues(selectedGroupMember.id, groupMemberFilter);
      setGroupMemberIssues(issues);
      // Reset personal category when period changes
      setSelectedPersonalCategory(null);
      setPersonalCategoryIssues([]);
      // Reset sub-issues state
      setSelectedMainIssue(null);
      setSelectedPersonalSubIssues([]);
    }
  }, [selectedGroupMember, getGroupMemberIssues, groupMemberFilter]); // Removed selectedPeriod dependency

  // Custom tooltip - UPDATED to show more detailed information
  const PerformanceTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="custom-tooltip" style={{
          backgroundColor: '#fff',
          padding: '10px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
          minWidth: '250px'
        }}>
          <p style={{ fontWeight: 'bold', marginBottom: '5px' }}>{label}</p>
          <p style={{ marginBottom: '3px' }}>
            <strong>Performance:</strong> {(data.performance || 0)}%
          </p>
          <p style={{ marginBottom: '3px' }}>
            <strong>Completed ዝርዝር ተግባራት:</strong> {(data.completedIssues || 0)} / {(data.totalIssues || 0)}
          </p>
          <p style={{ marginBottom: '3px' }}>
            <strong>Weight Progress:</strong> {(data.rawPerformance || 0).toFixed(1)} / {(data.maxWeight || 0).toFixed(1)}
          </p>
          <p style={{ fontSize: '11px', color: '#666', marginTop: '5px', paddingTop: '5px', borderTop: '1px solid #eee' }}>
            <strong>Period:</strong> {selectedPeriod}
            {selectedPeriod.includes("ሩብዓመት")}
          </p>
        </div>
      );
    }
    return null;
  };

  // Custom tooltip for pie chart
  const PieChartTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="custom-tooltip" style={{
          backgroundColor: '#fff',
          padding: '10px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
          minWidth: '200px'
        }}>
          <p style={{ fontWeight: 'bold', marginBottom: '5px', color: data.color }}>
            {data.fullName}
          </p>
          <p style={{ marginBottom: '3px' }}>
            <strong>Performance:</strong> {(data.value || 0).toFixed(1)}%
          </p>
          <p style={{ marginBottom: '3px' }}>
            <strong>Completed Tasks:</strong> {(data.completedIssues || 0)} / {(data.totalIssues || 0)}
          </p>
          <p style={{ marginBottom: '3px' }}>
            <strong>Weight Progress:</strong> {(data.rawPerformance || 0).toFixed(1)} / {(data.maxWeight || 0).toFixed(1)}
          </p>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="loading-container" style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '80vh',
        flexDirection: 'column'
      }}>
        <div className="spinner" style={{
          width: '50px',
          height: '50px',
          border: '5px solid #f3f3f3',
          borderTop: '5px solid #3498db',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        <p style={{ marginTop: '20px', fontSize: '18px', color: '#666' }}>
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

  if (error) {
    return (
      <div className="error-container" style={{
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
      
      {/* Header - REMOVED SEARCH INPUT, ADDED 4 CARDS */}
      <div style={{
        marginBottom: '30px'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '20px'
        }}>
          <h1 style={{ margin: 0, color: '#333' }}>Team Leader Dashboard</h1>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={handleRefresh}
              style={{
                padding: '8px 16px',
                backgroundColor: '#f5f5f5',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              🔄 Refresh
            </button>
          </div>
        </div>

        {/* 4 Cards Section */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '15px',
          marginTop: '20px'
        }}>
          {/* Card 1: Total Members/Users */}
          <div style={{
            padding: '20px',
            backgroundColor: '#e3f2fd',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            borderLeft: '4px solid #1976d2'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <div style={{
                width: '50px',
                height: '50px',
                backgroundColor: '#1976d2',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '20px'
              }}>
                👥
              </div>
              <div>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>
                  Total Members/Users
                </div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1976d2' }}>
                  {groupUsers.length}
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Total ዝርዝር ተግባራት */}
          <div style={{
            padding: '20px',
            backgroundColor: '#e8f5e9',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            borderLeft: '4px solid #2e7d32'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <div style={{
                width: '50px',
                height: '50px',
                backgroundColor: '#2e7d32',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '20px'
              }}>
                📋
              </div>
              <div>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>
                  Total ዝርዝር ተግባራት
                </div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2e7d32' }}>
                  {issues.length}
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Total የግል እቅድ ያላቸው ዝርዝር ተግባራት */}
          <div style={{
            padding: '20px',
            backgroundColor: '#fff3e0',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            borderLeft: '4px solid #ff9800'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <div style={{
                width: '50px',
                height: '50px',
                backgroundColor: '#ff9800',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '20px'
              }}>
                📝
              </div>
              <div>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>
                  Total የግል እቅድ ያላቸው ዝርዝር ተግባራት
                </div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ff9800' }}>
                  {totalIssuesWithPersonalTasks}
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: Total የግል እቅድ */}
          <div style={{
            padding: '20px',
            backgroundColor: '#fce4ec',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            borderLeft: '4px solid #e91e63'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <div style={{
                width: '50px',
                height: '50px',
                backgroundColor: '#e91e63',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '20px'
              }}>
                ✅
              </div>
              <div>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>
                  Total የግል እቅድ
                </div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#e91e63' }}>
                  {totalPersonalTasks}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{
        display: 'flex',
        marginBottom: '30px',
        borderBottom: '1px solid #ddd'
      }}>
        {['performance', 'issues', 'analytics', 'personal-plan'].map(tab => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              if (tab !== 'performance') setSelectedUser(null);
              setSelectedCategory(null);
              setCategoryIssues([]);
              if (tab === 'personal-plan') {
                // Auto-select current user for personal plan track
                if (currentUser) {
                  const user = currentPerformanceData.find(u => u.id === currentUser.id) || currentUser;
                  handleGroupMemberSelect(user);
                }
              }
            }}
            style={{
              padding: '10px 20px',
              backgroundColor: activeTab === tab ? '#1976d2' : 'transparent',
              color: activeTab === tab ? 'white' : '#333',
              border: 'none',
              borderBottom: activeTab === tab ? '3px solid #1976d2' : 'none',
              cursor: 'pointer',
              textTransform: 'capitalize',
              fontWeight: activeTab === tab ? 'bold' : 'normal',
              whiteSpace: 'nowrap'
            }}
          >
            {tab === 'personal-plan' ? 'Personal Plan Track' : tab}
          </button>
        ))}
      </div>

      {/* Period Info Banner - ONLY SHOW FOR PERFORMANCE AND ANALYTICS TABS */}
      {(activeTab === 'performance' || activeTab === 'analytics') && (
        <div style={{
          backgroundColor: '#e3f2fd',
          padding: '10px 15px',
          borderRadius: '8px',
          marginBottom: '20px',
          borderLeft: '4px solid #1976d2'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>Selected Period:</strong> {selectedPeriod}
              {selectedPeriod === "Yearly" && " (የዓመቱ እቅድ)"}
              {selectedPeriod === "6 Months" && " (1ኛ ሩብዓመት + 2ኛ ሩብዓመት)"}
              {selectedPeriod === "9 Months" && " (1ኛ ሩብዓመት + 2ኛ ሩብዓመት + 3ኛ ሩብዓመት)"}
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              Showing {filteredIssues.length} of {issues.length} total ዝርዝር ተግባራት
            </div>
          </div>
        </div>
      )}

      {/* Best Performer Section */}
      {bestPerformer && bestPerformer.name !== "None" && activeTab === 'performance' && !selectedUser && (
        <div style={{
          maxWidth: "800px",
          margin: "0 auto 30px auto",
          padding: "25px",
          background: bestPerformer.isMultiple 
            ? "linear-gradient(135deg, #2e7d32, #4caf50)" 
            : "linear-gradient(135deg, #ff9800, #ff5722)",
          color: "#fff",
          borderRadius: "16px",
          boxShadow: "0 6px 15px rgba(0,0,0,0.2)",
          textAlign: "center",
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute',
            top: '-20px',
            right: '-20px',
            fontSize: '80px',
            opacity: 0.2
          }}>
            {bestPerformer.isMultiple ? '👑' : '🏆'}
          </div>
          <div style={{ fontSize: "24px", fontWeight: "bold", marginBottom: "10px" }}>
            {bestPerformer.isMultiple ? "Top Performers" : "Best Performer"} ({selectedPeriod})
            {bestPerformer.isMultiple && (
              <div style={{ fontSize: "16px", marginTop: "5px", opacity: 0.9 }}>
                {bestPerformer.count} users tied for first place
              </div>
            )}
          </div>
          <div style={{ 
            fontSize: bestPerformer.isMultiple ? "26px" : "32px", 
            fontWeight: "bold", 
            marginBottom: "15px",
            lineHeight: "1.3",
            wordBreak: "break-word"
          }}>
            {bestPerformer.name}
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '40px',
            flexWrap: 'wrap'
          }}>
            <div>
              <div style={{ fontSize: "14px", opacity: 0.9 }}>Performance</div>
              <div style={{ fontSize: "28px", fontWeight: "bold" }}>{(bestPerformer.performance || 0).toFixed(0)}%</div>
            </div>
            <div>
              <div style={{ fontSize: "14px", opacity: 0.9 }}>Completed ዝርዝር ተግባራት</div>
              <div style={{ fontSize: "28px", fontWeight: "bold" }}>
                {(bestPerformer.completedIssues || 0)}/{(bestPerformer.totalIssues || 0)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "14px", opacity: 0.9 }}>Weight Progress</div>
              <div style={{ fontSize: "28px", fontWeight: "bold" }}>
                {(bestPerformer.rawPerformance || 0).toFixed(1)}/{(bestPerformer.maxWeight || 0).toFixed(1)}
              </div>
            </div>
          </div>
          <div style={{ marginTop: '15px', fontSize: '12px', opacity: 0.8 }}>
            Period: {selectedPeriod}
            {selectedPeriod === "6 Months" && " (Q1 + Q2)"}
            {selectedPeriod === "9 Months" && " (Q1 + Q2 + Q3)"}
            {selectedPeriod.includes("ሩብዓመት")}
          </div>
        </div>
      )}

      {/* Performance Tab - ADD PERIOD AND STATUS FILTERS HERE */}
      {activeTab === 'performance' && !selectedUser && (
        <>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            flexWrap: 'wrap',
            gap: '15px'
          }}>
            <h2 style={{ margin: 0 }}>Team Performance Metrics ({selectedPeriod})</h2>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* PERIOD FILTER - ONLY IN PERFORMANCE TAB */}
              <select
                value={selectedPeriod}
                onChange={(e) => handlePeriodChange(e.target.value)}
                style={{
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  backgroundColor: '#f8f9fa',
                  fontWeight: 'bold',
                  minWidth: '150px'
                }}
              >
                {periodOptions.map(period => (
                  <option key={period} value={period}>{period}</option>
                ))}
              </select>
              
              {/* STATUS FILTER - ONLY IN PERFORMANCE TAB */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  minWidth: '150px'
                }}
              >
                <option value="all">All Statuses</option>
                {statuses.map(status => (
                  <option key={status.id} value={status.id}>
                    {status.name}
                  </option>
                ))}
              </select>
              
              <div style={{ color: '#666', fontSize: '14px' }}>
                Showing {currentPerformanceData.length} team members • 
                {selectedPeriod === "Yearly" && " Issues with valid የዓመቱ እቅድ"}
                {selectedPeriod === "6 Months" && " Issues with valid Q1 or Q2 values"}
                {selectedPeriod === "9 Months" && " Issues with valid Q1, Q2, or Q3 values"}
                {selectedPeriod.includes("ሩብዓመት") && ` Issues with valid ${selectedPeriod} values`}
              </div>
            </div>
          </div>
          
          {/* Dual Chart Layout - Bar Chart and Pie Chart Side by Side */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '20px',
            marginBottom: '40px'
          }}>
            {/* Bar Chart - 60% width */}
            <div style={{ flex: '1 1 60%', minWidth: '300px', height: '450px' }}>
              <div style={{ 
                backgroundColor: '#fff', 
                padding: '15px', 
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                height: '100%'
              }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#333' }}>
                  Team Performance Distribution
                </h3>
                {currentPerformanceData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="85%">
                    <BarChart data={currentPerformanceData} margin={{ top: 20, bottom: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="name" 
                        tick={{ fontSize: 12 }}
                        interval={0}
                        angle={-30}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis 
                        domain={[0, 100]} 
                        unit="%" 
                        tickFormatter={(value) => `${value}%`}
                      />
                      <Tooltip content={<PerformanceTooltip />} />
                      <Legend />
                      <Bar
                        dataKey="performance"
                        name="Performance %"
                        cursor="pointer"
                        onClick={(data) => handleUserSelect(data)}
                      >
                        {currentPerformanceData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color || "#f44336"} />
                        ))}
                        <LabelList 
                          dataKey="performance" 
                          position="top" 
                          formatter={(val) => `${(val || 0).toFixed(0)}%`}
                          style={{ fontSize: '12px' }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100%',
                    color: '#666',
                    fontSize: '16px'
                  }}>
                    No performance data available for {selectedPeriod}
                  </div>
                )}
              </div>
            </div>
            
            {/* Pie Chart - 35% width */}
            <div style={{ flex: '1 1 35%', minWidth: '300px', height: '450px' }}>
              <div style={{ 
                backgroundColor: '#fff', 
                padding: '15px', 
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                height: '100%'
              }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#333' }}>
                  Performance Comparison
                </h3>
                {pieChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="85%">
                    <PieChart>
                      <Pie
                        activeIndex={activePieIndex}
                        activeShape={renderActiveShape}
                        data={pieChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="name"
                        onMouseEnter={onPieEnter}
                        onClick={(data) => {
                          const user = currentPerformanceData.find(u => 
                            u.name === data.fullName || truncateText(u.name, 12) === data.name
                          );
                          if (user) handleUserSelect(user);
                        }}
                      >
                        {pieChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<PieChartTooltip />} />
                      <Legend 
                        layout="vertical"
                        verticalAlign="middle"
                        align="right"
                        wrapperStyle={{ 
                          right: 10,
                          width: 150,
                          fontSize: '12px'
                        }}
                        formatter={(value, entry) => {
                          const data = pieChartData.find(d => d.name === value);
                          return (
                            <span style={{ color: data?.color || '#333', fontSize: '11px' }}>
                              {value}: {data?.value}%
                            </span>
                          );
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100%',
                    color: '#666',
                    fontSize: '16px',
                    flexDirection: 'column'
                  }}>
                    <div style={{ fontSize: '48px', marginBottom: '10px', opacity: 0.5 }}>
                      📊
                    </div>
                    <div>No performance data for pie chart</div>
                    <div style={{ fontSize: '12px', color: '#888', marginTop: '5px' }}>
                      (Need users with performance `&gt; 0%)
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Performance Stats Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '20px',
            marginBottom: '40px'
          }}>
            {currentPerformanceData.map(user => (
              <div
                key={user.id}
                onClick={() => handleUserSelect(user)}
                style={{
                  padding: '20px',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  border: '2px solid transparent'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#1976d2';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '15px'
                }}>
                  <h3 style={{ margin: 0, fontSize: '18px' }}>{user.name || "Unknown User"}</h3>
                  <div style={{
                    backgroundColor: user.color || "#f44336",
                    color: 'white',
                    padding: '4px 12px',
                    borderRadius: '20px',
                    fontWeight: 'bold',
                    fontSize: '14px'
                  }}>
                    {(user.performance || 0).toFixed(0)}%
                  </div>
                </div>
               
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '13px',
                  color: '#666'
                }}>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>Completed</div>
                    <div>{(user.completedIssues || 0)}/{(user.totalIssues || 0)}</div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>Weight Progress</div>
                    <div>{(user.rawPerformance || 0).toFixed(1)}/{(user.maxWeight || 0).toFixed(1)}</div>
                  </div>
                </div>
                
              </div>
            ))}
          </div>
        </>
      )}

      {/* Selected User Details */}
      {selectedUser && activeTab === 'performance' && (
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '15px',
            marginBottom: '30px',
            padding: '20px',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px'
          }}>
            <button
              onClick={() => setSelectedUser(null)}
              style={{
                padding: '8px 15px',
                borderRadius: '5px',
                border: 'none',
                backgroundColor: '#6c757d',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              ← Back to Team
            </button>
            <h2 style={{ margin: 0 }}>{selectedUser.name}'s Details ({selectedPeriod})</h2>
            
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '15px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#666' }}>Weighted Progress</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: getProgressColor(userWeightedProgress) }}>
                  {(userWeightedProgress || 0).toFixed(0)}%
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#666' }}>Performance</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: selectedUser.color || "#f44336" }}>
                  {(selectedUser.performance || 0).toFixed(0)}%
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#666' }}>Completion Rate</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                  {(selectedUser.completedIssues || 0)}/{(selectedUser.totalIssues || 0)}
                </div>
              </div>
            </div>
          </div>

          {/* Weighted Progress Bar */}
          <div style={{ marginBottom: '30px' }}>
            <div style={{ fontWeight: "bold", fontSize: "16px", marginBottom: "10px" }}>
              Weighted Overall Performance: {(userWeightedProgress || 0).toFixed(0)}%
              <span style={{ fontSize: '14px', color: '#666', marginLeft: '10px', fontWeight: 'normal' }}>
                (Based on {selectedUser.totalIssues || 0})
              </span>
            </div>
            <div
              style={{
                width: "100%",
                backgroundColor: "#e0e0e0",
                borderRadius: "8px",
                overflow: "hidden",
                height: "25px",
              }}
            >
              <div
                style={{
                  width: `${userWeightedProgress || 0}%`,
                  backgroundColor: getProgressColor(userWeightedProgress),
                  height: "100%",
                  textAlign: "center",
                  color: "#fff",
                  fontWeight: "bold",
                  lineHeight: "25px",
                }}
              >
                {(userWeightedProgress || 0).toFixed(0)}%
              </div>
            </div>
            {selectedPeriod.includes("ሩብዓመት")}
          </div>

          

          {/* የግል እቅድ Progress */}
          {selectedUserIssues.length > 0 ? (
            <div style={{ marginBottom: '40px' }}>
              <h3 style={{ marginBottom: '20px', color: '#333' }}>
                የግል እቅድ Progress ({selectedPeriod}) - {selectedUserIssues.length} የግል እቅድ
                <span style={{ fontSize: '14px', color: '#666', marginLeft: '10px', fontWeight: 'normal' }}>
                  (Only showing የግል እቅድ with valid {selectedPeriod === "Yearly" ? "የዓመቱ እቅድ" : selectedPeriod} values)
                </span>
              </h3>
              <div style={{ width: "100%", height: "400px" }}>
                <ResponsiveContainer width="50%" height="100%" minHeight={300}>
                  <BarChart data={subIssuesChartData} margin={{ top: 20, bottom: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="name"
                      angle={-30}
                      textAnchor="end"
                      interval={0}
                      tickFormatter={truncateText}
                      height={80}
                    />
                    <YAxis domain={[0, 100]} unit="%" />
                    <Tooltip
                      formatter={(value) => [`${(value || 0).toFixed(0)}%`, 'Progress']}
                      labelFormatter={(label) => truncateText(label, 50)}
                    />
                    <Bar dataKey="done_ratio" name="Progress %">
                      {subIssuesChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                      <LabelList 
                        dataKey="done_ratio" 
                        position="top" 
                        formatter={val => `${(val || 0).toFixed(0)}%`}
                        style={{ fontSize: '12px' }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              
              {/* Table for Selected User Details */}
              <div style={{ marginTop: '40px' }}>
                <h3 style={{ marginBottom: '20px', color: '#333' }}>
                  ዝርዝር ተግባራት Details Table ({selectedPeriod})
                  <span style={{ fontSize: '14px', color: '#666', marginLeft: '10px', fontWeight: 'normal' }}>
                    Showing {selectedUserTableData.length} ዝርዝር ተግባራት with valid target values
                  </span>
                </h3>
                
                {selectedUserTableData.length === 0 ? (
                  <div style={{
                    padding: '30px',
                    textAlign: 'center',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '8px',
                    color: '#666',
                    border: '1px dashed #ddd'
                  }}>
                    <p style={{ fontSize: '16px', marginBottom: '10px' }}>
                      No issues with valid target values for {selectedPeriod}
                    </p>
                    <p style={{ fontSize: '14px', color: '#888', marginTop: '10px' }}>
                      {selectedPeriod === "6 Months" 
                        ? "Issues must have valid values in either '1ኛ ሩብዓመት' or '2ኛ ሩብዓመት'"
                        : selectedPeriod === "9 Months"
                        ? "Issues must have valid values in either '1ኛ ሩብዓመት', '2ኛ ሩብዓመት', or '3ኛ ሩብዓመት'"
                        : "Issues with empty or 0 target values are not shown in this table"}
                    </p>
                  </div>
                ) : (
                  <div style={{
                    overflowX: 'auto',
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                  }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f8f9fa' }}>
                          <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>Issue Subject</th>
                          <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>መለኪያ</th>
                          <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>
                            {selectedPeriod === "Yearly" ? "የዓመቱ እቅድ" : selectedPeriod} Target
                            {selectedPeriod === "6 Months" && <div style={{ fontSize: '11px', fontWeight: 'normal' }}>(Sum of Q1 + Q2)</div>}
                            {selectedPeriod === "9 Months" && <div style={{ fontSize: '11px', fontWeight: 'normal' }}>(Sum of Q1 + Q2 + Q3)</div>}
                          </th>
                          <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>Achievement (%)</th>
                          <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>Actual Value</th>
                          <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>Status</th>
                          <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>Project</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedUserTableData.map((row, index) => (
                          <tr key={row.id} style={{ 
                            borderBottom: '1px solid #dee2e6',
                            backgroundColor: index % 2 === 0 ? '#fff' : '#f8f9fa'
                          }}>
                            <td style={{ padding: '12px', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {truncateText(row.subject, 40)}
                            </td>
                            <td style={{ padding: '12px' }}>{row.measurement}</td>
                            <td style={{ padding: '12px', fontWeight: 'bold' }}>
                              {row.targetValue}
                            </td>
                            <td style={{ padding: '12px' }}>
                              <div style={{ 
                                display: 'inline-block',
                                backgroundColor: getProgressColor(row.achievement),
                                color: 'white',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontWeight: 'bold',
                                minWidth: '60px',
                                textAlign: 'center'
                              }}>
                                {row.achievement}%
                              </div>
                            </td>
                            <td style={{ padding: '12px', fontWeight: 'bold', color: '#2e7d32' }}>
                              {row.actual.toFixed(2)}
                            </td>
                            <td style={{ padding: '12px' }}>{row.status}</td>
                            <td style={{ padding: '12px' }}>{truncateText(row.project, 20)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ backgroundColor: '#e3f2fd' }}>
                          <td style={{ padding: '12px', fontWeight: 'bold' }} colSpan="2">Total</td>
                          <td style={{ padding: '12px', fontWeight: 'bold' }}>
                            {selectedUserTableData
                              .reduce((sum, row) => sum + parseFloat(row.targetValue || 0), 0)
                              .toFixed(2)}
                          </td>
                          <td style={{ padding: '12px', fontWeight: 'bold' }}>
                            {selectedUserTableData.length > 0 
                              ? (selectedUserTableData.reduce((sum, row) => sum + row.achievement, 0) / selectedUserTableData.length).toFixed(1)
                              : 0}%
                          </td>
                          <td style={{ padding: '12px', fontWeight: 'bold', color: '#2e7d32' }}>
                            {selectedUserTableData.reduce((sum, row) => sum + row.actual, 0).toFixed(2)}
                          </td>
                          <td style={{ padding: '12px', fontWeight: 'bold' }} colSpan="2">
                            {selectedUserTableData.length} issues
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                    <div style={{ padding: '10px', fontSize: '11px', color: '#888', borderTop: '1px solid #dee2e6' }}>
                      {selectedPeriod === "6 Months" 
                        ? "*Target values are the sum of '1ኛ ሩብዓመት' + '2ኛ ሩብዓመት'"
                        : selectedPeriod === "9 Months"
                        ? "*Target values are the sum of '1ኛ ሩብዓመት' + '2ኛ ሩብዓመት' + '3ኛ ሩብዓመት'"
                        : ""}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{
              padding: '20px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              textAlign: 'center',
              color: '#666',
              marginBottom: '40px'
            }}>
              <p>No የግል እቅድ data available for {selectedUser.name} ({selectedPeriod})</p>
              <p style={{ fontSize: '14px', color: '#888', marginTop: '10px' }}>
                (Only showing የግል እቅድ with valid {selectedPeriod === "Yearly" ? "የዓመቱ እቅድ" : selectedPeriod} values)
              </p>
            </div>
          )}
        </div>
      )}

      {/* Issues Tab - NO PERIOD OR STATUS FILTERS */}
      {activeTab === 'issues' && (
        <div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px'
          }}>
            <h2 style={{ margin: 0 }}>ዝርዝር ተግባራት Dashboard</h2>
            <div style={{ color: '#666', fontSize: '14px' }}>
              Showing {filteredIssues.length} ዝርዝር ተግባራት
              <br />
              <small>(All issues - no period filtering applied)</small>
            </div>
          </div>

          <div style={{
            display: 'flex',
            gap: '15px',
            marginBottom: '30px',
            flexWrap: 'wrap'
          }}>
            <button
              onClick={() => setViewList("assigned")}
              style={{
                padding: '15px 25px',
                backgroundColor: viewList === "assigned" ? '#1976d2' : '#f8f9fa',
                color: viewList === "assigned" ? 'white' : '#333',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                flex: 1,
                minWidth: '200px',
                textAlign: 'center',
                transition: 'all 0.3s ease'
              }}
            >
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                {assignedIssues.length}
              </div>
              <div>Assigned ዝርዝር ተግባራት</div>
            </button>
            <button
              onClick={() => setViewList("notAssigned")}
              style={{
                padding: '15px 25px',
                backgroundColor: viewList === "notAssigned" ? '#dc3545' : '#f8f9fa',
                color: viewList === "notAssigned" ? 'white' : '#333',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                flex: 1,
                minWidth: '200px',
                textAlign: 'center',
                transition: 'all 0.3s ease'
              }}
            >
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                {notAssignedIssues.length}
              </div>
              <div>Not Assigned</div>
            </button>
            <button
              onClick={() => setViewList("all")}
              style={{
                padding: '15px 25px',
                backgroundColor: viewList === "all" ? '#28a745' : '#f8f9fa',
                color: viewList === "all" ? 'white' : '#333',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                flex: 1,
                minWidth: '200px',
                textAlign: 'center',
                transition: 'all 0.3s ease'
              }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                {filteredIssues.length}
              </div>
              <div>All ዝርዝር ተግባራት</div>
            </button>
          </div>

          {viewList && (
            <div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px'
              }}>
                <h3 style={{ margin: 0 }}>
                  {viewList === "assigned" && "Assigned ዝርዝር ተግባራት"}
                  {viewList === "notAssigned" && "Not Assigned ዝርዝር ተግባራት"}
                  {viewList === "all" && "All ዝርዝር ተግባራት"}
                  <span style={{ fontSize: '14px', color: '#666', marginLeft: '10px' }}>
                    ({listToShow.length} issues)
                  </span>
                </h3>
                <button
                  onClick={() => setViewList(null)}
                  style={{
                    padding: '8px 15px',
                    backgroundColor: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  ← Back
                </button>
              </div>

              {listToShow.length === 0 ? (
                <div style={{
                  padding: '40px',
                  textAlign: 'center',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '8px',
                  color: '#666'
                }}>
                  No ዝርዝር ተግባራት found
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
                  gap: '20px'
                }}>
                  {listToShow.map(issue => {
                    const groupName = extractGroupName(issue.assigned_to);
                    const isGroup = isGroupAssignment(issue.assigned_to) || groupName !== "";
                    
                    return (
                      <div
                        key={issue.id}
                        style={{
                          padding: '20px',
                          backgroundColor: 'white',
                          borderRadius: '8px',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                          border: '1px solid #dee2e6',
                          position: 'relative'
                        }}
                      >
                        {isGroup && (
                          <div style={{
                            position: 'absolute',
                            top: '10px',
                            right: '10px',
                            backgroundColor: '#ff9800',
                            color: 'white',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            fontSize: '10px',
                            fontWeight: 'bold'
                          }}>
                            Group
                          </div>
                        )}
                        
                        {/* Issue Name/Subject */}
                        <h4 style={{ 
                          margin: '0 0 15px 0', 
                          fontSize: '16px',
                          lineHeight: '1.4',
                          fontWeight: 'bold'
                        }}>
                          {issue.subject}
                        </h4>
                        
                        {/* Assigned Information Only */}
                        <div style={{ fontSize: '14px', color: '#333' }}>
                          <div style={{ marginBottom: '5px' }}>
                            <strong>Assigned To:</strong> {issue.assigned_to?.name || 'Unassigned'}
                          </div>
                          {isGroup && (
                            <div style={{ 
                              fontSize: '12px', 
                              color: '#666',
                              backgroundColor: '#fff3cd',
                              padding: '5px 8px',
                              borderRadius: '4px',
                              marginTop: '5px'
                            }}>
                              <strong>Group:</strong> {groupName}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Analytics Tab - ADD PERIOD AND STATUS FILTERS HERE */}
      {activeTab === 'analytics' && (
        <div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            flexWrap: 'wrap',
            gap: '15px'
          }}>
            <h2 style={{ margin: 0 }}>Analytics Dashboard ({selectedPeriod})</h2>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* PERIOD FILTER - ONLY IN ANALYTICS TAB */}
              <select
                value={selectedPeriod}
                onChange={(e) => handlePeriodChange(e.target.value)}
                style={{
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  backgroundColor: '#f8f9fa',
                  fontWeight: 'bold',
                  minWidth: '150px'
                }}
              >
                {periodOptions.map(period => (
                  <option key={period} value={period}>{period}</option>
                ))}
              </select>
              
              {/* STATUS FILTER - ONLY IN ANALYTICS TAB */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  minWidth: '150px'
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
          </div>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '20px',
            marginBottom: '40px'
          }}>
            <div style={{
              padding: '20px',
              backgroundColor: 'white',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
              <h3 style={{ marginBottom: '15px', color: '#333' }}>Team Statistics ({selectedPeriod})</h3>
              <div style={{ fontSize: '14px', color: '#666' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span>Total Team Members:</span>
                  <span style={{ fontWeight: 'bold' }}>{groupUsers.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span>Active ዝርዝር ተግባራት:</span>
                  <span style={{ fontWeight: 'bold' }}>{assignedIssues.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span>Unassigned ዝርዝር ተግባራት:</span>
                  <span style={{ fontWeight: 'bold' }}>{notAssignedIssues.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span>Avg Performance:</span>
                  <span style={{ fontWeight: 'bold' }}>
                    {currentPerformanceData.length > 0 
                      ? Math.round(currentPerformanceData.reduce((sum, user) => sum + (user.performance || 0), 0) / currentPerformanceData.length)
                      : 0}%
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Best Performer:</span>
                  <span style={{ fontWeight: 'bold' }}>{bestPerformer?.name || 'None'}</span>
                </div>
                
              </div>
            </div>

            <div style={{
              padding: '20px',
              backgroundColor: 'white',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
              <h3 style={{ marginBottom: '15px', color: '#333' }}>ዝርዝር ተግባራት Distribution</h3>
              <div style={{ fontSize: '14px', color: '#666' }}>
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>High Priority:</span>
                    <span style={{ fontWeight: 'bold' }}>
                      {filteredIssues.filter(i => i.priority?.name?.toLowerCase().includes('high')).length}
                    </span>
                  </div>
                  <div style={{
                    height: '4px',
                    backgroundColor: '#e9ecef',
                    borderRadius: '2px',
                    marginTop: '5px'
                  }}>
                    <div style={{
                      width: `${(filteredIssues.filter(i => i.priority?.name?.toLowerCase().includes('high')).length / Math.max(filteredIssues.length, 1)) * 100}%`,
                      height: '100%',
                      backgroundColor: '#dc3545',
                      borderRadius: '2px'
                    }}></div>
                  </div>
                </div>
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Normal Priority:</span>
                    <span style={{ fontWeight: 'bold' }}>
                      {filteredIssues.filter(i => i.priority?.name?.toLowerCase().includes('normal')).length}
                    </span>
                  </div>
                  <div style={{
                    height: '4px',
                    backgroundColor: '#e9ecef',
                    borderRadius: '2px',
                    marginTop: '5px'
                  }}>
                    <div style={{
                      width: `${(filteredIssues.filter(i => i.priority?.name?.toLowerCase().includes('normal')).length / Math.max(filteredIssues.length, 1)) * 100}%`,
                      height: '100%',
                      backgroundColor: '#ffc107',
                      borderRadius: '2px'
                    }}></div>
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Low Priority:</span>
                    <span style={{ fontWeight: 'bold' }}>
                      {filteredIssues.filter(i => i.priority?.name?.toLowerCase().includes('low')).length}
                    </span>
                  </div>
                  <div style={{
                    height: '4px',
                    backgroundColor: '#e9ecef',
                    borderRadius: '2px',
                    marginTop: '5px'
                  }}>
                    <div style={{
                      width: `${(filteredIssues.filter(i => i.priority?.name?.toLowerCase().includes('low')).length / Math.max(filteredIssues.length, 1)) * 100}%`,
                      height: '100%',
                      backgroundColor: '#28a745',
                      borderRadius: '2px'
                    }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Issue Progress Overview Chart */}
          <div style={{ marginBottom: '40px' }}>
            <h3 style={{ marginBottom: '20px', color: '#333' }}>ዝርዝር ተግባራት Progress Overview ({selectedPeriod})</h3>
            <div style={{ width: "100%", height: "300px" }}>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                  <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="name" 
                      angle={-45} 
                      textAnchor="end" 
                      interval={0}
                      height={60}
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis domain={[0, 100]} unit="%" />
                    <Tooltip
                      formatter={(value) => [`${(value || 0).toFixed(0)}%`, 'Progress']}
                      labelFormatter={(label) => {
                        const issue = chartData.find(d => d.name === label);
                        return `${label} | ${issue?.project}`;
                      }}
                    />
                    <Bar dataKey="done_ratio" name="Progress">
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  height: '100%',
                  color: '#666',
                  fontSize: '16px'
                }}>
                  No chart data available for {selectedPeriod}
                  <br />
                  <small>(Only showing ዝርዝር ተግባራት with valid {selectedPeriod === "Yearly" ? "የዓመቱ እቅድ" : selectedPeriod} values)</small>
                </div>
              )}
            </div>
            
            {/* Table for Analytics Dashboard */}
            <div style={{ marginTop: '40px' }}>
              <h3 style={{ marginBottom: '20px', color: '#333' }}>
                ዝርዝር ተግባራት Analysis Table ({selectedPeriod})
                <span style={{ fontSize: '14px', color: '#666', marginLeft: '10px', fontWeight: 'normal' }}>
                  Showing {analyticsTableData.length} ዝርዝር ተግባራት with valid target values
                </span>
              </h3>
              
              {analyticsTableData.length === 0 ? (
                <div style={{
                  padding: '30px',
                  textAlign: 'center',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '8px',
                  color: '#666',
                  border: '1px dashed #ddd'
                }}>
                  <p style={{ fontSize: '16px', marginBottom: '10px' }}>No ዝርዝር ተግባራት with valid target values for {selectedPeriod}</p>
                  <p style={{ fontSize: '14px', color: '#888' }}>
                    {selectedPeriod === "6 Months" 
                      ? "Issues must have valid values in either '1ኛ ሩብዓመት' or '2ኛ ሩብዓመት'"
                      : selectedPeriod === "9 Months"
                      ? "Issues must have valid values in either '1ኛ ሩብዓመት', '2ኛ ሩብዓመት', or '3ኛ ሩብዓመት'"
                      : "Issues with empty or 0 target values are not shown in this table"}
                  </p>
                </div>
              ) : (
                <div style={{
                  overflowX: 'auto',
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8f9fa' }}>
                        <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>ዝርዝር ተግባራት</th>
                        <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>መለኪያ</th>
                        <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>
                          {selectedPeriod === "Yearly" ? "የዓመቱ እቅድ" : selectedPeriod} Target
                          {selectedPeriod === "6 Months" && <div style={{ fontSize: '11px', fontWeight: 'normal' }}>(Sum of Q1 + Q2)</div>}
                          {selectedPeriod === "9 Months" && <div style={{ fontSize: '11px', fontWeight: 'normal' }}>(Sum of Q1 + Q2 + Q3)</div>}
                        </th>
                        <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>Achievement (%)</th>
                        <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>Actual Value</th>
                        <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>Status</th>
                        <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>Assigned To</th>
                        <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>Project</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyticsTableData.map((row, index) => (
                        <tr key={row.id} style={{ 
                          borderBottom: '1px solid #dee2e6',
                          backgroundColor: index % 2 === 0 ? '#fff' : '#f8f9fa'
                        }}>
                          <td style={{ padding: '12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {truncateText(row.subject, 30)}
                          </td>
                          <td style={{ padding: '12px' }}>{row.measurement}</td>
                          <td style={{ padding: '12px', fontWeight: 'bold' }}>
                            {row.targetValue}
                          </td>
                          <td style={{ padding: '12px' }}>
                            <div style={{ 
                              display: 'inline-block',
                              backgroundColor: getProgressColor(row.achievement),
                              color: 'white',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontWeight: 'bold',
                              minWidth: '60px',
                              textAlign: 'center'
                            }}>
                              {row.achievement}%
                            </div>
                          </td>
                          <td style={{ padding: '12px', fontWeight: 'bold', color: '#2e7d32' }}>
                            {row.actual.toFixed(2)}
                          </td>
                          <td style={{ padding: '12px' }}>{row.status}</td>
                          <td style={{ padding: '12px' }}>{truncateText(row.assignedTo, 15)}</td>
                          <td style={{ padding: '12px' }}>{truncateText(row.project, 15)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ backgroundColor: '#e3f2fd' }}>
                        <td style={{ padding: '12px', fontWeight: 'bold' }} colSpan="2">Total</td>
                        <td style={{ padding: '12px', fontWeight: 'bold' }}>
                          {analyticsTableData
                            .reduce((sum, row) => sum + parseFloat(row.targetValue || 0), 0)
                            .toFixed(2)}
                        </td>
                        <td style={{ padding: '12px', fontWeight: 'bold' }}>
                          {analyticsTableData.length > 0 
                            ? (analyticsTableData.reduce((sum, row) => sum + row.achievement, 0) / analyticsTableData.length).toFixed(1)
                            : 0}%
                        </td>
                        <td style={{ padding: '12px', fontWeight: 'bold', color: '#2e7d32' }}>
                          {analyticsTableData.reduce((sum, row) => sum + row.actual, 0).toFixed(2)}
                        </td>
                        <td style={{ padding: '12px', fontWeight: 'bold' }} colSpan="3">
                          {analyticsTableData.length} issues
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                  <div style={{ padding: '10px', fontSize: '11px', color: '#888', borderTop: '1px solid #dee2e6' }}>
                    {selectedPeriod === "6 Months" 
                      ? "*Target values are the sum of '1ኛ ሩብዓመት' + '2ኛ ሩብዓመት'"
                      : selectedPeriod === "9 Months"
                      ? "*Target values are the sum of '1ኛ ሩብዓመት' + '2ኛ ሩብዓመት' + '3ኛ ሩብዓመት'"
                      : ""}
                    </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Personal Plan Track Tab - NO PERIOD OR STATUS FILTERS - UPDATED */}
      {activeTab === 'personal-plan' && (
        <div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px'
          }}>
            <h2 style={{ margin: 0 }}>Personal Plan Track</h2>
            <div style={{ color: '#666', fontSize: '14px' }}>
              Track personal and group assignments for team members
              <br />
              <small>(All assigned issues shown - no period filtering, includes issues with empty or 0 period values)</small>
            </div>
          </div>

          {/* Group Member Selection - SIMPLIFIED VERSION */}
          <div style={{ marginBottom: '30px' }}>
            <h3 style={{ marginBottom: '15px', color: '#333' }}>Select Team Member</h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: '10px'
            }}>
              {currentPerformanceData.map(member => (
                <div
                  key={member.id}
                  onClick={() => handleGroupMemberSelect(member)}
                  style={{
                    padding: '15px',
                    backgroundColor: selectedGroupMember?.id === member.id ? '#e3f2fd' : '#f8f9fa',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    border: `2px solid ${selectedGroupMember?.id === member.id ? '#1976d2' : 'transparent'}`,
                    textAlign: 'center'
                  }}
                  onMouseEnter={(e) => {
                    if (selectedGroupMember?.id !== member.id) {
                      e.currentTarget.style.borderColor = '#1976d2';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedGroupMember?.id !== member.id) {
                      e.currentTarget.style.borderColor = 'transparent';
                      e.currentTarget.style.boxShadow = 'none';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }
                  }}
                >
                  <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '5px' }}>
                    {member.name}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Group Member Details */}
          {selectedGroupMember && (
            <div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '15px',
                marginBottom: '30px',
                padding: '20px',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px'
              }}>
                <div>
                  <h3 style={{ margin: 0 }}>
                    Assigned ዝርዝር ተግባራት ({groupMemberIssues.length})
                    <span style={{ fontSize: '14px', color: '#666', marginLeft: '10px', fontWeight: 'normal' }}>
                      (All issues assigned to {selectedGroupMember.name} - no period filtering)
                    </span>
                  </h3>
                  <div style={{ fontSize: '14px', color: '#666', marginTop: '5px' }}>
                    Showing all assigned issues including those with empty or 0 period values
                  </div>
                </div>
              </div>

              {/* Personal Plan Categorization Section */}
              {!selectedPersonalCategory && !selectedMainIssue && (
                <div style={{
                  padding: '20px',
                  backgroundColor: '#e8f5e8',
                  borderRadius: '8px',
                  marginBottom: '30px'
                }}>
                  <h3 style={{ marginBottom: '20px', color: '#2e7d32' }}>
                    Categorize Assigned ዝርዝር ተግባራት
                  </h3>
                  
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                    gap: '20px'
                  }}>
                    {/* Card for issues WITH sub-issues created by the selected user - UPDATED */}
                    <div
                      onClick={() => {
                        handlePersonalCategorySelect('withSubIssues');
                        setSelectedMainIssue(null);
                        setSelectedPersonalSubIssues([]);
                      }}
                      style={{
                        padding: '25px',
                        backgroundColor: '#fff',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        border: '3px solid transparent',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                        textAlign: 'center',
                        position: 'relative',
                        overflow: 'hidden'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#4caf50';
                        e.currentTarget.style.transform = 'translateY(-4px)';
                        e.currentTarget.style.boxShadow = '0 8px 20px rgba(76, 175, 80, 0.2)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'transparent';
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
                      }}
                    >
                      <div style={{
                        position: 'absolute',
                        top: '10px',
                        right: '10px',
                        backgroundColor: '#4caf50',
                        color: 'white',
                        padding: '4px 12px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}>
                        Contains የግል እቅድ
                      </div>
                      
                      <div style={{ fontSize: '48px', color: '#4caf50', marginBottom: '15px' }}>
                        📋
                      </div>
                      
                      <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#333', marginBottom: '15px' }}>
                        የግል እቅድ ያላቸው ዝርዝር ተግባራት
                      </div>
                      
                      <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        gap: '20px',
                        fontSize: '13px',
                        color: '#666'
                      }}>
                        <div>
                          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#2e7d32', marginBottom: '10px' }}>
                            {personalPlanCategorizedIssues.withSubIssues.length}
                          </div>
                          <div>ዝርዝር ተግባራት</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#4caf50', marginBottom: '10px' }}>
                            {personalPlanCategorizedIssues.withSubIssues.reduce((total, issue) => {
                              const userSubIssuesCount = (issue.children || []).filter(sub => 
                                sub.author?.id === selectedGroupMember?.id
                              ).length;
                              return total + userSubIssuesCount;
                            }, 0)}
                          </div>
                          <div>የግል እቅድ</div>
                        </div>
                      </div>
                      
                      <div style={{
                        marginTop: '15px',
                        padding: '8px 16px',
                        backgroundColor: '#4caf50',
                        color: 'white',
                        borderRadius: '20px',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        display: 'inline-block'
                      }}>
                        Click to View ዝርዝር ተግባራት Names →
                      </div>
                    </div>
                    
                    {/* Card for issues WITHOUT sub-issues created by the selected user */}
                    <div
                      onClick={() => handlePersonalCategorySelect('withoutSubIssues')}
                      style={{
                        padding: '25px',
                        backgroundColor: '#fff',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        border: '3px solid transparent',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                        textAlign: 'center',
                        position: 'relative',
                        overflow: 'hidden'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#2196f3';
                        e.currentTarget.style.transform = 'translateY(-4px)';
                        e.currentTarget.style.boxShadow = '0 8px 20px rgba(33, 150, 243, 0.2)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'transparent';
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
                      }}
                    >
                      <div style={{
                        position: 'absolute',
                        top: '10px',
                        right: '10px',
                        backgroundColor: '#2196f3',
                        color: 'white',
                        padding: '4px 12px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}>
                        No የግል እቅድ
                      </div>
                      
                      <div style={{ fontSize: '48px', color: '#2196f3', marginBottom: '15px' }}>
                        📝
                      </div>
                      
                      <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#333', marginBottom: '15px' }}>
                        የግል እቅድ የሌላቸው ዝርዝር ተግባራት 
                      </div>
                      
                      <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        gap: '20px',
                        fontSize: '13px',
                        color: '#666'
                      }}>
                        <div>
                          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#1565c0', marginBottom: '10px' }}>
                            {personalPlanCategorizedIssues.withoutSubIssues.length}
                          </div>
                          <div>ዝርዝር ተግባራት</div>
                        </div>
                      </div>
                      
                      <div style={{
                        marginTop: '15px',
                        padding: '8px 16px',
                        backgroundColor: '#2196f3',
                        color: 'white',
                        borderRadius: '20px',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        display: 'inline-block'
                      }}>
                        Click to View Details →
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Category Details View for withSubIssues - Show main issue names */}
              {selectedPersonalCategory === 'withSubIssues' && !selectedMainIssue && (
                <div style={{
                  marginBottom: '30px',
                  padding: '20px',
                  backgroundColor: '#e8f5e8',
                  borderRadius: '8px'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '15px',
                    marginBottom: '20px',
                    padding: '15px',
                    backgroundColor: '#fff',
                    borderRadius: '8px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                  }}>
                    <button
                      onClick={handleBackFromPersonalCategory}
                      style={{
                        padding: '8px 15px',
                        borderRadius: '5px',
                        border: 'none',
                        backgroundColor: '#6c757d',
                        color: '#fff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                    >
                      ← Back to Categories
                    </button>
                    <h3 style={{ margin: 0, flex: 1 }}>
                      የግል እቅድ ያላቸው ዝርዝር ተግባራት Names
                      <span style={{ fontSize: '14px', color: '#666', marginLeft: '10px' }}>
                        ({selectedGroupMember.name} - Click on any issue to view its የግል እቅድ)
                      </span>
                    </h3>
                    
                    <div style={{
                      display: 'flex',
                      gap: '15px',
                      alignItems: 'center'
                    }}>
                      <div style={{
                        backgroundColor: '#e8f5e9',
                        color: '#2e7d32',
                        padding: '6px 12px',
                        borderRadius: '4px',
                        fontWeight: 'bold',
                        fontSize: '14px'
                      }}>
                        {personalPlanCategorizedIssues.withSubIssues.length} ዝርዝር ተግባራት
                      </div>
                      <div style={{
                        backgroundColor: '#4caf50',
                        color: 'white',
                        padding: '6px 12px',
                        borderRadius: '4px',
                        fontWeight: 'bold',
                        fontSize: '14px'
                      }}>
                        📋 Contains የግል እቅድ
                      </div>
                    </div>
                  </div>
                  
                  {personalCategoryIssues.length === 0 ? (
                    <div style={{
                      padding: '40px',
                      textAlign: 'center',
                      backgroundColor: 'white',
                      borderRadius: '8px',
                      color: '#666',
                      border: '2px dashed #ddd'
                    }}>
                      <div style={{ fontSize: '48px', marginBottom: '20px' }}>
                        📋
                      </div>
                      <p style={{ fontSize: '18px', marginBottom: '10px', fontWeight: 'bold' }}>
                        No ዝርዝር ተግባራት in this category
                      </p>
                      <p style={{ fontSize: '14px', color: '#888' }}>
                        {selectedGroupMember.name} hasn't created any የግል እቅድ in their assigned issues
                      </p>
                    </div>
                  ) : (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
                      gap: '20px'
                    }}>
                      {personalCategoryIssues.map(issue => {
                        const groupName = extractGroupName(issue.assigned_to);
                        const isGroup = isGroupAssignment(issue.assigned_to) || groupName !== "";
                        const userSubIssuesCount = (issue.children || []).filter(sub => 
                          sub.author?.id === selectedGroupMember.id
                        ).length;
                        
                        return (
                          <div
                            key={issue.id}
                            onClick={() => handleMainIssueSelect(issue)}
                            style={{
                              padding: '20px',
                              backgroundColor: 'white',
                              borderRadius: '8px',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                              borderLeft: `4px solid #4caf50`,
                              position: 'relative',
                              transition: 'all 0.3s ease',
                              cursor: 'pointer'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = 'translateY(-4px)';
                              e.currentTarget.style.boxShadow = '0 8px 20px rgba(76, 175, 80, 0.2)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'translateY(0)';
                              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                            }}
                          >
                         
                            
                            {/* Sub-issues indicator */}
                            {userSubIssuesCount > 0 && (
                              <div style={{
                                position: 'absolute',
                                top: '10px',
                                left: '10px',
                                backgroundColor: '#4caf50',
                                color: 'white',
                                padding: '2px 8px',
                                borderRadius: '10px',
                                fontSize: '10px',
                                fontWeight: 'bold',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}>
                                📋 {userSubIssuesCount} የግል እቅድ
                              </div>
                            )}
                            
                            <div style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'flex-start',
                              marginBottom: '15px',
                              marginTop: userSubIssuesCount > 0 ? '25px' : '0'
                            }}>
                              <div style={{ flex: 1 }}>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: '16px', lineHeight: '1.4', fontWeight: 'bold' }}>
                                  {issue.subject}
                                </h4>
                               
                              </div>
                            </div>
                            
                            <div style={{
                              marginTop: '15px',
                              paddingTop: '15px',
                              borderTop: '1px solid #eee'
                            }}>
                              <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: '12px',
                                color: '#666',
                                marginBottom: '5px'
                              }}>
                                
                               
                              </div>
                            </div>
                            
                            <div style={{
                              marginTop: '15px',
                              padding: '8px',
                              backgroundColor: '#e8f5e9',
                              borderRadius: '4px',
                              textAlign: 'center',
                              fontSize: '12px',
                              fontWeight: 'bold',
                              color: '#2e7d32',
                              border: '1px dashed #4caf50'
                            }}>
                              Click to view {userSubIssuesCount} የግል እቅድ →
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Sub-issues View - Show when a main issue is selected */}
              {selectedMainIssue && (
                <div style={{
                  marginBottom: '30px',
                  padding: '20px',
                  backgroundColor: '#e8f5e8',
                  borderRadius: '8px'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '15px',
                    marginBottom: '20px',
                    padding: '15px',
                    backgroundColor: '#fff',
                    borderRadius: '8px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                  }}>
                    <button
                      onClick={handleBackFromSubIssues}
                      style={{
                        padding: '8px 15px',
                        borderRadius: '5px',
                        border: 'none',
                        backgroundColor: '#6c757d',
                        color: '#fff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                    >
                      ← Back to ዝርዝር ተግባራት List
                    </button>
                    <h3 style={{ margin: 0, flex: 1 }}>
                      የግል እቅድ for: {truncateText(selectedMainIssue.subject, 50)}
                      <span style={{ fontSize: '14px', color: '#666', marginLeft: '10px' }}>
                        ({selectedGroupMember.name})
                      </span>
                    </h3>
                    
                    <div style={{
                      display: 'flex',
                      gap: '15px',
                      alignItems: 'center'
                    }}>
                      <div style={{
                        backgroundColor: '#e8f5e9',
                        color: '#2e7d32',
                        padding: '6px 12px',
                        borderRadius: '4px',
                        fontWeight: 'bold',
                        fontSize: '14px'
                      }}>
                        {selectedPersonalSubIssues.length} የግል እቅድ
                      </div>
                      <div style={{
                        backgroundColor: '#4caf50',
                        color: 'white',
                        padding: '6px 12px',
                        borderRadius: '4px',
                        fontWeight: 'bold',
                        fontSize: '14px'
                      }}>
                        📋 Personal Tasks
                      </div>
                    </div>
                  </div>
                  
                  {selectedPersonalSubIssues.length === 0 ? (
                    <div style={{
                      padding: '40px',
                      textAlign: 'center',
                      backgroundColor: 'white',
                      borderRadius: '8px',
                      color: '#666',
                      border: '2px dashed #ddd'
                    }}>
                      <div style={{ fontSize: '48px', marginBottom: '20px' }}>
                        📝
                      </div>
                      <p style={{ fontSize: '18px', marginBottom: '10px', fontWeight: 'bold' }}>
                        No የግል እቅድ found for {selectedGroupMember.name} in this issue
                      </p>
                      <p style={{ fontSize: '14px', color: '#888' }}>
                        This user doesn't have any personal tasks assigned within this issue
                      </p>
                    </div>
                  ) : (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
                      gap: '20px'
                    }}>
                      {selectedPersonalSubIssues.map(subIssue => (
                        <div
                          key={subIssue.id}
                          style={{
                            padding: '20px',
                            backgroundColor: 'white',
                            borderRadius: '8px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                            
                            position: 'relative',
                            transition: 'all 0.3s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-4px)';
                            e.currentTarget.style.boxShadow = '0 8px 20px rgba(76, 175, 80, 0.2)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                          }}
                        >
                          <div style={{
                            position: 'absolute',
                            top: '10px',
                            right: '10px',
                            backgroundColor: '#4caf50',
                            color: 'white',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            fontSize: '10px',
                            fontWeight: 'bold'
                          }}>
                            የግል እቅድ
                          </div>
                          
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            marginBottom: '15px'
                          }}>
                            <div style={{ flex: 1 }}>
                              <h4 style={{ margin: '0 0 10px 0', fontSize: '16px', lineHeight: '1.4', fontWeight: 'bold' }}>
                                {subIssue.subject}
                              </h4>
                              <div style={{ fontSize: '13px', color: '#666', marginBottom: '5px' }}>
                                <strong>Assigned To:</strong> {selectedGroupMember.name}
                              </div>
                              <div style={{ fontSize: '13px', color: '#666', marginBottom: '5px' }}>
                                <strong>Parent Issue:</strong> {truncateText(selectedMainIssue.subject, 30)}
                              </div>
                            </div>
                          
                          </div>
                          
                          <div style={{
                            marginTop: '15px',
                            paddingTop: '15px',
                            borderTop: '1px solid #eee'
                          }}>
                            <div style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              fontSize: '12px',
                              color: '#666',
                              marginBottom: '5px'
                            }}>
                              
                              <div>
                                <strong>Weight:</strong> {getWeight(subIssue)}
                              </div>
                            </div>
                            <div style={{
                              fontSize: '12px',
                              color: '#666',
                              marginBottom: '5px'
                            }}>
                              <strong>Created:</strong> {formatDate(subIssue.created_on)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Category Details View for withoutSubIssues */}
              {selectedPersonalCategory === 'withoutSubIssues' && !selectedMainIssue && (
                <div style={{
                  marginBottom: '30px',
                  padding: '20px',
                  backgroundColor: '#e8f5e8',
                  borderRadius: '8px'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '15px',
                    marginBottom: '20px',
                    padding: '15px',
                    backgroundColor: '#fff',
                    borderRadius: '8px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                  }}>
                    <button
                      onClick={handleBackFromPersonalCategory}
                      style={{
                        padding: '8px 15px',
                        borderRadius: '5px',
                        border: 'none',
                        backgroundColor: '#6c757d',
                        color: '#fff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                    >
                      ← Back to Categories
                    </button>
                    <h3 style={{ margin: 0, flex: 1 }}>
                      የግል እቅድ የሌላቸው ዝርዝር ተግባራት 
                      <span style={{ fontSize: '14px', color: '#666', marginLeft: '10px' }}>
                        ({selectedGroupMember.name})
                      </span>
                    </h3>
                    
                    <div style={{
                      display: 'flex',
                      gap: '15px',
                      alignItems: 'center'
                    }}>
                      {selectedPersonalCategory === 'withSubIssues' && (
                        <div style={{
                          backgroundColor: '#e8f5e9',
                          color: '#2e7d32',
                          padding: '6px 12px',
                          borderRadius: '4px',
                          fontWeight: 'bold',
                          fontSize: '14px'
                        }}>
                          {personalPlanCategorizedIssues.withSubIssues.length} issues
                        </div>
                      )}
                      <div style={{
                        backgroundColor: selectedPersonalCategory === 'withSubIssues' ? '#4caf50' : '#2196f3',
                        color: 'white',
                        padding: '6px 12px',
                        borderRadius: '4px',
                        fontWeight: 'bold',
                        fontSize: '14px'
                      }}>
                        {selectedPersonalCategory === 'withSubIssues' ? '📋' : '📝'} 
                        {selectedPersonalCategory === 'withSubIssues' ? ' Contains የግል እቅድ' : ' No የግል እቅድ'}
                      </div>
                    </div>
                  </div>
                  
                  {personalCategoryIssues.length === 0 ? (
                    <div style={{
                      padding: '40px',
                      textAlign: 'center',
                      backgroundColor: 'white',
                      borderRadius: '8px',
                      color: '#666',
                      border: '2px dashed #ddd'
                    }}>
                      <div style={{ fontSize: '48px', marginBottom: '20px' }}>
                        {selectedPersonalCategory === 'withSubIssues' ? '📋' : '📝'}
                      </div>
                      <p style={{ fontSize: '18px', marginBottom: '10px', fontWeight: 'bold' }}>
                        No ዝርዝር ተግባራት in this category
                      </p>
                      {selectedPersonalCategory === 'withoutSubIssues' && (
                        <p style={{ fontSize: '14px', color: '#888' }}>
                          All of {selectedGroupMember.name}'s assigned issues have የግል እቅድ created by them
                        </p>
                      )}
                    </div>
                  ) : (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
                      gap: '20px'
                    }}>
                      {personalCategoryIssues.map(issue => {
                        const groupName = extractGroupName(issue.assigned_to);
                        const isGroup = isGroupAssignment(issue.assigned_to) || groupName !== "";
                        
                        return (
                          <div
                            key={issue.id}
                            style={{
                              padding: '20px',
                              backgroundColor: 'white',
                              borderRadius: '8px',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                              borderLeft: `4px solid ${
                                selectedPersonalCategory === 'withSubIssues' ? '#4caf50' : '#2196f3'
                              }`,
                              position: 'relative',
                              transition: 'all 0.3s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = 'translateY(-4px)';
                              e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.15)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'translateY(0)';
                              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                            }}
                          >
                          
                            
                            <div style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'flex-start',
                              marginBottom: '15px'
                            }}>
                              <div style={{ flex: 1 }}>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: '16px', lineHeight: '1.4' }}>
                                  {issue.subject}
                                </h4>
                              
                              </div>
                             
                            </div>
                            
                            <div style={{
                              marginTop: '15px',
                              paddingTop: '15px',
                              borderTop: '1px solid #eee'
                            }}>
                              <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: '12px',
                                color: '#666',
                                marginBottom: '5px'
                              }}>
                                
                                <div>
                                  <strong>Weight:</strong> {getWeight(issue)}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Summary Statistics */}
              {groupMemberIssues.length > 0 && !selectedPersonalCategory && !selectedMainIssue && (
                <div style={{
                  marginTop: '40px',
                  padding: '20px',
                  backgroundColor: '#e3f2fd',
                  borderRadius: '8px'
                }}>
                  <h4 style={{ marginBottom: '15px', color: '#1565c0' }}>Summary</h4>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '15px'
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '12px', color: '#666' }}>Total ዝርዝር ተግባራት</div>
                      <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{groupMemberIssues.length}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '12px', color: '#666' }}>With የግል እቅድ</div>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2e7d32' }}>
                        {personalPlanCategorizedIssues.withSubIssues.length}
                      </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '12px', color: '#666' }}>Without የግል እቅድ</div>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1565c0' }}>
                        {personalPlanCategorizedIssues.withoutSubIssues.length}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Instructions when no member selected */}
          {!selectedGroupMember && (
            <div style={{
              padding: '40px',
              textAlign: 'center',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              color: '#666',
              border: '2px dashed #ddd'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '20px' }}>👥</div>
              <p style={{ fontSize: '18px', marginBottom: '10px', fontWeight: 'bold' }}>
                Select a Team Member to View Their Personal Plan Track
              </p>
              <p style={{ fontSize: '14px', color: '#888', marginBottom: '20px' }}>
                Click on any team member card above to see their assigned ዝርዝር ተግባራት,
                including both direct assignments and assignments via groups
              </p>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 20px',
                backgroundColor: '#1976d2',
                color: 'white',
                borderRadius: '20px',
                fontSize: '14px',
                fontWeight: 'bold'
              }}>
                <span>👆 Click a member above to get started</span>
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
          <span>Total ዝርዝር ተግባራት: {issues.length}</span>
          <span>•</span>
          <span>Filtered ዝርዝር: {filteredIssues.length}</span>
          <span>•</span>
          <span>Team Members: {groupUsers.length}</span>
          <span>•</span>
          <span>Projects: {Object.keys(projectMembers).length}</span>
          <span>•</span>
          <span>Last Updated: {new Date().toLocaleTimeString()}</span>
        </div>
        <div style={{ marginTop: '10px', fontSize: '11px', color: '#888' }}>
          {/* Show different info based on active tab */}
          {(activeTab === 'performance' || activeTab === 'analytics') && (
            <>
              *Only showing ዝርዝር ተግባራት with valid {selectedPeriod === "Yearly" ? "የዓመቱ እቅድ" : selectedPeriod} values
              {selectedPeriod === "6 Months" && " (1ኛ ሩብዓመት OR 2ኛ ሩብዓመት)"}
              {selectedPeriod === "9 Months" && " (1ኛ ሩብዓመት OR 2ኛ ሩብዓመት OR 3ኛ ሩብዓመት)"}
              {selectedPeriod.includes("ሩብዓመት") && " • Dynamic quarter mapping applied"}
            </>
          )}
          {(activeTab === 'issues' || activeTab === 'personal-plan') && (
            <>*Showing all ዝርዝር ተግባራት (no period filtering)</>
          )}
        </div>
      </div>
    </div>
  );
}

export default TeamLeaderDashboard;