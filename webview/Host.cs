using System;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal static class Program {
    [STAThread]
    static void Main() {
        Application.EnableVisualStyles();
        string key = PathKey(AppDomain.CurrentDomain.BaseDirectory);
        bool first;
        using (var mutex = new Mutex(true, @"Local\lkBricks-" + key, out first)) {
            if (!first) { MessageBox.Show("This board is already open.", "lk_BricksMap"); return; }
            try {
                var asm = Assembly.GetExecutingAssembly();
                string cache = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "lk Bricks WebView2");
                string root = Path.Combine(cache, asm.ManifestModule.ModuleVersionId.ToString());
                if (!Directory.Exists(root)) {
                    string stage = root + "-" + Guid.NewGuid();
                    Directory.CreateDirectory(stage);
                    using (var zip = new ZipArchive(asm.GetManifestResourceStream("payload"))) zip.ExtractToDirectory(stage);
                    try { Directory.Move(stage, root); } catch (IOException) { if (!Directory.Exists(root)) throw; }
                }
                AppDomain.CurrentDomain.AssemblyResolve += delegate(object sender, ResolveEventArgs args) {
                    var name = new AssemblyName(args.Name).Name;
                    return name.StartsWith("Microsoft.Web.WebView2.") ? Assembly.LoadFrom(Path.Combine(root, name + ".dll")) : null;
                };
                Run(root, Path.Combine(cache, "profiles", key));
            } catch (Exception ex) { MessageBox.Show(ex.Message, "lk_BricksMap"); }
        }
    }

    internal static string PathKey(string path) {
        using (var sha = SHA256.Create())
            return BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(path.ToUpperInvariant()))).Replace("-", "");
    }

    [MethodImpl(MethodImplOptions.NoInlining)]
    static void Run(string root, string profile) { Application.Run(new BoardWindow(root, profile)); }
}

internal sealed class BoardWindow : Form {
    const string Page = "https://lk-bricks.local/index.html";
    readonly WebView2 view = new WebView2();
    readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer { Interval = 60000 };
    string boardPath;
    string pending;
    Mutex boardMutex;
    int session;
    bool choosingFile;

    internal BoardWindow(string root, string profile) {
        Text = "lk_BricksMap";
        Icon = System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        Width = 1440; Height = 900;
        view.Dock = DockStyle.Fill;
        Controls.Add(view);
        Shown += async delegate {
            try {
                CoreWebView2Environment.SetLoaderDllFolderPath(root);
                var env = await CoreWebView2Environment.CreateAsync(null, profile);
                await view.EnsureCoreWebView2Async(env);
                var core = view.CoreWebView2;
                core.SetVirtualHostNameToFolderMapping("lk-bricks.local", Path.Combine(root, "site"), CoreWebView2HostResourceAccessKind.DenyCors);
                core.NavigationStarting += (s,e) => { if (e.Uri != Page) e.Cancel = true; };
                core.NewWindowRequested += (s,e) => e.Handled = true;
                await core.AddScriptToExecuteOnDocumentCreatedAsync("if(location.href==='" + Page + "') window.lkDesktop=true;");
                core.WebMessageReceived += async (s,e) => {
                    if (e.Source != Page) return;
                    string msg = e.TryGetWebMessageAsString();
                    string savePrefix = "save:" + session + ":";
                    if (boardPath != null && msg.StartsWith(savePrefix, StringComparison.Ordinal)) {
                        pending = msg.Substring(savePrefix.Length);
                    } else if (msg == "open" || msg.StartsWith("new:", StringComparison.Ordinal)) {
                        await ChooseBoardAsync(msg == "open" ? null : msg.Substring(4));
                    }
                };
                core.Navigate(Page);
                timer.Tick += (s,e) => { if (!choosingFile) Save(); };
                timer.Start();
            } catch (Exception ex) { MessageBox.Show(ex.Message, Text); Close(); }
        };
        FormClosing += (s,e) => { if (choosingFile || !Save()) e.Cancel = true; };
        FormClosed += (s,e) => {
            timer.Dispose();
            ReleaseBoardMutex();
        };
    }

    async System.Threading.Tasks.Task ChooseBoardAsync(string initialJson) {
        if (choosingFile) return;
        choosingFile = true;
        Mutex nextMutex = null;
        try {
            await System.Threading.Tasks.Task.Yield();
            string path;
            using (FileDialog dialog = initialJson == null
                ? (FileDialog)new OpenFileDialog { Title = "Open map", CheckFileExists = true }
                : new SaveFileDialog { Title = "New map", DefaultExt = "json", AddExtension = true, OverwritePrompt = true, FileName = "bricks-map.json" }) {
                dialog.Filter = "JSON board (*.json)|*.json|All files (*.*)|*.*";
                if (dialog.ShowDialog(this) != DialogResult.OK) return;
                path = Path.GetFullPath(dialog.FileName);
            }

            if (!string.Equals(path, boardPath, StringComparison.OrdinalIgnoreCase)) {
                var candidate = new Mutex(false, @"Local\lkBricks-file-" + Program.PathKey(path));
                bool acquired;
                try { acquired = candidate.WaitOne(0); }
                catch (AbandonedMutexException) { acquired = true; }
                if (!acquired) {
                    candidate.Dispose();
                    throw new IOException("This map is already open in another window.");
                }
                nextMutex = candidate;
            }
            if (!Save()) return;

            byte[] bytes;
            if (initialJson != null) {
                bytes = Encoding.UTF8.GetBytes(initialJson);
            } else {
                bytes = File.ReadAllBytes(path);
            }
            string encoded = Convert.ToBase64String(bytes);
            if (await view.CoreWebView2.ExecuteScriptAsync("window.lkValidateBoard('" + encoded + "')") != "true")
                throw new IOException("The file is not a valid lk_BricksMap board.");

            if (initialJson != null) WriteBoard(path, initialJson);
            if (nextMutex != null) {
                ReleaseBoardMutex();
                boardMutex = nextMutex;
                nextMutex = null;
            }
            boardPath = path;
            pending = null;
            session++;
            Text = "lk_BricksMap - " + Path.GetFileName(path);
            view.CoreWebView2.PostWebMessageAsString("loaded:" + session + ":" + encoded);
        } catch (Exception ex) {
            MessageBox.Show(this, "Could not " + (initialJson == null ? "open" : "create") + " the map. " + ex.Message, Text);
        } finally {
            if (nextMutex != null) {
                nextMutex.ReleaseMutex();
                nextMutex.Dispose();
            }
            choosingFile = false;
        }
    }

    void ReleaseBoardMutex() {
        if (boardMutex == null) return;
        boardMutex.ReleaseMutex();
        boardMutex.Dispose();
        boardMutex = null;
    }

    static void WriteBoard(string path, string json) {
        string temp = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try {
            File.WriteAllText(temp, json, new UTF8Encoding(false));
            if (File.Exists(path)) File.Replace(temp, path, null);
            else File.Move(temp, path);
        } finally {
            if (File.Exists(temp)) File.Delete(temp);
        }
    }

    bool Save() {
        if (pending == null) return true;
        try {
            WriteBoard(boardPath, pending);
            pending = null;
            return true;
        } catch (Exception ex) {
            MessageBox.Show(this, "Could not save " + boardPath + ". " + ex.Message, Text);
            return false;
        }
    }
}
