import React, { useState } from 'react';
import { Save, FolderOpen, Plus, Trash2, ChevronRight, AlertCircle } from 'lucide-react';

export default function Settings() {
  const [saved, setSaved] = useState(false);

  const configPath = 'config/projects.config.json';

  const handleOpenConfig = () => {
    window.electron?.openFolder(configPath.replace('projects.config.json', ''));
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/50 flex-shrink-0">
        <h1 className="text-xl font-bold text-text-primary">Settings</h1>
        <p className="text-xs text-text-muted mt-0.5">Configure your project manager</p>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6 space-y-6 max-w-3xl">
        {/* Config file section */}
        <div className="card-base p-5 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(0,255,156,0.1)', border: '1px solid rgba(0,255,156,0.2)' }}
            >
              <FolderOpen size={16} className="text-accent" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Project Configuration</h3>
              <p className="text-xs text-text-muted">Manage your projects via the config file</p>
            </div>
          </div>

          <div className="bg-bg-tertiary border border-border rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertCircle size={16} className="text-warning mt-0.5 flex-shrink-0" />
              <div className="text-xs text-text-secondary space-y-1">
                <p className="font-medium">Edit <code className="text-accent font-mono">config/projects.config.json</code> to add your projects</p>
                <p className="text-text-muted">The app automatically reloads project config on restart. Each project needs a name, displayName, color, and list of processes with name, cwd, script, and args.</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleOpenConfig}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-accent text-bg-primary hover:bg-accent-dark transition-all active:scale-95"
            >
              <FolderOpen size={14} />
              Open Config Folder
            </button>
          </div>
        </div>

        {/* Config format reference */}
        <div className="card-base p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-3">Config Format Reference</h3>
          <pre className="text-[12px] font-mono text-text-secondary bg-bg-primary rounded-xl p-4 overflow-x-auto border border-border"
            style={{ lineHeight: 1.7 }}
          >
{`{
  "projects": [
    {
      "name": "my-project",
      "displayName": "My Project",
      "color": "#00ff9c",
      "processes": [
        {
          "name": "my-backend",
          "displayName": "Backend",
          "cwd": "C:/code/my-project/backend",
          "script": "npm",
          "args": "run dev",
          "port": 3000
        }
      ]
    }
  ]
}`}
          </pre>
        </div>

        {/* App info */}
        <div className="card-base p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-3">About</h3>
          <div className="space-y-2">
            {[
              ['App', 'Dev Project Manager'],
              ['Version', '1.0.0'],
              ['Built with', 'Electron + React + PM2'],
              ['Config', 'config/projects.config.json'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between text-xs border-b border-border/50 pb-2 last:border-0 last:pb-0">
                <span className="text-text-muted">{k}</span>
                <span className="text-text-secondary font-mono">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
