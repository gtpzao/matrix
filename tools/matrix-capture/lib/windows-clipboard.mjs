import { dirname } from "path";
import { mkdirSync } from "fs";
import { spawnSync } from "child_process";

//[Garante execucao no Windows, unico ambiente implementado para clipboard com Forms.]
function ensureWindows() {
  if (process.platform !== "win32") {
    throw new Error("Clipboard image export v1 is implemented for Windows only.");
  }
}

//[Escapa string como literal PowerShell para evitar quebra em paths com aspas.]
function quoteForPowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

//[Executa PowerShell em modo STA e transforma falhas em excecoes JavaScript.]
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

//[Limpa clipboard antes de disparar exportacao para nao reutilizar imagem antiga.]
export function clearClipboard() {
  ensureWindows();
  runPowerShell(`
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.Clipboard]::Clear()
  `);
}

//[Espera imagem aparecer no clipboard e salva PNG no path solicitado.]
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
