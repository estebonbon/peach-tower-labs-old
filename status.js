import axios from 'axios';

const apiUrl = 'http://localhost:3000';
let ncrs = [];

function showToast(message, type = 'success') {
    const toastElement = document.getElementById('ncrToast');
    const toastMessage = document.getElementById('ncrToastMessage');

    toastElement.classList.remove(
        'text-bg-success',
        'text-bg-danger',
        'text-bg-secondary'
    );

    const colours = {
        success: 'text-bg-success',
        error: 'text-bg-danger',
        info: 'text-bg-secondary'
    };

    toastElement.classList.add(colours[type] || colours.info);
    toastMessage.textContent = message;

    const toast = window.bootstrap.Toast.getOrCreateInstance(
        toastElement,
        { delay: 5000 }
    );

    toast.show();
}

function filterNCRs() {
    const searchValue = document.getElementById('ncrSearch')
        .value.trim().toLowerCase();

    const activeChecked = document.getElementById('activeOnly').checked;
    const closedChecked = document.getElementById('closedOnly').checked;
    const engineeringChecked = document.getElementById('engineeringOnly').checked;

    const rows = document.getElementById('ncr-table-body').rows;

    ncrs.forEach((ncr, index) => {
        const searchableValues = [
            ncr.ncrNumber,
            ncr.supplier,
            ncr.itemDescription,
            ncr.productId
        ];

        const matchesSearch = searchableValues.some(value =>
            String(value ?? '').toLowerCase().includes(searchValue)
        );

        const matchesStatus =
            (!activeChecked && !closedChecked) ||
            (activeChecked && ncr.status === 'Active') ||
            (closedChecked && ncr.status === 'Closed');

        const matchesEngineering =
            !engineeringChecked || ncr.engineeringRequired === 'yes';

        rows[index].style.display =
            matchesSearch && matchesStatus && matchesEngineering
                ? ''
                : 'none';
    });
}

async function archiveNCR(ncr, button) {
    if (ncr.status !== 'Closed' || button.disabled) return;

    const confirmed = window.confirm(
        `Archive NCR ${ncr.ncrNumber}? It will move from the NCR Log to the Archive page.`
    );

    if (!confirmed) {
        showToast('Archiving cancelled.', 'info');
        return;
    }

    button.disabled = true;
    button.textContent = 'Archiving…';

    try {
        const existing = await axios.get(`${apiUrl}/archives`, {
            params: { id: ncr.id }
        });

        if (existing.data.length === 0) {
            await axios.post(`${apiUrl}/archives`, {
                ...ncr,
                status: 'Archived',
                archivedDate: new Date().toLocaleDateString('en-CA')
            });
        } else {
            const archivedRecord = existing.data[0];

            if (archivedRecord.ncrNumber !== ncr.ncrNumber) {
                throw new Error(
                    'Another archived NCR already uses this record ID.'
                );
            }

            await axios.patch(
                `${apiUrl}/archives/${encodeURIComponent(archivedRecord.id)}`,
                {
                    status: 'Archived'
                }
            );
        }

        await axios.delete(
            `${apiUrl}/ncrForms/${encodeURIComponent(ncr.id)}`
        );
    } catch (error) {
        console.error('Failed to archive NCR:', error);

        showToast(
            'Archiving could not be completed. Please try again. Any saved archive copy will be reused.',
            'error'
        );

        button.disabled = false;
        button.textContent = 'Archive';
        return;
    }

    const refreshed = await getNCRs();

    if (refreshed) {
        showToast(`NCR ${ncr.ncrNumber} was archived successfully.`);
    } else {
        button.textContent = 'Archived';

        showToast(
            `NCR ${ncr.ncrNumber} was archived, but the log could not refresh. Reload the page.`,
            'error'
        );
    }
}

async function getNCRs() {
    try {
        const response = await axios.get(`${apiUrl}/ncrForms`);
        const records = response.data;

        if (!Array.isArray(records)) {
            throw new Error('Unexpected NCR response.');
        }

        const tableBody = document.getElementById('ncr-table-body');
        const fragment = document.createDocumentFragment();

        records.forEach(ncr => {
            const row = document.createElement('tr');

            [ncr.ncrNumber, ncr.supplier, ncr.dateCreated].forEach(value => {
                const cell = document.createElement('td');
                cell.textContent = value ?? '';
                row.appendChild(cell);
            });

            const statusCell = document.createElement('td');
            const status = document.createElement('span');

            status.classList.add('ncr-status');

            if (ncr.status === 'Closed') {
                status.classList.add('closed');
            } else if (ncr.status === 'Active') {
                status.classList.add('active');
            }

            status.textContent = ncr.status;
            statusCell.appendChild(status);
            row.appendChild(statusCell);

            const actionsCell = document.createElement('td');
            const actions = document.createElement('div');

            actions.className =
                'd-flex action-buttons flex-row flex-nowrap justify-content-around align-items-center gap-2';

            const id = encodeURIComponent(ncr.id);

            const detailsLink = document.createElement('a');
            detailsLink.href = `details.html?id=${id}`;
            detailsLink.className = 'btn btn-primary';
            detailsLink.textContent = 'Details';

            detailsLink.setAttribute(
                'aria-label',
                `View details for NCR ${ncr.ncrNumber}`
            );

            actions.appendChild(detailsLink);

            if (ncr.status !== 'Closed') {
                const editLink = document.createElement('a');
                editLink.href = `edit.html?id=${id}`;
                editLink.className = 'btn btn-secondary';
                editLink.textContent = 'Edit';

                editLink.setAttribute(
                    'aria-label',
                    `Edit NCR ${ncr.ncrNumber}`
                );

                actions.appendChild(editLink);
            }

            if (ncr.status === 'Closed') {
                const archiveButton = document.createElement('button');
                archiveButton.type = 'button';
                archiveButton.className = 'btn btn-secondary';
                archiveButton.textContent = 'Archive';

                archiveButton.setAttribute(
                    'aria-label',
                    `Archive NCR ${ncr.ncrNumber}`
                );

                archiveButton.addEventListener('click', () => {
                    archiveNCR(ncr, archiveButton);
                });

                actions.appendChild(archiveButton);
            }

            actionsCell.appendChild(actions);
            row.appendChild(actionsCell);
            fragment.appendChild(row);
        });

        ncrs = records;
        tableBody.replaceChildren(fragment);
        filterNCRs();

        return true;
    } catch (error) {
        console.error('Failed to load NCRs:', error);

        showToast(
            'Could not load the NCR Log. Check that JSON Server is running.',
            'error'
        );

        return false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('ncrSearch')
        .addEventListener('input', filterNCRs);

    ['activeOnly', 'closedOnly', 'engineeringOnly'].forEach(id => {
        document.getElementById(id)
            .addEventListener('change', filterNCRs);
    });

    getNCRs();
});