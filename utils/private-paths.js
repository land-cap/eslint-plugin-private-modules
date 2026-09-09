import path from 'node:path'

const PRIVATE_RE = /(^|\/)_private\//
const PRIVATE_SEGMENT = `${path.sep}_private${path.sep}`
const toPosixPath = (value) => value.replace(/\\/g, '/')

export const isPrivatePath = (src) =>
	typeof src === 'string' && PRIVATE_RE.test(toPosixPath(src))

export const isRelativePath = (src) =>
	typeof src === 'string' && src.startsWith('.')

export const isInsidePrivate = (filename) =>
	PRIVATE_RE.test(toPosixPath(filename))

export const isGatewayFile = (filename, gatewayNames) =>
	gatewayNames.includes(path.basename(filename, path.extname(filename)))

// Returns the module directory that owns `_private/`.
// Example: `/a/b/_private/x.ts` -> `/a/b`.
export const getPrivateParent = (resolvedPath) => {
	const idx = resolvedPath.indexOf(PRIVATE_SEGMENT)
	return idx === -1 ? null : resolvedPath.slice(0, idx)
}
