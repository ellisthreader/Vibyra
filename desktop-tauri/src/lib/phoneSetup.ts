export type HostPlatform = "linux" | "windows";

/** Commands are copied for review, never executed by the settings page. */
export function hostSetupCommand(platform: HostPlatform, project: string, address: string): string {
  if (!project || /[\r\n\0]/.test(project)) throw new Error("Enter a full project folder path.");
  if (platform === "linux" ? !project.startsWith("/") : !/^[a-z]:[\\/]/i.test(project)) {
    throw new Error(platform === "linux" ? "Use a full path, such as /home/you/Projects/app." : "Use a full path, such as C:\\Projects\\app.");
  }
  const parts = address.trim().split(".");
  const ip = parts.map(Number);
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part)) || ip.some(part => part > 255) ||
      !(ip[0] === 10 || (ip[0] === 192 && ip[1] === 168) || (ip[0] === 172 && ip[1] >= 16 && ip[1] <= 31))) {
    throw new Error("Enter this computer’s private Wi-Fi IPv4 address, such as 192.168.1.20.");
  }
  const host = ip.join(".");
  const quote = (value: string) => platform === "windows" ? `'${value.replaceAll("'", "''")}'` : `'${value.replaceAll("'", "'\\''")}'`;
  const binary = platform === "windows" ? "Vibyra-Host-0.6.0-preview-windows-x86_64.exe" : "Vibyra-Host-0.6.0-preview-linux-x86_64";
  const prefix = platform === "windows" ? `& '.\\${binary}'` : `chmod +x './${binary}'\n'./${binary}'`;
  return `${prefix} --project ${quote(project)} --listen 0.0.0.0:4318 --public-url ws://${host}:4318 --pair`;
}
