[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$AgeExecutable,
  [Parameter(Mandatory = $true)][string]$IdentityPath,
  [Parameter(Mandatory = $true)][string]$CiphertextPath,
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-fA-F]{64}$')]
  [string]$ExpectedSha256
)

$ErrorActionPreference = 'Stop'

foreach ($path in @($AgeExecutable, $IdentityPath, $CiphertextPath)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw 'A required verification file is missing.'
  }
}

$startInfo = [System.Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = (Resolve-Path -LiteralPath $AgeExecutable).Path
$startInfo.UseShellExecute = $false
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true
$startInfo.ArgumentList.Add('--decrypt')
$startInfo.ArgumentList.Add('--identity')
$startInfo.ArgumentList.Add((Resolve-Path -LiteralPath $IdentityPath).Path)
$startInfo.ArgumentList.Add((Resolve-Path -LiteralPath $CiphertextPath).Path)

$process = [System.Diagnostics.Process]::new()
$process.StartInfo = $startInfo
$sha = [System.Security.Cryptography.SHA256]::Create()

try {
  if (-not $process.Start()) {
    throw 'Could not start age.'
  }

  # Drain stderr concurrently so a full pipe cannot stall a large backup.
  $errorTask = $process.StandardError.ReadToEndAsync()
  $digest = $sha.ComputeHash($process.StandardOutput.BaseStream)
  $process.WaitForExit()
  $null = $errorTask.GetAwaiter().GetResult()

  if ($process.ExitCode -ne 0) {
    throw "age decryption failed with exit code $($process.ExitCode)."
  }

  $actual = [System.Convert]::ToHexString($digest).ToLowerInvariant()
  if ($actual -ne $ExpectedSha256.ToLowerInvariant()) {
    throw 'Decrypted SHA-256 does not match the manifest.'
  }

  [pscustomobject]@{
    Ciphertext = [System.IO.Path]::GetFileName($CiphertextPath)
    DecryptedSha256 = $actual
    Verified = $true
  }
}
finally {
  $sha.Dispose()
  $process.Dispose()
}
