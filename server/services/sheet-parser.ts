import * as XLSX from 'xlsx';

interface SheetParseResult {
  records: Record<string, any>[];
  preview: Record<string, any>[];
  columns: string[];
  fileName: string;
}

export async function parseSheet(file: Express.Multer.File): Promise<SheetParseResult> {
  try {
    const fileName = file.originalname;
    
    let workbook: XLSX.WorkBook;
    
    if (file.mimetype === 'text/csv') {
      // Parse CSV
      const csvData = file.buffer.toString('utf8');
      workbook = XLSX.read(csvData, { type: 'string' });
    } else {
      // Parse Excel files (.xlsx, .xls)
      workbook = XLSX.read(file.buffer, { type: 'buffer' });
    }
    
    // Get the first worksheet
    const worksheetName = workbook.SheetNames[0];
    if (!worksheetName) {
      throw new Error("No worksheets found in the file");
    }
    
    const worksheet = workbook.Sheets[worksheetName];
    
    // Convert to JSON
    const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, { 
      header: 1,
      defval: '',
      blankrows: false 
    });
    
    if (jsonData.length < 2) {
      throw new Error("File must contain at least a header row and one data row");
    }
    
    // First row is headers
    const headers = jsonData[0] as string[];
    const dataRows = jsonData.slice(1);
    
    // Validate headers
    if (!headers || headers.length === 0) {
      throw new Error("No column headers found");
    }
    
    // Convert to object format
    const records = dataRows.map((row: any[]) => {
      const record: Record<string, any> = {};
      headers.forEach((header, index) => {
        record[header] = row[index] || '';
      });
      return record;
    });
    
    if (records.length === 0) {
      throw new Error("No data rows found");
    }
    
    // Create preview (first 5 records)
    const preview = records.slice(0, 5);
    
    return {
      records,
      preview,
      columns: headers,
      fileName,
    };
    
  } catch (error: any) {
    console.error("Sheet parsing error:", error);
    
    if (error.message.includes('Unsupported file')) {
      throw new Error("Unsupported file format. Please use .xlsx, .xls, or .csv files.");
    }
    
    throw new Error(`Failed to parse sheet: ${error.message}`);
  }
}
