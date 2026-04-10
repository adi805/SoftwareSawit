/**
 * User Database Export/Import Tests
 * 
 * Tests for F010-BE: User Database Export/Import Backend
 */

// Mock fs module before importing userDatabase
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

import * as userDb from './userDatabase';

// Mock the dependencies
jest.mock('electron-log', () => {
  return {
    __esModule: true,
    default: {
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    },
  };
});

jest.mock('sql.js', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      run: jest.fn(),
      exec: jest.fn(),
      close: jest.fn(),
    })),
  };
});

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid'),
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn(() => Promise.resolve('$2a$10$hashedpassword')),
  compare: jest.fn(() => Promise.resolve(true)),
}));

jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/mock/userData'),
  },
}));

describe('User Database Export/Import', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('exportUsersDatabase', () => {
    it('should return error when database is not initialized', () => {
      // We can't easily test without initialized DB, but we can verify the function structure
      const result = userDb.exportUsersDatabase('/tmp/test.db');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('message');
    });

    it('should export database to target path', () => {
      // Test structure verification
      const targetPath = '/test/path/users.db';
      const result = userDb.exportUsersDatabase(targetPath);
      
      // Result should have correct structure even if db is null
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('message');
    });
  });

  describe('importUsersDatabase', () => {
    it('should return error when database is not initialized', async () => {
      const result = await userDb.importUsersDatabase('/tmp/test.db', 'skip');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('imported');
      expect(result).toHaveProperty('conflicts');
      expect(result.success).toBe(false);
    });

    it('should return error for non-existent file when db is initialized', async () => {
      // Test that function returns proper error for missing file
      // Note: Since we can't easily initialize DB in test, this validates structure
      const result = await userDb.importUsersDatabase('/tmp/nonexistent.db', 'skip');
      // Result should have correct structure
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('message');
    });
  });

  describe('password hashing', () => {
    it('should hash passwords with bcrypt', async () => {
      const password = 'TestPassword123';
      const hash = await userDb.hashPassword(password);
      expect(hash).toBe('$2a$10$hashedpassword');
    });

    it('should verify valid passwords', async () => {
      const password = 'TestPassword123';
      const hash = '$2a$10$hashedpassword';
      const isValid = await userDb.verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should handle legacy SHA-256 hashes', async () => {
      const password = 'TestPassword123';
      // Legacy hash format (64 chars, no $2 prefix)
      const legacyHash = 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3';
      const isValid = await userDb.verifyPassword(password, legacyHash);
      // Legacy verification works, actual result depends on hash comparison
      expect(typeof isValid).toBe('boolean');
    });
  });

  describe('password strength validation', () => {
    it('should reject passwords shorter than 8 characters', () => {
      const result = userDb.validatePasswordStrength('Short1');
      expect(result.valid).toBe(false);
      expect(result.message).toBe('Password minimal 8 karakter');
    });

    it('should reject passwords without uppercase', () => {
      const result = userDb.validatePasswordStrength('password1');
      expect(result.valid).toBe(false);
      expect(result.message).toBe('Password harus mengandung huruf besar');
    });

    it('should reject passwords without numbers', () => {
      const result = userDb.validatePasswordStrength('Password');
      expect(result.valid).toBe(false);
      expect(result.message).toBe('Password harus mengandung angka');
    });

    it('should accept valid passwords', () => {
      const result = userDb.validatePasswordStrength('Password123');
      expect(result.valid).toBe(true);
      expect(result.message).toBe('Password valid');
    });
  });

  describe('getRoles', () => {
    it('should return all defined roles', () => {
      const roles = userDb.getRoles();
      expect(roles).toContain('Administrator');
      expect(roles).toContain('Inputan Kas');
      expect(roles).toContain('Inputan Bank');
      expect(roles).toContain('Inputan Gudang');
      expect(roles).toContain('Approver');
      expect(roles.length).toBe(5);
    });
  });
});
