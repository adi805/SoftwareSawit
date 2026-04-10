document.querySelector('input[type="text"]').value = 'admin';
document.querySelector('input[type="text"]').dispatchEvent(new Event('input', { bubbles: true }));
document.querySelector('input[type="password"]').value = 'Admin123!';
document.querySelector('input[type="password"]').dispatchEvent(new Event('input', { bubbles: true }));
document.querySelector('button[type="submit"]').click();
