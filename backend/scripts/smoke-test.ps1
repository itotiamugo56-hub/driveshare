#Requires -Version 5.1
<#
.SYNOPSIS
  Exhaustive end-to-end smoke test for the DriveShare backend (all 13 domains).

.DESCRIPTION
  Walks every domain from the architecture spec plus the Admin & Operations
  layer: registers real accounts, drives real request/response chains (an
  identity verification actually gets approved before it's used to unlock a
  vehicle; a dispute actually needs pre/post condition baselines before an
  auto-resolution is asserted), and checks both the happy path AND the
  documented failure paths (wrong role, wrong owner, missing capability,
  duplicate submission, business-rule violations).

  Nothing fails silently:
    - Every assertion prints PASS/FAIL/SKIP immediately.
    - Every failure is captured with the actual response body, not just a
      boolean, so a failure is diagnosable from the log alone.
    - The script does NOT stop on the first failure by default (so one broken
      endpoint doesn't hide problems everywhere else) -- pass -StopOnFirstFailure
      if you want fail-fast behavior instead.
    - The process exit code is non-zero if ANY assertion failed, so this is
      safe to wire into CI ($LASTEXITCODE / $?).

.PREREQUISITES
  1. The backend must be running:      npm run start:dev
  2. The database must be migrated:    npm run prisma:migrate
  3. The database must be seeded:      npm run seed
     (Seeding creates admin@driveshare.dev with ALL managerial capabilities.
      Without it, every Admin & Operations assertion is explicitly SKIPPED
      -- not silently ignored -- with a message telling you to seed.)

.PARAMETER BaseUrl
  API base URL including the global prefix. Default: http://localhost:3000/api/v1

.PARAMETER AdminEmail / AdminPassword
  Credentials for the seeded admin account.

.PARAMETER StopOnFirstFailure
  If set, the script throws (and exits non-zero) on the very first failed
  assertion instead of continuing through the rest of the suite.

.EXAMPLE
  pwsh ./scripts/smoke-test.ps1
  pwsh ./scripts/smoke-test.ps1 -BaseUrl "http://localhost:3000/api/v1" -StopOnFirstFailure
#>

[CmdletBinding()]
param(
    [string]$BaseUrl = "http://localhost:3000/api/v1",
    [string]$AdminEmail = "admin@driveshare.dev",
    [string]$AdminPassword = "Password123!",
    [switch]$StopOnFirstFailure
)

$ErrorActionPreference = 'Stop'
$Script:PassCount = 0
$Script:FailCount = 0
$Script:SkipCount = 0
$Script:Failures  = New-Object System.Collections.Generic.List[string]
$Script:Skipped   = New-Object System.Collections.Generic.List[string]

# ============================================================================
# Core helpers -- every HTTP call and every assertion in this script funnels
# through these, so behavior (logging, counting, non-silent failure) is
# consistent everywhere instead of being reimplemented per test.
# ============================================================================

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host ("=" * 78) -ForegroundColor Cyan
    Write-Host $Title -ForegroundColor Cyan
    Write-Host ("=" * 78) -ForegroundColor Cyan
}

function Write-SubSection {
    param([string]$Title)
    Write-Host ""
    Write-Host "--- $Title ---" -ForegroundColor DarkCyan
}

# Portable wrapper (works on Windows PowerShell 5.1 and PowerShell 7+) that
# NEVER throws on a non-2xx response -- it captures the status code and body
# so we can assert on expected *failures* just as rigorously as successes.
function Invoke-Api {
    param(
        [Parameter(Mandatory)] [ValidateSet('GET', 'POST', 'PUT', 'DELETE')] [string]$Method,
        [Parameter(Mandatory)] [string]$Path,
        $Body = $null,
        [string]$Token = $null
    )
    $uri = "$BaseUrl$Path"
    $headers = @{}
    if ($Token) { $headers['Authorization'] = "Bearer $Token" }

    $invokeArgs = @{
        Method      = $Method
        Uri         = $uri
        Headers     = $headers
        ErrorAction = 'Stop'
    }
    if ($null -ne $Body) {
        $invokeArgs['Body'] = ($Body | ConvertTo-Json -Depth 15)
        $invokeArgs['ContentType'] = 'application/json'
    }

    try {
        $resp = Invoke-WebRequest @invokeArgs -UseBasicParsing
        $parsed = $null
        if ($resp.Content) {
            try { $parsed = $resp.Content | ConvertFrom-Json -Depth 20 } catch { $parsed = $resp.Content }
        }
        return [PSCustomObject]@{
            StatusCode = [int]$resp.StatusCode
            Body       = $parsed
            RawError   = $null
        }
    } catch {
        $status = $null
        if ($_.Exception.Response) {
            try { $status = [int]$_.Exception.Response.StatusCode } catch { $status = $null }
        }
        $errBody = $_.ErrorDetails.Message
        $parsedErr = $errBody
        if ($errBody) { try { $parsedErr = $errBody | ConvertFrom-Json -Depth 20 } catch { $parsedErr = $errBody } }

        if ($null -eq $status) {
            # No HTTP response at all -- connection refused / DNS failure / server down.
            # This is fatal to the whole run, not a single assertion, so we surface it loudly.
            Write-Host ""
            Write-Host "FATAL: Could not reach $uri -- $($_.Exception.Message)" -ForegroundColor Red
            Write-Host "Is the server running? (npm run start:dev)" -ForegroundColor Red
            throw
        }
        return [PSCustomObject]@{
            StatusCode = $status
            Body       = $parsedErr
            RawError   = $_.Exception.Message
        }
    }
}

function Get-DottedField {
    param($Object, [string]$Path)
    $val = $Object
    foreach ($seg in $Path.Split('.')) {
        if ($null -eq $val) { return $null }
        $val = $val.$seg
    }
    return $val
}

function Format-Compact {
    param($Object)
    try { return ($Object | ConvertTo-Json -Depth 6 -Compress) } catch { return "$Object" }
}

function Assert {
    param(
        [Parameter(Mandatory)] [bool]$Condition,
        [Parameter(Mandatory)] [string]$Description,
        [string]$Details = ''
    )
    if ($Condition) {
        $Script:PassCount++
        Write-Host "  [PASS] $Description" -ForegroundColor Green
    } else {
        $Script:FailCount++
        $line = "[FAIL] $Description"
        if ($Details) { $line += "  DETAILS: $Details" }
        Write-Host "  $line" -ForegroundColor Red
        $Script:Failures.Add($line)
        if ($StopOnFirstFailure) {
            Write-Host ""
            Write-Host "Stopping on first failure (per -StopOnFirstFailure)." -ForegroundColor Red
            Write-FinalSummary
            exit 1
        }
    }
}

function Assert-Status {
    param($Response, [int[]]$Expected, [string]$Context)
    $ok = $Expected -contains $Response.StatusCode
    $detail = "expected status in [$($Expected -join ',')], got [$($Response.StatusCode)]; body=$(Format-Compact $Response.Body)"
    Assert -Condition $ok -Description "$Context : status code" -Details $detail
    return $ok
}

function Assert-Field {
    param($Object, [string]$FieldPath, $Expected, [string]$Context)
    $actual = Get-DottedField -Object $Object -Path $FieldPath
    $ok = ($actual -eq $Expected)
    Assert -Condition $ok -Description "$Context : field '$FieldPath' equals '$Expected'" -Details "actual='$actual'; full=$(Format-Compact $Object)"
}

function Assert-FieldNotNull {
    param($Object, [string]$FieldPath, [string]$Context)
    $actual = Get-DottedField -Object $Object -Path $FieldPath
    # Cast to string before comparing to '' -- PowerShell's -eq/-ne coerce the
    # RIGHT-hand operand to the type of the LEFT-hand operand, so when $actual
    # is a boolean or a number, '' silently converts to $false / 0 for the
    # comparison (this is the well-known "0 -eq ''" gotcha). That previously
    # made legitimate falsy values like 0 or $false register as "null".
    Assert -Condition ($null -ne $actual -and ([string]$actual) -ne '') -Description "$Context : field '$FieldPath' is present/non-null" -Details "actual='$actual'; full=$(Format-Compact $Object)"
}

function Assert-FieldNull {
    param($Object, [string]$FieldPath, [string]$Context)
    $actual = Get-DottedField -Object $Object -Path $FieldPath
    # Same string-cast fix as Assert-FieldNotNull, applied in reverse.
    Assert -Condition ($null -eq $actual -or ([string]$actual) -eq '') -Description "$Context : field '$FieldPath' is null/absent" -Details "actual='$actual'; full=$(Format-Compact $Object)"
}

function Assert-IsArray {
    param($Object, [string]$Context, [int]$MinLength = 0)
    # NOTE: Windows PowerShell 5.1's ConvertFrom-Json collapses a JSON array with
    # exactly one element into a bare PSCustomObject (not wrapped in an array) --
    # PowerShell 7+ does not have this quirk. Wrapping with @() before counting
    # normalizes both cases correctly, so we deliberately do NOT assert a strict
    # .NET IEnumerable type check here (that would spuriously fail on PS 5.1 for
    # any endpoint that happens to return exactly one item). The array-*shape*
    # is verified functionally instead: does it behave correctly as a countable
    # collection, and does it meet the minimum length we expect.
    $count = @($Object).Count
    Assert -Condition ($count -ge $MinLength) -Description "$Context : returns a collection with length >= $MinLength (actual $count)" -Details "value=$(Format-Compact $Object)"
}

function Assert-NumberGreaterThan {
    param($Object, [string]$FieldPath, [double]$Threshold, [string]$Context)
    $actual = Get-DottedField -Object $Object -Path $FieldPath
    $ok = ($null -ne $actual) -and ([double]$actual -gt $Threshold)
    Assert -Condition $ok -Description "$Context : field '$FieldPath' > $Threshold" -Details "actual='$actual'"
}

function Skip-Test {
    param([string]$Description, [string]$Reason)
    $Script:SkipCount++
    Write-Host "  [SKIP] $Description -- $Reason" -ForegroundColor Yellow
    $Script:Skipped.Add("$Description -- $Reason")
}

function New-TestEmail {
    param([string]$Prefix)
    return "$Prefix.$([guid]::NewGuid().ToString('N').Substring(0,10))@smoketest.dev"
}

function ConvertTo-Base64 {
    param([string]$PlainText)
    return [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($PlainText))
}

function ConvertFrom-Base64 {
    param([string]$B64)
    return [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($B64))
}

function Write-FinalSummary {
    Write-Section "SMOKE TEST SUMMARY"
    Write-Host "PASS : $Script:PassCount" -ForegroundColor Green
    Write-Host "FAIL : $Script:FailCount" -ForegroundColor $(if ($Script:FailCount -gt 0) { 'Red' } else { 'Green' })
    Write-Host "SKIP : $Script:SkipCount" -ForegroundColor Yellow
    if ($Script:Failures.Count -gt 0) {
        Write-Host ""
        Write-Host "FAILURES:" -ForegroundColor Red
        foreach ($f in $Script:Failures) { Write-Host "  - $f" -ForegroundColor Red }
    }
    if ($Script:Skipped.Count -gt 0) {
        Write-Host ""
        Write-Host "SKIPPED:" -ForegroundColor Yellow
        foreach ($s in $Script:Skipped) { Write-Host "  - $s" -ForegroundColor Yellow }
    }
}

# ============================================================================
# 0. PREFLIGHT -- fail loudly and immediately if the server isn't reachable.
# ============================================================================
Write-Section "0. PREFLIGHT"
try {
    $probe = Invoke-Api -Method GET -Path "/listings/search"
    Assert -Condition ($probe.StatusCode -eq 401 -or $probe.StatusCode -eq 200) -Description "Server reachable at $BaseUrl" -Details "status=$($probe.StatusCode)"
} catch {
    Write-Host "FATAL: server not reachable. Aborting entire smoke test." -ForegroundColor Red
    exit 1
}

# ============================================================================
# 1. AUTH
# ============================================================================
Write-Section "1. AUTH"

$ownerEmail = New-TestEmail "owner"
$renterEmail = New-TestEmail "renter"
$deleteMeEmail = New-TestEmail "deleteme"
$password = "TestPass123!"

$regOwner = Invoke-Api -Method POST -Path "/auth/register" -Body @{ email = $ownerEmail; password = $password }
Assert-Status -Response $regOwner -Expected @(200,201) -Context "Register owner"
Assert-FieldNotNull -Object $regOwner.Body -FieldPath "accessToken" -Context "Register owner"
Assert-Field -Object $regOwner.Body -FieldPath "role" -Expected "user" -Context "Register owner"
$ownerToken = $regOwner.Body.accessToken
$ownerId = $regOwner.Body.userId

$regRenter = Invoke-Api -Method POST -Path "/auth/register" -Body @{ email = $renterEmail; password = $password }
Assert-Status -Response $regRenter -Expected @(200,201) -Context "Register renter"
$renterToken = $regRenter.Body.accessToken
$renterId = $regRenter.Body.userId

$regDeleteMe = Invoke-Api -Method POST -Path "/auth/register" -Body @{ email = $deleteMeEmail; password = $password }
$deleteMeToken = $regDeleteMe.Body.accessToken
$deleteMeId = $regDeleteMe.Body.userId

$dupReg = Invoke-Api -Method POST -Path "/auth/register" -Body @{ email = $ownerEmail; password = $password }
Assert -Condition ($dupReg.StatusCode -ge 400) -Description "Duplicate email registration is rejected" -Details "status=$($dupReg.StatusCode)"

$loginOwner = Invoke-Api -Method POST -Path "/auth/login" -Body @{ email = $ownerEmail; password = $password }
Assert-Status -Response $loginOwner -Expected @(200,201) -Context "Login owner"
Assert-FieldNotNull -Object $loginOwner.Body -FieldPath "accessToken" -Context "Login owner"

$badLogin = Invoke-Api -Method POST -Path "/auth/login" -Body @{ email = $ownerEmail; password = "wrong-password" }
Assert -Condition ($badLogin.StatusCode -eq 401) -Description "Login with wrong password returns 401" -Details "status=$($badLogin.StatusCode)"

$loginAdmin = Invoke-Api -Method POST -Path "/auth/login" -Body @{ email = $AdminEmail; password = $AdminPassword }
$AdminAvailable = ($loginAdmin.StatusCode -in 200,201) -and $loginAdmin.Body.accessToken
if ($AdminAvailable) {
    $adminToken = $loginAdmin.Body.accessToken
    $adminId = $loginAdmin.Body.userId
    Assert -Condition $true -Description "Login seeded admin ($AdminEmail)"
} else {
    Assert -Condition $false -Description "Login seeded admin ($AdminEmail)" -Details "status=$($loginAdmin.StatusCode); body=$(Format-Compact $loginAdmin.Body). Did you run 'npm run seed'?"
}

# No public endpoint should ever let a caller mint a privileged role for themselves.
$noAuthAdminOps = Invoke-Api -Method GET -Path "/admin/staff/accounts" -Token $ownerToken
Assert -Condition ($noAuthAdminOps.StatusCode -eq 403) -Description "Ordinary user cannot access /admin/staff (role gate)" -Details "status=$($noAuthAdminOps.StatusCode)"

$noTokenAtAll = Invoke-Api -Method GET -Path "/trust/users/$ownerId/score"
Assert -Condition ($noTokenAtAll.StatusCode -eq 401) -Description "Unauthenticated request is rejected globally (JwtAuthGuard)" -Details "status=$($noTokenAtAll.StatusCode)"

# ============================================================================
# 2. IDENTITY & VERIFICATION
# ============================================================================
Write-Section "2. IDENTITY & VERIFICATION"

$initVerif = Invoke-Api -Method POST -Path "/identity/verifications" -Body @{ documentType = "drivers_license" } -Token $ownerToken
Assert-Status -Response $initVerif -Expected @(200,201) -Context "Initiate verification"
Assert-Field -Object $initVerif.Body -FieldPath "status" -Expected "pending" -Context "Initiate verification"
$verificationId = $initVerif.Body.id

$uploadDoc = Invoke-Api -Method POST -Path "/identity/verifications/$verificationId/documents" -Body @{ documentBase64 = (ConvertTo-Base64 "fake-id-image") } -Token $ownerToken
Assert-Status -Response $uploadDoc -Expected @(200,201) -Context "Upload ID document"
Assert-Field -Object $uploadDoc.Body -FieldPath "status" -Expected "doc_uploaded" -Context "Upload ID document"
Assert-FieldNotNull -Object $uploadDoc.Body -FieldPath "vendorRef" -Context "Upload ID document (mocked vendor ref)"

$liveness = Invoke-Api -Method POST -Path "/identity/verifications/$verificationId/liveness" -Body @{ livenessMediaBase64 = (ConvertTo-Base64 "fake-selfie") } -Token $ownerToken
Assert-Status -Response $liveness -Expected @(200,201) -Context "Submit liveness"
Assert-Field -Object $liveness.Body -FieldPath "status" -Expected "approved" -Context "Submit liveness (mock scores above threshold)"

$getVerif = Invoke-Api -Method GET -Path "/identity/verifications/$verificationId" -Token $ownerToken
Assert-Field -Object $getVerif.Body -FieldPath "status" -Expected "approved" -Context "Get verification after approval"

$submitLicense = Invoke-Api -Method POST -Path "/identity/licenses" -Body @{
    licenseNumber = "DL-$([guid]::NewGuid().ToString('N').Substring(0,8))"
    issuingRegion = "CA"
    licenseClass  = "C"
    expirationDate = (Get-Date).AddYears(3).ToString("yyyy-MM-dd")
} -Token $ownerToken
Assert-Status -Response $submitLicense -Expected @(200,201) -Context "Submit license"
Assert-Field -Object $submitLicense.Body -FieldPath "dmvValidationStatus" -Expected "valid" -Context "Submit license (mocked DMV)"
$licenseId = $submitLicense.Body.id

$licenseStatus = Invoke-Api -Method GET -Path "/identity/licenses/$licenseId/status" -Token $ownerToken
Assert-Field -Object $licenseStatus.Body -FieldPath "dmvValidationStatus" -Expected "valid" -Context "Get license status"

$noConsentHistory = Invoke-Api -Method POST -Path "/identity/driving-history" -Body @{ consentGiven = $false } -Token $ownerToken
Assert -Condition ($noConsentHistory.StatusCode -eq 400) -Description "Driving history request WITHOUT consent is rejected" -Details "status=$($noConsentHistory.StatusCode)"

$drivingHistory = Invoke-Api -Method POST -Path "/identity/driving-history" -Body @{ consentGiven = $true } -Token $ownerToken
Assert-Status -Response $drivingHistory -Expected @(200,201) -Context "Driving history request WITH consent"
Assert-Field -Object $drivingHistory.Body -FieldPath "riskTier" -Expected "low" -Context "Driving history result (mocked)"
Assert-FieldNotNull -Object $drivingHistory.Body -FieldPath "completedAt" -Context "Driving history completed synchronously"
$drivingHistoryId = $drivingHistory.Body.id

$getDrivingHistory = Invoke-Api -Method GET -Path "/identity/driving-history/$drivingHistoryId" -Token $ownerToken
Assert-Field -Object $getDrivingHistory.Body -FieldPath "riskTier" -Expected "low" -Context "Get driving history report"

$reverifyAsUser = Invoke-Api -Method POST -Path "/identity/reverifications/schedule" -Body @{ userId = $ownerId } -Token $ownerToken
Assert -Condition ($reverifyAsUser.StatusCode -eq 403) -Description "Ordinary user CANNOT trigger reverification scheduling (service/admin only)" -Details "status=$($reverifyAsUser.StatusCode)"

$identityStatus = Invoke-Api -Method GET -Path "/identity/users/$ownerId/status" -Token $ownerToken
Assert-Field -Object $identityStatus.Body -FieldPath "identityVerified" -Expected $true -Context "Consolidated identity status"
Assert-Field -Object $identityStatus.Body -FieldPath "licenseStatus" -Expected "valid" -Context "Consolidated identity status"

$webhookAsUser = Invoke-Api -Method POST -Path "/identity/webhooks/vendor-callback" -Body @{ verificationId = $verificationId; status = "approved" } -Token $ownerToken
Assert -Condition ($webhookAsUser.StatusCode -eq 403) -Description "Ordinary user CANNOT call vendor webhook endpoint (service only)" -Details "status=$($webhookAsUser.StatusCode)"

# ============================================================================
# 3. TRUST SCORE (part 1 -- listing-independent checks; threshold/eligibility
#    is revisited in section 5 once a real listing exists)
# ============================================================================
Write-Section "3. TRUST SCORE"

$score = Invoke-Api -Method GET -Path "/trust/users/$ownerId/score" -Token $ownerToken
Assert-Status -Response $score -Expected @(200) -Context "Get trust score"
Assert-FieldNotNull -Object $score.Body -FieldPath "tier" -Context "Get trust score"

$recalcAsUser = Invoke-Api -Method POST -Path "/trust/users/$ownerId/recalculate" -Token $ownerToken
Assert -Condition ($recalcAsUser.StatusCode -eq 403) -Description "Ordinary user CANNOT force a trust recalculation (service/admin only)" -Details "status=$($recalcAsUser.StatusCode)"

$importHistory = Invoke-Api -Method POST -Path "/trust/imports/external-history" -Body @{ sourcePlatform = "rideshare_driver"; verificationMethod = "oauth_pull" } -Token $ownerToken
Assert-Status -Response $importHistory -Expected @(200,201) -Context "Import external history"
Assert-Field -Object $importHistory.Body -FieldPath "status" -Expected "verified" -Context "Import external history"
$importId = $importHistory.Body.id

$importStatus = Invoke-Api -Method GET -Path "/trust/imports/$importId/status" -Token $ownerToken
Assert-Field -Object $importStatus.Body -FieldPath "status" -Expected "verified" -Context "Get import status"

# ============================================================================
# 4. VEHICLE & LISTING
# ============================================================================
Write-Section "4. VEHICLE & LISTING"

$vinDecode = Invoke-Api -Method POST -Path "/vehicles/vin-decode" -Body @{ vin = "1HGCM82633A004352" } -Token $ownerToken
Assert-Field -Object $vinDecode.Body -FieldPath "MOCKED" -Expected $true -Context "VIN decode is clearly marked mocked"
Assert-FieldNotNull -Object $vinDecode.Body -FieldPath "make" -Context "VIN decode returns make"

$vin = "TESTVIN$([guid]::NewGuid().ToString('N').Substring(0,10))"
$regVehicle = Invoke-Api -Method POST -Path "/vehicles" -Body @{ vin = $vin; licensePlate = "SMOKE1" } -Token $ownerToken
Assert-Status -Response $regVehicle -Expected @(200,201) -Context "Register vehicle"
Assert-Field -Object $regVehicle.Body -FieldPath "status" -Expected "inactive" -Context "New vehicle starts inactive"
$vehicleId = $regVehicle.Body.id

$getVehicle = Invoke-Api -Method GET -Path "/vehicles/$vehicleId" -Token $ownerToken
Assert-Field -Object $getVehicle.Body -FieldPath "vin" -Expected $vin -Context "Get vehicle"

$updateVehicleAsRenter = Invoke-Api -Method PUT -Path "/vehicles/$vehicleId" -Body @{ trim = "Hijacked" } -Token $renterToken
Assert -Condition ($updateVehicleAsRenter.StatusCode -eq 403) -Description "Non-owner CANNOT update someone else's vehicle" -Details "status=$($updateVehicleAsRenter.StatusCode)"

$updateVehicle = Invoke-Api -Method PUT -Path "/vehicles/$vehicleId" -Body @{ trim = "LE" } -Token $ownerToken
Assert-Field -Object $updateVehicle.Body -FieldPath "trim" -Expected "LE" -Context "Owner updates own vehicle"

$ownershipDoc = Invoke-Api -Method POST -Path "/vehicles/$vehicleId/ownership-documents" -Body @{ documentBase64 = (ConvertTo-Base64 "fake-registration-doc") } -Token $ownerToken
Assert-Field -Object $ownershipDoc.Body -FieldPath "ownershipVerificationStatus" -Expected "pending" -Context "Upload ownership document"

# Audit finding (frontend architecture follow-up): addVehiclePhoto/removeVehiclePhoto/
# reorderVehiclePhotos and GET .../public-summary were never exercised anywhere in
# this script, even though they existed on the backend. Covered now, mirroring the
# coverage already added to the frontend TS port (04-vehicleListing.ts).
$addPhotoAsRenter = Invoke-Api -Method POST -Path "/vehicles/$vehicleId/photos" -Body @{ photoBase64 = (ConvertTo-Base64 "fake-jpeg-bytes-1"); mimeType = "image/jpeg" } -Token $renterToken
Assert -Condition ($addPhotoAsRenter.StatusCode -eq 403) -Description "Non-owner CANNOT add a photo to someone else's vehicle" -Details "status=$($addPhotoAsRenter.StatusCode)"

$addPhoto1 = Invoke-Api -Method POST -Path "/vehicles/$vehicleId/photos" -Body @{ photoBase64 = (ConvertTo-Base64 "fake-jpeg-bytes-1"); mimeType = "image/jpeg" } -Token $ownerToken
Assert-Status -Response $addPhoto1 -Expected @(200,201) -Context "Owner adds first vehicle photo"
Assert-Field -Object $addPhoto1.Body -FieldPath "position" -Expected 0 -Context "First photo gets position 0"

$addPhoto2 = Invoke-Api -Method POST -Path "/vehicles/$vehicleId/photos" -Body @{ photoBase64 = (ConvertTo-Base64 "fake-jpeg-bytes-2"); mimeType = "image/jpeg" } -Token $ownerToken
Assert-Field -Object $addPhoto2.Body -FieldPath "position" -Expected 1 -Context "Second photo gets position 1"
$photo1Id = $addPhoto1.Body.id
$photo2Id = $addPhoto2.Body.id

$reorderPhotos = Invoke-Api -Method PUT -Path "/vehicles/$vehicleId/photos/order" -Body @{ photoIds = @($photo2Id, $photo1Id) } -Token $ownerToken
$reorderedPhotos = @($reorderPhotos.Body.photos)
Assert -Condition ($reorderedPhotos[0].id -eq $photo2Id) -Description "Reordered photo list starts with photo2" -Details "actual=$($reorderedPhotos[0].id)"
Assert -Condition ($reorderedPhotos[1].id -eq $photo1Id) -Description "Reordered photo list ends with photo1" -Details "actual=$($reorderedPhotos[1].id)"

$removePhotoAsRenter = Invoke-Api -Method DELETE -Path "/vehicles/$vehicleId/photos/$photo1Id" -Token $renterToken
Assert -Condition ($removePhotoAsRenter.StatusCode -eq 403) -Description "Non-owner CANNOT remove a photo from someone else's vehicle" -Details "status=$($removePhotoAsRenter.StatusCode)"

$removePhoto = Invoke-Api -Method DELETE -Path "/vehicles/$vehicleId/photos/$photo1Id" -Token $ownerToken
Assert-Field -Object $removePhoto.Body -FieldPath "deleted" -Expected $true -Context "Owner removes a vehicle photo"

# Added per explicit product decision (frontend architecture follow-up, public-browsing
# resolution): GET /vehicles/:vehicleId/public-summary is @Public() and must (a) work
# with no token at all, (b) return only photo2 (photo1 was just removed), and
# (c) NOT include any of the sensitive fields that only GET /vehicles/:id exposes.
$publicSummary = Invoke-Api -Method GET -Path "/vehicles/$vehicleId/public-summary"
Assert-Status -Response $publicSummary -Expected @(200) -Context "Anonymous caller (no token) can read vehicle public-summary"
$publicPhotos = @($publicSummary.Body.photos)
Assert-IsArray -Object $publicPhotos -Context "Public summary photos" -MinLength 1
Assert -Condition ($publicPhotos[0].id -eq $photo2Id) -Description "Public summary only shows the remaining photo" -Details "actual=$($publicPhotos[0].id)"
Assert -Condition ($null -eq $publicSummary.Body.vin) -Description "Public summary does NOT expose vin" -Details ($publicSummary.Body | ConvertTo-Json -Compress)
Assert -Condition ($null -eq $publicSummary.Body.ownerId) -Description "Public summary does NOT expose ownerId" -Details ($publicSummary.Body | ConvertTo-Json -Compress)
Assert -Condition ($null -eq $publicSummary.Body.ownershipDocTokenRef) -Description "Public summary does NOT expose ownershipDocTokenRef" -Details ($publicSummary.Body | ConvertTo-Json -Compress)

$tripId = [guid]::NewGuid().ToString()   # NOTE (INFERRED): no dedicated Trip Orchestration entity exists in the
                                          # 12+1 domain spec (flagged explicitly in the architecture doc's
                                          # "Cross-Service Contracts" section). This GUID is used consistently
                                          # across services below exactly the way a real trip ID would be,
                                          # simulating what an orchestrator would generate.

$baseline = Invoke-Api -Method POST -Path "/vehicles/$vehicleId/condition-baseline" -Body @{
    type = "listing_baseline"; mediaAssetRefs = @("photo1.jpg","photo2.jpg"); odometerReading = 15000; fuelOrChargeLevel = 0.75
} -Token $ownerToken
Assert-Status -Response $baseline -Expected @(200,201) -Context "Submit condition baseline"
Assert-Field -Object $baseline.Body -FieldPath "odometerReading" -Expected 15000 -Context "Condition baseline odometer"
$baselineId = $baseline.Body.id

$latestBaseline = Invoke-Api -Method GET -Path "/vehicles/$vehicleId/condition-baseline/latest" -Token $ownerToken
Assert-Field -Object $latestBaseline.Body -FieldPath "id" -Expected $baselineId -Context "Get latest condition baseline"

$createListing = Invoke-Api -Method POST -Path "/listings" -Body @{ vehicleId = $vehicleId; basePriceCents = 8000 } -Token $ownerToken
Assert-Status -Response $createListing -Expected @(200,201) -Context "Create listing"
Assert-Field -Object $createListing.Body -FieldPath "status" -Expected "draft" -Context "New listing starts as draft"
$listingId = $createListing.Body.id

$getListing = Invoke-Api -Method GET -Path "/listings/$listingId"
Assert-Field -Object $getListing.Body -FieldPath "vehicleId" -Expected $vehicleId -Context "Get listing (public, no auth required beyond global guard -- expect 401 without token)"

$updateListingAsRenter = Invoke-Api -Method PUT -Path "/listings/$listingId" -Body @{ status = "active" } -Token $renterToken
Assert -Condition ($updateListingAsRenter.StatusCode -eq 403) -Description "Non-owner CANNOT activate someone else's listing" -Details "status=$($updateListingAsRenter.StatusCode)"

$activateListing = Invoke-Api -Method PUT -Path "/listings/$listingId" -Body @{ status = "active"; instantBookEnabled = $true } -Token $ownerToken
Assert-Field -Object $activateListing.Body -FieldPath "status" -Expected "active" -Context "Owner activates own listing"

$searchListings = Invoke-Api -Method GET -Path "/listings/search?minPrice=0" -Token $ownerToken
Assert-Field -Object $searchListings.Body -FieldPath "meta.sort" -Expected "recommended" -Context "Default search sort is 'recommended'"
Assert-IsArray -Object $searchListings.Body.results -Context "Search listings results" -MinLength 1

# Audit finding (frontend architecture follow-up): this assertion previously read
# `Assert-IsArray -Object $searchListings.Body ...`, assuming a bare array. The
# backend returns `{ meta: { sort, sortLabel }, results: [...] }`, so this
# assertion did not match the live response shape. Fixed above, and search param
# coverage expanded below to match what the frontend wrapper now forwards.
$searchByPrice = Invoke-Api -Method GET -Path "/listings/search?minPrice=0&sort=price" -Token $ownerToken
Assert-Field -Object $searchByPrice.Body -FieldPath "meta.sort" -Expected "price" -Context "Search accepts sort=price"

$searchByDelivery = Invoke-Api -Method GET -Path "/listings/search?deliveryOnly=true" -Token $ownerToken
Assert-IsArray -Object $searchByDelivery.Body.results -Context "Search accepts deliveryOnly (correct DTO field name)" -MinLength 0

$searchStartDate = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")
$searchEndDate = (Get-Date).AddDays(7).ToString("yyyy-MM-dd")
$searchByDateRange = Invoke-Api -Method GET -Path "/listings/search?startDate=$searchStartDate&endDate=$searchEndDate" -Token $ownerToken
Assert-IsArray -Object $searchByDateRange.Body.results -Context "Search accepts startDate/endDate" -MinLength 0

$calendarEmpty = Invoke-Api -Method GET -Path "/listings/$listingId/calendar" -Token $ownerToken
Assert-IsArray -Object $calendarEmpty.Body -Context "Empty calendar before any entries" -MinLength 0

# Added per explicit product decision (frontend architecture follow-up, public-browsing
# resolution): getCalendar was made @Public() -- payload is only { date, status }, so
# opening it directly does not risk exposing anything sensitive.
$calendarAnonymous = Invoke-Api -Method GET -Path "/listings/$listingId/calendar"
Assert-Status -Response $calendarAnonymous -Expected @(200) -Context "Anonymous caller (no token) can read listing calendar"

$tomorrow = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")
$updateCalendar = Invoke-Api -Method PUT -Path "/listings/$listingId/calendar" -Body @{ entries = @(@{ date = $tomorrow; status = "available" }) } -Token $ownerToken
Assert-IsArray -Object $updateCalendar.Body -Context "Update calendar" -MinLength 1

$pricingProxy = Invoke-Api -Method POST -Path "/listings/$listingId/pricing-suggestion" -Token $ownerToken
Assert-FieldNotNull -Object $pricingProxy.Body -FieldPath "note" -Context "Pricing-suggestion proxy stub"

# Throwaway vehicle+listing dedicated to the DELETE test, so the primary
# fixtures above stay alive for every later cross-domain section.
$throwawayVehicle = Invoke-Api -Method POST -Path "/vehicles" -Body @{ vin = "THROWAWAY$([guid]::NewGuid().ToString('N').Substring(0,8))"; licensePlate = "DEL1" } -Token $ownerToken
$throwawayListing = Invoke-Api -Method POST -Path "/listings" -Body @{ vehicleId = $throwawayVehicle.Body.id; basePriceCents = 5000 } -Token $ownerToken
$deleteAsRenter = Invoke-Api -Method DELETE -Path "/listings/$($throwawayListing.Body.id)" -Token $renterToken
Assert -Condition ($deleteAsRenter.StatusCode -eq 403) -Description "Non-owner CANNOT delete someone else's listing" -Details "status=$($deleteAsRenter.StatusCode)"
$deleteListing = Invoke-Api -Method DELETE -Path "/listings/$($throwawayListing.Body.id)" -Token $ownerToken
Assert-Field -Object $deleteListing.Body -FieldPath "status" -Expected "removed" -Context "Owner deletes (soft-removes) own listing"

# --- Now that a real listing exists, revisit Trust Score thresholds/eligibility ---
Write-SubSection "Trust Score thresholds against a real listing"
$setThreshold = Invoke-Api -Method PUT -Path "/trust/thresholds/$listingId" -Body @{ minimumScore = 200; minimumTier = "new" } -Token $ownerToken
Assert-Field -Object $setThreshold.Body -FieldPath "minimumScore" -Expected 200 -Context "Set listing trust threshold"

$getThreshold = Invoke-Api -Method GET -Path "/trust/thresholds/$listingId" -Token $ownerToken
Assert-Field -Object $getThreshold.Body -FieldPath "minimumScore" -Expected 200 -Context "Get listing trust threshold"

$eligibility = Invoke-Api -Method POST -Path "/trust/eligibility-check" -Body @{ userId = $renterId; listingId = $listingId } -Token $ownerToken
Assert-Field -Object $eligibility.Body -FieldPath "eligible" -Expected $true -Context "Renter meets low threshold (score 200, new renter starts at 300)"

# ============================================================================
# 5. ACCESS & IOT
# ============================================================================
Write-Section "5. ACCESS & IOT"

if (-not $AdminAvailable) {
    Skip-Test "Access & IoT: device registration + immobilization" "requires seeded admin token"
} else {
    $regDevice = Invoke-Api -Method POST -Path "/access/devices" -Body @{ vehicleId = $vehicleId; deviceType = "aftermarket_smart_lock"; vendorRef = "smoke-vendor" } -Token $adminToken
    Assert-Status -Response $regDevice -Expected @(200,201) -Context "Register access device"
    $deviceId = $regDevice.Body.id

    $deviceHealth = Invoke-Api -Method GET -Path "/access/devices/$deviceId/health" -Token $ownerToken
    Assert-FieldNotNull -Object $deviceHealth.Body -FieldPath "online" -Context "Device health check"
}

$validFrom = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$validUntil = (Get-Date).AddDays(1).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")

if (-not $AdminAvailable) {
    Skip-Test "Access & IoT: key issuance / commands / revoke" "requires a 'service' role token, minted via admin-created staff account"
} else {
    # Mint a genuine service-role token via the admin/staff pipeline rather than
    # faking a role locally -- this is the only legitimate way to get one.
    $svcEmail = New-TestEmail "svc"
    $svcCreate = Invoke-Api -Method POST -Path "/admin/staff/accounts" -Body @{ email = $svcEmail; password = $password; role = "service" } -Token $adminToken
    Assert-Status -Response $svcCreate -Expected @(200,201) -Context "Admin creates a service-role account"
    $svcLogin = Invoke-Api -Method POST -Path "/auth/login" -Body @{ email = $svcEmail; password = $password }
    $serviceToken = $svcLogin.Body.accessToken
    Assert-FieldNotNull -Object $svcLogin.Body -FieldPath "accessToken" -Context "Login as service account"

    $keyAsOwner = Invoke-Api -Method POST -Path "/access/keys" -Body @{ tripId = $tripId; vehicleId = $vehicleId; renterId = $renterId; validFrom = $validFrom; validUntil = $validUntil } -Token $ownerToken
    Assert -Condition ($keyAsOwner.StatusCode -eq 403) -Description "Ordinary user CANNOT issue a digital key directly (service only)" -Details "status=$($keyAsOwner.StatusCode)"

    $issueKey = Invoke-Api -Method POST -Path "/access/keys" -Body @{ tripId = $tripId; vehicleId = $vehicleId; renterId = $renterId; validFrom = $validFrom; validUntil = $validUntil } -Token $serviceToken
    Assert-Status -Response $issueKey -Expected @(200,201) -Context "Service issues digital key"
    Assert-Field -Object $issueKey.Body -FieldPath "status" -Expected "active" -Context "Digital key active on issuance"
    $keyId = $issueKey.Body.id

    $getKey = Invoke-Api -Method GET -Path "/access/keys/$keyId" -Token $renterToken
    Assert-Field -Object $getKey.Body -FieldPath "renterId" -Expected $renterId -Context "Get digital key"

    $unlockAsOwner = Invoke-Api -Method POST -Path "/access/keys/$keyId/unlock" -Token $ownerToken
    Assert -Condition ($unlockAsOwner.StatusCode -eq 403) -Description "Non-renter (vehicle owner) CANNOT use the renter's digital key" -Details "status=$($unlockAsOwner.StatusCode)"

    $unlock = Invoke-Api -Method POST -Path "/access/keys/$keyId/unlock" -Token $renterToken
    Assert-Status -Response $unlock -Expected @(200,201) -Context "Renter unlocks vehicle"
    Assert-Field -Object $unlock.Body -FieldPath "MOCKED" -Expected $true -Context "Unlock command is clearly marked mocked"

    $lock = Invoke-Api -Method POST -Path "/access/keys/$keyId/lock" -Token $renterToken
    Assert-Status -Response $lock -Expected @(200,201) -Context "Renter locks vehicle"

    $startIgnition = Invoke-Api -Method POST -Path "/access/keys/$keyId/start-ignition" -Token $renterToken
    Assert-Status -Response $startIgnition -Expected @(200,201) -Context "Renter starts ignition"

    $immobilizeAsRenter = Invoke-Api -Method POST -Path "/access/vehicles/$vehicleId/immobilize" -Body @{ justification = "trying to steal my own rental lol" } -Token $renterToken
    Assert -Condition ($immobilizeAsRenter.StatusCode -eq 403) -Description "Renter CANNOT immobilize a vehicle (admin/support only)" -Details "status=$($immobilizeAsRenter.StatusCode)"

    $immobilizeShortReason = Invoke-Api -Method POST -Path "/access/vehicles/$vehicleId/immobilize" -Body @{ justification = "short" } -Token $adminToken
    Assert -Condition ($immobilizeShortReason.StatusCode -eq 400) -Description "Immobilization with insufficient justification is rejected" -Details "status=$($immobilizeShortReason.StatusCode)"

    $immobilize = Invoke-Api -Method POST -Path "/access/vehicles/$vehicleId/immobilize" -Body @{ justification = "Confirmed theft report filed with police, immobilizing per safety policy." } -Token $adminToken
    Assert-Field -Object $immobilize.Body -FieldPath "immobilized" -Expected $true -Context "Admin immobilizes vehicle with valid justification"

    $geofence = Invoke-Api -Method POST -Path "/access/vehicles/$vehicleId/geofence" -Body @{ tripId = $tripId; polygon = @{ type = "circle"; radiusMeters = 5000 } } -Token $ownerToken
    Assert-Status -Response $geofence -Expected @(200,201) -Context "Set geofence"

    $location = Invoke-Api -Method GET -Path "/access/vehicles/$vehicleId/location" -Token $ownerToken
    Assert-FieldNotNull -Object $location.Body -FieldPath "lat" -Context "Get vehicle location (mocked)"

    $webhookEventAsOwner = Invoke-Api -Method POST -Path "/access/webhooks/telematics-event" -Body @{ vehicleId = $vehicleId; eventType = "tamper_detected"; payload = @{} } -Token $ownerToken
    Assert -Condition ($webhookEventAsOwner.StatusCode -eq 403) -Description "Ordinary user CANNOT post telematics webhook events (service only)" -Details "status=$($webhookEventAsOwner.StatusCode)"

    $webhookEvent = Invoke-Api -Method POST -Path "/access/webhooks/telematics-event" -Body @{ vehicleId = $vehicleId; eventType = "tamper_detected"; payload = @{ note = "smoke-test" } } -Token $serviceToken
    Assert-Status -Response $webhookEvent -Expected @(200,201) -Context "Service posts telematics tamper event"
    Assert-Field -Object $webhookEvent.Body -FieldPath "eventType" -Expected "tamper_detected" -Context "Telematics event recorded"

    $revokeKey = Invoke-Api -Method POST -Path "/access/keys/$keyId/revoke" -Token $serviceToken
    Assert-Field -Object $revokeKey.Body -FieldPath "status" -Expected "revoked" -Context "Service revokes digital key"
}

# ============================================================================
# 6. DATA SECURITY & COMPLIANCE
# ============================================================================
Write-Section "6. DATA SECURITY & COMPLIANCE"

$tokenizeDoc = Invoke-Api -Method POST -Path "/security/documents/tokenize" -Body @{ documentClass = "other"; plaintextBase64 = (ConvertTo-Base64 "top-secret-smoke-test-content") } -Token $ownerToken
Assert-Status -Response $tokenizeDoc -Expected @(200,201) -Context "Tokenize a document"
Assert-FieldNotNull -Object $tokenizeDoc.Body -FieldPath "token" -Context "Tokenize a document"
$docToken = $tokenizeDoc.Body.token

$readAsOwner = Invoke-Api -Method GET -Path "/security/documents/$docToken" -Token $ownerToken
Assert-Status -Response $readAsOwner -Expected @(200) -Context "Owner reads own tokenized document"
$decoded = ConvertFrom-Base64 $readAsOwner.Body.plaintextBase64
Assert -Condition ($decoded -eq "top-secret-smoke-test-content") -Description "Decrypted document content round-trips correctly" -Details "decoded='$decoded'"

$readAsRenter = Invoke-Api -Method GET -Path "/security/documents/$docToken" -Token $renterToken
Assert -Condition ($readAsRenter.StatusCode -eq 403) -Description "Non-owner (non-staff) CANNOT read someone else's tokenized document" -Details "status=$($readAsRenter.StatusCode)"

if ($AdminAvailable) {
    $readAsAdmin = Invoke-Api -Method GET -Path "/security/documents/$docToken" -Token $adminToken
    Assert-Status -Response $readAsAdmin -Expected @(200) -Context "Admin/support CAN read any tokenized document (audited access)"
} else {
    Skip-Test "Admin reads tokenized document" "requires seeded admin token"
}

$deleteDoc = Invoke-Api -Method DELETE -Path "/security/documents/$docToken" -Token $ownerToken
Assert-Field -Object $deleteDoc.Body -FieldPath "deleted" -Expected $true -Context "Owner deletes own document"

$readAfterDelete = Invoke-Api -Method GET -Path "/security/documents/$docToken" -Token $ownerToken
Assert -Condition ($readAfterDelete.StatusCode -eq 404) -Description "Reading a deleted document returns 404" -Details "status=$($readAfterDelete.StatusCode)"

$recordConsent = Invoke-Api -Method POST -Path "/security/consent" -Body @{ consentType = "marketing" } -Token $ownerToken
Assert-Status -Response $recordConsent -Expected @(200,201) -Context "Record consent"

$listConsent = Invoke-Api -Method GET -Path "/security/consent/$ownerId" -Token $ownerToken
Assert-IsArray -Object $listConsent.Body -Context "List consents" -MinLength 1

$exportRequest = Invoke-Api -Method POST -Path "/security/data-requests/export" -Token $ownerToken
Assert-Field -Object $exportRequest.Body -FieldPath "status" -Expected "pending" -Context "Request data export"
$exportRequestId = $exportRequest.Body.id

$exportStatus = Invoke-Api -Method GET -Path "/security/data-requests/$exportRequestId/status" -Token $ownerToken
Assert-Field -Object $exportStatus.Body -FieldPath "status" -Expected "pending" -Context "Get export request status"

# Deletion tested on a dedicated throwaway account with no disputes/claims/legal holds,
# so we can assert the CLEAN-PATH outcome deterministically.
$deleteRequest = Invoke-Api -Method POST -Path "/security/data-requests/delete" -Token $deleteMeToken
Assert-Field -Object $deleteRequest.Body -FieldPath "status" -Expected "completed" -Context "Data deletion completes cleanly for a user with no holds"

if ($AdminAvailable) {
    $auditLogAsAdmin = Invoke-Api -Method GET -Path "/security/audit-log" -Token $adminToken
    Assert-IsArray -Object $auditLogAsAdmin.Body -Context "Admin queries document-access audit log"
    $auditLogAsOwner = Invoke-Api -Method GET -Path "/security/audit-log" -Token $ownerToken
    Assert -Condition ($auditLogAsOwner.StatusCode -eq 403) -Description "Ordinary user CANNOT query the audit log" -Details "status=$($auditLogAsOwner.StatusCode)"
} else {
    Skip-Test "Query document-access audit log" "requires seeded admin token"
}

# ============================================================================
# 7. PAYMENTS & ESCROW
# ============================================================================
Write-Section "7. PAYMENTS & ESCROW"

$addOwnerMethod = Invoke-Api -Method POST -Path "/payments/methods" -Body @{ type = "bank_account"; rawDetails = @{ routing = "021000021"; account = "1111222233334444" } } -Token $ownerToken
Assert-Status -Response $addOwnerMethod -Expected @(200,201) -Context "Owner adds payout method"
Assert-FieldNotNull -Object $addOwnerMethod.Body -FieldPath "processorToken" -Context "Payment method vaulted (mocked processor)"

$addRenterMethod = Invoke-Api -Method POST -Path "/payments/methods" -Body @{ type = "card"; rawDetails = @{ number = "4111111111111111"; exp = "12/30" } } -Token $renterToken
Assert-Status -Response $addRenterMethod -Expected @(200,201) -Context "Renter adds card"
$renterPaymentMethodId = $addRenterMethod.Body.id

$listRenterMethods = Invoke-Api -Method GET -Path "/payments/methods/$renterId" -Token $renterToken
Assert-IsArray -Object $listRenterMethods.Body -Context "List renter payment methods" -MinLength 1

$throwawayMethod = Invoke-Api -Method POST -Path "/payments/methods" -Body @{ type = "card"; rawDetails = @{ number = "4000000000000002" } } -Token $renterToken
$removeMethod = Invoke-Api -Method DELETE -Path "/payments/methods/$($throwawayMethod.Body.id)" -Token $renterToken
Assert-Field -Object $removeMethod.Body -FieldPath "status" -Expected "removed" -Context "Remove a payment method"

if (-not $AdminAvailable) {
    Skip-Test "Payments & Escrow: authorize/capture/void/deposit/payout (service-role gated)" "requires seeded admin to mint a service token"
} else {
    if (-not $serviceToken) {
        $svcEmail2 = New-TestEmail "svc"
        $svcCreate2 = Invoke-Api -Method POST -Path "/admin/staff/accounts" -Body @{ email = $svcEmail2; password = $password; role = "service" } -Token $adminToken
        $serviceToken = (Invoke-Api -Method POST -Path "/auth/login" -Body @{ email = $svcEmail2; password = $password }).Body.accessToken
    }

    $authorizeAsUser = Invoke-Api -Method POST -Path "/payments/authorizations" -Body @{ tripId = $tripId; payerUserId = $renterId; paymentMethodId = $renterPaymentMethodId; amountCents = 10000 } -Token $renterToken
    Assert -Condition ($authorizeAsUser.StatusCode -eq 403) -Description "Ordinary user CANNOT directly authorize a payment (service only, prevents self-service fund manipulation)" -Details "status=$($authorizeAsUser.StatusCode)"

    $authorize = Invoke-Api -Method POST -Path "/payments/authorizations" -Body @{ tripId = $tripId; payerUserId = $renterId; paymentMethodId = $renterPaymentMethodId; amountCents = 10000 } -Token $serviceToken
    Assert-Status -Response $authorize -Expected @(200,201) -Context "Service authorizes rental payment"
    Assert-Field -Object $authorize.Body -FieldPath "status" -Expected "authorized" -Context "Payment authorization created"
    $authId = $authorize.Body.id

    $capture = Invoke-Api -Method POST -Path "/payments/authorizations/$authId/capture" -Token $serviceToken
    Assert-Field -Object $capture.Body -FieldPath "status" -Expected "captured" -Context "Service captures authorized payment"

    $doubleCapture = Invoke-Api -Method POST -Path "/payments/authorizations/$authId/capture" -Token $serviceToken
    Assert -Condition ($doubleCapture.StatusCode -eq 400) -Description "Capturing an already-captured authorization is rejected" -Details "status=$($doubleCapture.StatusCode)"

    Write-SubSection "Void a payment authorization"
    # Void needs a FRESH, still-'authorized' authorization -- $authId above is already
    # captured, and voiding/capturing a captured authorization is a different (already
    # covered) rejection path, not what this endpoint's happy path looks like.
    $voidTripId = [guid]::NewGuid().ToString()
    $authForVoid = Invoke-Api -Method POST -Path "/payments/authorizations" -Body @{ tripId = $voidTripId; payerUserId = $renterId; paymentMethodId = $renterPaymentMethodId; amountCents = 4200 } -Token $serviceToken
    Assert-Field -Object $authForVoid.Body -FieldPath "status" -Expected "authorized" -Context "Create a fresh authorization to be voided"
    $authForVoidId = $authForVoid.Body.id

    $voidAsUser = Invoke-Api -Method POST -Path "/payments/authorizations/$authForVoidId/void" -Token $renterToken
    Assert -Condition ($voidAsUser.StatusCode -eq 403) -Description "Ordinary user CANNOT void a payment authorization directly (service only)" -Details "status=$($voidAsUser.StatusCode)"

    $voidAuth = Invoke-Api -Method POST -Path "/payments/authorizations/$authForVoidId/void" -Token $serviceToken
    Assert-Field -Object $voidAuth.Body -FieldPath "status" -Expected "voided" -Context "Service voids a pending authorization (e.g. booking cancelled pre-trip)"

    $captureAfterVoid = Invoke-Api -Method POST -Path "/payments/authorizations/$authForVoidId/capture" -Token $serviceToken
    Assert -Condition ($captureAfterVoid.StatusCode -eq 400) -Description "Cannot capture an authorization that has already been voided" -Details "status=$($captureAfterVoid.StatusCode)"

    $preauthDeposit = Invoke-Api -Method POST -Path "/payments/deposits/preauthorize" -Body @{ tripId = $tripId; paymentMethodId = $renterPaymentMethodId; amountCents = 25000 } -Token $serviceToken
    Assert-Field -Object $preauthDeposit.Body -FieldPath "status" -Expected "held" -Context "Service pre-authorizes deposit hold"
    $depositId = $preauthDeposit.Body.id

    $partialCapture = Invoke-Api -Method POST -Path "/payments/deposits/$depositId/partial-capture" -Body @{ amountCents = 5000; reason = "Minor cleaning fee assessed during smoke test." } -Token $serviceToken
    Assert-Field -Object $partialCapture.Body -FieldPath "status" -Expected "partially_captured" -Context "Partial deposit capture for a fee"

    $overCapture = Invoke-Api -Method POST -Path "/payments/deposits/$depositId/partial-capture" -Body @{ amountCents = 999999; reason = "Should fail -- exceeds remaining hold" } -Token $serviceToken
    Assert -Condition ($overCapture.StatusCode -eq 400) -Description "Capturing more than the deposit hold amount is rejected" -Details "status=$($overCapture.StatusCode)"

    $releaseDeposit = Invoke-Api -Method POST -Path "/payments/deposits/$depositId/release" -Token $serviceToken
    Assert-Field -Object $releaseDeposit.Body -FieldPath "status" -Expected "released" -Context "Release remaining deposit"

    $payout = Invoke-Api -Method POST -Path "/payments/payouts" -Body @{ ownerId = $ownerId; tripId = $tripId; amountCents = 8500; platformFeeCents = 1500 } -Token $serviceToken
    Assert-Field -Object $payout.Body -FieldPath "status" -Expected "scheduled" -Context "Service schedules owner payout"
    $payoutId = $payout.Body.id

    $getPayout = Invoke-Api -Method GET -Path "/payments/payouts/$payoutId" -Token $ownerToken
    Assert-Field -Object $getPayout.Body -FieldPath "amountCents" -Expected 8500 -Context "Get payout"

    $ledger = Invoke-Api -Method GET -Path "/payments/transactions/$tripId" -Token $ownerToken
    Assert-IsArray -Object $ledger.Body -Context "Trip transaction ledger" -MinLength 1

    $webhookCallback = Invoke-Api -Method POST -Path "/payments/webhooks/processor-callback" -Body @{ eventType = "payout.paid"; payload = @{ payoutId = $payoutId } } -Token $serviceToken
    Assert-Status -Response $webhookCallback -Expected @(200,201) -Context "Processor webhook: payout.paid"
}

# ============================================================================
# 8. FRAUD DETECTION
# ============================================================================
Write-Section "8. FRAUD DETECTION"

$deviceSignal = Invoke-Api -Method POST -Path "/fraud/signals/device" -Body @{ userId = $renterId; deviceFingerprint = "smoke-test-device-001"; behavioralBiometricScore = 0.92; ipGeoMismatchFlag = $false } -Token $renterToken
Assert-Status -Response $deviceSignal -Expected @(200,201) -Context "Submit device signal"

if (-not $AdminAvailable) {
    Skip-Test "Fraud: evaluate booking/listing, case triage, chargeback evidence (service/staff gated)" "requires seeded admin"
} else {
    $evalBookingAsUser = Invoke-Api -Method POST -Path "/fraud/evaluate/booking" -Body @{ userId = $renterId; listingId = $listingId; tripId = $tripId } -Token $renterToken
    Assert -Condition ($evalBookingAsUser.StatusCode -eq 403) -Description "Ordinary user CANNOT trigger a fraud evaluation (service only)" -Details "status=$($evalBookingAsUser.StatusCode)"

    $evalBooking = Invoke-Api -Method POST -Path "/fraud/evaluate/booking" -Body @{ userId = $renterId; listingId = $listingId; tripId = $tripId; context = @{ highValueOrOneWay = $false } } -Token $serviceToken
    Assert-Status -Response $evalBooking -Expected @(200,201) -Context "Service evaluates booking risk"
    Assert-Field -Object $evalBooking.Body -FieldPath "decision" -Expected "allow" -Context "Low-risk booking is allowed"

    $evalListing = Invoke-Api -Method POST -Path "/fraud/evaluate/listing" -Body @{ listingId = $listingId; ownerId = $ownerId } -Token $serviceToken
    Assert-Status -Response $evalListing -Expected @(200,201) -Context "Service evaluates listing risk"

    $linkAnalysis = Invoke-Api -Method POST -Path "/fraud/link-analysis" -Body @{ userIds = @($ownerId, $renterId) } -Token $adminToken
    Assert-FieldNotNull -Object $linkAnalysis.Body -FieldPath "linked" -Context "Link analysis runs without error"

    $chargebackEvidence = Invoke-Api -Method POST -Path "/fraud/chargeback-evidence" -Body @{ tripId = $tripId; includedArtifacts = @("contract.pdf","id_verification.json") } -Token $serviceToken
    Assert-Field -Object $chargebackEvidence.Body -FieldPath "submittedToProcessor" -Expected $true -Context "Assemble + submit chargeback evidence bundle"
    $bundleId = $chargebackEvidence.Body.id

    $getBundle = Invoke-Api -Method GET -Path "/fraud/chargeback-evidence/$bundleId" -Token $adminToken
    Assert-Field -Object $getBundle.Body -FieldPath "tripId" -Expected $tripId -Context "Get chargeback evidence bundle"

    Write-SubSection "Fraud case lifecycle (GET /fraud/cases/:id, POST /fraud/cases/:id/decision)"
    # Deterministically drive a real 'block' decision (rather than faking one) by
    # replaying the actual signal combination the engine looks for: a brand-new
    # account, a booking-velocity spike (>5 evaluations in 24h), a high-value/
    # one-way trip flag, and an IP/geo mismatch. This also exercises the fix
    # applied earlier in this session (the velocity/repeat-offense counters were
    # querying by the wrong field and could never fire before that fix).
    $fraudsterEmail = New-TestEmail "fraudster"
    $fraudsterReg = Invoke-Api -Method POST -Path "/auth/register" -Body @{ email = $fraudsterEmail; password = $password }
    $fraudsterId = $fraudsterReg.Body.userId

    for ($i = 0; $i -lt 6; $i++) {
        Invoke-Api -Method POST -Path "/fraud/evaluate/booking" -Body @{
            userId = $fraudsterId; listingId = $listingId; tripId = [guid]::NewGuid().ToString()
        } -Token $serviceToken | Out-Null
    }

    $blockTripId = [guid]::NewGuid().ToString()
    $evalBlock = Invoke-Api -Method POST -Path "/fraud/evaluate/booking" -Body @{
        userId = $fraudsterId; listingId = $listingId; tripId = $blockTripId
        context = @{ highValueOrOneWay = $true; ipGeoMismatchFlag = $true }
    } -Token $serviceToken
    Assert-Field -Object $evalBlock.Body -FieldPath "decision" -Expected "block" -Context "Combined signals (new account + velocity spike + high-value trip + IP/geo mismatch) correctly produce a BLOCK decision"
    Assert-Field -Object $evalBlock.Body -FieldPath "signals.bookingVelocitySpike" -Expected 6 -Context "Velocity-spike signal correctly counts this user's prior 24h evaluations (regression check for the userId/subjectId fix)"

    # The block decision opens a FraudCase internally but doesn't return its id directly --
    # find it via the moderation triage queue (its intended discovery path per the spec).
    $triageQueue = Invoke-Api -Method GET -Path "/admin/moderation/fraud-triage-queue" -Token $adminToken
    $ourCase = @($triageQueue.Body) | Where-Object { $_.relatedUserIds -contains $fraudsterId } | Select-Object -First 1
    Assert -Condition ($null -ne $ourCase) -Description "Newly opened fraud case for the fraudster account appears in the triage queue" -Details "queue=$(Format-Compact $triageQueue.Body)"
    $fraudCaseId = $ourCase.id

    $getCaseAsUser = Invoke-Api -Method GET -Path "/fraud/cases/$fraudCaseId" -Token $renterToken
    Assert -Condition ($getCaseAsUser.StatusCode -eq 403) -Description "Ordinary user CANNOT view a fraud case (support/admin only)" -Details "status=$($getCaseAsUser.StatusCode)"

    $getCase = Invoke-Api -Method GET -Path "/fraud/cases/$fraudCaseId" -Token $adminToken
    Assert-Field -Object $getCase.Body -FieldPath "status" -Expected "open" -Context "Get fraud case detail"
    Assert-Field -Object $getCase.Body -FieldPath "caseType" -Expected "payment_fraud" -Context "Fraud case correctly typed as payment_fraud"

    $decideCaseAsUser = Invoke-Api -Method POST -Path "/fraud/cases/$fraudCaseId/decision" -Body @{ status = "confirmed" } -Token $renterToken
    Assert -Condition ($decideCaseAsUser.StatusCode -eq 403) -Description "Ordinary user CANNOT decide a fraud case (support/admin only)" -Details "status=$($decideCaseAsUser.StatusCode)"

    $decideCase = Invoke-Api -Method POST -Path "/fraud/cases/$fraudCaseId/decision" -Body @{ status = "confirmed" } -Token $adminToken
    Assert-Field -Object $decideCase.Body -FieldPath "status" -Expected "confirmed" -Context "Admin confirms fraud case"
    Assert-FieldNotNull -Object $decideCase.Body -FieldPath "resolvedAt" -Context "Confirming a case sets resolvedAt"

    $getCaseAfterDecision = Invoke-Api -Method GET -Path "/fraud/cases/$fraudCaseId" -Token $adminToken
    Assert-Field -Object $getCaseAfterDecision.Body -FieldPath "status" -Expected "confirmed" -Context "Get fraud case reflects the decision"
}

# ============================================================================
# 9. INSURANCE & LIABILITY
# ============================================================================
Write-Section "9. INSURANCE & LIABILITY"

$tiers = Invoke-Api -Method GET -Path "/insurance/tiers" -Token $ownerToken
Assert-IsArray -Object $tiers.Body -Context "List coverage tiers (auto-seeded)" -MinLength 3
$standardTier = $tiers.Body | Where-Object { $_.name -eq 'standard' } | Select-Object -First 1
Assert -Condition ($null -ne $standardTier) -Description "Standard coverage tier exists" -Details "tiers=$(Format-Compact $tiers.Body)"
$standardTierId = $standardTier.id

$quote = Invoke-Api -Method POST -Path "/insurance/quotes" -Body @{ tripId = $tripId; tierId = $standardTierId; riskFactors = @{ trustTier = "new"; drivingRiskTier = "low" } } -Token $renterToken
Assert-NumberGreaterThan -Object $quote.Body -FieldPath "quotedPriceCents" -Threshold 0 -Context "Insurance quote price"
$quotedPriceCents = $quote.Body.quotedPriceCents

$bindBeforeCheck = Invoke-Api -Method POST -Path "/insurance/policies" -Body @{ tripId = $tripId; tierId = $standardTierId } -Token $renterToken
Assert -Condition ($bindBeforeCheck.StatusCode -eq 400) -Description "Cannot bind a policy before the comprehension check passes" -Details "status=$($bindBeforeCheck.StatusCode)"

$comprehensionCheck = Invoke-Api -Method POST -Path "/insurance/comprehension-check" -Body @{
    tripId = $tripId
    answers = @(
        @{ questionId = "deductible"; answer = "750 dollars" },
        @{ questionId = "liability_limit"; answer = "50000000 cents" },
        @{ questionId = "off_trip_coverage"; answer = "not covered outside trip window" }
    )
} -Token $renterToken
Assert-Field -Object $comprehensionCheck.Body -FieldPath "passed" -Expected $true -Context "Comprehension check with substantive answers passes"

$bindPolicy = Invoke-Api -Method POST -Path "/insurance/policies" -Body @{ tripId = $tripId; tierId = $standardTierId } -Token $renterToken
Assert-Field -Object $bindPolicy.Body -FieldPath "status" -Expected "bound" -Context "Bind policy after comprehension check passes"
Assert-FieldNotNull -Object $bindPolicy.Body -FieldPath "carrierRef" -Context "Policy has mocked carrier reference"
$policyId = $bindPolicy.Body.id

$getPolicy = Invoke-Api -Method GET -Path "/insurance/policies/$policyId" -Token $renterToken
Assert-Field -Object $getPolicy.Body -FieldPath "tripId" -Expected $tripId -Context "Get bound policy"

$fileClaim = Invoke-Api -Method POST -Path "/insurance/claims" -Body @{ policyId = $policyId; tripId = $tripId; claimType = "vehicle_damage" } -Token $ownerToken
Assert-Field -Object $fileClaim.Body -FieldPath "status" -Expected "filed" -Context "File insurance claim"
$claimId = $fileClaim.Body.id

$attachEvidence = Invoke-Api -Method POST -Path "/insurance/claims/$claimId/evidence" -Body @{ evidenceRefs = @("post_trip_photo_1.jpg") } -Token $ownerToken
Assert-Field -Object $attachEvidence.Body -FieldPath "status" -Expected "under_review" -Context "Attach evidence moves claim to under_review"

$getClaimUnderReview = Invoke-Api -Method GET -Path "/insurance/claims/$claimId" -Token $ownerToken
Assert-Field -Object $getClaimUnderReview.Body -FieldPath "status" -Expected "under_review" -Context "Get claim reflects under_review state"
$evidenceContainsRef = $getClaimUnderReview.Body.evidenceRefs -contains "post_trip_photo_1.jpg"
Assert -Condition $evidenceContainsRef -Description "Get claim returns the attached evidence ref" -Details "evidenceRefs=$(Format-Compact $getClaimUnderReview.Body.evidenceRefs)"

if ($AdminAvailable) {
    $decideAsOwner = Invoke-Api -Method POST -Path "/insurance/claims/$claimId/decision" -Body @{ status = "approved"; payoutAmountCents = 50000 } -Token $ownerToken
    Assert -Condition ($decideAsOwner.StatusCode -eq 403) -Description "Claimant CANNOT decide their own claim (support/admin/service only)" -Details "status=$($decideAsOwner.StatusCode)"

    $decideClaim = Invoke-Api -Method POST -Path "/insurance/claims/$claimId/decision" -Body @{ status = "approved"; payoutAmountCents = 50000 } -Token $adminToken
    Assert-Field -Object $decideClaim.Body -FieldPath "status" -Expected "approved" -Context "Admin decides claim"
    Assert-Field -Object $decideClaim.Body -FieldPath "payoutAmountCents" -Expected 50000 -Context "Claim payout amount recorded"

    $getClaimApproved = Invoke-Api -Method GET -Path "/insurance/claims/$claimId" -Token $ownerToken
    Assert-Field -Object $getClaimApproved.Body -FieldPath "status" -Expected "approved" -Context "Get claim reflects final approved state"
    Assert-Field -Object $getClaimApproved.Body -FieldPath "payoutAmountCents" -Expected 50000 -Context "Get claim returns the recorded payout amount"
} else {
    Skip-Test "Decide insurance claim" "requires seeded admin token"
}

# ============================================================================
# 10. DISPUTE RESOLUTION
# ============================================================================
Write-Section "10. DISPUTE RESOLUTION"

# --- Case A: 'damage' dispute WITH pre/post baselines -> should auto-resolve (mock CV finds no new damage) ---
Invoke-Api -Method POST -Path "/vehicles/$vehicleId/condition-baseline" -Body @{ type = "pre_trip"; tripId = $tripId; mediaAssetRefs = @("pre1.jpg") } -Token $ownerToken | Out-Null
Invoke-Api -Method POST -Path "/vehicles/$vehicleId/condition-baseline" -Body @{ type = "post_trip"; tripId = $tripId; mediaAssetRefs = @("post1.jpg") } -Token $renterToken | Out-Null

$damageDispute = Invoke-Api -Method POST -Path "/disputes" -Body @{ tripId = $tripId; disputeType = "damage" } -Token $ownerToken
Assert-Status -Response $damageDispute -Expected @(200,201) -Context "File damage dispute (with baselines present)"
Assert-Field -Object $damageDispute.Body -FieldPath "status" -Expected "resolved_auto" -Context "Damage dispute auto-resolves when CV comparison finds no new damage"
$damageDisputeId = $damageDispute.Body.id

$getDamageDispute = Invoke-Api -Method GET -Path "/disputes/$damageDisputeId" -Token $ownerToken
Assert-Field -Object $getDamageDispute.Body -FieldPath "status" -Expected "resolved_auto" -Context "Get auto-resolved dispute"

if (-not $AdminAvailable) {
    Skip-Test "Direct calls to auto-resolve-attempt / escalate (service/support-role gated)" "requires seeded admin to mint a service token"
} else {
    Write-SubSection "Direct auto-resolve-attempt / escalate calls (not just their side-effect-triggered internal invocation)"

    $autoResolveAsOwner = Invoke-Api -Method POST -Path "/disputes/$damageDisputeId/auto-resolve-attempt" -Token $ownerToken
    Assert -Condition ($autoResolveAsOwner.StatusCode -eq 403) -Description "A party to the dispute CANNOT directly trigger auto-resolve-attempt (service only)" -Details "status=$($autoResolveAsOwner.StatusCode)"

    $autoResolveAsAdmin = Invoke-Api -Method POST -Path "/disputes/$damageDisputeId/auto-resolve-attempt" -Token $adminToken
    Assert -Condition ($autoResolveAsAdmin.StatusCode -eq 403) -Description "Even an admin CANNOT directly trigger auto-resolve-attempt (strictly service-role only, not admin)" -Details "status=$($autoResolveAsAdmin.StatusCode)"

    $autoResolveDirect = Invoke-Api -Method POST -Path "/disputes/$damageDisputeId/auto-resolve-attempt" -Token $serviceToken
    Assert-Field -Object $autoResolveDirect.Body -FieldPath "status" -Expected "resolved_auto" -Context "Service directly re-invokes auto-resolve-attempt; result is idempotent"

    $escalateAsRenter = Invoke-Api -Method POST -Path "/disputes/$damageDisputeId/escalate" -Token $renterToken
    Assert -Condition ($escalateAsRenter.StatusCode -eq 403) -Description "Ordinary user CANNOT directly escalate a dispute (service/support_agent only)" -Details "status=$($escalateAsRenter.StatusCode)"

    $escalateAsAdmin = Invoke-Api -Method POST -Path "/disputes/$damageDisputeId/escalate" -Token $adminToken
    Assert -Condition ($escalateAsAdmin.StatusCode -eq 403) -Description "Even a plain admin CANNOT escalate directly -- this endpoint is scoped to service/support_agent specifically, not admin" -Details "status=$($escalateAsAdmin.StatusCode)"

    # A support agent manually escalating an already auto-resolved dispute is a legitimate
    # real scenario (e.g. the renter contacts support disputing the automated outcome) --
    # exercises the endpoint standalone rather than only as fileDispute's internal side effect.
    # (Using the service token here since the dedicated support_agent account isn't minted
    # until section 14; role-wise 'service' is equally valid per the controller's @Roles list.)
    $escalateDirect = Invoke-Api -Method POST -Path "/disputes/$damageDisputeId/escalate" -Token $serviceToken
    Assert-Field -Object $escalateDirect.Body -FieldPath "tier" -Expected "mediator_review" -Context "Service manually escalates a previously auto-resolved dispute"

    $getAfterManualEscalate = Invoke-Api -Method GET -Path "/disputes/$damageDisputeId" -Token $ownerToken
    Assert-Field -Object $getAfterManualEscalate.Body -FieldPath "tier" -Expected "mediator_review" -Context "Manual escalation persists"
    Assert-Field -Object $getAfterManualEscalate.Body -FieldPath "status" -Expected "resolved_auto" -Context "Escalating tier does not itself change the dispute's resolution status (status and tier are independent fields)"
}

# --- Case B: 'mileage' dispute (non-damage type) -> always escalates straight to mediator review ---
$tripId2 = [guid]::NewGuid().ToString()
$mileageDispute = Invoke-Api -Method POST -Path "/disputes" -Body @{ tripId = $tripId2; disputeType = "mileage" } -Token $renterToken
Assert-Field -Object $mileageDispute.Body -FieldPath "tier" -Expected "mediator_review" -Context "Non-damage dispute type immediately escalates to mediator review"
$mileageDisputeId = $mileageDispute.Body.id

$addEvidence = Invoke-Api -Method POST -Path "/disputes/$mileageDisputeId/evidence" -Body @{ sourceType = "user_submission"; refPointer = "odometer_photo.jpg" } -Token $renterToken
Assert-Status -Response $addEvidence -Expected @(200,201) -Context "Attach user evidence to dispute"

if ($AdminAvailable) {
    $mediatorDecisionAsUser = Invoke-Api -Method POST -Path "/disputes/$mileageDisputeId/mediator-decision" -Body @{ decisionSummary = "trying to resolve my own dispute" } -Token $renterToken
    Assert -Condition ($mediatorDecisionAsUser.StatusCode -eq 403) -Description "A party to the dispute CANNOT record the mediator decision themselves" -Details "status=$($mediatorDecisionAsUser.StatusCode)"

    $mediatorDecision = Invoke-Api -Method POST -Path "/disputes/$mileageDisputeId/mediator-decision" -Body @{ decisionSummary = "Reviewed odometer photos; discrepancy was within normal tolerance, no fault found." } -Token $adminToken
    Assert-Field -Object $mediatorDecision.Body -FieldPath "status" -Expected "resolved_mediator" -Context "Mediator resolves dispute"

    # --- Case C: a third dispute escalated all the way to arbitration ---
    $tripId3 = [guid]::NewGuid().ToString()
    $arbDispute = Invoke-Api -Method POST -Path "/disputes" -Body @{ tripId = $tripId3; disputeType = "billing" } -Token $ownerToken
    $arbDisputeId = $arbDispute.Body.id
    $handoff = Invoke-Api -Method POST -Path "/disputes/$arbDisputeId/arbitration-handoff" -Token $adminToken
    Assert-Field -Object $handoff.Body -FieldPath "tier" -Expected "arbitration" -Context "Dispute handed off to arbitration"

    $mediatorDecisionAfterArb = Invoke-Api -Method POST -Path "/disputes/$arbDisputeId/mediator-decision" -Body @{ decisionSummary = "Should be rejected -- already in arbitration" } -Token $adminToken
    Assert -Condition ($mediatorDecisionAfterArb.StatusCode -eq 400) -Description "Mediator decision is rejected once a dispute is in arbitration" -Details "status=$($mediatorDecisionAfterArb.StatusCode)"

    # --- Case D: a fourth, deliberately UNRESOLVED mediator-tier dispute, left open for the
    #     Admin & Operations "dispute mediator workbench" assertion in section 12. ---
    $tripId4 = [guid]::NewGuid().ToString()
    $workbenchDispute = Invoke-Api -Method POST -Path "/disputes" -Body @{ tripId = $tripId4; disputeType = "cleanliness" } -Token $renterToken
    $Script:WorkbenchDisputeId = $workbenchDispute.Body.id
    Assert-Field -Object $workbenchDispute.Body -FieldPath "tier" -Expected "mediator_review" -Context "Fixture dispute left open for moderation workbench check"
} else {
    Skip-Test "Mediator decision / arbitration handoff" "requires seeded admin/staff tokens"
}

$timeline = Invoke-Api -Method GET -Path "/disputes/$damageDisputeId/timeline" -Token $ownerToken
Assert-FieldNotNull -Object $timeline.Body -FieldPath "id" -Context "Get dispute timeline"

# ============================================================================
# 11. PRICING ENGINE
# ============================================================================
Write-Section "11. PRICING ENGINE"

$priceSuggestion = Invoke-Api -Method POST -Path "/pricing/suggestions" -Body @{ listingId = $listingId } -Token $ownerToken
Assert-NumberGreaterThan -Object $priceSuggestion.Body -FieldPath "suggestedPriceCents" -Threshold 0 -Context "Price suggestion"

$comparables = Invoke-Api -Method GET -Path "/pricing/comparables?region=default" -Token $ownerToken
Assert-IsArray -Object $comparables.Body -Context "Comparables"

$earnings = Invoke-Api -Method POST -Path "/pricing/earnings-breakdown" -Body @{ tripId = $tripId; grossTripPriceCents = 10000 } -Token $ownerToken
$expectedPlatformFee = [math]::Round(10000 * 1500 / 10000)
$expectedNet = 10000 - $expectedPlatformFee - $quotedPriceCents
Assert-Field -Object $earnings.Body -FieldPath "platformFeeCents" -Expected $expectedPlatformFee -Context "Earnings breakdown platform fee (15%)"
Assert-Field -Object $earnings.Body -FieldPath "insuranceCostCents" -Expected $quotedPriceCents -Context "Earnings breakdown picks up the real insurance quote for this trip"
Assert-Field -Object $earnings.Body -FieldPath "ownerNetCents" -Expected $expectedNet -Context "Earnings breakdown owner net = gross - fee - insurance"

$idleRecs = Invoke-Api -Method GET -Path "/pricing/idle-recommendations/$ownerId" -Token $ownerToken
Assert-IsArray -Object $idleRecs.Body -Context "Idle inventory recommendations" -MinLength 1

$cancelRisk = Invoke-Api -Method GET -Path "/pricing/cancellation-risk/$tripId" -Token $ownerToken
Assert-FieldNotNull -Object $cancelRisk.Body -FieldPath "riskScore" -Context "Cancellation risk score"

$surgeCapAsUser = Invoke-Api -Method POST -Path "/pricing/surge-caps" -Body @{ marketRegion = "sf-bay"; maxMultiplierBasisPoints = 250 } -Token $ownerToken
Assert -Condition ($surgeCapAsUser.StatusCode -eq 403) -Description "Ordinary user CANNOT set surge caps (admin only)" -Details "status=$($surgeCapAsUser.StatusCode)"

if ($AdminAvailable) {
    $surgeCap = Invoke-Api -Method POST -Path "/pricing/surge-caps" -Body @{ marketRegion = "sf-bay"; maxMultiplierBasisPoints = 250 } -Token $adminToken
    Assert-Field -Object $surgeCap.Body -FieldPath "maxMultiplier" -Expected 2.5 -Context "Admin sets surge cap (250bps -> 2.5x)"
} else {
    Skip-Test "Set surge cap" "requires seeded admin token"
}

# ============================================================================
# 12. LOGISTICS & FLEET
# ============================================================================
Write-Section "12. LOGISTICS & FLEET"

$deliveryReq = Invoke-Api -Method POST -Path "/logistics/delivery-requests" -Body @{ tripId = $tripId; dropoffLocation = @{ lat = 37.77; lng = -122.41; address = "123 Smoke Test St" }; feeCents = 1500 } -Token $renterToken
Assert-Field -Object $deliveryReq.Body -FieldPath "status" -Expected "requested" -Context "Request delivery"
$deliveryReqId = $deliveryReq.Body.id

$getDelivery = Invoke-Api -Method GET -Path "/logistics/delivery-requests/$deliveryReqId" -Token $renterToken
Assert-Field -Object $getDelivery.Body -FieldPath "feeCents" -Expected 1500 -Context "Get delivery request"

$assignDelivery = Invoke-Api -Method PUT -Path "/logistics/delivery-requests/$deliveryReqId/assign" -Body @{ assignedTo = "owner" } -Token $ownerToken
Assert-Field -Object $assignDelivery.Body -FieldPath "status" -Expected "assigned" -Context "Assign delivery to owner"

$redistribution = Invoke-Api -Method POST -Path "/logistics/fleet/$ownerId/redistribution-suggestions" -Token $ownerToken
Assert-IsArray -Object $redistribution.Body -Context "Fleet redistribution suggestions (may legitimately be empty -- heuristic threshold)"

$bulkAsRenter = Invoke-Api -Method POST -Path "/logistics/fleet/$ownerId/bulk-listings" -Body @{ listings = @(@{ vehicleId = $vehicleId; basePriceCents = 6000 }) } -Token $renterToken
Assert -Condition ($bulkAsRenter.StatusCode -eq 403) -Description "Non-owner CANNOT bulk-create listings for someone else's vehicle" -Details "status=$($bulkAsRenter.StatusCode)"

$bulkListings = Invoke-Api -Method POST -Path "/logistics/fleet/$ownerId/bulk-listings" -Body @{ listings = @(@{ vehicleId = $vehicleId; basePriceCents = 6000 }) } -Token $ownerToken
Assert-IsArray -Object $bulkListings.Body -Context "Bulk-create listings" -MinLength 1

$calendarSync = Invoke-Api -Method PUT -Path "/logistics/fleet/$ownerId/calendar-sync" -Token $ownerToken
Assert-FieldNotNull -Object $calendarSync.Body -FieldPath "synced" -Context "Calendar sync"

$maintenanceHold = Invoke-Api -Method POST -Path "/logistics/fleet/$ownerId/maintenance-schedule" -Body @{
    vehicleId = $vehicleId; reason = "scheduled_service"; startDate = (Get-Date).ToString("yyyy-MM-dd"); endDate = (Get-Date).AddDays(2).ToString("yyyy-MM-dd")
} -Token $ownerToken
Assert-Field -Object $maintenanceHold.Body -FieldPath "reason" -Expected "scheduled_service" -Context "Create maintenance hold"

# ============================================================================
# 13. REVIEWS & REPUTATION
# ============================================================================
Write-Section "13. REVIEWS & REPUTATION"

$review1 = Invoke-Api -Method POST -Path "/reviews" -Body @{ tripId = $tripId; subjectUserId = $renterId; rating = 5; comment = "Great renter, smooth trip." } -Token $ownerToken
Assert-Status -Response $review1 -Expected @(200,201) -Context "Owner reviews renter"
$review1Id = $review1.Body.id

$viewOwnReview = Invoke-Api -Method GET -Path "/reviews/$tripId" -Token $ownerToken
$mine = $viewOwnReview.Body | Where-Object { $_.id -eq $review1Id }
Assert-Field -Object $mine -FieldPath "rating" -Expected 5 -Context "Author can see their own unrevealed review content"

$viewAsCounterpart = Invoke-Api -Method GET -Path "/reviews/$tripId" -Token $renterToken
$masked = $viewAsCounterpart.Body | Where-Object { $_.id -eq $review1Id }
Assert-FieldNull -Object $masked -FieldPath "rating" -Context "Counterpart CANNOT see review content before submitting their own (blind review)"
Assert-Field -Object $masked -FieldPath "visibility" -Expected "hidden_pending_counterpart" -Context "Masked review still reports its visibility state"

$duplicateReview = Invoke-Api -Method POST -Path "/reviews" -Body @{ tripId = $tripId; subjectUserId = $renterId; rating = 1; comment = "trying to review twice" } -Token $ownerToken
Assert -Condition ($duplicateReview.StatusCode -eq 400) -Description "Author cannot submit a second review for the same trip" -Details "status=$($duplicateReview.StatusCode)"

$review2 = Invoke-Api -Method POST -Path "/reviews" -Body @{ tripId = $tripId; subjectUserId = $ownerId; rating = 4; comment = "Good owner, smooth pickup." } -Token $renterToken
Assert-Status -Response $review2 -Expected @(200,201) -Context "Renter reviews owner (completes the pair -> should reveal both)"
Assert-Field -Object $review2.Body -FieldPath "visibility" -Expected "visible" -Context "Second review's own response reflects the just-triggered reveal"

$viewAfterReveal = Invoke-Api -Method GET -Path "/reviews/$tripId" -Token $renterToken
$revealed = $viewAfterReveal.Body | Where-Object { $_.id -eq $review1Id }
Assert-Field -Object $revealed -FieldPath "rating" -Expected 5 -Context "Original review is now visible to the counterpart after both sides submitted"
Assert-Field -Object $revealed -FieldPath "visibility" -Expected "visible" -Context "Original review's visibility flips to visible"

$userHistory = Invoke-Api -Method GET -Path "/reviews/users/$renterId" -Token $ownerToken
Assert-NumberGreaterThan -Object $userHistory.Body -FieldPath "reviewCount" -Threshold 0 -Context "Renter's aggregated review history"

$attachMedia = Invoke-Api -Method POST -Path "/reviews/$review1Id/media" -Body @{ mediaRefs = @("interior_photo.jpg") } -Token $ownerToken
$mediaOk = ($attachMedia.Body.mediaRefs -contains "interior_photo.jpg")
Assert -Condition $mediaOk -Description "Attach media to a review" -Details "mediaRefs=$(Format-Compact $attachMedia.Body.mediaRefs)"

$badges = Invoke-Api -Method GET -Path "/badges/users/$renterId" -Token $renterToken
Assert-IsArray -Object $badges.Body -Context "Get badges (likely empty -- under the 10-trip threshold)"

if ($AdminAvailable -and $serviceToken) {
    $badgeEvalAsUser = Invoke-Api -Method POST -Path "/badges/evaluate" -Body @{ userId = $renterId } -Token $renterToken
    Assert -Condition ($badgeEvalAsUser.StatusCode -eq 403) -Description "Ordinary user CANNOT trigger their own badge evaluation (service only)" -Details "status=$($badgeEvalAsUser.StatusCode)"

    $badgeEval = Invoke-Api -Method POST -Path "/badges/evaluate" -Body @{ userId = $renterId } -Token $serviceToken
    Assert-Field -Object $badgeEval.Body -FieldPath "eligible" -Expected $false -Context "Badge evaluation correctly reports not-yet-eligible (below trip threshold)"
} else {
    Skip-Test "Badge evaluation" "requires seeded admin/service token"
}

# ============================================================================
# 14. ADMIN & OPERATIONS (13th domain)
# ============================================================================
Write-Section "14. ADMIN & OPERATIONS"

if (-not $AdminAvailable) {
    Skip-Test "ALL Admin & Operations assertions (staff, users-admin, assessments, monitoring, moderation, reporting, config, incidents)" `
        "Seeded admin login failed at the top of this script. Run 'npm run seed' and re-run this smoke test."
} else {

    Write-SubSection "Staff & Permissions"
    $supportEmail = New-TestEmail "support"
    $arbEmail = New-TestEmail "arb"

    $createSupport = Invoke-Api -Method POST -Path "/admin/staff/accounts" -Body @{ email = $supportEmail; password = $password; role = "support_agent" } -Token $adminToken
    Assert-Field -Object $createSupport.Body -FieldPath "role" -Expected "support_agent" -Context "Admin creates support_agent account"
    $supportId = $createSupport.Body.id
    $supportToken = (Invoke-Api -Method POST -Path "/auth/login" -Body @{ email = $supportEmail; password = $password }).Body.accessToken

    $createArb = Invoke-Api -Method POST -Path "/admin/staff/accounts" -Body @{ email = $arbEmail; password = $password; role = "arbitrator" } -Token $adminToken
    Assert-Field -Object $createArb.Body -FieldPath "role" -Expected "arbitrator" -Context "Admin creates arbitrator account"
    $arbitratorToken = (Invoke-Api -Method POST -Path "/auth/login" -Body @{ email = $arbEmail; password = $password }).Body.accessToken

    $createUserRoleStaff = Invoke-Api -Method POST -Path "/admin/staff/accounts" -Body @{ email = (New-TestEmail "bad"); password = $password; role = "user" } -Token $adminToken
    Assert -Condition ($createUserRoleStaff.StatusCode -eq 400) -Description "Cannot create a plain 'user' role via the staff-account endpoint" -Details "status=$($createUserRoleStaff.StatusCode)"

    $createStaffAsOwner = Invoke-Api -Method POST -Path "/admin/staff/accounts" -Body @{ email = (New-TestEmail "sneaky"); password = $password; role = "admin" } -Token $ownerToken
    Assert -Condition ($createStaffAsOwner.StatusCode -eq 403) -Description "Ordinary user CANNOT create staff accounts (not even attempting self-promotion)" -Details "status=$($createStaffAsOwner.StatusCode)"

    $listStaff = Invoke-Api -Method GET -Path "/admin/staff/accounts" -Token $adminToken
    Assert-IsArray -Object $listStaff.Body -Context "List staff accounts" -MinLength 2

    $adminPerms = Invoke-Api -Method GET -Path "/admin/staff/accounts/$adminId/permissions" -Token $adminToken
    Assert -Condition (@($adminPerms.Body).Count -eq 11) -Description "Seeded admin holds exactly all 11 capabilities" -Details "count=$(@($adminPerms.Body).Count); body=$(Format-Compact $adminPerms.Body)"

    $grantToNonStaff = Invoke-Api -Method POST -Path "/admin/staff/accounts/$ownerId/permissions/resolve_disputes" -Token $adminToken
    Assert -Condition ($grantToNonStaff.StatusCode -eq 400) -Description "Cannot grant a managerial capability to a plain 'user' account" -Details "status=$($grantToNonStaff.StatusCode)"

    $grantCap = Invoke-Api -Method POST -Path "/admin/staff/accounts/$supportId/permissions/resolve_disputes" -Token $adminToken
    Assert-Field -Object $grantCap.Body -FieldPath "capability" -Expected "resolve_disputes" -Context "Grant a capability to support agent"

    $revokeCap = Invoke-Api -Method POST -Path "/admin/staff/accounts/$supportId/permissions/resolve_disputes/revoke" -Body @{ reason = "Smoke test: validating grant/revoke round-trip." } -Token $adminToken
    Assert-FieldNotNull -Object $revokeCap.Body -FieldPath "revokedAt" -Context "Revoke a capability"

    $permsAfterRevoke = Invoke-Api -Method GET -Path "/admin/staff/accounts/$supportId/permissions" -Token $adminToken
    $stillHasIt = @($permsAfterRevoke.Body) | Where-Object { $_.capability -eq 'resolve_disputes' }
    Assert -Condition ($null -eq $stillHasIt) -Description "Revoked capability no longer appears in active permission list" -Details "body=$(Format-Compact $permsAfterRevoke.Body)"

    $impersonateShortReason = Invoke-Api -Method POST -Path "/admin/staff/impersonation/start" -Body @{ targetUserId = $ownerId; reason = "short" } -Token $adminToken
    Assert -Condition ($impersonateShortReason.StatusCode -eq 400) -Description "Impersonation with insufficient reason is rejected" -Details "status=$($impersonateShortReason.StatusCode)"

    $impersonate = Invoke-Api -Method POST -Path "/admin/staff/impersonation/start" -Body @{ targetUserId = $ownerId; reason = "Investigating a support ticket about a listing issue (smoke test)." } -Token $adminToken
    Assert-FieldNotNull -Object $impersonate.Body -FieldPath "startedAt" -Context "Start impersonation session"
    $sessionId = $impersonate.Body.id

    $endImpersonateWrongStaff = Invoke-Api -Method POST -Path "/admin/staff/impersonation/$sessionId/end" -Token $supportToken
    Assert -Condition ($endImpersonateWrongStaff.StatusCode -eq 403) -Description "A different staff member CANNOT end someone else's impersonation session" -Details "status=$($endImpersonateWrongStaff.StatusCode)"

    $endImpersonate = Invoke-Api -Method POST -Path "/admin/staff/impersonation/$sessionId/end" -Token $adminToken
    Assert-FieldNotNull -Object $endImpersonate.Body -FieldPath "endedAt" -Context "Originating staff member ends their own impersonation session"

    $listImpersonation = Invoke-Api -Method GET -Path "/admin/staff/impersonation" -Token $adminToken
    Assert-IsArray -Object $listImpersonation.Body -Context "List impersonation sessions" -MinLength 1

    Write-SubSection "User & Vehicle Admin"
    $profile = Invoke-Api -Method GET -Path "/admin/users/$ownerId/profile" -Token $adminToken
    Assert-Field -Object $profile.Body -FieldPath "user.email" -Expected $ownerEmail -Context "Consolidated profile matches owner"
    Assert -Condition ($profile.Body.vehiclesOwned -ge 1) -Description "Consolidated profile reports vehicle ownership" -Details "vehiclesOwned=$($profile.Body.vehiclesOwned)"

    $profileAsOwner = Invoke-Api -Method GET -Path "/admin/users/$ownerId/profile" -Token $ownerToken
    Assert -Condition ($profileAsOwner.StatusCode -eq 403) -Description "Ordinary user CANNOT view the admin consolidated-profile endpoint (even their own)" -Details "status=$($profileAsOwner.StatusCode)"

    $overrideScore = Invoke-Api -Method POST -Path "/admin/users/$ownerId/trust-score/override" -Body @{ newScore = 750; reason = "Smoke test manual override to validate audit trail." } -Token $adminToken
    Assert-Field -Object $overrideScore.Body -FieldPath "overallScore" -Expected 750 -Context "Manually override trust score"

    $scoreAfterOverride = Invoke-Api -Method GET -Path "/trust/users/$ownerId/score" -Token $ownerToken
    Assert-Field -Object $scoreAfterOverride.Body -FieldPath "overallScore" -Expected 750 -Context "Override persisted and visible via the Trust Score service"

    $suspend = Invoke-Api -Method POST -Path "/admin/users/$renterId/suspend" -Body @{ reason = "Smoke test suspension." } -Token $adminToken
    Assert-FieldNotNull -Object $suspend.Body -FieldPath "suspendedBy" -Context "Suspend user"

    $doubleSuspend = Invoke-Api -Method POST -Path "/admin/users/$renterId/suspend" -Body @{ reason = "Should fail -- already suspended" } -Token $adminToken
    Assert -Condition ($doubleSuspend.StatusCode -eq 400) -Description "Cannot suspend an already-suspended user" -Details "status=$($doubleSuspend.StatusCode)"

    $profileWhileSuspended = Invoke-Api -Method GET -Path "/admin/users/$renterId/profile" -Token $adminToken
    Assert-Field -Object $profileWhileSuspended.Body -FieldPath "suspended" -Expected $true -Context "Consolidated profile reflects active suspension"

    $unsuspend = Invoke-Api -Method POST -Path "/admin/users/$renterId/unsuspend" -Token $adminToken
    Assert-FieldNotNull -Object $unsuspend.Body -FieldPath "liftedAt" -Context "Unsuspend user"

    $doubleUnsuspend = Invoke-Api -Method POST -Path "/admin/users/$renterId/unsuspend" -Token $adminToken
    Assert -Condition ($doubleUnsuspend.StatusCode -eq 400) -Description "Cannot unsuspend a user who isn't currently suspended" -Details "status=$($doubleUnsuspend.StatusCode)"

    $forceReverify = Invoke-Api -Method POST -Path "/admin/users/$ownerId/force-reverification" -Token $adminToken
    Assert-Field -Object $forceReverify.Body -FieldPath "status" -Expected "reverification_forced" -Context "Force re-verification"

    $suspendVehicle = Invoke-Api -Method POST -Path "/admin/users/vehicles/$vehicleId/suspend" -Body @{ reason = "Smoke test vehicle suspension." } -Token $adminToken
    Assert-FieldNotNull -Object $suspendVehicle.Body -FieldPath "suspendedBy" -Context "Suspend vehicle"

    $vehicleAfterSuspend = Invoke-Api -Method GET -Path "/vehicles/$vehicleId" -Token $ownerToken
    Assert-Field -Object $vehicleAfterSuspend.Body -FieldPath "status" -Expected "suspended" -Context "Vehicle status reflects suspension"

    $thresholdOverride = Invoke-Api -Method POST -Path "/admin/users/listings/$listingId/threshold-override" -Body @{ minimumScore = 500; minimumTier = "standard"; reason = "Smoke test threshold override." } -Token $adminToken
    Assert-Field -Object $thresholdOverride.Body -FieldPath "minimumScore" -Expected 500 -Context "Override listing trust threshold"

    Write-SubSection "Assessments"
    $userRisk = Invoke-Api -Method GET -Path "/admin/assessments/user-risk" -Token $adminToken
    Assert-IsArray -Object $userRisk.Body.trustTierDistribution -Context "User risk assessment: tier distribution"

    $vehicleQuality = Invoke-Api -Method GET -Path "/admin/assessments/vehicle-quality/$vehicleId" -Token $adminToken
    Assert -Condition ($vehicleQuality.Body.conditionBaselineCount -ge 1) -Description "Vehicle quality assessment counts condition baselines" -Details "count=$($vehicleQuality.Body.conditionBaselineCount)"

    $scorecard = Invoke-Api -Method GET -Path "/admin/assessments/performance-scorecard/$ownerId" -Token $adminToken
    Assert-Field -Object $scorecard.Body -FieldPath "userId" -Expected $ownerId -Context "Performance scorecard"

    $financialHealth = Invoke-Api -Method GET -Path "/admin/assessments/financial-health" -Token $adminToken
    Assert-IsArray -Object $financialHealth.Body.ledgerTotalsByType -Context "Financial health (requires view_financials capability)"

    $financialHealthAsSupport = Invoke-Api -Method GET -Path "/admin/assessments/financial-health" -Token $supportToken
    Assert -Condition ($financialHealthAsSupport.StatusCode -eq 403) -Description "Support agent WITHOUT view_financials capability is blocked" -Details "status=$($financialHealthAsSupport.StatusCode)"

    $regionalMarket = Invoke-Api -Method GET -Path "/admin/assessments/regional-market" -Token $adminToken
    Assert -Condition ($null -ne $regionalMarket.Body.activeListings) -Description "Regional market assessment returns activeListings" -Details "body=$(Format-Compact $regionalMarket.Body)"

    $compliance = Invoke-Api -Method GET -Path "/admin/assessments/compliance" -Token $adminToken
    Assert-FieldNotNull -Object $compliance.Body -FieldPath "openDataLifecycleRequests" -Context "Compliance assessment"

    $vendorIntegrations = Invoke-Api -Method GET -Path "/admin/assessments/vendor-integrations" -Token $adminToken
    Assert -Condition (@($vendorIntegrations.Body).Count -eq 10) -Description "Vendor integration assessment reports all 10 tracked vendors" -Details "count=$(@($vendorIntegrations.Body).Count)"
    $allMocked = -not (@($vendorIntegrations.Body) | Where-Object { $_.mode -ne 'mock' })
    Assert -Condition $allMocked -Description "All vendor integrations correctly report 'mock' mode in this environment" -Details "body=$(Format-Compact $vendorIntegrations.Body)"

    Write-SubSection "Monitoring"
    $fraudFeed = Invoke-Api -Method GET -Path "/admin/monitoring/fraud" -Token $adminToken
    Assert-Field -Object $fraudFeed.Body -FieldPath "windowHours" -Expected 24 -Context "Fraud monitoring feed"

    $disputeFeed = Invoke-Api -Method GET -Path "/admin/monitoring/disputes" -Token $adminToken
    Assert-IsArray -Object $disputeFeed.Body.byTierAndStatus -Context "Dispute monitoring feed"

    $fleetFeed = Invoke-Api -Method GET -Path "/admin/monitoring/fleet-access" -Token $adminToken
    Assert-FieldNotNull -Object $fleetFeed.Body -FieldPath "activeDigitalKeys" -Context "Fleet/access monitoring feed"

    $paymentsFeed = Invoke-Api -Method GET -Path "/admin/monitoring/payments" -Token $adminToken
    Assert-FieldNotNull -Object $paymentsFeed.Body -FieldPath "depositsCurrentlyHeld" -Context "Payments monitoring feed"

    $insuranceFeed = Invoke-Api -Method GET -Path "/admin/monitoring/insurance-claims" -Token $adminToken
    Assert-IsArray -Object $insuranceFeed.Body.claimsByStatus -Context "Insurance claims monitoring feed"

    $systemHealth = Invoke-Api -Method GET -Path "/admin/monitoring/system-health" -Token $adminToken
    Assert-Field -Object $systemHealth.Body -FieldPath "status" -Expected "ok" -Context "System health feed"

    $trustTrends = Invoke-Api -Method GET -Path "/admin/monitoring/trust-trends" -Token $adminToken
    Assert-IsArray -Object $trustTrends.Body.tierDistribution -Context "Trust trends feed"

    $monitoringAsOwner = Invoke-Api -Method GET -Path "/admin/monitoring/fraud" -Token $ownerToken
    Assert -Condition ($monitoringAsOwner.StatusCode -eq 403) -Description "Ordinary user CANNOT access monitoring feeds" -Details "status=$($monitoringAsOwner.StatusCode)"

    Write-SubSection "Moderation"
    $flagItem = Invoke-Api -Method POST -Path "/admin/moderation/flag" -Body @{ itemType = "review"; itemId = $review1Id; flaggedReason = "Smoke test: suspected retaliatory content." } -Token $adminToken
    Assert-Field -Object $flagItem.Body -FieldPath "status" -Expected "pending" -Context "Flag a review for moderation"
    $moderationItemId = $flagItem.Body.id

    $queue = Invoke-Api -Method GET -Path "/admin/moderation/queue?status=pending" -Token $adminToken
    $inQueue = @($queue.Body) | Where-Object { $_.id -eq $moderationItemId }
    Assert -Condition ($null -ne $inQueue) -Description "Flagged item appears in the pending moderation queue" -Details "queue=$(Format-Compact $queue.Body)"

    $resolveItem = Invoke-Api -Method POST -Path "/admin/moderation/queue/$moderationItemId/resolve" -Body @{ status = "approved"; reason = "Smoke test: reviewed and found compliant." } -Token $adminToken
    Assert-Field -Object $resolveItem.Body -FieldPath "status" -Expected "approved" -Context "Resolve moderation queue item"
    Assert-FieldNotNull -Object $resolveItem.Body -FieldPath "resolvedBy" -Context "Resolution records the resolving staff member"

    $fraudTriage = Invoke-Api -Method GET -Path "/admin/moderation/fraud-triage-queue" -Token $adminToken
    Assert-IsArray -Object $fraudTriage.Body -Context "Fraud triage queue"

    $workbench = Invoke-Api -Method GET -Path "/admin/moderation/dispute-mediator-workbench" -Token $adminToken
    $workbenchHasFixture = @($workbench.Body) | Where-Object { $_.id -eq $Script:WorkbenchDisputeId }
    Assert -Condition ($null -ne $workbenchHasFixture) -Description "Dispute mediator workbench includes the still-open fixture dispute from section 10" -Details "workbench=$(Format-Compact $workbench.Body)"

    $moderationAsOwner = Invoke-Api -Method GET -Path "/admin/moderation/queue" -Token $ownerToken
    Assert -Condition ($moderationAsOwner.StatusCode -eq 403) -Description "Ordinary user CANNOT access the moderation queue" -Details "status=$($moderationAsOwner.StatusCode)"

    Write-SubSection "Reporting"
    $startDate = (Get-Date).AddDays(-1).ToString("yyyy-MM-dd")
    $endDate = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")

    $revenue = Invoke-Api -Method GET -Path "/admin/reporting/revenue?startDate=$startDate&endDate=$endDate" -Token $adminToken
    Assert -Condition ($revenue.Body.entryCount -ge 1) -Description "Revenue report captures ledger entries created earlier in this run" -Details "entryCount=$($revenue.Body.entryCount)"

    $payoutRecon = Invoke-Api -Method GET -Path "/admin/reporting/payout-reconciliation?startDate=$startDate&endDate=$endDate" -Token $adminToken
    Assert-FieldNotNull -Object $payoutRecon.Body -FieldPath "payoutCount" -Context "Payout reconciliation report"

    $ownerEarnings = Invoke-Api -Method GET -Path "/admin/reporting/owner-earnings/$($ownerId)?year=$((Get-Date).Year)" -Token $adminToken
    Assert-Field -Object $ownerEarnings.Body -FieldPath "ownerId" -Expected $ownerId -Context "Owner earnings export"

    $insuranceAudit = Invoke-Api -Method GET -Path "/admin/reporting/insurance-pricing-audit/$tripId" -Token $adminToken
    Assert-Field -Object $insuranceAudit.Body -FieldPath "boundPolicy.tripId" -Expected $tripId -Context "Insurance pricing audit trail matches the bound policy from section 9"

    $gdprReport = Invoke-Api -Method GET -Path "/admin/reporting/gdpr-compliance?startDate=$startDate&endDate=$endDate" -Token $adminToken
    Assert -Condition ($gdprReport.Body.requestCount -ge 1) -Description "GDPR compliance report captures the export/delete requests from section 6" -Details "requestCount=$($gdprReport.Body.requestCount)"

    $auditLogQuery = Invoke-Api -Method GET -Path "/admin/reporting/audit-log?actorId=$adminId" -Token $adminToken
    Assert-IsArray -Object $auditLogQuery.Body -Context "Managerial audit-log query" -MinLength 1

    $revenueAsSupport = Invoke-Api -Method GET -Path "/admin/reporting/revenue?startDate=$startDate&endDate=$endDate" -Token $supportToken
    Assert -Condition ($revenueAsSupport.StatusCode -eq 403) -Description "Support agent CANNOT access financial reporting (admin-only controller)" -Details "status=$($revenueAsSupport.StatusCode)"

    Write-SubSection "Configuration"
    $setWeights = Invoke-Api -Method PUT -Path "/admin/config/settings/trust_score.weights" -Body @{ value = @{ verification = 0.4; tripHistory = 0.2; behavior = 0.2; disputes = 0.1; fraud = 0.1 } } -Token $adminToken
    Assert-Field -Object $setWeights.Body -FieldPath "value.verification" -Expected 0.4 -Context "Set Trust Score algorithm weights"

    $getWeights = Invoke-Api -Method GET -Path "/admin/config/settings/trust_score.weights" -Token $adminToken
    Assert-Field -Object $getWeights.Body -FieldPath "value.verification" -Expected 0.4 -Context "Get Trust Score algorithm weights"

    $listConfig = Invoke-Api -Method GET -Path "/admin/config/settings" -Token $adminToken
    Assert-IsArray -Object $listConfig.Body -Context "List all config settings" -MinLength 1

    $setFlag = Invoke-Api -Method PUT -Path "/admin/config/feature-flags/instant_book_enabled" -Body @{ enabled = $true; scopeRegion = "global"; description = "Smoke test flag" } -Token $adminToken
    Assert-Field -Object $setFlag.Body -FieldPath "enabled" -Expected $true -Context "Set feature flag"

    $getFlag = Invoke-Api -Method GET -Path "/admin/config/feature-flags/instant_book_enabled" -Token $adminToken
    Assert-Field -Object $getFlag.Body -FieldPath "enabled" -Expected $true -Context "Get feature flag"

    $listFlags = Invoke-Api -Method GET -Path "/admin/config/feature-flags" -Token $adminToken
    Assert-IsArray -Object $listFlags.Body -Context "List feature flags" -MinLength 1

    $configSurgeCap = Invoke-Api -Method PUT -Path "/admin/config/surge-caps/sf-bay" -Body @{ maxMultiplier = 3.0 } -Token $adminToken
    Assert-Field -Object $configSurgeCap.Body -FieldPath "maxMultiplier" -Expected 3 -Context "Config module overwrites the same surge-cap table used by the Pricing Engine"

    $configAsOwner = Invoke-Api -Method GET -Path "/admin/config/feature-flags" -Token $ownerToken
    Assert -Condition ($configAsOwner.StatusCode -eq 403) -Description "Ordinary user CANNOT read config settings" -Details "status=$($configAsOwner.StatusCode)"

    Write-SubSection "Incidents & Alerting"
    $createIncident = Invoke-Api -Method POST -Path "/admin/incidents" -Body @{
        title = "Smoke Test Incident"; severity = "p3"; description = "Synthetic incident created by the smoke test."; affectedServices = @("payments-escrow")
    } -Token $adminToken
    Assert-Field -Object $createIncident.Body -FieldPath "status" -Expected "open" -Context "Create incident"
    $incidentId = $createIncident.Body.id

    $listIncidents = Invoke-Api -Method GET -Path "/admin/incidents" -Token $adminToken
    $incidentFound = @($listIncidents.Body) | Where-Object { $_.id -eq $incidentId }
    Assert -Condition ($null -ne $incidentFound) -Description "Created incident appears in the incident list" -Details "list=$(Format-Compact $listIncidents.Body)"

    $getIncident = Invoke-Api -Method GET -Path "/admin/incidents/$incidentId" -Token $adminToken
    Assert-Field -Object $getIncident.Body -FieldPath "title" -Expected "Smoke Test Incident" -Context "Get incident by id"

    $resolveIncident = Invoke-Api -Method PUT -Path "/admin/incidents/$incidentId/status" -Body @{ status = "resolved" } -Token $adminToken
    Assert-FieldNotNull -Object $resolveIncident.Body -FieldPath "resolvedAt" -Context "Resolve incident sets resolvedAt"

    $createRule = Invoke-Api -Method POST -Path "/admin/incidents/alert-rules" -Body @{
        name = "Smoke Test Always-Fires Rule"; metric = "payments.auth_failures_24h"; comparator = "gte"; threshold = 0; notifyChannel = "#smoke-test"
    } -Token $adminToken
    Assert-Field -Object $createRule.Body -FieldPath "enabled" -Expected $true -Context "Create alert rule (deterministically always-firing: threshold 0, gte)"
    $ruleId = $createRule.Body.id

    $listRules = Invoke-Api -Method GET -Path "/admin/incidents/alert-rules/list" -Token $adminToken
    $ruleFound = @($listRules.Body) | Where-Object { $_.id -eq $ruleId }
    Assert -Condition ($null -ne $ruleFound) -Description "Created alert rule appears in the rule list" -Details "list=$(Format-Compact $listRules.Body)"

    $evaluate = Invoke-Api -Method POST -Path "/admin/incidents/alert-rules/evaluate" -Body @{ "payments.auth_failures_24h" = 0; "fraud.blocked_bookings_24h" = 0; "payments.payout_backlog" = 0; "disputes.sla_at_risk_count" = 0 } -Token $adminToken
    $fired = @($evaluate.Body.fired) | Where-Object { $_.alertRuleId -eq $ruleId }
    Assert -Condition ($null -ne $fired) -Description "Always-firing alert rule actually fires on evaluation" -Details "evaluate=$(Format-Compact $evaluate.Body)"

    $listFirings = Invoke-Api -Method GET -Path "/admin/incidents/alert-firings/list" -Token $adminToken
    Assert-IsArray -Object $listFirings.Body -Context "List alert firings" -MinLength 1
    $firingId = ($listFirings.Body | Select-Object -First 1).id

    $ackFiring = Invoke-Api -Method PUT -Path "/admin/incidents/alert-firings/$firingId/acknowledge" -Token $adminToken
    Assert-FieldNotNull -Object $ackFiring.Body -FieldPath "acknowledgedAt" -Context "Acknowledge alert firing"

    $toggleRule = Invoke-Api -Method PUT -Path "/admin/incidents/alert-rules/$ruleId/toggle" -Body @{ enabled = $false } -Token $adminToken
    Assert-Field -Object $toggleRule.Body -FieldPath "enabled" -Expected $false -Context "Disable alert rule"

    $incidentsAsSupport = Invoke-Api -Method POST -Path "/admin/incidents" -Body @{ title = "x"; severity = "p4"; description = "x"; affectedServices = @() } -Token $supportToken
    Assert -Condition ($incidentsAsSupport.StatusCode -eq 403) -Description "Support agent WITHOUT manage_incidents capability CANNOT create incidents" -Details "status=$($incidentsAsSupport.StatusCode)"

    $incidentsAsOwner = Invoke-Api -Method GET -Path "/admin/incidents" -Token $ownerToken
    Assert -Condition ($incidentsAsOwner.StatusCode -eq 403) -Description "Ordinary user CANNOT access incidents at all" -Details "status=$($incidentsAsOwner.StatusCode)"
}

# ============================================================================
# 15. COMPANY PROFILE
# ============================================================================
# Added per explicit product decision (verification-check follow-up, "company/
# business profile" gap). $ownerToken/$vehicleId are the same fixtures used
# throughout this script; a second, distinct vehicle is registered here so the
# assign/unassign checks don't disturb $vehicleId's state for any later section.
Write-Section "15. COMPANY PROFILE"

$companyOwnerVehicle = Invoke-Api -Method POST -Path "/vehicles" -Body @{ vin = "COMPANYVIN$([guid]::NewGuid().ToString('N').Substring(0,8))"; licensePlate = "COMPANY1" } -Token $ownerToken
$companyVehicleId = $companyOwnerVehicle.Body.id

$createCompanyAsRenter = Invoke-Api -Method POST -Path "/company-profiles" -Body @{ name = "Renter's Fleet Co" } -Token $renterToken
Assert-Status -Response $createCompanyAsRenter -Expected @(200,201) -Context "Renter can create their own company profile (any authenticated user may)"
$renterCompanyId = $createCompanyAsRenter.Body.id

$createCompany = Invoke-Api -Method POST -Path "/company-profiles" -Body @{ name = "Owner's Fleet Co"; description = "Smoke-test fleet." } -Token $ownerToken
Assert-Status -Response $createCompany -Expected @(200,201) -Context "Owner creates a company profile"
Assert-Field -Object $createCompany.Body -FieldPath "name" -Expected "Owner's Fleet Co" -Context "Company profile name persisted"
$companyProfileId = $createCompany.Body.id

$createCompanyDuplicate = Invoke-Api -Method POST -Path "/company-profiles" -Body @{ name = "Second Co" } -Token $ownerToken
Assert -Condition ($createCompanyDuplicate.StatusCode -eq 409) -Description "An account CANNOT create a second company profile" -Details "status=$($createCompanyDuplicate.StatusCode)"

$getMyCompany = Invoke-Api -Method GET -Path "/company-profiles/me" -Token $ownerToken
Assert-Field -Object $getMyCompany.Body -FieldPath "id" -Expected $companyProfileId -Context "GET /company-profiles/me returns the caller's own profile"

$assignAsRenter = Invoke-Api -Method POST -Path "/company-profiles/$companyProfileId/vehicles" -Body @{ vehicleId = $companyVehicleId } -Token $renterToken
Assert -Condition ($assignAsRenter.StatusCode -eq 403) -Description "Non-owner CANNOT assign a vehicle to someone else's company profile" -Details "status=$($assignAsRenter.StatusCode)"

$assignOthersVehicle = Invoke-Api -Method POST -Path "/company-profiles/$renterCompanyId/vehicles" -Body @{ vehicleId = $companyVehicleId } -Token $renterToken
Assert -Condition ($assignOthersVehicle.StatusCode -eq 403) -Description "Company profile owner CANNOT assign a vehicle they don't own, even to their own company profile" -Details "status=$($assignOthersVehicle.StatusCode)"

$assignVehicle = Invoke-Api -Method POST -Path "/company-profiles/$companyProfileId/vehicles" -Body @{ vehicleId = $companyVehicleId } -Token $ownerToken
Assert-Status -Response $assignVehicle -Expected @(200,201) -Context "Owner assigns their own vehicle to their own company profile"
Assert-Field -Object $assignVehicle.Body -FieldPath "companyProfileId" -Expected $companyProfileId -Context "Vehicle now carries the company profile id"

# Public: anonymous visitor browsing a company hub page. Uses `select`, not
# `include`, on the backend (see company-profile.service.ts) -- verify no
# sensitive vehicle field leaks through this public projection either.
$getCompanyPublic = Invoke-Api -Method GET -Path "/company-profiles/$companyProfileId"
Assert-Status -Response $getCompanyPublic -Expected @(200) -Context "Anonymous caller (no token) can read a company profile"
$companyVehicles = @($getCompanyPublic.Body.vehicles)
Assert -Condition ($companyVehicles.Count -ge 1) -Description "Company profile lists its assigned vehicle" -Details "count=$($companyVehicles.Count)"
Assert -Condition ($null -eq $companyVehicles[0].vin) -Description "Company profile's public vehicle list does NOT expose vin" -Details (Format-Compact $companyVehicles[0])
Assert -Condition ($null -eq $companyVehicles[0].ownerId) -Description "Company profile's public vehicle list does NOT expose ownerId" -Details (Format-Compact $companyVehicles[0])

$updateCompanyAsRenter = Invoke-Api -Method PUT -Path "/company-profiles/$companyProfileId" -Body @{ name = "Hijacked" } -Token $renterToken
Assert -Condition ($updateCompanyAsRenter.StatusCode -eq 403) -Description "Non-owner CANNOT update someone else's company profile" -Details "status=$($updateCompanyAsRenter.StatusCode)"

$unassignAsRenter = Invoke-Api -Method DELETE -Path "/company-profiles/$companyProfileId/vehicles/$companyVehicleId" -Token $renterToken
Assert -Condition ($unassignAsRenter.StatusCode -eq 403) -Description "Non-owner CANNOT unassign a vehicle from someone else's company profile" -Details "status=$($unassignAsRenter.StatusCode)"

$unassignVehicle = Invoke-Api -Method DELETE -Path "/company-profiles/$companyProfileId/vehicles/$companyVehicleId" -Token $ownerToken
Assert-Status -Response $unassignVehicle -Expected @(200,201) -Context "Owner unassigns their vehicle from their company profile"
Assert-FieldNull -Object $unassignVehicle.Body -FieldPath "companyProfileId" -Context "Vehicle no longer carries a company profile id"

# ============================================================================
# FINAL SUMMARY
# ============================================================================
Write-FinalSummary

if ($Script:FailCount -gt 0) {
    exit 1
} else {
    exit 0
}