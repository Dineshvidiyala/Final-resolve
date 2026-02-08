// Check if logged in
const token = localStorage.getItem('token');
if (!token) {
  window.location.href = 'index.html';
}

const messageDiv = document.getElementById('message');
const submitBtn = document.querySelector('#complaintForm button[type="submit"]');
const complaintsBody = document.getElementById('complaintsTableBody');

// Logout button
document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('token');
  window.location.href = 'index.html';
});

// Load user's complaints (real-time polling every 5 seconds)
async function loadComplaints() {
  try {
    const res = await fetch('/api/my-complaints', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      const data = await res.json();
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('token');
        window.location.href = 'index.html';
      }
      throw new Error(data.message || 'Failed to load complaints');
    }

    const complaints = await res.json();

    complaintsBody.innerHTML = ''; // Clear table

    if (complaints.length === 0) {
      complaintsBody.innerHTML = '<tr><td colspan="8" class="text-center py-4">No complaints submitted yet.</td></tr>';
      return;
    }

    complaints.forEach(c => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${c.title}</td>
        <td><span class="badge bg-info">${c.category}</span></td>
        <td>${c.description.substring(0, 80)}${c.description.length > 80 ? '...' : ''}</td>
        <td>${c.roomNumber || '-'}</td>
        <td>${c.location || '-'}</td>
        <td>
          <span class="badge ${c.status === 'Resolved' ? 'bg-success' : c.status === 'In Progress' ? 'bg-warning' : 'bg-danger'}">
            ${c.status}
          </span>
        </td>
        <td>
          ${c.imagePath ? `<img src="/${c.imagePath}" class="preview" alt="Complaint photo">` : 'No photo'}
        </td>
        <td>${new Date(c.createdAt).toLocaleDateString()}</td>
      `;
      complaintsBody.appendChild(row);
    });
  } catch (err) {
    messageDiv.textContent = err.message || 'Error loading complaints';
    messageDiv.classList.add('error');
  }
}

// Submit new complaint
document.getElementById('complaintForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const location = document.getElementById('location').value;

  if (!location) {
    messageDiv.textContent = 'Please select a Location';
    messageDiv.classList.add('error');
    return;
  }

  // Change button to loading state
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML = 'Submitting...';
  submitBtn.disabled = true;

  const formData = new FormData();
  formData.append('title', document.getElementById('title').value.trim());
  formData.append('category', document.getElementById('category').value);
  formData.append('description', document.getElementById('description').value.trim());
  formData.append('roomNumber', document.getElementById('roomNumber').value.trim());
  formData.append('location', location);

  const imageFile = document.getElementById('image').files[0];
  if (imageFile) {
    formData.append('image', imageFile);
  }

  try {
    const res = await fetch('/api/complaints', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    const data = await res.json();

    if (res.ok) {
      // Success: show Submitted! for 2 seconds
      submitBtn.innerHTML = 'Submitted!';
      submitBtn.classList.add('btn-success');

      messageDiv.textContent = 'Complaint submitted successfully!';
      messageDiv.classList.remove('error');
      messageDiv.classList.add('success');

      // Reset after 2 seconds
      setTimeout(() => {
        submitBtn.innerHTML = originalText;
        submitBtn.classList.remove('btn-success');
        submitBtn.disabled = false;
      }, 2000);

      // Clear form & reload table
      document.getElementById('complaintForm').reset();
      loadComplaints();
    } else {
      messageDiv.textContent = data.message || 'Failed to submit complaint';
      messageDiv.classList.add('error');

      // Reset button on error
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    }
  } catch (err) {
    messageDiv.textContent = 'Network error. Please try again.';
    messageDiv.classList.add('error');

    // Reset button on network error
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;
  }
});

// Initial load + auto-refresh every 5 seconds
loadComplaints();
setInterval(loadComplaints, 5000);
