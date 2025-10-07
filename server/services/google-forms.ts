import { googleAuth } from './auth';

interface FormField {
  title: string;
  type: string;
  id: string;
  required: boolean;
  entryId?: string;
}

interface FormData {
  title: string;
  description: string;
  url: string;
  fields: FormField[];
}

interface FormFieldMapping {
  entryId: string;
  preferredHeaders: string[];
  synonyms: string[];
  required: boolean;
}

// Normalize header names for matching
function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '');
}

export async function validateForm(formUrl: string): Promise<FormData> {
  try {
    // Extract form ID from URL
    const formIdMatch = formUrl.match(/\/forms\/d\/e\/([a-zA-Z0-9-_]+)/);
    if (!formIdMatch) {
      throw new Error("Invalid Google Form URL format. Please use the form's public URL.");
    }

    const formId = formIdMatch[1];
    console.log(`Fetching form structure for form ID: ${formId}`);

    // Get access token from service account
    const accessToken = await googleAuth.getAccessToken();

    // Fetch form metadata using Google Forms API
    const apiUrl = `https://forms.googleapis.com/v1/forms/${formId}`;
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Forms API error:', errorText);
      throw new Error(`Failed to fetch form: ${response.statusText}. Make sure the form is shared with the service account: ${(await googleAuth.getAuthStatus()).email}`);
    }

    const formData = await response.json();

    // Extract form fields
    const fields: FormField[] = [];
    
    if (formData.items) {
      for (const item of formData.items) {
        if (item.questionItem) {
          const question = item.questionItem.question;
          const questionId = item.itemId || item.questionItem.question.questionId;
          
          fields.push({
            id: questionId,
            title: item.title || 'Untitled Question',
            type: Object.keys(question)[0], // e.g., 'textQuestion', 'choiceQuestion', etc.
            required: question.required || false,
            entryId: questionId, // Use question ID as entry ID
          });
        }
      }
    }

    return {
      title: formData.info?.title || 'Google Form',
      description: formData.info?.description || '',
      url: formUrl,
      fields,
    };
  } catch (error: any) {
    console.error('Form validation error:', error);
    throw new Error(`Failed to validate form: ${error.message}`);
  }
}

export async function submitToForm(
  formUrl: string,
  data: Record<string, any>[],
  mappings?: Record<string, FormFieldMapping>
): Promise<void> {
  try {
    // First, get form structure to understand the fields
    const formData = await validateForm(formUrl);
    
    console.log(`\nForm: ${formData.title}`);
    console.log(`Found ${formData.fields.length} fields`);
    console.log(`Submitting ${data.length} records...\n`);

    // Create automatic mapping from spreadsheet columns to form fields based on labels
    const spreadsheetColumns = data.length > 0 ? Object.keys(data[0]) : [];
    const fieldMapping: Record<string, FormField> = {};

    console.log('Auto-mapping spreadsheet columns to form fields:');
    
    // Try exact match first
    for (const column of spreadsheetColumns) {
      const normalizedColumn = normalizeHeader(column);
      
      for (const field of formData.fields) {
        const normalizedFieldTitle = normalizeHeader(field.title);
        
        if (normalizedColumn === normalizedFieldTitle) {
          fieldMapping[column] = field;
          console.log(`  ✓ Exact match: "${column}" -> "${field.title}"`);
          break;
        }
      }
    }

    // Try partial match for unmapped columns
    const unmappedColumns = spreadsheetColumns.filter(col => !fieldMapping[col]);
    for (const column of unmappedColumns) {
      const normalizedColumn = normalizeHeader(column);
      
      for (const field of formData.fields) {
        const normalizedFieldTitle = normalizeHeader(field.title);
        const fieldAlreadyMapped = Object.values(fieldMapping).some(f => f.id === field.id);
        
        if (!fieldAlreadyMapped && (
          normalizedFieldTitle.includes(normalizedColumn) ||
          normalizedColumn.includes(normalizedFieldTitle)
        )) {
          fieldMapping[column] = field;
          console.log(`  ✓ Partial match: "${column}" -> "${field.title}"`);
          break;
        }
      }
    }

    // Extract form submission endpoint from URL
    const formIdMatch = formUrl.match(/\/forms\/d\/e\/([a-zA-Z0-9-_]+)/);
    if (!formIdMatch) {
      throw new Error("Invalid form URL");
    }
    const formId = formIdMatch[1];
    const submitUrl = `https://docs.google.com/forms/d/e/${formId}/formResponse`;

    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    // Submit each record
    for (let i = 0; i < data.length; i++) {
      const record = data[i];
      const formBody = new URLSearchParams();

      let fieldsFilled = 0;

      // Fill form data based on mapping
      for (const [columnName, value] of Object.entries(record)) {
        const field = fieldMapping[columnName];
        
        if (field && value !== null && value !== undefined && value !== '') {
          const cleanValue = String(value).trim();
          // Use the question ID as the entry parameter
          formBody.append(`entry.${field.id}`, cleanValue);
          fieldsFilled++;
        }
      }

      if (fieldsFilled === 0) {
        console.log(`  ⚠ Row ${i + 1}: No fields matched - skipping`);
        failCount++;
        continue;
      }

      try {
        // Submit the form
        const response = await fetch(submitUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formBody.toString(),
          redirect: 'manual', // Google Forms redirects on success
        });

        // Check if submission was successful
        // Google Forms returns 302 redirect on successful submission
        if (response.status === 302 || response.status === 200) {
          successCount++;
          if ((i + 1) % 10 === 0) {
            console.log(`  Submitted ${i + 1}/${data.length} records...`);
          }
        } else {
          failCount++;
          errors.push(`Row ${i + 1}: Unexpected response status ${response.status}`);
        }
      } catch (error: any) {
        failCount++;
        errors.push(`Row ${i + 1}: ${error.message}`);
      }

      // Small delay to avoid rate limiting
      if (i < data.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`\n✓ Submission complete:`);
    console.log(`  Success: ${successCount}`);
    console.log(`  Failed: ${failCount}`);

    if (errors.length > 0) {
      console.log(`\nErrors (showing first 5):`);
      errors.slice(0, 5).forEach(err => console.log(`  - ${err}`));
    }

    if (failCount > 0) {
      throw new Error(`${failCount} submissions failed. Check logs for details.`);
    }
  } catch (error: any) {
    console.error('Form submission error:', error);
    throw new Error(`Failed to submit to form: ${error.message}`);
  }
}
