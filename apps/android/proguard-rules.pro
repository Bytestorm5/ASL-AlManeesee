# === al-Asl TWA R8 keep-rules ===
# Safety-net keep-rules for the Trusted Web Activity wrapper when R8 minification
# is enabled (minifyEnabled true). In practice these are rarely needed: the
# androidbrowserhelper library ships its own consumer ProGuard rules, and the
# TWA's LauncherActivity / DelegationService are declared in AndroidManifest.xml,
# which R8 keeps automatically. Kept here as a conservative safeguard so an
# R8-optimized release build cannot strip the app's entry points.

# Entry points referenced from the manifest.
-keep public class * extends android.app.Application
-keep public class * extends android.app.Activity
-keep public class * extends android.app.Service

# Trusted Web Activity / Custom Tabs plumbing (androidbrowserhelper + androidx.browser).
# Broad on purpose: the library is small, and this rules out reflection surprises.
-keep class com.google.androidbrowserhelper.** { *; }
-dontwarn com.google.androidbrowserhelper.**

# Preserve metadata that some AndroidX libraries read reflectively.
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod
