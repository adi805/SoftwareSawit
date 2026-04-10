(async () => {
  try {
    const res = await fetch('http://localhost:5173/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'Admin123!' })
    });
    const data = await res.json();
    return { status: res.status, data };
  } catch (e) {
    return { error: e.message };
  }
})()
