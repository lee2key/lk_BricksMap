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
        string board = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "board.json");
        string key = BitConverter.ToString(SHA256.Create().ComputeHash(Encoding.UTF8.GetBytes(board.ToUpperInvariant())));
        bool first;
        using (var mutex = new Mutex(true, @"Local\lkBricks-" + key, out first)) {
            if (!first) { MessageBox.Show("This board is already open.", "lk Bricks Map"); return; }
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
                Run(root, Path.Combine(cache, "profiles", key.Replace("-", "")), board);
            } catch (Exception ex) { MessageBox.Show(ex.Message, "lk Bricks Map"); }
        }
    }

    [MethodImpl(MethodImplOptions.NoInlining)]
    static void Run(string root, string profile, string board) { Application.Run(new BoardWindow(root, profile, board)); }
}

internal sealed class BoardWindow : Form {
    const string Page = "https://lk-bricks.local/index.html";
    readonly WebView2 view = new WebView2();
    readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer { Interval = 60000 };
    readonly string board;
    string pending;

    internal BoardWindow(string root, string profile, string file) {
        board = file;
        Text = "lk Bricks Map";
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
                string initial = File.Exists(file) ? "'" + Convert.ToBase64String(File.ReadAllBytes(file)) + "'" : "null";
                await core.AddScriptToExecuteOnDocumentCreatedAsync("if(location.href==='" + Page + "') window.lkInitialBoard=" + initial + ";");
                core.WebMessageReceived += (s,e) => {
                    if (e.Source != Page) return;
                    string msg = e.TryGetWebMessageAsString();
                    if (msg == "invalid") { MessageBox.Show("Cannot open board.json. Check the file and restart.", Text); Close(); }
                    else if (msg.StartsWith("export:", StringComparison.Ordinal)) ExportBoard(msg.Substring("export:".Length));
                    else pending = msg;
                };
                core.Navigate(Page);
                timer.Tick += (s,e) => Save();
                timer.Start();
            } catch (Exception ex) { MessageBox.Show(ex.Message, Text); Close(); }
        };
        FormClosing += (s,e) => { if (!Save()) e.Cancel = true; };
        FormClosed += (s,e) => timer.Dispose();
    }

    void ExportBoard(string json) {
        try {
            using (var dialog = new SaveFileDialog {
                Title = "Save board as",
                Filter = "JSON board (*.json)|*.json",
                DefaultExt = "json",
                AddExtension = true,
                FileName = "bricks-map.json",
                OverwritePrompt = true
            }) {
                if (dialog.ShowDialog(this) == DialogResult.OK)
                    File.WriteAllText(dialog.FileName, json, new UTF8Encoding(false));
            }
        } catch (Exception ex) {
            MessageBox.Show(this, "Could not export the board. " + ex.Message, Text);
        }
    }

    bool Save() {
        if (pending == null) return true;
        try {
            string temp = board + ".tmp";
            File.WriteAllText(temp, pending, new UTF8Encoding(false));
            if (File.Exists(board)) File.Replace(temp, board, null);
            else File.Move(temp, board);
            pending = null;
            return true;
        } catch (Exception ex) { MessageBox.Show("Could not save board.json. " + ex.Message, Text); return false; }
    }
}
