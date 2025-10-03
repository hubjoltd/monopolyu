import puppeteer from 'puppeteer';

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
  let browser;
  
  try {
    // Extract form ID from URL
    const formIdMatch = formUrl.match(/\/forms\/d\/e\/([a-zA-Z0-9-_]+)/);
    if (!formIdMatch) {
      throw new Error("Invalid Google Form URL format");
    }

    const formId = formIdMatch[1];

    // Configured mappings for your Google Form
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

    console.log(`Submitting ${data.length} records using browser automation...`);

    // Launch Puppeteer browser
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < data.length; i++) {
      const record = data[i];
      const page = await browser.newPage();
      
      try {
        // Navigate to the form
        await page.goto(formUrl, { waitUntil: 'networkidle2', timeout: 30000 });

        let fieldsFilled = 0;

        // Fill each field based on entry IDs
        for (const [columnName, value] of Object.entries(record)) {
          const entryId = findMatchingEntryId(columnName, activeMappings);
          
          if (entryId && value !== null && value !== undefined && value !== '') {
            const cleanValue = String(value).trim();
            
            try {
              // Try different selectors for the input
              const selector = `input[name="${entryId}"], textarea[name="${entryId}"]`;
              await page.waitForSelector(selector, { timeout: 5000 });
              await page.type(selector, cleanValue);
              fieldsFilled++;
              
              if (i === 0) {
                console.log(`  Filled ${entryId} = "${cleanValue}"`);
              }
            } catch (selectorError) {
              if (i === 0) {
                console.log(`  Could not find field ${entryId} for column "${columnName}"`);
              }
            }
          }
        }

        if (fieldsFilled === 0) {
          errors.push(`Row ${i + 1}: No fields were filled`);
          failCount++;
          await page.close();
          continue;
        }

        // Click submit button
        await page.click('[type="submit"]');
        
        // Wait for submission to complete
        await page.waitForNavigation({ timeout: 10000 }).catch(() => {});
        
        // Check if we reached the confirmation page
        const url = page.url();
        if (url.includes('/formResponse') || url.includes('submitted')) {
          successCount++;
        } else {
          errors.push(`Row ${i + 1}: Form did not confirm submission`);
          failCount++;
        }

        await page.close();

        // Rate limiting
        if (i < data.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (recordError: any) {
        errors.push(`Row ${i + 1}: ${recordError.message}`);
        failCount++;
        await page.close().catch(() => {});
      }
    }

    console.log(`✓ Submission complete: ${successCount} successful, ${failCount} failed out of ${data.length} total`);
    
    if (errors.length > 0 && errors.length <= 10) {
      console.log('Errors:', errors.join('; '));
    }
    
    if (successCount === 0 && data.length > 0) {
      throw new Error(`No records were successfully submitted. ${errors[0] || 'Browser automation failed.'}`);
    }
    
  } catch (error: any) {
    console.error("Form submission error:", error);
    throw new Error(`Failed to submit to form: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
