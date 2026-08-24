import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var settings: AppSettings
    @State private var checkResult: String?
    @State private var checking = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Сервер") {
                    TextField("http://192.168.1.10:8000", text: $settings.baseURL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                    SecureField("Токен (HERMES_API_TOKEN)", text: $settings.token)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
                Section {
                    Button {
                        Task { await check() }
                    } label: {
                        HStack {
                            Text("Проверить связь")
                            if checking { Spacer(); ProgressView() }
                        }
                    }.disabled(!settings.isConfigured || checking)
                    if let checkResult {
                        Text(checkResult).font(.footnote)
                            .foregroundStyle(checkResult.hasPrefix("✅") ? .green : .red)
                    }
                }
                Section("Аккаунты TikTok") { AccountsList() }
                Section {
                    Text("Адрес — это машина, где запущен бот (python -m app.main). "
                       + "На той же машине включи HERMES_API_TOKEN в .env. Телефон и "
                       + "сервер должны быть в одной сети, либо адрес доступен извне.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Настройки")
        }
    }

    private func check() async {
        checking = true; checkResult = nil
        do {
            let counts = try await APIClient(settings: settings).counts()
            let total = counts.values.reduce(0, +)
            checkResult = "✅ Связь есть. Роликов в очереди: \(total)."
        } catch {
            checkResult = "⚠️ \(error.localizedDescription)"
        }
        checking = false
    }
}

struct AccountsList: View {
    @EnvironmentObject var settings: AppSettings
    @State private var accounts: [TikTokAccount] = []
    @State private var loading = false

    var body: some View {
        Group {
            if loading { ProgressView() }
            else if accounts.isEmpty {
                Button("Загрузить аккаунты") { Task { await load() } }
                    .disabled(!settings.isConfigured)
            } else {
                ForEach(accounts) { acc in
                    VStack(alignment: .leading) {
                        Text(acc.name ?? "—")
                        Text(acc.id).font(.caption).foregroundStyle(.secondary)
                            .textSelection(.enabled)
                        if let s = acc.status { Text(s).font(.caption2).foregroundStyle(.secondary) }
                    }
                }
            }
        }
    }

    private func load() async {
        loading = true
        accounts = (try? await APIClient(settings: settings).accounts()) ?? []
        loading = false
    }
}
