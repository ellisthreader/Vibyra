import ExpoModulesCore
import StoreKit

public final class VibyraPurchasesModule: Module {
  private var observer: Task<Void, Never>?
  public func definition() -> ModuleDefinition {
    Name("VibyraPurchases")
    Events("transactionsChanged")
    OnStartObserving {
      self.observer?.cancel()
      self.observer = Task { [weak self] in
        for await result in Transaction.updates {
          if Task.isCancelled { return }
          if case .verified(let t) = result, t.productID.hasPrefix("app.vibyra.vibes.") {
            self?.sendEvent("transactionsChanged", [:])
          }
        }
      }
    }
    OnStopObserving { self.observer?.cancel(); self.observer = nil }
    OnDestroy { self.observer?.cancel() }
    AsyncFunction("products") { (ids: [String]) async throws in try await StoreKitPurchases.products(ids) }
    AsyncFunction("buy") { (id: String, token: String) async throws in try await StoreKitPurchases.buy(id, token: token) }
    AsyncFunction("pending") { () async in await StoreKitPurchases.pending() }
    AsyncFunction("restore") { () async throws in try await StoreKitPurchases.restore() }
    AsyncFunction("finish") { (id: String) async in await StoreKitPurchases.finish(id) }
  }
}
