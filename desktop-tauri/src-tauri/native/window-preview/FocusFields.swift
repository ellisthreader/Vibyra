import AppKit
import ApplicationServices

/// A text-taking element as the phone needs it: which keyboard to show and
/// where it is on the screen. Its contents are never read.
struct TextTarget {
    let kind: String
    let rect: CGRect?
    let label: String
    let empty: Bool?
}

let textRoles: Set<String> = [kAXTextFieldRole, kAXTextAreaRole, kAXComboBoxRole, "AXSearchField"]
private let describeNames = [kAXRoleAttribute, kAXSubroleAttribute, kAXPositionAttribute, kAXSizeAttribute,
                             kAXRoleDescriptionAttribute, kAXTitleAttribute, kAXDescriptionAttribute,
                             kAXPlaceholderValueAttribute, "AXEditableAncestor", kAXNumberOfCharactersAttribute,
                             kAXIdentifierAttribute, "AXDOMIdentifier", kAXEnabledAttribute]

/// Several attributes in one round trip to the application; missing ones are nil.
func axValues(_ element: AXUIElement, _ names: [String]) -> [AnyObject?] {
    var values: CFArray?
    guard AXUIElementCopyMultipleAttributeValues(element, names as CFArray, AXCopyMultipleAttributeOptions(rawValue: 0),
                                                 &values) == .success,
          let array = values as [AnyObject]?, array.count == names.count
    else { return Array(repeating: nil, count: names.count) }
    return array.map { item in
        CFGetTypeID(item) == AXValueGetTypeID() && AXValueGetType(item as! AXValue) == .axError ? nil : item
    }
}

func axElement(_ value: AnyObject?) -> AXUIElement? {
    guard let value, CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
    return (value as! AXUIElement)
}

func axRect(_ position: AnyObject?, _ size: AnyObject?) -> CGRect? {
    guard let position, let size, CFGetTypeID(position) == AXValueGetTypeID(),
          CFGetTypeID(size) == AXValueGetTypeID() else { return nil }
    var origin = CGPoint.zero, extent = CGSize.zero
    guard AXValueGetValue(position as! AXValue, .cgPoint, &origin),
          AXValueGetValue(size as! AXValue, .cgSize, &extent) else { return nil }
    return CGRect(origin: origin, size: extent)
}

/// The element takes typed text: a text field, text area, editable combo box,
/// password field, or anything inside an editable web region. Read-only text
/// (labels, logs, selectable static text) does not count.
func textTarget(_ element: AXUIElement) -> TextTarget? {
    let values = axValues(element, describeNames)
    let role = values[0] as? String ?? "", subrole = values[1] as? String ?? ""
    if values[12] as? Bool == false { return nil }
    let secure = subrole == kAXSecureTextFieldSubrole as String
    var settable = DarwinBoolean(false)
    AXUIElementIsAttributeSettable(element, kAXValueAttribute as CFString, &settable)
    let insideEditable = axElement(values[8]) != nil
    guard secure || (textRoles.contains(role) && settable.boolValue) || insideEditable else { return nil }
    let texts = [values[5], values[6], values[7]].compactMap { ($0 as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) }
    let label = texts.first { !$0.isEmpty } ?? ""
    let hints = ([values[4], values[10], values[11]].compactMap { $0 as? String } + texts).joined(separator: " ")
    let count = values[9] as? Int
    return TextTarget(kind: textKind(role: role, subrole: subrole, secure: secure, hints: hints),
                      rect: axRect(values[2], values[3]), label: String(label.prefix(60)),
                      empty: count.map { $0 == 0 })
}

/// The phone keyboard that suits the field. Structure wins over wording: a
/// password or a multi-line area is never given an email keyboard.
func textKind(role: String, subrole: String, secure: Bool, hints: String) -> String {
    if secure { return "secure" }
    if subrole == kAXSearchFieldSubrole as String || role == "AXSearchField" { return "search" }
    if role == kAXTextAreaRole as String { return "multiline" }
    let words = hints.lowercased()
    func has(_ any: [String]) -> Bool { any.contains { words.contains($0) } }
    if has(["email", "e-mail"]) { return "email" }
    if has(["url", "website", "web address"]) { return "url" }
    if has(["phone", "telephone", "mobile number"]) { return "tel" }
    if has(["one-time code", "verification code", "otp", "pin code", "passcode"]) { return "number" }
    if has(["search"]) { return "search" }
    return "text"
}

/// Where the text cursor is, if the application reports it.
func caretRect(_ element: AXUIElement) -> CGRect? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, kAXSelectedTextRangeAttribute as CFString, &value) == .success,
          let value, CFGetTypeID(value) == AXValueGetTypeID() else { return nil }
    var selected = CFRange()
    guard AXValueGetValue(value as! AXValue, .cfRange, &selected) else { return nil }
    let end = selected.location + selected.length
    func bounds(_ location: Int, _ length: Int) -> CGRect? {
        var range = CFRange(location: location, length: length)
        guard let parameter = AXValueCreate(.cfRange, &range) else { return nil }
        var result: CFTypeRef?
        guard AXUIElementCopyParameterizedAttributeValue(element, kAXBoundsForRangeParameterizedAttribute as CFString,
                                                         parameter, &result) == .success,
              let result, CFGetTypeID(result) == AXValueGetTypeID() else { return nil }
        var rect = CGRect.zero
        return AXValueGetValue(result as! AXValue, .cgRect, &rect) && rect.height > 0 ? rect : nil
    }
    if let rect = bounds(end, 0) { return CGRect(x: rect.minX, y: rect.minY, width: max(1, rect.width), height: rect.height) }
    guard end > 0, let before = bounds(end - 1, 1) else { return nil }
    return CGRect(x: before.maxX, y: before.minY, width: 1, height: before.height)
}

/// `rect` as fractions of the window, clipped to `visible`; nil when none of it shows.
func windowFraction(_ rect: CGRect, window: CGRect, visible: CGRect? = nil) -> [Double]? {
    let shown = rect.intersection(visible ?? window).intersection(window)
    guard !shown.isNull, shown.width >= 1, shown.height >= 1, window.width > 0, window.height > 0 else { return nil }
    func round4(_ value: CGFloat) -> Double { (Double(value) * 10_000).rounded() / 10_000 }
    return [round4((shown.minX - window.minX) / window.width), round4((shown.minY - window.minY) / window.height),
            round4(shown.width / window.width), round4(shown.height / window.height)]
}
