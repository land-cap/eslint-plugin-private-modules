import { isPrivatePath, isGatewayFile } from '../utils/private-paths.js'
import { ALIAS_SCHEMA } from '../utils/alias-resolver.js'
import { findModuleDir, resolveImport } from '../utils/module-resolution.js'
import { isVisible } from '../utils/module-scope.js'
import {
	findGatewayFile,
	buildGatewayPath,
} from '../utils/gateway-discovery.js'
import {
	gatewayExportsAll,
	getImportedNames,
} from '../utils/gateway-exports.js'
import {
	createImportExportVisitors,
	isAssetImport,
} from '../utils/import-export-visitors.js'
import { formatGatewayList } from '../utils/gateway-names.js'
import { createReplaceSourceFix } from '../utils/rule-fixes.js'
import { getRuleOptions } from '../utils/rule-options.js'

// --- fix builder ---

const buildGatewayFix = (
	node,
	sourceNode,
	filename,
	src,
	aliases,
	gatewayNames,
) => {
	const moduleDir = findModuleDir(filename, src, aliases)
	if (!moduleDir) {
		return null
	}

	const gatewayFile = findGatewayFile(moduleDir, gatewayNames)
	if (!gatewayFile) {
		return null
	}

	const names = getImportedNames(node)
	// null = namespace/wildcard/dynamic — can't verify, skip fix
	if (names === null) {
		return null
	}
	// non-empty names = verify gateway exports them all
	if (names.length > 0 && !gatewayExportsAll(gatewayFile, names)) {
		return null
	}

	const gatewayPath = buildGatewayPath(gatewayFile, aliases)
	if (!gatewayPath) {
		return null
	}

	return createReplaceSourceFix(sourceNode, gatewayPath)
}

// --- rule ---

export const noPrivateImports = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Disallow importing from `_private/` except through the module gateway',
			recommended: true,
			url: 'https://github.com/land-cap/eslint-plugin-private-modules#no-private-imports',
		},
		fixable: 'code',
		schema: [ALIAS_SCHEMA],
		messages: {
			noPrivate:
				"Do not import from _private/ directly. Use the module's {{gatewayList}} barrel instead.",
			crossModule:
				"Gateway files may only import from their own sibling _private/, not from another module's.",
		},
	},

	create(context) {
		const { aliases, gatewayNames, filename } = getRuleOptions(context)

		const check = (node) => {
			const sourceNode = node.source
			const src = sourceNode?.value
			if (!src || isAssetImport(src) || !isPrivatePath(src)) {
				return
			}

			// An unresolvable specifier stays a violation: we cannot prove it is
			// in scope, and silently allowing it would open a hole.
			const resolved = resolveImport(filename, src, aliases)
			if (resolved && isVisible(filename, resolved, gatewayNames)) {
				return
			}

			if (isGatewayFile(filename, gatewayNames)) {
				context.report({ node, messageId: 'crossModule' })
				return
			}

			context.report({
				node,
				messageId: 'noPrivate',
				data: { gatewayList: formatGatewayList(gatewayNames) },
				fix: buildGatewayFix(
					node,
					sourceNode,
					filename,
					src,
					aliases,
					gatewayNames,
				),
			})
		}

		return createImportExportVisitors(check)
	},
}
