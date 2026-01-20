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
  Legend
} from "recharts";
import {
  getWatchedOneLevelIssues,
  getCurrentUser,
  getUsersInGroup,
  getProjectMembers,
  getGroupDetails
} from "../api/redmineApi";

// ============================
// UTILITY FUNCTIONS
// ============================
const formatDate = (dateString) => {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString();
};

const truncateText = (text, maxLength = 20) => {
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
};

const getProgressColor = (percentage) => {
  if (percentage === 100) return "#2e7d32";
  if (percentage >= 75) return "#4caf50";
  if (percentage >= 50) return "#ff9800";
  if (percentage > 0) return "#ff5722";
  return "#f44336";
};

// ============================
// QUARTER UTILITY FUNCTIONS
// ============================
const getField = (issue, fieldName) => {
  const field = issue.custom_fields?.find((f) => f.name === fieldName);
  return field?.value;
};

const getQuarterIndex = (quarterName) => {
  switch (quarterName) {
    case "1ኛ ሩብዓመት": return 1;
    case "2ኛ ሩብዓመት": return 2;
    case "3ኛ ሩብዓመት": return 3;
    case "4ኛ ሩብዓመት": return 4;
    default: return 0;
  }
};

const hasValidQuarterValue = (issue, quarter) => {
  const value = getField(issue, quarter);
  return value && value !== "0" && value !== "" && value !== "0.0" && value !== "0.00";
};

const getValidQuartersList = (issue) => {
  const quarters = ["1ኛ ሩብዓመት", "2ኛ ሩብዓመት", "3ኛ ሩብዓመት", "4ኛ ሩብዓመት"];
  return quarters.filter(quarter => hasValidQuarterValue(issue, quarter));
};

const countValidQuarters = (issue) => {
  return getValidQuartersList(issue).length;
};

const getQuarterRanges = (validQuartersList, targetQuarter) => {
  const validQuartersCount = validQuartersList.length;
  const targetQuarterIndex = getQuarterIndex(targetQuarter);
  
  if (validQuartersCount === 4) {
    const ranges = [
      { start: 0, end: 25 },
      { start: 25, end: 50 },
      { start: 50, end: 75 },
      { start: 75, end: 100 }
    ];
    return ranges[targetQuarterIndex - 1] || { start: 0, end: 100 };
  }
  
  if (validQuartersCount === 3) {
    const ranges = [];
    let currentStart = 0;
    const segmentSize = 100 / validQuartersCount;
    
    validQuartersList.forEach((quarter, index) => {
      const qIdx = getQuarterIndex(quarter);
      ranges[qIdx - 1] = {
        start: currentStart,
        end: currentStart + segmentSize
      };
      currentStart += segmentSize;
    });
    
    return ranges[targetQuarterIndex - 1] || { start: 0, end: 100 };
  }
  
  if (validQuartersCount === 2) {
    const ranges = {};
    const segmentSize = 100 / validQuartersCount;
    let currentStart = 0;
    
    validQuartersList.forEach((quarter, index) => {
      const qIdx = getQuarterIndex(quarter);
      ranges[qIdx] = {
        start: currentStart,
        end: currentStart + segmentSize
      };
      currentStart += segmentSize;
    });
    
    return ranges[targetQuarterIndex] || { start: 0, end: 100 };
  }
  
  if (validQuartersCount === 1) {
    return { start: 0, end: 100 };
  }
  
  return { start: 0, end: 100 };
};

const mapSubIssueProgress = (donePercent, period, subIssue = null) => {
  if (!donePercent) donePercent = 0;
  
  if (period === "Yearly") return donePercent;
  
  if (period === "6 Months") {
    return donePercent <= 50 ? Math.round((donePercent / 50) * 100) : 100;
  }
  
  if (period === "9 Months") {
    return donePercent <= 75 ? Math.round((donePercent / 75) * 100) : 100;
  }

  if (period.includes("ሩብዓመት")) {
    const quarterIndex = getQuarterIndex(period);
    
    if (!subIssue) {
      switch (quarterIndex) {
        case 1:
          return donePercent <= 25 ? Math.round((donePercent / 25) * 100) : 100;
        case 2:
          return donePercent >= 26 && donePercent <= 50
            ? Math.round(((donePercent - 26) / 24) * 100)
            : donePercent > 50
            ? 100
            : 0;
        case 3:
          return donePercent >= 51 && donePercent <= 75
            ? Math.round(((donePercent - 51) / 24) * 100)
            : donePercent > 75
            ? 100
            : 0;
        case 4:
          return donePercent >= 76 && donePercent <= 100
            ? Math.round(((donePercent - 76) / 24) * 100)
            : donePercent === 100
            ? 100
            : 0;
        default:
          return donePercent;
      }
    }
    
    const validQuartersList = getValidQuartersList(subIssue);
    
    if (!validQuartersList.includes(period)) {
      return 0;
    }
    
    const quarterRange = getQuarterRanges(validQuartersList, period);
    
    const { start, end } = quarterRange;
    const rangeSize = end - start;
    
    if (rangeSize <= 0) {
      return 0;
    }
    
    const actualProgressInYear = donePercent;
    
    if (actualProgressInYear < start) {
      return 0;
    } else if (actualProgressInYear >= end) {
      return 100;
    } else {
      const progressInQuarter = actualProgressInYear - start;
      const mappedPercent = Math.round((progressInQuarter / rangeSize) * 100);
      return Math.min(100, Math.max(0, mappedPercent));
    }
  }
  
  return donePercent;
};

const mapProgress = (done, period, issue = null) => {
  if (!done) done = 0;
  
  if (period === "Yearly") return done;
  
  if (period === "6 Months") {
    return done <= 50 ? Math.round((done / 50) * 100) : 100;
  }
  
  if (period === "9 Months") {
    return done <= 75 ? Math.round((done / 75) * 100) : 100;
  }

  if (period.includes("ሩብዓመት")) {
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
    
    if (!hasValidQuarterValue(issue, period)) {
      return 0;
    }
    
    const validQuartersList = getValidQuartersList(issue);
    const targetQuarterIndex = getQuarterIndex(period);
    const range = getQuarterRanges(validQuartersList, period);
    
    if (done <= range.start) {
      return 0;
    } else if (done >= range.end) {
      return 100;
    } else {
      const progressInRange = ((done - range.start) / (range.end - range.start)) * 100;
      return Math.round(progressInRange);
    }
  }
  
  return 0;
};

const getWeight = (issue) => {
  const weightValue = getField(issue, "ክብደት");
  if (!weightValue || weightValue === "0" || weightValue === "") {
    return 1;
  }
  return Number(weightValue) || 1;
};

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
      return (q1 && q1 !== "0" && q1 !== "") || (q2 && q2 !== "0" && q2 !== "");
    });
  }

  if (period === "9 Months") {
    return issues.filter(issue => {
      const q1 = getField(issue, "1ኛ ሩብዓመት");
      const q2 = getField(issue, "2ኛ ሩብዓመት");
      const q3 = getField(issue, "3ኛ ሩብዓመት");
      return (q1 && q1 !== "0" && q1 !== "") || 
             (q2 && q2 !== "0" && q2 !== "") || 
             (q3 && q3 !== "0" && q3 !== "");
    });
  }

  return issues.filter(issue => {
    const val = getField(issue, period);
    return val && val !== "0" && val !== "";
  });
};

const getTargetValue = (issue, period) => {
  if (!issue) return "0";
  
  if (period === "Yearly") {
    return getField(issue, "የዓመቱ እቅድ") || "0";
  }
  
  if (period === "6 Months") {
    const q1 = getField(issue, "1ኛ ሩብዓመት") || "0";
    const q2 = getField(issue, "2ኛ ሩብዓመት") || "0";
    const q1Num = parseFloat(q1.toString().trim()) || 0;
    const q2Num = parseFloat(q2.toString().trim()) || 0;
    const total = q1Num + q2Num;
    return total > 0 ? total.toString() : "0";
  }
  
  if (period === "9 Months") {
    const q1 = getField(issue, "1ኛ ሩብዓመት") || "0";
    const q2 = getField(issue, "2ኛ ሩብዓመት") || "0";
    const q3 = getField(issue, "3ኛ ሩብዓመት") || "0";
    const q1Num = parseFloat(q1.toString().trim()) || 0;
    const q2Num = parseFloat(q2.toString().trim()) || 0;
    const q3Num = parseFloat(q3.toString().trim()) || 0;
    const total = q1Num + q2Num + q3Num;
    return total > 0 ? total.toString() : "0";
  }
  
  return getField(issue, period) || "0";
};

const calculateActualValue = (achievement, targetValue, period) => {
  if (!achievement || !targetValue) return 0;
  const achievementNum = parseFloat(achievement.toString().trim());
  const targetNum = parseFloat(targetValue.toString().trim());
  if (isNaN(achievementNum) || isNaN(targetNum) || targetNum === 0) return 0;
  return (achievementNum / 100) * targetNum;
};

const isValidTargetValue = (targetValue, period) => {
  if (!targetValue) return false;
  if (period === "6 Months" || period === "9 Months") {
    const numValue = parseFloat(targetValue.toString().trim());
    return !isNaN(numValue) && numValue > 0;
  }
  const trimmed = targetValue.toString().trim();
  return trimmed !== "" && trimmed !== "0" && trimmed !== "0.0" && trimmed !== "0.00";
};

// ============================
// GROUP FUNCTIONS
// ============================
const normalizeGroupName = (groupName) => {
  if (!groupName) return "";
  let normalized = groupName.toString()
    .replace(/\[Group\]/gi, '')
    .replace(/\[group\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  normalized = normalized.replace(/\s*\(.*?\)\s*/g, ' ').trim();
  return normalized;
};

const isGroupAssignment = (assignedTo) => {
  if (!assignedTo) return false;
  if (assignedTo.type === "Group" || assignedTo.type === "group") return true;
  if (assignedTo.name) {
    const name = assignedTo.name.toLowerCase();
    if (name.includes('[group]') || 
        name.includes('(group)') || 
        name.includes(' group') ||
        name.endsWith(' group')) {
      return true;
    }
  }
  if (assignedTo.id && !assignedTo.firstname && !assignedTo.lastname) {
    return true;
  }
  return false;
};

const extractGroupName = (assignedTo) => {
  if (!assignedTo || !assignedTo.name) return "";
  let groupName = assignedTo.name;
  if (groupName.includes('[Group]') || 
      groupName.includes('(Group)') ||
      assignedTo.type === 'Group') {
    return normalizeGroupName(groupName);
  }
  if (!assignedTo.firstname && !assignedTo.lastname && assignedTo.id) {
    return normalizeGroupName(groupName);
  }
  return normalizeGroupName(groupName);
};

// ============================
// PERFORMANCE CALCULATION FUNCTIONS
// ============================

const checkIfUserIsAssigned = (issue, user, projectMembersData) => {
  if (!issue.assigned_to) return false;
  
  if (issue.assigned_to?.id === user.id) {
    return true;
  }
  
  if (issue.assigned_to && issue.assigned_to.name) {
    const groupName = extractGroupName(issue.assigned_to);
    const isGroup = isGroupAssignment(issue.assigned_to) || groupName !== "";
    
    if (isGroup && groupName) {
      const userIdNum = Number(user.id);
      const normalizedGroupName = normalizeGroupName(groupName);
      const searchName = normalizedGroupName.toLowerCase().trim();
      
      if (issue.project?.id && projectMembersData[issue.project.id]) {
        const projectData = projectMembersData[issue.project.id];
        for (const [groupId, groupInfo] of Object.entries(projectData.groups || {})) {
          const normalizedInfoName = normalizeGroupName(groupInfo.name).toLowerCase().trim();
          if (normalizedInfoName.includes(searchName) || searchName.includes(normalizedInfoName)) {
            const numericUserIds = groupInfo.userIds.map(id => Number(id));
            if (numericUserIds.includes(userIdNum)) return true;
          }
        }
      }
      
      for (const pid in projectMembersData) {
        const projectData = projectMembersData[pid];
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
    }
  }
  
  return false;
};

const getSubIssuesForUser = (mainIssue, user, projectMembersData) => {
  if (!mainIssue.children || mainIssue.children.length === 0) return [];
  
  return mainIssue.children.filter(subIssue => {
    if (subIssue.assigned_to?.id === user.id) {
      return true;
    }
    
    if (subIssue.assigned_to && subIssue.assigned_to.name) {
      const groupName = extractGroupName(subIssue.assigned_to);
      const isGroup = isGroupAssignment(subIssue.assigned_to) || groupName !== "";
      
      if (isGroup && groupName) {
        const userIdNum = Number(user.id);
        const normalizedGroupName = normalizeGroupName(groupName);
        const searchName = normalizedGroupName.toLowerCase().trim();
        
        if (mainIssue.project?.id && projectMembersData[mainIssue.project.id]) {
          const projectData = projectMembersData[mainIssue.project.id];
          for (const [groupId, groupInfo] of Object.entries(projectData.groups || {})) {
            const normalizedInfoName = normalizeGroupName(groupInfo.name).toLowerCase().trim();
            if (normalizedInfoName.includes(searchName) || searchName.includes(normalizedInfoName)) {
              const numericUserIds = groupInfo.userIds.map(id => Number(id));
              if (numericUserIds.includes(userIdNum)) return true;
            }
          }
        }
        
        for (const pid in projectMembersData) {
          const projectData = projectMembersData[pid];
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
      }
    }
    
    return false;
  });
};

const calculateDetailedTasksPerformance = (usersData, issuesData, period, projectMembersData) => {
  return usersData.map((user) => {
    let totalIssueWeight = 0;
    let totalActualWeight = 0;
    let assignedOneLevelIssuesCount = 0;
    
    issuesData.forEach((mainIssue) => {
      const isAssigned = checkIfUserIsAssigned(mainIssue, user, projectMembersData);
      
      if (isAssigned) {
        const hasValidPeriodValue = period === "Yearly" 
          ? isValidTargetValue(getField(mainIssue, "የዓመቱ እቅድ"), period)
          : period === "6 Months"
          ? (isValidTargetValue(getField(mainIssue, "1ኛ ሩብዓመት"), period) || 
             isValidTargetValue(getField(mainIssue, "2ኛ ሩብዓመት"), period))
          : period === "9 Months"
          ? (isValidTargetValue(getField(mainIssue, "1ኛ ሩብዓመት"), period) || 
             isValidTargetValue(getField(mainIssue, "2ኛ ሩብዓመት"), period) ||
             isValidTargetValue(getField(mainIssue, "3ኛ ሩብዓመት"), period))
          : isValidTargetValue(getField(mainIssue, period), period);
        
        if (hasValidPeriodValue) {
          assignedOneLevelIssuesCount++;
          const issueWeight = getWeight(mainIssue);
          totalIssueWeight += issueWeight;
          
          const subIssues = getSubIssuesForUser(mainIssue, user, projectMembersData);
          
          if (subIssues.length > 0) {
            let totalMappedDonePercent = 0;
            let validSubIssuesCount = 0;
            
            subIssues.forEach(sub => {
              const rawDonePercent = sub.done_ratio || 0;
              const mappedDonePercent = mapSubIssueProgress(rawDonePercent, period, sub);
              
              if (period === "Yearly") {
                totalMappedDonePercent += mappedDonePercent;
                validSubIssuesCount++;
              } else if (period.includes("ሩብዓመት")) {
                if (hasValidQuarterValue(sub, period)) {
                  totalMappedDonePercent += mappedDonePercent;
                  validSubIssuesCount++;
                }
              } else if (period === "6 Months") {
                if (hasValidQuarterValue(sub, "1ኛ ሩብዓመት") || 
                    hasValidQuarterValue(sub, "2ኛ ሩብዓመት")) {
                  totalMappedDonePercent += mappedDonePercent;
                  validSubIssuesCount++;
                }
              } else if (period === "9 Months") {
                if (hasValidQuarterValue(sub, "1ኛ ሩብዓመት") || 
                    hasValidQuarterValue(sub, "2ኛ ሩብዓመት") ||
                    hasValidQuarterValue(sub, "3ኛ ሩብዓመት")) {
                  totalMappedDonePercent += mappedDonePercent;
                  validSubIssuesCount++;
                }
              }
            });
            
            if (validSubIssuesCount > 0) {
              const avgMappedDonePercent = totalMappedDonePercent / validSubIssuesCount;
              const actualWeight = (issueWeight * avgMappedDonePercent) / 100;
              totalActualWeight += actualWeight;
            }
          }
        }
      }
    });
    
    const performance = totalIssueWeight > 0 
      ? Math.round((totalActualWeight * 100) / totalIssueWeight) 
      : 0;
    
    return {
      id: user.id,
      name: user.name,
      performance: performance,
      totalIssueWeight: totalIssueWeight,
      totalActualWeight: totalActualWeight,
      assignedOneLevelIssuesCount: assignedOneLevelIssuesCount,
      color: getProgressColor(performance)
    };
  });
};

const calculatePersonalPlanPerformance = (usersData, issuesData, period, projectMembersData) => {
  return usersData.map((user) => {
    let userWeight = 0;
    let userMaxWeight = 0;
    const userSubIssues = [];
    let completedIssues = 0;

    issuesData.forEach((mainIssue) => {
      if (mainIssue.children?.length) {
        const assignedSubIssues = mainIssue.children.filter(sub => {
          if (sub.assigned_to?.id === user.id) {
            return true;
          }
          
          if (sub.assigned_to && sub.assigned_to.name) {
            const groupName = extractGroupName(sub.assigned_to);
            const isGroup = isGroupAssignment(sub.assigned_to) || groupName !== "";
            
            if (isGroup && groupName) {
              const userIdNum = Number(user.id);
              const normalizedGroupName = normalizeGroupName(groupName);
              const searchName = normalizedGroupName.toLowerCase().trim();
              
              if (mainIssue.project?.id && projectMembersData[mainIssue.project.id]) {
                const projectData = projectMembersData[mainIssue.project.id];
                for (const [groupId, groupInfo] of Object.entries(projectData.groups || {})) {
                  const normalizedInfoName = normalizeGroupName(groupInfo.name).toLowerCase().trim();
                  if (normalizedInfoName.includes(searchName) || searchName.includes(normalizedInfoName)) {
                    const numericUserIds = groupInfo.userIds.map(id => Number(id));
                    if (numericUserIds.includes(userIdNum)) return true;
                  }
                }
              }
              
              for (const pid in projectMembersData) {
                const projectData = projectMembersData[pid];
                for (const [groupId, groupInfo] of Object.entries(projectData.groups || {})) {
                  const normalizedInfoName = normalizeGroupName(groupInfo.name).toLowerCase().trim();
                  if (normalizedInfoName.includes(searchName) || searchName.includes(normalizedInfoName)) {
                    const numericUserIds = groupInfo.userIds.map(id => Number(id));
                    if (numericUserIds.includes(userIdNum)) return true;
                  }
                }
              }
            }
          }
          
          return false;
        });
        
        userSubIssues.push(...assignedSubIssues);
      }
    });

    userSubIssues.forEach((sub) => {
      const weight = getWeight(sub);
      const progress = mapProgress(sub.done_ratio || 0, period, sub);
      userWeight += (weight * progress) / 100;
      userMaxWeight += weight;
      if (progress === 100) completedIssues++;
    });

    const performance = userMaxWeight > 0 ? Math.round((userWeight / userMaxWeight) * 100) : 0;

    return {
      id: user.id || 0,
      name: user.name || "Unknown User",
      login: user.login || "",
      performance: performance,
      rawPerformance: userWeight || 0,
      maxWeight: userMaxWeight || 0,
      issues: userSubIssues,
      completedIssues: completedIssues || 0,
      totalIssues: userSubIssues.length || 0,
      color: getProgressColor(performance)
    };
  });
};

// ============================
// MAIN COMPONENT
// ============================
function TeamLeaderDashboard() {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewList, setViewList] = useState(null);
  const [groupUsers, setGroupUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [userPerformanceData, setUserPerformanceData] = useState([]);
  const [detailedTasksPerformanceData, setDetailedTasksPerformanceData] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedUserIssues, setSelectedUserIssues] = useState([]);
  const [selectedUserDetailedData, setSelectedUserDetailedData] = useState(null);
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
    count: 1,
    totalIssueWeight: 0,
    totalActualWeight: 0,
    assignedOneLevelIssuesCount: 0
  });
  const [statuses, setStatuses] = useState([]);
  const [activeTab, setActiveTab] = useState("performance");
  const [searchTerm, setSearchTerm] = useState("");
  
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
  
  const [filterStatus, setFilterStatus] = useState("all");
  const [projectMembers, setProjectMembers] = useState({});
  
  const [selectedGroupMember, setSelectedGroupMember] = useState(null);
  const [groupMemberIssues, setGroupMemberIssues] = useState([]);
  const [groupMemberFilter, setGroupMemberFilter] = useState("all");
  
  const [selectedPersonalCategory, setSelectedPersonalCategory] = useState(null);
  const [personalCategoryIssues, setPersonalCategoryIssues] = useState([]);

  const [selectedPersonalSubIssues, setSelectedPersonalSubIssues] = useState([]);
  const [selectedMainIssue, setSelectedMainIssue] = useState(null);
  
  const groupDetailsCache = useRef({});

  const isUserInGroupByName = useCallback((userId, groupName, projectId = null) => {
    if (!groupName || !userId) {
      return false;
    }
    
    const userIdNum = Number(userId);
    const normalizedGroupName = normalizeGroupName(groupName);
    const searchName = normalizedGroupName.toLowerCase().trim();
    
    if (projectId && projectMembers[projectId]) {
      const projectData = projectMembers[projectId];
      
      for (const [groupId, groupInfo] of Object.entries(projectData.groups || {})) {
        const normalizedInfoName = normalizeGroupName(groupInfo.name).toLowerCase().trim();
        if (normalizedInfoName.includes(searchName) || searchName.includes(normalizedInfoName)) {
          const numericUserIds = groupInfo.userIds.map(id => Number(id));
          if (numericUserIds.includes(userIdNum)) return true;
        }
      }
    }
    
    for (const pid in projectMembers) {
      const projectData = projectMembers[pid];
      
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

  const isUserInGroupGlobalByName = useCallback((userId, groupName) => {
    if (!userId || !groupName) {
      return false;
    }
    
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

  const getGroupMemberIssues = useCallback((memberId, filterType = "all") => {
    if (!memberId) return [];
    
    const memberIdNum = Number(memberId);
    let result = [];
    
    for (const issue of issues) {
      if (!issue.assigned_to) continue;
      
      let includeIssue = false;
      
      if (issue.assigned_to.id === memberIdNum) {
        if (filterType === "all" || filterType === "direct") {
          includeIssue = true;
        }
      }
      
      if (!includeIssue && issue.assigned_to.name) {
        const groupName = extractGroupName(issue.assigned_to);
        const isGroup = isGroupAssignment(issue.assigned_to) || groupName !== "";
        
        if (isGroup && groupName) {
          let isMember = false;
          
          if (issue.project?.id) {
            isMember = isUserInGroupByName(memberIdNum, groupName, issue.project.id);
          }
          
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
    
    return result;
  }, [issues, isUserInGroupByName, isUserInGroupGlobalByName]);

  const filteredIssues = useMemo(() => {
    let filtered = issues;
    
    if (activeTab === "performance" || activeTab === "analytics") {
      filtered = filterIssuesByPeriod(filtered, selectedPeriod);
      
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

  const currentPerformanceData = useMemo(() => {
    return calculatePersonalPlanPerformance(groupUsers, issues, selectedPeriod, projectMembers);
  }, [groupUsers, issues, selectedPeriod, projectMembers]);

  const currentDetailedTasksPerformanceData = useMemo(() => {
    return calculateDetailedTasksPerformance(groupUsers, issues, selectedPeriod, projectMembers);
  }, [groupUsers, issues, selectedPeriod, projectMembers]);

  useEffect(() => {
    if (currentDetailedTasksPerformanceData.length > 0) {
      const maxPerformance = Math.max(...currentDetailedTasksPerformanceData.map(user => user.performance || 0));
      const bestPerformers = currentDetailedTasksPerformanceData.filter(user => (user.performance || 0) === maxPerformance);
      
      if (bestPerformers.length > 0) {
        const compositeBestPerformer = {
          name: bestPerformers.length === 1 
            ? bestPerformers[0].name 
            : bestPerformers.map(u => u.name).join(', '),
          performance: maxPerformance,
          totalIssueWeight: bestPerformers.reduce((sum, user) => sum + (user.totalIssueWeight || 0), 0) / bestPerformers.length,
          totalActualWeight: bestPerformers.reduce((sum, user) => sum + (user.totalActualWeight || 0), 0) / bestPerformers.length,
          assignedOneLevelIssuesCount: bestPerformers.reduce((sum, user) => sum + (user.assignedOneLevelIssuesCount || 0), 0),
          rawPerformance: bestPerformers.reduce((sum, user) => sum + (user.totalActualWeight || 0), 0) / bestPerformers.length,
          maxWeight: bestPerformers.reduce((sum, user) => sum + (user.totalIssueWeight || 0), 0) / bestPerformers.length,
          completedIssues: 0,
          totalIssues: bestPerformers.reduce((sum, user) => sum + (user.assignedOneLevelIssuesCount || 0), 0),
          isMultiple: bestPerformers.length > 1,
          count: bestPerformers.length,
          id: null,
          login: "",
          issues: [],
          color: bestPerformers.length === 1 ? getProgressColor(maxPerformance) : "#2e7d32"
        };
        setBestPerformer(compositeBestPerformer);
      } else {
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
          count: 1,
          totalIssueWeight: 0,
          totalActualWeight: 0,
          assignedOneLevelIssuesCount: 0
        });
      }
    } else {
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
        count: 1,
        totalIssueWeight: 0,
        totalActualWeight: 0,
        assignedOneLevelIssuesCount: 0
      });
    }
  }, [currentDetailedTasksPerformanceData]);

  const chartData = useMemo(() => 
    filteredIssues.map(issue => ({
      id: issue.id,
      name: truncateText(issue.subject, 15),
      done_ratio: mapProgress(issue.done_ratio || 0, selectedPeriod, issue),
      start_date: formatDate(issue.start_date),
      due_date: formatDate(issue.due_date),
      status: issue.status?.name,
      priority: issue.priority?.name,
      project: issue.project?.name,
      color: getProgressColor(mapProgress(issue.done_ratio || 0, selectedPeriod, issue))
    })), 
  [filteredIssues, selectedPeriod]);

  const selectedUserTableData = useMemo(() => {
    if (!selectedUser || !selectedUser.issues || selectedUser.issues.length === 0) return [];
    
    const data = selectedUser.issues.map(issue => {
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
        project: issue.project?.name || "N/A",
        hasValidTarget: isValidTargetValue(targetValue, selectedPeriod)
      };
    });
    
    return data.filter(row => row.hasValidTarget);
  }, [selectedUser, selectedPeriod]);

  const analyticsTableData = useMemo(() => {
    if (filteredIssues.length === 0) return [];
    
    const data = filteredIssues.map(issue => {
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
        project: issue.project?.name || "N/A",
        assignedTo: issue.assigned_to?.name || "Unassigned",
        hasValidTarget: isValidTargetValue(targetValue, selectedPeriod)
      };
    });
    
    return data.filter(row => row.hasValidTarget);
  }, [filteredIssues, selectedPeriod]);

  const totalPersonalTasks = useMemo(() => {
    let count = 0;
    issues.forEach(issue => {
      if (issue.children?.length) {
        count += issue.children.length;
      }
    });
    return count;
  }, [issues]);

  const totalIssuesWithPersonalTasks = useMemo(() => {
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

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      groupDetailsCache.current = {};

      const currentUserData = await getCurrentUser();
      if (!currentUserData || !currentUserData.id) {
        throw new Error("Failed to load user data");
      }
      
      setCurrentUser(currentUserData);

      let groupUsersData = [];
      try {
        if (currentUserData.login) {
          groupUsersData = await getUsersInGroup(currentUserData.login);
        }
      } catch (groupError) {
        console.error("Failed to get group users:", groupError);
      }

      let issuesData = [];
      let projectMembersData = {};
      
      try {
        issuesData = await getWatchedOneLevelIssues();
        
        const filteredIssues = issuesData.filter(issue => {
          if (!issue.parent) return false;
          return true;
        });
        
        issuesData = filteredIssues;
        
        const projectIds = [...new Set(
          issuesData
            .map(issue => issue.project?.id)
            .filter(Boolean)
        )];
        
        projectMembersData = {};
        
        for (const projectId of projectIds) {
          try {
            const members = await getProjectMembers(projectId);
            
            const projectData = {
              groups: {},
              users: []
            };
            
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

      const uniqueStatuses = Array.from(
        new Map(
          issuesData
            .filter(issue => issue.status)
            .map(issue => [issue.status.id, issue.status])
        ).values()
      );
      setStatuses(uniqueStatuses);

      // Calculate performance data for the initial period (Yearly)
      const initialPeriod = "Yearly";
      const performance = calculatePersonalPlanPerformance(groupUsersData, issuesData, initialPeriod, projectMembersData);
      setUserPerformanceData(performance);
      
      const detailedTasksPerformance = calculateDetailedTasksPerformance(groupUsersData, issuesData, initialPeriod, projectMembersData);
      setDetailedTasksPerformanceData(detailedTasksPerformance);

    } catch (err) {
      console.error("Failed to load dashboard data:", err);
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, [getCachedGroupDetails]); // Removed selectedPeriod from dependencies

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePeriodChange = useCallback((newPeriod) => {
    setSelectedPeriod(newPeriod);
  }, []);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    try {
      groupDetailsCache.current = {};
      await loadData();
    } finally {
      setLoading(false);
    }
  }, [loadData]);

  const handleUserSelect = useCallback((user) => {
    const userPersonalData = currentPerformanceData.find(u => u.id === user.id);
    const userDetailedData = currentDetailedTasksPerformanceData.find(u => u.id === user.id);
    
    setSelectedUser(userPersonalData || user);
    setSelectedUserDetailedData(userDetailedData);
    
    if (userPersonalData) {
      setSelectedUserIssues(userPersonalData.issues || []);
    }
  }, [currentPerformanceData, currentDetailedTasksPerformanceData]);

  const handleGroupMemberSelect = useCallback((member) => {
    setSelectedGroupMember(member);
    const issues = getGroupMemberIssues(member.id, groupMemberFilter);
    setGroupMemberIssues(issues);
    setSelectedPersonalCategory(null);
    setPersonalCategoryIssues([]);
    setSelectedMainIssue(null);
    setSelectedPersonalSubIssues([]);
  }, [getGroupMemberIssues, groupMemberFilter]);

  const handleGroupMemberFilterChange = useCallback((filterType) => {
    setGroupMemberFilter(filterType);
    if (selectedGroupMember) {
      const issues = getGroupMemberIssues(selectedGroupMember.id, filterType);
      setGroupMemberIssues(issues);
      setSelectedPersonalCategory(null);
      setPersonalCategoryIssues([]);
      setSelectedMainIssue(null);
      setSelectedPersonalSubIssues([]);
    }
  }, [selectedGroupMember, getGroupMemberIssues]);

  const personalPlanCategorizedIssues = useMemo(() => {
    const withSubIssues = [];
    const withoutSubIssues = [];
    
    groupMemberIssues.forEach(issue => {
      const assignedSubIssues = (issue.children || []).filter(sub => {
        if (sub.assigned_to?.id === selectedGroupMember?.id) {
          return true;
        }
        
        if (sub.assigned_to && sub.assigned_to.name) {
          const groupName = extractGroupName(sub.assigned_to);
          const isGroup = isGroupAssignment(sub.assigned_to) || groupName !== "";
          
          if (isGroup && groupName) {
            let isMember = false;
            
            if (issue.project?.id) {
              isMember = isUserInGroupByName(selectedGroupMember?.id, groupName, issue.project.id);
            }
            
            if (!isMember) {
              isMember = isUserInGroupGlobalByName(selectedGroupMember?.id, groupName);
            }
            
            return isMember;
          }
        }
        
        return false;
      });
      
      if (assignedSubIssues.length > 0) {
        withSubIssues.push(issue);
      } else {
        withoutSubIssues.push(issue);
      }
    });
    
    return { withSubIssues, withoutSubIssues };
  }, [groupMemberIssues, selectedGroupMember, isUserInGroupByName, isUserInGroupGlobalByName]);

  const handlePersonalCategorySelect = useCallback((category) => {
    setSelectedPersonalCategory(category);
    if (category === 'withSubIssues') {
      setPersonalCategoryIssues(personalPlanCategorizedIssues.withSubIssues);
    } else if (category === 'withoutSubIssues') {
      setPersonalCategoryIssues(personalPlanCategorizedIssues.withoutSubIssues);
    }
    setSelectedMainIssue(null);
    setSelectedPersonalSubIssues([]);
  }, [personalPlanCategorizedIssues]);

  const handleBackFromPersonalCategory = useCallback(() => {
    setSelectedPersonalCategory(null);
    setPersonalCategoryIssues([]);
    setSelectedMainIssue(null);
    setSelectedPersonalSubIssues([]);
  }, []);

  const handleMainIssueSelect = useCallback((issue) => {
    setSelectedMainIssue(issue);
    const assignedSubIssues = (issue.children || []).filter(sub => {
      if (sub.assigned_to?.id === selectedGroupMember.id) {
        return true;
      }
      
      if (sub.assigned_to && sub.assigned_to.name) {
        const groupName = extractGroupName(sub.assigned_to);
        const isGroup = isGroupAssignment(sub.assigned_to) || groupName !== "";
        
        if (isGroup && groupName) {
          let isMember = false;
          
          if (issue.project?.id) {
            isMember = isUserInGroupByName(selectedGroupMember.id, groupName, issue.project.id);
          }
          
          if (!isMember) {
            isMember = isUserInGroupGlobalByName(selectedGroupMember.id, groupName);
          }
          
          return isMember;
        }
      }
      
      return false;
    });
    setSelectedPersonalSubIssues(assignedSubIssues);
  }, [selectedGroupMember, isUserInGroupByName, isUserInGroupGlobalByName]);

  const handleBackFromSubIssues = useCallback(() => {
    setSelectedMainIssue(null);
    setSelectedPersonalSubIssues([]);
  }, []);

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
            <strong>Completed Tasks:</strong> {(data.completedIssues || 0)} / {(data.totalIssues || 0)}
          </p>
          <p style={{ marginBottom: '3px' }}>
            <strong>Weight Progress:</strong> {(data.rawPerformance || 0).toFixed(1)} / {(data.maxWeight || 0).toFixed(1)}
          </p>
          <p style={{ fontSize: '11px', color: '#666', marginTop: '5px', paddingTop: '5px', borderTop: '1px solid #eee' }}>
            <strong>Period:</strong> {selectedPeriod}
          </p>
        </div>
      );
    }
    return null;
  };

  const DetailedTasksPerformanceTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="custom-tooltip" style={{
          backgroundColor: '#fff',
          padding: '10px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
          minWidth: '300px'
        }}>
          <p style={{ fontWeight: 'bold', marginBottom: '8px', borderBottom: '1px solid #eee', paddingBottom: '5px' }}>
            {label}
          </p>
          <p style={{ marginBottom: '5px' }}>
            <strong>ዝርዝር ተግባራት Performance:</strong> {(data.performance || 0)}%
          </p>
          <p style={{ marginBottom: '5px' }}>
            <strong>Assigned ዝርዝር ተግባራት:</strong> {data.assignedOneLevelIssuesCount || 0}
          </p>
          <p style={{ marginBottom: '5px' }}>
            <strong>Weight Calculation:</strong>
          </p>
          <p style={{ fontSize: '11px', color: '#666', marginBottom: '3px' }}>
            Total Issue Weight: {data.totalIssueWeight?.toFixed(1) || 0}
          </p>
          <p style={{ fontSize: '11px', color: '#666' }}>
            Total Actual Weight: {data.totalActualWeight?.toFixed(1) || 0}
          </p>
          <p style={{ marginBottom: '5px' }}>
            <strong>Period:</strong> {selectedPeriod}
            {selectedPeriod.includes("ሩብዓመት") && ` (Quarter ${getQuarterIndex(selectedPeriod)})`}
          </p>
          <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #eee', fontSize: '11px' }}>
            <p style={{ marginBottom: '2px', color: '#888' }}>
              <strong>Calculation:</strong>
            </p>
            <p style={{ marginBottom: '2px', color: '#666' }}>
              1. ∑(Issue Weight × Avg Sub-Issue Progress) ÷ ∑Issue Weight
            </p>
            <p style={{ marginBottom: '0', color: '#666' }}>
              2. Sub-issues use their OWN quarter values for progress mapping
            </p>
          </div>
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
      
      {/* Header */}
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
              if (tab !== 'performance') {
                setSelectedUser(null);
                setSelectedUserDetailedData(null);
              }
              if (tab === 'personal-plan') {
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

      {/* Period Info Banner */}
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
            <div style={{ fontSize: "16px", marginTop: "5px", opacity: 0.9 }}>
              Based on Performance based on assigned ዝርዝር ተግባራት
              {bestPerformer.isMultiple && ` (${bestPerformer.count} users tied for first place)`}
            </div>
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
              <div style={{ fontSize: "14px", opacity: 0.9 }}>ዝርዝር ተግባራት Performance</div>
              <div style={{ fontSize: "28px", fontWeight: "bold" }}>{(bestPerformer.performance || 0).toFixed(0)}%</div>
            </div>
            <div>
              <div style={{ fontSize: "14px", opacity: 0.9 }}>Assigned ዝርዝር ተግባራት</div>
              <div style={{ fontSize: "28px", fontWeight: "bold" }}>
                {(bestPerformer.assignedOneLevelIssuesCount || 0)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "14px", opacity: 0.9 }}>Weight Calculation</div>
              <div style={{ fontSize: "28px", fontWeight: "bold" }}>
                {(bestPerformer.totalActualWeight || 0).toFixed(1)}/{(bestPerformer.totalIssueWeight || 0).toFixed(1)}
              </div>
            </div>
          </div>
          <div style={{ marginTop: '15px', fontSize: '12px', opacity: 0.8 }}>
            <div>Period: {selectedPeriod}</div>
            <div style={{ marginTop: '5px' }}>
              Formula: (∑Actual Weight × 100) ÷ ∑Issue Weight
            </div>
            {selectedPeriod.includes("ሩብዓመት") && (
              <div style={{ marginTop: '3px', fontSize: '11px' }}>
                Sub-issues use their OWN quarter values for progress mapping
              </div>
            )}
          </div>
        </div>
      )}

      {/* Performance Tab */}
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
          
          {/* DUAL CHART LAYOUT */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '20px',
            marginBottom: '40px'
          }}>
            <div style={{ flex: '1 1 60%', minWidth: '300px', height: '450px' }}>
              <div style={{ 
                backgroundColor: '#fff', 
                padding: '15px', 
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                height: '100%'
              }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#333' }}>
                  Performance based on assigned የግል እቅድ
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
            
            <div style={{ flex: '1 1 35%', minWidth: '300px', height: '450px' }}>
              <div style={{ 
                backgroundColor: '#fff', 
                padding: '15px', 
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                height: '100%'
              }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#333' }}>
                  Performance based on assigned ዝርዝር ተግባራት
                </h3>
                {currentDetailedTasksPerformanceData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="85%">
                    <BarChart 
                      data={currentDetailedTasksPerformanceData} 
                      margin={{ top: 20, right: 30, left: 0, bottom: 80 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="name" 
                        tick={{ fontSize: 11 }}
                        interval={0}
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis 
                        domain={[0, 100]} 
                        unit="%" 
                        tickFormatter={(value) => `${value}%`}
                        width={40}
                      />
                      <Tooltip content={<DetailedTasksPerformanceTooltip />} />
                      <Legend />
                      <Bar
                        dataKey="performance"
                        name="ዝርዝር ተግባራት Performance %"
                        cursor="pointer"
                        onClick={(data) => handleUserSelect(data)}
                      >
                        {currentDetailedTasksPerformanceData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color || "#f44336"} />
                        ))}
                        <LabelList 
                          dataKey="performance" 
                          position="top" 
                          formatter={(val) => `${(val || 0).toFixed(0)}%`}
                          style={{ fontSize: '10px' }}
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
                    fontSize: '16px',
                    flexDirection: 'column'
                  }}>
                    <div style={{ fontSize: '48px', marginBottom: '10px', opacity: 0.5 }}>
                      📊
                    </div>
                    <div>No ዝርዝር ተግባራት performance data</div>
                    <div style={{ fontSize: '12px', color: '#888', marginTop: '5px' }}>
                      (Calculating based on 1-level hierarchy issues)
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* UPDATED: Team Member Cards Grid - Now shows group users with performance data */}
          <div style={{
            marginBottom: '40px'
          }}>
            <h3 style={{ marginBottom: '20px', color: '#333' }}>
              Team Members Performance ({selectedPeriod})
              <span style={{ fontSize: '14px', color: '#666', marginLeft: '10px', fontWeight: 'normal' }}>
                Click on any card to view detailed information
              </span>
            </h3>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '20px'
            }}>
              {groupUsers.map(user => {
                // Find performance data for this user
                const personalPlanData = currentPerformanceData.find(u => u.id === user.id);
                const detailedTasksData = currentDetailedTasksPerformanceData.find(u => u.id === user.id);
                
                // Get combined performance (average of both metrics if both exist)
                let combinedPerformance = 0;
                let performanceCount = 0;
                
                if (personalPlanData && personalPlanData.performance > 0) {
                  combinedPerformance += personalPlanData.performance;
                  performanceCount++;
                }
                
                if (detailedTasksData && detailedTasksData.performance > 0) {
                  combinedPerformance += detailedTasksData.performance;
                  performanceCount++;
                }
                
                const avgPerformance = performanceCount > 0 ? Math.round(combinedPerformance / performanceCount) : 0;
                const displayPerformance = performanceCount > 0 ? avgPerformance : (personalPlanData?.performance || 0);
                const performanceColor = getProgressColor(displayPerformance);
                
                return (
                  <div
                    key={user.id}
                    onClick={() => handleUserSelect(user)}
                    style={{
                      padding: '20px',
                      backgroundColor: '#fff',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                      border: '2px solid #e0e0e0',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#1976d2';
                      e.currentTarget.style.boxShadow = '0 8px 20px rgba(25, 118, 210, 0.2)';
                      e.currentTarget.style.transform = 'translateY(-4px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e0e0e0';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    {/* Performance badge */}
                    <div style={{
                      position: 'absolute',
                      top: '15px',
                      right: '15px',
                      backgroundColor: performanceColor,
                      color: 'white',
                      padding: '6px 12px',
                      borderRadius: '20px',
                      fontWeight: 'bold',
                      fontSize: '14px',
                      minWidth: '60px',
                      textAlign: 'center'
                    }}>
                      {displayPerformance}%
                    </div>
                    
                    {/* User avatar/icon */}
                    <div style={{
                      width: '60px',
                      height: '60px',
                      backgroundColor: '#1976d2',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '24px',
                      fontWeight: 'bold',
                      marginBottom: '15px'
                    }}>
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    
                    {/* User name */}
                    <h3 style={{ 
                      margin: '0 0 10px 0', 
                      fontSize: '18px', 
                      fontWeight: 'bold',
                      color: '#333'
                    }}>
                      {user.name}
                    </h3>
                    
                    {/* User login/id */}
                    <div style={{
                      fontSize: '13px',
                      color: '#666',
                      marginBottom: '20px'
                    }}>
                      <div>
                        <strong>ID:</strong> {user.id}
                      </div>
                      {user.login && (
                        <div>
                          <strong>Login:</strong> {user.login}
                        </div>
                      )}
                    </div>
                    
                    {/* Performance metrics */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: '10px',
                      marginTop: '15px'
                    }}>
                      {/* Personal Plan Performance */}
                      <div style={{
                        padding: '10px',
                        backgroundColor: '#f8f9fa',
                        borderRadius: '8px',
                        textAlign: 'center'
                      }}>
                        <div style={{ fontSize: '11px', color: '#666', marginBottom: '5px' }}>
                          የግል እቅድ
                        </div>
                        <div style={{ 
                          fontSize: '18px', 
                          fontWeight: 'bold',
                          color: personalPlanData?.color || '#666'
                        }}>
                          {personalPlanData?.performance || 0}%
                        </div>
                        <div style={{ fontSize: '10px', color: '#888', marginTop: '3px' }}>
                          {personalPlanData?.completedIssues || 0}/{personalPlanData?.totalIssues || 0} tasks
                        </div>
                      </div>
                      
                      {/* Detailed Tasks Performance */}
                      <div style={{
                        padding: '10px',
                        backgroundColor: '#f8f9fa',
                        borderRadius: '8px',
                        textAlign: 'center'
                      }}>
                        <div style={{ fontSize: '11px', color: '#666', marginBottom: '5px' }}>
                          ዝርዝር ተግባራት
                        </div>
                        <div style={{ 
                          fontSize: '18px', 
                          fontWeight: 'bold',
                          color: detailedTasksData?.color || '#666'
                        }}>
                          {detailedTasksData?.performance || 0}%
                        </div>
                        <div style={{ fontSize: '10px', color: '#888', marginTop: '3px' }}>
                          {detailedTasksData?.assignedOneLevelIssuesCount || 0} issues
                        </div>
                      </div>
                    </div>
                    
                    {/* Click indicator */}
                    <div style={{
                      marginTop: '15px',
                      padding: '8px',
                      backgroundColor: '#e3f2fd',
                      borderRadius: '6px',
                      textAlign: 'center',
                      fontSize: '12px',
                      color: '#1976d2',
                      fontWeight: 'bold',
                      border: '1px dashed #1976d2'
                    }}>
                      👆 Click to view detailed information
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Selected User Details View */}
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
              onClick={() => {
                setSelectedUser(null);
                setSelectedUserDetailedData(null);
              }}
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
            <h2 style={{ margin: 0 }}>{selectedUser.name}'s Performance Details ({selectedPeriod})</h2>
            
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '15px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#666' }}>የግል እቅድ Performance</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: selectedUser.color || "#f44336" }}>
                  {(selectedUser.performance || 0).toFixed(0)}%
                </div>
              </div>
              {selectedUserDetailedData && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', color: '#666' }}>ዝርዝር ተግባራት Performance</div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: selectedUserDetailedData.color || "#1976d2" }}>
                    {(selectedUserDetailedData.performance || 0).toFixed(0)}%
                  </div>
                </div>
              )}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#666' }}>Completion Rate</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                  {(selectedUser.completedIssues || 0)}/{(selectedUser.totalIssues || 0)}
                </div>
              </div>
            </div>
          </div>

          {/* Combined Performance Overview */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '20px',
            marginBottom: '30px'
          }}>
            {/* Personal Plan Performance Card */}
            <div style={{
              padding: '20px',
              backgroundColor: '#fff',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              borderLeft: `4px solid ${selectedUser.color || "#f44336"}`
            }}>
              <h3 style={{ marginBottom: '15px', color: '#333' }}>
                የግል እቅድ Performance
              </h3>
              <div style={{ marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ fontSize: '14px', color: '#666' }}>Overall Performance:</span>
                  <span style={{ fontSize: '16px', fontWeight: 'bold', color: selectedUser.color }}>
                    {selectedUser.performance}%
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ fontSize: '14px', color: '#666' }}>Completed Tasks:</span>
                  <span style={{ fontSize: '16px', fontWeight: 'bold' }}>
                    {selectedUser.completedIssues}/{selectedUser.totalIssues}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ fontSize: '14px', color: '#666' }}>Weight Progress:</span>
                  <span style={{ fontSize: '16px', fontWeight: 'bold' }}>
                    {selectedUser.rawPerformance?.toFixed(1) || 0}/{selectedUser.maxWeight?.toFixed(1) || 0}
                  </span>
                </div>
              </div>
              
              {/* Progress Bar */}
              <div style={{ marginTop: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ fontSize: '12px', color: '#666' }}>Progress</span>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: selectedUser.color }}>
                    {selectedUser.performance}%
                  </span>
                </div>
                <div style={{
                  width: "100%",
                  backgroundColor: "#e0e0e0",
                  borderRadius: "8px",
                  overflow: "hidden",
                  height: "10px",
                }}>
                  <div
                    style={{
                      width: `${selectedUser.performance || 0}%`,
                      backgroundColor: selectedUser.color,
                      height: "100%",
                    }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Detailed Tasks Performance Card */}
            {selectedUserDetailedData && (
              <div style={{
                padding: '20px',
                backgroundColor: '#fff',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                borderLeft: `4px solid ${selectedUserDetailedData.color || "#1976d2"}`
              }}>
                <h3 style={{ marginBottom: '15px', color: '#333' }}>
                  ዝርዝር ተግባራት Performance
                </h3>
                <div style={{ marginBottom: '15px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span style={{ fontSize: '14px', color: '#666' }}>Overall Performance:</span>
                    <span style={{ fontSize: '16px', fontWeight: 'bold', color: selectedUserDetailedData.color }}>
                      {selectedUserDetailedData.performance}%
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span style={{ fontSize: '14px', color: '#666' }}>Assigned Issues:</span>
                    <span style={{ fontSize: '16px', fontWeight: 'bold' }}>
                      {selectedUserDetailedData.assignedOneLevelIssuesCount}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span style={{ fontSize: '14px', color: '#666' }}>Weight Calculation:</span>
                    <span style={{ fontSize: '16px', fontWeight: 'bold' }}>
                      {selectedUserDetailedData.totalActualWeight?.toFixed(1) || 0}/{selectedUserDetailedData.totalIssueWeight?.toFixed(1) || 0}
                    </span>
                  </div>
                </div>
                
                {/* Progress Bar */}
                <div style={{ marginTop: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span style={{ fontSize: '12px', color: '#666' }}>Progress</span>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: selectedUserDetailedData.color }}>
                      {selectedUserDetailedData.performance}%
                    </span>
                  </div>
                  <div style={{
                    width: "100%",
                    backgroundColor: "#e0e0e0",
                    borderRadius: "8px",
                    overflow: "hidden",
                    height: "10px",
                  }}>
                    <div
                      style={{
                        width: `${selectedUserDetailedData.performance || 0}%`,
                        backgroundColor: selectedUserDetailedData.color,
                        height: "100%",
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* የግል እቅድ Progress Chart */}
          {selectedUserIssues.length > 0 && (
            <div style={{ marginBottom: '40px' }}>
              <h3 style={{ marginBottom: '20px', color: '#333' }}>
                የግል እቅድ Progress ({selectedPeriod})
                <span style={{ fontSize: '14px', color: '#666', marginLeft: '10px', fontWeight: 'normal' }}>
                  {selectedUserIssues.length} የግል እቅድ
                </span>
              </h3>
              <div style={{ width: "100%", height: "400px" }}>
                <ResponsiveContainer width="100%" height="100%" minHeight={300}>
                  <BarChart 
                    data={selectedUserIssues.map(issue => ({
                      id: issue.id,
                      name: truncateText(issue.subject, 15),
                      done_ratio: mapProgress(issue.done_ratio || 0, selectedPeriod, issue),
                      color: getProgressColor(mapProgress(issue.done_ratio || 0, selectedPeriod, issue))
                    }))} 
                    margin={{ top: 20, bottom: 80 }}
                  >
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
                      {selectedUserIssues.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={getProgressColor(mapProgress(entry.done_ratio || 0, selectedPeriod, entry))} 
                        />
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
            </div>
          )}

          {/* Details Table */}
          <div style={{ marginTop: '40px' }}>
            <h3 style={{ marginBottom: '20px', color: '#333' }}>
              Performance Details Table ({selectedPeriod})
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
                  No performance data available for {selectedPeriod}
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
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Issues Tab */}
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
                        
                        <h4 style={{ 
                          margin: '0 0 15px 0', 
                          fontSize: '16px',
                          lineHeight: '1.4',
                          fontWeight: 'bold'
                        }}>
                          {issue.subject}
                        </h4>
                        
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

      {/* Analytics Tab */}
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
                </div>
              )}
            </div>
            
            {/* Table for Analytics Dashboard */}
            <div style={{ marginTop: '40px' }}>
              <h3 style={{ marginBottom: '20px', color: '#333' }}>
                ዝርዝር ተግባራት Analysis Table ({selectedPeriod})
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
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Personal Plan Track Tab */}
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

          {/* Group Member Selection */}
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
                              const assignedSubIssuesCount = (issue.children || []).filter(sub => {
                                if (sub.assigned_to?.id === selectedGroupMember?.id) return true;
                                
                                if (sub.assigned_to && sub.assigned_to.name) {
                                  const groupName = extractGroupName(sub.assigned_to);
                                  const isGroup = isGroupAssignment(sub.assigned_to) || groupName !== "";
                                  
                                  if (isGroup && groupName) {
                                    let isMember = false;
                                    
                                    if (issue.project?.id) {
                                      isMember = isUserInGroupByName(selectedGroupMember?.id, groupName, issue.project.id);
                                    }
                                    
                                    if (!isMember) {
                                      isMember = isUserInGroupGlobalByName(selectedGroupMember?.id, groupName);
                                    }
                                    
                                    return isMember;
                                  }
                                }
                                
                                return false;
                              }).length;
                              return total + assignedSubIssuesCount;
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

              {/* Category Details View for withSubIssues */}
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
                        {selectedGroupMember.name} doesn't have any የግል እቅድ assigned to them
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
                        const assignedSubIssuesCount = (issue.children || []).filter(sub => {
                          if (sub.assigned_to?.id === selectedGroupMember.id) return true;
                          
                          if (sub.assigned_to && sub.assigned_to.name) {
                            const groupName = extractGroupName(sub.assigned_to);
                            const isGroup = isGroupAssignment(sub.assigned_to) || groupName !== "";
                            
                            if (isGroup && groupName) {
                              let isMember = false;
                              
                              if (issue.project?.id) {
                                isMember = isUserInGroupByName(selectedGroupMember.id, groupName, issue.project.id);
                              }
                              
                              if (!isMember) {
                                isMember = isUserInGroupGlobalByName(selectedGroupMember.id, groupName);
                              }
                              
                              return isMember;
                            }
                          }
                          
                          return false;
                        }).length;
                        
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
                            {assignedSubIssuesCount > 0 && (
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
                                📋 {assignedSubIssuesCount} የግል እቅድ
                              </div>
                            )}
                            
                            <div style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'flex-start',
                              marginBottom: '15px',
                              marginTop: assignedSubIssuesCount > 0 ? '25px' : '0'
                            }}>
                              <div style={{ flex: 1 }}>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: '16px', lineHeight: '1.4', fontWeight: 'bold' }}>
                                  {issue.subject}
                                </h4>
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
                              Click to view {assignedSubIssuesCount} የግል እቅድ →
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Sub-issues View */}
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
                        This user doesn't have any የግል እቅድ assigned to them within this issue
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
                      <div style={{
                        backgroundColor: '#2196f3',
                        color: 'white',
                        padding: '6px 12px',
                        borderRadius: '4px',
                        fontWeight: 'bold',
                        fontSize: '14px'
                      }}>
                        📝 No የግል እቅድ
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
                        📝
                      </div>
                      <p style={{ fontSize: '18px', marginBottom: '10px', fontWeight: 'bold' }}>
                        No ዝርዝር ተግባራት in this category
                      </p>
                      <p style={{ fontSize: '14px', color: '#888' }}>
                        All of {selectedGroupMember.name}'s assigned issues have የግል እቅድ assigned to them
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
                        
                        return (
                          <div
                            key={issue.id}
                            style={{
                              padding: '20px',
                              backgroundColor: 'white',
                              borderRadius: '8px',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                              borderLeft: `4px solid #2196f3`,
                              position: 'relative',
                              transition: 'all 0.3s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = 'translateY(-4px)';
                              e.currentTarget.style.boxShadow = '0 8px 20px rgba(33, 150, 243, 0.2)';
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
          {(activeTab === 'performance' || activeTab === 'analytics') && (
            <>
              *Best Performer based on Performance based on assigned ዝርዝር ተግባራት
              {selectedPeriod.includes("ሩብዓመት") && " • Sub-issues use their OWN quarter values for progress mapping"}
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