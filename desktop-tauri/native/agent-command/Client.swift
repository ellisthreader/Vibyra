import Darwin
import Foundation

private func boundedLine(_ limit: Int) -> String? {
    var data = Data()
    while true {
        let byte = getchar()
        if byte == EOF { break }
        if byte == 10 { break }
        if data.count == limit { return nil }
        data.append(UInt8(byte))
    }
    return data.isEmpty ? nil : String(data: data, encoding: .utf8)
}

@main struct ClientMain {
    static func main() {
        let connection = NSXPCConnection(serviceName: "app.vibyra.desktop.agent-command")
        connection.remoteObjectInterface = NSXPCInterface(with: AgentCommandService.self)
        connection.resume()
        let done = DispatchSemaphore(value: 0)
        var response = "{\"error\":\"XPC connection failed\"}"
        let proxy = connection.remoteObjectProxyWithErrorHandler { _ in done.signal() }
            as! AgentCommandService
        guard let line = boundedLine(4_000_000),
              let data = line.data(using: .utf8),
              let request = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let identifier = request["id"] as? String else {
            print("{\"error\":\"invalid request\"}")
            connection.invalidate()
            return
        }
        proxy.execute(line) { result in response = result; done.signal() }
        DispatchQueue.global().async {
            while let control = boundedLine(16) {
                if control == "cancel" { proxy.cancel(identifier) { _ in } }
            }
        }
        if done.wait(timeout: .now() + 35) == .timedOut {
            proxy.cancel(identifier) { _ in }
            response = "{\"error\":\"XPC deadline\"}"
        }
        print(response)
        connection.invalidate()
    }
}
