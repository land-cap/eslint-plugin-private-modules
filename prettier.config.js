export default {
	trailingComma: 'all',
	useTabs: true,
	semi: false,
	singleQuote: true,
	bracketSpacing: true,
	arrowParens: 'always',
	printWidth: 80,
	overrides: [
		{
			files: ['**/*.md'],
			options: { printWidth: 120, proseWrap: 'always' },
		},
	],
}
