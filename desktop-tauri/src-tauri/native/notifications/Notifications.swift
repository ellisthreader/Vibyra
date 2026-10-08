import AppKit
import Foundation
import UserNotifications

private typealias Activation = @convention(c) (UnsafePointer<CChar>?) -> Void
private var activation: Activation?

private final class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationDelegate()

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler complete: @escaping () -> Void) {
        defer { complete() }
        // Dismiss and unrelated action buttons can never open a task.
        guard response.actionIdentifier == UNNotificationDefaultActionIdentifier,
              let route = response.notification.request.content.userInfo["vibyraRoute"] as? String,
              route.utf8.count <= 2048 else { return }
        route.withCString { activation?($0) }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler complete: @escaping (UNNotificationPresentationOptions) -> Void) {
        // Whether foreground alerts are wanted was decided by the existing app preferences.
        complete([.banner, .list])
    }
}

@_cdecl("vibyra_notifications_setup")
func notificationSetup(_ callback: @escaping @convention(c) (UnsafePointer<CChar>?) -> Void) {
    activation = callback
    UNUserNotificationCenter.current().delegate = NotificationDelegate.shared
}

// These two functions run on a Rust blocking worker, never the main/UI thread.
// A bounded semaphore covers a lost OS reply; no thread waits for a person's click.
@_cdecl("vibyra_notifications_permission")
func notificationPermission(_ ask: Bool) -> Int32 {
    let center = UNUserNotificationCenter.current()
    let ready = DispatchSemaphore(value: 0)
    var result: Int32 = -1
    if ask {
        center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            result = error == nil ? (granted ? 1 : 2) : -1
            ready.signal()
        }
    } else {
        center.getNotificationSettings { settings in
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral: result = 1
            case .denied: result = 2
            case .notDetermined: result = 0
            @unknown default: result = -1
            }
            ready.signal()
        }
    }
    return ready.wait(timeout: .now() + (ask ? 120 : 10)) == .success ? result : -1
}

@_cdecl("vibyra_notifications_show")
func notificationShow(_ identifier: UnsafePointer<CChar>, _ title: UnsafePointer<CChar>,
                      _ body: UnsafePointer<CChar>, _ route: UnsafePointer<CChar>) -> Bool {
    let content = UNMutableNotificationContent()
    content.title = String(cString: title)
    content.body = String(cString: body)
    let value = String(cString: route)
    // The empty route identifies our generic banner: default tap opens the
    // app, never any stored action such as Install update or Hibernate.
    content.userInfo = ["vibyraRoute": value]
    let request = UNNotificationRequest(identifier: String(cString: identifier), content: content, trigger: nil)
    let ready = DispatchSemaphore(value: 0)
    var accepted = false
    UNUserNotificationCenter.current().add(request) { error in
        accepted = error == nil
        ready.signal()
    }
    return ready.wait(timeout: .now() + 10) == .success && accepted
}
