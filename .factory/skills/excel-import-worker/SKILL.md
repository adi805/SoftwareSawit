---
name: excel-import-worker
description: Excel import functionality for SoftwareSawit master data
---

# Excel Import Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE for Excel import functionality.

## When to Use This Skill

This worker handles Excel import features:
- Import Blok from aresta.xlsx
- Import COA from ASPEK KERJA & ORG & COA.xlsx
- Import Aspek Kerja with COA linkage
- Transform Excel columns to database fields
- Handle missing/null values gracefully
- Excel export with all columns

## Required Skills

- `mission-worker-base` - Standard worker setup
- `agent-browser` - UI verification

## Work Procedure

### 1. Setup Phase

1. Invoke `mission-worker-base` skill
2. Read `mission.md` for import requirements
3. Read `AGENTS.md` for conventions
4. Identify source Excel files:
   - `Lampiran/Master Data/aresta.xlsx` - Blok data
   - `Lampiran/Master Data/ASPEK KERJA & ORG & COA.xlsx` - COA & Aspek Kerja

### 2. Investigation Phase

1. **Read Excel source files** to understand column structure:
   ```
   aresta.xlsx columns: Blok, T.Tanam, Luas, Pokok, SPH, Status Tanaman 2026
   COA sheet columns: No. Akun, Nama Akun
   AK sheet columns: Kode Akun GL, Kode Aspek Kerja, Nama Aspek Kerja
   ```

2. **Read current import handlers:**
   - `src/renderer/components/ExcelImportModal.tsx`
   - `src/main/blokDatabase.ts` - Blok DB operations
   - `src/main/coaDatabase.ts` - COA DB operations
   - `src/main/aspekKerjaDatabase.ts` - Aspek Kerja DB operations

3. **Map column transformations:**
   - Identify mapping rules
   - Note any column name variations (spaces, trim)
   - Identify required vs optional fields

### 3. Implementation Phase

#### For Blok Import:

1. **Update transformData in ExcelImportModal:**
   ```typescript
   const transformData = (row: any): Partial<Blok> => {
     return {
       kode_blok: row['Blok']?.trim(),
       tahun_tanam: parseInt(row['T.Tanam']) || new Date().getFullYear(),
       luas: parseFloat(row['Luas']) || 0,
       pokok: parseInt(row['Pokok']) || null,
       sph: parseFloat(row['SPH']) || null,
       bulan_tanam: row['Bulan Tanam']?.trim() || null,
       status_tanaman: mapStatus(row['Status Tanaman 2026']), // Map to TM/TBM/TTM/TLS
     };
   };

   // Status mapping from Excel values to DB values
   const STATUS_MAP: Record<string, string> = {
     'TM': 'TM',
     'TBM': 'TBM',
     'TTM': 'TTM',
     'TLS': 'TLS',
     'Aktif': 'TM',
     'Dalam Perawatan': 'TBM',
   };
   ```

2. **Handle missing COA linkage:**
   - For import without COA, auto-generate or skip
   - Log warnings for missing linkages

3. **Update validation:**
   - Required fields: kode_blok, tahun_tanam, luas
   - Validate status values
   - Validate numeric fields

#### For Aspek Kerja Import:

1. **Update transformData for AK:**
   ```typescript
   const transformData = (row: any): Partial<AspekKerja> => {
     const coaKode = row['Kode Akun GL']?.trim();
     return {
       kode: row['Kode Aspek Kerja']?.trim(),
       nama: row['Nama Aspek Kerja']?.trim(),
       coa_id: resolveCoaId(coaKode), // Lookup COA by kode
       jenis: row['Jenis'] || 'Debit',
     };
   };
   ```

2. **Handle COA resolution:**
   ```typescript
   // Lookup COA by GL Account code
   const resolveCoaId = (kode: string): string | null => {
     const coa = db.prepare('SELECT id FROM coa WHERE kode = ?').get(kode);
     return coa?.id || null;
   };
   ```

### 4. Verification Phase

1. **Run typecheck and lint:**
   ```bash
   npm run typecheck
   npm run lint
   ```

2. **Test via agent-browser:**
   - Navigate to Blok list
   - Click Import button
   - Select aresta.xlsx
   - Verify import success
   - Check data appears in list

3. **Verify Excel export:**
   - Click Export button
   - Open exported file
   - Verify all 8 columns present

### 5. Completion Phase

1. Ensure all import flows work
2. Document column mappings
3. Prepare handoff

## Excel Column Mappings Reference

### aresta.xlsx (Blok)
| Excel Column | DB Field | Required | Transform |
|--------------|----------|----------|-----------|
| Blok | kode_blok | Yes | trim() |
| T.Tanam | tahun_tanam | Yes | parseInt |
| Luas | luas | Yes | parseFloat |
| Pokok | pokok | No | parseInt |
| SPH | sph | No | parseFloat |
| Status Tanaman 2026 | status_tanaman | No | mapStatus() |
| Bulan Tanam | bulan_tanam | No | trim() |

### ASPEK KERJA & ORG & COA.xlsx - COA Sheet
| Excel Column | DB Field | Required | Transform |
|--------------|----------|----------|-----------|
| No. Akun | kode | Yes | trim() |
| Nama Akun | nama | Yes | trim() |

### ASPEK KERJA & ORG & COA.xlsx - AK Sheet
| Excel Column | DB Field | Required | Transform |
|--------------|----------|----------|-----------|
| Kode Akun GL | coa_id | Yes | resolveCoaId() |
| Kode Aspek Kerja | kode | Yes | trim() |
| Nama Aspek Kerja | nama | Yes | trim() |
| Jenis | jenis | No | default 'Debit' |

## Error Handling

| Error | Handling |
|-------|----------|
| Missing required field | Skip row, log warning |
| Invalid status value | Use default 'TM' |
| COA not found | Log warning, set coa_id = null |
| Duplicate kode | Update existing record |
| Invalid numeric | Set to null |

## Example Handoff

```json
{
  "salientSummary": "Updated Excel import for Blok (aresta.xlsx) and Aspek Kerja with COA linkage.",
  "whatWasImplemented": "Added transformData for new columns, COA resolution for AK, status mapping.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {"command": "npm run typecheck", "exitCode": 0}
    ],
    "interactiveChecks": [
      {"action": "Import aresta.xlsx", "observed": "12 rows imported"},
      {"action": "Export Blok", "observed": "8 columns in Excel"}
    ]
  },
  "tests": {},
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- Import fails silently
- COA resolution not working
- Status mapping incomplete
- Requirements unclear
