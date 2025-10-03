interface FormField {
  title: string;
  type: string;
  id: string;
  required: boolean;
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

// Find matching entry ID for a spreadsheet column
function findMatchingEntryId(
  columnName: string,
  mappings: Record<string, FormFieldMapping>
): string | null {
  const normalized = normalizeHeader(columnName);
  
  for (const [fieldKey, mapping] of Object.entries(mappings)) {
    // Check preferred headers first
    for (const header of mapping.preferredHeaders) {
      if (normalizeHeader(header) === normalized) {
        return mapping.entryId;
      }
    }
    
    // Check synonyms
    for (const synonym of mapping.synonyms) {
      if (normalizeHeader(synonym) === normalized || normalized.includes(normalizeHeader(synonym))) {
        return mapping.entryId;
      }
    }
  }
  
  return null;
}

export async function validateForm(formUrl: string): Promise<FormData> {
  try {
    // Extract form ID from URL
    const formIdMatch = formUrl.match(/\/forms\/d\/e\/([a-zA-Z0-9-_]+)/);
    if (!formIdMatch) {
      throw new Error("Invalid Google Form URL format");
    }

    // Return basic form structure
    // Note: Google Forms API doesn't allow reading form structure without edit access
    // Users need to manually configure field mappings
    return {
      title: "Google Form",
      description: "Configure field mappings in the code to match your form",
      url: formUrl,
      fields: [
        { title: "Form fields need to be configured manually", type: "text", id: "N/A", required: false }
      ]
    };
  } catch (error: any) {
    console.error("Form validation error:", error);
    throw new Error(`Failed to validate form: ${error.message}`);
  }
}

export async function submitToForm(
  formUrl: string,
  data: Record<string, any>[],
  mappings?: Record<string, FormFieldMapping>
): Promise<void> {
  try {
    // Extract form ID from URL
    const formIdMatch = formUrl.match(/\/forms\/d\/e\/([a-zA-Z0-9-_]+)/);
    if (!formIdMatch) {
      throw new Error("Invalid Google Form URL format");
    }

    const formId = formIdMatch[1];

    // Configured mappings for your Google Form
    // Entry IDs extracted from: https://docs.google.com/forms/d/e/1FAIpQLSfNE-teKY-YcBFw8crhN2ToUaNvomUXpKvYvXwHU9nwUViG3Q/viewform
    const defaultMappings: Record<string, FormFieldMapping> = {
      gmail: {
        entryId: 'entry.517524020',
        preferredHeaders: ['Gmail', 'Email', 'E-mail'],
        synonyms: ['gmail', 'email', 'mail', 'emailaddress'],
        required: false
      },
      name: {
        entryId: 'entry.1239450592',
        preferredHeaders: ['Name'],
        synonyms: ['name', 'fullname', 'username'],
        required: false
      },
      mobile: {
        entryId: 'entry.39368183',
        preferredHeaders: ['Mobile', 'Phone', 'Mobile Number'],
        synonyms: ['mobile', 'phone', 'phonenumber', 'mobilenumber', 'contact'],
        required: false
      },
      bike: {
        entryId: 'entry.2137498884',
        preferredHeaders: ['Choose a Bike', 'Bike', 'Bike Type'],
        synonyms: ['bike', 'choosebike', 'choosea bike', 'biketype'],
        required: false
      },
      vehicleNo: {
        entryId: 'entry.659183258',
        preferredHeaders: ['Vehicle No', 'Vehicle Number', 'Registration'],
        synonyms: ['vehicle', 'vehicleno', 'vehiclenumber', 'registration', 'regno'],
        required: false
      }
    };

    const activeMappings = mappings || defaultMappings;
    
    // Check if placeholder values are still being used
    const hasPlaceholders = Object.values(activeMappings).some(m => 
      m.entryId.includes('PLACEHOLDER')
    );
    
    if (hasPlaceholders) {
      console.warn('⚠️  Using placeholder entry IDs! Submissions will not work.');
      console.warn('To fix this:');
      console.warn('1. Open your Google Form');
      console.warn('2. Click 3-dot menu → "Get pre-filled link"');
      console.warn('3. Fill sample data and click "Get link"');
      console.warn('4. Extract entry.XXXXX values from the URL');
      console.warn('5. Update the mappings in server/services/google-forms.ts');
      
      throw new Error('Form field mappings not configured. See console for instructions.');
    }

    console.log(`Submitting ${data.length} records to form ${formId}`);

    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < data.length; i++) {
      const record = data[i];
      
      try {
        const formData = new URLSearchParams();
        let fieldCount = 0;

        // Map spreadsheet columns to form entry IDs
        for (const [columnName, value] of Object.entries(record)) {
          const entryId = findMatchingEntryId(columnName, activeMappings);
          
          if (entryId && value !== null && value !== undefined && value !== '') {
            // Trim whitespace from values
            const cleanValue = String(value).trim();
            formData.append(entryId, cleanValue);
            fieldCount++;
          }
        }

        if (fieldCount === 0) {
          errors.push(`Row ${i + 1}: No matching fields found for columns: ${Object.keys(record).join(', ')}`);
          failCount++;
          continue;
        }

        // Add common Google Forms hidden parameters
        formData.append('fvv', '1');
        formData.append('pageHistory', '0');
        formData.append('fbzx', Date.now().toString());

        // Log first submission for debugging
        if (i === 0) {
          console.log('First submission data:', Object.fromEntries(formData.entries()));
        }

        // Submit to Google Forms
        const submitUrl = `https://docs.google.com/forms/d/e/${formId}/formResponse`;
        
        const response = await fetch(submitUrl, {
          method: 'POST',
          body: formData,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Origin': 'https://docs.google.com',
            'Referer': `https://docs.google.com/forms/d/e/${formId}/viewform`,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9'
          },
          redirect: 'manual'
        });
        
        // Log first response for debugging
        if (i === 0) {
          console.log('First response status:', response.status);
          console.log('First response headers:', Object.fromEntries(response.headers.entries()));
        }

        // Google Forms returns 302/303 on successful submission
        if (response.status === 302 || response.status === 303 || response.status === 200) {
          successCount++;
        } else {
          errors.push(`Row ${i + 1}: Unexpected status ${response.status}`);
          failCount++;
        }

        // Rate limiting: 100-150ms between submissions
        await new Promise(resolve => setTimeout(resolve, 120));
        
      } catch (recordError: any) {
        errors.push(`Row ${i + 1}: ${recordError.message}`);
        failCount++;
      }
    }

    console.log(`✓ Submission complete: ${successCount} successful, ${failCount} failed out of ${data.length} total`);
    
    if (errors.length > 0 && errors.length <= 10) {
      console.log('Errors:', errors.join('; '));
    }
    
    if (successCount === 0 && data.length > 0) {
      throw new Error(`No records were successfully submitted. ${errors[0] || 'Please check the configuration.'}`);
    }
    
  } catch (error: any) {
    console.error("Form submission error:", error);
    throw new Error(`Failed to submit to form: ${error.message}`);
  }
}
