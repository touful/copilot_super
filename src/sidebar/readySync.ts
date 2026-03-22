export interface SidebarReadySyncHandlers {
  syncHistory: () => void;
  syncRules: () => void;
  syncTemplates: () => void;
  syncWorkspaceTemplate: () => void;
  syncWorkflows: () => void;
  syncQueueInfo: () => void;
}

export function syncSidebarReadyState(handlers: SidebarReadySyncHandlers): void {
  handlers.syncHistory();
  handlers.syncRules();
  handlers.syncTemplates();
  handlers.syncWorkspaceTemplate();
  handlers.syncWorkflows();
  handlers.syncQueueInfo();
}
