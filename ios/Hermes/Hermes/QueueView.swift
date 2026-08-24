import SwiftUI

@MainActor
final class QueueModel: ObservableObject {
    @Published var items: [QueueItem] = []
    @Published var counts: [String: Int] = [:]
    @Published var loading = false
    @Published var errorText: String?

    func load(_ client: APIClient) async {
        loading = true
        errorText = nil
        do {
            async let c = client.counts()
            async let i = client.list(status: "awaiting_approval")
            counts = try await c
            items = try await i
        } catch {
            errorText = error.localizedDescription
        }
        loading = false
    }

    func act(_ client: APIClient, id: Int, action: (APIClient, Int) async throws -> Void) async {
        do {
            try await action(client, id)
            await load(client)
        } catch {
            errorText = error.localizedDescription
        }
    }
}

struct QueueView: View {
    @EnvironmentObject var settings: AppSettings
    @StateObject private var model = QueueModel()
    private var client: APIClient { APIClient(settings: settings) }

    var body: some View {
        NavigationStack {
            Group {
                if !settings.isConfigured {
                    ContentUnavailableView("Нужна настройка",
                        systemImage: "gearshape",
                        description: Text("Открой вкладку «Настройки» и укажи адрес сервера и токен."))
                } else if model.items.isEmpty && !model.loading {
                    ContentUnavailableView("Нет роликов на аппрув",
                        systemImage: "checkmark.circle",
                        description: Text(summary))
                } else {
                    List {
                        if !model.counts.isEmpty {
                            Section("Очередь") { Text(summary).font(.footnote).foregroundStyle(.secondary) }
                        }
                        Section("Ждут решения") {
                            ForEach(model.items) { item in
                                QueueRow(item: item, client: client) { await model.load(client) }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Hermes")
            .toolbar {
                Button { Task { await model.load(client) } } label: {
                    Image(systemName: "arrow.clockwise")
                }
            }
            .refreshable { await model.load(client) }
            .overlay { if model.loading && model.items.isEmpty { ProgressView() } }
            .alert("Ошибка", isPresented: .constant(model.errorText != nil)) {
                Button("Ок") { model.errorText = nil }
            } message: { Text(model.errorText ?? "") }
            .task { if settings.isConfigured { await model.load(client) } }
        }
    }

    private var summary: String {
        model.counts.isEmpty ? "Очередь пуста."
            : model.counts.sorted { $0.key < $1.key }
                .map { "\($0.key): \($0.value)" }.joined(separator: "  ·  ")
    }
}

struct QueueRow: View {
    let item: QueueItem
    let client: APIClient
    let reload: () async -> Void
    @State private var busy = false
    @State private var editingCaption = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("#\(item.id) · \(item.title)").font(.headline)
            if !item.hookText.isEmpty {
                Text("Хук: \(item.hookText)").font(.subheadline).foregroundStyle(.secondary)
            }
            Text(item.caption).font(.footnote).foregroundStyle(.secondary).lineLimit(4)

            HStack {
                Button { run { try await client.publish(item.id) } } label: {
                    Label("Сейчас", systemImage: "paperplane.fill")
                }.buttonStyle(.borderedProminent).tint(.green)

                Button { run { try await client.approve(item.id) } } label: {
                    Label("В слот", systemImage: "clock")
                }.buttonStyle(.bordered)

                Spacer()

                Menu {
                    Button("Изменить подпись") { editingCaption = true }
                    Button("Отклонить", role: .destructive) { run { try await client.reject(item.id) } }
                } label: { Image(systemName: "ellipsis.circle") }
            }
            .disabled(busy)
        }
        .padding(.vertical, 4)
        .opacity(busy ? 0.5 : 1)
        .sheet(isPresented: $editingCaption) {
            CaptionEditor(item: item, client: client) { await reload() }
        }
    }

    private func run(_ op: @escaping () async throws -> Void) {
        busy = true
        Task {
            defer { busy = false }
            try? await op()
            await reload()
        }
    }
}

struct CaptionEditor: View {
    let item: QueueItem
    let client: APIClient
    let onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var text: String

    init(item: QueueItem, client: APIClient, onSaved: @escaping () async -> Void) {
        self.item = item; self.client = client; self.onSaved = onSaved
        _text = State(initialValue: item.caption)
    }

    var body: some View {
        NavigationStack {
            Form { TextEditor(text: $text).frame(minHeight: 200) }
                .navigationTitle("Подпись #\(item.id)")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Сохранить") {
                            Task { try? await client.setCaption(item.id, caption: text); await onSaved(); dismiss() }
                        }
                    }
                }
        }
    }
}
