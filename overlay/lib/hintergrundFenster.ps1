# Ein Fenster zum Desktop-Hintergrund machen - der Weg, den auch
# Wallpaper Engine geht.
#
# Windows zeichnet den Hintergrund in einem eigenen Fenster namens WorkerW.
# Es entsteht erst, wenn man Progman (dem Desktop-Fenster) die undokumentierte
# Nachricht 0x052C schickt; danach gibt es ein WorkerW, das HINTER den
# Symbolen liegt. Haengt man sein eigenes Fenster dort hinein, wird es zum
# Hintergrundbild - die Symbole bleiben davor sichtbar.
#
# Warum PowerShell und nicht ein natives Modul: Die App kommt ohne native
# Abhaengigkeiten aus (nichts zu kompilieren, nichts, das bei einem
# Electron-Update bricht). Denselben Weg nutzt die App schon fuer die
# Vollbild-Erkennung.
#
# Uebergabe ueber Umgebungsvariablen, nicht ueber Parameter:
#   TS_FENSTER  die Fensterkennung (HWND) als Zahl
#   TS_LOESEN   "1" haengt das Fenster wieder an den Desktop zurueck
#
# WARUM NICHT param(): In der installierten Fassung liegt diese Datei in
# einem Archiv (app.asar). PowerShell kann daraus nichts starten, also liest
# die App den Text selbst ein und uebergibt ihn direkt - und dabei gibt es
# keine Parameter, nur die Umgebung.
#
# Gibt eine Zeile aus: OK <WorkerW-HWND> | GELOEST | FEHLER <Grund>

$Fenster = [long]$env:TS_FENSTER
$Loesen = $env:TS_LOESEN -eq '1'

$ErrorActionPreference = 'Stop'
# Ohne das schiebt PowerShell beim ersten Aufruf einen Fortschrittsbericht
# auf die Fehlerausgabe - er landete sonst in der Antwort.
$ProgressPreference = 'SilentlyContinue'

Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public class Hintergrund {
  // Ausdruecklich mit NULL statt leerem Text suchen: Ein leerer Titel
  // bedeutet "Fenster OHNE Titel" - und Progman heisst "Program Manager".
  // Genau daran scheiterte der erste Versuch.
  [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

  [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr childAfter, string className, string windowName);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern IntPtr SetParent(IntPtr child, IntPtr newParent);

  // GA_PARENT (1) liefert das ECHTE Elternfenster. GetParent waere falsch:
  // Bei einem Fenster ohne WS_CHILD gibt es den Besitzer zurueck, und das
  // ist nach dem Umhaengen weiterhin niemand.
  [DllImport("user32.dll")]
  public static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  public static IntPtr Arbeiter = IntPtr.Zero;

  // Gesucht ist das WorkerW, das KEIN SHELLDLL_DefView enthaelt: Das mit der
  // DefView traegt die Symbole, sein Geschwisterfenster liegt dahinter.
  public static IntPtr FindeWorkerW() {
    Arbeiter = IntPtr.Zero;
    EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
      IntPtr defView = FindWindowEx(hWnd, IntPtr.Zero, "SHELLDLL_DefView", null);
      // Das WorkerW DAHINTER traegt den Hintergrund; das mit der DefView
      // traegt die Symbole.
      if (defView != IntPtr.Zero) {
        IntPtr dahinter = FindWindowEx(IntPtr.Zero, hWnd, "WorkerW", null);
        if (dahinter != IntPtr.Zero) Arbeiter = dahinter;
      }
      return true;
    }, IntPtr.Zero);
    return Arbeiter;
  }
}
'@

try {
  $hwnd = [IntPtr]::new($Fenster)

  if ($Fenster -eq 0) {
    Write-Output 'FEHLER keine-kennung'
    exit 1
  }

  if ($Loesen) {
    # Zurueck an den Desktop: wieder ein gewoehnliches Fenster.
    [void][Hintergrund]::SetParent($hwnd, [IntPtr]::Zero)
    Write-Output 'GELOEST'
    exit 0
  }

  # [NullString]::Value, nicht $null: PowerShell macht aus $null einen
  # leeren Text, und der bedeutet "Fenster ohne Titel".
  $progman = [Hintergrund]::FindWindow('Progman', [NullString]::Value)
  if ($progman -eq [IntPtr]::Zero) {
    Write-Output 'FEHLER kein-progman'
    exit 1
  }

  # Die undokumentierte Nachricht, die Windows dazu bringt, das
  # Hintergrund-WorkerW anzulegen. Mit Zeitgrenze, damit ein haengender
  # Explorer die App nicht mitnimmt.
  $ergebnis = [IntPtr]::Zero
  [void][Hintergrund]::SendMessageTimeout($progman, 0x052C, [IntPtr]::Zero, [IntPtr]::Zero, 0, 1000, [ref]$ergebnis)

  $workerW = [Hintergrund]::FindeWorkerW()
  if ($workerW -eq [IntPtr]::Zero) {
    # Auf manchen Rechnern haengt der Hintergrund direkt unter Progman -
    # etwa wenn Wallpaper Engine oder ein anderes Programm dort schon
    # eingegriffen hat.
    $workerW = $progman
  }

  [void][Hintergrund]::SetParent($hwnd, $workerW)

  # Nicht am Rueckgabewert von SetParent messen: Der ist der VORHERIGE
  # Elternteil und bei einem Fenster ohne Eltern regulaer 0 - ein Erfolg
  # saehe damit aus wie ein Fehlschlag. Stattdessen nachsehen, wo das
  # Fenster jetzt wirklich haengt.
  $jetzt = [Hintergrund]::GetAncestor($hwnd, 1)
  if ($jetzt -ne $workerW) {
    Write-Output 'FEHLER nicht-umgehaengt'
    exit 1
  }

  Write-Output ('OK ' + $workerW.ToInt64())
} catch {
  Write-Output ('FEHLER ' + $_.Exception.Message.Replace("`n", ' '))
  exit 1
}
