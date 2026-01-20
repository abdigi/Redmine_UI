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

// Helper function to map progress based on period for sub-issues
const mapSubIssueProgress = (donePercent, period, subIssue = null) => {
  if (!donePercent) donePercent = 0;
  
  // For non-quarterly periods, use the actual done percentage
  if (period === "Yearly") return donePercent;
  
  if (period === "6 Months") {
    // For 6 months, target is 50% of yearly
    return donePercent <= 50 ? Math.round((donePercent / 50) * 100) : 100;
  }
  
  if (period === "9 Months") {
    // For 9 months, target is 75% of yearly
    return donePercent <= 75 ? Math.round((donePercent / 75) * 100) : 100;
  }

  // Handle quarterly periods with dynamic distribution
  if (period.includes("ሩብዓመት")) {
    const quarterIndex = getQuarterIndex(period);
    
    // If no subIssue provided, use simple logic
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
    
    // For quarterly periods, check SUB-ISSUE's quarter validity (not parent)
    const getField = (issue, fieldName) => {
      const field = issue.custom_fields?.find((f) => f.name === fieldName);
      return field?.value;
    };
    
    // Check which quarters have valid values for the SUB-ISSUE (not parent)
    const hasValidQuarterValue = (issue, quarter) => {
      const value = getField(issue, quarter);
      return value && value !== "0" && value !== "" && value !== "0.0" && value !== "0.00";
    };
    
    const quarters = ["1ኛ ሩብዓመት", "2ኛ ሩብዓመት", "3ኛ ሩብዓመት", "4ኛ ሩብዓመት"];
    const validQuartersList = quarters.filter(quarter => hasValidQuarterValue(subIssue, quarter));
    const validQuartersCount = validQuartersList.length;
    
    // If current quarter is not valid for THIS SUB-ISSUE, return 0
    if (!validQuartersList.includes(period)) {
      return 0;
    }
    
    // Get quarter range for the current period based on SUB-ISSUE's valid quarters
    let quarterRange;
    
    if (validQuartersCount === 4) {
      // All 4 quarters valid - equal 25% each
      const ranges = [
        { start: 0, end: 25 },    // Q1: 0-25%
        { start: 25, end: 50 },   // Q2: 25-50%
        { start: 50, end: 75 },   // Q3: 50-75%
        { start: 75, end: 100 }   // Q4: 75-100%
      ];
      quarterRange = ranges[quarterIndex - 1] || { start: 0, end: 100 };
    }
    else if (validQuartersCount === 3) {
      // 3 quarters valid - equal 33.33% each
      const segment = 100 / 3;
      
      // Determine which specific quarters are valid and map them
      const validQuarters = quarters.filter(q => hasValidQuarterValue(subIssue, q));
      
      // Create ranges for valid quarters
      const ranges = [];
      let currentStart = 0;
      const segmentSize = 100 / validQuarters.length;
      
      validQuarters.forEach((quarter, index) => {
        const qIdx = getQuarterIndex(quarter);
        ranges[qIdx - 1] = {
          start: currentStart,
          end: currentStart + segmentSize
        };
        currentStart += segmentSize;
      });
      
      quarterRange = ranges[quarterIndex - 1] || { start: 0, end: 100 };
    }
    else if (validQuartersCount === 2) {
      // 2 quarters valid - equal 50% each
      // Determine which specific quarters are valid
      const validQuarters = quarters.filter(q => hasValidQuarterValue(subIssue, q));
      
      if (validQuarters.length !== 2) {
        quarterRange = { start: 0, end: 100 };
      } else {
        // Create ranges for the specific valid quarters
        const ranges = {};
        const segmentSize = 100 / validQuarters.length;
        let currentStart = 0;
        
        validQuarters.forEach((quarter, index) => {
          const qIdx = getQuarterIndex(quarter);
          ranges[qIdx] = {
            start: currentStart,
            end: currentStart + segmentSize
          };
          currentStart += segmentSize;
        });
        
        // Get the range for the target quarter
        quarterRange = ranges[quarterIndex] || { start: 0, end: 100 };
      }
    }
    else if (validQuartersCount === 1) {
      // 1 quarter valid - use full range
      quarterRange = { start: 0, end: 100 };
    }
    else {
      // Default fallback - no valid quarters
      return 0;
    }
    
    // Now map the done percent based on the quarter range
    const { start, end } = quarterRange;
    const rangeSize = end - start;
    
    if (rangeSize <= 0) {
      return 0;
    }
    
    // Calculate the actual progress within the yearly total
    const actualProgressInYear = donePercent;
    
    // Check if progress is within this quarter's range
    if (actualProgressInYear < start) {
      // Progress hasn't reached this quarter yet
      return 0;
    } else if (actualProgressInYear >= end) {
      // Progress has completed this quarter
      return 100;
    } else {
      // Progress is within this quarter's range
      const progressInQuarter = actualProgressInYear - start;
      const mappedPercent = Math.round((progressInQuarter / rangeSize) * 100);
      return Math.min(100, Math.max(0, mappedPercent));
    }
  }
  
  return donePercent;
};

// ============================
// QUARTER UTILITY FUNCTIONS
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

// Get quarter ranges based on which specific quarters are valid
const getQuarterRanges = (validQuartersList, targetQuarter) => {
  const validQuartersCount = validQuartersList.length;
  const targetQuarterIndex = getQuarterIndex(targetQuarter);
  
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
    
    // Create ranges for valid quarters
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
    // 2 quarters valid - equal 50% each
    // Create ranges for the specific valid quarters
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

// Filter issues by period - STRICT VERSION
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

// Check if issue has exactly 1 level of parent hierarchy
const checkOneLevelHierarchy = async (issue) => {
  // Check if issue has a parent
  if (!issue.parent || !issue.parent.id) {
    return false; // No parent, so not 1-level hierarchy
  }
  
  try {
    // Fetch parent issue
    const parentIssue = await cachedGetIssue(issue.parent.id);
    if (!parentIssue) return false;
    
    // Check if parent has NO parent (making it 1 level deep)
    if (!parentIssue.parent || !parentIssue.parent.id) {
      // Exactly 1 level deep: issue -> parent (and parent has no parent)
      return true;
    }
    
    // Parent has a parent, so it's more than 1 level
    return false;
    
  } catch (error) {
    console.error(`Error checking 1-level hierarchy for issue ${issue.id}:`, error);
    return false;
  }
};

// Check if issue has exactly 2 levels of parent hierarchy
const checkTwoLevelHierarchy = async (issue) => {
  // Check if issue has a parent
  if (!issue.parent || !issue.parent.id) {
    return false; // No parent, so not 2-level hierarchy
  }
  
  try {
    // Fetch parent issue
    const parentIssue = await cachedGetIssue(issue.parent.id);
    if (!parentIssue) return false;
    
    // Check if parent has a parent (making it 2 levels deep)
    if (parentIssue.parent && parentIssue.parent.id) {
      // This is 2 levels deep: issue -> parent -> grandparent
      // Fetch grandparent to confirm it doesn't have a parent (optional)
      const grandParentIssue = await cachedGetIssue(parentIssue.parent.id);
      if (grandParentIssue && grandParentIssue.parent) {
        // If grandparent also has a parent, it's more than 2 levels
        return false;
      }
      
      // Exactly 2 levels deep
      return true;
    }
    
    // Parent has no parent, so it's only 1 level deep
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
    
    // Get ALL issues assigned to the logged-in user
    const userAssignedIssues = await getIssuesAssigned(currentUserId);
    console.log(`Found ${userAssignedIssues.length} total issues assigned to user ${currentUserId}`);
    
    // Filter to find ALL sub-issues of this parent (direct children)
    // DON'T filter by hierarchy level - include ALL child issues
    const subIssues = [];
    
    for (const issue of userAssignedIssues) {
      // Check if this issue is a direct child of the parent issue
      if (issue.parent && issue.parent.id === parentIssue.id) {
        console.log(`Found child issue #${issue.id} of parent #${parentIssue.id}`);
        subIssues.push(issue);
      }
    }
    
    console.log(`Found ${subIssues.length} sub-issues for parent issue #${parentIssue.id}`);
    
    subIssuesCache.set(cacheKey, subIssues);
    
    // Cache for 5 minutes
    setTimeout(() => {
      subIssuesCache.delete(cacheKey);
    }, 5 * 60 * 1000);
    
    return subIssues;
  } catch (error) {
    console.error(`Error getting sub-issues for parent ${parentIssue.id}:`, error);
    return [];
  }
};

// Calculate Actual Weight for a 1-Level Issue WITH PERIOD-BASED PROGRESS MAPPING
const calculateActualWeight = async (oneLevelIssue, currentUserId, selectedPeriod) => {
  const issueWeight = getWeight(oneLevelIssue);
  console.log(`Calculating actual weight for 1-level issue #${oneLevelIssue.id} (weight: ${issueWeight}) for period: ${selectedPeriod}`);
  
  // Get ALL sub-issues (child issues) assigned to the same user
  const subIssues = await getSubIssuesForUser(oneLevelIssue, currentUserId);
  
  console.log(`Found ${subIssues.length} sub-issues for issue #${oneLevelIssue.id}`);
  
  if (subIssues.length === 0) {
    // If no sub-issues assigned to user, actual weight = 0
    console.log(`No sub-issues found for issue #${oneLevelIssue.id}, actual weight = 0`);
    return {
      issueWeight,
      actualWeight: 0,
      subIssuesCount: 0,
      avgSubIssuesMappedPercent: 0,
      avgSubIssuesRawPercent: 0,
      hasSubIssues: false
    };
  }
  
  // Calculate average of mapped progress percentages (with quarter logic)
  let totalMappedPercent = 0;
  let totalRawPercent = 0;
  let validSubIssuesCount = 0;
  const subIssuesDetails = [];
  
  subIssues.forEach((subIssue, index) => {
    const rawDonePercent = subIssue.done_ratio || 0;
    
    // Apply period-based progress mapping - pass the SUB-ISSUE itself
    const mappedDonePercent = mapSubIssueProgress(rawDonePercent, selectedPeriod, subIssue);
    
    console.log(`Sub-issue #${index + 1}: #${subIssue.id} - raw: ${rawDonePercent}%, mapped: ${mappedDonePercent}%`);
    console.log(`  Sub-issue subject: ${subIssue.subject}`);
    
    // Check sub-issue's quarter values for debugging
    const quarters = ["1ኛ ሩብዓመት", "2ኛ ሩብዓመት", "3ኛ ሩብዓመት", "4ኛ ሩብዓመት"];
    const validQuarters = quarters.filter(q => hasValidQuarterValue(subIssue, q));
    console.log(`  Valid quarters for sub-issue: ${validQuarters.join(', ')} (${validQuarters.length} quarters)`);
    
    if (rawDonePercent !== undefined && rawDonePercent !== null) {
      totalRawPercent += rawDonePercent;
      totalMappedPercent += mappedDonePercent;
      validSubIssuesCount++;
      
      subIssuesDetails.push({
        id: subIssue.id,
        subject: subIssue.subject,
        rawDonePercent,
        mappedDonePercent,
        weight: getWeight(subIssue),
        validQuarters: validQuarters
      });
    }
  });
  
  const avgSubIssuesRawPercent = validSubIssuesCount > 0 
    ? totalRawPercent / validSubIssuesCount 
    : 0;
    
  const avgSubIssuesMappedPercent = validSubIssuesCount > 0 
    ? totalMappedPercent / validSubIssuesCount 
    : 0;
  
  console.log(`Average sub-issues - raw: ${avgSubIssuesRawPercent}%, mapped: ${avgSubIssuesMappedPercent}%`);
  
  // Calculate Actual Weight = (Issue Weight × Avg Mapped Sub-Issues Done Percent) ÷ 100
  const actualWeight = (issueWeight * avgSubIssuesMappedPercent) / 100;
  
  console.log(`Actual weight calculation: (${issueWeight} × ${avgSubIssuesMappedPercent}) ÷ 100 = ${actualWeight}`);
  
  return {
    issueWeight,
    actualWeight,
    subIssuesCount: subIssues.length,
    avgSubIssuesRawPercent,
    avgSubIssuesMappedPercent,
    hasSubIssues: true,
    subIssuesDetails,
    mappingApplied: selectedPeriod !== "Yearly" // Flag if quarter mapping was applied
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
    const progress = issue.done_ratio || 0; // Use actual done ratio for 2-level
    totalWeight += weight;
    weightedProgress += progress * weight;
  });

  return totalWeight > 0 ? Math.round(weightedProgress / totalWeight) : 0;
};

// Calculate 1-Level Hierarchy Performance using Actual Weight formula WITH PERIOD MAPPING
const calculateOneLevelHierarchyPerformance = async (oneLevelIssues, currentUserId, period) => {
  if (oneLevelIssues.length === 0) return 0;
  
  let totalIssueWeight = 0;
  let totalActualWeight = 0;
  const issueDetails = [];
  
  console.log(`Calculating 1-level performance for ${oneLevelIssues.length} issues for period: ${period}`);
  
  // Calculate Actual Weight for each 1-Level Issue
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
      avgSubIssuesRawPercent: actualWeightData.avgSubIssuesRawPercent,
      avgSubIssuesMappedPercent: actualWeightData.avgSubIssuesMappedPercent,
      hasSubIssues: actualWeightData.hasSubIssues,
      subIssuesDetails: actualWeightData.subIssuesDetails || [],
      mappingApplied: actualWeightData.mappingApplied
    });
    
    console.log(`Issue #${issue.id}: weight=${issueWeight}, actualWeight=${actualWeightData.actualWeight}, subIssues=${actualWeightData.subIssuesCount}, mapping=${actualWeightData.mappingApplied ? 'Yes' : 'No'}`);
  }
  
  // Calculate performance: (Sum of Actual Weights × 100) / Sum of All Issue Weights
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
      // Continue with next issue
    }
  }
  
  return count;
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

  // Load all issues assigned to the logged-in user
  const loadAllAssignedIssues = useCallback(async (userId) => {
    if (!isMountedRef.current) return [];
    
    try {
      console.log("Fetching all issues assigned to user...");
      
      // Try using getIssuesAssignedToMe first (uses assigned_to_id=me)
      let assignedIssues = [];
      try {
        assignedIssues = await getIssuesAssignedToMe();
        console.log(`Found ${assignedIssues.length} issues via assigned_to_id=me`);
      } catch (error) {
        console.warn("getIssuesAssignedToMe failed, trying by full name...", error);
        
        // Fallback to getIssuesAssignedToMeByFullName
        assignedIssues = await getIssuesAssignedToMeByFullName();
        console.log(`Found ${assignedIssues.length} issues via full name match`);
      }
      
      if (assignedIssues.length === 0) {
        console.log("No assigned issues found");
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
    
    // Process all issues in parallel for both hierarchy levels
    const [oneLevelIssues, twoLevelIssues] = await Promise.all([
      batchProcessIssues(allIssues, processOneLevelIssue, 5),
      batchProcessIssues(allIssues, processTwoLevelIssue, 5)
    ]);
    
    console.log(`Found ${oneLevelIssues.length} issues with 1-level hierarchy`);
    console.log(`Found ${twoLevelIssues.length} issues with 2-level hierarchy`);
    
    // Update hierarchy info
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
      // Filter issues by period first
      const filteredOneLevelIssues = filterIssuesByPeriod(oneLevelIssues, period);
      console.log(`Filtered to ${filteredOneLevelIssues.length} 1-level issues for period: ${period}`);
      
      // Calculate 1-Level Performance using Actual Weight formula
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

  // Initial data load
  useEffect(() => {
    isMountedRef.current = true;
    abortControllerRef.current = new AbortController();

    async function loadInitialDashboardData() {
      if (!isMountedRef.current) return;
      
      setInitialLoading(true);
      setError(null);
      
      try {
        // 1. Load current user
        const currentUser = await getCurrentUser();
        if (!currentUser) {
          setError("Failed to load user data");
          setInitialLoading(false);
          return;
        }

        setUser(currentUser);
        console.log(`Logged in as: ${currentUser.firstname} ${currentUser.lastname} (ID: ${currentUser.id})`);
        
        // 2. Load all assigned issues
        const allAssigned = await loadAllAssignedIssues(currentUser.id);
        
        if (!isMountedRef.current) return;
        
        // Update total count
        setHierarchyInfo(prev => ({
          ...prev,
          totalAssignedIssues: allAssigned.length
        }));
        
        setAllAssignedIssues(allAssigned);
        
        // 3. Load hierarchy issues
        const { oneLevel, twoLevel } = await loadHierarchyIssues(allAssigned);
        
        if (!isMountedRef.current) return;
        
        setOneLevelHierarchyIssues(oneLevel);
        setTwoLevelHierarchyIssues(twoLevel);
        
        // 4. Calculate 1-Level Hierarchy Performance with Actual Weight
        const oneLevelPerformance = await calculateOneLevelPerformance(
          oneLevel, 
          currentUser.id, 
          selectedPeriod
        );
        
        setOneLevelPerformanceData(oneLevelPerformance);
        
        // 5. Count 1-level issues with sub-issues assigned to user
        const withSubIssuesCount = await countOneLevelIssuesWithAssignedSubIssues(
          oneLevel, 
          currentUser.id
        );
        
        setOneLevelWithSubIssuesCount(withSubIssuesCount);
        
        // 6. Extract unique statuses from all assigned issues
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
  }, [loadAllAssignedIssues, loadHierarchyIssues, calculateOneLevelPerformance, countOneLevelIssuesWithAssignedSubIssues]);

  // Recalculate performance when period or filter changes
  useEffect(() => {
    if (initialLoading) return; // Skip if initial data hasn't loaded yet
    
    async function recalculatePerformance() {
      setLoading(true);
      
      try {
        if (user && oneLevelHierarchyIssues.length > 0) {
          // Recalculate 1-Level Performance
          const oneLevelPerformance = await calculateOneLevelPerformance(
            oneLevelHierarchyIssues, 
            user.id, 
            selectedPeriod
          );
          
          setOneLevelPerformanceData(oneLevelPerformance);
        }
      } catch (error) {
        console.error("Error recalculating performance:", error);
      } finally {
        setLoading(false);
      }
    }
    
    recalculatePerformance();
  }, [selectedPeriod, filterStatus, initialLoading, user, oneLevelHierarchyIssues, calculateOneLevelPerformance]);

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

  // Calculate 2-Level Hierarchy Performance (uses weighted average)
  const twoLevelHierarchyPerformance = useMemo(() => {
    return calculateTwoLevelHierarchyPerformance(filteredTwoLevelIssues, selectedPeriod);
  }, [filteredTwoLevelIssues, selectedPeriod]);

  // Prepare chart data for 2-level hierarchy issues (showing 2-level in detailed analysis)
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
        const validQuartersList = getValidQuartersList(issue);
        const validQuartersCount = validQuartersList.length;
        
        const displayText = `#${issue.id}: ${issue.subject}`;
        const truncatedDisplay = displayText.length > 60 
          ? displayText.substring(0, 57) + "..." 
          : displayText;
        
        const progress = issue.done_ratio || 0;
        
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
          quarterDistribution: getQuarterDistributionInfo(issue, selectedPeriod),
          hierarchyLevel: issue.hierarchyLevel || 2
        });
      }
    });

    const data = Array.from(chartDataMap.values());
    return data.sort((a, b) => b.progress - a.progress);
  }, [filteredTwoLevelIssues, selectedPeriod]);

  // Dynamic chart height
  const chartHeight = Math.max(400, chartData.length * 60);

  // Prepare table data for 2-level hierarchy issues
  const tableData = useMemo(() => {
    const validIssues = filteredTwoLevelIssues.filter(issue => {
      const targetValue = getTargetValue(issue, selectedPeriod);
      return isValidTargetValue(targetValue, selectedPeriod);
    });
    
    return validIssues.map(issue => {
      const targetValue = getTargetValue(issue, selectedPeriod);
      const progress = issue.done_ratio || 0;
      const weight = getWeight(issue);
      const targetValueNum = parseFloat(targetValue) || 0;
      const actualValue = targetValueNum > 0 ? ((progress / 100) * targetValueNum).toFixed(2) : "0.00";
      
      return {
        id: issue.id,
        subject: issue.subject,
        status: issue.status?.name || "Unknown",
        assignedTo: issue.assigned_to?.name || "Unassigned",
        targetValue: targetValue,
        actualValue: actualValue,
        progress: progress,
        weight: weight,
        doneRatio: issue.done_ratio || 0,
        tracker: issue.tracker?.name || "Unknown",
        hasValidTarget: true,
        hierarchyLevel: issue.hierarchyLevel || 2
      };
    });
  }, [filteredTwoLevelIssues, selectedPeriod]);

  const handleRefresh = async () => {
    // Clear caches
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
      
      // Reload all data
      const allAssigned = await loadAllAssignedIssues(currentUser.id);
      setAllAssignedIssues(allAssigned);
      
      const { oneLevel, twoLevel } = await loadHierarchyIssues(allAssigned);
      setOneLevelHierarchyIssues(oneLevel);
      setTwoLevelHierarchyIssues(twoLevel);
      
      // Recalculate 1-Level Performance
      const oneLevelPerformance = await calculateOneLevelPerformance(
        oneLevel, 
        currentUser.id, 
        selectedPeriod
      );
      setOneLevelPerformanceData(oneLevelPerformance);
      
      // Count 1-level issues with sub-issues assigned to user
      const withSubIssuesCount = await countOneLevelIssuesWithAssignedSubIssues(
        oneLevel, 
        currentUser.id
      );
      
      setOneLevelWithSubIssuesCount(withSubIssuesCount);
      
      // Update statuses
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
        {hierarchyInfo.totalAssignedIssues > 0 && !hierarchyInfo.hierarchyValidated && (
          <div style={{
            marginTop: '20px',
            padding: '10px 20px',
            backgroundColor: '#e3f2fd',
            borderRadius: '8px',
            fontSize: '14px',
            color: '#1565c0'
          }}>
            <p>Found {hierarchyInfo.totalAssignedIssues} assigned issues</p>
            <p>Calculating Actual Weight for 1-Level Issues...</p>
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
      
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '30px',
        flexWrap: 'wrap',
        gap: '20px'
      }}>
        <div>
          <h1 style={{ margin: 0, color: '#333', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '28px' }}>📊</span>
            Dashboard
          </h1>
        </div>
        <div style={{ 
          fontSize: '14px', 
          color: '#666', 
          backgroundColor: '#f0f7ff',
          padding: '8px 16px',
          borderRadius: '20px',
          fontWeight: '500',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <span style={{ fontSize: '18px' }}>👤</span>
          {user && `${user.firstname} ${user.lastname}`}
        </div>
      </div>

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
          <div style={{ fontSize: '11px', color: '#888', marginTop: '5px' }}>Issue → Parent (no further parent)</div>
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
          <div style={{ fontSize: '11px', color: '#888', marginTop: '5px' }}>1-Level issues with sub-issues assigned to you</div>
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
          <div style={{ fontSize: '11px', color: '#888', marginTop: '5px' }}>Issue → Parent → Grandparent</div>
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
          
          {/* Dual Performance Bars */}
          <div style={{ marginBottom: '40px' }}>
            <h3 style={{ 
              marginBottom: '20px', 
              color: '#333', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px'
            }}>
              <span style={{ fontSize: '20px' }}>📈</span>
              Performance Comparison
            </h3>
            
            {/* 1-Level Hierarchy Issues Performance - Changed text */}
            <div style={{ marginBottom: '30px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ fontWeight: "bold", fontSize: "16px", color: '#333', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '12px', height: '12px', backgroundColor: '#2196F3', borderRadius: '2px' }}></div>
                  Performance based on assigned ዝርዝር ተግባራት
                </div>
                <div style={{ 
                  fontSize: '14px', 
                  color: '#666', 
                  backgroundColor: '#e3f2fd',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}>
                  {loading ? (
                    <>
                      <div style={{
                        width: '12px',
                        height: '12px',
                        border: '2px solid #f3f3f3',
                        borderTop: '2px solid #3498db',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                      }}></div>
                      Calculating...
                    </>
                  ) : (
                    `${oneLevelPerformanceData.performance}% • ${filteredOneLevelIssues.length} issues`
                  )}
                </div>
              </div>
              
              <div style={{
                width: "100%",
                backgroundColor: "#f0f0f0",
                borderRadius: "8px",
                overflow: "hidden",
                height: "30px",
                position: 'relative'
              }}>
                <div
                  style={{
                    width: `${oneLevelPerformanceData.performance || 0}%`,
                    backgroundColor: '#2196F3',
                    height: "100%",
                    textAlign: "center",
                    color: "#fff",
                    fontWeight: "bold",
                    lineHeight: "30px",
                    transition: 'width 0.8s ease',
                    position: 'relative'
                  }}
                >
                  <div style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontWeight: 'bold',
                    fontSize: '12px'
                  }}>
                    {oneLevelPerformanceData.performance}%
                  </div>
                </div>
              </div>
              
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: '5px',
                padding: '0 5px',
                fontSize: '11px',
                color: '#666'
              }}>
                <span>Formula: Actual Weight = (Issue Weight × Avg Sub-Issues Done %) ÷ 100</span>
                <span>Performance = (∑Actual Weight × 100) ÷ ∑Issue Weight</span>
              </div>
              
              <div style={{
                marginTop: '10px',
                padding: '10px',
                backgroundColor: '#f9f9f9',
                borderRadius: '6px',
                fontSize: '11px',
                color: '#666',
                borderLeft: '3px solid #2196F3'
              }}>
                <strong>Note:</strong> "Avg Sub-Issues Done %" uses quarter-based progress mapping based on <strong>sub-issue's</strong> valid quarters.
              </div>
              
              {/* 1-Level Performance Details - Changed text */}
              <div style={{
                marginTop: '15px',
                padding: '15px',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                border: '1px solid #e0e0e0'
              }}>
                <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '10px', color: '#333' }}>
                  Performance Calculation Details:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', fontSize: '12px' }}>
                  <div>
                    <span style={{ color: '#666' }}>Total Issue Weight:</span>
                    <span style={{ fontWeight: 'bold', marginLeft: '5px' }}>
                      {oneLevelPerformanceData.totalIssueWeight.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#666' }}>Total Actual Weight:</span>
                    <span style={{ fontWeight: 'bold', marginLeft: '5px' }}>
                      {oneLevelPerformanceData.totalActualWeight.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#666' }}>Weight Ratio:</span>
                    <span style={{ fontWeight: 'bold', marginLeft: '5px' }}>
                      {oneLevelPerformanceData.totalIssueWeight > 0 
                        ? Math.round((oneLevelPerformanceData.totalActualWeight / oneLevelPerformanceData.totalIssueWeight) * 100) 
                        : 0}%
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#666' }}>Filtered Issues:</span>
                    <span style={{ fontWeight: 'bold', marginLeft: '5px' }}>
                      {filteredOneLevelIssues.length}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#666' }}>Period Mapping:</span>
                    <span style={{ fontWeight: 'bold', marginLeft: '5px' }}>
                      {selectedPeriod !== 'Yearly' ? 'Quarter-based' : 'None'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* 2-Level Hierarchy Issues Performance - Changed text */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ fontWeight: "bold", fontSize: "16px", color: '#333', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '12px', height: '12px', backgroundColor: '#9C27B0', borderRadius: '2px' }}></div>
                  Performance based on assigned የግል እቅድ
                </div>
                <div style={{ 
                  fontSize: '14px', 
                  color: '#666', 
                  backgroundColor: '#f3e5f5',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontWeight: '500'
                }}>
                  {twoLevelHierarchyPerformance}% • {filteredTwoLevelIssues.length} issues
                </div>
              </div>
              
              <div style={{
                width: "100%",
                backgroundColor: "#f0f0f0",
                borderRadius: "8px",
                overflow: "hidden",
                height: "30px",
                position: 'relative'
              }}>
                <div
                  style={{
                    width: `${twoLevelHierarchyPerformance || 0}%`,
                    backgroundColor: '#9C27B0',
                    height: "100%",
                    textAlign: "center",
                    color: "#fff",
                    fontWeight: "bold",
                    lineHeight: "30px",
                    transition: 'width 0.8s ease',
                    position: 'relative'
                  }}
                >
                  <div style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontWeight: 'bold',
                    fontSize: '12px'
                  }}>
                    {twoLevelHierarchyPerformance}%
                  </div>
                </div>
              </div>
              
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: '5px',
                padding: '0 5px',
                fontSize: '11px',
                color: '#666'
              }}>
                <span>Uses weighted average based on issue weights</span>
                <span>Performance = (∑(Weight × Done %) ÷ ∑Weight) × 100</span>
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
                          const quarterInfo = data.quarterDistribution;
                          const targetValueNum = parseFloat(data.targetValue) || 0;
                          const actualValue = targetValueNum > 0 ? ((data.progress / 100) * targetValueNum).toFixed(2) : "0.00";
                          
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
                              
                              {/* Hierarchy Info */}
                              <div style={{
                                marginBottom: '10px',
                                padding: '8px',
                                backgroundColor: '#e3f2fd',
                                borderRadius: '6px',
                                fontSize: '12px',
                                borderLeft: '3px solid #1976d2'
                              }}>
                                <div style={{ fontWeight: 'bold', color: '#1976d2' }}>
                                  <span style={{ fontSize: '14px', marginRight: '5px' }}>↳↳</span>
                                  2-Level Hierarchy Confirmed
                                </div>
                                <div style={{ fontSize: '11px', color: '#555', marginTop: '3px' }}>
                                  Issue → Parent → Grandparent
                                </div>
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
                                  <span style={{ color: '#666', fontSize: '12px' }}>Actual Value</span>
                                  <span style={{ 
                                    fontWeight: 'bold', 
                                    color: '#4CAF50',
                                    fontSize: '16px'
                                  }}>
                                    {actualValue}
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
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                                      <span>Range for {selectedPeriod}:</span>
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
                        formatter={(value) => `${value}%`} 
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
                        {tableData.reduce((sum, row) => sum + row.weight, 0)}
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