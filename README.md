# eslint-plugin-private-modules

[![npm](https://img.shields.io/npm/v/eslint-plugin-private-modules)](https://www.npmjs.com/package/eslint-plugin-private-modules)
[![CI](https://github.com/land-cap/eslint-plugin-private-modules/actions/workflows/ci.yml/badge.svg)](https://github.com/land-cap/eslint-plugin-private-modules/actions/workflows/ci.yml)

ESLint plugin that enforces module boundaries: implementation lives in `_private/`, consumers import only through the
module's gateway (barrel) file.

## Install

```bash
npm install --save-dev eslint-plugin-private-modules
```

Requires ESLint 9+ (flat config) and Node 20.11+.

## Why This Plugin Exists

Without enforced boundaries, any file can import any other file. Internals leak. A helper that was meant to be
implementation detail gets imported across the codebase, and now you can't change it without a ripple effect.

This plugin formalizes barrel files into an explicit gateway model. Each module exposes a single gateway file at the
module root (`index.ts` by default). Everything else is hidden behind a `_private/` folder. Consumers import from the
gateway and are never aware of the internals.

The plugin enforces those boundaries with lint rules so they can be empirically tested. Broken boundaries show up as
lint errors and autofixes handle the tedious path conventions automatically. This way we (developers) don't have to
constantly worry about those rules and can rely on instant linting feedback whenever they are violated. Handling this
through linting also lets us easily ensure that boundaries are respected before the code is merged.

The gateway name list is configurable (see [Options](#options)) so the convention can be tweaked or extended without
changing the plugin source. By default `index.ts` is the module entry.

## What Is a Module

A **module** is a directory that encapsulates a feature or component behind a public API. It is identified by two things
existing together:

1. A `_private/` subdirectory that holds all internal implementation files.
2. A gateway file at the module root that re-exports the public surface from `_private/`. The default name is
   `index.ts`; see [Options](#options) for how to customize the list.

Example layout:

```
src/components/base/button/
├── _private/
│   ├── button.tsx          ← implementation
│   └── button-styles.ts    ← implementation
└── index.ts                ← gateway: re-exports the public API
```

A file **belongs to a module** if it is either:

- a gateway (`index.ts`) file at the module root, or
- inside the module's `_private/` folder and not inside a nested module within it.

Any other file is **outside any module**.

### Nested Modules

A module may live inside another module's `_private/`. It is then an implementation detail of its parent: nothing
outside the parent can reach it.

```
src/panel/
├── _private/
│   ├── panel.tsx           ← parent implementation
│   ├── header/             ← nested module
│   │   ├── _private/header.tsx
│   │   └── index.ts
│   └── toolbar/            ← sibling nested module
│       ├── _private/toolbar.ts
│       └── index.ts
└── index.ts                ← parent gateway
```

Visibility follows lexical scope: **you may import a module's gateway if every `_private/` on its path also encloses
you.** So `panel`'s own files see `header` and `toolbar`; `header` and `toolbar` see each other's gateways but not each
other's internals; nothing outside `panel` sees either.

The relationship is one-way. A nested module must be **agnostic of its parent** — it may not import the parent's
gateway, nor any plain file in the parent's `_private/`. The parent's gateway re-exports the nested module, so an upward
import closes a cycle. Keeping the arrow pointing one way also means a nested module can be moved or promoted without
rewriting its imports.

## When to Use a Module

**Not every folder has to be a module. Only convert a folder into a module when at least one of the reasons below
applies.**

Three distinct reasons justify the module structure and any one is sufficient:

**1. Hide internal bindings.** Some internals genuinely must not be reachable from outside: subcomponents that are
implementation details, internal utilities, types used only within the component. The `_private/` directory makes this
boundary statically enforced rather than just conventional.

**2. Stabilise internal structure.** Even when all current bindings are public, the module pattern lets you freely
split, rename, or reorganise files inside `_private/` without any consumer import breaking. Consumers depend on the
gateway contract, not on how the implementation happens to be laid out today. This is valuable for any component that is
likely to grow or be refactored.

**3. Document the public surface.** The gateway file serves as a manifest of everything the module exposes. Without it
the public API is scattered across many files that happen to export something. A gateway makes it easy to audit what is
public at a glance and to reason about what a change to the module affects.

Reasons (2) and (3) apply even when nothing is hidden today.

## Module Contract

These are the rules every module must follow:

**Internals stay private.** A `_private/` path may only be imported from inside that same private scope. A module's
gateway counts as inside its own `_private/`; everyone else must go through the gateway.

**Gateways own only their own private.** A gateway file may only import from its own sibling `_private/` — never from
another module's.

**Nested modules are agnostic of their parents.** A module nested inside another module's `_private/` may not import
anything belonging to an enclosing module.

## Plugin Rules

### `no-private-imports` (recommended)

Enforces the contract above. It prevents any file from reaching directly into `_private/`, and keeps gateway files from
accessing other modules' internals.

**Violations:**

- `noPrivate`: a non-gateway file imports from `_private/`.
  - Provides autofix for importing from the module gateway instead, when the gateway and exports the requested names.
- `crossModule`: a gateway file re-exports from another module's `_private`.

**Examples:**

```ts
// ✗ non-gateway (file outside the module) file bypasses the module API
import { Foo } from '@/feature/_private/foo.ts'

// ✓ goes through the public gateway
import { Foo } from '@/feature'
```

```ts
// feature/index.ts

// ✗ gateway reaches into another module's private
import { Bar } from '@/other-feature/_private/bar.ts'

// ✓ gateway re-exports its own private
export { Foo } from '@/feature/_private/foo.ts'
```

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

### `use-relative-in-private` (strict only)

Path-style rule for files inside `_private/`.

**Violations:**

- `useRelative`: an alias import (`@/...`) that resolves inside the same module — must be a relative path instead.
  - Autofixes to the equivalent relative path.
- `noGateway`: a relative import that resolves to the module's own gateway — must import directly from the `_private/`
  source file.
  - Autofixes when every imported name comes from a single `_private/` source file.

**Examples:**

```ts
// feature/_private/bar.ts

// ✗ alias import to a sibling _private/ file
import { foo } from '@/feature/_private/foo.ts'

// ✗ importing your own module through its gateway
import { foo } from '../index.ts'

// ✓ relative import to the source file
import { foo } from './foo.ts'
```

### `use-absolute-outside-module` (strict only)

Path-style rule for imports that leave a module's subtree (or come from files outside any module): they must use a path
alias, not a relative path. Relative paths stay legible anywhere inside one top-level module — including between sibling
nested modules, since the whole subtree moves as a unit — but across modules they encode directory distance that breaks
on every move.

**Violations:**

- `outsideModuleRelative`: a relative import that leaves the importing file's module (or any relative import from a file
  outside a module).
  - Autofixes to the alias form when an alias covers the resolved path.

**Examples:**

```ts
// feature/_private/bar.ts

// ✗ relative import escaping the module
import { Button } from '../../button/index.ts'

// ✓ alias import
import { Button } from '@/button/index.ts'
```

## Configs

Rule options (`aliases`, `gatewayNames`) are per-project, so the presets are factories rather than static config
objects. Spread the result into a flat-config entry alongside your own `files` glob:

```js
import {
	recommendedConfig, // no-private-imports, no-ancestor-imports
	strictConfig, // + use-relative-in-private, use-absolute-outside-module
	parseTsconfigPaths,
} from 'eslint-plugin-private-modules'

const aliases = parseTsconfigPaths('./tsconfig.json')

export default [
	{
		files: ['./src/**/*.{ts,tsx}'],
		...strictConfig({ aliases }),
	},
]
```

Use `recommendedConfig` when you only want the module boundaries enforced; use `strictConfig` to also enforce the path
conventions.

## Options

Every rule accepts the same options object:

| Option         | Type                     | Default     | Description                                                                                            |
| -------------- | ------------------------ | ----------- | ------------------------------------------------------------------------------------------------------ |
| `aliases`      | `Record<string, string>` | `{}`        | Alias prefix → absolute directory, e.g. `{ '@/': '/abs/src' }`. Needed to resolve alias imports.       |
| `gatewayNames` | `string[]`               | `['index']` | Basenames (no extension) recognised as a module gateway. Override to allow e.g. `['index', 'public']`. |

`parseTsconfigPaths(tsconfigPath)` derives `aliases` from `compilerOptions.paths` (following `extends`), keeping only
`prefix/*` → `target/*` entries.

Using the rules directly instead of a preset:

```js
import { privateModuleBoundary } from 'eslint-plugin-private-modules'

export default [
	{
		files: ['./src/**/*.{ts,tsx}'],
		plugins: { 'private-modules': privateModuleBoundary },
		rules: {
			'private-modules/no-private-imports': [
				'error',
				{ aliases: { '@/': new URL('./src', import.meta.url).pathname } },
			],
		},
	},
]
```

## License

MIT
