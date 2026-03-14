const path = require('path');
const fs = require('fs');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'projects.config.json');

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[ProjectService] Failed to load config:', err);
    return { projects: [] };
  }
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('[ProjectService] Failed to save config:', err);
    return false;
  }
}

function getProjects() {
  const config = loadConfig();
  return config.projects || [];
}

function getProjectByName(name) {
  const projects = getProjects();
  return projects.find((p) => p.name === name) || null;
}

function getAllProcesses() {
  const projects = getProjects();
  return projects.flatMap((p) => p.processes);
}

function getProcessConfig(name) {
  const all = getAllProcesses();
  return all.find((p) => p.name === name) || null;
}

function addProject(project) {
  const config = loadConfig();
  config.projects.push(project);
  return saveConfig(config);
}

function updateProject(name, updates) {
  const config = loadConfig();
  const idx = config.projects.findIndex((p) => p.name === name);
  if (idx === -1) return false;
  config.projects[idx] = { ...config.projects[idx], ...updates };
  return saveConfig(config);
}

function deleteProject(name) {
  const config = loadConfig();
  config.projects = config.projects.filter((p) => p.name !== name);
  return saveConfig(config);
}

module.exports = {
  loadConfig,
  saveConfig,
  getProjects,
  getProjectByName,
  getAllProcesses,
  getProcessConfig,
  addProject,
  updateProject,
  deleteProject,
};
