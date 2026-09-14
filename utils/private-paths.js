import path from 'node:path'

const PRIVATE_RE = /(^|\/)_private\//
const toPosixPath = (value) => value.replace(/\\/g, '/')

export const isPrivatePath = (src) =>
	typeof src === 'string' && PRIVATE_RE.test(toPosixPath(src))

export const isRelativePath = (src) =>
	typeof src === 'string' && src.startsWith('.')

export const isInsidePrivate = (filename) =>
	PRIVATE_RE.test(toPosixPath(filename))

export const isGatewayFile = (filename, gatewayNames) =>
	gatewayNames.includes(path.basename(filename, path.extname(filename)))
