import { googleAuth } from './auth';
import puppeteer from 'puppeteer';

interface FormField {
  title: string;
  type: string;
  id: string;
  required: boolean;
  entryId: string;
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
  let browser;
  
  try {
    // Extract form ID from URL
    const formIdMatch = formUrl.match(/\/forms\/d\/e\/([a-zA-Z0-9-_]+)/);
    if (!formIdMatch) {
      throw new Error("Invalid Google Form URL format. Please use the form's public URL.");
    }

    const formId = formIdMatch[1];
    console.log(`Fetching form structure for form ID: ${formId}`);

    // Try to get form structure from Google Forms API first
    let apiFormData: any = null;
    let apiFields: Map<string, any> = new Map();
    
    try {
      const accessToken = await googleAuth.getAccessToken();
      const apiUrl = `https://forms.googleapis.com/v1/forms/${formId}`;
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        apiFormData = await response.json();
        
        // Create a map of question titles from API
        if (apiFormData.items) {
          for (const item of apiFormData.items) {
            if (item.questionItem && item.title) {
              apiFields.set(item.title.toLowerCase().trim(), {
                title: item.title,
                type: Object.keys(item.questionItem.question)[0],
                required: item.questionItem.question.required || false,
              });
            }
          }
        }
        console.log(`✓ Fetched ${apiFields.size} questions from Forms API`);
      }
    } catch (apiError) {
      console.log('Note: Could not access Forms API, will use HTML parsing only');
    }

    // Always parse HTML to get entry IDs (required for submission)
    console.log('Extracting entry IDs from form HTML...');
    
    browser = await puppeteer.launch({
      headless: true,
      executablePath: '/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ]
    });

    const page = await browser.newPage();
    await page.goto(formUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait for form to fully load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Debug: Save page HTML for inspection
    const pageContent = await page.content();
    console.log('Page loaded, HTML length:', pageContent.length);
    
    // Debug: Check for entry patterns in HTML
    const entryMatches = pageContent.match(/entry\.\d+/g);
    if (entryMatches) {
      const uniqueEntries = Array.from(new Set(entryMatches));
      console.log(`Found ${entryMatches.length} entry patterns in HTML:`, uniqueEntries);
    } else {
      console.log('No entry.* patterns found in HTML');
      
      // Check for alternative patterns
      const fbPatterns = pageContent.match(/\[\d+,\[\[\d+/g);
      if (fbPatterns) {
        console.log('Found FB patterns (new Google Forms format):', fbPatterns.length);
      }
      
      // Check for data-params
      const dataParams = pageContent.match(/data-params="[^"]*"/g);
      if (dataParams && dataParams.length > 0) {
        console.log('Found data-params attributes:', dataParams.slice(0, 3));
      }
      
      // Check for name attributes
      const nameAttrs = pageContent.match(/name="[^"]*"/g);
      if (nameAttrs) {
        const unique = Array.from(new Set(nameAttrs)).slice(0, 10);
        console.log('Found name attributes:', unique);
      }
    }
    
    // Extract form title
    const formTitle = await page.evaluate(() => {
      const titleElement = document.querySelector('[role="heading"]');
      return titleElement?.textContent?.trim() || 'Google Form';
    });

    // Extract entry IDs and labels from HTML
    const htmlFields = await page.evaluate(() => {
      const fields: Array<{ entryId: string; label: string; type: string }> = [];
      
      // Try multiple selectors for different Google Forms formats
      const selectors = [
        'input[name^="entry."]',
        'textarea[name^="entry."]', 
        'select[name^="entry."]',
        'input[data-params*="entry"]',
        'div[data-params*="entry"]',
        'input[jsname]',
        'textarea[jsname]',
      ];
      
      const allInputs: Element[] = [];
      selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
          if (!allInputs.includes(el)) {
            allInputs.push(el);
          }
        });
      });
      
      allInputs.forEach((input) => {
        // Extract entry ID from various attributes
        let entryId = input.getAttribute('name') || '';
        
        // Try data-params attribute (newer Google Forms)
        if (!entryId || !entryId.startsWith('entry.')) {
          const dataParams = input.getAttribute('data-params');
          if (dataParams) {
            const entryMatch = dataParams.match(/entry\.(\d+)/);
            if (entryMatch) {
              entryId = entryMatch[0];
            }
          }
        }
        
        // Try parent's data-params
        if (!entryId || !entryId.startsWith('entry.')) {
          let parent = input.parentElement;
          for (let i = 0; i < 5 && parent; i++) {
            const dataParams = parent.getAttribute('data-params');
            if (dataParams) {
              const entryMatch = dataParams.match(/entry\.(\d+)/);
              if (entryMatch) {
                entryId = entryMatch[0];
                break;
              }
            }
            parent = parent.parentElement;
          }
        }
        
        // If no name attribute, try to extract from data attributes
        if (!entryId || !entryId.startsWith('entry.')) {
          const dataAttrs = Array.from(input.attributes);
          for (const attr of dataAttrs) {
            if (attr.value && attr.value.match(/entry\.\d+/)) {
              const match = attr.value.match(/entry\.\d+/);
              if (match) {
                entryId = match[0];
                break;
              }
            }
          }
        }
        
        // Skip if no valid entry ID found
        if (!entryId || (!entryId.startsWith('entry.') && !entryId.match(/^\d{9,}$/))) {
          return;
        }
        
        let questionText = '';
        
        // Method 1: aria-label
        const ariaLabel = input.getAttribute('aria-label');
        if (ariaLabel && ariaLabel.length > 1 && !ariaLabel.toLowerCase().includes('untitled')) {
          questionText = ariaLabel;
        }
        
        // Method 2: aria-labelledby
        if (!questionText) {
          const ariaLabelledBy = input.getAttribute('aria-labelledby');
          if (ariaLabelledBy) {
            const labelElement = document.getElementById(ariaLabelledBy);
            if (labelElement?.textContent) {
              questionText = labelElement.textContent.trim();
            }
          }
        }
        
        // Method 3: Look in parent elements for heading/label
        if (!questionText) {
          let parent = input.parentElement;
          for (let i = 0; i < 15 && parent; i++) {
            const heading = parent.querySelector('[role="heading"]');
            if (heading?.textContent) {
              const text = heading.textContent.trim();
              if (text.length > 1 && !text.toLowerCase().includes('untitled')) {
                questionText = text;
                break;
              }
            }
            parent = parent.parentElement;
          }
        }
        
        // Ensure we have entry.* format
        if (!entryId.startsWith('entry.')) {
          entryId = `entry.${entryId}`;
        }
        
        if (questionText || entryId) {
          fields.push({
            entryId,
            label: questionText || entryId,
            type: input.tagName.toLowerCase()
          });
        }
      });
      
      return fields;
    });

    await browser.close();
    browser = null;

    console.log(`✓ Extracted ${htmlFields.length} entry IDs from HTML`);
    
    if (htmlFields.length === 0) {
      console.warn('⚠ No fields found via HTML extraction. Trying to use API data only...');
      
      // If HTML extraction failed, try to use API fields directly
      if (apiFields.size > 0) {
        console.log(`Using ${apiFields.size} fields from Forms API`);
        for (const [title, data] of Array.from(apiFields.entries())) {
          htmlFields.push({
            entryId: `entry.${Math.random().toString().slice(2, 11)}`, // Generate placeholder
            label: title,
            type: 'text'
          });
        }
        console.log(`✓ Using ${htmlFields.length} fields from API`);
      } else {
        console.error('❌ No fields found from HTML or API. The form may require authentication or the URL may be incorrect.');
      }
    }

    // Merge API data with HTML entry IDs (use normalized matching)
    const fields: FormField[] = htmlFields.map(htmlField => {
      const normalizedLabel = normalizeHeader(htmlField.label);
      
      // Find matching API field by normalized label
      let apiField = null;
      for (const [apiTitle, data] of Array.from(apiFields.entries())) {
        if (normalizeHeader(apiTitle) === normalizedLabel) {
          apiField = data;
          break;
        }
      }
      
      return {
        id: htmlField.entryId,
        title: apiField?.title || htmlField.label,
        type: apiField?.type || htmlField.type,
        required: apiField?.required || false,
        entryId: htmlField.entryId,
      };
    });

    return {
      title: apiFormData?.info?.title || formTitle,
      description: apiFormData?.info?.description || '',
      url: formUrl,
      fields,
    };
  } catch (error: any) {
    if (browser) {
      await browser.close();
    }
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
    // Get form structure
    const formData = await validateForm(formUrl);
    
    console.log(`\nForm: ${formData.title}`);
    console.log(`Found ${formData.fields.length} fields`);
    console.log(`Submitting ${data.length} records...\n`);

    // Create automatic mapping from spreadsheet columns to form fields
    const spreadsheetColumns = data.length > 0 ? Object.keys(data[0]) : [];
    const fieldMapping: Record<string, FormField> = {};

    console.log('Auto-mapping spreadsheet columns to form fields:');
    
    // Exact match first
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

    // Partial match for unmapped columns
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

    // Check for required fields that aren't mapped
    const unmappedRequiredFields = formData.fields.filter(
      field => field.required && !Object.values(fieldMapping).some(f => f.id === field.id)
    );
    
    if (unmappedRequiredFields.length > 0) {
      console.warn('\n⚠ Warning: Required fields without mapping:');
      unmappedRequiredFields.forEach(field => {
        console.warn(`  - "${field.title}" (${field.entryId})`);
      });
      console.warn('Submissions may fail if these fields are empty.\n');
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
          formBody.append(field.entryId, cleanValue);
          fieldsFilled++;
        }
      }

      if (fieldsFilled === 0) {
        console.log(`  ⚠ Row ${i + 1}: No fields matched - skipping`);
        failCount++;
        errors.push(`Row ${i + 1}: No fields were mapped`);
        continue;
      }

      try {
        const response = await fetch(submitUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formBody.toString(),
          redirect: 'manual',
        });

        // Google Forms returns 302 redirect on success, or 200 with error page
        if (response.status === 302) {
          // Check redirect location to confirm success
          const location = response.headers.get('location');
          if (location && location.includes('formResponse')) {
            successCount++;
            if ((i + 1) % 10 === 0) {
              console.log(`  Submitted ${i + 1}/${data.length} records...`);
            }
          } else {
            failCount++;
            errors.push(`Row ${i + 1}: Unexpected redirect to ${location}`);
          }
        } else if (response.status === 200) {
          // Check response body for success confirmation
          const responseText = await response.text();
          if (responseText.includes('Your response has been recorded') || 
              responseText.includes('formResponse') ||
              responseText.includes('submitted')) {
            successCount++;
            if ((i + 1) % 10 === 0) {
              console.log(`  Submitted ${i + 1}/${data.length} records...`);
            }
          } else {
            failCount++;
            // Try to extract error message from response
            const errorMatch = responseText.match(/This is a required question|must be filled out|error/i);
            const errorMsg = errorMatch ? errorMatch[0] : 'Form validation failed';
            errors.push(`Row ${i + 1}: ${errorMsg}`);
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

    if (failCount === data.length) {
      throw new Error('All submissions failed. Please check form URL and ensure form is accessible.');
    } else if (failCount > 0) {
      throw new Error(`${failCount} of ${data.length} submissions failed. Check logs for details.`);
    }
  } catch (error: any) {
    console.error('Form submission error:', error);
    throw new Error(`Failed to submit to form: ${error.message}`);
  }
}
