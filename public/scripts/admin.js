// Check if logged in
const token = localStorage.getItem('token');
if (!token) {
  window.location.href = 'index.html';
}

const messageDiv = document.getElementById('message');
const activeBody = document.getElementById('activeComplaintsBody');
const historyBody = document.getElementById('historyBody');

// Logout button
document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('token');
  window.location.href = 'index.html';
});

// Load active complaints with filters
async function loadActiveComplaints() {
  const category = document.getElementById('filterCategory').value;
  const roomNumber = document.getElementById('filterRoom').value.trim();
  const status = document.getElementById('filterStatus').value;

  let query = '';
  if (category) query += `category=${category}&`;
  if (roomNumber) query += `roomNumber=${roomNumber}&`;
  if (status) query += `status=${status}`;

  try {
    const res = await fetch(`/api/complaints?${query}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('token');
        window.location.href = 'index.html';
      }
      throw new Error('Failed to load active complaints');
    }

    const complaints = await res.json();

    activeBody.innerHTML = '';

    if (complaints.length === 0) {
      activeBody.innerHTML = '<tr><td colspan="8" class="text-center py-4">No active complaints found.</td></tr>';
      return;
    }

    complaints.forEach(c => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${c.studentId?.rollNumber || 'Unknown'}</td>
        <td>${c.title}</td>
        <td><span class="badge bg-info">${c.category}</span></td>
        <td>${c.description.substring(0, 80)}${c.description.length > 80 ? '...' : ''}</td>
        <td>${c.roomNumber}</td>
        <td>
          <span class="badge ${c.status === 'Resolved' ? 'bg-success' : c.status === 'In Progress' ? 'bg-warning' : 'bg-danger'}">
            ${c.status}
          </span>
        </td>
        <td>
          ${c.imagePath ? `<img src="/${c.imagePath}" class="preview" alt="Complaint photo">` : 'No photo'}
        </td>
        <td>
          <button class="btn btn-sm btn-warning me-1" onclick="updateStatus('${c._id}', 'In Progress')">In Progress</button>
          <button class="btn btn-sm btn-success" onclick="updateStatus('${c._id}', 'Resolved')">Resolve</button>
        </td>
      `;
      activeBody.appendChild(row);
    });
  } catch (err) {
    messageDiv.textContent = err.message || 'Error loading active complaints';
    messageDiv.classList.add('error');
  }
}

// Load resolved history (with Delete button)
async function loadHistory() {
  try {
    const res = await fetch('/api/complaints/history', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Failed to load history');

    const history = await res.json();

    historyBody.innerHTML = '';

    if (history.length === 0) {
      historyBody.innerHTML = '<tr><td colspan="8" class="text-center py-4">No resolved complaints yet.</td></tr>';
      return;
    }

    history.forEach(c => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${c.studentId?.rollNumber || 'Unknown'}</td>
        <td>${c.title}</td>
        <td><span class="badge bg-info">${c.category}</span></td>
        <td>${c.description.substring(0, 80)}${c.description.length > 80 ? '...' : ''}</td>
        <td>${c.roomNumber}</td>
        <td>${new Date(c.updatedAt).toLocaleString()}</td>
        <td>
          ${c.imagePath ? `<img src="/${c.imagePath}" class="preview" alt="Complaint photo">` : 'No photo'}
        </td>
        <td>
          <button class="btn btn-sm btn-danger" onclick="deleteComplaint('${c._id}')">Delete</button>
        </td>
      `;
      historyBody.appendChild(row);
    });
  } catch (err) {
    messageDiv.textContent = err.message || 'Error loading history';
    messageDiv.classList.add('error');
  }
}

// Update status function
window.updateStatus = async (id, newStatus) => {
  if (!confirm(`Are you sure you want to mark this as "${newStatus}"?`)) return;

  try {
    const res = await fetch(`/api/complaints/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ status: newStatus })
    });

    if (res.ok) {
      messageDiv.textContent = `Status updated to ${newStatus}!`;
      messageDiv.classList.remove('error');
      messageDiv.classList.add('success');
      loadActiveComplaints();
      loadHistory();
    } else {
      const data = await res.json();
      messageDiv.textContent = data.message || 'Failed to update status';
      messageDiv.classList.add('error');
    }
  } catch (err) {
    messageDiv.textContent = 'Network error';
    messageDiv.classList.add('error');
  }
};

// Delete resolved complaint
window.deleteComplaint = async (id) => {
  if (!confirm('Are you sure you want to permanently delete this resolved complaint? This action cannot be undone.')) return;

  try {
    const res = await fetch(`/api/complaints/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (res.ok) {
      messageDiv.textContent = 'Complaint deleted successfully!';
      messageDiv.classList.remove('error');
      messageDiv.classList.add('success');
      loadHistory(); // Refresh history table
    } else {
      const data = await res.json();
      messageDiv.textContent = data.message || 'Failed to delete complaint';
      messageDiv.classList.add('error');
    }
  } catch (err) {
    messageDiv.textContent = 'Network error during delete';
    messageDiv.classList.add('error');
  }
};

// Apply filters button
document.getElementById('applyFilterBtn').addEventListener('click', () => {
  loadActiveComplaints();
});

// Initial load + auto-refresh every 5 seconds
loadActiveComplaints();
loadHistory();
setInterval(() => {
  loadActiveComplaints();
  loadHistory();
}, 5000);
