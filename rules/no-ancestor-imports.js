import { ALIAS_SCHEMA } from '../utils/alias-resolver.js'
import { resolveImport } from '../utils/module-resolution.js'
import { ownerOf, ancestorsOf, targetModuleOf } from '../utils/module-scope.js'
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

		// Only a nested module has ancestors to violate, and the chain depends
		// on the filename alone. Walking it once per file lets every file in a
		// top-level module — which is nearly all of them — skip the visitor
		// outright, rather than resolving each import only to find no ancestor.
		const importerModule = ownerOf(filename, gatewayNames)
		const ancestors =
			importerModule === null ? [] : ancestorsOf(importerModule, gatewayNames)
		if (ancestors.length === 0) {
			return {}
		}

		const check = (node) => {
			const src = node.source?.value
			if (!src || isAssetImport(src)) {
				return
			}

			const resolved = resolveImport(filename, src, aliases)
			if (!resolved) {
				return
			}

			if (!ancestors.includes(targetModuleOf(resolved, gatewayNames))) {
				return
			}

			context.report({ node, messageId: 'ancestorImport' })
		}

		return createImportExportVisitors(check)
	},
}
