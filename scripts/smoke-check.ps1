param(
  [string]$Api = 'https://gigsge-api-prgt7kqx2q-uc.a.run.app',
  [string]$Web = 'https://gigsge-web-prgt7kqx2q-uc.a.run.app'
)
$p = 0; $f = 0

try { $h = Invoke-RestMethod "$Api/health"; if ($h.status -eq 'ok') { Write-Host "PASS 1/6 API health"; $p++ } else { Write-Host "FAIL 1/6 health: $($h | ConvertTo-Json -Compress)"; $f++ } } catch { Write-Host "FAIL 1/6 health: $_"; $f++ }

try { $w = Invoke-WebRequest $Web -UseBasicParsing; if ($w.StatusCode -eq 200) { Write-Host "PASS 2/6 Web root HTTP 200"; $p++ } else { Write-Host "FAIL 2/6 web: HTTP $($w.StatusCode)"; $f++ } } catch { Write-Host "FAIL 2/6 web: $_"; $f++ }

# Intentional UAT demo credentials (same as scripts/smoke-check.sh), not real secrets
$token = $null
try {
  $login = Invoke-RestMethod -Method Post "$Api/api/v1/auth/login" -ContentType 'application/json' -Body '{"email":"poster1@uat.gigs.ge","password":"Uat-Demo-2026!"}'
  $token = $login.accessToken
  if ($token) { Write-Host "PASS 3/6 Login issued token"; $p++ } else { Write-Host "FAIL 3/6 login: no token in response"; $f++ }
} catch { Write-Host "FAIL 3/6 login: $_"; $f++ }

if ($token) {
  try {
    $me = Invoke-RestMethod "$Api/api/v1/auth/me" -Headers @{ Authorization = "Bearer $token" }
    $em = if ($me.user) { $me.user.email } else { $me.email }
    if ($em -eq 'poster1@uat.gigs.ge') { Write-Host "PASS 4/6 /auth/me email matches"; $p++ } else { Write-Host "FAIL 4/6 me: got '$em'"; $f++ }
  } catch { Write-Host "FAIL 4/6 me: $_"; $f++ }
} else { Write-Host "SKIP 4/6 (no token)" }

try { $g = Invoke-WebRequest "$Api/api/v1/gigs" -Headers @{ Authorization = "Bearer $token" } -UseBasicParsing; if ($g.StatusCode -eq 200) { Write-Host "PASS 5/6 Gigs list HTTP 200"; $p++ } else { Write-Host "FAIL 5/6 gigs: HTTP $($g.StatusCode)"; $f++ } } catch { Write-Host "FAIL 5/6 gigs: $_"; $f++ }

try { $r = Invoke-RestMethod "$Api/api/v1/regions"; $c = ($r | Measure-Object).Count; if ($c -gt 0) { Write-Host "PASS 6/6 Regions: $c loaded"; $p++ } else { Write-Host "FAIL 6/6 regions empty"; $f++ } } catch { Write-Host "FAIL 6/6 regions: $_"; $f++ }

Write-Host ""
Write-Host "RESULT: $p passed, $f failed"
if ($f -gt 0) { exit 1 } else { exit 0 }
