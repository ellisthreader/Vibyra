import Foundation

final class Handler: NSObject, AgentCommandService {
    private let lock = NSLock()
    private var jobs: [String: CommandJob] = [:]

    func execute(_ raw: String, withReply reply: @escaping (String) -> Void) {
        guard raw.utf8.count <= 4_000_000,
              let request = try? JSONDecoder().decode(CommandRequest.self, from: Data(raw.utf8)) else {
            reply(CommandResult(id: "", exitCode: nil, output: "", stopped: nil,
                                error: "invalid request").json())
            return
        }
        lock.lock()
        let accepted = jobs.count < 2 && jobs[request.id] == nil
        let job = CommandJob()
        if accepted { jobs[request.id] = job }
        lock.unlock()
        guard accepted else {
            reply(CommandResult(id: request.id, exitCode: nil, output: "", stopped: nil,
                                error: "busy or duplicate job").json())
            return
        }
        DispatchQueue.global().async {
            let result: CommandResult
            do {
                let root = try prepareSnapshot(request)
                defer { try? FileManager.default.removeItem(at: root) }
                result = runCommand(request, root: root, job: job)
            } catch {
                result = CommandResult(id: request.id, exitCode: nil, output: "", stopped: nil,
                                       error: "invalid snapshot")
            }
            self.lock.lock()
            self.jobs.removeValue(forKey: request.id)
            self.lock.unlock()
            reply(result.json())
        }
    }

    func cancel(_ identifier: String, withReply reply: @escaping (Bool) -> Void) {
        lock.lock()
        let job = jobs[identifier]
        lock.unlock()
        job?.stop("cancelled")
        reply(job != nil)
    }
}

final class ListenerDelegate: NSObject, NSXPCListenerDelegate {
    let handler = Handler()
    func listener(_ listener: NSXPCListener,
                  shouldAcceptNewConnection connection: NSXPCConnection) -> Bool {
        connection.exportedInterface = NSXPCInterface(with: AgentCommandService.self)
        connection.exportedObject = handler
        connection.resume()
        return true
    }
}

@main struct ServiceMain {
    static func main() {
        let delegate = ListenerDelegate()
        let listener = NSXPCListener.service()
        listener.delegate = delegate
        listener.resume()
        RunLoop.main.run()
    }
}
