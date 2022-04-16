/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1', // Remove extension from import statements
    // Workaround for csv imports (https://github.com/adaltas/node-csv/issues/309)
    "^csv-parse/sync": "<rootDir>/node_modules/csv-parse/dist/cjs/sync.cjs",
    "^csv-stringify/sync": "<rootDir>/node_modules/csv-stringify/dist/cjs/sync.cjs"
  }
};