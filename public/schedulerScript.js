document.addEventListener('DOMContentLoaded', function() {
    const objectSelect = document.getElementById('newObjectNames');
    const searchInput = document.getElementById('searchObjects');
    const selectedDisplay = document.getElementById('selectedObjects');
    const cronJobsTableBody = document.getElementById('cronJobsTableBody');

    // Update selected objects display
    objectSelect.onchange = function() {
        let selected = Array.from(this.selectedOptions).map(opt => opt.text).join(', ');
        selectedDisplay.textContent = selected || 'None';
    };

    // Search functionality
    searchInput.onkeyup = function() {
        let searchText = this.value.toLowerCase();
        Array.from(objectSelect.options).forEach(function(option) {
            option.style.display = option.text.toLowerCase().includes(searchText) ? 'block' : 'none';
        });
    };

    // Clear form
    document.getElementById('clearForm').onclick = function() {
        objectSelect.selectedIndex = -1;
        document.getElementById('newCronExpression').value = '';
        selectedDisplay.textContent = 'None';
    };

    // Form submission for adding new cron jobs
    document.getElementById('addCronForm').addEventListener('submit', function(e) {
        e.preventDefault();
        submitNewCronJob();
    });

    function submitNewCronJob() {
        const selectedObjects = Array.from(objectSelect.selectedOptions).map(option => option.value);
        const cronExpression = document.getElementById('newCronExpression').value;
    
        fetch('/api/cron-jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ objectNames: selectedObjects, cronExpression })
        })
       .then(response => {
            if (response.ok) {
                return response.json();
            } else {
                throw new Error(`Error creating cron job Check input`);
            }
        })
       .then(data => {
            console.log('Success:', data);
            bootstrap.Modal.getInstance(document.getElementById('addCronModal')).hide();
            fetchCronJobs(); // Refresh cron jobs list
    
            // Restart server and refresh page
            fetch('/api/restart-server', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            })
           .then(response => {
                if (response.ok) {
                    console.log('Server restarted successfully');
                    location.reload()
                } else {
                    throw new Error('Error restarting server');
                }
            })
            
           .catch(error => {
                console.error('Error:', error);
                alert(`Server Updating`);
            });
        })
       .catch(error => {
            console.error('Error:', error);
            alert(`Error creating cron job: ${error.message}`);
        });
    }

    // Fetch and display cron jobs
    function fetchCronJobs() {
        fetch('/api/cron-jobs')
        .then(response => response.json())
        .then(data => populateCronJobsTable(data))
        .catch(error => console.error('Failed to fetch cron jobs:', error));
    }

    function populateCronJobsTable(data) {
        cronJobsTableBody.innerHTML = '';
        data.forEach(job => {
            const row = document.createElement('tr');
            const lastRun = job.LastRunTime ? new Date(job.LastRunTime).toLocaleString() : 'Never';
            const nextRun = job.NextRunTime ? new Date(job.NextRunTime).toLocaleString() : 'Calculating...';
            row.innerHTML = `
                <td>${job.CronExpression}</td>
                <td>${job.ObjectName}</td>
                <td>${lastRun}</td>
                <td>${nextRun}</td>
                <td>
                    <button class="btn btn-primary btn-sm" onclick="openEditModal(${job.Id})">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteCronJob(${job.Id}, this)">Delete</button>
                </td>
            `;
            cronJobsTableBody.appendChild(row);
        });
    }
    

    // Edit modal functionality
    window.openEditModal = function(cronId) {
        fetch(`/api/cron-jobs/${cronId}`)
        .then(response => response.json())
        .then(data => {
            document.getElementById('editCronId').value = cronId;
            document.getElementById('editObjectNames').value = data.ObjectName;
            document.getElementById('editCronExpression').value = data.CronExpression;
            new bootstrap.Modal(document.getElementById('editCronModal')).show();
        })
        .catch(error => console.error('Error fetching cron job details:', error));
    };

    // Delete cron job
    window.deleteCronJob = function(cronId, element) {
        if (confirm('Are you sure you want to delete this cron job?')) {
            fetch(`/api/cron-jobs/${cronId}`, { method: 'DELETE' })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert('Cron job deleted successfully!');
                    element.closest('tr').remove();
                    
                } else {
                    alert('Failed to delete cron job: ' + data.message);
                }
            })
            .catch(error => {
                console.error('Error deleting cron job:', error);
                alert('Failed to delete cron job.');
            });
        }
    };

    // Updating cron job
    document.getElementById('editCronForm').addEventListener('submit', function(event) {
        event.preventDefault();
        updateCronJob();
    });

    function updateCronJob() {
        const cronId = document.getElementById('editCronId').value;
        const objectNames = document.getElementById('editObjectNames').value;
        const cronExpression = document.getElementById('editCronExpression').value;

        fetch(`/api/cron-jobs/${cronId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ objectNames, cronExpression })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert('Cron job updated successfully!');
                new bootstrap.Modal(document.getElementById('editCronModal')).hide();
                fetchCronJobs(); // Refresh the list of cron jobs
            } else {
                alert('Error updating cron job: ' + data.message);
            }
        })
        .catch(error => {
            console.error('Error updating cron job:', error);
            alert('Failed to update cron job.');
        });
    }

    fetchCronJobs(); 
});