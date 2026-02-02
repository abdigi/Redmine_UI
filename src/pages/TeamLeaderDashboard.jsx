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

// ============================
// ACHIEVEMENT FUNCTIONS - NEW
// ============================
const getQuarterAchievement = (issue, quarter) => {
  const achievementFieldMap = {
    "1ኛ ሩብዓመት": "1ኛ ሩብዓመት_አፈጻጸም",
    "2ኛ ሩብዓመት": "2ኛ ሩብዓመት_አፈጻጸም",
    "3ኛ ሩብዓመት": "3ኛ ሩብዓመት_አፈጻጸም",
    "4ኛ ሩብዓመት": "4ኛ ሩብዓመት_አፈጻጸም"
  };
  
  const achievementFieldName = achievementFieldMap[quarter];
  if (!achievementFieldName) return 0;
  
  const achievementValue = getField(issue, achievementFieldName);
  if (!achievementValue || achievementValue === "0" || achievementValue === "") {
    return 0;
  }
  
  const numValue = parseFloat(achievementValue.toString().trim());
  return isNaN(numValue) ? 0 : numValue;
};

const getTotalYearlyAchievement = (issue) => {
  const quarters = ["1ኛ ሩብዓመት", "2ኛ ሩብዓመት", "3ኛ ሩብዓመት", "4ኛ ሩብዓመት"];
  let total = 0;
  
  quarters.forEach(quarter => {
    total += getQuarterAchievement(issue, quarter);
  });
  
  return total;
};

// ============================
// NEW PROGRESS CALCULATION FUNCTIONS
// ============================
const calculateQuarterProgress = (issue, quarter) => {
  // Get quarter target
  const quarterTargetValue = getField(issue, quarter);
  if (!quarterTargetValue || quarterTargetValue === "0" || quarterTargetValue === "") {
    return 0;
  }
  
  const targetNum = parseFloat(quarterTargetValue.toString().trim());
  if (isNaN(targetNum) || targetNum === 0) {
    return 0;
  }
  
  // Get quarter achievement
  const achievement = getQuarterAchievement(issue, quarter);
  
  // Calculate progress: (achievement * 100) / target
  const progress = (achievement / targetNum) * 100;
  
  // Return rounded value, capped at 100
  
  return Math.min(100, Math.round(progress * 100) / 100);
};

const calculateYearlyProgress = (issue) => {
  // Get yearly target
  const yearlyTargetValue = getField(issue, "የዓመቱ እቅድ");
  if (!yearlyTargetValue || yearlyTargetValue === "0" || yearlyTargetValue === "") {
    return 0;
  }
  
  const yearlyTarget = parseFloat(yearlyTargetValue.toString().trim());
  if (isNaN(yearlyTarget) || yearlyTarget === 0) {
    return 0;
  }
  
  // Get total achievement (sum of all quarter achievements)
  const totalAchievement = getTotalYearlyAchievement(issue);
  
  // Calculate progress: (total achievement * 100) / yearly target
  const progress = (totalAchievement / yearlyTarget) * 100;
  
  // Return rounded value, capped at 100
  return Math.min(100, Math.round(progress * 100) / 100);
};

const calculateSixMonthsProgress = (issue) => {
  // For 6 months: Q1 + Q2
  const q1Target = parseFloat((getField(issue, "1ኛ ሩብዓመት") || "0").toString().trim()) || 0;
  const q2Target = parseFloat((getField(issue, "2ኛ ሩብዓመት") || "0").toString().trim()) || 0;
  const totalTarget = q1Target + q2Target;
  
  if (totalTarget === 0) return 0;
  
  const q1Achievement = getQuarterAchievement(issue, "1ኛ ሩብዓመት");
  const q2Achievement = getQuarterAchievement(issue, "2ኛ ሩብዓመት");
  const totalAchievement = q1Achievement + q2Achievement;
  
  const progress = (totalAchievement / totalTarget) * 100;
  return Math.min(100, Math.round(progress * 100) / 100);
};

const calculateNineMonthsProgress = (issue) => {
  // For 9 months: Q1 + Q2 + Q3
  const q1Target = parseFloat((getField(issue, "1ኛ ሩብዓመት") || "0").toString().trim()) || 0;
  const q2Target = parseFloat((getField(issue, "2ኛ ሩብዓመት") || "0").toString().trim()) || 0;
  const q3Target = parseFloat((getField(issue, "3ኛ ሩብዓመት") || "0").toString().trim()) || 0;
  const totalTarget = q1Target + q2Target + q3Target;
  
  if (totalTarget === 0) return 0;
  
  const q1Achievement = getQuarterAchievement(issue, "1ኛ ሩብዓመት");
  const q2Achievement = getQuarterAchievement(issue, "2ኛ ሩብዓመት");
  const q3Achievement = getQuarterAchievement(issue, "3ኛ ሩብዓመት");
  const totalAchievement = q1Achievement + q2Achievement + q3Achievement;
  
  const progress = (totalAchievement / totalTarget) * 100;
  return Math.min(100, Math.round(progress * 100) / 100);
};

// Updated mapProgress function using new calculation logic
const mapProgress = (done, period, issue = null) => {
  if (!issue) return 0;
  
  switch (period) {
    case "1ኛ ሩብዓመት":
      return calculateQuarterProgress(issue, "1ኛ ሩብዓመት");
    case "2ኛ ሩብዓመት":
      return calculateQuarterProgress(issue, "2ኛ ሩብዓመት");
    case "3ኛ ሩብዓመት":
      return calculateQuarterProgress(issue, "3ኛ ሩብዓመት");
    case "4ኛ ሩብዓመት":
      return calculateQuarterProgress(issue, "4ኛ ሩብዓመት");
    case "6 Months":
      return calculateSixMonthsProgress(issue);
    case "9 Months":
      return calculateNineMonthsProgress(issue);
    case "Yearly":
      return calculateYearlyProgress(issue);
    default:
      return 0;
  }
};

// For sub-issues (same logic)
const mapSubIssueProgress = (done, period, subIssue = null) => {
  return mapProgress(done, period, subIssue);
};

// ============================
// TARGET VALUE FUNCTIONS
// ============================
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

// NEW: Check if a sub-issue has valid period value
const hasValidPeriodValue = (issue, period) => {
  if (!issue) return false;
  
  if (period === "Yearly") {
    const yearlyValue = getField(issue, "የዓመቱ እቅድ");
    return yearlyValue && yearlyValue !== "0" && yearlyValue !== "";
  }
  
  if (period === "6 Months") {
    const q1 = getField(issue, "1ኛ ሩብዓመት");
    const q2 = getField(issue, "2ኛ ሩብዓመት");
    return (q1 && q1 !== "0" && q1 !== "") || (q2 && q2 !== "0" && q2 !== "");
  }
  
  if (period === "9 Months") {
    const q1 = getField(issue, "1ኛ ሩብዓመት");
    const q2 = getField(issue, "2ኛ ሩብዓመት");
    const q3 = getField(issue, "3ኛ ሩብዓመት");
    return (q1 && q1 !== "0" && q1 !== "") || 
           (q2 && q2 !== "0" && q2 !== "") || 
           (q3 && q3 !== "0" && q3 !== "");
  }
  
  const val = getField(issue, period);
  return val && val !== "0" && val !== "";
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

// NEW: Get actual achievement value for a period
const getAchievementValue = (issue, period) => {
  if (!issue) return 0;
  
  if (period === "Yearly") {
    return getTotalYearlyAchievement(issue);
  }
  
  if (period === "6 Months") {
    const q1Achievement = getQuarterAchievement(issue, "1ኛ ሩብዓመት");
    const q2Achievement = getQuarterAchievement(issue, "2ኛ ሩብዓመት");
    return q1Achievement + q2Achievement;
  }
  
  if (period === "9 Months") {
    const q1Achievement = getQuarterAchievement(issue, "1ኛ ሩብዓመት");
    const q2Achievement = getQuarterAchievement(issue, "2ኛ ሩብዓመት");
    const q3Achievement = getQuarterAchievement(issue, "3ኛ ሩብዓመት");
    return q1Achievement + q2Achievement + q3Achievement;
  }
  
  // For specific quarters
  return getQuarterAchievement(issue, period);
};

const calculateActualValue = (achievement, targetValue, period) => {
  if (!achievement || !targetValue) return 0;
  const achievementNum = parseFloat(achievement.toString().trim());
  const targetNum = parseFloat(targetValue.toString().trim());
  if (isNaN(achievementNum) || isNaN(targetNum) || targetNum === 0) return 0;
  return achievementNum;
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
// PERFORMANCE CALCULATION FUNCTIONS - UPDATED FOR CONSISTENCY
// ============================

// NEW: Unified performance calculation function that works for both chart and details
const calculateUserPerformance = (user, issues, period, projectMembers) => {
  const userId = Number(user.id);
  let totalWeight = 0;
  let actualWeight = 0;
  let completedIssues = 0;
  let userIssues = [];
  
  // Helper to check if user is assigned to an issue (directly or through group)
  const isUserAssignedToIssue = (issue) => {
    // Check direct assignment
    if (issue.assigned_to?.id === userId) {
      return true;
    }
    
    // Check group assignment
    if (issue.assigned_to && issue.assigned_to.name) {
      const groupName = extractGroupName(issue.assigned_to);
      const isGroup = isGroupAssignment(issue.assigned_to) || groupName !== "";
      
      if (isGroup && groupName) {
        const normalizedGroupName = normalizeGroupName(groupName);
        const searchName = normalizedGroupName.toLowerCase().trim();
        
        if (issue.project?.id && projectMembers[issue.project.id]) {
          const projectData = projectMembers[issue.project.id];
          for (const [groupId, groupInfo] of Object.entries(projectData.groups || {})) {
            const normalizedInfoName = normalizeGroupName(groupInfo.name).toLowerCase().trim();
            if (normalizedInfoName.includes(searchName) || searchName.includes(normalizedInfoName)) {
              const numericUserIds = groupInfo.userIds.map(id => Number(id));
              if (numericUserIds.includes(userId)) return true;
            }
          }
        }
        
        for (const pid in projectMembers) {
          const projectData = projectMembers[pid];
          for (const [groupId, groupInfo] of Object.entries(projectData.groups || {})) {
            const normalizedInfoName = normalizeGroupName(groupInfo.name).toLowerCase().trim();
            if (normalizedInfoName.includes(searchName) || searchName.includes(normalizedInfoName)) {
              const numericUserIds = groupInfo.userIds.map(id => Number(id));
              if (numericUserIds.includes(userId)) return true;
            }
          }
        }
      }
    }
    
    return false;
  };
  
  // Process all issues
  issues.forEach(issue => {
    // Check if this issue has period value
    if (!hasValidPeriodValue(issue, period)) {
      return;
    }
    
    // Check if user is assigned to this issue
    let isAssigned = isUserAssignedToIssue(issue);
    
    // For main issues with children, check sub-issues
    if (issue.children?.length) {
      let hasAssignedSubIssues = false;
      let subIssueWeights = 0;
      let subIssueActualWeights = 0;
      
      issue.children.forEach(subIssue => {
        // Check if sub-issue has period value
        if (!hasValidPeriodValue(subIssue, period)) {
          return;
        }
        
        // Check if user is assigned to sub-issue
        let isSubAssigned = false;
        if (subIssue.assigned_to?.id === userId) {
          isSubAssigned = true;
        } else if (subIssue.assigned_to && subIssue.assigned_to.name) {
          const groupName = extractGroupName(subIssue.assigned_to);
          const isGroup = isGroupAssignment(subIssue.assigned_to) || groupName !== "";
          
          if (isGroup && groupName) {
            const normalizedGroupName = normalizeGroupName(groupName);
            const searchName = normalizedGroupName.toLowerCase().trim();
            
            if (issue.project?.id && projectMembers[issue.project.id]) {
              const projectData = projectMembers[issue.project.id];
              for (const [groupId, groupInfo] of Object.entries(projectData.groups || {})) {
                const normalizedInfoName = normalizeGroupName(groupInfo.name).toLowerCase().trim();
                if (normalizedInfoName.includes(searchName) || searchName.includes(normalizedInfoName)) {
                  const numericUserIds = groupInfo.userIds.map(id => Number(id));
                  if (numericUserIds.includes(userId)) {
                    isSubAssigned = true;
                  }
                }
              }
            }
            
            if (!isSubAssigned) {
              for (const pid in projectMembers) {
                const projectData = projectMembers[pid];
                for (const [groupId, groupInfo] of Object.entries(projectData.groups || {})) {
                  const normalizedInfoName = normalizeGroupName(groupInfo.name).toLowerCase().trim();
                  if (normalizedInfoName.includes(searchName) || searchName.includes(normalizedInfoName)) {
                    const numericUserIds = groupInfo.userIds.map(id => Number(id));
                    if (numericUserIds.includes(userId)) {
                      isSubAssigned = true;
                      break;
                    }
                  }
                }
                if (isSubAssigned) break;
              }
            }
          }
        }
        
        if (isSubAssigned) {
          hasAssignedSubIssues = true;
          const weight = getWeight(subIssue);
          const progress = mapProgress(subIssue.done_ratio || 0, period, subIssue);
          const actual = (weight * progress) / 100;
          
          subIssueWeights += weight;
          subIssueActualWeights += actual;
          
          if (progress === 100) completedIssues++;
          userIssues.push(subIssue);
        }
      });
      
      if (hasAssignedSubIssues) {
        totalWeight += subIssueWeights;
        actualWeight += subIssueActualWeights;
      } else if (isAssigned) {
        // User is assigned to main issue but has no assigned sub-issues
        const weight = getWeight(issue);
        const progress = mapProgress(issue.done_ratio || 0, period, issue);
        const actual = (weight * progress) / 100;
        
        totalWeight += weight;
        actualWeight += actual;
        
        if (progress === 100) completedIssues++;
        userIssues.push(issue);
      }
    } else if (isAssigned) {
      // Main issue without children, user is directly assigned
      const weight = getWeight(issue);
      const progress = mapProgress(issue.done_ratio || 0, period, issue);
      const actual = (weight * progress) / 100;
      
      totalWeight += weight;
      actualWeight += actual;
      
      if (progress === 100) completedIssues++;
      userIssues.push(issue);
    }
  });
  
  // Calculate performance
  const performance = totalWeight > 0 ? Math.round((actualWeight / totalWeight) * 100) : 0;
  
  return {
    id: user.id || 0,
    name: user.name || "Unknown User",
    login: user.login || "",
    performance: performance,
    rawPerformance: actualWeight || 0,
    maxWeight: totalWeight || 0,
    completedIssues: completedIssues || 0,
    totalIssues: userIssues.length || 0,
    issues: userIssues,
    color: getProgressColor(performance)
  };
};

// Updated personal plan performance calculation using the unified function
const calculatePersonalPlanPerformance = (usersData, issuesData, period, projectMembersData) => {
  // First filter issues by period
  const periodIssues = filterIssuesByPeriod(issuesData, period);
  
  return usersData.map((user) => {
    return calculateUserPerformance(user, periodIssues, period, projectMembersData);
  });
};

// FIXED FUNCTION: Calculate period-specific weights
const calculateWeightsForPeriod = (user, issues, period, projectMembers) => {
  let mainIssueWeight = 0;
  let subIssueWeight = 0;
  let totalWeight = 0;
  
  const userId = Number(user.id);
  
  // Helper function to check if a sub-issue has period value
  const subIssueHasPeriodValue = (subIssue, period) => {
    // Check if sub-issue itself has period value
    const subIssuePeriodValue = getTargetValue(subIssue, period);
    if (isValidTargetValue(subIssuePeriodValue, period)) {
      return true;
    }
    
    // Also check if sub-issue has any custom field for this period
    if (period === "Yearly") {
      const yearlyValue = getField(subIssue, "የዓመቱ እቅድ");
      return yearlyValue && yearlyValue !== "0" && yearlyValue !== "";
    } else if (period === "6 Months") {
      const q1 = getField(subIssue, "1ኛ ሩብዓመት");
      const q2 = getField(subIssue, "2ኛ ሩብዓመት");
      return (q1 && q1 !== "0" && q1 !== "") || (q2 && q2 !== "0" && q2 !== "");
    } else if (period === "9 Months") {
      const q1 = getField(subIssue, "1ኛ ሩብዓመት");
      const q2 = getField(subIssue, "2ኛ ሩብዓመት");
      const q3 = getField(subIssue, "3ኛ ሩብዓመት");
      return (q1 && q1 !== "0" && q1 !== "") || 
             (q2 && q2 !== "0" && q2 !== "") || 
             (q3 && q3 !== "0" && q3 !== "");
    } else {
      const val = getField(subIssue, period);
      return val && val !== "0" && val !== "";
    }
  };
  
  // Helper to check if user is assigned to issue
  const isUserAssignedToIssue = (issue) => {
    if (issue.assigned_to?.id === userId) {
      return true;
    }
    
    if (issue.assigned_to && issue.assigned_to.name) {
      const groupName = extractGroupName(issue.assigned_to);
      const isGroup = isGroupAssignment(issue.assigned_to) || groupName !== "";
      
      if (isGroup && groupName) {
        const normalizedGroupName = normalizeGroupName(groupName);
        const searchName = normalizedGroupName.toLowerCase().trim();
        
        if (issue.project?.id && projectMembers[issue.project.id]) {
          const projectData = projectMembers[issue.project.id];
          for (const [groupId, groupInfo] of Object.entries(projectData.groups || {})) {
            const normalizedInfoName = normalizeGroupName(groupInfo.name).toLowerCase().trim();
            if (normalizedInfoName.includes(searchName) || searchName.includes(normalizedInfoName)) {
              const numericUserIds = groupInfo.userIds.map(id => Number(id));
              if (numericUserIds.includes(userId)) {
                return true;
              }
            }
          }
        }
        
        for (const pid in projectMembers) {
          const projectData = projectMembers[pid];
          for (const [groupId, groupInfo] of Object.entries(projectData.groups || {})) {
            const normalizedInfoName = normalizeGroupName(groupInfo.name).toLowerCase().trim();
            if (normalizedInfoName.includes(searchName) || searchName.includes(normalizedInfoName)) {
              const numericUserIds = groupInfo.userIds.map(id => Number(id));
              if (numericUserIds.includes(userId)) {
                return true;
              }
            }
          }
        }
      }
    }
    
    return false;
  };
  
  // Check all main issues first
  issues.forEach((mainIssue) => {
    // Check if main issue has period value
    const mainIssueHasPeriodValue = () => {
      if (period === "Yearly") {
        const yearlyValue = getField(mainIssue, "የዓመቱ እቅድ");
        return yearlyValue && yearlyValue !== "0" && yearlyValue !== "";
      } else if (period === "6 Months") {
        const q1 = getField(mainIssue, "1ኛ ሩብዓመት");
        const q2 = getField(mainIssue, "2ኛ ሩብዓመት");
        return (q1 && q1 !== "0" && q1 !== "") || (q2 && q2 !== "0" && q2 !== "");
      } else if (period === "9 Months") {
        const q1 = getField(mainIssue, "1ኛ ሩብዓመት");
        const q2 = getField(mainIssue, "2ኛ ሩብዓመት");
        const q3 = getField(mainIssue, "3ኛ ሩብዓመት");
        return (q1 && q1 !== "0" && q1 !== "") || 
               (q2 && q2 !== "0" && q2 !== "") || 
               (q3 && q3 !== "0" && q3 !== "");
      } else {
        const val = getField(mainIssue, period);
        return val && val !== "0" && val !== "";
      }
    };
    
    if (!mainIssueHasPeriodValue()) {
      return; // Skip issues without period value
    }
    
    // Check if this main issue has sub-issues assigned to this user WITH PERIOD VALUES
    let hasAssignedSubIssuesWithPeriod = false;
    const assignedSubIssuesWithPeriod = [];
    
    if (mainIssue.children?.length) {
      mainIssue.children.forEach(sub => {
        // Check if sub-issue has period value
        if (!subIssueHasPeriodValue(sub, period)) {
          return;
        }
        
        // Check if user is assigned to sub-issue
        let isSubAssigned = false;
        if (sub.assigned_to?.id === userId) {
          isSubAssigned = true;
        }
        
        if (!isSubAssigned && sub.assigned_to && sub.assigned_to.name) {
          const groupName = extractGroupName(sub.assigned_to);
          const isGroup = isGroupAssignment(sub.assigned_to) || groupName !== "";
          
          if (isGroup && groupName) {
            const normalizedGroupName = normalizeGroupName(groupName);
            const searchName = normalizedGroupName.toLowerCase().trim();
            
            if (mainIssue.project?.id && projectMembers[mainIssue.project.id]) {
              const projectData = projectMembers[mainIssue.project.id];
              for (const [groupId, groupInfo] of Object.entries(projectData.groups || {})) {
                const normalizedInfoName = normalizeGroupName(groupInfo.name).toLowerCase().trim();
                if (normalizedInfoName.includes(searchName) || searchName.includes(normalizedInfoName)) {
                  const numericUserIds = groupInfo.userIds.map(id => Number(id));
                  if (numericUserIds.includes(userId)) {
                    isSubAssigned = true;
                  }
                }
              }
            }
            
            if (!isSubAssigned) {
              for (const pid in projectMembers) {
                const projectData = projectMembers[pid];
                for (const [groupId, groupInfo] of Object.entries(projectData.groups || {})) {
                  const normalizedInfoName = normalizeGroupName(groupInfo.name).toLowerCase().trim();
                  if (normalizedInfoName.includes(searchName) || searchName.includes(normalizedInfoName)) {
                    const numericUserIds = groupInfo.userIds.map(id => Number(id));
                    if (numericUserIds.includes(userId)) {
                      isSubAssigned = true;
                      break;
                    }
                  }
                }
                if (isSubAssigned) break;
              }
            }
          }
        }
        
        // If sub-issue is assigned to user AND has period value, add it
        if (isSubAssigned) {
          hasAssignedSubIssuesWithPeriod = true;
          assignedSubIssuesWithPeriod.push(sub);
        }
      });
    }
    
    // Check if user is assigned to main issue
    const isAssignedToMainIssue = isUserAssignedToIssue(mainIssue);
    
    // Apply the rule:
    // 1. If main issue has assigned sub-issues WITH PERIOD VALUES, add sub-issue weights
    // 2. If main issue has NO assigned sub-issues WITH PERIOD VALUES but user is assigned to main issue AND main issue has period value, add main issue weight
    if (hasAssignedSubIssuesWithPeriod) {
      // Add weights of all sub-issues assigned to this user WITH PERIOD VALUES
      assignedSubIssuesWithPeriod.forEach(sub => {
        subIssueWeight += getWeight(sub);
      });
    } else if (isAssignedToMainIssue) {
      // User is assigned to main issue but has no assigned sub-issues WITH PERIOD VALUES, and main issue has period value
      mainIssueWeight += getWeight(mainIssue);
    }
  });
  
  totalWeight = mainIssueWeight + subIssueWeight;
  
  return {
    mainIssueWeight,
    subIssueWeight,
    totalWeight
  };
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

  // UPDATED: Use the unified performance calculation for both chart and details
  const currentPerformanceData = useMemo(() => {
    return calculatePersonalPlanPerformance(groupUsers, issues, selectedPeriod, projectMembers);
  }, [groupUsers, issues, selectedPeriod, projectMembers]);

  // UPDATED: Calculate user performance using the same unified function
  const getUserPerformanceDetails = useMemo(() => {
    if (!selectedUser) return null;
    
    // Recalculate using the same logic as the chart
    const periodIssues = filterIssuesByPeriod(issues, selectedPeriod);
    return calculateUserPerformance(selectedUser, periodIssues, selectedPeriod, projectMembers);
  }, [selectedUser, issues, selectedPeriod, projectMembers]);

  // UPDATED: Get all assigned issues using the same logic
  const getAllAssignedIssuesForUser = useMemo(() => {
    if (!selectedUser || !getUserPerformanceDetails) return [];
    return getUserPerformanceDetails.issues || [];
  }, [selectedUser, getUserPerformanceDetails]);

  // UPDATED: Calculate weight summary using the same logic
  const calculateTotalWeightIncludingMainIssues = useMemo(() => {
    if (!getUserPerformanceDetails) {
      return { totalWeight: 0, actualWeight: 0, totalTasks: 0 };
    }
    
    return {
      totalWeight: getUserPerformanceDetails.maxWeight || 0,
      actualWeight: getUserPerformanceDetails.rawPerformance || 0,
      totalTasks: getUserPerformanceDetails.totalIssues || 0
    };
  }, [getUserPerformanceDetails]);

  // UPDATED: Performance is directly from the unified calculation
  const calculatePerformanceFromWeights = useMemo(() => {
    if (!getUserPerformanceDetails) return 0;
    return getUserPerformanceDetails.performance || 0;
  }, [getUserPerformanceDetails]);

  // Calculate best performers and team average
  const bestPerformersData = useMemo(() => {
    // Filter out users with 0 performance
    const usersWithPerformance = currentPerformanceData.filter(user => user.performance > 0);
    
    if (usersWithPerformance.length === 0) {
      return {
        bestPerformers: [],
        maxPerformance: 0,
        teamAverage: 0
      };
    }
    
    // Find maximum performance
    const maxPerformance = Math.max(...usersWithPerformance.map(user => user.performance));
    
    // Find all users with the maximum performance (could be multiple)
    const bestPerformers = usersWithPerformance.filter(user => user.performance === maxPerformance);
    
    // Calculate team average (excluding users with 0 performance)
    const teamAverage = usersWithPerformance.length > 0 
      ? Math.round(usersWithPerformance.reduce((sum, user) => sum + user.performance, 0) / usersWithPerformance.length)
      : 0;
    
    return {
      bestPerformers,
      maxPerformance,
      teamAverage
    };
  }, [currentPerformanceData]);

  useEffect(() => {
    if (currentPerformanceData.length > 0) {
      const maxPerformance = Math.max(...currentPerformanceData.map(user => user.performance || 0));
      const bestPerformers = currentPerformanceData.filter(user => (user.performance || 0) === maxPerformance);
      
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
      done_ratio: mapProgress(issue.done_ratio || 0, selectedPeriod, issue),
      start_date: formatDate(issue.start_date),
      due_date: formatDate(issue.due_date),
      status: issue.status?.name,
      priority: issue.priority?.name,
      project: issue.project?.name,
      color: getProgressColor(mapProgress(issue.done_ratio || 0, selectedPeriod, issue))
    })), 
  [filteredIssues, selectedPeriod]);

  // UPDATED: Modified to remove Status and Project columns and add Actual Weight column
  const selectedUserTableData = useMemo(() => {
    if (!selectedUser || getAllAssignedIssuesForUser.length === 0) return [];
    
    const data = getAllAssignedIssuesForUser.map(issue => {
      const measurement = getField(issue, "መለኪያ") || "N/A";
      const targetValue = getTargetValue(issue, selectedPeriod);
      const achievement = getAchievementValue(issue, selectedPeriod);
      const progress = mapProgress(issue.done_ratio || 0, selectedPeriod, issue);
      const weight = getWeight(issue);
      
      // Calculate Actual Weight: (progress * weight) / 100
      const actualWeight = (progress * weight) / 100;
      
      return {
        id: issue.id,
        subject: issue.subject,
        measurement: measurement,
        targetValue: targetValue,
        achievement: achievement,
        actual: achievement,
        progress: progress,
        weight: weight,
        actualWeight: actualWeight,
        hasValidTarget: isValidTargetValue(targetValue, selectedPeriod),
        isMainIssue: !issue.parent, // Flag to identify if this is a main issue
        hasChildren: issue.children?.length > 0
      };
    });
    
    return data.filter(row => row.hasValidTarget);
  }, [selectedUser, getAllAssignedIssuesForUser, selectedPeriod]);

  const analyticsTableData = useMemo(() => {
    if (filteredIssues.length === 0) return [];
    
    const data = filteredIssues.map(issue => {
      const measurement = getField(issue, "መለኪያ") || "N/A";
      const targetValue = getTargetValue(issue, selectedPeriod);
      const achievement = getAchievementValue(issue, selectedPeriod);
      const progress = mapProgress(issue.done_ratio || 0, selectedPeriod, issue);
      
      return {
        id: issue.id,
        subject: issue.subject,
        measurement: measurement,
        targetValue: targetValue,
        achievement: achievement,
        actual: achievement,
        progress: progress,
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

    } catch (err) {
      console.error("Failed to load dashboard data:", err);
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, [getCachedGroupDetails]);

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
    
    setSelectedUser(userPersonalData || user);
    
    if (userPersonalData) {
      setSelectedUserIssues(userPersonalData.issues || []);
    }
  }, [currentPerformanceData]);

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
                  Total Members
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

      

      {/* Performance Tab */}
      {activeTab === 'performance' && !selectedUser && (
        <>
          {/* Period Filter for Performance Tab */}
          <div style={{
            marginBottom: '30px',
            padding: '15px',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            border: '1px solid #dee2e6'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '15px'
            }}>
              <div>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', color: '#333' }}>
                  Team Members Performance ({selectedPeriod})
                </h3>
               
              </div>
              
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  value={selectedPeriod}
                  onChange={(e) => handlePeriodChange(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: '1px solid #ddd',
                    backgroundColor: '#fff',
                    fontWeight: 'bold',
                    minWidth: '150px',
                    fontSize: '14px'
                  }}
                >
                  {periodOptions.map(period => (
                    <option key={period} value={period}>{period}</option>
                  ))}
                </select>
                
                
              </div>
            </div>
            
           
          </div>

          {/* Best Performers & Team Average Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '15px',
            marginBottom: '30px'
          }}>
            {/* Best Performers Card */}
            <div style={{
              padding: '20px',
              backgroundColor: '#fff',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              borderTop: '4px solid #ff9800',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                backgroundColor: '#ff9800',
                color: 'white',
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 'bold'
              }}>
                🏆 Top Performers
              </div>
              
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '15px',
                marginBottom: '15px'
              }}>
                <div style={{
                  width: '60px',
                  height: '60px',
                  backgroundColor: '#fff3e0',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ff9800',
                  fontSize: '24px',
                  fontWeight: 'bold'
                }}>
                  🥇
                </div>
                <div>
                  <div style={{ fontSize: '14px', color: '#666', marginBottom: '5px' }}>
                    Best Performers ({selectedPeriod})
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#333' }}>
                    {bestPerformersData.bestPerformers.length > 0 ? 
                      bestPerformersData.bestPerformers.map(user => truncateText(user.name, 15)).join(', ') : 
                      'No performers'
                    }
                  </div>
                </div>
              </div>
              
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '15px',
                paddingTop: '15px',
                borderTop: '1px solid #eee'
              }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#666' }}>Performance</div>
                  <div style={{ 
                    fontSize: '24px', 
                    fontWeight: 'bold', 
                    color: getProgressColor(bestPerformersData.maxPerformance)
                  }}>
                    {bestPerformersData.maxPerformance}%
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#666', textAlign: 'right' }}>Count</div>
                  <div style={{ 
                    fontSize: '24px', 
                    fontWeight: 'bold', 
                    color: '#333',
                    textAlign: 'right'
                  }}>
                    {bestPerformersData.bestPerformers.length}
                  </div>
                </div>
              </div>
              
              {bestPerformersData.bestPerformers.length > 0 && (
                <div style={{
                  marginTop: '15px',
                  padding: '10px',
                  backgroundColor: '#fff3e0',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: '#666'
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '5px', color: '#ff9800' }}>
                    Performance Details:
                  </div>
                  {bestPerformersData.bestPerformers.map((user, index) => (
                    <div key={user.id} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '5px 0',
                      borderBottom: index < bestPerformersData.bestPerformers.length - 1 ? '1px dashed #ffcc80' : 'none'
                    }}>
                      <span>{truncateText(user.name, 20)}</span>
                      <span style={{ 
                        fontWeight: 'bold',
                        color: getProgressColor(user.performance)
                      }}>
                        {user.performance}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Team Performance Average Card */}
            <div style={{
              padding: '20px',
              backgroundColor: '#fff',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              borderTop: '4px solid #4caf50',
              position: 'relative',
              overflow: 'hidden'
            }}>
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
                📊 Team Stats
              </div>
              
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '15px',
                marginBottom: '15px'
              }}>
                <div style={{
                  width: '60px',
                  height: '60px',
                  backgroundColor: '#e8f5e9',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#4caf50',
                  fontSize: '24px',
                  fontWeight: 'bold'
                }}>
                  👥
                </div>
                <div>
                  <div style={{ fontSize: '14px', color: '#666', marginBottom: '5px' }}>
                    Team Performance ({selectedPeriod})
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#333' }}>
                    Average Performance
                  </div>
                </div>
              </div>
              
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '15px',
                paddingTop: '15px',
                borderTop: '1px solid #eee'
              }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#666' }}>Team Average</div>
                  <div style={{ 
                    fontSize: '32px', 
                    fontWeight: 'bold', 
                    color: getProgressColor(bestPerformersData.teamAverage)
                  }}>
                    {bestPerformersData.teamAverage}%
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '12px', color: '#666' }}>Active Members</div>
                  <div style={{ 
                    fontSize: '24px', 
                    fontWeight: 'bold', 
                    color: '#1976d2'
                  }}>
                    {currentPerformanceData.filter(user => user.performance > 0).length}
                  </div>
                </div>
              </div>
              
              <div style={{
                marginTop: '15px',
                padding: '10px',
                backgroundColor: '#e8f5e9',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#666'
              }}>
                <div style={{ fontWeight: 'bold', marginBottom: '5px', color: '#2e7d32' }}>
                  Performance Range:
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontSize: '10px', color: '#666' }}>Best</div>
                    <div style={{ fontWeight: 'bold', color: '#4caf50' }}>
                      {bestPerformersData.maxPerformance}%
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: '#666' }}>Average</div>
                    <div style={{ fontWeight: 'bold', color: '#1976d2' }}>
                      {bestPerformersData.teamAverage}%
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: '#666' }}>Lowest*</div>
                    <div style={{ fontWeight: 'bold', color: '#ff5722' }}>
                      {currentPerformanceData.filter(user => user.performance > 0).length > 0 ? 
                        Math.min(...currentPerformanceData.filter(user => user.performance > 0).map(user => user.performance)) : 
                        0
                      }%
                    </div>
                  </div>
                </div>
                <div style={{ 
                  fontSize: '10px', 
                  color: '#888', 
                  marginTop: '5px',
                  fontStyle: 'italic'
                }}>
                  *Excludes members with 0% performance
                </div>
              </div>
            </div>
          </div>

          {/* SEPARATE PERFORMANCE BAR CHART */}
          <div style={{
            marginBottom: '30px',
            padding: '20px',
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>
              Team Performance Overview ({selectedPeriod})
            </h3>
            
            <div style={{ width: "100%", height: "400px" }}>
              <ResponsiveContainer width="100%" height="100%" minHeight={300}>
                <BarChart 
                  data={currentPerformanceData
                    .sort((a, b) => (b.performance || 0) - (a.performance || 0))
                    .map(user => ({
                      name: truncateText(user.name, 15),
                      performance: user.performance || 0,
                      color: user.color || getProgressColor(user.performance || 0),
                      completedIssues: user.completedIssues || 0,
                      totalIssues: user.totalIssues || 0,
                      rawPerformance: user.rawPerformance || 0,
                      maxWeight: user.maxWeight || 0
                    }))} 
                  margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="name"
                    angle={-30}
                    textAnchor="end"
                    interval={0}
                    tickFormatter={truncateText}
                    height={60}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis 
                    domain={[0, 100]} 
                    unit="%" 
                    label={{ 
                      value: 'Performance (%)', 
                      angle: -90, 
                      position: 'insideLeft',
                      offset: -10,
                      style: { textAnchor: 'middle', fontSize: 12 }
                    }}
                  />
                  <Tooltip
                    content={<PerformanceTooltip />}
                  />
                  <Legend />
                  <Bar 
                    dataKey="performance" 
                    name="Calculated Performance"
                    radius={[4, 4, 0, 0]}
                  >
                    {currentPerformanceData.map((user, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={user.color || getProgressColor(user.performance || 0)} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* User Cards Section */}
          <div style={{
            marginBottom: '40px'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '15px'
            }}>
              
              
            </div>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
              gap: '15px',
              marginBottom: '30px'
            }}>
              {currentPerformanceData.map((user) => {
                // Calculate period-specific weights using the FIXED function
                const periodWeights = calculateWeightsForPeriod(user, issues, selectedPeriod, projectMembers);
                const totalPeriodWeight = periodWeights.totalWeight;
                
                return (
                  <div
                    key={user.id}
                    onClick={() => handleUserSelect(user)}
                    style={{
                      padding: '15px',
                      backgroundColor: '#fff',
                      borderRadius: '8px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                      borderLeft: `4px solid ${user.color || "#f44336"}`,
                      cursor: 'pointer',
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
                      alignItems: 'center',
                      marginBottom: '10px'
                    }}>
                      <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
                        {user.name}
                      </div>
                      <div style={{
                        backgroundColor: user.color || getProgressColor(user.performance || 0),
                        color: 'white',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}>
                        {user.performance || 0}%
                      </div>
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
            <h2 style={{ margin: 0 }}>{selectedUser.name}'s  Details </h2>
            
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{
                display: 'flex',
                gap: '10px',
                alignItems: 'center'
              }}>
                <select
                  value={selectedPeriod}
                  onChange={(e) => handlePeriodChange(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: '1px solid #ddd',
                    backgroundColor: '#fff',
                    fontWeight: 'bold',
                    minWidth: '150px',
                    fontSize: '14px'
                  }}
                >
                  {periodOptions.map(period => (
                    <option key={period} value={period}>{period}</option>
                  ))}
                </select>
              </div>
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

          {/* Weight Summary Card - Now uses the same calculation as chart */}
          {calculateTotalWeightIncludingMainIssues.totalTasks > 0 && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '30px',
              marginBottom: '30px'
            }}>
              <div style={{
                padding: '20px',
                backgroundColor: '#fff3e0',
                borderRadius: '12px',
                textAlign: 'center'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '15px',
                  marginBottom: '15px'
                }}>
                  <div>
                    <h3 style={{ margin: 0, color: '#333', fontSize: '18px' }}>
                      Total Weight Summary ({selectedPeriod})
                    </h3>
                  </div>
                </div>
                
                <div style={{
                  display: 'flex',
                  gap: '15px',
                  marginTop: '20px',
                  justifyContent: 'center'
                }}>
                  <div style={{
                    padding: '15px',
                    flex: 1,
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }}>
                    <div style={{ fontSize: '12px', color: '#ff9800', marginBottom: '5px', fontWeight: 'bold' }}>
                      Target Weight
                    </div>
                    <div style={{ 
                      fontSize: '28px', 
                      fontWeight: 'bold', 
                      color: '#ff9800',
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'center',
                      gap: '5px'
                    }}>
                      {calculateTotalWeightIncludingMainIssues.totalWeight.toFixed(2)}
                    </div>
                  </div>
                  
                  <div style={{
                    padding: '15px',
                    flex: 1,
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }}>
                    <div style={{ fontSize: '12px', color: '#4caf50', marginBottom: '5px', fontWeight: 'bold' }}>
                      Contributed Weight
                    </div>
                    <div style={{ 
                      fontSize: '28px', 
                      fontWeight: 'bold', 
                      color: '#4caf50',
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'center',
                      gap: '5px'
                    }}>
                      {calculateTotalWeightIncludingMainIssues.actualWeight.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Performance Card - Now matches chart performance */}
              <div style={{
                padding: '20px',
                backgroundColor: '#e8f5e9',
                borderRadius: '12px',
                textAlign: 'center'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '15px',
                  marginBottom: '15px'
                }}>
                  <div>
                    <h3 style={{ margin: 0, color: '#333', fontSize: '18px' }}>
                      Performance Summary ({selectedPeriod})
                    </h3>
                  </div>
                </div>
                
                <div style={{
                  display: 'flex',
                  gap: '15px',
                  marginTop: '20px',
                  justifyContent: 'center'
                }}>
                
                  
                  <div style={{
                    padding: '15px',
                    flex: 1,
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }}>
                    <div style={{ fontSize: '12px', color: '#2e7d32', marginBottom: '5px', fontWeight: 'bold' }}>
                      Calculated Performance
                    </div>
                    <div style={{ 
                      fontSize: '32px', 
                      fontWeight: 'bold', 
                      color: getProgressColor(calculatePerformanceFromWeights),
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'center',
                      gap: '5px'
                    }}>
                      {calculatePerformanceFromWeights.toFixed(1)}%
                    </div>
                    
                    {/* Debug info - can be removed in production */}
                    <div style={{ fontSize: '10px', color: '#666', marginTop: '5px' }}>
                      (Same calculation as chart)
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* የግል እቅድ Progress Chart - FILTERED BY PERIOD */}
          {getAllAssignedIssuesForUser.length > 0 && (
            <div style={{ marginBottom: '40px' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px'
              }}>
                <h3 style={{ margin: 0, color: '#333' }}>
                  Assigned Tasks Progress ({selectedPeriod})
                  
                </h3>
                
              </div>
              <div style={{ width: "100%", height: "400px" }}>
                <ResponsiveContainer width="100%" height="100%" minHeight={300}>
                  <BarChart 
                    data={getAllAssignedIssuesForUser
                      .filter(issue => hasValidPeriodValue(issue, selectedPeriod))
                      .map(issue => ({
                        id: issue.id,
                        name: truncateText(issue.subject, 15),
                        done_ratio: mapProgress(issue.done_ratio || 0, selectedPeriod, issue),
                        color: getProgressColor(mapProgress(issue.done_ratio || 0, selectedPeriod, issue)),
                        isMainIssue: !issue.parent
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
                      formatter={(value, name, props) => {
                        const issue = getAllAssignedIssuesForUser.find(i => i.id === props.payload.id);
                        return [
                          `${(value || 0).toFixed(0)}%`, 
                          issue?.parent ? 'የግል እቅድ Progress' : 'ዝርዝር ተግባር Progress'
                        ];
                      }}
                      labelFormatter={(label) => truncateText(label, 50)}
                    />
                    <Bar dataKey="done_ratio" name="Progress %">
                      {getAllAssignedIssuesForUser
                        .filter(issue => hasValidPeriodValue(issue, selectedPeriod))
                        .map((entry, index) => (
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
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <h3 style={{ margin: 0, color: '#333' }}>
                All Assigned Tasks Details ({selectedPeriod})
                <span style={{ fontSize: '14px', color: '#666', marginLeft: '10px' }}>
                  (Includes የግል እቅድ + ዝርዝር ተግባራት without sub-issues)
                </span>
              </h3>
              
            </div>
            
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
                <p style={{ fontSize: '14px', color: '#888' }}>
                  This user doesn't have any tasks with valid target values for the selected period.
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
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>Task Type</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>Subject</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>መለኪያ</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>
                        {selectedPeriod === "Yearly" ? "የዓመቱ እቅድ" : selectedPeriod} Target
                      </th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>Achievement</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>Progress (%)</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>Weight</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>Actual Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedUserTableData.map((row, index) => (
                      <tr key={row.id} style={{ 
                        borderBottom: '1px solid #dee2e6',
                        backgroundColor: index % 2 === 0 ? '#fff' : '#f8f9fa'
                      }}>
                        <td style={{ padding: '12px' }}>
                          <div style={{
                            display: 'inline-block',
                            backgroundColor: row.isMainIssue ? '#1976d2' : '#4caf50',
                            color: 'white',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 'bold'
                          }}>
                            {row.isMainIssue ? 'ዝርዝር ተግባር' : 'የግል እቅድ'}
                          </div>
                        </td>
                        <td style={{ padding: '12px', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {truncateText(row.subject, 40)}
                        </td>
                        <td style={{ padding: '12px' }}>{row.measurement}</td>
                        <td style={{ padding: '12px', fontWeight: 'bold' }}>
                          {row.targetValue}
                        </td>
                        <td style={{ padding: '12px', fontWeight: 'bold', color: '#2e7d32' }}>
                          {row.achievement.toFixed(2)}
                        </td>
                        <td style={{ padding: '12px' }}>
                          <div style={{ 
                            display: 'inline-block',
                            backgroundColor: getProgressColor(row.progress),
                            color: 'white',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontWeight: 'bold',
                            minWidth: '60px',
                            textAlign: 'center'
                          }}>
                            {row.progress.toFixed(0)}%
                          </div>
                        </td>
                        <td style={{ padding: '12px', fontWeight: 'bold', color: '#1976d2' }}>
                          {row.weight}
                        </td>
                        <td style={{ padding: '12px', fontWeight: 'bold', color: '#4caf50' }}>
                          {row.actualWeight.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    {/* Total Row */}
                    {selectedUserTableData.length > 0 && (
                      <tr style={{ 
                        backgroundColor: '#e8f5e9',
                        borderTop: '2px solid #2e7d32'
                      }}>
                        <td style={{ padding: '12px', fontWeight: 'bold' }} colSpan="6">
                          Total
                        </td>
                        <td style={{ padding: '12px', fontWeight: 'bold', color: '#1976d2' }}>
                          {selectedUserTableData.reduce((sum, row) => sum + row.weight, 0).toFixed(2)}
                        </td>
                        <td style={{ padding: '12px', fontWeight: 'bold', color: '#2e7d32' }}>
                          {selectedUserTableData.reduce((sum, row) => sum + row.actualWeight, 0).toFixed(2)}
                        </td>
                      </tr>
                    )}
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
            
            <div style={{ color: '#666', fontSize: '14px' }}>
              Showing {filteredIssues.length} ዝርዝር ተግባራት
              
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
                        <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>Achievement</th>
                        <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>Progress (%)</th>
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
                          <td style={{ padding: '12px', fontWeight: 'bold', color: '#2e7d32' }}>
                            {row.achievement.toFixed(2)}
                          </td>
                          <td style={{ padding: '12px' }}>
                            <div style={{ 
                              display: 'inline-block',
                              backgroundColor: getProgressColor(row.progress),
                              color: 'white',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontWeight: 'bold',
                              minWidth: '60px',
                              textAlign: 'center'
                            }}>
                              {row.progress.toFixed(0)}%
                            </div>
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
                      (All issues assigned to {selectedGroupMember.name} )
                    </span>
                  </h3>
                  
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
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '12px', color: '#666' }}>Performance ({selectedPeriod})</div>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1976d2' }}>
                        {calculatePerformanceFromWeights.toFixed(1)}%
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

      
    </div>
  );
}

export default TeamLeaderDashboard;
