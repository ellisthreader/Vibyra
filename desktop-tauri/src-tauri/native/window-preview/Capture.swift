import AppKit
import CoreImage
import ScreenCaptureKit

@available(macOS 12.3, *)
final class WindowCapture: NSObject, SCStreamOutput, SCStreamDelegate {
    let id: UInt32
    let fingerprint: String
    let focus = FocusWatcher()
    private let lock = NSLock()
    private let context = CIContext(options: [.cacheIntermediates: false])
    private var jpeg = Data()
    private var problem: String?
    private var stream: SCStream?
    private var size = CGSize.zero

    init(id: UInt32, fingerprint: String) {
        self.id = id; self.fingerprint = fingerprint
    }

    func start() throws {
        let window = try shareableWindow(id)
        let info = try windowInfo(id)
        size = CGSize(width: info["width"] as? Double ?? 0, height: info["height"] as? Double ?? 0)
        let config = SCStreamConfiguration()
        let scale = min(1, 1280 / max(size.width, size.height))
        config.width = max(32, Int(size.width * scale))
        config.height = max(32, Int(size.height * scale))
        config.minimumFrameInterval = CMTime(value: 1, timescale: 8)
        config.queueDepth = 3
        // The phone taps where it wants; the Mac pointer would only get in the way.
        config.showsCursor = false
        if #available(macOS 14.0, *) { config.ignoreShadowsSingleWindow = true }
        let next = SCStream(filter: SCContentFilter(desktopIndependentWindow: window),
                            configuration: config, delegate: self)
        try next.addStreamOutput(self, type: .screen,
                                 sampleHandlerQueue: DispatchQueue(label: "app.vibyra.window-frames"))
        let done = DispatchSemaphore(value: 0)
        var failure: Error?
        next.startCapture { error in failure = error; done.signal() }
        guard done.wait(timeout: .now() + 8) == .success else {
            next.stopCapture { _ in }; throw fail("Window capture timed out.")
        }
        if let error = failure { throw error }
        stream = next
    }

    func frame() throws -> Data {
        let info = try windowInfo(id)
        guard info["fingerprint"] as? String == fingerprint else {
            throw fail("The application restarted. Select its new window on your Mac.")
        }
        guard info["width"] as? Double == size.width, info["height"] as? Double == size.height else {
            throw fail("The window resized. Close and reopen Preview to update its layout.")
        }
        lock.lock(); defer { lock.unlock() }
        if let problem = problem { throw fail(problem) }
        guard !jpeg.isEmpty else { throw fail("Waiting for the application's first frame.") }
        return jpeg
    }

    func stop() { stream?.stopCapture { _ in }; stream = nil; focus.stop() }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        lock.lock(); problem = error.localizedDescription; jpeg = Data(); lock.unlock()
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sample: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, sample.isValid,
              let attachments = CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let status = attachments.first?[.status] as? Int,
              status == SCFrameStatus.complete.rawValue,
              let buffer = sample.imageBuffer,
              let data = context.jpegRepresentation(of: CIImage(cvPixelBuffer: buffer),
                  colorSpace: CGColorSpaceCreateDeviceRGB(),
                  options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.7]),
              data.count <= 2 * 1024 * 1024 else { return }
        lock.lock(); jpeg = data; lock.unlock()
        focus.frameChanged()
    }
}
