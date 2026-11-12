<script setup>
import { ref, onMounted, computed } from 'vue';
import axios from 'axios';
import crossfireLogo from '../../images/Crossfire Logo - no bkgd.png';

const ncr = ref(null);
const employee = ref(null);
const loading = ref(true);
const error = ref('');
const engineeringDraft = ref({});
const savingEngineering = ref(false);
const engineeringMessage = ref('');
const engineeringSaveError = ref('');
const engineeringKeys = [
    'engineeringDecision', 'customerNotificationRequired',
    'customerNotificationMessage', 'engineeringDisposition',
    'drawingUpdateRequired', 'originalRevisionNumber',
    'updatedRevisionNumber', 'engineerName', 'revisionDate',
    'engineeringSignOff', 'engineeringSignOffDate', 'engineeringNotes'
];

// Temporary view selector until login roles are available.
const selectedView = ref('inspector');
const isEngineerView = computed(() => selectedView.value === 'engineer');
const engineeringRequired = computed(() =>
    ncr.value?.engineeringRequired === true ||
    String(ncr.value?.engineeringRequired).toLowerCase() === 'yes'
);
const isReadOnly = computed(() =>
    isArchived || ['closed', 'complete', 'completed', 'archived'].includes(
        String(ncr.value?.status ?? '').trim().toLowerCase()
    )
);
const canEdit = computed(() =>
    !isReadOnly.value && (!isEngineerView.value || engineeringRequired.value)
);

const canEditEngineering = computed(() =>
    isEngineerView.value && engineeringRequired.value && !isReadOnly.value
);
const engineeringSource = computed(() =>
    canEditEngineering.value ? engineeringDraft.value : (ncr.value ?? {})
);
const engineeringDirty = computed(() => engineeringKeys.some(key =>
    engineeringDraft.value[key] !== (ncr.value?.[key] ?? '')
));

function resetEngineeringDraft() {
    engineeringDraft.value = Object.fromEntries(
        engineeringKeys.map(key => [key, ncr.value?.[key] ?? ''])
    );
    engineeringMessage.value = '';
    engineeringSaveError.value = '';
}

async function saveEngineering() {
    if (!canEditEngineering.value || savingEngineering.value) return;
    savingEngineering.value = true;
    engineeringMessage.value = '';
    engineeringSaveError.value = '';
    // Only engineering properties are sent; QA fields and status are preserved.
    const updates = Object.fromEntries(
        engineeringKeys.map(key => [key, engineeringDraft.value[key] ?? ''])
    );
    try {
        await axios.patch(
            `http://localhost:3000/ncrForms/${encodeURIComponent(ncrId)}`,
            updates
        );
        Object.assign(ncr.value, updates);
        resetEngineeringDraft();
        engineeringMessage.value = 'Engineering details saved successfully.';
    } catch (err) {
        console.error('Failed to save engineering details:', err);
        engineeringSaveError.value = 'Unable to save engineering details. Your changes are still in the form; please try again.';
    } finally {
        savingEngineering.value = false;
    }
}

// Field names must match the engineering edit form.
// The review decision and work instructions are separate fields.
const engineeringFields = computed(() => {
    const decision = String(engineeringSource.value?.engineeringDecision ?? '')
        .trim().toLowerCase().replace(/[-_]/g, ' ');
    const repairOrRework = ['repair', 'rework'].includes(decision);
    const customerNotification = displayYesNo(
        engineeringSource.value?.customerNotificationRequired
    ) === 'Yes';
    const drawingUpdate = displayYesNo(
        engineeringSource.value?.drawingUpdateRequired
    ) === 'Yes';

    return [
        { key: 'engineeringDecision', label: 'Engineering Decision (Use As Is / Repair / Rework / Scrap)' },
        { key: 'customerNotificationRequired', label: 'Customer Notification Required?', yesNo: true },
        { key: 'customerNotificationMessage', label: 'Customer Notification Message', show: customerNotification, wide: true },
        { key: 'engineeringDisposition', label: 'Disposition — Repair / Rework Instructions', show: repairOrRework, wide: true },
        { key: 'drawingUpdateRequired', label: 'Drawing Update Required?', yesNo: true },
        { key: 'originalRevisionNumber', label: 'Original Revision Number', show: drawingUpdate },
        { key: 'updatedRevisionNumber', label: 'Updated Revision Number', show: drawingUpdate },
        { key: 'engineerName', label: 'Name of Engineer' },
        { key: 'revisionDate', label: 'Revision Date', show: drawingUpdate },
        { key: 'engineeringSignOff', label: 'Engineering Sign-off' },
        { key: 'engineeringSignOffDate', label: 'Engineering Sign-off Date' },
        // Preserve notes from the earlier version when a record contains them.
        { key: 'engineeringNotes', label: 'Additional Engineering Notes', wide: true }
    ];
});

const visibleEngineeringFields = computed(() =>
    engineeringFields.value.filter(field => field.show !== false)
);

const hasEngineeringDetails = computed(() =>
    engineeringFields.value.some(({ key }) => {
        const value = ncr.value?.[key];
        return value != null && String(value).trim() !== '' && value !== 'N/A';
    })
);

const urlParams = new URLSearchParams(window.location.search);
const ncrId = urlParams.get('id');
const isArchived = window.location.pathname.includes("archive-details.html");

// Load the existing NCR and its employee information
async function getNCRDetails() {
    try {
        if (!ncrId) {
            throw new Error('No NCR ID was provided.');
        }

        const params = new URLSearchParams(window.location.search);

        const collection = isArchived ? "archives" : "ncrForms";

        const response = await axios.get(`http://localhost:3000/${collection}/${ncrId}`);

        ncr.value = response.data;
        resetEngineeringDraft();

        // Find the employee associated with this NCR
        if (ncr.value.employeeId) {
            const employeesResponse = await axios.get(
                'http://localhost:3000/employees'
            );

            employee.value = employeesResponse.data.find(
                person => String(person.id) === String(ncr.value.employeeId)
            ) || null;
        }

    } catch (err) {
        console.error('Failed to load NCR details:', err);
        error.value = 'Unable to load this NCR report.';
    } finally {
        loading.value = false;
    }
}

// Display N/A for fields that have no value
function displayValue(value) {
    if (value === null || value === undefined || value === '') {
        return 'N/A';
    }

    return value;
}

// Format yes/no values for display
function displayYesNo(value) {
    if (value === true || String(value).toLowerCase() === 'yes') {
        return 'Yes';
    }

    if (value === false || String(value).toLowerCase() === 'no') {
        return 'No';
    }

    return displayValue(value);
}

const processName = computed(() => {
    const process = ncr.value?.processApplicable;

    if (process === 'supplier-rec-insp') {
        return 'Supplier / Receiving Inspection';
    }

    if (process === 'wip-production-order') {
        return 'WIP / Production Order';
    }

    return displayValue(process);
});

const employeeName = computed(() => {
    if (!employee.value) {
        return displayValue(ncr.value?.employeeId);
    }

    const person = employee.value;

    return person.name ||
        [person.firstName, person.lastName].filter(Boolean).join(' ') ||
        displayValue(ncr.value?.employeeId);
});

onMounted(() => {
    getNCRDetails();
});

// Escape report values before placing them into the new tab's HTML.
function escapeReviewHtml(value) {
    return String(displayValue(value)).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
}

const reviewError = ref('');

function buildReviewHtml() {
    // Preview saved values only, including engineering regardless of selected view.
    const report = ncr.value;
    const logoUrl = new URL(crossfireLogo, window.location.href).href;
    const field = (label, value, wide = false) => `
        <div class="field ${wide ? 'wide' : ''}">
            <div class="label">${escapeReviewHtml(label)}</div>
            <div class="value">${escapeReviewHtml(value)}</div>
        </div>`;
    const section = (title, content) => `
        <section><h2>${escapeReviewHtml(title)}</h2><div class="grid">${content}</div></section>`;
    const qa = section('1 / Quality Representative', [
        field('NCR Number', report.ncrNumber),
        field('Status', report.status),
        field('Date Created', report.dateCreated),
        field('Quality Inspector', employeeName.value),
        field('Process Applicable', processName.value),
        field('Supplier Name', report.supplier),
        field('PO / Production Number', report.poOrProdNum ?? report.referenceNumber),
        field('Sales Order Number', report.salesOrderNumber),
        field('Product ID / SAP Number', report.productId),
        field('Previous NCR Number', report.previousNcrNumber),
        field('Item Description', report.itemDescription, true),
        field('Defect Description', report.defectDescription, true),
        field('Quantity Received', report.quantityReceived),
        field('Quantity Defective', report.quantityDefective),
        field('Item Marked Nonconforming', displayYesNo(report.itemMarkedNonconforming)),
        field('Engineering Review Required?', displayYesNo(report.engineeringRequired))
    ].join(''));
    const decision = String(report.engineeringDecision ?? '').trim().toLowerCase().replace(/[-_]/g, ' ');
    const engineering = [
        field('Engineering Decision', report.engineeringDecision),
        field('Customer Notification Required?', displayYesNo(report.customerNotificationRequired))
    ];
    if (displayYesNo(report.customerNotificationRequired) === 'Yes') {
        engineering.push(field('Customer Notification Message', report.customerNotificationMessage, true));
    }
    if (['repair', 'rework'].includes(decision)) {
        engineering.push(field('Disposition — Repair / Rework Instructions', report.engineeringDisposition, true));
    }
    engineering.push(field('Drawing Update Required?', displayYesNo(report.drawingUpdateRequired)));
    if (displayYesNo(report.drawingUpdateRequired) === 'Yes') {
        engineering.push(
            field('Original Revision Number', report.originalRevisionNumber),
            field('Updated Revision Number', report.updatedRevisionNumber),
            field('Revision Date', report.revisionDate)
        );
    }
    engineering.push(
        field('Name of Engineer', report.engineerName),
        field('Engineering Sign-off', report.engineeringSignOff),
        field('Engineering Sign-off Date', report.engineeringSignOffDate)
    );
    if (report.engineeringNotes) {
        engineering.push(field('Additional Engineering Notes', report.engineeringNotes, true));
    }
    const engineeringSection = section('2 / Engineering', engineeringRequired.value
        ? engineering.join('')
        : field('Engineering Review', displayYesNo(report.engineeringRequired) === 'No'
            ? 'Engineering review not required.'
            : 'Engineering review requirement has not been recorded.', true));

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${window.location.origin} data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>NCR ${escapeReviewHtml(report.ncrNumber)} — Review Page</title>
<style>
* { box-sizing: border-box; }
body { margin: 0; background: #525659; color: #202020; font: 14px Arial, sans-serif; }
.toolbar { background: #323639; color: white; padding: 18px 24px; }
.toolbar strong { display: block; font-size: 16px; }
.toolbar p { margin: 6px 0 0; font-size: 12px; color: #e0e0e0; }
.paper { width: 210mm; min-height: 297mm; margin: 28px auto; padding: 18mm; background: white; box-shadow: 0 3px 15px #0005; }
header { border-bottom: 3px solid #193b59; padding-bottom: 16px; }
.report-header{
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap:20px;
}
.report-heading{
    flex: 1;
    min-width:0;
}

.report-logo{
    display: block;
    width: 140px;
    height:auto;
    flex-shrink: 0;
}
.brand { font-size: 21px; font-weight: bold; color: #193b59; }
h1 { margin: 10px 0; font-size: 23px; }
.document-info { color: #555; font-size: 12px; }
h2 { margin: 24px 0 0; padding: 10px; font-size: 15px; background: #e8eef5; border: 1px solid #b9c5d0; break-after: avoid; }
.grid { display: grid; grid-template-columns: 1fr 1fr; border-left: 1px solid #c9cdd1; }
.field { padding: 12px; border-right: 1px solid #c9cdd1; border-bottom: 1px solid #c9cdd1; min-width: 0; break-inside: avoid; }
.wide { grid-column: 1 / -1; }
.label { font-size: 11px; color: #505a64; font-weight: bold; margin-bottom: 7px; }
.value { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.5; }
footer { margin-top: 26px; padding-top: 10px; border-top: 1px solid #bbb; font-size: 11px; color: #555; }
@media (max-width: 820px) { .paper { width: calc(100% - 24px); padding: 24px; min-height: 0; } }
@media print { body { background: white; } .toolbar { display: none; } .paper { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; } @page { size: A4; margin: 15mm; } }
</style>
</head>
<body>
<div class="toolbar"><strong>Review Page — NCR ${escapeReviewHtml(report.ncrNumber)}</strong><p>Read-only preview of saved report details.${engineeringDirty.value ? ' Unsaved engineering changes are not included.' : ''}</p></div>
<main class="paper">
<header class="report-header">
    <div class="report-heading">
        <div class="brand">CrossFire Canada</div>
        <h1>Non-Conformance Report</h1>
        <div class="document-info">Document No. OPS-00011 | NCR ${escapeReviewHtml(report.ncrNumber)}</div>
        </div>
    <img 
        class="report-logo"
        src="${escapeReviewHtml(logoUrl)}"
        alt="CrossFire Canada Logo">
</header>
${qa}${engineeringSection}
<footer>Read-only report preview · Saved details at the time this tab was opened.</footer>
</main>
</body>
</html>`;
}

function openReviewPage() {
    if (!ncr.value) return;
    reviewError.value = '';
    const html = buildReviewHtml();
    const preview = window.open('', '_blank');
    if (!preview) {
        reviewError.value = 'The review tab was blocked. Allow pop-ups for this site and try again.';
        return;
    }
    preview.opener = null;
    preview.document.open();
    preview.document.write(html);
    preview.document.close();
}

</script>

<template>
    <main class="content">
        <div class="row justify-content-center">
            <div class="col-12">
                <section>
                    <div class="p-4 p-md-5">

                        <!-- Page Heading -->
                        <header class="form-header mb-4">
                            <div class="header-content">
                                <span class="header-extra">
                                    QUALITY MANAGEMENT NCR
                                </span>

                                <h1 class="h2 mb-2">
                                    Non-Conformance Report Details
                                </h1>

                                <p class="mb-0 text-secondary">
                                    CrossFire Canada — Document No. OPS-00011.
                                    Review the information recorded for this non-conformance report.
                                </p>
                            </div>
                        </header>

                        <div v-if="loading" class="py-5 text-center">
                            Loading NCR details...
                        </div>

                        <div v-else-if="error" class="alert alert-danger">
                            {{ error }}
                        </div>

                        <template v-else-if="ncr">

                            <!-- Display preview only; login will supply the actual role. -->
                            <div class="mb-4">
                                <p id="role-view-label" class="fw-semibold mb-2">View report as:</p>
                                <div class="d-flex flex-wrap gap-2" role="group" aria-labelledby="role-view-label">
                                    <button
                                        v-for="role in [{ value: 'inspector', label: 'Quality Inspector' }, { value: 'engineer', label: 'Engineer' }]"
                                        :key="role.value"
                                        type="button"
                                        class="btn"
                                        :class="selectedView === role.value ? 'btn-primary' : 'btn-outline-primary'"
                                        :aria-pressed="selectedView === role.value"
                                        @click="selectedView = role.value"
                                    >
                                        {{ role.label }}
                                    </button>
                                </div>
                                <p class="small text-secondary mt-2 mb-0">QA information is read-only. Engineer view allows engineering updates on open reports.</p>
                            </div>
                            <p v-if="engineeringDirty" class="text-warning" role="status">
                                You have unsaved engineering changes. Switch back to Engineer view to save or cancel them before leaving this page.
                            </p>
                            <div v-if="isReadOnly" class="alert alert-info" role="status">
                                This report is closed or archived and is available for viewing only.
                            </div>

                            <!-- NCR number and status -->
                            <div class="report-summary mb-4">
                                <div>
                                    <span class="summary-label">NCR REPORT</span>
                                    <h2 class="report-number mb-0">
                                        {{ displayValue(ncr.ncrNumber) }}
                                    </h2>
                                </div>

                                <span
                                    class="status-badge"
                                    :class="ncr.status === 'Closed' ? 'closed' : 'active'"
                                >
                                    {{ displayValue(ncr.status) }}
                                </span>
                            </div>

                            <!-- Report Information -->
                            <section class="detail-section">
                                <h2 class="section-heading">Report Information</h2>

                                <div class="row g-4">
                                    <div class="col-md-4">
                                        <div class="detail-label">NCR Number</div>
                                        <div class="detail-value">
                                            {{ displayValue(ncr.ncrNumber) }}
                                        </div>
                                    </div>

                                    <div class="col-md-4">
                                        <div class="detail-label">Date Created</div>
                                        <div class="detail-value">
                                            {{ displayValue(ncr.dateCreated) }}
                                        </div>
                                    </div>

                                    <div class="col-md-4">
                                        <div class="detail-label">Quality Inspector</div>
                                        <div class="detail-value">
                                            {{ employeeName }}
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <!-- Supplier and Product Information -->
                            <section class="detail-section">
                                <h2 class="section-heading">
                                    Supplier &amp; Product Information
                                </h2>

                                <div class="row g-4">
                                    <div class="col-md-6">
                                        <div class="detail-label">Supplier</div>
                                        <div class="detail-value">
                                            {{ displayValue(ncr.supplier) }}
                                        </div>
                                    </div>

                                    <div class="col-md-6">
                                        <div class="detail-label">Product ID / SAP Number</div>
                                        <div class="detail-value">
                                            {{ displayValue(ncr.productId) }}
                                        </div>
                                    </div>

                                    <div class="col-12">
                                        <div class="detail-label">Item Description</div>
                                        <div class="detail-value">
                                            {{ displayValue(ncr.itemDescription) }}
                                        </div>
                                    </div>

                                    <div class="col-md-4">
                                        <div class="detail-label">PO / Production Number</div>
                                        <div class="detail-value">
                                            {{ displayValue(ncr.poOrProdNum ?? ncr.referenceNumber) }}
                                        </div>
                                    </div>

                                    <div class="col-md-4">
                                        <div class="detail-label">Sales Order Number</div>
                                        <div class="detail-value">
                                            {{ displayValue(ncr.salesOrderNumber) }}
                                        </div>
                                    </div>

                                    <div class="col-md-4">
                                        <div class="detail-label">Previous NCR Number</div>
                                        <div class="detail-value">
                                            {{ displayValue(ncr.previousNcrNumber) }}
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <!-- Defect Information -->
                            <section class="detail-section">
                                <h2 class="section-heading">Defect Information</h2>

                                <div class="row g-4">
                                    <div class="col-md-4">
                                        <div class="detail-label">Item Marked Nonconforming</div>
                                        <div class="detail-value">
                                            {{ displayYesNo(ncr.itemMarkedNonconforming) }}
                                        </div>
                                    </div>

                                    <div class="col-md-4">
                                        <div class="detail-label">Quantity Received</div>
                                        <div class="detail-value">
                                            {{ displayValue(ncr.quantityReceived) }}
                                        </div>
                                    </div>

                                    <div class="col-md-4">
                                        <div class="detail-label">Quantity Defective</div>
                                        <div class="detail-value">
                                            {{ displayValue(ncr.quantityDefective) }}
                                        </div>
                                    </div>

                                    <div class="col-12">
                                        <div class="detail-label">Defect Description</div>
                                        <div class="description-box">
                                            {{ displayValue(ncr.defectDescription) }}
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <!-- Review requirement remains visible to both roles. -->
                            <section class="detail-section">
                                <h2 class="section-heading">Engineering Review</h2>

                                <div class="row g-4">
                                    <div class="col-md-6">
                                        <div class="detail-label">Process Applicable</div>
                                        <div class="detail-value">
                                            {{ processName }}
                                        </div>
                                    </div>

                                    <div class="col-md-6">
                                        <div class="detail-label">Engineering Review Required?</div>
                                        <div class="detail-value">
                                            {{ displayYesNo(ncr.engineeringRequired) }}
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <p v-if="!engineeringRequired" class="alert alert-info" role="status">
                                {{ displayYesNo(ncr.engineeringRequired) === 'No'
                                    ? 'Engineering review not required.'
                                    : 'Engineering review requirement has not been recorded.' }}
                            </p>

                            <section v-else-if="isEngineerView" class="detail-section">
                                <h2 class="section-heading">Engineering Details &amp; Sign-off</h2>
                                <p v-if="!hasEngineeringDetails" class="text-secondary">
                                    Engineering details and sign-off have not been recorded yet.
                                </p>
                                <form @submit.prevent="saveEngineering">
                                    <fieldset :disabled="savingEngineering" class="border-0 p-0 m-0">
                                        <div class="row g-4">
                                            <div v-for="field in visibleEngineeringFields" :key="field.key" :class="field.wide ? 'col-12' : 'col-md-6'">
                                                <template v-if="canEditEngineering">
                                                    <label class="detail-label d-block" :for="`engineering-${field.key}`">{{ field.label }}</label>
                                                    <select v-if="field.key === 'engineeringDecision'" :id="`engineering-${field.key}`" v-model="engineeringDraft[field.key]" class="form-select">
                                                        <option value="">Select a decision</option>
                                                        <option>Use As Is</option>
                                                        <option>Repair</option>
                                                        <option>Rework</option>
                                                        <option>Scrap</option>
                                                    </select>
                                                    <select v-else-if="field.yesNo" :id="`engineering-${field.key}`" v-model="engineeringDraft[field.key]" class="form-select">
                                                        <option value="">Select Yes or No</option>
                                                        <option value="yes">Yes</option>
                                                        <option value="no">No</option>
                                                        <option v-if="typeof engineeringDraft[field.key] === 'boolean'" :value="engineeringDraft[field.key]">{{ displayYesNo(engineeringDraft[field.key]) }}</option>
                                                    </select>
                                                    <textarea v-else-if="field.wide" :id="`engineering-${field.key}`" v-model="engineeringDraft[field.key]" class="form-control" rows="4"></textarea>
                                                    <input v-else :id="`engineering-${field.key}`" v-model="engineeringDraft[field.key]" :type="field.key === 'revisionDate' || field.key === 'engineeringSignOffDate' ? 'date' : 'text'" class="form-control">
                                                </template>
                                                <template v-else>
                                                    <div class="detail-label">{{ field.label }}</div>
                                                    <div class="detail-value engineering-value">{{ field.yesNo ? displayYesNo(ncr[field.key]) : displayValue(ncr[field.key]) }}</div>
                                                </template>
                                            </div>
                                        </div>
                                        <div v-if="canEditEngineering" class="d-flex flex-wrap gap-2 mt-4">
                                            <button type="submit" class="btn btn-primary">{{ savingEngineering ? 'Saving…' : 'Save Engineering Details' }}</button>
                                            <button type="button" class="btn btn-outline-secondary" @click="resetEngineeringDraft">Cancel Changes</button>
                                        </div>
                                    </fieldset>
                                    <p v-if="canEditEngineering" class="small text-secondary mt-2">Saving records these fields, including the sign-off name and date. It does not change the workflow status or send notifications.</p>
                                    <p v-if="engineeringMessage" class="alert alert-success mt-3" role="status">{{ engineeringMessage }}</p>
                                    <p v-if="engineeringSaveError" class="alert alert-danger mt-3" role="alert">{{ engineeringSaveError }}</p>
                                </form>
                            </section>

                            <!-- Navigation Buttons -->
                            <div class="action-buttons d-flex flex-wrap gap-3 mt-4">
                                <a :href="isArchived ? 'archive.html' : 'ncr-log.html'" class="btn btn-primary">
                                    {{ isArchived ? 'Back to Archives' : 'Back to NCR Log' }}
                                </a>

                                <a v-if="canEdit && !isEngineerView" :href="`edit.html?id=${encodeURIComponent(ncrId)}&amp;role=${selectedView}`" class="btn btn-secondary">
                                <i class="fas fa-pen me-2" aria-hidden="true"></i>
                                    Edit NCR
                                </a>
                                <button type="button" class="btn btn-outline-primary" :disabled="savingEngineering" @click="openReviewPage">
                                <i class="fas fa-file-alt me-2" aria-hidden="true"></i>
                                    Review Page
                                </button>
                            </div>
                            <p v-if="reviewError" class="alert alert-warning mt-3" role="alert">{{ reviewError }}</p>

                        </template>

                        <div v-else class="alert alert-warning">
                            NCR not found.
                        </div>

                    </div>
                </section>
            </div>
        </div>
    </main>
</template>

<style scoped>
.engineering-value {
    white-space: pre-wrap;
}

.content {
    background-color: white;
}

.form-header {
    background: #e8eef5;
    border-left: 6px solid #193b59;
    border-radius: 12px;
    padding: 32px;
}

.header-extra {
    color: #536c83;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 2px;
}

.form-header h1 {
    color: #193b59;
    font-weight: 700;
    margin-top: 14px;
}

.report-summary {
    background: #f3f6f9;
    border: 1px solid #e1e7ed;
    border-radius: 10px;
    padding: 22px 26px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
}

.summary-label {
    color: #65798b;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 1.5px;
}

.report-number {
    color: #193b59;
    font-size: 1.6rem;
    font-weight: 700;
    margin-top: 6px;
}

.status-badge {
    border-radius: 30px;
    padding: 7px 16px;
    font-size: 0.85rem;
    font-weight: 700;
}

.status-badge.active {
    background: #e3f3e9;
    color: #226b43;
}

.status-badge.closed {
    background: #e9edf1;
    color: #536170;
}

.detail-section {
    padding: 28px 0;
    border-bottom: 1px solid #e0e6ed;
}

.section-heading {
    color: #193b59;
    font-size: 1.45rem;
    font-weight: 700;
    margin-bottom: 28px;
}

.detail-label {
    color: #6c7d8b;
    font-size: 0.85rem;
    font-weight: 600;
    margin-bottom: 8px;
}

.detail-value {
    color: #23384b;
    font-size: 1rem;
    font-weight: 600;
    overflow-wrap: anywhere;
}

.description-box {
    background: #f4f6f8;
    border: 1px solid #e0e6ed;
    border-radius: 8px;
    padding: 18px;
    color: #23384b;
    line-height: 1.7;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}

.action-buttons {
    padding-top: 12px;
}

.action-buttons .btn {
    padding: 11px 20px;
    font-weight: 600;
    border-radius: 7px;
}

.action-buttons .btn-primary {
    background: #193b59;
    border-color: #193b59;
}

.action-buttons .btn-primary:hover {
    background: #285779;
    border-color: #285779;
}
</style>
