# Nested Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a module live inside another module's `_private/`, reachable only from within that private scope, and
forbidden from importing anything belonging to an enclosing module.

**Architecture:** A single new util, `utils/module-scope.js`, owns the whole model — which module a path belongs to
(`ownerOf`), lexical visibility (`isVisible`), and the enclosing-module chain (`ancestorsOf`). The three existing rules
are rebuilt on those primitives, replacing three divergent notions of module ownership, and a fourth rule
`no-ancestor-imports` enforces parent-agnosticism.

**Tech Stack:** Plain ESM JavaScript (no build step), ESLint 9 flat config, `node --test` with ESLint's `RuleTester`,
Prettier (tabs, no semicolons, single quotes).

**Spec:** `docs/superpowers/specs/2026-09-14-nested-modules-design.md`

## Global Constraints

- Node >= 20.11.0, ESLint >= 9.0.0. Plain ESM `.js` — no TypeScript, no build step.
- Prettier config governs formatting: tabs, single quotes, no semicolons, trailing commas. Run `pnpm run format` before
  committing if unsure.
- Full verification command is `pnpm run check` (lint + format:check + test). Single test file:
  `node --test tests/<name>.test.js`.
- `tests/__fixtures__/**` is globally ignored by ESLint, so fixture files are not linted.
- Fixture files are never executed. They exist only so `existsSync` and `readFileSync` calls in the rules find
  something. Keep them one line where possible.
- Every rule accepts the same options object (`aliases`, `gatewayNames`) via `ALIAS_SCHEMA` and reads it through
  `getRuleOptions(context)`.
- Commit messages end with: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

## File Structure

**Created:**

- `utils/module-scope.js` — the entire nesting model. Path math only in Tasks 1–4; gains one filesystem-touching helper
  (`isAncestorImport`) in Task 5.
- `rules/no-ancestor-imports.js` — the parent-agnosticism rule.
- `tests/module-scope.test.js` — direct unit tests for the model primitives.
- `tests/no-ancestor-imports.test.js` — rule tests.
- `tests/__fixtures__/src/panel/**` — nested-module fixture tree.

**Modified:**

- `utils/module-resolution.js` — gains `resolveImport`; shrinks to just that by Task 6.
- `utils/private-paths.js` — loses `getPrivateParent` in Task 7.
- `rules/no-private-imports.js` — visibility check + walk-up fixer.
- `rules/use-relative-in-private.js` — root-module scoping.
- `rules/use-absolute-outside-module.js` — root-module scoping, loses its local `getModuleDir`.
- `index.js`, `index.d.ts` — register the new rule; add it to the recommended preset.
- `README.md` — nesting docs.

---

### Task 1: The module-scope model

Pure path arithmetic. No filesystem access, so the tests need no fixture files on disk — the paths are just strings.

**Files:**

- Create: `utils/module-scope.js`
- Test: `tests/module-scope.test.js`

**Interfaces:**

- Consumes: `isGatewayFile(filename, gatewayNames)` from `utils/private-paths.js` (already exists — returns true when
  the basename minus extension is in `gatewayNames`).
- Produces:
  - `ownerOf(absPath: string, gatewayNames: string[]) => string | null`
  - `isWithin(absPath: string, dir: string) => boolean`
  - `isVisible(fromFile: string, targetPath: string, gatewayNames: string[]) => boolean`
  - `ancestorsOf(moduleDir: string, gatewayNames: string[]) => string[]` — outward order, nearest ancestor first
  - `rootModuleOf(absPath: string, gatewayNames: string[]) => string | null`

- [ ] **Step 1: Write the failing test**

Create `tests/module-scope.test.js`:

```js
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { SRC } from './setup.js'
import { ownerOf, isWithin, isVisible, ancestorsOf, rootModuleOf } from '../utils/module-scope.js'

const NAMES = ['index']
const at = (...parts) => path.join(SRC, ...parts)

describe('ownerOf', () => {
	it('returns null for a file outside any module', () => {
		assert.equal(ownerOf(at('feed', 'feed.tsx'), NAMES), null)
	})

	it('assigns a gateway file to its own directory', () => {
		assert.equal(ownerOf(at('avatar', 'index.ts'), NAMES), at('avatar'))
	})

	it('assigns a _private/ file to the module owning that _private/', () => {
		assert.equal(ownerOf(at('avatar', '_private', 'utils.ts'), NAMES), at('avatar'))
	})

	it('assigns a nested _private/ file to the innermost module, not the outermost', () => {
		assert.equal(
			ownerOf(at('panel', '_private', 'header', '_private', 'header.tsx'), NAMES),
			at('panel', '_private', 'header'),
		)
	})

	it('assigns a nested gateway to its own directory, not the enclosing module', () => {
		assert.equal(ownerOf(at('panel', '_private', 'header', 'index.ts'), NAMES), at('panel', '_private', 'header'))
	})

	it('honours a custom gatewayNames list', () => {
		assert.equal(ownerOf(at('avatar', 'public.ts'), ['public']), at('avatar'))
		assert.equal(ownerOf(at('avatar', 'public.ts'), NAMES), null)
	})
})

describe('isWithin', () => {
	it('is true for the directory itself and for descendants', () => {
		assert.equal(isWithin(at('panel'), at('panel')), true)
		assert.equal(isWithin(at('panel', '_private', 'x.ts'), at('panel')), true)
	})

	it('is false for a sibling with a shared name prefix', () => {
		assert.equal(isWithin(at('panel-extra', 'x.ts'), at('panel')), false)
	})
})

describe('isVisible', () => {
	const outsider = at('feed', 'feed.tsx')

	it('allows any path with no enclosing _private/', () => {
		assert.equal(isVisible(outsider, at('avatar', 'index.ts'), NAMES), true)
	})

	it('blocks an outsider from another module’s _private/', () => {
		assert.equal(isVisible(outsider, at('avatar', '_private', 'utils.ts'), NAMES), false)
	})

	it('lets a gateway see its own module’s _private/', () => {
		assert.equal(isVisible(at('avatar', 'index.ts'), at('avatar', '_private', 'utils.ts'), NAMES), true)
	})

	it('blocks a gateway from another module’s _private/', () => {
		assert.equal(isVisible(at('avatar', 'index.ts'), at('button', '_private', 'button.tsx'), NAMES), false)
	})

	it('lets a file inside _private/ see its siblings there', () => {
		assert.equal(isVisible(at('avatar', '_private', 'avatar.tsx'), at('avatar', '_private', 'utils.ts'), NAMES), true)
	})

	it('lets a nested module see a sibling nested module’s gateway', () => {
		assert.equal(
			isVisible(
				at('panel', '_private', 'header', '_private', 'header.tsx'),
				at('panel', '_private', 'toolbar', 'index.ts'),
				NAMES,
			),
			true,
		)
	})

	it('blocks a nested module from a sibling nested module’s internals', () => {
		assert.equal(
			isVisible(
				at('panel', '_private', 'header', '_private', 'header.tsx'),
				at('panel', '_private', 'toolbar', '_private', 'toolbar.ts'),
				NAMES,
			),
			false,
		)
	})

	it('blocks an outsider from a nested module entirely', () => {
		assert.equal(isVisible(outsider, at('panel', '_private', 'header', 'index.ts'), NAMES), false)
	})

	it('lets a parent gateway see a nested module', () => {
		assert.equal(isVisible(at('panel', 'index.ts'), at('panel', '_private', 'header'), NAMES), true)
	})
})

describe('ancestorsOf', () => {
	it('is empty for a top-level module', () => {
		assert.deepEqual(ancestorsOf(at('avatar'), NAMES), [])
	})

	it('lists enclosing modules outward', () => {
		assert.deepEqual(ancestorsOf(at('panel', '_private', 'header'), NAMES), [at('panel')])
	})

	it('walks more than one level', () => {
		assert.deepEqual(ancestorsOf(at('panel', '_private', 'header', '_private', 'badge'), NAMES), [
			at('panel', '_private', 'header'),
			at('panel'),
		])
	})
})

describe('rootModuleOf', () => {
	it('returns null outside any module', () => {
		assert.equal(rootModuleOf(at('feed', 'feed.tsx'), NAMES), null)
	})

	it('returns the module itself for a top-level module file', () => {
		assert.equal(rootModuleOf(at('avatar', '_private', 'utils.ts'), NAMES), at('avatar'))
	})

	it('returns the outermost module for a deeply nested file', () => {
		assert.equal(rootModuleOf(at('panel', '_private', 'header', '_private', 'header.tsx'), NAMES), at('panel'))
	})
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/module-scope.test.js` Expected: FAIL — `Cannot find module '../utils/module-scope.js'`.

- [ ] **Step 3: Write the implementation**

Create `utils/module-scope.js`:

```js
import path from 'node:path'
import { isGatewayFile } from './private-paths.js'

const PRIVATE_SEGMENT = `${path.sep}_private${path.sep}`

// True when `absPath` is `dir` itself or lives underneath it. The separator
// check keeps `/src/panel-extra` from counting as inside `/src/panel`.
export const isWithin = (absPath, dir) => absPath === dir || absPath.startsWith(dir + path.sep)

// The innermost `<module>/_private` directory enclosing `absPath`, or null.
// Enclosing _private/ directories nest, so the innermost one implies all the
// outer ones — which is why visibility only ever has to check this one.
const innermostPrivateDir = (absPath) => {
	const idx = absPath.lastIndexOf(PRIVATE_SEGMENT)
	return idx === -1 ? null : absPath.slice(0, idx + PRIVATE_SEGMENT.length - 1)
}

// The module a path belongs to, or null when it belongs to none.
//
// Gateway files belong to their own directory; anything else belongs to the
// innermost module whose _private/ contains it. Checking the gateway case
// first is what makes `panel/_private/header/index.ts` belong to
// `panel/_private/header` rather than to `panel`.
export const ownerOf = (absPath, gatewayNames) => {
	if (isGatewayFile(absPath, gatewayNames)) {
		return path.dirname(absPath)
	}
	const idx = absPath.lastIndexOf(PRIVATE_SEGMENT)
	return idx === -1 ? null : absPath.slice(0, idx)
}

// Lexical scope: `targetPath` is visible to `fromFile` when it sits in no
// _private/ at all, or when `fromFile` is inside the innermost _private/
// enclosing it — where the owning module's gateway counts as inside.
export const isVisible = (fromFile, targetPath, gatewayNames) => {
	const scope = innermostPrivateDir(targetPath)
	if (scope === null) {
		return true
	}
	if (isWithin(fromFile, scope)) {
		return true
	}

	const moduleDir = path.dirname(scope)
	return isGatewayFile(fromFile, gatewayNames) && path.dirname(fromFile) === moduleDir
}

// The modules enclosing `moduleDir`, nearest first. Each step strips at least
// one path segment, so the walk always terminates.
export const ancestorsOf = (moduleDir, gatewayNames) => {
	const chain = []
	let current = ownerOf(moduleDir, gatewayNames)
	while (current !== null) {
		chain.push(current)
		current = ownerOf(current, gatewayNames)
	}
	return chain
}

// The outermost module enclosing `absPath` — the scope within which relative
// imports stay legible, since a module's whole subtree moves as one unit.
export const rootModuleOf = (absPath, gatewayNames) => {
	const owner = ownerOf(absPath, gatewayNames)
	if (owner === null) {
		return null
	}
	const chain = ancestorsOf(owner, gatewayNames)
	return chain.length === 0 ? owner : chain.at(-1)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/module-scope.test.js` Expected: PASS, all assertions green.

- [ ] **Step 5: Verify nothing else broke and commit**

Run: `pnpm run check` Expected: lint, format, and the full test suite all pass.

```bash
git add utils/module-scope.js tests/module-scope.test.js
git commit -m "feat: add module-scope model for nested modules

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Surface the resolved import path

`module-resolution.js` already resolves a specifier to an absolute path inside both of its branches, then discards it
and returns only a module directory. The new rules need the absolute path itself.

This task is pure extraction: `findModuleDir` must keep behaving exactly as before, so the existing suite is the test.

**Files:**

- Modify: `utils/module-resolution.js`
- Test: `tests/module-scope.test.js` (append)

**Interfaces:**

- Consumes: `isRelativePath` from `utils/private-paths.js`, `resolveAliasToAbsolute` from `utils/alias-resolver.js`
  (both exist).
- Produces: `resolveImport(filename: string, src: string, aliases: Record<string, string>) => string | null` — null only
  when `src` is a non-relative specifier no alias covers.

- [ ] **Step 1: Write the failing test**

Append to `tests/module-scope.test.js`:

```js
import { resolveImport } from '../utils/module-resolution.js'

describe('resolveImport', () => {
	const aliases = { '@/': SRC }

	it('resolves a relative specifier against the importing file', () => {
		assert.equal(
			resolveImport(at('avatar', '_private', 'avatar.tsx'), './utils.ts', aliases),
			at('avatar', '_private', 'utils.ts'),
		)
	})

	it('resolves an alias specifier against its target directory', () => {
		assert.equal(
			resolveImport(at('feed', 'feed.tsx'), '@/avatar/_private/utils', aliases),
			at('avatar', '_private', 'utils'),
		)
	})

	it('returns null for a specifier no alias covers', () => {
		assert.equal(resolveImport(at('feed', 'feed.tsx'), 'react', aliases), null)
	})
})
```

Move the new `import` line up to join the other imports at the top of the file — Prettier will not do it for you, and a
mid-file import is legal ESM but inconsistent with the rest of the repo.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/module-scope.test.js` Expected: FAIL — `resolveImport` is not exported
(`SyntaxError: The requested module ... does not provide an export named 'resolveImport'`).

- [ ] **Step 3: Write the implementation**

In `utils/module-resolution.js`, replace the two private helpers `resolveModuleDirFromRelative` and
`resolveModuleDirFromAlias` and the `findModuleDir` export with:

```js
// Resolves an import specifier to the absolute path it points at, whichever
// form it was written in. Null when no alias covers a non-relative specifier.
export const resolveImport = (filename, src, aliases) =>
	isRelativePath(src) ? path.resolve(path.dirname(filename), src) : resolveAliasToAbsolute(src, aliases)

export const findModuleDir = (filename, src, aliases) => {
	const resolved = resolveImport(filename, src, aliases)
	return resolved === null ? null : getPrivateParent(resolved)
}
```

Update that file's imports to `import { findBestAliasEntry, resolveAliasToAbsolute } from './alias-resolver.js'` —
`findBestAliasEntry` is still used by `isSameModuleAlias`, which stays untouched in this task.

`findModuleDir` must keep using `getPrivateParent` (which slices at the _first_ `_private/`) for now. Switching it to
the innermost rule here would change `no-private-imports` behavior before its tests are updated.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run check` Expected: PASS — the new assertions plus every pre-existing test, unchanged.

- [ ] **Step 5: Commit**

```bash
git add utils/module-resolution.js tests/module-scope.test.js
git commit -m "refactor: surface resolveImport from module-resolution

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Nested fixtures and visibility in `no-private-imports`

Replaces the rule's "is the importing file a gateway?" test with the real visibility predicate. This is where the
accepted behavior change lands.

**Files:**

- Create: `tests/__fixtures__/src/panel/index.ts`
- Create: `tests/__fixtures__/src/panel/_private/panel.tsx`
- Create: `tests/__fixtures__/src/panel/_private/helper.ts`
- Create: `tests/__fixtures__/src/panel/_private/header/index.ts`
- Create: `tests/__fixtures__/src/panel/_private/header/_private/header.tsx`
- Create: `tests/__fixtures__/src/panel/_private/toolbar/index.ts`
- Create: `tests/__fixtures__/src/panel/_private/toolbar/_private/toolbar.ts`
- Modify: `rules/no-private-imports.js`
- Test: `tests/no-private-imports.test.js`, `tests/use-relative-in-private.test.js`

**Interfaces:**

- Consumes: `isVisible`, from Task 1. `resolveImport`, from Task 2.
- Produces: the `panel/` fixture tree, relied on by Tasks 4–7.

- [ ] **Step 1: Create the fixture tree**

`panel/index.ts` deliberately re-exports `Header` — a name that originates two levels deep inside a nested module —
because that is what makes Task 4's walk-up fixer testable end to end. It deliberately does _not_ re-export `Toolbar`,
which gives Task 4 its no-fix case.

```bash
mkdir -p tests/__fixtures__/src/panel/_private/header/_private
mkdir -p tests/__fixtures__/src/panel/_private/toolbar/_private
```

`tests/__fixtures__/src/panel/index.ts`:

```ts
export { Panel } from './_private/panel.tsx'
export { Header } from './_private/header'
```

`tests/__fixtures__/src/panel/_private/panel.tsx`:

```ts
export const Panel = () => null
```

`tests/__fixtures__/src/panel/_private/helper.ts`:

```ts
export const clamp = (n: number) => n
```

`tests/__fixtures__/src/panel/_private/header/index.ts`:

```ts
export { Header } from './_private/header.tsx'
```

`tests/__fixtures__/src/panel/_private/header/_private/header.tsx`:

```ts
export const Header = () => null
```

`tests/__fixtures__/src/panel/_private/toolbar/index.ts`:

```ts
export { Toolbar } from './_private/toolbar.ts'
```

`tests/__fixtures__/src/panel/_private/toolbar/_private/toolbar.ts`:

```ts
export const Toolbar = () => null
```

- [ ] **Step 2: Write the failing tests**

In `tests/no-private-imports.test.js`, add to `valid`:

```js
		// Nested module: the parent gateway may reach into its own _private/ to
		// pick up the nested module's gateway.
		{
			filename: fixturePath('panel/index.ts'),
			code: `export { Header } from './_private/header'`,
			options: opts,
		},

		// Nested module: its gateway owns its own _private/, exactly like a
		// top-level module's gateway does.
		{
			filename: fixturePath('panel/_private/header/index.ts'),
			code: `export { Header } from './_private/header.tsx'`,
			options: opts,
		},

		// Sibling nested modules share a private scope, so one may reach the
		// other's gateway — the path crosses a _private/ that encloses both.
		{
			filename: fixturePath('panel/_private/header/_private/header.tsx'),
			code: `import { Toolbar } from '@/panel/_private/toolbar'`,
			options: opts,
		},

		// A file in the parent's _private/ is inside the scope containing the
		// nested modules, so it may use their gateways.
		{
			filename: fixturePath('panel/_private/panel.tsx'),
			code: `import { Header } from './header'`,
			options: opts,
		},

		// Accepted behavior change: an alias pointing at your own module's
		// _private/ is a path-style problem, not a boundary one. Reported by
		// use-relative-in-private instead.
		{
			filename: fixturePath('avatar/_private/avatar.tsx'),
			code: `import { getInitials } from '@/avatar/_private/utils'`,
			options: opts,
		},
```

In the same file's `invalid` list, **delete** this existing case — it is the one the last `valid` entry above replaces:

```js
		{
			filename: fixturePath('avatar/_private/avatar.tsx'),
			code: `import { getInitials } from '@/avatar/_private/utils'`,
			options: opts,
			output: `import { getInitials } from '@/avatar'`,
			errors: [{ messageId: 'noPrivate' }],
		},
```

Then add to `invalid`:

```js
		// A nested module is invisible from outside its parent's _private/.
		// No fix yet — Task 4 adds the walk-up that can produce one.
		{
			filename: fixturePath('feed/feed.tsx'),
			code: `import { Header } from '@/panel/_private/header'`,
			options: opts,
			output: null,
			errors: [{ messageId: 'noPrivate' }],
		},

		// Sibling nested modules see each other's gateways but not each other's
		// internals.
		{
			filename: fixturePath('panel/_private/header/_private/header.tsx'),
			code: `import { Toolbar } from '@/panel/_private/toolbar/_private/toolbar.ts'`,
			options: opts,
			output: null,
			errors: [{ messageId: 'noPrivate' }],
		},

		// A nested module's gateway may not reach into a sibling's _private/.
		{
			filename: fixturePath('panel/_private/header/index.ts'),
			code: `export { Toolbar } from '@/panel/_private/toolbar/_private/toolbar.ts'`,
			options: opts,
			output: null,
			errors: [{ messageId: 'crossModule' }],
		},
```

In `tests/use-relative-in-private.test.js`, add to `invalid` the case that moved out of `no-private-imports`:

```js
		// Alias to your own module's _private/ from another file in that _private/.
		// Moved here from no-private-imports: this is a path-style violation.
		{
			filename: fixturePath('avatar/_private/avatar.tsx'),
			code: `import { getInitials } from '@/avatar/_private/utils'`,
			options: opts,
			output: `import { getInitials } from './utils'`,
			errors: [{ messageId: 'useRelative' }],
		},
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test tests/no-private-imports.test.js` Expected: FAIL. The new `valid` sibling/own-module cases report
`noPrivate`, because the current rule flags every `_private/` specifier written by a non-gateway file.

Run: `node --test tests/use-relative-in-private.test.js` Expected: PASS already. That rule needs no change for this case
— the assertion is being added to lock the behavior in place now that `no-private-imports` has stopped covering it.

- [ ] **Step 4: Write the implementation**

In `rules/no-private-imports.js`, replace the `check` function inside `create` with:

```js
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
		fix: buildGatewayFix(node, sourceNode, filename, src, aliases, gatewayNames),
	})
}
```

Update that file's imports: drop `path` and `findModuleDir`, add `resolveImport` and `isVisible`.

```js
import { isPrivatePath, isGatewayFile } from '../utils/private-paths.js'
import { ALIAS_SCHEMA } from '../utils/alias-resolver.js'
import { resolveImport } from '../utils/module-resolution.js'
import { isVisible } from '../utils/module-scope.js'
```

`buildGatewayFix` keeps its current body and its own `findModuleDir` call for now — Task 4 rewrites it. Keep importing
`findModuleDir` alongside `resolveImport` until then.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm run check` Expected: PASS. Every pre-existing case still holds except the one deliberately moved.

- [ ] **Step 6: Commit**

```bash
git add tests/__fixtures__/src/panel rules/no-private-imports.js tests/no-private-imports.test.js tests/use-relative-in-private.test.js
git commit -m "feat: enforce lexical visibility in no-private-imports

Boundary violations are now decided by whether the importing file is
inside the private scope enclosing the target, which makes nested and
sibling modules work. An alias aimed at your own module's _private/ is
a path-style issue and moves to use-relative-in-private.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Walk-up autofix

An outsider reaching into a nested module cannot be redirected to that module's gateway — that gateway is private too.
Climb outward to the first gateway the importer may legally see.

**Files:**

- Modify: `rules/no-private-imports.js`
- Modify: `utils/module-resolution.js` (delete the now-unused `findModuleDir`)
- Test: `tests/no-private-imports.test.js`

**Interfaces:**

- Consumes: `ownerOf`, `isVisible` (Task 1); `resolveImport` (Task 2); `findGatewayFile`, `buildGatewayPath`,
  `gatewayExportsAll`, `getImportedNames` (all pre-existing).
- Produces: no new exports.

- [ ] **Step 1: Write the failing tests**

In `tests/no-private-imports.test.js`, **replace** the `output: null` case added in Task 3 for `feed/feed.tsx` importing
`@/panel/_private/header` with:

```js
		// Deep import into a nested module. The owning module's gateway is itself
		// private, so the fixer climbs to the outermost gateway the importer can
		// see — and only offers it because panel/index.ts re-exports Header.
		{
			filename: fixturePath('feed/feed.tsx'),
			code: `import { Header } from '@/panel/_private/header/_private/header.tsx'`,
			options: opts,
			output: `import { Header } from '@/panel'`,
			errors: [{ messageId: 'noPrivate' }],
		},

		// Same shape, addressed at the nested gateway rather than deep inside.
		{
			filename: fixturePath('feed/feed.tsx'),
			code: `import { Header } from '@/panel/_private/header'`,
			options: opts,
			output: `import { Header } from '@/panel'`,
			errors: [{ messageId: 'noPrivate' }],
		},

		// No visible gateway re-exports Toolbar, so there is nothing safe to
		// rewrite to — report without a fix.
		{
			filename: fixturePath('feed/feed.tsx'),
			code: `import { Toolbar } from '@/panel/_private/toolbar/_private/toolbar.ts'`,
			options: opts,
			output: null,
			errors: [{ messageId: 'noPrivate' }],
		},
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/no-private-imports.test.js` Expected: FAIL on the first two — the current fixer resolves the
owning module to `panel/_private/header`, finds its gateway, and produces no output change (`buildGatewayPath` yields a
still-private path, or the export check fails). The third already passes.

- [ ] **Step 3: Write the implementation**

In `rules/no-private-imports.js`, replace the whole `buildGatewayFix` function with:

```js
// Climbs outward from the module owning the imported path until it reaches a
// module whose gateway the importing file may legally see. A nested module's
// own gateway is private, so it is never a valid rewrite target from outside.
const findVisibleGateway = (filename, resolved, gatewayNames) => {
	let moduleDir = ownerOf(resolved, gatewayNames)
	while (moduleDir !== null) {
		const gatewayFile = findGatewayFile(moduleDir, gatewayNames)
		if (gatewayFile && isVisible(filename, gatewayFile, gatewayNames)) {
			return gatewayFile
		}
		moduleDir = ownerOf(moduleDir, gatewayNames)
	}
	return null
}

const buildGatewayFix = (node, sourceNode, filename, resolved, aliases, gatewayNames) => {
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
```

Update the call site in `check` to pass `resolved` instead of `src`:

```js
				fix: buildGatewayFix(
					node,
					sourceNode,
					filename,
					resolved,
					aliases,
					gatewayNames,
				),
```

`resolved` can be null there (unresolvable specifier). Guard at the top of `buildGatewayFix`:

```js
if (!resolved) {
	return null
}
```

Place it as the function's first statement, before `findVisibleGateway`.

Update imports: `import { isVisible, ownerOf } from '../utils/module-scope.js'`, and drop `findModuleDir` from the
`module-resolution.js` import entirely.

- [ ] **Step 4: Delete the orphaned helper**

`findModuleDir` now has no callers. Confirm and remove it.

Run: `grep -rn "findModuleDir" --include=*.js .` (excluding `node_modules`) Expected: matches only in
`utils/module-resolution.js`.

Delete the `findModuleDir` export from `utils/module-resolution.js` and drop `getPrivateParent` from its import list
(`isSameModuleAlias` uses it too — keep `getPrivateParent` imported if that function still references it; check before
editing).

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm run check` Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add rules/no-private-imports.js utils/module-resolution.js tests/no-private-imports.test.js
git commit -m "feat: climb to the outermost visible gateway when fixing

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: The `no-ancestor-imports` rule

A nested module must not reach anything belonging to a module that encloses it — not the gateway, not plain files in the
parent's `_private/`. That coupling is what closes the cycle, since the parent's gateway re-exports the nested module.

**Files:**

- Create: `rules/no-ancestor-imports.js`
- Create: `tests/no-ancestor-imports.test.js`
- Modify: `utils/module-scope.js`
- Modify: `index.js`, `index.d.ts`
- Test: `tests/module-scope.test.js` (append)

**Interfaces:**

- Consumes: `ownerOf`, `ancestorsOf` (Task 1); `resolveImport` (Task 2); `findGatewayFile` (pre-existing);
  `getRuleOptions`, `createImportExportVisitors`, `isAssetImport`, `ALIAS_SCHEMA` (pre-existing).
- Produces:
  - `isAncestorImport(fromFile: string, resolved: string, gatewayNames: string[]) => boolean` from
    `utils/module-scope.js` — also consumed by Task 6.
  - `noAncestorImports` rule module, registered as `private-modules/no-ancestor-imports`.

- [ ] **Step 1: Write the failing test for `isAncestorImport`**

Append to `tests/module-scope.test.js` (add `isAncestorImport` to the existing `module-scope.js` import at the top):

```js
describe('isAncestorImport', () => {
	const nested = at('panel', '_private', 'header', '_private', 'header.tsx')

	it('flags the parent module’s gateway addressed as a bare directory', () => {
		assert.equal(isAncestorImport(nested, at('panel'), NAMES), true)
	})

	it('flags the parent module’s gateway addressed by filename', () => {
		assert.equal(isAncestorImport(nested, at('panel', 'index.ts'), NAMES), true)
	})

	it('flags a plain implementation file of the parent', () => {
		assert.equal(isAncestorImport(nested, at('panel', '_private', 'helper.ts'), NAMES), true)
	})

	it('does not flag a sibling nested module', () => {
		assert.equal(isAncestorImport(nested, at('panel', '_private', 'toolbar'), NAMES), false)
	})

	it('does not flag an unrelated top-level module', () => {
		assert.equal(isAncestorImport(nested, at('button'), NAMES), false)
	})

	it('does not flag anything for a file outside any module', () => {
		assert.equal(isAncestorImport(at('feed', 'feed.tsx'), at('panel'), NAMES), false)
	})
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/module-scope.test.js` Expected: FAIL — no export named `isAncestorImport`.

- [ ] **Step 3: Implement `isAncestorImport`**

Append to `utils/module-scope.js`:

```js
import { findGatewayFile } from './gateway-discovery.js'

// The module a resolved import refers to. A bare directory naming a module
// refers to that module (via its gateway), not to the private scope the
// directory happens to sit in — without this, every sibling nested module
// would look like it belonged to the shared parent.
const targetModuleOf = (resolved, gatewayNames) =>
	findGatewayFile(resolved, gatewayNames) === null ? ownerOf(resolved, gatewayNames) : resolved

// True when the import reaches a module that encloses the importing file's
// module. Nested modules must stay agnostic of their parents; the parent's
// gateway re-exports the nested module, so an upward import closes a cycle.
export const isAncestorImport = (fromFile, resolved, gatewayNames) => {
	const importerModule = ownerOf(fromFile, gatewayNames)
	if (importerModule === null) {
		return false
	}

	const targetModule = targetModuleOf(resolved, gatewayNames)
	if (targetModule === null) {
		return false
	}

	return ancestorsOf(importerModule, gatewayNames).includes(targetModule)
}
```

Move the `findGatewayFile` import up with the `isGatewayFile` import at the top of the file.

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test tests/module-scope.test.js` Expected: PASS.

- [ ] **Step 5: Write the failing rule test**

Create `tests/no-ancestor-imports.test.js`:

```js
import { noAncestorImports } from '../rules/no-ancestor-imports.js'
import { opts, fixturePath, tester } from './setup.js'

tester.run('no-ancestor-imports', noAncestorImports, {
	valid: [
		// A file outside any module has no ancestors to violate.
		{
			filename: fixturePath('feed/feed.tsx'),
			code: `import { Panel } from '@/panel'`,
			options: opts,
		},

		// Downward is the whole point: a parent consumes its nested module.
		{
			filename: fixturePath('panel/_private/panel.tsx'),
			code: `import { Header } from './header'`,
			options: opts,
		},

		// The parent's gateway consuming the nested module.
		{
			filename: fixturePath('panel/index.ts'),
			code: `export { Header } from './_private/header'`,
			options: opts,
		},

		// Sideways: sibling nested modules are peers, not ancestors.
		{
			filename: fixturePath('panel/_private/header/_private/header.tsx'),
			code: `import { Toolbar } from '../../toolbar'`,
			options: opts,
		},

		// Reaching outside the tree entirely is unrelated to ancestry.
		{
			filename: fixturePath('panel/_private/header/_private/header.tsx'),
			code: `import { Button } from '@/button'`,
			options: opts,
		},

		// A top-level module importing another top-level module.
		{
			filename: fixturePath('avatar/_private/avatar.tsx'),
			code: `import { Button } from '@/button'`,
			options: opts,
		},

		// Asset imports are ignored.
		{
			filename: fixturePath('panel/_private/header/_private/header.tsx'),
			code: `import tokens from '../../tokens.json'`,
			options: opts,
		},
	],

	invalid: [
		// The parent's gateway, by alias.
		{
			filename: fixturePath('panel/_private/header/_private/header.tsx'),
			code: `import { Panel } from '@/panel'`,
			options: opts,
			output: null,
			errors: [{ messageId: 'ancestorImport' }],
		},

		// The parent's gateway, by relative path.
		{
			filename: fixturePath('panel/_private/header/_private/header.tsx'),
			code: `import { Panel } from '../../../index.ts'`,
			options: opts,
			output: null,
			errors: [{ messageId: 'ancestorImport' }],
		},

		// A plain implementation file of the parent — visible lexically, but
		// still parent knowledge.
		{
			filename: fixturePath('panel/_private/header/_private/header.tsx'),
			code: `import { clamp } from '../../helper.ts'`,
			options: opts,
			output: null,
			errors: [{ messageId: 'ancestorImport' }],
		},

		// The nested module's own gateway is subject to the same rule.
		{
			filename: fixturePath('panel/_private/header/index.ts'),
			code: `import { Panel } from '@/panel'`,
			options: opts,
			output: null,
			errors: [{ messageId: 'ancestorImport' }],
		},
	],
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `node --test tests/no-ancestor-imports.test.js` Expected: FAIL —
`Cannot find module '../rules/no-ancestor-imports.js'`.

- [ ] **Step 7: Write the rule**

Create `rules/no-ancestor-imports.js`:

```js
import { ALIAS_SCHEMA } from '../utils/alias-resolver.js'
import { resolveImport } from '../utils/module-resolution.js'
import { isAncestorImport } from '../utils/module-scope.js'
import { createImportExportVisitors, isAssetImport } from '../utils/import-export-visitors.js'
import { getRuleOptions } from '../utils/rule-options.js'

export const noAncestorImports = {
	meta: {
		type: 'problem',
		docs: {
			description: 'Disallow importing from a module that encloses the importing module',
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
```

There is no autofix. Inverting a dependency is a design decision, not a mechanical rewrite.

- [ ] **Step 8: Run it to verify it passes**

Run: `node --test tests/no-ancestor-imports.test.js` Expected: PASS.

- [ ] **Step 9: Register the rule**

In `index.js`:

```js
import { noAncestorImports } from './rules/no-ancestor-imports.js'
```

Add to the `rules` map in `privateModuleBoundary`:

```js
		'no-ancestor-imports': noAncestorImports,
```

And extend the recommended preset:

```js
const RECOMMENDED_RULE_NAMES = ['no-private-imports', 'no-ancestor-imports']
```

`STRICT_RULE_NAMES` already spreads `RECOMMENDED_RULE_NAMES`, so it picks the new rule up for free.

Update the comment above the preset exports to match:

```js
// `recommended` enforces the module boundaries themselves (no-private-imports,
// no-ancestor-imports). `strict` adds the path-style rules (relative inside
// _private/, alias outside).
```

In `index.d.ts`, add to the `rules` member of `privateModuleBoundary`:

```ts
		'no-ancestor-imports': Rule.RuleModule
```

And update the `recommendedConfig` doc comment:

```ts
/** Flat-config preset enabling the boundary rules: `no-private-imports` and `no-ancestor-imports`. */
```

- [ ] **Step 10: Run the full suite and commit**

Run: `pnpm run check` Expected: PASS.

```bash
git add rules/no-ancestor-imports.js tests/no-ancestor-imports.test.js utils/module-scope.js tests/module-scope.test.js index.js index.d.ts
git commit -m "feat: add no-ancestor-imports rule

A nested module may not import anything belonging to a module that
encloses it. The parent's gateway re-exports the nested module, so an
upward import closes a cycle.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Root-module scoping in `use-relative-in-private`

Widens the rule's notion of "same module" from the owning module to the outermost enclosing one, so an alias aimed at a
sibling nested module is rewritten to a relative path. Ancestor targets are excluded — Task 5's rule owns those, and
rewriting them to relative paths would be actively wrong.

**Files:**

- Modify: `rules/use-relative-in-private.js`
- Modify: `utils/module-resolution.js` (delete the orphaned `isSameModuleAlias`)
- Test: `tests/use-relative-in-private.test.js`

**Interfaces:**

- Consumes: `ownerOf`, `rootModuleOf`, `isWithin` (Task 1); `isAncestorImport` (Task 5).
- Produces: no new exports.

- [ ] **Step 1: Write the failing tests**

Add to `valid` in `tests/use-relative-in-private.test.js`:

```js
		// The parent's gateway is an ancestor import — no-ancestor-imports owns
		// it. Rewriting it to a relative path would endorse a cycle.
		{
			filename: fixturePath('panel/_private/header/_private/header.tsx'),
			code: `import { Panel } from '@/panel'`,
			options: opts,
		},

		// Already relative and pointing at a sibling nested module's gateway.
		{
			filename: fixturePath('panel/_private/header/_private/header.tsx'),
			code: `import { Toolbar } from '../../toolbar'`,
			options: opts,
		},
```

Add to `invalid`:

```js
		// Alias aimed at a sibling nested module — both files live in the same
		// top-level module, so the reference must be relative.
		{
			filename: fixturePath('panel/_private/header/_private/header.tsx'),
			code: `import { Toolbar } from '@/panel/_private/toolbar'`,
			options: opts,
			output: `import { Toolbar } from '../../toolbar'`,
			errors: [{ messageId: 'useRelative' }],
		},

		// Alias aimed at the nested module's own gateway — still noGateway,
		// scoped to the file's own module rather than the outermost one.
		{
			filename: fixturePath('panel/_private/header/_private/header.tsx'),
			code: `import { Header } from '@/panel/_private/header'`,
			options: opts,
			output: `import { Header } from './header.tsx'`,
			errors: [{ messageId: 'noGateway' }],
		},
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/use-relative-in-private.test.js` Expected: FAIL. `isSameModuleAlias` compares against
`getPrivateParent(filename)`, which for a nested file is the _outermost_ module — so the sibling and own-gateway cases
resolve against the wrong module and are either missed or mis-fixed.

- [ ] **Step 3: Write the implementation**

In `rules/use-relative-in-private.js`, replace the alias branch inside `check`:

```js
// Alias import that stays inside the file's outermost module → must
// use a relative path, unless it points at the file's own gateway
// (noGateway below) or at an enclosing module (no-ancestor-imports).
if (!isRelativePath(src)) {
	const absoluteImport = resolveAliasToAbsolute(src, aliases)
	const rootModule = rootModuleOf(filename, gatewayNames)
	if (
		!absoluteImport ||
		!rootModule ||
		!isWithin(absoluteImport, rootModule) ||
		isAncestorImport(filename, absoluteImport, gatewayNames)
	) {
		return
	}

	const moduleDir = ownerOf(filename, gatewayNames)
	const gatewayPath = resolveAliasGatewayFile(absoluteImport, moduleDir, gatewayNames)

	if (gatewayPath) {
		context.report({
			node,
			messageId: 'noGateway',
			fix: buildGatewayFix(node, gatewayPath, path.dirname(filename)),
		})
		return
	}

	const relativePath = resolveAliasToRelative(src, aliases, filename)
	context.report({
		node,
		messageId: 'useRelative',
		fix: buildFix(relativePath, sourceNode),
	})
	return
}
```

In the relative branch below it, swap `getPrivateParent(filename)` for `ownerOf(filename, gatewayNames)`:

```js
const moduleDir = ownerOf(filename, gatewayNames)
```

Leave the rest of the relative branch alone. It compares `path.dirname(resolvedBase)` against the file's _own_ module,
so an ancestor gateway reached relatively falls through untouched — which is what we want.

Update imports: drop `getPrivateParent` and `isSameModuleAlias`; add the module-scope ones.

```js
import { isRelativePath, isInsidePrivate, isGatewayFile } from '../utils/private-paths.js'
import { ownerOf, rootModuleOf, isWithin, isAncestorImport } from '../utils/module-scope.js'
```

`isGatewayFile` is still used by `resolveAliasGatewayFile`; `isInsidePrivate` still guards the top of `check`. Keep
both.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/use-relative-in-private.test.js` Expected: PASS, including every pre-existing case.

- [ ] **Step 5: Delete the orphaned helper**

Run: `grep -rn "isSameModuleAlias" --include=*.js .` (excluding `node_modules`) Expected: matches only in
`utils/module-resolution.js`.

Delete `isSameModuleAlias` from `utils/module-resolution.js`. The file should now contain only `resolveImport` plus its
imports — trim those down to what remains:

```js
import path from 'node:path'
import { resolveAliasToAbsolute } from './alias-resolver.js'
import { isRelativePath } from './private-paths.js'
```

- [ ] **Step 6: Run the full suite and commit**

Run: `pnpm run check` Expected: PASS.

```bash
git add rules/use-relative-in-private.js utils/module-resolution.js tests/use-relative-in-private.test.js
git commit -m "feat: scope use-relative-in-private to the outermost module

Relative paths stay legible across a whole module subtree, so an alias
aimed at a sibling nested module is now rewritten to a relative path.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Root-module scoping in `use-absolute-outside-module`

This rule carries its own `getModuleDir`, which checks "inside `_private/`" before "is a gateway" and therefore assigns
a nested gateway to the wrong module. Replacing it with `rootModuleOf` fixes that and delivers the intended relaxation:
relative paths travel freely within one top-level module's subtree.

**Files:**

- Modify: `rules/use-absolute-outside-module.js`
- Modify: `utils/private-paths.js` (delete the orphaned `getPrivateParent`)
- Test: `tests/use-absolute-outside-module.test.js`

**Interfaces:**

- Consumes: `rootModuleOf`, `isWithin` (Task 1).
- Produces: no new exports.

- [ ] **Step 1: Write the failing tests**

Add to `valid` in `tests/use-absolute-outside-module.test.js`:

```js
		// Sibling nested modules live in one top-level module, which moves as a
		// unit — relative is the legible form here.
		{
			filename: fixturePath('panel/_private/header/_private/header.tsx'),
			code: `import { Toolbar } from '../../toolbar'`,
			options: opts,
		},

		// A nested module's gateway reaching a sibling, same reasoning.
		{
			filename: fixturePath('panel/_private/header/index.ts'),
			code: `import { Toolbar } from '../toolbar'`,
			options: opts,
		},
```

Add to `invalid`:

```js
		// Escaping the top-level module from deep inside a nested one still
		// requires an alias.
		{
			filename: fixturePath('panel/_private/header/_private/header.tsx'),
			code: `import { Button } from '../../../../button/index'`,
			options: opts,
			output: `import { Button } from '@/button/index'`,
			errors: [{ messageId: 'outsideModuleRelative' }],
		},
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/use-absolute-outside-module.test.js` Expected: FAIL on both `valid` additions. `getModuleDir`
puts the header files in `panel` via the private-first branch for the first case, and mis-assigns the nested gateway for
the second; either way `../toolbar`-style paths land outside the computed module and get flagged.

- [ ] **Step 3: Write the implementation**

In `rules/use-absolute-outside-module.js`, delete both local helpers (`getModuleDir` and `isWithinModule`) and rewrite
the tail of `check`:

```js
const absoluteImport = path.resolve(path.dirname(filename), src)
const rootModule = rootModuleOf(filename, gatewayNames)

// Inside a module — only flag imports that leave its whole subtree.
if (rootModule !== null && isWithin(absoluteImport, rootModule)) {
	return
}

const aliasPath = resolveRelativeToAlias(src, filename, aliases)
context.report({
	node,
	messageId: 'outsideModuleRelative',
	fix: createReplaceSourceFix(sourceNode, aliasPath),
})
```

Update imports — only `isRelativePath` and `isPrivatePath` are still needed from `private-paths.js`:

```js
import path from 'node:path'
import { isRelativePath, isPrivatePath } from '../utils/private-paths.js'
import { rootModuleOf, isWithin } from '../utils/module-scope.js'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/use-absolute-outside-module.test.js` Expected: PASS, including every pre-existing case.

- [ ] **Step 5: Delete the orphaned helper**

Run: `grep -rn "getPrivateParent" --include=*.js .` (excluding `node_modules`) Expected: matches only in
`utils/private-paths.js`.

Delete `getPrivateParent` and the now-unused `PRIVATE_SEGMENT` constant from `utils/private-paths.js`. Leave
`isPrivatePath`, `isRelativePath`, `isInsidePrivate`, and `isGatewayFile` in place — all still have callers.

- [ ] **Step 6: Run the full suite and commit**

Run: `pnpm run check` Expected: PASS.

```bash
git add rules/use-absolute-outside-module.js utils/private-paths.js tests/use-absolute-outside-module.test.js
git commit -m "feat: scope use-absolute-outside-module to the outermost module

Also removes the rule's local getModuleDir, which checked _private/
membership before gateway membership and so assigned nested gateways
to the wrong module.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Documentation

The README is the plugin's only user-facing documentation, and nesting changes the definition of a module, the contract,
the rule list, and one preset.

**Files:**

- Modify: `README.md`

**Interfaces:**

- Consumes: the finished behavior of all four rules.
- Produces: nothing code-facing.

- [ ] **Step 1: Extend "What Is a Module"**

After the existing example layout and the "A file **belongs to a module** if..." list, replace that list with one that
accounts for nesting and add the nesting section:

```markdown
A file **belongs to a module** if it is either:

- a gateway (`index.ts`) file at the module root, or
- inside the module's `_private/` folder and not inside a nested module within it.

Any other file is **outside any module**.

### Nested Modules

A module may live inside another module's `_private/`. It is then an implementation detail of its parent: nothing
outside the parent can reach it.
```

src/panel/ ├── _private/ │ ├── panel.tsx ← parent implementation │ ├── header/ ← nested module │ │ ├──
_private/header.tsx │ │ └── index.ts │ └── toolbar/ ← sibling nested module │ ├── _private/toolbar.ts │ └── index.ts └──
index.ts ← parent gateway

```

Visibility follows lexical scope: **you may import a module's gateway if every `_private/` on its
path also encloses you.** So `panel`'s own files see `header` and `toolbar`; `header` and `toolbar`
see each other's gateways but not each other's internals; nothing outside `panel` sees either.

The relationship is one-way. A nested module must be **agnostic of its parent** — it may not import
the parent's gateway, nor any plain file in the parent's `_private/`. The parent's gateway
re-exports the nested module, so an upward import closes a cycle. Keeping the arrow pointing one
way also means a nested module can be moved or promoted without rewriting its imports.
```

- [ ] **Step 2: Restate the Module Contract**

Replace the whole `## Module Contract` section body with:

```markdown
These are the rules every module must follow:

**Internals stay private.** A `_private/` path may only be imported from inside that same private scope. A module's
gateway counts as inside its own `_private/`; everyone else must go through the gateway.

**Gateways own only their own private.** A gateway file may only import from its own sibling `_private/` — never from
another module's.

**Nested modules are agnostic of their parents.** A module nested inside another module's `_private/` may not import
anything belonging to an enclosing module.
```

- [ ] **Step 3: Document the new rule**

Add after the `no-private-imports` section, before `use-relative-in-private`:

````markdown
### `no-ancestor-imports` (recommended)

Keeps a nested module independent of the module that encloses it. Without this, a nested module could import its
parent's gateway — which re-exports the nested module — closing a dependency cycle.

**Violations:**

- `ancestorImport`: a file inside a nested module imports something belonging to an enclosing module. No autofix:
  inverting a dependency is a design decision.

**Examples:**

```ts
// panel/_private/header/_private/header.tsx

// ✗ the parent's gateway — this is the cycle
import { Panel } from '@/panel'

// ✗ a plain implementation file of the parent
import { clamp } from '../../helper.ts'

// ✓ a sibling nested module's gateway
import { Toolbar } from '../../toolbar'

// ✓ anything outside the parent module
import { Button } from '@/button'
```
````

- [ ] **Step 4: Update the path-rule descriptions and Configs**

In `use-absolute-outside-module`, change "imports that cross module boundaries" to describe the subtree scope — relative
paths are legal anywhere inside one top-level module, including between sibling nested modules, and an alias is required
the moment an import leaves it.

In `## Configs`, update the preset comments:

```js
import {
	recommendedConfig, // no-private-imports, no-ancestor-imports
	strictConfig, // + use-relative-in-private, use-absolute-outside-module
	parseTsconfigPaths,
} from 'eslint-plugin-private-modules'
```

And the sentence beneath it: `recommended` enforces the module boundaries themselves; `strict` adds the path
conventions.

- [ ] **Step 5: Verify and commit**

Run: `pnpm run check` Expected: PASS — `format:check` covers Markdown, so fix any Prettier complaints with
`pnpm run format`.

```bash
git add README.md
git commit -m "docs: document nested modules and no-ancestor-imports

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
