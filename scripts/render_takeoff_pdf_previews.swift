import AppKit
import Foundation
import PDFKit

struct RenderManifest: Decodable {
  struct PageEntry: Decodable {
    let pageNumber: Int
    let widthPts: Double
    let heightPts: Double
    let rotationDegrees: Int
    let outputWidthPts: Double
    let outputHeightPts: Double
    let outputPath: String
  }

  let pdfPath: String
  let maxEdgePx: Double
  let targetPixelsPerPoint: Double
  let pages: [PageEntry]
}

func renderPreview(
  for page: PDFPage,
  widthPts: Double,
  heightPts: Double,
  rotationDegrees: Int,
  outputWidthPts: Double,
  outputHeightPts: Double,
  maxEdgePx: Double,
  targetPixelsPerPoint: Double
) throws -> Data {
  let longestEdgePts = max(outputWidthPts, outputHeightPts)
  let boundedPixelsPerPoint = min(targetPixelsPerPoint, maxEdgePx / max(longestEdgePts, 1))
  let renderScale = max(1.0, boundedPixelsPerPoint)
  let pixelWidth = max(1, Int(round(outputWidthPts * renderScale)))
  let pixelHeight = max(1, Int(round(outputHeightPts * renderScale)))

  let colorSpace = CGColorSpaceCreateDeviceRGB()
  guard let bitmapContext = CGContext(
    data: nil,
    width: pixelWidth,
    height: pixelHeight,
    bitsPerComponent: 8,
    bytesPerRow: 0,
    space: colorSpace,
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
  ) else {
    throw NSError(domain: "TradesstackTakeoffPreview", code: 1, userInfo: [NSLocalizedDescriptionKey: "Unable to allocate bitmap context."])
  }

  bitmapContext.setFillColor(NSColor.white.cgColor)
  bitmapContext.fill(CGRect(x: 0, y: 0, width: pixelWidth, height: pixelHeight))
  bitmapContext.saveGState()
  bitmapContext.scaleBy(x: CGFloat(renderScale), y: CGFloat(renderScale))
  page.draw(with: .mediaBox, to: bitmapContext)
  bitmapContext.restoreGState()

  guard let cgImage = bitmapContext.makeImage() else {
    throw NSError(domain: "TradesstackTakeoffPreview", code: 2, userInfo: [NSLocalizedDescriptionKey: "Unable to create preview image."])
  }

  let bitmapRep = NSBitmapImageRep(cgImage: cgImage)
  guard let pngData = bitmapRep.representation(using: .png, properties: [:]) else {
    throw NSError(domain: "TradesstackTakeoffPreview", code: 3, userInfo: [NSLocalizedDescriptionKey: "Unable to encode preview PNG."])
  }

  return pngData
}

let arguments = CommandLine.arguments
guard arguments.count == 2 else {
  fputs("Expected a manifest path argument.\n", stderr)
  exit(1)
}

let manifestPath = arguments[1]
let manifestUrl = URL(fileURLWithPath: manifestPath)
let manifestData = try Data(contentsOf: manifestUrl)
let manifest = try JSONDecoder().decode(RenderManifest.self, from: manifestData)

guard let document = PDFDocument(url: URL(fileURLWithPath: manifest.pdfPath)) else {
  fputs("Unable to open source PDF.\n", stderr)
  exit(1)
}

for pageEntry in manifest.pages {
  let pageIndex = pageEntry.pageNumber - 1
  guard let page = document.page(at: pageIndex) else {
    throw NSError(domain: "TradesstackTakeoffPreview", code: 4, userInfo: [
      NSLocalizedDescriptionKey: "Unable to load PDF page \(pageEntry.pageNumber)."
    ])
  }

  let pngData = try renderPreview(
    for: page,
    widthPts: pageEntry.widthPts,
    heightPts: pageEntry.heightPts,
    rotationDegrees: pageEntry.rotationDegrees,
    outputWidthPts: pageEntry.outputWidthPts,
    outputHeightPts: pageEntry.outputHeightPts,
    maxEdgePx: manifest.maxEdgePx,
    targetPixelsPerPoint: manifest.targetPixelsPerPoint
  )

  let outputUrl = URL(fileURLWithPath: pageEntry.outputPath)
  try FileManager.default.createDirectory(
    at: outputUrl.deletingLastPathComponent(),
    withIntermediateDirectories: true,
    attributes: nil
  )
  try pngData.write(to: outputUrl, options: .atomic)
}
