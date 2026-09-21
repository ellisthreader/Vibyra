import AVFoundation
import Speech

/// Apple's speech recogniser listening to the microphone, reporting the whole
/// transcript as it firms up. Recognition stays on the phone whenever the phone
/// can do it there, so what someone says never has to leave the device.
/// Everything here runs on the main queue; the module schedules it there.
final class Dictation {
  var onUpdate: (([String: Any]) -> Void)?
  private let engine = AVAudioEngine()
  private var request: SFSpeechAudioBufferRecognitionRequest?
  private var task: SFSpeechRecognitionTask?
  private var stopping = false
  private var heard = false

  func start(_ done: @escaping (String?) -> Void) {
    cancel()
    SFSpeechRecognizer.requestAuthorization { status in
      DispatchQueue.main.async {
        guard status == .authorized else {
          done("Allow Speech Recognition for Vibyra in Settings to use your voice."); return
        }
        Dictation.requestMicrophone { granted in
          DispatchQueue.main.async {
            guard granted else { done("Allow the microphone for Vibyra in Settings to use your voice."); return }
            do { try self.begin(); done(nil) } catch {
              self.cancel(); done(error.localizedDescription)
            }
          }
        }
      }
    }
  }

  /// Stops listening. The recogniser still delivers what it heard, then `end`.
  func stop() {
    guard request != nil else { return }
    stopping = true
    stopAudio()
    request?.endAudio()
  }

  /// Drops everything without waiting for a result.
  func cancel() {
    task?.cancel()
    task = nil
    request = nil
    stopAudio()
  }

  private static func requestMicrophone(_ callback: @escaping (Bool) -> Void) {
    if #available(iOS 17.0, *) {
      AVAudioApplication.requestRecordPermission(completionHandler: callback)
    } else {
      AVAudioSession.sharedInstance().requestRecordPermission(callback)
    }
  }

  private func begin() throws {
    guard let recognizer = SFSpeechRecognizer(), recognizer.isAvailable else { throw DictationError.unavailable }
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.record, mode: .measurement, options: .duckOthers)
    try session.setActive(true, options: .notifyOthersOnDeactivation)
    let input = engine.inputNode
    let format = input.outputFormat(forBus: 0)
    // A device with no working microphone reports an empty format, and tapping it
    // would abort the app rather than throw.
    guard format.channelCount > 0, format.sampleRate > 0 else { throw DictationError.noMicrophone }

    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = true
    if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
    request.addsPunctuation = true
    input.removeTap(onBus: 0)
    input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in request.append(buffer) }
    engine.prepare()
    try engine.start()
    self.request = request
    stopping = false
    heard = false
    task = recognizer.recognitionTask(with: request) { [weak self] result, error in
      DispatchQueue.main.async { self?.receive(result, error) }
    }
  }

  private func receive(_ result: SFSpeechRecognitionResult?, _ error: Error?) {
    if let result {
      heard = heard || !result.bestTranscription.formattedString.isEmpty
      onUpdate?(["type": "transcript", "text": result.bestTranscription.formattedString, "final": result.isFinal])
    }
    guard error != nil || result?.isFinal == true else { return }
    // Stopping before anything was said ends with "no speech detected", which is
    // not a failure worth showing; neither is an error after words arrived.
    if let error, !stopping, !heard { onUpdate?(["type": "error", "message": error.localizedDescription]) }
    task = nil
    request = nil
    stopAudio()
    onUpdate?(["type": "end"])
  }

  private func stopAudio() {
    if engine.isRunning { engine.stop() }
    engine.inputNode.removeTap(onBus: 0)
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }
}

enum DictationError: LocalizedError {
  case unavailable, noMicrophone
  var errorDescription: String? {
    switch self {
    case .unavailable: return "Speech recognition is not available right now. Try again in a moment."
    case .noMicrophone: return "No microphone is available."
    }
  }
}
