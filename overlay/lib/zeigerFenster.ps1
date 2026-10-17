# Welches Fenster liegt gerade unter dem Mauszeiger?
#
# WARUM EIN DAUERLAUFENDES SKRIPT: Die Antwort wird oft gebraucht - jedesmal,
# wenn der Schrank eine andere Packung herauszieht, und danach im Takt,
# solange der Klickfaenger offen steht. Ein eigener PowerShell-Start je Frage
# wuerde rund 200 ms und einen Prozess kosten; so wird einmal gestartet und
# danach je Zeile auf der Standardeingabe geantwortet.
#
# Protokoll: eine beliebige Zeile herein -> eine Zeile hinaus:
#
#     <hwnd> <Klasse> <hwnd der Wurzel> <Klasse der Wurzel>
#
# Die Wurzel steht dabei, weil der Schrank im Hintergrundmodus ein KIND von
# WorkerW ist: Unter dem Zeiger liegt dann unser eigenes Fenster, und sein
# oberster Vorfahr ist der Desktop-Hintergrund.
#
# Warum ueberhaupt: Der Klickfaenger ist ein gewoehnliches Fenster auf der
# obersten Ebene. Ohne diese Pruefung laege er auch ueber einem Browser, in dem
# gerade gearbeitet wird - ein Doppelklick dort startete dann ein Spiel, das
# irgendwo hinter diesem Fenster im Schrank steht. Nachgemessen: Faenger
# bekommt den Doppelklick, das fokussierte Arbeitsfenster bekommt nichts.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public class TsZeiger {
  [StructLayout(LayoutKind.Sequential)]
  public struct POINT { public int X; public int Y; }

  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint flags);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetClassName(IntPtr h, StringBuilder s, int n);

  private static string Klasse(IntPtr h) {
    if (h == IntPtr.Zero) return "-";
    StringBuilder sb = new StringBuilder(256);
    GetClassName(h, sb, 256);
    string k = sb.ToString();
    return k.Length == 0 ? "-" : k.Replace(" ", "_");
  }

  public static string Unter() {
    POINT p;
    if (!GetCursorPos(out p)) return "0 - 0 -";
    IntPtr h = WindowFromPoint(p);
    // GA_ROOT = 2: der oberste Vorfahr. Fuer ein Kind von WorkerW ist das
    // WorkerW selbst, fuer ein gewoehnliches Fenster es selbst.
    IntPtr wurzel = GetAncestor(h, 2);
    return h.ToInt64() + " " + Klasse(h) + " " + wurzel.ToInt64() + " " + Klasse(wurzel);
  }
}
'@

# Bereitmeldung, damit die aufrufende Seite weiss, dass das Uebersetzen durch
# ist - Add-Type braucht beim ersten Mal rund eine Sekunde.
[Console]::Out.WriteLine('BEREIT')
[Console]::Out.Flush()

while ($true) {
  $zeile = [Console]::In.ReadLine()
  if ($null -eq $zeile) { break }
  [Console]::Out.WriteLine([TsZeiger]::Unter())
  [Console]::Out.Flush()
}
