export function reportVersion(version: string, platform: string, macBuild: string): string {
  return platform.includes("Mac") && macBuild
    ? `${version} (build ${macBuild})`
    : version;
}
