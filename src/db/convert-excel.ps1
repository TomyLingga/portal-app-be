# Konversi users_2_FINAL_FIX_FIX_NOW_FORMAT.xlsx -> employee-data.json
# Menangani notasi ilmiah (nrk/nik/noHP) dan format tanggal
$ErrorActionPreference = 'Stop'
$xlsxPath = "D:\SMKAW02PDN\Laporan PKL\Project\SSO\users_2_FINAL_FIX_FIX_NOW_FORMAT.xlsx"
$jsonPath = "D:\SMKAW02PDN\Laporan PKL\Project\SSO\portal-app-be\src\db\employee-data.json"

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$wb = $excel.Workbooks.Open($xlsxPath)
$sheet = $wb.Sheets.Item(1)
$rows = $sheet.UsedRange.Rows.Count

# Lebarkan kolom agar .Text tidak mengembalikan "####" untuk angka besar
$sheet.Columns.Item(4).ColumnWidth  = 40   # noHP
$sheet.Columns.Item(11).ColumnWidth = 40   # nrk
$sheet.Columns.Item(12).ColumnWidth = 40   # nik
$sheet.Columns.Item(4).NumberFormat  = "0"           # noHP
$sheet.Columns.Item(11).NumberFormat = "0"           # nrk
$sheet.Columns.Item(12).NumberFormat = "0"           # nik
$sheet.Columns.Item(13).NumberFormat = "yyyy-mm-dd"  # tgl_masuk
$sheet.Columns.Item(15).NumberFormat = "yyyy-mm-dd"  # tgl_lahir

# Ambil nilai numerik penuh dari Value2 (bukan .Text yang bisa jadi "####")
function NumText($cell) {
  $v2 = $cell.Value2
  if ($null -eq $v2) { return $null }
  if ($v2 -is [double]) {
    if ($v2 -eq 0) { return $null }
    return [string]([long][math]::Round($v2))
  }
  $s = ([string]$v2).Trim()
  if ($s -eq '' -or $s -eq '-') { return $null }
  return $s
}

function Clean([string]$v) {
  if ($null -eq $v) { return $null }
  $t = $v.Trim()
  if ($t -eq '' -or $t -eq '-') { return $null }
  return $t
}

$list = New-Object System.Collections.ArrayList

for ($r = 2; $r -le $rows; $r++) {
  $name = $sheet.Cells.Item($r, 2).Text
  if (-not $name -or $name.Trim() -eq '') { continue }

  $idText = $sheet.Cells.Item($r, 1).Text
  $id = $null
  if ($idText -and $idText.Trim() -ne '') { $id = [int]$idText.Trim() }

  $obj = [ordered]@{
    id               = $id
    name             = $name.Trim()
    email            = Clean $sheet.Cells.Item($r, 3).Text
    noHP             = NumText $sheet.Cells.Item($r, 4)
    jabatan          = Clean $sheet.Cells.Item($r, 5).Text
    parent           = Clean $sheet.Cells.Item($r, 6).Text
    bagian           = Clean $sheet.Cells.Item($r, 7).Text
    subBagian        = Clean $sheet.Cells.Item($r, 8).Text
    seksi            = Clean $sheet.Cells.Item($r, 9).Text
    grade            = Clean $sheet.Cells.Item($r, 10).Text
    nrk              = NumText $sheet.Cells.Item($r, 11)
    nik              = NumText $sheet.Cells.Item($r, 12)
    tglMasuk         = Clean $sheet.Cells.Item($r, 13).Text
    tempatLahir      = Clean $sheet.Cells.Item($r, 14).Text
    tglLahir         = Clean $sheet.Cells.Item($r, 15).Text
    kelamin          = Clean $sheet.Cells.Item($r, 16).Text
    statusKaryawan   = Clean $sheet.Cells.Item($r, 17).Text
    pendidikan       = Clean $sheet.Cells.Item($r, 18).Text
    agama            = Clean $sheet.Cells.Item($r, 19).Text
    penempatan       = Clean $sheet.Cells.Item($r, 20).Text
    statusPerkawinan = Clean $sheet.Cells.Item($r, 21).Text
    alamatKtp        = Clean $sheet.Cells.Item($r, 22).Text
    alamatDomisili   = Clean $sheet.Cells.Item($r, 23).Text
  }
  [void]$list.Add([pscustomobject]$obj)
}

$wb.Close($false)
$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($sheet) | Out-Null
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($wb) | Out-Null
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null

$json = $list | ConvertTo-Json -Depth 4
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($jsonPath, $json, $utf8NoBom)

Write-Host "OK: $($list.Count) employees ditulis ke employee-data.json"
