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

// Utility functions
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

// Map progress based on selected period
const mapProgress = (done, period) => {
  if (!done) done = 0;
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

// Get custom field value from issue
const getField = (issue, fieldName) => {
  return issue.custom_fields?.find((f) => f.name === fieldName)?.value;
};

// Filter issues by selected period
const filterIssuesByPeriod = (issues, period) => {
  if (period === "Yearly") return issues;

  if (period === "6 Months") {
    return issues.filter(issue => 
      getField(issue, "1ኛ ሩብዓመት") || getField(issue, "2ኛ ሩብዓመት")
    );
  }

  if (period === "9 Months") {
    return issues.filter(issue => 
      getField(issue, "1ኛ ሩብዓመት") || 
      getField(issue, "2ኛ ሩብዓመት") || 
      getField(issue, "3ኛ ሩብዓመት")
    );
  }

  // Quarterly filtering
  return issues.filter(issue => {
    const val = getField(issue, period);
    return val && val !== "0" && val !== "";
  });
};

// Calculate weighted progress for a user
const calculateWeightedProgress = (userIssues, period) => {
  let totalWeight = 0;
  let weightedProgress = 0;

  userIssues.forEach((issue) => {
    const weight = Number(getField(issue, "ክብደት")) || 1;
    const progress = mapProgress(issue.done_ratio || 0, period);
    totalWeight += weight;
    weightedProgress += progress * weight;
  });

  return totalWeight > 0 ? Math.round(weightedProgress / totalWeight) : 0;
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
  const [bestPerformer, setBestPerformer] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [activeTab, setActiveTab] = useState("performance");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [projectMembers, setProjectMembers] = useState({}); // projectId -> {groups: {}, users: []}
  
  // ========== NEW: PERIOD FILTER STATE ==========
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
  // ==============================================
  
  const groupDetailsCache = useRef({});

  // Memoized calculations with period filtering
  const filteredIssues = useMemo(() => {
    let filtered = issues;
    
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
    
    return filtered;
  }, [issues, selectedPeriod, searchTerm, filterStatus]);

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

  // Calculate performance data - FIXED: Removed dependency on selectedPeriod
  const calculatePerformanceData = useCallback((usersData, issuesData, period) => {
    return usersData.map((user) => {
      let userWeight = 0;
      let userMaxWeight = 0;
      const userSubIssues = [];
      let completedIssues = 0;

      // Filter user's issues by period
      const periodIssues = filterIssuesByPeriod(issuesData, period);

      periodIssues.forEach((issue) => {
        if (issue.children?.length) {
          const subIssues = issue.children.filter(sub => sub.author?.id === user.id);
          subIssues.forEach((sub) => {
            userSubIssues.push(sub);
            const weight = Number(getField(sub, "ክብደት")) || 1;
            const progress = mapProgress(sub.done_ratio || 0, period);
            userWeight += (weight * progress) / 100;
            userMaxWeight += weight;
            
            if (sub.done_ratio === 100) completedIssues++;
          });
        }
      });

      return {
        id: user.id,
        name: user.name,
        login: user.login,
        performance: userMaxWeight ? Math.round((userWeight / userMaxWeight) * 100) : 0,
        rawPerformance: userWeight,
        maxWeight: userMaxWeight,
        issues: userSubIssues,
        completedIssues,
        totalIssues: userSubIssues.length,
        color: getProgressColor(userMaxWeight ? (userWeight / userMaxWeight) * 100 : 0)
      };
    });
  }, []); // Removed selectedPeriod dependency

  // Calculate user performance data based on selected period - FIXED
  const currentPerformanceData = useMemo(() => {
    return calculatePerformanceData(groupUsers, issues, selectedPeriod);
  }, [groupUsers, issues, selectedPeriod, calculatePerformanceData]);

  const chartData = useMemo(() => 
    filteredIssues.map(issue => ({
      id: issue.id,
      name: truncateText(issue.subject, 15),
      done_ratio: mapProgress(issue.done_ratio || 0, selectedPeriod), // Apply period mapping
      start_date: formatDate(issue.start_date),
      due_date: formatDate(issue.due_date),
      status: issue.status?.name,
      priority: issue.priority?.name,
      project: issue.project?.name,
      color: getProgressColor(mapProgress(issue.done_ratio || 0, selectedPeriod))
    })), 
  [filteredIssues, selectedPeriod]);

  // Get cached group details
  const getCachedGroupDetails = useCallback(async (groupId) => {
    if (groupDetailsCache.current[groupId]) {
      return groupDetailsCache.current[groupId];
    }
    
    try {
      console.log(`Fetching details for group ${groupId}...`);
      const groupDetails = await getGroupDetails(groupId);
      groupDetailsCache.current[groupId] = groupDetails;
      return groupDetails;
    } catch (error) {
      console.error(`Failed to fetch group ${groupId} details:`, error);
      return { users: [], name: `Group ${groupId}` };
    }
  }, []);

  // Check if user is in a group by name
  const isUserInGroupByName = useCallback((userId, groupName, projectId = null) => {
    if (!groupName || !userId) return false;
    
    const userIdNum = Number(userId);
    const searchName = groupName.toLowerCase().trim();
    
    if (projectId && projectMembers[projectId]) {
      const projectData = projectMembers[projectId];
      
      for (const [groupId, groupInfo] of Object.entries(projectData.groups || {})) {
        if (groupInfo.name && groupInfo.name.toLowerCase().trim() === searchName) {
          const numericUserIds = groupInfo.userIds.map(id => Number(id));
          return numericUserIds.includes(userIdNum);
        }
      }
    }
    
    for (const pid in projectMembers) {
      const projectData = projectMembers[pid];
      
      for (const [groupId, groupInfo] of Object.entries(projectData.groups || {})) {
        if (groupInfo.name && groupInfo.name.toLowerCase().trim() === searchName) {
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
    const searchName = groupName.toLowerCase().trim();
    
    for (const projectId in projectMembers) {
      const projectData = projectMembers[projectId];
      for (const [groupId, groupInfo] of Object.entries(projectData.groups || {})) {
        if (groupInfo.name && groupInfo.name.toLowerCase().trim() === searchName) {
          const numericUserIds = groupInfo.userIds.map(id => Number(id));
          if (numericUserIds.includes(userIdNum)) {
            return true;
          }
        }
      }
    }
    return false;
  }, [projectMembers]);

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
          console.log("Team members loaded:", groupUsersData.length);
        }
      } catch (groupError) {
        console.error("Failed to get group users:", groupError);
      }

      // Get watched issues
      let issuesData = [];
      try {
        issuesData = await getWatchedOneLevelIssues();
        console.log("Total issues loaded:", issuesData.length);
        
        // Collect unique project IDs from issues
        const projectIds = [...new Set(
          issuesData
            .map(issue => issue.project?.id)
            .filter(Boolean)
        )];
        
        console.log("Projects found in issues:", projectIds);
        
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
        console.error("Failed to get watched issues:", issuesError);
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

      // Determine best performer
      const best = performance.reduce(
        (prev, curr) => {
          const prevScore = prev.performance * Math.log(prev.totalIssues + 1);
          const currScore = curr.performance * Math.log(curr.totalIssues + 1);
          return currScore > prevScore ? curr : prev;
        },
        { performance: -1, totalIssues: 0 }
      );
      setBestPerformer(best);

    } catch (err) {
      console.error("Failed to load dashboard data:", err);
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, [getCachedGroupDetails, calculatePerformanceData, selectedPeriod]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // FIXED: Removed the problematic useEffect that was causing infinite loop
  // Performance data is now calculated via useMemo (currentPerformanceData)

  // Get watched assigned issues for selected user with period filtering
  const getWatchedAssignedIssues = useCallback(() => {
    if (!selectedUser || !currentUser) return [];
    
    let result = issues.filter(issue => {
      const assignedDirectly = issue.assigned_to?.id === selectedUser.id;
      
      let assignedViaGroup = false;
      if (issue.assigned_to?.type === "Group") {
        const groupName = issue.assigned_to.name;
        const projectId = issue.project?.id;
        assignedViaGroup = isUserInGroupByName(selectedUser.id, groupName, projectId);
      }
      
      return assignedDirectly || assignedViaGroup;
    });
    
    // Apply period filter
    result = filterIssuesByPeriod(result, selectedPeriod);
    
    return result;
  }, [selectedUser, currentUser, issues, selectedPeriod, isUserInGroupByName]);

  // Get ALL assigned issues with period filtering
  const getAllAssignedIssues = useCallback(() => {
    if (!selectedUser) return [];
    
    const result = [];
    
    for (const issue of issues) {
      if (!issue.assigned_to) continue;
      
      if (issue.assigned_to.id === selectedUser.id) {
        result.push(issue);
        continue;
      }
      
      if (issue.assigned_to.type === "Group") {
        const groupName = issue.assigned_to.name;
        const projectId = issue.project?.id;
        
        let isMember = isUserInGroupByName(selectedUser.id, groupName, projectId);
        if (!isMember) {
          isMember = isUserInGroupGlobalByName(selectedUser.id, groupName);
        }
        
        if (isMember) {
          result.push(issue);
        }
      }
    }
    
    // Apply period filter
    return filterIssuesByPeriod(result, selectedPeriod);
  }, [selectedUser, issues, selectedPeriod, isUserInGroupByName, isUserInGroupGlobalByName]);

  // Assignment statistics with period filtering
  const assignmentStats = useMemo(() => {
    if (!selectedUser) return { directlyAssigned: 0, groupAssigned: 0, totalGroupIssues: 0 };
    
    const directlyAssigned = filterIssuesByPeriod(issues, selectedPeriod)
      .filter(i => i.assigned_to?.id === selectedUser.id).length;
    
    const groupAssigned = filterIssuesByPeriod(issues, selectedPeriod)
      .filter(i => {
        if (i.assigned_to?.type !== "Group") return false;
        const groupName = i.assigned_to.name;
        const projectId = i.project?.id;
        
        let isMember = isUserInGroupByName(selectedUser.id, groupName, projectId);
        if (!isMember) {
          isMember = isUserInGroupGlobalByName(selectedUser.id, groupName);
        }
        
        return isMember;
      }).length;
    
    const totalGroupIssues = filterIssuesByPeriod(issues, selectedPeriod)
      .filter(i => i.assigned_to?.type === "Group").length;
    
    return { directlyAssigned, groupAssigned, totalGroupIssues };
  }, [issues, selectedUser, selectedPeriod, isUserInGroupByName, isUserInGroupGlobalByName]);

  // Calculate weighted overall progress for selected user
  const userWeightedProgress = useMemo(() => {
    if (!selectedUser) return 0;
    const userIssues = getAllAssignedIssues();
    return calculateWeightedProgress(userIssues, selectedPeriod);
  }, [selectedUser, getAllAssignedIssues, selectedPeriod]);

  const watchedAssignedIssues = getWatchedAssignedIssues();
  const allAssignedIssues = getAllAssignedIssues();

  // Update selected user when performance data changes
  useEffect(() => {
    if (selectedUser && currentPerformanceData.length > 0) {
      const updatedUser = currentPerformanceData.find(u => u.id === selectedUser.id);
      if (updatedUser) {
        setSelectedUser(updatedUser);
        setSelectedUserIssues(updatedUser.issues);
      }
    }
  }, [currentPerformanceData, selectedUser]);

  // Custom tooltip
  const PerformanceTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="custom-tooltip" style={{
          backgroundColor: '#fff',
          padding: '10px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
        }}>
          <p style={{ fontWeight: 'bold', marginBottom: '5px' }}>{label}</p>
          <p>Performance: <strong>{data.performance}%</strong></p>
          <p>Completed Issues: {data.completedIssues} / {data.totalIssues}</p>
          <p>Weight Progress: {data.rawPerformance.toFixed(1)} / {data.maxWeight.toFixed(1)}</p>
          <p style={{ fontSize: '11px', color: '#666', marginTop: '5px' }}>
            Period: {selectedPeriod}
          </p>
        </div>
      );
    }
    return null;
  };

  // Handle user selection
  const handleUserSelect = useCallback((user) => {
    setSelectedUser(user);
    setSelectedUserIssues(user.issues);
  }, []);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    await loadData();
  }, [loadData]);

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
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '30px',
        flexWrap: 'wrap',
        gap: '20px'
      }}>
        <h1 style={{ margin: 0, color: '#333' }}>Team Leader Dashboard</h1>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* ========== PERIOD FILTER ========== */}
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            style={{
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #ddd',
              backgroundColor: '#f8f9fa',
              fontWeight: 'bold'
            }}
          >
            {periodOptions.map(period => (
              <option key={period} value={period}>{period}</option>
            ))}
          </select>
          {/* ======================================== */}
          
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #ddd'
            }}
          >
            <option value="all">All Statuses</option>
            {statuses.map(status => (
              <option key={status.id} value={status.id}>
                {status.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Search issues..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #ddd',
              minWidth: '200px'
            }}
          />
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
            <strong>Selected Period:</strong> {selectedPeriod}
            <span style={{ fontSize: '12px', color: '#666', marginLeft: '10px' }}>
              Issues filtered based on quarterly assignments and progress mapped accordingly
            </span>
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            Showing {filteredIssues.length} of {issues.length} total issues
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{
        display: 'flex',
        marginBottom: '30px',
        borderBottom: '1px solid #ddd'
      }}>
        {['performance', 'issues', 'analytics'].map(tab => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              if (tab !== 'performance') setSelectedUser(null);
            }}
            style={{
              padding: '10px 20px',
              backgroundColor: activeTab === tab ? '#1976d2' : 'transparent',
              color: activeTab === tab ? 'white' : '#333',
              border: 'none',
              borderBottom: activeTab === tab ? '3px solid #1976d2' : 'none',
              cursor: 'pointer',
              textTransform: 'capitalize',
              fontWeight: activeTab === tab ? 'bold' : 'normal'
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Best Performer Section */}
      {bestPerformer && activeTab === 'performance' && !selectedUser && (
        <div style={{
          maxWidth: "800px",
          margin: "0 auto 30px auto",
          padding: "25px",
          background: "linear-gradient(135deg, #ff9800, #ff5722)",
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
            🏆
          </div>
          <div style={{ fontSize: "24px", fontWeight: "bold", marginBottom: "10px" }}>
            Best Performer ({selectedPeriod})
          </div>
          <div style={{ fontSize: "32px", fontWeight: "bold", marginBottom: "15px" }}>
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
              <div style={{ fontSize: "28px", fontWeight: "bold" }}>{bestPerformer.performance}%</div>
            </div>
            <div>
              <div style={{ fontSize: "14px", opacity: 0.9 }}>Completed Issues</div>
              <div style={{ fontSize: "28px", fontWeight: "bold" }}>
                {bestPerformer.completedIssues}/{bestPerformer.totalIssues}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "14px", opacity: 0.9 }}>Weight Progress</div>
              <div style={{ fontSize: "28px", fontWeight: "bold" }}>
                {bestPerformer.rawPerformance.toFixed(1)}/{bestPerformer.maxWeight.toFixed(1)}
              </div>
            </div>
          </div>
          <div style={{ marginTop: '15px', fontSize: '12px', opacity: 0.8 }}>
            Period: {selectedPeriod}
          </div>
        </div>
      )}

      {/* Performance Tab - Use currentPerformanceData instead of userPerformanceData */}
      {activeTab === 'performance' && !selectedUser && (
        <>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px'
          }}>
            <h2 style={{ margin: 0 }}>Team Performance Metrics ({selectedPeriod})</h2>
            <div style={{ color: '#666', fontSize: '14px' }}>
              Showing {currentPerformanceData.length} team members
            </div>
          </div>
          
          <div style={{ width: "100%", height: "450px", marginBottom: "40px" }}>
            {currentPerformanceData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%" minHeight={300}>
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
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                    <LabelList 
                      dataKey="performance" 
                      position="top" 
                      formatter={(val) => `${val}%`}
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
                No performance data available
              </div>
            )}
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
                  <h3 style={{ margin: 0, fontSize: '18px' }}>{user.name}</h3>
                  <div style={{
                    backgroundColor: user.color,
                    color: 'white',
                    padding: '4px 12px',
                    borderRadius: '20px',
                    fontWeight: 'bold',
                    fontSize: '14px'
                  }}>
                    {user.performance}%
                  </div>
                </div>
                <div style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>
                  @{user.login || 'no-login'} • Period: {selectedPeriod}
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '13px',
                  color: '#666'
                }}>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>Completed</div>
                    <div>{user.completedIssues}/{user.totalIssues}</div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>Weight Progress</div>
                    <div>{user.rawPerformance.toFixed(1)}/{user.maxWeight.toFixed(1)}</div>
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
                  {userWeightedProgress}%
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#666' }}>Performance</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: selectedUser.color }}>
                  {selectedUser.performance}%
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#666' }}>Completion Rate</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                  {selectedUser.completedIssues}/{selectedUser.totalIssues}
                </div>
              </div>
            </div>
          </div>

          {/* Weighted Progress Bar */}
          <div style={{ marginBottom: '30px' }}>
            <div style={{ fontWeight: "bold", fontSize: "16px", marginBottom: "10px" }}>
              Weighted Overall Performance: {userWeightedProgress}%
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
                  width: `${userWeightedProgress}%`,
                  backgroundColor: getProgressColor(userWeightedProgress),
                  height: "100%",
                  textAlign: "center",
                  color: "#fff",
                  fontWeight: "bold",
                  lineHeight: "25px",
                }}
              >
                {userWeightedProgress}%
              </div>
            </div>
          </div>

          {/* Watched & Assigned Issues */}
          <div style={{ marginBottom: '40px', padding: '20px', backgroundColor: '#e8f5e8', borderRadius: '8px' }}>
            <h3 style={{ marginBottom: '20px', color: '#2e7d32' }}>
              👁️ Watched & Assigned Issues ({watchedAssignedIssues.length})
              <span style={{ fontSize: '14px', color: '#666', marginLeft: '10px', fontWeight: 'normal' }}>
                (Issues you're watching that are assigned to {selectedUser.name}) • {selectedPeriod}
              </span>
            </h3>
            
            {watchedAssignedIssues.length === 0 ? (
              <div style={{
                padding: '30px',
                textAlign: 'center',
                backgroundColor: 'white',
                borderRadius: '8px',
                color: '#666',
                border: '1px dashed #ddd'
              }}>
                <p style={{ fontSize: '16px', marginBottom: '10px' }}>No watched issues assigned to {selectedUser.name} for {selectedPeriod}</p>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
                gap: '20px'
              }}>
                {watchedAssignedIssues.map(issue => (
                  <div
                    key={issue.id}
                    style={{
                      padding: '20px',
                      backgroundColor: 'white',
                      borderRadius: '8px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                      borderLeft: `4px solid ${getProgressColor(mapProgress(issue.done_ratio || 0, selectedPeriod))}`
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '15px'
                    }}>
                      <div style={{ flex: 1 }}>
                        <h4 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>
                          {issue.subject}
                        </h4>
                        <div style={{ fontSize: '13px', color: '#666', marginBottom: '5px' }}>
                          <strong>Project:</strong> {issue.project?.name || 'N/A'}
                        </div>
                        <div style={{ fontSize: '13px', color: '#666' }}>
                          <strong>Tracker:</strong> {issue.tracker?.name || 'N/A'} • 
                          <strong> Priority:</strong> {issue.priority?.name || 'N/A'}
                        </div>
                      </div>
                      <div style={{
                        backgroundColor: getProgressColor(mapProgress(issue.done_ratio || 0, selectedPeriod)),
                        color: 'white',
                        padding: '6px 12px',
                        borderRadius: '4px',
                        fontWeight: 'bold',
                        minWidth: '65px',
                        textAlign: 'center'
                      }}>
                        {mapProgress(issue.done_ratio || 0, selectedPeriod)}%
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
                        <span><strong>Start:</strong> {formatDate(issue.start_date)}</span>
                        <span><strong>Due:</strong> {formatDate(issue.due_date)}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#666' }}>
                        <strong>Status:</strong> {issue.status?.name || 'Unknown'} • 
                        <strong> Author:</strong> {issue.author?.name || 'Unknown'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ALL Assigned Issues */}
          <div style={{ marginBottom: '40px', padding: '20px', backgroundColor: '#e3f2fd', borderRadius: '8px' }}>
            <h3 style={{ marginBottom: '20px', color: '#1565c0' }}>
              📋 All Assigned Issues ({allAssignedIssues.length})
              <span style={{ fontSize: '14px', color: '#666', marginLeft: '10px', fontWeight: 'normal' }}>
                (All issues assigned to {selectedUser.name}) • {selectedPeriod}
              </span>
            </h3>
            
            {/* Assignment Analysis */}
            <div style={{ 
              marginBottom: '20px', 
              padding: '10px', 
              backgroundColor: 'white', 
              borderRadius: '5px',
              fontSize: '12px',
              color: '#666',
              border: '1px solid #ddd'
            }}>
              <div><strong>Assignment Analysis for {selectedPeriod}:</strong></div>
              <div>Directly assigned: {assignmentStats.directlyAssigned} issues</div>
              <div>Assigned via groups: {assignmentStats.groupAssigned} issues</div>
              <div>Total group-assigned issues: {assignmentStats.totalGroupIssues}</div>
            </div>
            
            {allAssignedIssues.length === 0 ? (
              <div style={{
                padding: '30px',
                textAlign: 'center',
                backgroundColor: 'white',
                borderRadius: '8px',
                color: '#666',
                border: '1px dashed #ddd'
              }}>
                <p style={{ fontSize: '16px', marginBottom: '10px' }}>No issues assigned to {selectedUser.name} for {selectedPeriod}</p>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
                gap: '20px'
              }}>
                {allAssignedIssues.map(issue => (
                  <div
                    key={issue.id}
                    style={{
                      padding: '20px',
                      backgroundColor: 'white',
                      borderRadius: '8px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                      borderLeft: `4px solid ${getProgressColor(mapProgress(issue.done_ratio || 0, selectedPeriod))}`,
                      opacity: watchedAssignedIssues.some(w => w.id === issue.id) ? 1 : 0.8
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '15px'
                    }}>
                      <div style={{ flex: 1 }}>
                        <h4 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>
                          {issue.subject}
                          {!watchedAssignedIssues.some(w => w.id === issue.id) && (
                            <span style={{ fontSize: '11px', color: '#ff9800', marginLeft: '10px' }}>
                              (not watched)
                            </span>
                          )}
                        </h4>
                        <div style={{ fontSize: '13px', color: '#666', marginBottom: '5px' }}>
                          <strong>Project:</strong> {issue.project?.name || 'N/A'}
                        </div>
                        <div style={{ fontSize: '13px', color: '#666' }}>
                          <strong>Tracker:</strong> {issue.tracker?.name || 'N/A'} • 
                          <strong> Priority:</strong> {issue.priority?.name || 'N/A'}
                        </div>
                      </div>
                      <div style={{
                        backgroundColor: getProgressColor(mapProgress(issue.done_ratio || 0, selectedPeriod)),
                        color: 'white',
                        padding: '6px 12px',
                        borderRadius: '4px',
                        fontWeight: 'bold',
                        minWidth: '65px',
                        textAlign: 'center'
                      }}>
                        {mapProgress(issue.done_ratio || 0, selectedPeriod)}%
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
                        <span><strong>Start:</strong> {formatDate(issue.start_date)}</span>
                        <span><strong>Due:</strong> {formatDate(issue.due_date)}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#666' }}>
                        <strong>Status:</strong> {issue.status?.name || 'Unknown'} • 
                        <strong> Author:</strong> {issue.author?.name || 'Unknown'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sub-Issues Progress Chart */}
          {selectedUserIssues.length > 0 ? (
            <div style={{ marginBottom: '40px' }}>
              <h3 style={{ marginBottom: '20px', color: '#333' }}>
                Sub-Issues Progress ({selectedPeriod})
              </h3>
              <div style={{ width: "100%", height: "400px" }}>
                <ResponsiveContainer width="100%" height="100%" minHeight={300}>
                  <BarChart data={selectedUserIssues} margin={{ top: 20, bottom: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="subject"
                      angle={-30}
                      textAnchor="end"
                      interval={0}
                      tickFormatter={truncateText}
                      height={80}
                    />
                    <YAxis domain={[0, 100]} unit="%" />
                    <Tooltip
                      formatter={(value) => [`${value}%`, 'Progress']}
                      labelFormatter={(label) => truncateText(label, 50)}
                    />
                    <Bar dataKey="done_ratio" name="Progress %">
                      {selectedUserIssues.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={getProgressColor(entry.done_ratio || 0)} />
                      ))}
                      <LabelList 
                        dataKey="done_ratio" 
                        position="top" 
                        formatter={val => `${val}%`}
                        style={{ fontSize: '12px' }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
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
              <p>No sub-issues data available for {selectedUser.name} ({selectedPeriod})</p>
            </div>
          )}
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
            <h2 style={{ margin: 0 }}>Issues Dashboard ({selectedPeriod})</h2>
            <div style={{ color: '#666', fontSize: '14px' }}>
              Showing {filteredIssues.length} issues for {selectedPeriod}
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
              <div>Assigned Issues</div>
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
              }}
            >
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                {filteredIssues.length}
              </div>
              <div>All Issues</div>
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
                  {viewList === "assigned" && "Assigned Issues"}
                  {viewList === "notAssigned" && "Not Assigned Issues"}
                  {viewList === "all" && "All Issues"}
                  <span style={{ fontSize: '14px', color: '#666', marginLeft: '10px' }}>
                    ({listToShow.length} issues) • {selectedPeriod}
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
                  No issues found for {selectedPeriod}
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
                  gap: '20px'
                }}>
                  {listToShow.map(issue => (
                    <div
                      key={issue.id}
                      style={{
                        padding: '20px',
                        backgroundColor: 'white',
                        borderRadius: '8px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                        borderLeft: `4px solid ${getProgressColor(mapProgress(issue.done_ratio || 0, selectedPeriod))}`
                      }}
                    >
                      <h4 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>
                        {issue.subject}
                      </h4>
                      <div style={{ fontSize: '13px', color: '#666', marginBottom: '10px' }}>
                        <strong>Project:</strong> {issue.project?.name || 'N/A'}
                      </div>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '15px'
                      }}>
                        <div style={{ fontSize: '12px', color: '#666' }}>
                          <div><strong>Assigned:</strong> {issue.assigned_to?.name || 'Unassigned'}</div>
                          <div><strong>Status:</strong> {issue.status?.name || 'Unknown'}</div>
                        </div>
                        <div style={{
                          backgroundColor: getProgressColor(mapProgress(issue.done_ratio || 0, selectedPeriod)),
                          color: 'white',
                          padding: '4px 10px',
                          borderRadius: '4px',
                          fontWeight: 'bold',
                          fontSize: '14px'
                        }}>
                          {mapProgress(issue.done_ratio || 0, selectedPeriod)}%
                        </div>
                      </div>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '11px',
                        color: '#888'
                      }}>
                        <span><strong>Start:</strong> {formatDate(issue.start_date)}</span>
                        <span><strong>Due:</strong> {formatDate(issue.due_date)}</span>
                        <span><strong>Priority:</strong> {issue.priority?.name || 'N/A'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <div>
          <h2 style={{ marginBottom: '30px' }}>Analytics Dashboard ({selectedPeriod})</h2>
          
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
                  <span>Active Issues:</span>
                  <span style={{ fontWeight: 'bold' }}>{assignedIssues.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span>Unassigned Issues:</span>
                  <span style={{ fontWeight: 'bold' }}>{notAssignedIssues.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span>Avg Performance:</span>
                  <span style={{ fontWeight: 'bold' }}>
                    {currentPerformanceData.length > 0 
                      ? Math.round(currentPerformanceData.reduce((sum, user) => sum + user.performance, 0) / currentPerformanceData.length)
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
              <h3 style={{ marginBottom: '15px', color: '#333' }}>Issue Distribution</h3>
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
            <h3 style={{ marginBottom: '20px', color: '#333' }}>Issue Progress Overview ({selectedPeriod})</h3>
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
                      formatter={(value) => [`${value}%`, 'Progress']}
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
          </div>
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
          <span>Total Issues: {issues.length}</span>
          <span>•</span>
          <span>Filtered Issues ({selectedPeriod}): {filteredIssues.length}</span>
          <span>•</span>
          <span>Team Members: {groupUsers.length}</span>
          <span>•</span>
          <span>Projects: {Object.keys(projectMembers).length}</span>
          <span>•</span>
          <span>Last Updated: {new Date().toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
}

export default TeamLeaderDashboard;