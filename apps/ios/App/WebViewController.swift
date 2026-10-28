import UIKit
import WebKit
import SafariServices

/// Thin shell around almaneesee.al-asl.com — the iOS counterpart of the Android TWA.
/// The site detects ?appmode=1 (app-shell.js) and shows the installed-app chrome;
/// WKAppBoundDomains in Info.plist enables the service worker, so the app works
/// fully offline after the first launch, exactly like the TWA.
class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {

    private let appHost = "almaneesee.al-asl.com"
    private var startURL: URL { URL(string: "https://almaneesee.al-asl.com/?appmode=1&source=ios")! }

    private var webView: WKWebView!
    private var statusBarBacking: UIView!
    private var offlineView: UIStackView?
    private var hasLoadedOnce = false

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(named: "LaunchBackground")

        let cfg = WKWebViewConfiguration()
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []
        cfg.applicationNameForUserAgent = "AlManeeseeApp/1.0"
        if #available(iOS 14.0, *) {
            // Required for Service Worker support inside WKWebView (offline cache).
            cfg.limitsNavigationsToAppBoundDomains = true
        }

        webView = WKWebView(frame: .zero, configuration: cfg)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = UIColor(named: "LaunchBackground")
        webView.scrollView.backgroundColor = UIColor(named: "LaunchBackground")
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)

        // Solid plate behind the status bar, matching the app top bar.
        statusBarBacking = UIView()
        statusBarBacking.backgroundColor = UIColor(named: "StatusBarColor")
        statusBarBacking.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(statusBarBacking)

        NSLayoutConstraint.activate([
            statusBarBacking.topAnchor.constraint(equalTo: view.topAnchor),
            statusBarBacking.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            statusBarBacking.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            statusBarBacking.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),

            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        webView.load(URLRequest(url: startURL))
    }

    // MARK: - Navigation policy

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.allow); return }

        // Non-web schemes (mailto:, tel:, whatsapp:, …) go to the system.
        if let scheme = url.scheme?.lowercased(), scheme != "http", scheme != "https" {
            if scheme != "about" && scheme != "blob" && scheme != "data" {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
            return
        }

        // External sites open in an in-app Safari sheet, never inside the shell.
        if navigationAction.targetFrame?.isMainFrame != false,
           let host = url.host?.lowercased(), host != appHost {
            present(SFSafariViewController(url: url), animated: true)
            decisionHandler(.cancel)
            return
        }

        decisionHandler(.allow)
    }

    // target="_blank" links
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url {
            if let host = url.host?.lowercased(), host == appHost {
                webView.load(URLRequest(url: url))
            } else if url.scheme == "http" || url.scheme == "https" {
                present(SFSafariViewController(url: url), animated: true)
            }
        }
        return nil
    }

    // MARK: - Offline fallback (only matters before the first successful load,
    // after which the service worker serves everything from cache)

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        hasLoadedOnce = true
        hideOffline()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let code = (error as NSError).code
        if code == NSURLErrorCancelled { return }
        if !hasLoadedOnce { showOffline() }
    }

    private func showOffline() {
        guard offlineView == nil else { return }
        let label = UILabel()
        label.text = "لا يوجد اتصال\nNo connection — connect once to set up the app."
        label.numberOfLines = 0
        label.textAlignment = .center
        label.font = .systemFont(ofSize: 16)
        label.textColor = .secondaryLabel

        let button = UIButton(type: .system)
        button.setTitle("Try again", for: .normal)
        button.titleLabel?.font = .boldSystemFont(ofSize: 17)
        button.addTarget(self, action: #selector(retryLoad), for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [label, button])
        stack.axis = .vertical
        stack.spacing = 14
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 32),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -32)
        ])
        offlineView = stack
    }

    private func hideOffline() {
        offlineView?.removeFromSuperview()
        offlineView = nil
    }

    @objc private func retryLoad() {
        hideOffline()
        webView.load(URLRequest(url: startURL))
    }
}
