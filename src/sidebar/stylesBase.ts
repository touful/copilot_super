import { styleBlock } from './stylesBlock';

export function getSidebarBaseStyles(): string {
  return styleBlock(`
    :root {
      /* Spacing */
      --spacing-xs: 4px;
      --spacing-sm: 8px;
      --spacing-md: 12px;
      --spacing-lg: 16px;
      --spacing-xl: 24px;
      
      /* Border Radius */
      --radius-xs: 4px;
      --radius-sm: 6px;
      --radius: 8px;
      --radius-lg: 12px;
      --radius-xl: 16px;
      --radius-full: 9999px;
      
      /* Font Size */
      --font-xs: 10px;
      --font-sm: 12px;
      --font-md: 13px;
      --font-lg: 14px;
      --font-xl: 16px;
      
      /* Transitions */
      --transition-fast: 0.15s ease;
      --transition-normal: 0.2s ease;
      --transition-slow: 0.3s ease;
      --transition-bounce: 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      
      /* Shadows - theme adaptive */
      --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.15);
      --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.2);
      --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.25);
      --shadow-glow: 0 0 12px rgba(0, 122, 204, 0.3);
      --shadow-focus: 0 0 0 2px var(--vscode-focusBorder);
      
      /* Semantic Colors */
      --color-success: var(--vscode-testing-iconPassed, #4caf50);
      --color-warning: var(--vscode-editorWarning-foreground, #ff9800);
      --color-error: var(--vscode-errorForeground, #f44336);
      --color-info: var(--vscode-editorInfo-foreground, #2196f3);
      
      /* Message Colors */
      --message-user-bg: linear-gradient(135deg, var(--vscode-button-background) 0%, color-mix(in srgb, var(--vscode-button-background) 85%, var(--vscode-focusBorder)) 100%);
      --message-copilot-bg: var(--vscode-editor-background);
      --message-copilot-border: var(--vscode-panel-border);
      --message-copilot-accent: var(--vscode-focusBorder);
      
      /* Animation Timing */
      --typing-duration: 1.5s;
      --ripple-duration: 0.6s;
      --slide-duration: 0.3s;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* Global Animation Utilities */
    @keyframes ripple {
      to {
        transform: scale(4);
        opacity: 0;
      }
    }

    @keyframes shimmer {
      0% {
        background-position: -200% 0;
      }
      100% {
        background-position: 200% 0;
      }
    }

    @keyframes pulse-ring {
      0% {
        transform: scale(0.8);
        opacity: 1;
      }
      100% {
        transform: scale(2);
        opacity: 0;
      }
    }

    @keyframes float {
      0%, 100% {
        transform: translateY(0);
      }
      50% {
        transform: translateY(-4px);
      }
    }

    @keyframes typing-dot {
      0%, 20% {
        opacity: 0;
        transform: translateY(0);
      }
      50% {
        opacity: 1;
        transform: translateY(-4px);
      }
      80%, 100% {
        opacity: 0;
        transform: translateY(0);
      }
    }

    @keyframes glow {
      0%, 100% {
        box-shadow: 0 0 4px var(--vscode-focusBorder);
      }
      50% {
        box-shadow: 0 0 12px var(--vscode-focusBorder), 0 0 20px var(--vscode-focusBorder);
      }
    }

    @keyframes spin {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }

    @keyframes slideInLeft {
      from {
        opacity: 0;
        transform: translateX(-20px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    @keyframes slideInRight {
      from {
        opacity: 0;
        transform: translateX(20px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    @keyframes scaleIn {
      from {
        opacity: 0;
        transform: scale(0.9);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }

    /* Utility Classes */
    .ripple-effect {
      position: relative;
      overflow: hidden;
    }

    .ripple-effect::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 5px;
      height: 5px;
      background: rgba(255, 255, 255, 0.3);
      opacity: 0;
      border-radius: 100%;
      transform: scale(1, 1) translate(-50%);
      transform-origin: 50% 50%;
    }

    .ripple-effect:active::after {
      animation: ripple var(--ripple-duration) ease-out;
    }

    .shimmer-loading {
      background: linear-gradient(
        90deg,
        var(--vscode-editor-background) 25%,
        color-mix(in srgb, var(--vscode-focusBorder) 10%, var(--vscode-editor-background)) 50%,
        var(--vscode-editor-background) 75%
      );
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
    }

    .typing-indicator {
      display: flex;
      gap: 4px;
      padding: var(--spacing-sm);
    }

    .typing-indicator span {
      width: 6px;
      height: 6px;
      background: var(--vscode-focusBorder);
      border-radius: 50%;
      animation: typing-dot 1.4s infinite ease-in-out;
    }

    .typing-indicator span:nth-child(1) {
      animation-delay: 0s;
    }

    .typing-indicator span:nth-child(2) {
      animation-delay: 0.2s;
    }

    .typing-indicator span:nth-child(3) {
      animation-delay: 0.4s;
    }

    .glow-effect {
      animation: glow 2s ease-in-out infinite;
    }

    .float-effect {
      animation: float 2s ease-in-out infinite;
    }

    .spin-effect {
      animation: spin 1s linear infinite;
    }
  `);
}
