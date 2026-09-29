import AppKit
import ApplicationServices

/// Every text field visible in the shared window, as window fractions plus the
/// keyboard it wants: `[x, y, width, height, kind]`. The phone uses this map to
/// open its keyboard in the same touch as the tap, which iOS requires.
///
/// Accessibility requests run on the application's main thread, so the walk is
/// bounded in nodes and time; web content is searched in one request instead.
@available(macOS 12.3, *)
func scanTextFields(pid: pid_t, frame: CGRect, budget: CFAbsoluteTime = 0.04) -> [[Any]] {
    guard let window = sharedWindowElement(pid: pid, frame: frame) else { return [] }
    let deadline = CFAbsoluteTimeGetCurrent() + budget
    let names = [kAXRoleAttribute, kAXSubroleAttribute, kAXPositionAttribute, kAXSizeAttribute, kAXChildrenAttribute]
    var pending: [(AXUIElement, CGRect)] = [(window, frame)]
    var index = 0
    var found: [[Any]] = []
    func add(_ element: AXUIElement, _ clip: CGRect) {
        guard found.count < 48, let target = textTarget(element), let rect = target.rect,
              let fraction = windowFraction(rect, window: frame, visible: clip) else { return }
        found.append(fraction.map { $0 as Any } + [target.kind])
    }
    while index < pending.count, index < 600, found.count < 48, CFAbsoluteTimeGetCurrent() < deadline {
        let (node, clip) = pending[index]
        index += 1
        AXUIElementSetMessagingTimeout(node, 0.1)
        let values = axValues(node, names)
        let role = values[0] as? String ?? ""
        var visible = clip
        if let rect = axRect(values[2], values[3]), index > 1 {
            visible = rect.intersection(clip)
            if visible.isNull || visible.width < 1 || visible.height < 1 { continue }
        }
        if role == "AXWebArea", let fields = webTextFields(node) {
            fields.forEach { add($0, visible) }
            continue
        }
        if textRoles.contains(role) || values[1] as? String == kAXSecureTextFieldSubrole as String {
            add(node, visible)
            continue
        }
        // Scrolled content only shows inside its scroll view.
        let childClip = role == kAXScrollAreaRole as String ? visible : clip
        for child in (values[4] as? [AXUIElement] ?? []).prefix(300) { pending.append((child, childClip)) }
    }
    return found
}

/// WebKit and Chromium answer the rotor's text-field search in one request.
private func webTextFields(_ area: AXUIElement) -> [AXUIElement]? {
    let predicate: [String: Any] = ["AXSearchKey": "AXTextFieldSearchKey", "AXResultsLimit": 64,
                                    "AXDirection": "AXDirectionNext", "AXVisibleOnly": true,
                                    "AXImmediateDescendantsOnly": false]
    AXUIElementSetMessagingTimeout(area, 0.2)
    var result: CFTypeRef?
    guard AXUIElementCopyParameterizedAttributeValue(area, "AXUIElementsForSearchPredicate" as CFString,
                                                     predicate as CFDictionary, &result) == .success,
          let list = result as? [AnyObject] else { return nil }
    return list.compactMap(axElement)
}
