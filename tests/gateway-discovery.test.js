import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { SRC } from './setup.js'
import { findGatewayFile } from '../utils/gateway-discovery.js'

describe('gateway-discovery cache keying', () => {
	it('caches independently per gatewayNames list', () => {
		const moduleDir = path.join(SRC, 'avatar')
		const indexGatewayPath = findGatewayFile(moduleDir, ['index'])
		const publicGatewayPath = findGatewayFile(moduleDir, ['public'])

		assert.equal(indexGatewayPath, path.join(moduleDir, 'index.ts'))
		assert.equal(publicGatewayPath, path.join(moduleDir, 'public.ts'))
	})
})
