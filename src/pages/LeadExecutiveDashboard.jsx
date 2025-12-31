import React, { useEffect, useState } from "react";
import {
  getCurrentUser,
  getMyMainProjectsWithSubprojects,
  getProjects,
  getProjectIssues,
  getExpertsForTeamUser,
  getWatchedOneLevelIssuesByUser,
} from "../api/redmineApi";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LabelList,
  Legend
} from "recharts";

export default function LeadExecutiveDashboard() {
  const [departments, setDepartments] = useState([]);
  const [teamGroups, setTeamGroups] = useState([]);
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState({
    overall: true,
    departments: false,
    teams: false
  });
  const [kpis, setKpis] = useState({
    totalGoals: 0,
    avgGoalPerformance: 0,
    totalWatchedIssues: 0,
    totalTeamMembers: 0
  });
  const [activeTab, setActiveTab] = useState('departments');
  const [expandedDepartment, setExpandedDepartment] = useState(null);
  
  const [selectedPeriod, setSelectedPeriod] = useState("Yearly");
  const [filteredDepartmentData, setFilteredDepartmentData] = useState([]);
  const [filteredTeamData, setFilteredTeamData] = useState([]);

  // -------------------------
  // HELPERS
  // -------------------------
  function getWeight(issue) {
    const field = issue.custom_fields?.find((f) => f.name === "ክብደት");
    return Number(field?.value) || 0;
  }

  const mapProgress = (done, period) => {
    if (period === "Yearly") return done;
    if (period === "6 Months") return done <= 50 ? Math.round((done / 50) * 100) : 100;
    if (period === "9 Months") return done <= 75 ? Math.round((done / 75) * 100) : 100;

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
  };

  const filterIssuesByPeriod = (issues) => {
    if (selectedPeriod === "Yearly") return issues;

    return issues.filter((issue) => {
      const getField = (q) => issue.custom_fields?.find((f) => f.name === q)?.value;

      if (selectedPeriod === "6 Months") {
        return getField("1ኛ ሩብዓመት") || getField("2ኛ ሩብዓመት");
      }

      if (selectedPeriod === "9 Months") {
        return getField("1ኛ ሩብዓመት") || getField("2ኛ ሩብዓመት") || getField("3ኛ ሩብዓመት");
      }

      const val = getField(selectedPeriod);
      return val && val !== "0" && val !== "";
    });
  };

  function calculateWeightedPerformance(issues, period = "Yearly") {
    let totalWeight = 0;
    let weightedProgress = 0;
    
    const filteredIssues = period === "Yearly" ? issues : filterIssuesByPeriod(issues);
    
    filteredIssues.forEach((issue) => {
      const weight = getWeight(issue);
      totalWeight += weight;
      weightedProgress += weight * mapProgress(issue.done_ratio || 0, period);
    });
    
    if (totalWeight === 0) return 0;
    return Math.round(weightedProgress / totalWeight);
  }

  const getStatusColor = (doneRatio) => {
    if (doneRatio === 0) return '#f44336';
    if (doneRatio < 100) return '#ff9800';
    return '#4caf50';
  };

  const getStatusText = (doneRatio) => {
    if (doneRatio === 0) return 'Not Started';
    if (doneRatio < 100) return 'In Progress';
    return 'Done';
  };

  const calculateKPIs = (depts, teams, period = "Yearly") => {
    let totalGoals = 0;
    let totalPerf = 0;
    let totalWatchedIssues = 0;
    let totalTeamMembers = 0;

    depts.forEach(dept => {
      totalGoals += dept.goals.length;
      dept.goals.forEach(goal => {
        totalPerf += calculateWeightedPerformance(goal.issues, period);
      });
    });

    teams.forEach(team => {
      totalTeamMembers += team.users.length;
      team.users.forEach(user => {
        const periodIssues = period === "Yearly" 
          ? user.watchedIssues 
          : filterIssuesByPeriod(user.watchedIssues || []);
        totalWatchedIssues += periodIssues?.length || 0;
      });
    });

    setKpis({
      totalGoals,
      avgGoalPerformance: totalGoals > 0 ? Math.round(totalPerf / totalGoals) : 0,
      totalWatchedIssues,
      totalTeamMembers
    });
  };

  const prepareFilteredData = (departments, teams, period) => {
    const filteredDepts = departments.map(dept => ({
      ...dept,
      goals: dept.goals.map(goal => {
        const filteredIssues = period === "Yearly" 
          ? goal.issues 
          : filterIssuesByPeriod(goal.issues);
        
        return {
          ...goal,
          issues: filteredIssues,
          performance: calculateWeightedPerformance(goal.issues, period),
          issueChartData: prepareIssueChartData(filteredIssues, period),
          statusSummary: {
            notStarted: filteredIssues.filter(i => i.done_ratio === 0).length,
            inProgress: filteredIssues.filter(i => i.done_ratio > 0 && i.done_ratio < 100).length,
            done: filteredIssues.filter(i => i.done_ratio === 100).length
          }
        };
      })
    }));

    const filteredTeams = teams.map(team => ({
      ...team,
      users: team.users.map(user => {
        const filteredWatchedIssues = period === "Yearly" 
          ? user.watchedIssues 
          : filterIssuesByPeriod(user.watchedIssues || []);
        
        return {
          ...user,
          watchedIssues: filteredWatchedIssues,
          performance: calculateWeightedPerformance(user.watchedIssues || [], period),
          issueChartData: prepareIssueChartData(filteredWatchedIssues, period)
        };
      })
    }));

    setFilteredDepartmentData(filteredDepts);
    setFilteredTeamData(filteredTeams);
    calculateKPIs(filteredDepts, filteredTeams, period);
  };

  const prepareIssueChartData = (issues, period = "Yearly") => {
    const filteredIssues = period === "Yearly" ? issues : filterIssuesByPeriod(issues);
    
    return filteredIssues.map(issue => ({
      name: issue.subject.length > 20 ? issue.subject.substring(0, 20) + '...' : issue.subject,
      progress: mapProgress(issue.done_ratio || 0, period),
      weight: getWeight(issue),
      status: getStatusText(issue.done_ratio),
      fullSubject: issue.subject,
      id: issue.id,
      originalProgress: issue.done_ratio || 0
    }));
  };

  useEffect(() => {
    async function fetchData() {
      setLoading({ overall: true, departments: false, teams: false });
      
      try {
        const user = await getCurrentUser();
        if (!user) return;

        setLoading(prev => ({ ...prev, departments: true }));
        const [mainProjects, allProjects] = await Promise.all([
          getMyMainProjectsWithSubprojects(),
          getProjects()
        ]);

        const deptWithGoals = await Promise.all(
          mainProjects.map(async (mainProject) => {
            const subprojects = allProjects.filter(
              (p) => p.parent?.id === mainProject.id
            );

            const goals = await Promise.all(
              subprojects.map(async (goal) => {
                const issues = await getProjectIssues({ project_id: goal.id });
                const rootIssues = issues.filter((i) => !i.parent);
                const statusSummary = {
                  notStarted: rootIssues.filter(i => i.done_ratio === 0).length,
                  inProgress: rootIssues.filter(i => i.done_ratio > 0 && i.done_ratio < 100).length,
                  done: rootIssues.filter(i => i.done_ratio === 100).length
                };
                return {
                  id: goal.id,
                  name: goal.name,
                  issues: rootIssues,
                  performance: calculateWeightedPerformance(rootIssues),
                  statusSummary,
                  issueChartData: prepareIssueChartData(rootIssues)
                };
              })
            );

            return { department: mainProject, goals };
          })
        );

        setDepartments(deptWithGoals);
        setFilteredDepartmentData(deptWithGoals);
        setLoading(prev => ({ ...prev, departments: false }));

        setLoading(prev => ({ ...prev, teams: true }));
        const teamField = user.custom_fields?.find((f) => f.name === "Team");
        const teamNames = Array.isArray(teamField?.value) ? teamField.value : [];

        const groupsData = await Promise.all(
          teamNames.map(async (teamName) => {
            const users = await getExpertsForTeamUser(teamName);

            const usersWithIssues = await Promise.all(
              users.map(async (u) => {
                const watchedIssues = await getWatchedOneLevelIssuesByUser(u.id);
                const performance = calculateWeightedPerformance(watchedIssues);
                return { 
                  ...u, 
                  watchedIssues, 
                  performance,
                  issueChartData: prepareIssueChartData(watchedIssues)
                };
              })
            );

            return { name: teamName, users: usersWithIssues };
          })
        );

        setTeamGroups(groupsData);
        setFilteredTeamData(groupsData);
        calculateKPIs(deptWithGoals, groupsData);
        setLoading(prev => ({ ...prev, teams: false, overall: false }));

      } catch (err) {
        console.error("Dashboard fetch error:", err);
        setLoading({ overall: false, departments: false, teams: false });
      }
    }

    fetchData();
  }, []);

  useEffect(() => {
    if (departments.length > 0 && teamGroups.length > 0) {
      prepareFilteredData(departments, teamGroups, selectedPeriod);
    }
  }, [selectedPeriod, departments, teamGroups]);

  const LoadingSpinner = ({ text = "Loading..." }) => (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      padding: '40px',
      minHeight: '200px'
    }}>
      <div style={{
        width: '50px',
        height: '50px',
        border: '5px solid #f3f3f3',
        borderTop: '5px solid #1976D2',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        marginBottom: '20px'
      }}></div>
      <p style={{ color: '#666' }}>{text}</p>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );

  const ProgressBar = ({ value, max = 100, color = '#1976D2', height = 8 }) => (
    <div style={{
      width: '100%',
      backgroundColor: '#f0f0f0',
      borderRadius: '4px',
      overflow: 'hidden'
    }}>
      <div style={{
        width: `${(value / max) * 100}%`,
        backgroundColor: color,
        height: `${height}px`,
        borderRadius: '4px',
        transition: 'width 0.3s ease'
      }}></div>
    </div>
  );

  const KPICard = ({ title, value, color, isLoading = false }) => (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '12px',
      padding: '24px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
      textAlign: 'center',
      transition: 'transform 0.2s, box-shadow 0.2s',
      cursor: 'pointer',
      position: 'relative',
      overflow: 'hidden'
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.transform = 'translateY(-4px)';
      e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.12)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
    }}
    >
      {isLoading ? (
        <div style={{ height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: '30px',
            height: '30px',
            border: '3px solid #f3f3f3',
            borderTop: '3px solid' + color,
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }}></div>
        </div>
      ) : (
        <>
          <h3 style={{ margin: '0', color: '#666', fontSize: '14px', fontWeight: '500' }}>{title}</h3>
          <p style={{ fontSize: '2.5rem', margin: '15px 0', fontWeight: 'bold', color: color }}>{value}</p>
          <div style={{
            position: 'absolute',
            bottom: '0',
            left: '0',
            right: '0',
            height: '4px',
            backgroundColor: color,
            opacity: '0.3'
          }}></div>
        </>
      )}
    </div>
  );

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div style={{
          backgroundColor: 'white',
          padding: '12px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
          maxWidth: '300px'
        }}>
          <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', fontSize: '14px' }}>{data.fullSubject || label}</p>
          <div style={{ borderTop: '1px solid #eee', paddingTop: '8px' }}>
            <p style={{ margin: '4px 0', color: '#1976D2' }}>
              {selectedPeriod} Progress: <strong>{data.progress}%</strong>
            </p>
            {selectedPeriod !== "Yearly" && (
              <p style={{ margin: '4px 0', color: '#666', fontSize: '12px' }}>
                (Overall: {data.originalProgress || data.progress}%)
              </p>
            )}
            <p style={{ margin: '4px 0', color: '#4CAF50' }}>
              Weight: <strong>{data.weight || 1}</strong>
            </p>
            <p style={{ margin: '4px 0', color: getStatusColor(data.originalProgress || data.progress) }}>
              Status: <strong>{data.status}</strong>
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  // CHANGED: Updated IssueBarChart to horizontal layout (issues on X-axis, progress on Y-axis)
  const IssueBarChart = ({ data, title, onBarClick }) => (
    <div style={{ marginTop: '20px' }}>
      <h4 style={{ marginBottom: '15px', color: '#555' }}>{title}</h4>
      <ResponsiveContainer width="100%" height={Math.max(400, data.length * 25)}>
        <BarChart
          data={data}
          margin={{ top: 20, right: 30, left: 20, bottom: 80 }} // Increased bottom margin for labels
          barSize={25}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis 
            dataKey="name"
            angle={-45}
            textAnchor="end"
            height={80}
            tick={{ fontSize: 11 }}
            interval={0}
          />
          <YAxis 
            type="number" 
            domain={[0, 100]}
            label={{ 
              value: `${selectedPeriod} Progress %`, 
              angle: -90, 
              position: 'insideLeft',
              offset: -10,
              style: { fontSize: 12 }
            }} 
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar 
            dataKey="progress" 
            fill="#8884d8"
            onClick={onBarClick}
            radius={[4, 4, 0, 0]}
          >
            <LabelList 
              dataKey="progress" 
              position="top" 
              fill="#333"
              formatter={(value) => `${value}%`}
              fontSize={11}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  // CHANGED: Updated Team performance chart to horizontal layout
  const TeamPerformanceChart = ({ users, teamName, onUserClick }) => (
    <div style={{ marginTop: '20px' }}>
      <h4 style={{ marginBottom: '15px', color: '#555' }}>Team Performance ({selectedPeriod})</h4>
      <ResponsiveContainer width="100%" height={Math.max(300, users.length * 40)}>
        <BarChart
          data={users}
          margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
          barSize={30}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis 
            dataKey={(user) => user.login || user.name || `User-${user.id}`}
            angle={-45}
            textAnchor="end"
            height={60}
            tick={{ fontSize: 11 }}
          />
          <YAxis 
            type="number" 
            domain={[0, 100]}
            label={{ 
              value: `${selectedPeriod} Performance %`, 
              angle: -90, 
              position: 'insideLeft',
              offset: -10,
              style: { fontSize: 12 }
            }} 
          />
          <Tooltip 
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const user = payload[0].payload;
                return (
                  <div style={{
                    backgroundColor: 'white',
                    padding: '12px',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                  }}>
                    <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', fontSize: '14px' }}>
                      {user.login || user.name}
                    </p>
                    <div style={{ borderTop: '1px solid #eee', paddingTop: '8px' }}>
                      <p style={{ margin: '4px 0', color: '#FF8F00' }}>
                        {selectedPeriod} Performance: <strong>{user.performance}%</strong>
                      </p>
                      {selectedPeriod !== "Yearly" && (
                        <p style={{ margin: '4px 0', color: '#666', fontSize: '12px' }}>
                          Yearly: {calculateWeightedPerformance(user.watchedIssues || [], "Yearly")}%
                        </p>
                      )}
                      <p style={{ margin: '4px 0', color: '#4CAF50' }}>
                        ዝርዝር ተግባራት: <strong>{user.watchedIssues?.length || 0}</strong>
                      </p>
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />
          <Bar 
            dataKey="performance" 
            fill="#FF8F00"
            onClick={onUserClick}
            radius={[4, 4, 0, 0]}
          >
            <LabelList 
              dataKey="performance" 
              position="top" 
              fill="#333"
              formatter={(value) => `${value}%`}
              fontSize={11}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  const Section = ({ title, children, isExpanded, onToggle }) => (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '12px',
      padding: '20px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      marginBottom: '20px',
      borderLeft: `4px solid ${isExpanded ? '#1976D2' : '#e0e0e0'}`
    }}>
      <div 
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          cursor: 'pointer'
        }}
        onClick={onToggle}
      >
        <h2 style={{ margin: '0', color: '#333' }}>{title}</h2>
        <span style={{ fontSize: '24px', color: '#1976D2' }}>
          {isExpanded ? '−' : '+'}
        </span>
      </div>
      {isExpanded && (
        <div style={{ marginTop: '20px' }}>
          {children}
        </div>
      )}
    </div>
  );

  const PeriodFilter = () => (
    <div style={{ 
      marginBottom: '30px',
      padding: '15px',
      backgroundColor: '#f8f9fa',
      borderRadius: '8px',
      border: '1px solid #e9ecef'
    }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center',
        gap: '15px',
        flexWrap: 'wrap'
      }}>
        <span style={{ fontWeight: 'bold', color: '#495057' }}>Filter by Period:</span>
        <select
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value)}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: '1px solid #ced4da',
            backgroundColor: 'white',
            fontSize: '14px',
            minWidth: '180px',
            cursor: 'pointer'
          }}
        >
          <option value="Yearly">Yearly (Full Year)</option>
          <option value="1ኛ ሩብዓመት">1ኛ ሩብዓመት (Q1)</option>
          <option value="2ኛ ሩብዓመት">2ኛ ሩብዓመት (Q2)</option>
          <option value="3ኛ ሩብዓመት">3ኛ ሩብዓመት (Q3)</option>
          <option value="4ኛ ሩብዓመት">4ኛ ሩብዓመት (Q4)</option>
          <option value="6 Months">6 Months (H1)</option>
          <option value="9 Months">9 Months (Q1-3)</option>
        </select>
        
        <div style={{ 
          marginLeft: 'auto',
          padding: '6px 12px',
          backgroundColor: selectedPeriod === "Yearly" ? '#e7f3ff' : '#fff3cd',
          borderRadius: '4px',
          fontSize: '13px',
          color: selectedPeriod === "Yearly" ? '#084298' : '#856404',
          border: `1px solid ${selectedPeriod === "Yearly" ? '#b6d4fe' : '#ffeeba'}`
        }}>
          {selectedPeriod === "Yearly" ? (
            "Showing overall yearly performance"
          ) : (
            `Showing ${selectedPeriod} period performance`
          )}
        </div>
      </div>
      
      {selectedPeriod !== "Yearly" && (
        <div style={{ 
          marginTop: '10px',
          padding: '10px',
          backgroundColor: '#fff',
          borderRadius: '4px',
          fontSize: '13px',
          color: '#6c757d',
          borderLeft: '3px solid #20c997'
        }}>
          <strong>Note:</strong> Progress is calculated relative to the selected period target. 
          {selectedPeriod === "6 Months" && " 100% = 50% overall completion"}
          {selectedPeriod === "9 Months" && " 100% = 75% overall completion"}
          {selectedPeriod.includes("ሩብዓመት") && " 100% = 25% overall completion per quarter"}
        </div>
      )}
    </div>
  );

  const TabNavigation = () => (
    <div style={{ 
      display: 'flex', 
      gap: '10px', 
      marginBottom: '20px',
      borderBottom: '2px solid #e0e0e0',
      paddingBottom: '10px'
    }}>
      <button
        onClick={() => setActiveTab('departments')}
        style={{
          padding: '10px 24px',
          backgroundColor: activeTab === 'departments' ? '#1976D2' : '#f5f5f5',
          color: activeTab === 'departments' ? 'white' : '#333',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontWeight: 'bold',
          transition: 'all 0.2s'
        }}
      >
        Departments
      </button>
      <button
        onClick={() => setActiveTab('teams')}
        style={{
          padding: '10px 24px',
          backgroundColor: activeTab === 'teams' ? '#1976D2' : '#f5f5f5',
          color: activeTab === 'teams' ? 'white' : '#333',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontWeight: 'bold',
          transition: 'all 0.2s'
        }}
      >
        Teams
      </button>
    </div>
  );

  if (loading.overall) {
    return <LoadingSpinner text="Loading dashboard data..." />;
  }

  const pieData = selectedGoal ? [
    { name: 'Not Started', value: selectedGoal.statusSummary.notStarted, color: '#f44336' },
    { name: 'In Progress', value: selectedGoal.statusSummary.inProgress, color: '#ff9800' },
    { name: 'Done', value: selectedGoal.statusSummary.done, color: '#4caf50' },
  ].filter(item => item.value > 0) : [];

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <h1 style={{ 
        marginBottom: '20px', 
        color: '#1976D2',
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
      }}>
        <span style={{ fontSize: '24px' }}>📊</span>
        Lead Executive Dashboard
        <span style={{ 
          fontSize: '14px', 
          backgroundColor: '#e7f3ff', 
          padding: '4px 10px', 
          borderRadius: '12px',
          marginLeft: '10px',
          color: '#084298',
          fontWeight: 'normal'
        }}>
          {selectedPeriod}
        </span>
      </h1>
      
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', 
        gap: '20px', 
        marginBottom: '30px' 
      }}>
        <KPICard 
          title="Total Goals Tracked" 
          value={kpis.totalGoals} 
          color="#1976D2"
          isLoading={loading.departments}
        />
        <KPICard 
          title={`Avg. ${selectedPeriod} Performance`}
          value={`${kpis.avgGoalPerformance}%`} 
          color="#2E7D32"
          isLoading={loading.departments}
        />
        <KPICard 
          title="Team Leaders" 
          value={kpis.totalTeamMembers} 
          color="#FF8F00"
          isLoading={loading.teams}
        />
        <KPICard 
          title={`${selectedPeriod} ዝርዝር ተግባራት`}
          value={kpis.totalWatchedIssues} 
          color="#9C27B0"
          isLoading={loading.teams}
        />
      </div>

      <PeriodFilter />
      <TabNavigation />

      {/* DEPARTMENTS SECTION */}
      {activeTab === 'departments' && (
        <>
          {loading.departments ? (
            <LoadingSpinner text="Loading department data..." />
          ) : filteredDepartmentData.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '40px', 
              backgroundColor: '#f9f9f9',
              borderRadius: '8px'
            }}>
              <p>No departments found for the selected period.</p>
            </div>
          ) : (
            filteredDepartmentData.map(({ department, goals }) => (
              <Section
                key={department.id}
                title={`${department.name} (${goals.length} goals)`}
                isExpanded={expandedDepartment === department.id}
                onToggle={() => setExpandedDepartment(
                  expandedDepartment === department.id ? null : department.id
                )}
              >
                {goals.length === 0 ? (
                  <p>No goals under this department for the selected period.</p>
                ) : (
                  <div>
                    {/* CHANGED: Department Goals Performance Chart - horizontal layout */}
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart 
                        data={goals} 
                        margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
                        barSize={40}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis 
                          dataKey="name" 
                          angle={-45} 
                          textAnchor="end" 
                          height={80}
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis 
                          domain={[0, 100]} 
                          label={{ 
                            value: `${selectedPeriod} Performance %`, 
                            angle: -90, 
                            position: 'insideLeft',
                            offset: -10
                          }} 
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar 
                          dataKey="performance" 
                          fill="#2E7D32" 
                          onClick={(data) => setSelectedGoal(data)}
                          radius={[4, 4, 0, 0]}
                        >
                          <LabelList 
                            dataKey="performance" 
                            position="top" 
                            formatter={(value) => `${value}%`}
                            fontSize={12}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>

                    {/* Show issues for each goal when expanded */}
                    {goals.map(goal => (
                      <div key={goal.id} style={{ marginTop: '30px' }}>
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          marginBottom: '10px'
                        }}>
                          <h4 style={{ margin: '0', color: '#555' }}>
                            {goal.name} - {goal.performance}% ({selectedPeriod})
                          </h4>
                          <ProgressBar value={goal.performance} color="#2E7D32" />
                        </div>
                        
                        {goal.issueChartData && goal.issueChartData.length > 0 && (
                          <IssueBarChart
                            data={goal.issueChartData}
                            title={`Issues Progress (${selectedPeriod})`}
                            onBarClick={(data) => console.log('Issue clicked:', data)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            ))
          )}
        </>
      )}

      {/* TEAMS SECTION */}
      {activeTab === 'teams' && (
        <>
          {loading.teams ? (
            <LoadingSpinner text="Loading team data..." />
          ) : filteredTeamData.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '40px', 
              backgroundColor: '#f9f9f9',
              borderRadius: '8px'
            }}>
              <p>No teams assigned or no data for the selected period.</p>
            </div>
          ) : (
            filteredTeamData.map((group) => (
              <Section
                key={group.name}
                title={`Team: ${group.name} (${group.users.length} Leader)`}
                isExpanded={true}
                onToggle={() => {}}
              >
                {group.users.length === 0 ? (
                  <p>No users found in this group for the selected period.</p>
                ) : (
                  <div>
                    {/* CHANGED: Team Performance Chart - horizontal layout */}
                    <TeamPerformanceChart
                      users={group.users}
                      teamName={group.name}
                      onUserClick={(data) => setSelectedUser(data)}
                    />

                    {/* User details with their issues */}
                    {group.users.map(user => (
                      <div key={user.id} style={{ 
                        marginTop: '20px',
                        padding: '15px',
                        backgroundColor: '#f9f9f9',
                        borderRadius: '8px'
                      }}>
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          marginBottom: '10px'
                        }}>
                          <h4 style={{ margin: '0', color: '#555' }}>
                            {user.login || user.name} - {user.performance}% ({selectedPeriod})
                          </h4>
                          <button
                            onClick={() => setSelectedUser(user)}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: '#1976D2',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            View Details
                          </button>
                        </div>
                        
                        {user.issueChartData && user.issueChartData.length > 0 && (
                          <IssueBarChart
                            data={user.issueChartData.slice(0, 5)}
                            title={`Top 5 ${selectedPeriod} ዝርዝር ተግባራት`}
                            onBarClick={(data) => console.log('User issue clicked:', data)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            ))
          )}
        </>
      )}

      {/* DETAIL MODALS */}
      {selectedGoal && (
        <div style={{
          position: 'fixed',
          top: '0',
          left: '0',
          right: '0',
          bottom: '0',
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}
        onClick={() => setSelectedGoal(null)}
        >
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '30px',
            maxWidth: '800px',
            width: '100%',
            maxHeight: '80vh',
            overflowY: 'auto',
            boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
          }}
          onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h2 style={{ margin: '0', color: '#1976D2' }}>
                  Goal: {selectedGoal.name}
                </h2>
                <div style={{ display: 'flex', gap: '15px', marginTop: '8px' }}>
                  <span style={{ 
                    backgroundColor: '#e7f3ff', 
                    padding: '4px 10px', 
                    borderRadius: '4px',
                    fontSize: '14px',
                    color: '#084298'
                  }}>
                    {selectedPeriod}: {selectedGoal.performance}%
                  </span>
                  {selectedPeriod !== "Yearly" && (
                    <span style={{ 
                      backgroundColor: '#f8f9fa', 
                      padding: '4px 10px', 
                      borderRadius: '4px',
                      fontSize: '14px',
                      color: '#6c757d'
                    }}>
                      Yearly: {calculateWeightedPerformance(selectedGoal.issues, "Yearly")}%
                    </span>
                  )}
                </div>
              </div>
              <button 
                onClick={() => setSelectedGoal(null)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#f5f5f5',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '16px'
                }}
              >
                ✕ Close
              </button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
              <div>
                <h3 style={{ marginBottom: '20px' }}>Issue Status Distribution ({selectedPeriod})</h3>
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={(entry) => `${entry.name}: ${entry.value}`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p>No issue status data available for this period.</p>
                )}
              </div>
              
              <div>
                <h3 style={{ marginBottom: '20px' }}>ዋና ተግባራት({selectedPeriod})</h3>
                {selectedGoal.issueChartData && selectedGoal.issueChartData.length > 0 ? (
                  <div style={{ height: '300px' }}>
                    <IssueBarChart
                      data={selectedGoal.issueChartData}
                      title=""
                      onBarClick={(data) => console.log('Modal issue clicked:', data)}
                    />
                  </div>
                ) : (
                  <p>No issues found under this goal for the selected period.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedUser && (
        <div style={{
          position: 'fixed',
          top: '0',
          left: '0',
          right: '0',
          bottom: '0',
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}
        onClick={() => setSelectedUser(null)}
        >
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '30px',
            maxWidth: '800px',
            width: '100%',
            maxHeight: '80vh',
            overflowY: 'auto',
            boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
          }}
          onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h2 style={{ margin: '0', color: '#1976D2' }}>
                  {selectedUser.login || selectedUser.name}
                </h2>
                <div style={{ display: 'flex', gap: '15px', marginTop: '8px' }}>
                  <span style={{ 
                    backgroundColor: '#e7f3ff', 
                    padding: '4px 10px', 
                    borderRadius: '4px',
                    fontSize: '14px',
                    color: '#084298'
                  }}>
                    {selectedPeriod} Performance: {selectedUser.performance}%
                  </span>
                  {selectedPeriod !== "Yearly" && (
                    <span style={{ 
                      backgroundColor: '#f8f9fa', 
                      padding: '4px 10px', 
                      borderRadius: '4px',
                      fontSize: '14px',
                      color: '#6c757d'
                    }}>
                      Yearly: {calculateWeightedPerformance(selectedUser.watchedIssues || [], "Yearly")}%
                    </span>
                  )}
                </div>
              </div>
              <button 
                onClick={() => setSelectedUser(null)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#f5f5f5',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '16px'
                }}
              >
                ✕ Close
              </button>
            </div>

            <h3 style={{ marginBottom: '20px' }}>ዝርዝር ተግባራት({selectedPeriod})</h3>
            {selectedUser.issueChartData && selectedUser.issueChartData.length > 0 ? (
              <div style={{ height: '400px' }}>
                <IssueBarChart
                  data={selectedUser.issueChartData}
                  title=""
                  onBarClick={(data) => console.log('User modal issue clicked:', data)}
                />
              </div>
            ) : (
              <p>No ዝርዝር ተግባራት found for this user in the selected period.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}