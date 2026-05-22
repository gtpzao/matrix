import { dirname } from "path";
import { mkdirSync } from "fs";
import { spawnSync } from "child_process";

function ensureWindows() {
  if (process.platform !== "win32") {
    throw new Error("Clipboard image export v1 is implemented for Windows only.");
  }
}

function quoteForPowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runPowerShell(script) {
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-STA", "-Command", script],
    { encoding: "utf8" }
  );

  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "Unknown PowerShell failure").trim();
    throw new Error(detail);
  }

  return (result.stdout || "").trim();
}

export function clearClipboard() {
  ensureWindows();
  runPowerShell(`
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.Clipboard]::Clear()
  `);
}

export function saveClipboardImage(filePath, { timeoutMs = 8000, pollMs = 250 } = {}) {
  ensureWindows();
  mkdirSync(dirname(filePath), { recursive: true });

  const targetPath = quoteForPowerShell(filePath);
  runPowerShell(`
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $targetPath = ${targetPath}
    $deadline = [DateTime]::UtcNow.AddMilliseconds(${timeoutMs})
    while ([DateTime]::UtcNow -lt $deadline) {
      if ([System.Windows.Forms.Clipboard]::ContainsImage()) {
        $image = [System.Windows.Forms.Clipboard]::GetImage()
        if ($null -ne $image) {
          try {
            $image.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
            Write-Output "saved"
            exit 0
          } finally {
            $image.Dispose()
          }
        }
      }
      Start-Sleep -Milliseconds ${pollMs}
    }
    Write-Error "Timed out waiting for a TradingView image in the Windows clipboard."
    exit 9
  `);
}
