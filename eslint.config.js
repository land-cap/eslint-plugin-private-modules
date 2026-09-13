import js from '@eslint/js'
import globals from 'globals'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
	globalIgnores(['tests/__fixtures__/**']),
	{
		files: ['**/*.js'],
		extends: [js.configs.recommended],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
			globals: globals.node,
		},
		rules: {
			'no-console': 'error',
			'prefer-arrow-callback': 'error',
		},
	},
])
