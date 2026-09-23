import Darwin
import Foundation

final class CommandJob: @unchecked Sendable {
    private let lock = NSLock()
    private var pid: pid_t = 0
    private var finished = false
    private var reason: String?

    var stopped: String? {
        lock.lock()
        defer { lock.unlock() }
        return reason
    }

    func started(_ process: pid_t) {
        lock.lock()
        pid = process
        let reason = self.reason
        lock.unlock()
        if reason != nil { signal(SIGTERM) }
    }

    func stop(_ reason: String) {
        lock.lock()
        if finished || self.reason != nil { lock.unlock(); return }
        self.reason = reason
        lock.unlock()
        signal(SIGTERM)
        DispatchQueue.global().asyncAfter(deadline: .now() + 1) { self.signal(SIGKILL) }
    }

    func complete() {
        lock.lock()
        finished = true
        pid = 0
        lock.unlock()
    }

    private func signal(_ number: Int32) {
        lock.lock()
        let process = finished ? 0 : pid
        if process > 0 { kill(-process, number) }
        lock.unlock()
    }
}

func runCommand(_ request: CommandRequest, root: URL, job: CommandJob) -> CommandResult {
    var pipeFD: [Int32] = [0, 0]
    guard pipe(&pipeFD) == 0 else {
        return CommandResult(id: request.id, exitCode: nil, output: "", stopped: nil, error: "pipe failed")
    }
    var actions: posix_spawn_file_actions_t? = nil
    var attributes: posix_spawnattr_t? = nil
    posix_spawn_file_actions_init(&actions)
    posix_spawnattr_init(&attributes)
    defer {
        posix_spawn_file_actions_destroy(&actions)
        posix_spawnattr_destroy(&attributes)
        if pipeFD[0] >= 0 { close(pipeFD[0]) }
        if pipeFD[1] >= 0 { close(pipeFD[1]) }
    }
    posix_spawn_file_actions_adddup2(&actions, pipeFD[1], STDOUT_FILENO)
    posix_spawn_file_actions_adddup2(&actions, pipeFD[1], STDERR_FILENO)
    posix_spawn_file_actions_addclose(&actions, pipeFD[0])
    posix_spawn_file_actions_addclose(&actions, pipeFD[1])
    let changedDirectory = root.path.withCString {
        posix_spawn_file_actions_addchdir_np(&actions, $0)
    }
    guard changedDirectory == 0,
          posix_spawnattr_setflags(&attributes, Int16(POSIX_SPAWN_SETPGROUP)) == 0,
          posix_spawnattr_setpgroup(&attributes, 0) == 0 else {
        return CommandResult(id: request.id, exitCode: nil, output: "", stopped: nil, error: "spawn setup failed")
    }
    let args = ["/bin/sh", ".agent-test.sh"]
    let environment = ["PATH=/usr/bin:/bin", "HOME=\(root.path)", "TMPDIR=\(root.path)", "LANG=C"]
    let argv = args.map { strdup($0) } + [nil]
    let envp = environment.map { strdup($0) } + [nil]
    defer { argv.forEach { if let pointer = $0 { free(pointer) } }
            envp.forEach { if let pointer = $0 { free(pointer) } } }
    var process: pid_t = 0
    let spawned = posix_spawn(&process, "/bin/sh", &actions, &attributes, argv, envp)
    guard spawned == 0 else {
        return CommandResult(id: request.id, exitCode: nil, output: "", stopped: nil,
                             error: "spawn failed: \(spawned)")
    }
    close(pipeFD[1]); pipeFD[1] = -1
    job.started(process)
    DispatchQueue.global().asyncAfter(deadline: .now() + .seconds(request.timeoutSeconds)) {
        job.stop("deadline")
    }
    var output = Data()
    var chunk = [UInt8](repeating: 0, count: 4_096)
    while true {
        let count = read(pipeFD[0], &chunk, chunk.count)
        if count == 0 { break }
        if count < 0 {
            if errno == EINTR { continue }
            job.stop("pipe_error")
            break
        }
        if output.count + count > request.maxOutputBytes {
            output.append(contentsOf: chunk.prefix(max(0, request.maxOutputBytes - output.count)))
            job.stop("output_limit")
        } else {
            output.append(contentsOf: chunk.prefix(count))
        }
    }
    var status: Int32 = 0
    var waited: pid_t
    repeat { waited = waitpid(process, &status, 0) } while waited == -1 && errno == EINTR
    job.complete()
    let exitCode = waited == process && (status & 0x7f) == 0 ? (status >> 8) & 0xff : nil
    return CommandResult(id: request.id, exitCode: exitCode,
                         output: String(data: output, encoding: .utf8) ?? "",
                         stopped: job.stopped, error: waited == process ? nil : "wait failed")
}
