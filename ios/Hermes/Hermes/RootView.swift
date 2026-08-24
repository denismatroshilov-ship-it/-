import SwiftUI

struct RootView: View {
    @EnvironmentObject var settings: AppSettings

    var body: some View {
        TabView {
            QueueView()
                .tabItem { Label("Очередь", systemImage: "tray.full") }
            HooksView()
                .tabItem { Label("Сценарии", systemImage: "sparkles") }
            SettingsView()
                .tabItem { Label("Настройки", systemImage: "gearshape") }
        }
    }
}
