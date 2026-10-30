import { execFileSync, execSync } from 'node:child_process';

export interface AdminCheckResult {
  isAdmin: boolean;
  platform: NodeJS.Platform;
  instructions?: string;
}

interface AdminCheckOptions {
  isElevated?: boolean;
}

const MACOS_INSTRUCTIONS =
  'To run TalkTerm with admin privileges, open Terminal and run:\n\nsudo /Applications/TalkTerm.app/Contents/MacOS/TalkTerm';

const WINDOWS_INSTRUCTIONS =
  'Right-click TalkTerm → Run as administrator\n\nOr search for TalkTerm, right-click, and select "Run as administrator".';

const LINUX_INSTRUCTIONS =
  'To run TalkTerm with admin privileges, open a terminal and run:\n\nsudo talkterm';

function getInstructionsForPlatform(platform: NodeJS.Platform): string {
  switch (platform) {
    case 'darwin':
      return MACOS_INSTRUCTIONS;
    case 'win32':
      return WINDOWS_INSTRUCTIONS;
    case 'linux':
      return LINUX_INSTRUCTIONS;
    default:
      return LINUX_INSTRUCTIONS;
  }
}

function checkUnixRoot(): boolean {
  if (typeof process.getuid === 'function') {
    return process.getuid() === 0;
  }
  return false;
}

function checkMacOsAdminGroup(): boolean {
  try {
    const groups = execSync('/usr/bin/groups', { encoding: 'utf-8', timeout: 3000 });
    return groups.split(/\s+/).includes('admin');
  } catch {
    return false;
  }
}

function checkWindowsElevated(): boolean {
  try {
    execFileSync('C:\\Windows\\System32\\net.exe', ['session'], {
      stdio: 'ignore',
      timeout: 3000,
    });
    return true;
  } catch {
    return false;
  }
}

export function checkAdminPrivileges(options?: AdminCheckOptions): AdminCheckResult {
  const platform = process.platform;

  let isAdmin: boolean;

  if (platform === 'win32') {
    isAdmin = options?.isElevated ?? checkWindowsElevated();
  } else if (platform === 'darwin') {
    isAdmin = checkUnixRoot() || checkMacOsAdminGroup();
  } else {
    isAdmin = checkUnixRoot();
  }

  return {
    isAdmin,
    platform,
    ...(isAdmin ? {} : { instructions: getInstructionsForPlatform(platform) }),
  };
}
