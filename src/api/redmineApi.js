
import axios from "axios";

const API = "";

// Helper: get stored API key
const REDMINE_API_KEY = "56c1c6a2fc71e499ab4ad5f43d3687cac66bd54b";
const apiClient = axios.create({
  baseURL: API,
  headers: {
    "X-Redmine-API-Key": REDMINE_API_KEY,
    "Content-Type": "application/json",
  },
});
export async function getProjects() {
  let allProjects = [];
  let offset = 0;
  const limit = 100; // adjust if needed

  try {
    while (true) {
      const res = await apiClient.get(`/projects.json?limit=${limit}&offset=${offset}`);

      const { projects, total_count } = res.data;

      allProjects = [...allProjects, ...projects];

      if (allProjects.length >= total_count) {
        break; // we got all projects
      }

      offset += limit; // move to next page
    }

    return allProjects;
  } catch (err) {
    console.log("getProjects error:", err);
    return [];
  }
}


// Helper: get stored API key
function getApiKey() {
  const user = JSON.parse(localStorage.getItem("redmine_user"));
  return user?.api_key;
}

// -------------------- LOGIN --------------------
export async function loginToRedmine(username, password) {
  try {
    const res = await axios.get(`/users/current.json`, {
      auth: { username, password },
    });

    return { success: true, data: res.data.user };
  } catch (err) {
    return { success: false, error: "Invalid username or password" };
  }
}

// -------------------- ISSUES --------------------
export async function getIssuesAssignedToMe() {
  try {
    const res = await axios.get(`/issues.json?assigned_to_id=me&key=${getApiKey()}`);
    return res.data.issues;
  } catch (err) {
    console.log(err);
    return [];
  }
}


export async function updateIssue(id, updateData) {
  try {
    const res = await axios.put(`/issues/${id}.json?key=${getApiKey()}`, {
      issue: updateData,
    });
    return { success: true, data: res.data };
  } catch (err) {
    console.log(err);
    return { success: false };
  }
}

// -------------------- USERS / TRACKERS / STATUSES --------------------

// Get all users
export async function getUsers() {
  try {
    const res = await axios.get(`/users.json?key=${getApiKey()}`);
    return res.data.users;
  } catch (err) {
    console.log(err);
    return [];
  }
}

// Get all trackers
export async function getTrackers() {
  try {
    const res = await axios.get(`/trackers.json?key=${getApiKey()}`);
    return res.data.trackers;
  } catch (err) {
    console.log(err);
    return [];
  }
}

// Get all issue statuses
export async function getIssue(id) {
  try {
    const res = await axios.get(
      `/issues/${id}.json?include=allowed_statuses&key=${getApiKey()}`
    );
    return res.data.issue;
  } catch (err) {
    console.log(err);
    return null;
  }
}

// Get assignable users for the issue's project
export async function getProjectMembers(projectId) {
  try {
    const res = await axios.get(`/projects/${projectId}/memberships.json?key=${getApiKey()}`);

    return res.data.memberships.map(m => ({
      id: m.user ? m.user.id : m.group.id,
      name: m.user ? m.user.name : `[Group] ${m.group.name}`,
      isGroup: m.group ? true : false
    }));

  } catch (err) {
    console.log("getUsersByProject error:", err);
    return [];
  }
}
// Create a new issue
export async function createIssue(issueData) {
  try {
    const res = await axios.post(`/issues.json?key=${getApiKey()}`, {
      issue: issueData,
    });
    return { success: true, data: res.data.issue };
  } catch (err) {
    console.log(err);
    return { success: false };
  }
}

export async function getIssuesAssigned(selectedUserId) {
  try {
    const res = await axios.get(
      `/issues.json?assigned_to_id=${selectedUserId}&key=${getApiKey()}`
    );
    return res.data.issues;
  } catch (err) {
    console.log(err);
    return [];
  }
}


export async function getProjectIssues(params = {}) {
  let allIssues = [];
  let offset = 0;
  const limit = 100; // fetch 100 issues per request

  try {
    while (true) {
      const queryParams = { ...params, status_id: "*", limit, offset };
      const res = await apiClient.get("/issues.json", { params: queryParams });

      const { issues, total_count } = res.data;

      allIssues = [...allIssues, ...issues];

      if (allIssues.length >= total_count) break; // got all issues

      offset += limit; // next page
    }

    return allIssues;
  } catch (err) {
    console.log("getProjectIssues error:", err);
    return [];
  }
}





// Create an axios instance with default config

// -------------------- LOGIN --------------------

// -------------------- ISSUES --------------------










