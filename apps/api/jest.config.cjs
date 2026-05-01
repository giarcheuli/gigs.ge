require('dotenv').config({ path: './.env.test' });

module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: '<rootDir>/tsconfig.json'
    }]
  },
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@gigs/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@gigs/shared/(.*)$': '<rootDir>/../../packages/shared/src/$1/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  extensionsToTreatAsEsm: ['.ts']
};