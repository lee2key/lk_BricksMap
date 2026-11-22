$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$project = (Get-Location).Path
$release = Join-Path $project 'release'
$work = Join-Path $release 'webview-build'
$version = '1.0.2903.40'
$sdk = Join-Path $work $version
New-Item -ItemType Directory -Force $work | Out-Null

$files = @(
    'lib/net462/Microsoft.Web.WebView2.Core.dll'
    'lib/net462/Microsoft.Web.WebView2.WinForms.dll'
    'runtimes/win-x64/native/WebView2Loader.dll'
    'LICENSE.txt'
)
$missing = $files | Where-Object { !(Test-Path -LiteralPath (Join-Path $sdk $_) -PathType Leaf) }
if ($missing) {
    $download = Join-Path $work 'sdk.zip'
    try {
        Invoke-WebRequest -UseBasicParsing "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$version/microsoft.web.webview2.$version.nupkg" -OutFile $download
        Expand-Archive -LiteralPath $download -DestinationPath $sdk -Force
    } finally {
        if (Test-Path -LiteralPath $download) { Remove-Item -LiteralPath $download }
    }
}

npm run build
if ($LASTEXITCODE) { exit $LASTEXITCODE }

$stage = Join-Path $work ([guid]::NewGuid().ToString())
try {
    $payload = Join-Path $stage 'payload'
    New-Item -ItemType Directory $payload -Force | Out-Null
    Copy-Item dist "$payload/site" -Recurse
    foreach ($file in $files | Where-Object { $_ -ne 'LICENSE.txt' }) {
        Copy-Item -LiteralPath (Join-Path $sdk $file) -Destination $payload
    }
    Copy-Item -LiteralPath (Join-Path $sdk 'LICENSE.txt') -Destination "$payload/WebView2-LICENSE.txt"
    Compress-Archive -Path "$payload/*" -DestinationPath "$stage/payload.zip"

    $appVersion = (Get-Content -LiteralPath package.json -Raw | ConvertFrom-Json).version
    $fileVersion = ([version]$appVersion).ToString(3) + '.0'
    $versionSource = Join-Path $stage 'Version.cs'
    @"
using System.Reflection;
[assembly: AssemblyTitle("lk Bricks Map")]
[assembly: AssemblyProduct("lk Bricks Map")]
[assembly: AssemblyVersion("$fileVersion")]
[assembly: AssemblyFileVersion("$fileVersion")]
"@ | Set-Content -LiteralPath $versionSource -Encoding UTF8

    $compiler = "$env:WINDIR/Microsoft.NET/Framework64/v4.0.30319/csc.exe"
    $options = @(
        '/nologo', '/target:winexe', '/platform:x64', '/optimize+'
        '/win32manifest:webview\app.manifest', '/win32icon:public\app-icon.ico'
        "/out:$release/lk Bricks Map.exe", "/resource:$stage/payload.zip,payload"
        '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll'
        '/r:System.IO.Compression.dll', '/r:System.IO.Compression.FileSystem.dll'
        "/r:$payload/Microsoft.Web.WebView2.Core.dll", "/r:$payload/Microsoft.Web.WebView2.WinForms.dll"
        '.\webview\Host.cs', $versionSource
    )
    & $compiler @options
    exit $LASTEXITCODE
} finally {
    if (Test-Path -LiteralPath $stage) {
        $resolvedWork = (Resolve-Path -LiteralPath $work).ProviderPath
        $resolvedStage = (Resolve-Path -LiteralPath $stage).ProviderPath
        if ((Split-Path -Parent $resolvedStage) -ne $resolvedWork) { throw "Invalid build directory: $resolvedStage" }
        Remove-Item -LiteralPath $resolvedStage -Recurse -Force
    }
}
