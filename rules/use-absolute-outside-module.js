import path from 'node:path'
import { isRelativePath, isPrivatePath } from '../utils/private-paths.js'
import { rootModuleOf, isWithin } from '../utils/module-scope.js'
import {
	resolveRelativeToAlias,
	ALIAS_SCHEMA,
} from '../utils/alias-resolver.js'
import {
	createImportExportVisitors,
	isAssetImport,
} from '../utils/import-export-visitors.js'
import { createReplaceSourceFix } from '../utils/rule-fixes.js'
import { getRuleOptions } from '../utils/rule-options.js'

// --- rule ---

export const useAbsoluteOutsideModule = {
	meta: {
		type: 'problem',
		docs: {
			description: 'Require path-alias imports when crossing module boundaries',
			recommended: false,
			url: 'https://github.com/land-cap/eslint-plugin-private-modules#use-absolute-outside-module',
		},
		fixable: 'code',
		schema: [ALIAS_SCHEMA],
		messages: {
			outsideModuleRelative:
				'Use a path alias (@/) instead of a relative import outside your module.',
		},
	},

	create(context) {
		const { aliases, gatewayNames, filename } = getRuleOptions(context)

		const check = (node) => {
			const sourceNode = node.source
			const src = sourceNode?.value
			if (!src || !isRelativePath(src)) {
				return
			}
			// css/asset files → skip
			if (isAssetImport(src)) {
				return
			}
			// Defer to no-private-imports for any _private/ path to avoid double-reporting.
			if (isPrivatePath(src)) {
				return
			}

			const absoluteImport = path.resolve(path.dirname(filename), src)
			const rootModule = rootModuleOf(filename, gatewayNames)

			// Inside a module — only flag imports that leave its whole subtree.
			if (rootModule !== null && isWithin(absoluteImport, rootModule)) {
				return
			}

			const aliasPath = resolveRelativeToAlias(src, filename, aliases)
			context.report({
				node,
				messageId: 'outsideModuleRelative',
				fix: createReplaceSourceFix(sourceNode, aliasPath),
			})
		}

		return createImportExportVisitors(check)
	},
}
