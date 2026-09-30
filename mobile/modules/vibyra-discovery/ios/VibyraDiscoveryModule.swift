import ExpoModulesCore

public final class VibyraDiscoveryModule: Module {
  private let browser = ComputerBrowser()

  public func definition() -> ModuleDefinition {
    Name("VibyraDiscovery")
    Events("onDiscovery")
    OnCreate { [weak self] in
      self?.browser.onUpdate = { [weak self] update in
        self?.sendEvent("onDiscovery", update)
      }
    }
    AsyncFunction("start") { self.browser.start() }.runOnQueue(.main)
    AsyncFunction("stop") { self.browser.stop() }.runOnQueue(.main)
    OnAppEntersBackground { self.browser.suspend() }
    OnDestroy {
      let browser = self.browser
      DispatchQueue.main.async { browser.stop() }
    }
  }
}
