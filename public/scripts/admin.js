// Check if logged in
const token = localStorage.getItem('token');
if (!token) {
  window.location.href = 'index.html';
}

const messageDiv = document.getElementById('message');
const uploadMessage = document.getElementById('uploadMessage');
const activeBody = document.getElementById('activeComplaintsBody');
const historyBody = document.getElementById('historyBody');

// Logout button
document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('token');
  window.location.href = 'index.html';
});

// Handle Excel upload from button
document.getElementById('excelUploadInput')?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  uploadMessage.classList.remove('d-none', 'alert-success', 'alert-danger');
  uploadMessage.classList.add('alert-info');
  uploadMessage.textContent = 'Uploading... Please wait';

  const formData = new FormData();
  formData.append('excel', file);

  try {
    const res = await fetch('/api/upload-students', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    const data = await res.json();

    if (res.ok) {
      uploadMessage.classList.remove('alert-info');
      uploadMessage.classList.add('alert-success');
      uploadMessage.textContent = data.message || `Uploaded Successfully! ${data.count || 0} students added.`;
    } else {
      uploadMessage.classList.remove('alert-info');
      uploadMessage.classList.add('alert-danger');
      uploadMessage.textContent = data.message || 'Upload failed. Check file format.';
    }

    setTimeout(() => uploadMessage.classList.add('d-none'), 6000);
  } catch (err) {
    uploadMessage.classList.remove('alert-info');
    uploadMessage.classList.add('alert-danger');
    uploadMessage.textContent = 'Network error during upload.';
    console.error('Upload error:', err);
  }

  e.target.value = '';
});

// Load active complaints
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
      activeBody.innerHTML = '<tr><td colspan="11" class="text-center py-4">No active complaints found.</td></tr>';
      return;
    }

    complaints.forEach(c => {
      const student = c.studentId || {};
      console.log('Active complaint student data:', student); // Debug (remove later)

      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${student.name || 'Unknown'}</td>
        <td>${student.rollNumber || 'Unknown'}</td>
        <td>${student.mobile || '-'}</td>
        <td>${student.roomNumber || '-'}</td>        <!-- Lab from Excel -->
        <td>${c.roomNumber || '-'}</td>              <!-- Hostel Room from complaint -->
        <td>${c.location || '-'}</td>
        <td>${c.title}</td>
        <td><span class="badge bg-info">${c.category}</span></td>
        <td>${c.description.substring(0, 80)}${c.description.length > 80 ? '...' : ''}</td>
        <td>${c.imagePath ? `<img src="/${c.imagePath}" class="preview" alt="Photo">` : 'No photo'}</td>
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
    console.error('Load active error:', err);
  }
}

// Load resolved history
async function loadHistory() {
  try {
    const res = await fetch('/api/complaints/history', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Failed to load history');

    const history = await res.json();

    historyBody.innerHTML = '';

    if (history.length === 0) {
      historyBody.innerHTML = '<tr><td colspan="10" class="text-center py-4">No resolved complaints yet.</td></tr>';
      return;
    }

    history.forEach(c => {
      const student = c.studentId || {};
      console.log('History complaint student data:', student); // Debug (remove later)

      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${student.name || 'Unknown'}</td>
        <td>${student.rollNumber || 'Unknown'}</td>
        <td>${student.mobile || '-'}</td>
        <td>${student.roomNumber || '-'}</td>        <!-- Lab from Excel -->
        <td>${c.roomNumber || '-'}</td>              <!-- Hostel Room from complaint -->
        <td>${c.location || '-'}</td>
        <td>${c.title}</td>
        <td>${new Date(c.updatedAt).toLocaleString()}</td>
        <td>${c.imagePath ? `<img src="/${c.imagePath}" class="preview" alt="Photo">` : 'No photo'}</td>
        <td>
          <button class="btn btn-sm btn-danger" onclick="deleteComplaint('${c._id}')">Delete</button>
        </td>
      `;
      historyBody.appendChild(row);
    });
  } catch (err) {
    messageDiv.textContent = err.message || 'Error loading history';
    messageDiv.classList.add('error');
    console.error('Load history error:', err);
  }
}

// Update status
window.updateStatus = async (id, newStatus) => {
  if (!confirm(`Mark as "${newStatus}"?`)) return;

  try {
    const res = await fetch(`/api/complaints/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
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
      messageDiv.textContent = data.message || 'Failed to update';
      messageDiv.classList.add('error');
    }
  } catch (err) {
    messageDiv.textContent = 'Network error';
    messageDiv.classList.add('error');
  }
};

// Delete resolved complaint
window.deleteComplaint = async (id) => {
  if (!confirm('Permanently delete this resolved complaint?')) return;

  try {
    const res = await fetch(`/api/complaints/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.ok) {
      messageDiv.textContent = 'Deleted successfully!';
      messageDiv.classList.remove('error');
      messageDiv.classList.add('success');
      loadHistory();
    } else {
      const data = await res.json();
      messageDiv.textContent = data.message || 'Delete failed';
      messageDiv.classList.add('error');
    }
  } catch (err) {
    messageDiv.textContent = 'Network error during delete';
    messageDiv.classList.add('error');
  }
};

// Apply filters
document.getElementById('applyFilterBtn').addEventListener('click', loadActiveComplaints);

// Initial load + auto-refresh
loadActiveComplaints();
loadHistory();
setInterval(() => {
  loadActiveComplaints();
  loadHistory();
}, 5000);
