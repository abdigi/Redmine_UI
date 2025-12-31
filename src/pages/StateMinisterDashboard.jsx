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

  // Memoized progress calculation
  const mapProgress = useCallback((done, period) => {
    if (period === "Yearly") return done;
    if (period === "6 Months") return done <= 50 ? Math.round((done / 50) * 100) : 100;
    if (period === "9 Months") return done <= 75 ? Math.round((done / 75) * 100) : 100;
    switch (period) {
      case "1ኛ ሩብዓመት": return done <= 25 ? Math.round((done / 25) * 100) : 100;
      case "2ኛ ሩብዓመት": return done >= 26 && done <= 50 ? Math.round(((done - 26) / 24) * 100) : done > 50 ? 100 : 0;
      case "3ኛ ሩብዓመት": return done >= 51 && done <= 75 ? Math.round(((done - 51) / 24) * 100) : done > 75 ? 100 : 0;
      case "4ኛ ሩብዓመት": return done >= 76 && done <= 100 ? Math.round(((done - 76) / 24) * 100) : done === 100 ? 100 : 0;
      default: return 0;
    }
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

  // Load data with caching support
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
          const goalsWithProgress = await Promise.all(
            goals.map(async (goal, goalIndex) => {
              const issues = await getProjectIssues({ 
                project_id: goal.id, 
                status_id: "*" 
              }).catch(() => []);
              
              const topIssues = issues.filter((i) => !i.parent);
              const progress = topIssues.length > 0
                ? Math.round(
                    topIssues.reduce(
                      (sum, issue) => sum + mapProgress(issue.done_ratio, selectedPeriod),
                      0
                    ) / topIssues.length
                  )
                : 0;

              const status = getGoalStatus(progress);
              return { 
                ...goal, 
                progress, 
                issues: topIssues, 
                status,
                displayName: `${String.fromCharCode(65 + goalIndex)}. ${goal.name}`
              };
            })
          );

          // Calculate department progress
          const depTopIssues = depIssues.filter((i) => !i.parent);
          const depProgress = depTopIssues.length > 0
            ? Math.round(
                depTopIssues.reduce(
                  (sum, issue) => sum + mapProgress(issue.done_ratio, selectedPeriod),
                  0
                ) / depTopIssues.length
              )
            : 0;

          return {
            ...dep,
            displayName: `${index + 1}. ${dep.name}`,
            goals: goalsWithProgress,
            avgProgress: depProgress,
            directIssues: depTopIssues,
          };
        } catch (err) {
          console.error(`Error loading department ${dep.name}:`, err);
          return { 
            ...dep, 
            displayName: `${index + 1}. ${dep.name}`,
            goals: [], 
            avgProgress: 0, 
            directIssues: [] 
          };
        }
      });

      const departmentData = await Promise.all(departmentPromises);

      // Sort departments by progress
      const sortedDepartments = [...departmentData].sort(
        (a, b) => b.avgProgress - a.avgProgress
      );

      // Calculate overall statistics
      const allGoals = departmentData.flatMap(dep => dep.goals);
      const allIssues = departmentData.flatMap(dep => [
        ...dep.directIssues,
        ...dep.goals.flatMap(goal => goal.issues)
      ]);

      const statusDistribution = allGoals.reduce((acc, goal) => {
        const status = goal.status.label;
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});

      const totalProgress = departmentData.reduce((sum, dep) => sum + dep.avgProgress, 0);
      const avgProgress = departments.length > 0 
        ? Math.round(totalProgress / departments.length) 
        : 0;

      setStats({
        totalGoals: allGoals.length,
        completedGoals: allGoals.filter(g => g.progress >= 95).length,
        totalIssues: allIssues.length,
        avgProgress,
        statusDistribution,
      });

      setBestDepartment(sortedDepartments[0] || null);
      setDepartments(sortedDepartments);
    } catch (err) {
      console.error("Error loading dashboard data:", err);
      setError("Failed to load dashboard data. Please try again.");
      setDepartments([]);
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod, mapProgress, getGoalStatus]);

  // Load data on mount and when period changes
  useEffect(() => {
    loadData();
  }, [loadData]);

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
  }, []);

  const handleGoalClick = useCallback((goal) => {
    setSelectedGoalId(goal.id);
    setGoalIssues(goal.issues || []);
  }, []);

  const handleBackToDepartments = useCallback(() => {
    setSelectedDepartmentId(null);
    setSelectedGoalId(null);
    setGoalIssues([]);
  }, []);

  const handleBackToGoals = useCallback(() => {
    setSelectedGoalId(null);
    setGoalIssues([]);
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

  // Memoized data transformations
  const selectedDepartment = useMemo(() => 
    departments.find(dep => dep.id === selectedDepartmentId),
    [departments, selectedDepartmentId]
  );

  const selectedGoal = useMemo(() => 
    selectedDepartment?.goals.find(g => g.id === selectedGoalId),
    [selectedDepartment, selectedGoalId]
  );

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

  // Calculate sector statistics
  const sectorStats = useMemo(() => {
    if (!departments.length) return { totalDepartments: 0, activeDepartments: 0, completedDepartments: 0 };
    
    return {
      totalDepartments: departments.length,
      activeDepartments: departments.filter(d => d.avgProgress > 0 && d.avgProgress < 100).length,
      completedDepartments: departments.filter(d => d.avgProgress >= 95).length,
      strugglingDepartments: departments.filter(d => d.avgProgress < 50).length,
    };
  }, [departments]);

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="custom-tooltip">
          <p className="tooltip-label"><strong>{label}</strong></p>
          <p className="tooltip-value">Progress: {payload[0].value}%</p>
        </div>
      );
    }
    return null;
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

  if (departments.length === 0) {
    return (
      <div className="info-alert">
        <p>No projects assigned to you. Please contact your administrator.</p>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-left">
          
          <p className="subtitle">Overview of departmental performance and goal progress</p>
        </div>
        <div className="header-controls">
          <div className="period-selector">
            <label>Period:</label>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
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
            <Icons.Refresh /> Refresh
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      {!selectedDepartmentId && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Total Goals</div>
            <div className="stat-value">{stats.totalGoals}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Completed Goals</div>
            <div className="stat-value completed">{stats.completedGoals}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Overall Progress</div>
            <div className="stat-value progress">{stats.avgProgress}%</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Issues</div>
            <div className="stat-value issues">{stats.totalIssues}</div>
          </div>
        </div>
      )}

      {/* Best Performer */}
      {bestDepartment && !selectedDepartmentId && (
        <div className="best-performer">
          <div className="best-performer-content">
            <div className="best-performer-left">
              <h3><span className="trophy">🏆</span> Best Performing Department</h3>
              <h2>{bestDepartment.displayName}</h2>
              <p>Average Progress: <strong>{bestDepartment.avgProgress}%</strong></p>
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

      {/* Main Content Tabs */}
      {!selectedDepartmentId && (
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
              <h3>Department Performance</h3>
              <div className="chart-container">
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
                          fill={getGoalStatus(entry.avgProgress).color}
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
              </div>
            </div>
          )}

          {activeTab === 1 && (
            <div className="chart-card">
              <h3>Goal Status Distribution</h3>
              <div className="status-grid">
                <div className="pie-chart-container">
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
              <p>Department Goals and Progress</p>
            </div>
            <div className="department-progress">
              <span>Avg: {selectedDepartment.avgProgress}%</span>
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
                  <Tooltip />
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
                        fill={entry.status.color}
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
              <p>No goals found for this department.</p>
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
                  Progress: {selectedGoal.progress}%
                </span>
              </div>
            </div>
          </div>

          {goalIssues.length > 0 ? (
            <div className="issues-chart-container">
              <ResponsiveContainer width="100%" height={Math.max(400, goalIssues.length * 40)}>
                <BarChart
                  layout="vertical"
                  data={goalIssues.map((issue) => ({
                    ...issue,
                    progress: mapProgress(issue.done_ratio, selectedPeriod),
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
                  <Tooltip
                    formatter={(value, name, props) => [
                      `${value}% — Status: ${props.payload.status?.name || ""}`,
                      "Progress",
                    ]}
                  />
                  <Bar 
                    dataKey="progress" 
                    barSize={25}
                    radius={[4, 4, 0, 0]}
                    stroke="#ffffff"
                    strokeWidth={1}
                  >
                    {goalIssues.map((entry, index) => {
                      const progress = mapProgress(entry.done_ratio, selectedPeriod);
                      const status = getGoalStatus(progress);
                      return (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={status.color}
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
              <p>No issues found for this goal.</p>
            </div>
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
                    Progress: <strong>{department.avgProgress}%</strong>
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

      {/* Department Performance Summary Box */}
      {!selectedDepartmentId && departments.length > 0 && (
        <div className="department-summary-box">
          <div className="summary-header">
            <h3><Icons.Building /> Department Performance Summary</h3>
            <div className="total-departments">
              <span className="total-count">{departments.length}</span>
              <span className="total-label">Total Departments</span>
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
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="dashboard-footer">
        <p>
          Last updated: {new Date().toLocaleString()} • Data period: {selectedPeriod}
        </p>
      </div>
    </div>
  );
}