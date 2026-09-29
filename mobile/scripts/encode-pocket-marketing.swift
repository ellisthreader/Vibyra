import AVFoundation
import CoreGraphics
import Foundation
import ImageIO

guard CommandLine.arguments.count == 3 else {
  fatalError("Usage: swift encode-pocket-marketing.swift <frame-directory> <output.mp4>")
}
let frames = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
let output = URL(fileURLWithPath: CommandLine.arguments[2])
let fps: Int32 = 25
let images = try FileManager.default.contentsOfDirectory(at: frames, includingPropertiesForKeys: nil)
  .filter { $0.pathExtension == "jpg" }.sorted { $0.lastPathComponent < $1.lastPathComponent }
guard !images.isEmpty else { fatalError("No JPEG frames in \(frames.path)") }
guard let firstSource = CGImageSourceCreateWithURL(images[0] as CFURL, nil),
      let firstImage = CGImageSourceCreateImageAtIndex(firstSource, 0, nil) else {
  fatalError("Invalid first frame")
}
let width = firstImage.width, height = firstImage.height
try? FileManager.default.removeItem(at: output)

let writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
let settings: [String: Any] = [
  AVVideoCodecKey: AVVideoCodecType.h264,
  AVVideoWidthKey: width,
  AVVideoHeightKey: height,
  AVVideoCompressionPropertiesKey: [
    AVVideoAverageBitRateKey: 8_000_000,
    AVVideoMaxKeyFrameIntervalKey: 25,
    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
  ],
]
let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
  kCVPixelBufferWidthKey as String: width,
  kCVPixelBufferHeightKey as String: height,
  kCVPixelBufferCGImageCompatibilityKey as String: true,
  kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
])
guard writer.canAdd(input) else { fatalError("H.264 input unavailable") }
writer.add(input)
guard writer.startWriting() else { fatalError("Writer failed: \(String(describing: writer.error))") }
writer.startSession(atSourceTime: .zero)
let color = CGColorSpaceCreateDeviceRGB()
for (index, file) in images.enumerated() {
  while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.01) }
  guard let pool = adaptor.pixelBufferPool else { fatalError("Missing pixel buffer pool") }
  var buffer: CVPixelBuffer?
  guard CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &buffer) == kCVReturnSuccess,
        let buffer else { fatalError("Pixel buffer allocation failed") }
  guard let source = CGImageSourceCreateWithURL(file as CFURL, nil),
        let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { fatalError("Invalid JPEG: \(file.path)") }
  CVPixelBufferLockBaseAddress(buffer, [])
  guard let context = CGContext(data: CVPixelBufferGetBaseAddress(buffer), width: width, height: height,
    bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buffer), space: color,
    bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue | CGBitmapInfo.byteOrder32Big.rawValue) else {
    fatalError("Could not create bitmap context")
  }
  context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
  CVPixelBufferUnlockBaseAddress(buffer, [])
  let time = CMTime(value: CMTimeValue(index), timescale: fps)
  guard adaptor.append(buffer, withPresentationTime: time) else {
    fatalError("Append failed: \(String(describing: writer.error))")
  }
}
input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
guard writer.status == .completed else { fatalError("Encode failed: \(String(describing: writer.error))") }
print("Encoded \(images.count) frames, \(width)×\(height), \(Double(images.count) / Double(fps)) seconds: \(output.path)")
