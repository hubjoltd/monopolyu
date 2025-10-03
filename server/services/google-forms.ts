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
    
    // Debug: Print detailed form structure analysis
    const debugInfo = await tempPage.evaluate(() => {
      const allInputs = document.querySelectorAll('input, textarea, select');
      const entryFields: any[] = [];
      
      allInputs.forEach((input) => {
        const name = input.getAttribute('name');
        if (name && name.startsWith('entry.')) {
          const ariaLabel = input.getAttribute('aria-label');
          const ariaLabelledBy = input.getAttribute('aria-labelledby');
          
          let detectedLabel = '';
          
          // Try aria-labelledby
          if (ariaLabelledBy) {
            const labelEl = document.getElementById(ariaLabelledBy);
            if (labelEl) detectedLabel = labelEl.textContent?.trim() || '';
          }
          
          // Try finding parent question container
          if (!detectedLabel) {
            let parent = input.parentElement;
            for (let i = 0; i < 10 && parent; i++) {
              const heading = parent.querySelector('[role="heading"]');
              if (heading?.textContent?.trim()) {
                detectedLabel = heading.textContent.trim();
                break;
              }
              parent = parent.parentElement;
            }
          }
          
          entryFields.push({
            name,
            ariaLabel,
            ariaLabelledBy,
            detectedLabel
          });
        }
      });
      
      return {
        totalEntryFields: entryFields.length,
        fields: entryFields
      };
    });
    console.log('\n=== Form Structure Debug ===');
    console.log(JSON.stringify(debugInfo, null, 2));
    console.log('===========================\n');
    
    // Extract form fields - find all inputs with entry.XXX names
    const formFields = await tempPage.evaluate(() => {
      const fields: Array<{ selector: string; label: string; type: string; entryId: string }> = [];
      
      // Find all inputs with name starting with "entry."
      const entryInputs = document.querySelectorAll('input[name^="entry."], textarea[name^="entry."], select[name^="entry."]');
      
      entryInputs.forEach((input) => {
        const entryId = input.getAttribute('name') || '';
        
        // Skip sentinel fields (these are not actual questions)
        if (entryId.includes('_sentinel')) {
          return;
        }
        
        let questionText = '';
        
        // Method 1: Use aria-label attribute (most reliable for new Google Forms)
        const ariaLabel = input.getAttribute('aria-label');
        if (ariaLabel && ariaLabel !== 'null' && ariaLabel.length > 1 && !ariaLabel.toLowerCase().includes('untitled')) {
          questionText = ariaLabel;
        }
        
        // Method 2: Use aria-labelledby to find the label
        if (!questionText) {
          const ariaLabelledBy = input.getAttribute('aria-labelledby');
          if (ariaLabelledBy) {
            const labelElement = document.getElementById(ariaLabelledBy);
            if (labelElement) {
              const text = labelElement.textContent?.trim() || '';
              if (text && !text.toLowerCase().includes('untitled')) {
                questionText = text;
              }
            }
          }
        }
        
        // Method 3: Look for label in parent elements
        if (!questionText) {
          let parent = input.parentElement;
          
          for (let i = 0; i < 15 && parent; i++) {
            // Look for div with role="heading"
            const heading = parent.querySelector('[role="heading"]');
            if (heading?.textContent) {
              const text = heading.textContent.trim();
              if (text && text.length > 1 && !text.toLowerCase().includes('untitled')) {
                questionText = text;
                break;
              }
            }
            
            // Look for common Google Forms classes
            const labels = Array.from(parent.querySelectorAll('.M7eMe, .freebirdFormviewerComponentsQuestionBaseTitle, .freebirdFormviewerComponentsQuestionBaseHeader'));
            for (const label of labels) {
              const text = label.textContent?.trim();
              if (text && text.length > 1 && !text.toLowerCase().includes('untitled')) {
                questionText = text;
                break;
              }
            }
            
            if (questionText) break;
            parent = parent.parentElement;
          }
        }
        
        // Method 4: Use the entry ID as fallback label
        if (!questionText && entryId) {
          questionText = `Field ${entryId.replace('entry.', '')}`;
        }
        
        if (entryId && questionText) {
          const selector = `[name="${entryId}"]`;
          const type = input.tagName.toLowerCase();
          fields.push({ 
            selector, 
            label: questionText, 
            type, 
            entryId 
          });
        }
      });
      
      return fields;
    });
    
    await tempPage.close();
    
    console.log(`\n✓ Auto-detected ${formFields.length} form fields with entry IDs:`);
    formFields.forEach(field => {
      console.log(`  - ${field.entryId}: "${field.label}" (${field.type})`);
    });
    
    if (formFields.length === 0) {
      throw new Error('No form fields with entry IDs were detected. The form may not be accessible or has a different structure.');
    }
    
    // Create automatic mapping from form fields to spreadsheet columns
    const autoFieldMapping: Record<string, string> = {};
    const spreadsheetColumns = data.length > 0 ? Object.keys(data[0]) : [];
    
    console.log('\nMapping spreadsheet columns to form fields:');
    
    // First try: exact label matching
    const unmatchedColumns: string[] = [];
    for (const column of spreadsheetColumns) {
      const normalizedColumn = normalizeHeader(column);
      let matched = false;
      
      for (const field of formFields) {
        const normalizedLabel = normalizeHeader(field.label);
        
        if (normalizedColumn === normalizedLabel) {
          autoFieldMapping[column] = field.selector;
          console.log(`  ✓ Exact match: "${column}" -> "${field.label}"`);
          matched = true;
          break;
        }
      }
      
      if (!matched) {
        unmatchedColumns.push(column);
      }
    }
    
    // Second try: partial matching for unmatched columns
    for (const column of unmatchedColumns.slice()) {
      const normalizedColumn = normalizeHeader(column);
      
      for (const field of formFields) {
        if (autoFieldMapping[column]) break; // Already mapped
        
        const normalizedLabel = normalizeHeader(field.label);
        const fieldAlreadyMapped = Object.values(autoFieldMapping).includes(field.selector);
        
        if (!fieldAlreadyMapped && (
          normalizedLabel.includes(normalizedColumn) ||
          normalizedColumn.includes(normalizedLabel)
        )) {
          autoFieldMapping[column] = field.selector;
          console.log(`  ✓ Partial match: "${column}" -> "${field.label}"`);
          unmatchedColumns.splice(unmatchedColumns.indexOf(column), 1);
          break;
        }
      }
    }
    
    // Third try: map remaining columns by position
    const unmappedFields = formFields.filter(f => !Object.values(autoFieldMapping).includes(f.selector));
    for (let i = 0; i < unmatchedColumns.length && i < unmappedFields.length; i++) {
      const column = unmatchedColumns[i];
      const field = unmappedFields[i];
      autoFieldMapping[column] = field.selector;
      console.log(`  ✓ Mapped by position: "${column}" -> "${field.label}" (${field.entryId})`);
    }
    
    // Log any remaining unmatched columns
    const stillUnmatched = spreadsheetColumns.filter(col => !autoFieldMapping[col]);
    for (const column of stillUnmatched) {
      console.log(`  ✗ No match found for "${column}"`);
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
          const fieldSelector = autoFieldMapping[columnName];
          
          if (fieldSelector && value !== null && value !== undefined && value !== '') {
            const cleanValue = String(value).trim();
            
            try {
              // Use the selector to find the visible input field
              await page.waitForSelector(fieldSelector, { timeout: 5000 });
              
              // Clear existing value and fill new value
              await page.evaluate((selector) => {
                const element = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
                if (element) {
                  element.value = '';
                }
              }, fieldSelector);
              
              await page.type(fieldSelector, cleanValue, { delay: 50 });
              fieldsFilled++;
              
              if (i === 0) {
                console.log(`  ✓ Filled "${columnName}" = "${cleanValue}"`);
              }
            } catch (selectorError) {
              if (i === 0) {
                console.log(`  ✗ Could not find field for column "${columnName}"`);
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
        
        // Wait for submission to complete - try navigation first
        const navigationPromise = page.waitForNavigation({ timeout: 15000 }).catch(() => null);
        await navigationPromise;
        
        // Additional wait for form to process
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Check if we reached the confirmation page
        const url = page.url();
        let submissionConfirmed = false;
        
        if (url.includes('/formResponse') || url.includes('submitted')) {
          submissionConfirmed = true;
          if (i === 0) {
            console.log(`  ✓ Successfully submitted (redirected to ${url})`);
          }
        } else {
          // Check for confirmation text on page
          const bodyText = await page.evaluate(() => document.body.innerText);
          const confirmationTexts = [
            'your response has been recorded',
            'thank you',
            'response recorded',
            'submitted',
            'thanks for',
            'we have received'
          ];
          
          const hasConfirmation = confirmationTexts.some(text => 
            bodyText.toLowerCase().includes(text)
          );
          
          if (hasConfirmation) {
            submissionConfirmed = true;
            if (i === 0) {
              console.log(`  ✓ Successfully submitted (found confirmation text)`);
            }
          }
        }
        
        if (submissionConfirmed) {
          successCount++;
        } else {
          errors.push(`Row ${i + 1}: Form did not confirm submission (URL: ${url})`);
          failCount++;
          
          if (i === 0) {
            await page.screenshot({ path: '/tmp/form-no-confirmation.png' });
            console.log(`  Screenshot saved for debugging: /tmp/form-no-confirmation.png`);
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
