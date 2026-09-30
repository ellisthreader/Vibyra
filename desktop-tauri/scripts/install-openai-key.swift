// Import the deployment-owned key from backend/.env into Vibyra's Keychain
// item. The secret never appears in command arguments, output, or the bundle.
// Run: swift desktop-tauri/scripts/install-openai-key.swift backend/.env
import Foundation
import Security

func fail(_ message: String) -> Never {
    fputs("\(message)\n", stderr)
    exit(1)
}

guard CommandLine.arguments.count == 2 else {
    fail("Usage: install-openai-key.swift <path-to-backend/.env>")
}

let envText: String
do {
    envText = try String(contentsOfFile: CommandLine.arguments[1], encoding: .utf8)
} catch {
    fail("Could not read the environment file")
}

let key = envText.split(whereSeparator: \.isNewline).compactMap { raw -> String? in
    var line = String(raw).trimmingCharacters(in: .whitespaces)
    if line.hasPrefix("export ") { line = String(line.dropFirst(7)).trimmingCharacters(in: .whitespaces) }
    guard let separator = line.firstIndex(of: "=") else { return nil }
    let name = line[..<separator].trimmingCharacters(in: .whitespaces)
    guard name == "OPENAI_API_KEY" else { return nil }
    var value = line[line.index(after: separator)...].trimmingCharacters(in: .whitespaces)
    if value.count >= 2 && ((value.first == "\"" && value.last == "\"") ||
                            (value.first == "'" && value.last == "'")) {
        value.removeFirst()
        value.removeLast()
    }
    return value
}.first { value in
    value.hasPrefix("sk-") && (20...400).contains(value.count) &&
        value.utf8.allSatisfy { $0 >= 33 && $0 <= 126 }
}

guard let key else { fail("The environment file has no valid OPENAI_API_KEY") }
let data = Data(key.utf8)
let query: [CFString: Any] = [
    kSecClass: kSecClassGenericPassword,
    kSecAttrService: "com.vibyra.desktop",
    kSecAttrAccount: "openai-api-key",
]
var status = SecItemUpdate(query as CFDictionary, [kSecValueData: data] as CFDictionary)
if status == errSecItemNotFound {
    var item = query
    item[kSecValueData] = data
    status = SecItemAdd(item as CFDictionary, nil)
}
guard status == errSecSuccess else { fail("Keychain import failed (status \(status))") }

var readQuery = query
readQuery[kSecReturnData] = kCFBooleanTrue
readQuery[kSecMatchLimit] = kSecMatchLimitOne
var result: CFTypeRef?
let readStatus = SecItemCopyMatching(readQuery as CFDictionary, &result)
guard readStatus == errSecSuccess, let stored = result as? Data, stored == data else {
    fail("Keychain import could not be verified")
}
print("Vibyra OpenAI key installed and verified in macOS Keychain; reopen Vibyra.")
