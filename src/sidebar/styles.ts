/**
 * Sidebar Webview 的 CSS 样式
 * 从 sidebarProvider.ts 中提取，便于维护
 */
import { getSidebarBaseStyles } from './stylesBase';
import { getChatStyles } from './stylesChat';
import { getHeaderStyles } from './stylesHeader';
import { getInputAndTabStyles } from './stylesInput';
import { getPendingAndContextMenuStyles } from './stylesPendingContext';
import { getTemplateAndDialogStyles } from './stylesTemplateDialog';

export function getSidebarStyles(): string {
  return [
    getSidebarBaseStyles(),
    getHeaderStyles(),
    getChatStyles(),
    getInputAndTabStyles(),
    getTemplateAndDialogStyles(),
    getPendingAndContextMenuStyles(),
  ].join('\n');
}
