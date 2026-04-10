/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src/main', '<rootDir>/src/renderer'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        target: 'ES2022',
        module: 'commonjs',
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        moduleResolution: 'node',
        strict: true,
        outDir: './dist/test',
        jsx: 'react',
      },
    }],
  },
  moduleNameMapper: {
    '^electron$': '<rootDir>/jest.mocks/electron.ts',
    '^electron-log$': '<rootDir>/jest.mocks/electron-log.ts',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  collectCoverageFrom: [
    'src/main/**/*.ts',
    '!src/main/**/*.test.ts',
  ],
  coverageDirectory: 'coverage',
  verbose: true,
};
