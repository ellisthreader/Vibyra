import ExpoModulesCore

public final class VibyraPreviewProofModule: Module {
  private let server = PreviewProofServer()
  private lazy var proxy = PreviewProofProxy { [weak self] name, payload in
    DispatchQueue.main.async { self?.sendEvent(name, payload) }
  }

  public func definition() -> ModuleDefinition {
    Name("VibyraPreviewProof")
    Events("onPreviewRequest", "onPreviewBody", "onPreviewEnd", "onPreviewCancel")
    AsyncFunction("start") { () throws -> String in
      try self.server.start()
    }
    AsyncFunction("stop") { self.server.stop() }
    AsyncFunction("startProxy") { (generation: String) throws -> String in
      try self.proxy.start(generation: generation)
    }
    AsyncFunction("stopProxy") { self.proxy.stop() }
    AsyncFunction("responseStart") { (id: String, status: Int, headers: [String: String], setCookies: [String]) throws in
      try self.proxy.responseStart(id: id, status: status, headers: headers, setCookies: setCookies)
    }
    AsyncFunction("responseData") { (id: String, dataBase64: String) throws in
      try self.proxy.responseData(id: id, dataBase64: dataBase64)
    }
    AsyncFunction("allowRequestRead") { (id: String, bytes: Int) throws in
      try self.proxy.allowRequestRead(id: id, bytes: bytes)
    }
    AsyncFunction("responseEnd") { (id: String) throws in try self.proxy.responseEnd(id: id) }
    AsyncFunction("responseCancel") { (id: String) in self.proxy.responseCancel(id: id) }
    OnAppEntersBackground { self.server.stop(); self.proxy.stop() }
    OnDestroy { self.server.stop(); self.proxy.stop() }
  }
}
