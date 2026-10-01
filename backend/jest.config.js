/** Unit tests only: isolatedModules skips whole-program type-checking so specs run without a generated Prisma client. */
module.exports = {
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { isolatedModules: true, diagnostics: false }] },
};
