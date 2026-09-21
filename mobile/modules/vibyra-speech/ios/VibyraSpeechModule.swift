import ExpoModulesCore

public final class VibyraSpeechModule: Module {
  private let dictation = Dictation()

  public func definition() -> ModuleDefinition {
    Name("VibyraSpeech")
    Events("onDictation")
    OnCreate { [weak self] in
      self?.dictation.onUpdate = { [weak self] update in
        self?.sendEvent("onDictation", update)
      }
    }
    // Resolves once the microphone is live, or rejects with why it is not.
    AsyncFunction("start") { (promise: Promise) in
      self.dictation.start { failure in
        if let failure { promise.reject("ERR_DICTATION", failure) } else { promise.resolve() }
      }
    }.runOnQueue(.main)
    // Stops listening; the final words still arrive, followed by an `end` update.
    AsyncFunction("stop") { self.dictation.stop() }.runOnQueue(.main)
    OnAppEntersBackground { self.dictation.stop() }
    OnDestroy {
      let dictation = self.dictation
      DispatchQueue.main.async { dictation.cancel() }
    }
  }
}
