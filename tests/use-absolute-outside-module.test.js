import { useAbsoluteOutsideModule } from '../rules/use-absolute-outside-module.js'
import { opts, fixturePath, tester, SRC } from './setup.js'

tester.run('use-absolute-outside-module', useAbsoluteOutsideModule, {
	valid: [
		// Non-code imports are ignored by this rule.
		{
			filename: fixturePath('feed/feed.tsx'),
			code: `import locale from '../i18n/en.json'`,
			options: opts,
		},

		// Alias import anywhere — rule only checks relative imports.
		{
			filename: fixturePath('feed/feed.tsx'),
			code: `import { Avatar } from '@/avatar/index'`,
			options: opts,
		},

		// Inside _private/, relative import to a sibling _private/ file — within the module.
		{
			filename: fixturePath('avatar/_private/avatar.tsx'),
			code: `import { getInitials } from './utils'`,
			options: opts,
		},

		// Gateway, relative import to its own _private/ — within the module (deferred to
		// no-private-imports anyway since the path contains _private/).
		{
			filename: fixturePath('avatar/index.ts'),
			code: `export { getInitials } from './_private/utils.ts'`,
			options: opts,
		},
		// Custom gatewayNames still treat the configured gateway as module-owned.
		{
			filename: fixturePath('avatar/public.ts'),
			code: `export { getInitials } from './_private/utils.ts'`,
			options: [{ aliases: { '@/': SRC }, gatewayNames: ['public'] }],
		},
	],

	invalid: [
		// File outside any module using a relative path to reach another area — must use alias.
		{
			filename: fixturePath('feed/feed.tsx'),
			code: `import { Avatar } from '../avatar/index'`,
			options: opts,
			output: `import { Avatar } from '@/avatar/index'`,
			errors: [{ messageId: 'outsideModuleRelative' }],
		},

		// Inside _private/, relative import that escapes the module entirely.
		{
			filename: fixturePath('avatar/_private/avatar.tsx'),
			code: `import { Button } from '../../button/index'`,
			options: opts,
			output: `import { Button } from '@/button/index'`,
			errors: [{ messageId: 'outsideModuleRelative' }],
		},
	],
})
