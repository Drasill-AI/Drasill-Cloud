import { BrowserWindow, dialog, app } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Deal, DealActivity } from '@drasill/shared';

/**
 * Get the Drasill logo as base64 data URL
 */
async function getLogoBase64(): Promise<string> {
  try {
    // In production, assets are in the app.asar
    const isDev = !app.isPackaged;
    const logoPath = isDev
      ? path.join(__dirname, '../../renderer/src/assets/logo.png')
      : path.join(process.resourcesPath, 'assets/logo.png');
    
    const logoBuffer = await fs.readFile(logoPath);
    return `data:image/png;base64,${logoBuffer.toString('base64')}`;
  } catch (error) {
    console.error('[PDF Export] Failed to load logo:', error);
    return ''; // Return empty string if logo fails to load
  }
}

/**
 * Format currency value
 */
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format date string
 */
function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Get stage display name and color
 */
function getStageInfo(stage: string): { label: string; color: string } {
  const stages: Record<string, { label: string; color: string }> = {
    'lead': { label: 'Lead', color: '#6B7280' },
    'application': { label: 'Application', color: '#3B82F6' },
    'underwriting': { label: 'Underwriting', color: '#F59E0B' },
    'approved': { label: 'Approved', color: '#10B981' },
    'funded': { label: 'Funded', color: '#8B5CF6' },
    'closed': { label: 'Closed', color: '#22C55E' },
    'declined': { label: 'Declined', color: '#EF4444' },
  };
  return stages[stage] || { label: stage.charAt(0).toUpperCase() + stage.slice(1), color: '#6B7280' };
}

/**
 * Get activity icon HTML - colored dot indicators
 */
function getActivityIcon(type: string): string {
  const colors: Record<string, string> = {
    'call': '#34D399',
    'email': '#60A5FA',
    'meeting': '#A78BFA',
    'note': '#9CA3AF',
    'document': '#FB923C',
    'stage_change': '#EC4899',
    'task': '#10B981',
  };
  const color = colors[type] || '#6B7280';
  return `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};"></span>`;
}

/**
 * Generate HTML for a deal report
 */
export function generateDealReportHTML(deal: Deal, activities: DealActivity[], logoBase64: string = ''): string {
  const stageInfo = getStageInfo(deal.stage);
  
  const activitiesHTML = activities.length > 0 
    ? activities.map(activity => `
      <div class="activity">
        <div class="activity-icon">${getActivityIcon(activity.type)}</div>
        <div class="activity-content">
          <div class="activity-header">
            <span class="activity-type">${activity.type.charAt(0).toUpperCase() + activity.type.slice(1)}</span>
            <span class="activity-date">${formatDate(activity.performedAt)}</span>
          </div>
          <div class="activity-description">${activity.description}</div>
          ${activity.metadata ? `<div class="activity-metadata">${activity.metadata}</div>` : ''}
        </div>
      </div>
    `).join('')
    : '<p class="no-activities">No activities recorded for this deal.</p>';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Deal Report - ${deal.borrowerName}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      color: #1F2937;
      line-height: 1.5;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
    }
    
    .header {
      border-bottom: 2px solid #E5E7EB;
      padding-bottom: 24px;
      margin-bottom: 32px;
    }
    
    .logo {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 16px;
    }
    
    .logo img {
      width: 32px;
      height: 32px;
      object-fit: contain;
    }
    
    .logo-text {
      font-size: 14px;
      font-weight: 500;
      color: #4C8DFF;
    }
    
    .deal-name {
      font-size: 28px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 8px;
    }
    
    .deal-company {
      font-size: 18px;
      color: #4B5563;
      margin-bottom: 16px;
    }
    
    .stage-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 500;
      color: white;
    }
    
    .metrics {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
      margin-bottom: 32px;
    }
    
    .metric {
      background: #F9FAFB;
      padding: 20px;
      border-radius: 8px;
      border: 1px solid #E5E7EB;
    }
    
    .metric-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #6B7280;
      margin-bottom: 4px;
    }
    
    .metric-value {
      font-size: 24px;
      font-weight: 600;
      color: #111827;
    }
    
    .section {
      margin-bottom: 32px;
    }
    
    .section-title {
      font-size: 18px;
      font-weight: 600;
      color: #111827;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid #E5E7EB;
    }
    
    .details-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
    
    .detail-item {
      background: #F9FAFB;
      padding: 12px 16px;
      border-radius: 6px;
    }
    
    .detail-label {
      font-size: 12px;
      color: #6B7280;
      margin-bottom: 4px;
    }
    
    .detail-value {
      font-size: 14px;
      color: #111827;
    }
    
    .activity {
      display: flex;
      gap: 12px;
      padding: 16px 0;
      border-bottom: 1px solid #F3F4F6;
    }
    
    .activity:last-child {
      border-bottom: none;
    }
    
    .activity-icon {
      font-size: 20px;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #F3F4F6;
      border-radius: 6px;
    }
    
    .activity-content {
      flex: 1;
    }
    
    .activity-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }
    
    .activity-type {
      font-weight: 500;
      color: #111827;
    }
    
    .activity-date {
      font-size: 12px;
      color: #6B7280;
    }
    
    .activity-description {
      font-size: 14px;
      color: #4B5563;
    }
    
    .activity-metadata {
      font-size: 12px;
      color: #9CA3AF;
      margin-top: 4px;
      font-family: monospace;
    }
    
    .no-activities {
      color: #6B7280;
      font-style: italic;
      padding: 16px 0;
    }
    
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #E5E7EB;
      font-size: 12px;
      color: #9CA3AF;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">
      ${logoBase64 ? `<img src="${logoBase64}" alt="Drasill Logo" />` : ''}
      <span class="logo-text">Drasill Finance - Deal Report</span>
    </div>
    <h1 class="deal-name">${deal.borrowerName}</h1>
    <div class="deal-company">Deal #${deal.dealNumber}</div>
    <span class="stage-badge" style="background-color: ${stageInfo.color}">${stageInfo.label}</span>
  </div>
  
  <div class="metrics">
    <div class="metric">
      <div class="metric-label">Loan Amount</div>
      <div class="metric-value">${formatCurrency(deal.loanAmount)}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Interest Rate</div>
      <div class="metric-value">${deal.interestRate ?? 'N/A'}${deal.interestRate ? '%' : ''}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Expected Close</div>
      <div class="metric-value" style="font-size: 18px">${formatDate(deal.expectedCloseDate ?? null)}</div>
    </div>
  </div>
  
  <div class="section">
    <h2 class="section-title">Deal Details</h2>
    <div class="details-grid">
      <div class="detail-item">
        <div class="detail-label">Contact</div>
        <div class="detail-value">${deal.borrowerContact || 'N/A'}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Term</div>
        <div class="detail-value">${deal.termMonths ? `${deal.termMonths} months` : 'N/A'}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Created</div>
        <div class="detail-value">${formatDate(deal.createdAt ?? null)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Last Updated</div>
        <div class="detail-value">${formatDate(deal.updatedAt ?? null)}</div>
      </div>
    </div>
  </div>
  
  ${deal.collateralDescription ? `
  <div class="section">
    <h2 class="section-title">Collateral</h2>
    <p style="color: #4B5563; white-space: pre-wrap;">${deal.collateralDescription}</p>
  </div>
  ` : ''}
  
  ${deal.notes ? `
  <div class="section">
    <h2 class="section-title">Notes</h2>
    <p style="color: #4B5563; white-space: pre-wrap;">${deal.notes}</p>
  </div>
  ` : ''}
  
  <div class="section">
    <h2 class="section-title">Activity Timeline (${activities.length} activities)</h2>
    ${activitiesHTML}
  </div>
  
  <div class="footer">
    Generated by Drasill Finance on ${new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}
  </div>
</body>
</html>
  `;
}

/**
 * Generate HTML for pipeline summary report
 */
export function generatePipelineReportHTML(deals: Deal[], logoBase64: string = ''): string {
  const totalValue = deals.reduce((sum, d) => sum + d.loanAmount, 0);
  
  const stageGroups = deals.reduce((acc, deal) => {
    if (!acc[deal.stage]) {
      acc[deal.stage] = { deals: [], value: 0 };
    }
    acc[deal.stage].deals.push(deal);
    acc[deal.stage].value += deal.loanAmount;
    return acc;
  }, {} as Record<string, { deals: Deal[]; value: number }>);

  const stageOrder = ['lead', 'application', 'underwriting', 'approved', 'funded', 'closed', 'declined'];
  
  const stagesHTML = stageOrder
    .filter(stage => stageGroups[stage])
    .map(stage => {
      const group = stageGroups[stage];
      const stageInfo = getStageInfo(stage);
      return `
        <div class="stage-section">
          <div class="stage-header">
            <span class="stage-badge" style="background-color: ${stageInfo.color}">${stageInfo.label}</span>
            <span class="stage-summary">${group.deals.length} deals · ${formatCurrency(group.value)}</span>
          </div>
          <div class="stage-deals">
            ${group.deals.map(deal => `
              <div class="deal-row">
                <div class="deal-info">
                  <div class="deal-name">${deal.borrowerName}</div>
                  <div class="deal-company">Deal #${deal.dealNumber}</div>
                </div>
                <div class="deal-value">${formatCurrency(deal.loanAmount)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Pipeline Report - Drasill Finance</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #1F2937;
      line-height: 1.5;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
    }
    
    .header {
      border-bottom: 2px solid #E5E7EB;
      padding-bottom: 24px;
      margin-bottom: 32px;
    }
    
    .logo {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
    }
    
    .logo img {
      width: 40px;
      height: 40px;
      object-fit: contain;
    }
    
    .logo-text {
      font-size: 16px;
      font-weight: 600;
      color: #4C8DFF;
    }
    
    .title {
      font-size: 28px;
      font-weight: 700;
      color: #111827;
    }
    
    .date {
      font-size: 14px;
      color: #6B7280;
      margin-top: 4px;
    }
    
    .metrics {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
      margin-bottom: 32px;
    }
    
    .metric {
      background: #F9FAFB;
      padding: 20px;
      border-radius: 8px;
      border: 1px solid #E5E7EB;
    }
    
    .metric-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #6B7280;
      margin-bottom: 4px;
    }
    
    .metric-value {
      font-size: 24px;
      font-weight: 600;
      color: #111827;
    }
    
    .stage-section {
      margin-bottom: 24px;
    }
    
    .stage-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #E5E7EB;
    }
    
    .stage-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 500;
      color: white;
    }
    
    .stage-summary {
      font-size: 14px;
      color: #6B7280;
    }
    
    .stage-deals {
      padding-left: 8px;
    }
    
    .deal-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      border-radius: 6px;
      margin-bottom: 4px;
    }
    
    .deal-row:hover {
      background: #F9FAFB;
    }
    
    .deal-info {
      flex: 1;
    }
    
    .deal-row .deal-name {
      font-weight: 500;
      color: #111827;
      font-size: 14px;
    }
    
    .deal-row .deal-company {
      font-size: 12px;
      color: #6B7280;
    }
    
    .deal-value {
      font-weight: 600;
      color: #111827;
    }
    
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #E5E7EB;
      font-size: 12px;
      color: #9CA3AF;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">
      ${logoBase64 ? `<img src="${logoBase64}" alt="Drasill Logo" />` : ''}
      <span class="logo-text">Drasill Finance</span>
    </div>
    <h1 class="title">Pipeline Report</h1>
    <div class="date">Generated on ${new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric'
    })}</div>
  </div>
  
  <div class="metrics">
    <div class="metric">
      <div class="metric-label">Total Deals</div>
      <div class="metric-value">${deals.length}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Pipeline Value</div>
      <div class="metric-value">${formatCurrency(totalValue)}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Avg Deal Size</div>
      <div class="metric-value">${formatCurrency(deals.length > 0 ? totalValue / deals.length : 0)}</div>
    </div>
  </div>
  
  ${stagesHTML}
  
  <div class="footer">
    Generated by Drasill Finance
  </div>
</body>
</html>
  `;
}

/**
 * Export deal to PDF using Electron's printToPDF
 */
export async function exportDealToPDF(
  mainWindow: BrowserWindow,
  deal: Deal, 
  activities: DealActivity[]
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  try {
    // Show save dialog
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Deal Report',
      defaultPath: `${deal.borrowerName.replace(/[^a-z0-9]/gi, '_')}_report.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });

    if (canceled || !filePath) {
      return { success: false, error: 'Export cancelled' };
    }

    // Load the logo and generate HTML
    const logoBase64 = await getLogoBase64();
    const html = generateDealReportHTML(deal, activities, logoBase64);

    // Create a hidden window to render PDF
    const pdfWindow = new BrowserWindow({
      width: 800,
      height: 1000,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    // Load HTML content
    await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    // Wait for page to fully render
    await new Promise(resolve => setTimeout(resolve, 500));

    // Generate PDF
    const pdfData = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      pageSize: 'Letter',
    });

    // Close hidden window
    pdfWindow.close();

    // Write PDF to file
    await fs.writeFile(filePath, pdfData);

    return { success: true, filePath };
  } catch (error) {
    console.error('[PDF Export] Error:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Export pipeline report to PDF
 */
export async function exportPipelineToPDF(
  mainWindow: BrowserWindow,
  deals: Deal[]
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  try {
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Pipeline Report',
      defaultPath: `Pipeline_Report_${new Date().toISOString().split('T')[0]}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });

    if (canceled || !filePath) {
      return { success: false, error: 'Export cancelled' };
    }

    // Load the logo
    const logoBase64 = await getLogoBase64();
    const html = generatePipelineReportHTML(deals, logoBase64);

    const pdfWindow = new BrowserWindow({
      width: 800,
      height: 1000,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise(resolve => setTimeout(resolve, 500));

    const pdfData = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      pageSize: 'Letter',
    });

    pdfWindow.close();
    await fs.writeFile(filePath, pdfData);

    return { success: true, filePath };
  } catch (error) {
    console.error('[PDF Export] Error:', error);
    return { success: false, error: String(error) };
  }
}
