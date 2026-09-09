import Foundation
import StoreKit

enum StoreKitPurchases {
  static func products(_ ids: [String]) async throws -> [[String: String]] {
    guard ids.count <= 10, ids.allSatisfy({ $0.hasPrefix("app.vibyra.vibes.") }) else { throw PurchaseFailure.invalidProduct }
    return try await Product.products(for: ids).map { ["id": $0.id, "displayPrice": $0.displayPrice] }
  }
  static func buy(_ id: String, token: String) async throws -> [String: String]? {
    guard id.hasPrefix("app.vibyra.vibes."), let account = UUID(uuidString: token),
      let product = try await Product.products(for: [id]).first else { throw PurchaseFailure.invalidProduct }
    switch try await product.purchase(options: [.appAccountToken(account)]) {
    case .success(let result):
      guard case .verified(let transaction) = result else { throw PurchaseFailure.unverified }
      // The server must persist its verified grant before JavaScript calls finish.
      return payload(transaction)
    case .userCancelled: return nil
    case .pending: throw PurchaseFailure.pending
    @unknown default: throw PurchaseFailure.unverified
    }
  }
  static func pending() async -> [[String: String]] {
    var results: [[String: String]] = []
    for await result in Transaction.unfinished {
      if case .verified(let t) = result, t.productID.hasPrefix("app.vibyra.vibes.") { results.append(payload(t)) }
    }
    return results
  }
  static func restore() async throws -> [[String: String]] {
    try await AppStore.sync()
    var results: [[String: String]] = []
    for await result in Transaction.all {
      if case .verified(let t) = result, t.productID.hasPrefix("app.vibyra.vibes.") { results.append(payload(t)) }
    }
    return results
  }
  static func finish(_ id: String) async {
    for await result in Transaction.unfinished {
      if case .verified(let t) = result, String(t.id) == id, t.productID.hasPrefix("app.vibyra.vibes.") {
        await t.finish(); return
      }
    }
  }
  private static func payload(_ t: Transaction) -> [String: String] {
    var result = ["transactionId": String(t.id), "productId": t.productID]
    if let account = t.appAccountToken { result["accountToken"] = account.uuidString }
    return result
  }
}
private enum PurchaseFailure: String, Error, LocalizedError {
  case invalidProduct = "This purchase is not available. Please try again later."
  case unverified = "Apple could not verify this purchase. Please try Restore Purchases."
  case pending = "Your purchase is awaiting approval. Vibes will arrive after Apple confirms it."
  var errorDescription: String? { rawValue }
}
