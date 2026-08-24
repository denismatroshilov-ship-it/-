import Foundation

struct QueueItem: Identifiable, Decodable {
    let id: Int
    let title: String
    let caption: String
    let status: String
    let hookText: String
    let videoURL: String?
    let error: String?

    enum CodingKeys: String, CodingKey {
        case id, title, caption, status, error
        case hookText = "hook_text"
        case videoURL = "video_url"
    }
}

struct Brief: Identifiable, Decodable {
    var id: String { hook + hookText }
    let hook: String
    let why: String
    let hookText: String
    let frame: String
    let beats: [String]
    let caption: String

    enum CodingKeys: String, CodingKey {
        case hook, why, frame, beats, caption
        case hookText = "hook_text"
    }
}

struct TikTokAccount: Identifiable, Decodable {
    let connectorID: String?
    let accountID: String?
    let name: String?
    let status: String?

    var id: String { connectorID ?? accountID ?? UUID().uuidString }

    enum CodingKeys: String, CodingKey {
        case name, status
        case connectorID = "connector_id"
        case accountID = "id"
    }
}

enum APIError: LocalizedError {
    case notConfigured
    case badStatus(Int, String)
    case transport(String)

    var errorDescription: String? {
        switch self {
        case .notConfigured: return "Не задан адрес сервера или токен."
        case let .badStatus(code, msg): return "Сервер ответил \(code): \(msg)"
        case let .transport(msg): return msg
        }
    }
}

/// Тонкий клиент к HTTP-API бота. Один экземпляр читает настройки перед
/// каждым запросом, чтобы смена адреса/токена подхватывалась сразу.
struct APIClient {
    let settings: AppSettings

    private func request(_ path: String, method: String = "GET",
                         body: [String: Any]? = nil) async throws -> Data {
        guard settings.isConfigured,
              let url = URL(string: settings.baseURL.trimmingCharacters(in: .whitespaces) + path)
        else { throw APIError.notConfigured }

        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("Bearer \(settings.token)", forHTTPHeaderField: "Authorization")
        req.timeoutInterval = 60
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }

        do {
            let (data, response) = try await URLSession.shared.data(for: req)
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard (200..<300).contains(code) else {
                let msg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
                throw APIError.badStatus(code, msg ?? "")
            }
            return data
        } catch let err as APIError {
            throw err
        } catch {
            throw APIError.transport(error.localizedDescription)
        }
    }

    func counts() async throws -> [String: Int] {
        let data = try await request("/queue/counts")
        return (try? JSONDecoder().decode([String: Int].self, from: data)) ?? [:]
    }

    func list(status: String) async throws -> [QueueItem] {
        let data = try await request("/queue?status=\(status)")
        struct Wrap: Decodable { let items: [QueueItem] }
        return try JSONDecoder().decode(Wrap.self, from: data).items
    }

    func approve(_ id: Int) async throws { _ = try await request("/items/\(id)/approve", method: "POST") }
    func reject(_ id: Int) async throws { _ = try await request("/items/\(id)/reject", method: "POST") }
    func publish(_ id: Int) async throws { _ = try await request("/items/\(id)/publish", method: "POST") }

    func setCaption(_ id: Int, caption: String) async throws {
        _ = try await request("/items/\(id)/caption", method: "POST", body: ["caption": caption])
    }

    func hooks(subject: String) async throws -> [Brief] {
        let data = try await request("/hooks", method: "POST", body: ["subject": subject])
        struct Wrap: Decodable { let briefs: [Brief] }
        return try JSONDecoder().decode(Wrap.self, from: data).briefs
    }

    func clip(filename: String, span: String, hook: String) async throws -> [String] {
        let data = try await request("/clip", method: "POST",
                                     body: ["filename": filename, "span": span, "hook": hook])
        struct Wrap: Decodable { let id: Int; let warnings: [String] }
        return (try? JSONDecoder().decode(Wrap.self, from: data).warnings) ?? []
    }

    func accounts() async throws -> [TikTokAccount] {
        let data = try await request("/accounts")
        struct Wrap: Decodable { let accounts: [TikTokAccount] }
        return try JSONDecoder().decode(Wrap.self, from: data).accounts
    }
}
