import path from 'node:path'
import { existsSync } from 'node:fs'
import { findAliasEntryForPath } from './alias-resolver.js'

const moduleDirGatewayCache = new Map()

const getGatewayCacheForModule = (moduleDir) => {
	if (!moduleDirGatewayCache.has(moduleDir)) {
		moduleDirGatewayCache.set(moduleDir, new Map())
	}

	return moduleDirGatewayCache.get(moduleDir)
}

const getGatewayNamesCacheKey = (gatewayNames) => gatewayNames.join(',')

export const findGatewayFile = (moduleDir, gatewayNames) => {
	const gatewayCacheForModule = getGatewayCacheForModule(moduleDir)
	const gatewayNamesKey = getGatewayNamesCacheKey(gatewayNames)

	if (gatewayCacheForModule.has(gatewayNamesKey)) {
		return gatewayCacheForModule.get(gatewayNamesKey)
	}

	const foundGatewayPath =
		gatewayNames
			.map((name) => path.join(moduleDir, `${name}.ts`))
			.find(existsSync) ?? null

	gatewayCacheForModule.set(gatewayNamesKey, foundGatewayPath)
	return foundGatewayPath
}

// `index.ts` gateways are addressed by the bare directory path — drop the
// trailing `/index.ts` so consumers write `@/foo` instead of `@/foo/index.ts`.
// Other gateway names keep their full path.
const stripIndexSuffix = (importPath) =>
	importPath.replace(/\/index\.ts$/, '') || importPath

// Builds the import path to the gateway file, always in alias form — the
// fixer standardizes on `@/` imports regardless of how the original import
// (relative or alias) was written.
export const buildGatewayPath = (gatewayFile, aliases) => {
	const entry = findAliasEntryForPath(gatewayFile, aliases)
	if (!entry) {
		return null
	}
	const [prefix, target] = entry
	const relToTarget = path.relative(target, gatewayFile)
	return stripIndexSuffix((prefix + relToTarget).replace(/\\/g, '/'))
}
