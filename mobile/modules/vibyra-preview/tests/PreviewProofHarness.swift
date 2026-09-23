import Foundation

@main
struct PreviewProofHarness {
  static func main() throws {
    let server = PreviewProofServer()
    print(try server.start())
    fflush(stdout)
    RunLoop.current.run(until: Date(timeIntervalSinceNow: 60))
    server.stop()
  }
}
