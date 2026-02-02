import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { 
  getCurrentUser, 
  getIssuesAssignedToMe,
  getIssuesAssignedToMeByFullName,
  getIssue,
  getIssuesAssigned
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
  Cell,
  Legend
} from "recharts";

// Cache for already fetched issues to avoid duplicate API calls
const issueCache = new Map();
const subIssuesCache = new Map();

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

// Helper function to get quarter index
const getQuarterIndex = (quarterName) => {
  switch (quarterName) {
    case "1ኛ ሩብዓመት": return 1;
    case "2ኛ ሩብዓመት": return 2;
    case "3ኛ ሩብዓመት": return 3;
    case "4ኛ ሩብዓመት": return 4;
    default: return 0;
  }
};

// Get custom field value from issue
const getField = (issue, fieldName) => {
  const field = issue.custom_fields?.find((f) => f.name === fieldName);
  return field?.value;
};

// Helper function to get progress percentage for a period
const getProgressForPeriod = (issue, period) => {
  if (period === "Yearly") {
    const q1Actual = parseFloat(getField(issue, "1ኛ ሩብዓመት_አፈጻጸም") || "0");
    const q2Actual = parseFloat(getField(issue, "2ኛ ሩብዓመት_አፈጻጸም") || "0");
    const q3Actual = parseFloat(getField(issue, "3ኛ ሩብዓመት_አፈጻጸም") || "0");
    const q4Actual = parseFloat(getField(issue, "4ኛ ሩብዓመት_አፈጻጸም") || "0");
    const yearlyTarget = parseFloat(getField(issue, "የዓመቱ እቅድ") || "0");
    
    const totalActual = q1Actual + q2Actual + q3Actual + q4Actual;
    
    if (yearlyTarget <= 0) return 0;
    
    const progress = (totalActual * 100) / yearlyTarget;
    return Math.min(100, Math.max(0, progress));
  }
  
  if (period === "6 Months") {
    const q1Actual = parseFloat(getField(issue, "1ኛ ሩብዓመት_አፈጻጸም") || "0");
    const q2Actual = parseFloat(getField(issue, "2ኛ ሩብዓመት_አፈጻጸም") || "0");
    const q1Target = parseFloat(getField(issue, "1ኛ ሩብዓመት") || "0");
    const q2Target = parseFloat(getField(issue, "2ኛ ሩብዓመት") || "0");
    
    const totalActual = q1Actual + q2Actual;
    const totalTarget = q1Target + q2Target;
    
    if (totalTarget <= 0) return 0;
    
    const progress = (totalActual * 100) / totalTarget;
    return Math.min(100, Math.max(0, progress));  
  }
  
  if (period === "9 Months") {
    const q1Actual = parseFloat(getField(issue, "1ኛ ሩብዓመት_አፈጻጸም") || "0");
    const q2Actual = parseFloat(getField(issue, "2ኛ ሩብዓመት_አፈጻጸም") || "0");
    const q3Actual = parseFloat(getField(issue, "3ኛ ሩብዓመት_አፈጻጸም") || "0");
    const q1Target = parseFloat(getField(issue, "1ኛ ሩብዓመት") || "0");
    const q2Target = parseFloat(getField(issue, "2ኛ ሩብዓመት") || "0");
    const q3Target = parseFloat(getField(issue, "3ኛ ሩብዓመት") || "0");
    
    const totalActual = q1Actual + q2Actual + q3Actual;
    const totalTarget = q1Target + q2Target + q3Target;
    
    if (totalTarget <= 0) return 0;
    
    const progress = (totalActual * 100) / totalTarget;
    return Math.min(100, Math.max(0, progress));
  }
  
  // For quarterly periods
  const quarterIndex = getQuarterIndex(period);
  let quarterActual, quarterTarget;
  
  switch (quarterIndex) {
    case 1:
      quarterActual = parseFloat(getField(issue, "1ኛ ሩብዓመት_አፈጻጸም") || "0");
      quarterTarget = parseFloat(getField(issue, "1ኛ ሩብዓመት") || "0");
      break;
    case 2:
      quarterActual = parseFloat(getField(issue, "2ኛ ሩብዓመት_አፈጻጸም") || "0");
      quarterTarget = parseFloat(getField(issue, "2ኛ ሩብዓመት") || "0");
      break;
    case 3:
      quarterActual = parseFloat(getField(issue, "3ኛ ሩብዓመት_አፈጻጸም") || "0");
      quarterTarget = parseFloat(getField(issue, "3ኛ ሩብዓመት") || "0");
      break;
    case 4:
      quarterActual = parseFloat(getField(issue, "4ኛ ሩብዓመት_አፈጻጸም") || "0");
      quarterTarget = parseFloat(getField(issue, "4ኛ ሩብዓመት") || "0");
      break;
    default:
      return 0;
  }
  
  if (quarterTarget <= 0) return 0;
  
  const progress = (quarterActual * 100) / quarterTarget;
  return Math.min(100, Math.max(0, progress));
};

// Helper function to get weight with default value
const getWeight = (issue) => {
  const weightValue = getField(issue, "ክብደት");
  if (!weightValue || weightValue === "0" || weightValue === "") {
    return 1;
  }
  return Number(weightValue) || 1;
};

// Helper function to check if target value is valid
const isValidTargetValue = (targetValue, period) => {
  if (!targetValue) return false;
  
  const trimmed = targetValue.toString().trim();
  
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
  
  const numValue = parseFloat(trimmed);
  
  if (isNaN(numValue) || numValue <= 0) {
    return false;
  }
  
  return true;
};

// Filter issues by period
const filterIssuesByPeriod = (issues, period) => {
  if (period === "Yearly") {
    return issues.filter(issue => {
      const yearlyValue = getField(issue, "የዓመቱ እቅድ");
      return isValidTargetValue(yearlyValue, period);
    });
  }

  if (period === "6 Months") {
    return issues.filter(issue => {
      const q1 = getField(issue, "1ኛ ሩብዓመት");
      const q2 = getField(issue, "2ኛ ሩብዓመት");
      
      const hasQ1 = isValidTargetValue(q1, "1ኛ ሩብዓመት");
      const hasQ2 = isValidTargetValue(q2, "2ኛ ሩብዓመት");
      
      return hasQ1 || hasQ2;
    });
  }

  if (period === "9 Months") {
    return issues.filter(issue => {
      const q1 = getField(issue, "1ኛ ሩብዓመት");
      const q2 = getField(issue, "2ኛ ሩብዓመት");
      const q3 = getField(issue, "3ኛ ሩብዓመት");
      
      const hasQ1 = isValidTargetValue(q1, "1ኛ ሩብዓመት");
      const hasQ2 = isValidTargetValue(q2, "2ኛ ሩብዓመት");
      const hasQ3 = isValidTargetValue(q3, "3ኛ ሩብዓመት");
      
      return hasQ1 || hasQ2 || hasQ3;
    });
  }

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
  
  return getField(issue, period) || "0";
};

// Get actual performance value based on selected period
const getActualValue = (issue, period) => {
  if (period === "Yearly") {
    const q1Actual = parseFloat(getField(issue, "1ኛ ሩብዓመት_አፈጻጸም") || "0");
    const q2Actual = parseFloat(getField(issue, "2ኛ ሩብዓመት_አፈጻጸም") || "0");
    const q3Actual = parseFloat(getField(issue, "3ኛ ሩብዓመት_አፈጻጸም") || "0");
    const q4Actual = parseFloat(getField(issue, "4ኛ ሩብዓመት_አፈጻጸም") || "0");
    
    return q1Actual + q2Actual + q3Actual + q4Actual;
  }
  
  if (period === "6 Months") {
    const q1Actual = parseFloat(getField(issue, "1ኛ ሩብዓመት_አፈጻጸም") || "0");
    const q2Actual = parseFloat(getField(issue, "2ኛ ሩብዓመት_አፈጻጸም") || "0");
    
    return q1Actual + q2Actual;
  }
  
  if (period === "9 Months") {
    const q1Actual = parseFloat(getField(issue, "1ኛ ሩብዓመት_አፈጻጸም") || "0");
    const q2Actual = parseFloat(getField(issue, "2ኛ ሩብዓመት_አፈጻጸም") || "0");
    const q3Actual = parseFloat(getField(issue, "3ኛ ሩብዓመት_አፈጻጸም") || "0");
    
    return q1Actual + q2Actual + q3Actual;
  }
  
  const quarterIndex = getQuarterIndex(period);
  switch (quarterIndex) {
    case 1:
      return parseFloat(getField(issue, "1ኛ ሩብዓመት_አፈጻጸም") || "0");
    case 2:
      return parseFloat(getField(issue, "2ኛ ሩብዓመት_አፈጻጸም") || "0");
    case 3:
      return parseFloat(getField(issue, "3ኛ ሩብዓመት_አፈጻጸም") || "0");
    case 4:
      return parseFloat(getField(issue, "4ኛ ሩብዓመት_አፈጻጸም") || "0");
    default:
      return 0;
  }
};

// Cache wrapper for getIssue with timeout
const cachedGetIssue = async (issueId) => {
  if (issueCache.has(issueId)) {
    return issueCache.get(issueId);
  }
  
  try {
    const issue = await getIssue(issueId);
    issueCache.set(issueId, issue);
    
    setTimeout(() => {
      issueCache.delete(issueId);
    }, 5 * 60 * 1000);
    
    return issue;
  } catch (error) {
    console.error(`Error fetching issue ${issueId}:`, error);
    return null;
  }
};

// Check if issue has exactly 1 level of parent hierarchy
const checkOneLevelHierarchy = async (issue) => {
  if (!issue.parent || !issue.parent.id) {
    return false;
  }
  
  try {
    const parentIssue = await cachedGetIssue(issue.parent.id);
    if (!parentIssue) return false;
    
    if (!parentIssue.parent || !parentIssue.parent.id) {
      return true;
    }
    
    return false;
    
  } catch (error) {
    console.error(`Error checking 1-level hierarchy for issue ${issue.id}:`, error);
    return false;
  }
};

// Check if issue has exactly 2 levels of parent hierarchy
const checkTwoLevelHierarchy = async (issue) => {
  if (!issue.parent || !issue.parent.id) {
    return false;
  }
  
  try {
    const parentIssue = await cachedGetIssue(issue.parent.id);
    if (!parentIssue) return false;
    
    if (parentIssue.parent && parentIssue.parent.id) {
      const grandParentIssue = await cachedGetIssue(parentIssue.parent.id);
      if (grandParentIssue && grandParentIssue.parent) {
        return false;
      }
      
      return true;
    }
    
    return false;
    
  } catch (error) {
    console.error(`Error checking 2-level hierarchy for issue ${issue.id}:`, error);
    return false;
  }
};

// Get ALL child issues (sub-issues) of a parent issue that are assigned to the same user
const getSubIssuesForUser = async (parentIssue, currentUserId) => {
  const cacheKey = `subissues-${parentIssue.id}-${currentUserId}`;
  if (subIssuesCache.has(cacheKey)) {
    return subIssuesCache.get(cacheKey);
  }
  
  try {
    console.log(`Looking for sub-issues of parent issue #${parentIssue.id} assigned to user ${currentUserId}`);
    
    const userAssignedIssues = await getIssuesAssigned(currentUserId);
    console.log(`Found ${userAssignedIssues.length} total issues assigned to user ${currentUserId}`);
    
    const subIssues = [];
    
    for (const issue of userAssignedIssues) {
      if (issue.parent && issue.parent.id === parentIssue.id) {
        console.log(`Found child issue #${issue.id} of parent #${parentIssue.id}`);
        subIssues.push(issue);
      }
    }
    
    console.log(`Found ${subIssues.length} sub-issues for parent issue #${parentIssue.id}`);
    
    subIssuesCache.set(cacheKey, subIssues);
    
    setTimeout(() => {
      subIssuesCache.delete(cacheKey);
    }, 5 * 60 * 1000);
    
    return subIssues;
  } catch (error) {
    console.error(`Error getting sub-issues for parent ${parentIssue.id}:`, error);
    return [];
  }
};

// Calculate Actual Weight for a 1-Level Issue
const calculateActualWeight = async (oneLevelIssue, currentUserId, selectedPeriod) => {
  const issueWeight = getWeight(oneLevelIssue);
  console.log(`Calculating actual weight for 1-level issue #${oneLevelIssue.id} (weight: ${issueWeight}) for period: ${selectedPeriod}`);
  
  const subIssues = await getSubIssuesForUser(oneLevelIssue, currentUserId);
  
  console.log(`Found ${subIssues.length} sub-issues for issue #${oneLevelIssue.id}`);
  
  if (subIssues.length === 0) {
    console.log(`No sub-issues found for issue #${oneLevelIssue.id}, actual weight = 0`);
    return {
      issueWeight,
      actualWeight: 0,
      subIssuesCount: 0,
      avgSubIssuesProgress: 0,
      hasSubIssues: false
    };
  }
  
  let totalProgress = 0;
  let validSubIssuesCount = 0;
  const subIssuesDetails = [];
  
  subIssues.forEach((subIssue, index) => {
    const progress = getProgressForPeriod(subIssue, selectedPeriod);
    
    console.log(`Sub-issue #${index + 1}: #${subIssue.id} - progress: ${progress}%`);
    console.log(`  Sub-issue subject: ${subIssue.subject}`);
    
    totalProgress += progress;
    validSubIssuesCount++;
    
    subIssuesDetails.push({
      id: subIssue.id,
      subject: subIssue.subject,
      progress,
      weight: getWeight(subIssue),
      actualValue: getActualValue(subIssue, selectedPeriod),
      targetValue: getTargetValue(subIssue, selectedPeriod)
    });
  });
  
  const avgSubIssuesProgress = validSubIssuesCount > 0 
    ? totalProgress / validSubIssuesCount 
    : 0;
  
  console.log(`Average sub-issues progress: ${avgSubIssuesProgress}%`);
  
  const actualWeight = (issueWeight * avgSubIssuesProgress) / 100;
  
  console.log(`Actual weight calculation: (${issueWeight} × ${avgSubIssuesProgress}) ÷ 100 = ${actualWeight}`);
  
  return {
    issueWeight,
    actualWeight,
    subIssuesCount: subIssues.length,
    avgSubIssuesProgress,
    hasSubIssues: true,
    subIssuesDetails
  };
};

// Process single issue efficiently with 1-level hierarchy check
const processOneLevelIssue = async (issue) => {
  const cacheKey = `issue-${issue.id}-1level`;
  if (issueCache.has(cacheKey)) {
    return issueCache.get(cacheKey);
  }
  
  try {
    const hasOneLevelHierarchy = await checkOneLevelHierarchy(issue);
    
    if (hasOneLevelHierarchy) {
      const result = { ...issue, hierarchyLevel: 1 };
      issueCache.set(cacheKey, result);
      return result;
    }
    
    return null;
  } catch (error) {
    console.error(`Error processing 1-level issue ${issue.id}:`, error);
    return null;
  }
};

// Process single issue efficiently with 2-level hierarchy check
const processTwoLevelIssue = async (issue) => {
  const cacheKey = `issue-${issue.id}-2level`;
  if (issueCache.has(cacheKey)) {
    return issueCache.get(cacheKey);
  }
  
  try {
    const hasTwoLevelHierarchy = await checkTwoLevelHierarchy(issue);
    
    if (hasTwoLevelHierarchy) {
      const result = { ...issue, hierarchyLevel: 2 };
      issueCache.set(cacheKey, result);
      return result;
    }
    
    return null;
  } catch (error) {
    console.error(`Error processing 2-level issue ${issue.id}:`, error);
    return null;
  }
};

// Batch process issues for specific hierarchy level
const batchProcessIssues = async (issues, processFunction, batchSize = 5) => {
  const results = [];
  
  for (let i = 0; i < issues.length; i += batchSize) {
    const batch = issues.slice(i, i + batchSize);
    const batchPromises = batch.map(issue => processFunction(issue));
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults.filter(Boolean));
  }
  
  return results;
};

// Calculate 2-Level Hierarchy Performance (uses weighted average)
const calculateTwoLevelHierarchyPerformance = (issues, period) => {
  if (issues.length === 0) return 0;
  
  let totalWeight = 0;
  let weightedProgress = 0;

  issues.forEach((issue) => {
    const weight = getWeight(issue);
    const progress = getProgressForPeriod(issue, period);
    totalWeight += weight;
    weightedProgress += progress * weight;
  });

  return totalWeight > 0 ? Math.round(weightedProgress / totalWeight) : 0;
};

// Calculate 1-Level Hierarchy Performance using Actual Weight formula
const calculateOneLevelHierarchyPerformance = async (oneLevelIssues, currentUserId, period) => {
  if (oneLevelIssues.length === 0) return 0;
  
  let totalIssueWeight = 0;
  let totalActualWeight = 0;
  const issueDetails = [];
  
  console.log(`Calculating 1-level performance for ${oneLevelIssues.length} issues for period: ${period}`);
  
  for (const issue of oneLevelIssues) {
    const issueWeight = getWeight(issue);
    totalIssueWeight += issueWeight;
    
    console.log(`Processing 1-level issue #${issue.id} (weight: ${issueWeight})`);
    
    const actualWeightData = await calculateActualWeight(issue, currentUserId, period);
    totalActualWeight += actualWeightData.actualWeight;
    
    issueDetails.push({
      id: issue.id,
      subject: issue.subject,
      issueWeight,
      actualWeight: actualWeightData.actualWeight,
      subIssuesCount: actualWeightData.subIssuesCount,
      avgSubIssuesProgress: actualWeightData.avgSubIssuesProgress,
      hasSubIssues: actualWeightData.hasSubIssues,
      subIssuesDetails: actualWeightData.subIssuesDetails || []
    });
    
    console.log(`Issue #${issue.id}: weight=${issueWeight}, actualWeight=${actualWeightData.actualWeight}, subIssues=${actualWeightData.subIssuesCount}`);
  }
  
  const performance = totalIssueWeight > 0 
    ? Math.round((totalActualWeight * 100) / totalIssueWeight) 
    : 0;
  
  console.log(`Total issue weight: ${totalIssueWeight}`);
  console.log(`Total actual weight: ${totalActualWeight}`);
  console.log(`1-Level performance: ${performance}%`);
  
  return {
    performance,
    totalIssueWeight,
    totalActualWeight,
    issueDetails
  };
};

// Count how many 1-level issues have sub-issues assigned to the logged-in user
const countOneLevelIssuesWithSubIssues = async (oneLevelIssues, currentUserId) => {
  if (!oneLevelIssues || oneLevelIssues.length === 0 || !currentUserId) {
    return 0;
  }
  
  let count = 0;
  
  for (const issue of oneLevelIssues) {
    try {
      const subIssues = await getSubIssuesForUser(issue, currentUserId);
      if (subIssues.length > 0) {
        count++;
      }
    } catch (error) {
      console.error(`Error checking sub-issues for issue ${issue.id}:`, error);
    }
  }
  
  return count;
};

// Get total weight: Sum of የግል እቅድ weights + ዝርዝር ተግባራት weights where there is no የግል እቅድ
const getTotalCombinedWeight = (oneLevelIssues, twoLevelIssues) => {
  const yegelEkidParentIds = new Set();
  
  twoLevelIssues.forEach(issue => {
    if (issue.parent && issue.parent.id) {
      yegelEkidParentIds.add(issue.parent.id);
    }
  });
  
  console.log(`Found ${yegelEkidParentIds.size} unique የግል እቅድ parent IDs`);
  
  let totalYegelEkidWeight = 0;
  twoLevelIssues.forEach(issue => {
    totalYegelEkidWeight += getWeight(issue);
  });
  
  let totalZerezirTegezatWeight = 0;
  let zerezirWithoutYegelCount = 0;
  
  oneLevelIssues.forEach(issue => {
    const isYegelEkidParent = yegelEkidParentIds.has(issue.id);
    
    if (!isYegelEkidParent) {
      totalZerezirTegezatWeight += getWeight(issue);
      zerezirWithoutYegelCount++;
    }
  });
  
  const totalCombinedWeight = totalYegelEkidWeight + totalZerezirTegezatWeight;
  
  return {
    totalYegelEkidWeight,
    totalZerezirTegezatWeight,
    totalCombinedWeight,
    yegelEkidCount: twoLevelIssues.length,
    zerezirWithoutYegelCount,
    yegelEkidParentIds: Array.from(yegelEkidParentIds)
  };
};

// FIXED: Consistent actual weight calculation function
const calculateIssueActualWeight = (issue, period) => {
  const weight = getWeight(issue);
  const progress = getProgressForPeriod(issue, period);
  
  // Correct formula: Actual Weight = (Weight × Progress) ÷ 100
  const actualWeight = (weight * progress) / 100;
  
  return {
    weight,
    progress,
    actualWeight,
    actualValue: getActualValue(issue, period),
    targetValue: getTargetValue(issue, period)
  };
};

// FIXED: Calculate actual weights for የግል እቅድ
const calculateYegelEkidActualWeights = (twoLevelIssues, period) => {
  if (!twoLevelIssues || twoLevelIssues.length === 0) {
    return {
      issues: [],
      totalOriginalWeight: 0,
      totalActualWeight: 0
    };
  }
  
  const issuesWithActualWeight = twoLevelIssues.map(issue => {
    const weightData = calculateIssueActualWeight(issue, period);
    
    return {
      id: issue.id,
      subject: issue.subject,
      progress: weightData.progress,
      weight: weightData.weight,
      actualWeight: weightData.actualWeight,
      status: issue.status?.name || "Unknown",
      hasValidTarget: isValidTargetValue(weightData.targetValue, period),
      actualValue: weightData.actualValue,
      targetValue: weightData.targetValue
    };
  });
  
  const totalOriginalWeight = issuesWithActualWeight.reduce((sum, issue) => sum + issue.weight, 0);
  const totalActualWeight = issuesWithActualWeight.reduce((sum, issue) => sum + issue.actualWeight, 0);
  
  return {
    issues: issuesWithActualWeight,
    totalOriginalWeight,
    totalActualWeight
  };
};

// FIXED: Calculate performance for each period
const calculatePerformance = (period, twoLevelIssues, oneLevelIssues) => {
  console.log(`Calculating performance for period: ${period}`);
  
  // Filter issues for the period
  const filteredTwoLevelIssues = filterIssuesByPeriod(twoLevelIssues, period);
  const filteredOneLevelIssues = filterIssuesByPeriod(oneLevelIssues, period);
  
  console.log(`Period ${period}:`);
  console.log(`- Filtered 2-level issues: ${filteredTwoLevelIssues.length}`);
  console.log(`- Filtered 1-level issues: ${filteredOneLevelIssues.length}`);
  
  if (filteredTwoLevelIssues.length === 0) {
    console.log(`No 2-level issues for period ${period}`);
    return 0;
  }
  
  // Calculate actual weights
  const yegelEkidWeights = calculateYegelEkidActualWeights(filteredTwoLevelIssues, period);
  const combinedWeightData = getTotalCombinedWeight(filteredOneLevelIssues, filteredTwoLevelIssues);
  
  console.log(`- Total actual weight: ${yegelEkidWeights.totalActualWeight}`);
  console.log(`- Total combined weight: ${combinedWeightData.totalCombinedWeight}`);
  
  if (combinedWeightData.totalCombinedWeight <= 0) {
    console.log(`No combined weight for period ${period}`);
    return 0;
  }
  
  // Performance = (Total Actual Weight × 100) / Total Combined Weight
  const performance = (yegelEkidWeights.totalActualWeight * 100) / combinedWeightData.totalCombinedWeight;
  const roundedPerformance = Math.round(Math.min(100, Math.max(0, performance)));
  
  console.log(`Performance for ${period}: ${roundedPerformance}%`);
  return roundedPerformance;
};

const Dashboard = () => {
  const [allAssignedIssues, setAllAssignedIssues] = useState([]);
  const [oneLevelHierarchyIssues, setOneLevelHierarchyIssues] = useState([]);
  const [twoLevelHierarchyIssues, setTwoLevelHierarchyIssues] = useState([]);
  const [oneLevelPerformanceData, setOneLevelPerformanceData] = useState({
    performance: 0,
    totalIssueWeight: 0,
    totalActualWeight: 0,
    issueDetails: []
  });
  const [user, setUser] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState("Yearly");
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [filterStatus, setFilterStatus] = useState("all");
  const [activeTab, setActiveTab] = useState("performance");
  const [hierarchyInfo, setHierarchyInfo] = useState({
    totalAssignedIssues: 0,
    oneLevelHierarchyIssues: 0,
    twoLevelHierarchyIssues: 0,
    hierarchyValidated: false
  });
  const [oneLevelWithSubIssuesCount, setOneLevelWithSubIssuesCount] = useState(0);

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

  // Load all issues assigned to the logged-in user
  const loadAllAssignedIssues = useCallback(async (userId) => {
    if (!isMountedRef.current) return [];
    
    try {
      console.log("Fetching all issues assigned to user...");
      
      let assignedIssues = [];
      try {
        assignedIssues = await getIssuesAssignedToMe();
        console.log(`Found ${assignedIssues.length} issues via assigned_to_id=me`);
      } catch (error) {
        console.warn("getIssuesAssignedToMe failed, trying by full name...", error);
        assignedIssues = await getIssuesAssignedToMeByFullName();
        console.log(`Found ${assignedIssues.length} issues via full name match`);
      }
      
      return assignedIssues;
      
    } catch (error) {
      console.error("Error loading assigned issues:", error);
      throw error;
    }
  }, []);

  // Load both 1-level and 2-level hierarchy issues
  const loadHierarchyIssues = useCallback(async (allIssues) => {
    if (allIssues.length === 0) {
      setHierarchyInfo(prev => ({
        ...prev,
        oneLevelHierarchyIssues: 0,
        twoLevelHierarchyIssues: 0,
        hierarchyValidated: true
      }));
      return { oneLevel: [], twoLevel: [] };
    }
    
    console.log(`Processing ${allIssues.length} assigned issues for hierarchy levels...`);
    
    const [oneLevelIssues, twoLevelIssues] = await Promise.all([
      batchProcessIssues(allIssues, processOneLevelIssue, 5),
      batchProcessIssues(allIssues, processTwoLevelIssue, 5)
    ]);
    
    console.log(`Found ${oneLevelIssues.length} issues with 1-level hierarchy`);
    console.log(`Found ${twoLevelIssues.length} issues with 2-level hierarchy`);
    
    setHierarchyInfo(prev => ({
      ...prev,
      oneLevelHierarchyIssues: oneLevelIssues.length,
      twoLevelHierarchyIssues: twoLevelIssues.length,
      hierarchyValidated: true
    }));
    
    return { oneLevel: oneLevelIssues, twoLevel: twoLevelIssues };
  }, []);

  // Calculate 1-Level Hierarchy Performance with Actual Weight
  const calculateOneLevelPerformance = useCallback(async (oneLevelIssues, userId, period) => {
    if (!oneLevelIssues || oneLevelIssues.length === 0 || !userId) {
      return {
        performance: 0,
        totalIssueWeight: 0,
        totalActualWeight: 0,
        issueDetails: []
      };
    }
    
    try {
      const filteredOneLevelIssues = filterIssuesByPeriod(oneLevelIssues, period);
      console.log(`Filtered to ${filteredOneLevelIssues.length} 1-level issues for period: ${period}`);
      
      const performanceData = await calculateOneLevelHierarchyPerformance(
        filteredOneLevelIssues, 
        userId, 
        period
      );
      
      return performanceData;
    } catch (error) {
      console.error("Error calculating 1-level performance:", error);
      return {
        performance: 0,
        totalIssueWeight: 0,
        totalActualWeight: 0,
        issueDetails: []
      };
    }
  }, []);

  // Count 1-level issues with sub-issues assigned to user
  const countOneLevelIssuesWithAssignedSubIssues = useCallback(async (oneLevelIssues, userId) => {
    if (!oneLevelIssues || oneLevelIssues.length === 0 || !userId) {
      return 0;
    }
    
    try {
      const count = await countOneLevelIssuesWithSubIssues(oneLevelIssues, userId);
      return count;
    } catch (error) {
      console.error("Error counting 1-level issues with sub-issues:", error);
      return 0;
    }
  }, []);

  // Initial data load - ONLY ONCE
  useEffect(() => {
    isMountedRef.current = true;
    abortControllerRef.current = new AbortController();

    async function loadInitialDashboardData() {
      if (!isMountedRef.current) return;
      
      setInitialLoading(true);
      setError(null);
      
      try {
        const currentUser = await getCurrentUser();
        if (!currentUser) {
          setError("Failed to load user data");
          setInitialLoading(false);
          return;
        }

        setUser(currentUser);
        console.log(`Logged in as: ${currentUser.firstname} ${currentUser.lastname} (ID: ${currentUser.id})`);
        
        const allAssigned = await loadAllAssignedIssues(currentUser.id);
        
        if (!isMountedRef.current) return;
        
        setHierarchyInfo(prev => ({
          ...prev,
          totalAssignedIssues: allAssigned.length
        }));
        
        setAllAssignedIssues(allAssigned);
        
        const { oneLevel, twoLevel } = await loadHierarchyIssues(allAssigned);
        
        if (!isMountedRef.current) return;
        
        setOneLevelHierarchyIssues(oneLevel);
        setTwoLevelHierarchyIssues(twoLevel);
        
        const withSubIssuesCount = await countOneLevelIssuesWithAssignedSubIssues(
          oneLevel, 
          currentUser.id
        );
        
        setOneLevelWithSubIssuesCount(withSubIssuesCount);
        
        const uniqueStatuses = Array.from(
          new Map(
            allAssigned
              .filter(issue => issue.status)
              .map(issue => [issue.status.id, issue.status])
          ).values()
        );
        
        setStatuses(uniqueStatuses);
        
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error("Error loading dashboard:", error);
          setError(error.message || "Failed to load dashboard data");
        }
      } finally {
        if (isMountedRef.current) {
          setInitialLoading(false);
          setLoading(false);
        }
      }
    }

    loadInitialDashboardData();

    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [loadAllAssignedIssues, loadHierarchyIssues, countOneLevelIssuesWithAssignedSubIssues]);

  // Memoized filtered issues for both hierarchy levels
  const filteredOneLevelIssues = useMemo(() => {
    let filtered = filterIssuesByPeriod(oneLevelHierarchyIssues, selectedPeriod);
    
    if (filterStatus !== "all") {
      filtered = filtered.filter(issue => {
        const matchesStatus = filterStatus === "all" || 
          issue.status?.id?.toString() === filterStatus;
        
        return matchesStatus;
      });
    }
    
    return filtered;
  }, [oneLevelHierarchyIssues, selectedPeriod, filterStatus]);

  const filteredTwoLevelIssues = useMemo(() => {
    let filtered = filterIssuesByPeriod(twoLevelHierarchyIssues, selectedPeriod);
    
    if (filterStatus !== "all") {
      filtered = filtered.filter(issue => {
        const matchesStatus = filterStatus === "all" || 
          issue.status?.id?.toString() === filterStatus;
        
        return matchesStatus;
      });
    }
    
    return filtered;
  }, [twoLevelHierarchyIssues, selectedPeriod, filterStatus]);

  // Calculate 2-Level Hierarchy Performance
  const twoLevelHierarchyPerformance = useMemo(() => {
    return calculateTwoLevelHierarchyPerformance(filteredTwoLevelIssues, selectedPeriod);
  }, [filteredTwoLevelIssues, selectedPeriod]);

  // FIXED: Calculate FILTERED actual weights for የግል እቅድ
  const filteredYegelEkidActualWeights = useMemo(() => {
    return calculateYegelEkidActualWeights(filteredTwoLevelIssues, selectedPeriod);
  }, [filteredTwoLevelIssues, selectedPeriod]);

  // Calculate FILTERED combined weight
  const filteredCombinedWeightData = useMemo(() => {
    return getTotalCombinedWeight(filteredOneLevelIssues, filteredTwoLevelIssues);
  }, [filteredOneLevelIssues, filteredTwoLevelIssues]);

  // Calculate FILTERED performance
  const filteredCalculatedPerformance = useMemo(() => {
    return calculatePerformance(selectedPeriod, filteredTwoLevelIssues, filteredOneLevelIssues);
  }, [selectedPeriod, filteredTwoLevelIssues, filteredOneLevelIssues]);

  // Calculate 1-Level Performance
  const calculateOneLevelPerformanceMemoized = useCallback(async () => {
    if (!user || filteredOneLevelIssues.length === 0) {
      setOneLevelPerformanceData({
        performance: 0,
        totalIssueWeight: 0,
        totalActualWeight: 0,
        issueDetails: []
      });
      return;
    }
    
    setLoading(true);
    try {
      const performanceData = await calculateOneLevelPerformance(
        filteredOneLevelIssues, 
        user.id, 
        selectedPeriod
      );
      
      setOneLevelPerformanceData(performanceData);
    } catch (error) {
      console.error("Error calculating 1-level performance:", error);
    } finally {
      setLoading(false);
    }
  }, [user, filteredOneLevelIssues, selectedPeriod, calculateOneLevelPerformance]);

  // Calculate 1-level performance when filters change
  useEffect(() => {
    if (initialLoading) return;
    
    calculateOneLevelPerformanceMemoized();
  }, [calculateOneLevelPerformanceMemoized, initialLoading]);

  // FIXED: Prepare chart data for 2-level hierarchy issues
  const chartData = useMemo(() => {
    const chartDataMap = new Map();
    
    filteredTwoLevelIssues.forEach((issue) => {
      const targetValue = getTargetValue(issue, selectedPeriod);
      if (!isValidTargetValue(targetValue, selectedPeriod)) {
        return;
      }
      
      if (!chartDataMap.has(issue.id)) {
        const assignedTo = issue.assigned_to?.name || "Unassigned";
        const projectName = issue.project?.name || "No Project";
        
        const displayText = `#${issue.id}: ${issue.subject}`;
        const truncatedDisplay = displayText.length > 60 
          ? displayText.substring(0, 57) + "..." 
          : displayText;
        
        // FIXED: Use consistent actual weight calculation
        const weightData = calculateIssueActualWeight(issue, selectedPeriod);
        const progress = weightData.progress;
        const actualValue = weightData.actualValue;
        const weight = weightData.weight;
        const actualWeight = weightData.actualWeight;
        
        chartDataMap.set(issue.id, {
          id: issue.id,
          name: truncatedDisplay,
          fullName: issue.subject,
          progress: progress,
          actualValue: actualValue,
          targetValue: targetValue,
          weight: weight,
          actualWeight: actualWeight,
          status: issue.status?.name,
          assignedTo: assignedTo,
          project: projectName,
          tracker: issue.tracker?.name || "Unknown",
          parentId: issue.parent?.id,
          color: getProgressColor(progress),
          hierarchyLevel: issue.hierarchyLevel || 2
        });
      }
    });

    const data = Array.from(chartDataMap.values());
    return data.sort((a, b) => b.progress - a.progress);
  }, [filteredTwoLevelIssues, selectedPeriod]);

  // Dynamic chart height
  const chartHeight = Math.max(400, chartData.length * 60);

  // FIXED: Prepare table data for 2-level hierarchy issues
  const tableData = useMemo(() => {
    const validIssues = filteredTwoLevelIssues.filter(issue => {
      const targetValue = getTargetValue(issue, selectedPeriod);
      return isValidTargetValue(targetValue, selectedPeriod);
    });
    
    return validIssues.map(issue => {
      // FIXED: Use consistent actual weight calculation
      const weightData = calculateIssueActualWeight(issue, selectedPeriod);
      const progress = weightData.progress;
      const weight = weightData.weight;
      const actualWeight = weightData.actualWeight;
      const actualValue = weightData.actualValue;
      const targetValue = weightData.targetValue;
      
      return {
        id: issue.id,
        subject: issue.subject,
        status: issue.status?.name || "Unknown",
        assignedTo: issue.assigned_to?.name || "Unassigned",
        targetValue: targetValue,
        actualValue: actualValue.toFixed(2),
        progress: Math.round(progress),
        weight: weight,
        actualWeight: actualWeight.toFixed(2),
        tracker: issue.tracker?.name || "Unknown",
        hasValidTarget: true,
        hierarchyLevel: issue.hierarchyLevel || 2
      };
    });
  }, [filteredTwoLevelIssues, selectedPeriod]);

  const handleRefresh = async () => {
    issueCache.clear();
    subIssuesCache.clear();
    
    setLoading(true);
    setAllAssignedIssues([]);
    setOneLevelHierarchyIssues([]);
    setTwoLevelHierarchyIssues([]);
    setOneLevelPerformanceData({
      performance: 0,
      totalIssueWeight: 0,
      totalActualWeight: 0,
      issueDetails: []
    });
    setHierarchyInfo({
      totalAssignedIssues: 0,
      oneLevelHierarchyIssues: 0,
      twoLevelHierarchyIssues: 0,
      hierarchyValidated: false
    });
    setOneLevelWithSubIssuesCount(0);
    
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) return;
      
      setUser(currentUser);
      
      const allAssigned = await loadAllAssignedIssues(currentUser.id);
      setAllAssignedIssues(allAssigned);
      
      const { oneLevel, twoLevel } = await loadHierarchyIssues(allAssigned);
      setOneLevelHierarchyIssues(oneLevel);
      setTwoLevelHierarchyIssues(twoLevel);
      
      const withSubIssuesCount = await countOneLevelIssuesWithAssignedSubIssues(
        oneLevel, 
        currentUser.id
      );
      
      setOneLevelWithSubIssuesCount(withSubIssuesCount);
      
      const uniqueStatuses = Array.from(
        new Map(
          allAssigned
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
          disabled={loading}
          style={{
            padding: '10px',
            borderRadius: '6px',
            border: '2px solid #ddd',
            backgroundColor: '#fff',
            fontWeight: 'bold',
            fontSize: '14px',
            opacity: loading ? 0.7 : 1,
            cursor: loading ? 'not-allowed' : 'pointer'
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
          disabled={loading}
          style={{
            padding: '10px',
            borderRadius: '6px',
            border: '2px solid #ddd',
            backgroundColor: '#fff',
            fontSize: '14px',
            opacity: loading ? 0.7 : 1,
            cursor: loading ? 'not-allowed' : 'pointer'
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
          disabled={loading}
          style={{
            padding: '10px 20px',
            backgroundColor: loading ? '#f0f0f0' : '#f5f5f5',
            border: '1px solid #ddd',
            borderRadius: '6px',
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: 'bold',
            fontSize: '14px',
            opacity: loading ? 0.7 : 1
          }}>
          {loading ? '🔄 Calculating...' : '🔄 Refresh Data'}
        </button>
      </div>
    </div>
  );

  // Simplified loading component
  if (initialLoading) {
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

  if (error && allAssignedIssues.length === 0) {
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
      
      

      {/* Summary Cards */}
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
          borderLeft: '4px solid #2196F3',
          opacity: loading ? 0.7 : 1
        }}>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>Total assigned ዝርዝር ተግባራት</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#2196F3' }}>{oneLevelHierarchyIssues.length}</div>
          
        </div>

        <div style={{
          padding: '20px',
          backgroundColor: '#fff',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          borderLeft: '4px solid #9C27B0',
          opacity: loading ? 0.7 : 1
        }}>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>Total የግል እቅድ ያላቸው assigned ዝርዝር ተግባራት</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#9C27B0' }}>{oneLevelWithSubIssuesCount}</div>
          
        </div>

        <div style={{
          padding: '20px',
          backgroundColor: '#fff',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          borderLeft: '4px solid #4CAF50',
          opacity: loading ? 0.7 : 1
        }}>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>Total የግል እቅድ</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#4CAF50' }}>{twoLevelHierarchyIssues.length}</div>
          
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
            Performance Overview
            {loading && (
              <span style={{
                fontSize: '12px',
                color: '#666',
                backgroundColor: '#e3f2fd',
                padding: '2px 8px',
                borderRadius: '10px',
                marginLeft: '10px'
              }}>
                Calculating...
              </span>
            )}
          </h2>
          
          {/* Filter Controls in Performance Tab */}
          <FilterControls />
          
          {/* Performance Summary */}
          <div style={{ marginBottom: '40px' }}>
            <h3 style={{ 
              marginBottom: '20px', 
              color: '#333', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px'
            }}>
              <span style={{ fontSize: '20px' }}>📈</span>
              Performance Summary
            </h3>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '20px'
            }}>
              
              {/* Performance Card */}
              <div style={{
                padding: '20px',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                border: '1px solid #e0e0e0'
              }}>
                <h4 style={{ marginBottom: '15px', color: '#333', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>📈</span>
                  Performance
                </h4>
                
                <div style={{
                  display: 'grid',
                  gap: '12px',
                  fontSize: '14px'
                }}>
                  {/* Performance Calculation */}
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    padding: '15px',
                    backgroundColor: '#e3f2fd',
                    borderRadius: '6px',
                    borderLeft: '4px solid #1976d2',
                    border: '2px solid #1976d2'
                  }}>
                    <div>
                      <div style={{ color: '#666', fontSize: '12px' }}>Calculated Performance</div>
                      <div style={{ fontWeight: 'bold', color: getProgressColor(filteredCalculatedPerformance), fontSize: '24px' }}>
                        {filteredCalculatedPerformance}%
                      </div>
                    
                    </div>
                    <div style={{ fontSize: '32px', color: '#1976d2' }}>📈</div>
                  </div>
                </div>
              </div>
              
              {/* Combined Weight Summary Card - FIXED */}
              <div style={{
                padding: '20px',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                border: '1px solid #e0e0e0'
              }}>
                <h4 style={{ marginBottom: '15px', color: '#333', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>⚖️</span>
                  ክብደት Summary ({selectedPeriod})
                </h4>
                
                <div style={{
                  display: 'grid',
                  gap: '12px',
                  fontSize: '14px'
                }}>
                  {/* Combined Total Weight */}
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    padding: '12px',
                    backgroundColor: '#f5f5f5',
                    borderRadius: '6px',
                    borderLeft: '4px solid #9C27B0',
                    border: '1px solid #e0e0e0'
                  }}>
                    <div>
                      <div style={{ color: '#666', fontSize: '12px' }}>Target Weight</div>
                      <div style={{ fontWeight: 'bold', color: '#7b1fa2', fontSize: '16px' }}>
                        {filteredCombinedWeightData.totalCombinedWeight.toFixed(2)}
                      </div>
                      
                    </div>
                    <div style={{ fontSize: '24px', color: '#9C27B0' }}>⚖️</div>
                  </div>
                  
                  {/* የግል እቅድ Actual Weight Section - FIXED */}
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    padding: '12px',
                    backgroundColor: '#e3f2fd',
                    borderRadius: '6px',
                    borderLeft: '4px solid #2196F3',
                    marginTop: '5px'
                  }}>
                    <div>
                      <div style={{ color: '#666', fontSize: '12px' }}>Contributed weight</div>
                      <div style={{ fontWeight: 'bold', color: '#1565c0', fontSize: '16px' }}>
                        {filteredYegelEkidActualWeights.totalActualWeight.toFixed(2)}
                      </div>
                      
                    </div>
                    <div style={{ fontSize: '24px', color: '#2196F3' }}>📊</div>
                  </div>
                  
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
            Detailed Analysis of የግል እቅድ
            {loading && (
              <span style={{
                fontSize: '12px',
                color: '#666',
                backgroundColor: '#e3f2fd',
                padding: '2px 8px',
                borderRadius: '10px',
                marginLeft: '10px'
              }}>
                Calculating...
              </span>
            )}
          </h2>

          {/* Filter Controls in Analysis Tab */}
          <FilterControls />

          {/* Chart Section */}
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
              <h3>No የግል እቅድ Match the Selected Criteria</h3>
              <p>Try changing the period or status filter to see your assigned issues.</p>
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
                  የግል እቅድ Progress ({selectedPeriod})
                </div>
                <span style={{ 
                  fontSize: '14px', 
                  color: '#666', 
                  fontWeight: 'normal',
                  backgroundColor: '#f0f7ff',
                  padding: '5px 10px',
                  borderRadius: '20px'
                }}>
                  Showing {chartData.length} issues • Performance: {twoLevelHierarchyPerformance}%
                </span>
              </h3>
              
              {/* Chart container */}
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
                    
                    <YAxis 
                      type="category" 
                      dataKey="name" 
                      width={200} 
                      tick={{ fontSize: 12, fill: '#333' }}
                      axisLine={{ stroke: '#ddd' }}
                      tickLine={{ stroke: '#ddd' }}
                      tickFormatter={(value) => {
                        if (value.includes("...")) {
                          return value;
                        }
                        return value.length > 40 ? `${value.substring(0, 37)}...` : value;
                      }}
                    />
                    
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
                    
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          
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
                                Issue #{data.id} (የግል እቅድ)
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
                                    {Math.round(data.progress)}%
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
                                  <span style={{ color: '#666', fontSize: '12px' }}>Actual Value</span>
                                  <span style={{ 
                                    fontWeight: 'bold', 
                                    color: '#4CAF50',
                                    fontSize: '16px'
                                  }}>
                                    {data.actualValue.toFixed(2)}
                                  </span>
                                </div>
                                
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ color: '#666', fontSize: '12px' }}>Weight</span>
                                  <span style={{ 
                                    fontWeight: 'bold',
                                    fontSize: '16px'
                                  }}>
                                    {data.weight}
                                  </span>
                                </div>
                                
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ color: '#666', fontSize: '12px' }}>Actual Weight</span>
                                  <span style={{ 
                                    fontWeight: 'bold', 
                                    color: '#9C27B0',
                                    fontSize: '16px'
                                  }}>
                                    {data.actualWeight.toFixed(2)}
                                  </span>
                                  <span style={{ color: '#999', fontSize: '11px' }}>
                                    (Weight × Progress) ÷ 100
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
                              </div>
                              
                              
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    
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
                      
                      <LabelList 
                        dataKey="progress" 
                        position="right" 
                        offset={10}
                        formatter={(value) => `${Math.round(value)}%`} 
                        style={{ 
                          fill: "#333", 
                          fontSize: 11, 
                          fontWeight: "bold",
                          textShadow: '1px 1px 1px rgba(255,255,255,0.8)'
                        }} 
                      />
                      
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
              </div>
            </div>
          )}

          {/* Issues List */}
          {tableData.length > 0 ? (
            <div style={{ marginBottom: '40px' }}>
              <h3 style={{ marginBottom: '20px', color: '#333', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>📋</span>
                የግል እቅድ Details ({selectedPeriod})
              </h3>
              
              <div style={{
                overflowX: 'auto',
                backgroundColor: 'white',
                borderRadius: '8px',
                border: '1px solid #e0e0e0',
                maxHeight: '600px',
                overflowY: 'auto'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8f9fa', position: 'sticky', top: 0, zIndex: 1 }}>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>Subject</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>Status</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>{selectedPeriod} Target</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>Actual Value</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>Progress</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>Weight</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 'bold' }}>Actual Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.map((issue, index) => (
                      <tr key={issue.id} style={{ 
                        borderBottom: '1px solid #dee2e6',
                        backgroundColor: index % 2 === 0 ? '#fff' : '#f8f9fa'
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
                        <td style={{ padding: '12px', fontWeight: 'bold', color: '#1976d2' }}>
                          {issue.targetValue}
                        </td>
                        <td style={{ padding: '12px', fontWeight: 'bold', color: '#4CAF50' }}>
                          {issue.actualValue}
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
                        <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', color: '#9C27B0' }}>
                          {issue.actualWeight}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ backgroundColor: '#e3f2fd', position: 'sticky', bottom: 0, zIndex: 1 }}>
                      <td style={{ padding: '12px', fontWeight: 'bold' }} colSpan="2">Average / Total</td>
                      <td style={{ padding: '12px', fontWeight: 'bold', color: '#1976d2' }}>
                        {tableData.length > 0 
                          ? (tableData
                              .reduce((sum, row) => sum + parseFloat(row.targetValue || 0), 0) / 
                            tableData.length).toFixed(2)
                          : '0'}
                      </td>
                      <td style={{ padding: '12px', fontWeight: 'bold', color: '#4CAF50' }}>
                        {tableData.length > 0 
                          ? (tableData
                              .reduce((sum, row) => sum + parseFloat(row.actualValue || 0), 0) / 
                            tableData.length).toFixed(2)
                          : '0'}
                      </td>
                      <td style={{ padding: '12px', fontWeight: 'bold', color: getProgressColor(twoLevelHierarchyPerformance) }}>
                        {twoLevelHierarchyPerformance}%
                      </td>
                      <td style={{ padding: '12px', fontWeight: 'bold' }}>
                        {tableData.reduce((sum, row) => sum + row.weight, 0).toFixed(2)}
                      </td>
                      <td style={{ padding: '12px', fontWeight: 'bold', color: '#7b1fa2' }}>
                        {tableData.reduce((sum, row) => sum + parseFloat(row.actualWeight || 0), 0).toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
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
              <h3>No የግል እቅድ Found</h3>
              <p>None of your assigned issues have exactly 2 levels of parent hierarchy with valid target values.</p>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default Dashboard;
