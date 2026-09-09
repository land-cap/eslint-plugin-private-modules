import { describe, it } from 'node:test'
import { RuleTester } from 'eslint'
import path from 'node:path'

RuleTester.describe = describe
RuleTester.it = it

export const SRC = path.resolve(import.meta.dirname, '__fixtures__/src')

export const opts = [{ aliases: { '@/': SRC } }]

export const fixturePath = (...parts) => path.join(SRC, ...parts)

export const tester = new RuleTester({
	languageOptions: { sourceType: 'module' },
})
