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

    console.log(`Submitting ${data.length} records using browser automation...`);

    // Launch Puppeteer browser
    browser = await puppeteer.launch({
      headless: true,
      executablePath: '/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer'
      ]
    });

    // Extract form fields automatically from the first page load
    const tempPage = await browser.newPage();
    await tempPage.goto(formUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Save screenshot for debugging
    await tempPage.screenshot({ path: '/tmp/form-structure.png', fullPage: true });
    console.log('Form screenshot saved to /tmp/form-structure.png');
    
    // Debug: Print all visible inputs
    const debugInfo = await tempPage.evaluate(() => {
      const allInputs = document.querySelectorAll('input, textarea, select');
      const info = {
        totalInputs: allInputs.length,
        visibleInputs: 0,
        entryInputs: 0,
        samples: [] as string[]
      };
      
      allInputs.forEach((input, idx) => {
        const type = input.getAttribute('type');
        const name = input.getAttribute('name');
        const ariaLabel = input.getAttribute('aria-label');
        
        if (type !== 'hidden') {
          info.visibleInputs++;
          if (idx < 3) {
            info.samples.push(`${input.tagName} type="${type}" name="${name}" aria-label="${ariaLabel}"`);
          }
        }
        
        if (name && name.startsWith('entry.')) {
          info.entryInputs++;
        }
      });
      
      return info;
    });
    console.log('Form debug info:', JSON.stringify(debugInfo, null, 2));
    
    // Extract all form fields and their entry IDs with labels
    const formFields = await tempPage.evaluate(() => {
      const fields: Array<{ entryId: string; label: string; type: string }> = [];
      
      // Find all input and textarea elements with entry IDs (exclude hidden fields!)
      const inputs = document.querySelectorAll('input[name^="entry."], textarea[name^="entry."], select[name^="entry."]');
      
      inputs.forEach((input) => {
        const entryId = input.getAttribute('name');
        if (!entryId || entryId.includes('_sentinel')) return;
        
        // SKIP HIDDEN FIELDS - they are not the actual user-facing fields
        const inputType = input.getAttribute('type');
        if (inputType === 'hidden') return;
        
        // Try to find the label/question text specific to this input
        let label = '';
        
        // Method 1: Look for aria-label (most reliable when present)
        label = input.getAttribute('aria-label') || '';
        
        // Method 2: Look for the question container specific to this field
        if (!label) {
          // Find the closest question container (each question is typically a listitem)
          const questionContainer = input.closest('[role="listitem"]');
          if (questionContainer) {
            // Get all text nodes in the container
            const allText = questionContainer.textContent || '';
            
            // Look specifically for a heading element within THIS question container
            const headingElement = questionContainer.querySelector('[role="heading"]');
            if (headingElement && headingElement.textContent) {
              label = headingElement.textContent.trim();
            }
            
            // If no heading, look for div.Qr7Oae (Google Forms question title class)
            if (!label) {
              const titleDiv = questionContainer.querySelector('div.Qr7Oae');
              if (titleDiv && titleDiv.textContent) {
                label = titleDiv.textContent.trim();
              }
            }
          }
        }
        
        // Method 3: Look for label element associated with this input
        if (!label) {
          const inputId = input.getAttribute('id');
          if (inputId) {
            const labelElement = document.querySelector(`label[for="${inputId}"]`);
            if (labelElement && labelElement.textContent) {
              label = labelElement.textContent.trim();
            }
          }
        }
        
        // If we still don't have a label, use the entry ID as fallback
        if (!label) {
          label = entryId;
        }
        
        const type = input.tagName.toLowerCase();
        fields.push({ entryId, label, type });
      });
      
      return fields;
    });
    
    await tempPage.close();
    
    console.log(`Found ${formFields.length} form fields:`);
    formFields.forEach(field => {
      console.log(`  ${field.entryId}: "${field.label}" (${field.type})`);
    });
    
    // Create automatic mapping from form fields to spreadsheet columns
    const autoFieldMapping: Record<string, string> = {};
    const spreadsheetColumns = data.length > 0 ? Object.keys(data[0]) : [];
    
    for (const column of spreadsheetColumns) {
      const normalizedColumn = normalizeHeader(column);
      
      // Find matching form field by label similarity
      for (const field of formFields) {
        const normalizedLabel = normalizeHeader(field.label);
        
        // Exact match or contains match
        if (normalizedColumn === normalizedLabel || 
            normalizedLabel.includes(normalizedColumn) ||
            normalizedColumn.includes(normalizedLabel)) {
          autoFieldMapping[column] = field.entryId;
          console.log(`  Mapped "${column}" -> ${field.entryId} ("${field.label}")`);
          break;
        }
      }
    }
    
    console.log(`\nStarting submission of ${data.length} records...`);

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

        // Fill each field using automatic mapping
        for (const [columnName, value] of Object.entries(record)) {
          const entryId = autoFieldMapping[columnName];
          
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

        // Click submit button - try multiple approaches
        let submitClicked = false;
        
        try {
          // Method 1: Try standard submit button
          const submitButton = await page.$('[type="submit"]');
          if (submitButton) {
            await submitButton.click();
            submitClicked = true;
            if (i === 0) console.log(`  Clicked submit: [type="submit"]`);
          }
        } catch (e) {}
        
        if (!submitClicked) {
          try {
            // Method 2: Look for div with role="button" containing "Submit" text
            const buttons = await page.$$('div[role="button"]');
            for (const button of buttons) {
              const text = await page.evaluate(el => el.textContent, button);
              if (text && text.toLowerCase().includes('submit')) {
                await button.click();
                submitClicked = true;
                if (i === 0) console.log(`  Clicked submit: div[role="button"] with "Submit" text`);
                break;
              }
            }
          } catch (e) {}
        }
        
        if (!submitClicked) {
          try {
            // Method 3: Click via JavaScript evaluation
            submitClicked = await page.evaluate(() => {
              const elements = Array.from(document.querySelectorAll('span, div[role="button"]'));
              for (const el of elements) {
                if (el.textContent?.toLowerCase().includes('submit')) {
                  (el as HTMLElement).click();
                  return true;
                }
              }
              return false;
            });
            if (submitClicked && i === 0) console.log(`  Clicked submit: JavaScript evaluate`);
          } catch (e) {}
        }
        
        if (!submitClicked) {
          try {
            // Method 4: Try Google Forms specific class
            const gfButton = await page.$('.freebirdFormviewerViewNavigationSubmitButton');
            if (gfButton) {
              await gfButton.click();
              submitClicked = true;
              if (i === 0) console.log(`  Clicked submit: Google Forms class`);
            }
          } catch (e) {}
        }
        
        if (!submitClicked) {
          errors.push(`Row ${i + 1}: Could not find submit button`);
          failCount++;
          if (i === 0) {
            // Take screenshot to debug
            await page.screenshot({ path: '/tmp/form-debug.png' });
            console.log(`  Screenshot saved to /tmp/form-debug.png for debugging`);
          }
          await page.close();
          continue;
        }
        
        // Wait for submission to complete
        await page.waitForNavigation({ timeout: 10000 }).catch(() => {});
        
        // Additional wait for form to process
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check if we reached the confirmation page
        const url = page.url();
        if (url.includes('/formResponse') || url.includes('submitted')) {
          successCount++;
          if (i === 0) {
            console.log(`  ✓ Successfully submitted (redirected to ${url})`);
          }
        } else {
          // Check for confirmation text on page
          const bodyText = await page.evaluate(() => document.body.innerText);
          if (bodyText.toLowerCase().includes('your response has been recorded') || 
              bodyText.toLowerCase().includes('thank you')) {
            successCount++;
            if (i === 0) {
              console.log(`  ✓ Successfully submitted (found confirmation text)`);
            }
          } else {
            errors.push(`Row ${i + 1}: Form did not confirm submission (URL: ${url})`);
            failCount++;
          }
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
