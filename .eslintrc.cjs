module.exports = {
    "env": {
        "node": true,
        "es2020": true
    },
    "parser": "@typescript-eslint/parser",
    "parserOptions": {
        "ecmaFeatures": {
            "jsx": true
        },
        "ecmaVersion": "latest",
        "sourceType": "module"
    },
    "plugins": [
        "react",
        "@typescript-eslint",
        "unused-imports",
        "eslint-plugin-jest"
    ],
    "ignorePatterns": ["node_modules", "dist"],
    "rules": {
        "unused-imports/no-unused-imports": "error",
        "semi": ["error", "always"],
        "quotes": ["error", "double", {"avoidEscape": true}]
    }
};
