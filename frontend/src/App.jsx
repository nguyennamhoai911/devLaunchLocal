import React, { useEffect } from 'react';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import LogViewer from './components/LogViewer';
import NotificationStack from './components/NotificationStack';
import useAppStore from './store/appStore';

const isElectron = typeof window !== 'undefined' && window.electron;

export default function App() {
  const {
    activeView, loadProjects, loadProcesses, updateProcesses,
    appendLog,
  } = useAppStore();

  // Initial load
  useEffect(() => {
    loadProjects();
    loadProcesses();
  }, []);

  // Subscribe to real-time process updates from main process
  useEffect(() => {
    if (!isElectron) return;

    window.electron.onProcessUpdate((processes) => {
      updateProcesses(processes);
    });

    window.electron.onLogData((data) => {
      appendLog(data);
    });

    return () => {
      window.electron.removeAllListeners('process:update');
      window.electron.removeAllListeners('log:data');
    };
  }, []);

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return <Dashboard />;
      case 'logs':
        return <LogViewer />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-bg-primary overflow-hidden">
      {/* Title Bar */}
      <TitleBar />

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        {/* Main content */}
        <main className="flex-1 overflow-hidden">
          {renderView()}
        </main>
      </div>

      {/* Notifications */}
      <NotificationStack />
    </div>
  );
}
