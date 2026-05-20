export function previewUrl(projectId, token) {
  return `/preview/project/${encodeURIComponent(projectId)}/${encodeURIComponent(token)}/`;
}

export function previewServerProxyUrl(projectId, token) {
  return `/preview/server/${encodeURIComponent(projectId)}/${encodeURIComponent(token)}/`;
}
