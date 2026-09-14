import { isGatewayFile } from '../utils/private-paths.js'
import { ALIAS_SCHEMA } from '../utils/alias-resolver.js'
import { resolveImport } from '../utils/module-resolution.js'
import { isVisible, ancestorsOf } from '../utils/module-scope.js'
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

// Climbs outward from the module owning the imported path until it reaches a
// module whose gateway the importing file may legally see. A nested module's
// own gateway is private, so it is never a valid rewrite target from outside.
const findVisibleGateway = (filename, resolved, gatewayNames) => {
	for (const moduleDir of ancestorsOf(resolved, gatewayNames)) {
		const gatewayFile = findGatewayFile(moduleDir, gatewayNames)
		if (gatewayFile && isVisible(filename, gatewayFile, gatewayNames)) {
			return gatewayFile
		}
	}
	return null
}

const buildGatewayFix = (
	node,
	sourceNode,
	filename,
	resolved,
	aliases,
	gatewayNames,
) => {
	if (!resolved) {
		return null
	}

	const gatewayFile = findVisibleGateway(filename, resolved, gatewayNames)
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
			if (!src || isAssetImport(src)) {
				return
			}

			// A specifier no alias covers is an external package, which this
			// plugin has no say over. Everything else is judged on where it
			// actually resolves, not on how the specifier happens to be spelled.
			const resolved = resolveImport(filename, src, aliases)
			if (!resolved || isVisible(filename, resolved, gatewayNames)) {
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
					resolved,
					aliases,
					gatewayNames,
				),
			})
		}

		return createImportExportVisitors(check)
	},
}
