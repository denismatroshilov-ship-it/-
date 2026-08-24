import Foundation
import Combine

/// Адрес сервера и токен. Храним в UserDefaults — этого достаточно для
/// личного инструмента; токен здесь же, что и на сервере в HERMES_API_TOKEN.
final class AppSettings: ObservableObject {
    @Published var baseURL: String {
        didSet { UserDefaults.standard.set(baseURL, forKey: "baseURL") }
    }
    @Published var token: String {
        didSet { UserDefaults.standard.set(token, forKey: "token") }
    }

    init() {
        baseURL = UserDefaults.standard.string(forKey: "baseURL") ?? ""
        token = UserDefaults.standard.string(forKey: "token") ?? ""
    }

    var isConfigured: Bool {
        !baseURL.trimmingCharacters(in: .whitespaces).isEmpty
            && !token.trimmingCharacters(in: .whitespaces).isEmpty
    }
}
