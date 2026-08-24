import SwiftUI

struct HooksView: View {
    @EnvironmentObject var settings: AppSettings
    @State private var subject = ""
    @State private var briefs: [Brief] = []
    @State private var loading = false
    @State private var errorText: String?
    private var client: APIClient { APIClient(settings: settings) }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        TextField("Сцена, напр. Гладиатор — финал", text: $subject)
                            .textInputAutocapitalization(.sentences)
                        Button {
                            Task { await generate() }
                        } label: { Image(systemName: "sparkles") }
                        .disabled(subject.trimmingCharacters(in: .whitespaces).isEmpty || loading)
                    }
                }
                ForEach(briefs) { brief in
                    Section(brief.hook) {
                        Text("«\(brief.hookText)»").font(.headline)
                        Text(brief.why).font(.footnote).foregroundStyle(.secondary)
                        Label(brief.frame, systemImage: "camera").font(.footnote)
                        ForEach(Array(brief.beats.enumerated()), id: \.offset) { _, beat in
                            Text("• \(beat)").font(.footnote)
                        }
                        Text(brief.caption).font(.footnote).foregroundStyle(.secondary)
                            .textSelection(.enabled)
                    }
                }
            }
            .navigationTitle("Сценарии")
            .overlay { if loading { ProgressView() } }
            .alert("Ошибка", isPresented: .constant(errorText != nil)) {
                Button("Ок") { errorText = nil }
            } message: { Text(errorText ?? "") }
        }
    }

    private func generate() async {
        loading = true; errorText = nil
        do { briefs = try await client.hooks(subject: subject) }
        catch { errorText = error.localizedDescription }
        loading = false
    }
}
