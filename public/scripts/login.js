document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const rollNumber = document.getElementById('rollNumber').value.trim();
  const password = document.getElementById('password').value;
  const messageDiv = document.getElementById('message');

  messageDiv.textContent = '';
  messageDiv.className = 'message';

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rollNumber, password })
    });

    const data = await response.json();

    if (response.ok) {
      // Successful login
      localStorage.setItem('token', data.token);
      messageDiv.textContent = 'Login successful! Redirecting...';
      messageDiv.classList.add('success');

      // Redirect based on role
      if (data.role === 'admin') {
        setTimeout(() => window.location.href = 'admin.html', 800);
      } else {
        setTimeout(() => window.location.href = 'student.html', 800);
      }
    } else if (data.needsActivation) {
      // First-time login - prompt to set password
      messageDiv.textContent = 'First time login detected. Please set your password.';
      messageDiv.classList.add('success');

      const newPassword = prompt('Set your new password (minimum 6 characters):');
      if (!newPassword || newPassword.length < 6) {
        messageDiv.textContent = 'Password must be at least 6 characters. Try again.';
        messageDiv.classList.add('error');
        return;
      }

      const confirmPassword = prompt('Confirm your new password:');
      if (newPassword !== confirmPassword) {
        messageDiv.textContent = 'Passwords do not match. Try again.';
        messageDiv.classList.add('error');
        return;
      }

      // Activate account
      const activateRes = await fetch('/api/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rollNumber, password: newPassword })
      });

      const activateData = await activateRes.json();

      if (activateRes.ok) {
        messageDiv.textContent = 'Account activated! Logging you in...';
        messageDiv.classList.add('success');

        // Now log in automatically with new password
        const loginRes = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rollNumber, password: newPassword })
        });

        const loginData = await loginRes.json();

        if (loginRes.ok) {
          localStorage.setItem('token', loginData.token);
          setTimeout(() => window.location.href = 'student.html', 1000);
        } else {
          messageDiv.textContent = loginData.message || 'Auto-login failed. Please login manually.';
          messageDiv.classList.add('error');
        }
      } else {
        messageDiv.textContent = activateData.message || 'Activation failed.';
        messageDiv.classList.add('error');
      }
    } else {
      // Other errors
      messageDiv.textContent = data.message || 'Login failed. Please try again.';
      messageDiv.classList.add('error');
    }
  } catch (err) {
    messageDiv.textContent = 'Network error. Please check your connection.';
    messageDiv.classList.add('error');
    console.error('Login error:', err);
  }
});