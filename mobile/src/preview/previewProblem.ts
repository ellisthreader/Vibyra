export interface PreviewProblem { title: string; message: string; detail?: string }

/** Never put the private bootstrap credential in diagnostics. */
export function previewDetail(value: string): string {
  return value.replace(/\/_vibyra_preview\/[^\s?"'<>]*/g, '/[private-preview]')
    .replace(/\?[^\s"'<>]*/g, '').slice(0, 700);
}

export function previewProblem(kind: 'connection' | 'timeout' | 'script' | 'loop' | 'process' | 'http', detail = '', status?: number,
  host = 'computer'): PreviewProblem {
  const copy = {
    connection: ['Couldn’t reach your website', `Check that your ${host} is connected and the website is still running, then try again.`],
    timeout: ['Your website is taking too long', `The page hasn’t finished opening. Check the website on your ${host}, then try again.`],
    script: ['Your website couldn’t finish loading', 'The page arrived, but its app didn’t start. Check the website’s terminal for an error.'],
    loop: ['The website keeps reloading', `Preview paused the reloads. Check the website on your ${host} before trying again.`],
    process: ['Preview was interrupted', 'iOS closed the website’s browser. You can open it again below.'],
    http: ['The website returned an error', status && status >= 500
      ? `The website’s server couldn’t complete this request. Check its terminal on your ${host}.`
      : 'This page isn’t available. Check the website’s address or try again.'],
  }[kind];
  return { title: copy[0], message: copy[1], detail: previewDetail(status ? `HTTP ${status}${detail ? ` · ${detail}` : ''}` : detail) || undefined };
}
