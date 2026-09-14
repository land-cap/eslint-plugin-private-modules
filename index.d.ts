import type { ESLint, Linter, Rule } from 'eslint'

/** Options accepted by every rule in this plugin. */
export interface PrivateModulesRuleOptions {
	/**
	 * Map of alias prefix → absolute directory it points at, e.g.
	 * `{ '@/': '/abs/path/to/src' }`. Use {@link parseTsconfigPaths} to derive
	 * this from a `tsconfig.json`.
	 */
	aliases?: Record<string, string>
	/**
	 * Gateway (barrel) file basenames without extension recognized as a
	 * module's public entry. Defaults to `['index']`.
	 */
	gatewayNames?: string[]
}

/** The plugin object; register under the `private-modules` key. */
export declare const privateModuleBoundary: ESLint.Plugin & {
	meta: { name: string; version: string }
	rules: {
		'no-private-imports': Rule.RuleModule
		'no-ancestor-imports': Rule.RuleModule
		'use-relative-in-private': Rule.RuleModule
		'use-absolute-outside-module': Rule.RuleModule
	}
}

/**
 * Reads `compilerOptions.paths` (following `extends`) from a tsconfig and
 * returns an alias map suitable for the `aliases` rule option. Only
 * `prefix/*` → `target/*` entries are considered.
 */
export declare function parseTsconfigPaths(
	tsconfigPath: string,
): Record<string, string>

/** Flat-config preset enabling the boundary rules: `no-private-imports` and `no-ancestor-imports`. */
export declare function recommendedConfig(
	ruleOptions?: PrivateModulesRuleOptions,
): Linter.Config

/** Flat-config preset enabling all rules. */
export declare function strictConfig(
	ruleOptions?: PrivateModulesRuleOptions,
): Linter.Config
