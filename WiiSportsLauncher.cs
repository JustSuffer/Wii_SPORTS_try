using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Reflection;
using System.Text;
using System.Threading;

namespace WiiSports
{
    class Program
    {
        private static Process nodeProcess = null;
        private static string projectDir = "";
        private static string controllerUrl = "";
        private static bool isServerRunning = false;
        private static readonly object consoleLock = new object();

        static void Main(string[] args)
        {
            Console.OutputEncoding = Encoding.UTF8;
            Console.Title = "Wii Sports Resort - PC Edition";

            DrawHeader();

            // 1. Resolve project directory
            projectDir = FindProjectDirectory();
            if (string.IsNullOrEmpty(projectDir))
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("\n[HATA] server.js bulunamadı!");
                Console.WriteLine("Lütfen bu programı Wii Sports oyun klasöründe çalıştırın.");
                Console.ResetColor();
                Console.WriteLine("\nÇıkmak için bir tuşa basın...");
                Console.ReadKey();
                return;
            }

            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("[✓] Oyun Klasörü: " + projectDir);
            Console.ResetColor();

            // 2. Resolve node.exe
            string nodePath = FindNodeExecutable();
            if (string.IsNullOrEmpty(nodePath))
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("\n[HATA] Node.js (node.exe) sisteminizde bulunamadı!");
                Console.WriteLine("Lütfen https://nodejs.org adresinden Node.js kurun ve tekrar deneyin.");
                Console.ResetColor();
                Console.WriteLine("\nÇıkmak için bir tuşa basın...");
                Console.ReadKey();
                return;
            }

            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("[✓] Node.js Bulundu: " + nodePath);
            Console.ResetColor();

            // 3. Register cleanup on exit
            AppDomain.CurrentDomain.ProcessExit += OnProcessExit;
            Console.CancelKeyPress += delegate(object sender, ConsoleCancelEventArgs e)
            {
                e.Cancel = true;
                CleanupAndExit();
            };

            // 4. Check if server is already running on port 8443
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("[i] Sunucu kontrol ediliyor...");
            Console.ResetColor();

            if (IsServerAlive("https://localhost:8443/api/connection-info"))
            {
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine("[✓] Wii Sports sunucusu zaten arka planda çalışıyor!");
                Console.ResetColor();
                isServerRunning = true;
                FetchConnectionInfo();
            }
            else
            {
                // 5. Start node server.js
                Console.ForegroundColor = ConsoleColor.Cyan;
                Console.WriteLine("[i] Wii Sports Sunucusu başlatılıyor...");
                Console.ResetColor();

                StartNodeServer(nodePath, projectDir);

                // Wait for server to respond
                Console.Write("    Sunucu hazırlanıyor");
                int attempts = 0;
                while (attempts < 30)
                {
                    Thread.Sleep(500);
                    Console.Write(".");
                    if (IsServerAlive("https://localhost:8443/api/connection-info"))
                    {
                        isServerRunning = true;
                        break;
                    }
                    attempts++;
                }
                Console.WriteLine("");

                if (!isServerRunning)
                {
                    Console.ForegroundColor = ConsoleColor.Yellow;
                    Console.WriteLine("[!] Sunucu yanıt verme süresi aşıldı, yine de tarayıcı açılıyor...");
                    Console.ResetColor();
                }
                else
                {
                    Console.ForegroundColor = ConsoleColor.Green;
                    Console.WriteLine("[✓] Sunucu başarıyla hazırlandı (Port: 8443 HTTPS)!");
                    Console.ResetColor();
                }
            }

            // 6. Automatically open game in Chrome / Edge App Mode
            LaunchGameBrowser();

            // 7. Try creating desktop shortcut if not exists
            CreateDesktopShortcut();

            // 8. Interactive loop
            PrintHelpMenu();

            bool keepRunning = true;
            while (keepRunning)
            {
                if (Console.KeyAvailable)
                {
                    ConsoleKeyInfo key = Console.ReadKey(true);
                    switch (key.Key)
                    {
                        case ConsoleKey.O:
                        case ConsoleKey.B:
                            Console.ForegroundColor = ConsoleColor.Cyan;
                            Console.WriteLine("\n[i] Oyun penceresi yeniden açılıyor...");
                            Console.ResetColor();
                            LaunchGameBrowser();
                            break;

                        case ConsoleKey.K:
                            CopyControllerUrlToClipboard();
                            break;

                        case ConsoleKey.Q:
                        case ConsoleKey.Escape:
                            keepRunning = false;
                            break;
                    }
                }
                Thread.Sleep(100);
            }

            CleanupAndExit();
        }

        private static void DrawHeader()
        {
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine(@"
========================================================================
     🎮   W I I   S P O R T S   R E S O R T   -   P C   E D I T I O N   🎮
========================================================================");
            Console.ForegroundColor = ConsoleColor.White;
            Console.WriteLine("    Nintendo Wii Sports & Resort Web Remake + iPhone Wiimote");
            Console.ForegroundColor = ConsoleColor.DarkGray;
            Console.WriteLine("    Geliştirici: Antigravity AI & Topluluk");
            Console.WriteLine("========================================================================\n");
            Console.ResetColor();
        }

        private static void PrintHelpMenu()
        {
            Console.ForegroundColor = ConsoleColor.DarkCyan;
            Console.WriteLine("\n------------------------------------------------------------------------");
            Console.ForegroundColor = ConsoleColor.White;
            Console.WriteLine(" [O] Oyunu Tarayıcıda Yeniden Aç");
            Console.WriteLine(" [K] iPhone Kumanda Linkini Panoya Kopyala");
            Console.WriteLine(" [Q] Oyunu ve Sunucuyu Kapat (Çıkış)");
            Console.ForegroundColor = ConsoleColor.DarkCyan;
            Console.WriteLine("------------------------------------------------------------------------\n");
            Console.ResetColor();
        }

        private static string FindProjectDirectory()
        {
            // 1. Current assembly directory
            string exeDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            if (!string.IsNullOrEmpty(exeDir) && File.Exists(Path.Combine(exeDir, "server.js")))
            {
                return exeDir;
            }

            // 2. Working directory
            string curDir = Directory.GetCurrentDirectory();
            if (File.Exists(Path.Combine(curDir, "server.js")))
            {
                return curDir;
            }

            // 3. Known project path
            string fallback = @"d:\github\wii\Wii_SPORTS_try";
            if (File.Exists(Path.Combine(fallback, "server.js")))
            {
                return fallback;
            }

            return null;
        }

        private static string FindNodeExecutable()
        {
            // 1. Check PATH
            string pathEnv = Environment.GetEnvironmentVariable("PATH");
            if (!string.IsNullOrEmpty(pathEnv))
            {
                string[] paths = pathEnv.Split(';');
                foreach (string p in paths)
                {
                    try
                    {
                        string full = Path.Combine(p.Trim(), "node.exe");
                        if (File.Exists(full)) return full;
                    }
                    catch { }
                }
            }

            // 2. Standard install locations
            string[] knownLocations = new string[]
            {
                @"C:\Program Files\nodejs\node.exe",
                @"C:\Program Files (x86)\nodejs\node.exe",
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\node.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), @"npm\node.exe"),
            };

            foreach (string loc in knownLocations)
            {
                if (File.Exists(loc)) return loc;
            }

            return null;
        }

        private static bool IsServerAlive(string url)
        {
            try
            {
                ServicePointManager.ServerCertificateValidationCallback = delegate { return true; };
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
                req.Timeout = 1500;
                req.Method = "GET";
                using (HttpWebResponse res = (HttpWebResponse)req.GetResponse())
                {
                    return res.StatusCode == HttpStatusCode.OK;
                }
            }
            catch
            {
                return false;
            }
        }

        private static void FetchConnectionInfo()
        {
            try
            {
                ServicePointManager.ServerCertificateValidationCallback = delegate { return true; };
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create("https://localhost:8443/api/connection-info");
                req.Timeout = 2000;
                using (HttpWebResponse res = (HttpWebResponse)req.GetResponse())
                using (StreamReader reader = new StreamReader(res.GetResponseStream()))
                {
                    string json = reader.ReadToEnd();
                    int idx = json.IndexOf("\"controllerUrl\":\"");
                    if (idx > -1)
                    {
                        int start = idx + 17;
                        int end = json.IndexOf("\"", start);
                        if (end > -1)
                        {
                            controllerUrl = json.Substring(start, end - start);
                            Console.ForegroundColor = ConsoleColor.Yellow;
                            Console.WriteLine("\n📱 iPhone Kumanda Linki:\n   " + controllerUrl);
                            Console.ResetColor();
                        }
                    }
                }
            }
            catch { }
        }

        private static void StartNodeServer(string nodePath, string workDir)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = nodePath;
                psi.Arguments = "server.js";
                psi.WorkingDirectory = workDir;
                psi.UseShellExecute = false;
                psi.RedirectStandardOutput = true;
                psi.RedirectStandardError = true;
                psi.CreateNoWindow = true;
                psi.StandardOutputEncoding = Encoding.UTF8;
                psi.StandardErrorEncoding = Encoding.UTF8;

                nodeProcess = new Process();
                nodeProcess.StartInfo = psi;

                nodeProcess.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e)
                {
                    if (!string.IsNullOrEmpty(e.Data))
                    {
                        lock (consoleLock)
                        {
                            if (e.Data.Contains("iPhone Controller") || e.Data.Contains("PC Screen") || e.Data.Contains("KUMANDA LINKI"))
                            {
                                Console.ForegroundColor = ConsoleColor.Yellow;
                                Console.WriteLine(e.Data);
                                Console.ResetColor();
                            }
                            else if (e.Data.Contains("█") || e.Data.Contains("▀") || e.Data.Contains("▄"))
                            {
                                // Terminal QR code line
                                Console.ForegroundColor = ConsoleColor.White;
                                Console.WriteLine(e.Data);
                                Console.ResetColor();
                            }
                            else
                            {
                                Console.WriteLine(e.Data);
                            }
                        }

                        if (e.Data.Contains("https://") && e.Data.Contains("/controller.html"))
                        {
                            int uIdx = e.Data.IndexOf("https://");
                            if (uIdx >= 0)
                            {
                                controllerUrl = e.Data.Substring(uIdx).Trim();
                            }
                        }
                    }
                };

                nodeProcess.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e)
                {
                    if (!string.IsNullOrEmpty(e.Data))
                    {
                        lock (consoleLock)
                        {
                            Console.ForegroundColor = ConsoleColor.DarkYellow;
                            Console.WriteLine("[Server Log] " + e.Data);
                            Console.ResetColor();
                        }
                    }
                };

                nodeProcess.Start();
                nodeProcess.BeginOutputReadLine();
                nodeProcess.BeginErrorReadLine();
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("[HATA] Sunucu başlatılamadı: " + ex.Message);
                Console.ResetColor();
            }
        }

        private static void LaunchGameBrowser()
        {
            string gameUrl = "https://localhost:8443";

            // List of browsers supporting --app mode (Edge and Chrome)
            string[] appBrowsers = new string[]
            {
                @"C:\Program Files\Google\Chrome\Application\chrome.exe",
                @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                @"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
                @"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Google\Chrome\Application\chrome.exe"),
            };

            string chosenBrowser = null;
            foreach (string b in appBrowsers)
            {
                if (File.Exists(b))
                {
                    chosenBrowser = b;
                    break;
                }
            }

            try
            {
                if (!string.IsNullOrEmpty(chosenBrowser))
                {
                    Console.ForegroundColor = ConsoleColor.Green;
                    Console.WriteLine("[✓] Oyun Bağımsız Uygulama Modunda Başlatılıyor (" + Path.GetFileNameWithoutExtension(chosenBrowser) + ")...");
                    Console.ResetColor();

                    ProcessStartInfo psi = new ProcessStartInfo();
                    psi.FileName = chosenBrowser;
                    psi.Arguments = "--app=" + gameUrl + " --ignore-certificate-errors --allow-insecure-localhost --start-maximized";
                    psi.UseShellExecute = false;
                    Process.Start(psi);
                }
                else
                {
                    Console.ForegroundColor = ConsoleColor.Green;
                    Console.WriteLine("[✓] Oyun varsayılan tarayıcıda açılıyor: " + gameUrl);
                    Console.ResetColor();
                    Process.Start(new ProcessStartInfo(gameUrl) { UseShellExecute = true });
                }
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("[HATA] Tarayıcı açılamadı: " + ex.Message);
                Console.ResetColor();
            }
        }

        private static void CopyControllerUrlToClipboard()
        {
            if (string.IsNullOrEmpty(controllerUrl))
            {
                controllerUrl = "https://localhost:8443/controller.html";
            }

            try
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = "powershell.exe";
                psi.Arguments = "-NoProfile -Command \"Set-Clipboard -Value '" + controllerUrl + "'\"";
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;
                Process.Start(psi);

                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine("\n[✓] iPhone Linki Windows Panosuna Kopyalandı!");
                Console.WriteLine("    " + controllerUrl);
                Console.ResetColor();
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("\n[HATA] Panoya kopyalanamadı: " + ex.Message);
                Console.ResetColor();
            }
        }

        private static void CreateDesktopShortcut()
        {
            try
            {
                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                string shortcutPath = Path.Combine(desktop, "Wii Sports Resort.lnk");
                string exePath = Path.Combine(projectDir, "WiiSports.exe");

                if (File.Exists(exePath) && !File.Exists(shortcutPath))
                {
                    string iconPath = Path.Combine(projectDir, "wii.ico");
                    string psCommand = string.Format(
                        "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('{0}'); $s.TargetPath = '{1}'; $s.WorkingDirectory = '{2}'; $s.IconLocation = '{3}'; $s.Save()",
                        shortcutPath.Replace("'", "''"),
                        exePath.Replace("'", "''"),
                        projectDir.Replace("'", "''"),
                        (File.Exists(iconPath) ? iconPath : exePath).Replace("'", "''")
                    );

                    ProcessStartInfo psi = new ProcessStartInfo();
                    psi.FileName = "powershell.exe";
                    psi.Arguments = "-NoProfile -Command \"" + psCommand + "\"";
                    psi.CreateNoWindow = true;
                    psi.UseShellExecute = false;
                    Process.Start(psi);

                    Console.ForegroundColor = ConsoleColor.Cyan;
                    Console.WriteLine("[✓] Masaüstü kısayolu oluşturuldu: Wii Sports Resort.lnk");
                    Console.ResetColor();
                }
            }
            catch { }
        }

        private static void OnProcessExit(object sender, EventArgs e)
        {
            CleanupAndExit();
        }

        private static void CleanupAndExit()
        {
            if (nodeProcess != null && !nodeProcess.HasExited)
            {
                try
                {
                    Console.ForegroundColor = ConsoleColor.Yellow;
                    Console.WriteLine("\n[i] Sunucu kapatılıyor...");
                    Console.ResetColor();

                    // Kill process tree
                    ProcessStartInfo killPsi = new ProcessStartInfo();
                    killPsi.FileName = "taskkill.exe";
                    killPsi.Arguments = string.Format("/F /T /PID {0}", nodeProcess.Id);
                    killPsi.CreateNoWindow = true;
                    killPsi.UseShellExecute = false;
                    Process p = Process.Start(killPsi);
                    if (p != null) p.WaitForExit(2000);
                }
                catch { }
            }
        }
    }
}
