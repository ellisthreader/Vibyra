import Foundation

@objc protocol AgentCommandService {
    func execute(_ request: String, withReply reply: @escaping (String) -> Void)
    func cancel(_ identifier: String, withReply reply: @escaping (Bool) -> Void)
}

struct CommandRequest: Decodable {
    let id: String
    let script: String
    let files: [String: String]
    let timeoutSeconds: Int
    let maxOutputBytes: Int
}

struct CommandResult: Encodable {
    let id: String
    let exitCode: Int32?
    let output: String
    let stopped: String?
    let error: String?

    func json() -> String {
        guard let data = try? JSONEncoder().encode(self),
              let value = String(data: data, encoding: .utf8) else { return "{}" }
        return value
    }
}
