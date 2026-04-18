// ESLint v9+ flat config.
// Replaces the legacy .eslintrc.json used pre-v9.
// Lints JS only; api/server.py is a Python file and is ignored.
// Inline globals keep this zero-dep — no `globals` package required.

const nodeGlobals = {
    // Node.js runtime
    process: 'readonly',
    Buffer: 'readonly',
    __dirname: 'readonly',
    __filename: 'readonly',
    global: 'readonly',
    module: 'writable',
    require: 'readonly',
    exports: 'writable',
    console: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    setInterval: 'readonly',
    clearInterval: 'readonly',
    setImmediate: 'readonly',
    clearImmediate: 'readonly',
    URL: 'readonly',
    URLSearchParams: 'readonly',
    TextEncoder: 'readonly',
    TextDecoder: 'readonly',
    fetch: 'readonly',
    Request: 'readonly',
    Response: 'readonly',
    Headers: 'readonly',
    crypto: 'readonly',
};

const browserGlobals = {
    window: 'readonly',
    document: 'readonly',
    navigator: 'readonly',
    localStorage: 'readonly',
    sessionStorage: 'readonly',
    location: 'readonly',
    history: 'readonly',
    alert: 'readonly',
    confirm: 'readonly',
    prompt: 'readonly',
    FormData: 'readonly',
    XMLHttpRequest: 'readonly',
    HTMLElement: 'readonly',
    Element: 'readonly',
    Event: 'readonly',
    Chart: 'readonly', // Chart.js loaded via CDN on some pages
};

module.exports = [
    {
        ignores: [
            'node_modules/**',
            '.vercel/**',
            'preprint/**',
            'data/**',
            'sycoindex-homepage-v2.html',
            'sycoindex-homepage-v3.html',
            'pai-leaderboard-dashboard.html',
        ],
    },
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2020,
            sourceType: 'commonjs',
            globals: {
                ...nodeGlobals,
                ...browserGlobals,
            },
        },
        rules: {
            'no-unused-vars': 'warn',
            'no-undef': 'error',
            semi: ['warn', 'always'],
            'no-console': 'off',
        },
    },
];
