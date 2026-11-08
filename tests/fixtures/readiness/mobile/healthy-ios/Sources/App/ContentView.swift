import SwiftUI
import Security

struct ContentView: View {
    func storeToken(token: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: "sessionToken",
            kSecValueData as String: Data(token.utf8)
        ]
        SecItemAdd(query as CFDictionary, nil)
    }

    var body: some View {
        Text("Healthy iOS App")
    }
}
