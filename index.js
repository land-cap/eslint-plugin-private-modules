import { createRequire } from 'node:module'
import { noPrivateImports } from './rules/no-private-imports.js'
import { useRelativeInPrivate } from './rules/use-relative-in-private.js'
import { useAbsoluteOutsideModule } from './rules/use-absolute-outside-module.js'

export { parseTsconfigPaths } from './utils/alias-resolver.js'

const { name, version } = createRequire(import.meta.url)('./package.json')

export const privateModuleBoundary = {
	meta: { name, version },
	rules: {
		'no-private-imports': noPrivateImports,
		'use-relative-in-private': useRelativeInPrivate,
		'use-absolute-outside-module': useAbsoluteOutsideModule,
	},
}

const RECOMMENDED_RULE_NAMES = ['no-private-imports']
const STRICT_RULE_NAMES = [
	...RECOMMENDED_RULE_NAMES,
	'use-relative-in-private',
	'use-absolute-outside-module',
]

const buildConfig = (ruleNames, ruleOptions) => ({
	plugins: { 'private-modules': privateModuleBoundary },
	rules: Object.fromEntries(
		ruleNames.map((ruleName) => [
			`private-modules/${ruleName}`,
			['error', ruleOptions],
		]),
	),
})

// Flat-config presets. Rule options (aliases, gatewayNames) are per-project,
// so the presets are factories rather than static config objects. Spread the
// result into a config entry alongside your own `files` glob.
//
// `recommended` enforces only the module boundary itself (no-private-imports).
// `strict` adds the path-style rules (relative inside _private/, alias outside).
export const recommendedConfig = (ruleOptions) =>
	buildConfig(RECOMMENDED_RULE_NAMES, ruleOptions)

export const strictConfig = (ruleOptions) =>
	buildConfig(STRICT_RULE_NAMES, ruleOptions)
