import SwiftUI

struct LoginView: View {
    func onLoginSuccess(token: String) {
        UserDefaults.standard.set(token, forKey: "authToken")
    }

    var body: some View {
        Text("Defective iOS App")
    }
}
