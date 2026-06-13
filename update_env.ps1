# Get current User environment variables
$oldPath = [Environment]::GetEnvironmentVariable('Path', 'User')

# Replace the old Android SDK paths with the new ones on A: drive
$newPath = $oldPath -replace 'C:\\Users\\rosha\\AppData\\Local\\Android\\Sdk\\platform-tools', 'A:\Android\Sdk\platform-tools'
$newPath = $newPath -replace 'C:\\Users\\rosha\\AppData\\Local\\Android\\Sdk\\emulator', 'A:\Android\Sdk\emulator'

# Apply the new variables permanently to the Windows User Registry
[Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
[Environment]::SetEnvironmentVariable('ANDROID_HOME', 'A:\Android\Sdk', 'User')

Write-Host "ANDROID_HOME has been set to: A:\Android\Sdk"
Write-Host "Path has been updated successfully!"
