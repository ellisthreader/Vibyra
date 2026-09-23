import Foundation

enum SnapshotError: Error {
    case invalidRequest
    case invalidPath
    case tooLarge
}

func prepareSnapshot(_ request: CommandRequest) throws -> URL {
    guard UUID(uuidString: request.id) != nil,
          !request.script.isEmpty,
          request.script.utf8.count <= 8_192,
          (1...30).contains(request.timeoutSeconds),
          (1...65_536).contains(request.maxOutputBytes),
          request.files.count <= 100 else { throw SnapshotError.invalidRequest }
    let root = FileManager.default.temporaryDirectory
        .appendingPathComponent("agent-command-" + UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(
        at: root, withIntermediateDirectories: false,
        attributes: [.posixPermissions: 0o700])
    do {
        var bytes = 0
        for (path, encoded) in request.files.sorted(by: { $0.key < $1.key }) {
            let parts = path.split(separator: "/", omittingEmptySubsequences: false)
            guard !parts.isEmpty, path.utf8.count <= 512,
                  parts.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." && !$0.contains("\0") }),
                  let data = Data(base64Encoded: encoded) else { throw SnapshotError.invalidPath }
            bytes += data.count
            guard bytes <= 2_000_000 else { throw SnapshotError.tooLarge }
            let destination = parts.reduce(root) { $0.appendingPathComponent(String($1)) }
            try FileManager.default.createDirectory(
                at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
            try data.write(to: destination, options: .atomic)
        }
        try request.script.write(to: root.appendingPathComponent(".agent-test.sh"),
                                 atomically: true, encoding: .utf8)
        return root
    } catch {
        try? FileManager.default.removeItem(at: root)
        throw error
    }
}
