import { ALIAS_SCHEMA } from '../utils/alias-resolver.js'
import { resolveImport } from '../utils/module-resolution.js'
import { isAncestorImport } from '../utils/module-scope.js'
import {
	createImportExportVisitors,
	isAssetImport,
} from '../utils/import-export-visitors.js'
import { getRuleOptions } from '../utils/rule-options.js'

export const noAncestorImports = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Disallow importing from a module that encloses the importing module',
			recommended: true,
			url: 'https://github.com/land-cap/eslint-plugin-private-modules#no-ancestor-imports',
		},
		schema: [ALIAS_SCHEMA],
		messages: {
			ancestorImport:
				'A nested module must not import from an enclosing module. Invert the dependency or hoist the shared code out of the parent.',
		},
	},

	create(context) {
		const { aliases, gatewayNames, filename } = getRuleOptions(context)

		const check = (node) => {
			const src = node.source?.value
			if (!src || isAssetImport(src)) {
				return
			}

			const resolved = resolveImport(filename, src, aliases)
			if (!resolved || !isAncestorImport(filename, resolved, gatewayNames)) {
				return
			}

			context.report({ node, messageId: 'ancestorImport' })
		}

		return createImportExportVisitors(check)
	},
}
