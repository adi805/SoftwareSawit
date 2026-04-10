const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Get the stored hash from the database
const storedHash = '****************************************************************'; // Replace with actual hash from check-db.js output

// Test with the actual stored hash
console.log('Stored hash from DB: (see check-db.js output)');
console.log('Hash length:', storedHash.length);
console.log('Hash starts with $2:', storedHash.startsWith('$2'));

// Check if it's a legacy SHA-256 hash
if (storedHash.length === 64 && !storedHash.startsWith('$2')) {
  console.log('This is a legacy SHA-256 hash');
  
  // Test legacy verification
  const legacyHash = crypto.createHash('sha256').update('Admin123!').digest('hex');
  console.log('Computed SHA-256 hash:', legacyHash);
  console.log('Match:', legacyHash === storedHash);
}

// Also test bcrypt
const bcryptMatch = bcrypt.compare('Admin123!', storedHash).then(result => {
  console.log('Bcrypt comparison result:', result);
});
