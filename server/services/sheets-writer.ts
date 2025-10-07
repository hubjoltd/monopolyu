import { googleAuth } from './auth';

// Normalize header names for matching
function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '');
}

interface SheetInfo {
  spreadsheetId: string;
  sheetName: string;
  headers: string[];
}

export async function getSheetHeaders(spreadsheetUrl: string): Promise<SheetInfo> {
  try {
    // Extract spreadsheet ID from URL
    const urlObj = new URL(spreadsheetUrl);
    const pathMatch = urlObj.pathname.match(/\/spreadsheets\/d\/(?:e\/)?([a-zA-Z0-9-_]+)/);
    
    if (!pathMatch) {
      throw new Error("Invalid Google Sheets URL");
    }
    
    const spreadsheetId = pathMatch[1];
    const accessToken = await googleAuth.getAccessToken();
    
    // Get spreadsheet metadata to find the first sheet name
    const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
    const metadataResponse = await fetch(metadataUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    
    if (!metadataResponse.ok) {
      throw new Error(`Failed to access spreadsheet. Make sure it's shared with the service account: ${await metadataResponse.text()}`);
    }
    
    const metadata = await metadataResponse.json();
    const sheetName = metadata.sheets[0].properties.title;
    
    // Get the headers (first row)
    const headersUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`;
    const headersResponse = await fetch(headersUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    
    if (!headersResponse.ok) {
      throw new Error("Failed to fetch sheet headers");
    }
    
    const headersData = await headersResponse.json();
    const headers = headersData.values?.[0] || [];
    
    console.log(`✓ Found ${headers.length} columns in destination sheet:`, headers);
    
    return {
      spreadsheetId,
      sheetName,
      headers,
    };
  } catch (error: any) {
    console.error('Error getting sheet headers:', error);
    throw new Error(`Failed to read response sheet: ${error.message}`);
  }
}

export async function writeToSheet(
  spreadsheetUrl: string,
  sourceData: Record<string, any>[]
): Promise<{ success: number; failed: number; errors: string[] }> {
  try {
    const sheetInfo = await getSheetHeaders(spreadsheetUrl);
    const accessToken = await googleAuth.getAccessToken();
    
    // Create column mapping
    const sourceColumns = sourceData.length > 0 ? Object.keys(sourceData[0]) : [];
    const columnMapping: Record<string, string> = {};
    
    console.log('\nAuto-mapping source columns to destination columns:');
    
    // Exact match first
    for (const sourceCol of sourceColumns) {
      const normalizedSource = normalizeHeader(sourceCol);
      
      for (const destCol of sheetInfo.headers) {
        const normalizedDest = normalizeHeader(destCol);
        
        if (normalizedSource === normalizedDest) {
          columnMapping[sourceCol] = destCol;
          console.log(`  ✓ Exact match: "${sourceCol}" -> "${destCol}"`);
          break;
        }
      }
    }
    
    // Partial match for unmapped columns
    const unmappedColumns = sourceColumns.filter(col => !columnMapping[col]);
    for (const sourceCol of unmappedColumns) {
      const normalizedSource = normalizeHeader(sourceCol);
      
      for (const destCol of sheetInfo.headers) {
        const normalizedDest = normalizeHeader(destCol);
        const destAlreadyMapped = Object.values(columnMapping).includes(destCol);
        
        if (!destAlreadyMapped && (
          normalizedDest.includes(normalizedSource) ||
          normalizedSource.includes(normalizedDest)
        )) {
          columnMapping[sourceCol] = destCol;
          console.log(`  ✓ Partial match: "${sourceCol}" -> "${destCol}"`);
          break;
        }
      }
    }
    
    // Build rows to append
    const rows: any[][] = [];
    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];
    
    for (let i = 0; i < sourceData.length; i++) {
      const record = sourceData[i];
      const row: any[] = new Array(sheetInfo.headers.length).fill('');
      let fieldsFilled = 0;
      
      // Fill row based on mapping
      for (const [sourceCol, value] of Object.entries(record)) {
        const destCol = columnMapping[sourceCol];
        if (destCol) {
          const destIndex = sheetInfo.headers.indexOf(destCol);
          if (destIndex !== -1) {
            row[destIndex] = value || '';
            fieldsFilled++;
          }
        }
      }
      
      if (fieldsFilled === 0) {
        console.log(`  ⚠ Row ${i + 1}: No fields matched - skipping`);
        failCount++;
        errors.push(`Row ${i + 1}: No fields were mapped`);
        continue;
      }
      
      rows.push(row);
      successCount++;
    }
    
    if (rows.length === 0) {
      throw new Error('No rows to write. Check column name matching.');
    }
    
    // Append rows to sheet
    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetInfo.spreadsheetId}/values/${encodeURIComponent(sheetInfo.sheetName)}:append?valueInputOption=RAW`;
    
    const appendResponse = await fetch(appendUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: rows,
      }),
    });
    
    if (!appendResponse.ok) {
      const errorText = await appendResponse.text();
      throw new Error(`Failed to write to sheet: ${errorText}`);
    }
    
    const result = await appendResponse.json();
    console.log(`✓ Successfully wrote ${result.updates.updatedRows} rows to response sheet`);
    
    return {
      success: successCount,
      failed: failCount,
      errors,
    };
  } catch (error: any) {
    console.error('Error writing to sheet:', error);
    throw new Error(`Failed to write to response sheet: ${error.message}`);
  }
}
