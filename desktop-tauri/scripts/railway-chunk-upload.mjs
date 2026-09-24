import { dirname } from "node:path";

/** Keep stdin below Railway SSH's observed truncation limit. */
export function uploadChunks(bytes, remote, service, run) {
  run(["ssh", ...service, "--", "sh", "-c", `mkdir -p ${dirname(remote)} && : > ${remote}`]);
  const chunkSize = 4 * 1024 * 1024;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    run(["ssh", ...service, "--", "sh", "-c", `cat >> ${remote}`], {
      input: bytes.subarray(offset, offset + chunkSize),
    });
  }
}
